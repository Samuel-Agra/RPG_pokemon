'use strict';

const assert = require('assert').strict;
const {
	RPGLoginService, RPGMemoryCharacterRepository, RPG_TRAINER_LEVEL_XP,
	RPG_CONTEST_PODIUM_XP, RPG_BADGE_XP, awardRPGTrainerXP,
	advanceRPGTrainerLevel, lowerRPGTrainerLevel, chooseRPGTrainerTalent,
	createRPGPendingTrainerSheet, completeRPGTrainerSheet, rpgTrainerLevelForXP,
	rpgTrainerXPToNextLevel, rpgContestPodiumXP, rpgBadgeXP,
} = require('../../dist/server/rpg-showdown');

function completeSheet() {
	return completeRPGTrainerSheet(createRPGPendingTrainerSheet(), {
		classId: 'arqueologo',
		attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
		optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'],
		gearChoices: { arma: 'faca' },
	}, 'standard');
}

function reward(kind, sourceId, amount) {
	return { kind, sourceId, amount, reason: 'Marco da campanha', grantedAt: 1_700_000_000_000 };
}

function character(service, name) {
	service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
		password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
}

describe('RPG trainer progression and rewards', () => {
	it('uses the ten fixed thresholds through 200 million XP', () => {
		assert.deepEqual(RPG_TRAINER_LEVEL_XP, [0, 937500, 2812500, 8437500, 20312500,
			43750000, 71875000, 106250000, 150000000, 200000000]);
		for (let index = 0; index < RPG_TRAINER_LEVEL_XP.length; index++) {
			assert.equal(rpgTrainerLevelForXP(RPG_TRAINER_LEVEL_XP[index]), index + 1);
		}
		assert.equal(rpgTrainerLevelForXP(199999999), 9);
		assert.equal(rpgTrainerLevelForXP(200000000), 10);
		assert.equal(rpgTrainerXPToNextLevel(0), 937500);
		assert.equal(rpgTrainerXPToNextLevel(200000000), null);
	});

	it('uses the published contest ranks and badge order', () => {
		assert.deepEqual(RPG_CONTEST_PODIUM_XP.hyper, [12000, 7200, 4200]);
		assert.equal(rpgContestPodiumXP('normal', 1), 2000);
		assert.equal(rpgContestPodiumXP('master', 3), 8400);
		assert.equal(rpgContestPodiumXP('master', 1, true), 0);
		assert.equal(rpgContestPodiumXP('great', 4), 0);
		assert.equal(RPG_BADGE_XP.reduce((sum, amount) => sum + amount, 0), 2250000);
		assert.equal(rpgBadgeXP(0), 100000);
		assert.equal(rpgBadgeXP(7), 500000);
		assert.throws(() => rpgBadgeXP(8));
	});

	it('records each origin once while XP alone does not update level or PV', () => {
		let sheet = completeSheet();
		sheet.hitPoints.current = 5;
		const first = awardRPGTrainerXP(sheet, reward('master', 'mission-1', 3_000_000));
		assert.equal(first.awarded, true);
		assert.equal(first.levelsGained, 2);
		assert.equal(first.sheet.level, 1);
		assert.equal(first.sheet.hitPoints.maximum, 19);
		assert.equal(first.sheet.hitPoints.current, 5);
		assert.equal(first.sheet.pendingChoices, undefined);
		assert.equal(sheet.experience, 0);
		const duplicate = awardRPGTrainerXP(first.sheet, reward('master', 'mission-1', 3_000_000));
		assert.equal(duplicate.awarded, false);
		assert.equal(duplicate.sheet.experience, 3_000_000);
		assert.throws(() => awardRPGTrainerXP(first.sheet, reward('master', 'mission-1', 4_000_000)));
		sheet = awardRPGTrainerXP(first.sheet, reward('badge', 'kanto:boulder', 197_000_000)).sheet;
		assert.equal(sheet.level, 1);
		assert.equal(sheet.pendingChoices, undefined);
		assert.equal(sheet.hitPoints.current, 5);
	});

	it('preserves pre-creation XP and calculates full PV after class choice', () => {
		const pending = awardRPGTrainerXP(createRPGPendingTrainerSheet(), reward('battle', 'b1', 937500)).sheet;
		assert.equal(pending.level, 1);
		assert.equal(pending.hitPoints.maximum, null);
		const ready = completeRPGTrainerSheet(pending, {
			classId: 'arqueologo',
			attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
			optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'],
			gearChoices: { arma: 'faca' },
		}, 'standard');
		assert.equal(ready.experience, 937500);
		assert.equal(ready.hitPoints.maximum, 19);
		assert.equal(ready.pendingChoices, undefined);
	});

	it('requires eight campaign hours before a player updates one level and reverses its chosen talent', () => {
		let sheet = awardRPGTrainerXP(completeSheet(), reward('master', 'mission-level', 1_000_000)).sheet;
		assert.throws(() => advanceRPGTrainerLevel(sheet), /descanso longo/);
		sheet.levelUpReady = 2;
		sheet.hitPoints.current = 5;
		sheet = advanceRPGTrainerLevel(sheet);
		assert.equal(sheet.level, 2);
		assert.equal(sheet.hitPoints.maximum, 25);
		assert.equal(sheet.hitPoints.current, 5);
		assert.deepEqual(sheet.pendingChoices, { general: 1, class: 0, apex: 0 });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'treinamento-adicional', skill: 'medicina' });
		assert(sheet.skills.trained.includes('medicina'));
		sheet = lowerRPGTrainerLevel(sheet);
		assert.equal(sheet.level, 1);
		assert.equal(sheet.hitPoints.maximum, 19);
		assert.equal(sheet.hitPoints.current, 5);
		assert(!sheet.skills.trained.includes('medicina'));
		assert.equal(sheet.talents.general.length, 0);
		assert(sheet.experience < RPG_TRAINER_LEVEL_XP[1]);
	});

	it('reverses a level from an older sheet without a level snapshot using recorded talent choices', () => {
		let legacy = completeSheet();
		legacy.level = 2; legacy.experience = 1_000_000;
		legacy.hitPoints.maximum = 25; legacy.hitPoints.current = 7;
		legacy = chooseRPGTrainerTalent(legacy, { id: 'treinamento-adicional', skill: 'medicina' });
		assert.equal(legacy.levelSnapshots, undefined);
		const lowered = lowerRPGTrainerLevel(legacy);
		assert.equal(lowered.level, 1);
		assert.equal(lowered.hitPoints.maximum, 19);
		assert.equal(lowered.hitPoints.current, 7);
		assert(!lowered.skills.trained.includes('medicina'));
		assert.equal(lowered.talents.general.length, 0);
	});

	it('awards battle XP only from Pokemon belonging to each player and once per battle', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		character(service, 'Ana'); character(service, 'Bia');
		const session = { id: 'battle1', name: 'Dupla', rules: { grantsExperience: true }, participants: [
			{ kind: 'player', characterId: 'ana', team: 'A', pokemon: [{ teamIndex: 0 }] },
			{ kind: 'player', characterId: 'bia', team: 'A', pokemon: [{ teamIndex: 0 }] },
			{ kind: 'npc', team: 'B', pokemon: [{}] },
		] };
		const result = { experience: [
			{ side: 'p1', teamPosition: 0, gained: 1000 },
			{ side: 'p1', teamPosition: 1, gained: 2000 },
			{ side: 'p2', teamPosition: 0, gained: 9000 },
		] };
		service.persistBattleTrainerExperience(session, result);
		service.persistBattleTrainerExperience(session, result);
		assert.equal(repository.get('ana').state.trainerSheet.experience, 1000);
		assert.equal(repository.get('bia').state.trainerSheet.experience, 2000);
		assert.equal(repository.get('ana').state.trainerSheet.rewards.length, 1);
	});

	it('awards contest podium, gym badge and manual grants without repeating sources', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		character(service, 'Ana');
		const master = service.loginMaster('teste');
		const manual = service.grantMasterTrainerXP(master.token, 'ana', 1000, 'Missão', 'mission-1');
		assert.equal(manual.awarded, true);
		assert.equal(service.grantMasterTrainerXP(master.token, 'ana', 1000, 'Missão', 'mission-1').awarded, false);
		const session = { id: 'contest1', rank: 'hyper', participants: [{ id: 'p1', kind: 'player', characterId: 'ana', pokemon: { teamIndex: 0 } }] };
		const results = [{ participantId: 'p1', place: 1, disqualified: false, performanceGain: 7 }];
		service.applyContestResults({ ...session, id: 'cancelled', status: 'cancelled' }, results);
		assert.equal(repository.get('ana').state.trainerSheet.experience, 1000);
		service.applyContestResults(session, results);
		service.applyContestResults(session, results);
		assert.equal(repository.get('ana').state.trainerSheet.experience, 13000);
		const battle = { opponentType: 'npc', participants: [
			{ kind: 'player', characterId: 'ana', team: 'A' },
			{ kind: 'npc', team: 'B', displayName: 'Brock', gymBadge: { enabled: true, regionId: 'kanto', gymIndex: 0 } },
		] };
		const outcome = { outcome: 'win', sides: [{ side: 'p1', outcome: 'winner' }], pokemon: [], defeats: [], itemEvents: [] };
		service.persistBattleProfile(battle, outcome);
		service.persistBattleProfile(battle, outcome);
		assert.equal(repository.get('ana').state.trainerSheet.experience, 113000);
		assert.equal(repository.get('ana').state.trainerSheet.rewards.length, 3);
	});

	it('unlocks player advancement on the eight-hour campaign control and lets the Master adjust levels', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		character(service, 'Ana');
		const player = service.loginPlayer('ana', 'senha-rpg');
		const master = service.loginMaster('teste');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'arqueologo', attributes: {
			strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8,
		}, optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'], gearChoices: { arma: 'faca' } });
		service.grantMasterTrainerXP(master.token, 'ana', 1_000_000, 'Missão', 'mission-level-2');
		assert.equal(service.getTrainerProgression(player.token).sheet.level, 1);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, false);
		assert.throws(() => service.previewOwnTrainerLevel(player.token), /descanso longo/);
		service.advanceCampaignTime(master.token, 1);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, false);
		service.advanceCampaignTime(master.token, 8);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, true);
		assert(service.previewOwnTrainerLevel(player.token).talents.some(entry =>
			entry.id === 'treinamento-adicional' && entry.available));
		assert.throws(() => service.advanceOwnTrainerLevel(player.token, []), /Escolha os talentos/);
		assert.equal(service.getTrainerProgression(player.token).sheet.level, 1);
		assert.equal(service.advanceOwnTrainerLevel(player.token,
			[{ id: 'treinamento-adicional', skill: 'medicina' }]).level, 2);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, false);
		assert(service.getTrainerProgression(player.token).sheet.skills.trained.includes('medicina'));
		assert.equal(service.adjustMasterTrainerLevel(master.token, 'ana', 'down', 'level-down-ana').level, 1);
		assert(!service.getTrainerProgression(player.token).sheet.skills.trained.includes('medicina'));
		assert.equal(service.adjustMasterTrainerLevel(master.token, 'ana', 'up', 'level-up-ana').level, 1);
		assert.equal(service.adjustMasterTrainerLevel(master.token, 'ana', 'up', 'level-up-ana').level, 1);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, false);
		service.advanceCampaignTime(master.token, 8);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, true);
	});

	it('counts eight separate one-hour advances toward the same long-rest gate', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		character(service, 'Ana');
		const player = service.loginPlayer('ana', 'senha-rpg');
		const master = service.loginMaster('teste');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'arqueologo', attributes: {
			strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8,
		}, optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'], gearChoices: { arma: 'faca' } });
		service.grantMasterTrainerXP(master.token, 'ana', 1_000_000, 'Missão', 'mission-long-rest');
		for (let hour = 1; hour <= 8; hour++) {
			service.advanceCampaignTime(master.token, 1);
			assert.equal(service.getTrainerProgression(player.token).canLevelUp, hour === 8);
		}
	});

	it('requires another eight campaign hours before a second pending level', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		character(service, 'Ana');
		const player = service.loginPlayer('ana', 'senha-rpg');
		const master = service.loginMaster('teste');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'arqueologo', attributes: {
			strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8,
		}, optionalSkills: ['percepcao', 'pilotagem:automoveis', 'sobrevivencia'], gearChoices: { arma: 'faca' } });
		service.grantMasterTrainerXP(master.token, 'ana', 3_000_000, 'Missão', 'mission-level-3');
		service.advanceCampaignTime(master.token, 8);
		service.advanceOwnTrainerLevel(player.token, [{ id: 'treinamento-adicional', skill: 'medicina' }]);
		assert.equal(service.getTrainerProgression(player.token).sheet.level, 2);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, false);
		service.advanceCampaignTime(master.token, 8);
		assert.equal(service.getTrainerProgression(player.token).canLevelUp, true);
	});
});
