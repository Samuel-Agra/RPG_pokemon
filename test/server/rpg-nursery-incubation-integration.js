'use strict';

const assert = require('assert').strict;
const {RPGLoginService, RPGMemoryCharacterRepository} = require('../../dist/server/rpg-showdown');

const stats = value => ({hp: value, atk: value, def: value, spa: value, spd: value, spe: value});
function set(species, gender, ability) {
	return {
		name: species, species, level: 50, gender, shiny: false, item: '',
		ability, nature: 'Hardy', moves: ['tackle'], evs: stats(0), ivs: stats(16),
		rpg: {version: 1, level: 50, friendship: 50, item: '', captureBall: 'pokeball'},
	};
}
function create(service, name) {
	service.createCharacter({
		characterName: name, playerName: name, avatar: 'lucas', password: '1234',
		initialMoney: 3000, starter: {species: 'Squirtle', gender: 'M'},
	});
}
describe('RPG connected Nursery and Incubation flow', () => {
	it('moves one persistent Egg from breeding through hatching', () => {
		let byte = 0;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		service.replaceCharacterTeam(master.token, 'marina', [set('Gallade', 'M', 'Sharpness')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const marina = service.loginPlayer('marina', '1234');
		const samuelPokemon = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const marinaPokemon = service.getCharacter(marina.token).box.party[0].pokemonId;

		let view = service.createNurseryProject(samuel.token, undefined, samuelPokemon, 'marina');
		const projectId = view.projects[0].id;
		view = service.acceptNurseryInvitation(marina.token, projectId, marinaPokemon);
		assert.equal(view.projects[0].preview.compatibility.compatible, true);
		service.confirmNurseryProject(samuel.token, projectId);
		view = service.confirmNurseryProject(marina.token, projectId);
		assert.equal(view.projects[0].status, 'breeding');

		for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		assert.equal(view.projects[0].status, 'egg_ready');
		assert.equal(view.projects[0].egg.status, 'created');
		assert.equal('genetics' in view.projects[0].egg, false);

		const bagSlotsBeforeEgg = service.getBag(samuel.token).capacity.usedSlots;
		view = service.collectNurseryEgg(samuel.token, projectId);
		const eggId = view.eggs[0].eggId;
		assert.equal(view.eggs[0].status, 'carried');
		assert.equal(view.capacity.teamUsed, 2);
		assert.equal(view.capacity.bagUsedSlots, bagSlotsBeforeEgg + 5);
		const characterWithEgg = service.getCharacter(samuel.token);
		assert.equal(characterWithEgg.team.length, 1);
		assert.deepEqual(characterWithEgg.teamEggs.map(egg => egg.name), ['Egg']);
		assert.equal(characterWithEgg.teamEggs[0].virtual, true);
		assert.equal(service.getBag(samuel.token).capacity.usedSlots, bagSlotsBeforeEgg + 5);
		const incubatorId = view.incubators[0].id;
		view = service.insertNurseryEgg(samuel.token, eggId, incubatorId);
		assert.equal(view.incubators[0].egg.status, 'incubating');

		for (let i = 0; i < 9; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		assert.equal(view.incubators[0].egg.status, 'ready_to_hatch');
		const result = service.hatchNurseryEgg(samuel.token, eggId);
		assert.equal(result.hatch.pokemon.species, 'Ralts');
		assert.equal(result.hatch.pokemon.level, 1);
		const characterAfterHatch = service.getCharacter(samuel.token);
		assert.deepEqual(characterAfterHatch.team.map(pokemon => pokemon.species), ['Gardevoir', 'Ralts']);
		assert.deepEqual(characterAfterHatch.teamEggs, []);
		assert.equal(service.getBag(samuel.token).capacity.usedSlots, bagSlotsBeforeEgg);
		assert.equal(service.getNursery(samuel.token).incubators[0].egg, undefined);
	});

	it('shares open slots with every Player and with the Master', () => {
		let byte = 20;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		create(service, 'Carlos');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		service.replaceCharacterTeam(master.token, 'marina', [set('Gallade', 'M', 'Sharpness')]);
		service.replaceCharacterTeam(master.token, 'carlos', [set('Charizard', 'M', 'Blaze')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const marina = service.loginPlayer('marina', '1234');
		const carlos = service.loginPlayer('carlos', '1234');
		const samuelPokemon = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const marinaPokemon = service.getCharacter(marina.token).box.party[0].pokemonId;

		const created = service.createNurseryProject(samuel.token, undefined, samuelPokemon);
		const projectId = created.projects[0].id;
		assert.equal(created.projects[0].slot2, undefined);
		assert.equal(service.getNursery(marina.token).projects[0].id, projectId);
		assert.equal(service.getNursery(carlos.token).projects[0].id, projectId);

		const masterView = service.getNursery(master.token);
		assert.equal(masterView.viewerRole, 'master');
		assert.equal(masterView.ownerId, '');
		assert.equal(masterView.projects[0].slot1.ownerName, 'Samuel');

		service.acceptNurseryInvitation(marina.token, projectId, marinaPokemon);
		const shared = service.getNursery(carlos.token).projects[0];
		assert.equal(shared.slot2.ownerName, 'Marina');
		assert.equal(service.getNursery(master.token).projects[0].slot2.ownerName, 'Marina');
	});});
