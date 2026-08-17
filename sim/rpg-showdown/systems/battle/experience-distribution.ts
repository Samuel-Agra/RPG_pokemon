import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type {
	RPGExperienceGainResult,
} from "../../state";
import {
	getExperienceForLevel,
	getLevelForExperience,
	getSpeciesExperience,
} from "../../data/experience";

import { ExperienceSystem } from "./experience";
import { LevelProgressionSystem } from "./level-progression";
import { ParticipationSystem } from "./participation";
import { RPGBattleRulesSystem } from "./rules";

interface PendingGain {
	pokemon: Pokemon;
	gained: number;
	participated: boolean;
	luckyEggApplied: boolean;
}

export class ExperienceDistributionSystem {
	private static readonly results = new WeakMap<Battle, RPGExperienceGainResult[]>();

	static apply(battle: Battle): void {
		this.results.set(battle, []);
		if (!battle.rpg || !battle.winner || battle.rpg.battleType === 'no-exp') return;
		if (battle.rpg.experienceRules?.enabled === false) return;

		const winner = battle.sides.find(side => side.name === battle.winner);
		if (!winner) return;
		const winnerSides = new Set([winner, winner.allySide].filter(Boolean));
		const recipients = [...winnerSides]
			.flatMap(side => side!.pokemon)
			.filter(pokemon => pokemon.set.rpg !== undefined && !pokemon.fainted && pokemon.level < 100);
		const battleMultiplier = this.safeMultiplier(RPGBattleRulesSystem.get(battle).experienceMultiplier) *
			this.safeMultiplier(battle.rpg.experienceRules?.multiplier);
		const pending = new Map<Pokemon, PendingGain>();

		for (const defeat of ParticipationSystem.getDefeats(battle)) {
			if (winnerSides.has(battle.sides[Number(defeat.side.slice(1)) - 1])) continue;
			const defeatedData = getSpeciesExperience(defeat.species);
			if (!defeatedData) continue;

			const participants = recipients.filter(pokemon =>
				defeat.participants.some(
					participant => participant.side === pokemon.side.id && participant.position === pokemon.position
				)
			);
			if (!participants.length) continue;

			for (const pokemon of participants) {
				const baseGain = ExperienceSystem.calculateBaseGain(
					defeatedData.baseExperience,
					defeat.level,
					pokemon.level
				);
				const luckyEggApplied = ExperienceSystem.hasLuckyEggBoost(pokemon);
				const gained = Math.floor(
					baseGain / participants.length * battleMultiplier * ExperienceSystem.getPokemonMultiplier(pokemon)
				);
				if (gained <= 0) continue;

				const current = pending.get(pokemon) || {
					pokemon,
					gained: 0,
					participated: false,
					luckyEggApplied: false,
				};
				current.gained += gained;
				current.participated = true;
				current.luckyEggApplied ||= luckyEggApplied;
				pending.set(pokemon, current);
			}
		}

		const results: RPGExperienceGainResult[] = [];
		for (const gain of pending.values()) {
			const speciesData = ExperienceSystem.getSpeciesData(gain.pokemon);
			if (!speciesData) continue;
			const previousLevel = gain.pokemon.rpg.level ?? gain.pokemon.level;
			const previousExperience = gain.pokemon.rpg.experience ??
				getExperienceForLevel(speciesData.growthRate, previousLevel);
			const maximumExperience = getExperienceForLevel(speciesData.growthRate, 100);
			const totalExperience = Math.min(maximumExperience, previousExperience + gain.gained);
			const gained = totalExperience - previousExperience;
			if (gained <= 0) continue;

			const level = Math.max(
				previousLevel,
				getLevelForExperience(speciesData.growthRate, totalExperience)
			);
			gain.pokemon.rpg.experience = totalExperience;
			gain.pokemon.rpg.level = level;
			if (gain.luckyEggApplied) ExperienceSystem.consumeLuckyEggBattle(gain.pokemon);
			results.push({
				side: gain.pokemon.side.id,
				position: gain.pokemon.position,
				participated: gain.participated,
				previousExperience,
				gained,
				totalExperience,
				previousLevel,
				level,
				learnedMoves: LevelProgressionSystem.getLearnedMoves(gain.pokemon, previousLevel, level),
				luckyEggApplied: gain.luckyEggApplied,
			});
		}
		results.sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position);
		this.results.set(battle, results);
	}

	static getResults(battle: Battle): RPGExperienceGainResult[] {
		return structuredClone(this.results.get(battle) || []);
	}

	static clear(battle: Battle): void {
		this.results.delete(battle);
	}

	private static safeMultiplier(multiplier: number | undefined): number {
		return multiplier === undefined || !Number.isFinite(multiplier) ? 1 : Math.max(0, multiplier);
	}
}
