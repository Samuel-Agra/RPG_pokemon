/** Traduz moves em alterações temporárias do palco e mantém esses efeitos até a rodada do participante terminar. */
import { toID } from '../../sim/dex-data';
import { getRPGContestMove } from './contest-move-catalog';
import type { RPGContestScenario } from './contest-session';

export type RPGContestWeather = '' | 'sun' | 'rain' | 'sand' | 'snow';
export type RPGContestTerrain = '' | 'electric' | 'grassy' | 'psychic' | 'misty';

export interface RPGContestStageLayer {
	weather: RPGContestWeather;
	terrain: RPGContestTerrain;
	tags: string[];
}

export interface RPGContestStageState {
	base: RPGContestStageLayer;
	temporary: RPGContestStageLayer;
}

export interface RPGContestMoveStageResult {
	moveId: string;
	stateBefore: RPGContestStageState;
	stateAfter: RPGContestStageState;
	interactionScore: number;
	scenarioScore: number;
	interactions: string[];
	transformations: string[];
}

export interface RPGContestRoundStageResult {
	moves: RPGContestMoveStageResult[];
	fieldInteractionScore: number;
	scenarioMoveScore: number;
	finalState: RPGContestStageState;
}

const WEATHER_MOVES: Readonly<Record<string, RPGContestWeather>> = Object.freeze({
	sunnyday: 'sun', raindance: 'rain', sandstorm: 'sand', snowscape: 'snow', chillyreception: 'snow',
});
const TERRAIN_MOVES: Readonly<Record<string, RPGContestTerrain>> = Object.freeze({
	electricterrain: 'electric', grassyterrain: 'grassy', psychicterrain: 'psychic', mistyterrain: 'misty',
});
const FIELD_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	surf: ['water', 'wave', 'wet-stage', 'reflective'],
	earthquake: ['earth', 'cracked-ground', 'debris'],
	rockslide: ['rock', 'debris', 'raised-stones'],
	blizzard: ['snow', 'ice', 'frozen-stage'],
	leafstorm: ['plant', 'leaf', 'scattered-leaves'],
	smokescreen: ['smoke', 'darkened-stage'], haze: ['mist', 'haze'], mist: ['mist'],
	whirlpool: ['water', 'whirlpool'], firespin: ['fire', 'flame-ring'],
	spikes: ['metal', 'spikes', 'sharp-stage'],
	toxicspikes: ['poison', 'toxic-spikes', 'toxic-stage'],
	stealthrock: ['rock', 'debris', 'floating-rocks'],
	stickyweb: ['web', 'threads', 'sticky-web'],
	defog: ['wind', 'clear-air'],
	sandsearstorm: ['sand', 'wind', 'heated-sand', 'sand-vortex'],
});

const ENVIRONMENT_RELATIONS: readonly [string, string, string][] = [
	['sun', 'plant', 'flores e plantas iluminadas'], ['sun', 'fire', 'chamas intensificadas'],
	['sun', 'light', 'luminosidade solar'], ['rain', 'fire', 'vapor'], ['rain', 'light', 'arco-íris'],
	['rain', 'electric', 'chuva eletrificada'], ['rain', 'water', 'volume de água ampliado'],
	['sand', 'wind', 'dança de areia'], ['sand', 'rock', 'escultura mineral'],
	['snow', 'light', 'aurora'], ['snow', 'ice', 'cristais de gelo'],
	['electric', 'metal', 'reflexos e faíscas'], ['electric', 'light', 'iluminação elétrica'],
	['grassy', 'plant', 'crescimento do jardim'], ['grassy', 'healing', 'renovação natural'],
	['psychic', 'rock', 'pedras levitando'], ['psychic', 'light', 'luzes controladas'],
	['misty', 'moon', 'luar difuso'], ['misty', 'fairy', 'atmosfera encantada'],
	['water', 'ice', 'água congelada'], ['water', 'light', 'reflexo sobre a água'],
	['smoke', 'light', 'feixe atravessando a fumaça'], ['debris', 'psychic', 'detritos levitando'],
	['leaf', 'wind', 'redemoinho de folhas'], ['frozen-stage', 'fire', 'gelo convertido em vapor'],
	['spikes', 'psychic', 'espinhos metálicos levitando'], ['toxic-stage', 'light', 'brilho sobre o veneno'],
	['floating-rocks', 'wind', 'rochas girando pelo palco'], ['web', 'wind', 'teias suspensas no ar'],
	['heated-sand', 'fire', 'areia incandescente'], ['clear-air', 'light', 'palco iluminado com nitidez'],
];

