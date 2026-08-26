'use strict';

const assert = require('assert').strict;
const {
	RPGContestComboService,
	RPG_DEFAULT_CONTEST_COMBOS,
	scoreRPGContestRound,
} = require('../../dist/server/rpg-showdown');

describe('RPG contest mechanical scoring and combos', () => {
	it('scores base moves, continuity, tag relations and a prepared finale independently', () => {
		const score = scoreRPGContestRound(['raindance', 'fireblast', 'dazzlinggleam']);
		assert.ok(score.moveBaseScore > 0);
		assert.ok(score.continuityScore <= 5);
		assert.ok(score.tagSynergyScore <= 6);
		assert.ok(score.finaleScore <= 4);
		assert.ok(score.comboScore <= 15);
		assert.ok(score.discoveredInteractions.includes('steam'));
		assert.ok(score.discoveredInteractions.includes('rainbow'));
		assert.ok(score.matchedCombos.some(combo => combo.id === 'rainbowstage'));
	});

	it('ships many valid visual sequences and supports global Master combos', () => {
		assert.ok(RPG_DEFAULT_CONTEST_COMBOS.length >= 30);
		const service = new RPGContestComboService();
		const combo = service.create({
			id: 'aquatic-prism', name: 'Prisma Aquático', sequence: ['surf', 'icebeam', 'dazzlinggleam'], bonus: 5,
			description: 'A água congela e refrata a luz no encerramento.',
		});
		assert.equal(combo.source, 'master');
		assert.ok(service.list().some(entry => entry.id === 'aquaticprism'));
		assert.equal(service.delete(combo.id), true);
		assert.throws(() => service.delete('solar-bloom'), /cannot be deleted/);
	});
});
