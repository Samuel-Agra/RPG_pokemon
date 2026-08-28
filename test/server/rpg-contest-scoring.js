'use strict';

const assert = require('assert').strict;
const {
	applyRPGContestSecondRoundCreativity,
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

	it('rewards variety and applies the specified second-round repetition bands', () => {
		const first = ['surf', 'icebeam', 'recover'];
		const varied = applyRPGContestSecondRoundCreativity(
			scoreRPGContestRound(['surf', 'raindance', 'dazzlinggleam']), first
		);
		assert.equal(varied.novelMoveBonus, 4);
		assert.equal(varied.repetitionPenaltyRate, 0);
		assert.ok(varied.creativityScore > 0);
		const reordered = applyRPGContestSecondRoundCreativity(
			scoreRPGContestRound(['recover', 'surf', 'icebeam']), first
		);
		assert.equal(reordered.repetitionPenaltyRate, 0.5);
		const repeated = applyRPGContestSecondRoundCreativity(scoreRPGContestRound(first), first);
		assert.equal(repeated.repetitionPenaltyRate, 1);
		assert.equal(repeated.total, 0);
	});

	it('penalizes a repeated move within one round and makes three uses mechanically worthless', () => {
		const varied = scoreRPGContestRound(['endeavor', 'protect', 'endeavor']);
		const outrageous = scoreRPGContestRound(['endeavor', 'endeavor', 'endeavor']);
		assert.equal(varied.repetitionPenaltyRate, 0.4);
		assert.ok(varied.repetitionPenalty > 0);
		assert.equal(outrageous.repetitionPenaltyRate, 1);
		assert.equal(outrageous.total, 0);
	});
});
