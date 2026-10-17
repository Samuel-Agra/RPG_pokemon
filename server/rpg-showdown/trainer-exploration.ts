/** Exposição e acampamento afetam a ficha humana, nunca o estado de combate Pokémon. */
import { rollRPGTrainerResistance, rollRPGTrainerSkillCheck, rpgTrainerProficiency } from './trainer-checks';
import { rpgTrainerAddExhaustion, rpgTrainerTakeDamage } from './trainer-survival';
import type { RPGTrainerSheet } from './trainer-sheet';

export type RPGHazardKind = 'heat' | 'cold' | 'storm' | 'smoke' | 'dust' | 'fire' | 'unstable-ground';
export type RPGHazardIntensity = 'common' | 'severe' | 'extreme';
export interface RPGExposure {
	kind: RPGHazardKind; intensity: RPGHazardIntensity; consecutiveTests: number;
	adequateProtection?: boolean; wetClothing?: boolean; withoutWater?: boolean;
	preparedHours?: number;
}
function die(sides: number, random: () => number): number {
	const value = random();
	if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Fonte aleatória inválida');
	return Math.floor(value * sides) + 1;
}
function count(value: number): number {
	if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error('Contagem inválida');
	return value;
}
function talent(sheet: RPGTrainerSheet, id: string): boolean {
	return sheet.talents.general.includes(id) || sheet.talents.class.includes(id) || sheet.talents.apex === id;
}

/** A proteção apropriada evita exposição comum e pode adiar, mas não apagar, perigo extremo. */
export function resolveRPGExposure(sheet: RPGTrainerSheet, exposure: RPGExposure,
	random: () => number = Math.random) {
	if (!['heat', 'cold', 'storm', 'smoke', 'dust', 'fire', 'unstable-ground'].includes(exposure.kind) ||
		!['common', 'severe', 'extreme'].includes(exposure.intensity)) throw new Error('Perigo inválido');
	count(exposure.consecutiveTests);
	if (exposure.intensity === 'common' && exposure.adequateProtection) {
		return { sheet, exposure, check: null, damage: 0, avoided: true };
	}
	const dc = (exposure.intensity === 'extreme' ? 20 : exposure.intensity === 'severe' ? 15 : 10) +
		exposure.consecutiveTests * 2;
	const resistance = ['heat', 'cold', 'smoke', 'dust'].includes(exposure.kind) ? 'fortitude' : 'reflexes';
	const disadvantages = (exposure.kind === 'cold' && exposure.wetClothing) ||
		(exposure.kind === 'heat' && exposure.withoutWater) ? 1 : 0;
	const advantages = exposure.adequateProtection ? 1 : 0;
	const trainedForClimate = ['heat', 'cold', 'storm'].includes(exposure.kind) &&
		talent(sheet, 'atleta:adaptacao-climatica') && (exposure.preparedHours || 0) >= 1 &&
		exposure.adequateProtection;
	const check = rollRPGTrainerResistance(sheet, resistance,
		{ dc, advantages, disadvantages, bonus: trainedForClimate ? 2 : 0 }, random);
	let next = sheet;
	let damage = 0;
	if (!check.success) {
		if (['heat', 'cold', 'storm', 'smoke', 'dust'].includes(exposure.kind)) {
			next = rpgTrainerAddExhaustion(next, exposure.intensity === 'extreme' &&
			exposure.kind === 'heat' && exposure.withoutWater ? 2 : 1);
		}
		if (exposure.intensity === 'extreme' || exposure.kind === 'fire') {
			damage = die(exposure.intensity === 'extreme' ? 6 : 4, random);
			next = rpgTrainerTakeDamage(next, damage);
		}
	}
	return { sheet: next, exposure: { ...exposure, consecutiveTests: exposure.consecutiveTests + 1 },
		check, damage, avoided: false };
}

