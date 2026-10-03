'use strict';

const assert = require('assert').strict;
const {
	createRPGPendingTrainerSheet, rpgTrainerTakeDamage, rpgTrainerHeal,
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
