import type { RPGTrainerAttributes, RPGTrainerSheet } from './trainer-sheet';

export const RPG_STANDARD_ATTRIBUTES = [15, 14, 13, 12, 10, 8] as const;
export type RPGTrainerAttributeMethod = 'standard' | 'rolled';

const SKILLS = 'acrobacia atletismo atuacao captura conhecimento empatia-pokemon enganacao furtividade intimidacao intuicao investigacao ladinagem medicina medicina-pokemon montaria-pokemon natureza oficio percepcao persuasao pilotagem sobrevivencia tecnologia adestramento-pokemon'.split(' ');
export const RPG_TRAINER_PILOTING_DOMAINS = Object.freeze([
	'automoveis', 'motocicletas', 'embarcacoes', 'aeronaves', 'maquinas-pesadas', 'veiculos-especiais',
]);
const ATTRS: (keyof RPGTrainerAttributes)[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

interface ClassRule {
	id: string; name: string; hitDie: 6 | 8 | 10; resistance: 'fortitude' | 'reflexes' | 'will';
	fixed: string[]; choices: number; excluded: string[];
	gear: string[]; gearChoices?: Record<string, string[]>; money?: number;
}
const rule = (id: string, name: string, hitDie: 6 | 8 | 10, resistance: ClassRule['resistance'],
	fixed: string, choices: number, excluded: string, gear: string,
	gearChoices?: Record<string, string[]>, money?: number): ClassRule => ({
	id, name, hitDie, resistance, fixed: fixed ? fixed.split(' ') : [], choices,
	excluded: excluded ? excluded.split(' ') : [], gear: gear ? gear.split(' ') : [], gearChoices, money,
});
const LIGHT = 'roupa-exploracao-leve';
const SURVIVAL = 'kit-sobrevivencia';
const EXPLORER = 'kit-explorador';
const DISGUISE = 'kit-disfarce';
const ARTISTIC = 'equipamento-artistico';
const PRESENTATION = 'traje-apresentacao';
const SOCIAL = ['traje-formal', PRESENTATION];
const CLASS_PROFICIENCIES: Readonly<Record<string, string[]>> = {
	arqueologo: ['kit-arqueologia'], artista: ['kit-disfarce'], 'artista-marcial': ['armas-melee-exoticas'],
	cientista: ['kit-cientifico'], cozinheiro: ['kit-culinaria'], coreografo: ['kit-disfarce'],
	'criador-pokemon': ['kit-medicina-pokemon'], detetive: ['kit-investigacao', 'kit-disfarce'],
	encantador: ['kit-disfarce'], explorador: ['armas-ranged-comuns'], fotografo: ['kit-fotografia'],
	'guarda-pokemon': ['armas-ranged-comuns', 'armas-ranged-exoticas', 'armas-nao-letais', 'escudos'],
	ladino: ['kit-ladinagem'],
	medico: ['kit-medico'], mentalista: ['kit-disfarce'], tecnologo: ['kit-tecnologico'],
};

/** Contrato de criação do nível 1, transcrito das vinte páginas de classes da V3. */
export const RPG_TRAINER_CLASSES: Readonly<Record<string, ClassRule>> = Object.freeze(Object.fromEntries([
	rule('arqueologo', 'Arqueólogo', 8, 'will', 'conhecimento:arqueologia-fosseis investigacao', 2,
		'atuacao adestramento-pokemon enganacao intimidacao medicina-pokemon montaria-pokemon',
		`kit-arqueologia ${EXPLORER} ${LIGHT} lanterna-cabeca`, { arma: ['faca', 'machadinha', 'martelo-leve'] }),
	rule('artista', 'Artista', 6, 'will', 'atuacao', 3,
		'adestramento-pokemon investigacao medicina medicina-pokemon montaria-pokemon natureza sobrevivencia',
		`${DISGUISE} ${ARTISTIC} ${PRESENTATION} refil-disfarce`),
	rule('artista-marcial', 'Artista Marcial', 10, 'fortitude', 'acrobacia atletismo', 2,
		'enganacao investigacao ladinagem tecnologia', `${EXPLORER} ${LIGHT}`,
		{ arma: ['espada', 'nunchaku', 'lanca'] }),
	rule('atleta', 'Atleta', 10, 'fortitude', 'atletismo acrobacia', 1,
		'enganacao investigacao ladinagem medicina-pokemon tecnologia', `${LIGHT} ${EXPLORER} equipamento-esportivo`,
		{ melhoria: ['arnes-escalada', 'colete-flutuacao', 'suporte-corrida'] }),
	rule('cientista', 'Cientista', 6, 'will', '', 4,
		'acrobacia atletismo atuacao enganacao intimidacao ladinagem montaria-pokemon',
		`kit-cientifico-1 refil-cientifico ${LIGHT}`),
	rule('cozinheiro', 'Cozinheiro', 8, 'fortitude', 'oficio:culinaria', 3,
		'acrobacia atletismo enganacao furtividade intimidacao investigacao ladinagem',
		`kit-culinaria-1 ${SURVIVAL} ${LIGHT} faca alimento*9`),
	rule('coreografo', 'Coreógrafo', 6, 'reflexes', 'atuacao adestramento-pokemon', 2,
		'furtividade intimidacao investigacao ladinagem medicina sobrevivencia',
		`${DISGUISE} ${ARTISTIC} ${PRESENTATION} conjunto-cenico-pokemon`),
	rule('criador-pokemon', 'Criador Pokémon', 8, 'will', 'adestramento-pokemon empatia-pokemon medicina-pokemon', 2,
		'acrobacia atletismo enganacao furtividade intimidacao investigacao ladinagem',
		`kit-medicina-pokemon refil-medicina-pokemon ${SURVIVAL} ${LIGHT} racao-pokemon*9`),
	rule('detetive', 'Detetive', 8, 'will', 'investigacao intuicao percepcao', 2,
		'adestramento-pokemon atuacao montaria-pokemon', `kit-investigacao ${DISGUISE} ${LIGHT} lanterna-cabeca`),
	rule('diplomata', 'Diplomata', 6, 'will', 'intuicao persuasao', 3,
		'acrobacia adestramento-pokemon atletismo furtividade ladinagem medicina-pokemon montaria-pokemon sobrevivencia',
		`traje-formal ${LIGHT} credencial-apresentacao alarme-pessoal`, undefined, 2000),
	rule('encantador', 'Encantador', 6, 'will', 'enganacao intuicao persuasao', 3,
		'acrobacia adestramento-pokemon atletismo ladinagem medicina medicina-pokemon montaria-pokemon natureza sobrevivencia',
		`${DISGUISE} refil-disfarce ${LIGHT}`, { traje: SOCIAL }),
	rule('explorador', 'Explorador', 10, 'fortitude', 'natureza percepcao sobrevivencia', 2,
		'atuacao enganacao intimidacao ladinagem persuasao',
		`${EXPLORER} ${SURVIVAL} ${LIGHT} flecha`,
		{ arco: ['arco-curto', 'arco-longo'], melhoria: ['forro-termico', 'sistema-resfriamento', 'camada-impermeavel', 'arnes-escalada', 'colete-flutuacao'] }),
	rule('fotografo', 'Fotógrafo', 8, 'reflexes', 'oficio:fotografia percepcao', 3,
		'enganacao intimidacao ladinagem medicina medicina-pokemon montaria-pokemon',
		`kit-fotografia ${SURVIVAL} ${LIGHT}`),
	rule('guarda-pokemon', 'Guarda Pokémon', 10, 'fortitude', 'atletismo percepcao', 2,
		'atuacao enganacao medicina-pokemon', `${LIGHT} bastao-contencao taser cartucho-taser*3`),
	rule('ladino', 'Ladino', 8, 'reflexes', 'furtividade ladinagem', 4,
		'adestramento-pokemon empatia-pokemon medicina-pokemon montaria-pokemon', `kit-ladinagem-1 ${LIGHT} faca`),
	rule('medico', 'Médico', 8, 'will', 'medicina', 4,
		'acrobacia adestramento-pokemon atletismo atuacao captura enganacao furtividade intimidacao ladinagem montaria-pokemon',
		`kit-medico-1 refil-medico*2 ${LIGHT}`),
	rule('mentalista', 'Mentalista', 6, 'will', 'enganacao persuasao', 3,
		'acrobacia adestramento-pokemon atletismo captura medicina medicina-pokemon montaria-pokemon natureza sobrevivencia',
		`${DISGUISE} conjunto-mentalismo ${LIGHT}`, { traje: SOCIAL }),
	rule('mestre-pokemon', 'Mestre Pokémon', 8, 'will', 'captura conhecimento:pokemon empatia-pokemon', 2,
		'acrobacia atuacao enganacao furtividade intimidacao investigacao ladinagem medicina',
		`pokeball*10 ${SURVIVAL} ${EXPLORER} ${LIGHT} racao*9 racao-pokemon*9`),
	rule('psiquico', 'Psíquico', 6, 'will', 'intuicao', 1,
		'acrobacia adestramento-pokemon atletismo atuacao captura enganacao furtividade intimidacao ladinagem montaria-pokemon pilotagem sobrevivencia',
		'objeto-foco alarme-pessoal'),
	rule('tecnologo', 'Tecnólogo', 6, 'will', 'tecnologia', 4,
		'acrobacia adestramento-pokemon atletismo atuacao empatia-pokemon enganacao intimidacao medicina medicina-pokemon montaria-pokemon sobrevivencia',
		'kit-tecnologico-1 refil-tecnologico', { prototipo: [
			'holofote-acompanhante', 'microdrone-manipulador', 'projetor-holografico', 'scanner-multiespectral',
			'baliza-sentinela', 'purificador-portatil', 'reparador-precisao', 'amortecedor-cinetico', 'navegador-retorno',
		] }),
].map(entry => [entry.id, entry])));

export function rpgTrainerModifier(score: number): number {
	return Math.floor((score - 10) / 2);
}

export function validateRPGAttributeAssignment(value: unknown, pool: readonly number[]): RPGTrainerAttributes {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Distribuição de atributos inválida');
	const input = value as Record<string, unknown>;
	if (Object.keys(input).length !== ATTRS.length || ATTRS.some(key => !Number.isSafeInteger(input[key]))) {
		throw new Error('Informe exatamente os seis atributos do treinador');
	}
	const assigned = ATTRS.map(key => input[key] as number);
	if (assigned.slice().sort((a, b) => a - b).join(',') !== pool.slice().sort((a, b) => a - b).join(',')) {
		throw new Error('Use cada valor da série de atributos exatamente uma vez');
	}
	return input as unknown as RPGTrainerAttributes;
}

export function rollRPGTrainerAttributeGroup(die: () => number): { dice: number[], value: number } {
	const dice = Array.from({ length: 4 }, die);
	if (dice.some(value => !Number.isSafeInteger(value) || value < 1 || value > 6)) {
		throw new Error('Fonte de rolagem inválida');
	}
	return { dice, value: dice.slice().sort((a, b) => a - b).slice(1)
		.reduce((total, value) => total + value, 0) };
}

export function rollRPGTrainerAttributeSeries(die: () => number): {
	dice: number[][], values: number[], valid: boolean,
} {
	const groups = Array.from({ length: 6 }, () => rollRPGTrainerAttributeGroup(die));
	const dice = groups.map(group => group.dice);
	const values = groups.map(group => group.value);
	return { dice, values, valid: values.reduce((total, score) => total + score, 0) >= 70 && Math.max(...values) >= 14 };
}

export function rollRPGTrainerAttributes(die: () => number): number[] {
	for (let attempt = 0; attempt < 1000; attempt++) {
		const series = rollRPGTrainerAttributeSeries(die);
		if (series.valid) return series.values;
	}
	throw new Error('Não foi possível gerar uma série válida de atributos');
}

function validSkill(skill: string): boolean {
	if (skill.startsWith('conhecimento:')) return /^[a-z0-9-]{2,40}$/.test(skill.slice(13));
	if (skill.startsWith('pilotagem:')) return RPG_TRAINER_PILOTING_DOMAINS.includes(skill.slice(10));
	if (skill.startsWith('oficio:')) return /^[a-z0-9-]{2,40}$/.test(skill.slice(7));
	return SKILLS.includes(skill) && !['conhecimento', 'pilotagem', 'oficio'].includes(skill);
}
function skillFamily(skill: string): string { return skill.split(':')[0]; }

export interface RPGTrainerCompletion {
	classId: string;
	attributes: RPGTrainerAttributes;
	fixedKnowledge?: string;
	optionalSkills: string[];
	gearChoices?: Record<string, string>;
}

export function completeRPGTrainerSheet(pending: RPGTrainerSheet, input: RPGTrainerCompletion,
	method: RPGTrainerAttributeMethod): RPGTrainerSheet {
	if (pending.status !== 'pending') throw new Error('A ficha do treinador já foi concluída');
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ficha de treinador inválida');
	const chosenClass = Object.prototype.hasOwnProperty.call(RPG_TRAINER_CLASSES, input.classId) ?
		RPG_TRAINER_CLASSES[input.classId] : undefined;
	if (!chosenClass) throw new Error('Classe de treinador inválida');
	const pool = method === 'rolled' ? pending.creation?.rolls : RPG_STANDARD_ATTRIBUTES;
	if (!pool || (method === 'rolled' && pending.creation?.method !== 'rolled')) {
		throw new Error('Faça a primeira rolagem antes de concluir a ficha');
	}
	const attributes = validateRPGAttributeAssignment(input.attributes, pool);
	const fixed = [...chosenClass.fixed];
	if (chosenClass.id === 'cientista') {
		if (typeof input.fixedKnowledge !== 'string' || !validSkill(input.fixedKnowledge) ||
			!input.fixedKnowledge.startsWith('conhecimento:')) throw new Error('Escolha a área científica inicial');
		fixed.push(input.fixedKnowledge);
	} else if (input.fixedKnowledge !== undefined) throw new Error('Esta classe não escolhe uma área fixa');
	const count = Math.max(1, chosenClass.choices + rpgTrainerModifier(attributes.intelligence));
	if (!Array.isArray(input.optionalSkills) || input.optionalSkills.length !== count ||
		input.optionalSkills.some(skill => typeof skill !== 'string' || !validSkill(skill))) {
		throw new Error(`Escolha exatamente ${count} perícias válidas`);
	}
	const trained = [...fixed, ...input.optionalSkills];
	if (new Set(trained).size !== trained.length || input.optionalSkills.some(skill => chosenClass.excluded.includes(skillFamily(skill)))) {
		throw new Error('Perícia repetida ou não permitida para esta classe');
	}
	const groups = chosenClass.gearChoices || {};
	const choices = input.gearChoices || {};
	if (typeof choices !== 'object' || Array.isArray(choices) || Object.keys(choices).length !== Object.keys(groups).length ||
		Object.entries(groups).some(([group, options]) => !options.includes(choices[group]))) {
		throw new Error('Escolhas de equipamento inicial inválidas');
	}
	const gear = [...chosenClass.gear, ...Object.values(choices)].map(entry => {
		const [itemId, rawQuantity] = entry.split('*');
		const charges = ['kit-cientifico-1', 'kit-medico-1', 'kit-medicina-pokemon',
			'kit-disfarce', 'kit-tecnologico-1'].includes(itemId) ? 5 : undefined;
		return { itemId, quantity: rawQuantity ? Number(rawQuantity) : 1, charges,
			equipped: itemId.startsWith('roupa-') || itemId.startsWith('traje-') ||
				['forro-termico', 'sistema-resfriamento', 'camada-impermeavel', 'arnes-escalada', 'colete-flutuacao', 'suporte-corrida'].includes(itemId) };
	});
	const constitution = rpgTrainerModifier(attributes.constitution);
	const growth = Math.max(1, (chosenClass.hitDie === 6 ? 4 : chosenClass.hitDie === 8 ? 5 : 6) + constitution);
	const hp = 10 + chosenClass.hitDie + constitution + (pending.level - 1) * growth;
	return { ...pending, status: 'complete', attributes, classId: chosenClass.id,
		hitPoints: { current: hp, maximum: hp, temporary: 0 },
		skills: { trained, focused: [] }, resistances: [chosenClass.resistance],
		creation: { method, rolls: method === 'rolled' ? [...pool] : null,
			...(method === 'rolled' && pending.creation?.dice ? { dice: pending.creation.dice.map(group => [...group]) } : {}) }, equipment: gear,
		proficiencies: CLASS_PROFICIENCIES[chosenClass.id] || [] };
}
