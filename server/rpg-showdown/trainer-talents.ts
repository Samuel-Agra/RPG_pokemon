import { RPG_TRAINER_CLASSES, RPG_TRAINER_PILOTING_DOMAINS, rpgTrainerModifier } from './trainer-creation';
import { RPG_KNOWLEDGE_DOMAINS, RPG_SKILL_ATTRIBUTES, type RPGTrainerResistance } from './trainer-checks';
import { RPG_TRAINER_CLASS_FEATURES } from './trainer-class-features';
import { RPG_TRAINER_TALENTS, type RPGTrainerTalentDefinition } from './trainer-talents-catalog';
import type { RPGTrainerAttributes, RPGTrainerSheet } from './trainer-sheet';

export type RPGTalentKind = 'general' | 'class' | 'apex';
export interface RPGTrainerTalentChoice {
	id: string;
	/** Requisições repetidas não consomem outra escolha de talento. */
	requestId?: string;
	attribute?: keyof RPGTrainerAttributes;
	skill?: string;
	resistance?: RPGTrainerResistance;
	proficiency?: string;
	variant?: string;
	secondVariant?: string;
}

const ATTRIBUTE_NAMES: Readonly<Record<string, keyof RPGTrainerAttributes>> = {
	forca: 'strength', destreza: 'dexterity', constituicao: 'constitution',
	inteligencia: 'intelligence', sabedoria: 'wisdom', carisma: 'charisma',
};
const RESISTANCE_NAMES: Readonly<Record<string, RPGTrainerResistance>> = {
	fortitude: 'fortitude', reflexos: 'reflexes', vontade: 'will',
};
const TRAINED_SKILL_PREREQUISITES: Readonly<Record<string, string>> = {
	'atleta:montaria-esportiva': 'montaria-pokemon',
	'explorador:guia-de-montaria': 'montaria-pokemon',
	'medico:medicina-integrada': 'medicina-pokemon',
	'escalador-treinado': 'atletismo',
	'nadador-treinado': 'atletismo',
	'queda-controlada': 'acrobacia',
	'campista': 'sobrevivencia',
	'abridor-de-caminhos': 'sobrevivencia',
	'negociador-pratico': 'persuasao',
	'afinidade-pokemon': 'empatia-pokemon',
	'arremesso-treinado': 'captura',
	'cuidados-de-campo': 'medicina-pokemon',
};
const PROFICIENCY_PREREQUISITES: Readonly<Record<string, string>> = {
	'arqueologo:avaliacao-paleontologica-de-campo': 'kit-arqueologia',
	'cientista:producao-farmaceutica-pokemon': 'kit-cientifico',
	'detetive:disfarce-de-campo': 'kit-disfarce',
	'encantador:disfarce-social': 'kit-disfarce',
	'guarda-pokemon:formacao-de-escudo': 'escudos',
	'cuidados-de-campo': 'kit-medicina-pokemon',
};
const KIT_SKILLS: Readonly<Record<string, string | null>> = {
	'kit-culinaria': null, 'kit-medico': 'medicina',
	'kit-medicina-pokemon': 'medicina-pokemon',
	'kit-arqueologia': 'conhecimento:arqueologia-fosseis',
	'kit-fotografia': null, 'kit-ladinagem': 'ladinagem',
	'kit-cientifico': 'conhecimento',
	'kit-tecnologico': 'tecnologia', 'kit-disfarce': null,
	'kit-investigacao': 'investigacao',
	'kit-mecanica': 'oficio:mecanica', 'kit-costura': 'oficio:costura',
	'kit-carpintaria': 'oficio:carpintaria', 'kit-ferraria': 'oficio:ferraria',
	'kit-artesanato': 'oficio:artesanato',
};
const WEAPON_PROFICIENCIES = new Set([
	'armas-melee-comuns', 'armas-melee-exoticas', 'armas-ranged-comuns',
	'armas-ranged-exoticas', 'armas-nao-letais',
]);
const TECH_AREAS = new Set(['hardware', 'programacao', 'redes', 'robotica',
	'seguranca-digital', 'telecomunicacoes', 'eletronica']);
