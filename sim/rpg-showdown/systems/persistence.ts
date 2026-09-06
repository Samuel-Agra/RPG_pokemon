/**
 * Sincroniza o estado RPG persistente com um Pokémon temporário do simulador.
 * `load` prepara o início da batalha; `save` devolve somente os recursos que
 * devem sobreviver ao combate, como HP, PP, status, item e EVs.
 */
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
