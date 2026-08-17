import type { Pokemon } from "../../../pokemon";

export class WildEncounterSystem {
	static readonly MAX_LEGENDARY_LEVEL = 999;
	static readonly EVOLVING_LEGENDARIES = new Set([
		'typenull', 'silvally',
		'cosmog', 'cosmoem', 'solgaleo', 'lunala',
		'kubfu', 'urshifu',
	]);

	static applyLegendaryLevel(pokemon: Pokemon): void {
		const state = pokemon.battle.rpg;
		if (state?.battleType !== 'wild' || state.wildLegendaryLevel === undefined) return;
		if (pokemon.baseSpecies.num <= 0) return;
		const familyId = pokemon.baseSpecies.baseSpecies.toLowerCase().replace(/[^a-z0-9]+/g, '');
		if (this.EVOLVING_LEGENDARIES.has(familyId)) return;
		if (!pokemon.baseSpecies.tags.some(
			tag => tag === 'Restricted Legendary' || tag === 'Sub-Legendary'
		)) return;
		if (pokemon.side.id !== (state.wildSide || 'p2')) return;

		pokemon.set.level = pokemon.battle.clampIntRange(
			state.wildLegendaryLevel,
			1,
			this.MAX_LEGENDARY_LEVEL
		);
	}
}
