import type { Pokemon } from "../../../pokemon";

/**
 * Responsável por restaurar e salvar o HP persistente de um Pokémon.
 */
export class HPSystem {
	static apply(pokemon: Pokemon): void {
		if (pokemon.rpg.hp === undefined) return;

		pokemon.hp = pokemon.battle.clampIntRange(pokemon.rpg.hp, 0, pokemon.maxhp);
		pokemon.fainted = pokemon.hp === 0;
		pokemon.faintQueued = false;
	}

	static save(pokemon: Pokemon): void {
		pokemon.rpg.hp = pokemon.battle.clampIntRange(pokemon.hp, 0, pokemon.maxhp);
	}
}
