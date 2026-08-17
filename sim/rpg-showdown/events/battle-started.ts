import type { Battle } from "../../battle";
import type { Pokemon } from "../../pokemon";

import { TerrainSystem } from "../systems/battle/terrain";
import { WeatherSystem } from "../systems/battle/weather";

export class BattleStartedEvent {
	static execute(battle: Battle, source: Pokemon): void {
		WeatherSystem.apply(battle, source);
		TerrainSystem.apply(battle, source);
	}
}
