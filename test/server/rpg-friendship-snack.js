'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository, RPGBoxManagement } =
	require('../../dist/server/rpg-showdown');

describe('RPG Petisco de Amizade', () => {
	it('consome Ração Pokémon, limita amizade por sete dias e preserva retries', () => {
		const service = new RPGLoginService({ masterCode: 'teste',
			repository: new RPGMemoryCharacterRepository() });
		for (const name of ['Cozinheira', 'Aliado']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const login = service.loginPlayer(name.toLowerCase(), 'senha-rpg');
			service.chooseTrainerAttributeMethod(login.token, 'standard');
			service.completeTrainerCreation(login.token, { classId: name === 'Cozinheira' ? 'cozinheiro' : 'atleta',
				attributes: { strength: 15, dexterity: 14, constitution: 13,
					intelligence: 12, wisdom: 10, charisma: 8 },
				optionalSkills: name === 'Cozinheira' ?
					['percepcao', 'sobrevivencia', 'medicina', 'persuasao'] : ['percepcao', 'sobrevivencia'],
				gearChoices: name === 'Cozinheira' ? {} : { melhoria: 'arnes-escalada' } });
			const record = service.repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = `account-${name.toLowerCase()}`;
			if (name === 'Cozinheira') {
				record.state.trainerSheet.talents.class.push('cozinheiro:petisco-de-amizade');
				record.state.trainerInventory.items.push({ id: 'ration', itemId: 'racao-pokemon',
					quantity: 3, equipped: false, location: 'bag' });
				record.state.trainerInventory.items.push({ id: 'artisan-ration',
					itemId: 'racao-artesanal-pokemon', quantity: 1, equipped: false, location: 'bag' });
			}
			service.repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste',
			characterId: 'cozinheira' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		const input = { requestId: 'petisco_001', servings: [
			{ characterId: 'aliado', pokemonId }, { otherPokemon: 'Pokémon selvagem' },
		] };
		const before = RPGBoxManagement.pokemonSet(service.repository.get('aliado').state, pokemonId).rpg.friendship;
		const first = service.useTrainerFriendshipSnack('token', input);
		assert.equal(first.result.served[0].friendshipGained, 5);
		assert.equal(first.result.served[1].friendshipGained, null);
		assert.equal(RPGBoxManagement.pokemonSet(service.repository.get('aliado').state, pokemonId).rpg.friendship,
			before + 5);
		assert.equal(service.useTrainerFriendshipSnack('token', input).repeated, true);
		assert.throws(() => service.useTrainerFriendshipSnack('token', { ...input,
			servings: [{ otherPokemon: 'Outro' }] }), /Identificador de petiscos já utilizado/);
		assert.equal(service.useTrainerFriendshipSnack('token', { ...input, requestId: 'petisco_002' })
			.result.served[0].friendshipGained, 0);
		service.campaignSettings.currentDateTime = new Date(Date.parse(
			service.campaignSettings.currentDateTime) + 7 * 86_400_000).toISOString();
		assert.equal(service.useTrainerFriendshipSnack('token', { ...input, requestId: 'petisco_003' })
			.result.served[0].friendshipGained, 5);
		assert.equal(service.useTrainerFriendshipSnack('token', { ...input, requestId: 'petisco_004',
			rationItemId: 'racao-artesanal-pokemon' }).result.served[0].friendshipGained, 0);
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.some(item => item.itemId === 'racao-pokemon'), false);
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.some(item => item.itemId === 'racao-artesanal-pokemon'), false);
	});
});
