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
	it('migrates the old local slot and removes a persisted ghost Egg reference', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({
			masterCode: '14081998', repository,
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, 1),
		});
		create(service, 'Samuel');
		const record = repository.get('samuel');
		record.state.nursery = {
			version: 1, projects: [],
			incubators: [{id: 'samuel:incubator:1', ownerId: 'samuel', kind: 'local', eggId: 'ghost-egg'}],
		};
		repository.set(record);
		const player = service.loginPlayer('samuel', '1234');
		const view = service.getNursery(player.token);
		assert.equal(view.incubators.length, 9);
		assert.equal(view.incubators.some(incubator => incubator.egg), false);
		assert.equal(repository.get('samuel').state.nursery.incubators.some(incubator => incubator.eggId), false);
	});
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

		const breedingBox = service.getBox(samuel.token);
		assert.equal(breedingBox.team[0].metadata.breeding, true);
		assert.equal(breedingBox.team[0].actions.move, false);
		assert.equal(breedingBox.team[0].actions.release, false);
		assert.equal(service.getCharacter(samuel.token).box.party[0].metadata.breeding, true);
		assert.throws(() => service.moveBoxPokemon(samuel.token, undefined, {
			pokemonId: samuelPokemon,
			destination: {destination: 'box', boxIndex: 0, slot: 0},
			expectedRevision: breedingBox.revision,
		}), /deve permanecer na equipe/);
		assert.throws(() => service.createPokemonReleaseChallenge(
			samuel.token, undefined, samuelPokemon, breedingBox.revision
		), /deve permanecer na equipe/);
		const blockedBattle = service.createBattleSession(master.token);
		assert.throws(() => service.updateBattleSession(master.token, blockedBattle.id, {
			format: 'singles', opponentType: 'wild', participants: [
				{id: 'samuel', team: 'A', kind: 'player', characterId: 'samuel',
					displayName: 'Samuel', selectionLimit: 1, pokemon: [{teamIndex: 0}]},
				{id: 'wild', team: 'B', kind: 'wild', displayName: 'Pidgey',
					selectionLimit: 1, pokemon: [{set: {species: 'Pidgey', level: 5, moves: ['tackle']}}]},
			],
		}), /indisponível/);
		assert.equal(service.getCharacter(samuel.token).box.party[0].pokemonId, samuelPokemon);

		for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		assert.equal(view.projects[0].status, 'egg_ready');
		assert.equal(service.getBox(samuel.token).team[0].metadata.breeding, true,
			'o primeiro pai permanece bloqueado até ser resgatado');
		assert.equal(service.getBox(marina.token).team[0].metadata.breeding, true,
			'o segundo pai permanece bloqueado até seu próprio treinador resgatá-lo');
		assert.equal(view.projects[0].egg.status, 'created');
		assert.equal('genetics' in view.projects[0].egg, false);

		service.collectNurseryParent(samuel.token, projectId);
		assert.equal(service.getBox(samuel.token).team[0].metadata.breeding, undefined);
		assert.equal(service.getBox(marina.token).team[0].metadata.breeding, true);
		assert.throws(() => service.collectNurseryParent(samuel.token, projectId), /já foi resgatado/);
		service.collectNurseryParent(marina.token, projectId);
		assert.equal(service.getBox(marina.token).team[0].metadata.breeding, undefined);

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
		assert.equal(view.incubators.length, 9, 'cada Player possui nove vagas locais');
		assert.deepEqual([1, 2, 3].map(group => view.incubators.filter(incubator => incubator.group === group).length),
			[3, 3, 3], 'as vagas são organizadas em três incubadoras com três espaços');
		assert.deepEqual(view.incubators.slice(0, 3).map(incubator => incubator.slot), [1, 2, 3]);
		const incubatorId = view.incubators[0].id;
		view = service.insertNurseryEgg(samuel.token, eggId, incubatorId);
		assert.equal(view.incubators[0].egg.status, 'incubating');
		view = service.removeNurseryEgg(samuel.token, eggId);
		assert.equal(view.incubators[0].egg, undefined, 'retirar o Egg limpa imediatamente a vaga local');
		assert.equal(view.eggs.find(egg => egg.eggId === eggId).status, 'carried');
		view = service.insertNurseryEgg(samuel.token, eggId, incubatorId);
		assert.equal(view.incubators[0].egg.status, 'incubating');
		assert.equal(view.capacity.teamUsed, 1, 'a incubadora local libera a vaga reservada na equipe');
		assert.equal(view.capacity.bagUsedSlots, bagSlotsBeforeEgg, 'a incubadora local libera os cinco espaços da Bag');
		assert.deepEqual(service.getCharacter(samuel.token).teamEggs, []);

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

		// A segunda produção vai diretamente para a incubadora local, sem ocupar Equipe ou Bag.
		view = service.createNurseryProject(samuel.token, undefined, samuelPokemon, 'marina');
		const secondProject = view.projects.find(project => project.status === 'inviting');
		service.acceptNurseryInvitation(marina.token, secondProject.id, marinaPokemon);
		service.confirmNurseryProject(samuel.token, secondProject.id);
		service.confirmNurseryProject(marina.token, secondProject.id);
		for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		assert.equal(view.projects.find(project => project.id === secondProject.id).status, 'egg_ready');
		view = service.collectNurseryEggToLocal(samuel.token, secondProject.id, view.incubators[0].id);
		assert.equal(view.incubators[0].egg.status, 'incubating');
		assert.equal(view.capacity.teamUsed, 2);
		assert.equal(view.capacity.bagUsedSlots, bagSlotsBeforeEgg);
	});


	it('keeps a ready local hatch in the Incubator when another Egg reserves the last Team slot', () => {
		let byte = 90;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [
			set('Gardevoir', 'F', 'Synchronize'),
			set('Charizard', 'M', 'Blaze'),
			set('Bulbasaur', 'M', 'Overgrow'),
			set('Squirtle', 'M', 'Torrent'),
			set('Pikachu', 'M', 'Static'),
		]);
		service.replaceCharacterTeam(master.token, 'marina', [set('Gallade', 'M', 'Sharpness')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const marina = service.loginPlayer('marina', '1234');
		const samuelPokemon = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const marinaPokemon = service.getCharacter(marina.token).box.party[0].pokemonId;

		let view = service.createNurseryProject(samuel.token, undefined, samuelPokemon, 'marina');
		const firstProjectId = view.projects.find(project => project.status === 'inviting').id;
		service.acceptNurseryInvitation(marina.token, firstProjectId, marinaPokemon);
		service.confirmNurseryProject(samuel.token, firstProjectId);
		service.confirmNurseryProject(marina.token, firstProjectId);
		for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		view = service.collectNurseryEggToLocal(samuel.token, firstProjectId, view.incubators[0].id);
		const localEggId = view.incubators[0].egg.eggId;
		service.collectNurseryParent(samuel.token, firstProjectId);
		service.collectNurseryParent(marina.token, firstProjectId);

		view = service.createNurseryProject(samuel.token, undefined, samuelPokemon, 'marina');
		const secondProjectId = view.projects.find(project => project.status === 'inviting').id;
		service.acceptNurseryInvitation(marina.token, secondProjectId, marinaPokemon);
		service.confirmNurseryProject(samuel.token, secondProjectId);
		service.confirmNurseryProject(marina.token, secondProjectId);
		for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
		service.collectNurseryEgg(samuel.token, secondProjectId);
		for (let i = 0; i < 6; i++) service.advanceCampaignTime(master.token, 8);

		view = service.getNursery(samuel.token);
		assert.equal(view.capacity.teamPokemon, 5);
		assert.equal(view.capacity.carriedEggs, 1);
		assert.equal(view.capacity.teamUsed, 6);
		assert.equal(view.incubators[0].egg.status, 'ready_to_hatch');
		assert.throws(() => service.hatchNurseryEgg(samuel.token, localEggId), /Não há espaço livre na equipe/);

		view = service.getNursery(samuel.token);
		assert.equal(view.incubators[0].egg.status, 'ready_to_hatch');
		assert.equal(view.capacity.carriedEggs, 1, 'o Egg carregado continua reservando seu slot');
		assert.equal(service.getCharacter(samuel.token).box.party.length, 5);
		assert.equal(service.getCharacter(samuel.token).teamEggs.length, 1);
	});

	it('requires the item and moves or destroys a loaded Incubator together with its Egg', () => {
		let byte = 40;
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
		const samuel = service.loginPlayer('samuel', '1234');
		const marina = service.loginPlayer('marina', '1234');
		const carlos = service.loginPlayer('carlos', '1234');
		const firstParent = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const secondParent = service.getCharacter(marina.token).box.party[0].pokemonId;
		const produce = () => {
			let view = service.createNurseryProject(samuel.token, undefined, firstParent, 'marina');
			const project = view.projects.find(candidate => candidate.status === 'inviting');
			service.acceptNurseryInvitation(marina.token, project.id, secondParent);
			service.confirmNurseryProject(samuel.token, project.id);
			service.confirmNurseryProject(marina.token, project.id);
			for (let i = 0; i < 3; i++) service.advanceCampaignTime(master.token, 8);
			view = service.collectNurseryEgg(samuel.token, project.id);
			return view.eggs.find(egg => egg.status === 'carried').eggId;
		};

		let eggId = produce();
		assert.throws(() => service.startPortableNurseryIncubator(samuel.token, eggId), /precisa ter/);
		let bag = service.getBag(samuel.token);
		service.masterSetBagItemQuantity(master.token, 'samuel', 'portableincubator', 2, bag.revision, 'add');
		service.startPortableNurseryIncubator(samuel.token, eggId);
		bag = service.getBag(samuel.token);
		let loaded = bag.items.find(item => item.linkedEggId === eggId);
		assert.equal(loaded.name, 'Incubadora Portátil carregada');
		assert.match(loaded.icon, /portableincubator\.png/);
		assert.doesNotMatch(loaded.icon, /-active/);
		assert.equal(service.getCharacter(samuel.token).portableIncubators.filter(item => item.loaded).length, 1);

		const transfer = service.getBagTransferTargets(samuel.token, undefined, 'portableincubator', eggId);
		const destination = transfer.targets.find(target => target.characterId === 'carlos');
		service.transferBagItem(
			samuel.token, undefined, 'carlos', 'portableincubator', 1,
			transfer.senderRevision, destination.revision, eggId
		);
		assert.equal(service.getCharacter(samuel.token).teamEggs.length, 0);
		assert.equal(service.getCharacter(carlos.token).teamEggs[0].eggId, eggId);
		bag = service.getBag(carlos.token);
		loaded = bag.items.find(item => item.linkedEggId === eggId);
		service.discardBagItem(carlos.token, undefined, 'portableincubator', 1, bag.revision, eggId);
		assert.equal(service.getCharacter(carlos.token).teamEggs.length, 0);

		// Mission conversion keeps the pair linked; completing the mission removes both.
		eggId = produce();
		service.startPortableNurseryIncubator(samuel.token, eggId);
		bag = service.getBag(samuel.token);
		service.setBagItemMission(
			samuel.token, undefined, 'portableincubator', true, bag.revision, 1, 'Egg de missão', eggId
		);
		bag = service.getBag(samuel.token);
		loaded = bag.items.find(item => item.linkedEggId === eggId);
		assert.equal(loaded.mission, true);
		service.completeMissionItem(master.token, 'samuel', 'portableincubator', bag.revision, {
			type: 'pokecoin', amount: 1,
		});
		assert.equal(service.getCharacter(samuel.token).teamEggs.length, 0);
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
