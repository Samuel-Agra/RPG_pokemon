'use strict';

const assert = require('assert').strict;
const {
	RPG_TRAINER_CLASSES, RPG_TRAINER_TALENTS, RPG_TRAINER_CLASS_FEATURES,
	RPG_TRAINER_LEVEL_XP, createRPGPendingTrainerSheet, chooseRPGTrainerTalent,
	rpgTrainerTalentCatalog, rpgTrainerClassFeatures, rpgTrainerDerivedStatistics,
	rpgTrainerSkillBonus, rpgTrainerResistanceBonus, rpgTrainerProficiency, rollRPGTrainerInitiative,
	rpgTrainerSkillAttributes,
	awardRPGTrainerXP, completeRPGTrainerSheet, RPGLoginService, RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalents } = require('../../dist/server/rpg-showdown/trainer-roll-talents');
const { RPGBagSystem } = require('../../dist/sim/rpg-showdown');

function ready(classId, level = 1, overrides = {}) {
	return {
		...createRPGPendingTrainerSheet(), status: 'complete', classId, level,
		experience: RPG_TRAINER_LEVEL_XP[level - 1],
		attributes: { strength: 12, dexterity: 14, constitution: 13,
			intelligence: 14, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
		skills: { trained: ['atletismo', 'acrobacia', 'investigacao', 'conhecimento:arqueologia-fosseis'], focused: [] },
		proficiencies: ['kit-arqueologia'], ...overrides,
	};
}

describe('RPG trainer classes and talents', () => {
	it('exibe Mestre dos Biomas no antigo identificador sem perder escolhas salvas', () => {
		const apex = RPG_TRAINER_TALENTS.find(entry => entry.id === 'explorador:instinto-de-descoberta');
		assert.equal(apex.name, 'Ápice — Mestre dos Biomas');
		assert.equal(apex.prerequisite, 'Explorador nível 10.');
		assert.match(apex.text, /Acampamento adaptado/);
		assert.doesNotMatch(apex.text, /pista conclusiva/);
	});
	it('Leitura do Horizonte oferece somente Constituição ou Sabedoria', () => {
		const explorer = ready('explorador', 5);
		const option = rpgTrainerTalentCatalog(explorer)
			.find(entry => entry.id === 'explorador:leitura-do-horizonte');
		assert.deepEqual(option.attributeChoices, ['constitution', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(explorer,
			{ id: option.id, attribute: 'strength' }), /atributo permitido/);
		const chosen = chooseRPGTrainerTalent(explorer, { id: option.id, attribute: 'constitution' });
		assert.equal(chosen.attributes.constitution, explorer.attributes.constitution + 1);
		assert.equal(chosen.attributes.wisdom, explorer.attributes.wisdom);
	});
	it('Vigília Perimetral usa a CD definida pelo teste de Sobrevivência', () => {
		const talent = RPG_TRAINER_TALENTS.find(entry => entry.id === 'explorador:vigilia-perimetral');
		assert.match(talent.text, /CD igual ao resultado de um teste de Sobrevivência/);
		assert.doesNotMatch(talent.text, /Percepção passiva/);
	});
	it('Especialista de Terreno oferece oito terrenos e registra escolhas distintas', () => {
		const explorer = ready('explorador', 5);
		const option = rpgTrainerTalentCatalog(explorer)
			.find(entry => entry.id === 'explorador:especialista-de-terreno');
		assert.deepEqual(option.variantChoices, ['floresta', 'montanha', 'deserto', 'pantano',
			'ambiente-gelado', 'litoral', 'subterraneo', 'urbano-em-ruinas']);
		assert.throws(() => chooseRPGTrainerTalent(explorer,
			{ id: option.id, variant: 'oceano' }), /Terreno inválido/);
		const first = chooseRPGTrainerTalent(explorer, { id: option.id, variant: 'pantano' });
		assert.deepEqual(rpgTrainerTalentCatalog(first).find(entry => entry.id === option.id).variantChoices,
			option.variantChoices.filter(terrain => terrain !== 'pantano'));
		assert.throws(() => chooseRPGTrainerTalent(first,
			{ id: option.id, variant: 'pantano' }), /variante nova/);
		const second = chooseRPGTrainerTalent(first, { id: option.id, variant: 'urbano-em-ruinas' });
		assert.deepEqual(second.talentSelections.filter(entry => entry.id === option.id)
			.map(entry => entry.variant), ['pantano', 'urbano-em-ruinas']);
	});
	it('forrageio exige aprovação do Mestre e entrega Alimentos uma única vez', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Explorador', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('explorador');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('explorador', 5, { talents: { general: [],
			class: ['explorador:forrageador-eficiente'], apex: null } });
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [], items: [] };
		repository.set(record);
		let master = false;
		service.getSession = () => master ? { role: 'master', mode: 'master', platformTableId: 'mesa-teste' } :
			{ role: 'player', mode: 'player', platformTableId: 'mesa-teste', characterId: 'explorador' };
		const request = service.requestTrainerForage('jogador', 'forage-test-1').request;
		assert.equal(request.status, 'pending');
		assert.equal(repository.get('explorador').state.trainerInventory.items.length, 0);
		assert.throws(() => service.requestTrainerForage('jogador', 'forage-test-2'), /aguardando avaliação/);
		master = true;
		assert.equal(service.decideTrainerForage('mestre', request.id, true).request.status, 'accepted');
		assert.equal(repository.get('explorador').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0),
		rpgTrainerProficiency(5));
		assert.equal(service.decideTrainerForage('mestre', request.id, true).repeated, true);
	});
	it('Localizador de Desaparecidos acrescenta Sabedoria ao ser aprendido', () => {
		const explorer = ready('explorador', 3);
		const learned = chooseRPGTrainerTalent(explorer, { id: 'explorador:localizador-de-desaparecidos' });
		assert.equal(learned.attributes.wisdom, explorer.attributes.wisdom + 1);
	});
	it('move Cartografia de Campo do nível 1 para talento específico do Explorador', () => {
		assert.deepEqual(RPG_TRAINER_CLASS_FEATURES.explorador.map(feature => feature.name),
			['Desbravador', 'Rastreador Persistente', 'Acampamento Seguro']);
		const explorer = ready('explorador', 3);
		const options = rpgTrainerTalentCatalog(explorer);
		assert.equal(options.find(entry => entry.id === 'explorador:cartografia-de-campo').available, true);
		assert.equal(options.find(entry => entry.id === 'explorador:rota-de-retorno').available, false);
		const learned = chooseRPGTrainerTalent(explorer, { id: 'explorador:cartografia-de-campo' });
		assert(learned.talents.class.includes('explorador:cartografia-de-campo'));
		assert.equal(rpgTrainerTalentCatalog(ready('explorador', 5, {
			talents: { ...learned.talents, class: ['explorador:cartografia-de-campo'] },
		})).find(entry => entry.id === 'explorador:rota-de-retorno').available, true);
	});
	it('consome uma carga real do Kit de Disfarce e explica quando o kit acaba', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Encantador', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('encantador');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 5, {
			talents: { general: [], class: ['encantador:disfarce-social'], apex: null },
			proficiencies: ['kit-disfarce'],
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-disfarce', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'encantador' });
		assert.equal(service.useTrainerSocialDisguise('jogador').chargesRemaining, 0);
		assert.equal(repository.get('encantador').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.useTrainerSocialDisguise('jogador'), /sem cargas/);
	});
	it('aplica apenas o aumento fixo de Carisma de Presença Desarmante', () => {
		const before = ready('encantador', 7, { talents: { general: [],
			class: ['encantador:sem-ressentimentos'], apex: null } });
		const option = rpgTrainerTalentCatalog(before).find(talent => talent.id === 'encantador:presenca-desarmante');
		assert.deepEqual(option.attributeChoices, []);
		const after = chooseRPGTrainerTalent(before, { id: option.id });
		assert.equal(after.attributes.charisma, before.attributes.charisma + 1);
	});
	it('submete Confidente com Persuasão normal e trava o nome somente após aprovação', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0.45 });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 3, { attributes: {
			strength: 12, dexterity: 14, constitution: 13, intelligence: 14, wisdom: 12, charisma: 14,
		}, skills: { trained: ['persuasao'], focused: [] } });
		record.state.trainerSheet.talents.class.push('encantador:confidente', 'encantador:visual-adequado');
		repository.set(record);
		service.getSession = token => ['mestre', 'outra-mesa'].includes(token) ? { role: 'master', mode: 'master',
			platformTableId: token === 'mestre' ? 'mesa-teste' : 'outra-mesa' } : { role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' };
		const first = service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-1', confidantName: 'Marina',
		});
		assert.equal(first.request.roll.bonus, 4);
		assert.equal(first.request.roll.total, first.request.roll.natural + 4);
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, undefined);
		assert.equal(service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-1', confidantName: 'Marina',
		}).request.roll.total, first.request.roll.total);
		assert.throws(() => service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-2', confidantName: 'Outra',
		}), /aguardando avaliação/);
		assert.throws(() => service.decideTrainerConfidant('jogador', first.request.id, true), /master session/);
		assert.throws(() => service.decideTrainerConfidant('outra-mesa', first.request.id, true), /fora da mesa/);
		assert.equal(service.decideTrainerConfidant('mestre', first.request.id, false).request.status, 'rejected');
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, undefined);
		const second = service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-2', confidantName: 'Marina',
		});
		assert.equal(service.decideTrainerConfidant('mestre', second.request.id, true).confidantName, 'Marina');
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, 'Marina');
		const restored = new RPGLoginService({ masterCode: 'teste', repository,
			campaignSettings: service.getCampaignSettings('mestre') });
		assert.equal(restored.repository.get('ana').state.trainerSheet.confidantName, 'Marina');
		assert.throws(() => service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-3', confidantName: 'Outra',
		}), /já possui um confidente/);
	});
	it('aprova Laço Verdadeiro por evento e reserva a remoção ao Mestre como jogador', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 10, {
			talents: { general: [], class: ['encantador:confidente',
				'encantador:confianca-compartilhada'], apex: 'encantador:laco-verdadeiro' },
		});
		repository.set(record);
		service.getSession = token => token === 'mestre' ? { role: 'master', mode: 'master',
			platformTableId: 'mesa-teste' } : token === 'mestre-jogador' ? { role: 'master', mode: 'player',
			platformTableId: 'mesa-teste', viewAsCharacterId: 'ana' } : token === 'outra-mesa' ? {
			role: 'master', mode: 'master', platformTableId: 'mesa-outra',
		} : { role: 'player', mode: 'player', platformTableId: 'mesa-teste', characterId: 'ana' };
		const first = service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-1', npcName: 'Marina',
		});
		assert.equal(first.request.status, 'pending');
		assert.equal(service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-1', npcName: 'Marina',
		}).repeated, true);
		assert.throws(() => service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-2', npcName: 'Outra',
		}), /aguardando avaliação/);
		assert.throws(() => service.decideTrainerTrueBond('outra-mesa', first.request.id, true), /fora da mesa/);
		assert.equal(service.decideTrainerTrueBond('mestre', first.request.id, false).request.status, 'rejected');
		const second = service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-2', npcName: 'Marina',
		});
		assert.equal(service.decideTrainerTrueBond('mestre', second.request.id, true).npcName, 'Marina');
		assert.equal(repository.get('ana').state.trainerSheet.trueBondNpcName, 'Marina');
		assert.throws(() => service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-3', npcName: 'Outra',
		}), /já possui um Laço Verdadeiro/);
		assert.throws(() => service.removeTrainerTrueBond('jogador'), /Apenas o Mestre/);
		assert.throws(() => service.removeTrainerTrueBond('mestre'), /Apenas o Mestre/);
		assert.equal(service.removeTrainerTrueBond('mestre-jogador').removed, true);
		assert.equal(repository.get('ana').state.trainerSheet.trueBondNpcName, undefined);
		const restored = new RPGLoginService({ masterCode: 'teste', repository,
			campaignSettings: service.getCampaignSettings('mestre') });
		restored.getSession = service.getSession;
		assert.equal(restored.getCampaignSettings('mestre').trueBondRequests.length, 2);
	});
	it('preserva o identificador do ápice do Diplomata como Voz por Procuração', () => {
		const option = rpgTrainerTalentCatalog(ready('diplomata', 10)).find(entry =>
			entry.id === 'diplomata:acordo-impossivel');
		assert.equal(option.name, 'Ápice — Voz por Procuração');
		assert.equal(option.available, true);
		assert.match(option.text, /bônus base de Persuasão do Diplomata/);
	});
	it('mantém o talento antigo do Diplomata sob o nome Exceção Negociada e exige salvo-conduto', () => {
		const diplomat = ready('diplomata', 5);
		const option = () => rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:licenca-facilitada');
		assert.equal(option().name, 'Exceção Negociada');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(diplomat, { id: option().id }), /pré-requisito/);
		diplomat.talents.class.push('diplomata:conhecimento-de-jurisdicao');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(diplomat, { id: option().id }).talents.class.includes(option().id));
		assert.match(option().text, /cláusula especial/);
	});
	it('concede automaticamente Carisma ao adquirir Porta-Voz Reconhecido', () => {
		const diplomat = ready('diplomata', 3);
		const option = rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:porta-voz-reconhecido');
		assert.deepEqual(option.attributeChoices, []);
		const chosen = chooseRPGTrainerTalent(diplomat, { id: option.id });
		assert.equal(chosen.attributes.charisma, diplomat.attributes.charisma + 1);
		assert.throws(() => chooseRPGTrainerTalent(diplomat,
			{ id: option.id, attribute: 'charisma' }), /não concede aumento de atributo/);
	});
	it('exige Conhecimento: Regiões treinado para Etiqueta Cosmopolita', () => {
		const diplomat = ready('diplomata', 3);
		const option = () => rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:etiqueta-cosmopolita');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(diplomat, { id: option().id }),
			/treinamento na perícia/);
		diplomat.skills.trained.push('conhecimento:regioes');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(diplomat, { id: option().id }).talents.class.includes(option().id));
		assert.match(option().text, /CD 10:[\s\S]*CD 15:[\s\S]*CD 20:/);
	});
	it('orienta apenas aliados escolhidos após sucesso em Conhecimento: Regiões', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready('diplomata', 3, { skills: {
				trained: ['conhecimento:regioes'], focused: [],
			} });
			repository.set(record);
		}
		const owner = repository.get('ana');
		owner.state.trainerSheet.talents.class.push('diplomata:etiqueta-cosmopolita');
		repository.set(owner);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.random = () => 0.99;
		assert.throws(() => service.setTrainerCosmopolitanEtiquette('teste', 'Vila', 10,
			['bia', 'caio', 'outro']), /bônus de proficiência/);
		const result = service.setTrainerCosmopolitanEtiquette('teste', 'Vila', 10, ['bia']);
		assert.equal(result.roll.success, true);
		assert.deepEqual(result.orientation.recipientCharacterIds, ['ana', 'bia']);
		const own = service.getTrainerAllyRollTalents('teste', 'ana');
		const ally = service.getTrainerAllyRollTalents('teste', 'bia');
		const other = service.getTrainerAllyRollTalents('teste', 'caio');
		assert.equal(own.find(entry => entry.id === 'diplomata:etiqueta-cosmopolita').bonus, 2);
		assert.deepEqual(ally.find(entry => entry.id === 'diplomata:etiqueta-cosmopolita').targets,
			['skill:persuasao', 'skill:enganacao', 'skill:intimidacao']);
		assert.equal(other.some(entry => entry.id === 'diplomata:etiqueta-cosmopolita'), false);
		service.random = () => 0;
		const failed = service.setTrainerCosmopolitanEtiquette('teste', 'Outra Vila', 20, ['caio']);
		assert.equal(failed.roll.success, false);
		assert.deepEqual(failed.orientation, result.orientation);
	});
	it('permite ao Detetive escolher Inteligência ou Sabedoria em Perfil Investigativo', () => {
		const original = ready('detetive', 3);
		const option = rpgTrainerTalentCatalog(original).find(entry => entry.id === 'detetive:perfil-investigativo');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(original, { id: option.id }), /Escolha um atributo/);
		for (const attribute of option.attributeChoices) {
			const chosen = chooseRPGTrainerTalent(original, { id: option.id, attribute });
			assert.equal(chosen.attributes[attribute], original.attributes[attribute] + 1);
		}
	});
	it('oferece Arquivo de Casos e Vigilância Discreta apenas nas perícias apropriadas', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:arquivo-de-casos', 'detetive:vigilancia-discreta');
		const options = rpgTrainerRollTalents(detective);
		const archive = options.find(option => option.id === 'detetive:arquivo-de-casos');
		const surveillance = options.find(option => option.id === 'detetive:vigilancia-discreta');
		assert.deepEqual(archive.targets, ['skill:investigacao']);
		assert.equal(archive.bonus, 2);
		assert.deepEqual(surveillance.targets, ['skill:percepcao', 'skill:furtividade']);
		assert.equal(surveillance.bonus, 2);
	});
	it('só oferece o bônus do Parceiro Investigativo após vínculo válido e enquanto ele está disponível', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:parceiro-investigativo');
		const partner = () => rpgTrainerRollTalents(detective).find(option =>
			option.id === 'detetive:parceiro-investigativo');
		assert.equal(partner(), undefined);
		detective.investigativePartnerPokemonId = 'pokemon-1';
		assert.deepEqual(partner().targets, ['skill:investigacao', 'skill:percepcao']);
		detective.investigativePartnerUnavailable = true;
		assert.equal(partner(), undefined);
	});
	it('vincula o Parceiro Investigativo uma vez e reserva a desvinculação ao Mestre', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 5);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-investigativo');
		repository.set(record);
		const playerSession = { mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: 'ana' };
		const masterSession = { ...playerSession, role: 'master', viewAsCharacterId: 'ana' };
		service.getSession = () => playerSession;
		assert.throws(() => service.setTrainerInvestigativePartner('teste', 'outro'), /Pokémon seu/);
		const pokemonId = record.state.box.party[0].pokemonId;
		const unfriendly = repository.get('ana');
		unfriendly.state.box.party[0].pokemon.rpg.friendship = 49;
		repository.set(unfriendly);
		assert.throws(() => service.setTrainerInvestigativePartner('teste', pokemonId), /50 de Amizade/);
		unfriendly.state.box.party[0].pokemon.rpg.friendship = 50;
		repository.set(unfriendly);
		assert.equal(service.setTrainerInvestigativePartner('teste', pokemonId).pokemonId, pokemonId);
		assert.equal(repository.get('ana').state.trainerSheet.investigativePartnerName, 'Squirtle');
		assert.throws(() => service.setTrainerInvestigativePartner('teste', pokemonId), /já foi escolhido/);
		assert.throws(() => service.setTrainerInvestigativePartner('teste', null), /Somente o Mestre/);
		service.getSession = () => masterSession;
		assert.equal(service.setTrainerInvestigativePartner('teste', null).pokemonId, null);
		assert.equal(repository.get('ana').state.trainerSheet.investigativePartnerName, undefined);
	});
	it('Voz do Parceiro usa o Pokémon já vinculado como Parceiro Investigativo', () => {
		const voice = RPG_TRAINER_TALENTS.find(talent => talent.id === 'detetive:voz-do-parceiro');
		assert.match(voice.text, /Pokémon já vinculado como Parceiro Investigativo/);
		assert.doesNotMatch(voice.text, /escolhe definitivamente o Pokémon/);
	});
	it('Dupla Indissociável usa somente o parceiro vinculado e presente na equipe', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 10);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-investigativo', 'detetive:voz-do-parceiro');
		record.state.trainerSheet.talents.apex = 'detetive:dupla-indissociavel';
		record.state.trainerSheet.investigativePartnerPokemonId = record.state.box.party[0].pokemonId;
		// EV e IV não podem entrar no bônus, que usa o Ataque Especial base da espécie.
		record.state.box.party[0].pokemon.evs.spa = 252;
		record.state.box.party[0].pokemon.ivs.spa = 31;
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		const duo = () => service.getTrainerAllyRollTalents('teste', 'ana').find(option =>
			option.id === 'detetive:dupla-indissociavel');
		assert.equal(duo().bonus, 2);
		assert.match(duo().condition, /Squirtle/);
		record.state.trainerSheet.investigativePartnerPokemonId = 'outro';
		repository.set(record);
		assert.equal(duo(), undefined);
		record.state.trainerSheet.investigativePartnerPokemonId = record.state.box.party[0].pokemonId;
		record.state.box.party[0].pokemon.rpg.hp = 0;
		repository.set(record);
		assert.equal(duo(), undefined);
		record.state.box.party[0].pokemon.rpg.hp = 10;
		record.state.box.party[0].metadata.evTraining = { readyAt: '2026-10-15T12:00:00.000Z' };
		repository.set(record);
		assert.equal(duo(), undefined);
	});
	it('mostra Passo de Perseguição e Contradição Explorada somente nas perícias indicadas', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:passo-de-perseguicao', 'detetive:contradicao-explorada');
		const options = rpgTrainerRollTalents(detective);
		assert.deepEqual(options.find(option => option.id === 'detetive:passo-de-perseguicao').targets,
			['skill:atletismo', 'skill:acrobacia', 'skill:pilotagem:*']);
		assert.deepEqual(options.find(option => option.id === 'detetive:contradicao-explorada').targets,
			['skill:persuasao', 'skill:intimidacao']);
	});
	it('salva o nome de Parceiro de Confiança apenas para quem possui o talento', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 7);
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		assert.throws(() => service.setTrainerTrustedPartnerName('teste', 'Lia'), /não possui/);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-de-confianca');
		repository.set(record);
		assert.equal(service.setTrainerTrustedPartnerName('teste', '  Lia  ').name, 'Lia');
		assert.equal(repository.get('ana').state.trainerSheet.trustedPartnerName, 'Lia');
		assert.throws(() => service.setTrainerTrustedPartnerName('teste', 'x'.repeat(81)), /80 caracteres/);
	});
	it('prepara o Plano de Captura após 30 minutos e consome o bônus por participante', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'detetive' : 'atleta', 7);
			repository.set(record);
		}
		const detective = repository.get('ana');
		detective.state.trainerSheet.talents.class.push('detetive:plano-de-captura');
		repository.set(detective);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.campaignSettings.currentDateTime = '2026-10-15T12:00:00.000Z';
		assert.throws(() => service.setTrainerCapturePlan('teste', 'Alvo no cais', ['ana', 'ana']),
			/participantes diferentes/);
		assert.throws(() => service.setTrainerCapturePlan('teste', 'Alvo no cais', ['intruso']),
			/indisponível/);
		const { plan } = service.setTrainerCapturePlan('teste', 'Alvo no cais', ['ana', 'bia']);
		assert.equal(plan.readyAt, '2026-10-15T12:30:00.000Z');
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(option =>
			option.id === 'detetive:plano-de-captura'), false);
		service.campaignSettings.currentDateTime = plan.readyAt;
		const option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'detetive:plano-de-captura');
		assert(option);
		service.consumeTrainerCapturePlanRoll('teste', 'bia', [option.key]);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		assert(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key));
		assert.deepEqual(repository.get('ana').state.trainerSheet.capturePlan.usedRecipientIds, ['bia']);
		assert.equal(service.setTrainerCapturePlan('teste', '', []).plan, null);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key), false);
	});
	it('entrega uma Carta de Apresentação a um aliado, substitui a anterior e consome o primeiro bônus', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'diplomata' : 'atleta', 5);
			repository.set(record);
		}
		const diplomat = repository.get('ana');
		diplomat.state.trainerSheet.talents.class.push('diplomata:carta-de-apresentacao');
		repository.set(diplomat);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.throws(() => service.setTrainerIntroductionLetter('teste', 'ana', 'Museu', 'Acesso'), /aliado/);
		assert.throws(() => service.setTrainerIntroductionLetter('teste', 'intruso', 'Museu', 'Acesso'), /aliado/);
		service.setTrainerIntroductionLetter('teste', 'bia', 'Museu', 'Pesquisa');
		let option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:carta-de-apresentacao');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['skill:persuasao']);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key), false);
		const oldKey = option.key;
		service.setTrainerIntroductionLetter('teste', 'bia', 'Biblioteca', 'Pesquisa histórica');
		option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:carta-de-apresentacao');
		assert.notEqual(option.key, oldKey);
		service.consumeTrainerIntroductionLetterRoll('teste', 'bia', [oldKey]);
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter.used, false);
		assert.match(option.condition, /Biblioteca/);
		assert.doesNotMatch(option.condition, /Museu/);
		service.consumeTrainerIntroductionLetterRoll('teste', 'bia', [option.key]);
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter.used, true);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		service.setTrainerIntroductionLetter('teste', '', '', '');
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter, undefined);
	});
	it('prepara Voz por Procuração para aliados distintos, respeita o relógio e consome cada uso', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'diplomata' : 'atleta', 10);
			repository.set(record);
		}
		const diplomat = repository.get('ana');
		diplomat.state.trainerSheet.talents.apex = 'diplomata:acordo-impossivel';
		diplomat.state.trainerSheet.attributes.charisma = 18;
		diplomat.state.trainerSheet.skills.trained.push('persuasao');
		diplomat.state.trainerSheet.skills.focused.push('persuasao');
		repository.set(diplomat);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [
			{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }, { id: 'caio', name: 'Caio' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.campaignSettings.currentDateTime = '2026-10-15T12:00:00.000Z';
		assert.throws(() => service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'ana', proposal: 'Abrir a rota', audience: 'Guarda' }]), /Aliado indisponível/);
		assert.throws(() => service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda' },
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda' }]), /repetido/);
		const { preparation } = service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda local' },
			{ characterId: 'caio', proposal: 'Acesso ao arquivo', audience: 'Bibliotecária' }]);
		assert.equal(preparation.readyAt, '2026-10-15T12:10:00.000Z');
		assert.equal(preparation.expiresAt, '2026-10-16T12:10:00.000Z');
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry =>
			entry.id === 'diplomata:acordo-impossivel'), false);
		service.campaignSettings.currentDateTime = preparation.readyAt;
		const option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:acordo-impossivel');
		assert.equal(option.replacesBaseWith, 12);
		assert.equal(option.bonus, 12);
		assert.deepEqual(option.targets, ['skill:persuasao']);
		service.consumeTrainerDiplomatProxyRoll('teste', 'bia', [option.key]);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		assert(service.getTrainerAllyRollTalents('teste', 'caio').some(entry => entry.id === option.id));
		service.campaignSettings.currentDateTime = preparation.expiresAt;
		assert.equal(service.getTrainerAllyRollTalents('teste', 'caio').some(entry => entry.id === option.id), false);
		assert.equal(service.setTrainerDiplomatProxy('teste', []).preparation, null);
	});
	it('encomenda item pela Rede de Fornecedores com aprovação atômica e cancela sem saldo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 1000, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('diplomata', 3);
		record.state.trainerSheet.talents.class.push('diplomata:canal-oficial');
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		const item = service.getSupplierCatalog('teste').items.find(entry => entry.id === 'potion');
		assert.equal(item.orderPrice, 240);
		assert(service.getSupplierCatalog('teste').items.some(entry => entry.id === 'faca' &&
			entry.kind === 'equipment'));
		assert.equal(service.getSupplierCatalog('teste').items.some(entry => entry.id === 'masterball'), false);
		const input = { requestId: 'order-test-1', itemId: 'potion', itemKind: 'pokemon' };
		const created = service.requestSupplierOrder('teste', input);
		assert.equal(created.order.status, 'pending');
		assert.equal(service.requestSupplierOrder('teste', input).repeated, true);
		assert.throws(() => service.requestSupplierOrder('teste', { ...input, requestId: 'order-test-2' }),
			/aguardando avaliação/);
		assert.equal(repository.get('ana').state.money, 1000);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 0);
		const approved = service.decideSupplierOrder('teste', input.requestId, true);
		assert.equal(approved.order.status, 'accepted');
		assert.equal(repository.get('ana').state.money, 760);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 1);
		assert.equal(service.decideSupplierOrder('teste', input.requestId, true).repeated, true);
		assert.equal(repository.get('ana').state.money, 760);
		const broke = repository.get('ana'); broke.state.money = 0; repository.set(broke);
		service.requestSupplierOrder('teste', { ...input, requestId: 'order-test-3' });
		const cancelled = service.decideSupplierOrder('teste', 'order-test-3', true);
		assert.equal(cancelled.order.status, 'rejected');
		assert.match(cancelled.order.reason, /Pokécoins insuficientes/);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 1);
		const funded = repository.get('ana'); funded.state.money = 500; repository.set(funded);
		const equipment = service.requestSupplierOrder('teste',
			{ requestId: 'order-test-4', itemId: 'faca', itemKind: 'equipment' });
		assert.equal(equipment.order.price, 180);
		assert.equal(service.decideSupplierOrder('teste', 'order-test-4', true).order.status, 'accepted');
		assert.equal(repository.get('ana').state.money, 320);
		assert(repository.get('ana').state.trainerInventory.items.some(entry => entry.itemId === 'faca'));
	});
	it('requires trained Pokémon Knowledge for Petisco de Amizade', () => {
		const cook = ready('cozinheiro', 3);
		const option = () => rpgTrainerTalentCatalog(cook).find(entry =>
			entry.id === 'cozinheiro:petisco-de-amizade');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(cook,
			{ id: 'cozinheiro:petisco-de-amizade' }), /treinamento na perícia/);
		cook.skills.trained.push('conhecimento:pokemon');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(cook,
			{ id: 'cozinheiro:petisco-de-amizade' }).talents.class.includes('cozinheiro:petisco-de-amizade'));
	});
	it('offers Intelligence or Wisdom for Paladar Analítico and applies only the selected increase', () => {
		const cook = ready('cozinheiro', 3);
		const option = rpgTrainerTalentCatalog(cook).find(entry => entry.id === 'cozinheiro:paladar-analitico');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(cook, { id: option.id }), /Escolha um atributo/);
		const chosen = chooseRPGTrainerTalent(cook, { id: option.id, attribute: 'wisdom' });
		assert.equal(chosen.attributes.wisdom, cook.attributes.wisdom + 1);
		assert.equal(chosen.attributes.intelligence, cook.attributes.intelligence);
	});
	it('requires three distinct trained Knowledge areas for Scientific Authority', () => {
		const scientist = ready('cientista', 10, { skills: { trained: [
			'conhecimento:ciencias', 'conhecimento:pokemon', 'conhecimento:regioes',
		], focused: [] } });
		const choice = { id: 'cientista:autoridade-cientifica', variant: 'conhecimento:ciencias',
			secondVariant: 'conhecimento:pokemon', thirdVariant: 'conhecimento:regioes' };
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ ...choice, thirdVariant: choice.variant }), /três áreas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ ...choice, thirdVariant: 'conhecimento:arqueologia-fosseis' }), /três áreas diferentes/);
		const chosen = chooseRPGTrainerTalent(scientist, choice);
		assert.equal(chosen.talents.apex, choice.id);
		assert.equal(chosen.talentSelections.at(-1).thirdVariant, choice.thirdVariant);
	});
	it('applies the fixed Intelligence increase from Persistent Hypothesis without an attribute choice', () => {
		const scientist = ready('cientista', 3);
		const chosen = chooseRPGTrainerTalent(scientist, { id: 'cientista:hipotese-persistente' });
		assert.equal(chosen.attributes.intelligence, 15);
		assert(chosen.talents.class.includes('cientista:hipotese-persistente'));
		assert.equal(rpgTrainerTalentCatalog(scientist).find(entry =>
			entry.id === 'cientista:hipotese-persistente').attributeChoices.length, 0);
	});
	it('registers all twenty class bases, innate features and all published talents', () => {
		assert.equal(Object.keys(RPG_TRAINER_CLASSES).length, 20);
		assert.equal(Object.keys(RPG_TRAINER_CLASS_FEATURES).length, 20);
		assert.equal(RPG_TRAINER_TALENTS.length, 454);
		assert.equal(RPG_TRAINER_TALENTS.filter(talent => talent.kind === 'general').length, 54);
		assert.equal(new Set(RPG_TRAINER_TALENTS.map(talent => talent.id)).size, 454);
		assert(!RPG_TRAINER_TALENTS.some(talent => talent.id === 'artista:memoria-de-repertorio'));
		assert(!RPG_TRAINER_TALENTS.some(talent => talent.id === 'criador-pokemon:primeiros-cuidados-rapidos'));
		for (const classId of Object.keys(RPG_TRAINER_CLASSES)) {
			assert.ok(rpgTrainerClassFeatures(ready(classId)).length >= 2, classId);
			assert.ok(RPG_TRAINER_TALENTS.some(talent => talent.classId === classId && talent.kind === 'apex'));
		}
	});

	it('creates a complete level-one sheet for every class with its own base rules', () => {
		const candidates = [
			'acrobacia', 'atletismo', 'atuacao', 'captura', 'conhecimento:regioes',
			'empatia-pokemon', 'enganacao', 'furtividade', 'intimidacao', 'intuicao',
			'investigacao', 'ladinagem', 'medicina', 'medicina-pokemon',
			'montaria-pokemon', 'natureza', 'oficio:escrita', 'percepcao',
			'persuasao', 'pilotagem:automoveis', 'sobrevivencia', 'tecnologia',
			'adestramento-pokemon',
		];
		for (const [classId, rule] of Object.entries(RPG_TRAINER_CLASSES)) {
			const attributes = { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 8 };
			const fixedKnowledge = classId === 'cientista' ? 'conhecimento:biologia' : undefined;
			const count = rule.choices + 1;
			const optionalSkills = candidates.filter(skill => !rule.fixed.includes(skill) &&
				skill !== fixedKnowledge && !rule.excluded.includes(skill.split(':')[0])).slice(0, count);
			const gearChoices = Object.fromEntries(Object.entries(rule.gearChoices || {})
				.map(([key, choices]) => [key, choices[0]]));
			const sheet = completeRPGTrainerSheet(createRPGPendingTrainerSheet(), {
				classId, attributes, fixedKnowledge, optionalSkills, gearChoices,
			}, 'standard');
			assert.equal(sheet.classId, classId);
			assert.equal(sheet.skills.trained.length, rule.fixed.length + Number(!!fixedKnowledge) + count);
			assert.ok(sheet.resistances.includes(rule.resistance));
			assert.equal(sheet.hitPoints.maximum, 10 + rule.hitDie + 1);
			assert.equal(sheet.equipment.length, rule.gear.length + Object.keys(gearChoices).length);
			assert.ok(rpgTrainerClassFeatures(sheet).length >= 2);
		}
	});

	it('enforces level, class, talent-chain and apex requirements', () => {
		let sheet = ready('arqueologo', 7);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'arqueologo:achado-excepcional' }), /pré-requisito/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura' }), /outra classe/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:especialista-em-fosseis' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:leitura-estratigrafica' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:achado-excepcional' });
		assert.equal(sheet.talents.class.length, 3);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'arqueologo:epigrafista' }), /Não há escolha/);
		assert.throws(() => chooseRPGTrainerTalent(ready('arqueologo', 9),
			{ id: 'arqueologo:grande-descobridor' }), /Ápices|escolha|Nível insuficiente/);
		const apex = chooseRPGTrainerTalent(ready('arqueologo', 10), { id: 'arqueologo:grande-descobridor' });
		assert.equal(apex.talents.apex, 'arqueologo:grande-descobridor');
	});
	it('allows Master of Excavation without Conservador de Campo', () => {
		const sheet = ready('arqueologo', 10, { talents: { general: [],
			class: ['arqueologo:especialista-em-fosseis', 'arqueologo:leitura-estratigrafica'], apex: null } });
		const option = rpgTrainerTalentCatalog(sheet).find(entry => entry.id === 'arqueologo:mestre-da-escavacao');
		assert.equal(option.available, true);
		assert.equal(chooseRPGTrainerTalent(sheet,
			{ id: 'arqueologo:mestre-da-escavacao' }).talents.apex, 'arqueologo:mestre-da-escavacao');
	});
	it('grants Academic Memory intelligence automatically up to 20', () => {
		const base = ready('arqueologo', 5, { attributes: {
			...ready('arqueologo', 5).attributes, intelligence: 13,
		} });
		const chosen = chooseRPGTrainerTalent(base, { id: 'arqueologo:memoria-academica' });
		assert.equal(chosen.attributes.intelligence, 14);
		assert.equal(rpgTrainerSkillBonus(chosen, 'conhecimento:arqueologia-fosseis'),
			rpgTrainerSkillBonus(base, 'conhecimento:arqueologia-fosseis') + 1);
		const capped = chooseRPGTrainerTalent(ready('arqueologo', 5, { attributes: {
			...base.attributes, intelligence: 20,
		} }), { id: 'arqueologo:memoria-academica' });
		assert.equal(capped.attributes.intelligence, 20);
	});
	it('grants Relic Rescue dexterity automatically up to 20', () => {
		const original = ready('arqueologo', 3);
		const chosen = chooseRPGTrainerTalent(original, { id: 'arqueologo:resgate-de-reliquia' });
		assert.equal(chosen.attributes.dexterity, 15);
		assert.equal(chosen.relicRescueApplied, true);
		const capped = chooseRPGTrainerTalent(ready('arqueologo', 3, { attributes: {
			...original.attributes, dexterity: 20,
		} }), { id: 'arqueologo:resgate-de-reliquia' });
		assert.equal(capped.attributes.dexterity, 20);
	});
	it('grants Emergency Incubation wisdom automatically up to 20', () => {
		const original = ready('criador-pokemon', 5);
		original.talents.class.push('criador-pokemon:incubacao-assistida');
		const chosen = chooseRPGTrainerTalent(original, { id: 'criador-pokemon:incubacao-de-emergencia' });
		assert.equal(chosen.attributes.wisdom, Math.min(20, original.attributes.wisdom + 1));
		assert.equal(chosen.emergencyIncubationWisdomApplied, true);
	});
	it('grants Nursery Master wisdom automatically without asking for an attribute', () => {
		const original = ready('criador-pokemon', 10);
		original.talents.class.push('criador-pokemon:incubacao-assistida',
			'criador-pokemon:reproducao-assistida', 'criador-pokemon:incubacao-de-emergencia');
		const chosen = chooseRPGTrainerTalent(original, { id: 'criador-pokemon:mestre-do-bercario' });
		assert.equal(chosen.attributes.wisdom, original.attributes.wisdom + 1);
		assert.equal(chosen.nurseryMasterWisdomApplied, true);
		assert.equal(rpgTrainerTalentCatalog(original).find(entry =>
			entry.id === 'criador-pokemon:mestre-do-bercario').attributeChoices.length, 0);
	});

	it('applies general training, focus, resistance and domain without duplicate benefits', () => {
		let sheet = ready('arqueologo', 10);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'treinamento-adicional', skill: 'medicina' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'foco-em-pericia', skill: 'medicina' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'resiliente', resistance: 'reflexes' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'dominio-de-kit', proficiency: 'kit-medico' });
		assert.ok(sheet.skills.trained.includes('medicina'));
		assert.ok(sheet.skills.focused.includes('medicina'));
		assert.ok(sheet.resistances.includes('reflexes'));
		assert.ok(sheet.proficiencies.includes('kit-medico'));
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'treinamento-adicional', skill: 'medicina' }), /já é treinada|Não há escolha/);
		assert.throws(() => chooseRPGTrainerTalent(ready('arqueologo', 2),
			{ id: 'dominio-de-kit', proficiency: 'kit-medico' }), /perícia correspondente/);
	});
	it('grants Mount Pokemon training with Sports Riding without duplicating existing training', () => {
		const athlete = ready('atleta', 3);
		assert(!athlete.skills.trained.includes('montaria-pokemon'));
		assert(rpgTrainerTalentCatalog(athlete).find(talent => talent.id === 'atleta:montaria-esportiva').available);
		const learned = chooseRPGTrainerTalent(athlete, { id: 'atleta:montaria-esportiva' });
		assert(learned.skills.trained.includes('montaria-pokemon'));
		assert.equal(learned.talentSelections.at(-1).grantedSkill, 'montaria-pokemon');
		assert.equal(rpgTrainerSkillBonus(learned, 'montaria-pokemon'),
			rpgTrainerSkillBonus(athlete, 'montaria-pokemon', undefined, false, true) + rpgTrainerProficiency(learned.level));
		const alreadyTrained = ready('atleta', 3, { skills: {
			trained: [...athlete.skills.trained, 'montaria-pokemon'], focused: [],
		} });
		const retained = chooseRPGTrainerTalent(alreadyTrained, { id: 'atleta:montaria-esportiva' });
		assert.equal(retained.skills.trained.filter(skill => skill === 'montaria-pokemon').length, 1);
		assert.equal(retained.talentSelections.at(-1).grantedSkill, undefined);
	});

	it('chooses two distinct untrained Knowledge areas and applies half proficiency without training', () => {
		const base = ready('arqueologo', 10);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'conhecimento-diversificado');
		assert(catalog.available);
		assert(catalog.choiceFields.skill && catalog.choiceFields.variant);
		assert(!catalog.variantChoices.includes('conhecimento:arqueologia-fosseis'));
		assert(!catalog.variantChoices.includes('conhecimento:organizacoes'));
		const choice = { id: 'conhecimento-diversificado', skill: 'conhecimento:regioes',
			variant: 'conhecimento:pokemon' };
		assert.throws(() => chooseRPGTrainerTalent(base, { id: choice.id }), /duas áreas/);
		assert.throws(() => chooseRPGTrainerTalent(base, { ...choice, variant: choice.skill }), /duas áreas/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ ...choice, skill: 'conhecimento:arqueologia-fosseis' }), /não treinadas/);
		const chosen = chooseRPGTrainerTalent(base, choice);
		assert(!chosen.skills.trained.includes(choice.skill));
		assert(!chosen.skills.trained.includes(choice.variant));
		assert.equal(rpgTrainerSkillBonus(chosen, choice.skill) - rpgTrainerSkillBonus(base, choice.skill), 2);
		assert.equal(rpgTrainerSkillBonus(chosen, choice.variant) - rpgTrainerSkillBonus(base, choice.variant), 2);
		assert.equal(rpgTrainerSkillBonus(chosen, 'conhecimento:ciencias'),
			rpgTrainerSkillBonus(base, 'conhecimento:ciencias'));
		assert.throws(() => rpgTrainerSkillBonus(chosen, choice.skill, undefined, true), /treinamento/);
		const mid = chooseRPGTrainerTalent(ready('arqueologo', 6), choice);
		assert.equal(rpgTrainerSkillBonus(mid, choice.skill) -
			rpgTrainerSkillBonus(ready('arqueologo', 6), choice.skill), 1);
	});

	it('acquires Specialized Help without restricting it to one trained skill', () => {
		const base = ready('arqueologo', 2);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'ajuda-especializada');
		assert.equal(catalog.choiceFields.skill, false);
		const chosen = chooseRPGTrainerTalent(base, { id: 'ajuda-especializada' });
		assert(chosen.talents.general.includes('ajuda-especializada'));
		assert.equal(chosen.talentSelections.at(-1).skill, undefined);
	});

	it('fixes a trained skill and an alternate attribute for Practical Competence', () => {
		const base = ready('arqueologo', 10);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'competencia-pratica');
		assert.equal(catalog.available, true);
		assert.equal(catalog.needsChoice, true);
		assert.equal(rpgTrainerTalentCatalog(ready('arqueologo', 2))
			.find(talent => talent.id === 'competencia-pratica').available, true);
		assert(catalog.choiceFields.skill && catalog.choiceFields.variant);
		assert(catalog.variantChoices.includes('wisdom'));
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao' }), /atributo alternativo/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'intelligence' }), /atributo alternativo/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'percepcao', variant: 'intelligence' }), /perícia treinada/);
		const chosen = chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'wisdom' });
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'investigacao'), ['intelligence', 'wisdom']);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'atletismo'), ['strength']);
		assert.equal(rpgTrainerSkillBonus(chosen, 'investigacao', 'wisdom'),
			rpgTrainerSkillBonus(base, 'investigacao') - 1);
		assert.throws(() => rpgTrainerSkillBonus(chosen, 'investigacao', 'charisma'), /Atributo não permitido/);
		assert.throws(() => chooseRPGTrainerTalent(chosen,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'strength' }), /já foi escolhida/);
		assert.equal(rpgTrainerTalentCatalog(ready('arqueologo', 1))
			.find(talent => talent.id === 'competencia-pratica').available, false);
	});

	it('lets Additional Training teach a skill outside the class list while Focus still requires training', () => {
		const original = ready('arqueologo', 10);
		assert(!original.skills.trained.includes('atuacao'));
		assert.throws(() => chooseRPGTrainerTalent(original,
			{ id: 'foco-em-pericia', skill: 'atuacao' }), /Foco exige treinamento/);
		const trained = chooseRPGTrainerTalent(original, { id: 'treinamento-adicional', skill: 'atuacao' });
		const focused = chooseRPGTrainerTalent(trained, { id: 'foco-em-pericia', skill: 'atuacao' });
		assert(focused.skills.trained.includes('atuacao'));
		assert(focused.skills.focused.includes('atuacao'));
		assert.throws(() => chooseRPGTrainerTalent(focused,
			{ id: 'foco-em-pericia', skill: 'atuacao' }), /já possui foco/);
	});

	it('applies attribute growth, Constitution PV and Robust retroactively without healing', () => {
		let sheet = ready('artista', 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:presenca-magnetica' });
		assert.equal(sheet.attributes.charisma, 11);
		assert.deepEqual(rpgTrainerTalentCatalog(ready('artista', 3))
			.find(talent => talent.id === 'artista:presenca-magnetica').attributeChoices, []);
		assert.throws(() => chooseRPGTrainerTalent(ready('artista', 3),
			{ id: 'artista:presenca-magnetica', attribute: 'strength' }), /não concede aumento/);
		let robust = chooseRPGTrainerTalent(ready('artista', 2), { id: 'robusto' });
		assert.equal(robust.hitPoints.maximum, 22);
		assert.equal(robust.hitPoints.current, 20);
		robust = awardRPGTrainerXP(robust, { kind: 'master', sourceId: 'test-level-3',
			amount: RPG_TRAINER_LEVEL_XP[2] - robust.experience, reason: 'Teste', grantedAt: 1 }).sheet;
		assert.equal(robust.hitPoints.maximum, 22);
		assert.equal(robust.hitPoints.current, 20);
		let con = ready('artista', 6, { attributes: { strength: 12, dexterity: 14,
			constitution: 13, intelligence: 14, wisdom: 12, charisma: 10 } });
		con = chooseRPGTrainerTalent(con, { id: 'aprimoramento-de-atributo', attribute: 'constitution' });
		assert.equal(con.hitPoints.maximum, 26);
		assert.equal(con.hitPoints.current, 20);
		assert.throws(() => chooseRPGTrainerTalent(con,
			{ id: 'aprimoramento-de-atributo', attribute: 'constitution' }), /já recebeu/);
	});

	it('automatically grants Body of Scene dexterity and permits it only for Performance checks', () => {
		const original = ready('artista', 3, { skills: { trained: ['atuacao'], focused: [] } });
		const catalog = rpgTrainerTalentCatalog(original).find(talent => talent.id === 'artista:corpo-de-cena');
		assert.deepEqual(catalog.attributeChoices, []);
		assert.deepEqual(rpgTrainerSkillAttributes(original, 'atuacao'), ['charisma']);
		assert.throws(() => chooseRPGTrainerTalent(original,
			{ id: 'artista:corpo-de-cena', attribute: 'dexterity' }), /não concede aumento/);
		const chosen = chooseRPGTrainerTalent(original, { id: 'artista:corpo-de-cena' });
		assert.equal(chosen.attributes.dexterity, 15);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'atuacao'), ['charisma', 'dexterity']);
		assert.equal(rpgTrainerSkillBonus(chosen, 'atuacao', 'dexterity'),
			rpgTrainerSkillBonus(chosen, 'atuacao', 'charisma') + 2);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'persuasao'), ['charisma']);
		assert.equal(chooseRPGTrainerTalent(ready('artista', 3, {
			attributes: { strength: 12, dexterity: 20, constitution: 13,
				intelligence: 14, wisdom: 12, charisma: 10 },
		}), { id: 'artista:corpo-de-cena' }).attributes.dexterity, 20);
	});

	it('records both Artist Versatile modalities and prevents repeating Signature Technique modalities', () => {
		let sheet = ready('artista', 7);
		const versatile = rpgTrainerTalentCatalog(sheet).find(talent => talent.id === 'artista:artista-versatil');
		assert.equal(versatile.choiceFields.variant, true);
		assert.equal(versatile.choiceFields.secondVariant, true);
		assert.deepEqual(versatile.attributeChoices.sort(), ['charisma', 'dexterity']);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura', variant: 'Canto' });
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'canto', secondVariant: 'Dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', secondVariant: 'dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', secondVariant: 'Poesia', attribute: 'charisma' });
		const selection = sheet.talentSelections.find(entry => entry.id === 'artista:artista-versatil');
		assert.equal(selection.variant, 'Dança');
		assert.equal(selection.secondVariant, 'Poesia');
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura', variant: 'poesia' }),
			/modalidades artísticas diferentes/);
	});
	it('records three Athlete Versatile modalities without repeating Sports Specialties', () => {
		let sheet = ready('atleta', 7);
		const versatile = rpgTrainerTalentCatalog(sheet).find(talent => talent.id === 'atleta:atleta-polivalente');
		assert.equal(versatile.choiceFields.variant, true);
		assert.equal(versatile.choiceFields.secondVariant, true);
		assert.equal(versatile.choiceFields.thirdVariant, true);
		assert.deepEqual(versatile.attributeChoices.sort(), ['constitution', 'dexterity', 'strength']);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'atleta:especialidade-esportiva', variant: 'Corrida' });
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'corrida', secondVariant: 'Natação', thirdVariant: 'Escalada', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'natação', thirdVariant: 'Escalada', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'Ginástica', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'Ginástica', thirdVariant: 'Escalada', attribute: 'strength' });
		const selection = sheet.talentSelections.find(entry => entry.id === 'atleta:atleta-polivalente');
		assert.deepEqual([selection.variant, selection.secondVariant, selection.thirdVariant],
			['Natação', 'Ginástica', 'Escalada']);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'atleta:especialidade-esportiva', variant: 'escalada' }), /modalidades esportivas diferentes/);
	});

	it('uses stable request IDs when a class talent may be acquired twice', () => {
		let sheet = ready('cientista', 7);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', injected: { money: 99999 } }), /Escolha de talento inválida/);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos' }), /identificador estável/);
		const first = { id: 'cientista:registros-paralelos', requestId: 'register-1' };
		sheet = chooseRPGTrainerTalent(sheet, first);
		assert.strictEqual(chooseRPGTrainerTalent(sheet, first), sheet);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:especializacao-cientifica', requestId: 'register-1', variant: 'conhecimento:biologia' }),
		/Identificador de escolha/);
		sheet = chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', requestId: 'register-2' });
		assert.equal(sheet.talents.class.length, 2);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', requestId: 'register-3' }), /já foi escolhido/);
	});

	it('accepts alternative prerequisites and verifies an area-specific chain', () => {
		let athlete = ready('atleta', 10);
		athlete = chooseRPGTrainerTalent(athlete,
			{ id: 'atleta:especialidade-esportiva', variant: 'corrida' });
		athlete = chooseRPGTrainerTalent(athlete, { id: 'atleta:recordista' });
		assert.equal(athlete.talents.apex, 'atleta:recordista');
		let scientist = ready('cientista', 7);
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:especializacao-cientifica', variant: 'conhecimento:quimica' }), /área de Conhecimento treinada/);
		scientist = chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:especializacao-cientifica', variant: 'conhecimento:arqueologia-fosseis' });
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:publicacao-de-referencia', variant: 'conhecimento:quimica' }), /Foco em Perícia/);
		scientist.skills.focused.push('conhecimento:arqueologia-fosseis');
		scientist.talents.general.push('foco-em-pericia');
		scientist = chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:publicacao-de-referencia', variant: 'conhecimento:arqueologia-fosseis' });
		assert.equal(scientist.talents.class.length, 2);
	});

	it('offers only valid finite variants and trained Pilotagem categories', () => {
		const sheet = ready('arqueologo', 10, { skills: {
			trained: ['pilotagem:automoveis', 'conhecimento:arqueologia-fosseis'], focused: [],
		} });
		const catalog = rpgTrainerTalentCatalog(sheet);
		const variants = id => catalog.find(talent => talent.id === id).variantChoices;
		assert.deepEqual(variants('condutor-versatil'), ['pilotagem:automoveis']);
		assert(variants('aclimatacao').includes('floresta-umida'));
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'condutor-versatil', variant: 'pilotagem:motocicletas' }), /Pilotagem treinada/);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'aclimatacao', variant: 'qualquer ambiente' }), /variante disponível/);
		const chosen = chooseRPGTrainerTalent(sheet,
			{ id: 'condutor-versatil', variant: 'pilotagem:automoveis' });
		assert(chosen.talents.general.includes('condutor-versatil'));
		assert.equal(rpgTrainerSkillBonus(chosen, 'pilotagem:automoveis'),
			rpgTrainerSkillBonus(sheet, 'pilotagem:automoveis') + 2);
	});

	it('reflects trained resistance and passive talent bonuses in the sheet calculations', () => {
		const base = ready('arqueologo', 10);
		const resilient = chooseRPGTrainerTalent(base, { id: 'resiliente', resistance: 'reflexes' });
		assert(resilient.resistances.includes('reflexes'));
		assert.equal(rpgTrainerResistanceBonus(resilient, 'reflexes'),
			rpgTrainerResistanceBonus(base, 'reflexes') + rpgTrainerProficiency(10));
		let sheet = chooseRPGTrainerTalent(base, { id: 'iniciativa-aprimorada' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).initiativeBonus,
			rpgTrainerDerivedStatistics(base).initiativeBonus + 3);
		assert.equal(rollRPGTrainerInitiative(sheet, () => 0).total,
			rollRPGTrainerInitiative(base, () => 0).total + 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'corredor' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).movementMeters,
			rpgTrainerDerivedStatistics(base).movementMeters + 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'carregador' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).carrying.maximumKg,
			rpgTrainerDerivedStatistics(base).carrying.maximumKg * 1.5);
	});

	it('trains Reflexos through the martial talent or keeps its alternative situational bonus', () => {
		const base = ready('artista-marcial', 3, { resistances: ['fortitude'] });
		const trained = chooseRPGTrainerTalent(base, { id: 'artista-marcial:reflexos-treinados' });
		assert(trained.resistances.includes('reflexes'));
		const alreadyTrained = chooseRPGTrainerTalent(
			{ ...base, resistances: ['fortitude', 'reflexes'] },
			{ id: 'artista-marcial:reflexos-treinados' });
		assert.equal(alreadyTrained.talentSelections[0].variant, 'already-trained');
	});

	it('makes fixed class movement and unarmored defense effective', () => {
		assert.equal(rpgTrainerDerivedStatistics(ready('atleta')).movementMeters, 10.5);
		assert.equal(rpgTrainerDerivedStatistics(ready('artista-marcial')).defense, 13);
		assert.equal(rpgTrainerDerivedStatistics(ready('artista-marcial'), { shield: true }).defense, 14);
	});

	it('exposes only general and own-class talents with their acquisition state', () => {
		const sheet = ready('psiquico', 3);
		const catalog = rpgTrainerTalentCatalog(sheet);
		assert.equal(catalog.filter(talent => talent.kind === 'general').length, 54);
		assert.ok(catalog.some(talent => talent.id === 'psiquico:elo-telepatico'));
		assert.ok(!catalog.some(talent => talent.id === 'tecnologo:interface-remota'));
		assert.ok(catalog.some(talent => talent.id === 'psiquico:telecinese-ampliada' &&
			!talent.available));
	});

	it('checks Favor Institucional for Reputação Precedente and Master approval for controlled weapons', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const master = service.loginMaster('teste');
		const player = service.loginPlayer('ana', 'senha-rpg');
		const record = repository.get('ana');
		record.state.trainerSheet = ready('diplomata', 10);
		repository.set(record);
		assert.throws(() => service.chooseTrainerTalent(player.token,
			{ id: 'diplomata:reputacao-precedente' }), /Falta um talento exigido/);
		assert.throws(() => service.approveTrainerTalentPrerequisite(player.token, 'ana',
			'dominio-de-arma:armas-ranged-exoticas', 'Licença válida'), /master session required/);
		record.state.trainerSheet.talents.class.push('diplomata:favor-institucional');
		repository.set(record);
		const chosen = service.chooseTrainerTalent(player.token,
			{ id: 'diplomata:reputacao-precedente' });
		assert.ok(chosen.talents.class.includes('diplomata:reputacao-precedente'));
		assert.equal(chosen.talentApprovals?.length || 0, 0);
		assert.throws(() => service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' }), /licença verificada/);
		service.approveTrainerTalentPrerequisite(master.token, 'ana',
			'dominio-de-arma:armas-ranged-exoticas', 'Licença regional válida');
		const licensed = service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' });
		assert.ok(licensed.proficiencies.includes('armas-ranged-exoticas'));
		assert.equal(licensed.talentApprovals.length, 1);
	});
});
