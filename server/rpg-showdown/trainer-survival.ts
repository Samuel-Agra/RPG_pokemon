import { rpgTrainerModifier, RPG_TRAINER_CLASSES } from './trainer-creation';
import type { RPGTrainerSheet } from './trainer-sheet';

/** Estas condições pertencem somente ao treinador; não são status do simulador. */
export const RPG_TRAINER_CONDITIONS = [
	'agarrado', 'caido', 'imobilizado', 'incapacitado', 'atordoado', 'inconsciente',
	'cego', 'surdo', 'amedrontado', 'encantado', 'fascinado', 'dominado',
	'queimado', 'paralisado', 'envenenado', 'gravemente-envenenado',
	'congelado', 'adormecido', 'confuso',
] as const;
export type RPGTrainerConditionId = typeof RPG_TRAINER_CONDITIONS[number];
export type RPGTrainerLifeState = 'conscious' | 'dying' | 'stable' | 'dead';

export interface RPGTrainerCondition {
	id: RPGTrainerConditionId;
	source: string;
	dc?: number;
	remainingRounds?: number;
	nextSave?: string;
	treatment?: string;
	progression?: number;
	/** Um atendimento pode interromper dano contínuo sem apagar a lesão. */
	suppressed?: boolean;
}

export interface RPGTrainerSurvival {
	lifeState: RPGTrainerLifeState;
	exhaustion: number;
	conditions: RPGTrainerCondition[];
	deathSaves: { successes: number, failures: number };
	wounds: { id: string, description: string, treated: boolean }[];
	shortCareUsed: boolean;
	lastLongRestAt?: number;
	lastSpecialistCareAt?: number;
	lastShortRest?: { startedAt: number, completedAt: number };
	rest?: { kind: RPGTrainerRestKind, startedAt: number };
}

export function rpgTrainerSurvival(sheet: RPGTrainerSheet): RPGTrainerSurvival {
	return structuredClone(sheet.survival || {
		lifeState: sheet.status === 'complete' && sheet.hitPoints.current === 0 ? 'dying' : 'conscious',
		exhaustion: 0, conditions: [],
		deathSaves: { successes: 0, failures: 0 }, wounds: [], shortCareUsed: false,
	});
}

/** Efeitos sobre ações humanas; consumidores de batalha Pokémon não usam esses valores. */
export function rpgTrainerSurvivalEffects(sheet: RPGTrainerSheet) {
	const state = rpgTrainerSurvival(sheet);
	const has = (id: RPGTrainerConditionId) => state.conditions.some(condition => condition.id === id);
	const unconscious = state.lifeState !== 'conscious' || has('inconsciente') || has('adormecido');
	const incapacitated = unconscious || has('incapacitado') || has('atordoado') || has('congelado');
	return {
		canAct: !incapacitated && state.exhaustion < 6,
		canReact: !incapacitated && !has('paralisado') && state.exhaustion < 5,
		movementPenaltyMeters: state.exhaustion * 1.5,
		movementMultiplier: has('agarrado') || has('imobilizado') || has('atordoado') ||
			unconscious || has('congelado') ? 0 : has('paralisado') ? 0.5 : 1,
		checkPenalty: state.exhaustion,
		attackPenalty: state.exhaustion,
		resistancePenalty: state.exhaustion,
		dcPenalty: state.exhaustion,
		attackDisadvantage: has('caido') || has('imobilizado') || has('cego') || has('queimado'),
		reflexDisadvantage: has('imobilizado') || has('cego') || has('paralisado'),
		reflexAutoFail: has('atordoado') || has('congelado') || unconscious,
		prone: has('caido') || unconscious,
		severeExhaustion: state.exhaustion >= 3,
	};
}

