import type { Battle } from "../../battle";

import { PersistenceSystem } from "../systems/persistence";
import { ExperienceDistributionSystem } from "../systems/battle/experience-distribution";
import { FriendshipSystem } from "../systems/battle/friendship";
import { BattleResultSystem } from "../systems/battle/result";
import { TerrainSystem } from "../systems/battle/terrain";
import { WeatherSystem } from "../systems/battle/weather";

export class BattleEndedEvent {
	static execute(battle: Battle): void {
		WeatherSystem.save(battle);
		TerrainSystem.save(battle);
		ExperienceDistributionSystem.apply(battle);
		FriendshipSystem.applyBattle(battle);

		for (const pokemon of battle.getAllPokemon()) {
			if (pokemon.set.rpg === undefined) continue;
			PersistenceSystem.save(pokemon);
		}
		BattleResultSystem.save(battle);
	}
}
