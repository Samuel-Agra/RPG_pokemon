import type { RPGTrainerSheet } from './trainer-sheet';

export interface RPGScientistRecordFormula {
	id: string;
	name: string;
	effect: string;
	description: string;
	advanced?: true;
}

const THREE_CHARGE_RECORDS = new Set(['neutralizador-direcionado', 'camara-de-conservacao-quimica',
	'adesivo-estrutural', 'catalisador-de-decomposicao']);
const FIVE_MINUTE_RECORDS = new Set(['reagente-revelador', 'tinta-de-revelacao-seletiva']);

/** Custo da fórmula ativa. Biblioteca e Economia oferecem a mesma redução, nunca duas. */
export function rpgScientistRecordProduction(formulaId: string, source: RPGTrainerSheet,
	producerIsSource: boolean, custom?: { name: string, description: string, kitTier: number, charges: number }) {
	const formula = custom && formulaId.startsWith('custom:') &&
		source.talents.class.includes('cientista:registro-avancado') ?
		{ id: formulaId, name: custom.name, effect: custom.description,
			description: custom.description, advanced: true as const } :
		rpgScientistRecordFormulas(source).find(record => record.id === formulaId);
	if (!formula) throw new Error('Registro científico indisponível');
	if (custom) {
		if (!Number.isSafeInteger(custom.kitTier) || custom.kitTier < 1 || custom.kitTier > 3 ||
			!Number.isSafeInteger(custom.charges) || custom.charges < 1 || custom.charges > 20) {
			throw new Error('Custo do registro aprovado inválido');
		}
		return { formula, charges: custom.charges, minimumKitTier: custom.kitTier, minutes: 30 };
	}
	const baseCharges = formula.advanced ? THREE_CHARGE_RECORDS.has(formula.id) ? 3 : 2 : 1;
	const reduction = producerIsSource && (source.talents.apex === 'cientista:biblioteca-de-procedimentos' ||
		source.talents.class.includes('cientista:economia-de-reagentes')) ? 1 : 0;
	return { formula, charges: Math.max(1, baseCharges - reduction),
		minimumKitTier: formula.advanced ? 2 : 1,
		minutes: formula.advanced ? 30 : FIVE_MINUTE_RECORDS.has(formula.id) ? 5 : 1 };
}

