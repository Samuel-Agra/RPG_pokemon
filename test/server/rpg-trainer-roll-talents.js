'use strict';

const assert = require('assert').strict;
const { createRPGPendingTrainerSheet, chooseRPGTrainerTalent } = require('../../dist/server/rpg-showdown');
const { rollRPGTrainerSkillCheck, rpgTrainerProficiency } = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalentOptions, rpgResolveTrainerRollTalents, rpgTrainerRollBonusTerms,
	rpgArtisticInspirationOption, rpgCaptivatingDistractionOption, rpgEncouragingPresenceOption,
	rpgTeamCaptainOption,
	rpgDetectiveCapturePlanOption,
	rpgDetectiveDuoOption,
	rpgDiplomatIntroductionOption,
	rpgDiplomatProxyOption,
	rpgTechnicalOpinionOption,
	rpgExpeditionLeaderOption,
	rpgExplorerLifelineOption,
	rpgExcavationMasterOption,
	rpgSetSharedArchive, rpgSharedArchiveOptions } =
	require('../../dist/server/rpg-showdown/trainer-roll-talents');
const { rpgEnchanterAllyOptions, rpgEnchanterSocialChemistryOption } =
	require('../../dist/server/rpg-showdown/trainer-roll-talents');
const { rpgUpdatePersistentHypothesis } =
	require('../../dist/server/rpg-showdown/trainer-roll-talents');

