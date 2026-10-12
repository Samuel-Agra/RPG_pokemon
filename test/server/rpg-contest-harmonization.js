'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository, RPGContestRuntimeManager, RPGBoxManagement } =
	require('../../dist/server/rpg-showdown');

describe('RPG Harmonização de Sabores', () => {
	function setup() {
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
				record.state.trainerSheet.talents.class.push('cozinheiro:harmonizacao-de-sabores');
				record.state.trainerInventory.items.push({ id: 'food', itemId: 'alimento', quantity: 2,
					equipped: false, location: 'bag' });
			}
			service.repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste',
			characterId: 'cozinheira' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		return service;
	}

	it('consumes Alimento once, does not stack and survives an idempotent retry', () => {
		const service = setup();
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		const input = { requestId: 'harmonizacao_001', characterId: 'aliado', pokemonIds: [pokemonId] };
		const before = service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0);
		assert.deepEqual(service.useTrainerContestHarmonization('token', input).result.names, ['Squirtle']);
		assert.equal(service.useTrainerContestHarmonization('token', input).repeated, true);
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0), before - 1);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0]), true);
		assert.throws(() => service.useTrainerContestHarmonization('token',
			{ ...input, requestId: 'harmonizacao_002' }), /já possui Harmonização/);
		service.consumeContestHarmonization('aliado', [0]);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0]), false);
	});

	it('snapshots exactly three final points when a prepared Pokémon enters a contest', () => {
		const service = setup();
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		service.useTrainerContestHarmonization('token',
			{ requestId: 'harmonizacao_003', characterId: 'aliado', pokemonIds: [pokemonId] });
		const manager = new RPGContestRuntimeManager({
			getCharacterTeam: id => service.repository.get(id)?.state.team,
			getContestHarmonization: (id, indexes) => service.contestHarmonizationPrepared(id, indexes),
		});
		const snapshot = manager.start({ id: 'concurso', status: 'started', mode: 'solo',
			category: 'beauty', rank: 'normal', scenario: { id: 'stage', name: 'Palco', tags: [] },
			participants: [{ id: 'aliado', kind: 'player', displayName: 'Aliado', characterId: 'aliado',
				pokemon: { teamIndex: 0 } }], presentationOrder: ['aliado'] });
		assert.equal(snapshot.participants[0].contestHarmonizationBonus, 3);
	});

	it('expires when the Master advances the campaign clock by one hour', () => {
		const service = setup();
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		service.useTrainerContestHarmonization('token',
			{ requestId: 'harmonizacao_004', characterId: 'aliado', pokemonIds: [pokemonId] });
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0]), false);
	});

	it('Chef Pokémon prepares a group, spends one Alimento per Pokémon and grants only one bonus', () => {
		const service = setup();
		const cook = service.repository.get('cozinheira');
		cook.state.trainerSheet.talents.apex = 'cozinheiro:chef-pokemon';
		service.repository.set(cook);
		const owner = service.repository.get('aliado');
		const second = structuredClone(owner.state.box.party[0]);
		second.pokemonId = 'second-pokemon';
		owner.state.box.party.push(second);
		service.repository.set(owner);
		const pokemonIds = owner.state.box.party.map(entry => entry.pokemonId);
		const before = cook.state.trainerInventory.items.filter(item => item.itemId === 'alimento')
			.reduce((sum, item) => sum + item.quantity, 0);
		service.useTrainerContestHarmonization('token',
			{ requestId: 'harmonizacao_005', characterId: 'aliado', pokemonIds });
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0), before - 2);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0]), false);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0, 1]), true);
		service.consumeContestHarmonization('aliado', [0]);
		assert.equal(service.contestHarmonizationPrepared('aliado', [0, 1]), false);
		assert.equal(RPGBoxManagement.pokemonSet(service.repository.get('aliado').state, pokemonIds[0]).species,
			'Squirtle');
	});
});
