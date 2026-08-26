'use strict';

const assert = require('assert').strict;
const {RPGContestRuntimeManager} = require('../../dist/server/rpg-showdown');

function pokemon(species, moves) {
	return {
		name: species, species, item: '', ability: 'Overgrow', moves,
		nature: 'Jolly', gender: 'F', evs: {}, ivs: {}, level: 25,
		rpg: {version: 1, hp: 50, friendship: 140},
	};
}

function startedSession() {
	return {
		version: 1, id: 'contest-runtime', name: 'Concurso', status: 'started', mode: 'solo',
		category: 'beauty', rank: 'normal', scenario: {id: 'stage', name: 'Palco', tags: []},
		participants: [
			{id: 'may', kind: 'player', displayName: 'May', characterId: 'may', pokemon: {teamIndex: 0}},
			{id: 'npc', kind: 'npc', displayName: 'NPC', pokemon: {set: pokemon('Eevee', ['tackle', 'swift'])}},
		],
		invitations: [{characterId: 'may', response: 'accepted'}], presentationOrder: ['may', 'npc'],
		createdAt: 1, updatedAt: 2, startedAt: 2,
	};
}

describe('RPG contest runtime', () => {
	it('runs visible three-move presentations across two rounds and emits ordered events', () => {
		const teams = new Map([['may', [pokemon('Milotic', ['surf', 'icebeam', 'recover', 'raindance'])]]]);
		let now = 10;
		const runtime = new RPGContestRuntimeManager({now: () => ++now, getCharacterTeam: id => teams.get(id)});
		let view = runtime.start(startedSession());
		assert.equal(view.round, 1);
		assert.equal(view.currentParticipantId, 'may');
		assert.equal(view.canAct, false);
		assert.equal(runtime.snapshot('contest-runtime', {characterId: 'may'}).canAct, true);
		assert.throws(() => runtime.action('contest-runtime', {type: 'select-move', moveId: 'surf'}, {master: true}),
			/controlled by another user/);

		for (const moveId of ['surf', 'surf', 'icebeam']) {
			view = runtime.action('contest-runtime', {type: 'select-move', moveId}, {characterId: 'may'});
		}
		assert.equal(view.phase, 'awaiting_judging');
		assert.deepEqual(view.participants[0].rounds[0], ['surf', 'surf', 'icebeam']);
		assert.equal(runtime.snapshot('contest-runtime', {master: true}).canJudge, true);
		view = runtime.action('contest-runtime', {type: 'judging-complete'}, {master: true});
		assert.equal(view.currentParticipantId, 'npc');
		for (const moveId of ['tackle', 'swift', 'tackle']) {
			view = runtime.action('contest-runtime', {type: 'select-move', moveId}, {master: true});
		}
		view = runtime.action('contest-runtime', {type: 'judging-complete'}, {master: true});
		assert.equal(view.round, 2);
		assert.equal(view.currentParticipantId, 'may');
		view = runtime.action('contest-runtime', {type: 'abandon'}, {characterId: 'may'});
		assert.equal(view.currentParticipantId, 'npc');
		assert.equal(view.participants[0].disqualified, true);
		assert.throws(() => runtime.action('contest-runtime', {type: 'abandon'}, {characterId: 'may'}), /active Player/);
		for (const moveId of ['swift', 'swift', 'tackle']) {
			view = runtime.action('contest-runtime', {type: 'select-move', moveId}, {master: true});
		}
		view = runtime.action('contest-runtime', {type: 'judging-complete'}, {master: true});
		assert.equal(view.status, 'ended');
		assert.equal(view.phase, 'finished');
		assert.deepEqual(view.events.map(event => event.sequence), view.events.map((event, index) => index));
	});

	it('accepts TM changes until the first move and freezes the entire moveset afterwards', () => {
		const teams = new Map([['may', [pokemon('Milotic', ['surf', 'recover'])]]]);
		const runtime = new RPGContestRuntimeManager({getCharacterTeam: id => teams.get(id)});
		runtime.start(startedSession());
		teams.get('may')[0].moves = ['raindance', 'icebeam'];
		let view = runtime.snapshot('contest-runtime', {characterId: 'may'});
		assert.deepEqual(view.participants[0].pokemon.moves.map(move => move.id), ['raindance', 'icebeam']);
		view = runtime.action('contest-runtime', {type: 'select-move', moveId: 'raindance'}, {characterId: 'may'});
		assert.equal(view.participants[0].pokemon.movesFrozen, true);
		teams.get('may')[0].moves = ['surf'];
		view = runtime.snapshot('contest-runtime', {characterId: 'may'});
		assert.deepEqual(view.participants[0].pokemon.moves.map(move => move.id), ['raindance', 'icebeam']);
		assert.throws(() => runtime.action('contest-runtime', {type: 'select-move', moveId: 'surf'}, {characterId: 'may'}),
			/does not know/);
	});
});
