import { RPG_TRAINER_CLASSES, rpgTrainerModifier } from './trainer-creation';
import { RPG_TRAINER_TALENTS } from './trainer-talents-catalog';
import type { RPGTrainerSheet } from './trainer-sheet';

export const RPG_TRAINER_LEVEL_XP = Object.freeze([
	0, 937_500, 2_812_500, 8_437_500, 20_312_500,
	43_750_000, 71_875_000, 106_250_000, 150_000_000, 200_000_000,
]);

export const RPG_CONTEST_PODIUM_XP = Object.freeze({
	normal: [2_000, 1_200, 700],
	great: [6_000, 3_600, 2_100],
	super: [9_000, 5_400, 3_150],
	hyper: [12_000, 7_200, 4_200],
	master: [24_000, 14_400, 8_400],
});

export const RPG_BADGE_XP = Object.freeze([
	100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 500_000,
]);

export type RPGTrainerRewardKind = 'battle' | 'contest' | 'badge' | 'master';

export interface RPGTrainerXPReward {
	kind: RPGTrainerRewardKind;
	sourceId: string;
	amount: number;
	reason: string;
	grantedAt: number;
	grantedBy?: string;
}

export function rpgTrainerLevelForXP(experience: number): number {
	if (!Number.isSafeInteger(experience) || experience < 0) throw new Error('XP do treinador inválida');
	for (let level = RPG_TRAINER_LEVEL_XP.length; level > 1; level--) {
		if (experience >= RPG_TRAINER_LEVEL_XP[level - 1]) return level;
	}
	return 1;
}

export function rpgTrainerXPToNextLevel(experience: number): number | null {
	const level = rpgTrainerLevelForXP(experience);
	return level === 10 ? null : RPG_TRAINER_LEVEL_XP[level] - experience;
}

export function rpgContestPodiumXP(rank: string, place: number | null, disqualified = false): number {
	if (!Object.prototype.hasOwnProperty.call(RPG_CONTEST_PODIUM_XP, rank)) throw new Error('Rank de concurso inválido');
	if (place !== null && (!Number.isSafeInteger(place) || place < 1)) throw new Error('Colocação inválida');
	return disqualified || place === null || place > 3 ? 0 :
		RPG_CONTEST_PODIUM_XP[rank as keyof typeof RPG_CONTEST_PODIUM_XP][place - 1];
}

export function rpgBadgeXP(gymIndex: number): number {
	if (!Number.isSafeInteger(gymIndex) || gymIndex < 0 || gymIndex >= 8) {
		throw new Error('Posição de insígnia inválida');
	}
	return RPG_BADGE_XP[gymIndex];
}

function validateReward(reward: RPGTrainerXPReward): void {
	if (!reward || !['battle', 'contest', 'badge', 'master'].includes(reward.kind) ||
		typeof reward.sourceId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(reward.sourceId) ||
		!Number.isSafeInteger(reward.amount) || reward.amount <= 0 ||
		typeof reward.reason !== 'string' || !reward.reason.trim() || reward.reason.length > 500 ||
		!Number.isSafeInteger(reward.grantedAt) || reward.grantedAt < 0 ||
		(reward.grantedBy !== undefined && (typeof reward.grantedBy !== 'string' || reward.grantedBy.length > 100))) {
		throw new Error('Recompensa de XP inválida');
	}
}

export function awardRPGTrainerXP(sheet: RPGTrainerSheet, reward: RPGTrainerXPReward): {
	sheet: RPGTrainerSheet, awarded: boolean, levelsGained: number,
} {
	validateReward(reward);
	if (!sheet || sheet.version !== 1) throw new Error('Ficha do treinador inválida');
	const key = `${reward.kind}:${reward.sourceId}`;
	const previous = sheet.rewards?.find(entry => `${entry.kind}:${entry.sourceId}` === key);
	if (previous) {
		if (previous.amount !== reward.amount) throw new Error('A origem já concedeu outro valor de XP');
		return { sheet, awarded: false, levelsGained: 0 };
	}
	const experience = sheet.experience + reward.amount;
	if (!Number.isSafeInteger(experience)) throw new Error('A XP acumulada excede o limite numérico');
	const oldLevel = rpgTrainerLevelForXP(sheet.experience);
	const level = rpgTrainerLevelForXP(experience);
	const levelsGained = level - oldLevel;
	return {
		sheet: { ...sheet, experience,
			rewards: [...(sheet.rewards || []), { ...reward, reason: reward.reason.trim() }] },
		awarded: true, levelsGained,
	};
}

