import {Dex} from '../../sim/dex';
import {toID} from '../../sim/dex-data';
import type {PokemonSet} from '../../sim/teams';
import {getRPGPokemonSizeClass, type RPGPokemonSizeClass} from '../../sim/rpg-showdown';
import {getRPGContestMove} from './contest-move-catalog';
import {getRPGContestItemClassification} from './contest-item-catalog';
import {
	applyRPGContestSecondRoundCreativity, applyRPGContestWithinRoundRepetition,
	RPG_DEFAULT_CONTEST_COMBOS, scoreRPGContestRound,
	type RPGContestComboDefinition, type RPGContestRoundMechanicalScore,
} from './contest-scoring';
import type {RPGContestParticipant, RPGContestSession} from './contest-session';
import {
	getRPGContestPerformance, getRPGContestPerformanceBonus, rankRPGContestParticipants,
	type RPGContestPlacement,
} from './contest-progression';
import {
	applyRPGContestMoveToStage, createRPGContestStage, summarizeRPGContestRoundStage,
	applyRPGContestMegaAbilityWeather,
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
	spriteId: string;
	heightM: number;
	sizeClass: RPGPokemonSizeClass;
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
	ability: string;
	moves: {
		id: string; name: string; type: string; battleCategory: string; basePower: number | null;
		battleStatus: string; tags: string[]; changesField: boolean;
	}[];
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
	pokemonTeam: RPGContestRuntimePokemon[];
	disqualified: boolean;
	disqualifiedAt?: number;
	rounds: [string[], string[]];
	roundPokemonIndexes: [number[], number[]];
	roundScores: [RPGContestRoundMechanicalScore | null, RPGContestRoundMechanicalScore | null];
	stageStates: [RPGContestStageState, RPGContestStageState];
	stageMoves: [RPGContestMoveStageResult[], RPGContestMoveStageResult[]];
	roundStages: [RPGContestRoundStageResult | null, RPGContestRoundStageResult | null];
	scenarioCoherenceBonus: number;
	judging: [RPGContestRoundJudging | null, RPGContestRoundJudging | null];
	audienceReactions: [RPGContestAudienceReaction | null, RPGContestAudienceReaction | null];
	judgeComments: [RPGContestJudgingComments | null, RPGContestJudgingComments | null];
	teamIndex?: number;
	teamIndexes: number[];
}

export type RPGContestJudgingCriterion =
	'visualComposition' | 'sequenceContinuity' | 'stageUse' | 'trainerPokemonSync' | 'interpretationFinale';

export type RPGContestJudgingScores = Record<RPGContestJudgingCriterion, number>;
export type RPGContestJudgingComments = Record<RPGContestJudgingCriterion, string>;

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
	pokemonIndex?: number;
	stageTransformations?: string[];
	stageInteractions?: string[];
	audienceReaction?: RPGContestAudienceReaction;
	megaActivated?: boolean;
	megaSpecies?: string;
	megaSpriteId?: string;
}

export interface RPGContestRuntimeSnapshot {
	sessionId: string;
	status: 'active' | 'ended';
	phase: RPGContestRuntimePhase;
	round: 1 | 2;
	currentParticipantId?: string;
	currentMoveIndex: number;
	category: RPGContestSession['category'];
	mode: RPGContestSession['mode'];
	rank: RPGContestSession['rank'];
	scenario: RPGContestSession['scenario'];
	presentationOrder: string[];
	participants: RPGContestRuntimeParticipant[];
	events: RPGContestRuntimeEvent[];
	canAct: boolean;
	canJudge: boolean;
	results: (RPGContestPlacement | RPGContestPublicPlacement)[] | null;
	highlights: RPGContestFinalHighlights | null;
}

export interface RPGContestPublicPlacement {
	participantId: string;
	place: number | null;
	total: number;
	disqualified: boolean;
}

export interface RPGContestFinalHighlights {
	judgeCategories: Record<RPGContestJudgingCriterion, string[]>;
	audience: string[];
	scenario: string[];
	combo: string[];
	evolution: string[];
}

export type RPGContestRuntimeAction =
	{type: 'select-move', moveId: string, pokemonIndex?: number, activateMega?: boolean} |
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

const RPG_CONTEST_JUDGING_COMMENT_LEVELS = [
	'prejudicou a apresentação.', 'não apareceu de forma clara.', 'teve uma tentativa ainda simples.',
	'contribuiu de maneira adequada.', 'foi bem trabalhada durante a apresentação.',
	'foi um dos grandes pontos do espetáculo.', 'alcançou um resultado excepcional.',
] as const;

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
	finishedAt?: number;
}

