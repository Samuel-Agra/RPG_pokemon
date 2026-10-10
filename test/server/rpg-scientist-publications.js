'use strict';

const assert = require('node:assert/strict');
const { RPGLoginService, RPGMemoryCharacterRepository, rpgTrainerSkillBonus,
	rpgTrainerTalentCatalog } = require('../../dist/server/rpg-showdown');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');

describe('RPG Scientist reference publications', () => {
	function setup() {
		const service = new RPGLoginService({ masterCode: 'segredo',
			repository: new RPGMemoryCharacterRepository() });
		service.createCharacter({ characterName: 'Cientista', playerName: 'Pessoa', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const player = service.loginPlayer('cientista', 'senha-rpg');
		const master = service.loginMaster('segredo');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'cientista',
			attributes: { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 8 },
			fixedKnowledge: 'conhecimento:quimica',
			optionalSkills: ['percepcao', 'investigacao', 'tecnologia', 'natureza', 'medicina'], gearChoices: {} });
		const record = service.repository.get('cientista');
		record.tableId = 'mesa-cientista';
		record.state.trainerSheet.level = 7;
		record.state.trainerSheet.skills.focused.push('conhecimento:quimica');
		service.repository.set(record);
		const getSession = service.getSession.bind(service);
		service.getSession = token => token === master.token ? getSession(token) : {
			mode: 'player', role: 'player', platformTableId: 'mesa-cientista', characterId: 'cientista',
		};
		return { service, master };
	}
	it('requires Knowledge focus and applies the permanent +2 to the selected area', () => {
		const { service } = setup();
		const sheet = service.repository.get('cientista').state.trainerSheet;
		const talent = rpgTrainerTalentCatalog(sheet).find(entry =>
			entry.id === 'cientista:publicacao-de-referencia');
		assert.deepEqual(talent.variantChoices, ['conhecimento:quimica']);
		const before = rpgTrainerSkillBonus(sheet, 'conhecimento:quimica');
		sheet.talents.class.push('cientista:publicacao-de-referencia');
		sheet.talentSelections = [{ id: 'cientista:publicacao-de-referencia',
			variant: 'conhecimento:quimica', acquiredAtLevel: 7 }];
		assert.equal(rpgTrainerSkillBonus(sheet, 'conhecimento:quimica'), before + 2);
		assert.throws(() => service.createScientificPublication('player', {
			requestId: 'artigo_teste_01', title: 'Amostras', summary: 'Análise das amostras coletadas.',
		}), /Publicação de Referência/);
		const record = service.repository.get('cientista');
		record.state.trainerSheet = sheet;
		service.repository.set(record);
	});
	it('shows pending work to the Master and pays/counts an accepted article exactly once', () => {
		const { service, master } = setup();
		const record = service.repository.get('cientista');
		record.state.trainerSheet.talents.class.push('cientista:publicacao-de-referencia');
		record.state.trainerSheet.talentSelections = [{ id: 'cientista:publicacao-de-referencia',
			variant: 'conhecimento:quimica', acquiredAtLevel: 7 }];
		service.repository.set(record);
		const input = { requestId: 'artigo_teste_02', title: 'Amostras de Kanto',
			summary: 'Estudo das amostras recolhidas em Kanto.' };
		assert.equal(service.createScientificPublication('player', input).repeated, false);
		assert.equal(service.createScientificPublication('player', input).repeated, true);
		assert.equal(service.getCampaignSettings(master.token).publications[0].status, 'pending');
		assert.equal(service.getTrainerProgression('player').publication.pending, true);
		assert.throws(() => service.createScientificPublication('player', {
			...input, requestId: 'artigo_teste_03' }), /aguardando avaliação/);
		const payment = service.decideScientificPublication(master.token, input.requestId, true, 2000);
		assert.equal(payment.money, 2100);
		assert.equal(service.getTrainerProgression('player').publication.accepted, 1);
		assert.throws(() => service.decideScientificPublication(master.token, input.requestId, true, 2000),
			/não está pendente/);
		assert.equal(service.repository.get('cientista').state.money, 2100);
	});
	it('accepts a previously acquired talent and classifies article validation for HTTP', () => {
		const { service } = setup();
		const record = service.repository.get('cientista');
		record.state.trainerSheet.skills.focused = [];
		record.state.trainerSheet.talents.class.push('cientista:publicacao-de-referencia');
		record.state.trainerSheet.talentSelections = [{ id: 'cientista:publicacao-de-referencia',
			variant: 'conhecimento:quimica', acquiredAtLevel: 7 }];
		service.repository.set(record);
		const handler = new RPGHttpServer(service);
		assert.equal(handler.isPublicValidationError('Informe título e resumo do artigo (3–120 e 10–3000 caracteres)'), true);
		assert.equal(handler.isPublicValidationError('Publicação de Referência não está disponível para este treinador'), true);
		assert.throws(() => service.createScientificPublication('player', {
			requestId: 'artigo_http_01', title: 'Análise', summary: 'curto',
		}), /Informe título e resumo/);
		assert.equal(service.createScientificPublication('player', { requestId: 'artigo_http_02',
			title: 'Análise', summary: 'Análise detalhada de amostras.' }).publication.status, 'pending');
	});
});
