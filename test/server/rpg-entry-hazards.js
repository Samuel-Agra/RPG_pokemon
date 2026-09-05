'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const { RPGBattleRuntimeManager } = require('../../dist/server/rpg-showdown/battle-runtime');

function pokemon(species, ability, moves) {
	return {
		name: species, species, ability, moves, level: 20, gender: 'M', nature: 'Hardy', item: '',
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
		rpg: { version: 1, level: 20 },
	};
}

describe('RPG entry hazard synchronization', () => {
	it('applies native hazards on switch-in and exposes their immediate visual update', () => {
		const player = {
			id: 'hero', team: 'A', kind: 'player', characterId: 'hero', displayName: 'Hero',
			selectionLimit: 2, pokemon: [{ teamIndex: 0 }, { teamIndex: 1 }],
		};
		const wild = {
			id: 'wild', team: 'B', kind: 'wild', displayName: 'Pidgey selvagem',
			selectionLimit: 1, pokemon: [{ set: pokemon('Pidgey', 'Keen Eye', ['Splash']) }],
		};
		const session = {
			version: 1, id: 'runtime-entry-hazards', status: 'started', format: 'singles',
			opponentType: 'wild', participants: [player, wild], invitations: [],
			conditions: {
				weather: { id: '', duration: 'temporary', turns: 5 },
				terrain: { id: '', duration: 'temporary', turns: 5 },
				startingTurn: 1, timeOfDay: 'day', isCave: false, isInWater: false,
			},
			rules: {
				canFlee: true, grantsExperience: true, allowSwitching: true,
				allowItems: true, playersChoosePokemon: false,
			},
			createdAt: 1, updatedAt: 1, startedAt: 1,
		};
		const launch = {
			sessionId: session.id, format: 'singles', participants: session.participants, controllers: [],
			rpg: { battleType: 'wild', modeRules: { wild: { allowCapture: true, allowFlee: true } } },
			captureContext: { turnNumber: 1, isNight: false, isCave: false, isInWater: false },
			allowSwitching: true,
			initialHazards: {
				A: { spikes: 1, stealthRock: true, toxicSpikes: 2 },
				B: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
			},
		};
		const character = {
			id: 'hero', characterName: 'Hero', playerName: 'Player', avatar: 'lucas', version: 1,
			money: 0,
			team: [
				pokemon('Squirtle', 'Torrent', ['Splash']),
				pokemon('Charmander', 'Blaze', ['Splash']),
			],
			box: {}, inventory: {}, createdAt: 1, updatedAt: 1,
		};
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'switch', pokemon: 2 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const charmander = state.sides[0].pokemon.find(entry => entry.species === 'Charmander');
		assert(charmander.hp < charmander.maxHP);
		assert.equal(charmander.status, 'tox');
		const entry = state.animations.find(event => event.type === 'entry' && event.actor.name === 'Charmander');
		assert(entry);
		assert.deepEqual(entry.hazards, ['spikes', 'stealthrock', 'toxicspikes']);
		assert(entry.updates.some(update => Number.isFinite(update.hpFraction)));
		assert(entry.updates.some(update => update.status === 'tox'));
		assert(entry.sequence < state.animations.find(event => event.type === 'move').sequence);
	});

	it('queues the sidebar update after the switch animation and before later actions', () => {
		const root = path.resolve(__dirname, '../..');
		const source = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.js'), 'utf8');
		assert(source.includes("event.type === 'entry'"));
		assert(source.includes('applyAnimationUpdates(event);'));
		assert(source.includes("pendingAnimations.some(event => event.type === 'entry')"));
		assert(
			source.indexOf('animationQueue = animationQueue.catch(() => undefined).then(animateSwitches);') <
				source.indexOf('queueAnimations(pendingAnimations);', source.indexOf("pendingAnimations.some(event => event.type === 'entry')"))
		);
	});
});
