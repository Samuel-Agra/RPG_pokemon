'use strict';

const assert = require('assert').strict;
const {
	RPGLoginService, RPGMemoryCharacterRepository, RPG_STANDARD_ATTRIBUTES,
	RPG_TRAINER_CLASSES, completeRPGTrainerSheet, createRPGPendingTrainerSheet,
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
		const master = service.loginMaster('teste');
		service.setTrainerAttributeMethod(master.token, 'rolled');
		const player = service.loginPlayer('treinador', 'senha-rpg');
		assert.deepEqual(service.rollTrainerAttributes(player.token), [18, 18, 18, 18, 18, 18]);
		assert.deepEqual(service.rollTrainerAttributes(player.token), [18, 18, 18, 18, 18, 18]);
		assert.throws(() => service.setTrainerAttributeMethod(master.token, 'standard'));
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
});
