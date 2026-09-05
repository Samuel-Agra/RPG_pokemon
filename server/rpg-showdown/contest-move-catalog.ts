import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import type { Move } from '../../sim/dex-moves';
import { getRPGMoveMetadata } from './battle-move-analysis';
import type { RPGContestCategory } from './contest-session';

export interface RPGContestMoveDefinition {
	moveId: string;
	name: string;
	category: RPGContestCategory;
	baseScore: number;
	tags: string[];
	changesField: boolean;
	penalties: string[];
	type: string;
	battleCategory: string;
	basePower: number | null;
	battleStatus: string;
	accuracy: number | null;
	alwaysHits: boolean;
	target: string;
	targetLabel: string;
	flags: { id: string, label: string, description: string }[];
	pp: number;
	description: string;
}

/** Internal zero-point action used when a contestant attempts a move without PP. */
export const RPG_CONTEST_NO_PP_ACTION = 'contestnopp';
const RPG_CONTEST_NO_PP_DEFINITION: RPGContestMoveDefinition = Object.freeze({
	moveId: RPG_CONTEST_NO_PP_ACTION, name: 'Ação perdida (sem PP)', category: 'smart', baseScore: 0,
	tags: [], changesField: false, penalties: [], type: 'Normal', battleCategory: 'Status', basePower: null,
	battleStatus: '', accuracy: null, alwaysHits: true, target: 'self', targetLabel: 'Usuário', flags: [], pp: 0,
	description: 'O Pokémon tentou agir sem PP e perdeu esta ação.',
});

interface RPGContestMoveOverride {
	baseScore?: number;
	category?: RPGContestCategory;
	tags?: string[];
	changesField?: boolean;
	penalties?: string[];
}

const CATEGORY_BY_OFFICIAL_CONDITION: Readonly<Record<string, RPGContestCategory>> = Object.freeze({
	beautiful: 'beauty', beauty: 'beauty', cute: 'cute', cool: 'cool', clever: 'smart', smart: 'smart', tough: 'tough',
});

const TYPE_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	bug: ['bug', 'nature'], dark: ['dark', 'shadow'], dragon: ['dragon', 'grand'], electric: ['electric', 'light'],
	fairy: ['fairy', 'magic', 'light'], fighting: ['fight', 'power'], fire: ['fire', 'heat', 'light'],
	flying: ['flying', 'wind', 'movement'], ghost: ['ghost', 'shadow', 'mysterious'], grass: ['plant', 'nature'],
	ground: ['ground', 'earth'], ice: ['ice', 'cold'], normal: ['normal'], poison: ['poison'],
	psychic: ['psychic', 'magic'], rock: ['rock', 'earth'], steel: ['metal', 'reflective'], water: ['water'],
});

const MOVE_OVERRIDES: Readonly<Record<string, RPGContestMoveOverride>> = Object.freeze({
	quiverdance: { baseScore: 8, category: 'beauty', tags: ['dance', 'elegant', 'colorful', 'movement', 'grand'] },
	petaldance: { baseScore: 8, category: 'beauty', tags: ['plant', 'flower', 'dance', 'elegant', 'colorful', 'movement'] },
	dazzlinggleam: { baseScore: 7, category: 'beauty', tags: ['fairy', 'light', 'colorful', 'magic', 'grand'] },
	surf: { baseScore: 6, category: 'beauty', tags: ['water', 'wave', 'ocean', 'grand', 'movement', 'field-change'], changesField: true },
	icebeam: { baseScore: 6, category: 'beauty', tags: ['ice', 'cold', 'light', 'beam', 'elegant'] },
	charm: { baseScore: 6, category: 'cute', tags: ['cute', 'emotion', 'playful', 'expression'] },
	raindance: { baseScore: 5, category: 'beauty', tags: ['rain', 'water', 'sky', 'dance', 'movement', 'weather', 'field-change'], changesField: true },
	sunnyday: { baseScore: 5, category: 'beauty', tags: ['sun', 'light', 'heat', 'sky', 'weather', 'field-change'], changesField: true },
	recover: { baseScore: 4, category: 'smart', tags: ['healing', 'calm', 'light'] },
	earthquake: { baseScore: 2, category: 'tough', tags: ['ground', 'earth', 'impact', 'power', 'aggressive', 'field-change'], changesField: true },
	rockslide: { baseScore: 3, category: 'tough', tags: ['rock', 'earth', 'movement', 'impact', 'field-change'], changesField: true },
	blizzard: { baseScore: 6, category: 'beauty', tags: ['ice', 'snow', 'wind', 'grand', 'field-change'], changesField: true },
	leafstorm: { baseScore: 7, category: 'beauty', tags: ['plant', 'leaf', 'wind', 'grand', 'field-change'], changesField: true },
	thief: { baseScore: -1, category: 'smart', tags: ['dark', 'trick', 'movement'], penalties: ['dishonest'] },
	explosion: { baseScore: -3, category: 'tough', tags: ['explosion', 'fire', 'impact', 'power', 'grand'], penalties: ['self-ko', 'destructive'] },
	selfdestruct: { baseScore: -4, category: 'tough', tags: ['explosion', 'impact', 'power'], penalties: ['self-ko', 'destructive'] },
});

