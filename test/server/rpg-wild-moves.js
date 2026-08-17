'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim');
const { RPGBattleSessionService } = require('../../dist/server/rpg-showdown/battle-session');

function service(random = () => 0.25) {
	return new RPGBattleSessionService({ createId: () => 'wild-moves', random });
}

function configuredSet(species, level, random, kind = 'wild', nature = '') {
	const sessions = service(random);
	const battle = sessions.create();
	return sessions.update(battle.id, {
		participants: [{
			id: 'controlled', team: 'B', kind, displayName: species,
			selectionLimit: 1,
			pokemon: [{ set: { species, name: species, level, moves: ['tackle'], nature } }],
		}],
	}).participants[0].pokemon[0].set;
}

function damaging(move) {
	return Dex.mod('gen9').moves.get(move).category !== 'Status';
}

describe('RPG controlled Pokemon level-up moves', () => {
	it('returns a session to ready when runtime startup must be rolled back', () => {
		const sessions = service();
		const battle = sessions.create();
		const started = sessions.repository.get(battle.id);
		started.status = 'started';
		started.startedAt = 10;
		sessions.repository.set(started);
		const restored = sessions.rollbackStart(battle.id);
		assert.equal(restored.status, 'ready');
		assert.equal(restored.startedAt, undefined);
	});

	it('keeps every Generation 9 level-up move when there are at most four', () => {
		const set = configuredSet('Charmander', 5);
		assert.deepEqual(set.moves, ['growl', 'scratch', 'ember']);
		assert.equal(set.moves.filter(damaging).length, 2);
	});

	it('randomly assigns a Generation 9 nature to wild, boss and horde Pokemon', () => {
		const natures = Dex.mod('gen9').natures.all();
		for (const kind of ['wild', 'boss', 'horde']) {
			assert.equal(configuredSet('Charmander', 5, () => 0, kind).nature, natures[0].name);
			assert.equal(configuredSet('Charmander', 5, () => 0.999999, kind).nature, natures.at(-1).name);
		}
	});

	it('uses two thirds normal and one third hidden abilities for wild and horde Pokemon', () => {
		for (const kind of ['wild', 'horde']) {
			assert.equal(configuredSet('Charizard', 5, () => 0, kind).ability, 'Blaze');
			assert.equal(configuredSet('Charizard', 5, () => 0.666666, kind).ability, 'Blaze');
			assert.equal(configuredSet('Charizard', 5, () => 0.666667, kind).ability, 'Solar Power');
			assert.equal(configuredSet('Charizard', 5, () => 0.999999, kind).ability, 'Solar Power');
			assert.equal(configuredSet('Hoppip', 5, () => 0.5, kind).ability, 'Leaf Guard');
			assert.equal(configuredSet('Haunter', 25, () => 0.999999, kind).ability, 'Levitate');
		}
		assert.equal(configuredSet('Charizard', 5, () => 0.999999, 'boss').ability, 'Blaze');
		assert.equal(configuredSet('Charizard', 5, () => 0.999999, 'npc').ability, 'Blaze');
	});

	it('preserves an explicit nature and keeps the NPC default neutral', () => {
		assert.equal(configuredSet('Charmander', 5, () => 0.8, 'wild', 'Adamant').nature, 'Adamant');
		assert.equal(configuredSet('Charmander', 5, () => 0.8, 'npc').nature, 'Hardy');
	});
	it('uses zero IVs and 508 random EVs before battle-mode overrides', () => {
		for (const kind of ['wild', 'boss', 'horde', 'npc']) {
			const set = configuredSet('Charmander', 5, () => 0.25, kind);
			assert.deepEqual(set.ivs, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
			assert.equal(Object.values(set.evs).reduce((total, value) => total + value, 0), 508);
			for (const value of Object.values(set.evs)) {
				assert(value >= 0 && value <= 252);
				assert.equal(value % 4, 0);
			}
		}
	});
	it('randomly selects four moves with at least two damaging moves when available', () => {
		let value = 0;
		const set = configuredSet('Charizard', 100, () => (value = (value + 0.173) % 1));
		assert.equal(set.moves.length, 4);
		assert.equal(new Set(set.moves).size, 4);
		assert(set.moves.filter(damaging).length >= 2);
	});

	it('allows a Pokemon with no damaging level-up move at its current level', () => {
		const set = configuredSet('Smeargle', 1);
		assert.deepEqual(set.moves, ['sketch']);
		assert.equal(set.moves.filter(damaging).length, 0);
	});
});
