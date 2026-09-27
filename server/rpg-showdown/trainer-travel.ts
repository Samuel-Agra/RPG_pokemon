/** Viagem estratégica da V3. Velocidades sustentadas não derivam da Speed de Pokémon. */
import { rollRPGTrainerResistance, rollRPGTrainerSkillCheck, rpgTrainerDerivedStatistics } from './trainer-checks';
import { rpgTrainerAddExhaustion } from './trainer-survival';
import type { RPGTrainerSheet } from './trainer-sheet';

export type RPGHex = { q: number, r: number };
export type RPGTravelMode = 'foot' | 'pokemon-mount' | 'pokemon-cart' | 'human-cart' |
	'motorcycle' | 'car' | 'jeep';
export type RPGTravelRoute = 'road' | 'uneven' | 'difficult' | 'very-difficult' | 'blocked' | 'off-road';
export type RPGTravelWeather = 'normal' | 'adverse' | 'storm' | 'blocked';
export type RPGTravelPace = 'careful' | 'normal' | 'fast';
export interface RPGTravelState {
	hex: RPGHex; destination?: RPGHex; progressKm: number;
	travelHoursToday: number; elapsedHours: number; energyUsed: number;
}
export interface RPGTravelLeg {
	destination: RPGHex; mode: RPGTravelMode; route: RPGTravelRoute;
	weather: RPGTravelWeather; pace: RPGTravelPace; independentWeatherHazard?: boolean;
	/** Verificações anteriores do Mestre; nunca são inferidas da ficha do Pokémon. */
	mountSuitable?: boolean; cartLoadRatio?: number; navigationSucceeded?: boolean;
	carriedKg?: number; restHours?: number; plannedJourneyHours?: number;
}
const BASE_SPEED: Record<RPGTravelMode, number> = {
	foot: 4, 'pokemon-mount': 6, 'pokemon-cart': 5, 'human-cart': 4,
	motorcycle: 60, car: 75, jeep: 60,
};
const OFF_ROAD_SPEED: Partial<Record<RPGTravelMode, number>> = { motorcycle: 15, car: 7.5, jeep: 30 };
const ROAD_LIMIT: Partial<Record<RPGTravelMode, number>> = { motorcycle: 80, car: 100, jeep: 80 };
const OFF_ROAD_LIMIT: Partial<Record<RPGTravelMode, number>> = { motorcycle: 20, car: 10, jeep: 40 };
const TERRAIN: Record<RPGTravelRoute, number> = {
	road: 1, uneven: 0.75, difficult: 0.5, 'very-difficult': 0.25, blocked: 0, 'off-road': 1,
};
const WEATHER: Record<RPGTravelWeather, number> = { normal: 1, adverse: 0.75, storm: 0.5, blocked: 0 };
const PACE: Record<RPGTravelPace, number> = { careful: 0.75, normal: 1, fast: 1.25 };

function validHex(hex: RPGHex): void {
	if (!hex || !Number.isSafeInteger(hex.q) || !Number.isSafeInteger(hex.r) ||
		Math.abs(hex.q) > 1_000_000 || Math.abs(hex.r) > 1_000_000) throw new Error('Hexágono inválido');
}
function adjacent(a: RPGHex, b: RPGHex): boolean {
	const q = b.q - a.q; const r = b.r - a.r;
	return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 === 1;
}
function has(sheet: RPGTrainerSheet, id: string): boolean {
	return [...sheet.talents.general, ...sheet.talents.class, ...(sheet.talents.apex ? [sheet.talents.apex] : [])].includes(id);
}
export function createRPGTravelState(hex: RPGHex): RPGTravelState {
	validHex(hex);
	return { hex: { ...hex }, progressKm: 0, travelHoursToday: 0, elapsedHours: 0, energyUsed: 0 };
}

