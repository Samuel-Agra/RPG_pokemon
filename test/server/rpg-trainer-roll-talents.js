'use strict';

const assert = require('assert').strict;
const { createRPGPendingTrainerSheet, chooseRPGTrainerTalent } = require('../../dist/server/rpg-showdown');
const { rollRPGTrainerSkillCheck, rpgTrainerProficiency } = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalentOptions, rpgResolveTrainerRollTalents, rpgTrainerRollBonusTerms,
	rpgArtisticInspirationOption, rpgCaptivatingDistractionOption, rpgEncouragingPresenceOption,
	rpgExcavationMasterOption,
	rpgSetSharedArchive, rpgSharedArchiveOptions } =
	require('../../dist/server/rpg-showdown/trainer-roll-talents');

function sheet() {
	return { ...createRPGPendingTrainerSheet(), status: 'complete', classId: 'arqueologo', level: 10,
		attributes: { strength: 12, dexterity: 14, constitution: 13, intelligence: 14, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
		skills: { trained: ['investigacao'], focused: [] }, resistances: ['will'] };
}

describe('RPG trainer situational roll talents', () => {
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
