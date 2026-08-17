import type { Pokemon } from "../../pokemon";

import { PersistenceSystem } from "../systems/persistence";

export class PokemonSwitchOutEvent {
	static execute(pokemon: Pokemon): void {
		PersistenceSystem.save(pokemon);
	}
}
