import type { Pokemon } from "../../pokemon";

import { ExperienceSystem } from "../systems/battle/experience";
import { HPSystem } from "../systems/battle/hp";

/**
 * Executado imediatamente após a criação de um Pokémon RPG.
 */
export class PokemonCreatedEvent {
	static execute(pokemon: Pokemon): void {
		pokemon.rpg.initialized = true;
		pokemon.rpg.hp ??= pokemon.maxhp;
		pokemon.rpg.status ??= pokemon.status;
		pokemon.rpg.pp ??= pokemon.baseMoveSlots.map(moveSlot => moveSlot.pp);
		pokemon.rpg.item ??= pokemon.item;
		pokemon.rpg.evs ??= { ...pokemon.set.evs };

		ExperienceSystem.initialize(pokemon);
		HPSystem.apply(pokemon);
	}
}
