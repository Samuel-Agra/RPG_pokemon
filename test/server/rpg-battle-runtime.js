'use strict';

const assert = require('assert').strict;
const { RPGBattleRuntimeManager } = require('../../dist/server/rpg-showdown/battle-runtime');
const { getRPGStatusPresentation } = require('../../dist/server/rpg-showdown/status-descriptions-pt-br');
const { RPGBagSystem, RPGInventorySystem } = require('../../dist/sim/rpg-showdown');

function pokemon(species, moves, level = 5) {
	return {
		name: species, species, moves, level, gender: 'M', nature: 'Hardy',
		ability: species === 'Squirtle' ? 'Torrent' : 'Keen Eye', item: '',
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
	};
}

function setup() {
	const player = {
		id: 'hero', team: 'A', kind: 'player', characterId: 'hero', displayName: 'Hero',
		selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
	};
	const wild = {
		id: 'wild', team: 'B', kind: 'wild', displayName: 'Pidgey selvagem',
		selectionLimit: 1, pokemon: [{ set: pokemon('Pidgey', ['Tackle']) }],
	};
	const session = {
		version: 1, id: 'runtime-test', name: 'Teste real', status: 'started', format: 'singles',
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
	};
	const character = {
		id: 'hero', characterName: 'Hero', playerName: 'Player', avatar: 'lucas', version: 1,
		money: 0, team: [{ ...pokemon('Squirtle', ['Tackle', 'Water Gun']), rpg: { version: 1, level: 5 } }],
		box: {}, inventory: {}, createdAt: 1, updatedAt: 1,
	};
	return { session, launch, character };
}