const EXPLORER_TERRAINS = new Set(['floresta', 'montanha', 'deserto', 'pantano',
	'ambiente-gelado', 'litoral', 'subterraneo', 'urbano-em-ruinas']);
const ACCLIMATION_ENVIRONMENTS = new Set(['frio', 'calor', 'altitude', 'floresta-umida',
	'deserto', 'regiao-costeira']);
export const RPG_TALENT_APPROVAL_KEYS = new Set([
	'diplomata:reputacao-precedente', 'dominio-de-arma:armas-ranged-exoticas',
]);
const REPEATABLE: Readonly<Record<string, number>> = {
	'artista:tecnica-assinatura': 4, 'atleta:especialidade-esportiva': 4,
	'cientista:especializacao-cientifica': 4, 'cientista:registros-paralelos': 2,
	'explorador:especialista-de-terreno': 4, 'tecnologo:especializacao-tecnica': 4,
	'tecnologo:prototipos-paralelos': 2,
	'aprimoramento-de-atributo': 3, resiliente: 3, 'treinamento-adicional': 5,
	'foco-em-pericia': 5, 'competencia-pratica': 5, 'dominio-de-arma': 5,
	'aclimatacao': 5, 'condutor-versatil': 5, 'rede-de-contatos': 5, 'dominio-de-kit': 5,
};
const TALENTS = new Map(RPG_TRAINER_TALENTS.map(talent => [talent.id, talent]));
const CLASS_TALENTS = new Map<string, RPGTrainerTalentDefinition[]>();
for (const talent of RPG_TRAINER_TALENTS) {
	if (!talent.classId) continue;
	const list = CLASS_TALENTS.get(talent.classId) || [];
	list.push(talent);
	CLASS_TALENTS.set(talent.classId, list);
}

