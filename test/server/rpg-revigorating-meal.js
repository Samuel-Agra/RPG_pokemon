'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository, rpgTrainerSurvival } =
	require('../../dist/server/rpg-showdown');

describe('RPG Refeição Revigorante', () => {
	it('consumes one Alimento per five people, heals once per long rest, and rejects retries', () => {
		const service = new RPGLoginService({ masterCode: 'teste',
			repository: new RPGMemoryCharacterRepository(), random: () => 0.95 });
		for (const name of ['Cozinheira', 'Aliado', 'Pessoa3', 'Pessoa4', 'Pessoa5', 'Pessoa6']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const login = service.loginPlayer(name.toLowerCase(), 'senha-rpg');
			service.chooseTrainerAttributeMethod(login.token, 'standard');
			service.completeTrainerCreation(login.token, { classId: name === 'Cozinheira' ? 'cozinheiro' : 'atleta',
				attributes: { strength: 15, dexterity: 14, constitution: 13,
					intelligence: 12, wisdom: 10, charisma: 8 },
				optionalSkills: name === 'Cozinheira' ?
					['percepcao', 'sobrevivencia', 'medicina', 'persuasao'] : ['percepcao', 'sobrevivencia'],
				gearChoices: name === 'Cozinheira' ? {} : { melhoria: 'arnes-escalada' } });
			const record = service.repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = `account-${name.toLowerCase()}`;
			record.state.trainerSheet.talentRestCycle = 1;
			record.state.trainerSheet.hitPoints.current = 1;
			if (name === 'Cozinheira') {
				record.state.trainerSheet.level = 5;
				record.state.trainerSheet.talents.class.push('cozinheiro:refeicao-reconfortante');
				record.state.trainerSheet.talents.class.push('cozinheiro:nutricao-de-recuperacao');
			}
			if (name === 'Aliado') record.state.trainerSheet.survival = {
				...rpgTrainerSurvival(record.state.trainerSheet), exhaustion: 2,
			};
			service.repository.set(record);
		}
		const cook = service.repository.get('cozinheira');
		cook.state.trainerInventory.items.push({ id: 'food-one', itemId: 'alimento', quantity: 1,
			equipped: false, location: 'bag' });
		service.repository.set(cook);
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste',
			characterId: 'cozinheira' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const input = { requestId: 'refeicao_001', dc: 10,
			recipientCharacterIds: ['cozinheira', 'aliado', 'pessoa3', 'pessoa4', 'pessoa5', 'pessoa6'] };
		const foodBefore = service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0);
		const result = service.useTrainerRevigoratingMeal('token', input);
		assert.equal(result.repeated, false);
		assert.equal(result.result.success, true);
		assert.equal(result.result.foodConsumed, 2);
		assert.equal(result.result.recipients.length, 6);
		assert.equal(result.result.recipients.find(person => person.id === 'aliado').exhaustionReduced, 1);
		assert.equal(service.repository.get('cozinheira').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0), foodBefore - 2);
		assert(service.repository.get('aliado').state.trainerSheet.hitPoints.current > 1);
		assert.equal(rpgTrainerSurvival(service.repository.get('aliado').state.trainerSheet).exhaustion, 1);
		assert.equal(service.repository.get('aliado').state.trainerSheet.nutritionRecoveryPending, true);
		assert.equal(service.useTrainerRevigoratingMeal('token', input).repeated, true);
		assert.throws(() => service.useTrainerRevigoratingMeal('token', { ...input, dc: 20 }),
			/Identificador de refeição já utilizado/);
		assert.throws(() => service.useTrainerRevigoratingMeal('token', { ...input,
			requestId: 'refeicao_002' }), /próximo descanso longo/);
	});
});
