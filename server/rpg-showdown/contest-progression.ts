import { toID } from '../../sim/dex-data';
import type { PokemonSet } from '../../sim/teams';

export interface RPGContestPlacementInput {
	id: string;
	disqualified: boolean;
	roundTotals: number[];
	scenarioCoherenceBonus: number;
	performanceBonus: number;
}

export interface RPGContestPlacement {
	participantId: string;
	place: number | null;
	total: number;
	disqualified: boolean;
	performanceGain: number;
}

export function getRPGContestPerformance(set: PokemonSet, trainerId: string): number {
	if (toID(set.rpg?.contestPerformanceTrainerId || '') !== toID(trainerId)) return 0;
	return Math.max(0, Math.min(100, Math.floor(set.rpg?.contestPerformance || 0)));
}

export function getRPGContestPerformanceBonus(performance: number): number {
	return Math.max(0, Math.min(20, Math.floor(performance / 5)));
}

export function rankRPGContestParticipants(inputs: readonly RPGContestPlacementInput[]): RPGContestPlacement[] {
	const eligible = inputs.filter(input => !input.disqualified).map(input => ({
		input,
		total: Number((input.roundTotals.reduce((sum, score) => sum + score, 0) +
			input.scenarioCoherenceBonus + input.performanceBonus).toFixed(1)),
	})).sort((a, b) => b.total - a.total);
	let previousTotal: number | undefined;
	let previousPlace = 0;
	const placements = new Map<string, RPGContestPlacement>();
	eligible.forEach((entry, index) => {
		const place = entry.total === previousTotal ? previousPlace : index + 1;
		previousTotal = entry.total;
		previousPlace = place;
		const placementGain = place === 1 ? 5 : place === 2 ? 3 : place === 3 ? 2 : 0;
		placements.set(entry.input.id, {
			participantId: entry.input.id, place, total: entry.total, disqualified: false,
			performanceGain: 2 + placementGain,
		});
	});
	for (const input of inputs) {
		if (input.disqualified) placements.set(input.id, {
			participantId: input.id, place: null, total: 0, disqualified: true, performanceGain: 0,
		});
	}
	return inputs.map(input => placements.get(input.id)!);
}

export function applyRPGContestPerformance(
	set: PokemonSet, trainerId: string, gain: number
): { before: number, after: number, gained: number } {
	const before = getRPGContestPerformance(set, trainerId);
	const after = Math.min(100, before + Math.max(0, Math.floor(gain)));
	set.rpg ||= {};
	set.rpg.contestPerformanceTrainerId = toID(trainerId);
	set.rpg.contestPerformance = after;
	return { before, after, gained: after - before };
}
