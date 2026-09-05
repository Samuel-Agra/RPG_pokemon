'use strict';

const assert = require('assert').strict;
const {
	applyRPGContestMoveToStage,
	createRPGContestStage,
	resetRPGContestTemporaryStage,
	summarizeRPGContestRoundStage,
} = require('../../dist/server/rpg-showdown');

describe('RPG contest stage', () => {
	it('applies a transformation only to following moves in the same round', () => {
		const scenario = { id: 'garden', name: 'Festival de Flores', tags: ['flower', 'plant'], weather: '', terrain: '' };
		const stage = createRPGContestStage(scenario);
		const sun = applyRPGContestMoveToStage(stage, 'sunnyday', scenario);
		assert.equal(sun.interactionScore, 0);
		assert.ok(sun.transformations.includes('weather:sun'));
		assert.equal(sun.stateBefore.temporary.weather, '');
		assert.equal(sun.stateAfter.temporary.weather, 'sun');
		const petals = applyRPGContestMoveToStage(stage, 'petaldance', scenario);
		assert.ok(petals.interactionScore > 0);
		assert.ok(petals.interactions.includes('flores e plantas iluminadas'));
		assert.equal(petals.scenarioScore, 1);
	});

	it('keeps the venue base permanent and removes participant-created effects between rounds', () => {
		const scenario = { id: 'rain-stage', name: 'Palco Chuvoso', tags: ['light'], weather: 'rain', terrain: '' };
		const stage = createRPGContestStage(scenario);
		const fire = applyRPGContestMoveToStage(stage, 'fireblast', scenario);
		const light = applyRPGContestMoveToStage(stage, 'dazzlinggleam', scenario);
		const summary = summarizeRPGContestRoundStage([fire, light], stage);
		assert.ok(fire.interactions.includes('vapor'));
		assert.ok(light.interactions.includes('arco-íris'));
		assert.ok(summary.fieldInteractionScore <= 5);
		const reset = resetRPGContestTemporaryStage(stage);
		assert.equal(reset.base.weather, 'rain');
		assert.equal(reset.temporary.weather, '');
		assert.deepEqual(reset.temporary.tags, []);
	});

	it('persists non-weather stage changes and lets Defog clear them', () => {
		const scenario = { id: 'neutral-stage', name: 'Palco neutro', tags: [], weather: '', terrain: '' };
		const stage = createRPGContestStage(scenario);
		for (const [move, tag] of [
			['spikes', 'spikes'], ['toxicspikes', 'toxicspikes'], ['stealthrock', 'floatingrocks'],
			['stickyweb', 'stickyweb'], ['sandsearstorm', 'heatedsand'],
		]) {
			const result = applyRPGContestMoveToStage(stage, move, scenario);
			assert.ok(result.transformations.includes(`field:${tag}`), move);
			assert.ok(result.stateAfter.temporary.tags.includes(tag), move);
		}
		const cleared = applyRPGContestMoveToStage(stage, 'defog', scenario);
		assert.ok(cleared.transformations.includes('field:cleared-stage'));
		assert.deepEqual(cleared.stateAfter.temporary.tags.sort(), ['clearair', 'wind']);
		assert.equal(cleared.stateAfter.temporary.weather, '');
		assert.equal(cleared.stateAfter.temporary.terrain, '');
	});
});