function sheet() {
	return { ...createRPGPendingTrainerSheet(), status: 'complete', classId: 'arqueologo', level: 10,
		attributes: { strength: 12, dexterity: 14, constitution: 13, intelligence: 14, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
		skills: { trained: ['investigacao'], focused: [] }, resistances: ['will'] };
}

describe('RPG trainer situational roll talents', () => {
	it('identifica o terreno escolhido ao oferecer Especialista de Terreno', () => {
		const explorer = { ...sheet(), classId: 'explorador', talents: { general: [],
			class: ['explorador:especialista-de-terreno', 'explorador:especialista-de-terreno'], apex: null },
		talentSelections: [{ id: 'explorador:especialista-de-terreno', variant: 'pantano' },
			{ id: 'explorador:especialista-de-terreno', variant: 'urbano-em-ruinas' }] };
		const options = rpgTrainerRollTalentOptions(explorer, 'skill', 'sobrevivencia')
			.filter(option => option.id === 'explorador:especialista-de-terreno');
		assert.deepEqual(options.map(option => option.name),
			['Especialista de Terreno (Pântano)', 'Especialista de Terreno (Urbano em ruínas)']);
		assert(options[0].condition.includes('Pântano'));
		assert(options[1].condition.includes('Urbano em ruínas'));
		assert.equal(rpgResolveTrainerRollTalents(explorer, 'skill', 'sobrevivencia', [options[0].key]).bonus, 2);
		assert.equal(rpgTrainerRollTalentOptions(explorer, 'skill', 'atletismo')
			.some(option => option.id === 'explorador:especialista-de-terreno'), false);
	});
	it('oferece Localizador de Desaparecidos apenas em Sobrevivência e Percepção', () => {
		const explorer = { ...sheet(), classId: 'explorador', talents: { general: [],
			class: ['explorador:localizador-de-desaparecidos'], apex: null } };
		for (const skill of ['sobrevivencia', 'percepcao']) {
			const options = rpgTrainerRollTalentOptions(explorer, 'skill', skill);
			const option = options.find(entry => entry.id === 'explorador:localizador-de-desaparecidos');
			assert.equal(option.bonus, 2);
			assert.equal(rpgResolveTrainerRollTalents(explorer, 'skill', skill, [option.key]).bonus, 2);
		}
		assert.equal(rpgTrainerRollTalentOptions(explorer, 'skill', 'investigacao')
			.some(entry => entry.id === 'explorador:localizador-de-desaparecidos'), false);
	});
	it('oferece Rastreador Persistente apenas em Sobrevivência do Explorador', () => {
		const explorer = { ...sheet(), classId: 'explorador' };
		const options = rpgTrainerRollTalentOptions(explorer, 'skill', 'sobrevivencia');
		assert.deepEqual(options.map(option => option.id), ['explorador:rastreador-persistente']);
		assert.equal(rpgResolveTrainerRollTalents(explorer, 'skill', 'sobrevivencia', []).bonus, 0);
		assert.equal(rpgResolveTrainerRollTalents(explorer, 'skill', 'sobrevivencia',
			[options[0].key]).bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(explorer, 'skill', 'percepcao'), []);
		assert.deepEqual(rpgTrainerRollTalentOptions(sheet(), 'skill', 'sobrevivencia'), []);
	});
	it('oferece Salão na Palma da Mão ao Encantador e aliados somente nas perícias sociais com Carisma', () => {
		const enchanter = { ...sheet(), classId: 'encantador', talents: { general: [], class: [],
			apex: 'encantador:salao-na-palma-da-mao' } };
		const own = rpgTrainerRollTalentOptions(enchanter, 'skill', 'persuasao', 'charisma');
		assert.equal(own.find(option => option.id === 'encantador:salao-na-palma-da-mao').bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(enchanter, 'skill', 'intimidacao', 'strength'), []);
		assert.equal(rpgTrainerRollTalentOptions(enchanter, 'skill', 'intimidacao', 'charisma').length, 1);
		const allies = rpgEnchanterAllyOptions('encantador-1', 'Ana', enchanter);
		assert.equal(allies.length, 1);
		const ally = sheet();
		assert.equal(rpgResolveTrainerRollTalents(ally, 'skill', 'atuacao', [allies[0].key],
			allies, 'charisma').bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'skill', 'intimidacao',
			[allies[0].key], allies, 'strength'), /indisponível/);
		assert.deepEqual(rpgEnchanterAllyOptions('encantador-1', 'Ana',
			{ ...enchanter, talents: { ...enchanter.talents, apex: 'encantador:icone-social' } }), []);
	});
	it('oferece os bônus sociais aos aliados e reserva Química Social somente para ajuda com Carisma', () => {
		const source = { ...sheet(), classId: 'encantador', talents: { general: [], apex: null,
			class: ['encantador:apresentacao-perfeita', 'encantador:confianca-compartilhada',
				'encantador:quimica-social', 'encantador:rosto-memoravel'] } };
		const ally = { ...sheet(), skills: { trained: ['persuasao'], focused: [] } };
		const social = rpgEnchanterAllyOptions('encantador-1', 'Ana', source);
		assert.deepEqual(social.map(option => option.bonus), [2, 2]);
		assert.deepEqual(rpgTrainerRollTalentOptions(source, 'skill', 'persuasao')
			.map(option => option.id), ['encantador:rosto-memoravel']);
		assert.equal(rpgResolveTrainerRollTalents(ally, 'skill', 'persuasao', [social[0].key], social).bonus, 2);
		const help = rpgEnchanterSocialChemistryOption('encantador-1', 'Ana', source);
		assert(help);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'skill', 'intimidacao',
			[help.key], [help], 'strength'), /indisponível/);
		assert.equal(rpgResolveTrainerRollTalents(ally, 'skill', 'intimidacao',
			[help.key], [help], 'charisma').bonus, 0);
	});
	it('offers the Enchanter social bonuses only in the matching skill rolls', () => {
		const enchanter = { ...sheet(), classId: 'encantador', talents: { general: [],
			class: ['encantador:espelhamento-social', 'encantador:visual-adequado'], apex: null } };
		for (const skill of ['persuasao', 'enganacao']) {
			const options = rpgTrainerRollTalentOptions(enchanter, 'skill', skill);
			assert.deepEqual(options.map(option => option.id),
				['encantador:espelhamento-social', 'encantador:visual-adequado']);
			assert.equal(rpgResolveTrainerRollTalents(enchanter, 'skill', skill, []).bonus, 0);
			assert.equal(rpgResolveTrainerRollTalents(enchanter, 'skill', skill,
				options.map(option => option.key)).bonus, 4);
		}
		for (const skill of ['atuacao', 'intimidacao']) {
			assert.deepEqual(rpgTrainerRollTalentOptions(enchanter, 'skill', skill)
				.map(option => option.id), ['encantador:visual-adequado']);
		}
		assert.deepEqual(rpgTrainerRollTalentOptions(enchanter, 'skill', 'investigacao'), []);
		assert.deepEqual(rpgTrainerRollTalentOptions({ ...enchanter, talents: { general: [], class: [], apex: null } },
			'skill', 'persuasao'), []);
	});
	it('oferece Porta-Voz Reconhecido apenas em testes sociais feitos com Carisma', () => {
		const diplomat = { ...sheet(), classId: 'diplomata',
			talents: { general: [], class: ['diplomata:porta-voz-reconhecido'], apex: null } };
		for (const skill of ['atuacao', 'enganacao', 'persuasao', 'intimidacao']) {
			const option = rpgTrainerRollTalentOptions(diplomat, 'skill', skill, 'charisma')
				.find(entry => entry.id === 'diplomata:porta-voz-reconhecido');
			assert.equal(option.bonus, 2);
			assert.equal(option.requiredAttribute, 'charisma');
		}
		assert.equal(rpgTrainerRollTalentOptions(diplomat, 'skill', 'intimidacao', 'strength')
			.some(entry => entry.id === 'diplomata:porta-voz-reconhecido'), false);
		assert.equal(rpgTrainerRollTalentOptions(diplomat, 'skill', 'investigacao')
			.some(entry => entry.id === 'diplomata:porta-voz-reconhecido'), false);
	});
	it('offers a diplomat letter only to its addressee for Persuasion before use', () => {
		const diplomat = { ...sheet(), classId: 'diplomata',
			talents: { general: [], class: ['diplomata:carta-de-apresentacao'], apex: null },
			introductionLetter: { id: 'carta1', recipientCharacterId: 'bia', institution: 'Museu',
				subject: 'Pesquisa', used: false } };
		const option = rpgDiplomatIntroductionOption('ana', 'Ana', diplomat, 'bia');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['skill:persuasao']);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'persuasao', [option.key], [option]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'investigacao',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgDiplomatIntroductionOption('ana', 'Ana', diplomat, 'ana'), null);
		assert.equal(rpgDiplomatIntroductionOption('ana', 'Ana', diplomat, 'outro'), null);
		diplomat.introductionLetter.used = true;
		assert.equal(rpgDiplomatIntroductionOption('ana', 'Ana', diplomat, 'bia'), null);
	});
	it('replaces an ally Persuasion base bonus with the Diplomat base without stacking them', () => {
		const diplomat = { ...sheet(), classId: 'diplomata', attributes: { ...sheet().attributes, charisma: 18 },
			skills: { trained: ['persuasao'], focused: ['persuasao'] },
			talents: { general: [], class: [], apex: 'diplomata:acordo-impossivel' },
			diplomatProxy: { id: 'preparo1', readyAt: '2026-10-15T12:10:00.000Z',
				expiresAt: '2026-10-16T12:10:00.000Z', recipients: [
					{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda', used: false }] } };
		const recipient = { ...sheet(), classId: 'atleta' };
		const option = rpgDiplomatProxyOption('ana', 'Ana', diplomat, 'bia', recipient,
			'2026-10-15T13:00:00.000Z');
		assert.equal(option.replacesBaseWith, 12);
		assert.equal(option.bonus, 12);
		const chosen = rpgResolveTrainerRollTalents(recipient, 'skill', 'persuasao', [option.key], [option]);
		const result = rollRPGTrainerSkillCheck(recipient, 'persuasao', undefined,
			{ dc: 0, bonus: chosen.bonus }, () => 0.45);
		assert.equal(result.total, result.natural + 12);
		assert.throws(() => rpgResolveTrainerRollTalents(recipient, 'skill', 'investigacao',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgDiplomatProxyOption('ana', 'Ana', diplomat, 'bia', recipient,
			'2026-10-15T12:00:00.000Z'), null);
	});
	it('offers Diplomat Structured Mediation only for a selected Persuasion check', () => {
		const diplomat = { ...sheet(), classId: 'diplomata' };
		const [option] = rpgTrainerRollTalentOptions(diplomat, 'skill', 'persuasao');
		assert.equal(option.name, 'Mediação Estruturada');
		assert.equal(option.bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(diplomat, 'skill', 'persuasao', []).bonus, 0);
		assert.equal(rpgResolveTrainerRollTalents(diplomat, 'skill', 'persuasao', [option.key]).bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(diplomat, 'skill', 'investigacao'), []);
		assert.deepEqual(rpgTrainerRollTalentOptions({ ...diplomat, classId: 'artista' }, 'skill', 'persuasao'), []);
	});
	it('offers only the matching Cook situational bonuses when selected', () => {
		const cook = { ...sheet(), classId: 'cozinheiro', talents: { general: [],
			class: ['cozinheiro:forrageio-gastronomico', 'cozinheiro:paladar-resistente'], apex: null } };
		const forage = rpgTrainerRollTalentOptions(cook, 'skill', 'sobrevivencia');
		assert.equal(forage.length, 1);
		assert.equal(forage[0].bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(cook, 'skill', 'sobrevivencia', []).bonus, 0);
		assert.equal(rpgResolveTrainerRollTalents(cook, 'skill', 'sobrevivencia', [forage[0].key]).bonus, 2);
		const resistant = rpgTrainerRollTalentOptions(cook, 'resistance', 'fortitude');
		assert.equal(resistant.length, 1);
		assert.equal(resistant[0].bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(cook, 'skill', 'percepcao'), []);
	});
	it('offers Master of the Kitchen only for Culinary checks and raises the natural result to ten', () => {
		const cook = { ...sheet(), classId: 'cozinheiro', talents: { general: [], class: [],
			apex: 'cozinheiro:mestre-da-cozinha' }, skills: { trained: ['oficio:culinaria'], focused: [] } };
		const [option] = rpgTrainerRollTalentOptions(cook, 'skill', 'oficio:culinaria');
		assert.equal(option.naturalFloor, 10);
		assert.deepEqual(rpgTrainerRollTalentOptions(cook, 'skill', 'oficio:artesanato'), []);
		assert.equal(rpgResolveTrainerRollTalents(cook, 'skill', 'oficio:culinaria', [option.key]).naturalFloor, 10);
		const roll = rollRPGTrainerSkillCheck(cook, 'oficio:culinaria', undefined,
			{ dc: 12, naturalFloor: 10 }, () => 0.1);
		assert.equal(roll.natural, 3);
		assert.equal(roll.effectiveNatural, 10);
	});
	it('offers Scientific Authority only for its three selected Knowledge areas', () => {
		const scientist = { ...sheet(), classId: 'cientista', talents: { general: [], class: [],
			apex: 'cientista:autoridade-cientifica' }, talentSelections: [{
			id: 'cientista:autoridade-cientifica', variant: 'conhecimento:ciencias',
			secondVariant: 'conhecimento:pokemon', thirdVariant: 'conhecimento:arqueologia-fosseis',
		}] };
		const offered = rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:ciencias');
		assert.equal(offered.length, 1);
		assert.equal(offered[0].naturalFloor, 10);
		assert.equal(rpgResolveTrainerRollTalents(scientist, 'skill', 'conhecimento:ciencias', []).naturalFloor, undefined);
		assert.equal(rpgResolveTrainerRollTalents(scientist, 'skill', 'conhecimento:ciencias',
			[offered[0].key]).naturalFloor, 10);
		assert.deepEqual(rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:regioes'), []);
	});
	it('offers Persistent Hypothesis after registering a failure, at most once per attempt', () => {
		let scientist = { ...sheet(), classId: 'cientista', talents: { general: [],
			class: ['cientista:hipotese-persistente'], apex: null } };
		assert.deepEqual(rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:biologia'), []);
		scientist = rpgUpdatePersistentHypothesis(scientist, { action: 'failure' });
		assert.throws(() => rpgUpdatePersistentHypothesis(scientist,
			{ action: 'failure' }), /Realize a tentativa/);
		let [option] = rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:biologia');
		assert.equal(option.bonus, 1);
		assert.equal(rpgResolveTrainerRollTalents(scientist, 'skill', 'conhecimento:biologia', [option.key]).bonus, 1);
		assert.deepEqual(rpgTrainerRollTalentOptions(scientist, 'skill', 'percepcao'), []);
		scientist.persistentHypothesis.awaitingOutcome = true;
		assert.deepEqual(rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:biologia'), []);
		scientist = rpgUpdatePersistentHypothesis(scientist, { action: 'failure' });
		[option] = rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:biologia');
		assert.equal(option.bonus, 2);
		scientist = rpgUpdatePersistentHypothesis(scientist, { action: 'reset' });
		assert.equal(scientist.persistentHypothesis, undefined);
		assert.deepEqual(rpgTrainerRollTalentOptions(scientist, 'skill', 'conhecimento:biologia'), []);
	});
	it('offers Technical Opinion to allies for a related practical skill check', () => {
		const scientist = { ...sheet(), classId: 'cientista', talents: { general: [],
			class: ['cientista:parecer-tecnico'], apex: null } };
		const option = rpgTechnicalOpinionOption('cientista', 'Lia', scientist);
		assert.equal(option.bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'medicina', [option.key], [option]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'attribute', 'intelligence',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgTechnicalOpinionOption('outro', 'Rui', sheet()), null);
	});
	it('offers Expedition Leader to allies only for physical travel checks', () => {
		const leader = { ...sheet(), classId: 'atleta', talents: { general: [], class: [],
			apex: 'atleta:lider-de-expedicao' } };
		const ally = sheet();
		const option = rpgExpeditionLeaderOption('leader', 'Lia', leader);
		assert.equal(option.bonus, 2);
		for (const [kind, id] of [['skill', 'atletismo'], ['skill', 'acrobacia'],
			['resistance', 'fortitude']]) {
			assert.equal(rpgResolveTrainerRollTalents(ally, kind, id, [option.key], [option]).bonus, 2);
		}
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'skill', 'percepcao',
			[option.key], [option]), /indisponível/);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'skill', 'atletismo',
			[option.key]), /indisponível/);
		assert.equal(rpgExpeditionLeaderOption('other', 'Ana', ally), null);
	});
	it('offers Linha de Vida only for Atletismo and Acrobacia while crossing the prepared obstacle', () => {
		const explorer = { ...sheet(), classId: 'explorador', talents: { general: [],
			class: ['explorador:linha-de-vida'], apex: null } };
		const allyOption = rpgExplorerLifelineOption('explorer', 'Lia', explorer);
		for (const skill of ['atletismo', 'acrobacia']) {
			const own = rpgTrainerRollTalentOptions(explorer, 'skill', skill)
				.find(option => option.id === 'explorador:linha-de-vida');
			assert.equal(own.bonus, 2);
			assert.equal(rpgResolveTrainerRollTalents(explorer, 'skill', skill, [own.key]).bonus, 2);
			assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', skill,
				[allyOption.key], [allyOption]).bonus, 2);
		}
		assert.equal(rpgTrainerRollTalentOptions(explorer, 'skill', 'sobrevivencia')
			.some(option => option.id === 'explorador:linha-de-vida'), false);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'sobrevivencia',
			[allyOption.key], [allyOption]), /indisponível/);
		assert.equal(rpgExplorerLifelineOption('other', 'Ana', sheet()), null);
	});
	it('keeps the Captain bonus available to designated participants after use', () => {
		const athlete = { ...sheet(), classId: 'atleta', talents: { general: [],
			class: ['atleta:capitao-de-time'], apex: null }, captainPlan: {
			description: 'Travessia da ponte', recipientCharacterIds: ['aliado', 'capitao'], usedRecipientIds: [],
		} };
		const option = rpgTeamCaptainOption('capitao', 'Lia', athlete, 'aliado');
		assert.deepEqual(rpgTrainerRollTalentOptions(athlete, 'skill', 'atletismo'), []);
		assert.equal(option.bonus, 2);
		assert.equal(rpgTeamCaptainOption('capitao', 'Lia', athlete, 'capitao').bonus, 2);
		assert.match(option.condition, /Travessia da ponte/);
		assert.deepEqual(option.targets, ['skill:atletismo', 'skill:acrobacia']);
		assert.equal(rpgTeamCaptainOption('capitao', 'Lia', athlete, 'outro'), null);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'atletismo',
			[option.key], [option]).bonus, 2);
		athlete.captainPlan.usedRecipientIds.push('aliado');
		assert.equal(rpgTeamCaptainOption('capitao', 'Lia', athlete, 'aliado').bonus, 2);
		athlete.captainPlan.recipientCharacterIds = ['capitao'];
		assert.equal(rpgTeamCaptainOption('capitao', 'Lia', athlete, 'aliado'), null);
	});
	it('offers a Detective capture plan after preparation, once per designated participant', () => {
		const detective = { ...sheet(), classId: 'detetive', level: 7,
			talents: { general: [], class: ['detetive:plano-de-captura'], apex: null },
			capturePlan: { description: 'Conter o fugitivo no cais',
				recipientCharacterIds: ['detetive', 'aliado'], usedRecipientIds: [],
				readyAt: '2026-10-15T12:30:00.000Z' } };
		assert.deepEqual(rpgTrainerRollTalentOptions(detective, 'skill', 'atletismo'), []);
		assert.equal(rpgDetectiveCapturePlanOption('detetive', 'Lia', detective,
			'aliado', '2026-10-15T12:29:00.000Z'), null);
		const option = rpgDetectiveCapturePlanOption('detetive', 'Lia', detective,
			'aliado', '2026-10-15T12:30:00.000Z');
		assert.equal(option.bonus, 2);
		assert.match(option.condition, /cais/);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'atletismo',
			[option.key], [option]).bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'pilotagem:terrestre',
			[option.key], [option]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'attack', 'melee',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgDetectiveCapturePlanOption('detetive', 'Lia', detective,
			'outro', '2026-10-15T12:30:00.000Z'), null);
		detective.capturePlan.usedRecipientIds.push('aliado');
		assert.equal(rpgDetectiveCapturePlanOption('detetive', 'Lia', detective,
			'aliado', '2026-10-15T12:31:00.000Z'), null);
		assert(rpgDetectiveCapturePlanOption('detetive', 'Lia', detective,
			'detetive', '2026-10-15T12:31:00.000Z'));
	});
	it('offers Inseparable Duo only as an optional Intuition bonus from the linked partner base SpA', () => {
		const detective = { ...sheet(), classId: 'detetive', talents: { general: [],
			class: ['detetive:parceiro-investigativo', 'detetive:voz-do-parceiro'],
			apex: 'detetive:dupla-indissociavel' }, investigativePartnerPokemonId: 'squirtle-1' };
		const option = rpgDetectiveDuoOption(detective, 'Squirtle', 50);
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['skill:intuicao']);
		assert.equal(rpgResolveTrainerRollTalents(detective, 'skill', 'intuicao', [], [option]).bonus, 0);
		assert.equal(rpgResolveTrainerRollTalents(detective, 'skill', 'intuicao', [option.key], [option]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(detective, 'skill', 'investigacao',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgDetectiveDuoOption({ ...detective, investigativePartnerUnavailable: true },
			'Squirtle', 50), null);
		assert.equal(rpgDetectiveDuoOption({ ...detective, investigativePartnerPokemonId: undefined },
			'Squirtle', 50), null);
	});
	it('offers Crossing Swimmer +2 only for relevant Athletics rolls', () => {
		const athlete = { ...sheet(), classId: 'atleta', talents: { general: [],
			class: ['atleta:nadador-de-travessia'], apex: null } };
		const options = rpgTrainerRollTalentOptions(athlete, 'skill', 'atletismo');
		assert.equal(options[0].name, 'Nadador de Travessia');
		assert.equal(rpgResolveTrainerRollTalents(athlete, 'skill', 'atletismo', [options[0].key]).bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(athlete, 'skill', 'acrobacia'), []);
	});
	it('offers Sports Riding +2 only for relevant Mount Pokemon checks', () => {
		const athlete = { ...sheet(), classId: 'atleta', talents: { general: [],
			class: ['atleta:montaria-esportiva'], apex: null } };
		const [option] = rpgTrainerRollTalentOptions(athlete, 'skill', 'montaria-pokemon');
		assert.equal(option.bonus, 2);
		assert.match(option.condition, /Corrida, salto/);
		assert.equal(rpgResolveTrainerRollTalents(athlete, 'skill', 'montaria-pokemon',
			[option.key]).bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(athlete, 'skill', 'atletismo'), []);
	});
	it('offers Rules Eye as a contextual Athletics alternative without a numeric bonus', () => {
		const athlete = { ...sheet(), classId: 'atleta', talents: { general: [],
			class: ['atleta:olho-para-as-regras'], apex: null } };
		const [option] = rpgTrainerRollTalentOptions(athlete, 'skill', 'atletismo');
		assert.equal(option.bonus, 0);
		assert.match(option.condition, /Usar Atletismo para perceber/);
		assert.equal(rpgResolveTrainerRollTalents(athlete, 'skill', 'atletismo', [option.key]).bonus, 0);
		assert.deepEqual(rpgTrainerRollTalentOptions(athlete, 'skill', 'captura'), []);
	});
	it('offers Thousand Faces only when the skill roll actually uses Charisma', () => {
		const artist = { ...sheet(), classId: 'artista', talents: { general: [],
			class: ['artista:corpo-de-cena'], apex: 'artista:mil-faces' } };
		const option = rpgTrainerRollTalentOptions(artist, 'skill', 'persuasao')[0];
		assert.equal(option.id, 'artista:mil-faces');
		assert.equal(option.bonus, 2);
		assert.equal(option.requiredAttribute, 'charisma');
		assert.equal(rpgResolveTrainerRollTalents(artist, 'skill', 'intimidacao',
			[option.key], [], 'charisma').bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(artist, 'skill', 'intimidacao',
			[option.key], [], 'strength'), /indisponível/);
		assert.equal(rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao',
			[option.key], [], 'charisma').bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao',
			[option.key], [], 'dexterity'), /indisponível/);
		assert.deepEqual(rpgTrainerRollTalentOptions(artist, 'skill', 'percepcao'), []);
	});
	it('offers Captivating Distraction to allies only for Stealth and Sleight of Hand', () => {
		const artist = { ...sheet(), classId: 'artista', talents: { general: [],
			class: ['artista:distracao-cativante'], apex: null } };
		const option = rpgCaptivatingDistractionOption('artista', 'Lia', artist);
		assert.equal(option.name, 'Distração Cativante de Lia');
		assert.deepEqual(option.targets, ['skill:furtividade', 'skill:ladinagem']);
		for (const skill of ['furtividade', 'ladinagem']) {
			assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', skill, [option.key], [option]).bonus, 2);
		}
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'atuacao',
			[option.key], [option]), /indisponível/);
		assert.equal(rpgCaptivatingDistractionOption('outro', 'Rui', sheet()), null);
	});
	it('offers Comforting Art only while its prepared Will bonus remains unspent', () => {
		const prepared = { ...sheet(), comfortingArt: {
			sourceCharacterId: 'artista', sourceName: 'Lia', restCycle: 2 }, talentRestCycle: 2 };
		const option = rpgTrainerRollTalentOptions(prepared, 'resistance', 'will')[0];
		assert.equal(option.name, 'Arte Reconfortante de Lia');
		assert.equal(rpgResolveTrainerRollTalents(prepared, 'resistance', 'will', [option.key]).bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(prepared, 'resistance', 'reflexes'), []);
		assert.deepEqual(rpgTrainerRollTalentOptions({ ...prepared, talentRestCycle: 3 }, 'resistance', 'will'), []);
	});
	it('lets an ally select Artistic Inspiration for one skill roll without stacking inspirations', () => {
		const artist = { ...sheet(), classId: 'artista', talents: { general: [],
			class: ['artista:inspiracao-artistica'], apex: null } };
		const option = rpgArtisticInspirationOption('artista', 'Lia', artist);
		assert.equal(option.name, 'Inspiração Artística de Lia');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['skill:*']);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'investigacao',
			[option.key], [option]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'attribute', 'wisdom',
			[option.key], [option]), /indisponível/);
		const second = rpgArtisticInspirationOption('outro', 'Rui', artist);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'investigacao',
			[option.key, second.key], [option, second]), /Variantes do mesmo talento/);
		assert.equal(rpgArtisticInspirationOption('outro', 'Rui', sheet()), null);
	});
	it('offers both Artist Versatile modalities separately without stacking them with Signature Technique', () => {
		const artist = { ...sheet(), classId: 'artista', talents: { general: [],
			class: ['artista:tecnica-assinatura', 'artista:artista-versatil'], apex: null },
		talentSelections: [
			{ id: 'artista:tecnica-assinatura', variant: 'Canto', acquiredAtLevel: 3 },
			{ id: 'artista:artista-versatil', variant: 'Dança', secondVariant: 'Poesia',
				attribute: 'charisma', acquiredAtLevel: 5 },
		] };
		const options = rpgTrainerRollTalentOptions(artist, 'skill', 'atuacao');
		assert.deepEqual(options.map(option => option.name),
			['Técnica Assinatura (Canto)', 'Artista Versátil (Dança)', 'Artista Versátil (Poesia)']);
		assert.equal(rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao', [options[1].key]).bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao', [options[2].key]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao',
			[options[1].key, options[2].key]), /Variantes do mesmo talento/);
		assert.throws(() => rpgResolveTrainerRollTalents(artist, 'skill', 'atuacao',
			[options[0].key, options[1].key]), /não se acumulam/);
	});
	it('offers each Athlete Versatile sport separately without stacking Sports Specialty', () => {
		const athlete = { ...sheet(), classId: 'atleta', talents: { general: [],
			class: ['atleta:especialidade-esportiva', 'atleta:atleta-polivalente'], apex: null },
		talentSelections: [
			{ id: 'atleta:especialidade-esportiva', variant: 'Corrida', acquiredAtLevel: 3 },
			{ id: 'atleta:atleta-polivalente', variant: 'Natação', secondVariant: 'Ginástica',
				thirdVariant: 'Escalada', attribute: 'strength', acquiredAtLevel: 5 },
		] };
		for (const skill of ['atletismo', 'acrobacia']) {
			const options = rpgTrainerRollTalentOptions(athlete, 'skill', skill);
			assert.deepEqual(options.map(option => option.name), [
				'Especialidade Esportiva (Corrida)', 'Atleta Polivalente (Natação)',
				'Atleta Polivalente (Ginástica)', 'Atleta Polivalente (Escalada)',
			]);
			assert.equal(rpgResolveTrainerRollTalents(athlete, 'skill', skill, [options[2].key]).bonus, 2);
			assert.throws(() => rpgResolveTrainerRollTalents(athlete, 'skill', skill,
				[options[1].key, options[2].key]), /Variantes do mesmo talento/);
			assert.throws(() => rpgResolveTrainerRollTalents(athlete, 'skill', skill,
				[options[0].key, options[1].key]), /não se acumulam/);
			athlete.talents.apex = 'atleta:atleta-completo';
			assert.equal(rpgResolveTrainerRollTalents(athlete, 'skill', skill,
				[options[0].key]).bonus, 2);
		}
	});
	it('offers Voice of Ages only to its owner on Knowledge rolls', () => {
		const owner = { ...sheet(), talents: { general: [], class: [], apex: 'arqueologo:voz-das-eras' } };
		const option = rpgTrainerRollTalentOptions(owner, 'skill', 'conhecimento:regioes')[0];
		assert.equal(option.naturalFloor, 10);
		assert.equal(rpgResolveTrainerRollTalents(owner, 'skill', 'conhecimento:regioes',
			[option.key]).naturalFloor, 10);
		assert.deepEqual(rpgTrainerRollTalentOptions(owner, 'skill', 'investigacao'), []);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'conhecimento:regioes',
			[option.key]), /indisponível/);
	});
	it('offers Master of Excavation to its owner and allies without stacking Stratigraphic Reading', () => {
		const master = { ...sheet(), talents: { general: [],
			class: ['arqueologo:leitura-estratigrafica'], apex: 'arqueologo:mestre-da-escavacao' } };
		const ally = sheet();
		const option = rpgExcavationMasterOption('archaeologist', 'Ana', master);
		assert.equal(option.bonus, 4);
		assert.equal(rpgTrainerRollTalentOptions(master, 'skill', 'investigacao')
			.find(talent => talent.id === option.id).bonus, 4);
		assert.equal(rpgResolveTrainerRollTalents(ally, 'skill', 'investigacao', [option.key], [option]).bonus, 4);
		assert.throws(() => rpgResolveTrainerRollTalents(master, 'skill', 'investigacao',
			['arqueologo:mestre-da-escavacao', 'arqueologo:leitura-estratigrafica']), /substitui/);
		assert.equal(rpgExcavationMasterOption('other', 'Bruno', ally), null);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'skill', 'investigacao', [option.key]),
			/indisponível/);
	});
	it('offers Relic Rescue +2 only on selected human checks, not attacks', () => {
		const owned = { ...sheet(), talents: { general: [],
			class: ['arqueologo:resgate-de-reliquia'], apex: null } };
		for (const [kind, id] of [['attribute', 'dexterity'], ['skill', 'percepcao'],
			['skill', 'investigacao'], ['resistance', 'reflexes']]) {
			assert.equal(rpgTrainerRollTalentOptions(owned, kind, id)[0].bonus, 2);
			assert.equal(rpgResolveTrainerRollTalents(owned, kind, id,
				['arqueologo:resgate-de-reliquia']).bonus, 2);
		}
		assert.deepEqual(rpgTrainerRollTalentOptions(owned, 'attack', 'melee'), []);
		assert.equal(rpgResolveTrainerRollTalents(owned, 'skill', 'percepcao', []).bonus, 0);
	});
	it('prepares one archive per proficiency slot and grants the bonus only to its recipient', () => {
		const author = { ...sheet(), level: 2,
			talents: { general: [], class: ['arqueologo:acervo-compartilhado'], apex: null },
			skills: { trained: ['conhecimento:arqueologia-fosseis'], focused: [] } };
		const first = rpgSetSharedArchive(author, 0, { topic: 'Escavar fósseis',
			knowledge: 'conhecimento:arqueologia-fosseis', recipientCharacterId: 'autor' });
		const second = rpgSetSharedArchive(first, 1, { topic: 'Escavar fósseis',
			knowledge: 'conhecimento:arqueologia-fosseis', recipientCharacterId: 'aliado' });
		assert.equal(second.sharedArchives.length, 2);
		const selfOptions = rpgSharedArchiveOptions('autor', 'Arqueólogo', second, 'autor');
		const allyOptions = rpgSharedArchiveOptions('autor', 'Arqueólogo', second, 'aliado');
		assert.equal(selfOptions.length, 1);
		assert.equal(allyOptions.length, 1);
		assert.notEqual(selfOptions[0].key, allyOptions[0].key);
		assert.deepEqual(rpgTrainerRollTalentOptions(second, 'skill', 'conhecimento:arqueologia-fosseis'), []);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'conhecimento:arqueologia-fosseis',
			[allyOptions[0].key], allyOptions).bonus, 2);
		assert.equal(rpgTrainerRollBonusTerms(2, allyOptions), '+ 2 + 2');
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill', 'conhecimento:regioes',
			[allyOptions[0].key], allyOptions), /indisponível/);
		assert.throws(() => rpgSetSharedArchive(second, 2, null), /Espaço/);
		assert.throws(() => rpgSetSharedArchive(second, 0, { topic: 'Teste',
			knowledge: 'conhecimento:regioes', recipientCharacterId: 'aliado' }), /treinada/);
		assert.deepEqual(rpgSharedArchiveOptions('autor', 'Arqueólogo', {
			...second, talents: { general: [], class: [], apex: null } }, 'aliado'), []);
		assert.deepEqual(rpgSharedArchiveOptions('autor', 'Arqueólogo', {
			...second, skills: { trained: [], focused: [] } }, 'aliado'), []);
		assert.equal(rpgSetSharedArchive(second, 0, null).sharedArchives.length, 1);
	});
	it('never stacks two shared archives from one author on the same roll', () => {
		const author = { ...sheet(), level: 2,
			talents: { general: [], class: ['arqueologo:acervo-compartilhado'], apex: null },
			skills: { trained: ['conhecimento:arqueologia-fosseis'], focused: [] } };
		const first = rpgSetSharedArchive(author, 0, { topic: 'Camadas de solo',
			knowledge: 'conhecimento:arqueologia-fosseis', recipientCharacterId: 'aliado' });
		const second = rpgSetSharedArchive(first, 1, { topic: 'Escavação segura',
			knowledge: 'conhecimento:arqueologia-fosseis', recipientCharacterId: 'aliado' });
		const options = rpgSharedArchiveOptions('autor', 'Arqueólogo', second, 'aliado');
		assert.equal(options.length, 2);
		assert.equal(rpgResolveTrainerRollTalents(sheet(), 'skill', 'conhecimento:arqueologia-fosseis',
			[options[0].key], options).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'skill',
			'conhecimento:arqueologia-fosseis', options.map(option => option.key), options),
		/Apenas um Acervo Compartilhado/);
	});
	it('offers Documentation in Order for Deception and Persuasion, but not Investigation', () => {
		const owned = chooseRPGTrainerTalent(sheet(), { id: 'documentacao-em-ordem' });
		for (const skill of ['enganacao', 'persuasao']) {
			assert.equal(rpgTrainerRollTalentOptions(owned, 'skill', skill)[0].bonus, 2);
			assert.equal(rpgResolveTrainerRollTalents(owned, 'skill', skill,
				['documentacao-em-ordem']).bonus, 2);
		}
		assert.deepEqual(rpgTrainerRollTalentOptions(owned, 'skill', 'investigacao'), []);
	});
	it('offers Encouraging Presence only from its owner to an ally on Will checks', () => {
		const owner = chooseRPGTrainerTalent(sheet(), { id: 'presenca-encorajadora' });
		const ally = sheet();
		const offered = rpgEncouragingPresenceOption('ally-1', 'Ana', owner);
		assert.equal(offered.bonus, 2);
		assert.equal(rpgEncouragingPresenceOption('ally-1', 'Ana', ally), null);
		assert.equal(rpgResolveTrainerRollTalents(ally, 'resistance', 'will', [offered.key], [offered]).bonus, 2);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'resistance', 'reflexes',
			[offered.key], [offered]), /indisponível/);
		assert.throws(() => rpgResolveTrainerRollTalents(ally, 'resistance', 'will',
			[offered.key]), /indisponível/);
	});
	it('offers Observation Learning only for untrained skills and adds full proficiency to one roll', () => {
		const owned = chooseRPGTrainerTalent(sheet(), { id: 'aprendizado-por-observacao' });
		const skill = 'conhecimento:organizacoes';
		const option = rpgTrainerRollTalentOptions(owned, 'skill', skill);
		assert.equal(option.length, 1);
		assert.equal(option[0].bonus, rpgTrainerProficiency(owned.level));
		assert.deepEqual(rpgTrainerRollTalentOptions(owned, 'skill', 'investigacao'), []);
		assert.deepEqual(rpgTrainerRollTalentOptions(owned, 'attribute', 'intelligence'), []);
		assert.throws(() => rollRPGTrainerSkillCheck(owned, skill, undefined, { dc: 0 }, () => 0),
			/treinamento/);
		const resolved = rpgResolveTrainerRollTalents(owned, 'skill', skill,
			['aprendizado-por-observacao']);
		const result = rollRPGTrainerSkillCheck(owned, skill, undefined,
			{ dc: 0, bonus: resolved.bonus, temporarilyTrained: true }, () => 0);
		assert.equal(result.total, 1 + 2 + rpgTrainerProficiency(owned.level));
		assert(!owned.skills.trained.includes(skill));
		assert.throws(() => rpgResolveTrainerRollTalents(owned, 'skill', 'investigacao',
			['aprendizado-por-observacao']), /indisponível/);
	});
	it('offers an owned talent only for its relevant roll and applies the selected bonus', () => {
		const owned = chooseRPGTrainerTalent(sheet(), { id: 'reflexo-de-sobrevivencia' });
		const options = rpgTrainerRollTalentOptions(owned, 'resistance', 'reflexes');
		assert.equal(options.length, 1);
		assert.equal(options[0].bonus, 2);
		assert.deepEqual(rpgTrainerRollTalentOptions(owned, 'resistance', 'will'), []);
		assert.deepEqual(rpgResolveTrainerRollTalents(owned, 'resistance', 'reflexes', []),
			{ chosen: [], bonus: 0, advantages: 0 });
		assert.equal(rpgResolveTrainerRollTalents(owned, 'resistance', 'reflexes',
			['reflexo-de-sobrevivencia']).bonus, 2);
	});

	it('rejects forged, duplicated and unrelated talents', () => {
		const owned = chooseRPGTrainerTalent(sheet(), { id: 'reflexo-de-sobrevivencia' });
		assert.throws(() => rpgResolveTrainerRollTalents(owned, 'resistance', 'will',
			['reflexo-de-sobrevivencia']), /indisponível/);
		assert.throws(() => rpgResolveTrainerRollTalents(owned, 'resistance', 'reflexes',
			['reflexo-de-sobrevivencia', 'reflexo-de-sobrevivencia']), /inválidos/);
		assert.throws(() => rpgResolveTrainerRollTalents(sheet(), 'resistance', 'reflexes',
			['reflexo-de-sobrevivencia']), /indisponível/);
	});

	it('adds owned situational advantage without modifying the fixed resistance bonus', () => {
		const owned = chooseRPGTrainerTalent(sheet(), { id: 'mente-firme' });
		const option = rpgResolveTrainerRollTalents(owned, 'resistance', 'will', ['mente-firme']);
		assert.equal(option.advantages, 1);
		assert.equal(option.bonus, 0);
	});

	it('prints every selected numeric bonus as its own term in the chat calculation', () => {
		const talents = [
			{ name: 'Reflexo de Sobrevivência', bonus: 2 },
			{ name: 'Proteção de Campo', bonus: 1 },
		];
		assert.equal(rpgTrainerRollBonusTerms(3, talents), '+ 3 + 2 + 1');
		assert.equal(rpgTrainerRollBonusTerms(-1, talents), '- 1 + 2 + 1');
		assert.equal(rpgTrainerRollBonusTerms(3, [{ name: 'Mente Firme', bonus: 0 }]), '+ 3');
	});
});