/** Fórmulas disponíveis para o registro escrito; o produto ainda exige Kit Científico e cargas. */
export const RPG_SCIENTIST_RECORDS: readonly RPGScientistRecordFormula[] = Object.freeze([
	{ id: 'luminescencia-quimica', name: 'Luminescência Química',
		effect: 'Produz luz clara em 6 m e fraca por mais 6 m durante 1 hora.',
		description: 'Preparação de 1 minuto e 1 carga científica. A fonte de luz pode ser carregada ou fixada em um objeto. Não produz calor, dano nem fogo.' },
	{ id: 'pastilha-de-purificacao', name: 'Pastilha de Purificação',
		effect: 'Purifica até 2 litros de água em 10 minutos.',
		description: 'Preparação de 1 minuto e 1 carga científica. Remove sujeira comum, microrganismos e matéria orgânica; não remove venenos poderosos, metais pesados ou contaminações excepcionais.' },
	{ id: 'selante-expansivo', name: 'Selante Expansivo',
		effect: 'Veda uma abertura de até 30 cm por 8 horas.',
		description: 'Preparação de 1 minuto e 1 carga científica. Endurece após 1 minuto. Pode interromper vazamentos simples ou estabilizar objetos pequenos; não sustenta estruturas pesadas nem substitui reparos.' },
	{ id: 'bolsa-termica', name: 'Bolsa Térmica',
		effect: 'Aquece ou resfria moderadamente durante 30 minutos.',
		description: 'Preparação de 1 minuto e 1 carga científica. Ao preparar, escolha a versão exotérmica ou endotérmica. Não causa dano, não congela nem substitui tratamento médico.' },
	{ id: 'reagente-revelador', name: 'Reagente Revelador',
		effect: 'Destaca um tipo de vestígio em até 1 m² por 10 minutos.',
		description: 'Preparação de 5 minutos e 1 carga científica. Defina o vestígio ao criar o registro: sangue, óleo, impressões ou outra substância conhecida. Interpretar os sinais ainda pode exigir um teste.' },
	{ id: 'neutralizador-de-odores', name: 'Neutralizador de Odores',
		effect: 'Reduz odores comuns de pessoa ou objeto por 1 hora.',
		description: 'Preparação de 1 minuto e 1 carga científica. Dificulta rastreamento exclusivamente olfativo, conforme a cena. Água abundante remove o agente; não afeta Pokémon em batalha.' },
	{ id: 'sinalizador-cromatico', name: 'Sinalizador Cromático',
		effect: 'Produz fumaça colorida de sinalização por 5 minutos.',
		description: 'Preparação de 1 minuto e 1 carga científica. A cor é definida no preparo. Vento forte reduz a duração; não causa dano nem cria obscurecimento mecânico em batalha.' },
	{ id: 'tinta-de-revelacao-seletiva', name: 'Tinta de Revelação Seletiva',
		effect: 'Cria uma marca oculta revelável por método escolhido, por 24 horas.',
		description: 'Preparação de 5 minutos e 1 carga científica. Escolha luz ultravioleta, calor moderado, reagente, vapor ou faixa de luz para revelar a tinta. Quem descobrir o método poderá ler a marca.' },
	{ id: 'neutralizador-direcionado', name: 'Neutralizador Direcionado', advanced: true,
		effect: 'Neutraliza resíduos de uma substância identificada em até 3 m².',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 3 cargas. Não afeta criaturas nem substâncias desconhecidas.' },
	{ id: 'camara-de-conservacao-quimica', name: 'Câmara de Conservação Química', advanced: true,
		effect: 'Conserva até 5 kg de amostras ou materiais delicados por 72 horas.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 3 cargas. Não recupera material já deteriorado; danos ou aberturas repetidas encerram o efeito.' },
	{ id: 'adesivo-estrutural', name: 'Adesivo Estrutural', advanced: true,
		effect: 'Estabiliza temporariamente uma estrutura pequena por 24 horas.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 3 cargas. Não restaura partes ausentes nem sustenta uma construção inteira.' },
	{ id: 'aerossol-de-contraste', name: 'Aerossol de Contraste', advanced: true,
		effect: 'Revela correntes de ar, frestas e alterações físicas em raio de 6 m por 10 minutos.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 2 cargas. Não revela fenômenos que não interajam fisicamente com as partículas.' },
	{ id: 'marcador-rastreavel', name: 'Marcador Rastreável', advanced: true,
		effect: 'Indica a direção aproximada de um marcador a até 1 km por 24 horas.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 2 cargas. Remoção do marcador, barreiras densas ou interferência adequada bloqueiam o sinal.' },
	{ id: 'catalisador-de-decomposicao', name: 'Catalisador de Decomposição', advanced: true,
		effect: 'Decompõe até 1 m³ de matéria orgânica não viva em 10 minutos.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 3 cargas. Não afeta criaturas, alimentos carregados ou materiais minerais e metálicos.' },
	{ id: 'membrana-de-purificacao-avancada', name: 'Membrana de Purificação Avançada', advanced: true,
		effect: 'Filtra até 20 litros de água, inclusive contaminação comum identificada.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 2 cargas. Não remove radioatividade, venenos excepcionais ou substâncias desconhecidas resistentes.' },
	{ id: 'supressor-quimico', name: 'Supressor Químico', advanced: true,
		effect: 'Apaga fogo comum em raio de 3 m.',
		description: 'Preparação de 30 minutos, Kit Científico de nível II e 2 cargas. Não causa dano nem anula golpes ou condições de batalha.' },
]);

export function rpgScientistRecordLimit(sheet: RPGTrainerSheet): number {
	if (sheet.status !== 'complete' || sheet.classId !== 'cientista') return 0;
	if (sheet.talents.apex === 'cientista:biblioteca-de-procedimentos') return 5;
	const parallel = sheet.talents.class.filter(id => id === 'cientista:registros-paralelos').length;
	return Math.min(3, 1 + parallel);
}

export function rpgScientistRecordFormulas(sheet: RPGTrainerSheet): RPGScientistRecordFormula[] {
	if (!rpgScientistRecordLimit(sheet)) return [];
	const advanced = sheet.talents.class.includes('cientista:registro-avancado');
	return RPG_SCIENTIST_RECORDS.filter(record => !record.advanced || advanced);
}

export function rpgSetScientistRecord(sheet: RPGTrainerSheet, slot: number,
	entry: { formulaId: string, recipientCharacterId: string } | null): RPGTrainerSheet {
	const limit = rpgScientistRecordLimit(sheet);
	if (!Number.isSafeInteger(slot) || slot < 0 || slot >= limit) throw new Error('Espaço de registro inválido');
	const records = (sheet.scientistRecords || []).filter(record => record.slot !== slot && record.slot < limit);
	if (entry) {
		if (!rpgScientistRecordFormulas(sheet).some(formula => formula.id === entry.formulaId)) {
			throw new Error('Fórmula indisponível para este Cientista');
		}
		if (!entry.recipientCharacterId) throw new Error('Escolha quem receberá o registro');
		records.push({ slot, formulaId: entry.formulaId, recipientCharacterId: entry.recipientCharacterId });
	}
	if (sheet.talents.apex === 'cientista:biblioteca-de-procedimentos' &&
		records.filter(record => record.custom || RPG_SCIENTIST_RECORDS.some(formula =>
			formula.id === record.formulaId && formula.advanced)).length > 2) {
		throw new Error('A biblioteca permite até dois Registros Avançados ativos');
	}
	return { ...sheet, scientistRecords: records.sort((left, right) => left.slot - right.slot) };
}
