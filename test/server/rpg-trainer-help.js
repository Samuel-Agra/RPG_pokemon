'use strict';

const assert = require('node:assert/strict');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

describe('RPG trainer help in a campaign', () => {
	const attributes = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
	function setup() {
		const service = new RPGLoginService({ masterCode: 'segredo', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.45 });
		for (const name of ['Auxiliar', 'Principal']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		}
		const helper = service.loginPlayer('auxiliar', 'senha-rpg');
		const principal = service.loginPlayer('principal', 'senha-rpg');
		for (const session of [helper, principal]) {
			service.chooseTrainerAttributeMethod(session.token, 'standard');
			service.completeTrainerCreation(session.token, { classId: 'arqueologo', attributes,
				optionalSkills: ['percepcao', 'sobrevivencia', 'pilotagem:automoveis'],
				gearChoices: { arma: 'faca' } });
		}
		return { service, helper, principal, master: service.loginMaster('segredo') };
	}

	it('applies one helper to the next other-character skill roll and consumes it once', () => {
		const { service, helper, principal } = setup();
		const offered = service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal');
		assert.equal(offered.result.total, 12);
		assert.equal(offered.bonus, 1);
		assert.equal(service.consumeTrainerHelp(helper.token, 'percepcao'), null);
		assert.throws(() => service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal'));
		assert.equal(service.consumeTrainerHelp(principal.token, 'investigacao'), null);
		assert.deepEqual(service.consumeTrainerHelp(principal.token, 'percepcao'),
			{ bonus: 1, helperName: 'Auxiliar' });
		assert.equal(service.consumeTrainerHelp(principal.token, 'percepcao'), null);
	});

	it('expires unclaimed help when the Master advances campaign time', () => {
		const { service, helper, principal, master } = setup();
		service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal');
		service.advanceCampaignTime(master.token, 1);
		assert.equal(service.consumeTrainerHelp(principal.token, 'percepcao'), null);
	});

	it('restores a pending offer from persisted campaign settings', () => {
		const { service, helper, master } = setup();
		service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal');
		const restored = new RPGLoginService({ masterCode: 'segredo', repository: service.repository,
			campaignSettings: service.getCampaignSettings(master.token), random: () => 0.45 });
		const principal = restored.loginPlayer('principal', 'senha-rpg');
		assert.deepEqual(restored.consumeTrainerHelp(principal.token, 'percepcao'),
			{ bonus: 1, helperName: 'Auxiliar' });
	});

	it('validates skill attributes and forbids rerolling the same pending offer', () => {
		const { service, helper } = setup();
		assert.throws(() => service.offerTrainerHelp(helper.token, 'percepcao', 'strength', 'normal'));
		service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal');
		assert.throws(() => service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal'));
	});

	it('grants Ajuda Especializada for any trained skill, including a legacy selected skill', () => {
		const { service, helper, principal } = setup();
		const record = service.repository.get('auxiliar');
		record.state.trainerSheet.talents.general.push('ajuda-especializada');
		record.state.trainerSheet.talentSelections = [
			...(record.state.trainerSheet.talentSelections || []),
			{ id: 'ajuda-especializada', skill: 'percepcao' },
		];
		service.repository.set(record);
		assert.equal(service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal').bonus, 2);
		assert.deepEqual(service.consumeTrainerHelp(principal.token, 'percepcao'),
			{ bonus: 2, helperName: 'Auxiliar' });
		assert.equal(service.offerTrainerHelp(helper.token, 'sobrevivencia', undefined, 'normal').bonus, 2);
		assert.deepEqual(service.consumeTrainerHelp(principal.token, 'sobrevivencia'),
			{ bonus: 2, helperName: 'Auxiliar' });
		assert.equal(service.offerTrainerHelp(helper.token, 'captura', undefined, 'normal').bonus, 1);
	});

	it('does not turn a failed help roll into success and keeps a naturally higher bonus', () => {
		const { service, helper } = setup();
		const record = service.repository.get('auxiliar');
		record.state.trainerSheet.talents.general.push('ajuda-especializada');
		service.repository.set(record);
		service.random = () => 0;
		assert.equal(service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal').bonus, 0);
		service.random = () => 0.95;
		assert.equal(service.offerTrainerHelp(helper.token, 'sobrevivencia', undefined, 'normal').bonus, 3);
	});
	it('guarantees Teamwork at least +2 when helping with Athletics or Acrobatics', () => {
		const { service, helper, principal } = setup();
		const record = service.repository.get('auxiliar');
		record.state.trainerSheet.classId = 'atleta';
		record.state.trainerSheet.talents.class.push('atleta:trabalho-em-equipe');
		service.repository.set(record);
		service.random = () => 0;
		assert.equal(service.offerTrainerHelp(helper.token, 'atletismo', undefined, 'normal').bonus, 2);
		assert.deepEqual(service.consumeTrainerHelp(principal.token, 'atletismo'),
			{ bonus: 2, helperName: 'Auxiliar' });
		assert.equal(service.offerTrainerHelp(helper.token, 'acrobacia', undefined, 'normal').bonus, 2);
		assert.equal(service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal').bonus, 0);
	});
	it('guarantees Collaborative Research at least +2 only for its listed skills', () => {
		const { service, helper, principal } = setup();
		const record = service.repository.get('auxiliar');
		record.state.trainerSheet.classId = 'cientista';
		record.state.trainerSheet.talents.class.push('cientista:pesquisa-colaborativa');
		service.repository.set(record);
		service.random = () => 0;
		assert.equal(service.offerTrainerHelp(helper.token, 'conhecimento:biologia', undefined, 'normal').bonus, 2);
		assert.deepEqual(service.consumeTrainerHelp(principal.token, 'conhecimento:biologia'),
			{ bonus: 2, helperName: 'Auxiliar' });
		assert.equal(service.offerTrainerHelp(helper.token, 'medicina', undefined, 'normal').bonus, 2);
		assert.equal(service.offerTrainerHelp(helper.token, 'percepcao', undefined, 'normal').bonus, 0);
	});
});
