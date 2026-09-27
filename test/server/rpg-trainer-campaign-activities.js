'use strict';

const assert = require('assert').strict;
const {
	createRPGPendingTrainerSheet, createRPGTravelState, rpgTravelSpeed, advanceRPGTravel,
	navigateRPGTravel, resolveRPGForcedMarch, resolveRPGExposure, resolveRPGDailyNeeds,
	prepareRPGCamp, watchRPGCamp, resolveRPGSocialScene, assessRPGPokemonCooperation,
	useRPGPokemonMoveOutsideBattle, approachRPGWildPokemon, forageRPGExpedition,
	prepareRPGEmergencyShelter, planRPGCraft, createRPGWorkOrder, completeRPGWorkOrder,
} = require('../../dist/server/rpg-showdown');

function trainer(classId = 'explorador') {
	return { ...createRPGPendingTrainerSheet(), status: 'complete', classId, level: 5,
		attributes: { strength: 12, dexterity: 12, constitution: 12, intelligence: 12, wisdom: 14, charisma: 12 },
		hitPoints: { current: 25, maximum: 25, temporary: 0 },
		skills: { trained: ['sobrevivencia', 'percepcao', 'oficio:culinaria', 'conhecimento:quimica'], focused: [] } };
}
const leg = { destination: { q: 1, r: 0 }, mode: 'foot', route: 'road', weather: 'normal', pace: 'normal' };