function normalizedTags(values: Iterable<string>): string[] {
	return [...new Set([...values].map(value => toID(value)).filter(Boolean))];
}

function environmentTags(state: RPGContestStageState): Set<string> {
	return new Set(normalizedTags([
		...state.base.tags, ...state.temporary.tags,
		state.temporary.weather || state.base.weather,
		state.temporary.terrain || state.base.terrain,
	]));
}

export function createRPGContestStage(scenario: RPGContestScenario): RPGContestStageState {
	return {
		base: {
			weather: scenario.weather || '', terrain: scenario.terrain || '', tags: normalizedTags(scenario.tags || []),
		},
		temporary: { weather: '', terrain: '', tags: [] },
	};
}

/** A new participant/round retains the venue base and discards every Player-created effect. */
export function resetRPGContestTemporaryStage(state: RPGContestStageState): RPGContestStageState {
	return { base: structuredClone(state.base), temporary: { weather: '', terrain: '', tags: [] } };
}

/** Applies weather acquired specifically through Mega Evolution without treating it as a performed move. */
export function applyRPGContestMegaAbilityWeather(
	state: RPGContestStageState, ability: string, previousAbility: string
): { weather: RPGContestWeather, transformation: string } | null {
	const abilityId = toID(ability);
	if (!abilityId || abilityId === toID(previousAbility)) return null;
	const weatherByAbility: Readonly<Record<string, RPGContestWeather>> = {
		drought: 'sun', drizzle: 'rain', sandstream: 'sand', snowwarning: 'snow',
	};
	const weather = weatherByAbility[abilityId];
	if (!weather) return null;
	state.temporary.weather = weather;
	state.temporary.tags = normalizedTags([...state.temporary.tags, weather]);
	return { weather, transformation: `ability-weather:${weather}` };
}

export function applyRPGContestMoveToStage(
	state: RPGContestStageState, moveId: string, scenario: RPGContestScenario
): RPGContestMoveStageResult {
	const move = getRPGContestMove(moveId);
	const stateBefore = structuredClone(state);
	const activeTags = environmentTags(stateBefore);
	const moveTags = new Set(move.tags);
	const interactions: string[] = [];
	for (const [environment, visual, description] of ENVIRONMENT_RELATIONS) {
		if (activeTags.has(toID(environment)) && moveTags.has(toID(visual))) interactions.push(description);
	}
	const directMatches = [...moveTags].filter(tag => activeTags.has(tag) &&
		!['fieldchange', 'weather', 'terrain', 'status', 'normal'].includes(tag));
	const interactionScore = Math.min(5, interactions.length * 2 + Math.min(2, directMatches.length));
	const scenarioTags = new Set(normalizedTags(scenario.tags || []));
	const scenarioScore = [...moveTags].some(tag => scenarioTags.has(tag)) ? 1 : 0;
	const transformations: string[] = [];
	const weather = WEATHER_MOVES[move.moveId];
	if (weather) {
		state.temporary.weather = weather;
		state.temporary.tags = normalizedTags([...state.temporary.tags, weather]);
		transformations.push(`weather:${weather}`);
	}
	const terrain = TERRAIN_MOVES[move.moveId];
	if (terrain) {
		state.temporary.terrain = terrain;
		state.temporary.tags = normalizedTags([...state.temporary.tags, terrain]);
		transformations.push(`terrain:${terrain}`);
	}
	if (move.moveId === 'defog') {
		state.temporary.weather = '';
		state.temporary.terrain = '';
		state.temporary.tags = [];
		transformations.push('field:cleared-stage');
	}
	for (const tag of FIELD_TAGS[move.moveId] || []) {
		state.temporary.tags = normalizedTags([...state.temporary.tags, tag]);
		transformations.push(`field:${toID(tag)}`);
	}
	return {
		moveId: move.moveId, stateBefore, stateAfter: structuredClone(state), interactionScore, scenarioScore,
		interactions: [...new Set(interactions)], transformations: [...new Set(transformations)],
	};
}

export function summarizeRPGContestRoundStage(
	moves: RPGContestMoveStageResult[], finalState: RPGContestStageState
): RPGContestRoundStageResult {
	return {
		moves: structuredClone(moves),
		fieldInteractionScore: Math.min(5, moves.reduce((total, move) => total + move.interactionScore, 0)),
		scenarioMoveScore: Math.min(3, moves.reduce((total, move) => total + move.scenarioScore, 0)),
		finalState: structuredClone(finalState),
	};
}
