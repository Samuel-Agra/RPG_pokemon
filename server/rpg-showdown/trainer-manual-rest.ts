import type { RPGTrainerSheet } from './trainer-sheet';
import { RPG_TRAINER_TALENTS } from './trainer-talents-catalog';

/** Talentos com limite por descanso cujo efeito é arbitrado na mesa, sem ação automática própria. */
export const RPG_MANUAL_REST_TALENTS: Record<string, 'short' | 'long'> = {
	'aprendizado-por-observacao': 'long',
	'improviso-decisivo': 'long',
	'sobrevivente': 'long',
	'guarda-pokemon:muralha-humana': 'short',
} as const;

export const RPG_AUTOMATIC_GENERAL_REST_TALENTS = [
	'segundo-folego', 'sortudo', 'determinado', 'esforco-heroico',
] as const;

export function rpgUsedAutomaticGeneralTalents(sheet: RPGTrainerSheet): string[] {
	return RPG_AUTOMATIC_GENERAL_REST_TALENTS.filter(id =>
		sheet.talents.general.includes(id) && sheet.talentUses?.[id] === (sheet.talentRestCycle || 0));
}

export function rpgAutomaticGeneralTalentNames(ids: readonly string[]): string[] {
	return ids.map(id => RPG_TRAINER_TALENTS.find(talent => talent.id === id)!.name);
}

type ManualTalentId = string;

function owned(sheet: RPGTrainerSheet, id: string): boolean {
	return sheet.talents.general.includes(id) || sheet.talents.class.includes(id) || sheet.talents.apex === id;
}

function cycle(sheet: RPGTrainerSheet, id: ManualTalentId): string {
	return RPG_MANUAL_REST_TALENTS[id] === 'short' ?
		`short:${sheet.manualTalentShortCycle || 0}:${sheet.manualTalentLongCycle || 0}` :
		`long:${sheet.manualTalentLongCycle || 0}`;
}

export function rpgManualTalentUsed(sheet: RPGTrainerSheet, id: string): boolean {
	return id in RPG_MANUAL_REST_TALENTS &&
		sheet.manualTalentUses?.[id] === cycle(sheet, id as ManualTalentId);
}

export function rpgMarkManualTalentUsed(sheet: RPGTrainerSheet, id: string): RPGTrainerSheet {
	if (sheet.status !== 'complete' || !(id in RPG_MANUAL_REST_TALENTS) || !owned(sheet, id)) {
		throw new Error('Talento indisponível para este treinador');
	}
	if (rpgManualTalentUsed(sheet, id)) throw new Error('Talento já usado neste descanso');
	const next = structuredClone(sheet);
	next.manualTalentUses = { ...next.manualTalentUses, [id]: cycle(next, id as ManualTalentId) };
	return next;
}

export function rpgRenewManualRestTalents(sheet: RPGTrainerSheet, kind: 'short' | 'long'): string[] {
	const renewed = Object.keys(RPG_MANUAL_REST_TALENTS)
		.filter(id => rpgManualTalentUsed(sheet, id) && owned(sheet, id) &&
			(kind === 'long' || RPG_MANUAL_REST_TALENTS[id as ManualTalentId] === 'short'))
		.map(id => RPG_TRAINER_TALENTS.find(talent => talent.id === id)!.name);
	if (kind === 'short') sheet.manualTalentShortCycle = (sheet.manualTalentShortCycle || 0) + 1;
	else sheet.manualTalentLongCycle = (sheet.manualTalentLongCycle || 0) + 1;
	for (const id of Object.keys(RPG_MANUAL_REST_TALENTS)) {
		if (kind === 'long' || RPG_MANUAL_REST_TALENTS[id as ManualTalentId] === 'short') {
			delete sheet.manualTalentUses?.[id];
		}
	}
	return renewed.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function rpgManualRestTalentOptions(sheet: RPGTrainerSheet) {
	return Object.entries(RPG_MANUAL_REST_TALENTS).filter(([id]) => owned(sheet, id))
		.map(([id, rest]) => ({ id, rest, used: rpgManualTalentUsed(sheet, id) }));
}
