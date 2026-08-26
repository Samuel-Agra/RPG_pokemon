'use strict';

const assert = require('assert').strict;
const {
	applyRPGContestPerformance, getRPGContestPerformance, getRPGContestPerformanceBonus,
	rankRPGContestParticipants,
} = require('../../dist/server/rpg-showdown');

describe('RPG contest progression', () => {
	it('ranks ties consistently and grants participation plus placement Performance', () => {
		const results = rankRPGContestParticipants([
			{id: 'a', disqualified: false, roundTotals: [20, 20], scenarioCoherenceBonus: 2, performanceBonus: 1},
			{id: 'b', disqualified: false, roundTotals: [20, 20], scenarioCoherenceBonus: 2, performanceBonus: 1},
			{id: 'c', disqualified: false, roundTotals: [10, 10], scenarioCoherenceBonus: 0, performanceBonus: 0},
			{id: 'd', disqualified: true, roundTotals: [99], scenarioCoherenceBonus: 0, performanceBonus: 0},
		]);
		assert.deepEqual(results.map(result => result.place), [1, 1, 3, null]);
		assert.deepEqual(results.map(result => result.performanceGain), [7, 7, 4, 0]);
	});

	it('keeps Performance with its trainer, caps it and resets it after an owner change', () => {
		const set = {species: 'Milotic', moves: ['surf'], rpg: {contestPerformance: 98, contestPerformanceTrainerId: 'may'}};
		assert.equal(getRPGContestPerformance(set, 'may'), 98);
		assert.equal(getRPGContestPerformanceBonus(98), 19);
		assert.deepEqual(applyRPGContestPerformance(set, 'may', 7), {before: 98, after: 100, gained: 2});
		assert.equal(getRPGContestPerformance(set, 'dawn'), 0);
		assert.deepEqual(applyRPGContestPerformance(set, 'dawn', 2), {before: 0, after: 2, gained: 2});
		assert.equal(set.rpg.contestPerformanceTrainerId, 'dawn');
	});
});
