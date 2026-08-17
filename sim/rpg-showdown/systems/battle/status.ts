import type { Pokemon } from "../../../pokemon";

const PERSISTENT_STATUSES = new Set(['', 'brn', 'frz', 'par', 'psn', 'slp', 'tox']);

/**
 * Responsável por restaurar e salvar o status persistente.
 */
export class StatusSystem {
	static apply(pokemon: Pokemon): void {
		const status = pokemon.rpg.status;
		if (status === undefined || !PERSISTENT_STATUSES.has(status)) return;

		if (status !== pokemon.status) {
			pokemon.setStatus(status, null, null, true);
		}
		if (status === 'slp' && pokemon.rpg.sleepTurns !== undefined) {
			const turns = pokemon.battle.clampIntRange(pokemon.rpg.sleepTurns, 1);
			pokemon.statusState.time = turns;
			pokemon.statusState.startTime = turns;
		}
	}

	static save(pokemon: Pokemon): void {
		pokemon.rpg.status = pokemon.status;
		pokemon.rpg.sleepTurns = pokemon.status === 'slp' && typeof pokemon.statusState.time === 'number' ?
			pokemon.statusState.time : undefined;
	}
}
