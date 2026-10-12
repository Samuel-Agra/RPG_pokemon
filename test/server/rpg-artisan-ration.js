'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

function cook(random) {
	const service = new RPGLoginService({ masterCode: 'teste',
		repository: new RPGMemoryCharacterRepository(), random });
	service.createCharacter({ characterName: 'Cozinheira', playerName: 'Cozinheira', avatar: 'lucas',
		password: 'senha-rpg', initialMoney: 100,
		starter: { species: 'Squirtle', gender: 'M' } });
	const login = service.loginPlayer('cozinheira', 'senha-rpg');
	service.chooseTrainerAttributeMethod(login.token, 'standard');
	service.completeTrainerCreation(login.token, { classId: 'cozinheiro',
		attributes: { strength: 15, dexterity: 14, constitution: 13,
			intelligence: 12, wisdom: 10, charisma: 8 },
		optionalSkills: ['percepcao', 'sobrevivencia', 'medicina', 'persuasao'], gearChoices: {} });
	const record = service.repository.get('cozinheira');
	record.tableId = 'mesa-teste'; record.accountId = 'account-cozinheira';
	record.state.trainerSheet.talents.class.push('cozinheiro:racao-artesanal-pokemon');
	record.state.trainerInventory.items.push({ id: 'food', itemId: 'alimento', quantity: 6,
		equipped: false, location: 'bag' });
	service.repository.set(record);
	service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste',
		characterId: 'cozinheira' });
	service.accounts.repository.getMembership = () => ({ status: 'active' });
	return service;
}

function quantity(service, itemId) {
	return service.repository.get('cozinheira').state.trainerInventory.items
		.filter(item => item.itemId === itemId).reduce((sum, item) => sum + item.quantity, 0);
}

describe('RPG Ração Artesanal Pokémon', () => {
	it('creates a distinct stackable food on success and does not repeat the same request', () => {
		const service = cook(() => 0.95);
		const foodBefore = quantity(service, 'alimento');
		const input = { requestId: 'racao_001', foodQuantity: 3 };
		const first = service.useTrainerArtisanRation('token', input);
		assert.equal(first.result.success, true);
		assert.equal(first.result.produced, 4);
		assert.equal(quantity(service, 'alimento'), foodBefore - 3);
		assert.equal(quantity(service, 'racao-artesanal-pokemon'), 4);
		assert.equal(service.useTrainerArtisanRation('token', input).repeated, true);
		assert.throws(() => service.useTrainerArtisanRation('token',
			{ ...input, foodQuantity: 6 }), /Identificador de preparo já utilizado/);
		service.useTrainerArtisanRation('token', { requestId: 'racao_002', foodQuantity: 3 });
		assert.equal(quantity(service, 'racao-artesanal-pokemon'), 8);
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'racao-artesanal-pokemon').length, 1);
	});
	it('keeps ingredients on failure', () => {
		const service = cook(() => 0);
		const foodBefore = quantity(service, 'alimento');
		const outcome = service.useTrainerArtisanRation('token', { requestId: 'racao_003', foodQuantity: 3 });
		assert.equal(outcome.result.success, false);
		assert.equal(outcome.result.produced, 0);
		assert.equal(quantity(service, 'alimento'), foodBefore);
		assert.equal(quantity(service, 'racao-artesanal-pokemon'), 0);
	});
	it('treats a low natural Culinary roll as 10 with Master of the Kitchen', () => {
		const service = cook(() => 0);
		const record = service.repository.get('cozinheira');
		record.state.trainerSheet.talents.apex = 'cozinheiro:mestre-da-cozinha';
		service.repository.set(record);
		const outcome = service.useTrainerArtisanRation('token',
			{ requestId: 'racao_004', foodQuantity: 3 });
		assert.equal(outcome.result.natural, 1);
		assert.equal(outcome.result.effectiveNatural, 10);
	});
});