function normalize(text: string): string {
	return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsName(haystack: string, needle: string): boolean {
	return (' ' + haystack + ' ').includes(' ' + normalize(needle) + ' ');
}

function minimumLevel(prerequisite: string): number {
	const normalized = normalize(prerequisite);
	const match = /(?:nivel\s+(\d+)|(\d+)\s+nivel)/.exec(normalized);
	return match ? Number(match[1] || match[2]) : 1;
}

function referencedTalents(talent: RPGTrainerTalentDefinition): {
	all: string[], any: string[],
} {
	const text = normalize(talent.prerequisite);
	if (!text || text.includes('nenhum')) return { all: [], any: [] };
	const candidates = CLASS_TALENTS.get(talent.classId || '') || [];
	const matches = candidates.filter(other => other.id !== talent.id && containsName(text, other.name.replace(/^Ápice — /, '')));
	const any = matches.filter(other => matches.some(another => another.id !== other.id &&
		(text.includes(normalize(other.name) + ' ou ' + normalize(another.name)) ||
			text.includes(normalize(another.name) + ' ou ' + normalize(other.name))))).map(other => other.id);
	return { all: matches.filter(other => !any.includes(other.id)).map(other => other.id), any };
}

function talentCount(sheet: RPGTrainerSheet, id: string): number {
	return [...sheet.talents.general, ...sheet.talents.class, ...(sheet.talents.apex ? [sheet.talents.apex] : [])]
		.filter(value => value === id).length;
}

function availableSlots(sheet: RPGTrainerSheet, kind: RPGTalentKind): number {
	const earned = kind === 'general' ? Math.floor(sheet.level / 2) :
		kind === 'class' ? Math.floor((sheet.level - 1) / 2) : sheet.level === 10 ? 1 : 0;
	const used = kind === 'general' ? sheet.talents.general.length :
		kind === 'class' ? sheet.talents.class.length : Number(!!sheet.talents.apex);
	return Math.max(0, earned - used);
}

function validSkill(skill: string): boolean {
	if (typeof skill !== 'string') return false;
	const [family, area] = skill.split(':');
	if (!Object.prototype.hasOwnProperty.call(RPG_SKILL_ATTRIBUTES, family)) return false;
	return ['conhecimento', 'oficio', 'pilotagem'].includes(family) ?
		!!area && /^[a-z0-9-]{2,40}$/.test(area) : skill === family;
}

function allowedAttributeChoices(talent: RPGTrainerTalentDefinition): (keyof RPGTrainerAttributes)[] {
	// Aumentos fixos pertencem à própria regra e não exigem escolha de atributo.
	if (['arqueologo:memoria-academica', 'artista:presenca-magnetica',
		'artista:corpo-de-cena'].includes(talent.id)) return [];
	if (talent.id === 'aprimoramento-de-atributo') return Object.values(ATTRIBUTE_NAMES);
	const line = (/Aumente (?:também )?em 1[^\n]*/i.exec(talent.text))?.[0];
	if (!line) return [];
	const beforeLimit = normalize(line.split(/respeitando/i)[0]);
	return Object.entries(ATTRIBUTE_NAMES).filter(([name]) => containsName(beforeLimit, name)).map(([, key]) => key);
}

function artistModalities(sheet: RPGTrainerSheet): string[] {
	return (sheet.talentSelections || []).filter(selection =>
		['artista:tecnica-assinatura', 'artista:artista-versatil'].includes(selection.id))
		.flatMap(selection => [selection.variant, selection.secondVariant].filter((value): value is string => !!value));
}

function allowedVariantChoices(sheet: RPGTrainerSheet, talent: RPGTrainerTalentDefinition): string[] | null {
	const id = talent.id;
	if (id === 'competencia-pratica') return Object.values(ATTRIBUTE_NAMES);
	if (id === 'conhecimento-diversificado') return RPG_KNOWLEDGE_DOMAINS
		.filter(domain => domain !== 'organizacoes').map(domain => `conhecimento:${domain}`)
		.filter(skill => !sheet.skills.trained.includes(skill));
	if (id === 'cientista:especializacao-cientifica') {
		return sheet.skills.trained.filter(skill => skill.startsWith('conhecimento:'));
	}
	if (id === 'cientista:publicacao-de-referencia') {
		return (sheet.talentSelections || []).filter(selection =>
			selection.id === 'cientista:especializacao-cientifica' && selection.variant)
			.map(selection => selection.variant!);
	}
	if (id === 'tecnologo:especializacao-tecnica') return [...TECH_AREAS];
	if (id === 'explorador:especialista-de-terreno') return [...EXPLORER_TERRAINS];
	if (id === 'aclimatacao') return [...ACCLIMATION_ENVIRONMENTS];
	if (id === 'condutor-versatil') return RPG_TRAINER_PILOTING_DOMAINS.map(domain => `pilotagem:${domain}`)
		.filter(skill => sheet.skills.trained.includes(skill));
	return null;
}

function prerequisiteError(sheet: RPGTrainerSheet, talent: RPGTrainerTalentDefinition,
	choice: RPGTrainerTalentChoice): string | null {
	if (sheet.status !== 'complete' || !sheet.attributes || !sheet.classId) return 'Conclua a ficha do treinador primeiro';
	if (talent.classId && talent.classId !== sheet.classId) return 'Este talento pertence a outra classe';
	if (sheet.level < minimumLevel(talent.prerequisite)) return 'Nível insuficiente para este talento';
	if (talent.kind === 'apex' && sheet.level !== 10) return 'Ápices exigem o nível 10';
	if (!availableSlots(sheet, talent.kind)) return 'Não há escolha de talento disponível nesta categoria';
	if (talentCount(sheet, talent.id) >= (REPEATABLE[talent.id] || 1)) return 'Este talento já foi escolhido';
	const references = referencedTalents(talent);
	if (references.all.some(id => !talentCount(sheet, id)) ||
		(references.any.length && !references.any.some(id => talentCount(sheet, id)))) {
		return 'Falta um talento exigido como pré-requisito';
	}
	if (talent.id === 'cientista:biblioteca-de-procedimentos' &&
		talentCount(sheet, 'cientista:registros-paralelos') < 2 ||
		talent.id === 'tecnologo:central-de-prototipos' &&
		talentCount(sheet, 'tecnologo:prototipos-paralelos') < 2) {
		return 'O pré-requisito exige duas escolhas do talento indicado';
	}
	const trained = TRAINED_SKILL_PREREQUISITES[talent.id];
	if (trained && !sheet.skills.trained.includes(trained)) return 'É necessário treinamento na perícia indicada';
	const proficiency = PROFICIENCY_PREREQUISITES[talent.id];
	if (proficiency && !sheet.proficiencies?.includes(proficiency)) return 'Falta o domínio exigido';
	if (talent.id === 'foco-em-pericia' && (!choice.skill || !sheet.skills.trained.includes(choice.skill))) {
		return 'Foco exige treinamento na perícia escolhida';
	}
	if (talent.id === 'competencia-pratica' && (!choice.skill || !sheet.skills.trained.includes(choice.skill))) {
		return 'Competência Prática exige uma perícia treinada';
	}
	if (talent.id === 'diplomata:reputacao-precedente' &&
		!sheet.talentApprovals?.some(approval => approval.key === talent.id)) {
		return 'Os favores institucionais devem ser verificados pelo Mestre antes da aquisição';
	}
	if (talent.id === 'cientista:producao-farmaceutica-pokemon' &&
		!sheet.skills.trained.some(skill => skill.startsWith('conhecimento:'))) {
		return 'É necessário conhecimento científico treinado';
	}
	if (talent.id === 'cientista:publicacao-de-referencia' &&
		!sheet.talentSelections?.some(selection => selection.id === 'cientista:especializacao-cientifica' &&
			selection.variant === choice.variant)) {
		return 'A publicação exige especialização científica na mesma área';
	}
	if (talent.id === 'condutor-versatil' &&
		!sheet.skills.trained.some(skill => skill.startsWith('pilotagem:'))) {
		return 'Condutor Versátil exige treinamento em uma categoria de Pilotagem';
	}
	return null;
}

export function rpgTrainerClassFeatures(sheet: RPGTrainerSheet) {
	return sheet.status === 'complete' && sheet.classId ?
		structuredClone(RPG_TRAINER_CLASS_FEATURES[sheet.classId] || []) : [];
}

export function rpgTrainerTalentCatalog(sheet: RPGTrainerSheet) {
	return RPG_TRAINER_TALENTS.filter(talent => talent.kind === 'general' || talent.classId === sheet.classId)
		.map(talent => {
			const unavailableReason = prerequisiteError(sheet, talent, { id: talent.id });
			const practicalSkillAvailable = talent.id === 'competencia-pratica' && sheet.skills.trained.some(skill =>
				!sheet.talentSelections?.some(selection => selection.id === talent.id && selection.skill === skill));
			const needsChoice = !!unavailableReason && (/escolhida|perícia de ajuda/.test(unavailableReason) ||
				unavailableReason === 'Competência Prática exige uma perícia treinada' && practicalSkillAvailable);
			return { ...talent, available: !unavailableReason || needsChoice, needsChoice,
				unavailableReason: needsChoice ? null : unavailableReason,
				attributeChoices: allowedAttributeChoices(talent),
				variantChoices: allowedVariantChoices(sheet, talent)?.filter(variant =>
					talent.id === 'competencia-pratica' || !sheet.talentSelections?.some(selection => selection.id === talent.id &&
						selection.variant === variant)) || null,
				choiceFields: {
					skill: ['treinamento-adicional', 'foco-em-pericia', 'competencia-pratica',
						'conhecimento-diversificado'].includes(talent.id),
					resistance: talent.id === 'resiliente',
					proficiency: ['dominio-de-kit', 'dominio-de-arma'].includes(talent.id),
					variant: ['conhecimento-diversificado', 'artista:artista-versatil'].includes(talent.id) || !!REPEATABLE[talent.id] && !['aprimoramento-de-atributo', 'resiliente',
						'treinamento-adicional', 'foco-em-pericia',
						'dominio-de-arma', 'dominio-de-kit', 'cientista:registros-paralelos',
						'tecnologo:prototipos-paralelos'].includes(talent.id) ||
						['cientista:publicacao-de-referencia', 'cientista:especializacao-cientifica',
							'tecnologo:especializacao-tecnica', 'explorador:especialista-de-terreno'].includes(talent.id),
					secondVariant: talent.id === 'artista:artista-versatil',
				},
			};
		});
}

function applyTalentEffect(sheet: RPGTrainerSheet, talent: RPGTrainerTalentDefinition,
	choice: RPGTrainerTalentChoice): RPGTrainerSheet {
	const next = structuredClone(sheet);
	const attributes = next.attributes!;
	const allowed = allowedAttributeChoices(talent);
	if (allowed.length) {
		if (!choice.attribute || !allowed.includes(choice.attribute)) throw new Error('Escolha um atributo permitido pelo talento');
		if (attributes[choice.attribute] >= 20) throw new Error('Este atributo já atingiu o limite de 20');
		if (talent.id === 'aprimoramento-de-atributo' &&
			next.talentSelections?.some(selection => selection.id === talent.id &&
				selection.attribute === choice.attribute)) {
			throw new Error('Este atributo já recebeu Aprimoramento de Atributo');
		}
		const previousCon = rpgTrainerModifier(attributes.constitution);
		attributes[choice.attribute]++;
		const newCon = rpgTrainerModifier(attributes.constitution);
		if (newCon > previousCon && next.hitPoints.maximum !== null) {
			next.hitPoints.maximum += (newCon - previousCon) * next.level;
		}
	} else if (choice.attribute !== undefined) {
		throw new Error('Este talento não concede aumento de atributo');
	}
	if (talent.id === 'arqueologo:memoria-academica') {
		attributes.intelligence = Math.min(20, attributes.intelligence + 1);
		next.academicMemoryApplied = true;
	}
	if (talent.id === 'arqueologo:resgate-de-reliquia') {
		attributes.dexterity = Math.min(20, attributes.dexterity + 1);
		next.relicRescueApplied = true;
	}
	if (talent.id === 'artista:presenca-magnetica') {
		attributes.charisma = Math.min(20, attributes.charisma + 1);
	}
	if (talent.id === 'artista:corpo-de-cena') {
		attributes.dexterity = Math.min(20, attributes.dexterity + 1);
	}
	if (talent.id === 'resiliente') {
		if (!choice.resistance || !Object.values(RESISTANCE_NAMES).includes(choice.resistance) ||
			next.resistances.includes(choice.resistance)) throw new Error('Escolha uma resistência ainda não treinada');
		next.resistances.push(choice.resistance);
	} else if (choice.resistance !== undefined) throw new Error('Este talento não escolhe resistência');
	if (talent.id === 'artista-marcial:reflexos-treinados' && !next.resistances.includes('reflexes')) {
		next.resistances.push('reflexes');
	}
	if (talent.id === 'treinamento-adicional' || talent.id === 'foco-em-pericia' ||
		talent.id === 'competencia-pratica') {
		if (!choice.skill || !validSkill(choice.skill)) throw new Error('Escolha uma perícia válida');
		if (talent.id === 'treinamento-adicional') {
			if (next.skills.trained.includes(choice.skill)) throw new Error('A perícia já é treinada');
			next.skills.trained.push(choice.skill);
		} else if (talent.id === 'foco-em-pericia') {
			if (next.skills.focused.includes(choice.skill)) throw new Error('A perícia já possui foco');
			next.skills.focused.push(choice.skill);
		} else if (next.talentSelections?.some(selection => selection.id === talent.id &&
			selection.skill === choice.skill)) {
			throw new Error('Competência Prática já foi escolhida para esta perícia');
		} else if (!choice.variant || !Object.values(ATTRIBUTE_NAMES).includes(
			choice.variant as keyof RPGTrainerAttributes) ||
			RPG_SKILL_ATTRIBUTES[choice.skill.split(':')[0]].includes(choice.variant as keyof RPGTrainerAttributes)) {
			throw new Error('Escolha um atributo alternativo para a perícia treinada');
		}
	} else if (talent.id === 'conhecimento-diversificado') {
		const choices = allowedVariantChoices(next, talent) || [];
		if (!choice.skill || !choice.variant || choice.skill === choice.variant ||
			!choices.includes(choice.skill) || !choices.includes(choice.variant)) {
			throw new Error('Escolha duas áreas diferentes e não treinadas de Conhecimento');
		}
	} else if (choice.skill !== undefined && talent.id !== 'ajuda-especializada') {
		throw new Error('Este talento não escolhe perícia');
	}
	if (talent.id === 'ajuda-especializada' && choice.skill !== undefined &&
		!next.skills.trained.includes(choice.skill)) throw new Error('A perícia de ajuda deve ser treinada');
	if (['artista:tecnica-assinatura', 'artista:artista-versatil'].includes(talent.id)) {
		const selected = talent.id === 'artista:artista-versatil' ? [choice.variant, choice.secondVariant] : [choice.variant];
		const normalized = selected.map(value => normalize(value || ''));
		if (normalized.some(value => !value) || new Set(normalized).size !== normalized.length ||
			normalized.some(value => artistModalities(next).some(existing => normalize(existing) === value))) {
			throw new Error('Escolha modalidades artísticas diferentes das já selecionadas');
		}
	}
	if (talent.id !== 'artista:artista-versatil' && choice.secondVariant !== undefined) {
		throw new Error('Este talento não escolhe uma segunda modalidade');
	}
	if (talent.id === 'dominio-de-escudos') {
		if (next.proficiencies?.includes('escudos')) throw new Error('O treinador já domina escudos');
		next.proficiencies = [...(next.proficiencies || []), 'escudos'];
	} else if (talent.id === 'dominio-de-kit' || talent.id === 'dominio-de-arma') {
		if (!choice.proficiency ||
			(talent.id === 'dominio-de-kit' && !Object.prototype.hasOwnProperty.call(KIT_SKILLS, choice.proficiency)) ||
			(talent.id === 'dominio-de-arma' && !WEAPON_PROFICIENCIES.has(choice.proficiency)) ||
			next.proficiencies?.includes(choice.proficiency)) throw new Error('Escolha um domínio novo e válido');
		if (talent.id === 'dominio-de-kit') {
			const required = KIT_SKILLS[choice.proficiency];
			if (required && !next.skills.trained.some(skill => skill === required ||
				required === 'conhecimento' && skill.startsWith('conhecimento:'))) {
				throw new Error('O domínio do kit exige treinamento na perícia correspondente');
			}
		}
		if (choice.proficiency === 'armas-ranged-exoticas' &&
			!next.talentApprovals?.some(approval => approval.key === 'dominio-de-arma:armas-ranged-exoticas')) {
			throw new Error('O domínio de armas ranged exóticas exige licença verificada pelo Mestre');
		}
		next.proficiencies = [...(next.proficiencies || []), choice.proficiency];
	} else if (choice.proficiency !== undefined) throw new Error('Este talento não escolhe domínio');
	if (talent.id === 'robusto' && next.hitPoints.maximum !== null) next.hitPoints.maximum += next.level;
	if (REPEATABLE[talent.id] && !['aprimoramento-de-atributo', 'resiliente',
		'treinamento-adicional', 'foco-em-pericia', 'competencia-pratica',
		'dominio-de-arma', 'dominio-de-kit', 'cientista:registros-paralelos',
		'tecnologo:prototipos-paralelos'].includes(talent.id)) {
		if (typeof choice.variant !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} _:-]{0,79}$/u.test(choice.variant) ||
			next.talentSelections?.some(selection => selection.id === talent.id &&
				normalize(selection.variant || '') === normalize(choice.variant || ''))) {
			throw new Error('Escolha uma variante nova e válida para este talento');
		}
	}
	if (talent.id === 'cientista:especializacao-cientifica' &&
		(typeof choice.variant !== 'string' || !choice.variant.startsWith('conhecimento:') ||
			!next.skills.trained.includes(choice.variant))) {
		throw new Error('A especialização exige uma área de Conhecimento treinada');
	}
	if (talent.id === 'tecnologo:especializacao-tecnica' &&
		!TECH_AREAS.has(choice.variant || '')) throw new Error('Área técnica inválida');
	if (talent.id === 'explorador:especialista-de-terreno' &&
		!EXPLORER_TERRAINS.has(choice.variant || '')) throw new Error('Terreno inválido');
	const variants = allowedVariantChoices(next, talent);
	if (variants && !variants.includes(choice.variant || '')) {
		throw new Error(talent.id === 'condutor-versatil' ?
			'Escolha uma categoria de Pilotagem treinada' : 'Escolha uma variante disponível para este talento');
	}
	return next;
}

