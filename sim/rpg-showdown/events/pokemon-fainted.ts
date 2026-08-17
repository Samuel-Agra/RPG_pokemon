import type { Pokemon } from "../../pokemon";

import { CaptureSystem } from "../systems/battle/capture";
import { ParticipationSystem } from "../systems/battle/participation";

export class PokemonFaintedEvent {
	static execute(pokemon: Pokemon, source: Pokemon | null): void {
		if (CaptureSystem.wasCaptured(pokemon)) return;
		ParticipationSystem.recordFaint(pokemon, source);
	}
}
