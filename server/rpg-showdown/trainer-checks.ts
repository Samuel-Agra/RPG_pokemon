import { rpgTrainerModifier } from './trainer-creation';
import type { RPGTrainerAttributes, RPGTrainerSheet } from './trainer-sheet';
import { rpgTrainerSurvival, rpgTrainerSurvivalEffects } from './trainer-survival';

export type RPGTrainerAttribute = keyof RPGTrainerAttributes;
export type RPGTrainerResistance = 'fortitude' | 'reflexes' | 'will';
export type RPGCheckDegree = 'exceptional-success' | 'success' | 'narrow-failure' | 'failure' | 'severe-failure';
export type RPGProtection = 'ordinary' | 'protective-clothing' | 'light' | 'medium' | 'heavy';

export const RPG_DIFFICULTIES = Object.freeze({
	veryEasy: 5, easy: 10, moderate: 15, hard: 20, veryHard: 25, nearlyImpossible: 30,
});

/** A perícia é uma só; os domínios após ':' são treinamentos independentes. */
export const RPG_SKILL_ATTRIBUTES: Readonly<Record<string, readonly RPGTrainerAttribute[]>> = Object.freeze({
	acrobacia: ['dexterity'], atletismo: ['strength'], atuacao: ['charisma'], captura: ['dexterity'],
	conhecimento: ['intelligence'], 'empatia-pokemon': ['wisdom'], enganacao: ['charisma'],
	furtividade: ['dexterity'], intimidacao: ['strength', 'charisma'], intuicao: ['wisdom'],
	investigacao: ['intelligence'], ladinagem: ['dexterity'], medicina: ['wisdom'],
	'medicina-pokemon': ['wisdom'], 'montaria-pokemon': ['dexterity'], natureza: ['intelligence'],
	oficio: ['intelligence'], percepcao: ['wisdom'], persuasao: ['charisma'],
	pilotagem: ['dexterity'], sobrevivencia: ['wisdom'], tecnologia: ['intelligence'],
	'adestramento-pokemon': ['wisdom'],
});

/** Áreas comuns da ficha; treinamentos personalizados continuam aparecendo além destas opções. */
export const RPG_KNOWLEDGE_DOMAINS = Object.freeze([
	'regioes', 'historia-personagens-historicos', 'lendarios-miticos', 'pokemon',
	'organizacoes', 'cultura-sociedade', 'arqueologia-fosseis', 'ciencias',
]);
export const RPG_CRAFT_DOMAINS = Object.freeze([
	'culinaria', 'mecanica', 'costura', 'fotografia', 'carpintaria',
	'ferraria', 'jornalismo', 'artesanato',
]);

const RESISTANCE_ATTRIBUTE: Readonly<Record<RPGTrainerResistance, RPGTrainerAttribute>> = {
	fortitude: 'constitution', reflexes: 'dexterity', will: 'wisdom',
};
const TRAINED_ONLY = new Set(['ladinagem', 'pilotagem', 'oficio', 'adestramento-pokemon', 'montaria-pokemon']);

function hasTalent(sheet: RPGTrainerSheet, id: string): boolean {
	return sheet.talents.general.includes(id) || sheet.talents.class.includes(id) || sheet.talents.apex === id;
}

