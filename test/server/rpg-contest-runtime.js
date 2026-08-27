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

function judging(overrides = {}) {
	return {
		type: 'submit-judging',
		criteria: {
			visualComposition: 4, sequenceContinuity: 4, stageUse: 4,
			trainerPokemonSync: 4, interpretationFinale: 4,
		},
		...overrides,
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
		assert.deepEqual(view.participants[0].roundScores, [null, null]);
		const masterRoundView = runtime.snapshot('contest-runtime', {master: true});
		assert.ok(masterRoundView.participants[0].roundScores[0].moveBaseScore > 0);
		assert.ok(masterRoundView.participants[0].roundScores[0].comboScore <= 15);
		assert.ok(masterRoundView.participants[0].roundScores[0].fieldInteractionScore > 0);
		assert.ok(masterRoundView.participants[0].roundStages[0].moves[0].transformations.includes('field:wetstage'));
		assert.equal(runtime.snapshot('contest-runtime', {master: true}).canJudge, true);
		assert.throws(() => runtime.action('contest-runtime', judging(), {characterId: 'may'}), /Only the Master/);
		view = runtime.action('contest-runtime', judging({comment: 'Uma apresentação muito harmoniosa.'}), {master: true});
		assert.equal(view.currentParticipantId, 'npc');
		assert.equal(view.participants[0].judging[0].rawScore, 20);
		assert.equal(view.participants[0].judging[0].interpretationScore, 8);
		assert.ok(view.participants[0].audienceReactions[0].comments.includes('Uma apresentação muito harmoniosa.'));
		const playerView = runtime.snapshot('contest-runtime', {characterId: 'may'});
		assert.deepEqual(playerView.participants[0].roundScores, [null, null]);
		assert.deepEqual(playerView.participants[0].judging, [null, null]);
		assert.ok(playerView.participants[0].audienceReactions[0]);
		for (const moveId of ['tackle', 'swift', 'tackle']) {
			view = runtime.action('contest-runtime', {type: 'select-move', moveId}, {master: true});
		}
		view = runtime.action('contest-runtime', judging(), {master: true});
		assert.equal(view.round, 2);
		assert.equal(view.currentParticipantId, 'may');
		view = runtime.action('contest-runtime', {type: 'abandon'}, {characterId: 'may'});
		assert.equal(view.currentParticipantId, 'npc');
		assert.equal(view.participants[0].disqualified, true);
		assert.throws(() => runtime.action('contest-runtime', {type: 'abandon'}, {characterId: 'may'}), /active Player/);
		for (const moveId of ['swift', 'swift', 'tackle']) {
			view = runtime.action('contest-runtime', {type: 'select-move', moveId}, {master: true});
		}
		view = runtime.action('contest-runtime', judging(), {master: true});
		assert.equal(view.status, 'ended');
		assert.equal(view.phase, 'finished');
		assert.equal(view.results.length, 2);
		assert.equal(view.results.find(result => result.participantId === 'may').place, null);
		assert.equal(view.results.find(result => result.participantId === 'npc').place, 1);
		assert.deepEqual(view.events.map(event => event.sequence), view.events.map((event, index) => index));
	});

	it('validates all five criteria and requires a justification for mechanical correction', () => {
		const teams = new Map([['may', [pokemon('Milotic', ['surf'])]]]);
		const runtime = new RPGContestRuntimeManager({getCharacterTeam: id => teams.get(id)});
		runtime.start(startedSession());
		for (let index = 0; index < 3; index++) {
			runtime.action('contest-runtime', {type: 'select-move', moveId: 'surf'}, {characterId: 'may'});
		}
		assert.throws(() => runtime.action('contest-runtime', judging({
			criteria: {...judging().criteria, stageUse: 6},
		}), {master: true}), /between -1 and 5/);
		assert.throws(() => runtime.action('contest-runtime', judging({mechanicalCorrection: 3}), {master: true}),
			/requires a justification/);
		assert.throws(() => runtime.action('contest-runtime', judging({copyPenalty: -15}), {master: true}),
			/copy penalty requires a justification/);
		const view = runtime.action('contest-runtime', judging({
			mechanicalCorrection: -3, correctionJustification: 'A interação automática não ocorreu na narração.',
			copyPenalty: -6, copyJustification: 'Repetiu a estrutura visual apresentada anteriormente.',
		}), {master: true});
		assert.equal(view.participants[0].judging[0].mechanicalCorrection, -3);
		assert.equal(view.participants[0].judging[0].copyPenalty, -6);
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

	it('Mega Evolves together with a move and only then enables the Mega Stone bonus', () => {
		const charizard = pokemon('Charizard', ['flamethrower']);
		charizard.item = 'Charizardite X';
		const teams = new Map([['may', [charizard]]]);
		const session = startedSession();
		session.category = 'tough';
		const runtime = new RPGContestRuntimeManager({getCharacterTeam: id => teams.get(id)});
		let view = runtime.start(session);
		assert.equal(view.participants[0].pokemon.megaEligible, true);
		for (let index = 0; index < 3; index++) {
			view = runtime.action('contest-runtime', {
				type: 'select-move', moveId: 'flamethrower', activateMega: index === 0,
			}, {characterId: 'may'});
		}
		const master = runtime.snapshot('contest-runtime', {master: true});
		assert.equal(master.participants[0].rounds[0].length, 3);
		assert.equal(master.participants[0].pokemon.megaActivated, true);
		assert.equal(master.participants[0].roundScores[0].itemBonus, 2);
		assert.equal(master.participants[0].roundScores[0].itemBonusActive, true);
		assert.ok(master.events.some(event => event.megaActivated && event.moveId === 'flamethrower'));
	});
});
