'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { RPGItems, RPG_GEN9_TM_CATALOG } = require('../../dist/sim/rpg-showdown');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

function createService() {
	let byte = 0;
	return new RPGLoginService({
		masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
		random: () => 0.5, randomBytes: size => Buffer.alloc(size, ++byte), now: () => 1_800_000_000_000,
	});
}

function createCharacter(service, name, species) {
	return service.createCharacter({
		characterName: name, playerName: name, avatar: 'lucas', password: 'senha-rpg',
		initialMoney: 3000, starter: { species, gender: 'M', level: 10 },
	});
}

describe('RPG generation 9 Technical Machines', () => {
	it('registers all 229 Scarlet/Violet TMs with valid and unique moves', () => {
		const tms = RPGItems.list('tm');
		assert.equal(RPG_GEN9_TM_CATALOG.length, 229);
		assert.equal(tms.length, 229);
		assert.equal(new Set(tms.map(item => item.id)).size, 229);
		assert.equal(new Set(tms.map(item => item.effect.move)).size, 229);
		assert.deepEqual(
			['tm001', 'tm171', 'tm172', 'tm201', 'tm202', 'tm229'].map(id => RPGItems.require(id).effect.move),
			['takedown', 'terablast', 'roar', 'mistyexplosion', 'painsplit', 'upperhand']
		);
		for (const item of tms) {
			assert.equal(item.usableInBattle, false);
			assert.equal(item.consumedOnUse, true);
			assert(Dex.mod('gen9').moves.get(item.effect.move).exists, item.name);
		}
	});

	it('checks the gen 9 learnset, preserves PP and consumes only after learning', () => {
		const service = createService();
		createCharacter(service, 'Pikachu', 'Pikachu');
		const record = service.repository.get('pikachu');
		record.state.box.party[0].pokemon.moves = ['Tackle', 'Charm', 'Growl', 'Quick Attack'];
		record.state.box.party[0].pokemon.rpg.pp = [7, 8, 9, 10];
		record.state.inventory.bag.items = [{ itemId: 'tm126', quantity: 1 }];
		service.repository.set(record);
		const player = service.loginPlayer('pikachu', 'senha-rpg');
		const targets = service.getTechnicalMachineTargets(player.token, undefined, 'tm126');
		assert.equal(targets.move.name, 'Thunderbolt');
		assert.equal(targets.targets.length, 1);
		assert.equal(targets.targets[0].hasOpenMoveSlot, false);
		assert.throws(() => service.useTechnicalMachine(
			player.token, undefined, targets.targets[0].pokemonId, 'tm126', undefined, 'tm-fail',
			targets.boxRevision, targets.bagRevision
		), /quatro movimentos/);
		assert.equal(service.repository.get('pikachu').state.inventory.bag.items[0].quantity, 1);
		const learned = service.useTechnicalMachine(
			player.token, undefined, targets.targets[0].pokemonId, 'tm126', 'charm', 'tm-learn',
			targets.boxRevision, targets.bagRevision
		);
		assert.equal(learned.learned.moveName, 'Thunderbolt');
		assert.equal(learned.learned.forgottenMoveName, 'Charm');
		assert.deepEqual(learned.box.team[0].moves.map(move => move.id), ['tackle', 'thunderbolt', 'growl', 'quickattack']);
		assert.equal(learned.box.team[0].moves[1].pp, Dex.mod('gen9').moves.get('thunderbolt').pp);
		assert.equal(learned.inventory.bag.items.length, 0);
		const replay = service.useTechnicalMachine(
			player.token, undefined, targets.targets[0].pokemonId, 'tm126', 'charm', 'tm-learn',
			targets.boxRevision, targets.bagRevision
		);
		assert.equal(replay.replayed, true);
	});

	it('lists and teaches TMs only to Pokemon in the current team', () => {
		const service = createService();
		createCharacter(service, 'Pikachu', 'Pikachu');
		const master = service.loginMaster('14081998');
		const player = service.loginPlayer('pikachu', 'senha-rpg');
		const starter = structuredClone(service.repository.get('pikachu').state.box.party[0].pokemon);
		starter.name = 'Pikachu da Box';
		starter.moves = ['Tackle'];
		starter.rpg.pp = [35];
		let box = service.masterAddBoxPokemon(master.token, 'pikachu', starter);
		const stored = box.results.find(pokemon => pokemon.name === 'Pikachu da Box');
		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId: stored.pokemonId,
			destination: { destination: 'box', boxIndex: 0, slot: 0 },
			expectedRevision: box.revision,
		});
		const record = service.repository.get('pikachu');
		record.state.box.party[0].pokemon.moves = ['Tackle'];
		record.state.box.party[0].pokemon.rpg.pp = [35];
		record.state.inventory.bag.items = [{ itemId: 'tm126', quantity: 2 }];
		service.repository.set(record);

		const targets = service.getTechnicalMachineTargets(player.token, undefined, 'tm126');
		assert.equal(targets.targets.length, 1);
		assert.equal(targets.targets[0].eligible, true);
		assert.equal(targets.targets[0].location, undefined);
		assert.notEqual(targets.targets[0].pokemonId, stored.pokemonId);
		assert.equal(typeof targets.move.description, 'string');
		assert(targets.move.description.length > 0);
		assert.equal(typeof targets.move.targetLabel, 'string');
		assert(Array.isArray(targets.move.flags));
		assert(Array.isArray(targets.move.effects));
		assert.equal(typeof targets.targets[0].moves[0].description, 'string');
		assert.throws(() => service.useTechnicalMachine(
			player.token, undefined, stored.pokemonId, 'tm126', undefined, 'tm-box-blocked',
			targets.boxRevision, targets.bagRevision
		), /equipe atual/);
		assert.equal(service.repository.get('pikachu').state.inventory.bag.items[0].quantity, 2);
	});

	it('reuses the complete battle move card in the TM teaching window', () => {
		const fs = require('node:fs');
		const battleRoom = fs.readFileSync('server/static/rpg/battle-room.js', 'utf8');
		const interfaceScript = fs.readFileSync('server/static/rpg/rpg.js', 'utf8');
		assert(battleRoom.includes('globalThis.RPGBattleMoveCard'));
		assert(interfaceScript.includes('globalThis.RPGBattleMoveCard.render'));
		assert(interfaceScript.includes("createElement('h3', '', 'Em quem ensinar?')"));
		assert(interfaceScript.includes("'rpg-move-learning-card-art', 'rpg-tm-combat-move'"));
		assert(interfaceScript.includes("targetButton.disabled = !pokemon.eligible"));
		assert(interfaceScript.includes("pokemon.disabledReason"));
	});

	it('lists no target for an incompatible species and fills an open move slot', () => {
		const service = createService();
		createCharacter(service, 'Bulbasaur', 'Bulbasaur');
		const record = service.repository.get('bulbasaur');
		record.state.box.party[0].pokemon.moves = ['Tackle'];
		record.state.box.party[0].pokemon.rpg.pp = [11];
		record.state.inventory.bag.items = [
			{ itemId: 'tm126', quantity: 1 }, { itemId: 'tm007', quantity: 1 },
		];
		service.repository.set(record);
		const player = service.loginPlayer('bulbasaur', 'senha-rpg');
		const incompatible = service.getTechnicalMachineTargets(player.token, undefined, 'tm126').targets;
		assert.equal(incompatible.length, 1);
		assert.equal(incompatible[0].eligible, false);
		assert.equal(incompatible[0].disabledReason, 'Não pode aprender esta TM');
		const targets = service.getTechnicalMachineTargets(player.token, undefined, 'tm007');
		assert.equal(targets.targets[0].hasOpenMoveSlot, true);
		const learned = service.useTechnicalMachine(
			player.token, undefined, targets.targets[0].pokemonId, 'tm007', undefined, 'tm-open-slot',
			targets.boxRevision, targets.bagRevision
		);
		assert.deepEqual(learned.box.team[0].moves.map(move => move.id), ['tackle', 'protect']);
		assert.deepEqual(learned.box.team[0].moves.map(move => move.pp), [11, Dex.mod('gen9').moves.get('protect').pp]);
	});
});
