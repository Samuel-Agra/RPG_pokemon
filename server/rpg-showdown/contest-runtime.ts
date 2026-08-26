import {toID} from '../../sim/dex-data';
import type {PokemonSet} from '../../sim/teams';
import {getRPGContestMove} from './contest-move-catalog';
import {
	RPG_DEFAULT_CONTEST_COMBOS, scoreRPGContestRound,
	type RPGContestComboDefinition, type RPGContestRoundMechanicalScore,
} from './contest-scoring';
import type {RPGContestParticipant, RPGContestSession} from './contest-session';
import {
	applyRPGContestMoveToStage, createRPGContestStage, summarizeRPGContestRoundStage,
	type RPGContestMoveStageResult, type RPGContestRoundStageResult, type RPGContestStageState,
} from './contest-stage';

export type RPGContestRuntimePhase = 'awaiting_move' | 'awaiting_judging' | 'finished';

export interface RPGContestRuntimeViewer {
	master?: boolean;
	characterId?: string;
}

export interface RPGContestRuntimePokemon {
	name: string;
	species: string;
	level: number;
	gender: string;
	shiny: boolean;
	nature: string;
	item: string;
	friendship: number;
	hp: number | null;
	status: string;
	moves: {id: string, name: string}[];
	movesFrozen: boolean;
}

export interface RPGContestRuntimeParticipant {
	id: string;
	kind: 'player' | 'npc';
	displayName: string;
	characterId?: string;
	avatar?: string;
	pokemon: RPGContestRuntimePokemon;
	disqualified: boolean;
	disqualifiedAt?: number;
	rounds: [string[], string[]];
	roundScores: [RPGContestRoundMechanicalScore | null, RPGContestRoundMechanicalScore | null];
	stageStates: [RPGContestStageState, RPGContestStageState];
	stageMoves: [RPGContestMoveStageResult[], RPGContestMoveStageResult[]];
	roundStages: [RPGContestRoundStageResult | null, RPGContestRoundStageResult | null];
	scenarioCoherenceBonus: number;
}

export type RPGContestRuntimeEventType =
	'contest-started' | 'round-started' | 'participant-enter' | 'move-selected' |
	'awaiting-judging' | 'participant-disqualified' | 'contest-finished';

export interface RPGContestRuntimeEvent {
	sequence: number;
	type: RPGContestRuntimeEventType;
	createdAt: number;
	round: number;
	participantId?: string;
	moveIndex?: number;
	moveId?: string;
	moveName?: string;
	stageTransformations?: string[];
	stageInteractions?: string[];
}

export interface RPGContestRuntimeSnapshot {
	sessionId: string;
	status: 'active' | 'ended';
	phase: RPGContestRuntimePhase;
	round: 1 | 2;
	currentParticipantId?: string;
	currentMoveIndex: number;
	category: RPGContestSession['category'];
	rank: RPGContestSession['rank'];
	scenario: RPGContestSession['scenario'];
	presentationOrder: string[];
	participants: RPGContestRuntimeParticipant[];
	events: RPGContestRuntimeEvent[];
	canAct: boolean;
	canJudge: boolean;
}

export type RPGContestRuntimeAction =
	{type: 'select-move', moveId: string} |
	{type: 'abandon'} |
	{type: 'judging-complete'};

interface RPGContestRuntimeState {
	session: RPGContestSession;
	status: 'active' | 'ended';
	phase: RPGContestRuntimePhase;
	round: 1 | 2;
	currentOrderIndex: number;
	participants: RPGContestRuntimeParticipant[];
	events: RPGContestRuntimeEvent[];
	nextSequence: number;
}

export interface RPGContestRuntimeManagerOptions {
	now?: () => number;
	getCharacterTeam?: (characterId: string) => PokemonSet[] | undefined;
	getCombos?: () => readonly RPGContestComboDefinition[];
}

export class RPGContestRuntimeManager {
	private readonly runtimes = new Map<string, RPGContestRuntimeState>();
	private readonly now: () => number;
	private readonly getCharacterTeam: (characterId: string) => PokemonSet[] | undefined;
	private readonly getCombos: () => readonly RPGContestComboDefinition[];

	constructor(options: RPGContestRuntimeManagerOptions = {}) {
		this.now = options.now || Date.now;
		this.getCharacterTeam = options.getCharacterTeam || (() => undefined);
		this.getCombos = options.getCombos || (() => RPG_DEFAULT_CONTEST_COMBOS);
	}