const FIELD_CHANGE_MOVES = new Set([
	'surf', 'earthquake', 'rockslide', 'blizzard', 'leafstorm', 'smokescreen', 'mist', 'haze',
	'spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'defog', 'whirlpool', 'firespin', 'sandsearstorm',
]);

const WEATHER_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	sunnyday: ['sun', 'weather'], raindance: ['rain', 'weather'], sandstorm: ['sand', 'weather'], snowscape: ['snow', 'weather'],
	chillyreception: ['snow', 'weather'],
});

const TERRAIN_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	electricterrain: ['electric', 'terrain'], grassyterrain: ['plant', 'terrain'],
	psychicterrain: ['psychic', 'terrain'], mistyterrain: ['mist', 'fairy', 'terrain'],
});

function normalizedTags(tags: Iterable<string>): string[] {
	return [...new Set([...tags].map(tag => toID(tag)).filter(Boolean))].sort();
}

function textTags(move: Move): string[] {
	const text = `${move.name} ${move.shortDesc || ''} ${move.desc || ''}`.toLowerCase();
	const tags: string[] = [];
	const patterns: [RegExp, string][] = [
		[/dance|dancing/, 'dance'], [/song|sound|voice|noise|music|sing/, 'sound'], [/flower|petal|pollen/, 'flower'],
		[/leaf|leaves/, 'leaf'], [/wave|ocean|sea|water/, 'wave'], [/beam|ray/, 'beam'], [/rainbow|color/, 'colorful'],
		[/light|glow|gleam|flash|bright/, 'light'], [/shadow|darkness/, 'shadow'], [/mist|fog/, 'mist'],
		[/smoke/, 'smoke'], [/steam/, 'steam'], [/wind|hurricane|tornado/, 'wind'], [/snow/, 'snow'],
		[/sand/, 'sand'], [/moon|lunar/, 'moon'], [/sun|solar/, 'sun'], [/star|meteor/, 'star'],
		[/heal|restore|recover/, 'healing'], [/protect|barrier|shield|wall/, 'defense'], [/speed|quick|rapid/, 'speed'],
		[/jump|bounce|leap/, 'jump'], [/play|tease|tickle/, 'playful'], [/sleep|dream/, 'dream'],
		[/explod|blast/, 'explosion'], [/punch|kick|slam|crash|impact/, 'impact'], [/dance|spin|roll|charge|rush/, 'movement'],
	];
	for (const [pattern, tag] of patterns) if (pattern.test(text)) tags.push(tag);
	return tags;
}

function contestCategory(move: Move, tags: Set<string>): RPGContestCategory {
	const official = CATEGORY_BY_OFFICIAL_CONDITION[toID(move.contestType || '')];
	if (official) return official;
	if (tags.has('cute') || tags.has('playful')) return 'cute';
	if (tags.has('elegant') || tags.has('light') || tags.has('flower')) return 'beauty';
	if (move.category === 'Status' || tags.has('psychic') || tags.has('trick')) return 'smart';
	if (move.type === 'Fighting' || move.type === 'Rock' || move.type === 'Ground') return 'tough';
	return 'cool';
}

function inferredBaseScore(move: Move, tags: Set<string>): number {
	if (move.selfdestruct) return move.id === 'selfdestruct' ? -4 : -3;
	let score = move.category === 'Status' ? 3 : 2;
	if (move.basePower >= 40) score++;
	if (move.basePower >= 80) score++;
	if (move.basePower >= 120) score++;
	if (tags.has('dance') || tags.has('colorful') || tags.has('grand')) score++;
	if (tags.has('light') || tags.has('flower') || tags.has('sound')) score++;
	if (tags.has('healing') || tags.has('weather') || tags.has('terrain')) score++;
	if (move.recoil) score--;
	if (move.accuracy !== true && Number(move.accuracy) <= 70) score--;
	return Math.max(-4, Math.min(8, score));
}

