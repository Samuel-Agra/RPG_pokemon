'use strict';

const assert = require('assert').strict;
const {
	createRPGPendingTrainerSheet, rpgTrainerTakeDamage, rpgTrainerHeal,
	rpgTrainerReanimate,
	rpgTrainerDeathSave, rpgTrainerStabilize, rpgTrainerAddExhaustion,
	rpgTrainerReduceExhaustion,
	rpgTrainerApplyCondition, rpgTrainerConditionTick, rpgTrainerRemoveCondition,
	rpgTrainerAddWound, rpgTrainerTreatWound, rpgTrainerRest,
	rpgTrainerStartRest,
	rpgTrainerSurvivalEffects, rpgTrainerDerivedStatistics,
	RPGLoginService, RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');

function ready() {
	return {
		...createRPGPendingTrainerSheet(), status: 'complete', classId: 'arqueologo', level: 1,
		attributes: { strength: 10, dexterity: 12, constitution: 14,
			intelligence: 12, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
	};
}

describe('RPG trainer survival', () => {
	it('rolls Athletic Recovery twice on a long rest and adds medical care separately', () => {
		const athlete = { ...ready(), classId: 'atleta', talents: {
			general: [], class: ['atleta:recuperacao-atletica'], apex: null },
		hitPoints: { current: 1, maximum: 30, temporary: 0 } };
		const started = rpgTrainerStartRest(athlete, 'long', 0);
		const natural = rpgTrainerRest(started, 'long', 28_800_000, {}, () => 0);
		assert.equal(natural.recovered, 4);
		const treated = rpgTrainerRest(started, 'long', 28_800_000,
			{ medicalCare: true, medicalCheckTotal: 15 }, () => 0);
		assert.equal(treated.recovered, 5);
		assert.equal(rpgTrainerRest(rpgTrainerStartRest({ ...athlete, talents: {
			general: [], class: [], apex: null } }, 'long', 0), 'long', 28_800_000, {}, () => 0).recovered, 3);
	});
	it('rerolls only the natural recovery die granted by Nutrition Recovery and consumes it once', () => {
		const sheet = { ...ready(), nutritionRecoveryPending: true,
			hitPoints: { current: 1, maximum: 30, temporary: 0 } };
		const rolls = [0, 0.99];
		const outcome = rpgTrainerRest(rpgTrainerStartRest(sheet, 'long', 0), 'long', 28_800_000,
			{}, () => rolls.shift());
		assert.equal(outcome.recovered, 10);
		assert.equal(outcome.sheet.nutritionRecoveryPending, undefined);
		assert.equal(sheet.nutritionRecoveryPending, true);
	});
	it('reduces one level of exhaustion for a valid Comforting Art recipient', () => {
		const exhausted = rpgTrainerAddExhaustion(ready(), 2);
		const recovered = rpgTrainerReduceExhaustion(exhausted);
		assert.equal(recovered.survival.exhaustion, 1);
		assert.equal(exhausted.survival.exhaustion, 2);
		assert.throws(() => rpgTrainerReduceExhaustion(ready()), /não possui Exaustão/);
	});
	it('keeps human HP, temporary HP, nonlethal damage and instant death separate', () => {
		const base = ready();
		base.hitPoints.temporary = 4;
		const hurt = rpgTrainerTakeDamage(base, 9);
		assert.equal(hurt.hitPoints.current, 15);
		assert.equal(hurt.hitPoints.temporary, 0);
		assert.equal(base.hitPoints.current, 20);
		const stable = rpgTrainerTakeDamage(hurt, 30, { nonlethal: true });
		assert.equal(stable.survival.lifeState, 'stable');
		assert.equal(stable.hitPoints.current, 0);
		assert.equal(rpgTrainerTakeDamage(hurt, 40).survival.lifeState, 'dead');
	});
	it('records excess damage below zero and reanimates eligible patients without changing death-save rules', () => {
		const initial = ready();
		const shallow = rpgTrainerTakeDamage(initial, 25);
		assert.equal(shallow.hitPoints.current, 0);
		assert.equal(shallow.survival.negativeHP, -5);
		assert.throws(() => rpgTrainerReanimate(shallow, 'reanimation-too-early'), /critérios/);
		const severe = rpgTrainerTakeDamage(shallow, 5);
		assert.equal(severe.survival.negativeHP, -10);
		assert.equal(severe.survival.deathSaves.failures, 1);
		const revived = rpgTrainerReanimate(severe, 'reanimation-test');
		assert.equal(revived.hitPoints.current, 0);
		assert.equal(revived.survival.negativeHP, 0);
		assert.equal(revived.survival.lifeState, 'stable');
		assert.deepEqual(revived.survival.deathSaves, { successes: 0, failures: 0 });
		assert.equal(revived.survival.wounds[0].id, 'reanimation-test');
		assert.equal(shallow.survival.negativeHP, -5);
	});

	it('resolves death saves, stabilization and waking after healing', () => {
		let sheet = rpgTrainerTakeDamage(ready(), 20);
		assert.equal(sheet.survival.lifeState, 'dying');
		sheet = rpgTrainerDeathSave(sheet, () => 0).sheet;
		assert.equal(sheet.survival.deathSaves.failures, 2);
		sheet = rpgTrainerStabilize(sheet);
		assert.equal(sheet.survival.lifeState, 'stable');
		sheet = rpgTrainerHeal(sheet, 1);
		assert.equal(sheet.survival.lifeState, 'conscious');
		assert.deepEqual(sheet.survival.deathSaves, { successes: 0, failures: 0 });
		assert.equal(rpgTrainerDeathSave(rpgTrainerTakeDamage(ready(), 20), () => 0.99).sheet.hitPoints.current, 1);
	});

	it('tracks conditions, progressive poison and exhaustion only on the trainer', () => {
		let sheet = ready();
		sheet = rpgTrainerApplyCondition(sheet, { id: 'gravemente-envenenado', source: 'veneno', dc: 15 });
		sheet = rpgTrainerApplyCondition(sheet, { id: 'envenenado', source: 'outro veneno' });
		assert.equal(sheet.survival.conditions.length, 1);
		let tick = rpgTrainerConditionTick(sheet);
		assert.equal(tick.damage, 2);
		assert.equal(tick.sheet.survival.conditions[0].progression, 1);
		tick = rpgTrainerConditionTick(tick.sheet);
		assert.equal(tick.damage, 3);
		sheet = rpgTrainerAddExhaustion(tick.sheet, 2);
		assert.equal(rpgTrainerSurvivalEffects(sheet).checkPenalty, 2);
		assert.equal(rpgTrainerDerivedStatistics(sheet).movementMeters, 6);
		sheet = rpgTrainerRemoveCondition(sheet, 'gravemente-envenenado');
		assert.equal(sheet.survival.conditions.length, 0);
		assert.equal(rpgTrainerAddExhaustion(sheet, 4).survival.lifeState, 'dead');
	});

	it('counts separate ongoing condition damage sources as separate death-save failures', () => {
		let sheet = rpgTrainerTakeDamage(ready(), 20);
		sheet = rpgTrainerApplyCondition(sheet, { id: 'queimado', source: 'chamas' });
		sheet = rpgTrainerApplyCondition(sheet, { id: 'envenenado', source: 'toxina' });
		const outcome = rpgTrainerConditionTick(sheet);
		assert.equal(outcome.damage, 5);
		assert.equal(outcome.sheet.survival.deathSaves.failures, 2);
	});

	it('limits recovery with serious wounds and uses slow rest formulas', () => {
		let sheet = rpgTrainerTakeDamage(ready(), 15);
		sheet = rpgTrainerAddWound(sheet, 'w1', 'Fratura');
		sheet = rpgTrainerStartRest(sheet, 'long', 57_600_000);
		let result = rpgTrainerRest(sheet, 'long', 86_400_000,
			{ medicalCare: true, medicalCheckTotal: 17, adequate: true }, () => 0.99);
		assert.equal(result.sheet.hitPoints.current, 10);
		assert.throws(() => rpgTrainerRest(rpgTrainerStartRest(result.sheet, 'long', 86_400_000),
			'long', 115_200_000), /24 horas/);
		sheet = rpgTrainerTreatWound(result.sheet, 'w1');
		sheet = rpgTrainerStartRest(sheet, 'specialist-long', 144_000_000);
		result = rpgTrainerRest(sheet, 'specialist-long', 172_800_000);
		assert.equal(result.sheet.hitPoints.current, 20);
	});

	it('gives short-rest recovery only with successful medical care and once per long rest', () => {
		const hurt = rpgTrainerTakeDamage(ready(), 10);
		assert.throws(() => rpgTrainerRest(hurt, 'short', 0), /1 hora/);
		const started = rpgTrainerStartRest(hurt, 'short', 0);
		assert.equal(rpgTrainerRest(started, 'short', 3_600_000).recovered, 0);
		const result = rpgTrainerRest(started, 'short', 3_600_000,
			{ medicalCare: true, medicalCheckTotal: 15, medicalProficiency: 2 }, () => 0);
		assert.equal(result.recovered, 3);
		assert.throws(() => rpgTrainerRest(rpgTrainerStartRest(result.sheet, 'short', 3_600_000), 'short', 7_200_000,
			{ medicalCare: true, medicalCheckTotal: 20, medicalProficiency: 2 }), /já foi recebido/);
		assert.throws(() => rpgTrainerRest(rpgTrainerTakeDamage(started, 1), 'short', 3_600_000), /1 hora/);
	});

	it('persists master-adjudicated changes on the trainer sheet', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'secret', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
		const record = repository.get('ana');
		record.state.trainerSheet = ready();
		repository.set(record);
		const master = service.loginMaster('secret');
		const result = service.applyTrainerSurvival(master.token, 'ana', { type: 'damage', amount: 5 });
		assert.equal(result.sheet.hitPoints.current, 15);
		assert.equal(repository.get('ana').state.trainerSheet.hitPoints.current, 15);
		assert.throws(() => service.applyTrainerSurvival(master.token, 'ana',
			{ type: 'condition-add', condition: { id: 'inválida', source: 'teste' } }), /Condição inválida/);
	});

	it('permits only the viewed Player’s PV, Exaustão and conditions in Master-as-Player mode', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'secret', repository });
		for (const name of ['Ana', 'Bia']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.state.trainerSheet = ready(); repository.set(record);
		}
		service.getSession = () => ({ role: 'master', mode: 'player', viewAsCharacterId: 'ana',
			platformTableId: 'mesa-teste' });
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'damage', amount: 4 })
			.sheet.hitPoints.current, 16);
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'heal', amount: 2 })
			.sheet.hitPoints.current, 18);
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'exhaustion', levels: 2 })
			.sheet.survival.exhaustion, 2);
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'exhaustion-reduce', levels: 1 })
			.sheet.survival.exhaustion, 1);
		assert.throws(() => service.applyTrainerSurvival('teste', 'ana',
			{ type: 'exhaustion-reduce', levels: 2 }), /Quantidade de Exaustão/);
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'condition-add',
			condition: { id: 'paralisado', source: 'Mestre' } }).sheet.survival.conditions[0].id, 'paralisado');
		assert.equal(service.applyTrainerSurvival('teste', 'ana', { type: 'condition-remove',
			conditionId: 'paralisado' }).sheet.survival.conditions.length, 0);
		assert.throws(() => service.applyTrainerSurvival('teste', 'bia', { type: 'heal', amount: 1 }),
			/currently being viewed/);
		assert.throws(() => service.applyTrainerSurvival('teste', 'ana', { type: 'death-save' }),
			/exige o modo Mestre/);
		assert.equal(repository.get('bia').state.trainerSheet.hitPoints.current, 20);
	});

	it('lets only the dying trainer roll and preserves the result on retry', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'secret', repository, random: () => 0.5 });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
		const record = repository.get('ana');
		record.state.trainerSheet = rpgTrainerTakeDamage(ready(), 20);
		repository.set(record);
		const player = service.loginPlayer('ana', 'senha-rpg');
		const master = service.loginMaster('secret');
		assert.throws(() => service.rollOwnTrainerDeathSave(master.token, 'death_save_001'), /jogador/);
		const first = service.rollOwnTrainerDeathSave(player.token, 'death_save_001');
		assert.equal(first.natural, 11);
		assert.equal(first.sheet.survival.deathSaves.successes, 1);
		assert.equal(first.repeated, false);
		const repeat = service.rollOwnTrainerDeathSave(player.token, 'death_save_001');
		assert.equal(repeat.repeated, true);
		assert.equal(repeat.sheet.survival.deathSaves.successes, 1);
		assert.throws(() => service.rollOwnTrainerDeathSave(player.token, 'invalid'), /Identificador/);
	});
});
