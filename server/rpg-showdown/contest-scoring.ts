import {toID} from '../../sim/dex-data';
import {getRPGContestMove, type RPGContestMoveDefinition} from './contest-move-catalog';
import type {RPGContestCategory} from './contest-session';

export interface RPGContestComboDefinition {
	id: string;
	name: string;
	sequence: [string, string, string];
	bonus: number;
	source: 'default' | 'master';
	description: string;
}

export interface RPGContestRoundMechanicalScore {
	moves: [string, string, string];
	moveBaseScore: number;
	continuityScore: number;
	tagSynergyScore: number;
	finaleScore: number;
	specialComboBonus: number;
	comboScore: number;
	fieldInteractionScore: number;
	scenarioMoveScore: number;
	novelMoveBonus: number;
	originalityScore: number;
	inventiveInteractionScore: number;
	creativityScore: number;
	repetitionPenaltyRate: number;
	repetitionPenalty: number;
	matchedCombos: {id: string, name: string}[];
	discoveredInteractions: string[];
	itemId: string;
	itemCategory: RPGContestCategory | null;
	itemBonus: number;
	itemBonusActive: boolean;
	total: number;
}

export function applyRPGContestWithinRoundRepetition(
	score: RPGContestRoundMechanicalScore
): RPGContestRoundMechanicalScore {
	const counts = new Map<string, number>();
	for (const move of score.moves) counts.set(move, (counts.get(move) || 0) + 1);
	const maximumUses = Math.max(...counts.values());
	const repetitionPenaltyRate = maximumUses >= 3 ? 1 : maximumUses === 2 ? 0.4 : 0;
	if (!repetitionPenaltyRate) return score;
	const beforeRepetition = score.total + score.repetitionPenalty;
	const repetitionPenalty = Number((beforeRepetition * repetitionPenaltyRate).toFixed(1));
	return {...score, repetitionPenaltyRate, repetitionPenalty, total: beforeRepetition - repetitionPenalty};
}

export function applyRPGContestSecondRoundCreativity(
	score: RPGContestRoundMechanicalScore, firstRound: readonly string[]
): RPGContestRoundMechanicalScore {
	if (firstRound.length !== 3) throw new Error('RPG contest first round requires exactly three moves');
	const first: string[] = firstRound.map(move => toID(move));
	const second = score.moves;
	const repeated = second.filter(move => first.includes(move)).length;
	const samePositions = second.filter((move, index) => move === first[index]).length;
	const exactSequence = samePositions === 3;
	const sameMoveSet = !exactSequence && [...second].sort().join(',') === [...first].sort().join(',');
	let repetitionPenaltyRate = 0;
	if (exactSequence) repetitionPenaltyRate = 1;
	else if (sameMoveSet) repetitionPenaltyRate = 0.5;
	else if (repeated >= 2 && samePositions >= 2) repetitionPenaltyRate = 0.25;
	else if (repeated >= 2) repetitionPenaltyRate = 0.15;
	const novelMoveBonus = repeated < 3 ? 4 : 0;
	const originalityScore = repeated === 0 ? 4 : repeated === 1 ? 3 : repeated === 2 ? 2 : exactSequence ? 0 : 1;
	const inventiveInteractionScore = Math.min(4, score.discoveredInteractions.length * 2);
	const creativityScore = novelMoveBonus + originalityScore + inventiveInteractionScore;
	const beforeRepetition = score.total + creativityScore;
	const repetitionPenalty = Number((beforeRepetition * repetitionPenaltyRate).toFixed(1));
	return {...score, novelMoveBonus, originalityScore, inventiveInteractionScore, creativityScore,
		repetitionPenaltyRate, repetitionPenalty, total: beforeRepetition - repetitionPenalty};
}

export interface RPGContestComboRepository {
	list(): RPGContestComboDefinition[];
	set(combo: RPGContestComboDefinition): void;
	delete(id: string): boolean;
}

const OPPOSITE_CONTEST_CATEGORIES: Readonly<Partial<Record<RPGContestCategory, RPGContestCategory>>> = Object.freeze({
	beauty: 'cool', cool: 'beauty', cute: 'tough', tough: 'cute',
});

