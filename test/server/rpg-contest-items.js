'use strict';

const assert = require('assert').strict;
const {classifyRPGContestItem} = require('../../dist/server/rpg-showdown');
const {RPGItems} = require('../../dist/sim/rpg-showdown');

describe('RPG contest held items', () => {
	it('balances visual categories and treats all Mega Stones as one Tough unit', () => {
		const weighted = {beauty: 0, cute: 0, cool: 0, smart: 0, tough: 0};
		let countedMegaGroup = false;
		for (const item of RPGItems.list()) {
			const contest = classifyRPGContestItem(item);
			if (!contest.canScore) continue;
			if (contest.scoringMode === 'tera-matching-moves') continue;
			assert.ok(contest.points >= 1 && contest.points <= 3);
			if (contest.balanceGroup === 'mega-stones') {
				assert.equal(contest.category, 'tough');
				assert.equal(contest.points, 2);
				assert.equal(contest.scoringMode, 'mega-activation');
				if (countedMegaGroup) continue;
				countedMegaGroup = true;
			}
			weighted[contest.category]++;
		}
		assert.ok(Math.max(...Object.values(weighted)) - Math.min(...Object.values(weighted)) <= 1);
	});

	it('excludes visually unusable objects and all previously excluded item groups', () => {
		for (const id of ['cellbattery', 'berryjuice']) {
			const contest = classifyRPGContestItem(RPGItems.require(id));
			assert.equal(contest.canScore, false);
			assert.equal(contest.exclusionReason, 'not-useful');
		}
		assert.equal(classifyRPGContestItem(RPGItems.require('oranberry')).canScore, false);
	});

	it('registers one contest-only Terastallization item for every regular Pokemon type', () => {
		const teraItems = RPGItems.list().filter(item => item.tags?.includes('contestterastalization'));
		assert.equal(teraItems.length, 18);
		for (const item of teraItems) {
			const contest = classifyRPGContestItem(item);
			assert.equal(item.usableInBattle, false);
			assert.equal(item.effect.type, 'equip-held-item');
			assert.equal(item.price.buy, 2000);
			assert.equal(item.price.sell, 1000);
			assert.equal(contest.canScore, true);
			assert.equal(contest.points, 5);
			assert.equal(contest.category, null);
			assert.equal(contest.scoringMode, 'tera-matching-moves');
			assert.ok(contest.teraType);
		}
	});
});