/** XP não altera a ficha: o nível é aplicado após o descanso e a confirmação de todas as escolhas. */
export function advanceRPGTrainerLevel(sheet: RPGTrainerSheet, bypassRest = false): RPGTrainerSheet {
	if (sheet.status !== 'complete' || !sheet.attributes || !sheet.classId ||
		sheet.hitPoints.maximum === null || sheet.hitPoints.current === null) throw new Error('Conclua a ficha primeiro');
	const nextLevel = sheet.level + 1;
	if (nextLevel > 10 || rpgTrainerLevelForXP(sheet.experience) < nextLevel) throw new Error('XP insuficiente para o próximo nível');
	if (!bypassRest && (sheet.levelUpReady || 0) < nextLevel) throw new Error('Aguarde um descanso longo de 8 horas na campanha');
	if (Object.values(sheet.pendingChoices || {}).some(count => count > 0)) {
		throw new Error('Escolha os talentos pendentes antes de subir novamente');
	}
	const rule = RPG_TRAINER_CLASSES[sheet.classId];
	if (!rule) throw new Error('Classe inválida');
	const next = structuredClone(sheet);
	const snapshot = {
		level: sheet.level, attributes: structuredClone(sheet.attributes), hitPointsMaximum: sheet.hitPoints.maximum,
		skills: structuredClone(sheet.skills), resistances: [...sheet.resistances], talents: structuredClone(sheet.talents),
		talentSelections: structuredClone(sheet.talentSelections || []), proficiencies: [...(sheet.proficiencies || [])],
		resources: structuredClone(sheet.resources), pendingChoices: structuredClone(sheet.pendingChoices ||
			{ general: 0, class: 0, apex: 0 }),
	};
	next.levelSnapshots = [...(next.levelSnapshots || []), snapshot];
	next.level = nextLevel;
	const growth = (rule.hitDie === 6 ? 4 : rule.hitDie === 8 ? 5 : 6) +
		rpgTrainerModifier(sheet.attributes.constitution);
	next.hitPoints.maximum = sheet.hitPoints.maximum + Math.max(1, growth) +
		Number(sheet.talents.general.includes('robusto'));
	// Subir de nível não recupera PV, condições ou ferimentos.
	next.pendingChoices = { ...(sheet.pendingChoices || { general: 0, class: 0, apex: 0 }) };
	if (nextLevel === 10) { next.pendingChoices.general++; next.pendingChoices.apex++; } else if (nextLevel % 2 === 0) next.pendingChoices.general++;
	else next.pendingChoices.class++;
	if (nextLevel >= rpgTrainerLevelForXP(next.experience)) delete next.levelUpWaitingSince;
	return next;
}

/** Reversão usa o estado anterior ao nível, preservando saúde e histórico de recompensas atuais. */
export function lowerRPGTrainerLevel(sheet: RPGTrainerSheet): RPGTrainerSheet {
	if (sheet.status !== 'complete' || sheet.level <= 1) throw new Error('Não é possível diminuir este nível');
	const snapshot = [...(sheet.levelSnapshots || [])].reverse().find(entry => entry.level === sheet.level - 1);
	if (!snapshot) return lowerLegacyRPGTrainerLevel(sheet);
	const next = structuredClone(sheet);
	const previousMaximum = next.hitPoints.maximum || 0;
	next.level = snapshot.level;
	next.attributes = structuredClone(snapshot.attributes);
	next.hitPoints.maximum = snapshot.hitPointsMaximum;
	next.hitPoints.current = Math.min(next.hitPoints.current || 0, snapshot.hitPointsMaximum);
	next.skills = structuredClone(snapshot.skills);
	next.resistances = [...snapshot.resistances];
	next.talents = structuredClone(snapshot.talents);
	next.talentSelections = structuredClone(snapshot.talentSelections || []);
	next.proficiencies = [...(snapshot.proficiencies || [])];
	next.resources = Object.fromEntries(Object.entries(snapshot.resources).map(([key, resource]) => [key, {
		maximum: resource.maximum, current: Math.min(next.resources[key]?.current ?? resource.current, resource.maximum),
	}]));
	next.pendingChoices = structuredClone(snapshot.pendingChoices || { general: 0, class: 0, apex: 0 });
	next.levelSnapshots = next.levelSnapshots?.filter(entry => entry.level < snapshot.level);
	next.levelUpReady = Math.min(next.levelUpReady || next.level, next.level);
	next.experience = Math.min(next.experience, RPG_TRAINER_LEVEL_XP[next.level] - 1);
	if (previousMaximum < snapshot.hitPointsMaximum) throw new Error('Histórico de PV inconsistente');
	return next;
}

