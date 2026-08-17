import type { Pokemon } from "../../../pokemon";
import type { RPGLevelMoveResult } from "../../state";

const RPG_LEARNSET_GENERATION = 9;

export class LevelProgressionSystem {
	static getLearnedMoves(pokemon: Pokemon, previousLevel: number, level: number): RPGLevelMoveResult[] {
		if (level <= previousLevel) return [];

		const learnset = pokemon.battle.dex.species.getLearnsetData(pokemon.baseSpecies.id).learnset || {};
		const knownMoves = new Set(pokemon.baseMoves);
		const learned = new Map<string, number>();
		for (const [move, sources] of Object.entries(learnset)) {
			if (knownMoves.has(move)) continue;
			for (const source of sources) {
				const match = new RegExp(`^${RPG_LEARNSET_GENERATION}L(\\d+)$`).exec(source);
				if (!match) continue;
				const learnedAt = Number(match[1]);
				if (learnedAt <= previousLevel || learnedAt > level) continue;
				learned.set(move, Math.min(learned.get(move) ?? learnedAt, learnedAt));
			}
		}
		return [...learned]
			.map(([move, learnedAt]) => ({ move, level: learnedAt }))
			.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
	}
}
