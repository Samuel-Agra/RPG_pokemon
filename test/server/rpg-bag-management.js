'use strict';

const assert = require('assert').strict;
const http = require('node:http');
const fs = require('node:fs');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const {
	RPGLoginService,
	RPGMemoryCharacterRepository,
	RPGMemoryCustomItemRepository,
} = require('../../dist/server/rpg-showdown');
const { RPGBagSystem, RPGItems } = require('../../dist/sim/rpg-showdown');

function createService() {
	let byte = 0;
	return new RPGLoginService({
		masterCode: '14081998',
		repository: new RPGMemoryCharacterRepository(),
		customItemRepository: new RPGMemoryCustomItemRepository(),
		randomBytes: size => Buffer.alloc(size, ++byte),
		now: () => 1_800_000_000_000,
	});
}

function createCharacter(service, name = 'Samuel') {
	service.createCharacter({
		characterName: name,
		playerName: name + ' real',
		avatar: 'lucas',
		password: 'senha-rpg',
		initialMoney: 3250,
		starter: { species: 'Charmander', gender: 'M', level: 10 },
	});
}

function update(service, token, itemId, quantity, operation = 'add') {
	const bag = service.getBag(token, 'samuel');
	return service.masterSetBagItemQuantity(
		token, 'samuel', itemId, quantity, bag.revision, operation
	);
}

