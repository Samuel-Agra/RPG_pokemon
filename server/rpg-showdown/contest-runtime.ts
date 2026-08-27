import {Dex} from '../../sim/dex';
import {toID} from '../../sim/dex-data';
import type {PokemonSet} from '../../sim/teams';
import {getRPGContestMove} from './contest-move-catalog';
import {getRPGContestItemClassification} from './contest-item-catalog';
import {
	applyRPGContestSecondRoundCreativity, RPG_DEFAULT_CONTEST_COMBOS, scoreRPGContestRound,
	type RPGContestComboDefinition, type RPGContestRoundMechanicalScore,
} from './contest-scoring';
import type {RPGContestParticipant, RPGContestSession} from './contest-session';
import {
	getRPGContestPerformance, getRPGContestPerformanceBonus, rankRPGContestParticipants,
	type RPGContestPlacement,
} from './contest-progression';
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
	performance: number;
	performanceBonus: number;
	hp: number | null;
	status: string;
	moves: {id: string, name: string}[];
	movesFrozen: boolean;
	megaEligible: boolean;
	megaActivated: boolean;
	megaSpecies: string;
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
	judging: [RPGContestRoundJudging | null, RPGContestRoundJudging | null];
	audienceReactions: [RPGContestAudienceReaction | null, RPGContestAudienceReaction | null];
	teamIndex?: number;
}

export type RPGContestJudgingCriterion =
	'visualComposition' | 'sequenceContinuity' | 'stageUse' | 'trainerPokemonSync' | 'interpretationFinale';

export type RPGContestJudgingScores = Record<RPGContestJudgingCriterion, number>;

export interface RPGContestRoundJudging {
	criteria: RPGContestJudgingScores;
	rawScore: number;
	interpretationScore: number;
	mechanicalCorrection: number;
	copyPenalty: 0 | -3 | -6 | -10 | -15 | -20;
	copyJustification: string;
	correctionJustification: string;
	comment: string;
	totalAfterJudging: number;
}

export interface RPGContestAudienceReaction {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	label: string;
	emoji: string;
	comments: string[];
}

export type RPGContestRuntimeEventType =
	'contest-started' | 'round-started' | 'participant-enter' | 'move-selected' |
	'awaiting-judging' | 'judging-complete' | 'participant-disqualified' | 'contest-finished';

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
	audienceReaction?: RPGContestAudienceReaction;
	megaActivated?: boolean;
	megaSpecies?: string;
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
	results: RPGContestPlacement[] | null;
}

export type RPGContestRuntimeAction =
	{type: 'select-move', moveId: string, activateMega?: boolean} |
	{type: 'abandon'} |
	{
		type: 'submit-judging', criteria: RPGContestJudgingScores, mechanicalCorrection?: number,
		correctionJustification?: string, copyPenalty?: 0 | -3 | -6 | -10 | -15 | -20,
		copyJustification?: string, comment?: string,
	};

export const RPG_CONTEST_JUDGING_CRITERIA: Readonly<Record<RPGContestJudgingCriterion, string>> = Object.freeze({
	visualComposition: 'Composição visual',
	sequenceContinuity: 'Continuidade da sequência',
	stageUse: 'Uso do palco e do cenário',
	trainerPokemonSync: 'Sincronia entre Treinador e Pokémon',
	interpretationFinale: 'Interpretação e encerramento',
});

interface RPGContestRuntimeState {
	session: RPGContestSession;
	status: 'active' | 'ended';
	phase: RPGContestRuntimePhase;
	round: 1 | 2;
	currentOrderIndex: number;
	participants: RPGContestRuntimeParticipant[];
	events: RPGContestRuntimeEvent[];
	nextSequence: number;
	results: RPGContestPlacement[] | null;
}

export interface RPGContestRuntimeManagerOptions {
	now?: () => number;
	getCharacterTeam?: (characterId: string) => PokemonSet[] | undefined;
	getCombos?: () => readonly RPGContestComboDefinition[];
	onFinished?: (session: RPGContestSession, results: readonly RPGContestPlacement[]) => void;
}

export class RPGContestRuntimeManager {
	private readonly runtimes = new Map<string, RPGContestRuntimeState>();
	private readonly now: () => number;
	private readonly onFinished?: RPGContestRuntimeManagerOptions['onFinished'];
	private readonly getCharacterTeam: (characterId: string) => PokemonSet[] | undefined;
	private readonly getCombos: () => readonly RPGContestComboDefinition[];