function validInteger(value: number, label: string, minimum: number, maximum: number): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} inválido`);
	return value;
}

function completeSheet(sheet: RPGTrainerSheet): asserts sheet is RPGTrainerSheet & { attributes: RPGTrainerAttributes } {
	if (!sheet || sheet.status !== 'complete' || !sheet.attributes) throw new Error('A ficha do treinador está pendente');
	validInteger(sheet.level, 'Nível do treinador', 1, 10);
}

function validateAttribute(attribute: RPGTrainerAttribute): void {
	if (!['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(attribute)) {
		throw new Error('Atributo do treinador inválido');
	}
}

function validateSkill(skill: string): string {
	if (typeof skill !== 'string') throw new Error('Perícia inválida');
	const family = skill.split(':')[0];
	if (!Object.prototype.hasOwnProperty.call(RPG_SKILL_ATTRIBUTES, family) ||
		(['conhecimento', 'oficio', 'pilotagem'].includes(family) && !/^[a-z0-9-]{2,40}$/.test(skill.slice(family.length + 1))) ||
		(!['conhecimento', 'oficio', 'pilotagem'].includes(family) && skill !== family)) {
		throw new Error('Perícia inválida');
	}
	return family;
}

/** A escolha de Competência Prática amplia apenas o atributo de sua perícia registrada. */
export function rpgTrainerSkillAttributes(sheet: RPGTrainerSheet, skill: string): RPGTrainerAttribute[] {
	const family = validateSkill(skill);
	const standard = RPG_SKILL_ATTRIBUTES[family];
	const selected = sheet.talents.general.includes('competencia-pratica') ?
		(sheet.talentSelections || []).filter(choice => choice.id === 'competencia-pratica' && choice.skill === skill)
			.map(choice => choice.variant as RPGTrainerAttribute).filter(attribute =>
				['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(attribute)) : [];
	return [...new Set([...standard, ...selected])];
}

export function rpgTrainerProficiency(level: number): number {
	validInteger(level, 'Nível do treinador', 1, 10);
	return level <= 4 ? 2 : level <= 8 ? 3 : 4;
}

export function rpgTrainerAttributeBonus(sheet: RPGTrainerSheet, attribute: RPGTrainerAttribute): number {
	completeSheet(sheet);
	validateAttribute(attribute);
	return rpgTrainerModifier(sheet.attributes[attribute]);
}

export function rpgTrainerSkillBonus(sheet: RPGTrainerSheet, skill: string,
	attribute?: RPGTrainerAttribute, trainedOnly = false, temporarilyTrained = false): number {
	completeSheet(sheet);
	const family = validateSkill(skill);
	const trained = sheet.skills.trained.includes(skill);
	if ((trainedOnly || TRAINED_ONLY.has(family) || skill === 'conhecimento:organizacoes') &&
		!trained && !temporarilyTrained) {
		throw new Error('Esta utilização da perícia exige treinamento');
	}
	if (sheet.skills.focused.includes(skill) && !trained) throw new Error('Foco exige treinamento na perícia');
	const selectedAttribute = attribute || RPG_SKILL_ATTRIBUTES[family][0];
	if (!rpgTrainerSkillAttributes(sheet, skill).includes(selectedAttribute)) {
		throw new Error('Atributo não permitido para esta perícia');
	}
	const modifier = rpgTrainerAttributeBonus(sheet, selectedAttribute);
	const conductorBonus = family === 'pilotagem' && hasTalent(sheet, 'condutor-versatil') &&
		sheet.talentSelections?.some(selection =>
			selection.id === 'condutor-versatil' && selection.variant === skill) ? 2 : 0;
	const scientistBonus = family === 'conhecimento' &&
		sheet.talentSelections?.some(selection =>
			selection.id === 'cientista:especializacao-cientifica' && selection.variant === skill) ? 2 : 0;
	const diverseKnowledgeBonus = family === 'conhecimento' && !trained && !temporarilyTrained &&
		hasTalent(sheet, 'conhecimento-diversificado') && sheet.talentSelections?.some(selection =>
		selection.id === 'conhecimento-diversificado' &&
		(selection.skill === skill || selection.variant === skill)) ?
		Math.floor(rpgTrainerProficiency(sheet.level) / 2) : 0;
	return modifier + (sheet.skills.focused.includes(skill) ? 2 : trained ? 1 : 0) * rpgTrainerProficiency(sheet.level) +
		conductorBonus + scientistBonus + diverseKnowledgeBonus -
		rpgTrainerSurvivalEffects(sheet).checkPenalty;
}

export function rpgTrainerResistanceBonus(sheet: RPGTrainerSheet, resistance: RPGTrainerResistance): number {
	completeSheet(sheet);
	if (!Object.prototype.hasOwnProperty.call(RESISTANCE_ATTRIBUTE, resistance)) throw new Error('Resistência inválida');
	return rpgTrainerAttributeBonus(sheet, RESISTANCE_ATTRIBUTE[resistance]) +
		(sheet.resistances.includes(resistance) ? rpgTrainerProficiency(sheet.level) : 0) -
		rpgTrainerSurvivalEffects(sheet).resistancePenalty;
}

export interface RPGD20Options {
	advantages?: number;
	disadvantages?: number;
}

export function rollRPGD20(random: () => number = Math.random, options: RPGD20Options = {}) {
	const advantages = validInteger(options.advantages ?? 0, 'Quantidade de vantagens', 0, 100);
	const disadvantages = validInteger(options.disadvantages ?? 0, 'Quantidade de desvantagens', 0, 100);
	const mode = advantages && disadvantages ? 'normal' : advantages ? 'advantage' : disadvantages ? 'disadvantage' : 'normal';
	const dice = Array.from({ length: mode === 'normal' ? 1 : 2 }, () => {
		const value = random();
		if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Fonte aleatória inválida');
		return Math.floor(value * 20) + 1;
	});
	return { dice, natural: mode === 'advantage' ? Math.max(...dice) : mode === 'disadvantage' ? Math.min(...dice) : dice[0], mode };
}

export function rpgCheckDegree(total: number, dc: number): RPGCheckDegree {
	if (!Number.isSafeInteger(total) || !Number.isSafeInteger(dc)) throw new Error('Total ou CD inválidos');
	const margin = total - dc;
	return margin >= 10 ? 'exceptional-success' : margin >= 0 ? 'success' :
		margin >= -4 ? 'narrow-failure' : margin > -10 ? 'failure' : 'severe-failure';
}

export function rpgHelpBonus(total: number): number {
	validInteger(total, 'Resultado da ajuda', -100, 200);
	return total < 10 ? 0 : Math.min(5, Math.floor(total / 5) - 1);
}

export function rpgBestHelpBonus(totals: readonly number[]): number {
	if (!Array.isArray(totals) || totals.length > 100) throw new Error('Ajudantes inválidos');
	return Math.max(0, ...totals.map(rpgHelpBonus));
}

export interface RPGTrainerCheckOptions extends RPGD20Options {
	dc: number;
	bonus?: number;
	/** Uma capacidade selecionada libera somente esta rolagem de uma perícia não treinada. */
	temporarilyTrained?: boolean;
	helpResults?: readonly { skill: string, total: number }[];
}

function check(bonus: number, options: RPGTrainerCheckOptions, random: () => number, skill?: string) {
	validInteger(options.dc, 'CD', 0, 1000);
	const circumstance = validInteger(options.bonus ?? 0, 'Bônus circunstancial', -100, 100);
	if (options.helpResults?.length && (!skill || options.helpResults.some(result => result.skill !== skill))) {
		throw new Error('A ajuda exige a mesma perícia do teste principal e não se aplica a resistências');
	}
	const help = rpgBestHelpBonus((options.helpResults || []).map(result => result.total));
	const roll = rollRPGD20(random, options);
	const total = roll.natural + bonus + circumstance + help;
	return { ...roll, bonus, circumstance, help, total, dc: options.dc,
		success: total >= options.dc, degree: rpgCheckDegree(total, options.dc) };
}

export function rollRPGTrainerAttributeCheck(sheet: RPGTrainerSheet, attribute: RPGTrainerAttribute,
	options: RPGTrainerCheckOptions, random: () => number = Math.random) {
	return check(rpgTrainerAttributeBonus(sheet, attribute) - rpgTrainerSurvivalEffects(sheet).checkPenalty, options, random);
}

export function rollRPGTrainerSkillCheck(sheet: RPGTrainerSheet, skill: string, attribute: RPGTrainerAttribute | undefined,
	options: RPGTrainerCheckOptions, random: () => number = Math.random) {
	return check(rpgTrainerSkillBonus(sheet, skill, attribute, false, options.temporarilyTrained), options, random, skill);
}

export function rollRPGTrainerResistance(sheet: RPGTrainerSheet, resistance: RPGTrainerResistance,
	options: RPGTrainerCheckOptions, random: () => number = Math.random) {
	return check(rpgTrainerResistanceBonus(sheet, resistance), options, random);
}

export function rollRPGTrainerHelp(sheet: RPGTrainerSheet, skill: string, attribute: RPGTrainerAttribute | undefined,
	random: () => number = Math.random, options: RPGD20Options = {}) {
	const bonus = rpgTrainerSkillBonus(sheet, skill, attribute);
	const roll = rollRPGD20(random, options);
	const total = roll.natural + bonus;
	return { ...roll, skill, attribute: attribute || RPG_SKILL_ATTRIBUTES[validateSkill(skill)][0], bonus, total,
		helpBonus: rpgHelpBonus(total) };
}

export function rpgOpposedCheck(firstTotal: number, secondTotal: number): 'first' | 'second' | 'unchanged' {
	validInteger(firstTotal, 'Primeiro resultado', -100, 1000);
	validInteger(secondTotal, 'Segundo resultado', -100, 1000);
	return firstTotal > secondTotal ? 'first' : firstTotal < secondTotal ? 'second' : 'unchanged';
}

export function rpgGroupCheck(successes: readonly boolean[]): boolean {
	if (!Array.isArray(successes) || !successes.length || successes.some(result => typeof result !== 'boolean')) {
		throw new Error('Resultados do grupo inválidos');
	}
	return successes.filter(Boolean).length >= Math.ceil(successes.length / 2);
}

export function rpgPassiveScore(bonus: number, options: RPGD20Options = {}): number {
	validInteger(bonus, 'Bônus passivo', -100, 100);
	const advantages = validInteger(options.advantages ?? 0, 'Quantidade de vantagens', 0, 100);
	const disadvantages = validInteger(options.disadvantages ?? 0, 'Quantidade de desvantagens', 0, 100);
	return 10 + bonus + (advantages && disadvantages ? 0 : advantages ? 5 : disadvantages ? -5 : 0);
}

export function rpgTrainerEffectDC(sheet: RPGTrainerSheet, attribute: RPGTrainerAttribute): number {
	completeSheet(sheet);
	return 8 + rpgTrainerProficiency(sheet.level) + rpgTrainerAttributeBonus(sheet, attribute) -
		rpgTrainerSurvivalEffects(sheet).dcPenalty;
}

export function rpgPokemonEffectDC(level: number, power: 0 | 1 | 2 | 3): number {
	validInteger(level, 'Nível do Pokémon', 1, 100);
	validInteger(power, 'Potência do efeito', 0, 3);
	return 8 + Math.floor(level / 5) + power;
}

export interface RPGTrainerDerivedOptions {
	protection?: RPGProtection;
	shield?: boolean;
	carriedKg?: number;
	defenseBonus?: number;
	movementBonusMeters?: number;
	humanResistanceBonus?: number;
	passivePerception?: RPGD20Options;
}

export function rpgTrainerDerivedStatistics(sheet: RPGTrainerSheet, options: RPGTrainerDerivedOptions = {}) {
	completeSheet(sheet);
	const protection = options.protection || 'ordinary';
	if (!['ordinary', 'protective-clothing', 'light', 'medium', 'heavy'].includes(protection)) {
		throw new Error('Proteção inválida');
	}
	const carriedKg = options.carriedKg ?? 0;
	if (!Number.isFinite(carriedKg) || carriedKg < 0 || carriedKg > 100_000) throw new Error('Peso carregado inválido');
	const strength = sheet.attributes.strength;
	const dexterity = rpgTrainerAttributeBonus(sheet, 'dexterity');
	const constitution = rpgTrainerAttributeBonus(sheet, 'constitution');
	const martialDefense = sheet.classId === 'artista-marcial' &&
		protection === 'ordinary' && !options.shield ?
		10 + dexterity + rpgTrainerAttributeBonus(sheet, 'wisdom') : null;
	const defenseBase = martialDefense ?? (protection === 'heavy' ? 16 :
		(protection === 'medium' ? 14 + Math.min(2, dexterity) :
		(protection === 'light' ? 12 : protection === 'protective-clothing' ? 11 : 10) + dexterity));
	const carryingBonus = 1 + Number(hasTalent(sheet, 'carregador')) * 0.5 +
		Number(hasTalent(sheet, 'atleta:carregador-experiente')) * 0.5;
	const encumbrance = carriedKg > strength * 7.5 * carryingBonus ? 'over-capacity' :
		carriedKg > strength * 5 * carryingBonus ? 'heavily-encumbered' :
		carriedKg > strength * 2.5 * carryingBonus ? 'encumbered' : 'normal';
	const movementPenalty = encumbrance === 'heavily-encumbered' ? 6 : encumbrance === 'encumbered' ? 3 : 0;
	const movementBonus = options.movementBonusMeters ?? 0;
	if (!Number.isFinite(movementBonus) || movementBonus < -20 || movementBonus > 100 || movementBonus * 2 % 1 !== 0) {
		throw new Error('Bônus de deslocamento inválido');
	}
	const survival = rpgTrainerSurvivalEffects(sheet);
	const talentMovement = Number(hasTalent(sheet, 'corredor')) * 3 +
		Number(hasTalent(sheet, 'atleta:atleta-completo')) * 1.5 +
		Number(hasTalent(sheet, 'artista-marcial:passos-leves') && protection === 'ordinary' &&
			encumbrance !== 'over-capacity') * 3 +
			Number(hasTalent(sheet, 'artista-marcial:corpo-aperfeicoado') && protection === 'ordinary' &&
				!options.shield && rpgTrainerSurvival(sheet).lifeState === 'conscious') * 3;
	const movement = Math.max(0, (sheet.classId === 'atleta' ? 10.5 : 9) + movementBonus + talentMovement -
		movementPenalty - survival.movementPenaltyMeters) * survival.movementMultiplier;
	const initiativeTalentBonus = Number(hasTalent(sheet, 'iniciativa-aprimorada')) * 3 +
		Number(hasTalent(sheet, 'artista-marcial:vigilancia-corporal')) * 2;
	return {
		defense: defenseBase + (options.shield ? 2 : 0) + validInteger(options.defenseBonus ?? 0, 'Bônus de Defesa', -100, 100),
		initiativeBonus: dexterity + initiativeTalentBonus,
		movementMeters: encumbrance === 'over-capacity' ? 0 : movement,
		passivePerception: rpgPassiveScore(rpgTrainerSkillBonus(sheet, 'percepcao'), options.passivePerception),
		encumbrance, physicalDisadvantage: encumbrance === 'heavily-encumbered',
		carrying: { normalKg: strength * 2.5 * carryingBonus, encumberedKg: strength * 5 * carryingBonus,
			maximumKg: strength * 7.5 * carryingBonus, pushPullLiftKg: strength * 15 *
				(1 + Number(hasTalent(sheet, 'atleta:carregador-experiente'))) },
		humanResistance: 8 + 3 * sheet.level + constitution +
			validInteger(options.humanResistanceBonus ?? 0, 'Bônus de resistência humana', -100, 100),
	};
}

export function rollRPGTrainerInitiative(sheet: RPGTrainerSheet, random: () => number = Math.random,
	options: RPGD20Options = {}) {
	const roll = rollRPGD20(random, options);
	const dexterityBonus = rpgTrainerAttributeBonus(sheet, 'dexterity');
	const talentBonus = Number(hasTalent(sheet, 'iniciativa-aprimorada')) * 3 +
		Number(hasTalent(sheet, 'artista-marcial:vigilancia-corporal')) * 2;
	return { ...roll, dexterityBonus, talentBonus, total: roll.natural + dexterityBonus + talentBonus -
		rpgTrainerSurvivalEffects(sheet).checkPenalty };
}

/** Em igualdade de total, prevalece DES; só depois ocorre o desempate aleatório. */
export function rpgInitiativeOrder(first: { total: number, dexterityBonus: number },
	second: { total: number, dexterityBonus: number }, random: () => number = Math.random): 'first' | 'second' {
	for (const value of [first.total, first.dexterityBonus, second.total, second.dexterityBonus]) {
		validInteger(value, 'Resultado de iniciativa', -100, 1000);
	}
	if (first.total !== second.total) return first.total > second.total ? 'first' : 'second';
	if (first.dexterityBonus !== second.dexterityBonus) return first.dexterityBonus > second.dexterityBonus ? 'first' : 'second';
	const value = random();
	if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Fonte aleatória inválida');
	return value < 0.5 ? 'first' : 'second';
}

export function rpgTrainerAttackBonus(sheet: RPGTrainerSheet, attribute: RPGTrainerAttribute,
	proficient: boolean): number {
	if (typeof proficient !== 'boolean') throw new Error('Domínio da arma inválido');
	return rpgTrainerAttributeBonus(sheet, attribute) + (proficient ? rpgTrainerProficiency(sheet.level) : 0) -
		rpgTrainerSurvivalEffects(sheet).attackPenalty;
}

/** Críticos automáticos pertencem apenas aos ataques humanos, nunca aos testes ou golpes Pokémon. */
export function rollRPGTrainerAttack(attackBonus: number, defense: number, random: () => number = Math.random,
	options: RPGD20Options = {}) {
	validInteger(attackBonus, 'Bônus de ataque', -100, 100);
	validInteger(defense, 'Defesa', 0, 1000);
	const roll = rollRPGD20(random, options);
	const total = roll.natural + attackBonus;
	return { ...roll, total, defense, hit: roll.natural === 20 || (roll.natural !== 1 && total >= defense),
		critical: roll.natural === 20 };
}

export function rollRPGTrainerDamage(diceCount: number, dieSides: number, fixedBonus: number,
	critical: boolean, random: () => number = Math.random) {
	validInteger(diceCount, 'Quantidade de dados', 1, 100);
	validInteger(dieSides, 'Faces do dado', 2, 100);
	validInteger(fixedBonus, 'Bônus fixo de dano', -100, 100);
	const dice = Array.from({ length: critical ? diceCount * 2 : diceCount }, () => {
		const value = random();
		if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Fonte aleatória inválida');
		return Math.floor(value * dieSides) + 1;
	});
	return { dice, total: Math.max(0, dice.reduce((sum, value) => sum + value, 0) + fixedBonus) };
}