describe('RPG trainer campaign activities', () => {
	it('crosses adjacent 6 km hexes with partial progress and continuous vehicle energy', () => {
		const state = createRPGTravelState({ q: 0, r: 0 });
		let result = advanceRPGTravel(state, trainer(), leg, 1);
		assert.equal(result.arrived, false);
		assert.equal(result.state.progressKm, 4);
		result = advanceRPGTravel(result.state, trainer(), leg, 1);
		assert.equal(result.arrived, true);
		assert.equal(result.hours, 0.5);
		assert.deepEqual(result.state.hex, { q: 1, r: 0 });
		assert.throws(() => advanceRPGTravel(state, trainer(), { ...leg, destination: { q: 2, r: 0 } }, 1), /adjacente/);
		result = advanceRPGTravel(state, trainer(), { ...leg, mode: 'motorcycle' }, 0.1);
		assert.equal(result.energyRequired, 0.1);
	});

	it('applies real weather, terrain, cart, mount and talent limits', () => {
		assert.equal(rpgTravelSpeed(trainer(), { ...leg, route: 'difficult' }), 2);
		assert.equal(rpgTravelSpeed(trainer(), { ...leg, route: 'difficult', weather: 'adverse',
			independentWeatherHazard: false }), 2);
		assert.equal(rpgTravelSpeed(trainer(), { ...leg, route: 'difficult', weather: 'adverse' }), 1.5);
		assert.throws(() => rpgTravelSpeed(trainer(), { ...leg, route: 'blocked' }), /sem passagem/);
		assert.throws(() => rpgTravelSpeed(trainer(), { ...leg, mode: 'pokemon-mount' }), /aprovado/);
		assert.ok(Math.abs(rpgTravelSpeed(trainer(), { ...leg, mode: 'pokemon-cart', mountSuitable: true,
			cartLoadRatio: 0.6 }) - 5 * 2 / 3) < 1e-9);
		const explorer = trainer(); explorer.talents.general.push('abridor-de-caminhos');
		assert.equal(rpgTravelSpeed(explorer, { ...leg, route: 'difficult', navigationSucceeded: true }), 3);
	});

	it('resolves navigation only when needed and prolonged march on the human sheet', () => {
		assert.equal(navigateRPGTravel(trainer(), 15, 'sobrevivencia', () => 0).result, 'detour');
		const result = resolveRPGForcedMarch(trainer(), 8, 9, () => 0);
		assert.equal(result.saves.length, 1);
		assert.equal(result.sheet.survival.exhaustion, 1);
	});

	it('applies weather exposure and daily food/water without changing Pokémon', () => {
		const sheet = trainer();
		const exposure = resolveRPGExposure(sheet, { kind: 'heat', intensity: 'extreme',
			consecutiveTests: 0, withoutWater: true }, () => 0);
		assert.equal(exposure.sheet.survival.exhaustion, 2);
		assert.equal(exposure.damage, 1);
		assert.equal(sheet.hitPoints.current, 25);
		const needs = resolveRPGDailyNeeds(sheet, { consecutiveHungryDays: 0,
			consecutiveThirstyDays: 0, foodPortions: 1, waterCharges: 0 }, () => 0);
		assert.equal(needs.foodUsed, 1);
		assert.equal(needs.sheet.survival.exhaustion, 2);
	});

	it('requires a safe prepared camp and applies watch talents only to the human roll', () => {
		const sheet = trainer(); sheet.talents.general.push('vigia-experiente');
		const camp = prepareRPGCamp(sheet, { difficulty: 10, adequateShelter: true,
			foodAvailable: true, waterAvailable: true, safeLocation: true }, () => 0.99);
		assert.equal(camp.restAdequate, true);
		assert.equal(watchRPGCamp(sheet, 20, () => 0.5).total, 18);
	});

	it('keeps social agency with the player and rolls only genuinely uncertain scenes', () => {
		const sheet = trainer();
		assert.equal(resolveRPGSocialScene(sheet, { approach: 'persuasao', plausible: true,
			uncertain: true, targetIsPlayer: true }).result, 'player-choice');
		assert.equal(resolveRPGSocialScene(sheet, { approach: 'persuasao', plausible: true,
			uncertain: false }).result, 'narrated');
		assert.equal(resolveRPGSocialScene(sheet, { approach: 'persuasao', plausible: false,
			uncertain: true }).result, 'impossible');
		assert.equal(resolveRPGSocialScene(sheet, { approach: 'persuasao', plausible: true,
			uncertain: true, dc: 10 }, () => 0.99).result, 'favorable');
		const charmer = trainer('encantador');
		charmer.talents.class.push('encantador:sem-ressentimentos');
		const rolls = [0, 0.99];
		const reformulated = resolveRPGSocialScene(charmer, { approach: 'persuasao', plausible: true,
			uncertain: true, dc: 15, reformulateAfterFailure: true }, () => rolls.shift());
		assert.equal(reformulated.reformulationUsed, true);
		assert.equal(reformulated.result, 'favorable');
	});

	it('requires available cooperating Pokémon and spends PP only for approved off-battle moves', () => {
		assert.equal(assessRPGPokemonCooperation({ available: true, willing: false,
			understands: true, anatomySuitable: true, physicallyCapable: true, safe: true }).possible, false);
		const pokemon = { pp: [3] };
		const result = useRPGPokemonMoveOutsideBattle(pokemon, ['flash'], 'flash', 'Iluminar a trilha',
			{ available: true, effectApproved: true });
		assert.deepEqual(result.pokemon.pp, [2]);
		assert.deepEqual(pokemon.pp, [3]);
		assert.throws(() => useRPGPokemonMoveOutsideBattle(pokemon, ['flash'], 'flash', 'Iluminar',
			{ inBattle: true, effectApproved: true }), /simulador/);
		const empath = trainer(); empath.talents.general.push('afinidade-pokemon');
		assert.equal(approachRPGWildPokemon(empath, { nonHostile: true,
			alreadyConfronted: false, dc: 10 }, () => 0.5).circumstance, 2);
	});

	it('applies class foraging and shelter without minting inventory or ignoring extreme weather', () => {
		const explorer = trainer();
		explorer.talents.class.push('explorador:forrageador-eficiente', 'explorador:abrigo-de-emergencia');
		assert.equal(forageRPGExpedition(explorer, { searchHours: 2, resourcesActuallyExist: true,
			foodSafe: true, waterSafe: true }).peopleSustained, 3);
		assert.equal(prepareRPGEmergencyShelter(explorer, { hasSurvivalKit: true,
			materialsAvailable: true, minutesSpent: 10, people: 6 }).extremeWeatherProtected, false);
	});

	it('plans only known recipes with kits, charges, ingredients and elapsed time', () => {
		const sheet = trainer('cozinheiro');
		sheet.talents.class.push('cozinheiro:racao-artesanal-pokemon');
		sheet.proficiencies = ['kit-culinaria'];
		const inventory = { version: 1, revision: 0, licenses: [], items: [
			{ id: 'kit1', itemId: 'kit-culinaria-1', quantity: 1, equipped: false, location: 'bag' },
			{ id: 'food1', itemId: 'alimento', quantity: 3, equipped: false, location: 'bag' },
		] };
		const plan = planRPGCraft(sheet, inventory, 'culinary:pokemon-ration',
			{ startedAt: 0, campaignTime: 3600000, random: () => 0.99 });
		assert.deepEqual(plan.produced, { itemId: 'racao-pokemon', quantity: 4, kind: 'equipment' });
		assert.deepEqual(plan.inputsConsumed, { alimento: 3 });
		assert.throws(() => planRPGCraft(sheet, inventory, 'culinary:pokemon-ration',
			{ startedAt: 0, campaignTime: 1800000 }), /Tempo/);
	});

	it('pays work orders only once after actual campaign time and Master approval', () => {
		const order = createRPGWorkOrder({ id: 'job1', characterId: 'ana', client: 'Museu',
			objective: 'Catalogar fóssil', startedAt: 0, dueAt: 86400000,
			minimumHours: 4, payment: 500, materialCost: 100 });
		assert.throws(() => completeRPGWorkOrder(order, 14400000, 4, false), /aprovada/);
		const result = completeRPGWorkOrder(order, 14400000, 4, true);
		assert.equal(result.netIncome, 400);
		assert.throws(() => completeRPGWorkOrder(result.order, 14400000, 4, true), /já concluída/);
	});
});
