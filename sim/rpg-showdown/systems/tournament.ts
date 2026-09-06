/** Modelo puro do chaveamento e da resolução ponderada de confrontos automáticos entre NPCs. */
export const RPG_TOURNAMENT_VERSION = 1;

export type RPGTournamentParticipantType = 'player' | 'npc';
export type RPGTournamentNPCClass = 'generic' | 'special';

export interface RPGTournamentParticipant {
	id: string;
	name: string;
	type: RPGTournamentParticipantType;
	npcClass?: RPGTournamentNPCClass;
	/** Relative team quality used only to weight automatic NPC matches. */
	strength?: number;
}

export interface RPGTournamentAutomaticResult {
	version: number;
	matchId: string;
	automatic: true;
	participant1Id: string;
	participant2Id: string;
	winnerId: string;
	loserId: string;
	resolution: 'random' | 'special-priority';
}

export interface RPGTournamentNPCResolution {
	winner: RPGTournamentParticipant;
	loser: RPGTournamentParticipant;
	reason: RPGTournamentAutomaticResult['resolution'];
}

export class RPGTournamentSystem {
	static normalizeParticipant(participant: RPGTournamentParticipant): RPGTournamentParticipant {
		const id = this.normalizeId(participant.id);
		const name = participant.name?.trim();
		if (!id || !name) throw new Error('RPG Tournament participant requires id and name');
		if (!['player', 'npc'].includes(participant.type)) {
			throw new Error('Invalid RPG Tournament participant type');
		}
		if (participant.type === 'player' && participant.npcClass !== undefined) {
			throw new Error('RPG Tournament player cannot have npcClass');
		}
		if (participant.type === 'npc' && !['generic', 'special'].includes(participant.npcClass || '')) {
			throw new Error('RPG Tournament NPC requires generic or special npcClass');
		}
		return {
			id,
			name,
			type: participant.type,
			...(participant.type === 'npc' ? { npcClass: participant.npcClass } : {}),
			...(participant.type === 'npc' ? { strength: Math.max(1, Number(participant.strength) || 1) } : {}),
		};
	}

	static isAutomaticMatch(
		participant1: RPGTournamentParticipant,
		participant2: RPGTournamentParticipant
	): boolean {
		return participant1.type === 'npc' && participant2.type === 'npc';
	}

	static chooseNPCWinner(
		participant1: RPGTournamentParticipant,
		participant2: RPGTournamentParticipant,
		random: () => number = Math.random
	): RPGTournamentNPCResolution {
		const p1 = this.normalizeParticipant(participant1);
		const p2 = this.normalizeParticipant(participant2);
		if (!this.isAutomaticMatch(p1, p2)) {
			throw new Error('RPG Tournament automatic result requires two NPCs');
		}
		if (p1.id === p2.id) throw new Error('RPG Tournament match requires different participants');

		if (p1.npcClass !== p2.npcClass) {
			const winner = p1.npcClass === 'special' ? p1 : p2;
			const loser = winner === p1 ? p2 : p1;
			return { winner, loser, reason: 'special-priority' };
		}
		const roll = random();
		if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
			throw new Error('RPG Tournament random value must be between 0 and 1');
		}
		const firstChance = (p1.strength || 1) / ((p1.strength || 1) + (p2.strength || 1));
		const winner = roll < firstChance ? p1 : p2;
		return {
			winner,
			loser: winner === p1 ? p2 : p1,
			reason: 'random',
		};
	}

	static resolveNPCMatch(
		matchId: string,
		participant1: RPGTournamentParticipant,
		participant2: RPGTournamentParticipant,
		random: () => number = Math.random
	): RPGTournamentAutomaticResult {
		const normalizedMatchId = matchId?.trim();
		if (!normalizedMatchId) throw new Error('RPG Tournament automatic result requires matchId');
		const resolution = this.chooseNPCWinner(participant1, participant2, random);
		return {
			version: RPG_TOURNAMENT_VERSION,
			matchId: normalizedMatchId,
			automatic: true,
			participant1Id: this.normalizeId(participant1.id),
			participant2Id: this.normalizeId(participant2.id),
			winnerId: resolution.winner.id,
			loserId: resolution.loser.id,
			resolution: resolution.reason,
		};
	}
	private static normalizeId(value: string): string {
		return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	}
}
