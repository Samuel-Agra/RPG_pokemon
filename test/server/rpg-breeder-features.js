'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository,
	createRPGPendingTrainerSheet } = require('../../dist/server/rpg-showdown');

function setup() {
	const service = new RPGLoginService({ masterCode: 'teste',
		repository: new RPGMemoryCharacterRepository() });
	for (const name of ['Criador', 'Aliado']) {
		service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = service.repository.get(name.toLowerCase());
		record.tableId = 'mesa-teste'; record.accountId = `account-${name.toLowerCase()}`;
		record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
			classId: name === 'Criador' ? 'criador-pokemon' : 'atleta', level: 1,
			talents: { general: [], class: [], apex: null } };
		service.repository.set(record);
	}
	service.getSession = () => ({ mode: 'player', role: 'player',
		platformTableId: 'mesa-teste', characterId: 'criador' });
	service.accounts.repository.getMembership = () => ({ status: 'active' });
	const breeder = service.repository.get('criador');
	service.ensureTrainerInventory(breeder).items.push({
		id: 'kit-criador', itemId: 'kit-medicina-pokemon', quantity: 1, location: 'bag', charges: 5,
	});
	service.repository.set(breeder);
	return service;
}

describe('RPG características do Criador Pokémon', () => {
	it('revela somente tempo, espécie e sexo de Egg do próprio treinador com ajuda de Criador', () => {
		const service = setup();
		const ally = service.repository.get('aliado');
		const egg = { id: 'ovo-teste', ownerId: 'aliado', status: 'carried', createdAt: 1,
			genetics: { species: 'Eevee', sex: 'F', nature: 'Jolly', ability: 'Run Away',
				shiny: true, ivs: {}, ivOrigins: {}, moves: [], eggMoves: [], family: 'field',
				lineage: '', parentIds: ['', ''], parentOwnerIds: ['', ''] } };
		ally.state.nursery = { version: 1, projects: [{ id: 'projeto', egg }],
			incubators: [], releasedPokemon: [] };
		service.repository.set(ally);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'aliado' });
		const result = service.examineNurseryEgg('token', 'ovo-teste', 'criador');
		assert.equal(result.species, 'Eevee');
		assert.equal(result.sex, 'F');
		assert(!('shiny' in result));
		assert.throws(() => service.examineNurseryEgg('token', 'ovo-teste', 'aliado'), /Criador/);
	});

	it('lista Pokémon desmaiados por treinador e impede novo atendimento antes de sete dias', () => {
		const service = setup();
		const ally = service.repository.get('aliado');
		const pokemon = ally.state.box.party[0];
		pokemon.pokemon.rpg.hp = 0;
		service.repository.set(ally);
		const before = service.getFirstCareCandidates('token');
		assert(before.players.some(player => player.name === 'Aliado' &&
			player.pokemon.some(entry => entry.id === pokemon.pokemonId)));
		const healed = service.performFirstCare('token', 'aliado', pokemon.pokemonId);
		assert.equal(healed.hp, 1);
		assert.equal(service.repository.get('aliado').state.box.party[0].pokemon.rpg.hp, 1);
		const faintedAgain = service.repository.get('aliado');
		faintedAgain.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(faintedAgain);
		assert.throws(() => service.performFirstCare('token', 'aliado', pokemon.pokemonId), /ainda não/);
	});
});
