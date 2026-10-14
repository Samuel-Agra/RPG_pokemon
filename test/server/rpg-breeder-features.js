'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository,
	createRPGPendingTrainerSheet, RPGContestRuntimeManager } = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalents } = require('../../dist/server/rpg-showdown/trainer-roll-talents');

function setup() {
	const service = new RPGLoginService({ masterCode: 'teste',
		repository: new RPGMemoryCharacterRepository() });
	for (const name of ['Criador', 'Aliado']) {
		service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = service.repository.get(name.toLowerCase());
		record.tableId = 'mesa-teste'; record.accountId = `account-${name.toLowerCase()}`;
		record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
			classId: name === 'Criador' ? 'criador-pokemon' : 'atleta', level: 1,
			talents: { general: [], class: [], apex: null } };
		service.repository.set(record);
	}
	service.getSession = () => ({ mode: 'player', role: 'player',
		platformTableId: 'mesa-teste', characterId: 'criador' });
	service.accounts.repository.getMembership = () => ({ status: 'active' });
	const breeder = service.repository.get('criador');
	service.ensureTrainerInventory(breeder).items.push({
		id: 'kit-criador', itemId: 'kit-medicina-pokemon', quantity: 1, location: 'bag', charges: 5,
	});
	service.repository.set(breeder);
	return service;
}

