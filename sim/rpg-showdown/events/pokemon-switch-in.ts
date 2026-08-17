import type { Pokemon } from "../../pokemon";

import { RPGLogger } from "../logger";
import { PersistenceSystem } from "../systems/persistence";

export class PokemonSwitchInEvent {
	static execute(pokemon: Pokemon): void {
		RPGLogger.debug('SwitchIn:', pokemon.fullname);
		PersistenceSystem.load(pokemon);
	}
}
