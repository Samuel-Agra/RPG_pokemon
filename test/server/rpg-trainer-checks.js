'use strict';

const assert = require('assert').strict;
const {
	completeRPGTrainerSheet, createRPGPendingTrainerSheet, rpgTrainerProficiency,
	rpgTrainerSkillBonus, rpgTrainerResistanceBonus, rollRPGD20, rpgCheckDegree,
	rpgHelpBonus, rpgBestHelpBonus, rollRPGTrainerSkillCheck, rollRPGTrainerResistance,
	rpgOpposedCheck, rpgGroupCheck, rpgPassiveScore, rpgTrainerEffectDC,
	rpgPokemonEffectDC, rpgTrainerDerivedStatistics, rollRPGTrainerAttack, rollRPGTrainerDamage,
	rollRPGTrainerInitiative, rpgInitiativeOrder, rpgTrainerAttackBonus,
	rollRPGTrainerHelp,
} = require('../../dist/server/rpg-showdown');

function trainer() {
	return completeRPGTrainerSheet(createRPGPendingTrainerSheet(), {
		classId: 'arqueologo',
		attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
		optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'],
		gearChoices: { arma: 'faca' },
	}, 'standard');
}

function sequence(...values) {
	let index = 0;
	return () => (values[index++] - 1) / 20;
}