/** Fichas de antes dos retratos de nível são revertidas pela sequência de escolhas registrada. */
function lowerLegacyRPGTrainerLevel(sheet: RPGTrainerSheet): RPGTrainerSheet {
	if (!sheet.attributes || !sheet.classId || sheet.hitPoints.maximum === null) {
		throw new Error('Ficha antiga sem dados suficientes para reverter o nível');
	}
	const next = structuredClone(sheet);
	const currentLevel = next.level;
	const attributes = next.attributes!;
	let maximum = next.hitPoints.maximum!;
	const currentSelections = (next.talentSelections || []).filter(entry => entry.acquiredAtLevel === currentLevel).reverse();
	const remove = (values: string[], id: string) => {
		const index = values.lastIndexOf(id);
		if (index < 0) throw new Error('Histórico de talentos inconsistente');
		values.splice(index, 1);
	};
	for (const selection of currentSelections) {
		const talent = RPG_TRAINER_TALENTS.find(entry => entry.id === selection.id);
		if (!talent) throw new Error('Talento antigo desconhecido; não é seguro diminuir o nível');
		if (talent.kind === 'apex') next.talents.apex = null;
		else remove(next.talents[talent.kind], selection.id);
		if (selection.attribute) {
			const attribute = selection.attribute;
			const oldValue = attributes[attribute] - 1;
			if (oldValue < 1) throw new Error('Histórico de atributo inconsistente');
			if (attribute === 'constitution') {
				maximum -= (rpgTrainerModifier(attributes.constitution) -
					rpgTrainerModifier(oldValue)) * currentLevel;
			}
			attributes[attribute] = oldValue;
		}
		if (selection.id === 'treinamento-adicional' && selection.skill) remove(next.skills.trained, selection.skill);
		if (selection.id === 'foco-em-pericia' && selection.skill) remove(next.skills.focused, selection.skill);
		if (selection.id === 'resiliente' && selection.resistance) remove(next.resistances, selection.resistance);
		if (selection.id === 'artista-marcial:reflexos-treinados' && selection.variant !== 'already-trained') {
			remove(next.resistances, 'reflexes');
		}
		if (selection.id === 'dominio-de-escudos') remove(next.proficiencies || [], 'escudos');
		if (selection.proficiency) remove(next.proficiencies || [], selection.proficiency);
		if (selection.id === 'robusto') maximum -= currentLevel;
	}
	next.talentSelections = (next.talentSelections || []).filter(entry => entry.acquiredAtLevel !== currentLevel);
	const rule = RPG_TRAINER_CLASSES[next.classId!];
	if (!rule) throw new Error('Classe antiga desconhecida');
	const growth = Math.max(1, (rule.hitDie === 6 ? 4 : rule.hitDie === 8 ? 5 : 6) +
		rpgTrainerModifier(attributes.constitution));
	maximum -= growth + Number(next.talents.general.includes('robusto'));
	next.level--;
	if (maximum < 1 || next.talents.general.length > Math.floor(next.level / 2) ||
		next.talents.class.length > Math.floor((next.level - 1) / 2) || (next.talents.apex && next.level < 10)) {
		throw new Error('Histórico insuficiente para reverter este nível com segurança');
	}
	next.hitPoints.maximum = maximum;
	next.hitPoints.current = Math.min(next.hitPoints.current || 0, maximum);
	next.pendingChoices = {
		general: Math.floor(next.level / 2) - next.talents.general.length,
		class: Math.floor((next.level - 1) / 2) - next.talents.class.length,
		apex: next.level === 10 && !next.talents.apex ? 1 : 0,
	};
	next.levelUpReady = Math.min(next.levelUpReady || next.level, next.level);
	next.experience = Math.min(next.experience, RPG_TRAINER_LEVEL_XP[next.level] - 1);
	return next;
}