function complete(sheet: RPGTrainerSheet): { sheet: RPGTrainerSheet, state: RPGTrainerSurvival, maximum: number } {
	if (sheet.status !== 'complete' || !sheet.attributes || !sheet.classId ||
		!Number.isSafeInteger(sheet.hitPoints.maximum) || (sheet.hitPoints.maximum || 0) < 1 ||
		!Number.isSafeInteger(sheet.hitPoints.current) || sheet.hitPoints.current! < 0 ||
		sheet.hitPoints.current! > sheet.hitPoints.maximum! ||
		!Number.isSafeInteger(sheet.hitPoints.temporary) || sheet.hitPoints.temporary < 0) {
		throw new Error('Ficha de sobrevivência inválida ou incompleta');
	}
	const copy = structuredClone(sheet);
	const state = rpgTrainerSurvival(copy);
	if (state.lifeState === 'dead' && copy.hitPoints.current! !== 0) throw new Error('Estado de vida inconsistente');
	copy.survival = state;
	return { sheet: copy, state, maximum: copy.hitPoints.maximum! };
}

function amount(value: number, label: string, maximum = 100_000): number {
	if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`${label} inválido`);
	return value;
}

function randomDie(sides: number, random: () => number): number {
	const value = random();
	if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Fonte aleatória inválida');
	return Math.floor(value * sides) + 1;
}

function dieSides(sheet: RPGTrainerSheet): number {
	const value = RPG_TRAINER_CLASSES[sheet.classId!]?.hitDie;
	if (!value) throw new Error('Classe do treinador inválida');
	return value;
}

function healMutable(sheet: RPGTrainerSheet, state: RPGTrainerSurvival, value: number): void {
	if (state.lifeState === 'dead') throw new Error('Um treinador morto não pode ser curado');
	const cap = state.wounds.some(wound => !wound.treated) ?
		Math.ceil(sheet.hitPoints.maximum! / 2) : sheet.hitPoints.maximum!;
	sheet.hitPoints.current = Math.min(cap, sheet.hitPoints.current! + value);
	if (sheet.hitPoints.current > 0 && (state.lifeState === 'dying' || state.lifeState === 'stable')) {
		state.lifeState = 'conscious';
		state.deathSaves = { successes: 0, failures: 0 };
	}
}

export function rpgTrainerTakeDamage(sheet: RPGTrainerSheet, damage: number,
	options: { nonlethal?: boolean, critical?: boolean, instantDeath?: boolean } = {}): RPGTrainerSheet {
	const { sheet: next, state, maximum } = complete(sheet);
	amount(damage, 'Dano');
	if (state.lifeState === 'dead' || !damage) return next;
	if (next.hitPoints.current === 0) {
		if (state.lifeState === 'stable') state.deathSaves = { successes: 0, failures: 0 };
		state.lifeState = 'dying';
		state.deathSaves.failures = Math.min(3, state.deathSaves.failures + (options.critical ? 2 : 1));
		if (state.deathSaves.failures === 3) state.lifeState = 'dead';
		return next;
	}
	const absorbed = Math.min(next.hitPoints.temporary, damage);
	next.hitPoints.temporary -= absorbed;
	const actual = damage - absorbed;
	if (actual > 0) delete state.rest;
	const overflow = actual - next.hitPoints.current!;
	next.hitPoints.current = Math.max(0, next.hitPoints.current! - actual);
	if (next.hitPoints.current === 0) {
		state.deathSaves = { successes: 0, failures: 0 };
		state.lifeState = options.instantDeath !== false && !options.nonlethal && overflow >= maximum ?
			'dead' : options.nonlethal ? 'stable' : 'dying';
	}
	return next;
}

export function rpgTrainerHeal(sheet: RPGTrainerSheet, value: number): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	healMutable(next, state, amount(value, 'Cura'));
	return next;
}

