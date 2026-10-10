'use strict';

const assert = require('node:assert/strict');
const { RPGLoginService, RPGMemoryCharacterRepository, RPGMemoryCustomItemRepository } = require('../../dist/server/rpg-showdown');
const { RPGItems, RPGBagSystem } = require('../../dist/sim/rpg-showdown');
const { getRPGItemIconPath } = require('../../dist/server/rpg-showdown/item-icons');

describe('RPG Scientist Pokémon pharmacy', () => {
	const attributes = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
	function setup() {
		const service = new RPGLoginService({ masterCode: 'segredo',
			repository: new RPGMemoryCharacterRepository() });
		service.createCharacter({ characterName: 'Cientista', playerName: 'Pessoa', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const player = service.loginPlayer('cientista', 'senha-rpg');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'cientista', attributes,
			fixedKnowledge: 'conhecimento:quimica',
			optionalSkills: ['percepcao', 'investigacao', 'tecnologia', 'natureza', 'medicina'], gearChoices: {} });
		const record = service.repository.get('cientista');
		record.tableId = 'mesa-cientista';
		record.state.trainerSheet.talents.class.push('cientista:producao-farmaceutica-pokemon');
		record.state.trainerSheet.skills.trained = record.state.trainerSheet.skills.trained
			.filter(skill => skill !== 'conhecimento:quimica');
		record.state.trainerSheet.proficiencies.push('kit-cientifico');
		record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 0;
		service.repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-cientista', characterId: 'cientista' });
		return service;
	}
	it('requires a charge and campaign time, but not a specific Knowledge or facility', () => {
		const service = setup();
		const begin = { characterId: 'cientista', requestId: 'farmacia_inicio_01',
			action: { type: 'craft-start', recipeId: 'pharmacy:potion' } };
		assert.throws(() => service.applyTrainerActivity('token', begin), /Cargas do kit insuficientes/);
		let record = service.repository.get('cientista');
		record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 1;
		service.repository.set(record);
		service.applyTrainerActivity('token', begin);
		const complete = { characterId: 'cientista', requestId: 'farmacia_final_01',
			action: { type: 'craft-complete', craftId: begin.requestId } };
		assert.throws(() => service.applyTrainerActivity('token', complete), /Tempo de fabricação insuficiente/);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			3_600_000).toISOString();
		assert.equal(service.applyTrainerActivity('token', complete).result.produced.quantity, 3);
		record = service.repository.get('cientista');
		assert.equal(record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges, 0);
		const craftedId = service.applyTrainerActivity('token', complete).result.produced.itemId;
		assert.equal(record.state.inventory.bag.items.find(item => item.itemId === craftedId).quantity, 3);
		assert.equal(RPGItems.require(craftedId).name, 'Potion de @Pessoa');
		assert.equal(getRPGItemIconPath(craftedId), getRPGItemIconPath('potion'));
		assert.equal(RPGBagSystem.getQuantity(record.state.inventory.bag, 'potion'), 0);
		assert.equal(service.applyTrainerActivity('token', complete).repeated, true);
		assert.equal(service.repository.get('cientista').state.inventory.bag.items.find(item => item.itemId === craftedId).quantity, 3);
	});
	it('registers separate player-made stacks with the same effects, price and limits', () => {
		for (const id of ['potion', 'antidote', 'awakening', 'burnheal', 'iceheal', 'paralyzeheal',
			'superpotion', 'hyperpotion', 'fullheal']) {
			const original = RPGItems.require(id);
			const crafted = RPGItems.require(`player${id}`);
			assert.equal(crafted.name, `${original.name} de player`);
			assert.deepEqual(crafted.effect, original.effect);
			assert.equal(crafted.price.buy, original.price.buy);
			assert.equal(crafted.price.sell, original.price.sell);
			assert.equal(crafted.stackLimit, original.stackLimit);
			assert.equal(crafted.usableInBattle, original.usableInBattle);
			assert.equal(getRPGItemIconPath(crafted.id), getRPGItemIconPath(original.id));
		}
		const bag = RPGBagSystem.create('cientista', [{ itemId: 'potion', quantity: 2 },
			{ itemId: 'playerpotion', quantity: 3 }]);
		assert.equal(bag.items.length, 2);
	});
	it('normalizes the sale price of player-made medicine saved before this change', () => {
		const original = RPGItems.require('superpotion');
		const id = 'playersuperpotioncreatorlegacyprice';
		const legacy = { ...original, id, name: 'Super Potion de @Pessoa', source: 'custom',
			price: { ...original.price, sell: 300 },
			effect: { ...original.effect, originalItemId: 'superpotion' }, tags: ['player-crafted'] };
		RPGItems.register(legacy);
		try {
			const repository = new RPGMemoryCustomItemRepository([legacy]);
			const service = new RPGLoginService({ masterCode: 'segredo',
				repository: new RPGMemoryCharacterRepository(), customItemRepository: repository });
			assert(service);
			assert.equal(repository.list()[0].price.sell, original.price.sell);
			assert.equal(RPGItems.require(id).price.sell, original.price.sell);
		} finally { RPGItems.unregister(id); }
	});
	it('crafts each advanced medicine with a level II kit and keeps its creator and resale cost', () => {
		for (const [id, charges, quantity] of [
			['superpotion', 2, 2], ['hyperpotion', 4, 2], ['fullheal', 2, 3],
		]) {
			const service = setup();
			const record = service.repository.get('cientista');
			record.state.trainerSheet.talents.class.push('cientista:farmacologia-avancada');
			record.state.trainerInventory.items.push({ id: `kit-${id}`, itemId: 'kit-cientifico-2',
				quantity: 1, charges, location: 'bag', equipped: false });
			service.repository.set(record);
			const startId = `farmacia_avancada_${id}_inicio`;
			service.applyTrainerActivity('token', { characterId: 'cientista', requestId: startId,
				action: { type: 'craft-start', recipeId: `pharmacy:${id}` } });
			service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
				3_600_000).toISOString();
			const result = service.applyTrainerActivity('token', { characterId: 'cientista',
				requestId: `farmacia_avancada_${id}_final`, action: { type: 'craft-complete', craftId: startId } });
			const craftedId = result.result.produced.itemId;
			assert.equal(result.result.produced.quantity, quantity);
			assert.equal(RPGItems.require(craftedId).name, `${RPGItems.require(id).name} de @Pessoa`);
			assert.equal(RPGItems.require(craftedId).price.sell, RPGItems.require(id).price.sell);
			assert.equal(service.repository.get('cientista').state.inventory.bag.items
				.find(item => item.itemId === craftedId).quantity, quantity);
		}
	});
	it('unlocks both apex formulas immediately and requires eight hours for production', () => {
		for (const [id, charges] of [['maxpotion', 6], ['fullrestore', 8]]) {
			const service = setup();
			const record = service.repository.get('cientista');
			record.state.trainerSheet.talents.apex = 'cientista:mestre-de-formulacao';
			record.state.trainerInventory.items.push({ id: `apex-kit-${id}`, itemId: 'kit-cientifico-3',
				quantity: 1, charges, location: 'bag', equipped: false });
			service.repository.set(record);
			const begin = { characterId: 'cientista', requestId: `apex_${id}_inicio`,
				action: { type: 'craft-start', recipeId: `pharmacy:${id}` } };
			service.applyTrainerActivity('token', begin);
			assert.throws(() => service.applyTrainerActivity('token', { characterId: 'cientista',
				requestId: `apex_${id}_cedo`, action: { type: 'craft-complete', craftId: begin.requestId } }),
			/Tempo de fabricação insuficiente/);
			service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
				8 * 3_600_000).toISOString();
			const result = service.applyTrainerActivity('token', { characterId: 'cientista',
				requestId: `apex_${id}_final`, action: { type: 'craft-complete', craftId: begin.requestId } });
			assert.equal(result.result.produced.quantity, 1);
			assert.equal(RPGItems.require(result.result.produced.itemId).price.sell,
				RPGItems.require(id).price.sell);
			assert.equal(service.repository.get('cientista').state.trainerInventory.items
				.find(entry => entry.id === `apex-kit-${id}`).charges, 0);
		}
	});
	it('requires a level III kit for apex formulas, even with charged lower-level kits', () => {
		const service = setup();
		const record = service.repository.get('cientista');
		record.state.trainerSheet.talents.apex = 'cientista:mestre-de-formulacao';
		record.state.trainerInventory.items = record.state.trainerInventory.items
			.filter(entry => entry.itemId !== 'kit-cientifico-1');
		record.state.inventory.bag.maxSlots = 100;
		record.state.trainerInventory.items.push({ id: 'lower-kit', itemId: 'kit-cientifico-2',
			quantity: 1, charges: 10, location: 'bag', equipped: false });
		service.repository.set(record);
		const begin = { characterId: 'cientista', requestId: 'apex_requires_tier_3',
			action: { type: 'craft-start', recipeId: 'pharmacy:maxpotion' } };
		assert.throws(() => service.applyTrainerActivity('token', begin), /Kit apropriado indisponível/);
		record.state.trainerInventory.items.push({ id: 'high-kit', itemId: 'kit-cientifico-3',
			quantity: 1, charges: 6, location: 'bag', equipped: false });
		service.repository.set(record);
		service.applyTrainerActivity('token', begin);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			8 * 3_600_000).toISOString();
		service.applyTrainerActivity('token', { characterId: 'cientista', requestId: 'apex_requires_tier_3_done',
			action: { type: 'craft-complete', craftId: begin.requestId } });
		assert.equal(service.repository.get('cientista').state.trainerInventory.items
			.find(entry => entry.id === 'high-kit').charges, 0);
		assert.equal(service.repository.get('cientista').state.trainerInventory.items
			.find(entry => entry.id === 'lower-kit').charges, 10);
	});
	it('uses a charged eligible kit when another eligible kit has too few charges', () => {
		const service = setup();
		const record = service.repository.get('cientista');
		record.state.trainerSheet.talents.apex = 'cientista:mestre-de-formulacao';
		record.state.trainerInventory.items = record.state.trainerInventory.items
			.filter(entry => entry.itemId !== 'kit-cientifico-1');
		record.state.inventory.bag.maxSlots = 100;
		record.state.trainerInventory.items.push({ id: 'empty-kit', itemId: 'kit-cientifico-3',
			quantity: 1, charges: 2, location: 'bag', equipped: false });
		record.state.trainerInventory.items.push({ id: 'charged-kit', itemId: 'kit-cientifico-3',
			quantity: 1, charges: 8, location: 'bag', equipped: false });
		service.repository.set(record);
		const begin = { characterId: 'cientista', requestId: 'apex_multiple_kits',
			action: { type: 'craft-start', recipeId: 'pharmacy:fullrestore' } };
		service.applyTrainerActivity('token', begin);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			8 * 3_600_000).toISOString();
		service.applyTrainerActivity('token', { characterId: 'cientista', requestId: 'apex_multiple_kits_done',
			action: { type: 'craft-complete', craftId: begin.requestId } });
		assert.equal(service.repository.get('cientista').state.trainerInventory.items
			.find(entry => entry.id === 'empty-kit').charges, 2);
		assert.equal(service.repository.get('cientista').state.trainerInventory.items
			.find(entry => entry.id === 'charged-kit').charges, 0);
	});
	it('reloads a crafted item when persisted JSON has a different property order', () => {
		const service = setup();
		const record = service.repository.get('cientista');
		record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 1;
		service.repository.set(record);
		service.applyTrainerActivity('token', { characterId: 'cientista', requestId: 'farmacia_recarga_inicio',
			action: { type: 'craft-start', recipeId: 'pharmacy:potion' } });
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			3_600_000).toISOString();
		const result = service.applyTrainerActivity('token', { characterId: 'cientista',
			requestId: 'farmacia_recarga_final', action: { type: 'craft-complete', craftId: 'farmacia_recarga_inicio' } });
		const definition = RPGItems.require(result.result.produced.itemId);
		const reordered = Object.fromEntries(Object.entries(definition).reverse());
		assert.doesNotThrow(() => new RPGLoginService({ masterCode: 'segredo',
			customItemRepository: new RPGMemoryCustomItemRepository([reordered]) }));
	});
	it('combines older batches by the same creator and preserves the produced quantity', () => {
		const service = setup();
		const oldId = 'playerpotioncreatorlegacybatch';
		const original = RPGItems.require('potion');
		RPGItems.register({ ...original, id: oldId, name: 'Potion de @Pessoa', source: 'custom',
			effect: { ...original.effect, originalItemId: 'potion' }, tags: ['player-crafted'] });
		try {
			const record = service.repository.get('cientista');
			record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 1;
			record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, oldId, 4).bag;
			service.repository.set(record);
			service.applyTrainerActivity('token', { characterId: 'cientista', requestId: 'farmacia_pilha_inicio',
				action: { type: 'craft-start', recipeId: 'pharmacy:potion' } });
			service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
				3_600_000).toISOString();
			const result = service.applyTrainerActivity('token', { characterId: 'cientista',
				requestId: 'farmacia_pilha_final', action: { type: 'craft-complete', craftId: 'farmacia_pilha_inicio' } });
			const bag = service.repository.get('cientista').state.inventory.bag;
			assert.equal(result.result.produced.quantity, 3);
			assert.equal(bag.items.find(item => item.itemId === result.result.produced.itemId).quantity, 7);
			assert.equal(bag.items.some(item => item.itemId === oldId), false);
		} finally { RPGItems.unregister(oldId); }
	});
	it('adds consecutive batches to one Bag entry', () => {
		const service = setup();
		const record = service.repository.get('cientista');
		record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 2;
		service.repository.set(record);
		for (const suffix of ['primeiro', 'segundo']) {
			const craftId = `farmacia_${suffix}_inicio`;
			service.applyTrainerActivity('token', { characterId: 'cientista', requestId: craftId,
				action: { type: 'craft-start', recipeId: 'pharmacy:potion' } });
			service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
				3_600_000).toISOString();
			service.applyTrainerActivity('token', { characterId: 'cientista', requestId: `farmacia_${suffix}_final`,
				action: { type: 'craft-complete', craftId } });
		}
		const crafted = service.repository.get('cientista').state.inventory.bag.items.filter(entry =>
			RPGItems.get(entry.itemId)?.name === 'Potion de @Pessoa');
		assert.equal(crafted.length, 1);
		assert.equal(crafted[0].quantity, 6);
	});
	it('explains a full stack without consuming a charge or completing the order', () => {
		const service = setup();
		const record = service.repository.get('cientista');
		record.state.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges = 1;
		const craftedId = 'playerpotioncreatorfullstack';
		const original = RPGItems.require('potion');
		RPGItems.register({ ...original, id: craftedId, name: 'Potion de @Pessoa', source: 'custom',
			effect: { ...original.effect, originalItemId: 'potion' }, tags: ['player-crafted'] });
		try {
			record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, craftedId, 98).bag;
			service.repository.set(record);
			service.applyTrainerActivity('token', { characterId: 'cientista', requestId: 'farmacia_limite_inicio',
				action: { type: 'craft-start', recipeId: 'pharmacy:potion' } });
			service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
				3_600_000).toISOString();
			assert.throws(() => service.applyTrainerActivity('token', { characterId: 'cientista',
				requestId: 'farmacia_limite_final', action: { type: 'craft-complete', craftId: 'farmacia_limite_inicio' } }),
			/Não há espaço na pilha/);
			const after = service.repository.get('cientista').state;
			assert.equal(after.inventory.bag.items.find(item => item.itemId === craftedId).quantity, 98);
			assert.equal(after.trainerInventory.items.find(item => item.itemId === 'kit-cientifico-1').charges, 1);
			assert.equal(after.trainerSheet.activities.crafts[0].completedAt, undefined);
		} finally { RPGItems.unregister(craftedId); }
	});
	it('does not allow a player to craft unrelated recipes or another trainer’s items', () => {
		const service = setup();
		assert.throws(() => service.applyTrainerActivity('token', { characterId: 'outro',
			requestId: 'farmacia_fora_01', action: { type: 'craft-start', recipeId: 'pharmacy:potion' } }),
		/Fabricação permitida apenas ao próprio treinador/);
		assert.throws(() => service.applyTrainerActivity('token', { characterId: 'cientista',
			requestId: 'farmacia_fora_02', action: { type: 'craft-start', recipeId: 'culinary:pokemon-ration' } }),
		/Receita não conhecida/);
	});
});