/** Suprimentos são reservados pelo chamador; a resolução devolve consumo exato para COMMIT conjunto. */
export function resolveRPGDailyNeeds(sheet: RPGTrainerSheet, input: {
	consecutiveHungryDays: number, consecutiveThirstyDays: number,
	foodPortions: number, waterCharges: number, hotClimate?: boolean,
}, random: () => number = Math.random) {
	for (const value of [input.consecutiveHungryDays, input.consecutiveThirstyDays,
		input.foodPortions, input.waterCharges]) count(value);
	const foodUsed = Math.min(1, input.foodPortions);
	const waterUsed = Math.min(2, input.waterCharges);
	let next = sheet;
	let hungerCheck = null;
	let thirstCheck = null;
	const hungryDays = foodUsed < 1 ? input.consecutiveHungryDays + 1 : 0;
	const thirstyDays = waterUsed < 2 ? input.consecutiveThirstyDays + 1 : 0;
	if (hungryDays) {
		hungerCheck = rollRPGTrainerResistance(next, 'fortitude', { dc: 10 + (hungryDays - 1) * 2 }, random);
		if (!hungerCheck.success) next = rpgTrainerAddExhaustion(next, 1);
	}
	if (thirstyDays) {
		if (waterUsed === 0) next = rpgTrainerAddExhaustion(next, 1);
		thirstCheck = rollRPGTrainerResistance(next, 'fortitude', { dc: 15 + (thirstyDays - 1) * 2 }, random);
		if (!thirstCheck.success) next = rpgTrainerAddExhaustion(next, 1);
	}
	return { sheet: next, foodUsed, waterUsed, hungryDays, thirstyDays,
		hungerCheck, thirstCheck, nextReviewHours: input.hotClimate && thirstyDays ? 12 : 24 };
}

export function prepareRPGCamp(sheet: RPGTrainerSheet, input: {
	difficulty: 10 | 15 | 20 | 25, adequateShelter: boolean,
	foodAvailable: boolean, waterAvailable: boolean, safeLocation: boolean,
}, random: () => number = Math.random) {
	const check = rollRPGTrainerSkillCheck(sheet, 'sobrevivencia', undefined, { dc: input.difficulty }, random);
	const wellPrepared = check.success && input.adequateShelter && input.foodAvailable &&
		input.waterAvailable && input.safeLocation;
	return { check, wellPrepared, restAdequate: wellPrepared,
		advantageChoice: check.total >= input.difficulty + 5 ?
			['drenagem', 'ocultacao', 'vigia', 'protecao-comum'] : [],
		campistProtection: wellPrepared && talent(sheet, 'campista') };
}

export function watchRPGCamp(sheet: RPGTrainerSheet, dc: number,
	random: () => number = Math.random) {
	if (!Number.isSafeInteger(dc) || dc < 0 || dc > 30) throw new Error('CD de vigília inválida');
	return rollRPGTrainerSkillCheck(sheet, 'percepcao', undefined,
		{ dc, bonus: talent(sheet, 'vigia-experiente') ? 2 : 0 }, random);
}

export function forageRPGExpedition(sheet: RPGTrainerSheet, input: {
	searchHours: number, resourcesActuallyExist: boolean, foodSafe: boolean, waterSafe: boolean,
}) {
	if (!talent(sheet, 'explorador:forrageador-eficiente') ||
		!Number.isFinite(input.searchHours) || input.searchHours < 2 ||
		!input.resourcesActuallyExist || !input.foodSafe || !input.waterSafe) {
		throw new Error('Forrageio eficiente não pode ser realizado nesta situação');
	}
	return { peopleSustained: rpgTrainerProficiency(sheet.level), hoursSpent: 2,
		storedItems: 0 }; // Sustento consumido, não mercadoria infinita.
}

export function prepareRPGEmergencyShelter(sheet: RPGTrainerSheet, input: {
	hasSurvivalKit: boolean, materialsAvailable: boolean, minutesSpent: number, people: number,
}) {
	if (!talent(sheet, 'explorador:abrigo-de-emergencia') || !input.hasSurvivalKit ||
		!input.materialsAvailable || !Number.isFinite(input.minutesSpent) || input.minutesSpent < 10 ||
		!Number.isSafeInteger(input.people) || input.people < 1 || input.people > 6) {
		throw new Error('Abrigo de emergência indisponível');
	}
	return { durationHours: 6, occupants: input.people, preparationMinutes: 10,
		safeCampBenefits: true, commonWeatherProtected: true,
		severeWeatherFortitudeAdvantage: true, extremeWeatherProtected: false };
}