export function chooseRPGTrainerTalent(sheet: RPGTrainerSheet, choice: RPGTrainerTalentChoice): RPGTrainerSheet {
	if (!choice || typeof choice !== 'object' || Array.isArray(choice) ||
		Object.keys(choice).some(key => !['id', 'requestId', 'attribute', 'skill',
			'resistance', 'proficiency', 'variant', 'secondVariant'].includes(key)) ||
			typeof choice.id !== 'string' ||
			['attribute', 'skill', 'resistance', 'proficiency', 'variant', 'secondVariant'].some(key =>
				choice[key as keyof RPGTrainerTalentChoice] !== undefined &&
				typeof choice[key as keyof RPGTrainerTalentChoice] !== 'string') ||
				(['variant', 'secondVariant'] as const).some(key => choice[key] !== undefined &&
					(!choice[key]!.trim() || choice[key]!.length > 80))) {
		throw new Error('Escolha de talento inválida');
	}
	if (choice.requestId !== undefined && (typeof choice.requestId !== 'string' ||
		!/^[a-zA-Z0-9:_-]{1,100}$/.test(choice.requestId))) throw new Error('Identificador da escolha inválido');
	const previousRequest = choice.requestId && sheet.talentSelections?.find(selection =>
		selection.requestId === choice.requestId);
	if (previousRequest) {
		if (['id', 'attribute', 'skill', 'resistance', 'proficiency', 'variant', 'secondVariant'].some(key =>
			previousRequest[key as keyof RPGTrainerTalentChoice] !== choice[key as keyof RPGTrainerTalentChoice] &&
			!(key === 'variant' && previousRequest.id === 'artista-marcial:reflexos-treinados' &&
				previousRequest.variant === 'already-trained' && choice.variant === undefined))) {
			throw new Error('Identificador de escolha já utilizado para outro talento');
		}
		return sheet;
	}
	const talent = TALENTS.get(choice.id);
	if (!talent) throw new Error('Talento desconhecido');
	if (['cientista:registros-paralelos', 'tecnologo:prototipos-paralelos'].includes(talent.id) &&
		!choice.requestId) throw new Error('Talento repetível exige identificador estável da escolha');
	const error = prerequisiteError(sheet, talent, choice);
	if (error) throw new Error(error);
	const next = applyTalentEffect(sheet, talent, choice);
	if (talent.kind === 'general') next.talents.general.push(talent.id);
	else if (talent.kind === 'class') next.talents.class.push(talent.id);
	else next.talents.apex = talent.id;
	const selection = talent.id === 'artista-marcial:reflexos-treinados' &&
		sheet.resistances.includes('reflexes') ? { ...choice, variant: 'already-trained' } : choice;
	next.talentSelections = [...(next.talentSelections || []), { ...selection, acquiredAtLevel: next.level }];
	next.pendingChoices = {
		general: availableSlots(next, 'general'),
		class: availableSlots(next, 'class'),
		apex: availableSlots(next, 'apex'),
	};
	return next;
}

export function rpgTrainerHasTalent(sheet: RPGTrainerSheet, id: string): boolean {
	return TALENTS.has(id) && talentCount(sheet, id) > 0;
}

export function rpgTrainerClassExists(id: string): boolean {
	return Object.prototype.hasOwnProperty.call(RPG_TRAINER_CLASSES, id) && !!RPG_TRAINER_CLASS_FEATURES[id];
}
