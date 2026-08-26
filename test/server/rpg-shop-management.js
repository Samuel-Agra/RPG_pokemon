'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
	RPGLoginService,
	RPGMemoryCharacterRepository,
	RPGMemoryCommerceRepository,
	RPGFileCommerceRepository,
} = require('../../dist/server/rpg-showdown');
const {RPGItems} = require('../../dist/sim/rpg-showdown');

function createCharacter(service, name) {
	service.createCharacter({
		characterName: name,
		playerName: name + ' Player',
		avatar: 'lucas',
		password: '1234',
		initialMoney: 10000,
		starter: {species: 'Squirtle', gender: 'M', level: 10},
	});
	return service.loginPlayer(name, '1234');
}

function tradeRequest(view, type, lines, actionId) {
	return {
		actionId, type, lines,
		expectedAccountRevision: view.accountRevision,
		expectedBagRevision: view.bagRevision,
		expectedCatalogRevision: view.shop.revision,
	};
}

describe('RPG shared commerce management', () => {
	it('assigns positive base buy and sell prices to every commerce item', () => {
		const commerceItems = RPGItems.list().filter(item =>
			['ball', 'healing', 'status', 'pp', 'revive', 'tm', 'evolution', 'held', 'custom'].includes(item.category) &&
			!item.tags?.includes('key-item')
		);
		assert.equal(commerceItems.filter(item => !item.price?.buy || !item.price?.sell).length, 0);
		assert.deepEqual(
			[RPGItems.require('tm001').price.buy, RPGItems.require('tm001').price.sell], [400, 100]
		);
		assert.deepEqual(
			[RPGItems.require('tm229').price.buy, RPGItems.require('tm229').price.sell], [1500, 375]
		);
	});
	it('lets the Master block all shops or individual establishments for each Player', () => {
		const service = new RPGLoginService({
			masterCode: '14081998',
			repository: new RPGMemoryCharacterRepository(),
			commerceRepository: new RPGMemoryCommerceRepository(),
		});
		const master = service.loginMaster('14081998');
		const player = createCharacter(service, 'Samuel');
		let character = service.setCharacterPageAccess(master.token, 'samuel', 'shops', false);
		assert.equal(character.pageAccess.shops, false);
		assert.throws(() => service.listCommerceShops(player.token), /acesso às Lojas/);
		assert.throws(() => service.getCommerceShop(player.token, 'poke-mart-central'), /acesso às Lojas/);
		assert.throws(() => service.tradeCommerceShop(
			player.token, 'poke-mart-central', {}, undefined
		), /acesso às Lojas/);
		assert.equal(service.listCommerceShops(master.token, 'samuel').shops.length, 7);
		assert.equal(service.listCommerceShops(master.token).shops.length, 7);
		assert.equal(service.getCommerceShop(master.token, 'poke-mart-central').shop.id, 'poke-mart-central');

		character = service.setCharacterPageAccess(master.token, 'samuel', 'shops', true);
		character = service.setCharacterShopAccess(master.token, 'samuel', 'tm-central', false);
		assert.equal(character.shopAccess['tm-central'], false);
		const directory = service.listCommerceShops(player.token);
		assert.equal(directory.shops.length, 7);
		assert.equal(directory.shops.find(shop => shop.id === 'tm-central').allowed, false);
		assert.equal(directory.shops.some(shop => shop.id === 'poke-mart-central'), true);
		assert.equal(service.listCommerceShops(master.token, 'samuel').shops.length, 7);
		assert.equal(service.getCommerceShop(master.token, 'tm-central', 'samuel').shop.id, 'tm-central');
		assert.throws(() => service.getCommerceShop(player.token, 'tm-central'), /não está disponível/);
		assert.throws(() => service.tradeCommerceShop(
			player.token, 'tm-central', {}, undefined
		), /não está disponível/);
		assert.equal(service.getCommerceShop(player.token, 'poke-mart-central').shop.id, 'poke-mart-central');

		character = service.setCharacterShopAccess(master.token, 'samuel', 'tm-central', true);
		assert.equal(character.shopAccess['tm-central'], true);
		assert.equal(service.listCommerceShops(player.token).shops.every(shop => shop.allowed), true);
		assert.throws(() => service.setCharacterShopAccess(master.token, 'samuel', 'invalid-shop', false), /inválida/);
	});

	it('starts with the seven requested establishments and specialized Master catalogs', () => {
		const service = new RPGLoginService({
			masterCode: '14081998',
			repository: new RPGMemoryCharacterRepository(),
			commerceRepository: new RPGMemoryCommerceRepository(),
		});
		const master = service.loginMaster('14081998');
		const directory = service.listCommerceShops(master.token);
		assert.deepEqual(directory.shops.map(shop => shop.type), [
			'poke-mart', 'equipment', 'evolution', 'tm', 'mega-stone', 'farm', 'thrift',
		]);
		for (const shop of directory.shops) {
			const catalog = service.getCommerceShop(master.token, shop.id);
			for (const item of catalog.candidates) {
				assert(item.icon || Number.isInteger(item.sprite), item.name + ' should have a local or Showdown sprite');
				if (item.icon) {
					const cleanIcon = item.icon.split('?')[0];
					const relative = cleanIcon.startsWith('./') ? cleanIcon.slice(2) : cleanIcon;
					assert(fs.existsSync(path.join(__dirname, '../../server/static/rpg', relative)),
						item.name + ' local sprite should exist');
				}
			}
		}
		const mart = service.getCommerceShop(master.token, 'poke-mart-central');
		assert(mart.candidates.some(item => item.id === 'pokeball' && item.category === 'pokeballs'));
		assert(mart.candidates.some(item => item.id === 'potion' && item.category === 'medicines'));
		assert.equal(mart.candidates.some(item => item.id === 'leftovers'), false);
		const farm = service.getCommerceShop(master.token, 'farm-central');
		assert(farm.candidates.some(item => item.id === 'oranberry' && item.category === 'berries'));
		const equipment = service.getCommerceShop(master.token, 'equipment-central');
		assert.equal(equipment.candidates.some(item => item.id === 'oranberry'), false);
		assert.equal(equipment.candidates.some(item => item.id === 'destinyknot'), false);
		const evolution = service.getCommerceShop(master.token, 'evolution-central');
		assert(evolution.filters.includes('Itens de evolução'));
		assert(evolution.offers.length > 0, 'Master should see every compatible item, including disabled ones');
	});


	it('orders each establishment by its requested catalog rule', () => {
		const service = new RPGLoginService({
			masterCode: '14081998', commerceRepository: new RPGMemoryCommerceRepository(),
		});
		const master = service.loginMaster('14081998');
		const mart = service.getCommerceShop(master.token, 'poke-mart-central').offers.map(item => item.itemId);
		assert.deepEqual(mart.slice(0, 3), ['pokeball', 'greatball', 'ultraball']);
		const progression = [
			'potion', 'superpotion', 'hyperpotion', 'maxpotion', 'fullrestore',
			'revive', 'revivalherb', 'maxrevive', 'antidote', 'fullheal', 'ether', 'hpup', 'carbos',
		];
		for (let index = 1; index < progression.length; index++) {
			assert(mart.indexOf(progression[index - 1]) < mart.indexOf(progression[index]));
		}

		for (const shopId of ['equipment-central', 'mega-stone-central', 'farm-central']) {
			const names = service.getCommerceShop(master.token, shopId).offers.map(item => item.name);
			assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right)));
		}
		const evolution = service.getCommerceShop(master.token, 'evolution-central').offers;
		const firstTerastal = evolution.findIndex(item => item.category === 'terastalization');
		const lastEvolution = evolution.findLastIndex(item => item.category === 'evolution-items');
		if (firstTerastal >= 0) assert(lastEvolution < firstTerastal);
		const tms = service.getCommerceShop(master.token, 'tm-central').offers.map(item => item.itemId);
		assert.deepEqual(tms.slice(0, 4), ['tm001', 'tm002', 'tm003', 'tm004']);
		const thriftCategories = service.getCommerceShop(master.token, 'thrift-central').offers.map(item => item.category);
		assert.deepEqual([...new Set(thriftCategories)], ['fossils', 'treasures']);
	});

	it('shares finite stock between Players and keeps buying and selling independent', () => {
		let tokenByte = 0;
		const service = new RPGLoginService({
			masterCode: '14081998',
			repository: new RPGMemoryCharacterRepository(),
			commerceRepository: new RPGMemoryCommerceRepository(),
			randomBytes: size => Buffer.alloc(size, ++tokenByte),
		});
		const master = service.loginMaster('14081998');
		const player1 = createCharacter(service, 'Samuel');
		const player2 = createCharacter(service, 'Marina');
		let masterView = service.getCommerceShop(master.token, 'poke-mart-central');
		masterView = service.configureCommerceOffer(master.token, 'poke-mart-central', {
			itemId: 'pokeball', stock: 6, buyMode: 'available', buyPrice: 200,
			sellEnabled: false, expectedRevision: masterView.shop.revision,
		});
		assert.equal(masterView.offers.find(item => item.itemId === 'pokeball').sellEnabled, false);

		let view1 = service.getCommerceShop(player1.token, 'poke-mart-central');
		const result = service.tradeCommerceShop(
			player1.token, 'poke-mart-central',
			tradeRequest(view1, 'buy', [{itemId: 'pokeball', quantity: 6}], 'samuel-buy')
		);
		assert.equal(result.view.money, 8800);
		assert.equal(result.view.offers.find(item => item.itemId === 'pokeball').stock, 0);
		const replay = service.tradeCommerceShop(
			player1.token, 'poke-mart-central',
			tradeRequest(view1, 'buy', [{itemId: 'pokeball', quantity: 6}], 'samuel-buy')
		);
		assert.equal(replay.view.money, 8800);
		assert.equal(replay.view.offers.find(item => item.itemId === 'pokeball').stock, 0);
		const view2 = service.getCommerceShop(player2.token, 'poke-mart-central');
		assert.equal(view2.offers.find(item => item.itemId === 'pokeball').stock, 0);
		assert.throws(() => service.tradeCommerceShop(
			player2.token, 'poke-mart-central',
			tradeRequest(view2, 'buy', [{itemId: 'pokeball', quantity: 1}], 'marina-buy')
		), /enough stock/);
		assert.throws(() => service.tradeCommerceShop(
			player1.token, 'poke-mart-central',
			tradeRequest(result.view, 'sell', [{itemId: 'pokeball', quantity: 1}], 'samuel-sell-disabled')
		), /cannot be sold/);

		masterView = service.getCommerceShop(master.token, 'poke-mart-central');
		service.configureCommerceOffer(master.token, 'poke-mart-central', {
			itemId: 'pokeball', stock: 0, buyEnabled: false, buyPrice: 200,
			sellEnabled: true, sellPrice: 50, expectedRevision: masterView.shop.revision,
		});
		view1 = service.getCommerceShop(player1.token, 'poke-mart-central');
		assert.equal(view1.offers[0].buyEnabled, false);
		const sold = service.tradeCommerceShop(
			player1.token, 'poke-mart-central',
			tradeRequest(view1, 'sell', [{itemId: 'pokeball', quantity: 2}], 'samuel-sell')
		);
		assert.equal(sold.view.money, 8900);
		assert.equal(sold.view.offers[0].stock, 2);
		assert.equal(sold.view.offers[0].owned, 4);
	});

	it('applies stable bulk availability and price controls to every item in one shop', () => {
		const service = new RPGLoginService({
			masterCode: '14081998', commerceRepository: new RPGMemoryCommerceRepository(),
		});
		const master = service.loginMaster('14081998');
		let view = service.getCommerceShop(master.token, 'poke-mart-central');
		const order = view.offers.map(item => item.itemId);
		view = service.configureCommerceBulk(master.token, 'poke-mart-central', {
			action: 'enable-buy', expectedRevision: view.shop.revision,
		});
		assert(view.offers.every(item => item.buyEnabled));
		assert.deepEqual(view.offers.map(item => item.itemId), order);
		const potionBase = view.offers.find(item => item.itemId === 'potion').buyPrice;
		view = service.configureCommerceBulk(master.token, 'poke-mart-central', {
			action: 'increase-prices', expectedRevision: view.shop.revision,
		});
		assert.equal(view.offers.find(item => item.itemId === 'potion').buyPrice, Math.round(potionBase * 1.1));
		view = service.configureCommerceBulk(master.token, 'poke-mart-central', {
			action: 'increase-prices', expectedRevision: view.shop.revision,
		});
		assert.equal(view.offers.find(item => item.itemId === 'potion').buyPrice, Math.round(potionBase * 1.1));
		view = service.configureCommerceBulk(master.token, 'poke-mart-central', {
			action: 'decrease-prices', expectedRevision: view.shop.revision,
		});
		assert.equal(view.offers.find(item => item.itemId === 'potion').buyPrice, Math.round(potionBase * 0.9));
		view = service.configureCommerceBulk(master.token, 'poke-mart-central', {
			action: 'reset-prices', expectedRevision: view.shop.revision,
		});
		assert.equal(view.offers.find(item => item.itemId === 'potion').buyPrice, potionBase);
	});

	it('rejects stale shared catalog revisions', () => {
		const service = new RPGLoginService({masterCode: '14081998'});
		const master = service.loginMaster('14081998');
		const player = createCharacter(service, 'Carlos');
		let masterView = service.getCommerceShop(master.token, 'poke-mart-central');
		service.configureCommerceOffer(master.token, 'poke-mart-central', {
			itemId: 'potion', stock: 5, buyMode: 'available', buyPrice: 200,
			sellEnabled: false, expectedRevision: masterView.shop.revision,
		});
		const stale = service.getCommerceShop(player.token, 'poke-mart-central');
		masterView = service.getCommerceShop(master.token, 'poke-mart-central');
		service.configureCommerceOffer(master.token, 'poke-mart-central', {
			itemId: 'potion', stock: 4, expectedRevision: masterView.shop.revision,
		});
		assert.throws(() => service.tradeCommerceShop(
			player.token, 'poke-mart-central',
			tradeRequest(stale, 'buy', [{itemId: 'potion', quantity: 1}], 'stale')
		), /revision conflict/);
	});

	it('persists establishment stock independently from character files', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-commerce-'));
		const file = path.join(directory, 'shops.json');
		try {
			let service = new RPGLoginService({
				masterCode: '14081998', commerceRepository: new RPGFileCommerceRepository(file),
			});
			const master = service.loginMaster('14081998');
			const view = service.getCommerceShop(master.token, 'farm-central');
			service.configureCommerceOffer(master.token, 'farm-central', {
				itemId: 'oranberry', stock: 37, buyMode: 'available', buyPrice: 500,
				sellEnabled: true, sellPrice: 125, expectedRevision: view.shop.revision,
			});
			service = new RPGLoginService({
				masterCode: '14081998', commerceRepository: new RPGFileCommerceRepository(file),
			});
			const restoredMaster = service.loginMaster('14081998');
			const restored = service.getCommerceShop(restoredMaster.token, 'farm-central');
			assert.equal(restored.offers.find(item => item.itemId === 'oranberry').stock, 37);
		} finally {
			fs.rmSync(directory, {recursive: true, force: true});
		}
	});
});
