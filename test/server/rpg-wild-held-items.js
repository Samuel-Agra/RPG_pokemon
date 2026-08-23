'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim');
const {
	RPGBattleSessionService, RPG_EXCLUDED_IV_EV_ITEM_IDS,
} = require('../../dist/server/rpg-showdown/battle-session');

function configuredSet(random, kind = 'wild', item = '') {
	const sessions = new RPGBattleSessionService({ createId: () => 'wild-held-item', random });
	const battle = sessions.create();
	return sessions.update(battle.id, {
		participants: [{
			id: 'controlled', team: 'B', kind, displayName: 'Charmander', selectionLimit: 1,
			pokemon: [{ set: {
				species: 'Charmander', level: 5, moves: ['scratch'], nature: 'Hardy', item,
			} }],
		}],
	}).participants[0].pokemon[0].set;
}

describe('RPG wild held items', () => {
	it('uses exclusive 50% consumable, 1% regular, and 49% empty probability ranges', () => {
		const consumable = configuredSet(() => 0);
		const rare = configuredSet(() => 0.505);
		const empty = configuredSet(() => 0.51);
		assert(consumable.item);
		assert(rare.item);
		assert.equal(empty.item, '');
	});

	it('excludes evolution, Mega, Z, Primal, and form-changing items', () => {
		const dex = Dex.mod('gen9');
		const item = dex.items.get(configuredSet(() => 0.505).item);
		assert(!item.megaStone);
		assert(!item.zMove);
		assert(!item.isPrimalOrb);
		assert(!item.forcedForme);
		assert(!item.onPlate);
		assert(!item.onMemory);
		assert(!item.onDrive);
		assert(!dex.species.all().some(species => dex.toID(species.evoItem) === item.id));
	});

	it('preserves explicit items and does not randomize NPC held items', () => {
		assert.equal(configuredSet(() => 0, 'wild', 'Leftovers').item, 'Leftovers');
		assert.equal(configuredSet(() => 0, 'npc').item, '');
	});
	it('keeps training modifiers excluded while allowing breeding-only held items', () => {
		for (const item of [
			'Bottle Cap', 'Gold Bottle Cap', 'Macho Brace',
			'Pomeg Berry', 'Kelpsy Berry', 'Qualot Berry', 'Hondew Berry', 'Grepa Berry', 'Tamato Berry',
			'HP Up', 'Protein', 'Iron', 'Calcium', 'Zinc', 'Carbos',
			'Health Feather', 'Muscle Feather', 'Resist Feather', 'Genius Feather', 'Clever Feather', 'Swift Feather',
			'Health Mochi', 'Muscle Mochi', 'Resist Mochi', 'Genius Mochi', 'Clever Mochi', 'Swift Mochi',
			'Fresh-Start Mochi',
		]) assert(RPG_EXCLUDED_IV_EV_ITEM_IDS.has(Dex.toID(item)), item);
		assert(!RPG_EXCLUDED_IV_EV_ITEM_IDS.has(Dex.toID('Pretty Feather')));
		assert(!RPG_EXCLUDED_IV_EV_ITEM_IDS.has(Dex.toID('Fairy Feather')));
		for (const item of [
			'Destiny Knot', 'Power Weight', 'Power Bracer', 'Power Belt', 'Power Lens', 'Power Band', 'Power Anklet',
		]) {
			assert(!RPG_EXCLUDED_IV_EV_ITEM_IDS.has(Dex.toID(item)), item);
		}
	});
});
