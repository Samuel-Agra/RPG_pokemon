import { RPG_TRAINER_CLASSES, rpgTrainerModifier } from './trainer-creation';
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
	const hitPoints = { ...sheet.hitPoints };
	if (sheet.status === 'complete' && levelsGained) {
		const chosenClass = sheet.classId && RPG_TRAINER_CLASSES[sheet.classId];
		if (!chosenClass || !sheet.attributes || hitPoints.maximum === null || hitPoints.current === null) {
			throw new Error('Ficha completa sem dados válidos para subir de nível');
		}
		const growth = (chosenClass.hitDie === 6 ? 4 : chosenClass.hitDie === 8 ? 5 : 6) +
			rpgTrainerModifier(sheet.attributes.constitution);
		hitPoints.maximum += Math.max(1, growth) * levelsGained;
		if (sheet.talents.general.includes('robusto')) hitPoints.maximum += levelsGained;
		// Subir de nível não cura ferimentos nem remove condições.
	}
	const pendingChoices = { ...(sheet.pendingChoices || { general: 0, class: 0, apex: 0 }) };
	for (let next = oldLevel + 1; next <= level; next++) {
		if (next === 10) {
			pendingChoices.general++;
			pendingChoices.apex++;
		} else if (next % 2 === 0) {
			pendingChoices.general++;
		} else {
			pendingChoices.class++;
		}
	}
	return {
		sheet: { ...sheet, level, experience, hitPoints, pendingChoices,
			rewards: [...(sheet.rewards || []), { ...reward, reason: reward.reason.trim() }] },
		awarded: true, levelsGained,
	};
}