	start(session: RPGContestSession): RPGContestRuntimeSnapshot {
		const sessionId = toID(session.id);
		if (session.status !== 'started') throw new Error('RPG contest session has not started');
		if (this.runtimes.has(sessionId)) return this.snapshot(sessionId, {master: true});
		if (session.presentationOrder.length !== session.participants.length) {
			throw new Error('RPG contest presentation order is incomplete');
		}
		const participants = session.participants.map(participant => this.runtimeParticipant(participant, session));
		const state: RPGContestRuntimeState = {
			session: structuredClone(session), status: 'active', phase: 'awaiting_move', round: 1,
			currentOrderIndex: 0, participants, events: [], nextSequence: 0,
		};
		this.runtimes.set(sessionId, state);
		this.emit(state, 'contest-started');
		this.emit(state, 'round-started');
		this.emit(state, 'participant-enter', this.currentId(state));
		return this.snapshot(sessionId, {master: true});
	}

	has(sessionId: string): boolean {
		return this.runtimes.has(toID(sessionId));
	}

	snapshot(sessionId: string, viewer: RPGContestRuntimeViewer = {}): RPGContestRuntimeSnapshot {
		const state = this.require(sessionId);
		this.refreshUnfrozenPokemon(state);
		const currentParticipantId = state.status === 'active' ? this.currentId(state) : undefined;
		const current = state.participants.find(participant => participant.id === currentParticipantId);
		return {
			sessionId: state.session.id,
			status: state.status,
			phase: state.phase,
			round: state.round,
			currentParticipantId,
			currentMoveIndex: current ? current.rounds[state.round - 1].length : 0,
			category: state.session.category,
			rank: state.session.rank,
			scenario: structuredClone(state.session.scenario),
			presentationOrder: [...state.session.presentationOrder],
			participants: structuredClone(state.participants),
			events: structuredClone(state.events.slice(-100)),
			canAct: state.phase === 'awaiting_move' && !!current && this.canControl(current, viewer),
			canJudge: state.phase === 'awaiting_judging' && viewer.master === true,
		};
	}

	action(sessionId: string, action: RPGContestRuntimeAction, viewer: RPGContestRuntimeViewer): RPGContestRuntimeSnapshot {
		const state = this.require(sessionId);
		if (state.status !== 'active') throw new Error('RPG contest has already ended');
		if (action.type === 'judging-complete') {
			if (!viewer.master) throw new Error('Only the Master can finish RPG contest judging');
			if (state.phase !== 'awaiting_judging') throw new Error('RPG contest is not awaiting judging');
			this.advance(state);
			return this.snapshot(sessionId, viewer);
		}
		if (action.type === 'abandon') {
			this.abandon(state, viewer);
			return this.snapshot(sessionId, viewer);
		}
		if (state.phase !== 'awaiting_move') throw new Error('RPG contest is not accepting a move');
		const participant = this.current(state);
		if (!this.canControl(participant, viewer)) throw new Error('RPG contest participant is controlled by another user');
		this.refreshParticipantPokemon(state, participant);
		const moveId = toID(action.moveId);
		const selected = participant.pokemon.moves.find(move => move.id === moveId);
		if (!selected) throw new Error('Pokemon does not know this RPG contest move');
		participant.pokemon.movesFrozen = true;
		const roundMoves = participant.rounds[state.round - 1];
		roundMoves.push(moveId);
		const stageMove = applyRPGContestMoveToStage(
			participant.stageStates[state.round - 1], moveId, state.session.scenario
		);
		participant.stageMoves[state.round - 1].push(stageMove);
		this.emit(state, 'move-selected', participant.id, {
			moveIndex: roundMoves.length - 1, moveId, moveName: selected.name,
			stageTransformations: stageMove.transformations, stageInteractions: stageMove.interactions,
		});
		if (roundMoves.length === 3) {
			const stage = summarizeRPGContestRoundStage(
				participant.stageMoves[state.round - 1], participant.stageStates[state.round - 1]
			);
			participant.roundStages[state.round - 1] = stage;
			const score = scoreRPGContestRound(roundMoves, this.getCombos());
			score.fieldInteractionScore = stage.fieldInteractionScore;
			score.scenarioMoveScore = stage.scenarioMoveScore;
			score.total += stage.fieldInteractionScore + stage.scenarioMoveScore;
			participant.roundScores[state.round - 1] = score;
			if (state.round === 2 && participant.roundStages[0]?.scenarioMoveScore && stage.scenarioMoveScore) {
				participant.scenarioCoherenceBonus = 2;
			}
			state.phase = 'awaiting_judging';
			this.emit(state, 'awaiting-judging', participant.id);
		}
		return this.snapshot(sessionId, viewer);
	}

	private abandon(state: RPGContestRuntimeState, viewer: RPGContestRuntimeViewer): void {
		const characterId = toID(viewer.characterId || '');
		const participant = state.participants.find(entry =>
			!entry.disqualified && entry.kind === 'player' && entry.characterId === characterId
		);
		if (!participant) throw new Error('Only an active Player participant can abandon the RPG contest');
		participant.disqualified = true;
		participant.disqualifiedAt = this.now();
		this.emit(state, 'participant-disqualified', participant.id);
		if (participant.id === this.currentId(state)) this.advance(state);
	}

