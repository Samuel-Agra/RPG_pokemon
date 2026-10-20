'use strict';

const assert = require('assert').strict;
const { createRPGPendingTrainerSheet, RPGLoginService,
	RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');
const { rpgMarkManualTalentUsed, rpgManualTalentUsed, rpgManualRestTalentOptions,
	rpgRenewManualRestTalents, rpgUsedAutomaticGeneralTalents,
	rpgAutomaticGeneralTalentNames } = require('../../dist/server/rpg-showdown/trainer-manual-rest');
const { rpgTrainerRollTalents } = require('../../dist/server/rpg-showdown/trainer-roll-talents');

function sheet() {
	return {
		...createRPGPendingTrainerSheet(), status: 'complete', classId: 'arqueologo', level: 6,
		attributes: { strength: 10, dexterity: 10, constitution: 10,
			intelligence: 12, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
		talents: { class: [], apex: null,
			general: ['aprendizado-por-observacao', 'improviso-decisivo', 'sobrevivente'] },
	};
}

describe('RPG general talents marked per rest', () => {
	it('marks only owned eligible general talents and prevents duplicate use', () => {
		const used = rpgMarkManualTalentUsed(sheet(), 'aprendizado-por-observacao');
		assert.equal(rpgManualTalentUsed(used, 'aprendizado-por-observacao'), true);
		assert.throws(() => rpgMarkManualTalentUsed(used, 'aprendizado-por-observacao'));
		assert.throws(() => rpgMarkManualTalentUsed(used, 'guarda-pokemon:muralha-humana'));
		assert.throws(() => rpgMarkManualTalentUsed(used, 'sortudo'));
		assert.equal(rpgManualRestTalentOptions(used).length, 3);
		assert.equal(rpgTrainerRollTalents(used).some(talent =>
			talent.id === 'aprendizado-por-observacao'), false);
	});
	it('renews general talents after a long rest, not a short rest', () => {
		let used = rpgMarkManualTalentUsed(sheet(), 'aprendizado-por-observacao');
		used = rpgMarkManualTalentUsed(used, 'improviso-decisivo');
		used = rpgMarkManualTalentUsed(used, 'sobrevivente');
		assert.deepEqual(rpgRenewManualRestTalents(used, 'short'), []);
		assert.equal(rpgManualTalentUsed(used, 'sobrevivente'), true);
		assert.deepEqual(rpgRenewManualRestTalents(used, 'long'), [
			'Aprendizado por Observação', 'Improviso Decisivo', 'Sobrevivente',
		]);
		assert.equal(rpgManualRestTalentOptions(used).every(talent => !talent.used), true);
	});
	it('renews the Guard apex only after an explicit short or long rest', () => {
		const guard = { ...sheet(), classId: 'guarda-pokemon',
			talents: { general: [], class: [], apex: 'guarda-pokemon:muralha-humana' } };
		const used = rpgMarkManualTalentUsed(guard, 'guarda-pokemon:muralha-humana');
		assert.equal(rpgManualTalentUsed(used, 'guarda-pokemon:muralha-humana'), true);
		assert.deepEqual(rpgManualRestTalentOptions(used), [
			{ id: 'guarda-pokemon:muralha-humana', rest: 'short', used: true },
		]);
		assert.deepEqual(rpgRenewManualRestTalents(used, 'short'), ['Ápice — Muralha Humana']);
		assert.equal(rpgManualTalentUsed(used, 'guarda-pokemon:muralha-humana'), false);
	});
	it('keeps the Guard apex spent through clock advances and announces its renewal', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Guarda', playerName: 'Guarda', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('guarda');
		record.tableId = 'mesa-teste'; record.accountId = 'guarda';
		record.state.trainerSheet = { ...sheet(), classId: 'guarda-pokemon',
			talents: { general: [], class: [], apex: 'guarda-pokemon:muralha-humana' } };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'master', platformTableId: 'mesa-teste' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		const spent = repository.get('guarda');
		spent.state.trainerSheet = rpgMarkManualTalentUsed(spent.state.trainerSheet,
			'guarda-pokemon:muralha-humana');
		repository.set(spent);
		service.advanceCampaignTime('teste', 8);
		assert.equal(rpgManualTalentUsed(repository.get('guarda').state.trainerSheet,
			'guarda-pokemon:muralha-humana'), true);
		const outcome = service.applyCampaignRest('teste', 'short', 'rest-guard-1');
		assert.deepEqual(outcome.renewedTalents[0].talents, ['Ápice — Muralha Humana']);
		assert.deepEqual(repository.get('guarda').state.trainerSheet.manualTalentLastRenewal.talents,
			['Ápice — Muralha Humana']);
	});
	it('identifies used automatic general talents without counting other talents', () => {
		const ready = sheet();
		ready.talents.general.push('segundo-folego', 'sortudo', 'determinado', 'esforco-heroico');
		ready.talentUses = { 'segundo-folego': 0, sortudo: 0, determinado: 1, 'esforco-heroico': 0 };
		assert.deepEqual(rpgUsedAutomaticGeneralTalents(ready),
			['segundo-folego', 'sortudo', 'esforco-heroico']);
		assert.deepEqual(rpgAutomaticGeneralTalentNames(rpgUsedAutomaticGeneralTalents(ready)),
			['Segundo Fôlego', 'Sortudo', 'Esforço Heroico']);
	});
	it('keeps manual and automatic talent uses after campaign hours pass', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Observador', playerName: 'Observador', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('observador');
		record.tableId = 'mesa-teste'; record.accountId = 'observador';
		record.state.trainerSheet = sheet();
		record.state.trainerSheet.talents.general.push('segundo-folego');
		record.state.trainerSheet.talentUses = { 'segundo-folego': 0 };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'observador' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		service.markTrainerManualTalentUsed('teste', 'aprendizado-por-observacao');
		assert.equal(rpgManualTalentUsed(repository.get('observador').state.trainerSheet,
			'aprendizado-por-observacao'), true);
		service.advanceCampaignTime('teste', 1);
		assert.equal(rpgManualTalentUsed(repository.get('observador').state.trainerSheet,
			'aprendizado-por-observacao'), true);
		service.advanceCampaignTime('teste', 8);
		const unchanged = repository.get('observador').state.trainerSheet;
		assert.equal(rpgManualTalentUsed(unchanged, 'aprendizado-por-observacao'), true);
		assert.deepEqual(rpgUsedAutomaticGeneralTalents(unchanged), ['segundo-folego']);
		assert.equal(unchanged.manualTalentLastRenewal, undefined);
	});
	it('lists manual and automatic general talents renewed by an explicit long rest', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Treinador', playerName: 'Treinador', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('treinador');
		record.tableId = 'mesa-teste'; record.accountId = 'treinador';
		record.state.trainerSheet = rpgMarkManualTalentUsed(sheet(), 'sobrevivente');
		record.state.trainerSheet.talents.general.push('sortudo');
		record.state.trainerSheet.talentUses = { sortudo: 0 };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'master', platformTableId: 'mesa-teste' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		const outcome = service.applyCampaignRest('teste', 'long', 'rest-general-1');
		assert.deepEqual(outcome.renewedTalents[0].talents, ['Sobrevivente', 'Sortudo']);
		const renewed = repository.get('treinador').state.trainerSheet;
		assert.equal(rpgManualTalentUsed(renewed, 'sobrevivente'), false);
		assert.equal(rpgUsedAutomaticGeneralTalents(renewed).length, 0);
	});
	it('renews used Comforting Art on short and long rest, never on clock advance', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Artista', playerName: 'Artista', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('artista');
		record.tableId = 'mesa-teste'; record.accountId = 'artista';
		record.state.trainerSheet = { ...sheet(), classId: 'artista',
			talents: { general: [], class: ['artista:arte-reconfortante'], apex: null },
			comfortingArtSession: { restStartedAt: 0, recipientCharacterIds: ['artista'] } };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'master', platformTableId: 'mesa-teste' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		service.advanceCampaignTime('teste', 8);
		assert.equal(repository.get('artista').state.trainerSheet.shortRestCycle || 0, 0);
		assert.equal(repository.get('artista').state.trainerSheet.manualTalentLastRenewal, undefined);
		const short = service.applyCampaignRest('teste', 'short', 'rest-artist-1');
		assert.deepEqual(short.renewedTalents[0].talents, ['Arte Reconfortante']);
		const afterShort = repository.get('artista');
		assert.equal(afterShort.state.trainerSheet.shortRestCycle, 1);
		afterShort.state.trainerSheet.comfortingArtSession = {
			restStartedAt: 1, recipientCharacterIds: ['artista'],
		};
		repository.set(afterShort);
		const long = service.applyCampaignRest('teste', 'long', 'rest-artist-2');
		assert.deepEqual(long.renewedTalents[0].talents, ['Arte Reconfortante']);
		assert.equal(repository.get('artista').state.trainerSheet.shortRestCycle, 2);
	});
	it('lists the Cook meal and its dependent talents only after long rest', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Cozinheiro', playerName: 'Cozinheiro', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('cozinheiro');
		record.tableId = 'mesa-teste'; record.accountId = 'cozinheiro';
		record.state.trainerSheet = { ...sheet(), classId: 'cozinheiro', talentRestCycle: 1,
			talents: { general: [], class: ['cozinheiro:refeicao-reconfortante',
				'cozinheiro:nutricao-de-recuperacao'], apex: null },
			talentUses: { 'cozinheiro:refeicao-revigorante': 1 } };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'master', platformTableId: 'mesa-teste' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		service.advanceCampaignTime('teste', 8);
		assert.equal(repository.get('cozinheiro').state.trainerSheet.talentRestCycle, 1);
		const short = service.applyCampaignRest('teste', 'short', 'rest-cook-1');
		assert.equal(short.renewedTalents.length, 0);
		const long = service.applyCampaignRest('teste', 'long', 'rest-cook-2');
		assert.deepEqual(long.renewedTalents[0].talents,
			['Nutrição de Recuperação', 'Refeição Reconfortante', 'Refeição Revigorante']);
		assert.equal(repository.get('cozinheiro').state.trainerSheet.talentRestCycle, 2);
	});
});
