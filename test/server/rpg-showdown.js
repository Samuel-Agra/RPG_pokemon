'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	createRPGLoginServiceFromConfig,
	RPGLoginService,
	RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');

function createService(options = {}) {
	let byte = 0;
	let randomState = 0x12345678;
	return new RPGLoginService({
		masterCode: '14081998',
		random: () => {
			randomState = (1664525 * randomState + 1013904223) >>> 0;
			return randomState / 0x100000000;
		},
		randomBytes: size => Buffer.alloc(size, ++byte),
		...options,
	});
}

function createCharacter(service, overrides = {}) {
	return service.createCharacter({
		characterName: 'Samuel',
		playerName: 'Samuel real',
		avatar: 'lucas',
		password: 'senha-rpg',
		initialMoney: 3000,
		starter: {
			species: 'Squirtle',
			nickname: 'Tarta',
			gender: 'M',
		},
		...overrides,
	});
}

describe('RPG login', () => {
	it('keeps RPG character credentials independent from Showdown accounts', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = createService({ repository });
		const selection = createCharacter(service);
		const stored = repository.get(selection.id);

		assert.deepEqual(selection, {
			id: 'samuel',
			characterName: 'Samuel',
			playerName: 'Samuel real',
			avatar: 'lucas',
		});
		assert(stored);
		assert.equal(stored.credential.algorithm, 'scrypt');
		assert.notEqual(stored.credential.hash, 'senha-rpg');
		assert(!JSON.stringify(stored).includes('senha-rpg'));
		assert.deepEqual(service.listSelectableCharacters(), [selection]);
		assert.equal(service.listSelectableCharacters()[0].money, undefined);
	});

	it('persists the permanent Teste account and its Mega Charizard between service restarts', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-characters-'));
		const file = path.join(directory, 'characters.json');
		try {
			const first = createRPGLoginServiceFromConfig({
				rpgmastercode: '14081998',
				rpgcharacterfile: file,
			});
			const player = first.loginPlayer('teste', '1234');
			let state = first.getCharacter(player.token);
			assert.deepEqual(state.team.map(pokemon => pokemon.species), ['Charizard', 'Ralts', 'Haunter', 'Bulbasaur']);
			assert.deepEqual(state.team.map(pokemon => pokemon.level), [50, 15, 25, 15]);
			assert.equal(state.team[0].item, 'charizarditey');
			assert.equal(state.team[2].item, '');
			assert(state.team[2].moves.includes('toxic'));
			assert.deepEqual(state.team[1].moves, ['raindance', 'psychicterrain', 'spikes', 'reflect']);
			assert.deepEqual(state.team[2].moves, ['shadowpunch', 'toxic', 'hex', 'trickroom']);
			const storedSpecies = [
				...state.box.party,
				...state.box.boxes.flatMap(box => box.slots).filter(Boolean),
			].map(entry => entry.pokemon.species);
			assert(storedSpecies.includes('Eevee'));
			const showcaseBag = first.getBag(player.token);
			for (const category of showcaseBag.categories.filter(entry => entry.id !== 'mission-items')) {
				assert(category.itemTypes > 0, 'Expected test Bag category ' + category.id + ' to contain an item');
			}
			assert(showcaseBag.items.some(item => item.id === 'thunderstone'));
			assert.equal(showcaseBag.categories.at(-1).id, 'mission-items');
			const secondPlayer = first.loginPlayer('teste2', '4321');
			const secondState = first.getCharacter(secondPlayer.token);
			assert.deepEqual(secondState.team.map(pokemon => pokemon.species), ['Charmander', 'Charmeleon', 'Charizard']);
			assert.deepEqual(secondState.team.map(pokemon => pokemon.level), [50, 50, 50]);
			assert.deepEqual(secondState.team[0].moves, ['sunnyday', 'grassyterrain', 'stealthrock', 'tailwind']);

			const master = first.loginMaster('14081998');
			const changed = structuredClone(state.team);
			changed[0].name = 'Charizard Persistente';
			for (const field of ['level', 'item', 'evs', 'rpg']) {
				const value = structuredClone(changed[0][field]);
				changed[0][field] = structuredClone(changed[1][field]);
				changed[1][field] = value;
			}
			first.replaceCharacterTeam(master.token, 'teste', changed);
			const orphaned = first.repository.get('teste');
			orphaned.state.box.placements.push({
				placementId: 'orphaned-capture', pokemonId: 'teste:missing-capture',
				location: { destination: 'party', position: 5 }, revision: orphaned.state.box.revision,
			});
			first.repository.set(orphaned);

			const restarted = createRPGLoginServiceFromConfig({
				rpgmastercode: '14081998',
				rpgcharacterfile: file,
			});
			const restartedPlayer = restarted.loginPlayer('teste', '1234');
			state = restarted.getCharacter(restartedPlayer.token);
			assert.equal(state.team[0].name, 'Charizard Persistente');
			assert.deepEqual(state.team.map(pokemon => pokemon.level), [50, 15, 25, 15]);
			assert.equal(state.team[0].item, 'charizarditey');
			assert.equal(state.team[1].item, '');
			assert.deepEqual(state.team[1].moves, ['raindance', 'psychicterrain', 'spikes', 'reflect']);
			assert.deepEqual(state.team[2].moves, ['shadowpunch', 'toxic', 'hex', 'trickroom']);
			const restartedStoredSpecies = [
				...state.box.party,
				...state.box.boxes.flatMap(box => box.slots).filter(Boolean),
			].map(entry => entry.pokemon.species);
			assert(restartedStoredSpecies.includes('Eevee'));
			const restartedBag = restarted.getBag(restartedPlayer.token);
			for (const category of restartedBag.categories.filter(entry => entry.id !== 'mission-items')) {
				assert(category.itemTypes > 0, 'Expected persisted test Bag category ' + category.id + ' to contain an item');
			}
			assert(restartedBag.items.some(item => item.id === 'thunderstone'));
			assert.equal(restartedBag.categories.at(-1).id, 'mission-items');
			assert.equal(state.box.placements.some(entry => entry.placementId === 'orphaned-capture'), false);
			const restartedSecondPlayer = restarted.loginPlayer('teste2', '4321');
			const restartedSecondState = restarted.getCharacter(restartedSecondPlayer.token);
			assert.deepEqual(restartedSecondState.team[0].moves, ['sunnyday', 'grassyterrain', 'stealthrock', 'tailwind']);
			assert(!fs.readFileSync(file, 'utf8').includes('"password"'));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
	it('creates a Generation 9 starter and the initial RPG storage', () => {
		const service = createService();
		const selection = createCharacter(service);
		const session = service.loginPlayer(selection.id, 'senha-rpg');
		const state = service.getCharacter(session.token);
		const starter = state.team[0];

		assert.equal(starter.species, 'Squirtle');
		assert.equal(starter.name, 'Tarta');
		assert.equal(starter.level, 5);
		assert.equal(starter.gender, 'M');
		assert.equal(starter.rpg.captureBall, 'pokeball');
		assert(starter.moves.length > 0 && starter.moves.length <= 4);
		assert(starter.moves.includes('tackle'));
		assert.equal(Object.values(starter.evs).reduce((sum, value) => sum + value, 0), 508);
		for (const value of Object.values(starter.evs)) {
			assert(value <= 252);
			assert.equal(value % 4, 0);
		}
		for (const value of Object.values(starter.ivs)) assert.equal(value, 16);
		assert.equal(state.money, 3000);
		assert.deepEqual(state.bank, {version: 1, balance: 0, revision: 0});
		assert.equal(state.box.party.length, 1);
		assert.equal(state.box.tier, 'small');
		assert.equal(state.box.boxes.length, 1);
		assert.equal(state.inventory.bag.maxSlots, 10);
	});

	it('keeps deposited money unavailable until the Player redeems it from the bank', () => {
		const service = createService();
		const character = createCharacter(service);
		const player = service.loginPlayer(character.id, 'senha-rpg');
		const master = service.loginMaster('14081998');

		assert.deepEqual(service.getBank(player.token), {version: 1, balance: 0, revision: 0, money: 3000});
		assert.deepEqual(service.depositBank(player.token, undefined, 2000, 0), {
			version: 1, balance: 2000, revision: 1, money: 1000,
		});
		assert.throws(() => service.depositBank(player.token, undefined, 1, 0), /recarregue/);
		assert.throws(() => service.redeemBank(player.token, undefined, 2001, 1), /insuficientes no banco/);
		assert.deepEqual(service.redeemBank(player.token, undefined, 750, 1), {
			version: 1, balance: 1250, revision: 2, money: 1750,
		});
		assert.equal(service.getCharacter(player.token).money, 1750);
		assert.equal(service.getCharacter(player.token).bank.balance, 1250);
		const blocked = service.setCharacterPageAccess(master.token, character.id, 'bank', false);
		assert.equal(blocked.pageAccess.bank, false);
		assert.throws(() => service.getBank(player.token), /bloqueou o acesso ao banco/);
		assert.throws(() => service.depositBank(player.token, undefined, 1, 2), /bloqueou o acesso ao banco/);
		assert.equal(service.getBank(master.token, character.id).balance, 1250);
	});

	it('lets only the Master add or remove money from a Player wallet', () => {
		const service = createService();
		const character = createCharacter(service);
		const player = service.loginPlayer(character.id, 'senha-rpg');
		const master = service.loginMaster('14081998');
		assert.equal(service.adjustCharacterMoney(master.token, character.id, 'add', 500).money, 3500);
		assert.equal(service.adjustCharacterMoney(master.token, character.id, 'remove', 1200).money, 2300);
		assert.throws(() => service.adjustCharacterMoney(master.token, character.id, 'remove', 2301), /insuficientes/);
		assert.throws(() => service.adjustCharacterMoney(player.token, character.id, 'add', 1), /só pode remover/);
		assert.equal(service.adjustCharacterMoney(player.token, character.id, 'remove', 300).money, 2000);
	});

	it('lets the Player persist a personalized trainer phrase', () => {
		const service = createService();
		const character = createCharacter(service);
		const player = service.loginPlayer(character.id, 'senha-rpg');
		assert.equal(service.getCharacter(player.token).profile.tagline, 'A aventura está apenas começando.');
		const updated = service.setTrainerTagline(player.token, undefined, 'Sempre em busca do próximo desafio.');
		assert.equal(updated.profile.tagline, 'Sempre em busca do próximo desafio.');
		assert.throws(() => service.setTrainerTagline(player.token, undefined, '  '), /trainer tagline/);
	});

	it('uses a one-in-ten shiny chance for the initial Pokemon', () => {
		const shinyService = createService({ random: () => 0 });
		const shiny = createCharacter(shinyService);
		const shinySession = shinyService.loginPlayer(shiny.id, 'senha-rpg');
		assert.equal(shinyService.getCharacter(shinySession.token).team[0].shiny, true);

		const regularService = createService({ random: () => 0.1 });
		const regular = createCharacter(regularService);
		const regularSession = regularService.loginPlayer(regular.id, 'senha-rpg');
		assert.equal(regularService.getCharacter(regularSession.token).team[0].shiny, false);
	});
	it('authenticates a player only against the selected RPG character', () => {
		const service = createService();
		createCharacter(service);
		assert.throws(() => service.loginPlayer('samuel', 'errada'), /Invalid RPG character or password/);

		const session = service.loginPlayer('samuel', 'senha-rpg');
		assert.equal(session.role, 'player');
		assert.equal(session.mode, 'player');
		assert.equal(session.characterId, 'samuel');
		assert.equal(service.getSession(session.token).characterId, 'samuel');
	});

	it('prevents a player from seeing or controlling another character', () => {
		const service = createService();
		createCharacter(service);
		createCharacter(service, {
			characterName: 'Marina',
			playerName: 'Marina real',
			password: 'outra-senha',
		});
		const session = service.loginPlayer('samuel', 'senha-rpg');

		assert.throws(() => service.getCharacter(session.token, 'marina'), /cannot access another character/);
		assert.throws(() => service.listAllCharacters(session.token), /does not have permission/);
		assert.throws(() => service.requirePermission(session.token, 'battle:control-npc'), /does not have permission/);
		assert.doesNotThrow(() => service.requirePermission(session.token, 'battle:start', 'samuel'));
	});

	it('gives the master full access and supports a restricted player view', () => {
		const service = createService();
		createCharacter(service);
		createCharacter(service, {
			characterName: 'Marina',
			playerName: 'Marina real',
			password: 'outra-senha',
		});
		assert.throws(() => service.loginMaster('codigo-errado'), /Invalid RPG master code/);

		let session = service.loginMaster('14081998');
		assert.equal(service.listAllCharacters(session.token).length, 2);
		assert.doesNotThrow(() => service.requirePermission(session.token, 'battle:control-npc'));

		session = service.viewAsPlayer(session.token, 'samuel');
		assert.equal(session.role, 'master');
		assert.equal(session.mode, 'player');
		assert.equal(session.viewAsCharacterId, 'samuel');
		assert.equal(service.getCharacter(session.token).id, 'samuel');
		assert.throws(() => service.getCharacter(session.token, 'marina'), /cannot access another character/);
		assert.throws(() => service.requirePermission(session.token, 'battle:observe-all'), /does not have permission/);

		session = service.exitPlayerView(session.token);
		assert.equal(session.mode, 'master');
		assert.equal(session.viewAsCharacterId, undefined);
		assert.doesNotThrow(() => service.requirePermission(session.token, 'battle:observe-all'));
	});
	it('requires a changing Pokemon challenge before a master deletes a viewed player', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const plainMaster = service.loginMaster('14081998');

		assert.throws(
			() => service.createCharacterDeletionChallenge(player.token),
			/must be viewing a player/
		);
		assert.throws(
			() => service.createCharacterDeletionChallenge(plainMaster.token),
			/must be viewing a player/
		);

		const master = service.viewAsPlayer(plainMaster.token, 'samuel');
		const first = service.createCharacterDeletionChallenge(master.token);
		const second = service.createCharacterDeletionChallenge(master.token);
		assert.equal(first.characterId, 'samuel');
		assert.notEqual(first.challengeId, second.challengeId);
		assert.notEqual(first.word, second.word);

		assert.throws(
			() => service.deleteViewedCharacter(master.token, second.challengeId, 'palavra-errada'),
			/Incorrect RPG deletion confirmation/
		);
		assert.equal(service.listSelectableCharacters().length, 1);

		const result = service.deleteViewedCharacter(master.token, second.challengeId, second.word);
		assert.equal(result.characterId, 'samuel');
		assert.equal(result.session.mode, 'master');
		assert.equal(result.session.viewAsCharacterId, undefined);
		assert.deepEqual(service.listSelectableCharacters(), []);
		assert.throws(() => service.getSession(player.token), /Invalid or expired RPG session/);
	});

	it('invalidates logout and expired sessions', () => {
		let now = 1000;
		const service = createService({ now: () => now, sessionTtlMs: 10 });
		const session = service.loginMaster('14081998');
		assert.equal(service.getSession(session.token).expiresAt, 1010);

		now = 1010;
		assert.throws(() => service.getSession(session.token), /Invalid or expired RPG session/);

		now = 2000;
		const another = service.loginMaster('14081998');
		service.logout(another.token);
		assert.throws(() => service.getSession(another.token), /Invalid or expired RPG session/);
	});

	it('rejects normalized duplicate names and invalid starter data', () => {
		const service = createService();
		createCharacter(service);
		assert.throws(() => createCharacter(service, { characterName: 'S a-m_u.e l' }), /already exists/);
		assert.throws(() => createCharacter(service, {
			characterName: 'Invalido',
			starter: { species: 'MissingNo', gender: 'M' },
		}), /Invalid RPG starter species/);
	});
	it('lets only the master replace a complete team and keeps the Box party synchronized', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const set = (species, moves) => ({
			name: species, species, item: '', ability: '', moves, nature: 'Hardy', gender: 'N',
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, level: 10,
		});
		const team = [set('Bulbasaur', ['grassyterrain']), set('Squirtle', ['swordsdance'])];
		assert.throws(() => service.replaceCharacterTeam(player.token, 'samuel', team), /master session required/);
		const state = service.replaceCharacterTeam(master.token, 'samuel', team);
		assert.deepEqual(state.team.map(pokemon => pokemon.species), ['Bulbasaur', 'Squirtle']);
		assert.deepEqual(state.team[1].moves, ['swordsdance']);
		assert.equal(state.box.party.length, 2);
		assert.equal(state.box.tier, 'small');
		assert.equal(state.box.revision, 1);
	});	it('validates and persists a post-battle level evolution only once', () => {
		const service = createService();
		createCharacter(service, {
			starter: { species: 'Squirtle', nickname: 'Tarta', gender: 'M', level: 17 },
		});
		const player = service.loginPlayer('samuel', 'senha-rpg');
		service.battleSessions.repository.create({
			version: 1, id: 'evolutiontest', name: '', status: 'ended', format: 'singles', opponentType: 'wild',
			participants: [{
				id: 'samuel-a', team: 'A', kind: 'player', characterId: 'samuel', displayName: 'Samuel',
				selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
			}],
			conditions: {
				sceneId: 'meadow', weather: { id: '', duration: 'temporary', turns: 5 },
				terrain: { id: '', duration: 'temporary', turns: 5 }, startingTurn: 1,
				timeOfDay: 'day', isCave: false, isInWater: false,
			},
			rules: { canFlee: true, grantsExperience: true, allowSwitching: true, allowItems: true, playersChoosePokemon: false },
			invitations: [], createdAt: 1, updatedAt: 2, endedAt: 2,
			result: { evolutions: [{
				side: 'p1', position: 0, teamPosition: 0,
				fromSpecies: 'Squirtle', toSpecies: 'Wartortle', level: 17,
			}] },
		});
		const evolved = service.evolveBattlePokemon(player.token, 'evolutiontest', 0, 'Wartortle');
		assert.equal(evolved.character.team[0].species, 'Wartortle');
		assert.equal(evolved.character.team[0].name, 'Tarta');
		assert.equal(evolved.character.box.party[0].pokemon.species, 'Wartortle');
		assert.equal(evolved.character.box.party[0].pokemon.name, 'Tarta');
		assert(evolved.character.profile.pokedex.seen.includes('wartortle'));
		assert(evolved.character.profile.pokedex.caught.includes('wartortle'));
		assert.throws(() => service.evolveBattlePokemon(player.token, 'evolutiontest', 0, 'Wartortle'),
			/already changed|já mudou/i);
	});	it('validates, replaces, and idempotently persists a post-battle level-up move', () => {
		const service = createService();
		createCharacter(service);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		const master = service.loginMaster('14081998');
		const character = service.getCharacter(player.token);
		service.replaceCharacterTeam(master.token, 'samuel', [{
			...character.team[0],
			moves: ['tackle', 'tailwhip', 'watergun', 'withdraw'],
		}]);
		service.battleSessions.repository.create({
			version: 1, id: 'movelearningtest', name: '', status: 'ended', format: 'singles', opponentType: 'wild',
			participants: [{
				id: 'samuel-a', team: 'A', kind: 'player', characterId: 'samuel', displayName: 'Samuel',
				selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
			}],
			conditions: {
				sceneId: 'meadow', weather: { id: '', duration: 'temporary', turns: 5 },
				terrain: { id: '', duration: 'temporary', turns: 5 }, startingTurn: 1,
				timeOfDay: 'day', isCave: false, isInWater: false,
			},
			rules: { canFlee: true, grantsExperience: true, allowSwitching: true, allowItems: true, playersChoosePokemon: false },
			invitations: [], createdAt: 1, updatedAt: 2, endedAt: 2,
			result: { experience: [{
				side: 'p1', position: 0, teamPosition: 0, participated: true,
				previousExperience: 560, gained: 100, totalExperience: 660,
				previousLevel: 10, level: 11, learnedMoves: [{ move: 'bite', level: 11 }],
				luckyEggApplied: false,
			}] },
		});
		assert.throws(() => service.learnBattleMove(
			player.token, 'movelearningtest', 0, 'bite', undefined, 'p1'
		), /which move|qual golpe/i);
		const learned = service.learnBattleMove(player.token, 'movelearningtest', 0, 'bite', 1, 'p1');
		assert.deepEqual(learned.character.team[0].moves, ['tackle', 'bite', 'watergun', 'withdraw']);
		assert.equal(learned.learning.forgottenMove, 'Tail Whip');
		const repeated = service.learnBattleMove(player.token, 'movelearningtest', 0, 'bite', 1, 'p1');
		assert.equal(repeated.learning.alreadyKnown, true);
		assert.equal(repeated.character.team[0].moves.filter(move => move === 'bite').length, 1);
		assert.throws(() => service.learnBattleMove(
			player.token, 'movelearningtest', 0, 'icebeam', 1, 'p1'
		), /not available|dispon/i);
	});	it('persists a declared money reward once for winning Player characters', () => {
		const service = createService();
		createCharacter(service);
		service.battleSessions.repository.create({
			version: 1, id: 'rewardtest', name: '', status: 'started', format: 'singles', opponentType: 'npc',
			participants: [{
				id: 'samuel-a', team: 'A', kind: 'player', characterId: 'samuel', displayName: 'Samuel',
				selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
			}],
			conditions: {
				sceneId: 'meadow', weather: { id: '', duration: 'temporary', turns: 5 },
				terrain: { id: '', duration: 'temporary', turns: 5 }, startingTurn: 1,
				timeOfDay: 'day', isCave: false, isInWater: false,
			},
			rules: { canFlee: true, grantsExperience: true, allowSwitching: true, allowItems: true, playersChoosePokemon: false },
			invitations: [], createdAt: 1, updatedAt: 2, startedAt: 2,
		});
		const result = {
			outcome: 'win', winnerSide: 'p1', rewards: [{ type: 'money', amount: 1250 }],
			pokemon: [], capture: undefined,
		};
		service.completeBattleSession('rewardtest', result);
		service.completeBattleSession('rewardtest', result);
		const player = service.loginPlayer('samuel', 'senha-rpg');
		assert.equal(service.getCharacter(player.token).money, 4250);
	});

	it('persists Raid preparation and safely recovers an interrupted runtime after restart', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-battles-'));
		const characterFile = path.join(directory, 'characters.json');
		const battleFile = path.join(directory, 'battles.json');
		try {
			const first = createRPGLoginServiceFromConfig({
				rpgmastercode: '14081998', rpgcharacterfile: characterFile, rpgbattlefile: battleFile,
			});
			const master = first.loginMaster('14081998');
			const player = first.loginPlayer('teste', '1234');
			let battle = first.createBattleSession(master.token, { name: 'Raid persistente' });
			battle = first.updateBattleSession(master.token, battle.id, {
				format: 'raid', opponentType: 'wild', participants: [
					{
						id: 'teste', team: 'A', kind: 'player', characterId: 'teste',
						displayName: 'Teste', selectionLimit: 1, pokemon: [{ teamIndex: 0 }],
					},
					{
						id: 'raid-wild', team: 'B', kind: 'wild', displayName: 'Caterpie',
						selectionLimit: 1, pokemon: [{ set: { species: 'Caterpie', level: 10 } }],
					},
				],
			});
			first.inviteBattleSession(master.token, battle.id);
			first.respondToBattleInvitation(player.token, battle.id, 'accepted');
			battle = first.startBattleSession(master.token, battle.id).session;
			assert.equal(battle.status, 'started');
			assert(fs.existsSync(battleFile));

			const restarted = createRPGLoginServiceFromConfig({
				rpgmastercode: '14081998', rpgcharacterfile: characterFile, rpgbattlefile: battleFile,
			});
			const restartedMaster = restarted.loginMaster('14081998');
			const recovered = restarted.getBattleSession(restartedMaster.token, battle.id);
			assert.equal(recovered.status, 'ready');
			assert.equal(recovered.format, 'raid');
			assert.equal(recovered.participants.length, 2);
			assert.equal(recovered.startedAt, undefined);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
