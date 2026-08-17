import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";

export class TerrainSystem {
	static apply(battle: Battle, source: Pokemon): void {
		const terrainID = battle.rpg?.terrain;
		if (!terrainID) return;

		const terrain = battle.dex.conditions.get(terrainID);
		if (!terrain.id || !battle.field.setTerrain(terrain, source)) return;

		const duration = battle.rpg?.terrainDuration;
		// A preparação omite a duração para representar terreno permanente; zero não é decrementado pelo residual nativo.
		battle.field.terrainState.duration = duration === undefined ? 0 : battle.clampIntRange(duration, 0);
	}

	static save(battle: Battle): void {
		if (!battle.rpg) return;

		battle.rpg.terrain = battle.field.terrain;
		battle.rpg.terrainDuration = typeof battle.field.terrainState.duration === 'number' ?
			battle.field.terrainState.duration : undefined;
	}
}