function moveDefinition(move: Move): RPGContestMoveDefinition {
	const override = MOVE_OVERRIDES[move.id] || {};
	const metadata = getRPGMoveMetadata(move);
	const tags = new Set<string>(TYPE_TAGS[toID(move.type)] || []);
	if (move.category === 'Physical') tags.add('power');
	if (move.category === 'Special') tags.add('energy');
	if (move.category === 'Status') tags.add('status');
	if (move.flags?.dance) tags.add('dance');
	if (move.flags?.sound) tags.add('sound');
	if (move.flags?.pulse) tags.add('pulse');
	if (move.flags?.powder) tags.add('powder');
	if (move.flags?.contact) tags.add('movement');
	if (move.heal || move.drain) tags.add('healing');
	for (const tag of WEATHER_TAGS[move.id] || []) tags.add(tag);
	for (const tag of TERRAIN_TAGS[move.id] || []) tags.add(tag);
	for (const tag of textTags(move)) tags.add(tag);
	for (const tag of override.tags || []) tags.add(tag);
	const changesField = override.changesField ?? (
		FIELD_CHANGE_MOVES.has(move.id) || tags.has('weather') || tags.has('terrain')
	);
	if (changesField) tags.add('field-change');
	const penalties = new Set(override.penalties || []);
	if (move.selfdestruct) penalties.add('self-ko');
	if (move.recoil) penalties.add('recoil');
	return {
		moveId: move.id,
		name: move.name,
		category: override.category || contestCategory(move, tags),
		baseScore: override.baseScore ?? inferredBaseScore(move, tags),
		tags: normalizedTags(tags),
		changesField,
		penalties: normalizedTags(penalties),
		type: move.type,
		battleCategory: move.category,
		basePower: move.category === 'Status' ? null : move.basePower || null,
		battleStatus: move.status || '',
		accuracy: move.accuracy === true ? null : Number(move.accuracy) || null,
		alwaysHits: metadata.alwaysHits,
		target: metadata.target,
		targetLabel: metadata.targetLabel,
		flags: metadata.flags,
		pp: move.pp || 1,
		description: metadata.description,
	};
}

let cachedCatalog: readonly RPGContestMoveDefinition[] | undefined;

export function getRPGContestMoveCatalog(): readonly RPGContestMoveDefinition[] {
	if (!cachedCatalog) {
		const uniqueMoves = new Map<string, RPGContestMoveDefinition>();
		for (const move of Dex.mod('gen9').moves.all()) {
			if (!move.exists || ['CAP', 'Custom', 'Future'].includes(move.isNonstandard || '')) continue;
			uniqueMoves.set(move.id, moveDefinition(move));
		}
		cachedCatalog = Object.freeze([...uniqueMoves.values()].sort((a, b) => a.name.localeCompare(b.name)));
	}
	return cachedCatalog.map(move => structuredClone(move));
}

/**
 * Returns the legal Gen 9 move pool used by the Team Builder for a species.
 * Full learnsets include inherited entries from previous evolutions; acquisition
 * methods are intentionally merged for the temporary contest NPC editor.
 */
export function getRPGContestPokemonMoveCatalog(speciesName: string, level = 100): RPGContestMoveDefinition[] {
	const dex = Dex.mod('gen9');
	const species = dex.species.get(speciesName);
	if (!species.exists) throw new Error('Unknown RPG contest Pokemon species');
	const maximumLevel = Math.max(1, Math.min(100, Math.round(Number(level) || 1)));
	const fullLearnset = dex.species.getFullLearnset(species.id);
	const availableGenerations = new Set<number>();
	for (const learnsetData of fullLearnset) for (const sources of Object.values(learnsetData.learnset)) {
		for (const source of sources) {
			const officialAcquisition = /^([1-9])[MEL]/.exec(source);
			if (officialAcquisition) availableGenerations.add(Number(officialAcquisition[1]));
		}
	}
	// Espécies ausentes da geração atual continuam selecionáveis no RPG.
	// Para elas, usa o learnset da geração oficial mais recente disponível.
	const generation = Math.max(...availableGenerations, 1);
	const moveIds = new Set<string>();
	for (const learnsetData of fullLearnset) {
		for (const [moveId, sources] of Object.entries(learnsetData.learnset)) {
			const available = sources.some(source => {
				if (source.startsWith(`${generation}M`) || source.startsWith(`${generation}E`)) return true;
				const learned = new RegExp(`^${generation}L(\\d+)`).exec(source);
				return !!learned && Number(learned[1]) <= maximumLevel;
			});
			if (available) moveIds.add(toID(moveId));
		}
	}
	return getRPGContestMoveCatalog()
		.filter(move => moveIds.has(move.moveId))
		.map(move => structuredClone(move));
}

export function getRPGContestMove(moveId: string): RPGContestMoveDefinition {
	const id = toID(moveId);
	if (id === RPG_CONTEST_NO_PP_ACTION) return structuredClone(RPG_CONTEST_NO_PP_DEFINITION);
	const move = getRPGContestMoveCatalog().find(entry => entry.moveId === id);
	if (!move) throw new Error('Unknown RPG contest move');
	return move;
}
