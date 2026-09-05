'use strict';

const assert = require('assert').strict;
const {join} = require('node:path');
const {tmpdir} = require('node:os');
const {RPGTournamentSessionService} = require('../../dist/server/rpg-showdown/tournament-session');

function participant(id, source, strength = 50) {
	return {id, name: id, source, strength, type: source === 'player' ? 'player' : 'npc', ...(source === 'player' ? {characterId: id} : {})};
}

describe('RPG tournament sessions', () => {
	it('persists a complete bracket and automatically resolves NPC-only rounds', () => {
		const service = new RPGTournamentSessionService(join(tmpdir(), `rpg-tournament-${Date.now()}-1.json`), () => 0.999);
		const tournament = service.create({name: 'Copa', activity: 'battle', bracketSize: 4, format: 'singles', conditions: {}, participants: [
			participant('saved', 'registered'), participant('temporary', 'temporary', 100),
			participant('player-one', 'player'), participant('player-two', 'player'),
		]});
		service.setRoster(tournament.id, 'player-one', ['pokemon-one']);
		service.setRoster(tournament.id, 'player-two', ['pokemon-two']);
		const started = service.start(tournament.id);
		const automatic = started.matches.find(match => match.automatic);
		assert.equal(automatic.winnerId, 'saved');
		assert.equal(automatic.resolution, 'registered-priority');
		assert.equal(started.matches.find(match => !match.automatic).status, 'ready');
	});

	it('weights temporary NPC results by team strength', () => {
		let rolls = 0;
		const service = new RPGTournamentSessionService(join(tmpdir(), `rpg-tournament-${Date.now()}-2.json`), () => rolls++ < 3 ? 0.999 : 0.7);
		const tournament = service.create({name: 'Copa NPC', activity: 'contest', bracketSize: 4, format: 'solo', conditions: {}, participants: [
			participant('strong', 'temporary', 90), participant('weak', 'temporary', 10),
			participant('other-a', 'temporary', 50), participant('other-b', 'temporary', 50),
		]});
		const ended = service.start(tournament.id);
		assert.equal(ended.status, 'ended');
		assert.ok(ended.thirdPlaceId);
		assert.equal(ended.matches.filter(match => match.placement === 'third-place').length, 1);
		assert.equal(ended.matches[0].winnerId, 'strong');
	});

	it('doubles the entrants and advances complete trainer pairs in Multi', () => {
		const service = new RPGTournamentSessionService(join(tmpdir(), `rpg-tournament-${Date.now()}-3.json`), () => 0);
		const participants = Array.from({length: 8}, (_, index) => participant(`npc-${index + 1}`, 'temporary', index + 1));
		const tournament = service.create({name: 'Copa Multi', activity: 'battle', bracketSize: 4, format: 'multi', conditions: {}, participants});
		assert.equal(tournament.participants.length, 8);
		assert.deepEqual(tournament.teams[0], ['npc1', 'npc2']);
		const ended = service.start(tournament.id);
		assert.equal(ended.status, 'ended');
		for (const team of ended.teams) {
			const firstNumber = Number(team[0].replace('npc', ''));
			assert.equal(team[1], `npc${firstNumber + 1}`);
		}
		assert.notDeepEqual(ended.teams, tournament.teams);
		assert.equal(ended.matches[0].participant1Ids.length, 2);
		assert.equal(ended.matches.at(-1).participant1Ids.length, 2);
	});
});
