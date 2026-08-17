import type { Pokemon } from "../../pokemon";

import { EVSystem } from "./battle/ev";
import { HPSystem } from "./battle/hp";
import { ItemSystem } from "./battle/item";
import { PPSystem } from "./battle/pp";
import { StatusSystem } from "./battle/status";

export class PersistenceSystem {
	static load(pokemon: Pokemon): void {
		HPSystem.apply(pokemon);
		StatusSystem.apply(pokemon);
		PPSystem.apply(pokemon);
		ItemSystem.apply(pokemon);
	}

	static save(pokemon: Pokemon): void {
		HPSystem.save(pokemon);
		StatusSystem.save(pokemon);
		PPSystem.save(pokemon);
		ItemSystem.save(pokemon);
		EVSystem.save(pokemon);
	}
}
