'use strict';

const assert = require('assert').strict;
const { createRPGPendingTrainerSheet } = require('../../dist/server/rpg-showdown');
const { rpgUseTrainerSheetTalent, rpgTrainerRerollCandidate, rpgTrainerRerollMessage,
	rpgTrainerHeroicMessage } =
	require('../../dist/server/rpg-showdown/trainer-active-talents');

function sheet() {
	return { ...createRPGPendingTrainerSheet(), status: 'complete', classId: 'cozinheiro', level: 2,
		attributes: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
		hitPoints: { current: 5, maximum: 20, temporary: 0 },
		talents: { general: ['segundo-folego'], class: [], apex: null } };
}

describe('RPG active trainer talents', () => {
	it('heals with Second Wind only once per eight-hour campaign cycle', () => {
		const first = rpgUseTrainerSheetTalent(sheet(), 'segundo-folego', () => 0);
		assert.equal(first.die, 1);
		assert.equal(first.recovered, 3);
		assert.equal(first.sheet.hitPoints.current, 8);
		assert.throws(() => rpgUseTrainerSheetTalent(first.sheet, 'segundo-folego'), /já foi usado/);
		const rested = { ...first.sheet, talentRestCycle: 1 };
		assert.equal(rpgUseTrainerSheetTalent(rested, 'segundo-folego', () => 0).recovered, 3);
	});
	it('rejects unowned talents, full HP and unconscious trainers', () => {
		assert.throws(() => rpgUseTrainerSheetTalent(sheet(), 'sortudo'), /sem ativação direta/);
		assert.throws(() => rpgUseTrainerSheetTalent({ ...sheet(), talents: { general: [], class: [], apex: null } },
			'segundo-folego'), /não possui/);
		assert.throws(() => rpgUseTrainerSheetTalent({ ...sheet(), hitPoints: { current: 20,
			maximum: 20, temporary: 0 } }, 'segundo-folego'), /completos/);
		assert.throws(() => rpgUseTrainerSheetTalent({ ...sheet(), hitPoints: { current: 0,
			maximum: 20, temporary: 0 } }, 'segundo-folego'), /consciente/);
	});
	it('accepts only the last eligible roll owned by the account before campaign time advances', () => {
		const roll = { messageId: 'roll-1', authorAccountId: 'account-1', message: 'Fortitude: 1d20 tirou 4 + 2 = 6',
			label: 'Fortitude', bonusTerms: '+ 2',
			kind: 'resistance', mode: 'normal', diceCount: 1, bonus: 2,
			campaignTime: '2026-01-01T00:00:00.000Z', createdAt: 100 };
		const trained = { ...sheet(), lastChatRolls: { any: roll, resistance: roll } };
		assert.equal(rpgTrainerRerollCandidate(trained, 'sortudo', 'account-1', roll.campaignTime, 101), roll);
		assert.equal(rpgTrainerRerollCandidate(trained, 'determinado', 'account-1', roll.campaignTime, 101), roll);
		assert.equal(rpgTrainerRerollCandidate(trained, 'sortudo', 'account-2', roll.campaignTime, 101), null);
		assert.equal(rpgTrainerRerollCandidate(trained, 'sortudo', 'account-1',
			'2026-01-01T01:00:00.000Z', 101), null);
		assert.equal(rpgTrainerRerollCandidate(trained, 'sortudo', 'account-1', roll.campaignTime,
			100 + 48 * 60 * 60 * 1000), null);
		assert.equal(rpgTrainerRerollCandidate({ ...trained, lastChatRolls: { any: { ...roll, rerolled: true } } },
			'sortudo', 'account-1', roll.campaignTime, 101), null);
	});
	it('keeps the original roll and shows the accepted second result after a separator', () => {
		const roll = { mode: 'advantage', diceCount: 2, bonus: 3, label: 'Vontade', bonusTerms: '+ 3' };
		const sequence = [0, 0.5];
		const result = rpgTrainerRerollMessage('Vontade: 1d20 tirou 4 + 3 = 7', roll,
			'sortudo', () => sequence.shift());
		assert.deepEqual(result.dice, [1, 11]);
		assert.equal(result.total, 14);
		assert(result.message.includes('Vontade: 1d20 tirou 4 + 3 = 7\n---\nSortudo\nVantagem\n'));
		assert(result.message.endsWith('Vontade: 1d20 tirou 11 + 3 = 14'));
	});
	it('keeps Academic Memory automatic on a rerolled Archaeology check', () => {
		const roll = { mode: 'normal', diceCount: 1, bonus: 4, label: 'Conhecimento — Arqueologia e Fósseis',
			bonusTerms: '+ 4', naturalFloor: 8 };
		const result = rpgTrainerRerollMessage('teste original', roll, 'sortudo', () => 0.1);
		assert.equal(result.natural, 3);
		assert.equal(result.total, 12);
		assert.match(result.message, /Memória Acadêmica: 3 no dado vale 8/);
		assert.match(result.message, /1d20 tirou 8 \+ 4 = 12/);
	});
	it('keeps Voice of Ages minimum on a rerolled inscription check', () => {
		const roll = { mode: 'normal', diceCount: 1, bonus: 4, label: 'Conhecimento — História',
			bonusTerms: '+ 4', naturalFloor: 10 };
		const result = rpgTrainerRerollMessage('teste original', roll, 'sortudo', () => 0.1);
		assert.equal(result.natural, 3);
		assert.equal(result.total, 14);
		assert.match(result.message, /Voz das Eras: 3 no dado vale 10/);
	});
	it('converts only the latest eligible skill failure without rolling another die', () => {
		const skill = { messageId: 'skill-1', authorAccountId: 'account-1',
			message: 'Atuação: 1d20 tirou 4 + 2 = 6', label: 'Atuação', bonusTerms: '+ 2',
			kind: 'skill', mode: 'normal', diceCount: 1, bonus: 2,
			campaignTime: '2026-01-01T00:00:00.000Z', createdAt: 100 };
		const other = { ...skill, messageId: 'resistance-1', kind: 'resistance' };
		const trained = { ...sheet(), lastChatRolls: { any: other, resistance: other, skill } };
		assert.equal(rpgTrainerRerollCandidate(trained, 'esforco-heroico', 'account-1',
			skill.campaignTime, 101), skill);
		assert.equal(rpgTrainerRerollCandidate(trained, 'esforco-heroico', 'account-2',
			skill.campaignTime, 101), null);
		assert.equal(rpgTrainerRerollCandidate(trained, 'esforco-heroico', 'account-1',
			'2026-01-01T01:00:00.000Z', 101), null);
		assert.equal(rpgTrainerRerollCandidate({ ...trained,
			lastChatRolls: { ...trained.lastChatRolls, skill: { ...skill, rerolled: true } } },
		'esforco-heroico', 'account-1', skill.campaignTime, 101), null);
		assert.equal(rpgTrainerHeroicMessage(skill.message, 2),
			`${skill.message}\n---\nEsforço Heroico\nFalha convertida em sucesso.\nExaustão: 2`);
	});
});
