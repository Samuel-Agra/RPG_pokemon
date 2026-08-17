'use strict';

const assert = require('assert').strict;
const { RPGLoginService } = require('../../dist/server/rpg-showdown');

describe('RPG player battle selection', () => {
	it('requires an allowed, valid selection before accepting', () => {
		let byte = 0;
		let randomState = 0x12345678;
		const login = new RPGLoginService({
			masterCode: '14081998',
			random: () => {
				randomState = (1664525 * randomState + 1013904223) >>> 0;
				return randomState / 0x100000000;
			},
			randomBytes: size => Buffer.alloc(size, ++byte),
		});
		const create = (name, password) => login.createCharacter({
			characterName: name, playerName: name, avatar: 'lucas', password, initialMoney: 3000,
			starter: { species: 'Squirtle', gender: 'M' },
		});
		const samuel = create('Samuel', 'senha-samuel');
		const marina = create('Marina', 'senha-marina');
		const master = login.loginMaster('14081998');
		const player = login.loginPlayer(samuel.id, 'senha-samuel');
		let battle = login.createBattleSession(master.token);
		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'singles', opponentType: 'player',
			participants: [
				{
					id: 'samuel', team: 'A', kind: 'player', characterId: samuel.id,
					displayName: 'Samuel', selectionLimit: 1, pokemon: [],
				},
				{
					id: 'marina', team: 'B', kind: 'player', characterId: marina.id,
					displayName: 'Marina', selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
				},
			],
			rules: { playersChoosePokemon: true },
		});
		battle = login.inviteBattleSession(master.token, battle.id);
		assert.throws(
			() => login.respondToBattleInvitation(player.token, battle.id, 'accepted'),
			/must select Pokemon/
		);
		battle = login.selectBattleSessionPokemon(player.token, battle.id, [{ teamIndex: 0 }]);
		assert.deepEqual(battle.participants[0].pokemon, [{ teamIndex: 0 }]);
		battle = login.respondToBattleInvitation(player.token, battle.id, 'accepted');
		assert.equal(battle.invitations.find(item => item.characterId === samuel.id).response, 'accepted');
	});

	it('rejects a Pokemon that is unavailable during EV training', () => {
		let byte = 20;
		const login = new RPGLoginService({
			masterCode: '14081998', random: () => 0.5,
			randomBytes: size => Buffer.alloc(size, ++byte),
		});
		const samuel = login.createCharacter({
			characterName: 'Samuel', playerName: 'Samuel', avatar: 'lucas', password: 'senha',
			initialMoney: 3000, starter: { species: 'Squirtle', gender: 'M' },
		});
		const marina = login.createCharacter({
			characterName: 'Marina', playerName: 'Marina', avatar: 'lucas', password: 'senha',
			initialMoney: 3000, starter: { species: 'Bulbasaur', gender: 'F' },
		});
		const record = login.repository.get(samuel.id);
		record.state.box.party[0].metadata.evTraining = { remainingMs: 30 * 60 * 1000 };
		login.repository.set(record);
		const master = login.loginMaster('14081998');
		const player = login.loginPlayer(samuel.id, 'senha');
		let battle = login.createBattleSession(master.token);
		battle = login.updateBattleSession(master.token, battle.id, {
			format: 'singles', opponentType: 'player',
			participants: [
				{ id: 'samuel', team: 'A', kind: 'player', characterId: samuel.id,
					displayName: 'Samuel', selectionLimit: 1, pokemon: [] },
				{ id: 'marina', team: 'B', kind: 'player', characterId: marina.id,
					displayName: 'Marina', selectionLimit: 1, pokemon: [{ teamIndex: 0 }] },
			],
		});
		battle = login.inviteBattleSession(master.token, battle.id);
		assert.throws(() => login.selectBattleSessionPokemon(
			player.token, battle.id, [{ teamIndex: 0 }]
		), /est.* em treinamento/);
	});
});
