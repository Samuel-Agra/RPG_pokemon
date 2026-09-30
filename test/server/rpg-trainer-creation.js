'use strict';

const assert = require('assert').strict;
const {
	RPGLoginService, RPGMemoryCharacterRepository, RPG_STANDARD_ATTRIBUTES,
	RPG_TRAINER_CLASSES, RPG_KNOWLEDGE_DOMAINS, RPG_CRAFT_DOMAINS,
	RPG_TRAINER_PILOTING_DOMAINS, completeRPGTrainerSheet, createRPGPendingTrainerSheet,
	rollRPGTrainerAttributes,
} = require('../../dist/server/rpg-showdown');

const distributed = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };

describe('RPG trainer creation', () => {
	it('keeps only the first eligible 4d6-drop-lowest series', () => {
		let calls = 0;
		const values = rollRPGTrainerAttributes(() => {
			calls++;
			return calls <= 24 ? 1 : 6;
		});
		assert.deepEqual(values, [18, 18, 18, 18, 18, 18]);
		assert.equal(calls, 48);
	});

	it('validates every standard score, class option, skill and gear before calculating PV', () => {
		assert.equal(Object.keys(RPG_TRAINER_CLASSES).length, 20);
		const pending = createRPGPendingTrainerSheet();
		const selection = { classId: 'arqueologo', attributes: distributed,
			optionalSkills: ['percepcao', 'sobrevivencia', 'pilotagem:automoveis'], gearChoices: { arma: 'faca' } };
		const sheet = completeRPGTrainerSheet(pending, selection, 'standard');
		assert.equal(sheet.hitPoints.maximum, 19);
		assert.deepEqual(sheet.skills.trained,
			['conhecimento:arqueologia-fosseis', 'investigacao', ...selection.optionalSkills]);
		assert.equal(sheet.equipment.find(item => item.itemId === 'faca').quantity, 1);
		assert.equal(sheet.equipment.find(item => item.itemId === 'roupa-exploracao-leve').equipped, true);
		assert.deepEqual(sheet.creation, { method: 'standard', rolls: null });
		assert.deepEqual(pending, createRPGPendingTrainerSheet());
		assert.throws(() => completeRPGTrainerSheet(pending,
			{ ...selection, attributes: { ...distributed, strength: 18 } }, 'standard'));
		assert.throws(() => completeRPGTrainerSheet(pending,
			{ ...selection, optionalSkills: ['percepcao', 'sobrevivencia', 'atuacao'] }, 'standard'));
		assert.throws(() => completeRPGTrainerSheet(pending,
			{ ...selection, gearChoices: { arma: 'espada' } }, 'standard'));
		assert.throws(() => completeRPGTrainerSheet(sheet, selection, 'standard'));
	});

	it('persists one rolled series and grants the class bonus only once', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0.99 });
		service.createCharacter({ characterName: 'Treinador', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const player = service.loginPlayer('treinador', 'senha-rpg');
		assert.equal(service.getTrainerCreation(player.token).method, null);
		assert.deepEqual(service.getTrainerCreation(player.token).skillDomains, {
			conhecimento: [...RPG_KNOWLEDGE_DOMAINS], oficio: [...RPG_CRAFT_DOMAINS],
			pilotagem: [...RPG_TRAINER_PILOTING_DOMAINS],
		});
		assert.throws(() => service.rollTrainerAttributes(player.token));
		service.chooseTrainerAttributeMethod(player.token, 'rolled');
		for (let index = 1; index <= 6; index++) {
			const result = service.rollTrainerAttributes(player.token);
			assert.deepEqual(result, { dice: [6, 6, 6, 6], value: 18, index,
				values: Array(index).fill(18), valid: index === 6 ? true : null, complete: index === 6 });
			if (index === 1) assert.throws(() => service.chooseTrainerAttributeMethod(player.token, 'standard'));
			assert.deepEqual(service.getTrainerCreation(player.token).sheet.creation.rollProgress?.values,
				index === 6 ? undefined : Array(index).fill(18));
		}
		assert.deepEqual(service.rollTrainerAttributes(player.token), { dice: null, value: null, index: 6,
			values: [18, 18, 18, 18, 18, 18], valid: true, complete: true });
		assert.throws(() => service.chooseTrainerAttributeMethod(player.token, 'standard'));
		assert.equal(service.getTrainerCreation(player.token).method, 'rolled');
		const attributes = Object.fromEntries(Object.keys(distributed).map(key => [key, 18]));
		const input = { classId: 'diplomata', attributes,
			optionalSkills: ['atuacao', 'captura', 'conhecimento:regioes', 'tecnologia', 'percepcao', 'pilotagem:automoveis', 'oficio:escrita'],
			gearChoices: {} };
		const sheet = service.completeTrainerCreation(player.token, input);
		assert.equal(sheet.hitPoints.maximum, 20);
		assert.equal(repository.get('treinador').state.money, 2100);
		assert.throws(() => service.completeTrainerCreation(player.token, input));
		assert.equal(repository.get('treinador').state.money, 2100);
	});

	it('lets each player choose a different method without changing another trainer', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		for (const name of ['Ana', 'Bia']) service.createCharacter({ characterName: name, playerName: name,
			avatar: 'lucas', password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const ana = service.loginPlayer('ana', 'senha-rpg');
		const bia = service.loginPlayer('bia', 'senha-rpg');
		assert.throws(() => service.completeTrainerCreation(ana.token, {}), /Escolha o método/);
		service.chooseTrainerAttributeMethod(ana.token, 'standard');
		service.chooseTrainerAttributeMethod(bia.token, 'rolled');
		assert.equal(service.getTrainerCreation(ana.token).method, 'standard');
		assert.equal(service.getTrainerCreation(bia.token).method, 'rolled');
		assert.throws(() => service.chooseTrainerAttributeMethod(service.loginMaster('teste').token, 'standard'));
	});

	it('allows a new attempt only when the previous series is below the minimum', () => {
		let dice = 0;
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository,
			random: () => dice++ < 24 ? 0 : 0.99 });
		service.createCharacter({ characterName: 'Rolador', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const player = service.loginPlayer('rolador', 'senha-rpg');
		service.chooseTrainerAttributeMethod(player.token, 'rolled');
		dice = 0;
		for (let index = 1; index <= 6; index++) {
			const result = service.rollTrainerAttributes(player.token);
			assert.deepEqual(result, { dice: [1, 1, 1, 1], value: 3, index,
				values: Array(index).fill(3), valid: index === 6 ? false : null, complete: index === 6 });
		}
		assert.equal(repository.get('rolador').state.trainerSheet.creation.rolls, null);
		assert.deepEqual(service.getTrainerCreation(player.token).sheet.creation.rollProgress.values, [3, 3, 3, 3, 3, 3]);
		assert.equal(service.rollTrainerAttributes(player.token).index, 1);
		assert.deepEqual(service.getTrainerCreation(player.token).sheet.creation.rollProgress.values, [18]);
		for (let index = 2; index <= 6; index++) assert.equal(service.rollTrainerAttributes(player.token).index, index);
		assert.deepEqual(service.rollTrainerAttributes(player.token).values, [18, 18, 18, 18, 18, 18]);
	});
});
