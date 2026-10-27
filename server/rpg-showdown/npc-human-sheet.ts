import { rpgTrainerProficiency } from './trainer-checks';

const ATTRIBUTES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const SAVE_ATTRIBUTES = { fortitude: 'constitution', reflexes: 'dexterity', will: 'wisdom' } as const;
const ATTACK_ATTRIBUTES = { melee: 'strength', ranged: 'dexterity' } as const;

type Attribute = typeof ATTRIBUTES[number];
type Save = keyof typeof SAVE_ATTRIBUTES;
type Attack = keyof typeof ATTACK_ATTRIBUTES;

export interface NPCSkillChoice { name: string; attribute: Attribute; trained: boolean; extraBonus?: number }
export interface NPCHumanSheetInput {
	level: number;
	hitDie: 6 | 8 | 10;
	attributes: Record<Attribute, number>;
	trainedSaves: Save[];
	trainedAttacks: Attack[];
	skills: NPCSkillChoice[];
}

export function deriveNPCHumanSheet(raw: unknown) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ficha do NPC inválida');
	const input = raw as Record<string, unknown>;
	const level = input.level;
	const hitDie = input.hitDie;
	if (!Number.isSafeInteger(level) || (level as number) < 1 || (level as number) > 10 ||
		![6, 8, 10].includes(hitDie as number)) throw new Error('Nível ou dado de PV inválido na ficha do NPC');
	const attributes = input.attributes as Record<string, unknown>;
	if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes) ||
		ATTRIBUTES.some(key => !Number.isSafeInteger(attributes[key]) ||
			(attributes[key] as number) < -5 || (attributes[key] as number) > 5)) {
		throw new Error('Modificador de atributo inválido na ficha do NPC');
	}
	const trainedSaves = input.trainedSaves;
	const trainedAttacks = input.trainedAttacks;
	if (!Array.isArray(trainedSaves) || trainedSaves.some(key => !(key in SAVE_ATTRIBUTES)) ||
		new Set(trainedSaves).size !== trainedSaves.length || !Array.isArray(trainedAttacks) ||
			trainedAttacks.some(key => !(key in ATTACK_ATTRIBUTES)) ||
			new Set(trainedAttacks).size !== trainedAttacks.length) {
		throw new Error('Treinamentos inválidos na ficha do NPC');
	}
	if (!Array.isArray(input.skills) || input.skills.length > 50) throw new Error('Perícias inválidas na ficha do NPC');
	const names = new Set<string>();
	const proficiency = rpgTrainerProficiency(level as number);
	const skills = input.skills.map(rawSkill => {
		if (!rawSkill || typeof rawSkill !== 'object' || Array.isArray(rawSkill)) {
			throw new Error('Perícias inválidas na ficha do NPC');
		}
		const skill = rawSkill as Record<string, unknown>;
		const name = typeof skill.name === 'string' ? skill.name.trim() : '';
		const extraBonus = skill.extraBonus ?? 0;
		if (!name || name.length > 80 || !ATTRIBUTES.includes(skill.attribute as Attribute) ||
			typeof skill.trained !== 'boolean' || names.has(name.toLocaleLowerCase('pt-BR')) ||
			!Number.isSafeInteger(extraBonus) || (extraBonus as number) < -100 || (extraBonus as number) > 100) {
			throw new Error('Perícias inválidas na ficha do NPC');
		}
		names.add(name.toLocaleLowerCase('pt-BR'));
		return { name, attribute: skill.attribute as Attribute, trained: skill.trained, extraBonus,
			bonus: (attributes[skill.attribute as Attribute] as number) + (skill.trained ? proficiency : 0) + (extraBonus as number) };
	});
	const saves = Object.fromEntries(Object.entries(SAVE_ATTRIBUTES).map(([key, attribute]) =>
		[key, (attributes[attribute] as number) + (trainedSaves.includes(key) ? proficiency : 0)]));
	const attacks = Object.fromEntries(Object.entries(ATTACK_ATTRIBUTES).map(([key, attribute]) =>
		[key, (attributes[attribute] as number) + (trainedAttacks.includes(key) ? proficiency : 0)]));
	const constitution = attributes.constitution as number;
	const growth = Math.max(1, (hitDie === 6 ? 4 : hitDie === 8 ? 5 : 6) + constitution);
	const maximum = Math.max(1, 10 + (hitDie as number) + constitution + ((level as number) - 1) * growth);
	return { sheet: { level, hitDie, attributes: Object.fromEntries(ATTRIBUTES.map(key => [key, attributes[key]])),
		trainedSaves, trainedAttacks, skills, proficiency,
		initiative: attributes.dexterity, saves, attacks }, maximum,
	defense: 10 + (attributes.dexterity as number) };
}
