'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim');
const { RPGItems, RPGShopSystem } = require('../../dist/sim/rpg-showdown');
const { RPGBagManagement } = require('../../dist/server/rpg-showdown/bag-management');
const { RPG_EXCLUDED_IV_EV_ITEM_IDS } = require('../../dist/server/rpg-showdown/battle-session');

const FORBIDDEN_REQUEST_ITEMS = [
	'Macho Brace',
	'Grepa Berry', 'Hondew Berry', 'Kelpsy Berry', 'Pomeg Berry', 'Qualot Berry', 'Tamato Berry',
];

describe('RPG held item registry', () => {
	it('registers the 176 allowed current held items from the requested lists', () => {
		const dex = Dex.mod('gen9');
		const held = RPGItems.list().filter(item => item.tags?.includes('held'));
		const currentHeld = held.filter(item =>
			!item.tags?.includes('megastone') && !item.tags?.includes('legacy')
		);
		assert.equal(currentHeld.length, 176);
		assert.equal(held.length, 245);
		assert.equal(held.filter(item => item.tags?.includes('megastone')).length, 47);
		assert.equal(held.filter(item => item.tags?.includes('berry')).length, 47);
		assert.deepEqual(held.filter(item => item.tags?.includes('gem')).map(item => item.id), ['normalgem']);
		const breeding = held.filter(item => item.tags?.includes('breeding'));
		assert.deepEqual(breeding.map(item => item.id).sort(), [
			'destinyknot', 'everstone',
			'poweranklet', 'powerband', 'powerbelt', 'powerbracer', 'powerlens', 'powerweight',
		].sort());
		assert.equal(breeding.every(item => item.category === 'key' && item.tags.includes('keyitem')), true);
		assert.equal(RPGItems.require('portableincubator').category, 'key');
		for (const item of held) {
			if (item.source === 'showdown') assert(dex.items.get(item.id).exists, item.name);
			assert.equal(item.usableInBattle, false);
			assert.equal(item.effect.type, 'equip-held-item');
			assert(!RPG_EXCLUDED_IV_EV_ITEM_IDS.has(item.id), item.name);
		}
	});

	it('prices every allowed item and exposes it through the default shop catalog', () => {
		const held = RPGItems.list().filter(item => item.tags?.includes('held'));
		const catalog = RPGShopSystem.createCatalog('held-price-test');
		for (const item of held) {
			assert(item.price, item.name);
			const offer = catalog.offers.find(candidate => candidate.itemId === item.id);
			assert(offer, item.name);
			assert.equal(offer.buyPrice, item.price.buy);
			assert.equal(offer.sellPrice, item.price.sell);
		}
		assert.deepEqual(
			held.filter(item => item.price.buy === undefined && !item.tags?.includes('megastone'))
				.map(item => item.id).sort(),
			[
				'adamantcrystal', 'adamantorb', 'cornerstonemask', 'griseouscore', 'griseousorb',
				'hearthflamemask', 'lustrousglobe', 'lustrousorb', 'rustedshield', 'rustedsword',
				'souldew', 'wellspringmask', 'blueorb', 'redorb',
			].sort()
		);
		assert.equal(RPGItems.require('choiceband').price.buy, 100000);
		assert.equal(RPGItems.require('leftovers').price.buy, 20000);
		assert.equal(RPGItems.require('oranberry').price.buy, 500);
		assert.equal(RPGItems.require('normalgem').price.buy, 15000);
		assert.deepEqual(
			[RPGItems.require('destinyknot').price.buy, RPGItems.require('destinyknot').price.sell],
			[50000, 12500]
		);
		for (const id of ['powerweight', 'powerbracer', 'powerbelt', 'powerlens', 'powerband', 'poweranklet']) {
			assert.deepEqual([RPGItems.require(id).price.buy, RPGItems.require(id).price.sell], [10000, 2500], id);
		}
		assert.deepEqual(
			[RPGItems.require('protein').price.buy, RPGItems.require('protein').price.sell], [150000, 37500]
		);
	});
	it('maps all 47 classic Mega Stones to valid native Mega formes', () => {
		const dex = Dex.mod('gen9');
		const stones = RPGItems.list().filter(item => item.tags?.includes('held')).filter(item => item.tags?.includes('megastone'));
		assert.equal(stones.length, 47);
		for (const stone of stones) {
			const item = dex.items.get(stone.id);
			assert(item.exists, stone.name);
			const mappings = Object.entries(item.megaStone || {});
			assert.equal(mappings.length, 1, stone.name);
			const [baseSpecies, megaSpecies] = mappings[0];
			assert(dex.species.get(baseSpecies).exists, stone.name);
			assert(dex.species.get(megaSpecies).isMega, stone.name);
			assert.equal(stone.price.buy, undefined);
			assert.equal(stone.price.sell, 25000);
		}
	});
	it('registers the 22 authorized legacy held items with their native mechanics', () => {
		const dex = Dex.mod('gen9');
		const legacy = RPGItems.list().filter(item => item.tags?.includes('held')).filter(item => item.tags?.includes('legacy'));
		assert.equal(legacy.length, 22);
		for (const registered of legacy) {
			const item = dex.items.get(registered.id);
			assert(item.exists, registered.name);
			assert.equal(item.isNonstandard, 'Past', registered.name);
			assert(registered.price, registered.name);
		}
		assert.equal(typeof dex.items.get('mail').onTakeItem, 'function');
		assert.equal(typeof dex.items.get('berserkgene').onUpdate, 'function');
		assert.equal(typeof dex.items.get('pinkbow').onBasePower, 'function');
		assert.equal(typeof dex.items.get('polkadotbow').onBasePower, 'function');
		assert.equal(typeof dex.items.get('stick').onModifyCritRatio, 'function');
		assert.equal(typeof dex.items.get('leek').onModifyCritRatio, 'function');
		for (const orb of ['blueorb', 'redorb']) {
			const registered = RPGItems.require(orb);
			assert(dex.items.get(orb).isPrimalOrb);
			assert(registered.tags.includes('primalorb'));
			assert.equal(registered.price.buy, undefined);
			assert.equal(registered.price.sell, 25000);
		}
	});
	it('provides Portuguese descriptions for every allowed held item', () => {
		const dex = Dex.mod('gen9');
		for (const item of RPGItems.list().filter(item => item.tags?.includes('held'))) {
			const description = RPGBagManagement.description(item);
			const native = dex.items.get(item.id);
			const english = native.desc || native.shortDesc || '';
			assert(description.length > 10, item.name);
			assert.notEqual(description, english, item.name);
			assert.doesNotMatch(
				description,
				/\bHolder('| is| has| gains| moves| cannot)|\bSingle use\b|\bRestores\b|\bRaises\b|\bIf held by\b/i,
				item.name
			);
		}
		assert.match(RPGBagManagement.description(RPGItems.require('oranberry')), /recupera 10 HP/);
		assert.match(RPGBagManagement.description(RPGItems.require('charizarditey')), /Mega Charizard Y/);
	});
	it('keeps every remaining IV or EV training item outside the RPG registry', () => {
		for (const name of FORBIDDEN_REQUEST_ITEMS) {
			assert.equal(RPGItems.has(Dex.toID(name)), false, name);
		}
	});
});