export function rpgTrainerDeathSave(sheet: RPGTrainerSheet, random: () => number = Math.random):
{ sheet: RPGTrainerSheet, natural: number } {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState !== 'dying' || next.hitPoints.current !== 0) throw new Error('Treinador não está morrendo');
	const natural = randomDie(20, random);
	if (natural === 20) healMutable(next, state, 1);
	else if (natural === 1) state.deathSaves.failures = Math.min(3, state.deathSaves.failures + 2);
	else if (natural >= 10) state.deathSaves.successes = Math.min(3, state.deathSaves.successes + 1);
	else state.deathSaves.failures = Math.min(3, state.deathSaves.failures + 1);
	if (state.deathSaves.failures === 3) state.lifeState = 'dead';
	else if (state.deathSaves.successes === 3) {
		state.lifeState = 'stable';
		state.deathSaves = { successes: 0, failures: 0 };
	}
	return { sheet: next, natural };
}

export function rpgTrainerStabilize(sheet: RPGTrainerSheet): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState !== 'dying') throw new Error('Treinador não está morrendo');
	state.lifeState = 'stable';
	state.deathSaves = { successes: 0, failures: 0 };
	return next;
}

export function rpgTrainerAddExhaustion(sheet: RPGTrainerSheet, levels: number): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	amount(levels, 'Níveis de exaustão', 6);
	if (state.lifeState === 'dead') throw new Error('Treinador já está morto');
	state.exhaustion = Math.min(6, state.exhaustion + levels);
	if (state.exhaustion === 6) { state.lifeState = 'dead'; next.hitPoints.current = 0; }
	return next;
}

/** Recuperação limitada de Exaustão, sem alterar ferimentos ou Pontos de Vida. */
export function rpgTrainerReduceExhaustion(sheet: RPGTrainerSheet): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState === 'dead') throw new Error('Treinador já está morto');
	if (state.exhaustion < 1) throw new Error('O participante não possui Exaustão para reduzir');
	state.exhaustion--;
	return next;
}

export function rpgTrainerApplyCondition(sheet: RPGTrainerSheet, condition: RPGTrainerCondition): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState === 'dead') throw new Error('Treinador já está morto');
	if (!RPG_TRAINER_CONDITIONS.includes(condition?.id) || typeof condition.source !== 'string' ||
		!condition.source.trim() || condition.source.length > 200) throw new Error('Condição inválida');
	if (condition.dc !== undefined) amount(condition.dc, 'CD', 100);
	if (condition.remainingRounds !== undefined) amount(condition.remainingRounds, 'Duração', 100_000);
	if (condition.progression !== undefined) amount(condition.progression, 'Progressão', 100_000);
	for (const text of [condition.nextSave, condition.treatment]) {
		if (text !== undefined && (typeof text !== 'string' || text.length > 200)) throw new Error('Condição inválida');
	}
	const applied: RPGTrainerCondition = {
		id: condition.id, source: condition.source.trim(),
		...(condition.dc === undefined ? {} : { dc: condition.dc }),
		...(condition.remainingRounds === undefined ? {} : { remainingRounds: condition.remainingRounds }),
		...(condition.nextSave === undefined ? {} : { nextSave: condition.nextSave }),
		...(condition.treatment === undefined ? {} : { treatment: condition.treatment }),
		...(condition.progression === undefined ? {} : { progression: condition.progression }),
		...(condition.suppressed === undefined ? {} : { suppressed: condition.suppressed === true }),
	};
	if (applied.id === 'envenenado' && state.conditions.some(entry => entry.id === 'gravemente-envenenado')) return next;
	if (applied.id === 'gravemente-envenenado') state.conditions = state.conditions.filter(entry => entry.id !== 'envenenado');
	const index = state.conditions.findIndex(entry => entry.id === applied.id);
	if (index < 0) state.conditions.push(applied);
	else state.conditions[index] = { ...state.conditions[index], ...applied,
		remainingRounds: Math.max(state.conditions[index].remainingRounds || 0, applied.remainingRounds || 0) || undefined,
		dc: Math.max(state.conditions[index].dc || 0, applied.dc || 0) || undefined,
		progression: Math.max(state.conditions[index].progression || 0, applied.progression || 0) || undefined };
	return next;
}