/** Matching moves gain appeal, unrelated categories stay neutral, and contradictory categories are strongly reduced. */
export function scoreRPGContestMoveForCategory(
	move: RPGContestMoveDefinition, contestCategory?: RPGContestCategory
): number {
	if (!contestCategory) return move.baseScore;
	if (move.category === contestCategory) return move.baseScore <= 0 ? move.baseScore : Math.min(10, move.baseScore + 2);
	if (OPPOSITE_CONTEST_CATEGORIES[contestCategory] !== move.category) return move.baseScore;
	if (move.baseScore <= 0) return move.baseScore;
	return Math.min(2, Math.floor(move.baseScore / 2));
}

export class RPGMemoryContestComboRepository implements RPGContestComboRepository {
	private readonly combos = new Map<string, RPGContestComboDefinition>();
	list(): RPGContestComboDefinition[] {
		return [...this.combos.values()].map(combo => structuredClone(combo));
	}
	set(combo: RPGContestComboDefinition): void {
		this.combos.set(combo.id, structuredClone(combo));
	}
	delete(id: string): boolean {
		return this.combos.delete(toID(id));
	}
}

const DEFAULT_COMBO_INPUTS: readonly [string, string, [string, string, string], number][] = [
	['solar-bloom', 'Flores ao Sol', ['sunnyday', 'petaldance', 'solarbeam'], 4],
	['solar-renewal', 'Renascimento Solar', ['sunnyday', 'solarbeam', 'morningsun'], 4],
	['storm-circuit', 'Circuito da Tempestade', ['raindance', 'thunder', 'voltswitch'], 4],
	['frozen-wave', 'Onda Congelada', ['raindance', 'surf', 'icebeam'], 4],
	['rainbow-stage', 'Palco de Arco-íris', ['raindance', 'fireblast', 'dazzlinggleam'], 5],
	['ocean-mirror', 'Espelho do Oceano', ['surf', 'psychic', 'dazzlinggleam'], 4],
	['crystal-sea', 'Mar de Cristal', ['surf', 'freezedry', 'aurorabeam'], 4],
	['misty-moon', 'Lua na Neblina', ['mistyterrain', 'moonblast', 'moonlight'], 4],
	['electric-metal', 'Reflexos Elétricos', ['electricterrain', 'flashcannon', 'thunderbolt'], 4],
	['psychic-stones', 'Balé de Pedras', ['rockslide', 'psychic', 'powergem'], 5],
	['garden-finale', 'Finale do Jardim', ['grassyterrain', 'petaldance', 'leafstorm'], 5],
	['winter-festival', 'Festival de Inverno', ['snowscape', 'icespinner', 'blizzard'], 5],
	['aurora-night', 'Noite de Aurora', ['snowscape', 'aurorabeam', 'dazzlinggleam'], 4],
	['smoke-and-light', 'Luz entre Fumaça', ['smokescreen', 'flamethrower', 'flash'], 4],
	['embers-in-rain', 'Brasas na Chuva', ['raindance', 'flamethrower', 'dazzlinggleam'], 4],
	['sand-sculpture', 'Escultura de Areia', ['sandstorm', 'rockslide', 'sandattack'], 4],
	['earth-garden', 'Jardim da Terra', ['earthquake', 'grassyterrain', 'petalblizzard'], 4],
	['ghostly-curtain', 'Cortina Fantasma', ['haze', 'shadowball', 'phantomforce'], 4],
	['dream-song', 'Canção dos Sonhos', ['sing', 'dreameater', 'moonlight'], 4],
	['fiery-dance', 'Dança das Chamas', ['fierydance', 'flamecharge', 'firespin'], 4],
	['dragon-sky', 'Dragão Celestial', ['dragondance', 'twister', 'dracometeor'], 5],
	['fairy-waltz', 'Valsa das Fadas', ['charm', 'teeterdance', 'dazzlinggleam'], 4],
	['musical-finale', 'Grande Finale Musical', ['sing', 'relicsong', 'boomburst'], 5],
	['flower-wind', 'Flores ao Vento', ['tailwind', 'petaldance', 'pollenpuff'], 4],
	['prismatic-ice', 'Prisma de Gelo', ['icebeam', 'aurorabeam', 'reflect'], 4],
	['healing-light', 'Luz Restauradora', ['lightscreen', 'lifedew', 'recover'], 4],
	['volcanic-stage', 'Palco Vulcânico', ['sunnyday', 'earthpower', 'eruption'], 5],
	['water-dance', 'Dança Aquática', ['aquaring', 'raindance', 'surf'], 4],
	['leaf-tornado', 'Tornado de Folhas', ['razorleaf', 'tailwind', 'leafstorm'], 4],
	['starry-finale', 'Finale Estrelado', ['cosmicpower', 'swift', 'meteormash'], 4],
];

