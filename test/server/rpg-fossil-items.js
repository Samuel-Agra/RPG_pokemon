'use strict';

const assert = require('assert').strict;
const { RPGItems, RPGShopSystem } = require('../../dist/sim/rpg-showdown');

const EXPECTED_FOSSILS = {
	armorfossil: 500,
	clawfossil: 500,
	coverfossil: 3500,
	domefossil: 500,
	helixfossil: 500,
	jawfossil: 5000,
	oldamber: 7500,
	plumefossil: 3500,
	rootfossil: 500,
	sailfossil: 5000,
	skullfossil: 500,
	fossilizedbird: 2500,
	fossilizeddino: 2500,
	fossilizeddrake: 2500,
	fossilizedfish: 2500,
};

const EXPECTED_TREASURES = {
	tinymushroom: 250,
	bigmushroom: 2500,
	balmmushroom: 7500,
	pearl: 1000,
	bigpearl: 4000,
	pearlstring: 10000,
	stardust: 1500,
	starpiece: 6000,
	cometshard: 12500,
	nugget: 5000,
	bignugget: 20000,
	rarebone: 2500,
	prettyfeather: 500,
	tinybambooshoot: 375,
	bigbambooshoot: 1500,
	bottlecap: 5000,
	goldbottlecap: 50000,
	abilitycapsule: 25000,
	abilitypatch: 125000,
};

describe('RPG fossil items', () => {
	it('registers every fossil as a sellable, out-of-battle item', () => {
		const catalog = RPGShopSystem.createCatalog('fossil-test');
		for (const [itemId, sellPrice] of Object.entries(EXPECTED_FOSSILS)) {
			const item = RPGItems.require(itemId);
			assert.equal(item.usableInBattle, false);
			assert.equal(item.effect.type, 'revive-fossil');
			assert(item.tags.includes('fossil'));
			assert.equal(item.price.buy, sellPrice * 4);
			assert.equal(item.price.sell, sellPrice);
			assert.equal(catalog.offers.find(offer => offer.itemId === itemId).sellPrice, sellPrice);
		}
	});

	it('registers valuables and irrelevant rare items with inferred base prices', () => {
		const catalog = RPGShopSystem.createCatalog('treasure-test');
		for (const [itemId, sellPrice] of Object.entries(EXPECTED_TREASURES)) {
			const item = RPGItems.require(itemId);
			assert.equal(item.usableInBattle, false);
			assert.equal(item.consumedOnUse, false);
			assert.equal(item.effect.type, 'treasure');
			assert(item.tags.includes('treasure'));
			assert(item.tags.includes('sellonly'));
			assert.equal(item.price.buy, sellPrice * 4);
			assert.equal(item.price.sell, sellPrice);
			assert.equal(catalog.offers.find(offer => offer.itemId === itemId).sellPrice, sellPrice);
		}
	});
	it('records the four valid Galar fossil combinations', () => {
		assert.deepEqual(RPGItems.require('fossilizedbird').effect.revives, ['Arctozolt', 'Dracozolt']);
		assert.deepEqual(RPGItems.require('fossilizeddino').effect.revives, ['Arctozolt', 'Arctovish']);
		assert.deepEqual(RPGItems.require('fossilizeddrake').effect.revives, ['Dracozolt', 'Dracovish']);
		assert.deepEqual(RPGItems.require('fossilizedfish').effect.revives, ['Arctovish', 'Dracovish']);
	});
});
