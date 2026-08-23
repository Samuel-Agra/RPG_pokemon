'use strict';

const assert = require('assert').strict;
const http = require('node:http');
const {
	RPGLoginService,
	RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const { RPGItems } = require('../../dist/sim/rpg-showdown');

function setup() {
	let clock = 1_800_000_000_000;
	let byte = 0;
	const service = new RPGLoginService({
		masterCode: '14081998',
		repository: new RPGMemoryCharacterRepository(),
		random: () => 0.25,
		randomBytes: size => Buffer.alloc(size, ++byte),
		now: () => clock,
	});
	service.createCharacter({
		characterName: 'Samuel',
		playerName: 'Samuel real',
		avatar: 'lucas',
		password: 'senha-rpg',
		initialMoney: 3000,
		starter: { species: 'Squirtle', gender: 'M', level: 10 },
	});
	return {
		service,
		advance(milliseconds) { clock += milliseconds; },
	};
}

function setTrainingEVs(service) {
	const record = service.repository.get('samuel');
	const pokemon = record.state.box.party[0].pokemon;
	pokemon.evs = { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 };
	pokemon.rpg.evs = { ...pokemon.evs };
	service.repository.set(record);
}

describe('RPG Team Builder management backend', () => {
	it('registers the RPG vitamins as +2 IV items with balanced prices and sprites', () => {
		const expected = {
			hpup: 'hp', protein: 'atk', iron: 'def',
			calcium: 'spa', zinc: 'spd', carbos: 'spe',
		};
		for (const [itemId, stat] of Object.entries(expected)) {
			const item = RPGItems.require(itemId);
			assert.equal(item.source, 'showdown');
			assert.equal(item.category, 'healing');
			assert.equal(item.usableInBattle, false);
			assert.equal(item.consumedOnUse, true);
			assert.deepEqual(item.effect, { type: 'raise-iv', stat, amount: 2 });
			assert.equal(item.price.buy, 150000);
			assert.equal(item.price.sell, 37500);
		}
	});

	it('opens an existing Pokemon with locked RPG fields and Bag-backed choices', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		let bag = service.getBag(master.token, 'samuel');
		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'leftovers', 1, bag.revision, 'add');
		bag = service.getBag(master.token, 'samuel');
		service.masterSetBagItemQuantity(master.token, 'samuel', 'oranberry', 1, bag.revision, 'add');
		bag = service.getBag(master.token, 'samuel');
		service.masterSetBagItemQuantity(master.token, 'samuel', 'hpup', 2, bag.revision, 'add');
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);

		assert.equal(view.pokemon.species, 'Squirtle');
		assert.deepEqual(view.pokemon.ivs, { hp: 16, atk: 16, def: 16, spa: 16, spd: 16, spe: 16 });
		assert.equal(view.permissions.nature, false);
		assert.equal(view.permissions.ivsDirect, false);
		assert.equal(view.permissions.evsDirect, false);
		assert.equal(view.permissions.level, false);
		assert.equal(view.permissions.ability, false);
		assert.equal(view.permissions.moves, false);
		assert.equal(view.permissions.nickname, true);
		assert.deepEqual(view.natures, [view.pokemon.nature]);
		assert.equal(view.items.choices.some(item => item.id === 'leftovers' && item.quantity === 1), true);
		assert.equal(view.items.choices.some(item => item.id === 'leftovers' && !item.berry), true);
		assert.equal(view.items.choices.some(item => item.id === 'oranberry' && item.berry), true);
		assert.equal(view.ivs.vitamins.find(item => item.id === 'hpup').quantity, 2);
		assert.equal(view.moves.choices.some(move => move.source === 'level'), true);
		assert.equal(view.permissions.training, true);
		assert.equal(view.stats.length, 6);
		assert.equal(view.stats.every(stat => Number.isSafeInteger(stat.total)), true);
		assert.match(view.nature.label, /\(|neutra/);
		assert.equal(view.items.choices.find(item => item.id === 'leftovers').description.length > 10, true);
		assert.equal(view.evs.training.costPerStep, 500);
		assert.equal(view.evs.training.evStep, 4);
		assert.equal(view.evs.training.roleplayDurationPerStepMs, 30 * 60 * 1000);
		assert.equal(view.evs.training.timed, true);
		assert.equal(view.evs.training.cumulative, true);
		assert.equal(view.evs.training.partyOnly, true);
	});

	it('keeps the party Team Builder available when only the Box page is blocked', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const box = service.getBox(player.token);
		const pokemonId = box.team[0].pokemonId;
		service.setCharacterPageAccess(master.token, 'samuel', 'box', false);

		assert.throws(() => service.getBox(player.token), /bloqueou o acesso .* Box/);
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		assert.equal(view.pokemon.pokemonId, pokemonId);

		const renamed = structuredClone(service.getCharacter(player.token).team[0]);
		renamed.name = 'Casco';
		const updated = service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, renamed, view.boxRevision
		);
		assert.equal(updated.team[0].name, 'Casco');
	});

	it('lists both Generation 9 Charizard abilities with Portuguese descriptions', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const record = service.repository.get('samuel');
		const pokemon = record.state.box.party[0].pokemon;
		pokemon.species = 'Charizard';
		pokemon.name = 'Charizard';
		pokemon.ability = 'Blaze';
		service.repository.set(record);
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		assert.deepEqual(view.abilities.map(ability => ability.id).sort(), ['blaze', 'solarpower']);
		assert.equal(view.abilities.find(ability => ability.id === 'blaze').hidden, false);
		assert.equal(view.abilities.find(ability => ability.id === 'solarpower').hidden, true);
		for (const ability of view.abilities) {
			assert.equal(ability.description.includes('ainda não está disponível'), false, ability.name);
		}
	});

	it('allows Player nicknames but locks direct Ability and move edits behind their systems', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		let box = service.getBox(player.token);
		const pokemonId = box.team[0].pokemonId;
		const original = structuredClone(service.getCharacter(player.token).team[0]);
		const invalid = structuredClone(original);
		invalid.level++;
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, invalid, box.revision
		), /field is locked: level/);

		const renamed = structuredClone(original);
		renamed.name = 'Casco';
		box = service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, renamed, box.revision
		);
		assert.equal(box.team[0].name, 'Casco');

		const changedAbility = structuredClone(service.getCharacter(player.token).team[0]);
		changedAbility.ability = 'Rain Dish';
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, changedAbility, box.revision
		), /field is locked: ability/);

		const changedMoves = structuredClone(service.getCharacter(player.token).team[0]);
		changedMoves.moves = ['Tackle', 'Tail Whip'];
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, changedMoves, box.revision
		), /field is locked: moves/);
	});

	it('lets a Player swap move slots while preserving each move PP without consuming a TM', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const record = service.repository.get('samuel');
		const pokemon = record.state.box.party[0].pokemon;
		pokemon.moves = ['Tackle', 'Tail Whip', 'Water Gun'];
		pokemon.rpg.pp = [11, 22, 7];
		service.repository.set(record);

		const before = service.getPokemonTeamBuilder(player.token, undefined, record.state.box.party[0].pokemonId);
		const bagRevision = before.bagRevision;
		const reordered = service.reorderPokemonMoves(
			player.token, undefined, before.pokemon.pokemonId, 0, 2, before.boxRevision
		);

		assert.deepEqual(reordered.pokemon.moves.map(move => move.name), ['Water Gun', 'Tail Whip', 'Tackle']);
		assert.deepEqual(reordered.pokemon.moves.map(move => move.pp), [7, 22, 11]);
		assert.equal(reordered.bagRevision, bagRevision);
		assert.throws(() => service.reorderPokemonMoves(
			player.token, undefined, before.pokemon.pokemonId, 0, 3, reordered.boxRevision
		), /Invalid RPG Pokemon move slot/);
	});

	it('opens a stored Box Pokemon as read-only and rejects Team Builder mutations', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		let box = service.getBox(player.token);
		const pokemonId = box.team[0].pokemonId;
		box = service.moveBoxPokemon(player.token, undefined, {
			pokemonId, destination: { destination: 'box', boxIndex: 0, slot: 0 },
			expectedRevision: box.revision,
		});
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		assert.equal(view.readOnly, true);
		assert.equal(view.permissions.nickname, false);
		assert.equal(view.permissions.itemFromBag, false);
		assert.equal(view.permissions.training, false);
		const record = service.repository.get('samuel');
		const candidate = structuredClone(record.state.box.boxes[0].slots[0].pokemon);
		candidate.name = 'Não pode mudar';
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			player.token, undefined, pokemonId, candidate, box.revision
		), /apenas para consulta/);
		assert.throws(() => service.reorderPokemonMoves(
			player.token, undefined, pokemonId, 0, 1, box.revision
		), /apenas para consulta/);
	});
	it('schedules cumulative EV redistribution until the Master advances campaign time', () => {
		const { service, advance } = setup();
		setTrainingEVs(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		const result = service.trainPokemonEVs(
			player.token, undefined, pokemonId, 'hp', 'spe', 12, view.boxRevision
		);
		assert.equal(result.teamBuilder.money, 1500);
		assert.equal(result.teamBuilder.evs.values.hp, 252);
		assert.equal(result.teamBuilder.evs.values.spe, 0);
		assert.equal(result.teamBuilder.permanentState.training, 'ev');
		assert.equal(result.teamBuilder.readOnly, true);
		assert.equal(service.getBox(player.token).team.some(pokemon => pokemon.pokemonId === pokemonId), true);
		assert.throws(() => service.moveBoxPokemon(player.token, undefined, {
			pokemonId, destination: { destination: 'box', boxIndex: 0, slot: 0 },
			expectedRevision: result.teamBuilder.boxRevision,
		}), /deve permanecer na equipe/);
		assert.deepEqual(result.training, {
			fromStat: 'hp', toStat: 'spe', amount: 12, steps: 3, cost: 1500,
			roleplayDurationMs: 90 * 60 * 1000,
		});
		advance(4 * 60 * 60 * 1000);
		assert.equal(service.getPokemonTeamBuilder(player.token, undefined, pokemonId).evs.values.hp, 252);
		let clock = service.advanceCampaignTime(master.token, 1);
		assert.equal(clock.trainings.completed, 0);
		clock = service.advanceCampaignTime(master.token, 1);
		assert.equal(clock.trainings.completed, 1);
		const completed = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		assert.equal(completed.evs.values.hp, 240);
		assert.equal(completed.evs.values.spe, 12);
		assert.equal(completed.permanentState.training, 'none');
		assert.equal(completed.readOnly, false);
		assert.throws(() => service.trainPokemonEVs(
			player.token, undefined, pokemonId, 'hp', 'spe', 6, completed.boxRevision
		), /múltiplo positivo de 4/);
	});

	it('applies a six-field EV redistribution after its campaign duration', () => {
		const { service } = setup();
		setTrainingEVs(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		const evs = { hp: 240, atk: 248, def: 4, spa: 0, spd: 0, spe: 16 };
		const result = service.trainPokemonEVDistribution(player.token, undefined, pokemonId, evs, view.boxRevision);
		assert.equal(result.training.amount, 16);
		assert.equal(result.training.steps, 4);
		assert.equal(result.training.cost, 2000);
		assert.equal(result.training.roleplayDurationMs, 120 * 60 * 1000);
		assert.deepEqual(result.teamBuilder.evs.values, { hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 });
		service.advanceCampaignTime(master.token, 1);
		assert.deepEqual(service.getPokemonTeamBuilder(player.token, undefined, pokemonId).evs.values,
			{ hp: 252, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 });
		service.advanceCampaignTime(master.token, 1);
		assert.deepEqual(service.getPokemonTeamBuilder(player.token, undefined, pokemonId).evs.values, evs);
	});

	it('consumes one vitamin atomically, adds 2 IV and safely replays the same action', () => {
		const { service } = setup();
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const bag = service.getBag(master.token, 'samuel');
		service.masterSetBagItemQuantity(master.token, 'samuel', 'hpup', 1, bag.revision, 'add');
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		let result = service.usePokemonIVVitamin(
			player.token, undefined, pokemonId, 'hpup', 'vitamin-action-1',
			view.boxRevision, view.bagRevision
		);
		assert.equal(result.replayed, false);
		assert.equal(result.teamBuilder.ivs.values.hp, 18);
		assert.equal(result.teamBuilder.ivs.vitamins.find(item => item.id === 'hpup').quantity, 0);
		result = service.usePokemonIVVitamin(
			player.token, undefined, pokemonId, 'hpup', 'vitamin-action-1',
			view.boxRevision, view.bagRevision
		);
		assert.equal(result.replayed, true);
		assert.equal(result.teamBuilder.ivs.values.hp, 18);
	});

	it('allows a level edit when a legacy Pokemon has an unchanged empty gender', () => {
		const { service } = setup();
		const record = service.repository.get('samuel');
		record.state.team[0].gender = '';
		record.state.box.party[0].pokemon.gender = '';
		service.repository.set(record);
		const master = service.loginMaster('14081998');
		const box = service.getBox(master.token, 'samuel');
		const pokemonId = box.team[0].pokemonId;
		const original = structuredClone(service.getCharacter(master.token, 'samuel').team[0]);
		const updated = service.editBoxPokemonWithTeamBuilder(
			master.token, 'samuel', pokemonId, { ...original, level: 11 }, box.revision
		);
		assert.equal(updated.team[0].level, 11);
		assert.equal(updated.team[0].gender, '');
	});
	it('lets the Master edit while viewing as Player without changing locked identity fields', () => {
		const { service } = setup();
		const master = service.loginMaster('14081998');
		const viewed = service.viewAsPlayer(master.token, 'samuel');
		assert.equal(viewed.mode, 'player');
		const pokemonId = service.getBox(master.token, 'samuel').team[0].pokemonId;
		const original = structuredClone(service.getCharacter(master.token, 'samuel').team[0]);
		const edited = {
			...original, level: 60, ability: 'Rain Dish',
			moves: ['Hydro Pump', 'Ice Beam'],
			evs: { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
		};
		let box = service.getBox(master.token, 'samuel');
		const updated = service.editBoxPokemonWithTeamBuilder(
			master.token, 'samuel', pokemonId, edited, box.revision
		);
		assert.equal(updated.team[0].species, original.species);
		assert.equal(updated.team[0].level, 60);
		assert.equal(updated.team[0].ability, 'Rain Dish');
		assert.equal(updated.team[0].nature, original.nature);
		assert.equal(updated.team[0].shiny, original.shiny);
		assert.deepEqual(updated.team[0].ivs, edited.ivs);

		box = service.getBox(master.token, 'samuel');
		const lockedChanges = [
			['species', 'Blastoise'], ['gender', original.gender === 'M' ? 'F' : 'M'],
			['nature', original.nature === 'Modest' ? 'Jolly' : 'Modest'],
			['item', 'Leftovers'], ['shiny', !original.shiny], ['name', 'Atlas'],
		];
		for (const [field, value] of lockedChanges) {
			const forbidden = structuredClone(edited);
			forbidden[field] = value;
			assert.throws(() => service.editBoxPokemonWithTeamBuilder(
				master.token, 'samuel', pokemonId, forbidden, box.revision
			), new RegExp('master field is locked: ' + field));
		}
		const view = service.getPokemonTeamBuilder(master.token, 'samuel', pokemonId);
		assert.equal(view.permissions.itemFromBag, true);
		assert.equal(view.permissions.species, false);
		assert.equal(view.permissions.gender, false);
		assert.equal(view.permissions.shiny, false);
		assert.equal(view.permissions.nature, false);
		assert.equal(view.permissions.nickname, false);
		assert.deepEqual(new Set(view.abilities.map(ability => ability.name)), new Set(['Torrent', 'Rain Dish']));
		assert.equal(view.abilities.every(ability => ability.description.length > 10), true);
		assert.equal(view.moves.choices.some(move => move.name === 'V-create'), false);

		const invalidAbility = structuredClone(edited);
		invalidAbility.ability = 'Sturdy';
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			master.token, 'samuel', pokemonId, invalidAbility, box.revision
		), /Ability não está disponível/);
		const invalidMove = structuredClone(edited);
		invalidMove.moves = ['V-create'];
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			master.token, 'samuel', pokemonId, invalidMove, box.revision
		), /não pode aprender/);
		const invalidEVs = structuredClone(edited);
		invalidEVs.evs = { hp: 250, atk: 2, def: 0, spa: 252, spd: 4, spe: 0 };
		assert.throws(() => service.editBoxPokemonWithTeamBuilder(
			master.token, 'samuel', pokemonId, invalidEVs, box.revision
		), /Invalid RPG Pokemon EVs/);
	});

	it('keeps administrative character actions available while viewing as Player', () => {
		const { service } = setup();
		const master = service.loginMaster('14081998');
		service.viewAsPlayer(master.token, 'samuel');
		let box = service.getBox(master.token, 'samuel');
		const pokemonId = box.team[0].pokemonId;
		box = service.masterEditBoxPokemon(
			master.token, 'samuel', pokemonId, { hp: 1, experience: 9000 }, box.revision
		);
		assert.equal(box.team[0].hp, 1);
		assert.equal(box.team[0].experience, 9000);
		assert.throws(() => service.masterEditBoxPokemon(
			master.token, 'outro-player', pokemonId, { hp: 2 }, box.revision
		), /only edit the character currently being viewed/);
	});

	it('exposes timed training and campaign advancement through authenticated HTTP routes', async () => {
		const { service } = setup();
		setTrainingEVs(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const server = http.createServer((req, res) => new RPGHttpServer(service).handle(req, res));
		await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
		const base = 'http://127.0.0.1:' + server.address().port + '/api/rpg';
		try {
			let response = await fetch(base + '/team-builder/' + encodeURIComponent(pokemonId), {
				headers: { Authorization: 'Bearer ' + player.token },
			});
			let data = await response.json();
			const trainingResponse = await fetch(base + '/team-builder/' + encodeURIComponent(pokemonId) + '/train-ev', {
				method: 'POST',
				headers: { Authorization: 'Bearer ' + player.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					evs: { hp: 244, atk: 252, def: 4, spa: 0, spd: 0, spe: 8 },
					expectedRevision: data.teamBuilder.boxRevision,
				}),
			});
			const trainingData = await trainingResponse.json();
			assert.equal(trainingResponse.status, 200);
			assert.equal(trainingData.training.roleplayDurationMs, 60 * 60 * 1000);
			assert.equal(trainingData.teamBuilder.evs.values.hp, 252);
			const forbidden = await fetch(base + '/campaign/time/advance', {
				method: 'POST', headers: { Authorization: 'Bearer ' + player.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({ hours: 1 }),
			});
			assert.equal(forbidden.status, 403);
			const advanced = await fetch(base + '/campaign/time/advance', {
				method: 'POST', headers: { Authorization: 'Bearer ' + master.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({ hours: 1 }),
			});
			assert.equal(advanced.status, 200);
			assert.equal((await advanced.json()).time.trainings.completed, 1);
			response = await fetch(base + '/team-builder/' + encodeURIComponent(pokemonId), {
				headers: { Authorization: 'Bearer ' + player.token },
			});
			data = await response.json();
			assert.equal(data.teamBuilder.evs.values.hp, 244);
			assert.equal(data.teamBuilder.evs.values.spe, 8);
		} finally {
			await new Promise(resolve => { server.close(resolve); });
		}
	});
	it('blocks Player training and vitamins when the Master disables Training access', () => {
		const { service } = setup();
		setTrainingEVs(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		service.setCharacterPageAccess(master.token, 'samuel', 'training', false);
		const pokemonId = service.getBox(player.token).team[0].pokemonId;
		const view = service.getPokemonTeamBuilder(player.token, undefined, pokemonId);
		assert.equal(view.permissions.training, false);
		assert.equal(view.evs.training.eligible, false);
		assert.throws(() => service.trainPokemonEVDistribution(
			player.token, undefined, pokemonId,
			{ hp: 248, atk: 252, def: 4, spa: 0, spd: 0, spe: 4 }, view.boxRevision
		), /bloqueou o acesso ao Treinamento/);
		assert.throws(() => service.usePokemonIVVitamin(
			player.token, undefined, pokemonId, 'hpup', 'blocked-vitamin',
			view.boxRevision, view.bagRevision
		), /bloqueou o acesso ao Treinamento/);
		const masterView = service.getPokemonTeamBuilder(master.token, 'samuel', pokemonId);
		assert.equal(masterView.permissions.training, true);
	});
});