export function rpgTrainerRemoveCondition(sheet: RPGTrainerSheet, id: RPGTrainerConditionId): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (!RPG_TRAINER_CONDITIONS.includes(id)) throw new Error('Condição inválida');
	state.conditions = state.conditions.filter(entry => entry.id !== id);
	return next;
}

export function rpgTrainerConditionTick(sheet: RPGTrainerSheet,
	random: () => number = Math.random): { sheet: RPGTrainerSheet, damage: number, actionLost: boolean } {
	let { sheet: next, state, maximum } = complete(sheet);
	if (state.lifeState === 'dead') return { sheet: next, damage: 0, actionLost: true };
	let damage = 0;
	const damageEvents: number[] = [];
	let actionLost = false;
	for (const condition of state.conditions) {
		if (!condition.suppressed) {
			if (condition.id === 'queimado') damageEvents.push(Math.ceil(maximum / 16));
			if (condition.id === 'envenenado') damageEvents.push(Math.ceil(maximum / 8));
			if (condition.id === 'gravemente-envenenado') {
				condition.progression = (condition.progression || 0) + 1;
				damageEvents.push(Math.ceil(maximum * condition.progression / 16));
			}
			if (condition.id === 'paralisado') actionLost = randomDie(4, random) === 1;
			if (condition.id === 'confuso' && randomDie(6, random) <= 2) {
				actionLost = true;
				damageEvents.push(randomDie(4, random));
			}
		}
		if (condition.remainingRounds !== undefined) condition.remainingRounds--;
	}
	// Cada fonte contínua em 0 PV causa sua própria falha contra a morte.
	for (const event of damageEvents) {
		damage += event;
		next = rpgTrainerTakeDamage(next, event);
	}
	state = next.survival!;
	state.conditions = state.conditions.filter(entry => entry.remainingRounds === undefined || entry.remainingRounds > 0);
	return { sheet: next, damage, actionLost };
}

export function rpgTrainerAddWound(sheet: RPGTrainerSheet, id: string, description: string): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || typeof description !== 'string' ||
		!description.trim() || description.length > 500) throw new Error('Ferimento inválido');
	if (!state.wounds.some(wound => wound.id === id)) state.wounds.push({ id, description: description.trim(), treated: false });
	next.hitPoints.current = Math.min(next.hitPoints.current!, Math.ceil(next.hitPoints.maximum! / 2));
	return next;
}

export function rpgTrainerTreatWound(sheet: RPGTrainerSheet, id: string): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	const wound = state.wounds.find(entry => entry.id === id);
	if (!wound) throw new Error('Ferimento não encontrado');
	wound.treated = true;
	return next;
}

export type RPGTrainerRestKind = 'short' | 'long' | 'specialist-immediate' | 'specialist-long';
export type RPGTrainerSurvivalAction =
	| { type: 'damage', amount: number, nonlethal?: boolean, critical?: boolean, instantDeath?: boolean } |
	{ type: 'heal', amount: number } |
	{ type: 'death-save' } |
	{ type: 'stabilize' } |
	{ type: 'exhaustion', levels: number } |
	{ type: 'condition-add', condition: RPGTrainerCondition } |
	{ type: 'condition-remove', conditionId: RPGTrainerConditionId } |
	{ type: 'condition-tick' } |
	{ type: 'wound-add', woundId: string, description: string } |
	{ type: 'wound-treat', woundId: string } |
	{ type: 'rest-start', kind: RPGTrainerRestKind } |
	{ type: 'rest', kind: RPGTrainerRestKind, medicalCare?: boolean, medicalCheckTotal?: number,
		medicalProficiency?: number, adequate?: boolean, };

