'use strict';

const assert = require('node:assert').strict;
const { existsSync } = require('node:fs');
const path = require('node:path');
const { Dex } = require('../../dist/sim/dex');
const { toID } = require('../../dist/sim/dex-data');
const { RPGItems } = require('../../dist/sim/rpg-showdown');
const { getRPGItemIconPath } = require('../../dist/server/rpg-showdown/item-icons');

const staticRoot = path.resolve(__dirname, '../../server/static/rpg');

describe('RPG item sprites', () => {
	it('provides a Showdown sprite or a local PNG for every registered item', () => {
		const missing = [];
		for (const item of RPGItems.list()) {
			const showdownSprite = Dex.items.get(item.id).spritenum;
			const localIcon = getRPGItemIconPath(item.id);
			if (!Number.isInteger(showdownSprite) && !localIcon) missing.push(item.id);
			if (localIcon) {
				assert(localIcon.startsWith('./assets/item-icons/'), localIcon);
				const localPath = localIcon.split('?')[0];
				assert(existsSync(path.resolve(staticRoot, localPath)), localIcon);
			}
		}
		assert.deepEqual(missing, []);
	});

	it('uses original local open-cloth-sack sprites for all six RPG vitamins', () => {
		for (const itemId of ['hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos']) {
			assert.equal(getRPGItemIconPath(itemId).split('?')[0], './assets/item-icons/' + itemId + '.png');
		}
	});

	it('uses Showdown sprites when available and original local sprites for the remaining treasures', () => {
		const showdownTreasures = ['bignugget', 'rarebone', 'prettyfeather', 'bottlecap', 'goldbottlecap'];
		for (const itemId of showdownTreasures) {
			assert(Number.isInteger(Dex.items.get(itemId).spritenum), itemId);
			assert.equal(getRPGItemIconPath(itemId), null, itemId);
		}

		const localTreasures = [
			'tinymushroom', 'bigmushroom', 'balmmushroom',
			'pearl', 'bigpearl', 'pearlstring',
			'stardust', 'starpiece', 'cometshard', 'nugget',
			'tinybambooshoot', 'bigbambooshoot', 'abilitycapsule', 'abilitypatch',
		];
		for (const itemId of localTreasures) {
			assert.equal(
				getRPGItemIconPath(itemId).split('?')[0],
				`./assets/item-icons/${itemId}.png`,
				itemId
			);
		}
	});

	it('uses the matching type-colored CD for every generation 9 TM', () => {
		const paths = new Set();
		for (const item of RPGItems.list('tm')) {
			const move = Dex.mod('gen9').moves.get(String(item.effect.move));
			const expected = `./assets/item-icons/tm-${toID(move.type)}.png`;
			assert(getRPGItemIconPath(item.id).startsWith(expected), item.name);
			paths.add(expected);
		}
		assert.equal(paths.size, 18);
	});
});
