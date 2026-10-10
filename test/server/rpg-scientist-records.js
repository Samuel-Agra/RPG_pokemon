'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const { RPG_SCIENTIST_RECORDS, rpgScientistRecordFormulas, rpgScientistRecordLimit,
	rpgScientistRecordProduction,
	rpgSetScientistRecord } = require('../../dist/server/rpg-showdown/trainer-scientist-records');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');

function scientist() {
	return {
		version: 1, status: 'complete', classId: 'cientista', level: 1,
		talents: { class: [], general: [], apex: null },
	};
}

describe('RPG Scientist reproducible records', () => {
	it('applies the apex discount only to the producing Scientist, without stacking reagent economy', () => {
		const sheet = scientist();
		sheet.talents.class.push('cientista:registro-avancado', 'cientista:economia-de-reagentes');
		assert.equal(rpgScientistRecordProduction('neutralizador-direcionado', sheet, true).charges, 2);
		assert.equal(rpgScientistRecordProduction('neutralizador-direcionado', sheet, false).charges, 3);
		sheet.talents.apex = 'cientista:biblioteca-de-procedimentos';
		assert.equal(rpgScientistRecordLimit(sheet), 5);
		assert.equal(rpgScientistRecordProduction('neutralizador-direcionado', sheet, true).charges, 2);
		assert.equal(rpgScientistRecordProduction('aerossol-de-contraste', sheet, true).charges, 1);
		assert.equal(rpgScientistRecordProduction('luminescencia-quimica', sheet, true).charges, 1);
		assert.equal(rpgScientistRecordProduction('neutralizador-direcionado', sheet, true).minimumKitTier, 2);
	});
	it('lists eight initial formulas and unlocks advanced formulas only with the class talent', () => {
		const sheet = scientist();
		assert.equal(RPG_SCIENTIST_RECORDS.length, 16);
		assert.equal(rpgScientistRecordFormulas(sheet).length, 8);
		assert.equal(rpgScientistRecordLimit(sheet), 1);
		sheet.talents.class.push('cientista:registro-avancado');
		assert.equal(rpgScientistRecordFormulas(sheet).length, 16);
	});

	it('replaces the active record instead of giving the recipient a permanent duplicate', () => {
		const sheet = scientist();
		const first = rpgSetScientistRecord(sheet, 0,
			{ formulaId: 'luminescencia-quimica', recipientCharacterId: 'cientista' });
		const replaced = rpgSetScientistRecord(first, 0,
			{ formulaId: 'sinalizador-cromatico', recipientCharacterId: 'aliado' });
		assert.equal(sheet.scientistRecords, undefined);
		assert.deepEqual(replaced.scientistRecords, [{ slot: 0, formulaId: 'sinalizador-cromatico',
			recipientCharacterId: 'aliado' }]);
		assert.deepEqual(rpgSetScientistRecord(replaced, 0, null).scientistRecords, []);
	});

	it('keeps parallel records in separate slots and unlocks every advanced formula', () => {
		const sheet = scientist();
		sheet.level = 5;
		sheet.talents.class.push('cientista:registros-paralelos');
		assert.equal(rpgScientistRecordLimit(sheet), 2);
		let active = rpgSetScientistRecord(sheet, 0,
			{ formulaId: 'luminescencia-quimica', recipientCharacterId: 'cientista' });
		active = rpgSetScientistRecord(active, 1,
			{ formulaId: 'selante-expansivo', recipientCharacterId: 'aliado' });
		assert.deepEqual(active.scientistRecords.map(record => record.formulaId),
			['luminescencia-quimica', 'selante-expansivo']);
		assert.equal(rpgScientistRecordFormulas(active).filter(formula => formula.advanced).length, 0);
		active.talents.class.push('cientista:registro-avancado');
		const advanced = rpgScientistRecordFormulas(active).filter(formula => formula.advanced);
		assert.equal(advanced.length, 8);
		active = rpgSetScientistRecord(active, 1,
			{ formulaId: advanced[0].id, recipientCharacterId: 'aliado' });
		assert.equal(active.scientistRecords[0].formulaId, 'luminescencia-quimica');
		assert.equal(active.scientistRecords[1].formulaId, advanced[0].id);
		active.talents.class.push('cientista:registros-paralelos');
		assert.equal(rpgScientistRecordLimit(active), 3);
		active = rpgSetScientistRecord(active, 2,
			{ formulaId: advanced[7].id, recipientCharacterId: 'cientista' });
		assert.equal(active.scientistRecords.length, 3);
	});

	it('enforces formula eligibility, slot limits and the apex cap on advanced records', () => {
		const sheet = scientist();
		assert.throws(() => rpgSetScientistRecord(sheet, 1, null), /Espaço de registro/);
		assert.throws(() => rpgSetScientistRecord(sheet, 0,
			{ formulaId: 'neutralizador-direcionado', recipientCharacterId: 'cientista' }), /indisponível/);
		sheet.talents.class.push('cientista:registro-avancado', 'cientista:registros-paralelos');
		assert.equal(rpgScientistRecordLimit(sheet), 2);
		sheet.talents.apex = 'cientista:biblioteca-de-procedimentos';
		let active = rpgSetScientistRecord(sheet, 0,
			{ formulaId: 'neutralizador-direcionado', recipientCharacterId: 'cientista' });
		active = rpgSetScientistRecord(active, 1,
			{ formulaId: 'adesivo-estrutural', recipientCharacterId: 'aliado' });
		assert.throws(() => rpgSetScientistRecord(active, 2,
			{ formulaId: 'marcador-rastreavel', recipientCharacterId: 'cientista' }), /até dois/);
	});

	it('does not charge for writing a record, charges on Bag use, and preserves old timed preparations', () => {
		const service = new RPGLoginService({ masterCode: 'local-test',
			repository: new RPGMemoryCharacterRepository() });
		service.createCharacter({ characterName: 'Cientista', playerName: 'Pessoa', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const login = service.loginPlayer('cientista', 'senha-rpg');
		service.chooseTrainerAttributeMethod(login.token, 'standard');
		service.completeTrainerCreation(login.token, { classId: 'cientista',
			attributes: { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 8 },
			fixedKnowledge: 'conhecimento:quimica',
			optionalSkills: ['percepcao', 'investigacao', 'tecnologia', 'natureza', 'medicina'], gearChoices: {} });
		const record = service.repository.get('cientista');
		record.tableId = 'mesa-cientista';
		record.accountId = 'account-cientista';
		record.state.trainerSheet.level = 10;
		record.state.trainerSheet.talents.class.push('cientista:registro-avancado',
			'cientista:registros-paralelos', 'cientista:registros-paralelos', 'cientista:economia-de-reagentes');
		record.state.trainerSheet.talents.apex = 'cientista:biblioteca-de-procedimentos';
		record.state.trainerSheet.scientistRecords = [{ slot: 0, formulaId: 'neutralizador-direcionado',
			recipientCharacterId: 'cientista' }];
		const kit = record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1');
		kit.itemId = 'kit-cientifico-2';
		kit.charges = 2;
		service.repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-cientista',
			characterId: 'cientista' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.setTrainerScientistRecord('token', 0,
			{ formulaId: 'neutralizador-direcionado', recipientCharacterId: 'cientista' });
		assert.equal(service.repository.get('cientista').state.trainerInventory.items.find(item =>
			item.id === kit.id).charges, 2);
		const use = { characterId: 'cientista', requestId: 'registro_usar_01',
			action: { type: 'record-use', sourceCharacterId: 'cientista', slot: 0 } };
		assert.equal(service.applyTrainerActivity('token', use).result.chargesConsumed, 2);
		assert.equal(service.repository.get('cientista').state.trainerInventory.items.find(item =>
			item.id === kit.id).charges, 0);
		assert.equal(service.repository.get('cientista').state.trainerSheet.scientistRecords[0].formulaId,
			'neutralizador-direcionado');
		assert.equal(service.applyTrainerActivity('token', use).repeated, true);
		assert.throws(() => service.applyTrainerActivity('token', { ...use, requestId: 'registro_usar_02' }),
			/Este registro exige 2 carga\(s\) em um mesmo Kit Científico/);
		const replenished = service.repository.get('cientista');
		replenished.state.trainerInventory.items.find(item => item.id === kit.id).charges = 2;
		service.repository.set(replenished);
		const start = { characterId: 'cientista', requestId: 'registro_inicio_01',
			action: { type: 'record-start', sourceCharacterId: 'cientista', slot: 0 } };
		assert.equal(service.applyTrainerActivity('token', start).result.charges, 2);
		const complete = { characterId: 'cientista', requestId: 'registro_final_01',
			action: { type: 'record-complete', craftId: start.requestId } };
		assert.throws(() => service.applyTrainerActivity('token', complete), /tempo necessário/);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			30 * 60_000).toISOString();
		assert.equal(service.applyTrainerActivity('token', complete).result.chargesConsumed, 2);
		assert.equal(service.repository.get('cientista').state.trainerInventory.items.find(item =>
			item.id === kit.id).charges, 0);
		assert.equal(service.applyTrainerActivity('token', complete).repeated, true);
		assert.equal(service.repository.get('cientista').state.trainerInventory.items.find(item =>
			item.id === kit.id).charges, 0);
	});

	it('explains missing kit, insufficient tier and insufficient charges without masking them as internal errors', () => {
		const service = new RPGLoginService({ masterCode: 'local-test',
			repository: new RPGMemoryCharacterRepository() });
		const inventory = { items: [] };
		assert.throws(() => service.scientificKitForRecord(inventory, 2, 3),
			/Você precisa de um Kit Científico na Bag/);
		inventory.items.push({ itemId: 'kit-cientifico-1', location: 'bag', charges: 5 });
		assert.throws(() => service.scientificKitForRecord(inventory, 2, 3),
			/exige um Kit Científico de nível 2 ou superior/);
		inventory.items[0].itemId = 'kit-cientifico-2';
		inventory.items[0].charges = 2;
		assert.throws(() => service.scientificKitForRecord(inventory, 2, 3),
			/exige 3 carga\(s\) em um mesmo Kit Científico/);
		inventory.items[0].charges = 3;
		assert.equal(service.scientificKitForRecord(inventory, 2, 3), inventory.items[0]);
		const handler = Object.create(RPGHttpServer.prototype);
		for (const message of [
			'Você precisa de um Kit Científico na Bag para usar este registro',
			'Este registro exige um Kit Científico de nível 2 ou superior na Bag',
			'Este registro exige 3 carga(s) em um mesmo Kit Científico; nenhum kit adequado possui cargas suficientes',
		]) assert.equal(handler.isPublicValidationError(message), true);
		assert.equal(handler.isPublicValidationError('RPG repository persisted error'), false);
	});

	it('gives a weightless Bag record only to an active recipient of the same table', () => {
		const service = new RPGLoginService({ masterCode: 'local-test',
			repository: new RPGMemoryCharacterRepository() });
		for (const [id, tableId] of [['scientist', 'table-a'], ['friend', 'table-a'], ['outsider', 'table-b']]) {
			service.repository.create({ tableId, accountId: 'account-' + id, state: {
				id, characterName: id, trainerSheet: id === 'scientist' ? scientist() : null, updatedAt: 0,
			} });
		}
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'table-a',
			characterId: 'scientist' });
		service.accounts.repository.getMembership = (tableId, accountId) => ({
			status: tableId === (accountId === 'account-outsider' ? 'table-b' : 'table-a') ? 'active' : 'removed',
		});
		assert.throws(() => service.setTrainerScientistRecord('token', 0,
			{ formulaId: 'luminescencia-quimica', recipientCharacterId: 'outsider' }), /Destinatário indisponível/);
		service.setTrainerScientistRecord('token', 0,
			{ formulaId: 'luminescencia-quimica', recipientCharacterId: 'friend' });
		service.requireBagRecord = (_token, characterId) => service.repository.get(characterId);
		service.getWorldBagItemUseLock = () => undefined;
		service.managedBagView = () => ({ context: 'world', categories: [
			{ id: 'talent-items', name: 'Itens de talentos', itemTypes: 0, quantity: 0 },
		], items: [], capacity: { used: 0, maximum: 10 } });
		service.sharedArchiveOptions = () => [];
		const bag = service.getBag('token', 'friend', { category: 'talent-items' });
		assert.equal(bag.items.length, 1);
		assert.equal(bag.items[0].name, 'Registro Reprodutível');
		assert.match(bag.items[0].description, /Luminescência Química/);
		assert.equal(bag.items[0].weightKg, 0);
		assert.equal(bag.items[0].slots, 0);
		assert.deepEqual(bag.items[0].actions, []);
		assert.equal(service.getBag('token', 'scientist', { category: 'talent-items' }).items.length, 0);
		service.setTrainerScientistRecord('token', 0,
			{ formulaId: 'selante-expansivo', recipientCharacterId: 'scientist' });
		assert.equal(service.getBag('token', 'friend', { category: 'talent-items' }).items.length, 0);
		assert.match(service.getBag('token', 'scientist', { category: 'talent-items' }).items[0].description,
			/Selante Expansivo/);
		assert.deepEqual(service.getBag('token', 'scientist', { category: 'talent-items' }).items[0].actions,
			['use-record']);
	});

	it('requires Master approval for a free advanced record and uses its approved kit and charges', () => {
		const service = new RPGLoginService({ masterCode: 'local-test',
			repository: new RPGMemoryCharacterRepository() });
		const sheet = scientist();
		sheet.talents.class.push('cientista:registro-avancado');
		service.repository.create({ tableId: 'table-a', accountId: 'account-scientist', state: {
			id: 'scientist', characterName: 'Scientist', trainerSheet: sheet, updatedAt: 0,
		} });
		service.repository.create({ tableId: 'table-a', accountId: 'account-friend', state: {
			id: 'friend', characterName: 'Friend', trainerSheet: null, updatedAt: 0,
		} });
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'table-a',
			characterId: 'scientist' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const input = { requestId: 'custom_record_01', slot: 0, recipientCharacterId: 'friend',
			name: 'Sinal próprio', description: 'Uma luz química que indica um caminho por uma hora.' };
		assert.equal(service.requestCustomScientistRecord('token', input).request.status, 'pending');
		assert.equal(service.requestCustomScientistRecord('token', input).repeated, true);
		assert.equal(service.repository.get('scientist').state.trainerSheet.scientistRecords, undefined);
		assert.throws(() => service.requestCustomScientistRecord('token',
			{ ...input, requestId: 'custom_record_02' }), /aguardando aprovação/);
		service.requireMasterRole = () => {};
		assert.throws(() => service.decideCustomScientistRecord('token', input.requestId, true, 4, 2),
			/kit ou cargas inválidos/);
		const approved = service.decideCustomScientistRecord('token', input.requestId, true, 2, 4);
		assert.equal(approved.request.status, 'accepted');
		const entry = service.repository.get('scientist').state.trainerSheet.scientistRecords[0];
		assert.equal(entry.custom.name, 'Sinal próprio');
		assert.equal(rpgScientistRecordProduction(entry.formulaId,
			service.repository.get('scientist').state.trainerSheet, false, entry.custom).charges, 4);
		assert.equal(rpgScientistRecordProduction(entry.formulaId,
			service.repository.get('scientist').state.trainerSheet, false, entry.custom).minimumKitTier, 2);
		assert.throws(() => service.decideCustomScientistRecord('token', input.requestId, true, 2, 4),
			/não está pendente/);
	});

	it('connects the talent picker, authenticated route and weightless Bag representation', () => {
		const root = path.resolve(__dirname, '../..');
		const ui = fs.readFileSync(path.join(root, 'server/static/rpg/trainer-sheet-ui.js'), 'utf8');
		const service = fs.readFileSync(path.join(root, 'server/rpg-showdown/index.ts'), 'utf8');
		const http = fs.readFileSync(path.join(root, 'server/rpg-showdown/http.ts'), 'utf8');
		assert(ui.includes("feature.name === 'Registro Reprodutível'"));
		assert(ui.includes("'/trainer/talents/scientist-record'"));
		const bagUI = fs.readFileSync(path.join(root, 'server/static/rpg/bag-ui.js'), 'utf8');
		assert(bagUI.includes("type === 'record-use'"));
		assert(bagUI.includes("type === 'record-complete'"));
		assert(service.includes("actions: canProduce ? pending ? ['finish-record', 'cancel-record'] : ['use-record']"));
		assert(ui.includes("el('div', 'trainer-sheet-record-overlay')"));
		assert(http.includes('this.login.setTrainerScientistRecord'));
		assert(service.includes("icon: './assets/item-icons/registro-reprodutivel.png'"));
		assert(fs.existsSync(path.join(root, 'server/static/rpg/assets/item-icons/registro-reprodutivel.png')));
	});
});