describe('RPG características do Criador Pokémon', () => {
	it('revela somente tempo, espécie e sexo de Egg do próprio treinador com ajuda de Criador', () => {
		const service = setup();
		const ally = service.repository.get('aliado');
		const egg = { id: 'ovo-teste', ownerId: 'aliado', status: 'carried', createdAt: 1,
			genetics: { species: 'Eevee', sex: 'F', nature: 'Jolly', ability: 'Run Away',
				shiny: true, ivs: {}, ivOrigins: {}, moves: [], eggMoves: [], family: 'field',
				lineage: '', parentIds: ['', ''], parentOwnerIds: ['', ''] } };
		ally.state.nursery = { version: 1, projects: [{ id: 'projeto', egg }],
			incubators: [], releasedPokemon: [] };
		service.repository.set(ally);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'aliado' });
		const result = service.examineNurseryEgg('token', 'ovo-teste', 'criador');
		assert.equal(result.species, 'Eevee');
		assert.equal(result.sex, 'F');
		assert(!('shiny' in result));
		assert.throws(() => service.examineNurseryEgg('token', 'ovo-teste', 'aliado'), /Criador/);
	});

	it('lista Pokémon desmaiados por treinador e impede novo atendimento antes de sete dias', () => {
		const service = setup();
		const ally = service.repository.get('aliado');
		const pokemon = ally.state.box.party[0];
		pokemon.pokemon.rpg.hp = 0;
		service.repository.set(ally);
		const before = service.getFirstCareCandidates('token');
		assert(before.players.some(player => player.name === 'Aliado' &&
			player.pokemon.some(entry => entry.id === pokemon.pokemonId)));
		const candidate = before.players.find(player => player.name === 'Aliado').pokemon[0];
		assert.equal(candidate.species, 'Squirtle');
		assert.equal(candidate.level, pokemon.pokemon.level);
		assert.deepEqual(candidate.types, ['Water']);
		assert.equal(candidate.hp, 0);
		assert(candidate.maxHP > 0);
		assert(candidate.spriteId);
		const healed = service.performFirstCare('token', 'aliado', pokemon.pokemonId);
		assert.equal(healed.hp, 1);
		assert.equal(service.repository.get('aliado').state.box.party[0].pokemon.rpg.hp, 1);
		const faintedAgain = service.repository.get('aliado');
		faintedAgain.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(faintedAgain);
		assert.throws(() => service.performFirstCare('token', 'aliado', pokemon.pokemonId), /ainda não/);
	});

	it('reduz o intervalo de Primeiros Cuidados para cinco dias com Recuperação Acompanhada', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:recuperacao-acompanhada');
		service.repository.set(breeder);
		const ally = service.repository.get('aliado');
		const pokemon = ally.state.box.party[0];
		pokemon.pokemon.rpg.hp = 0;
		pokemon.metadata = { ...pokemon.metadata,
			lastFirstCareAt: Date.parse(service.campaignSettings.currentDateTime) - 5 * 86_400_000 };
		service.repository.set(ally);
		const entry = service.getFirstCareCandidates('token').players.find(player => player.name === 'Aliado').pokemon[0];
		assert.equal(entry.remainingMs, 0);
		assert.equal(service.performFirstCare('token', 'aliado', pokemon.pokemonId).hp, 1);
	});

	it('Restaurador Pokémon cura 10% dos PV máximos e libera novo atendimento após dois dias', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.level = 10;
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:recuperacao-acompanhada');
		breeder.state.trainerSheet.talents.apex = 'criador-pokemon:restaurador-pokemon';
		service.repository.set(breeder);
		const ally = service.repository.get('aliado');
		const pokemonId = ally.state.box.party[0].pokemonId;
		ally.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(ally);
		const candidate = service.getFirstCareCandidates('token').players
			.find(player => player.characterId === 'aliado').pokemon[0];
		const expected = Math.ceil(candidate.maxHP * 0.1);
		assert.equal(service.performFirstCare('token', 'aliado', pokemonId).hp, expected);
		assert.equal(service.repository.get('aliado').state.box.party[0].pokemon.rpg.hp, expected);
		const fainted = service.repository.get('aliado');
		fainted.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(fainted);
		assert.throws(() => service.performFirstCare('token', 'aliado', pokemonId), /ainda não/);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			2 * 86_400_000).toISOString();
		assert.equal(service.performFirstCare('token', 'aliado', pokemonId).hp, expected);
	});

	it('oferece Manejo sem Estresse nas perícias de cuidado, condução e transporte', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:manejo-sem-estresse');
		const talent = rpgTrainerRollTalents(breeder.state.trainerSheet)
			.find(entry => entry.id === 'criador-pokemon:manejo-sem-estresse');
		assert.equal(talent.bonus, 2);
		for (const skill of ['empatia-pokemon', 'adestramento-pokemon', 'medicina-pokemon',
			'atletismo', 'montaria-pokemon']) assert(talent.targets.includes(`skill:${skill}`));
		assert(!talent.targets.includes('skill:captura'));
	});

	it('oferece Ninho Intacto somente em Percepção e Sobrevivência', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:ninho-intacto');
		const talent = rpgTrainerRollTalents(breeder.state.trainerSheet)
			.find(entry => entry.id === 'criador-pokemon:ninho-intacto');
		assert.deepEqual(talent.targets, ['skill:percepcao', 'skill:sobrevivencia']);
		assert.equal(talent.bonus, 2);
	});

	it('aplica Rotina de Enriquecimento uma vez por Pokémon a cada dois dias da mesa', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:rotina-de-enriquecimento');
		service.repository.set(breeder);
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		const input = { requestId: 'rotina-teste-1', characterId: 'aliado', pokemonId };
		const first = service.useTrainerEnrichmentRoutine('token', input);
		assert.equal(first.result.friendshipGained, 5);
		assert.equal(service.useTrainerEnrichmentRoutine('token', input).repeated, true);
		assert.throws(() => service.useTrainerEnrichmentRoutine('token', { ...input,
			requestId: 'rotina-teste-2' }), /últimos dois dias/);
		const allyPokemon = service.repository.get('aliado').state.box.party[0].pokemon;
		assert.equal(allyPokemon.rpg.lastEnrichmentRoutineAt,
			Date.parse(service.campaignSettings.currentDateTime));
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			2 * 86_400_000).toISOString();
		assert.equal(service.useTrainerEnrichmentRoutine('token', { ...input,
			requestId: 'rotina-teste-3' }).result.friendshipGained, 5);
	});

	it('Guardião de Gerações aplica uma rotina atômica a até seis Pokémon a cada sete dias', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.level = 10;
		breeder.state.trainerSheet.talents.apex = 'criador-pokemon:guardiao-de-geracoes';
		service.repository.set(breeder);
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		const input = { requestId: 'guardian-teste-1', pokemon: [{ characterId: 'aliado', pokemonId }] };
		assert.equal(service.useTrainerGuardianEnrichment('token', input).result.pokemon[0].friendshipGained, 5);
		assert.equal(service.useTrainerGuardianEnrichment('token', input).repeated, true);
		assert.throws(() => service.useTrainerGuardianEnrichment('token', { ...input,
			requestId: 'guardian-teste-2' }), /sete dias/);
		assert.throws(() => service.useTrainerGuardianEnrichment('token', { ...input,
			requestId: 'guardian-teste-3', pokemon: [input.pokemon[0], input.pokemon[0]] }), /apenas uma vez/);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			7 * 86_400_000).toISOString();
		assert.equal(service.useTrainerGuardianEnrichment('token', { ...input,
			requestId: 'guardian-teste-4' }).result.pokemon[0].friendshipGained, 5);
	});

	it('prepara um Pokémon para apenas seu primeiro concurso antes do avanço do relógio', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:preparacao-impecavel');
		service.repository.set(breeder);
		const pokemonId = service.repository.get('aliado').state.box.party[0].pokemonId;
		const input = { requestId: 'preparo-teste-1', characterId: 'aliado', pokemonId };
		assert.equal(service.useTrainerImpeccablePreparation('token', input).result.name, 'Squirtle');
		assert.equal(service.useTrainerImpeccablePreparation('token', input).repeated, true);
		assert.equal(service.contestImpeccablePreparationPrepared('aliado', [0]), true);
		const manager = new RPGContestRuntimeManager({
			getCharacterTeam: id => service.repository.get(id)?.state.team,
			getImpeccablePreparation: (id, indexes) => service.contestImpeccablePreparationPrepared(id, indexes),
		});
		const contest = manager.start({ id: 'concurso-preparo', status: 'started', mode: 'solo',
			category: 'beauty', rank: 'normal', scenario: { id: 'stage', name: 'Palco', tags: [] },
			participants: [{ id: 'aliado', kind: 'player', displayName: 'Aliado', characterId: 'aliado',
				pokemon: { teamIndex: 0 } }], presentationOrder: ['aliado'] });
		assert.equal(contest.participants[0].impeccablePreparationBonus, 2);
		service.consumeContestHarmonizations(contest.participants);
		assert.equal(service.contestImpeccablePreparationPrepared('aliado', [0]), false);
		service.useTrainerImpeccablePreparation('token', { ...input, requestId: 'preparo-teste-2' });
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			3_600_000).toISOString();
		assert.equal(service.contestImpeccablePreparationPrepared('aliado', [0]), false);
	});

	it('economiza uma carga com Socorro Bem Administrado apenas em resultados 5 ou 6', () => {
		const service = setup();
		const breeder = service.repository.get('criador');
		breeder.state.trainerSheet.talents.class.push('criador-pokemon:socorro-bem-administrado',
			'criador-pokemon:recuperacao-acompanhada');
		service.repository.set(breeder);
		const ally = service.repository.get('aliado');
		const pokemonId = ally.state.box.party[0].pokemonId;
		ally.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(ally);
		service.random = () => 0.75;
		const first = service.performFirstCare('token', 'aliado', pokemonId);
		assert.equal(first.supplyRoll, 5);
		assert.equal(first.chargeSaved, true);
		assert.equal(first.kitCharges, 5);
		const fainted = service.repository.get('aliado');
		fainted.state.box.party[0].pokemon.rpg.hp = 0;
		service.repository.set(fainted);
		service.campaignSettings.currentDateTime = new Date(Date.parse(service.campaignSettings.currentDateTime) +
			5 * 86_400_000).toISOString();
		service.random = () => 0;
		const second = service.performFirstCare('token', 'aliado', pokemonId);
		assert.equal(second.supplyRoll, 1);
		assert.equal(second.chargeSaved, false);
		assert.equal(second.kitCharges, 4);
	});
});