describe('RPG trainer checks engine', () => {
	it('calculates modifiers, proficiency, focus and separate skill branches', () => {
		const sheet = trainer();
		assert.deepEqual([1, 4, 5, 8, 9, 10].map(rpgTrainerProficiency), [2, 2, 3, 3, 4, 4]);
		assert.equal(rpgTrainerSkillBonus(sheet, 'percepcao'), 2);
		assert.equal(rpgTrainerSkillBonus(sheet, 'conhecimento:arqueologia-fosseis'), 3);
		assert.equal(rpgTrainerSkillBonus(sheet, 'conhecimento:pokemon'), 1);
		sheet.skills.focused.push('percepcao');
		sheet.level = 5;
		assert.equal(rpgTrainerSkillBonus(sheet, 'percepcao'), 6);
		assert.equal(rpgTrainerSkillBonus(sheet, 'pilotagem:automoveis'), 5);
		assert.throws(() => rpgTrainerSkillBonus(sheet, 'pilotagem:motocicletas'));
		assert.equal(rpgTrainerSkillBonus(sheet, 'intimidacao', 'strength'), 2);
		assert.throws(() => rpgTrainerSkillBonus(sheet, 'invalid'));
	});

	it('uses two dice only for unopposed advantage or disadvantage', () => {
		assert.deepEqual(rollRPGD20(sequence(7, 16), { advantages: 3 }),
			{ dice: [7, 16], natural: 16, mode: 'advantage' });
		assert.equal(rollRPGD20(sequence(7, 16), { disadvantages: 2 }).natural, 7);
		assert.deepEqual(rollRPGD20(sequence(7), { advantages: 3, disadvantages: 1 }).dice, [7]);
		assert.throws(() => rollRPGD20(() => 1));
	});

	it('applies help before the principal check without stacking helpers', () => {
		assert.deepEqual([9, 10, 14, 15, 20, 25, 30, 40].map(rpgHelpBonus),
			[0, 1, 1, 2, 3, 4, 5, 5]);
		assert.equal(rpgBestHelpBonus([16, 22, 12]), 3);
		const aid = rollRPGTrainerHelp(trainer(), 'percepcao', 'intelligence', sequence(20));
		assert.equal(aid.attribute, 'intelligence');
		assert.equal(aid.helpBonus, 3);
		const result = rollRPGTrainerSkillCheck(trainer(), 'percepcao', undefined,
			{ dc: 15, helpResults: [{ skill: 'percepcao', total: 16 }, aid], advantages: 1 }, sequence(7, 11));
		assert.equal(result.natural, 11);
		assert.equal(result.help, 3);
		assert.equal(result.total, 16);
		assert.equal(result.success, true);
		assert.throws(() => rollRPGTrainerSkillCheck(trainer(), 'percepcao', undefined,
			{ dc: 10, helpResults: [{ skill: 'intuicao', total: 30 }] }, sequence(10)));
		assert.equal(rpgPassiveScore(4, { advantages: 2 }), 19);
		assert.equal(rpgPassiveScore(4, { advantages: 2, disadvantages: 1 }), 14);
	});

	it('keeps natural 1/20 non-automatic on checks and resistances', () => {
		const sheet = trainer();
		assert.equal(rollRPGTrainerSkillCheck(sheet, 'percepcao', undefined,
			{ dc: 25 }, sequence(20)).success, false);
		assert.equal(rollRPGTrainerSkillCheck(sheet, 'conhecimento:arqueologia-fosseis', undefined,
			{ dc: 4 }, sequence(1)).success, true);
		assert.equal(rpgTrainerResistanceBonus(sheet, 'will'), 2);
		assert.equal(rpgTrainerResistanceBonus(sheet, 'fortitude'), 1);
		assert.equal(rollRPGTrainerResistance(sheet, 'will', { dc: 24 }, sequence(20)).success, false);
		assert.throws(() => rollRPGTrainerResistance(sheet, 'will',
			{ dc: 10, helpResults: [{ skill: 'intuicao', total: 30 }] }, sequence(20)));
		assert.equal(rpgTrainerEffectDC(sheet, 'intelligence'), 11);
		assert.equal(rpgPokemonEffectDC(100, 3), 31);
	});

	it('preserves ties, group thresholds and deterministic result margins', () => {
		assert.equal(rpgOpposedCheck(12, 12), 'unchanged');
		assert.equal(rpgOpposedCheck(13, 12), 'first');
		assert.equal(rpgGroupCheck([true, false, true, false]), true);
		assert.equal(rpgGroupCheck([true, false, false]), false);
		assert.deepEqual([25, 15, 14, 10, 5].map(total => rpgCheckDegree(total, 15)),
			['exceptional-success', 'success', 'narrow-failure', 'failure', 'severe-failure']);
	});

	it('derives only human defense, initiative, movement, perception and load', () => {
		const sheet = trainer();
		const basic = rpgTrainerDerivedStatistics(sheet);
		assert.equal(basic.defense, 12);
		assert.equal(basic.initiativeBonus, 2);
		assert.equal(basic.passivePerception, 12);
		assert.equal(basic.movementMeters, 9);
		assert.deepEqual(basic.carrying, { normalKg: 37.5, encumberedKg: 75,
			maximumKg: 112.5, pushPullLiftKg: 225 });
		assert.equal(basic.humanResistance, 12);
		const loaded = rpgTrainerDerivedStatistics(sheet,
			{ protection: 'medium', shield: true, carriedKg: 80, movementBonusMeters: 1.5 });
		assert.equal(loaded.defense, 18);
		assert.equal(loaded.movementMeters, 4.5);
		assert.equal(loaded.physicalDisadvantage, true);
		assert.equal(rpgTrainerDerivedStatistics(sheet, { carriedKg: 120 }).movementMeters, 0);
	});

	it('reserves automatic criticals for human attacks and doubles damage dice only', () => {
		assert.equal(rpgTrainerAttackBonus(trainer(), 'strength', true), 4);
		const initiative = rollRPGTrainerInitiative(trainer(), sequence(7));
		assert.equal(initiative.total, 9);
		assert.equal(rpgInitiativeOrder({ total: 12, dexterityBonus: 1 },
			{ total: 12, dexterityBonus: 2 }), 'second');
		assert.equal(rpgInitiativeOrder({ total: 12, dexterityBonus: 2 },
			{ total: 12, dexterityBonus: 2 }, () => 0.1), 'first');
		assert.equal(rollRPGTrainerAttack(-5, 50, sequence(20)).hit, true);
		assert.equal(rollRPGTrainerAttack(50, 5, sequence(1)).hit, false);
		assert.deepEqual(rollRPGTrainerDamage(1, 6, 3, true, () => 0), { dice: [1, 1], total: 5 });
	});
});
