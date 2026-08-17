'use strict';

const assert = require('assert').strict;
const { RPGLoginService, getRPGBattlePokemonCatalog } = require('../../dist/server/rpg-showdown');

function makeService() {
	let byte = 0;
	let randomState = 0x12345678;
	return new RPGLoginService({
		masterCode: '14081998',
		random: () => {
			randomState = (1664525 * randomState + 1013904223) >>> 0;
			return randomState / 0x100000000;
		},
		randomBytes: size => Buffer.alloc(size, ++byte),
	});
}

function set(species, level) {
	return {
		name: species, species, level, item: '', ability: '', moves: ['tackle'], nature: 'Hardy', gender: 'N',
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
	};
}

function player(login) {
	return login.createCharacter({
		characterName: 'Samuel', playerName: 'Samuel', avatar: 'lucas', password: 'senha', initialMoney: 3000,
		starter: { species: 'Squirtle', gender: 'M' },
	});
}

function baseParticipants(character, controlled) {
	return [
		{
			id: 'samuel', team: 'A', kind: 'player', characterId: character.id,
			displayName: 'Samuel', selectionLimit: 6, pokemon: [{ teamIndex: 0 }],
		},
		controlled,
	];
}

describe('RPG battle format preparation rules', () => {
	it('builds the wild and Boss species catalog from Showdown data', () => {
		const catalog = getRPGBattlePokemonCatalog();
		assert.equal(catalog.some(entry => entry.id === 'chromera'), false);
		assert.equal(catalog.find(entry => entry.id === 'mewtwo').bossEligible, true);
		assert.equal(catalog.find(entry => entry.id === 'dragonite').pseudoLegendary, true);
		for (const id of ['goodra', 'goodrahisui', 'garchomp', 'hydreigon', 'dragapult', 'archaludon']) {
			const entry = catalog.find(candidate => candidate.id === id);
			assert.equal(entry.pseudoLegendary, true, id + ' remains classified as pseudo-legendary');
			assert.equal(entry.bossEligible, false, id + ' is excluded from Boss');
			assert.equal(entry.regularWildEligible, true, id + ' remains available as a regular wild Pokemon');
		}
		assert.equal(catalog.find(entry => entry.id === 'squirtle').bossEligible, false);
		assert.equal(catalog.some(entry => entry.id === 'typenull' && entry.bossEligible), false);
		assert.equal(catalog.find(entry => entry.id === 'typenull').legendary, true);
		assert.equal(catalog.find(entry => entry.id === 'mewtwo').regularWildEligible, false);
		assert.equal(catalog.find(entry => entry.id === 'arceus').regularWildEligible, false);
		assert.equal(catalog.find(entry => entry.id === 'darkrai').regularWildEligible, false);
		assert.equal(catalog.find(entry => entry.id === 'arceus').bossEligible, true);
		assert.equal(catalog.find(entry => entry.id === 'meltan').bossEligible, false);
		assert.equal(catalog.find(entry => entry.id === 'dragonite').regularWildEligible, true);
		assert.equal(catalog.find(entry => entry.id === 'squirtle').regularWildEligible, true);
		assert.equal(catalog.filter(entry => entry.regularWildEligible).length > 180, true);
		assert.equal(catalog.find(entry => entry.id === 'urshifurapidstrike').spriteId, 'urshifu-rapidstrike');
		assert.equal(catalog.some(entry => entry.id.endsWith('gmax')), false);
		assert.equal(catalog.some(entry => entry.id.startsWith('vivillon') && entry.id !== 'vivillon'), false);
		assert.equal(catalog.some(entry => entry.id.startsWith('pikachu') && entry.id !== 'pikachu'), false);
		assert.equal(catalog.filter(entry => entry.id.startsWith('arceus')).length, 1);
		assert.equal(catalog.some(entry => entry.id === 'alcremierubycream'), false);
		assert.equal(catalog.some(entry => entry.id === 'rotomwash'), true);
	});

	it('requires one eligible wild Pokemon for Boss and permits level 999', () => {
		const login = makeService();
		const character = player(login);
		const master = login.loginMaster('14081998');
		let battle = login.createBattleSession(master.token);
		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'boss', opponentType: 'wild',
			participants: baseParticipants(character, {
				id: 'boss', team: 'B', kind: 'wild', displayName: 'Boss selvagem',
				selectionLimit: 1, pokemon: [{ set: set('Dragonite', 999) }],
			}),
		});
		assert.equal(login.inviteBattleSession(master.token, battle.id).status, 'inviting');

		battle = login.updateBattleSession(master.token, battle.id, {
			participants: baseParticipants(character, {
				id: 'boss', team: 'B', kind: 'wild', displayName: 'Boss selvagem',
				selectionLimit: 1, pokemon: [{ set: set('Squirtle', 100) }],
			}),
		});
		assert.throws(() => login.inviteBattleSession(master.token, battle.id), /eligible legendary or pseudo-legendary/);

		battle = login.updateBattleSession(master.token, battle.id, {
			participants: baseParticipants(character, {
				id: 'boss', team: 'B', kind: 'wild', displayName: 'Boss selvagem',
				selectionLimit: 1, pokemon: [{ set: set('Garchomp', 100) }],
			}),
		});
		assert.throws(() => login.inviteBattleSession(master.token, battle.id), /eligible legendary or pseudo-legendary/);
	});

	it('matches simultaneous wild slots and supports a 24-member horde queue', () => {
		const login = makeService();
		const character = player(login);
		const master = login.loginMaster('14081998');
		let battle = login.createBattleSession(master.token);
		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'doubles', opponentType: 'wild',
			participants: baseParticipants(character, {
				id: 'wild', team: 'B', kind: 'wild', displayName: 'Pokémon selvagem',
				selectionLimit: 1, pokemon: [{ set: set('Pidgey', 5) }],
			}),
		});
		assert.throws(() => login.inviteBattleSession(master.token, battle.id), /count does not match/);

		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'singles', opponentType: 'wild',
			participants: baseParticipants(character, {
				id: 'wild', team: 'B', kind: 'wild', displayName: 'Pokémon selvagem',
				selectionLimit: 1, pokemon: [{ set: set('Mewtwo', 70) }],
			}),
		});
		assert.throws(() => login.inviteBattleSession(master.token, battle.id), /do not accept legendary/);

		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'triples', opponentType: 'horde',
			participants: baseParticipants(character, {
				id: 'horde', team: 'B', kind: 'horde', displayName: 'Horda selvagem',
				selectionLimit: 24, pokemon: Array.from({ length: 24 }, () => ({ set: set('Pidgey', 5) })),
			}),
		});
		assert.equal(login.inviteBattleSession(master.token, battle.id).status, 'inviting');
	});
});