export function rpgTravelSpeed(sheet: RPGTrainerSheet, leg: RPGTravelLeg): number {
	validHex(leg.destination);
	if (!(leg.mode in BASE_SPEED) || !(leg.route in TERRAIN) || !(leg.weather in WEATHER) ||
		!(leg.pace in PACE)) throw new Error('Condição de viagem inválida');
	if (leg.route === 'blocked' || leg.weather === 'blocked') throw new Error('Rota sem passagem segura');
	const powered = leg.mode === 'motorcycle' || leg.mode === 'car' || leg.mode === 'jeep';
	if (leg.route === 'off-road' && !powered) throw new Error('Rota inválida para este meio');
	if (powered && !['road', 'off-road'].includes(leg.route)) throw new Error('Defina via ou terreno fora de estrada');
	if ((leg.mode === 'pokemon-mount' || leg.mode === 'pokemon-cart') && !leg.mountSuitable) {
		throw new Error('Pokémon não foi aprovado para montaria ou tração');
	}
	let speed = leg.route === 'off-road' ? OFF_ROAD_SPEED[leg.mode]! : BASE_SPEED[leg.mode] * TERRAIN[leg.route];
	if (leg.mode === 'foot' || leg.mode === 'human-cart') {
		const movement = rpgTrainerDerivedStatistics(sheet, { carriedKg: leg.carriedKg || 0 }).movementMeters;
		if (movement <= 0) throw new Error('Sobrecarga impede a viagem');
		speed *= Math.min(1, movement / (sheet.classId === 'atleta' ? 10.5 : 9));
	}
	if (leg.mode.endsWith('cart')) {
		if (!Number.isFinite(leg.cartLoadRatio) || leg.cartLoadRatio! < 0 || leg.cartLoadRatio! > 1) {
			throw new Error('Carga da carroça não foi verificada');
		}
		if (leg.cartLoadRatio! > 0.5) {
			if (leg.pace === 'fast') throw new Error('Carroça com carga elevada não pode viajar rápido');
			speed *= 2 / 3;
		}
	}
	// A chuva que já criou lama não penaliza novamente a visibilidade sem perigo independente.
	if (leg.independentWeatherHazard !== false) speed *= WEATHER[leg.weather];
	if (leg.route === 'difficult' && leg.navigationSucceeded && has(sheet, 'abridor-de-caminhos') &&
		!has(sheet, 'explorador:senhor-das-rotas') && !powered) {
		speed *= 1.5; // 0,5 vira 0,75.
	}
	if (leg.mode === 'foot' && has(sheet, 'atleta:ritmo-de-viagem') &&
		rpgTrainerDerivedStatistics(sheet, { carriedKg: leg.carriedKg || 0 }).encumbrance === 'normal') speed *= 1.25;
	if (!powered && (leg.plannedJourneyHours || 0) >= 4 && has(sheet, 'explorador:marcha-calculada') &&
		!has(sheet, 'explorador:senhor-das-rotas')) speed *= 1.2;
	if (['pokemon-mount', 'pokemon-cart'].includes(leg.mode) && has(sheet, 'explorador:guia-de-montaria')) speed *= 1.2;
	if (!powered && has(sheet, 'explorador:senhor-das-rotas')) {
		// Substitui a liderança de Marcha Calculada; reduz diretamente 25% do tempo.
		if (leg.route === 'difficult') speed *= 2;
		speed /= 0.75;
	}
	speed *= PACE[leg.pace];
	return Math.min(speed, (leg.route === 'off-road' ? OFF_ROAD_LIMIT : ROAD_LIMIT)[leg.mode] || Infinity);
}

/** Uma chamada percorre no máximo um hexágono e conserva o avanço parcial. */
export function advanceRPGTravel(state: RPGTravelState, sheet: RPGTrainerSheet, leg: RPGTravelLeg,
	hoursBudget: number) {
	validHex(state.hex);
	if (!adjacent(state.hex, leg.destination) || state.destination &&
		(state.destination.q !== leg.destination.q || state.destination.r !== leg.destination.r)) {
		throw new Error('O próximo hexágono deve ser adjacente ao percurso atual');
	}
	if (!Number.isFinite(hoursBudget) || hoursBudget <= 0 || hoursBudget > 24 ||
		!Number.isFinite(state.progressKm) || state.progressKm < 0 || state.progressKm >= 6 ||
		!Number.isFinite(leg.restHours || 0) || (leg.restHours || 0) < 0) {
		throw new Error('Progresso ou tempo de viagem inválido');
	}
	const speedKmPerHour = rpgTravelSpeed(sheet, leg);
	const hours = Math.min(hoursBudget, (6 - state.progressKm) / speedKmPerHour);
	const progress = state.progressKm + speedKmPerHour * hours;
	const arrived = progress >= 6 - 1e-9;
	const powered = ['motorcycle', 'car', 'jeep'].includes(leg.mode);
	const next: RPGTravelState = {
		hex: arrived ? { ...leg.destination } : { ...state.hex },
		...(arrived ? {} : { destination: { ...leg.destination } }),
		progressKm: arrived ? 0 : progress,
		travelHoursToday: state.travelHoursToday + hours,
		elapsedHours: state.elapsedHours + hours + (leg.restHours || 0),
		energyUsed: state.energyUsed + (powered ? hours : 0),
	};
	return { state: next, hours, distanceKm: speedKmPerHour * hours,
		arrived, energyRequired: powered ? next.energyUsed : 0,
		fastObservationDisadvantage: leg.pace === 'fast' };
}

export function navigateRPGTravel(sheet: RPGTrainerSheet, difficulty: 10 | 15 | 20 | 25,
	skill: 'sobrevivencia' | 'tecnologia' | `conhecimento:${string}` = 'sobrevivencia',
	random: () => number = Math.random) {
	const check = rollRPGTrainerSkillCheck(sheet, skill, undefined,
		{ dc: difficulty, bonus: has(sheet, 'orientacao-natural') ? 2 : 0 }, random);
	return { check, result: check.success ? 'route-found' : check.total <= difficulty - 10 ?
		'serious-detour' : 'detour', delayMinutes: check.success ? 0 : check.total <= difficulty - 10 ? 60 : 30 };
}

export function resolveRPGForcedMarch(sheet: RPGTrainerSheet, priorTravelHours: number,
	newTravelHours: number, random: () => number = Math.random) {
	if (![priorTravelHours, newTravelHours].every(value => Number.isFinite(value) && value >= 0 && value <= 24) ||
		newTravelHours < priorTravelHours) throw new Error('Jornada inválida');
	let next = sheet;
	const saves = [];
	for (let hour = Math.floor(priorTravelHours); hour < Math.floor(newTravelHours); hour++) {
		if (hour < 8) continue;
		const check = rollRPGTrainerResistance(next, 'fortitude', { dc: 10 + (hour - 8) * 2 }, random);
		saves.push(check);
		if (!check.success) next = rpgTrainerAddExhaustion(next, 1);
	}
	return { sheet: next, saves };
}