export interface RPGContestRuntimeManagerOptions {
	now?: () => number;
	getCharacterTeam?: (characterId: string) => PokemonSet[] | undefined;
	getCombos?: () => readonly RPGContestComboDefinition[];
	onFinished?: (session: RPGContestSession, results: readonly RPGContestPlacement[]) => void;
}

export class RPGContestRuntimeManager {
	private readonly runtimes = new Map<string, RPGContestRuntimeState>();
	private static readonly ENDED_RUNTIME_TTL = 60 * 60 * 1000;
	private static readonly MAX_ENDED_RUNTIMES = 50;
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
		this.pruneEndedRuntimes();
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
		const results = state.results ? (viewer.master ? structuredClone(state.results) : state.results.map(result => ({
			participantId: result.participantId, place: result.place, total: result.total, disqualified: result.disqualified,
		}))) : null;
		return {
			sessionId: state.session.id,
			status: state.status,
			phase: state.phase,
			round: state.round,
			currentParticipantId,
			currentMoveIndex: current ? current.rounds[state.round - 1].length : 0,
			category: state.session.category,
			mode: state.session.mode,
			rank: state.session.rank,
			scenario: structuredClone(state.session.scenario),
			presentationOrder: [...state.session.presentationOrder],
			participants,
			events: structuredClone(state.events.slice(-100)),
			canAct: state.phase === 'awaiting_move' && !!current && this.canControl(current, viewer),
			canJudge: state.phase === 'awaiting_judging' && viewer.master === true,
			results,
			highlights: state.status === 'ended' ? this.finalHighlights(state) : null,
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
		const pokemonIndex = Number(action.pokemonIndex ?? 0);
		if (!Number.isSafeInteger(pokemonIndex) || !participant.pokemonTeam[pokemonIndex]) {
			throw new Error('Invalid RPG contest Pokemon performer');
		}
		const roundPokemonIndexes = participant.roundPokemonIndexes[state.round - 1];
		const usesByPokemon = roundPokemonIndexes.filter(index => index === pokemonIndex).length;
		const maximumUses = state.session.mode === 'trio' ? 1 : state.session.mode === 'duo' ? 2 : 3;
		if (usesByPokemon >= maximumUses) throw new Error('This Pokemon cannot perform another move in this round');
		const performingPokemon = participant.pokemonTeam[pokemonIndex];
		const moveId = toID(action.moveId);
		const selected = performingPokemon.moves.find(move => move.id === moveId);
		if (!selected) throw new Error('Pokemon does not know this RPG contest move');
		let megaActivated = false;
		let megaAbilityWeather: ReturnType<typeof applyRPGContestMegaAbilityWeather> = null;
		if (action.activateMega) {
			if (!performingPokemon.megaEligible) throw new Error('Pokemon cannot Mega Evolve with its held item');
			if (performingPokemon.megaActivated) throw new Error('Pokemon has already Mega Evolved');
			const previousAbility = performingPokemon.ability;
			const megaForm = Dex.species.get(performingPokemon.megaSpecies);
			performingPokemon.megaActivated = true;
			performingPokemon.species = megaForm.name;
			performingPokemon.spriteId = megaForm.spriteid;
			performingPokemon.heightM = megaForm.heightm;
			performingPokemon.sizeClass = getRPGPokemonSizeClass(megaForm.heightm);
			performingPokemon.ability = megaForm.abilities[0] || previousAbility;
			megaAbilityWeather = applyRPGContestMegaAbilityWeather(
				participant.stageStates[state.round - 1], performingPokemon.ability, previousAbility
			);
			megaActivated = true;
		}
		for (const pokemon of participant.pokemonTeam) pokemon.movesFrozen = true;
		const roundMoves = participant.rounds[state.round - 1];
		roundMoves.push(moveId);
		roundPokemonIndexes.push(pokemonIndex);
		const stageMove = applyRPGContestMoveToStage(
			participant.stageStates[state.round - 1], moveId, state.session.scenario
		);
		if (megaAbilityWeather) stageMove.transformations.unshift(megaAbilityWeather.transformation);
		participant.stageMoves[state.round - 1].push(stageMove);
		this.emit(state, 'move-selected', participant.id, {
			moveIndex: roundMoves.length - 1, moveId, moveName: selected.name, pokemonIndex,
			stageTransformations: stageMove.transformations, stageInteractions: stageMove.interactions,
			megaActivated, megaSpecies: megaActivated ? performingPokemon.megaSpecies : undefined,
			megaSpriteId: megaActivated ? performingPokemon.spriteId : undefined,
		});
		if (roundMoves.length === 3) {
			const stage = summarizeRPGContestRoundStage(
				participant.stageMoves[state.round - 1], participant.stageStates[state.round - 1]
			);
			participant.roundStages[state.round - 1] = stage;
			const score = scoreRPGContestRound(roundMoves, this.getCombos(), false, state.session.category);
			this.applyMegaAbilityCombos(score, roundMoves, participant.stageMoves[state.round - 1]);
			score.fieldInteractionScore = stage.fieldInteractionScore;
			score.scenarioMoveScore = stage.scenarioMoveScore;
			score.total += stage.fieldInteractionScore + stage.scenarioMoveScore;
			if (state.round === 2) Object.assign(score, applyRPGContestSecondRoundCreativity(score, participant.rounds[0]));
			const itemBonuses = participant.pokemonTeam.map((pokemon, index) => {
				const item = getRPGContestItemClassification(pokemon.item);
				const pokemonMoves = roundMoves.filter((move, moveIndex) => roundPokemonIndexes[moveIndex] === index);
				const matchingTeraMoves = item.scoringMode === 'tera-matching-moves' && item.teraType ?
					pokemonMoves.map(getRPGContestMove).filter(move => toID(move.type) === toID(item.teraType!)).length : 0;
				const active = item.canScore && ((item.scoringMode === 'tera-matching-moves' && matchingTeraMoves >= 2) ||
					(item.category === state.session.category && (item.scoringMode === 'passive' ||
						(item.scoringMode === 'mega-activation' && pokemon.megaActivated))));
				return {item, active, bonus: active ? item.points : 0};
			});
			score.itemId = participant.pokemonTeam.map(pokemon => toID(pokemon.item)).filter(Boolean).join(',');
			score.itemCategory = itemBonuses.find(entry => entry.active)?.item.category || null;
			score.itemBonus = itemBonuses.reduce((total, entry) => total + entry.bonus, 0);
			score.itemBonusActive = score.itemBonus > 0;
			score.total += score.itemBonus;
			Object.assign(score, applyRPGContestWithinRoundRepetition(score));
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
		let participant: RPGContestRuntimeParticipant | undefined;
		if (viewer.master) {
			const current = this.current(state);
			if (current.kind === 'npc' && !current.disqualified) participant = current;
			if (!participant) throw new Error('The Master can only abandon the current NPC participant');
		} else {
			const characterId = toID(viewer.characterId || '');
			participant = state.participants.find(entry =>
				!entry.disqualified && entry.kind === 'player' && entry.characterId === characterId
			);
			if (!participant) throw new Error('Only an active Player participant can abandon the RPG contest');
		}
		participant.disqualified = true;
		participant.disqualifiedAt = this.now();
		this.emit(state, 'participant-disqualified', participant.id);
		if (state.participants.filter(entry => !entry.disqualified).length <= 1) {
			this.finish(state, false);
			return;
		}
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
		this.finish(state);
	}

	private finish(state: RPGContestRuntimeState, awardPerformance = true): void {
		state.status = 'ended';
		state.finishedAt = this.now();
		state.phase = 'finished';
		state.currentOrderIndex = state.session.presentationOrder.length;
		state.results = rankRPGContestParticipants(state.participants.map(participant => ({
			id: participant.id, disqualified: participant.disqualified,
			roundTotals: participant.judging.filter(Boolean).map(judging => judging!.totalAfterJudging),
			scenarioCoherenceBonus: participant.scenarioCoherenceBonus,
			performanceBonus: participant.pokemonTeam.reduce((sum, pokemon) => sum + pokemon.performanceBonus, 0) / participant.pokemonTeam.length,
		})));
		if (!awardPerformance) {
			for (const result of state.results) result.performanceGain = 0;
		}
		this.emit(state, 'contest-finished');
		this.onFinished?.(structuredClone(state.session), structuredClone(state.results));
	}

	private pruneEndedRuntimes(now = this.now()): void {
		const ended = [...this.runtimes.entries()]
			.filter((entry): entry is [string, RPGContestRuntimeState] => entry[1].finishedAt !== undefined)
			.sort((left, right) => left[1].finishedAt! - right[1].finishedAt!);
		for (const [id, state] of ended) {
			if (now - state.finishedAt! >= RPGContestRuntimeManager.ENDED_RUNTIME_TTL) this.runtimes.delete(id);
		}
		const retained = ended.filter(([id]) => this.runtimes.has(id));
		for (const [id] of retained.slice(0, Math.max(0, retained.length - RPGContestRuntimeManager.MAX_ENDED_RUNTIMES))) {
			this.runtimes.delete(id);
		}
	}

	private runtimeParticipant(participant: RPGContestParticipant, session: RPGContestSession): RPGContestRuntimeParticipant {
		const sets = this.participantSets(participant);
		const pokemonTeam = sets.map(set => this.pokemon(set, false, participant.characterId || participant.id));
		const selections = participant.pokemonTeam || (participant.pokemon ? [participant.pokemon] : []);
		const firstStage = createRPGContestStage(session.scenario);
		const secondStage = createRPGContestStage(session.scenario);
		return {
			id: participant.id, kind: participant.kind, displayName: participant.displayName,
			characterId: participant.characterId, avatar: participant.avatar,
			pokemon: pokemonTeam[0], pokemonTeam, teamIndex: selections[0]?.teamIndex,
			teamIndexes: selections.map(selection => selection.teamIndex).filter((index): index is number => index !== undefined),
			disqualified: false, rounds: [[], []], roundPokemonIndexes: [[], []], roundScores: [null, null],
			stageStates: [firstStage, secondStage], stageMoves: [[], []], roundStages: [null, null],
			scenarioCoherenceBonus: 0, judging: [null, null], audienceReactions: [null, null], judgeComments: [null, null],
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
		participant.judgeComments[state.round - 1] = this.judgingComments(criteria);
		const reaction = this.audienceReaction(totalAfterJudging, mechanical, comment);
		participant.audienceReactions[state.round - 1] = reaction;
		this.emit(state, 'judging-complete', participant.id, {audienceReaction: reaction});
	}

	private judgingComments(criteria: RPGContestJudgingScores): RPGContestJudgingComments {
		return Object.fromEntries(Object.entries(criteria).map(([criterion, score]) => [criterion,
			`${RPG_CONTEST_JUDGING_CRITERIA[criterion as RPGContestJudgingCriterion]} ${RPG_CONTEST_JUDGING_COMMENT_LEVELS[score + 1]}`,
		])) as RPGContestJudgingComments;
	}

	private finalHighlights(state: RPGContestRuntimeState): RPGContestFinalHighlights {
		const active = state.participants.filter(participant => !participant.disqualified);
		const leaders = (value: (participant: RPGContestRuntimeParticipant) => number) => {
			if (!active.length) return [];
			const scores = active.map(participant => [participant.id, value(participant)] as const);
			const best = Math.max(...scores.map(([, score]) => score));
			return scores.filter(([, score]) => score === best).map(([id]) => id);
		};
		const judgeCategories = Object.fromEntries((Object.keys(RPG_CONTEST_JUDGING_CRITERIA) as RPGContestJudgingCriterion[])
			.map(criterion => [criterion, leaders(participant => participant.judging.reduce((sum, judging) =>
				sum + (judging?.criteria[criterion] || 0), 0))])) as RPGContestFinalHighlights['judgeCategories'];
		return {
			judgeCategories,
			audience: leaders(participant => participant.audienceReactions.reduce((sum, reaction) => sum + (reaction?.level || 0), 0)),
			scenario: leaders(participant => participant.roundScores.reduce((sum, score) =>
				sum + (score?.fieldInteractionScore || 0) + (score?.scenarioMoveScore || 0), 0)),
			combo: leaders(participant => participant.roundScores.reduce((sum, score) => sum + (score?.comboScore || 0), 0)),
			evolution: leaders(participant => (participant.judging[1]?.totalAfterJudging || 0) -
				(participant.judging[0]?.totalAfterJudging || 0)),
		};
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

	private participantSets(participant: RPGContestParticipant): PokemonSet[] {
		const selections = participant.pokemonTeam || (participant.pokemon ? [participant.pokemon] : []);
		if (participant.kind === 'npc') return selections.map(selection => structuredClone(selection.set!));
		const team = this.getCharacterTeam(participant.characterId!);
		return selections.map(selection => {
			const set = team?.[selection.teamIndex!];
			if (!set) throw new Error('RPG contest Player Pokemon is no longer available');
			return structuredClone(set);
		});
	}

	private refreshUnfrozenPokemon(state: RPGContestRuntimeState): void {
		for (const participant of state.participants) this.refreshParticipantPokemon(state, participant);
	}

	private refreshParticipantPokemon(state: RPGContestRuntimeState, participant: RPGContestRuntimeParticipant): void {
		if (participant.kind !== 'player' || participant.pokemonTeam.some(pokemon => pokemon.movesFrozen)) return;
		const source = state.session.participants.find(entry => entry.id === participant.id);
		if (!source) return;
		participant.pokemonTeam = this.participantSets(source).map(set => this.pokemon(set, false, participant.characterId || participant.id));
		participant.pokemon = participant.pokemonTeam[0];
	}

	private pokemon(set: PokemonSet, movesFrozen: boolean, trainerId: string): RPGContestRuntimePokemon {
		const performance = getRPGContestPerformance(set, trainerId);
		const species = Dex.species.get(set.species);
		const heldItem = Dex.items.get(set.item || '');
		const megaSpecies = heldItem.megaStone?.[species.name] || heldItem.megaStone?.[species.baseSpecies] || '';
		return {
			name: set.name || set.species, species: species.name, spriteId: species.spriteid,
			heightM: species.heightm, sizeClass: getRPGPokemonSizeClass(species.heightm), level: set.level || 1,
			gender: set.gender || 'N', shiny: !!set.shiny, nature: set.nature || '', item: set.item || '',
			friendship: Math.max(0, Math.min(255, set.rpg?.friendship ?? set.happiness ?? 0)),
			performance, performanceBonus: getRPGContestPerformanceBonus(performance),
			hp: Number.isFinite(set.rpg?.hp) ? Number(set.rpg!.hp) : null,
			status: set.rpg?.status || '', ability: set.ability || species.abilities[0] || '', movesFrozen, megaEligible: !!megaSpecies,
			megaActivated: false, megaSpecies,
			moves: (set.moves || []).map(move => {
				const definition = getRPGContestMove(move);
				return {
					id: definition.moveId, name: definition.name, type: definition.type,
					battleCategory: definition.battleCategory, basePower: definition.basePower,
					battleStatus: definition.battleStatus, tags: [...definition.tags],
					changesField: definition.changesField,
				};
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

	private applyMegaAbilityCombos(
		score: RPGContestRoundMechanicalScore, moves: readonly string[], stageMoves: readonly RPGContestMoveStageResult[]
	): void {
		const weatherMove: Readonly<Record<string, string>> = {
			sun: 'sunnyday', rain: 'raindance', sand: 'sandstorm', snow: 'snowscape',
		};
		const timeline: string[] = [];
		for (let index = 0; index < moves.length; index++) {
			const weatherTransformation = stageMoves[index]?.transformations.find(value => value.startsWith('ability-weather:'));
			const weather = weatherTransformation?.slice('ability-weather:'.length) || '';
			if (weatherMove[weather]) timeline.push(weatherMove[weather]);
			timeline.push(toID(moves[index]));
		}
		const isSubsequence = (sequence: readonly string[]) => {
			let cursor = 0;
			for (const entry of timeline) if (entry === sequence[cursor]) cursor++;
			return cursor === sequence.length;
		};
		const matched = this.getCombos().filter(combo =>
			combo.sequence.some(move => Object.values(weatherMove).includes(move)) && isSubsequence(combo.sequence));
		if (!matched.length) return;
		const previousSpecial = score.specialComboBonus;
		const special = Math.min(6, Math.max(previousSpecial, ...matched.map(combo => combo.bonus)));
		const increase = Math.min(15, score.comboScore - previousSpecial + special) - score.comboScore;
		score.specialComboBonus = special;
		score.comboScore += increase;
		score.total += increase;
		for (const combo of matched) {
			if (!score.matchedCombos.some(entry => entry.id === combo.id)) score.matchedCombos.push({id: combo.id, name: combo.name});
		}
	}

	private emit(
		state: RPGContestRuntimeState, type: RPGContestRuntimeEventType, participantId?: string,
		extra: Partial<Pick<RPGContestRuntimeEvent,
			'moveIndex' | 'moveId' | 'moveName' | 'pokemonIndex' | 'stageTransformations' | 'stageInteractions' | 'audienceReaction' |
			'megaActivated' | 'megaSpecies' | 'megaSpriteId'>> = {}
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
