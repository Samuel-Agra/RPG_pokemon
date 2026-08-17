import type { Pokemon } from "../../../pokemon";

/**
 * Responsável por restaurar e salvar o PP persistente dos golpes.
 */
export class PPSystem {
	static apply(pokemon: Pokemon): void {
		if (!pokemon.rpg.pp) return;

		for (const [index, savedPP] of pokemon.rpg.pp.entries()) {
			const baseMoveSlot = pokemon.baseMoveSlots[index];
			if (!baseMoveSlot || !Number.isFinite(savedPP)) continue;

			const pp = pokemon.battle.clampIntRange(savedPP, 0, baseMoveSlot.maxpp);
			baseMoveSlot.pp = pp;

			const activeMoveSlot = pokemon.moveSlots[index];
			if (activeMoveSlot && activeMoveSlot !== baseMoveSlot && activeMoveSlot.id === baseMoveSlot.id) {
				activeMoveSlot.pp = pp;
			}
		}
	}

	static save(pokemon: Pokemon): void {
		pokemon.rpg.pp = pokemon.baseMoveSlots.map(moveSlot => moveSlot.pp);
	}
}