export const RPG_DEFAULT_CONTEST_COMBOS: readonly RPGContestComboDefinition[] = Object.freeze(
	DEFAULT_COMBO_INPUTS.map(([id, name, sequence, bonus]) => Object.freeze({
		id: toID(id), name, sequence: sequence.map(toID) as [string, string, string], bonus,
		source: 'default' as const, description: `${name}: ${sequence.join(' → ')}`,
	}))
);

const TAG_RELATIONS: readonly [string, string, string][] = [
	['rain', 'fire', 'steam'], ['rain', 'light', 'rainbow'], ['water', 'ice', 'frozen-water'],
	['water', 'light', 'reflection'], ['water', 'electric', 'charged-water'], ['water', 'plant', 'growth'],
	['fire', 'light', 'brilliance'], ['fire', 'smoke', 'ember-cloud'], ['fire', 'wind', 'firestorm'],
	['sun', 'plant', 'bloom'], ['sun', 'light', 'radiance'], ['snow', 'light', 'aurora'],
	['ice', 'light', 'crystal'], ['ice', 'rock', 'sculpture'], ['sand', 'wind', 'sand-dance'],
	['rock', 'psychic', 'levitation'], ['metal', 'electric', 'sparks'], ['metal', 'light', 'reflection'],
	['mist', 'moon', 'mystic-moon'], ['mist', 'light', 'diffused-light'], ['shadow', 'light', 'contrast'],
	['flower', 'dance', 'flower-dance'], ['sound', 'dance', 'musical-dance'], ['sound', 'wave', 'resonance'],
	['healing', 'light', 'renewal'], ['ground', 'plant', 'new-growth'], ['smoke', 'light', 'spotlight'],
];

function pairRelations(left: Set<string>, right: Set<string>): string[] {
	const relations: string[] = [];
	for (const [first, second, result] of TAG_RELATIONS) {
		if ((left.has(first) && right.has(second)) || (left.has(second) && right.has(first))) relations.push(result);
	}
	return relations;
}

function sharedTags(left: Set<string>, right: Set<string>): string[] {
	return [...left].filter(tag => right.has(tag) && !['status', 'energy', 'normal'].includes(tag));
}

export class RPGContestComboService {
	readonly repository: RPGContestComboRepository;

	constructor(repository: RPGContestComboRepository = new RPGMemoryContestComboRepository()) {
		this.repository = repository;
	}