export function rpgTrainerStartRest(sheet: RPGTrainerSheet, kind: RPGTrainerRestKind,
	campaignTime: number): RPGTrainerSheet {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState === 'dead') throw new Error('Treinador morto não pode descansar');
	if (!Number.isSafeInteger(campaignTime) || campaignTime < 0 ||
		!['short', 'long', 'specialist-immediate', 'specialist-long'].includes(kind)) {
		throw new Error('Descanso inválido');
	}
	state.rest = { kind, startedAt: campaignTime };
	return next;
}

export function rpgTrainerRest(sheet: RPGTrainerSheet, kind: RPGTrainerRestKind, campaignTime: number,
	options: { medicalCare?: boolean, medicalCheckTotal?: number, medicalProficiency?: number, adequate?: boolean } = {},
	random: () => number = Math.random): { sheet: RPGTrainerSheet, recovered: number } {
	const { sheet: next, state } = complete(sheet);
	if (state.lifeState === 'dead') throw new Error('Treinador morto não pode descansar');
	if (!Number.isSafeInteger(campaignTime) || campaignTime < 0) throw new Error('Horário da campanha inválido');
	if (!['short', 'long', 'specialist-immediate', 'specialist-long'].includes(kind)) throw new Error('Descanso inválido');
	const required = kind === 'long' || kind === 'specialist-long' ? 8 : 1;
	if (state.rest?.kind !== kind || campaignTime - state.rest.startedAt < required * 3_600_000) {
		throw new Error(`Descanso exige ${required} hora(s) no relógio da campanha`);
	}
	const prior = next.hitPoints.current!;
	const sides = dieSides(next);
	const constitution = rpgTrainerModifier(next.attributes!.constitution);
	if (kind === 'short') {
		state.lastShortRest = { startedAt: state.rest.startedAt, completedAt: campaignTime };
		if (options.medicalCare) {
			if (state.shortCareUsed) throw new Error('O atendimento curto já foi recebido antes do descanso longo');
			if (!Number.isSafeInteger(options.medicalCheckTotal)) throw new Error('Teste de Medicina necessário');
			if (!Number.isSafeInteger(options.medicalProficiency) || options.medicalProficiency! < 2 ||
				options.medicalProficiency! > 4) throw new Error('Proficiência do médico inválida');
			state.shortCareUsed = true;
			if (options.medicalCheckTotal! >= 15) healMutable(next, state,
				randomDie(4, random) + options.medicalProficiency!);
		}
	} else if (kind === 'specialist-immediate') {
		if (state.lastSpecialistCareAt !== undefined && campaignTime - state.lastSpecialistCareAt < 86_400_000) {
			throw new Error('Atendimento especializado imediato disponível apenas a cada 24 horas');
		}
		state.lastSpecialistCareAt = campaignTime;
		healMutable(next, state, Math.max(1, randomDie(sides, random) + randomDie(sides, random) + constitution));
	} else {
		if (state.lastLongRestAt !== undefined && campaignTime - state.lastLongRestAt < 86_400_000) {
			throw new Error('Descanso longo disponível apenas uma vez a cada 24 horas');
		}
		state.lastLongRestAt = campaignTime;
		state.shortCareUsed = false;
		if (kind === 'specialist-long') healMutable(next, state, next.hitPoints.maximum!);
		else {
			if (options.medicalCare && !Number.isSafeInteger(options.medicalCheckTotal)) {
				throw new Error('Teste de Medicina necessário');
			}
			const dice = 1 + Number(next.talents.class.includes('atleta:recuperacao-atletica')) +
				Number(!!options.medicalCare && options.medicalCheckTotal! >= 15);
			let rolled = 0;
			for (let index = 0; index < dice; index++) rolled += randomDie(sides, random);
			healMutable(next, state, Math.max(1, rolled + constitution));
		}
		if (options.adequate && state.exhaustion > 0) state.exhaustion--;
	}
	delete state.rest;
	return { sheet: next, recovered: next.hitPoints.current! - prior };
}