describe('RPG status presentation', () => {
	it('uses the active generation for status mechanics', () => {
		assert.match(getRPGStatusPresentation('brn', 9).description, /1\/16/);
		assert.match(getRPGStatusPresentation('brn', 6).description, /1\/8/);
		assert.match(getRPGStatusPresentation('par', 9).description, /metade/);
		assert.match(getRPGStatusPresentation('par', 6).description, /1\/4/);
		assert.equal(getRPGStatusPresentation('', 9), null);
	});
});
describe('RPG private battle runtime', () => {
	it('runs a real turn and exposes persistent HP and PP', () => {
		const { session, launch, character } = setup();
		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, () => character);
		assert.equal(state.turn, 1);
		assert.equal(state.sides[0].requestState, 'move');
		assert.equal(state.sides[0].pokemon[0].revealed, true);
		assert.deepEqual(state.sides[0].pokemon[0].types, ['Water']);
		assert.equal(state.sides[0].pokemon[0].ability, 'Torrent');
		assert.deepEqual(state.sides[0].pokemon[0].itemDetails, { id: '', name: 'Nenhum', sprite: null, icon: null });
		assert.equal(state.sides[0].pokemon[0].condition, null);
		assert.deepEqual(state.sides[0].pokemon[0].owner, {
			trainerId: 'hero', characterId: 'hero', name: 'Hero', kind: 'player',
		});
		assert.equal(state.sides[0].switchSlots[0].canSwitch, false);
		assert.deepEqual(state.sides[0].switchSlots[0].availablePokemonPositions, []);
		assert.match(state.sides[0].pokemon[0].abilityDescription, /golpes do tipo Water/);
		assert.equal(state.sides[0].pokemon[0].pokeball, 'pokeball');
		assert(Number.isInteger(state.sides[0].pokemon[0].pokeballSprite));
		assert.equal(state.sides[0].trainers[0].name, 'Hero');
		assert.throws(
			() => manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 2 }),
			/introduction must finish/
		);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });

		state = manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 2 });
		assert.equal(state.sides[0].waiting, true);
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });

		assert.equal(state.turn, 2);
		assert(state.sides[0].pokemon[0].hp < state.sides[0].pokemon[0].maxHP);
		assert(state.sides[1].pokemon[0].hp < state.sides[1].pokemon[0].maxHP);
		assert(state.sides[0].pokemon[0].moves[1].pp < state.sides[0].pokemon[0].moves[1].maxPP);
		assert(state.log.some(line => line.includes('usou')));
		const moveAnimations = state.animations.filter(event => event.type === 'move');
		assert.equal(moveAnimations.length, 2);
		assert.deepEqual(moveAnimations.map(event => event.actor.side), ['p2', 'p1']);
		assert(moveAnimations[0].sequence < moveAnimations[1].sequence);
		assert.equal(moveAnimations[1].move.id, 'watergun');
		assert.equal(moveAnimations[1].move.target, 'normal');
		assert.deepEqual(moveAnimations[1].targets.map(target => target.side), ['p2']);
	});

	it('emits per-action HP and stat updates in native turn order', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-visual-updates';
		launch.sessionId = session.id;
		character.team[0] = {
			...pokemon('Squirtle', ['Cotton Spore']), rpg: { version: 1, level: 5 },
		};
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const cottonSpore = state.animations.find(event => event.move?.id === 'cottonspore');
		const tackle = state.animations.find(event => event.move?.id === 'tackle' && event.actor.side === 'p2');
		assert(cottonSpore.updates.some(update => update.boost?.stat === 'spe' && update.boost.delta === -2));
		assert(tackle.updates.some(update => update.target.side === 'p1' && Number.isFinite(update.hpFraction)));
		assert.notEqual(cottonSpore.sequence, tackle.sequence);
		assert.deepEqual(
			state.animations.map(event => event.sequence),
			state.animations.map(event => event.sequence).sort((a, b) => a - b)
		);
	});
	it('emits zero HP before the later faint removal event', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-visual-faint-order';
		launch.sessionId = session.id;
		character.team[0] = {
			...pokemon('Squirtle', ['Seismic Toss'], 100), rpg: { version: 1, level: 100 },
		};
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const attack = state.animations.find(event => event.move?.id === 'seismictoss');
		const faint = state.animations.find(event => event.type === 'faint' && event.actor.side === 'p2');
		assert(attack.updates.some(update => update.target.side === 'p2' && update.hpFraction === 0));
		assert(faint.updates.some(update => update.target.side === 'p2' && update.active === false));
		assert(attack.sequence < faint.sequence);
	});
	it('exposes the official capture Ball and item-sheet position without revealing the Pokemon', () => {
		const { session, launch, character } = setup();
		character.team[0].rpg.captureBall = 'ultraball';
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const pokemonState = state.sides[0].pokemon[0];
		assert.equal(pokemonState.pokeball, 'ultraball');
		assert(Number.isInteger(pokemonState.pokeballSprite));
		assert(pokemonState.pokeballSprite > 0);
	});
	it('exposes and consumes the native one-per-side Mega Evolution permission', () => {
		const { session, launch, character } = setup();
		character.team[0] = {
			...pokemon('Charizard', ['Roost']),
			item: 'charizarditey',
			ability: 'Blaze',
			level: 50,
			rpg: { version: 1, level: 50, item: 'charizarditey' },
		};
		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, () => character);
		assert.equal(state.sides[0].pokemon[0].canMegaEvo, true);
		assert.equal(state.sides[0].pokemon[0].isMega, false);
		assert.equal(state.sides[0].pokemon[0].megaEvolution, 'Charizard-Mega-Y');
		const preview = state.sides[0].pokemon[0].megaPreview;
		assert.equal(preview.species, 'Charizard-Mega-Y');
		assert.deepEqual(preview.types, ['Fire', 'Flying']);
		assert.equal(preview.ability, 'Drought');
		assert.match(preview.abilityDescription, /sol forte/);
		assert.deepEqual(preview.stats.hp, { normal: 78, mega: 78 });
		assert.deepEqual(preview.stats.spa, { normal: 109, mega: 159 });
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'move', move: 1, mega: true }],
		});
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const charizard = state.sides[0].pokemon[0];
		assert.equal(charizard.species, 'Charizard-Mega-Y');
		assert.equal(charizard.spriteId, 'charizard-megay');
		const megaEvent = state.animations.find(event => event.type === 'mega');
		assert(megaEvent);
		assert.equal(megaEvent.transformation.fromSpriteId, 'charizard');
		assert.equal(megaEvent.transformation.toSpriteId, 'charizard-megay');
		assert.equal(megaEvent.transformation.ability, 'Drought');

		assert.equal(charizard.canMegaEvo, false);
		assert.equal(charizard.isMega, true);
		assert.equal(charizard.megaPreview, null);
	});
	it('classifies official heights into four moderately scaled visual sizes', () => {
		const { session, launch, character } = setup();
		const examples = [
			['Caterpie', 'Shield Dust'],
			['Charmeleon', 'Blaze'],
			['Charizard', 'Blaze'],
			['Wailord', 'Water Veil'],
		];
		character.team = examples.map(([name, ability]) => ({
			...pokemon(name, ['Tackle']), ability, rpg: { version: 1, level: 5 },
		}));
		session.participants[0].selectionLimit = examples.length;
		session.participants[0].pokemon = examples.map((_, teamIndex) => ({ teamIndex }));
		launch.participants = session.participants;
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		assert.deepEqual(
			Object.fromEntries(state.sides[0].pokemon.map(entry => [entry.species, entry.sizeClass])),
			{ Caterpie: 'small', Charmeleon: 'medium', Charizard: 'large', Wailord: 'giant' }
		);
		assert.deepEqual(
			Object.fromEntries(state.sides[0].pokemon.map(entry => [entry.species, entry.heightM])),
			{ Caterpie: 0.3, Charmeleon: 1.1, Charizard: 1.7, Wailord: 14.5 }
		);
	});	it('does not treat an automatic empty-slot pass as the remaining wild Pokemon choice', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-doubles-fainted-slot';
		session.format = 'doubles';
		launch.sessionId = session.id;
		launch.format = 'doubles';
		character.team[0] = {
			...pokemon('Charizard', ['Flamethrower']),
			ability: 'Blaze',
			level: 50,
			rpg: { version: 1, level: 50 },
		};
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon = [
			{ set: pokemon('Caterpie', ['Tackle'], 1) },
			{ set: pokemon('Blissey', ['Tackle'], 50) },
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'move', move: 1, target: 1 }],
		});
		const state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1, target: 1 },
				{ type: 'move', move: 1, target: 1 },
			],
		});
		const wildSide = state.sides[1];
		assert.equal(state.turn, 2);
		assert.equal(wildSide.requestState, 'move');
		assert.equal(wildSide.pokemon.filter(entry => entry.active && !entry.fainted).length, 1);
		assert.deepEqual(wildSide.needsSwitch, [false, false]);
		assert.equal(wildSide.waiting, false);
		let next = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'pass' },
				{ type: 'move', move: 1, target: 1 },
			],
		});
		assert.equal(next.sides[1].waiting, true);
		next = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'move', move: 1, target: 2 }],
		});
		assert.equal(next.turn, 3);
	});
	it('opens a fresh move request after a defeated wild Pokemon is replaced', () => {
		const { session, launch, character } = setup();
		character.team[0] = {
			...pokemon('Charizard', ['Flamethrower']),
			ability: 'Blaze',
			level: 50,
			rpg: { version: 1, level: 50 },
		};
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon = [
			{ set: pokemon('Caterpie', ['Tackle'], 1) },
			{ set: pokemon('Weedle', ['Tackle'], 1) },
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.sides[1].requestState, 'switch');
		assert.equal(state.sides[1].waiting, false);
		state = manager.action(session.id, { master: true }, { type: 'switch', pokemon: 2 });
		assert.equal(state.turn, 2);
		assert.equal(state.sides[1].requestState, 'move');
		assert.equal(state.sides[1].waiting, false);
		assert.equal(state.sides[1].pokemon.find(entry => entry.species === 'Weedle').active, true);
	});
	it('opens a safe switch request after a Player Pokemon faints', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-player-fainted-switch';
		launch.sessionId = session.id;
		character.team = [
			{ ...pokemon('Venusaur', ['Tackle'], 1), ability: 'Overgrow', rpg: { version: 1, level: 1 } },
			{ ...pokemon('Squirtle', ['Tackle'], 10), ability: 'Torrent', rpg: { version: 1, level: 10 } },
		];
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		session.participants[1].pokemon = [{ set: { ...pokemon('Charizard', ['Flamethrower'], 100), ability: 'Blaze' } }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.sides[0].pokemon.find(entry => entry.species === 'Venusaur').fainted, true);
		assert.equal(state.sides[0].requestState, 'switch');
		assert.equal(state.sides[0].switchSlots[0].required, true);
		assert.equal(state.sides[0].switchSlots[0].canSwitch, true);
		assert.deepEqual(state.sides[0].switchSlots[0].availablePokemonPositions, [2]);
		assert.equal(state.sides[0].switchSlots[0].owner.trainerId, 'hero');
		const faintEvent = state.animations.find(event => event.type === 'faint' && event.actor.name === 'Venusaur');
		assert(faintEvent);
		assert(state.animations.find(event => event.type === 'move').sequence < faintEvent.sequence);
		state = manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'switch', pokemon: 2 });
		assert.equal(state.sides[0].pokemon.find(entry => entry.species === 'Squirtle').active, true);
		assert.equal(state.sides[0].requestState, 'move');
	});	it('exposes live weather and terrain state for field effects', () => {
		const { session, launch, character } = setup();
		character.team[0].moves = ['Tackle', 'Rain Dance'];
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 2 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.field.weather, 'raindance');
		assert.equal(state.field.weatherTurns, 4);
		assert.equal(state.field.terrain, '');
	});

	it('exposes a structured HUD contract for weather, terrain, global effects, buffs and hazards', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-hud-field-effects';
		launch.sessionId = session.id;
		character.team[0].moves = ['Rain Dance', 'Psychic Terrain', 'Reflect', 'Spikes'];
		session.participants[1].pokemon[0].set.moves = ['Splash'];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, () => character);
		assert.equal(state.field.weatherDetails, null);
		assert.equal(state.field.terrainDetails, null);
		assert.deepEqual(state.field.globalEffects, []);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		const useMove = move => {
			manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move });
			state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		};

		useMove(1);
		assert.equal(state.field.weatherDetails.id, 'raindance');
		assert.equal(state.field.weatherDetails.kind, 'weather');
		assert.equal(state.field.weatherDetails.sourceSide, 'p1');
		assert.equal(state.field.weatherDetails.icon, 'rain');
		assert.equal(state.field.weatherDetails.theme, 'weather-rain');
		assert.equal(state.field.weatherDetails.duration, 4);
		assert.equal(state.field.weatherDetails.permanent, false);

		useMove(2);
		assert.equal(state.field.terrainDetails.id, 'psychicterrain');
		assert.equal(state.field.terrainDetails.sourceSide, 'p1');
		assert.equal(state.field.terrainDetails.icon, 'psychic');
		useMove(3);
		assert.equal(state.sides[0].effects.buffs[0].id, 'reflect');
		assert.equal(state.sides[0].effects.buffs[0].icon, 'reflect');
		assert.equal(state.sides[0].effects.buffs[0].targetSide, 'p1');
		assert.equal(state.sides[0].effects.buffs[0].theme, 'benefit');
		useMove(4);
		assert.equal(state.sides[1].effects.hazards[0].id, 'spikes');
		assert.equal(state.sides[1].effects.hazards[0].icon, 'spikes');
		assert.equal(state.sides[1].effects.hazards[0].sourceSide, 'p1');
		assert.equal(state.sides[1].effects.hazards[0].targetSide, 'p2');
		assert.equal(state.sides[1].effects.hazards[0].layers, 1);
		assert.equal(state.sides[1].effects.hazards[0].maxLayers, 3);
	});

	it('exposes global effects by source and keeps newest effects first', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-hud-global-effects';
		launch.sessionId = session.id;
		character.team[0].moves = ['Trick Room'];
		session.participants[1].pokemon[0].set.moves = ['Splash'];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.field.globalEffects.length, 1);
		assert.deepEqual(state.field.globalEffects[0], {
			id: 'trickroom', name: 'Trick Room', kind: 'global', icon: 'trickroom', theme: 'global',
			duration: 4, permanent: false, layers: null, maxLayers: null,
			sourceSide: 'p1', sourcePokemon: 'Squirtle', targetSide: null,
			targetPokemonPosition: null, order: state.field.globalEffects[0].order,
		});
	});

	it('exposes residual traps and switch locks on the affected Pokemon', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-hud-pokemon-effects';
		launch.sessionId = session.id;
		character.team[0].moves = ['Infestation', 'Mean Look'];
		session.participants[1].pokemon[0].set = pokemon('Blissey', ['Splash'], 50);
		session.participants[1].pokemon[0].set.ability = 'Natural Cure';
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		let target = state.sides[1].pokemon[0];
		assert.equal(target.effects.individual[0].id, 'infestation');
		assert.equal(target.effects.individual[0].name, 'Infestation');
		assert.equal(target.effects.individual[0].sourceSide, 'p1');
		assert.equal(target.effects.individual[0].targetSide, 'p2');
		assert.equal(target.effects.individual[0].targetPokemonPosition, 0);
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 2 });
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		target = state.sides[1].pokemon[0];
		assert.equal(target.effects.switchLocks[0].id, 'meanlook');
		assert.equal(target.effects.switchLocks[0].name, 'Mean Look');
		assert.equal(target.effects.switchLocks[0].icon, 'lock');
	});
	it('reveals a Pokemon permanently after it enters the field', () => {
		const { session, launch, character } = setup();
		character.team.push({
			...pokemon('Pikachu', ['Thunder Shock']), rpg: { version: 1, level: 5 },
		});
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, () => character);
		assert.equal(state.sides[0].pokemon[1].revealed, false);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'switch', pokemon: 2 });
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const pikachu = state.sides[0].pokemon.find(entry => entry.species === 'Pikachu');
		assert.equal(pikachu.revealed, true);
		assert.equal(pikachu.active, true);
		assert.equal(pikachu.teamPosition, 1);
		const wildMoveTargets = state.sides[1].pokemon.find(entry => entry.active).moves[0].targets
			.filter(target => target.side === 'p1');
		assert.equal(wildMoveTargets.length, 2);
		const revealedReserve = wildMoveTargets.find(target => target.species === 'Squirtle');
		assert.equal(revealedReserve.inField, false);
		assert.equal(revealedReserve.selectable, false);
		assert.equal(revealedReserve.damage.multiplier, 1);
		manager.runtimes.get('runtimetest').battle.win('Hero');
		state = manager.snapshot(session.id);
		const squirtleResult = state.result.pokemon.find(entry => entry.species === 'Squirtle');
		const pikachuResult = state.result.pokemon.find(entry => entry.species === 'Pikachu');
		assert.equal(squirtleResult.teamPosition, 0);
		assert.equal(pikachuResult.teamPosition, 1);
	});
	it('does not let the master control a Player-only side', () => {
		const { session, launch, character } = setup();
		session.participants[1] = {
			...session.participants[0], id: 'rival', team: 'B', characterId: 'rival', displayName: 'Rival',
		};
		launch.participants = session.participants;
		const rival = { ...character, id: 'rival', characterName: 'Rival' };
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, id => id === 'hero' ? character : rival);
		manager.ready(session.id, { master: true });
		assert.throws(
			() => manager.action(session.id, { master: true }, { type: 'move', move: 1 }),
			/cannot control a side/
		);
	});
	it('runs an asymmetric 1v2 doubles battle with an empty active slot', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-doubles-1v2';
		session.format = 'doubles';
		launch.sessionId = session.id;
		launch.format = 'doubles';
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon.push({ set: pokemon('Spearow', ['Peck']) });
		launch.participants = session.participants;

		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, () => character);
		assert.equal(state.sides[0].pokemon.filter(entry => entry.active).length, 1);
		assert.equal(state.sides[1].pokemon.filter(entry => entry.active).length, 2);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'move', move: 1, target: 1 }],
		});
		assert.equal(state.sides[0].waiting, true);
		state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1, target: 1 },
				{ type: 'move', move: 1, target: 1 },
			],
		});
		assert.equal(state.turn, 2);
		assert.equal(state.animations.filter(event => event.type === 'move').length, 3);
	});
	it('continues Solar Beam automatically after charging but not when sunlight skips the charge', () => {
		const runSolarBeam = weather => {
			const { session, launch, character } = setup();
			session.id = `runtime-solarbeam-${weather || 'clear'}`;
			launch.sessionId = session.id;
			session.conditions.weather = { id: weather, duration: 'temporary', turns: 5 };
			character.team[0] = {
				...pokemon('Charizard', ['Solar Beam', 'Tackle'], 50),
				ability: weather === 'sunnyday' ? 'Drought' : 'Blaze', rpg: { version: 1, level: 50 },
			};
			session.participants[1].pokemon = [{
				set: { ...pokemon('Blissey', ['Splash'], 100), ability: 'Natural Cure' },
			}];
			launch.participants = session.participants;
			const manager = new RPGBattleRuntimeManager();
			let state = manager.start(session, launch, () => character);
			manager.ready(session.id, { master: false, characterId: 'hero' });
			manager.ready(session.id, { master: true });
			const initialHP = state.sides[1].pokemon[0].hp;
			manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
			state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
			return { manager, session, state, initialHP };
		};

		const clear = runSolarBeam('');
		let charizard = clear.state.sides[0].pokemon[0];
		assert.equal(clear.state.turn, 2);
		assert.equal(clear.state.sides[1].pokemon[0].hp, clear.initialHP);
		assert.equal(charizard.automaticMove, 'Solar Beam');
		assert.deepEqual(charizard.moves.map(move => move.id), ['solarbeam']);
		clear.state = clear.manager.action(clear.session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [],
		});
		assert.equal(clear.state.sides[0].waiting, true);
		clear.state = clear.manager.action(clear.session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(clear.state.turn, 3);
		assert(clear.state.sides[1].pokemon[0].hp < clear.initialHP);

		const sunny = runSolarBeam('sunnyday');
		charizard = sunny.state.sides[0].pokemon[0];
		assert.equal(sunny.state.turn, 2);
		assert(sunny.state.sides[1].pokemon[0].hp < sunny.initialHP);
		assert.equal(charizard.automaticMove, '');
		assert.deepEqual(charizard.moves.map(move => move.id), ['solarbeam', 'tackle']);
	});
	it('auto-passes a defeated triple slot when no reserve can replace it', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-triples-fainted-auto-pass';
		session.format = 'triples';
		launch.sessionId = session.id;
		launch.format = 'triples';
		character.team = [
			{ ...pokemon('Charizard', ['Flamethrower'], 50), ability: 'Blaze', rpg: { version: 1, level: 50 } },
			{ ...pokemon('Squirtle', ['Protect'], 20), ability: 'Torrent', rpg: { version: 1, level: 20 } },
			{ ...pokemon('Bulbasaur', ['Protect'], 20), ability: 'Overgrow', rpg: { version: 1, level: 20 } },
		];
		session.participants[0].selectionLimit = 3;
		session.participants[0].pokemon = [0, 1, 2].map(teamIndex => ({ teamIndex }));
		session.participants[1].selectionLimit = 3;
		session.participants[1].pokemon = [
			{ set: { ...pokemon('Wailord', ['Splash'], 100), ability: 'Water Veil' } },
			{ set: { ...pokemon('Blissey', ['Splash'], 100), ability: 'Natural Cure' } },
			{ set: pokemon('Caterpie', ['Splash'], 1) },
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1, target: 3 },
				{ type: 'move', move: 1 },
				{ type: 'move', move: 1 },
			],
		});
		let state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1 },
				{ type: 'move', move: 1 },
				{ type: 'move', move: 1 },
			],
		});
		const wildSide = state.sides[1];
		assert.equal(state.turn, 2);
		assert.equal(wildSide.pokemon.find(entry => entry.species === 'Caterpie').fainted, true);
		assert.equal(wildSide.requestState, 'move');
		assert.deepEqual(wildSide.needsSwitch, [false, false, false]);
		assert.equal(wildSide.waiting, false);
		state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1 },
				{ type: 'move', move: 1 },
			],
		});
		assert.equal(state.sides[1].waiting, true);
		state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1, target: 2 },
				{ type: 'move', move: 1 },
				{ type: 'move', move: 1 },
			],
		});
		assert.equal(state.turn, 3);
	});	for (const [format, activeCount] of [['doubles', 2], ['multi', 2], ['triples', 3]]) {
		it(`collects and runs every active choice in ${format}`, () => {
			const { session, launch, character } = setup();
			session.id = `runtime-${format}`;
			session.format = format;
			launch.sessionId = session.id;
			launch.format = format;
			const species = ['Squirtle', 'Pikachu', 'Bulbasaur'];
			character.team = species.slice(0, activeCount).map(name => ({
				...pokemon(name, ['Tackle']), rpg: { version: 1, level: 5 },
			}));
			session.participants[0].selectionLimit = activeCount;
			session.participants[0].pokemon = Array.from({ length: activeCount }, (_, teamIndex) => ({ teamIndex }));
			session.participants[1].selectionLimit = activeCount;
			session.participants[1].pokemon = species.slice(0, activeCount).map(name => ({
				set: pokemon(name === 'Squirtle' ? 'Pidgey' : name, ['Tackle']),
			}));
			launch.participants = session.participants;

			const manager = new RPGBattleRuntimeManager();
			let state = manager.start(session, launch, () => character);
			manager.ready(session.id, { master: false, characterId: 'hero' });
			manager.ready(session.id, { master: true });
			assert.equal(state.sides[0].pokemon.filter(entry => entry.active).length, activeCount);
			assert.deepEqual(
				state.sides[0].pokemon.filter(entry => entry.active).map(entry => entry.activeSlot),
				Array.from({ length: activeCount }, (_, index) => index)
			);
			const choices = Array.from({ length: activeCount }, (_, index) => ({
				type: 'move', move: 1, target: activeCount - index,
			}));
			state = manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'turn', choices });
			assert.equal(state.sides[0].waiting, true);
			state = manager.action(session.id, { master: true }, { type: 'turn', choices });
			assert.equal(state.turn, 2);
			assert.equal(state.animations.filter(event => event.type === 'move').length, activeCount * 2);
			assert.deepEqual(
				state.animations.map(event => event.sequence),
				state.animations.map(event => event.sequence).sort((a, b) => a - b)
			);
			for (const entry of state.sides[0].pokemon.filter(pokemonState => pokemonState.active)) {
				assert(entry.moves[0].pp < entry.moves[0].maxPP);
			}
		});
	}
	it('exposes complete move metadata, disabled reason, and separate live target analyses', () => {
		const { session, launch, character } = setup();
		character.team[0] = {
			...pokemon('Squirtle', ['Tackle', 'Growl']), item: 'assaultvest',
			rpg: { version: 1, level: 5, item: 'assaultvest' },
		};
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const [tackle, growl] = state.sides[0].pokemon[0].moves;
		assert.equal(tackle.basePower, 40);
		assert.equal(tackle.accuracy, 100);
		assert.equal(tackle.target, 'normal');
		assert.equal(tackle.targetLabel, 'One adjacent Pokémon');
		assert.equal(tackle.description, 'Causa dano ao alvo.');
		assert(tackle.flags.some(flag => flag.id === 'contact'));
		assert(tackle.flags.some(flag => flag.id === 'protect'));
		assert.deepEqual(tackle.targets.filter(target => target.selectable).map(target => target.side), ['p2']);
		assert.equal(tackle.targets.find(target => target.side === 'p2').damage.multiplier, 1);
		assert.equal(tackle.targets.find(target => target.side === 'p2').effect.outcome, 'not-applicable');
		assert.equal(growl.disabled, true);
		assert(growl.disabledReason.includes('Assault Vest'));
	});

	it('accounts for special type rules, status immunity, Levitate, and Mold Breaker', () => {
		const { session, launch, character } = setup();
		character.team[0] = {
			...pokemon('Haxorus', ['Freeze-Dry', 'Earthquake', 'Toxic']), ability: 'Mold Breaker',
			rpg: { version: 1, level: 5 },
		};
		session.participants[1].pokemon = [{ set: {
			...pokemon('Rotom-Wash', ['Tackle']), ability: 'Levitate',
		} }];
		launch.participants = session.participants;
		let state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const moves = state.sides[0].pokemon[0].moves;
		assert.equal(moves.find(move => move.id === 'freezedry').targets.find(target => target.side === 'p2').damage.multiplier, 2);
		assert.equal(moves.find(move => move.id === 'earthquake').targets.find(target => target.side === 'p2').damage.multiplier, 2);

		character.team[0].ability = 'Rivalry';
		state = new RPGBattleRuntimeManager().start({ ...session, id: 'runtime-levitate' },
			{ ...launch, sessionId: 'runtime-levitate' }, () => character);
		const earthquake = state.sides[0].pokemon[0].moves.find(move => move.id === 'earthquake');
		assert.equal(earthquake.targets.find(target => target.side === 'p2').damage.outcome, 'immune-ability');

		session.participants[1].pokemon = [{ set: { ...pokemon('Magnemite', ['Tackle']), ability: 'Sturdy' } }];
		launch.participants = session.participants;
		state = new RPGBattleRuntimeManager().start({ ...session, id: 'runtime-status-immunity' },
			{ ...launch, sessionId: 'runtime-status-immunity' }, () => character);
		const toxic = state.sides[0].pokemon[0].moves.find(move => move.id === 'toxic');
		assert.equal(toxic.targets.find(target => target.side === 'p2').effect.outcome, 'immune-type');
	});

	it('uses native positional reach for selectable and spread targets in triples', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-target-analysis-triples';
		session.format = 'triples'; launch.sessionId = session.id; launch.format = 'triples';
		const species = ['Squirtle', 'Pikachu', 'Bulbasaur'];
		character.team = species.map(name => ({ ...pokemon(name, ['Tackle', 'Earthquake']), rpg: { version: 1, level: 5 } }));
		session.participants[0].selectionLimit = 3;
		session.participants[0].pokemon = species.map((_, teamIndex) => ({ teamIndex }));
		session.participants[1].selectionLimit = 3;
		session.participants[1].pokemon = species.map(name => ({ set: pokemon(name === 'Squirtle' ? 'Pidgey' : name, ['Tackle']) }));
		launch.participants = session.participants;
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const active = state.sides[0].pokemon.filter(entry => entry.active);
		assert.deepEqual(active.map(entry => entry.moves[0].targets.filter(target => target.side === 'p2' && target.selectable).length), [2, 3, 2]);
		assert.deepEqual(active.map(entry => entry.moves[1].targets.filter(target => target.affected).length), [3, 5, 3]);
	});
	it('exposes the live negative condition used by Pokemon cards', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-team-card-status';
		launch.sessionId = session.id;
		session.participants[1].pokemon = [{ set: pokemon('Pidgey', ['Sizzly Slide']) }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const condition = state.sides[0].pokemon[0].condition;
		assert.equal(condition.id, 'brn');
		assert.equal(condition.name, 'Burn');
		assert.match(condition.description, /1\/16/);
	});

	it('reports native trapping as a blocked switch slot', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-team-card-trapped';
		launch.sessionId = session.id;
		character.team.push({ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } });
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		session.participants[1].pokemon = [{ set: pokemon('Pidgey', ['Mean Look']) }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.sides[0].switchSlots[0].trapped, true);
		assert.equal(state.sides[0].switchSlots[0].canSwitch, false);
		assert.match(state.sides[0].switchSlots[0].blockedReason, /Mean Look/);
	});

	it('does not allow a Multi partner reserve to replace another trainer Pokemon', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-multi-switch-owner';
		session.format = 'multi';
		launch.sessionId = session.id;
		launch.format = 'multi';
		character.team = [{ ...pokemon('Squirtle', ['Tackle']), rpg: { version: 1, level: 5 } }];
		const allyCharacter = {
			...character, id: 'ally', characterName: 'Ally',
			team: [
				{ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } },
				{ ...pokemon('Bulbasaur', ['Tackle']), rpg: { version: 1, level: 5 } },
			],
		};
		session.participants = [
			{ ...session.participants[0], selectionLimit: 1, pokemon: [{ teamIndex: 0 }] },
			{
				id: 'ally', team: 'A', kind: 'player', characterId: 'ally', displayName: 'Ally',
				selectionLimit: 2, pokemon: [{ teamIndex: 0 }, { teamIndex: 1 }],
			},
			{
				...session.participants[1], selectionLimit: 2,
				pokemon: [{ set: pokemon('Pidgey', ['Tackle']) }, { set: pokemon('Rattata', ['Tackle']) }],
			},
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		const state = manager.start(session, launch, id => id === 'ally' ? allyCharacter : character);
		assert.equal(state.sides[0].switchSlots[0].owner.trainerId, 'hero');
		assert.equal(state.sides[0].switchSlots[1].owner.trainerId, 'ally');
		assert.deepEqual(state.sides[0].switchSlots[1].availablePokemonPositions, [3]);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		assert.throws(() => manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'switch', pokemon: 3 }, { type: 'move', move: 1 }],
		}), /cannot choose an action for a partner trainer Pokemon/);
	});
	it('collects independent choices from two allied Players in Multi', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-multi-independent-players';
		session.format = 'multi';
		launch.sessionId = session.id;
		launch.format = 'multi';
		character.team = [{ ...pokemon('Squirtle', ['Tackle']), rpg: { version: 1, level: 5 } }];
		const allyCharacter = {
			...character, id: 'ally', characterName: 'Ally',
			team: [{ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } }],
		};
		session.participants = [
			{ ...session.participants[0], selectionLimit: 1, pokemon: [{ teamIndex: 0 }] },
			{
				id: 'ally', team: 'A', kind: 'player', characterId: 'ally', displayName: 'Ally',
				selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
			},
			{
				...session.participants[1], selectionLimit: 2,
				pokemon: [{ set: pokemon('Pidgey', ['Tackle']) }, { set: pokemon('Rattata', ['Tackle']) }],
			},
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, id => id === 'ally' ? allyCharacter : character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: false, characterId: 'ally' });
		manager.ready(session.id, { master: true });
		const heroView = manager.snapshot(session.id, { master: false, characterId: 'hero' });
		assert.deepEqual(heroView.sides[0].pokemon.filter(entry => entry.active).map(entry => entry.controllable), [true, false]);
		let state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'move', move: 1, target: 1 }, { type: 'pass' }],
		});
		assert.equal(state.turn, 1);
		assert.equal(state.sides[0].waiting, true);
		state = manager.action(session.id, { master: false, characterId: 'ally' }, {
			type: 'turn', choices: [{ type: 'pass' }, { type: 'move', move: 1, target: 2 }],
		});
		assert.equal(state.turn, 1);
		state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [{ type: 'move', move: 1, target: 1 }, { type: 'move', move: 1, target: 2 }],
		});
		assert.equal(state.turn, 2);
		assert(state.sides[0].pokemon.filter(entry => entry.active).every(entry => entry.moves[0].pp < entry.moves[0].maxPP));
	});
	it('runs Raid with one simultaneous active Pokemon from each of three Players', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-raid-three-independent-players';
		session.format = 'raid';
		launch.sessionId = session.id;
		launch.format = 'raid';
		const makeRaider = (id, species) => ({
			...character, id, characterName: id,
			team: [
				{ ...pokemon(species, ['Swords Dance', 'Tackle']), rpg: { version: 1, level: 5 } },
				{ ...pokemon('Caterpie', ['String Shot']), rpg: { version: 1, level: 5 } },
			],
		});
		const characters = new Map([
			['hero', makeRaider('hero', 'Squirtle')],
			['ally', makeRaider('ally', 'Pikachu')],
			['third', makeRaider('third', 'Bulbasaur')],
		]);
		session.participants = [
			{
				...session.participants[0], selectionLimit: 2,
				pokemon: [{ teamIndex: 0 }, { teamIndex: 1 }],
			},
			{
				id: 'ally', team: 'A', kind: 'player', characterId: 'ally', displayName: 'Ally',
				selectionLimit: 2, pokemon: [{ teamIndex: 0 }, { teamIndex: 1 }],
			},
			{
				id: 'third', team: 'A', kind: 'player', characterId: 'third', displayName: 'Third',
				selectionLimit: 2, pokemon: [{ teamIndex: 0 }, { teamIndex: 1 }],
			},
			{
				...session.participants[1], selectionLimit: 1,
				pokemon: [{ set: pokemon('Snorlax', ['Growl'], 20) }],
			},
		];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		let state = manager.start(session, launch, id => characters.get(id));
		const active = state.sides[0].pokemon.filter(entry => entry.active);
		assert.equal(active.length, 3);
		assert.deepEqual(active.map(entry => entry.owner.characterId), ['hero', 'ally', 'third']);
		assert.equal(state.sides[1].pokemon.filter(entry => entry.active).length, 1);
		for (const id of ['hero', 'ally', 'third']) manager.ready(session.id, { master: false, characterId: id });
		manager.ready(session.id, { master: true });
		for (const [slot, id] of ['hero', 'ally', 'third'].entries()) {
			const choices = [{ type: 'pass' }, { type: 'pass' }, { type: 'pass' }];
			choices[slot] = { type: 'move', move: 1 };
			state = manager.action(session.id, { master: false, characterId: id }, { type: 'turn', choices });
			assert.equal(state.turn, 1);
		}
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.turn, 2);
		assert(state.sides[0].pokemon.filter(entry => entry.active).every(entry => entry.boosts.atk === 1));
		const bossHP = state.sides[1].pokemon.find(entry => entry.active).hp;
		for (const [slot, id] of ['hero', 'ally', 'third'].entries()) {
			const view = manager.snapshot(session.id, { master: false, characterId: id });
			const acting = view.sides[0].pokemon.find(entry => entry.active && entry.controllable);
			const target = acting.moves[1].targets.find(entry => entry.side === 'p2' && entry.selectable);
			assert(target, `${id} must be able to target the Raid opponent`);
			assert.equal(target.activeSlot, 1);
			assert.equal(target.targetLoc, 2);
			const choices = [{ type: 'pass' }, { type: 'pass' }, { type: 'pass' }];
			choices[slot] = { type: 'move', move: 2, target: target.targetLoc };
			state = manager.action(session.id, { master: false, characterId: id }, { type: 'turn', choices });
		}
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.turn, 3);
		assert(state.sides[1].pokemon.find(entry => entry.active).hp < bossHP);
	});
	it('consumes and persists one medicine as the acting Pokemon turn', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-healing';
		launch.sessionId = session.id;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'potion', quantity: 2 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert(state.sides[0].pokemon[0].hp < state.sides[0].pokemon[0].maxHP);
		const damagedHP = state.sides[0].pokemon[0].hp;
		const ppBeforeItem = state.sides[0].pokemon[0].moves[0].pp;
		let persisted;
		state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{
				type: 'item', item: 'potion', target: 1, actionId: 'heal-turn-2',
				expectedRevision: character.inventory.bag.revision,
			}],
		}, (characterId, inventory) => { persisted = { characterId, inventory }; });
		assert.equal(state.sides[0].waiting, true);
		assert.equal(state.sides[0].pokemon[0].hp, damagedHP);
		assert.equal(persisted, undefined);
		assert.equal(state.animations.some(entry => entry.type === 'item'), false);
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(persisted.characterId, 'hero');
		assert.equal(RPGBagSystem.getQuantity(persisted.inventory.bag, 'potion'), 1);
		assert.equal(state.sides[0].pokemon[0].moves[0].pp, ppBeforeItem);
		const event = state.animations.find(entry => entry.type === 'item');
		assert.equal(event.item.id, 'potion');
		assert.equal(event.actor.side, 'p1');
		assert.equal(event.animate, true);
		assert.equal(event.targets[0].name, state.sides[0].pokemon[0].name);
		const opponentMove = state.animations.filter(entry =>
			entry.type === 'move' && entry.actor.side === 'p2'
		).at(-1);
		assert(event.sequence < opponentMove.sequence, 'Bag priority +6 must resolve before a normal move');
	});

	it('consumes the selected Poke Ball and exposes the structured capture animation', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-capture';
		launch.sessionId = session.id;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'masterball', quantity: 1 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		let persisted;
		let state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{
				type: 'capture', ball: 'masterball', target: 0, actionId: 'capture-master-ball',
				expectedRevision: character.inventory.bag.revision,
			}],
		}, (_characterId, inventory) => { persisted = inventory; });
		assert.equal(state.sides[0].waiting, true);
		assert.equal(persisted, undefined);
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.equal(state.status, 'ended');
		assert.equal(state.lastAction.success, true);
		assert.equal(RPGBagSystem.getQuantity(persisted.bag, 'masterball'), 0);
		const event = state.animations.find(entry => entry.type === 'capture');
		assert.equal(event.ball.id, 'masterball');
		assert.equal(event.success, true);
		assert.equal(event.shakes, 4);
	});

	it('heals a reserve Pokemon without playing a field animation', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-reserve-healing';
		launch.sessionId = session.id;
		character.team.push({ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } });
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		launch.participants = session.participants;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'potion', quantity: 1 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.runtimes.get('runtimebagreservehealing').battle.p1.pokemon[1].hp = 1;
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{
				type: 'item', item: 'potion', target: 2, actionId: 'heal-reserve',
			}],
		});
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const event = state.animations.find(entry => entry.type === 'item');
		assert.equal(event.animate, false);
		assert.deepEqual(event.targets, []);
		assert(state.sides[0].pokemon[1].hp > 1);
	});
	it('continues a doubles battle after capturing only one of two living wild Pokemon', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-capture-doubles';
		session.format = 'doubles';
		launch.sessionId = session.id;
		launch.format = 'doubles';
		character.team.push({ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } });
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon = [
			{ set: pokemon('Pidgey', ['Tackle']) }, { set: pokemon('Rattata', ['Tackle']) },
		];
		launch.participants = session.participants;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'masterball', quantity: 1 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [
				{ type: 'capture', ball: 'masterball', target: 0, actionId: 'capture-one-of-two' },
				{ type: 'move', move: 1, target: 2 },
			],
		});
		const state = manager.action(session.id, { master: true }, {
			type: 'turn', choices: [
				{ type: 'move', move: 1, target: 1 },
				{ type: 'move', move: 1, target: 2 },
			],
		});
		assert.equal(state.status, 'active');
		assert.equal(state.lastAction.success, true);
		assert.equal(state.lastAction.continued, true);
		assert.equal(state.sides[1].pokemon.filter(entry => entry.active && !entry.fainted).length, 1);
		assert.equal(state.animations.some(entry => entry.type === 'faint' && entry.actor.name === 'Pidgey'), false);
	});
	it('accepts a Potion directly in doubles without requiring a fake move target', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-double-target';
		session.format = 'doubles';
		launch.sessionId = session.id;
		launch.format = 'doubles';
		character.team.push({ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } });
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon = [
			{ set: pokemon('Pidgey', ['Tackle']) }, { set: pokemon('Rattata', ['Tackle']) },
		];
		launch.participants = session.participants;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'potion', quantity: 1 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		const state = manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [
				{ type: 'item', item: 'potion', target: 1, actionId: 'double-potion-target' },
				{ type: 'move', move: 1, target: 1 },
			],
		});
		assert.equal(state.sides[0].waiting, true);
		assert.equal(state.animations.some(event => event.type === 'item'), false);
	});
	it('rejects two Bag items selected by the same side in one turn', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-double-limit';
		session.format = 'doubles';
		launch.sessionId = session.id;
		launch.format = 'doubles';
		character.team.push({ ...pokemon('Pikachu', ['Tackle']), rpg: { version: 1, level: 5 } });
		session.participants[0].selectionLimit = 2;
		session.participants[0].pokemon = [{ teamIndex: 0 }, { teamIndex: 1 }];
		session.participants[1].selectionLimit = 2;
		session.participants[1].pokemon = [
			{ set: pokemon('Pidgey', ['Tackle']) }, { set: pokemon('Rattata', ['Tackle']) },
		];
		launch.participants = session.participants;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'potion', quantity: 2 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		assert.throws(() => manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [
				{ type: 'item', item: 'potion', target: 1, actionId: 'double-item-1' },
				{ type: 'item', item: 'potion', target: 2, actionId: 'double-item-2' },
			],
		}), /Only one Pokemon/);
	});
	it('rolls healing back when Bag persistence fails', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-bag-persistence-failure';
		launch.sessionId = session.id;
		character.inventory = RPGInventorySystem.create(RPGBagSystem.createForTier('hero', 'starter', [
			{ itemId: 'potion', quantity: 1 },
		]));
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const damagedHP = state.sides[0].pokemon[0].hp;
		manager.action(session.id, { master: false, characterId: 'hero' }, {
			type: 'turn', choices: [{ type: 'item', item: 'potion', target: 1, actionId: 'failed-save' }],
		}, () => { throw new Error('disk unavailable'); });
		assert.throws(() => manager.action(
			session.id, { master: true }, { type: 'move', move: 1 }
		), /disk unavailable/);
		state = manager.snapshot(session.id);
		assert(state.sides[0].pokemon[0].hp <= damagedHP);
		assert.equal(state.animations.some(event => event.type === 'item'), false);
		assert.equal(RPGBagSystem.getQuantity(character.inventory.bag, 'potion'), 1);
	});
});
describe('RPG residual damage animations', () => {
	it('deduplicates DoT damage and orders simultaneous effects from oldest to newest', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-residual-animation-order';
		launch.sessionId = session.id;
		character.team[0] = {
			...pokemon('Venusaur', ['Toxic', 'Leech Seed', 'Splash'], 50),
			ability: 'No Guard', rpg: { version: 1, level: 50 },
		};
		session.participants[1].pokemon = [{ set: {
			...pokemon('Blissey', ['Splash'], 50), ability: 'Natural Cure',
		} }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 2 });
		let state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		assert.deepEqual(state.animations.filter(event => event.type === 'residual').map(event => event.residual.id), ['leechseed']);
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const latest = state.animations.filter(event => event.type === 'residual').slice(-2);
		assert.deepEqual(latest.map(event => event.residual.id), ['leechseed', 'tox']);
		assert(latest[0].appliedSequence < latest[1].appliedSequence);
		assert(latest[0].sequence < latest[1].sequence);
		assert(latest.every(event => event.updates.length === 1 && Number.isFinite(event.updates[0].hpFraction)));
	});
	it('maps burn damage to the native Showdown burn presentation', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-residual-burn-animation';
		launch.sessionId = session.id;
		character.team[0] = {
			...pokemon('Squirtle', ['Splash'], 50), rpg: { version: 1, level: 50 },
		};
		session.participants[1].pokemon = [{ set: {
			...pokemon('Sableye', ['Will-O-Wisp'], 50), ability: 'No Guard',
		} }];
		launch.participants = session.participants;
		const manager = new RPGBattleRuntimeManager();
		manager.start(session, launch, () => character);
		manager.ready(session.id, { master: false, characterId: 'hero' });
		manager.ready(session.id, { master: true });
		manager.action(session.id, { master: false, characterId: 'hero' }, { type: 'move', move: 1 });
		const state = manager.action(session.id, { master: true }, { type: 'move', move: 1 });
		const burn = state.animations.find(event => event.type === 'residual' && event.residual.id === 'brn');
		assert(burn);
		assert.equal(burn.residual.theme, 'burn');
		assert.equal(burn.residual.moveId, 'firespin');
		assert.equal(burn.updates.length, 1);
	});
	it('starts with the configured native hazard layers on each side', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-initial-hazards';
		launch.sessionId = session.id;
		launch.initialHazards = {
			A: { spikes: 3, stealthRock: true, toxicSpikes: 2 },
			B: { spikes: 1, stealthRock: false, toxicSpikes: 1 },
		};
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const own = new Map(state.sides[0].effects.hazards.map(effect => [effect.id, effect]));
		const foe = new Map(state.sides[1].effects.hazards.map(effect => [effect.id, effect]));
		assert.equal(own.get('spikes').layers, 3);
		assert.equal(own.get('stealthrock').layers, null);
		assert.equal(own.get('toxicspikes').layers, 2);
		assert.equal(foe.get('spikes').layers, 1);
		assert.equal(foe.has('stealthrock'), false);
		assert.equal(foe.get('toxicspikes').layers, 1);
	});
	it('starts with the configured native side buffs on each team', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-initial-buffs';
		launch.sessionId = session.id;
		launch.initialBuffs = {
			A: { tailwind: true, reflect: true, lightScreen: false, auroraVeil: false, safeguard: false, mist: true },
			B: { tailwind: false, reflect: false, lightScreen: true, auroraVeil: true, safeguard: true, mist: false },
		};
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const own = new Set(state.sides[0].effects.buffs.map(effect => effect.id));
		const foe = new Set(state.sides[1].effects.buffs.map(effect => effect.id));
		assert.deepEqual([...own].sort(), ['mist', 'reflect', 'tailwind']);
		assert.deepEqual([...foe].sort(), ['auroraveil', 'lightscreen', 'safeguard']);
	});
	it('starts with configured global move effects and their native durations', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-initial-global-effects';
		launch.sessionId = session.id;
		launch.initialGlobalEffects = {
			trickRoom: true, magicRoom: false, wonderRoom: true, gravity: true,
			mudSport: false, waterSport: true, fairyLock: false, ionDeluge: false,
		};
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		const effects = new Map(state.field.globalEffects.map(effect => [effect.id, effect]));
		assert.deepEqual([...effects.keys()].sort(), ['gravity', 'trickroom', 'watersport', 'wonderroom']);
		assert.equal(effects.get('trickroom').duration, 5);
		assert.equal(effects.get('gravity').duration, 5);
		assert.equal(effects.get('watersport').duration, 5);
		assert.equal(effects.get('wonderroom').duration, 5);
	});
	it('exposes every configured initial condition in the battle HUD state', () => {
		const { session, launch, character } = setup();
		session.id = 'runtime-all-initial-conditions';
		launch.sessionId = session.id;
		launch.rpg.weather = 'raindance';
		launch.rpg.weatherDuration = 5;
		launch.rpg.terrain = 'electricterrain';
		launch.rpg.terrainDuration = undefined;
		launch.initialHazards = {
			A: { spikes: 3, stealthRock: true, toxicSpikes: 2 },
			B: { spikes: 3, stealthRock: true, toxicSpikes: 2 },
		};
		launch.initialBuffs = {
			A: { tailwind: true, reflect: true, lightScreen: true, auroraVeil: true, safeguard: true, mist: true },
			B: { tailwind: true, reflect: true, lightScreen: true, auroraVeil: true, safeguard: true, mist: true },
		};
		launch.initialGlobalEffects = {
			trickRoom: true, magicRoom: true, wonderRoom: true, gravity: true,
			mudSport: true, waterSport: true, fairyLock: true, ionDeluge: true,
		};
		const state = new RPGBattleRuntimeManager().start(session, launch, () => character);
		assert.equal(state.field.weatherDetails.id, 'raindance');
		assert.equal(state.field.weatherDetails.duration, 5);
		assert.equal(state.field.terrainDetails.id, 'electricterrain');
		assert.equal(state.field.terrainDetails.permanent, true);
		assert.deepEqual(
			state.field.globalEffects.map(effect => effect.id).sort(),
			['fairylock', 'gravity', 'iondeluge', 'magicroom', 'mudsport', 'trickroom', 'watersport', 'wonderroom']
		);
		assert.equal(state.field.globalEffects.find(effect => effect.id === 'fairylock').icon, 'lock');
		assert.equal(state.field.globalEffects.find(effect => effect.id === 'iondeluge').icon, 'electric');
		for (const side of state.sides) {
			assert.deepEqual(
				side.effects.hazards.map(effect => effect.id).sort(),
				['spikes', 'stealthrock', 'toxicspikes']
			);
			assert.deepEqual(
				side.effects.buffs.map(effect => effect.id).sort(),
				['auroraveil', 'lightscreen', 'mist', 'reflect', 'safeguard', 'tailwind']
			);
		}
	});
});