	list(): RPGContestComboDefinition[] {
		return [...RPG_DEFAULT_CONTEST_COMBOS.map(combo => structuredClone(combo)), ...this.repository.list()]
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	create(input: Omit<RPGContestComboDefinition, 'id' | 'source'> & {id?: string}): RPGContestComboDefinition {
		const id = toID(input.id || input.name);
		if (!id || RPG_DEFAULT_CONTEST_COMBOS.some(combo => combo.id === id) || this.repository.list().some(combo => combo.id === id)) {
			throw new Error('Invalid or duplicate RPG contest combo id');
		}
		const name = String(input.name || '').trim();
		if (!name || name.length > 80) throw new Error('Invalid RPG contest combo name');
		if (!Array.isArray(input.sequence) || input.sequence.length !== 3) {
			throw new Error('RPG contest combo requires exactly three moves');
		}
		const sequence = input.sequence.map(move => getRPGContestMove(move).moveId) as [string, string, string];
		const bonus = Number(input.bonus);
		if (!Number.isSafeInteger(bonus) || bonus < 1 || bonus > 6) throw new Error('RPG contest combo bonus must be between 1 and 6');
		const description = String(input.description || '').trim();
		if (description.length > 300) throw new Error('RPG contest combo description is too long');
		const combo: RPGContestComboDefinition = {id, name, sequence, bonus, source: 'master', description};
		this.repository.set(combo);
		return structuredClone(combo);
	}

	delete(id: string): boolean {
		if (RPG_DEFAULT_CONTEST_COMBOS.some(combo => combo.id === toID(id))) {
			throw new Error('Default RPG contest combos cannot be deleted');
		}
		return this.repository.delete(id);
	}
}

export function scoreRPGContestRound(
	moves: readonly string[], combos: readonly RPGContestComboDefinition[] = RPG_DEFAULT_CONTEST_COMBOS,
	applyWithinRoundRepetition = true, contestCategory?: RPGContestCategory
): RPGContestRoundMechanicalScore {
	if (!Array.isArray(moves) || moves.length !== 3) throw new Error('RPG contest round requires exactly three moves');
	const definitions = moves.map(getRPGContestMove) as [RPGContestMoveDefinition, RPGContestMoveDefinition, RPGContestMoveDefinition];
	const tags = definitions.map(move => new Set(move.tags));
	const adjacentShared = [sharedTags(tags[0], tags[1]), sharedTags(tags[1], tags[2])];
	const adjacentRelations = [pairRelations(tags[0], tags[1]), pairRelations(tags[1], tags[2])];
	const allRelations = [...new Set([...adjacentRelations[0], ...adjacentRelations[1], ...pairRelations(tags[0], tags[2])])];
	const continuityScore = Math.min(5,
		(adjacentShared[0].length || adjacentRelations[0].length ? 2 : 0) +
		(adjacentShared[1].length || adjacentRelations[1].length ? 2 : 0) +
		(adjacentRelations[0].length && adjacentRelations[1].length ? 1 : 0)
	);
	const uniqueShared = new Set([...adjacentShared[0], ...adjacentShared[1], ...sharedTags(tags[0], tags[2])]);
	const tagSynergyScore = Math.min(6, uniqueShared.size + allRelations.length * 2);
	const setupTags = new Set([...tags[0], ...tags[1], ...allRelations]);
	const finaleLinks = sharedTags(setupTags, tags[2]).length + pairRelations(setupTags, tags[2]).length;
	const finaleScore = Math.min(4, (finaleLinks ? 1 : 0) + Math.min(2, finaleLinks) +
		(tags[2].has('grand') || tags[2].has('explosion') || tags[2].has('dance') ? 1 : 0));
	const sequence = definitions.map(move => move.moveId) as [string, string, string];
	const matched = combos.filter(combo => combo.sequence.every((move, index) => move === sequence[index]));
	const specialComboBonus = Math.min(6, matched.reduce((maximum, combo) => Math.max(maximum, combo.bonus), 0));
	const comboScore = Math.min(15, continuityScore + tagSynergyScore + finaleScore + specialComboBonus);
	const moveBaseScore = definitions.reduce((total, move) =>
		total + scoreRPGContestMoveForCategory(move, contestCategory), 0);
	const score: RPGContestRoundMechanicalScore = {
		moves: sequence, moveBaseScore, continuityScore, tagSynergyScore, finaleScore, specialComboBonus,
		comboScore, fieldInteractionScore: 0, scenarioMoveScore: 0,
		novelMoveBonus: 0, originalityScore: 0, inventiveInteractionScore: 0, creativityScore: 0,
		repetitionPenaltyRate: 0, repetitionPenalty: 0,
		matchedCombos: matched.map(combo => ({id: combo.id, name: combo.name})),
		discoveredInteractions: allRelations, total: moveBaseScore + comboScore,
		itemId: '', itemCategory: null, itemBonus: 0, itemBonusActive: false,
	};
	return applyWithinRoundRepetition ? applyRPGContestWithinRoundRepetition(score) : score;
}
