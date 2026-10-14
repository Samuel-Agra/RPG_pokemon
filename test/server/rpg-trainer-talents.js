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

	it('requires a recorded Master approval for narrative prerequisites and controlled weapons', () => {
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
			{ id: 'diplomata:reputacao-precedente' }), /verificados pelo Mestre/);
		assert.throws(() => service.approveTrainerTalentPrerequisite(player.token, 'ana',
			'diplomata:reputacao-precedente', 'Dois favores'), /master session required/);
		service.approveTrainerTalentPrerequisite(master.token, 'ana',
			'diplomata:reputacao-precedente', 'Dois favores em organizações diferentes');
		const chosen = service.chooseTrainerTalent(player.token,
			{ id: 'diplomata:reputacao-precedente' });
		assert.ok(chosen.talents.class.includes('diplomata:reputacao-precedente'));
		assert.equal(chosen.talentApprovals.length, 1);
		assert.throws(() => service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' }), /licença verificada/);
		service.approveTrainerTalentPrerequisite(master.token, 'ana',
			'dominio-de-arma:armas-ranged-exoticas', 'Licença regional válida');
		const licensed = service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' });
		assert.ok(licensed.proficiencies.includes('armas-ranged-exoticas'));
		assert.equal(licensed.talentApprovals.length, 2);
	});
});