describe('RPG Bag management backend', () => {
	it('migrates old Bags and persists favorites, mission organization and notes in version 5', () => {
		const migrated = RPGBagSystem.migrate({
			version: 1, ownerId: 'samuel', revision: 3, maxSlots: 10,
			items: [{ itemId: 'potion', quantity: 2 }],
		});
		assert.equal(migrated.version, 5);
		assert.deepEqual(migrated.favorites, []);
		assert.deepEqual(migrated.missionItems, []);
		assert.deepEqual(migrated.missionQuantities, {});
		assert.deepEqual(migrated.missionNotes, {});
		const favorite = RPGBagSystem.setFavorite(migrated, 'potion', true, 3);
		assert.deepEqual(favorite.favorites, ['potion']);
		const mission = RPGBagSystem.setMissionItem(
			favorite, 'potion', true, favorite.revision, RPGItems, undefined, 'Entregar à enfermeira.'
		);
		assert.deepEqual(mission.missionItems, ['potion']);
		assert.equal(mission.missionNotes.potion, 'Entregar à enfermeira.');
		const emptied = RPGBagSystem.apply(mission, [
			{ type: 'set', itemId: 'potion', quantity: 0 },
		], mission.revision).bag;
		assert.deepEqual(emptied.items, []);
		assert.deepEqual(emptied.favorites, []);
		assert.deepEqual(emptied.missionItems, []);
		assert.deepEqual(emptied.missionNotes, {});
	});

	it('returns world categories, search results, details and a reduced battle Bag', () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		for (const id of [
			'potion', 'revive', 'pokeball', 'leftovers', 'charizarditey', 'firestone', 'tm001',
			'armorfossil', 'nugget', 'bottlecap',
		]) {
			update(service, master.token, id, 1);
		}
		const world = service.getBag(master.token, 'samuel');
		assert.deepEqual(world.categories.map(category => category.id), [
			'favorites', 'pokeballs', 'medicines', 'held-items', 'evolution-items',
			'tms', 'fossils', 'treasures', 'mega-stones', 'key-items', 'mission-items',
		]);
		assert.equal(world.money, 3250);
		assert.equal(world.items.find(item => item.id === 'charizarditey').category, 'mega-stones');
		assert.equal(world.items.find(item => item.id === 'armorfossil').category, 'fossils');
		assert.equal(world.items.find(item => item.id === 'nugget').category, 'treasures');
		assert.equal(world.items.find(item => item.id === 'bottlecap').actions.includes('use'), false);
		assert.deepEqual(world.items.find(item => item.id === 'leftovers').actions, ['equip', 'favorite', 'discard', 'give', 'move-to-mission']);
		assert.equal(world.items.find(item => item.id === 'leftovers').description.includes('1/16 do HP máximo'), true);
		assert.equal(service.getBagItem(master.token, 'samuel', 'potion').description.includes('20 HP'), true);
		assert.deepEqual(service.getBag(master.token, 'samuel', { search: 'super potion' }).items, []);
		assert.deepEqual(service.getBag(master.token, 'samuel', { search: 'poti' }).items.map(item => item.id), ['potion']);

		const battle = service.getBag(master.token, 'samuel', { context: 'battle' });
		assert.deepEqual(battle.categories.map(category => category.id), [
			'pokeballs', 'medicines', 'battle-items',
		]);
		assert.deepEqual(battle.items.map(item => item.id).sort(), ['pokeball', 'potion']);
		assert.equal(battle.items.every(item => item.actions.includes('use')), true);
	});

	it('supports favorites, target validation and removes zero-quantity items', () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		let bag = update(service, master.token, 'potion', 2);
		bag = service.setBagItemFavorite(master.token, 'samuel', 'potion', true, bag.revision);
		assert.deepEqual(service.getBag(master.token, 'samuel', { category: 'favorites' }).items.map(item => item.id), ['potion']);
		bag = service.setBagItemMission(master.token, 'samuel', 'potion', true, bag.revision);
		assert.deepEqual(service.getBag(master.token, 'samuel', { category: 'mission-items' }).items.map(item => item.id), ['potion']);
		assert.equal(service.getBagItem(master.token, 'samuel', 'potion').mission, true);
		assert.throws(() => service.setBagItemFavorite(
			master.token, 'samuel', 'potion', false, bag.revision - 1
		), /revision conflict/);
		assert.throws(() => service.setBagItemMission(
			master.token, 'samuel', 'potion', false, bag.revision - 1
		), /revision conflict/);

		let targets = service.getBagItemTargets(master.token, 'samuel', 'potion');
		assert.equal(targets.targets[0].eligible, false);
		const box = service.getBox(master.token, 'samuel');
		service.masterEditBoxPokemon(master.token, 'samuel', box.team[0].pokemonId, { hp: 1 }, box.revision);
		targets = service.getBagItemTargets(master.token, 'samuel', 'potion');
		assert.equal(targets.targets[0].eligible, true);
		const stored = service.repository.get('samuel');
		service.masterAddBoxPokemon(
			master.token, 'samuel', structuredClone(stored.state.box.party[0].pokemon)
		);
		targets = service.getBagItemTargets(master.token, 'samuel', 'potion');
		assert.equal(targets.targets.length, 1);
		assert.equal(targets.targets[0].location.destination, 'party');

		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'potion', 2, bag.revision, 'remove');
		assert.equal(bag.items.some(item => item.id === 'potion'), false);
		assert.equal(service.getBag(master.token, 'samuel', { category: 'favorites' }).items.length, 0);
		assert.equal(service.getBag(master.token, 'samuel', { category: 'mission-items' }).items.length, 0);
	});

	it('equips and removes held items without duplicating inventory', () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		const bag = update(service, master.token, 'leftovers', 1);
		const box = service.getBox(master.token, 'samuel');
		const pokemonId = box.team[0].pokemonId;
		let result = service.equipBagHeldItem(
			master.token, 'samuel', pokemonId, 'leftovers', bag.revision, box.revision
		);
		assert.equal(result.bag.items.some(item => item.id === 'leftovers'), false);
		assert.equal(result.box.team[0].item, 'Leftovers');
		result = service.removeBagHeldItem(
			master.token, 'samuel', pokemonId, result.bag.revision, result.box.revision
		);
		assert.equal(result.bag.items.find(item => item.id === 'leftovers').quantity, 1);
		assert.equal(result.box.team[0].item, '');
	});

	it('lets only the Master create catalog items and manage another character Bag', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const id = 'codexbagtestrelic';
		try {
			assert.throws(() => service.createCustomBagItem(player.token, {
				id, name: 'Relic', category: 'custom', stackLimit: 10,
				usableInBattle: false, consumedOnUse: false,
			}), /master session required/);
			const item = service.createCustomBagItem(master.token, {
				id, name: 'Relic of Test', category: 'custom', stackLimit: 10,
				usableInBattle: false, consumedOnUse: false,
				price: { currency: 'pokedollar', source: 'custom', sell: 500 },
				effect: { type: 'collectible', description: 'Um tesouro de teste.' },
			});
			assert.equal(item.source, 'custom');
			assert.equal(item.category, 'custom');
			assert.equal(item.stackLimit, 99);
			assert.deepEqual(item.tags, ['mission']);
			assert.equal(item.usableInBattle, false);
			assert.equal(service.listBagItemCatalog(master.token, 'relic of').some(entry => entry.id === id), true);
			let bag = update(service, master.token, id, 2);
			bag = service.setBagItemMissionNote(
				master.token, 'samuel', id, 'Entregar este documento ao Mestre.', bag.revision
			);
			const view = bag.items.find(entry => entry.id === id);
			assert.equal(view.category, 'mission-items');
			assert.equal(view.description, 'Um tesouro de teste.');
			assert.equal(view.icon, null);
			assert.equal(view.sprite, null);
			assert.equal(view.missionNote, 'Entregar este documento ao Mestre.');
			assert.equal(view.actions.includes('edit-mission-note'), true);
			assert.throws(() => service.getBag(player.token, 'outro'), /cannot access another character/);
		} finally {
			RPGItems.unregister(id);
		}
	});

	it('blocks external item use from invitation through active battle without blocking the battle Bag', () => {
		const service = createService();
		createCharacter(service);
		createCharacter(service, 'Marina');
		const master = service.loginMaster('14081998');
		const samuel = service.loginPlayer('samuel', 'senha-rpg');
		const marina = service.loginPlayer('marina', 'senha-rpg');
		const bag = update(service, master.token, 'potion', 1);
		const box = service.getBox(master.token, 'samuel');
		service.masterEditBoxPokemon(master.token, 'samuel', box.team[0].pokemonId, { hp: 1 }, box.revision);

		let battle = service.createBattleSession(master.token);
		battle = service.updateBattleSession(master.token, battle.id, {
			format: 'singles', opponentType: 'player',
			participants: [
				{
					id: 'samuel', team: 'A', kind: 'player', characterId: 'samuel',
					displayName: 'Samuel', selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
				},
				{
					id: 'marina', team: 'B', kind: 'player', characterId: 'marina',
					displayName: 'Marina', selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
				},
			],
		});
		service.inviteBattleSession(master.token, battle.id);
		let world = service.getBag(samuel.token);
		assert.equal(world.itemUseLocked, true);
		assert.equal(world.itemUseLockReason.includes('convite de batalha ativo'), true);
		assert.equal(world.items.find(item => item.id === 'potion').actions.includes('use'), false);
		assert.equal(world.items.find(item => item.id === 'potion').actions.includes('favorite'), true);
		assert.throws(() => service.useBoxHealingItem(
			samuel.token, undefined, box.team[0].pokemonId, 'potion', 'locked-invite',
			service.getBox(samuel.token).revision, bag.revision
		), /convite de batalha ativo/);
		const battleBag = service.getBag(samuel.token, undefined, { context: 'battle' });
		assert.equal(battleBag.itemUseLocked, false);
		assert.equal(battleBag.items.find(item => item.id === 'potion').actions.includes('use'), true);

		service.respondToBattleInvitation(samuel.token, battle.id, 'accepted');
		service.respondToBattleInvitation(marina.token, battle.id, 'accepted');
		service.startBattleSession(master.token, battle.id);
		world = service.getBag(samuel.token);
		assert.equal(world.itemUseLocked, true);
		assert.equal(world.itemUseLockReason.includes('durante uma batalha'), true);
		assert.equal(service.getBag(master.token, 'samuel').itemUseLocked, false);
	});

	it('discards and transfers only non-mission items with atomic capacity and access checks', () => {
		const service = createService();
		createCharacter(service);
		createCharacter(service, 'Marina');
		createCharacter(service, 'Carlos');
		const master = service.loginMaster('14081998');
		const samuel = service.loginPlayer('samuel', 'senha-rpg');
		const add = (characterId, itemId, quantity = 1) => {
			const bag = service.getBag(master.token, characterId);
			return service.masterSetBagItemQuantity(master.token, characterId, itemId, quantity, bag.revision, 'add');
		};
		add('samuel', 'potion', 5);
		add('samuel', 'firestone', 1);
		for (const id of [
			'potion', 'pokeball', 'greatball', 'ultraball', 'superpotion',
			'hyperpotion', 'antidote', 'revive', 'leftovers', 'firestone',
		]) add('marina', id);
		for (const id of [
			'pokeball', 'greatball', 'ultraball', 'superpotion', 'hyperpotion',
			'antidote', 'revive', 'leftovers', 'firestone', 'thunderstone',
		]) add('carlos', id);

		let transfer = service.getBagTransferTargets(samuel.token, undefined, 'potion');
		const marina = transfer.targets.find(target => target.characterId === 'marina');
		const carlos = transfer.targets.find(target => target.characterId === 'carlos');
		assert.equal(marina.hasItem, true);
		assert.equal(marina.canReceive, true);
		assert.equal(carlos.hasItem, false);
		assert.equal(carlos.canReceive, false);
		let sender = service.transferBagItem(
			samuel.token, undefined, 'marina', 'potion', 2,
			transfer.senderRevision, marina.revision
		).sender;
		assert.equal(sender.items.find(item => item.id === 'potion').quantity, 3);
		assert.equal(service.getBag(master.token, 'marina').items.find(item => item.id === 'potion').quantity, 3);

		transfer = service.getBagTransferTargets(samuel.token, undefined, 'potion');
		assert.throws(() => service.transferBagItem(
			samuel.token, undefined, 'carlos', 'potion', 1, transfer.senderRevision,
			transfer.targets.find(target => target.characterId === 'carlos').revision
		), /no free slots/);
		service.setCharacterPageAccess(master.token, 'marina', 'bag', false);
		transfer = service.getBagTransferTargets(samuel.token, undefined, 'potion');
		assert.equal(transfer.targets.find(target => target.characterId === 'marina').canReceive, false);
		assert.throws(() => service.transferBagItem(
			samuel.token, undefined, 'marina', 'potion', 1, transfer.senderRevision,
			transfer.targets.find(target => target.characterId === 'marina').revision
		), /Bag do Player escolhido está bloqueada/);

		sender = service.discardBagItem(samuel.token, undefined, 'potion', 1, transfer.senderRevision);
		assert.equal(sender.items.find(item => item.id === 'potion').quantity, 2);
		sender = service.setBagItemMission(samuel.token, undefined, 'firestone', true, sender.revision);
		const mission = sender.items.find(item => item.id === 'firestone');
		assert.equal(mission.actions.includes('favorite'), false);
		assert.equal(mission.actions.includes('discard'), false);
		assert.equal(mission.actions.includes('give'), false);
		assert.throws(() => service.discardBagItem(
			samuel.token, undefined, 'firestone', 1, sender.revision
		), /Itens de Missão/);
	});

	it('separates mission quantities and lets only the Master complete them with an atomic reward', () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		const player = service.loginPlayer('samuel', 'senha-rpg');
		let bag = update(service, master.token, 'potion', 10);
		bag = service.setBagItemMission(
			player.token, undefined, 'potion', true, bag.revision, 3, 'Levar três Potions ao pesquisador.'
		);
		const potionEntries = bag.items.filter(item => item.id === 'potion');
		assert.equal(potionEntries.find(item => item.mission).missionNote, 'Levar três Potions ao pesquisador.');
		assert.equal(potionEntries.find(item => item.mission).actions.includes('edit-mission-note'), true);
		bag = service.setBagItemMissionNote(
			player.token, undefined, 'potion', 'Entregar no laboratório.', bag.revision
		);
		assert.equal(bag.items.find(item => item.mission).missionNote, 'Entregar no laboratório.');
		assert.deepEqual(potionEntries.map(item => [item.mission, item.quantity]), [[false, 7], [true, 3]]);
		assert.throws(() => service.discardBagItem(
			player.token, undefined, 'potion', 8, bag.revision
		), /quantidade excede/);
		assert.throws(() => service.completeMissionItem(
			player.token, 'samuel', 'potion', bag.revision, { type: 'pokecoin', amount: 250 }
		), /master session required/);

		let completed = service.completeMissionItem(
			master.token, 'samuel', 'potion', bag.revision, { type: 'pokecoin', amount: 250 }
		);
		assert.equal(completed.money, 3500);
		assert.deepEqual(completed.bag.items.filter(item => item.id === 'potion').map(item => [item.mission, item.quantity]), [
			[false, 7],
		]);
		assert.equal(completed.bag.items.find(item => item.id === 'potion').missionNote, undefined);

		bag = service.setBagItemMission(master.token, 'samuel', 'potion', true, completed.bag.revision, 2);
		completed = service.completeMissionItem(
			master.token, 'samuel', 'potion', bag.revision, { type: 'item', itemId: 'greatball', quantity: 2 }
		);
		assert.equal(completed.bag.items.find(item => item.id === 'potion').quantity, 5);
		assert.equal(completed.bag.items.find(item => item.id === 'greatball').quantity, 2);
		assert.equal(completed.bag.items.some(item => item.mission), false);
	});

	it('shows Use only for implemented actions and keeps the battle Bag rules separate', () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		for (const id of ['potion', 'pokeball', 'helixfossil']) update(service, master.token, id, 1);
		const world = service.getBag(master.token, 'samuel');
		assert.equal(world.items.find(item => item.id === 'potion').actions.includes('use'), true);
		assert.equal(world.items.find(item => item.id === 'pokeball').actions.includes('use'), false);
		assert.equal(world.items.find(item => item.id === 'helixfossil').actions.includes('use'), false);
		const battle = service.getBag(master.token, 'samuel', { context: 'battle' });
		assert.equal(battle.items.find(item => item.id === 'pokeball').actions.includes('use'), true);
	});

	it('charges Players atomically for center healing and lets the Master revive for free', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		service.viewAsPlayer(master.token, 'samuel');
		let box = service.getBox(master.token);
		const pokemonId = box.team[0].pokemonId;
		box = service.masterEditBoxPokemon(
			master.token, 'samuel', pokemonId, { hp: 1, pp: box.team[0].moves.map(() => 0), status: 'brn' }, box.revision
		);
		const preview = service.getPokemonCenter(player.token);
		assert.equal(preview.team[0].needsRecovery, true);
		assert.ok(preview.team[0].fullRecoveryCost > 0);
		const moneyBefore = preview.money;
		const healed = service.usePokemonCenter(player.token, undefined, 'heal', pokemonId, preview.revision);
		assert.equal(healed.center.team[0].hp, healed.center.team[0].maxHP);
		assert.equal(healed.center.team[0].status, '');
		assert.equal(healed.center.money, moneyBefore - healed.cost);
		box = service.masterEditBoxPokemon(
			master.token, 'samuel', pokemonId, { hp: 0, status: 'psn' }, healed.center.revision
		);
		const masterPreview = service.getPokemonCenter(master.token);
		const revived = service.usePokemonCenter(master.token, undefined, 'revive', pokemonId, masterPreview.revision);
		assert.equal(revived.cost, 0);
		assert.equal(revived.center.team[0].hp, Math.floor(revived.center.team[0].maxHP / 2));
		assert.equal(revived.center.team[0].status, '');
	});
	it('persists Player page permissions while preserving Master access and administration', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		let character = service.setCharacterPageAccess(master.token, 'samuel', 'bag', false);
		character = service.setCharacterPageAccess(master.token, 'samuel', 'box', false);
		character = service.setCharacterPageAccess(master.token, 'samuel', 'training', false);
		character = service.setCharacterPageAccess(master.token, 'samuel', 'center', false);
		character = service.setCharacterPageAccess(master.token, 'samuel', 'fossils', false);
		assert.deepEqual(character.pageAccess, { bag: false, box: false, training: false, center: false, fossils: false, nursery: true });
		assert.throws(() => service.getPokemonCenter(player.token), /Centro Pokémon/);
		assert.throws(() => service.getBag(player.token), /bloqueou o acesso à página da Bag/);
		assert.throws(() => service.getBox(player.token), /bloqueou o acesso à página da Box/);
		assert.equal(service.getBag(player.token, undefined, { context: 'battle' }).context, 'battle');

		service.viewAsPlayer(master.token, 'samuel');
		assert.equal(service.getBag(master.token).ownerId, 'samuel');
		assert.equal(service.getBox(master.token).ownerId, 'samuel');
		const id = 'masterviewmissionitem';
		try {
			const item = service.createCustomBagItem(master.token, {
				id, name: 'Documento da Missão', category: 'custom', stackLimit: 1,
				usableInBattle: true, consumedOnUse: true,
				effect: { type: 'mission', description: 'Documento entregue pelo Mestre.' },
			});
			const bag = service.masterSetBagItemQuantity(
				master.token, 'samuel', item.id, 2, service.getBag(master.token).revision, 'add'
			);
			assert.equal(bag.items.find(entry => entry.id === id).quantity, 2);
			service.masterSetBagItemQuantity(master.token, 'samuel', id, 0, bag.revision, 'set');
		} finally {
			RPGItems.unregister(id);
		}

		service.exitPlayerView(master.token);
		service.setCharacterPageAccess(master.token, 'samuel', 'bag', true);
		service.setCharacterPageAccess(master.token, 'samuel', 'box', true);
		assert.equal(service.getBag(player.token).ownerId, 'samuel');
		assert.equal(service.getBox(player.token).ownerId, 'samuel');
	});

	it('renders direct Box and Bag shortcuts on every Master player row', () => {
		const script = fs.readFileSync('server/static/rpg/rpg.js', 'utf8');
		assert(script.includes("button('Abrir Box', 'button')"));
		assert(script.includes("button('Abrir Bag', 'button')"));
		assert(script.includes("viewAsPlayer(character, 'box')"));
		assert(script.includes("viewAsPlayer(character, 'bag')"));
		assert(script.includes("'master-access-toggle ' + (allowed ? 'allowed' : 'blocked')"));
		assert(script.includes("api('/characters/page-access'"));
		const bagScript = fs.readFileSync('server/static/rpg/bag-ui.js', 'utf8');
		assert(bagScript.includes("action === 'discard'"));
		assert(bagScript.includes("action === 'give'"));
		assert.equal(bagScript.includes("el('small', '', item.description)"), false);
		assert(bagScript.includes("operation.value === 'remove'"));
		assert(bagScript.includes("bag-ui-master-catalog-item"));
	});

	it('exposes authenticated Bag routes without requiring page refreshes', async () => {
		const service = createService();
		createCharacter(service);
		const master = service.loginMaster('14081998');
		update(service, master.token, 'potion', 1);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const handler = new RPGHttpServer(service);
		const server = http.createServer((req, res) => handler.handle(req, res));
		await new Promise(resolve => { server.listen(0, '127.0.0.1', () => { resolve(); }); });
		const base = 'http://127.0.0.1:' + server.address().port + '/api/rpg';
		try {
			let response = await fetch(base + '/bag?category=medicines', {
				headers: { Authorization: 'Bearer ' + player.token },
			});
			let data = await response.json();
			assert.equal(response.status, 200);
			assert.deepEqual(data.bag.items.map(item => item.id), ['potion']);
			response = await fetch(base + '/bag/items/potion/targets', {
				headers: { Authorization: 'Bearer ' + player.token },
			});
			data = await response.json();
			assert.equal(response.status, 200);
			assert.equal(data.targets.targets.length, 1);
			response = await fetch(base + '/bag/mission', {
				method: 'POST',
				headers: { Authorization: 'Bearer ' + player.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemId: 'potion', mission: true, note: 'Entregar no Centro Pokémon.',
					expectedRevision: data.targets.bagRevision,
				}),
			});
			data = await response.json();
			assert.equal(response.status, 200);
			assert.equal(data.bag.items.find(item => item.id === 'potion').mission, true);
			assert.equal(data.bag.items.find(item => item.id === 'potion').missionNote, 'Entregar no Centro Pokémon.');
			response = await fetch(base + '/bag/mission-note', {
				method: 'POST',
				headers: { Authorization: 'Bearer ' + player.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemId: 'potion', note: 'Nova anotação.', expectedRevision: data.bag.revision,
				}),
			});
			data = await response.json();
			assert.equal(response.status, 200);
			assert.equal(data.bag.items.find(item => item.id === 'potion').missionNote, 'Nova anotação.');
		} finally {
			await new Promise(resolve => { server.close(() => { resolve(); }); });
		}
	});
});
