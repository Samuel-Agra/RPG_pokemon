'use strict';

const assert = require('assert').strict;
const {
	createRPGPendingTrainerSheet, startRPGHumanConflict, endRPGHumanTurn,
	moveRPGHuman, useRPGHumanAction, attackRPGHuman, maneuverRPGHuman,
	startRPGHumanChase, advanceRPGHumanChase, dashRPGHumanChase,
	triggerRPGHumanReaction, rpgTrainerTakeDamage, stabilizeRPGHumanTarget,
} = require('../../dist/server/rpg-showdown');

function trainer() {
	return { ...createRPGPendingTrainerSheet(), status: 'complete', classId: 'arqueologo', level: 1,
		attributes: { strength: 14, dexterity: 12, constitution: 12, intelligence: 12, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 } };
}
function scene(random = () => 0.5) {
	return startRPGHumanConflict([
		{ id: 'ana', sheet: trainer(), x: 0, y: 0 },
		{ id: 'bia', sheet: trainer(), x: 1, y: 0 },
	], random);
}

describe('RPG human conflicts', () => {
	it('tracks initiative, turn budget, split movement and surprise without touching Pokémon', () => {
		let state = scene();
		const id = state.order[0];
		state = moveRPGHuman(state, id, 0.5, 0);
		state = useRPGHumanAction(state, id, 'dash');
		assert.equal(state.turns[id].dashed, true);
		assert.throws(() => useRPGHumanAction(state, id, 'search'), /já utilizada/);
		state = moveRPGHuman(state, id, 10, 0);
		assert.equal(state.turns[id].movementSpent, 10);
		assert.throws(() => moveRPGHuman(state, id, 30, 0), /Deslocamento/);
		state = endRPGHumanTurn(state, id);
		assert.equal(state.order[state.current], state.order[1]);
	});

	it('keeps a surprised participant unable to act until their first turn ends', () => {
		let state = startRPGHumanConflict([
			{ id: 'ana', sheet: trainer(), x: 0, y: 0, surprised: true },
			{ id: 'bia', sheet: trainer(), x: 1, y: 0, surprised: true },
		], () => 0.5);
		const first = state.order[0];
		assert.throws(() => useRPGHumanAction(state, first, 'search'), /não pode agir/);
		state = endRPGHumanTurn(state, first);
		assert.equal(state.participants.find(entry => entry.id === first).surprised, false);
		assert.throws(() => useRPGHumanAction(state, state.order[1], 'search'), /não pode agir/);
	});

	it('resolves human-only attacks, nonlethal damage, defense and action consumption', () => {
		const state = scene();
		const attacker = state.order[0];
		const target = state.order[1];
		const result = attackRPGHuman(state, attacker, target, { nonlethal: true }, () => 0.99);
		assert.equal(result.attack.critical, true);
		assert.equal(result.damage, 3);
		assert.equal(result.state.participants.find(entry => entry.id === target).sheet.hitPoints.current, 17);
		assert.throws(() => attackRPGHuman(result.state, attacker, target), /já utilizada/);
		assert.throws(() => attackRPGHuman(state, attacker, target,
			{ weapon: { dice: 1, sides: 6, ranged: true, normalRange: 10, maximumRange: 20 }, nonlethal: true }), /não letal/);
	});

	it('applies grapple and opposed shoves to the human sheet', () => {
		const state = scene();
		const actor = state.order[0];
		const target = state.order[1];
		const values = [0.9, 0.1];
		const result = maneuverRPGHuman(state, actor, target, 'grapple', 'acrobacia', () => values.shift());
		assert.equal(result.success, true);
		assert.equal(result.state.participants.find(entry => entry.id === target).sheet.survival.conditions[0].id, 'agarrado');
		assert.equal(state.participants.find(entry => entry.id === target).sheet.survival, undefined);
	});

	it('uses chase bands and Fortitude exhaustion after safe dashes', () => {
		let chase = startRPGHumanChase('short');
		chase = advanceRPGHumanChase(chase, 20, 10);
		assert.equal(chase.band, 'long');
		chase = advanceRPGHumanChase(chase, 12, 10);
		assert.equal(chase.band, 'escaped');
		let result;
		for (let i = 0; i < 5; i++) {
			result = dashRPGHumanChase(chase, 'ana', trainer(), () => 0);
			chase = result.chase;
		}
		assert.equal(result.save.success, false);
		assert.equal(result.sheet.survival.exhaustion, 1);
	});

	it('allows reactions once and stabilizes a dying adjacent trainer', () => {
		let state = scene();
		const actor = state.order[0];
		const target = state.order[1];
		state = triggerRPGHumanReaction(state, actor, 'opportunity', target);
		assert.throws(() => triggerRPGHumanReaction(state, actor, 'opportunity', target), /indisponível/);
		state.participants.find(entry => entry.id === target).sheet = rpgTrainerTakeDamage(trainer(), 20);
		const result = stabilizeRPGHumanTarget(state, actor, target, () => 0.99);
		assert.equal(result.state.participants.find(entry => entry.id === target).sheet.survival.lifeState, 'stable');
	});
});
