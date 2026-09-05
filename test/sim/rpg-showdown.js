'use strict';

const assert = require('../assert');
const common = require('../common');
const {
	ExperienceSystem,
	FriendshipSystem,
	HealingSystem,
	LevelProgressionSystem,
	CaptureSystem,
	FleeSystem,
	RPGBattleRulesSystem,
	RPGLogger,
	ReviveSystem,
	RPGStateCodec,
	RPG_STATE_COMPATIBILITY,
	RPGExternalIntegration,
	RPGTeamBuilderSystem,
	RPGItemUseSystem,
	RPGInventorySystem,
	RPGBagSystem,
	RPGItemRegistry,
	RPGItems,
	RPGBoxSystem,
	RPGShopSystem,
	RPG_GEN9_ITEM_PRICES,
	RPG_LEGACY_ITEM_PRICES,
	RPG_BALANCED_ITEM_PRICES,
	RPG_BAG_TIERS,
	RPG_BOX_TIERS,
	RPGTournamentSystem,
	RPGGen9PokeballCalculator,
	getExperienceForLevel,
	getSpeciesExperience,
} = require('../../dist/sim/rpg-showdown');

describe('RPG Showdown', () => {
	const rpgTeams = [
		[{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: {} }],
		[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
	];

	it('should initialize the complete persistent state', () => {
		const battle = common.createBattle(rpgTeams);
		const [pikachu] = battle.getAllPokemon();

		assert.equal(pikachu.rpg.initialized, true);
		assert.equal(pikachu.rpg.hp, pikachu.maxhp);
		assert.equal(pikachu.rpg.status, '');
		assert.deepEqual(pikachu.rpg.pp, [pikachu.baseMoveSlots[0].maxpp]);
		assert.equal(pikachu.rpg.item, '');
		assert.deepEqual(pikachu.rpg.evs, pikachu.set.evs);
	});

	it('should not enable persistence for a regular Showdown Pokemon', () => {
		const battle = common.createBattle([
			[{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'] }],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'] }],
		]);
		const [pikachu] = battle.getAllPokemon();

		assert.deepEqual(pikachu.rpg, {});
		pikachu.hp = 10;
		battle.actions.switchIn(pikachu);
		assert.equal(pikachu.hp, 10);
	});

	it('should persist every RPG Pokemon and expose an independent result when a battle is won', () => {
		const battle = common.createBattle(rpgTeams);
		const [pikachu, eevee] = battle.getAllPokemon();
		pikachu.hp = 17;
		eevee.hp = 0;

		assert.equal(battle.win('p1'), true);
		assert.equal(pikachu.rpg.hp, 17);
		assert.equal(eevee.rpg.hp, 0);
		assert.equal(battle.rpg.result.outcome, 'win');
		assert.equal(battle.rpg.result.winnerSide, 'p1');
		assert.equal(battle.rpg.result.pokemon[0].state.hp, 17);

		pikachu.rpg.hp = 1;
		assert.equal(battle.rpg.result.pokemon[0].state.hp, 17);
	});

	it('should persist RPG Pokemon when a battle ties and only end once', () => {
		const battle = common.createBattle(rpgTeams);
		const [pikachu] = battle.getAllPokemon();
		pikachu.hp = 23;

		assert.equal(battle.tie(), true);
		assert.equal(pikachu.rpg.hp, 23);
		assert.equal(battle.rpg.result.outcome, 'tie');
		assert.deepEqual(battle.rpg.result.loserSides, []);
		assert(battle.rpg.result.sides.every(side => side.outcome === 'tied'));

		pikachu.hp = 1;
		assert.equal(battle.tie(), false);
		assert.equal(pikachu.rpg.hp, 23);
	});

	it('should restore and save PP, status, and consumed items', () => {
		const battle = common.createBattle([
			[{
				species: 'Pikachu',
				ability: 'Static',
				item: 'Sitrus Berry',
				moves: ['Thunderbolt', 'Quick Attack'],
				rpg: { initialized: true, pp: [2, 99], status: 'par', item: 'oranberry' },
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [pikachu] = battle.getAllPokemon();

		assert.equal(pikachu.moveSlots[0].pp, 2);
		assert.equal(pikachu.moveSlots[1].pp, pikachu.moveSlots[1].maxpp);
		assert.equal(pikachu.status, 'par');
		assert.equal(pikachu.item, 'oranberry');

		pikachu.moveSlots[0].pp = 1;
		pikachu.status = 'brn';
		pikachu.item = '';
		assert.equal(battle.win('p1'), true);
		assert.deepEqual(pikachu.rpg.pp, [1, pikachu.baseMoveSlots[1].maxpp]);
		assert.equal(pikachu.rpg.status, 'brn');
		assert.equal(pikachu.rpg.item, '');
	});

	it('should restore remaining sleep turns', () => {
		const battle = common.createBattle([
			[{
				species: 'Pikachu',
				ability: 'Static',
				moves: ['Thunderbolt'],
				rpg: { initialized: true, status: 'slp', sleepTurns: 2 },
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [pikachu] = battle.getAllPokemon();

		assert.equal(pikachu.status, 'slp');
		assert.equal(pikachu.statusState.time, 2);
		assert.equal(battle.win('p1'), true);
		assert.equal(pikachu.rpg.sleepTurns, 2);
	});

	it('should clamp HP and keep fainted Pokemon unavailable', () => {
		const battle = common.createBattle([
			[
				{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: { hp: 9999 } },
				{ species: 'Bulbasaur', ability: 'Overgrow', moves: ['Tackle'], rpg: { hp: 0 } },
			],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [pikachu, bulbasaur] = battle.p1.pokemon;

		assert.equal(pikachu.hp, pikachu.maxhp);
		assert.equal(bulbasaur.hp, 0);
		assert.equal(bulbasaur.fainted, true);
		assert.equal(battle.p1.pokemonLeft, 1);
	});

	it('should apply persistent EVs before stats are calculated and save them at battle end', () => {
		const battle = common.createBattle([
			[{
				species: 'Pikachu',
				ability: 'Static',
				moves: ['Thunderbolt'],
				evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
				rpg: { evs: { atk: 252, spe: 252 } },
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [pikachu] = battle.getAllPokemon();

		assert.equal(pikachu.set.evs.atk, 252);
		assert.equal(pikachu.set.evs.spe, 252);
		assert.equal(battle.win('p1'), true);
		assert.equal(pikachu.rpg.evs.atk, 252);
		assert.equal(pikachu.rpg.evs.spe, 252);
	});

	it('should restore and save weather and terrain with their remaining duration', () => {
		const battle = common.createBattle({
			rpg: {
				weather: 'raindance',
				weatherDuration: 3,
				terrain: 'electricterrain',
				terrainDuration: 2,
			},
		}, rpgTeams);

		assert.equal(battle.field.weather, 'raindance');
		assert.equal(battle.field.weatherState.duration, 3);
		assert.equal(battle.field.terrain, 'electricterrain');
		assert.equal(battle.field.terrainState.duration, 2);

		battle.field.setWeather('sandstorm', battle.p1.active[0]);
		battle.field.weatherState.duration = 1;
		battle.field.clearTerrain();
		assert.equal(battle.win('p1'), true);

		assert.equal(battle.rpg.weather, 'sandstorm');
		assert.equal(battle.rpg.weatherDuration, 1);
		assert.equal(battle.rpg.terrain, '');
		assert.equal(battle.rpg.terrainDuration, undefined);
	});

	it('should expose a complete structured result without interpreting the battle log', () => {
		const battle = common.createBattle({
			rpg: {
				battleType: 'trainer',
				weather: 'raindance', weatherDuration: 4,
				terrain: 'electricterrain', terrainDuration: 3,
			},
		}, [
			[{
				species: 'Pikachu', level: 20, ability: 'Static', item: 'Light Ball',
				moves: ['Thunderbolt', 'Quick Attack'], rpg: {},
			}],
			[{
				species: 'Eevee', level: 18, ability: 'Run Away', moves: ['Tackle'],
			}],
		]);
		const pikachu = battle.p1.pokemon[0];
		const eevee = battle.p2.pokemon[0];
		pikachu.hp = 25;
		pikachu.moveSlots[0].pp = 2;
		pikachu.baseMoveSlots[0].pp = 2;
		eevee.hp = 7;
		battle.win('p1');

		const result = battle.rpg.result;
		assert.equal(result.version, 2);
		assert.equal(result.outcome, 'win');
		assert.equal(result.winner, battle.p1.name);
		assert.equal(result.winnerSide, 'p1');
		assert.deepEqual(result.loserSides, ['p2']);
		assert.equal(result.sides.find(side => side.side === 'p1').outcome, 'winner');
		assert.equal(result.sides.find(side => side.side === 'p2').outcome, 'loser');
		assert.deepEqual(result.field, {
			weather: 'raindance', weatherDuration: 4,
			terrain: 'electricterrain', terrainDuration: 3,
		});
		assert.equal(result.pokemon.length, 2);
		const playerState = result.pokemon.find(pokemon => pokemon.side === 'p1');
		assert.equal(playerState.rpgEnabled, true);
		assert.equal(playerState.species, 'Pikachu');
		assert.equal(playerState.hp, 25);
		assert.equal(playerState.moves[0].pp, 2);
		assert.equal(playerState.item, 'lightball');
		assert.equal(playerState.state.hp, 25);
		const externalWildState = result.pokemon.find(pokemon => pokemon.side === 'p2');
		assert.equal(externalWildState.rpgEnabled, false);
		assert.equal(externalWildState.species, 'Eevee');
		assert.equal(externalWildState.hp, 7);
		assert.equal(externalWildState.state.hp, 7);
		assert.equal(typeof battle.getDebugLog(), 'string');
	});

	it('should provide complete Generation 9 experience data and a battle-based Lucky Egg boost', () => {
		const squirtleData = getSpeciesExperience('squirtle');
		assert.equal(squirtleData.baseExperience, 63);
		assert.equal(squirtleData.growthRate, 'medium-slow');
		assert.equal(getExperienceForLevel('medium-slow', 10), 560);
		assert.equal(getExperienceForLevel('medium-slow', 16), 2535);

		for (const species of common.dex.species.all()) {
			if (species.num < 1 || species.num > 1025 || species.name !== species.baseSpecies) continue;
			assert(getSpeciesExperience(species.id), `Missing experience data for ${species.name}`);
		}

		const battle = common.createBattle([
			[{
				species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'],
				rpg: { luckyEggBattles: 3 },
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [squirtle] = battle.getAllPokemon();
		assert.equal(squirtle.rpg.experience, 560);
		assert.equal(ExperienceSystem.getMultiplier(squirtle), 1.5);
		ExperienceSystem.consumeLuckyEggBattle(squirtle);
		assert.equal(squirtle.rpg.luckyEggBattles, 2);
	});

	it('should calculate Generation 9 scaled base experience', () => {
		assert.equal(ExperienceSystem.calculateBaseGain(63, 10, 10), 127);
		assert(ExperienceSystem.calculateBaseGain(63, 20, 10) > 127);
		assert(ExperienceSystem.calculateBaseGain(63, 10, 20) < 127);
		assert.equal(ExperienceSystem.calculateBaseGain(63, 10, 100), 0);
	});

	it('should record each faint once with every Pokemon that faced the defeated opponent', () => {
		const battle = common.createBattle([
			[
				{ species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'], rpg: {} },
				{ species: 'Bulbasaur', level: 10, ability: 'Overgrow', moves: ['Tackle'], rpg: {} },
			],
			[{ species: 'Eevee', level: 10, ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		battle.makeChoices('switch 2', 'move tackle');

		const bulbasaur = battle.p1.active[0];
		const eevee = battle.p2.active[0];
		assert.equal(eevee.faint(bulbasaur) > 0, true);
		assert.equal(eevee.faint(bulbasaur), 0);
		battle.faintMessages();

		const [defeat] = battle.rpg.result.defeats;
		assert.equal(defeat.species, 'eevee');
		assert.equal(defeat.source.side, 'p1');
		assert.deepEqual(defeat.participants.map(participant => participant.position), [0, 1]);
		assert.deepEqual(defeat.participants.map(participant => participant.baseExperienceGain), [131, 131]);
		assert.deepEqual(battle.rpg.result.experience.map(result => result.gained), [65, 65]);
		assert.deepEqual(battle.rpg.result.experience.map(result => result.participated), [true, true]);
	});

	it('should distribute trainer EXP only to participants and consume Lucky Egg once', () => {
		const battle = common.createBattle({
			rpg: { battleType: 'trainer' },
		}, [
			[
				{
					species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'],
					rpg: { luckyEggBattles: 2 },
				},
				{ species: 'Bulbasaur', level: 10, ability: 'Overgrow', moves: ['Tackle'], rpg: {} },
			],
			[{ species: 'Eevee', level: 10, ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const squirtle = battle.p1.pokemon[0];
		const bulbasaur = battle.p1.pokemon[1];
		battle.p2.active[0].faint(squirtle);
		battle.faintMessages();

		assert.equal(squirtle.rpg.experience, 854);
		assert.equal(squirtle.rpg.luckyEggBattles, 1);
		assert.equal(bulbasaur.rpg.experience, 560);
		assert.deepEqual(battle.rpg.result.experience.map(result => result.gained), [294]);
		assert.deepEqual(battle.rpg.result.experience.map(result => result.participated), [true]);
	});

	it('should combine traded, friendship, Lucky Egg, and RPG event modifiers', () => {
		const battle = common.createBattle([
			[{
				species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'],
				rpg: {
					luckyEggBattles: 1,
					traded: true,
					foreignLanguage: true,
					friendship: 220,
					experienceMultiplier: 2,
				},
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [squirtle] = battle.getAllPokemon();
		assert(Math.abs(ExperienceSystem.getPokemonMultiplier(squirtle) - 6.12) < 1e-10);
	});

	it('should not distribute EXP or consume Lucky Egg in a no-exp battle', () => {
		const battle = common.createBattle({
			rpg: { battleType: 'no-exp' },
		}, [
			[{
				species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'],
				rpg: { luckyEggBattles: 2 },
			}],
			[{ species: 'Eevee', level: 10, ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const squirtle = battle.p1.active[0];
		battle.p2.active[0].faint(squirtle);
		battle.faintMessages();

		assert.equal(squirtle.rpg.experience, 560);
		assert.equal(squirtle.rpg.luckyEggBattles, 2);
		assert.deepEqual(battle.rpg.result.experience, []);
	});

	it('should synchronize persistent friendship with Showdown happiness', () => {
		const battle = common.createBattle([
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [squirtle] = battle.getAllPokemon();
		assert.equal(squirtle.rpg.friendship, 50);
		assert.equal(squirtle.happiness, 50);
	});

	it('should apply Generation 9 friendship event tiers', () => {
		const battle = common.createBattle([
			[{
				species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'],
				rpg: { friendship: 99 },
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [squirtle] = battle.getAllPokemon();

		assert.equal(FriendshipSystem.applyStandardEvent(squirtle, 'level-up'), 3);
		squirtle.rpg.friendship = 159;
		assert.equal(FriendshipSystem.applyStandardEvent(squirtle, 'level-up'), 2);
		assert.equal(FriendshipSystem.applyStandardEvent(squirtle, 'level-up'), 0);
		assert.equal(FriendshipSystem.EVOLUTION_THRESHOLD, 160);
	});

	it('should apply standard friendship loss when a Pokemon faints', () => {
		const battle = common.createBattle([
			[{
				species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'],
				rpg: { friendship: 50 },
			}],
			[{ species: 'Eevee', level: 10, ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const squirtle = battle.p1.active[0];
		squirtle.faint(battle.p2.active[0]);
		battle.faintMessages();

		assert.equal(squirtle.rpg.friendship, 49);
		assert.equal(battle.rpg.result.friendship[0].reason, 'faint');
		assert.equal(battle.rpg.result.friendship[0].change, -1);
	});

	it('should support roleplay friendship gains and losses', () => {
		const battle = common.createBattle({
			rpg: {
				friendshipRules: {
					mode: 'roleplay',
					participantVictoryGain: 2,
					partyVictoryGain: 1,
					faintLoss: 3,
				},
			},
		}, [
			[
				{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: { friendship: 50 } },
				{ species: 'Bulbasaur', ability: 'Overgrow', moves: ['Tackle'], rpg: { friendship: 50 } },
			],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: { friendship: 50 } }],
		]);
		battle.p2.active[0].faint(battle.p1.active[0]);
		battle.faintMessages();

		assert.equal(battle.p1.pokemon[0].rpg.friendship, 52);
		assert.equal(battle.p1.pokemon[1].rpg.friendship, 51);
		assert.equal(battle.p2.pokemon[0].rpg.friendship, 47);
		assert.deepEqual(
			battle.rpg.result.friendship.map(change => change.reason),
			['victory', 'party-victory', 'faint']
		);
	});

	it('should allow friendship changes to be disabled for roleplay battles', () => {
		const battle = common.createBattle({
			rpg: { friendshipRules: { mode: 'disabled' } },
		}, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: { friendship: 50 } }],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: { friendship: 50 } }],
		]);
		battle.p2.active[0].faint(battle.p1.active[0]);
		battle.faintMessages();

		assert.equal(battle.p2.pokemon[0].rpg.friendship, 50);
		assert.deepEqual(battle.rpg.result.friendship, []);
	});

	it('should detect every Generation 9 move learned across multiple levels', () => {
		const battle = common.createBattle([
			[{
				species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'], rpg: {},
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const [squirtle] = battle.getAllPokemon();
		assert.deepEqual(LevelProgressionSystem.getLearnedMoves(squirtle, 10, 16), [
			{ move: 'bite', level: 12 },
			{ move: 'waterpulse', level: 15 },
		]);
	});

	it('should persist multiple level-ups, friendship gains, and learned moves for the next battle', () => {
		const battle = common.createBattle({
			rpg: { experienceRules: { multiplier: 20 } },
		}, [
			[{
				species: 'Squirtle', level: 10, ability: 'Torrent', moves: ['Water Gun'],
				rpg: { friendship: 50 },
			}],
			[{ species: 'Eevee', level: 10, ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const squirtle = battle.p1.active[0];
		battle.p2.active[0].faint(squirtle);
		battle.faintMessages();

		const [gain] = battle.rpg.result.experience;
		assert.equal(gain.previousLevel, 10);
		assert.equal(gain.level, 17);
		assert.deepEqual(gain.learnedMoves, [
			{ move: 'bite', level: 12 },
			{ move: 'waterpulse', level: 15 },
		]);
		assert.deepEqual(battle.rpg.result.evolutions, [{
			side: 'p1', position: 0, fromSpecies: 'Squirtle', toSpecies: 'Wartortle',
			fromSpriteId: 'squirtle', toSpriteId: 'wartortle',
			fromSizeClass: 'small', toSizeClass: 'medium', level: 17, shiny: false,
		}]);
		assert.equal(squirtle.rpg.level, 17);
		assert.equal(squirtle.rpg.friendship, 71);
		assert.equal(
			battle.rpg.result.friendship.filter(change => change.reason === 'level-up').length,
			7
		);

		const nextBattle = common.createBattle([
			[{
				species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'],
				rpg: structuredClone(squirtle.rpg),
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		assert.equal(nextBattle.p1.pokemon[0].level, 17);
	});

	it('should randomly distribute exactly 508 persistent EVs to wild Pokemon', () => {
		const playerEVs = { hp: 4, atk: 8, def: 12, spa: 16, spd: 20, spe: 24 };
		const battle = common.createBattle({
			rpg: { battleType: 'wild' },
			seed: [1, 2, 3, 4],
		}, [
			[{
				species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], evs: playerEVs, rpg: {},
			}],
			[{
				species: 'Eevee', ability: 'Run Away', moves: ['Tackle'],
				evs: { hp: 252, atk: 252, def: 6, spa: 0, spd: 0, spe: 0 }, rpg: {},
			}],
		]);
		const player = battle.p1.pokemon[0];
		const wild = battle.p2.pokemon[0];
		assert.deepEqual(player.set.evs, playerEVs);
		assert.equal(Object.values(wild.set.evs).reduce((total, value) => total + value, 0), 508);
		for (const value of Object.values(wild.set.evs)) {
			assert(value >= 0 && value <= 252);
			assert.equal(value % 4, 0);
		}
		assert.deepEqual(wild.rpg.evs, wild.set.evs);

		battle.win('p1');
		const returned = battle.rpg.result.pokemon.find(result => result.side === 'p2');
		assert.deepEqual(returned.state.evs, wild.set.evs);
	});

	it('should allow choosing a wild legendary level up to 999 without affecting other Pokemon', () => {
		const battle = common.createBattle({
			rpg: { battleType: 'wild', wildLegendaryLevel: 1500 },
		}, [
			[{ species: 'Mewtwo', level: 5, ability: 'Pressure', moves: ['Confusion'], rpg: {} }],
			[
				{ species: 'Mewtwo', level: 5, ability: 'Pressure', moves: ['Confusion'] },
				{ species: 'Eevee', level: 5, ability: 'Run Away', moves: ['Tackle'] },
				{ species: 'Chromera', level: 5, ability: 'Color Change', moves: ['Tackle'] },
			],
		]);

		assert.equal(battle.p1.pokemon[0].level, 5);
		assert.equal(battle.p2.pokemon[0].level, 999);
		assert.equal(battle.p2.pokemon[1].level, 5);
		assert.equal(battle.p2.pokemon[2].level, 5);
	});

	it('should exclude legendary evolutionary families from the chosen wild level', () => {
		const firstBattle = common.createBattle({
			rpg: { battleType: 'wild', wildLegendaryLevel: 250 },
		}, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[
				{ species: 'Type: Null', level: 5, ability: 'Battle Armor', moves: ['Tackle'] },
				{ species: 'Silvally', level: 5, ability: 'RKS System', moves: ['Tackle'] },
				{ species: 'Cosmog', level: 5, ability: 'Unaware', moves: ['Splash'] },
				{ species: 'Cosmoem', level: 5, ability: 'Sturdy', moves: ['Splash'] },
				{ species: 'Solgaleo', level: 5, ability: 'Full Metal Body', moves: ['Tackle'] },
				{ species: 'Lunala', level: 5, ability: 'Shadow Shield', moves: ['Confusion'] },
			],
		]);
		assert(firstBattle.p2.pokemon.every(pokemon => pokemon.level === 5));

		const secondBattle = common.createBattle({
			rpg: { battleType: 'wild', wildLegendaryLevel: 250 },
		}, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[
				{ species: 'Kubfu', level: 5, ability: 'Inner Focus', moves: ['Rock Smash'] },
				{ species: 'Urshifu', level: 5, ability: 'Unseen Fist', moves: ['Rock Smash'] },
				{ species: 'Urshifu-Rapid-Strike', level: 5, ability: 'Unseen Fist', moves: ['Rock Smash'] },
			],
		]);
		assert(secondBattle.p2.pokemon.every(pokemon => pokemon.level === 5));
	});

	it('should use an exact chosen legendary level only in wild battles', () => {
		const wildBattle = common.createBattle({
			rpg: { battleType: 'wild', wildLegendaryLevel: 250 },
		}, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[{ species: 'Mewtwo', level: 5, ability: 'Pressure', moves: ['Confusion'] }],
		]);
		assert.equal(wildBattle.p2.pokemon[0].level, 250);

		const trainerBattle = common.createBattle({
			rpg: { battleType: 'trainer', wildLegendaryLevel: 250 },
		}, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[{ species: 'Mewtwo', level: 5, ability: 'Pressure', moves: ['Confusion'] }],
		]);
		assert.equal(trainerBattle.p2.pokemon[0].level, 5);
	});

	it('should calculate capture probability from HP, status, catch rate, and ball modifier', () => {
		const fullHP = CaptureSystem.calculate(100, 100, 45, 1, 1);
		const lowHP = CaptureSystem.calculate(100, 1, 45, 1, 1);
		const sleeping = CaptureSystem.calculate(100, 1, 45, 1, 2.5);
		const ultraBall = CaptureSystem.calculate(100, 1, 45, 2, 2.5);
		assert(fullHP.probability > 0 && fullHP.probability < 1);
		assert(lowHP.probability > fullHP.probability);
		assert(sleeping.probability > lowHP.probability);
		assert(ultraBall.probability > sleeping.probability);
	});

	it('should resolve the Generation 9 ball directly from battle data', () => {
		const netBattle = common.createBattle({ rpg: { battleType: 'wild' } }, [
			[{ species: 'Pikachu', level: 50, ability: 'Static', moves: ['Thunderbolt'], rpg: {} }],
			[{ species: 'Squirtle', level: 20, ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
		]);
		const net = CaptureSystem.attempt(netBattle.p2.pokemon[0], {
			catchRate: 45, captorSide: 'p1', ball: 'Net Ball',
		});
		assert.equal(net.allowed, true);
		assert.equal(net.ball, 'netball');
		assert.equal(net.ballModifierSource, 'generation-9');
		assert.equal(net.ballModifier, 3.5);
		assert.equal(net.adjustedCatchRate, 45);
		assert.equal(net.ballCalculation.complete, true);
		assert(net.ballCalculation.conditions.includes('water-or-bug'));

		const heavyBattle = common.createBattle({ rpg: { battleType: 'wild' } }, [
			[{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: {} }],
			[{ species: 'Mudsdale', ability: 'Stamina', moves: ['Tackle'], rpg: {} }],
		]);
		const heavy = CaptureSystem.attempt(heavyBattle.p2.pokemon[0], {
			catchRate: 3, captorSide: 'p1', ball: 'Heavy Ball',
		});
		assert.equal(heavy.allowed, true);
		assert.equal(heavy.ballModifier, 1);
		assert.equal(heavy.ballCalculation.catchRateAdd, 30);
		assert.equal(heavy.adjustedCatchRate, 33);
	});

	it('should require external ball context and reject unusable balls before rolling', () => {
		const battle = common.createBattle({ rpg: { battleType: 'wild' } }, rpgTeams);
		const target = battle.p2.pokemon[0];
		const missing = CaptureSystem.attempt(target, {
			catchRate: 45, captorSide: 'p1', ball: 'Repeat Ball',
		});
		assert.equal(missing.allowed, false);
		assert.equal(missing.reason, 'missing-ball-context');
		assert(missing.ballCalculation.missingContext.includes('alreadyCaught'));
		assert.equal(battle.ended, false);

		const unknown = CaptureSystem.attempt(target, {
			catchRate: 45, captorSide: 'p1', ball: 'RPG Ball',
		});
		assert.equal(unknown.reason, 'unknown-ball');
		const park = CaptureSystem.attempt(target, {
			catchRate: 45, captorSide: 'p1', ball: 'Park Ball',
		});
		assert.equal(park.reason, 'ball-not-throwable');

		const repeat = CaptureSystem.attempt(target, {
			catchRate: 45, captorSide: 'p1', ball: 'Repeat Ball',
			ballContext: { alreadyCaught: true },
		});
		assert.equal(repeat.allowed, true);
		assert.equal(repeat.ballModifier, 3.5);
	});

	it('should reject invalid captures and continue after a failed valid attempt', () => {
		const trainerBattle = common.createBattle({ rpg: { battleType: 'trainer' } }, rpgTeams);
		const rejected = CaptureSystem.attempt(trainerBattle.p2.pokemon[0], {
			catchRate: 255, captorSide: 'p1', ball: 'pokeball',
		});
		assert.equal(rejected.allowed, false);
		assert.equal(rejected.reason, 'not-wild-battle');
		assert.equal(trainerBattle.ended, false);

		const wildBattle = common.createBattle({ rpg: { battleType: 'wild' } }, rpgTeams);
		const failed = CaptureSystem.attempt(wildBattle.p2.pokemon[0], {
			catchRate: 45, captorSide: 'p1', ball: 'pokeball', ballModifier: 0,
		});
		assert.equal(failed.allowed, true);
		assert.equal(failed.success, false);
		assert.equal(failed.probability, 0);
		assert.equal(failed.ballModifierSource, 'external');
		assert.equal(failed.ballCalculation, undefined);
		assert.equal(failed.continued, true);
		assert.equal(wildBattle.ended, false);
	});

	it('should end a wild battle and return an independent captured Pokemon after success', () => {
		const battle = common.createBattle({ rpg: { battleType: 'wild' } }, [
			[{ species: 'Squirtle', ability: 'Torrent', moves: ['Water Gun'], rpg: {} }],
			[{
				species: 'Eevee', level: 12, ability: 'Run Away', nature: 'Jolly',
				moves: ['Tackle', 'Quick Attack'], rpg: { captureRate: 45 },
			}],
		]);
		const wild = battle.p2.pokemon[0];
		wild.hp = 3;
		wild.setStatus('slp');
		const captured = CaptureSystem.attempt(wild, { captorSide: 'p1', ball: 'masterball' });
		assert.equal(captured.success, true);
		assert.equal(captured.probability, 1);
		assert.equal(captured.ball, 'masterball');
		assert.equal(captured.pokemon.rpg.captureBall, 'masterball');
		assert.equal(captured.ballModifierSource, 'generation-9');
		assert.equal(captured.ballCalculation.guaranteed, true);
		assert.equal(captured.shakes, 4);
		assert.equal(captured.continued, false);
		assert.equal(battle.ended, true);
		assert.equal(battle.rpg.result.outcome, 'capture');
		assert.equal(battle.rpg.result.winnerSide, 'p1');
		assert.deepEqual(battle.rpg.result.loserSides, ['p2']);
		assert.equal(battle.rpg.result.sides.find(side => side.side === 'p2').outcome, 'captured');
		assert.equal(battle.rpg.result.capture.success, true);
		assert.equal(battle.rpg.result.capture.pokemon.species, 'Eevee');
		assert.equal(battle.rpg.result.capture.pokemon.level, 12);
		assert.deepEqual(battle.rpg.result.capture.pokemon.moves, ['tackle', 'quickattack']);
		assert.equal(Object.values(battle.rpg.result.capture.pokemon.evs).reduce((a, b) => a + b, 0), 508);
		assert.equal(battle.rpg.result.capture.pokemon.rpg.hp, 3);
		assert.equal(battle.rpg.result.capture.pokemon.rpg.status, 'slp');

		captured.pokemon.evs.hp = 0;
		assert.notEqual(battle.rpg.result.capture.pokemon.evs.hp, 0);
	});

	it('should calculate fleeing from unmodified Speed and consecutive attempts', () => {
		const first = FleeSystem.calculate(25, 100, 1);
		const second = FleeSystem.calculate(25, 100, 2);
		assert.equal(first.escapeValue, 62);
		assert.equal(first.probability, 62 / 256);
		assert.equal(second.escapeValue, 92);
		assert(second.probability > first.probability);
		assert.equal(FleeSystem.calculate(100, 100, 1).probability, 1);
		assert.deepEqual(FleeSystem.calculate(25, 100, 8), { escapeValue: 256, probability: 1 });
		assert.deepEqual(FleeSystem.calculate(25, 100, 20), { escapeValue: 256, probability: 1 });
	});

	it('should not guarantee an allowed escape merely because the battle is not wild', () => {
		const battle = common.createBattle({
			rpg: { battleType: 'trainer', modeRules: { trainer: { allowFlee: true } } },
			seed: [1, 2, 3, 4],
		}, [
			[{ species: 'Shuckle', level: 5, ability: 'Sturdy', moves: ['Tackle'], rpg: {} }],
			[{ species: 'Regieleki', level: 100, ability: 'Transistor', moves: ['Tackle'], rpg: {} }],
		]);
		const result = FleeSystem.attempt(battle.p1.active[0]);
		assert.equal(result.allowed, true);
		assert.equal(result.success, false);
		assert.equal(result.guaranteedBy, undefined);
		assert(result.probability > 0 && result.probability < 1);
		assert.equal(battle.ended, false);
	});

	it('should block forbidden fleeing and keep the battle running after failure', () => {
		const gym = common.createBattle({ rpg: { battleType: 'gym' } }, rpgTeams);
		const blocked = FleeSystem.attempt(gym.p1.active[0]);
		assert.equal(blocked.allowed, false);
		assert.equal(blocked.reason, 'flee-disabled');
		assert.equal(gym.ended, false);

		const wild = common.createBattle({ rpg: { battleType: 'wild' }, seed: [1, 2, 3, 4] }, [
			[{ species: 'Shuckle', level: 5, ability: 'Sturdy', moves: ['Tackle'], rpg: {} }],
			[{ species: 'Regieleki', level: 100, ability: 'Transistor', moves: ['Tackle'], rpg: {} }],
		]);
		const failed = FleeSystem.attempt(wild.p1.active[0]);
		assert.equal(failed.allowed, true);
		assert.equal(failed.success, false);
		assert.equal(failed.continued, true);
		assert.equal(failed.attempts, 1);
		assert.equal(wild.ended, false);
	});

	it('should represent a successful escape as the official RPG battle result', () => {
		const battle = common.createBattle({
			rpg: { battleType: 'wild', modeRules: { wild: { rewards: [{ type: 'money', amount: 500 }] } } },
		}, [
			[{ species: 'Jolteon', level: 100, ability: 'Volt Absorb', moves: ['Quick Attack'], rpg: {} }],
			[{ species: 'Shuckle', level: 5, ability: 'Sturdy', moves: ['Tackle'], rpg: {} }],
		]);
		const escaped = FleeSystem.attempt(battle.p1.active[0]);
		assert.equal(escaped.success, true);
		assert.equal(escaped.guaranteedBy, 'speed');
		assert.equal(escaped.probability, 1);
		assert.equal(battle.ended, true);
		assert.equal(battle.rpg.result.outcome, 'flee');
		assert.deepEqual(battle.rpg.result.loserSides, ['p1']);
		assert.equal(battle.rpg.result.sides.find(side => side.side === 'p1').outcome, 'fled');
		assert.equal(battle.rpg.result.flee.fleeingSide, 'p1');
		assert.equal(battle.rpg.result.winner, '');
		assert.deepEqual(battle.rpg.result.rewards, []);
		assert.deepEqual(battle.rpg.result.experience, []);
	});

	it('should guarantee escape through Run Away, Smoke Ball, and Ghost typing', () => {
		const guarantees = [
			{ species: 'Eevee', ability: 'Run Away', item: '', expected: 'run-away' },
			{ species: 'Shuckle', ability: 'Sturdy', item: 'Smoke Ball', expected: 'smoke-ball' },
			{ species: 'Duskull', ability: 'Levitate', item: '', expected: 'ghost-type' },
		];
		for (const entry of guarantees) {
			const battle = common.createBattle({ rpg: { battleType: 'wild' } }, [
				[{ ...entry, level: 5, moves: ['Tackle'], rpg: {} }],
				[{ species: 'Regieleki', level: 100, ability: 'Transistor', moves: ['Tackle'], rpg: {} }],
			]);
			const escaped = FleeSystem.attempt(battle.p1.active[0]);
			assert.equal(escaped.success, true);
			assert.equal(escaped.guaranteedBy, entry.expected);
		}
	});

	it('should revive a fainted RPG Pokemon at half HP and synchronize persistent state', () => {
		const battle = common.createBattle([
			[
				{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: {} },
				{
					species: 'Bulbasaur', ability: 'Overgrow', item: 'Oran Berry',
					moves: ['Tackle', 'Growl'], rpg: {},
				},
			],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const target = battle.p1.pokemon[1];
		target.setStatus('brn');
		target.moveSlots[0].pp = 1;
		target.faint(battle.p2.active[0]);
		battle.faintMessages();
		assert.equal(target.fainted, true);
		assert.equal(battle.p1.pokemonLeft, 1);

		const revived = ReviveSystem.revive(target);
		assert.equal(revived.success, true);
		assert.equal(target.hp, Math.floor(target.maxhp / 2));
		assert.equal(target.fainted, false);
		assert.equal(target.faintQueued, false);
		assert.equal(target.status, '');
		assert.equal(battle.p1.pokemonLeft, 2);
		assert.equal(target.rpg.hp, target.hp);
		assert.equal(target.rpg.status, '');
		assert.equal(target.moveSlots[0].pp, 1);
		assert.equal(target.item, 'oranberry');

		battle.win('p1');
		assert.equal(battle.rpg.result.revives.length, 1);
		assert.equal(battle.rpg.result.revives[0].restoredHP, target.hp);
		const returned = battle.rpg.result.pokemon.find(result => result.side === 'p1' && result.position === 1);
		assert.equal(returned.state.hp, target.hp);
		assert.equal(returned.state.pp[0], 1);
		assert.equal(returned.state.item, 'oranberry');
	});

	it('should support exact revive HP and reject living Pokemon', () => {
		const battle = common.createBattle([
			[
				{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: {} },
				{ species: 'Bulbasaur', ability: 'Overgrow', moves: ['Tackle'], rpg: {} },
			],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const target = battle.p1.pokemon[1];
		target.setStatus('par');
		target.faint(battle.p2.active[0]);
		battle.faintMessages();
		const revived = ReviveSystem.revive(target, { hp: 99999 });
		assert.equal(revived.restoredHP, target.maxhp);
		assert.equal(target.status, '');
		assert.equal(target.rpg.status, '');

		const duplicate = ReviveSystem.revive(target);
		assert.equal(duplicate.success, false);
		assert.equal(duplicate.reason, 'not-fainted');
		assert.equal(battle.p1.pokemonLeft, 2);
	});

	it('should apply partial item healing to selected resources and synchronize RPG state', () => {
		const battle = common.createBattle([
			[{
				species: 'Pikachu', ability: 'Static', item: 'Oran Berry',
				moves: ['Thunderbolt', 'Quick Attack'], rpg: {},
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const pokemon = battle.p1.pokemon[0];
		pokemon.hp = 10;
		pokemon.baseMoveSlots[0].pp = 1;
		pokemon.moveSlots[0].pp = 1;
		pokemon.baseMoveSlots[1].pp = 2;
		pokemon.moveSlots[1].pp = 2;
		pokemon.setStatus('brn');

		const potion = HealingSystem.partialHP(pokemon, 20, 'item');
		assert.equal(potion.hp, 30);
		assert.equal(pokemon.status, 'brn');
		assert.deepEqual(pokemon.rpg.pp, [1, 2]);

		const etherAndHeal = HealingSystem.heal(pokemon, {
			origin: 'item', pp: { amount: 3, move: 0 }, cureStatus: true,
		});
		assert.equal(etherAndHeal.pp[0], 4);
		assert.equal(etherAndHeal.pp[1], 2);
		assert.equal(pokemon.moveSlots[0].pp, 4);
		assert.equal(pokemon.status, '');
		assert.equal(pokemon.rpg.status, '');
		assert.equal(pokemon.rpg.item, 'oranberry');
	});

	it('should fully heal HP, all PP, and status through a Pokemon Center', () => {
		const battle = common.createBattle([
			[{
				species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt', 'Quick Attack'], rpg: {},
			}],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		const pokemon = battle.p1.pokemon[0];
		pokemon.hp = 1;
		for (const slot of pokemon.baseMoveSlots) slot.pp = 0;
		for (const slot of pokemon.moveSlots) slot.pp = 0;
		pokemon.setStatus('brn');
		const healed = HealingSystem.pokemonCenter(pokemon);
		assert.equal(healed.origin, 'pokemon-center');
		assert.equal(pokemon.hp, pokemon.maxhp);
		assert.deepEqual(pokemon.baseMoveSlots.map(slot => slot.pp), pokemon.baseMoveSlots.map(slot => slot.maxpp));
		assert.equal(pokemon.status, '');
		assert.equal(pokemon.rpg.hp, pokemon.maxhp);
		assert.deepEqual(pokemon.rpg.pp, pokemon.baseMoveSlots.map(slot => slot.maxpp));

		battle.win('p1');
		assert.equal(battle.rpg.result.healing.length, 1);
		assert.equal(battle.rpg.result.healing[0].origin, 'pokemon-center');
		assert.equal(battle.rpg.result.pokemon[0].state.hp, pokemon.maxhp);
	});

	it('should heal serialized state outside battle and never use healing as a revive', () => {
		const original = { hp: 2, pp: [0, 1], status: 'slp', sleepTurns: 3, item: 'potion' };
		const healed = HealingSystem.pokemonCenterState(original, 120, [15, 20]);
		assert.equal(healed.hp, 120);
		assert.deepEqual(healed.pp, [15, 20]);
		assert.equal(healed.status, '');
		assert.equal(healed.sleepTurns, undefined);
		assert.equal(healed.item, 'potion');
		assert.equal(original.hp, 2);

		const battle = common.createBattle(rpgTeams);
		const pokemon = battle.p1.pokemon[0];
		pokemon.hp = 0;
		pokemon.fainted = true;
		const rejected = HealingSystem.full(pokemon, 'item');
		assert.equal(rejected.success, false);
		assert.equal(rejected.reason, 'fainted');
		assert.equal(pokemon.hp, 0);
		assert.equal(pokemon.fainted, true);
	});

	it('should enforce persistent Team Builder editing rules without mutating the original team', () => {
		const battle = common.createBattle(rpgTeams);
		const original = [battle.p1.pokemon[0].set];
		const edited = RPGTeamBuilderSystem.open(original);
		edited[0].moves = ['Thunderbolt', 'Quick Attack'];
		edited[0].evs = { ...edited[0].evs, spe: 252 };
		assert.throws(() => RPGTeamBuilderSystem.apply(original, edited, { editable: { moves: true } }), /evs/);

		const saved = RPGTeamBuilderSystem.apply(original, edited, { editable: { moves: true, evs: true } });
		assert.deepEqual(saved[0].moves, ['Thunderbolt', 'Quick Attack']);
		assert.equal(saved[0].evs.spe, 252);
		assert.deepEqual(original[0].moves, ['Thunderbolt']);
		assert.notEqual(saved[0].rpg, original[0].rpg);
	});

	it('should open a versioned Team Builder session and persist all six editable fields', () => {
		const battle = common.createBattle(rpgTeams);
		const original = [battle.p1.pokemon[0].set];
		const rules = {
			editable: {
				moves: true, evs: true, ivs: true,
				item: true, ability: true, level: true,
			},
			maxLevel: 100,
			allowedMoves: ['Thunderbolt', 'Quick Attack'],
			allowedItems: ['Magnet'],
			allowedAbilities: ['Lightning Rod'],
		};
		const session = RPGTeamBuilderSystem.openSession('team-player-1', original, rules, 4);
		const edited = structuredClone(session.team);
		edited[0].moves = ['Thunderbolt', 'Quick Attack'];
		edited[0].evs = { hp: 6, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
		edited[0].ivs = { ...edited[0].ivs, atk: 30 };
		edited[0].item = 'Magnet';
		edited[0].ability = 'Lightning Rod';
		edited[0].level = 21;

		const applied = RPGTeamBuilderSystem.applySession(session, edited, 4);
		assert.equal(applied.session.version, 2);
		assert.equal(applied.session.teamId, 'team-player-1');
		assert.equal(applied.session.revision, 5);
		assert.deepEqual(applied.changes.map(change => change.field), [
			'moves', 'evs', 'ivs', 'item', 'ability', 'level',
		]);
		const saved = applied.session.team[0];
		assert.deepEqual(saved.rpg.evs, saved.evs);
		assert.equal(saved.rpg.item, 'Magnet');
		assert.equal(saved.rpg.level, 21);
		assert.equal(saved.rpg.experience, getExperienceForLevel('medium-fast', 21));
		assert.equal(saved.rpg.pp, undefined);
		assert.deepEqual(original[0].moves, ['Thunderbolt']);
		assert.notEqual(saved.rpg, original[0].rpg);
	});

	it('should always reject changes to gender, shiny, and nature in the Team Builder', () => {
		const battle = common.createBattle(rpgTeams);
		const original = [battle.p1.pokemon[0].set];
		const rules = { editable: { moves: true, evs: true, ivs: true, item: true, ability: true, level: true } };

		const gender = structuredClone(original);
		gender[0].gender = original[0].gender === 'F' ? 'M' : 'F';
		assert.throws(() => RPGTeamBuilderSystem.apply(original, gender, rules), /gender cannot be changed/);

		const shiny = structuredClone(original);
		shiny[0].shiny = !original[0].shiny;
		assert.throws(() => RPGTeamBuilderSystem.apply(original, shiny, rules), /shiny cannot be changed/);

		const nature = structuredClone(original);
		nature[0].nature = original[0].nature === 'Jolly' ? 'Adamant' : 'Jolly';
		assert.throws(() => RPGTeamBuilderSystem.apply(original, nature, rules), /nature cannot be changed/);
	});

	it('should enforce Team Builder limits, allowlists, per-Pokemon rules, and revision conflicts', () => {
		const battle = common.createBattle(rpgTeams);
		const original = [battle.p1.pokemon[0].set];
		const session = RPGTeamBuilderSystem.openSession('team-player-2', original, {
			editable: { moves: true, evs: true },
			perPokemon: {
				0: { allowedMoves: ['Thunderbolt', 'Quick Attack'], maxTotalEVs: 508 },
			},
		});
		const forbiddenMove = structuredClone(session.team);
		forbiddenMove[0].moves = ['Surf'];
		assert.throws(() => RPGTeamBuilderSystem.applySession(session, forbiddenMove, 0), /not allowed/);

		const excessiveEVs = structuredClone(session.team);
		excessiveEVs[0].evs = { hp: 6, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
		assert.throws(() => RPGTeamBuilderSystem.applySession(session, excessiveEVs, 0), /cannot exceed 508/);
		assert.throws(() => RPGTeamBuilderSystem.applySession(session, session.team, 1), /revision conflict/);
	});

	it('should apply defaults and overrides for each RPG battle mode and expose rewards', () => {
		const modes = {
			wild: [true, true, 1], trainer: [false, true, 1.5], npc: [false, true, 1.5],
			boss: [false, false, 2], gym: [false, false, 2], 'no-exp': [false, true, 0],
		};
		for (const [battleType, expected] of Object.entries(modes)) {
			const battle = common.createBattle({ rpg: { battleType } }, rpgTeams);
			const rules = RPGBattleRulesSystem.get(battle);
			assert.equal(CaptureSystem.isAllowed(battle), expected[0]);
			assert.equal(FleeSystem.isAllowed(battle), expected[1]);
			assert.equal(rules.experienceMultiplier, expected[2]);
		}

		const battle = common.createBattle({
			rpg: {
				battleType: 'gym',
				modeRules: { gym: { allowFlee: true, rewards: [{ type: 'badge', id: 'stone' }] } },
			},
		}, rpgTeams);
		assert.equal(FleeSystem.isAllowed(battle), true);
		battle.win('p1');
		assert.deepEqual(battle.rpg.result.rewards, [{ type: 'badge', id: 'stone' }]);
	});

	it('should identify RPG sides and apply outcome rewards and Bag restrictions outside the core', () => {
		const battle = common.createBattle({
			rpg: {
				battleType: 'npc',
				sideRoles: { p1: 'player', p2: 'npc' },
				modeRules: {
					npc: {
						allowBattleItems: false,
						rewardsByOutcome: { win: [{ type: 'money', amount: 750 }] },
					},
				},
			},
		}, rpgTeams);
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('mode-items', [{ itemId: 'potion', quantity: 1 }])
		);
		battle.p1.pokemon[0].hp = 10;
		assert.throws(() => RPGItemUseSystem.useInBattle(inventory, battle.p1.pokemon[0], {
			actionId: 'mode:item', itemId: 'potion',
		}), /does not allow Bag items/);
		assert.equal(RPGBagSystem.getQuantity(inventory.bag, 'potion'), 1);

		battle.win('p1');
		assert.deepEqual(battle.rpg.result.sideRoles, { p1: 'player', p2: 'npc' });
		assert.equal(battle.rpg.result.rules.allowBattleItems, false);
		assert.equal(battle.rpg.result.rules.requireFullDefeat, true);
		assert.deepEqual(battle.rpg.result.rewards, [{ type: 'money', amount: 750 }]);
	});

	it('should show Mega Evolution during battle and restore the persistent form at battle end', () => {
		const battle = common.createBattle({ rpg: { battleType: 'trainer' } }, [[{
			species: 'Charizard', ability: 'Blaze', item: 'Charizardite X', moves: ['Tackle'], rpg: {},
		}], [{
			species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {},
		}]]);
		const charizard = battle.p1.active[0];
		battle.makeChoices('move tackle mega', 'move tackle');
		assert.equal(charizard.species.name, 'Charizard-Mega-X');
		assert(battle.log.some(line => line.startsWith('|-mega|')));

		battle.win('p1');
		assert.equal(charizard.species.name, 'Charizard');
		assert.equal(charizard.ability, 'blaze');
		assert.equal(battle.rpg.result.pokemon[0].species, 'Charizard');
		assert.equal(battle.rpg.result.pokemon[0].ability, 'blaze');
		assert.deepEqual(battle.rpg.result.formChanges, [{
			side: 'p1', position: 0, fromSpecies: 'Charizard', toSpecies: 'Charizard-Mega-X',
			kind: 'mega', reverted: true,
		}]);
		assert(battle.log.some(line => line.startsWith('|detailschange|p1a: Charizard|Charizard')));
	});

	it('should serialize, migrate, and resume versioned RPG state', () => {
		const oldState = { hp: 12, status: 'par', pp: [3], friendship: 80 };
		const restored = RPGStateCodec.deserializePokemon(JSON.stringify(oldState));
		assert.equal(restored.version, 2);
		const firstBattle = common.createBattle([
			[{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: restored }],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		assert.equal(firstBattle.p1.pokemon[0].hp, 12);
		firstBattle.p1.pokemon[0].hp = 7;
		firstBattle.win('p1');

		const serialized = RPGStateCodec.serialize(firstBattle.rpg.result.pokemon[0].state);
		const secondBattle = common.createBattle([
			[{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: RPGStateCodec.deserializePokemon(serialized) }],
			[{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'], rpg: {} }],
		]);
		assert.equal(secondBattle.p1.pokemon[0].hp, 7);
		assert.equal(secondBattle.p1.pokemon[0].rpg.version, 2);
	});

	it('should enforce the documented RPG state compatibility window', () => {
		assert.deepEqual(RPG_STATE_COMPATIBILITY, {
			current: 2, minimumReadable: 1, unversionedAs: 1,
		});
		assert.equal(RPGStateCodec.canReadVersion(undefined), true);
		assert.equal(RPGStateCodec.canReadVersion(1), true);
		assert.equal(RPGStateCodec.canReadVersion(2), true);
		assert.equal(RPGStateCodec.canReadVersion(3), false);
		assert.equal(RPGStateCodec.canReadVersion(1.5), false);

		const versionOne = {
			version: 1,
			battleType: 'gym',
			sideRoles: { p1: 'player', p2: 'gym' },
			weather: 'raindance',
			weatherDuration: 3,
		};
		const migrated = RPGStateCodec.migrateBattle(versionOne);
		assert.equal(migrated.version, 2);
		assert.equal(migrated.battleType, 'gym');
		assert.deepEqual(migrated.sideRoles, versionOne.sideRoles);
		migrated.sideRoles.p2 = 'npc';
		assert.equal(versionOne.sideRoles.p2, 'gym');

		const serialized = RPGStateCodec.serializeBattle(versionOne);
		assert.deepEqual(RPGStateCodec.deserializeBattle(serialized), {
			...versionOne, version: 2,
		});
		assert.equal(RPGStateCodec.deserializePokemon('{"hp":9}').version, 2);
		assert.throws(() => RPGStateCodec.migrateBattle({ version: 3 }), /Unsupported/);
		assert.throws(() => RPGStateCodec.deserializePokemon('{"version":0}'), /Unsupported/);
		assert.throws(() => RPGStateCodec.deserializePokemon('[]'), /must be an object/);
		assert.throws(() => RPGStateCodec.deserializeBattle('not-json'), /Invalid serialized/);
	});

	it('should finalize and serialize an RPG doubles battle', () => {
		const team = species => ({ species, ability: 'No Ability', moves: ['Tackle'], rpg: {} });
		const battle = common.createBattle({ gameType: 'doubles', rpg: { battleType: 'trainer' } }, [
			[team('Pikachu'), team('Bulbasaur')],
			[team('Eevee'), team('Squirtle')],
		]);
		battle.p1.pokemon[0].hp = 11;
		battle.p1.pokemon[1].baseMoveSlots[0].pp = 4;
		battle.win('p1');

		assert.equal(battle.rpg.result.pokemon.length, 4);
		assert.equal(battle.rpg.result.pokemon[0].state.hp, 11);
		assert.equal(battle.rpg.result.pokemon[1].state.pp[0], 4);
		assert.deepEqual(battle.rpg.result.sides.map(side => side.outcome), ['winner', 'loser']);
		const serialized = JSON.parse(JSON.stringify(battle.rpg.result));
		assert.equal(serialized.outcome, 'win');
		assert.equal(serialized.pokemon.length, 4);
		assert.equal(serialized.pokemon[1].state.pp[0], 4);
	});

	it('should finalize allies and opponents correctly in an RPG multi battle', () => {
		const single = species => [{ species, ability: 'No Ability', moves: ['Tackle'], rpg: {} }];
		const battle = common.createBattle({ gameType: 'multi', rpg: { battleType: 'trainer' } }, [
			single('Pikachu'), single('Eevee'), single('Bulbasaur'), single('Squirtle'),
		]);
		battle.p3.pokemon[0].hp = 17;
		battle.win('p1');

		assert.equal(battle.rpg.result.pokemon.length, 4);
		assert.deepEqual(battle.rpg.result.sides.map(side => side.outcome), [
			'winner', 'loser', 'winner', 'loser',
		]);
		assert.equal(
			battle.rpg.result.pokemon.find(entry => entry.side === 'p3').state.hp,
			17
		);
	});

	it('should finalize one winner and three losers in an RPG free-for-all battle', () => {
		const single = species => [{ species, ability: 'No Ability', moves: ['Tackle'], rpg: {} }];
		const battle = common.createBattle({ gameType: 'freeforall', rpg: { battleType: 'trainer' } }, [
			single('Pikachu'), single('Eevee'), single('Bulbasaur'), single('Squirtle'),
		]);
		battle.p1.pokemon[0].hp = 13;
		battle.win('p1');

		assert.equal(battle.rpg.result.pokemon.length, 4);
		assert.deepEqual(battle.rpg.result.sides.map(side => side.outcome), [
			'winner', 'loser', 'loser', 'loser',
		]);
		assert.deepEqual(battle.rpg.result.loserSides, ['p2', 'p3', 'p4']);
		assert.equal(battle.rpg.result.pokemon[0].state.hp, 13);
	});

	it('should validate, migrate, and prepare the external RPG battle input', () => {
		const input = {
			version: 1,
			battleId: 'battle-001',
			requestId: 'request-abc',
			formatId: 'gen9customgame',
			seed: [1, 2, 3, 4],
			rpg: { battleType: 'wild' },
			sides: [
				{
					side: 'p1', name: 'Player',
					team: [{ species: 'Pikachu', ability: 'Static', moves: ['Thunderbolt'], rpg: { hp: 20 } }],
				},
				{
					side: 'p2', name: 'Wild',
					team: [{ species: 'Eevee', ability: 'Run Away', moves: ['Tackle'] }],
				},
			],
			metadata: { encounterId: 'route-1-eevee' },
		};
		const prepared = RPGExternalIntegration.prepare(JSON.parse(JSON.stringify(input)));
		assert.equal(prepared.version, 2);
		assert.equal(prepared.rpg.version, 2);
		assert.equal(prepared.players.p1.team[0].rpg.version, 2);
		assert.equal(prepared.players.p1.team[0].rpg.hp, 20);
		assert.equal(prepared.players.p2.team[0].rpg, undefined);
		prepared.players.p1.team[0].rpg.hp = 1;
		assert.equal(input.sides[0].team[0].rpg.hp, 20);

		assert.throws(() => RPGExternalIntegration.parseInput({ ...input, version: 999 }), /Unsupported/);
		assert.throws(() => RPGExternalIntegration.parseInput({ ...input, sides: [input.sides[0]] }), /two and four/);
		assert.throws(() => RPGExternalIntegration.parseInput({
			...input, sides: [input.sides[0], { ...input.sides[1], side: 'p1' }],
		}), /duplicated/);
		assert.throws(() => RPGExternalIntegration.parseInput({ ...input, formatId: 'gen9ou' }), /require gen9customgame/);
		assert.throws(() => RPGExternalIntegration.parseInput({
			...input, rpg: { battleType: 'wild', sideRoles: { p3: 'wild' } },
		}), /missing side/);
		assert.throws(() => RPGExternalIntegration.parseInput({
			...input, rpg: { battleType: 'wild', sideRoles: { p2: 'invalid' } },
		}), /Invalid RPG side role/);
	});

	it('should persist and publish an independent final response through external adapters', async () => {
		const battle = common.createBattle({ rpg: { battleType: 'trainer' } }, rpgTeams);
		battle.p1.pokemon[0].hp = 15;
		battle.win('p1');
		const calls = [];
		const persisted = [];
		const published = [];
		const response = await RPGExternalIntegration.complete('battle-002', battle, {
			repository: {
				async persistBattleResult(value) {
					calls.push('repository');
					persisted.push(value);
				},
			},
			transport: {
				async publishBattleResult(value) {
					calls.push('transport');
					published.push(value);
				},
			},
		}, { requestId: 'request-def', metadata: { server: 'rpg-1' } });

		assert.deepEqual(calls, ['repository', 'transport']);
		assert.equal(response.version, 2);
		assert.equal(response.battleId, 'battle-002');
		assert.equal(response.requestId, 'request-def');
		assert.equal(response.result.outcome, 'win');
		assert.equal(response.pokemonStates.length, battle.rpg.result.pokemon.length);
		assert.equal(response.pokemonStates[0].state.hp, 15);
		assert.deepEqual(persisted[0], published[0]);
		persisted[0].pokemonStates[0].state.hp = 1;
		assert.equal(response.pokemonStates[0].state.hp, 15);
		assert.equal(battle.rpg.result.pokemon[0].state.hp, 15);
	});

	it('should reject external completion before the battle has ended', async () => {
		const battle = common.createBattle({ rpg: { battleType: 'trainer' } }, rpgTeams);
		await assert.rejects(() => RPGExternalIntegration.complete('battle-003', battle, {
			repository: { async persistBattleResult() {} },
			transport: { async publishBattleResult() {} },
		}), /must be ended/);
	});

	it('should keep RPG logs silent by default and filter configured levels', () => {
		const entries = [];
		const previousLevel = RPGLogger.level;
		const previousSink = RPGLogger.sink;
		try {
			RPGLogger.reset();
			common.createBattle(rpgTeams);
			assert.equal(entries.length, 0);

			RPGLogger.configure({ level: 'warn', sink: (...values) => entries.push(values) });
			RPGLogger.debug('hidden-debug');
			RPGLogger.info('hidden-info');
			RPGLogger.warn('visible-warning');
			RPGLogger.error('visible-error');
			assert.deepEqual(entries.map(entry => entry[1]), ['[WARN]', '[ERROR]']);

			RPGLogger.enabled = true;
			assert.equal(RPGLogger.level, 'debug');
			common.createBattle(rpgTeams);
			assert(entries.some(entry => entry[1] === '[DEBUG]'));
		} finally {
			RPGLogger.level = previousLevel;
			RPGLogger.sink = previousSink;
		}
	});

	it('should expose the default RPG item registry and accept custom items', () => {
		assert.equal(RPGItems.list('ball').length, 28);
		assert.equal(RPGItems.require('Ultra Ball').effect.type, 'capture');
		assert.equal(RPGItems.require('revive').effect.hpFraction, 0.5);
		assert.equal(RPGItems.require('strangeball').usableInBattle, false);

		const registry = new RPGItemRegistry([]);
		registry.register({
			id: 'Small Revive', name: 'Small Revive', category: 'revive', stackLimit: 20,
			usableInBattle: true, consumedOnUse: true, source: 'custom',
			effect: { type: 'revive', hpFraction: 0.25 },
		});
		assert.equal(registry.require('small-revive').id, 'smallrevive');
		assert.throws(() => registry.register(registry.require('smallrevive')), /already registered/);
		assert.throws(() => registry.register({
			id: 'broken', name: 'Broken', category: 'custom', stackLimit: 0,
			usableInBattle: false, consumedOnUse: false, source: 'custom',
		}), /stackLimit/);
		assert.throws(() => registry.register({
			id: 'too-big', name: 'Too Big', category: 'custom', stackLimit: 100,
			usableInBattle: false, consumedOnUse: false, source: 'custom',
		}), /between 1 and 99/);
	});

	it('should create and update an independent versioned RPG Bag', () => {
		const original = RPGBagSystem.create('player-1', [
			{ itemId: 'Poke Ball', quantity: 15 },
			{ itemId: 'revive', quantity: 2 },
		]);
		assert.equal(original.version, 5);
		assert.equal(original.revision, 0);
		assert.equal(RPGBagSystem.getQuantity(original, 'pokeball'), 15);

		const updated = RPGBagSystem.apply(original, [
			{ type: 'remove', itemId: 'pokeball', quantity: 1 },
			{ type: 'add', itemId: 'ultraball', quantity: 4 },
		], 0);
		assert.equal(updated.bag.revision, 1);
		assert.equal(RPGBagSystem.getQuantity(updated.bag, 'pokeball'), 14);
		assert.equal(RPGBagSystem.getQuantity(updated.bag, 'ultraball'), 4);
		assert.equal(RPGBagSystem.getQuantity(original, 'ultraball'), 0);
		assert.deepEqual(updated.changes, [
			{ itemId: 'pokeball', previousQuantity: 15, quantity: 14 },
			{ itemId: 'ultraball', previousQuantity: 0, quantity: 4 },
		]);
	});

	it('should enforce Bag quantities, stack and slot limits atomically', () => {
		const limited = RPGBagSystem.create('player-2', [{ itemId: 'pokeball', quantity: 1 }], { maxSlots: 1 });
		assert.throws(() => RPGBagSystem.add(limited, 'ultraball', 1), /no free slots/);
		assert.throws(() => RPGBagSystem.remove(limited, 'pokeball', 2), /Not enough/);
		assert.throws(() => RPGBagSystem.add(limited, 'pokeball', 999), /stack limit/);
		assert.throws(() => RPGBagSystem.add(limited, 'unknown', 1), /Unknown/);
		assert.throws(() => RPGBagSystem.add(limited, 'pokeball', 1, 99), /revision conflict/);
		assert.equal(RPGBagSystem.getQuantity(limited, 'pokeball'), 1);
		assert.equal(limited.revision, 0);
	});

	it('should count every stored item type as one Bag slot across all categories', () => {
		const registry = new RPGItemRegistry([RPGItems.require('pokeball')]);
		registry.registerMany([
			{
				id: 'tm24', name: 'TM24', category: 'tm', stackLimit: 99,
				usableInBattle: false, consumedOnUse: true, source: 'custom',
				effect: { type: 'teach-move', move: 'thunderbolt' },
			},
			{
				id: 'leftovers', name: 'Leftovers', category: 'held', stackLimit: 99,
				usableInBattle: false, consumedOnUse: false, source: 'showdown',
				effect: { type: 'held-item' },
			},
			{
				id: 'thunderstone', name: 'Thunder Stone', category: 'evolution', stackLimit: 99,
				usableInBattle: false, consumedOnUse: true, source: 'showdown',
				effect: { type: 'evolution' },
			},
		]);
		const bag = RPGBagSystem.create('player-types', [
			{ itemId: 'pokeball', quantity: 50 },
			{ itemId: 'tm24', quantity: 5 },
			{ itemId: 'leftovers', quantity: 1 },
		], { maxSlots: 3, registry });
		assert.deepEqual(RPGBagSystem.getCapacity(bag), {
			usedSlots: 3, maxSlots: 3, freeSlots: 0, full: true,
		});

		const stacked = RPGBagSystem.add(bag, 'pokeball', 25, 0, registry);
		assert.equal(RPGBagSystem.getUsedSlots(stacked.bag), 3);
		assert.throws(
			() => RPGBagSystem.add(stacked.bag, 'thunderstone', 1, 1, registry),
			/no free slots/
		);

		const swapped = RPGBagSystem.apply(stacked.bag, [
			{ type: 'remove', itemId: 'leftovers', quantity: 1 },
			{ type: 'add', itemId: 'thunderstone', quantity: 1 },
		], 1, registry);
		assert.equal(RPGBagSystem.getUsedSlots(swapped.bag), 3);
		assert.equal(RPGBagSystem.getQuantity(swapped.bag, 'leftovers'), 0);
		assert.equal(RPGBagSystem.getQuantity(swapped.bag, 'thunderstone'), 1);

		const freed = RPGBagSystem.remove(swapped.bag, 'tm24', 5, 2, registry);
		assert.deepEqual(RPGBagSystem.getCapacity(freed.bag), {
			usedSlots: 2, maxSlots: 3, freeSlots: 1, full: false,
		});
		const unlimited = RPGBagSystem.create('player-unlimited');
		assert.deepEqual(RPGBagSystem.getCapacity(unlimited), {
			usedSlots: 0, maxSlots: undefined, freeSlots: undefined, full: false,
		});
	});

	it('should migrate serialized Bags and reject duplicated or invalid entries', () => {
		const restored = RPGBagSystem.migrate(JSON.parse(JSON.stringify({
			ownerId: 'player-3', revision: 7, items: [{ itemId: 'maxrevive', quantity: 3 }],
		})));
		assert.equal(restored.version, 5);
		assert.equal(restored.revision, 7);
		assert.equal(RPGBagSystem.getQuantity(restored, 'maxrevive'), 3);
		assert.throws(() => RPGBagSystem.migrate({
			version: 1, ownerId: 'player-3', revision: 0,
			items: [{ itemId: 'revive', quantity: 1 }, { itemId: 'revive', quantity: 1 }],
		}), /duplicated/);
	});

	const makeBoxCapture = index => ({
		success: true,
		pokemon: {
			name: `Eevee ${index}`,
			species: 'Eevee',
			level: 5,
			gender: index % 2 ? 'F' : 'M',
			shiny: false,
			item: '',
			ability: 'runaway',
			nature: 'Hardy',
			moves: ['tackle'],
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
			rpg: { hp: 20 },
		},
	});

	it('should create Box tiers with their configured boxes and slots', () => {
		const expectedBoxes = {
			small: [1, 12], initial: [2, 18], standard: [4, 18],
			expanded: [4, 42], national: [8, 42],
		};
		for (const [tier, [boxes, slotsPerBox]] of Object.entries(expectedBoxes)) {
			const storage = RPGBoxSystem.create(`player-${tier}`, { tier });
			assert.equal(RPG_BOX_TIERS[tier].boxes, boxes);
			assert.equal(storage.boxes.length, boxes);
			assert(storage.boxes.every(box => box.slots.length === slotsPerBox));
			const capacity = RPGBoxSystem.getCapacity(storage);
			assert.equal(capacity.partyCapacity, 6);
			assert.equal(capacity.slotsPerBox, slotsPerBox);
			assert.equal(capacity.boxCapacity, boxes * slotsPerBox);
			assert.equal(capacity.totalCapacity, 6 + boxes * slotsPerBox);
		}
	});

	it('should migrate legacy fixed-size Boxes without losing Pokemon or placement links', () => {
		const boxes = Array.from({ length: 32 }, (_, index) => ({
			index, name: `Legacy ${index + 1}`, slots: Array(10).fill(null),
		}));
		boxes[31].slots[9] = { pokemonId: 'legacy-eevee', pokemon: makeBoxCapture(180).pokemon };
		const migrated = RPGBoxSystem.migrate({
			version: 1, ownerId: 'legacy-player', revision: 4, tier: 'national', party: [], boxes,
			placements: [{
				placementId: 'legacy-placement', pokemonId: 'legacy-eevee', revision: 4,
				location: { destination: 'box', boxIndex: 31, slot: 9 },
			}],
		});
		assert.equal(migrated.version, 3);
		assert.equal(migrated.revision, 5);
		assert.equal(migrated.boxes.length, 8);
		assert(migrated.boxes.every(box => box.slots.length === 42));
		assert.equal(migrated.boxes[0].slots[0].pokemonId, 'legacy-eevee');
		assert.deepEqual(migrated.placements[0].location, {
			destination: 'box', boxIndex: 0, slot: 0,
		});
	});
	it('should place captures in the party, then the first Box, without duplication', () => {
		let storage = RPGBoxSystem.create('player-placement', { tier: 'small' });
		for (let index = 0; index < 6; index++) {
			const placed = RPGBoxSystem.placeCapture(storage, makeBoxCapture(index), {
				placementId: `battle:capture:${index}`,
				pokemonId: `eevee-${index}`,
			});
			assert.equal(placed.success, true);
			assert.equal(placed.placement.location.destination, 'party');
			assert.equal(placed.placement.location.position, index);
			storage = placed.storage;
		}
		const boxed = RPGBoxSystem.placeCapture(storage, makeBoxCapture(6), {
			placementId: 'battle:capture:6',
			pokemonId: 'eevee-6',
		});
		assert.equal(boxed.placement.location.destination, 'box');
		assert.equal(boxed.placement.location.boxIndex, 0);
		assert.equal(boxed.placement.location.slot, 0);
		assert.equal(boxed.storage.boxes[0].slots[0].pokemonId, 'eevee-6');
		assert.equal(boxed.storage.revision, 7);

		const replayed = RPGBoxSystem.placeCapture(boxed.storage, makeBoxCapture(6), {
			placementId: 'battle:capture:6',
			pokemonId: 'eevee-6',
		}, 0);
		assert.equal(replayed.replayed, true);
		assert.equal(replayed.storage.revision, 7);
		assert.equal(RPGBoxSystem.getCapacity(replayed.storage).totalUsed, 7);
		replayed.pokemon.name = 'Changed';
		assert.notEqual(RPGBoxSystem.findPokemon(replayed.storage, 'eevee-6').pokemon.name, 'Changed');

		const restored = RPGBoxSystem.migrate(JSON.parse(JSON.stringify(replayed.storage)));
		assert.equal(restored.boxes[0].slots[0].pokemonId, 'eevee-6');
		assert.equal(restored.revision, 7);
	});

	it('should keep a captured Pokemon pending when party and Boxes are full', () => {
		let storage = RPGBoxSystem.create('player-full-box', { tier: 'small' });
		for (let index = 0; index < 18; index++) {
			const placed = RPGBoxSystem.placeCapture(storage, makeBoxCapture(index), {
				placementId: `full:capture:${index}`,
				pokemonId: `full-eevee-${index}`,
			});
			assert.equal(placed.success, true);
			storage = placed.storage;
		}
		const snapshot = structuredClone(storage);
		const overflow = RPGBoxSystem.placeCapture(storage, makeBoxCapture(18), {
			placementId: 'full:capture:18',
			pokemonId: 'full-eevee-18',
		});
		assert.equal(overflow.success, false);
		assert.equal(overflow.reason, 'storage-full');
		assert.equal(overflow.pokemon.species, 'Eevee');
		assert.deepEqual(overflow.storage, snapshot);
		assert.equal(RPGBoxSystem.getCapacity(storage).full, true);

		const rejected = RPGBoxSystem.placeCapture(storage, { success: false }, {
			placementId: 'failed:capture',
			pokemonId: 'not-captured',
		});
		assert.equal(rejected.reason, 'not-captured');
		assert.throws(() => RPGBoxSystem.placeCapture(storage, makeBoxCapture(99), {
			placementId: 'full:capture:0',
			pokemonId: 'different-pokemon',
		}), /placementId conflict/);
		assert.throws(() => RPGBoxSystem.placeCapture(storage, makeBoxCapture(99), {
			placementId: 'revision:conflict',
			pokemonId: 'revision-pokemon',
		}, 0), /revision conflict/);
	});

	it('should replay persisted Box placements and reject corrupted Box data', () => {
		const original = RPGBoxSystem.create('player-box-persistence', { tier: 'small' });
		const placed = RPGBoxSystem.placeCapture(original, makeBoxCapture(30), {
			placementId: 'persisted:capture:30',
			pokemonId: 'persisted-eevee-30',
		});
		const restored = RPGBoxSystem.migrate(JSON.parse(JSON.stringify(placed.storage)));
		const replayed = RPGBoxSystem.placeCapture(restored, makeBoxCapture(30), {
			placementId: 'persisted:capture:30',
			pokemonId: 'persisted-eevee-30',
		}, 0);
		assert.equal(replayed.replayed, true);
		assert.equal(replayed.storage.revision, 1);
		assert.equal(RPGBoxSystem.getCapacity(replayed.storage).totalUsed, 1);

		const invalidSlots = JSON.parse(JSON.stringify(placed.storage));
		invalidSlots.boxes[0].slots.pop();
		assert.throws(() => RPGBoxSystem.migrate(invalidSlots), /exactly 12 slots/);

		const duplicated = JSON.parse(JSON.stringify(placed.storage));
		duplicated.boxes[0].slots[0] = structuredClone(duplicated.party[0]);
		assert.throws(() => RPGBoxSystem.migrate(duplicated), /duplicated RPG Box Pokemon id/);

		const missingPokemon = JSON.parse(JSON.stringify(placed.storage));
		missingPokemon.party = [];
		assert.throws(() => RPGBoxSystem.migrate(missingPokemon), /references a missing Pokemon/);
		assert.throws(() => RPGBoxSystem.migrate({
			...placed.storage, version: 99,
		}), /Unsupported RPG Box version/);
	});

	it('should keep the Bag unchanged when atomic updates or reservations fail', () => {
		const bag = RPGBagSystem.create('player-atomic-failure', [
			{ itemId: 'pokeball', quantity: 1 },
			{ itemId: 'potion', quantity: 1 },
		], { maxSlots: 2 });
		const bagSnapshot = structuredClone(bag);
		assert.throws(() => RPGBagSystem.apply(bag, [
			{ type: 'remove', itemId: 'potion', quantity: 1 },
			{ type: 'add', itemId: 'ultraball', quantity: 1 },
			{ type: 'add', itemId: 'greatball', quantity: 1 },
		], 0), /no free slots/);
		assert.deepEqual(bag, bagSnapshot);

		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-missing-item', [{ itemId: 'pokeball', quantity: 1 }])
		);
		const inventorySnapshot = structuredClone(inventory);
		assert.throws(() => RPGInventorySystem.reserve(inventory, {
			actionId: 'missing:two-balls',
			itemId: 'pokeball',
			quantity: 2,
			context: 'battle',
			reason: 'capture-attempt',
		}), /Not enough available/);
		assert.deepEqual(inventory, inventorySnapshot);
		assert.equal(RPGBagSystem.getQuantity(inventory.bag, 'pokeball'), 1);
		assert.deepEqual(inventory.transactions, []);
	});

	it('should replay consumed inventory after persistence and reject corrupted events', () => {
		const request = {
			actionId: 'persisted:ultraball',
			itemId: 'ultraball',
			context: 'battle',
			reason: 'capture-attempt',
		};
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-inventory-persistence', [{ itemId: 'ultraball', quantity: 2 }])
		);
		const reserved = RPGInventorySystem.reserve(inventory, request);
		const consumed = RPGInventorySystem.commit(reserved.inventory, request.actionId);
		const restored = RPGInventorySystem.migrate(JSON.parse(JSON.stringify(consumed.inventory)));
		const replayedCommit = RPGInventorySystem.commit(restored, request.actionId, 0);
		assert.equal(replayedCommit.replayed, true);
		assert.equal(replayedCommit.inventory.bag.revision, 2);
		assert.equal(RPGBagSystem.getQuantity(replayedCommit.inventory.bag, 'ultraball'), 1);
		const replayedReservation = RPGInventorySystem.reserve(restored, request, 0);
		assert.equal(replayedReservation.replayed, true);
		assert.equal(RPGBagSystem.getQuantity(replayedReservation.inventory.bag, 'ultraball'), 1);

		const corrupted = JSON.parse(JSON.stringify(consumed.inventory));
		corrupted.transactions[0].events[0].quantity = 99;
		assert.throws(() => RPGInventorySystem.migrate(corrupted), /Invalid RPG inventory event/);
		assert.throws(() => RPGInventorySystem.migrate({
			...consumed.inventory, version: 99,
		}), /Unsupported RPG inventory version/);
	});

	it('should preserve the last confirmed Bag and Box when external persistence fails', async () => {
		const confirmedInventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-database-failure', [{ itemId: 'pokeball', quantity: 2 }])
		);
		const candidateInventory = RPGInventorySystem.reserve(confirmedInventory, {
			actionId: 'database:reserve',
			itemId: 'pokeball',
			context: 'battle',
			reason: 'capture-attempt',
		}).inventory;
		const confirmedBox = RPGBoxSystem.create('player-database-failure', { tier: 'small' });
		const candidateBox = RPGBoxSystem.placeCapture(confirmedBox, makeBoxCapture(40), {
			placementId: 'database:capture:40',
			pokemonId: 'database-eevee-40',
		}).storage;
		const persist = async () => {
			throw new Error('database unavailable');
		};
		await assert.rejects(() => persist(structuredClone(candidateInventory)), /database unavailable/);
		await assert.rejects(() => persist(structuredClone(candidateBox)), /database unavailable/);

		assert.equal(confirmedInventory.bag.revision, 0);
		assert.equal(RPGBagSystem.getQuantity(confirmedInventory.bag, 'pokeball'), 2);
		assert.deepEqual(confirmedInventory.transactions, []);
		assert.equal(confirmedBox.revision, 0);
		assert.equal(RPGBoxSystem.getCapacity(confirmedBox).totalUsed, 0);
		assert.equal(candidateInventory.bag.revision, 1);
		assert.equal(candidateBox.revision, 1);
		assert.equal(RPGBoxSystem.getCapacity(candidateBox).totalUsed, 1);

		const restoredInventory = RPGInventorySystem.migrate(JSON.parse(JSON.stringify(confirmedInventory)));
		const restoredBox = RPGBoxSystem.migrate(JSON.parse(JSON.stringify(confirmedBox)));
		assert.equal(restoredInventory.bag.revision, 0);
		assert.equal(restoredBox.revision, 0);
	});

	it('should reserve and consume inventory exactly once through idempotent events', () => {
		const bag = RPGBagSystem.create('player-safe', [{ itemId: 'ultraball', quantity: 2 }]);
		const inventory = RPGInventorySystem.create(bag);
		const request = {
			actionId: 'battle-1:throw-1', itemId: 'ultraball', context: 'battle',
			reason: 'capture-attempt',
		};
		const reserved = RPGInventorySystem.reserve(inventory, request, 0);
		assert.equal(reserved.replayed, false);
		assert.equal(reserved.event.type, 'reserved');
		assert.equal(reserved.event.eventId, 'battle-1:throw-1:reserved');
		assert.equal(reserved.event.ownerId, 'player-safe');
		assert.equal(reserved.inventory.bag.revision, 1);
		assert.equal(RPGBagSystem.getQuantity(reserved.inventory.bag, 'ultraball'), 2);
		assert.equal(RPGInventorySystem.getAvailableQuantity(reserved.inventory, 'ultraball'), 1);
		assert.equal(inventory.bag.revision, 0);

		const repeatedReservation = RPGInventorySystem.reserve(reserved.inventory, request, 0);
		assert.equal(repeatedReservation.replayed, true);
		assert.equal(repeatedReservation.inventory.bag.revision, 1);

		const consumed = RPGInventorySystem.commit(reserved.inventory, request.actionId, 1);
		assert.equal(consumed.event.type, 'consumed');
		assert.equal(consumed.inventory.bag.revision, 2);
		assert.equal(RPGBagSystem.getQuantity(consumed.inventory.bag, 'ultraball'), 1);
		assert.equal(RPGInventorySystem.getEvents(consumed.inventory).length, 2);

		const repeatedCommit = RPGInventorySystem.commit(consumed.inventory, request.actionId, 1);
		assert.equal(repeatedCommit.replayed, true);
		assert.equal(repeatedCommit.inventory.bag.revision, 2);
		assert.equal(RPGBagSystem.getQuantity(repeatedCommit.inventory.bag, 'ultraball'), 1);
	});

	it('should release a reservation without consuming its item', () => {
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-release', [{ itemId: 'potion', quantity: 3 }])
		);
		const reserved = RPGInventorySystem.reserve(inventory, {
			actionId: 'world:heal-cancelled', itemId: 'potion', quantity: 2,
			context: 'world', reason: 'healing',
		});
		assert.equal(RPGInventorySystem.getAvailableQuantity(reserved.inventory, 'potion'), 1);

		const released = RPGInventorySystem.release(reserved.inventory, 'world:heal-cancelled');
		assert.equal(released.event.type, 'released');
		assert.equal(RPGBagSystem.getQuantity(released.inventory.bag, 'potion'), 3);
		assert.equal(RPGInventorySystem.getAvailableQuantity(released.inventory, 'potion'), 3);
		const repeated = RPGInventorySystem.release(released.inventory, 'world:heal-cancelled', 1);
		assert.equal(repeated.replayed, true);
		assert.equal(repeated.inventory.bag.revision, 2);
		assert.throws(
			() => RPGInventorySystem.commit(released.inventory, 'world:heal-cancelled'),
			/already released/
		);
	});

	it('should prevent concurrent reservations and conflicting action identifiers', () => {
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-concurrent', [{ itemId: 'pokeball', quantity: 1 }])
		);
		const first = RPGInventorySystem.reserve(inventory, {
			actionId: 'throw-a', itemId: 'pokeball', context: 'battle', reason: 'capture-attempt',
		});
		assert.throws(() => RPGInventorySystem.reserve(first.inventory, {
			actionId: 'throw-b', itemId: 'pokeball', context: 'battle', reason: 'capture-attempt',
		}), /Not enough available/);
		assert.throws(() => RPGInventorySystem.reserve(first.inventory, {
			actionId: 'throw-a', itemId: 'pokeball', quantity: 2,
			context: 'battle', reason: 'capture-attempt',
		}), /actionId conflict/);
		assert.throws(() => RPGInventorySystem.reserve(first.inventory, {
			actionId: 'throw-c', itemId: 'pokeball', context: 'battle', reason: 'capture-attempt',
		}, 0), /revision conflict/);
		assert.equal(RPGInventorySystem.getReservedQuantity(first.inventory, 'pokeball'), 1);
	});

	it('should only allow revive items outside battle and never consume rejected uses', () => {
		assert.equal(RPGItems.require('revive').usableInBattle, false);
		assert.equal(RPGItems.require('maxrevive').usableInBattle, false);
		assert.equal(RPGItems.require('revivalherb').usableInBattle, false);
		assert.equal(RPGItems.require('sacredash').usableInBattle, false);
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('player-revive', [{ itemId: 'revive', quantity: 1 }])
		);
		const battleRequest = {
			actionId: 'battle-revive', itemId: 'revive', context: 'battle', reason: 'revive',
		};
		assert.throws(() => RPGInventorySystem.reserve(inventory, battleRequest), /cannot be used in battle/);
		assert.equal(inventory.bag.revision, 0);
		assert.equal(RPGBagSystem.getQuantity(inventory.bag, 'revive'), 1);
		assert.deepEqual(inventory.transactions, []);

		const worldRequest = { ...battleRequest, actionId: 'world-revive', context: 'world' };
		const reserved = RPGInventorySystem.reserve(inventory, worldRequest);
		const consumed = RPGInventorySystem.commit(reserved.inventory, 'world-revive');
		assert.equal(RPGBagSystem.getQuantity(consumed.inventory.bag, 'revive'), 0);
	});

	it('should enforce the outside-battle revive rule for custom items and migrate inventory events', () => {
		const registry = new RPGItemRegistry([]);
		registry.register({
			id: 'tinyrevive', name: 'Tiny Revive', category: 'revive', stackLimit: 10,
			usableInBattle: true, consumedOnUse: true, source: 'custom',
			effect: { type: 'revive', hpFraction: 0.25 },
		});
		assert.equal(registry.require('tinyrevive').usableInBattle, false);
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create(
				'player-custom', [{ itemId: 'tinyrevive', quantity: 2 }], { registry }
			),
			[],
			registry
		);
		assert.throws(() => RPGInventorySystem.reserve(inventory, {
			actionId: 'custom-battle', itemId: 'tinyrevive', context: 'battle', reason: 'revive',
		}, 0, registry), /cannot be used in battle/);

		const reserved = RPGInventorySystem.reserve(inventory, {
			actionId: 'custom-world', itemId: 'tinyrevive', context: 'world', reason: 'revive',
		}, 0, registry);
		const restored = RPGInventorySystem.migrate(
			JSON.parse(JSON.stringify(reserved.inventory)),
			registry
		);
		assert.equal(restored.version, 1);
		assert.equal(restored.transactions[0].events[0].type, 'reserved');
		assert.equal(RPGInventorySystem.getAvailableQuantity(restored, 'tinyrevive'), 1);
	});

	it('should safely consume a Potion in battle and never apply it twice on replay', () => {
		const battle = common.createBattle(rpgTeams);
		const pokemon = battle.p1.pokemon[0];
		pokemon.hp = 10;
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('healer-battle', [{ itemId: 'potion', quantity: 1 }])
		);
		const request = { actionId: 'battle:potion:1', itemId: 'potion' };
		const used = RPGItemUseSystem.useInBattle(inventory, pokemon, request);
		assert.equal(used.success, true);
		assert.equal(used.consumed, true);
		assert.equal(used.event.type, 'consumed');
		assert.equal(pokemon.hp, 30);
		assert.equal(pokemon.rpg.hp, 30);
		assert.equal(RPGBagSystem.getQuantity(used.inventory.bag, 'potion'), 0);

		const replayed = RPGItemUseSystem.useInBattle(used.inventory, pokemon, request);
		assert.equal(replayed.replayed, true);
		assert.equal(replayed.consumed, true);
		assert.equal(pokemon.hp, 30);
		assert.equal(RPGBagSystem.getQuantity(replayed.inventory.bag, 'potion'), 0);
	});

	it('should restore selected PP and cure status with Bag items in battle', () => {
		const battle = common.createBattle(rpgTeams);
		const pokemon = battle.p1.pokemon[0];
		pokemon.baseMoveSlots[0].pp = 0;
		pokemon.moveSlots[0].pp = 0;
		const inventory = RPGInventorySystem.create(RPGBagSystem.create('healer-resources', [
			{ itemId: 'ether', quantity: 1 },
			{ itemId: 'fullheal', quantity: 1 },
		]));
		const ether = RPGItemUseSystem.useInBattle(inventory, pokemon, {
			actionId: 'battle:ether:1', itemId: 'ether', move: 0,
		});
		assert.equal(ether.success, true);
		assert.equal(pokemon.baseMoveSlots[0].pp, 10);
		assert.equal(pokemon.moveSlots[0].pp, 10);
		assert.equal(pokemon.rpg.pp[0], 10);
		assert.throws(() => RPGItemUseSystem.useInBattle(ether.inventory, pokemon, {
			actionId: 'battle:ether:1', itemId: 'ether', move: 1,
		}), /actionId conflict/);

		pokemon.setStatus('brn');
		const fullHeal = RPGItemUseSystem.useInBattle(ether.inventory, pokemon, {
			actionId: 'battle:fullheal:1', itemId: 'fullheal',
		});
		assert.equal(fullHeal.success, true);
		assert.equal(pokemon.status, '');
		assert.equal(pokemon.rpg.status, '');
		assert.equal(RPGBagSystem.getQuantity(fullHeal.inventory.bag, 'fullheal'), 0);
	});

	it('should release healing items that produce no effect', () => {
		const battle = common.createBattle(rpgTeams);
		const pokemon = battle.p1.pokemon[0];
		const inventory = RPGInventorySystem.create(
			RPGBagSystem.create('healer-no-effect', [{ itemId: 'potion', quantity: 1 }])
		);
		const result = RPGItemUseSystem.useInBattle(inventory, pokemon, {
			actionId: 'battle:potion:no-effect', itemId: 'potion',
		});
		assert.equal(result.success, false);
		assert.equal(result.consumed, false);
		assert.equal(result.reason, 'no-effect');
		assert.equal(result.event.type, 'released');
		assert.equal(RPGBagSystem.getQuantity(result.inventory.bag, 'potion'), 1);
	});

	it('should heal and revive persistent Pokemon only outside battle', () => {
		const inventory = RPGInventorySystem.create(RPGBagSystem.create('world-healer', [
			{ itemId: 'fullrestore', quantity: 1 },
			{ itemId: 'revive', quantity: 1 },
		]));
		const healed = RPGItemUseSystem.useOutsideBattle(inventory, [{
			pokemonId: 'pikachu-1',
			state: { hp: 12, pp: [1], status: 'par' },
			maxHP: 100,
			maxPP: [15],
		}], { actionId: 'world:fullrestore:1', itemId: 'fullrestore' });
		assert.equal(healed.success, true);
		assert.equal(healed.targets[0].state.hp, 100);
		assert.equal(healed.targets[0].state.status, '');
		assert.deepEqual(healed.targets[0].state.pp, [1]);

		const revived = RPGItemUseSystem.useOutsideBattle(healed.inventory, [{
			pokemonId: 'squirtle-1',
			state: { hp: 0, pp: [2], status: 'slp', sleepTurns: 3 },
			maxHP: 101,
			maxPP: [25],
		}], { actionId: 'world:revive:1', itemId: 'revive' });
		assert.equal(revived.success, true);
		assert.equal(revived.targets[0].state.hp, 50);
		assert.equal(revived.targets[0].state.status, '');
		assert.equal(revived.targets[0].state.sleepTurns, undefined);
		assert.deepEqual(revived.targets[0].state.pp, [2]);
		assert.equal(RPGBagSystem.getQuantity(revived.inventory.bag, 'revive'), 0);

		const battle = common.createBattle(rpgTeams);
		const forbiddenInventory = RPGInventorySystem.create(
			RPGBagSystem.create('battle-revive-blocked', [{ itemId: 'revive', quantity: 1 }])
		);
		assert.throws(() => RPGItemUseSystem.useInBattle(forbiddenInventory, battle.p1.pokemon[0], {
			actionId: 'battle:revive:forbidden', itemId: 'revive',
		}), /cannot be used in battle/);
		assert.equal(RPGBagSystem.getQuantity(forbiddenInventory.bag, 'revive'), 1);
	});

	it('should apply Revival Herb friendship loss and Sacred Ash to all fainted party members', () => {
		const herbInventory = RPGInventorySystem.create(
			RPGBagSystem.create('world-herb', [{ itemId: 'revivalherb', quantity: 1 }])
		);
		const herb = RPGItemUseSystem.useOutsideBattle(herbInventory, [{
			pokemonId: 'eevee-herb',
			state: { hp: 0, friendship: 80 },
			maxHP: 120,
		}], { actionId: 'world:herb:1', itemId: 'revivalherb' });
		assert.equal(herb.targets[0].state.hp, 120);
		assert.equal(herb.targets[0].state.friendship, 65);

		const ashInventory = RPGInventorySystem.create(
			RPGBagSystem.create('world-ash', [{ itemId: 'sacredash', quantity: 1 }])
		);
		const ash = RPGItemUseSystem.useOutsideBattle(ashInventory, [
			{ pokemonId: 'party-1', state: { hp: 0 }, maxHP: 80 },
			{ pokemonId: 'party-2', state: { hp: 25 }, maxHP: 90 },
			{ pokemonId: 'party-3', state: { hp: 0, status: 'brn' }, maxHP: 100 },
		], { actionId: 'world:ash:1', itemId: 'sacredash' });
		assert.equal(ash.success, true);
		assert.equal(ash.targets[0].state.hp, 80);
		assert.equal(ash.targets[1].changed, false);
		assert.equal(ash.targets[1].state.hp, 25);
		assert.equal(ash.targets[2].state.hp, 100);
		assert.equal(ash.targets[2].state.status, '');
		assert.equal(RPGBagSystem.getQuantity(ash.inventory.bag, 'sacredash'), 0);
	});
	it('should calculate the fixed Generation 9 Poke Ball modifiers', () => {
		const context = { targetSpecies: 'Eevee' };
		assert.equal(RPGGen9PokeballCalculator.calculate('Poke Ball', context).ballModifier, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Great Ball', context).ballModifier, 1.5);
		assert.equal(RPGGen9PokeballCalculator.calculate('Ultra Ball', context).ballModifier, 2);
		assert.equal(RPGGen9PokeballCalculator.calculate('Safari Ball', context).ballModifier, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Sport Ball', context).ballModifier, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Master Ball').guaranteed, true);
		assert.equal(RPGGen9PokeballCalculator.listSupported().length, 28);
	});

	it('should calculate turn and level based Generation 9 Poke Balls', () => {
		assert.equal(RPGGen9PokeballCalculator.calculate('Quick Ball', {
			turnNumber: 1, targetSpecies: 'Eevee',
		}).ballModifier, 5);
		assert.equal(RPGGen9PokeballCalculator.calculate('Quick Ball', {
			turnNumber: 2, targetSpecies: 'Eevee',
		}).ballModifier, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Timer Ball', {
			turnNumber: 10, targetSpecies: 'Eevee',
		}).fixedModifier, 15157);
		assert.equal(RPGGen9PokeballCalculator.calculate('Timer Ball', {
			turnNumber: 11, targetSpecies: 'Eevee',
		}).ballModifier, 4);
		assert.equal(RPGGen9PokeballCalculator.calculate('Nest Ball', {
			targetLevel: 1, targetSpecies: 'Eevee',
		}).ballModifier, 4);
		assert.equal(RPGGen9PokeballCalculator.calculate('Nest Ball', {
			targetLevel: 29, targetSpecies: 'Eevee',
		}).fixedModifier, 4915);
		assert.equal(RPGGen9PokeballCalculator.calculate('Nest Ball', {
			targetLevel: 30, targetSpecies: 'Eevee',
		}).ballModifier, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Level Ball', {
			targetLevel: 20, userLevel: 21, targetSpecies: 'Eevee',
		}).ballModifier, 2);
		assert.equal(RPGGen9PokeballCalculator.calculate('Level Ball', {
			targetLevel: 20, userLevel: 40, targetSpecies: 'Eevee',
		}).ballModifier, 4);
		assert.equal(RPGGen9PokeballCalculator.calculate('Level Ball', {
			targetLevel: 20, userLevel: 80, targetSpecies: 'Eevee',
		}).ballModifier, 8);
	});

	it('should calculate conditional Generation 9 Poke Balls', () => {
		const cases = [
			['Net Ball', { targetTypes: ['Water'], targetSpecies: 'Squirtle' }, 3.5],
			['Dive Ball', { isInWater: true, targetSpecies: 'Eevee' }, 3.5],
			['Repeat Ball', { alreadyCaught: true, targetSpecies: 'Eevee' }, 3.5],
			['Dusk Ball', { isNight: true, targetSpecies: 'Eevee' }, 3],
			['Fast Ball', { targetBaseSpeed: 100, targetSpecies: 'Eevee' }, 4],
			['Love Ball', {
				targetSpecies: 'Eevee', userSpecies: 'Eevee', targetGender: 'F', userGender: 'M',
			}, 8],
			['Lure Ball', { isInWater: true, targetSpecies: 'Eevee' }, 4],
			['Moon Ball', { targetSpecies: 'Clefairy' }, 4],
			['Dream Ball', { targetStatus: 'slp', targetSpecies: 'Eevee' }, 4],
		];
		for (const [ball, context, modifier] of cases) {
			assert.equal(RPGGen9PokeballCalculator.calculate(ball, context).ballModifier, modifier, ball);
		}
	});

	it('should apply Heavy and Beast Ball Generation 9 rules', () => {
		assert.equal(RPGGen9PokeballCalculator.calculate('Heavy Ball', {
			catchRate: 3, targetWeightKg: 350, targetSpecies: 'Eevee',
		}).adjustedCatchRate, 33);
		assert.equal(RPGGen9PokeballCalculator.calculate('Heavy Ball', {
			catchRate: 3, targetWeightKg: 250, targetSpecies: 'Eevee',
		}).adjustedCatchRate, 23);
		assert.equal(RPGGen9PokeballCalculator.calculate('Heavy Ball', {
			catchRate: 3, targetWeightKg: 50, targetSpecies: 'Eevee',
		}).adjustedCatchRate, 1);
		assert.equal(RPGGen9PokeballCalculator.calculate('Beast Ball', {
			targetSpecies: 'Nihilego',
		}).ballModifier, 5);
		assert.equal(RPGGen9PokeballCalculator.calculate('Beast Ball', {
			targetSpecies: 'Eevee',
		}).fixedModifier, 410);
		assert.equal(RPGGen9PokeballCalculator.calculate('Ultra Ball', {
			targetSpecies: 'Nihilego',
		}).fixedModifier, 410);
	});

	it('should expose incomplete, unusable, and post-capture Poke Ball results', () => {
		const incomplete = RPGGen9PokeballCalculator.calculate('Net Ball');
		assert.equal(incomplete.complete, false);
		assert(incomplete.missingContext.includes('targetTypes'));
		assert(incomplete.missingContext.includes('isUltraBeast'));
		assert.equal(RPGGen9PokeballCalculator.calculate('Park Ball').reason, 'not-throwable');
		assert.equal(RPGGen9PokeballCalculator.calculate('RPG Ball').reason, 'unknown-ball');
		assert.deepEqual(RPGGen9PokeballCalculator.calculate('Heal Ball', {
			targetSpecies: 'Eevee',
		}).postCaptureEffects, ['heal']);
		assert.deepEqual(RPGGen9PokeballCalculator.calculate('Friend Ball', {
			targetSpecies: 'Eevee',
		}).postCaptureEffects, ['friendship-start']);
		assert.deepEqual(RPGGen9PokeballCalculator.calculate('Luxury Ball', {
			targetSpecies: 'Eevee',
		}).postCaptureEffects, ['friendship-growth']);
	});
	it('should expose Generation 9, legacy, and explicitly balanced shop prices', () => {
		assert.deepEqual(RPG_GEN9_ITEM_PRICES.pokeball, {
			currency: 'pokedollar', source: 'gen9-sv', reference: 'gen9-sv', buy: 200, sell: 50,
		});
		assert.equal(RPG_GEN9_ITEM_PRICES.revive.buy, 2000);
		assert.equal(RPG_GEN9_ITEM_PRICES.maxrevive.buy, 4000);
		assert.equal(RPG_GEN9_ITEM_PRICES.maxrevive.sell, 1000);
		assert.equal(RPG_GEN9_ITEM_PRICES.masterball, undefined);
		assert.equal(RPG_LEGACY_ITEM_PRICES.beastball.buy, 1000);
		assert.equal(RPG_LEGACY_ITEM_PRICES.premierball.reference, 'gen6-xy');
		assert.equal(RPG_BALANCED_ITEM_PRICES.masterball.buy, 1000000);
		assert.equal(RPG_BALANCED_ITEM_PRICES.sacredash.sell, 25000);

		const catalog = RPGShopSystem.createCatalog('mesagoza');
		assert.equal(catalog.offers.find(offer => offer.itemId === 'pokeball').buyPrice, 200);
		assert.equal(catalog.offers.find(offer => offer.itemId === 'maxrevive').buyPrice, 4000);
		assert.equal(catalog.offers.find(offer => offer.itemId === 'masterball').buyPrice, 1000000);
	});

	it('should buy atomically using balance, Bag capacity, and finite stock', () => {
		const bag = RPGBagSystem.create('shop-player', [], { maxSlots: 2 });
		const account = RPGShopSystem.createAccount('shop-player', 1000, bag);
		const catalog = RPGShopSystem.createCatalog('limited-shop', [
			{ itemId: 'pokeball', buyPrice: 200, sellPrice: 50, stock: 5 },
		]);
		const result = RPGShopSystem.buy(account, catalog, {
			actionId: 'shop:buy:1', itemId: 'Poke Ball', quantity: 3,
		});

		assert.equal(result.account.balance, 400);
		assert.equal(RPGBagSystem.getQuantity(result.account.bag, 'pokeball'), 3);
		assert.equal(result.catalog.offers[0].stock, 2);
		assert.equal(result.account.revision, 1);
		assert.equal(result.account.bag.revision, 1);
		assert.equal(result.catalog.revision, 1);
		assert.equal(result.transaction.total, 600);
		assert.equal(account.balance, 1000);
		assert.equal(RPGBagSystem.getQuantity(account.bag, 'pokeball'), 0);
		assert.equal(catalog.offers[0].stock, 5);
	});

	it('should sell items and return their Generation 9 value', () => {
		const bag = RPGBagSystem.create('seller', [{ itemId: 'maxrevive', quantity: 2 }]);
		const account = RPGShopSystem.createAccount('seller', 100, bag);
		const catalog = RPGShopSystem.createCatalog('medicine-shop');
		const result = RPGShopSystem.sell(account, catalog, {
			actionId: 'shop:sell:1', itemId: 'maxrevive', quantity: 1,
		});

		assert.equal(result.account.balance, 1100);
		assert.equal(RPGBagSystem.getQuantity(result.account.bag, 'maxrevive'), 1);
		assert.equal(result.transaction.unitPrice, 1000);
		assert.equal(result.catalog.offers.find(offer => offer.itemId === 'maxrevive').buyPrice, 4000);
	});

	it('should leave all shop state unchanged when funds, stock, or Bag capacity fail', () => {
		const fullBag = RPGBagSystem.create(
			'shop-failure',
			[{ itemId: 'potion', quantity: 1 }],
			{ maxSlots: 1 }
		);
		const account = RPGShopSystem.createAccount('shop-failure', 100, fullBag);
		const catalog = RPGShopSystem.createCatalog('failure-shop', [
			{ itemId: 'pokeball', buyPrice: 200, stock: 1 },
		]);
		const originalAccount = structuredClone(account);
		const originalCatalog = structuredClone(catalog);

		assert.throws(() => RPGShopSystem.buy(account, catalog, {
			actionId: 'shop:funds', itemId: 'pokeball', quantity: 1,
		}), /Not enough Pokedollars/);
		assert.deepEqual(account, originalAccount);
		assert.deepEqual(catalog, originalCatalog);

		const funded = RPGShopSystem.createAccount('shop-failure', 1000, fullBag);
		assert.throws(() => RPGShopSystem.buy(funded, catalog, {
			actionId: 'shop:bag-full', itemId: 'pokeball', quantity: 1,
		}), /no free slots/);
		assert.throws(() => RPGShopSystem.buy(funded, catalog, {
			actionId: 'shop:stock', itemId: 'pokeball', quantity: 2,
		}), /enough stock/);
		assert.equal(funded.balance, 1000);
		assert.equal(catalog.offers[0].stock, 1);
	});

	it('should replay shop actions safely and reject actionId or revision conflicts', () => {
		const account = RPGShopSystem.createAccount('shop-replay', 500, RPGBagSystem.create('shop-replay'));
		const catalog = RPGShopSystem.createCatalog('replay-shop', [
			{ itemId: 'potion', buyPrice: 200, stock: 2 },
		]);
		const first = RPGShopSystem.buy(account, catalog, {
			actionId: 'shop:replay:1', itemId: 'potion', quantity: 1,
		});
		const replay = RPGShopSystem.buy(first.account, first.catalog, {
			actionId: 'shop:replay:1', itemId: 'potion', quantity: 1,
		}, { account: 0, bag: 0, catalog: 0 });
		assert.equal(replay.replayed, true);
		assert.deepEqual(replay.account, first.account);
		assert.deepEqual(replay.catalog, first.catalog);

		assert.throws(() => RPGShopSystem.buy(first.account, first.catalog, {
			actionId: 'shop:replay:1', itemId: 'potion', quantity: 2,
		}), /different trade data/);
		assert.throws(() => RPGShopSystem.buy(first.account, first.catalog, {
			actionId: 'shop:replay:2', itemId: 'potion', quantity: 1,
		}, { account: 0, bag: 0, catalog: 0 }), /revision conflict/);
	});

	it('should price and purchase cumulative Bag tier upgrades atomically', () => {
		assert.deepEqual(RPG_BAG_TIERS.starter, {
			id: 'starter', name: 'Starter Bag', maxSlots: 10, unlockPrice: 0,
		});
		assert.equal(RPG_BAG_TIERS.legendary.maxSlots, 60);
		assert.equal(RPG_BAG_TIERS.legendary.unlockPrice, 260000);

		const account = RPGShopSystem.createAccount(
			'bag-upgrade-player',
			500000,
			RPGBagSystem.createForTier('bag-upgrade-player', 'starter')
		);
		const catalog = RPGShopSystem.createCatalog('bag-specialist');
		const trainer = RPGShopSystem.upgradeBag(account, catalog, {
			actionId: 'bag:trainer', targetTier: 'trainer',
		});
		assert.equal(trainer.account.balance, 490000);
		assert.equal(trainer.account.bag.maxSlots, 20);
		assert.equal(trainer.transaction.total, 10000);
		assert.equal(trainer.transaction.type, 'bag-upgrade');
		assert.equal(trainer.transaction.bagTier, 'trainer');

		const expert = RPGShopSystem.upgradeBag(trainer.account, trainer.catalog, {
			actionId: 'bag:expert', targetTier: 'expert',
		});
		assert.equal(expert.account.balance, 430000);
		assert.equal(expert.account.bag.maxSlots, 40);
		assert.equal(expert.transaction.total, 60000);
		assert.equal(account.balance, 500000);
		assert.equal(account.bag.maxSlots, 10);

		const replay = RPGShopSystem.upgradeBag(expert.account, expert.catalog, {
			actionId: 'bag:expert', targetTier: 'expert',
		}, { account: 0, bag: 0, catalog: 0 });
		assert.equal(replay.replayed, true);
		assert.deepEqual(replay.account, expert.account);
	});

	it('should allow custom Bag prices and reject invalid or unaffordable upgrades', () => {
		const customCatalog = RPGShopSystem.createCatalog('custom-bags', [], {
			bagUpgrades: [
				{ tier: 'trainer', unlockPrice: 50000 },
				{ tier: 'adventurer', unlockPrice: 90000 },
			],
		});
		const account = RPGShopSystem.createAccount(
			'custom-bag-player',
			100000,
			RPGBagSystem.createForTier('custom-bag-player')
		);
		const upgraded = RPGShopSystem.upgradeBag(account, customCatalog, {
			actionId: 'bag:custom-adventurer', targetTier: 'adventurer',
		});
		assert.equal(upgraded.transaction.total, 90000);
		assert.equal(upgraded.account.balance, 10000);
		assert.equal(upgraded.account.bag.maxSlots, 30);

		const poor = RPGShopSystem.createAccount(
			'poor-bag-player',
			1000,
			RPGBagSystem.createForTier('poor-bag-player')
		);
		const defaultCatalog = RPGShopSystem.createCatalog('default-bags');
		assert.throws(() => RPGShopSystem.upgradeBag(poor, defaultCatalog, {
			actionId: 'bag:too-expensive', targetTier: 'trainer',
		}), /Not enough Pokedollars/);
		assert.equal(poor.balance, 1000);
		assert.equal(poor.bag.maxSlots, 10);

		assert.throws(() => RPGShopSystem.upgradeBag(upgraded.account, upgraded.catalog, {
			actionId: 'bag:downgrade', targetTier: 'trainer',
		}), /must increase capacity/);
		const customBag = RPGBagSystem.create('custom-capacity', [], { maxSlots: 12 });
		const customAccount = RPGShopSystem.createAccount('custom-capacity', 100000, customBag);
		assert.throws(() => RPGShopSystem.upgradeBag(customAccount, defaultCatalog, {
			actionId: 'bag:unknown-tier', targetTier: 'trainer',
		}), /must use a priced tier/);
	});

	it('should validate serialized shop account and catalog state', () => {
		const account = RPGShopSystem.createAccount(
			'shop-persisted',
			2500,
			RPGBagSystem.create('shop-persisted', [{ itemId: 'potion', quantity: 2 }])
		);
		const catalog = RPGShopSystem.createCatalog('persisted-shop', [
			{ itemId: 'potion', buyPrice: 200, sellPrice: 50, stock: 10 },
		]);
		assert.deepEqual(RPGShopSystem.migrateAccount(JSON.parse(JSON.stringify(account))), account);
		assert.deepEqual(RPGShopSystem.migrateCatalog(JSON.parse(JSON.stringify(catalog))), catalog);
		const versionOneAccount = { ...account, version: 1 };
		assert.equal(RPGShopSystem.migrateAccount(versionOneAccount).version, 2);
		const versionOneCatalog = { ...catalog, version: 1 };
		delete versionOneCatalog.bagUpgrades;
		const migratedCatalog = RPGShopSystem.migrateCatalog(versionOneCatalog);
		assert.equal(migratedCatalog.version, 2);
		assert.deepEqual(migratedCatalog.bagUpgrades, []);
		assert.throws(() => RPGShopSystem.migrateAccount({ ...account, balance: -1 }), /balance/);
		assert.throws(() => RPGShopSystem.migrateCatalog({
			...catalog,
			offers: [...catalog.offers, catalog.offers[0]],
		}), /duplicated/);
	});
	it('should classify RPG tournament players, generic NPCs, and special NPCs', () => {
		const player = RPGTournamentSystem.normalizeParticipant({
			id: 'Player One', name: 'Player One', type: 'player',
		});
		const generic = RPGTournamentSystem.normalizeParticipant({
			id: 'Youngster Joey', name: 'Youngster Joey', type: 'npc', npcClass: 'generic',
		});
		const special = RPGTournamentSystem.normalizeParticipant({
			id: 'Champion Cynthia', name: 'Champion Cynthia', type: 'npc', npcClass: 'special',
		});
		assert.equal(player.id, 'playerone');
		assert.equal(generic.npcClass, 'generic');
		assert.equal(special.npcClass, 'special');
		assert.equal(RPGTournamentSystem.isAutomaticMatch(generic, special), true);
		assert.equal(RPGTournamentSystem.isAutomaticMatch(player, special), false);
		assert.throws(() => RPGTournamentSystem.normalizeParticipant({
			id: 'broken', name: 'Broken', type: 'npc',
		}), /requires generic or special/);
	});

	it('should always make a special NPC defeat a generic NPC', () => {
		const generic = { id: 'generic', name: 'Generic', type: 'npc', npcClass: 'generic' };
		const special = { id: 'special', name: 'Special', type: 'npc', npcClass: 'special' };
		let randomCalled = false;
		const result1 = RPGTournamentSystem.resolveNPCMatch('match:1', generic, special, () => {
			randomCalled = true;
			return 0;
		});
		const result2 = RPGTournamentSystem.resolveNPCMatch('match:2', special, generic, () => {
			randomCalled = true;
			return 0.99;
		});
		assert.equal(result1.winnerId, 'special');
		assert.equal(result2.winnerId, 'special');
		assert.equal(result1.resolution, 'special-priority');
		assert.equal(randomCalled, false);
	});

	it('should randomly resolve NPCs of the same class and expose a structured result', () => {
		const npc1 = { id: 'npc-1', name: 'NPC 1', type: 'npc', npcClass: 'generic' };
		const npc2 = { id: 'npc-2', name: 'NPC 2', type: 'npc', npcClass: 'generic' };
		assert.deepEqual(RPGTournamentSystem.resolveNPCMatch('round:1', npc1, npc2, () => 0.1), {
			version: 1,
			matchId: 'round:1',
			automatic: true,
			participant1Id: 'npc1',
			participant2Id: 'npc2',
			winnerId: 'npc1',
			loserId: 'npc2',
			resolution: 'random',
		});
		assert.equal(RPGTournamentSystem.resolveNPCMatch(
			'round:2', npc1, npc2, () => 0.9
		).winnerId, 'npc2');
		assert.throws(() => RPGTournamentSystem.resolveNPCMatch(
			'round:bad-rng', npc1, npc2, () => 1
		), /between 0 and 1/);
		assert.throws(() => RPGTournamentSystem.chooseNPCWinner(
			{ id: 'player', name: 'Player', type: 'player' },
			npc1
		), /requires two NPCs/);
	});
});