	private advance(state: RPGContestRuntimeState): void {
		for (let index = state.currentOrderIndex + 1; index < state.session.presentationOrder.length; index++) {
			const participant = this.byOrder(state, index);
			if (participant.disqualified) continue;
			state.currentOrderIndex = index;
			state.phase = 'awaiting_move';
			this.emit(state, 'participant-enter', participant.id);
			return;
		}
		if (state.round === 1) {
			state.round = 2;
			state.currentOrderIndex = -1;
			this.emit(state, 'round-started');
			this.advance(state);
			return;
		}
		state.status = 'ended';
		state.phase = 'finished';
		state.currentOrderIndex = state.session.presentationOrder.length;
		this.emit(state, 'contest-finished');
	}

	private runtimeParticipant(participant: RPGContestParticipant, session: RPGContestSession): RPGContestRuntimeParticipant {
		const set = this.participantSet(participant);
		const firstStage = createRPGContestStage(session.scenario);
		const secondStage = createRPGContestStage(session.scenario);
		return {
			id: participant.id, kind: participant.kind, displayName: participant.displayName,
			characterId: participant.characterId, avatar: participant.avatar,
			pokemon: this.pokemon(set, false), disqualified: false, rounds: [[], []], roundScores: [null, null],
			stageStates: [firstStage, secondStage], stageMoves: [[], []], roundStages: [null, null],
			scenarioCoherenceBonus: 0,
		};
	}

	private participantSet(participant: RPGContestParticipant): PokemonSet {
		if (participant.kind === 'npc') return structuredClone(participant.pokemon!.set!);
		const team = this.getCharacterTeam(participant.characterId!);
		const set = team?.[participant.pokemon!.teamIndex!];
		if (!set) throw new Error('RPG contest Player Pokemon is no longer available');
		return structuredClone(set);
	}

	private refreshUnfrozenPokemon(state: RPGContestRuntimeState): void {
		for (const participant of state.participants) this.refreshParticipantPokemon(state, participant);
	}

	private refreshParticipantPokemon(state: RPGContestRuntimeState, participant: RPGContestRuntimeParticipant): void {
		if (participant.kind !== 'player' || participant.pokemon.movesFrozen) return;
		const source = state.session.participants.find(entry => entry.id === participant.id);
		if (!source) return;
		participant.pokemon = this.pokemon(this.participantSet(source), false);
	}

	private pokemon(set: PokemonSet, movesFrozen: boolean): RPGContestRuntimePokemon {
		return {
			name: set.name || set.species, species: set.species, level: set.level || 1,
			gender: set.gender || 'N', shiny: !!set.shiny, nature: set.nature || '', item: set.item || '',
			friendship: Math.max(0, Math.min(255, set.rpg?.friendship ?? set.happiness ?? 0)),
			hp: Number.isFinite(set.rpg?.hp) ? Number(set.rpg!.hp) : null,
			status: set.rpg?.status || '', movesFrozen,
			moves: (set.moves || []).map(move => {
				const definition = getRPGContestMove(move);
				return {id: definition.moveId, name: definition.name};
			}),
		};
	}

	private current(state: RPGContestRuntimeState): RPGContestRuntimeParticipant {
		const participant = state.participants.find(entry => entry.id === this.currentId(state));
		if (!participant) throw new Error('RPG contest current participant is unavailable');
		return participant;
	}

	private currentId(state: RPGContestRuntimeState): string {
		return state.session.presentationOrder[state.currentOrderIndex];
	}

	private byOrder(state: RPGContestRuntimeState, index: number): RPGContestRuntimeParticipant {
		const id = state.session.presentationOrder[index];
		const participant = state.participants.find(entry => entry.id === id);
		if (!participant) throw new Error('RPG contest presentation order references an unknown participant');
		return participant;
	}

	private canControl(participant: RPGContestRuntimeParticipant, viewer: RPGContestRuntimeViewer): boolean {
		return participant.kind === 'npc' ? viewer.master === true : participant.characterId === toID(viewer.characterId || '');
	}

	private emit(
		state: RPGContestRuntimeState, type: RPGContestRuntimeEventType, participantId?: string,
		extra: Partial<Pick<RPGContestRuntimeEvent,
			'moveIndex' | 'moveId' | 'moveName' | 'stageTransformations' | 'stageInteractions'>> = {}
	): void {
		state.events.push({
			sequence: state.nextSequence++, type, createdAt: this.now(), round: state.round,
			...(participantId ? {participantId} : {}), ...extra,
		});
	}

	private require(sessionId: string): RPGContestRuntimeState {
		const state = this.runtimes.get(toID(sessionId));
		if (!state) throw new Error('Unknown RPG contest runtime');
		return state;
	}
}
