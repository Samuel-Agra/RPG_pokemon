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

	it('lets the Slot 2 owner withdraw without cancelling the Slot 1 request', () => {
		let byte = 30;
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

		let view = service.createNurseryProject(samuel.token, undefined, samuelPokemon);
		const projectId = view.projects.find(project => project.status === 'inviting').id;
		view = service.acceptNurseryInvitation(marina.token, projectId, marinaPokemon);
		assert.equal(view.projects.find(project => project.id === projectId).status, 'configuring');
		assert.equal(view.pokemon.find(pokemon => pokemon.pokemonId === marinaPokemon).busy, true);
		assert.throws(() => service.cancelNurseryProject(marina.token, projectId), /Slot 1/);

		view = service.withdrawNurserySlot2(marina.token, projectId);
		const project = view.projects.find(entry => entry.id === projectId);
		assert.equal(project.status, 'inviting');
		assert.equal(project.slot1.ownerId, 'samuel');
		assert.equal(project.slot2, undefined);
		assert.equal(project.slot2OwnerId, undefined);
		assert.deepEqual(project.confirmed, {samuel: false});
		assert.equal(view.pokemon.find(pokemon => pokemon.pokemonId === marinaPokemon).busy, false);
		assert.equal(service.getNursery(samuel.token).projects.find(entry => entry.id === projectId).status, 'inviting');
		assert.throws(() => service.withdrawNurserySlot2(samuel.token, projectId), /Slot 2/);
	});

	it('lets the Master open an NPC Slot 1 request for a Player partner', () => {
		let byte = 70;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'marina', [set('Charizard', 'F', 'Blaze')]);
		const marina = service.loginPlayer('marina', '1234');
		const playerPokemonId = service.getCharacter(marina.token).box.party[0].pokemonId;
		const ivs = {hp: 31, atk: 30, def: 29, spa: 28, spd: 27, spe: 26};

		let view = service.createMasterNurseryProject(master.token, {
			npcName: 'L\u00edder Blaine', species: 'Charizard', sex: 'M', level: 65, ivs, item: 'everstone',
		});
		const project = view.projects.find(entry => entry.slot1.ownerName === 'L\u00edder Blaine');
		assert.ok(project);
		assert.equal(project.slot1.participantType, 'npc');
		assert.equal(project.slot1.level, 65);
		assert.equal(project.slot1.sex, 'M');
		assert.deepEqual(project.slot1.ivs, ivs);
		assert.equal(project.slot1.item, 'everstone');
		assert.equal(project.status, 'inviting');
		assert.equal(project.confirmed[project.slot1.ownerId], true);
		assert.deepEqual(project.masterSlot2Options, [],
			'o Mestre n\u00e3o deve preencher o Slot 2 da pr\u00f3pria requisi\u00e7\u00e3o de NPC');
		assert.equal(view.masterSlot1Options.some(option => option.species === 'Charmander'), false);
		assert.deepEqual(
			view.masterSlot1Options.find(option => option.species === 'Charizard').sexes, ['M', 'F']
		);

		view = service.acceptNurseryInvitation(marina.token, project.id, playerPokemonId);
		const joined = view.projects.find(entry => entry.id === project.id);
		assert.equal(joined.status, 'awaiting_confirmation');
		assert.equal(joined.confirmed[joined.slot1.ownerId], true);
		assert.equal(joined.confirmed[joined.slot2.ownerId], false);
		assert.equal(service.getBox(marina.token).team[0].metadata.breeding, true);
		assert.throws(() => service.setMasterNurserySlot2(master.token, {
			projectId: project.id, species: 'Charizard', level: 50, ivs, item: '',
		}), /deve receber um Pok\u00e9mon de Player/);

		view = service.confirmNurseryProject(marina.token, project.id);
		assert.equal(view.projects.find(entry => entry.id === project.id).status, 'breeding');
		let completed;
		for (let i = 0; i < 10; i++) {
			service.advanceCampaignTime(master.token, 8);
			completed = service.getNursery(master.token).projects.find(entry => entry.id === project.id);
			if (completed.status === 'egg_ready') break;
		}
		assert.equal(completed.status, 'egg_ready');
		assert.equal(completed.egg, undefined, 'o ovo pertencente ao NPC deve desaparecer');
		assert.equal(completed.parentCollected[completed.slot1.ownerId], true);
		assert.notEqual(completed.parentCollected[completed.slot2.ownerId], true);
		assert.throws(() => service.collectNurseryEgg(marina.token, project.id), /propriet\u00e1rio/);

		service.collectNurseryParent(marina.token, project.id);
		assert.equal(service.getBox(marina.token).team[0].metadata.breeding, undefined);
		assert.equal(service.getNursery(master.token).projects.find(entry => entry.id === project.id).status, 'collected');
	});

	it('lets the Master cancel an open NPC Slot 1 request', () => {
		let byte = 80;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		const master = service.loginMaster('14081998');
		const ivs = stats(31);
		const view = service.createMasterNurseryProject(master.token, {
			npcName: 'Criador', species: 'Charizard', sex: 'F', level: 50, ivs, item: '',
		});
		const project = view.projects.find(entry => entry.slot1.ownerName === 'Criador');
		const cancelled = service.cancelMasterNurseryProject(master.token, project.id);
		assert.equal(cancelled.projects.find(entry => entry.id === project.id).status, 'cancelled');
		assert.throws(() => service.createMasterNurseryProject(master.token, {
			npcName: 'Criador', species: 'Charmander', sex: 'M', level: 50, ivs, item: '',
		}), /n\u00e3o pode iniciar/);
		assert.throws(() => service.createMasterNurseryProject(master.token, {
			npcName: 'Criadora', species: 'Gardevoir', sex: 'M', level: 50, ivs, item: '',
		}), /sexo v\u00e1lido/);
	});

	it('lets the Master configure a compatible system partner for Slot 2', () => {
		let byte = 40;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const pokemonId = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const created = service.createNurseryProject(samuel.token, undefined, pokemonId);
		const projectId = created.projects.find(project => project.status === 'inviting').id;

		const masterView = service.getNursery(master.token);
		const options = masterView.projects.find(project => project.id === projectId).masterSlot2Options;
		assert.ok(options.some(option => option.species === 'Gallade' && option.sex === 'M'));
		assert.equal(options.every(option => option.sex === 'M'), true,
			'o gênero deve ser automaticamente oposto ao Slot 1');
		assert.equal(options.some(option => option.species === 'Ralts'), false,
			'primeiros estágios evoluíveis não devem aparecer');
		assert.equal(options.some(option => option.species === 'Pikachu'), false);
		assert.deepEqual(masterView.breedingItems.map(item => item.id), [
			'', 'everstone', 'destinyknot', 'powerweight', 'powerbracer',
			'powerbelt', 'powerlens', 'powerband', 'poweranklet',
		]);

		const ivs = {hp: 31, atk: 30, def: 29, spa: 28, spd: 27, spe: 26};
		const configured = service.setMasterNurserySlot2(master.token, {
			projectId, species: 'Gallade', level: 72, ivs, item: 'destinyknot',
		});
		const project = configured.projects.find(entry => entry.id === projectId);
		assert.equal(project.status, 'awaiting_confirmation');
		assert.equal(project.slot2.participantType, 'npc');
		assert.equal(project.slot2.level, 72);
		assert.equal(project.slot2.item, 'destinyknot');
		assert.deepEqual(project.slot2.ivs, ivs);
		assert.equal(project.confirmed[project.slot2.ownerId], true);
		assert.equal(project.confirmed[project.slot1.ownerId], false);

		const started = service.confirmNurseryProject(samuel.token, projectId);
		assert.equal(started.projects.find(entry => entry.id === projectId).status, 'breeding');
		let completed;
		for (let i = 0; i < 10; i++) {
			service.advanceCampaignTime(master.token, 8);
			completed = service.getNursery(master.token).projects.find(entry => entry.id === projectId);
			if (completed.status === 'egg_ready') break;
		}
		assert.equal(completed.status, 'egg_ready');
		assert.equal(completed.parentCollected[completed.slot2.ownerId], true,
			'o parceiro do sistema não deve aguardar resgate');
		assert.notEqual(completed.parentCollected[completed.slot1.ownerId], true);
		assert.throws(() => service.setMasterNurserySlot2(samuel.token, {
			projectId, species: 'Gallade', level: 72, ivs, item: '',
		}), /Somente o Mestre/);
	});

	it('rejects invalid Master-controlled Nursery partners and breeding settings', () => {
		let byte = 50;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const pokemonId = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const projectId = service.createNurseryProject(
			samuel.token, undefined, pokemonId
		).projects.find(project => project.status === 'inviting').id;
		const validIvs = stats(31);

		assert.throws(() => service.setMasterNurserySlot2(master.token, {
			projectId, species: 'Pikachu', level: 50, ivs: validIvs, item: '',
		}), /n\u00e3o pode reproduzir/);
		assert.throws(() => service.setMasterNurserySlot2(master.token, {
			projectId, species: 'Gallade', level: 101, ivs: validIvs, item: '',
		}), /entre 1 e 100/);
		assert.throws(() => service.setMasterNurserySlot2(master.token, {
			projectId, species: 'Gallade', level: 50, ivs: {...validIvs, hp: 32}, item: '',
		}), /IV deve estar entre 0 e 31/);
		assert.throws(() => service.setMasterNurserySlot2(master.token, {
			projectId, species: 'Gallade', level: 50, ivs: validIvs, item: 'leftovers',
		}), /n\u00e3o afeta a procria\u00e7\u00e3o/);
	});

	it('blocks evolvable first stages before they occupy a Nursery slot', () => {
		let byte = 60;
		const service = new RPGLoginService({
			masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Ralts', 'F', 'Synchronize')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const raltsF = service.getCharacter(samuel.token).box.party[0].pokemonId;
		assert.throws(() => service.createNurseryProject(samuel.token, undefined, raltsF), /primeiro est\u00e1gio/);

		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		service.replaceCharacterTeam(master.token, 'marina', [set('Ralts', 'M', 'Trace')]);
		const gardevoir = service.getCharacter(samuel.token).box.party[0].pokemonId;
		const marina = service.loginPlayer('marina', '1234');
		const raltsM = service.getCharacter(marina.token).box.party[0].pokemonId;
		const projectId = service.createNurseryProject(
			samuel.token, undefined, gardevoir
		).projects.find(project => project.status === 'inviting').id;
		assert.throws(() => service.acceptNurseryInvitation(marina.token, projectId, raltsM), /first-stage-pair/);
		assert.equal(service.getNursery(samuel.token).projects.find(project => project.id === projectId).slot2, undefined);
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

		let hatchBag = service.getBag(samuel.token);
		hatchBag = service.masterSetBagItemQuantity(
			master.token, 'samuel', 'pokeball', 2, hatchBag.revision, 'add'
		);
		hatchBag = service.masterSetBagItemQuantity(
			master.token, 'samuel', 'greatball', 2, hatchBag.revision, 'add'
		);
		const bagSlotsBeforeEgg = hatchBag.capacity.usedSlots;
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
		hatchBag = service.getBag(samuel.token);
		const pokeBallsBeforeHatch = hatchBag.items.find(item => item.id === 'pokeball').quantity;
		const greatBallsBeforeHatch = hatchBag.items.find(item => item.id === 'greatball').quantity;
		const result = service.hatchNurseryEgg(samuel.token, eggId);
		assert.equal(result.hatch.pokemon.species, 'Ralts');
		assert.equal(result.hatch.pokemon.level, 1);
		assert.equal(result.hatch.pokemon.rpg.captureBall, 'pokeball');
		hatchBag = service.getBag(samuel.token);
		assert.equal(hatchBag.items.find(item => item.id === 'pokeball').quantity, pokeBallsBeforeHatch - 1);
		assert.equal(hatchBag.items.find(item => item.id === 'greatball').quantity, greatBallsBeforeHatch);
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
		for (let i = 0; i < 9; i++) service.advanceCampaignTime(master.token, 8);
		view = service.getNursery(samuel.token);
		assert.equal(view.incubators[0].egg.status, 'ready_to_hatch');

		hatchBag = service.getBag(samuel.token);
		const remainingPokeBalls = hatchBag.items.find(item => item.id === 'pokeball')?.quantity || 0;
		if (remainingPokeBalls) {
			hatchBag = service.masterSetBagItemQuantity(
				master.token, 'samuel', 'pokeball', 0, hatchBag.revision, 'set'
			);
		}
		const remainingGreatBalls = hatchBag.items.find(item => item.id === 'greatball')?.quantity || 0;
		if (remainingGreatBalls) {
			hatchBag = service.masterSetBagItemQuantity(
				master.token, 'samuel', 'greatball', 0, hatchBag.revision, 'set'
			);
		}
		assert.throws(() => service.hatchNurseryEgg(samuel.token, view.incubators[0].egg.eggId), /Poké Ball/);
		assert.equal(service.getNursery(samuel.token).incubators[0].egg.status, 'ready_to_hatch');

		hatchBag = service.masterSetBagItemQuantity(
			master.token, 'samuel', 'greatball', 1, hatchBag.revision, 'add'
		);
		const fallback = service.hatchNurseryEgg(samuel.token, view.incubators[0].egg.eggId);
		assert.equal(fallback.hatch.pokemon.rpg.captureBall, 'greatball');
		assert.equal(service.getBag(samuel.token).items.find(item => item.id === 'greatball'), undefined);
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
	});

	it('silently releases uncollected parents after 30 campaign days and lets the Master restore or delete them', () => {
		let byte = 100;
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({
			masterCode: '14081998', repository,
			random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte),
		});
		create(service, 'Samuel');
		create(service, 'Marina');
		const master = service.loginMaster('14081998');
		service.replaceCharacterTeam(master.token, 'samuel', [set('Gardevoir', 'F', 'Synchronize')]);
		service.replaceCharacterTeam(master.token, 'marina', [set('Gardevoir', 'F', 'Synchronize')]);
		const samuel = service.loginPlayer('samuel', '1234');
		const marina = service.loginPlayer('marina', '1234');
		const originalIds = {};

		for (const [name, session] of [['samuel', samuel], ['marina', marina]]) {
			const pokemonId = service.getCharacter(session.token).box.party[0].pokemonId;
			originalIds[name] = pokemonId;
			const created = service.createNurseryProject(session.token, undefined, pokemonId);
			const projectId = created.projects.find(project => project.status === 'inviting').id;
			service.setMasterNurserySlot2(master.token, {
				projectId, species: 'Gallade', level: 50, ivs: stats(31), item: '',
			});
			service.confirmNurseryProject(session.token, projectId);
		}
		for (let i = 0; i < 10; i++) service.advanceCampaignTime(master.token, 8);
		const playerView = service.getNursery(samuel.token);
		assert.equal(Object.hasOwn(playerView, 'releasedPokemon'), false);
		assert.equal(Object.hasOwn(playerView.projects[0], 'parentRescueRemainingMs'), false);

		for (let i = 0; i < 90; i++) service.advanceCampaignTime(master.token, 8);
		assert.equal(service.getCharacter(samuel.token).box.party.length, 0);
		assert.equal(service.getCharacter(marina.token).box.party.length, 0);
		let masterView = service.getNursery(master.token);
		assert.equal(masterView.releasedPokemon.length, 2);
		const samuelReleased = masterView.releasedPokemon.find(entry => entry.ownerId === 'samuel');
		const marinaReleased = masterView.releasedPokemon.find(entry => entry.ownerId === 'marina');

		service.replaceCharacterTeam(master.token, 'samuel', Array.from({length: 6}, () =>
			set('Squirtle', 'M', 'Torrent')));
		const restored = service.restoreReleasedNurseryPokemon(master.token, samuelReleased.id);
		assert.equal(restored.destination, 'box');
		const samuelState = service.getCharacter(samuel.token);
		assert.equal(samuelState.box.party.length, 6);
		assert.equal(samuelState.box.boxes.some(box =>
			box.slots.some(entry => entry?.pokemonId === originalIds.samuel)), true);

		const deleted = service.deleteReleasedNurseryPokemon(master.token, marinaReleased.id);
		assert.equal(deleted.deletedPokemonId, originalIds.marina);
		masterView = service.getNursery(master.token);
		assert.equal(masterView.releasedPokemon.length, 0);
		assert.equal(service.getCharacter(marina.token).box.party.length, 0);
	});
});
