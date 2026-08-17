import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import { toID } from "../../../dex-data";
import type { RPGFormChangeResult } from "../../state";

export class RPGMegaEvolutionSystem {
	private static readonly changes = new WeakMap<Battle, RPGFormChangeResult[]>();

	static record(pokemon: Pokemon): void {
		if (!pokemon.battle.rpg) return;
		const fromSpecies = pokemon.set.species || pokemon.set.name;
		if (!fromSpecies || pokemon.species.name === fromSpecies) return;
		const changes = this.changes.get(pokemon.battle) || [];
		if (changes.some(change => change.side === pokemon.side.id && change.position === pokemon.position)) return;
		changes.push({
			side: pokemon.side.id,
			position: pokemon.position,
			fromSpecies,
			toSpecies: pokemon.species.name,
			kind: pokemon.species.isMega ? 'mega' : 'ultra',
			reverted: false,
		});
		this.changes.set(pokemon.battle, changes);
	}

	static restoreAtBattleEnd(battle: Battle): void {
		for (const change of this.changes.get(battle) || []) {
			const side = battle.sides.find(candidate => candidate.id === change.side);
			const pokemon = side?.pokemon[change.position];
			if (!pokemon) continue;
			if (pokemon.species.name !== change.fromSpecies) {
				const species = battle.dex.species.get(change.fromSpecies);
				pokemon.baseSpecies = species;
				pokemon.baseAbility = toID(pokemon.set.ability);
				pokemon.setSpecies(species);
				pokemon.ability = pokemon.baseAbility;
				pokemon.details = pokemon.getUpdatedDetails();
				battle.add('detailschange', pokemon, pokemon.details);
				pokemon.updateMaxHp();
				pokemon.formeRegression = false;
			}
			change.reverted = true;
		}
	}

	static getResults(battle: Battle): RPGFormChangeResult[] {
		return structuredClone(this.changes.get(battle) || []);
	}

	static clear(battle: Battle): void {
		this.changes.delete(battle);
	}
}
