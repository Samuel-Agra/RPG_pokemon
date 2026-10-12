'use strict';

const assert = require('assert').strict;
const {
	RPGLoginService, RPGMemoryCharacterRepository, RPGContestRuntimeManager,
	createRPGPendingTrainerSheet,
} = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalents } = require('../../dist/server/rpg-showdown/trainer-roll-talents');

function setup() {
	const service = new RPGLoginService({ masterCode: 'teste',
		repository: new RPGMemoryCharacterRepository() });
	for (const name of ['Coreografa', 'Aliado']) {
		service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = service.repository.get(name.toLowerCase());
		record.tableId = 'mesa-teste'; record.accountId = `account-${name.toLowerCase()}`;
		record.state.trainerSheet = {
			...createRPGPendingTrainerSheet(), status: 'complete',
			classId: name === 'Coreografa' ? 'coreografo' : 'atleta', level: 10,
			attributes: { strength: 12, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 15 },
			talents: { general: [], class: name === 'Coreografa' ?
				['coreografo:tema-unificado', 'coreografo:entrada-marcante',
					'coreografo:encerramento-memoravel', 'coreografo:diretor-convidado',
					'coreografo:preparacao-corporal-conjunta', 'coreografo:conducao-de-evacuacao'] : [],
			apex: name === 'Coreografa' ? 'coreografo:diretor-de-espetaculo' : null },
		};
		service.repository.set(record);
	}
	service.getSession = () => ({ mode: 'player', role: 'player',
		platformTableId: 'mesa-teste', characterId: 'coreografa' });
	service.accounts.repository.getMembership = () => ({ status: 'active' });
	return service;
}

describe('RPG talentos do Coreógrafo', () => {
	it('exige uma hora para Ensaio Conjunto e preserva a preparação depois', () => {
		const service = setup();
		const pokemonId = service.repository.get('coreografa').state.box.party[0].pokemonId;
		const input = { requestId: 'ensaio_coreografo_001', kind: 'rehearsal', pokemonIds: [pokemonId] };
		assert.equal(service.prepareTrainerChoreography('token', input).repeated, false);
		assert.equal(service.prepareTrainerChoreography('token', input).repeated, true);
		assert.deepEqual(service.trainerContestChoreography('coreografa', [0]).rehearsed, [false]);
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		assert.deepEqual(service.trainerContestChoreography('coreografa', [0]).rehearsed, [true]);
		service.advanceCampaignTime('token', 1);
		assert.deepEqual(service.trainerContestChoreography('coreografa', [0]).rehearsed, [true]);
	});

	it('declara tema apenas para o próximo período e concede os pontos uma vez', () => {
		const service = setup();
		service.prepareTrainerChoreography('token', { requestId: 'tema_coreografo_001',
			kind: 'theme', tag: 'dance' });
		const choreography = service.trainerContestChoreography('coreografa', [0]);
		assert.equal(choreography.themeTag, 'dance');
		const manager = new RPGContestRuntimeManager({
			getTrainerSheet: id => service.repository.get(id)?.state.trainerSheet,
		});
		const state = { session: { mode: 'solo', category: 'beauty' } };
		const participant = { characterId: 'coreografa', disqualified: false, choreography,
			rounds: [['quiverdance', 'petaldance', 'dazzlinggleam'],
				['quiverdance', 'petaldance', 'dazzlinggleam']], roundScores: [null, null] };
		assert.equal(manager.trainerContestBonus(state, participant), 4);
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		assert.equal(service.trainerContestChoreography('coreografa', [0]).themeTag, null);
	});

	it('prepara orientação física limitada e impede o mesmo bônus duas vezes', () => {
		const service = setup();
		service.prepareTrainerChoreography('token', { requestId: 'grupo_coreografo_001',
			kind: 'warmup', recipientCharacterIds: ['aliado'], activity: 'travessia de equilíbrio' });
		const options = service.getTrainerAllyRollTalents('token', 'aliado');
		assert(options.some(option => option.id === 'coreografo:preparacao-corporal-conjunta' && option.bonus === 1));
		service.consumeTrainerChoreographyRoll('token', 'aliado', ['coreografo:warmup@coreografa']);
		assert(!service.getTrainerAllyRollTalents('token', 'aliado').some(option =>
			option.id === 'coreografo:preparacao-corporal-conjunta'));
		assert(!rpgTrainerRollTalents(service.repository.get('coreografa').state.trainerSheet).some(option =>
			option.id === 'coreografo:preparacao-corporal-conjunta'));
	});

	it('exige ensaios prévios para formação e soma o ápice uma única vez', () => {
		const service = setup();
		const record = service.repository.get('coreografa');
		const second = structuredClone(record.state.box.party[0]);
		second.pokemonId = 'second-pokemon';
		record.state.box.party.push(second);
		record.state.trainerSheet.talents.class.push('coreografo:formacao-em-dupla');
		record.state.trainerSheet.talents.apex = 'coreografo:geometria-em-movimento';
		service.repository.set(record);
		const ids = record.state.box.party.map(entry => entry.pokemonId);
		assert.throws(() => service.prepareTrainerChoreography('token', {
			requestId: 'formacao_sem_ensaio', kind: 'formation', pokemonIds: ids,
		}), /Ensaie individualmente/);
		for (const [index, id] of ids.entries()) service.prepareTrainerChoreography('token', {
			requestId: `ensaio_formacao_${index}`, kind: 'rehearsal', pokemonIds: [id],
		});
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'coreografa' });
		service.prepareTrainerChoreography('token', { requestId: 'formacao_ensaiada_001',
			kind: 'formation', pokemonIds: ids });
		assert.equal(service.trainerContestChoreography('coreografa', [0, 1]).formation, false);
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		const choreography = service.trainerContestChoreography('coreografa', [0, 1]);
		assert.equal(choreography.formation, true);
		const manager = new RPGContestRuntimeManager({
			getTrainerSheet: id => service.repository.get(id)?.state.trainerSheet,
		});
		const participant = { characterId: 'coreografa', disqualified: false, choreography,
			rounds: [[], []], roundScores: [null, null] };
		assert.equal(manager.trainerContestBonus({ session: { mode: 'duo', category: 'beauty' } },
			participant), 5);
	});

	it('expira a direção convidada sem acumulá-la e nunca a concede antes do ensaio', () => {
		const service = setup();
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		service.prepareTrainerChoreography('token', { requestId: 'direcao_convidada_001',
			kind: 'guest', characterId: 'aliado', pokemonIds: [pokemonId] });
		assert.equal(service.trainerContestChoreography('aliado', [0]).guest, false);
		assert.throws(() => service.prepareTrainerChoreography('token', {
			requestId: 'direcao_convidada_002', kind: 'guest', characterId: 'aliado', pokemonIds: [pokemonId],
		}), /já possui Diretor Convidado/);
		service.getSession = () => ({ mode: 'master', role: 'master', platformTableId: 'mesa-teste' });
		service.advanceCampaignTime('token', 1);
		assert.equal(service.trainerContestChoreography('aliado', [0]).guest, true);
		service.advanceCampaignTime('token', 1);
		assert.equal(service.trainerContestChoreography('aliado', [0]).guest, false);
	});
});