	constructor(options: RPGContestRuntimeManagerOptions = {}) {
		this.now = options.now || Date.now;
		this.getCharacterTeam = options.getCharacterTeam || (() => undefined);
		this.getCombos = options.getCombos || (() => RPG_DEFAULT_CONTEST_COMBOS);
		this.onFinished = options.onFinished;
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
			currentOrderIndex: 0, participants, events: [], nextSequence: 0, results: null,
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
		const participants = structuredClone(state.participants);
		if (!viewer.master) {
			for (const participant of participants) {
				participant.roundScores = [null, null];
				participant.roundStages = [null, null];
				participant.judging = [null, null];
			}
		}
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
			participants,
			events: structuredClone(state.events.slice(-100)),
			canAct: state.phase === 'awaiting_move' && !!current && this.canControl(current, viewer),
			canJudge: state.phase === 'awaiting_judging' && viewer.master === true,
			results: state.results ? structuredClone(state.results) : null,
		};
	}

	action(sessionId: string, action: RPGContestRuntimeAction, viewer: RPGContestRuntimeViewer): RPGContestRuntimeSnapshot {
		const state = this.require(sessionId);
		if (state.status !== 'active') throw new Error('RPG contest has already ended');
		if (action.type === 'submit-judging') {
			if (!viewer.master) throw new Error('Only the Master can finish RPG contest judging');
			if (state.phase !== 'awaiting_judging') throw new Error('RPG contest is not awaiting judging');
			this.submitJudging(state, action);
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
		let megaActivated = false;
		if (action.activateMega) {
			if (!participant.pokemon.megaEligible) throw new Error('Pokemon cannot Mega Evolve with its held item');
			if (participant.pokemon.megaActivated) throw new Error('Pokemon has already Mega Evolved');
			participant.pokemon.megaActivated = true;
			megaActivated = true;
		}
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
			megaActivated, megaSpecies: megaActivated ? participant.pokemon.megaSpecies : undefined,
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
			if (state.round === 2) Object.assign(score, applyRPGContestSecondRoundCreativity(score, participant.rounds[0]));
			const item = getRPGContestItemClassification(participant.pokemon.item);
			const itemActive = item.canScore && item.category === state.session.category &&
				(item.scoringMode === 'passive' || (item.scoringMode === 'mega-activation' && participant.pokemon.megaActivated));
			score.itemId = toID(participant.pokemon.item);
			score.itemCategory = item.category;
			score.itemBonus = itemActive ? item.points : 0;
			score.itemBonusActive = itemActive;
			score.total += score.itemBonus;
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
		state.results = rankRPGContestParticipants(state.participants.map(participant => ({
			id: participant.id, disqualified: participant.disqualified,
			roundTotals: participant.judging.filter(Boolean).map(judging => judging!.totalAfterJudging),
			scenarioCoherenceBonus: participant.scenarioCoherenceBonus,
			performanceBonus: participant.pokemon.performanceBonus,
		})));
		this.emit(state, 'contest-finished');
		this.onFinished?.(structuredClone(state.session), structuredClone(state.results));
	}

	private runtimeParticipant(participant: RPGContestParticipant, session: RPGContestSession): RPGContestRuntimeParticipant {
		const set = this.participantSet(participant);
		const firstStage = createRPGContestStage(session.scenario);
		const secondStage = createRPGContestStage(session.scenario);
		return {
			id: participant.id, kind: participant.kind, displayName: participant.displayName,
			characterId: participant.characterId, avatar: participant.avatar,
			pokemon: this.pokemon(set, false, participant.characterId || participant.id), teamIndex: participant.pokemon?.teamIndex,
			disqualified: false, rounds: [[], []], roundScores: [null, null],
			stageStates: [firstStage, secondStage], stageMoves: [[], []], roundStages: [null, null],
			scenarioCoherenceBonus: 0, judging: [null, null], audienceReactions: [null, null],
		};
	}

	private submitJudging(
		state: RPGContestRuntimeState,
		action: Extract<RPGContestRuntimeAction, {type: 'submit-judging'}>
	): void {
		const participant = this.current(state);
		const criteria = {} as RPGContestJudgingScores;
		for (const criterion of Object.keys(RPG_CONTEST_JUDGING_CRITERIA) as RPGContestJudgingCriterion[]) {
			const value = Number(action.criteria?.[criterion]);
			if (!Number.isSafeInteger(value) || value < -1 || value > 5) {
				throw new Error(`RPG contest criterion ${criterion} must be between -1 and 5`);
			}
			criteria[criterion] = value;
		}
		const rawScore = Object.values(criteria).reduce((total, value) => total + value, 0);
		const interpretationScore = rawScore < 0 ? rawScore : Number((rawScore * 10 / 25).toFixed(1));
		const mechanicalCorrection = action.mechanicalCorrection === undefined ? 0 : Number(action.mechanicalCorrection);
		if (!Number.isSafeInteger(mechanicalCorrection) || mechanicalCorrection < -10 || mechanicalCorrection > 10) {
			throw new Error('RPG contest mechanical correction must be between -10 and 10');
		}
		const correctionJustification = String(action.correctionJustification || '').trim();
		if (mechanicalCorrection && !correctionJustification) {
			throw new Error('RPG contest mechanical correction requires a justification');
		}
		if (correctionJustification.length > 500) throw new Error('RPG contest correction justification is too long');
		const comment = String(action.comment || '').trim();
		if (comment.length > 500) throw new Error('RPG contest judge comment is too long');
		const allowedCopyPenalties = [0, -3, -6, -10, -15, -20] as const;
		const copyPenalty = action.copyPenalty === undefined ? 0 : Number(action.copyPenalty);
		if (!allowedCopyPenalties.includes(copyPenalty as typeof allowedCopyPenalties[number])) {
			throw new Error('Invalid RPG contest copy penalty');
		}
		const copyJustification = String(action.copyJustification || '').trim();
		if (copyPenalty && !copyJustification) throw new Error('RPG contest copy penalty requires a justification');
		if (copyJustification.length > 500) throw new Error('RPG contest copy justification is too long');
		const mechanical = participant.roundScores[state.round - 1];
		if (!mechanical) throw new Error('RPG contest mechanical round score is unavailable');
		const totalAfterJudging = mechanical.total + interpretationScore + mechanicalCorrection + copyPenalty;
		participant.judging[state.round - 1] = {
			criteria, rawScore, interpretationScore, mechanicalCorrection, correctionJustification,
			copyPenalty: copyPenalty as RPGContestRoundJudging['copyPenalty'], copyJustification, comment,
			totalAfterJudging,
		};
		const reaction = this.audienceReaction(totalAfterJudging, mechanical, comment);
		participant.audienceReactions[state.round - 1] = reaction;
		this.emit(state, 'judging-complete', participant.id, {audienceReaction: reaction});
	}

	private audienceReaction(
		total: number, score: RPGContestRoundMechanicalScore, comment: string
	): RPGContestAudienceReaction {
		const level = (total < 12 ? 1 : total < 22 ? 2 : total < 33 ? 3 :
			total < 43 ? 4 : total < 53 ? 5 : 6) as RPGContestAudienceReaction['level'];
		const labels = ['', 'silêncio ou desconforto', 'aplausos discretos', 'público animado',
			'grande entusiasmo', 'público em êxtase', 'reação histórica'];
		const emojis = ['', '😐', '🙂', '👏', '👏👏', '👏👏👏', '👏👏👏👏'];
		const comments: string[] = [];
		if (score.matchedCombos.length) comments.push('O público adorou a combinação!');
		if (score.fieldInteractionScore >= 3) comments.push('A transformação do palco surpreendeu os jurados!');
		if (score.scenarioMoveScore >= 2) comments.push('O cenário valorizou a apresentação!');
		if (comment) comments.push(comment);
		if (!comments.length) comments.push(level >= 4 ? 'A apresentação empolgou o público!' : 'Os jurados observam atentamente.');
		return {level, label: labels[level], emoji: emojis[level], comments};
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
		participant.pokemon = this.pokemon(this.participantSet(source), false, participant.characterId || participant.id);
	}

	private pokemon(set: PokemonSet, movesFrozen: boolean, trainerId: string): RPGContestRuntimePokemon {
		const performance = getRPGContestPerformance(set, trainerId);
		const species = Dex.species.get(set.species);
		const heldItem = Dex.items.get(set.item || '');
		const megaSpecies = heldItem.megaStone?.[species.name] || heldItem.megaStone?.[species.baseSpecies] || '';
		return {
			name: set.name || set.species, species: set.species, level: set.level || 1,
			gender: set.gender || 'N', shiny: !!set.shiny, nature: set.nature || '', item: set.item || '',
			friendship: Math.max(0, Math.min(255, set.rpg?.friendship ?? set.happiness ?? 0)),
			performance, performanceBonus: getRPGContestPerformanceBonus(performance),
			hp: Number.isFinite(set.rpg?.hp) ? Number(set.rpg!.hp) : null,
			status: set.rpg?.status || '', movesFrozen, megaEligible: !!megaSpecies,
			megaActivated: false, megaSpecies,
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
			'moveIndex' | 'moveId' | 'moveName' | 'stageTransformations' | 'stageInteractions' | 'audienceReaction' |
			'megaActivated' | 'megaSpecies'>> = {}
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
