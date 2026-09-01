'use strict';

const assert = require('assert').strict;
const {
	RPGContestSessionService,
	RPGMemoryContestSessionRepository,
} = require('../../dist/server/rpg-showdown/contest-session');

function pokemon(species, hp = 20) {
	return {
		name: species, species, item: '', ability: 'Overgrow', moves: ['tackle', 'growl'],
		nature: 'Jolly', gender: 'M', evs: {}, ivs: {}, level: 20,
		rpg: {version: 1, hp, friendship: 100},
	};
}

function participant(id, characterId) {
	return {id, kind: 'player', displayName: characterId, characterId};
}

describe('RPG contest preparation sessions', () => {
	it('allows concurrent contests and exposes active contests to spectators', () => {
		let sequence = 0;
		const service = new RPGContestSessionService({createId: () => `contest-${++sequence}`});
		const npc = id => ({id, kind: 'npc', displayName: id, pokemon: {set: pokemon('Eevee')}});
		for (let index = 0; index < 2; index++) {
			const contest = service.create();
			service.update(contest.id, {participants: [npc(`a-${index}`), npc(`b-${index}`)]});
			service.invite(contest.id);
			assert.equal(service.start(contest.id).status, 'started');
		}
		assert.equal(service.list('spectator').filter(contest => contest.status === 'started').length, 2);
	});

	it('prepares a solo contest, collects one Pokemon per Player and defines presentation order', () => {
		let now = 100;
		const teams = new Map([
			['may', [pokemon('Milotic')]],
			['dawn', [pokemon('Piplup')]],
		]);
		const service = new RPGContestSessionService({
			repository: new RPGMemoryContestSessionRepository(),
			now: () => ++now,
			createId: () => 'Grand Festival 1',
			random: () => 0,
			getCharacterTeam: id => teams.get(id),
		});
		let contest = service.create({name: 'Festival de Flores'});
		assert.equal(contest.id, 'grandfestival1');
		assert.equal(contest.mode, 'solo');
		contest = service.update(contest.id, {
			category: 'beauty', rank: 'great',
			scenario: {id: 'flower-festival', name: 'Festival de Flores', tags: ['Flower', 'Dance']},
			participants: [participant('may-entry', 'may'), participant('dawn-entry', 'dawn')],
		});
		assert.deepEqual(contest.scenario.tags, ['flower', 'dance']);
		contest = service.invite(contest.id);
		assert.equal(contest.status, 'inviting');
		assert.deepEqual(contest.invitations.map(entry => entry.characterId), ['may', 'dawn']);
		assert.throws(() => service.respond(contest.id, 'may', 'accepted'), /select 1 Pokemon/);
		service.selectPokemon(contest.id, 'may', 0);
		service.respond(contest.id, 'may', 'accepted');
		service.selectPokemon(contest.id, 'dawn', 0);
		contest = service.respond(contest.id, 'dawn', 'accepted');
		assert.equal(contest.status, 'ready');
		contest = service.start(contest.id);
		assert.equal(contest.status, 'started');
		assert.deepEqual(contest.presentationOrder, ['dawnentry', 'mayentry']);
		assert.throws(() => service.cancel(contest.id), /can no longer be cancelled/);
	});

	it('supports Master-controlled NPCs and enforces the 2 to 10 participant limits', () => {
		const service = new RPGContestSessionService({createId: () => 'npc-contest'});
		const contest = service.create();
		const npc = index => ({
			id: `npc-${index}`, kind: 'npc', displayName: `NPC ${index}`,
			pokemon: {set: pokemon(index === 1 ? 'Pikachu' : 'Eevee')},
		});
		assert.throws(() => service.update(contest.id, {participants: [npc(1)]}) && service.invite(contest.id),
			/between 2 and 10/);
		service.update(contest.id, {participants: [npc(1), npc(2)]});
		const ready = service.invite(contest.id);
		assert.equal(ready.status, 'ready');
		assert.deepEqual(ready.invitations, []);
	});

	it('rejects duplicate Players, unavailable Pokemon and fainted Pokemon', () => {
		const teams = new Map([
			['may', [pokemon('Milotic', 0), pokemon('Beautifly')]],
			['dawn', [pokemon('Piplup')]],
		]);
		const service = new RPGContestSessionService({
			createId: () => 'eligibility',
			getCharacterTeam: id => teams.get(id),
			isCharacterPokemonAvailable: (id, index) => !(id === 'may' && index === 1),
		});
		const contest = service.create();
		assert.throws(() => service.update(contest.id, {
			participants: [participant('a', 'may'), participant('b', 'may')],
		}), /only once/);
		service.update(contest.id, {participants: [participant('a', 'may'), participant('b', 'dawn')]});
		service.invite(contest.id);
		assert.throws(() => service.selectPokemon(contest.id, 'may', 0), /fainted/);
		assert.throws(() => service.selectPokemon(contest.id, 'may', 1), /unavailable/);
	});
});
