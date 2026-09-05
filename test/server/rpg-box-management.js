'use strict';

const assert = require('assert').strict;
const http = require('node:http');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const {
	RPGLoginService,
	RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');

function createService() {
	let byte = 0;
	let randomState = 0x12345678;
	return new RPGLoginService({
		masterCode: '14081998',
		repository: new RPGMemoryCharacterRepository(),
		random: () => {
			randomState = (1664525 * randomState + 1013904223) >>> 0;
			return randomState / 0x100000000;
		},
		randomBytes: size => Buffer.alloc(size, ++byte),
		now: () => 1_800_000_000_000,
	});
}

function createCharacter(service, name, species, password) {
	return service.createCharacter({
		characterName: name,
		playerName: name + ' real',
		avatar: 'lucas',
		password,
		initialMoney: 3000,
		starter: { species, gender: 'M', level: 10 },
	});
}

describe('RPG Box management backend', () => {
	it('exposes the Box contract through authenticated HTTP routes', async () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const handler = new RPGHttpServer(service);
		const server = http.createServer((req, res) => handler.handle(req, res));
		await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
		const base = 'http://127.0.0.1:' + server.address().port + '/api/rpg';
		const request = async (path, options = {}) => {
			const response = await fetch(base + path, {
				...options,
				headers: {
					Authorization: 'Bearer ' + player.token,
					...(options.body ? { 'Content-Type': 'application/json' } : {}),
				},
				body: options.body ? JSON.stringify(options.body) : undefined,
			});
			return { response, data: await response.json() };
		};
		try {
			let result = await request('/box?search=Squirtle&type=Water&status=alive');
			assert.equal(result.response.status, 200);
			assert.equal(result.data.box.results.length, 1);
			result = await request('/box/boxes/0', {
				method: 'PATCH',
				body: { name: 'Aqu?ticos', expectedRevision: result.data.box.revision },
			});
			assert.equal(result.response.status, 200);
			assert.equal(result.data.box.boxes[0].name, 'Aqu?ticos');
			const pokemonId = result.data.box.team[0].pokemonId;
			result = await request('/box/pokemon/' + encodeURIComponent(pokemonId) + '/metadata', {
				method: 'POST',
				body: { metadata: { favorite: true }, expectedRevision: result.data.box.revision },
			});
			assert.equal(result.response.status, 200);
			assert.equal(result.data.box.team[0].metadata.favorite, true);
		} finally {
			await new Promise(resolve => server.close(resolve));
		}
	});

	it('returns a complete searchable read model without exposing another player Box', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		createCharacter(service, 'Carlos', 'Charmander', 'outra-senha');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const box = service.getBox(player.token);

		assert.equal(box.version, 1);
		assert.equal(box.tier, 'small');
		assert.equal(box.team.length, 1);
		assert.equal(box.team[0].species, 'Squirtle');
		assert.equal(box.team[0].pokedexNumber, 7);
		assert.deepEqual(box.team[0].types, ['Water']);
		assert.equal(box.team[0].moves.length > 0, true);
		assert.equal(box.results.length, 1);
		assert.equal(service.getBox(player.token, undefined, { search: '007' }).results.length, 1);
		assert.equal(service.getBox(player.token, undefined, { type: 'fire' }).results.length, 0);
		assert.throws(() => service.getBox(player.token, 'carlos'), /cannot access another character/);
	});

	it('renames Boxes, moves Pokemon, preserves metadata, heals and rejects stale revisions', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		let box = service.getBox(player.token);
		const pokemonId = box.team[0].pokemonId;

		box = service.renameCharacterBox(player.token, undefined, 0, 'Água', box.revision);
		assert.equal(box.boxes[0].name, 'Água');
		assert.throws(() => service.renameCharacterBox(
			player.token, undefined, 0, 'Antiga', box.revision - 1
		), /revision conflict/);

		box = service.updateBoxPokemonMetadata(player.token, undefined, pokemonId, {
			favorite: true, favoriteMarker: 'ribbon', companion: true, training: 'ev',
		}, box.revision);
		assert.deepEqual(box.team[0].indicators.sort(), ['companion', 'favorite', 'training']);
		assert.equal(box.team[0].metadata.favoriteMarker, 'ribbon');
		assert.throws(() => service.updateBoxPokemonMetadata(
			player.token, undefined, pokemonId, { favoriteMarker: 'invalid' }, box.revision
		), /favorite marker/);

		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId, destination: { destination: 'box', boxIndex: 0, slot: 4 },
			expectedRevision: box.revision,
		});
		assert.equal(box.team.length, 0);
		assert.equal(box.boxes[0].pokemon[0].location.slot, 4);
		assert.equal(box.boxes[0].pokemon[0].metadata.favorite, true);
		assert.equal(box.boxes[0].pokemon[0].metadata.favoriteMarker, 'ribbon');

		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId, destination: { destination: 'party', position: 0 },
			expectedRevision: box.revision,
		});
		assert.equal(service.getCharacter(player.token).team[0].species, 'Squirtle');

		const master = service.loginMaster('14081998');
		box = service.masterEditBoxPokemon(master.token, 'samuel', pokemonId, {
			hp: 1, pp: [0, ...box.team[0].moves.slice(1).map(() => 1)], status: 'psn',
			experience: 5000, item: 'oranberry', ot: 'Professor',
		}, box.revision);
		assert.equal(box.team[0].hp, 1);
		assert.equal(box.team[0].status, 'psn');
		assert.equal(box.team[0].metadata.ot, 'Professor');

		box = service.healBoxPokemonAtCenter(player.token, undefined, pokemonId, box.revision);
		assert.equal(box.team[0].hp, box.team[0].maxHP);
		assert.equal(box.team[0].status, '');
		assert(box.team[0].moves.every(move => move.pp === move.maxPP));
		const original = service.getCharacter(player.token).team[0];
		const invalid = structuredClone(original);
		invalid.nature = invalid.nature === 'Jolly' ? 'Hardy' : 'Jolly';
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, invalid, box.revision
		), /field is locked: nature/);
		const edited = structuredClone(original);
		edited.level = 11;
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, edited, box.revision
		), /field is locked: level/);
	});

	it('swaps Pokemon when an occupied party or Box slot receives a drop', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const starter = structuredClone(service.repository.get('samuel').state.box.party[0].pokemon);
		const squirtleId = service.getBox(player.token).team[0].pokemonId;
		const bulbasaur = structuredClone(starter);
		bulbasaur.name = bulbasaur.species = 'Bulbasaur';
		bulbasaur.moves = ['tackle'];
		let box = service.masterAddBoxPokemon(master.token, 'samuel', bulbasaur);
		const bulbasaurId = box.results.find(pokemon => pokemon.species === 'Bulbasaur').pokemonId;
		const charmander = structuredClone(starter);
		charmander.name = charmander.species = 'Charmander';
		charmander.moves = ['scratch'];
		box = service.masterAddBoxPokemon(master.token, 'samuel', charmander);
		const charmanderId = box.results.find(pokemon => pokemon.species === 'Charmander').pokemonId;

		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId: bulbasaurId,
			destination: { destination: 'box', boxIndex: 0, slot: 1 },
			expectedRevision: box.revision,
		});
		assert.equal(box.boxes[0].pokemon.find(pokemon => pokemon.location.slot === 0).pokemonId, charmanderId);
		assert.equal(box.boxes[0].pokemon.find(pokemon => pokemon.location.slot === 1).pokemonId, bulbasaurId);

		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId: charmanderId,
			destination: { destination: 'party', position: 0 },
			expectedRevision: box.revision,
		});
		assert.equal(box.team[0].pokemonId, charmanderId);
		assert.equal(box.boxes[0].pokemon.find(pokemon => pokemon.location.slot === 0).pokemonId, squirtleId);

		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId: bulbasaurId,
			destination: { destination: 'party', position: 1 },
			expectedRevision: box.revision,
		});
		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId: charmanderId,
			destination: { destination: 'party', position: 1 },
			expectedRevision: box.revision,
		});
		assert.deepEqual(box.team.map(pokemon => pokemon.pokemonId), [bulbasaurId, charmanderId]);
	});
	it('lists only applicable Bag medicine and persists safe item consumption', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		const record = service.repository.get('samuel');
		record.state.inventory.bag.items = [
			{ itemId: 'potion', quantity: 2 },
			{ itemId: 'revive', quantity: 1 },
			{ itemId: 'antidote', quantity: 1 },
		];
		service.repository.set(record);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		let box = service.getBox(player.token);
		const pokemonId = box.team[0].pokemonId;
		box = service.masterEditBoxPokemon(master.token, 'samuel', pokemonId, { hp: 1 }, box.revision);
		let available = service.getBoxHealingItems(player.token, undefined, pokemonId);
		assert.deepEqual(available.items.map(item => item.id), ['potion']);
		let used = service.useBoxHealingItem(
			player.token, undefined, pokemonId, 'potion', 'box-heal-1',
			available.boxRevision, available.bagRevision
		);
		assert.equal(used.box.team[0].hp, 21);
		assert.equal(used.inventory.bag.items.find(item => item.itemId === 'potion').quantity, 1);

		box = service.masterEditBoxPokemon(
			master.token, 'samuel', pokemonId, { hp: 0, status: 'psn' }, used.box.revision
		);
		available = service.getBoxHealingItems(player.token, undefined, pokemonId);
		assert.deepEqual(available.items.map(item => item.id), ['revive']);
		used = service.useBoxHealingItem(
			player.token, undefined, pokemonId, 'revive', 'box-heal-2',
			available.boxRevision, available.bagRevision
		);
		assert(used.box.team[0].hp > 0);
		assert.equal(used.inventory.bag.items.some(item => item.itemId === 'revive'), false);
	});
	it('uses evolution items once, preserves the Pokemon and supports gender branches', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Eevee', 'senha-rpg');
		let record = service.repository.get('samuel');
		record.state.box.party[0].pokemon.name = 'Parceiro';
		record.state.inventory.bag.items = [{ itemId: 'waterstone', quantity: 2 }];
		service.repository.set(record);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		let targets = service.getEvolutionItemTargets(player.token, undefined, 'waterstone');
		assert.deepEqual(targets.targets[0].options.map(option => option.toSpecies), ['Vaporeon']);
		const pokemonId = targets.targets[0].pokemonId;
		const evolved = service.useEvolutionItem(
			player.token, undefined, pokemonId, 'waterstone', 'Vaporeon', 'evolve-eevee',
			targets.boxRevision, targets.bagRevision
		);
		assert.equal(evolved.evolution.fromSpecies, 'Eevee');
		assert.equal(evolved.evolution.toSpecies, 'Vaporeon');
		assert.equal(evolved.box.team[0].species, 'Vaporeon');
		assert.equal(evolved.box.team[0].name, 'Parceiro');
		assert.equal(evolved.inventory.bag.items[0].quantity, 1);
		const replay = service.useEvolutionItem(
			player.token, undefined, pokemonId, 'waterstone', 'Vaporeon', 'evolve-eevee',
			targets.boxRevision, targets.bagRevision
		);
		assert.equal(replay.replayed, true);
		assert.equal(replay.inventory.bag.items[0].quantity, 1);

		createCharacter(service, 'Gallade', 'Kirlia', 'senha-gallade');
		record = service.repository.get('gallade');
		record.state.box.party[0].pokemon.gender = 'M';
		record.state.inventory.bag.items = [{ itemId: 'dawnstone', quantity: 1 }];
		service.repository.set(record);
		const galladePlayer = service.loginPlayer('gallade', 'senha-gallade');
		targets = service.getEvolutionItemTargets(galladePlayer.token, undefined, 'dawnstone');
		assert.deepEqual(targets.targets[0].options.map(option => option.toSpecies), ['Gallade']);

		createCharacter(service, 'Froslass', 'Snorunt', 'senha-froslass');
		record = service.repository.get('froslass');
		record.state.box.party[0].pokemon.gender = 'F';
		record.state.inventory.bag.items = [{ itemId: 'dawnstone', quantity: 1 }];
		service.repository.set(record);
		const froslassPlayer = service.loginPlayer('froslass', 'senha-froslass');
		targets = service.getEvolutionItemTargets(froslassPlayer.token, undefined, 'dawnstone');
		assert.deepEqual(targets.targets[0].options.map(option => option.toSpecies), ['Froslass']);
	});
	it('requires a release challenge and lets only the master add or transfer Pokemon', () => {
		const service = createService();
		createCharacter(service, 'Samuel', 'Squirtle', 'senha-rpg');
		createCharacter(service, 'Carlos', 'Charmander', 'outra-senha');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		let source = service.getBox(player.token);
		const starter = structuredClone(service.repository.get('samuel').state.box.party[0].pokemon);
		starter.name = 'Bulba';
		starter.species = 'Bulbasaur';
		starter.moves = ['tackle'];
		source = service.masterAddBoxPokemon(master.token, 'samuel', starter);
		const added = source.results.find(pokemon => pokemon.species === 'Bulbasaur');
		assert(added);
		assert.throws(() => service.masterAddBoxPokemon(player.token, 'samuel', starter), /master session required/);

		const destination = service.getBox(master.token, 'carlos');
		const transfer = service.transferBoxPokemon(
			master.token, 'samuel', 'carlos', added.pokemonId, source.revision, destination.revision
		);
		assert.equal(transfer.source.results.some(pokemon => pokemon.pokemonId === added.pokemonId), false);
		assert.equal(transfer.destination.results.some(pokemon => pokemon.pokemonId === added.pokemonId), true);

		source = service.getBox(player.token);
		const challenge = service.createPokemonReleaseChallenge(
			player.token, undefined, source.team[0].pokemonId, source.revision
		);
		assert.equal(challenge.pokemonName, source.team[0].name);
		assert.throws(() => service.releaseBoxPokemon(player.token, challenge.challengeId, false), /not confirmed/);
		const second = service.createPokemonReleaseChallenge(
			player.token, undefined, source.team[0].pokemonId, source.revision
		);
		source = service.releaseBoxPokemon(player.token, second.challengeId, true);
		assert.equal(source.results.length, 0);
	});
});
