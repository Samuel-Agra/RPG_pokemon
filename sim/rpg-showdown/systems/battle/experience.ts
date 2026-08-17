import type { Pokemon } from "../../../pokemon";

import {
	getExperienceForLevel,
	getSpeciesExperience,
	LUCKY_EGG_MULTIPLIER,
	type RPGSpeciesExperienceData,
} from "../../data/experience";

export class ExperienceSystem {
	static getSpeciesData(pokemon: Pokemon): RPGSpeciesExperienceData | null {
		return getSpeciesExperience(pokemon.species.id) || getSpeciesExperience(pokemon.baseSpecies.id);
	}

	static initialize(pokemon: Pokemon): void {
		pokemon.rpg.level ??= pokemon.level;
		const data = this.getSpeciesData(pokemon);
		if (data) pokemon.rpg.experience ??= getExperienceForLevel(data.growthRate, pokemon.level);
		if (pokemon.rpg.luckyEggBattles !== undefined) {
			pokemon.rpg.luckyEggBattles = pokemon.battle.clampIntRange(pokemon.rpg.luckyEggBattles, 0);
		}
	}

	static hasLuckyEggBoost(pokemon: Pokemon): boolean {
		return (pokemon.rpg.luckyEggBattles || 0) > 0;
	}

	static getPokemonMultiplier(pokemon: Pokemon): number {
		let multiplier = this.hasLuckyEggBoost(pokemon) ? LUCKY_EGG_MULTIPLIER : 1;
		if (pokemon.rpg.traded) multiplier *= pokemon.rpg.foreignLanguage ? 1.7 : 1.5;
		if ((pokemon.rpg.friendship || 0) >= 220) multiplier *= 1.2;
		if (pokemon.rpg.experienceMultiplier !== undefined && Number.isFinite(pokemon.rpg.experienceMultiplier)) {
			multiplier *= Math.max(0, pokemon.rpg.experienceMultiplier);
		}
		return multiplier;
	}

	static getMultiplier(pokemon: Pokemon): number {
		return this.getPokemonMultiplier(pokemon);
	}

	static calculateBaseGain(baseExperience: number, defeatedLevel: number, recipientLevel: number): number {
		const safeBaseExperience = Math.max(0, Math.trunc(baseExperience));
		const safeDefeatedLevel = Math.max(1, Math.min(100, Math.trunc(defeatedLevel)));
		const safeRecipientLevel = Math.max(1, Math.min(100, Math.trunc(recipientLevel)));
		if (!safeBaseExperience || safeRecipientLevel >= 100) return 0;

		const base = Math.floor(safeBaseExperience * safeDefeatedLevel / 5);
		const levelScale = (
			(2 * safeDefeatedLevel + 10) /
			(safeDefeatedLevel + safeRecipientLevel + 10)
		) ** 2.5;
		return Math.max(1, Math.floor(base * levelScale + 1));
	}

	static consumeLuckyEggBattle(pokemon: Pokemon): void {
		if ((pokemon.rpg.luckyEggBattles || 0) <= 0) return;
		pokemon.rpg.luckyEggBattles!--;
	}
}
