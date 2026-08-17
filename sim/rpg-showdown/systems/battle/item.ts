import type { Pokemon } from "../../../pokemon";

/**
 * Responsável por restaurar e salvar o item persistente de um Pokémon.
 */
export class ItemSystem {
	static apply(pokemon: Pokemon): void {
		const item = pokemon.rpg.item;
		if (item === undefined || item === pokemon.item) return;

		const itemID = pokemon.battle.dex.items.get(item).id;
		pokemon.item = itemID;
		pokemon.itemState = pokemon.battle.initEffectState({ id: itemID, target: pokemon });
	}

	static save(pokemon: Pokemon): void {
		pokemon.rpg.item = pokemon.item;
	}
}
