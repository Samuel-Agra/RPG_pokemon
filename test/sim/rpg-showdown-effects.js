'use strict';

const assert = require('../assert');
const common = require('../common');

function set(species, moves, ability, level = 100) {
	return { species, moves, ability, level, nature: 'Serious', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, rpg: {} };
}

function battleWith(p1, p2, rpg = {}) {
	return common.createBattle({ rpg }, [p1, p2]);
}

function damageAfter(move, rpg = {}, target = 'Blissey') {
	const battle = battleWith(
		[set('Mew', [move], 'Synchronize')],
		[set(target, ['Splash'], target === 'Snom' ? 'Shield Dust' : 'Natural Cure')],
		rpg
	);
	const pokemon = battle.p2.active[0];
	const initialHP = pokemon.hp;
	battle.makeChoices(`move ${move}`, 'move splash');
	return initialHP - pokemon.hp;
}

describe('RPG battle mechanic effects', () => {
	it('keeps prepared permanent weather and terrain active beyond their normal five turns', () => {
		const battle = battleWith(
			[set('Blissey', ['Splash'], 'Natural Cure')],
			[set('Blissey', ['Splash'], 'Natural Cure')],
			{ weather: 'raindance', terrain: 'grassyterrain' }
		);
		assert.equal(battle.field.weatherState.duration, 0);
		assert.equal(battle.field.terrainState.duration, 0);
		for (let turn = 0; turn < 8; turn++) battle.makeChoices();
		assert.equal(battle.field.weather, 'raindance');
		assert.equal(battle.field.terrain, 'grassyterrain');
	});

	it('applies temporary weather duration and the effects of rain, sun, sand and snow', () => {
		const rain = damageAfter('Surf', { weather: 'raindance', weatherDuration: 3 });
		const clearWater = damageAfter('Surf');
		assert(rain > clearWater, `expected rain damage ${rain} to exceed clear damage ${clearWater}`);

		const sun = battleWith(
			[set('Charizard', ['Solar Beam'], 'Blaze', 50)],
			[set('Blissey', ['Splash'], 'Natural Cure')],
			{ weather: 'sunnyday', weatherDuration: 3 }
		);
		const sunTarget = sun.p2.active[0];
		const sunHP = sunTarget.hp;
		sun.makeChoices('move solarbeam', 'move splash');
		assert(sunTarget.hp < sunHP);
		assert(!sun.p1.active[0].volatiles['twoturnmove']);

		const sand = battleWith(
			[set('Blissey', ['Splash'], 'Natural Cure')],
			[set('Blissey', ['Splash'], 'Natural Cure')],
			{ weather: 'sandstorm', weatherDuration: 3 }
		);
		sand.makeChoices();
		assert(sand.p1.active[0].hp < sand.p1.active[0].maxhp);
		assert(sand.p2.active[0].hp < sand.p2.active[0].maxhp);

		const snowDamage = damageAfter('Tackle', { weather: 'snow', weatherDuration: 3 }, 'Snom');
		const clearIceDamage = damageAfter('Tackle', {}, 'Snom');
		assert(snowDamage < clearIceDamage, `expected snow damage ${snowDamage} below ${clearIceDamage}`);
	});

	it('applies all four terrain rule families', () => {
		const electric = battleWith(
			[set('Smeargle', ['Spore'], 'Own Tempo')],
			[set('Eevee', ['Splash'], 'Run Away')],
			{ terrain: 'electricterrain', terrainDuration: 3 }
		);
		electric.makeChoices('move spore', 'move splash');
		assert.equal(electric.p2.active[0].status, '');

		const misty = battleWith(
			[set('Muk', ['Toxic'], 'Sticky Hold')],
			[set('Eevee', ['Splash'], 'Run Away')],
			{ terrain: 'mistyterrain', terrainDuration: 3 }
		);
		misty.makeChoices('move toxic', 'move splash');
		assert.equal(misty.p2.active[0].status, '');

		const psychic = battleWith(
			[set('Eevee', ['Quick Attack'], 'Run Away')],
			[set('Eevee', ['Splash'], 'Run Away')],
			{ terrain: 'psychicterrain', terrainDuration: 3 }
		);
		const psychicTarget = psychic.p2.active[0];
		const psychicHP = psychicTarget.hp;
		psychic.makeChoices('move quickattack', 'move splash');
		assert.equal(psychicTarget.hp, psychicHP);

		const grassy = battleWith(
			[set('Blissey', ['Splash'], 'Natural Cure')],
			[set('Jolteon', ['Super Fang'], 'Volt Absorb')],
			{ terrain: 'grassyterrain', terrainDuration: 3 }
		);
		const grassyTarget = grassy.p1.active[0];
		grassy.makeChoices('move splash', 'move superfang');
		assert(grassyTarget.hp > grassyTarget.maxhp / 2 && grassyTarget.hp < grassyTarget.maxhp);
	});

	it('changes every battle boost group and uses boosts in actual damage', () => {
		const battle = battleWith(
			[set('Mew', ['Shell Smash', 'Coil', 'Tackle'], 'Synchronize')],
			[set('Blissey', ['Noble Roar', 'Sweet Scent', 'Splash'], 'Natural Cure')]
		);
		battle.makeChoices('move shellsmash', 'move nobleroar');
		assert.deepEqual(
			{ ...battle.p1.active[0].boosts },
			{ atk: 1, def: -1, spa: 1, spd: -1, spe: 2, accuracy: 0, evasion: 0 }
		);
		battle.makeChoices('move coil', 'move sweetscent');
		assert.equal(battle.p1.active[0].boosts.atk, 2);
		assert.equal(battle.p1.active[0].boosts.def, 0);
		assert.equal(battle.p1.active[0].boosts.accuracy, 1);
		assert.equal(battle.p1.active[0].boosts.evasion, -2);

		const boostedTarget = battle.p2.active[0];
		const boostedHP = boostedTarget.hp;
		battle.makeChoices('move tackle', 'move splash');
		const boostedDamage = boostedHP - boostedTarget.hp;
		const normalDamage = damageAfter('Tackle');
		assert(boostedDamage > normalDamage, `expected boosted damage ${boostedDamage} above ${normalDamage}`);
	});

	it('applies primary status, confusion, substitute and disabling effects', () => {
		const cases = [
			['Toxic', 'Muk', 'Sticky Hold', 'tox'],
			['Glare', 'Arbok', 'Shed Skin', 'par'],
			['Spore', 'Smeargle', 'Own Tempo', 'slp'],
		];
		for (const [move, species, ability, expected] of cases) {
			const battle = battleWith(
				[set(species, [move], ability)],
				[set('Blissey', ['Splash'], 'Natural Cure')]
			);
			battle.makeChoices(`move ${move}`, 'move splash');
			assert.equal(battle.p2.active[0].status, expected, move);
		}

		const burn = battleWith(
			[set('Torkoal', ['Burning Jealousy'], 'White Smoke')],
			[set('Jolteon', ['Swords Dance'], 'Volt Absorb')]
		);
		burn.makeChoices('move burningjealousy', 'move swordsdance');
		assert.equal(burn.p2.active[0].status, 'brn');

		const confusion = battleWith(
			[set('Mew', ['Confuse Ray'], 'Synchronize')],
			[set('Blissey', ['Splash'], 'Natural Cure')]
		);
		confusion.makeChoices('move confuseray', 'move splash');
		assert(confusion.p2.active[0].volatiles['confusion']);

		const volatile = battleWith(
			[set('Mew', ['Splash', 'Taunt'], 'Synchronize')],
			[set('Blissey', ['Substitute', 'Splash'], 'Natural Cure')]
		);
		volatile.makeChoices('move splash', 'move substitute');
		assert(volatile.p2.active[0].volatiles['substitute']);
		volatile.makeChoices('move taunt', 'move splash');
		assert(volatile.p2.active[0].volatiles['taunt']);
		assert(volatile.p2.active[0].moveSlots.find(move => move.id === 'substitute').disabled);
	});

	it('applies rooms, screens and side-wide speed effects', () => {
		const battle = battleWith(
			[set('Mew', ['Trick Room', 'Reflect', 'Psychic', 'Splash'], 'Synchronize')],
			[set('Blissey', ['Light Screen', 'Tailwind', 'Splash'], 'Natural Cure')]
		);
		battle.makeChoices('move trickroom', 'move lightscreen');
		assert(battle.field.pseudoWeather['trickroom']);
		assert(battle.p2.sideConditions['lightscreen']);
		battle.makeChoices('move reflect', 'move tailwind');
		assert(battle.p1.sideConditions['reflect']);
		assert(battle.p2.sideConditions['tailwind']);
		const target = battle.p2.active[0];
		const initialHP = target.hp;
		battle.makeChoices('move psychic', 'move splash');
		const screenedDamage = initialHP - target.hp;
		const normalDamage = damageAfter('Psychic');
		assert(screenedDamage < normalDamage, `expected screened damage ${screenedDamage} below ${normalDamage}`);
	});
	it('sets and applies entry hazards, then permits their native removal', () => {
		const battle = battleWith(
			[set('Mew', ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web'], 'Synchronize')],
			[
				set('Blissey', ['Splash'], 'Natural Cure'),
				set('Volcarona', ['Defog'], 'Flame Body'),
			]
		);
		battle.makeChoices('move stealthrock', 'move splash');
		battle.makeChoices('move spikes', 'move splash');
		battle.makeChoices('move toxicspikes', 'move splash');
		battle.makeChoices('move stickyweb', 'move splash');
		for (const id of ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']) {
			assert(battle.p2.sideConditions[id], id);
		}
		battle.makeChoices('move stealthrock', 'switch 2');
		assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp * 0.76, JSON.stringify({
			species: battle.p2.active[0].species.name, hp: battle.p2.active[0].hp, maxhp: battle.p2.active[0].maxhp,
			status: battle.p2.active[0].status, boosts: battle.p2.active[0].boosts, log: battle.log.slice(-20),
		}));
		assert.equal(battle.p2.active[0].status, 'psn');
		assert.equal(battle.p2.active[0].boosts.spe, -1);
		battle.makeChoices('move stealthrock', 'move defog');
		for (const id of ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']) {
			assert(!battle.p2.sideConditions[id], id);
		}
	});

	it('enforces trapping and residual seed effects', () => {
		const battle = battleWith(
			[set('Mew', ['Mean Look', 'Leech Seed', 'Splash'], 'Synchronize')],
			[
				set('Blissey', ['Splash'], 'Natural Cure'),
				set('Eevee', ['Splash'], 'Run Away'),
			]
		);
		battle.makeChoices('move meanlook', 'move splash');
		assert(battle.p2.active[0].volatiles['trapped']);
		assert.throws(() => battle.choose('p2', 'switch 2'), /trapped/);
		battle.makeChoices('move leechseed', 'move splash');
		assert(battle.p2.active[0].volatiles['leechseed']);
		assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp);
	});

	it('handles protection, recoil, draining, multi-hit and recharge move families', () => {
		const protectedBattle = battleWith(
			[set('Tauros', ['Double-Edge'], 'Intimidate')],
			[set('Blissey', ['Protect'], 'Natural Cure')]
		);
		const attacker = protectedBattle.p1.active[0];
		const defender = protectedBattle.p2.active[0];
		protectedBattle.makeChoices('move doubleedge', 'move protect');
		assert.equal(attacker.hp, attacker.maxhp);
		assert.equal(defender.hp, defender.maxhp);

		const recoil = battleWith(
			[set('Tauros', ['Double-Edge'], 'Intimidate')],
			[set('Blissey', ['Splash'], 'Natural Cure')]
		);
		recoil.makeChoices('move doubleedge', 'move splash');
		assert(recoil.p1.active[0].hp < recoil.p1.active[0].maxhp);
		assert(recoil.p2.active[0].hp < recoil.p2.active[0].maxhp);

		const drain = battleWith(
			[set('Snorlax', ['Drain Punch'], 'Thick Fat')],
			[set('Jolteon', ['Super Fang'], 'Volt Absorb')]
		);
		drain.makeChoices('move drainpunch', 'move superfang');
		assert(drain.p1.active[0].hp > drain.p1.active[0].maxhp / 2);

		const multi = battleWith(
			[set('Breloom', ['Bullet Seed'], 'Effect Spore')],
			[set('Blissey', ['Splash'], 'Natural Cure')]
		);
		const beforeLines = multi.log.length;
		multi.makeChoices('move bulletseed', 'move splash');
		assert(multi.log.slice(beforeLines).filter(line => line.startsWith('|-damage|p2a:')).length >= 2);

		const recharge = battleWith(
			[set('Charizard', ['Hyper Beam'], 'Blaze', 50)],
			[set('Blissey', ['Splash'], 'Natural Cure')]
		);
		recharge.makeChoices('move hyperbeam', 'move splash');
		assert.equal(recharge.p1.active[0].getLockedMove(), 'recharge');
		recharge.makeChoices();
		assert.equal(recharge.p1.active[0].getLockedMove(), null);
	});
});