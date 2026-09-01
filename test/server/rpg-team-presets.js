'use strict';

const assert = require('assert').strict;
const {RPGLoginService, RPGMemoryCharacterRepository} = require('../../dist/server/rpg-showdown');

function service() {
	let byte = 0;
	return new RPGLoginService({
		masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
		randomBytes: size => Buffer.alloc(size, ++byte), now: () => 1_800_000_000_000,
	});
}

function setup() {
	const login = service();
	login.createCharacter({
		characterName: 'Samuel', playerName: 'Samuel real', avatar: 'lucas', password: 'senha-rpg',
		initialMoney: 3000, starter: {species: 'Squirtle', gender: 'M', level: 10},
	});
	return {login, player: login.loginPlayer('samuel', 'senha-rpg'), master: login.loginMaster('14081998')};
}

function addSpecies(login, master, species) {
	const starter = structuredClone(login.repository.get('samuel').state.box.party[0].pokemon);
	starter.name = starter.species = species;
	starter.moves = ['tackle'];
	return login.masterAddBoxPokemon(master.token, 'samuel', starter);
}

describe('RPG saved teams', () => {
	it('saves a planned team even when the Player does not own its Pokemon', () => {
		const {login, player} = setup();
		const character = login.createTeamPreset(player.token, undefined, {
			name: 'Sol', species: ['Charizard', 'Venusaur'],
		});
		assert.equal(character.teamPresets.length, 1);
		assert.equal(character.teamPresets[0].name, 'Sol');
		assert.deepEqual(character.teamPresets[0].species, ['Charizard', 'Venusaur']);
	});

	it('moves exact owned Pokemon into the saved team and sends former members to the Box', () => {
		const {login, player, master} = setup();
		let box = addSpecies(login, master, 'Bulbasaur');
		box = addSpecies(login, master, 'Charmander');
		const before = new Map(box.results.map(pokemon => [pokemon.species, pokemon.pokemonId]));
		const character = login.createTeamPreset(player.token, undefined, {
			name: 'Kanto', species: ['Charmander', 'Bulbasaur'],
		});
		const applied = login.applyTeamPreset(player.token, undefined, character.teamPresets[0].id, box.revision);
		const after = login.getBox(player.token);
		assert.deepEqual(after.team.map(pokemon => pokemon.pokemonId), [before.get('Charmander'), before.get('Bulbasaur')]);
		assert.equal(after.boxes[0].pokemon.some(pokemon => pokemon.pokemonId === before.get('Squirtle')), true);
		assert.equal(after.results.length, 3);
		assert.equal(new Set(after.results.map(pokemon => pokemon.pokemonId)).size, 3);
		assert.deepEqual(applied.team.map(pokemon => pokemon.species), ['Charmander', 'Bulbasaur']);
	});

	it('does not alter the team when Pokemon are missing or Box access is blocked', () => {
		const {login, player, master} = setup();
		let character = login.createTeamPreset(player.token, undefined, {
			name: 'Futuro', species: ['Squirtle', 'Pikachu'],
		});
		const presetId = character.teamPresets[0].id;
		const before = login.getBox(player.token);
		assert.throws(() => login.applyTeamPreset(player.token, undefined, presetId, before.revision), /n\u00e3o possui um Pikachu/);
		assert.deepEqual(login.getBox(player.token).team.map(pokemon => pokemon.pokemonId), before.team.map(pokemon => pokemon.pokemonId));
		login.setCharacterPageAccess(master.token, 'samuel', 'box', false);
		assert.throws(() => login.applyTeamPreset(player.token, undefined, presetId, before.revision), /bloqueou o acesso/);
		character = login.deleteTeamPreset(player.token, undefined, presetId);
		assert.deepEqual(character.teamPresets, []);
	});

	it('keeps a specifically linked Pokemon after it evolves within the planned lineage', () => {
		const {login, player, master} = setup();
		let box = addSpecies(login, master, 'Eevee');
		const eevee = box.results.find(pokemon => pokemon.species === 'Eevee');
		const character = login.createTeamPreset(player.token, undefined, {
			name: 'Noturno', species: ['Umbreon'], pokemonIds: [eevee.pokemonId],
		});
		login.applyTeamPreset(player.token, undefined, character.teamPresets[0].id, box.revision);
		let record = login.repository.get('samuel');
		const linked = record.state.box.party.find(pokemon => pokemon.pokemonId === eevee.pokemonId);
		linked.pokemon.species = linked.pokemon.name = 'Umbreon';
		login.repository.set(record);
		box = login.getBox(player.token);
		login.applyTeamPreset(player.token, undefined, character.teamPresets[0].id, box.revision);
		assert.equal(login.getBox(player.token).team[0].pokemonId, eevee.pokemonId);
		assert.equal(login.getBox(player.token).team[0].species, 'Umbreon');
	});
});
