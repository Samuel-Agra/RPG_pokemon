import type { Battle } from "../../../battle";
import { toID } from "../../../dex-data";
import { getRPGPokemonSizeClass } from "../../data/pokemon-size";
import type {
	RPGBattleOutcome,
	RPGBattleResult,
	RPGPokemonState,
	RPGSideOutcome,
} from "../../state";

import { CaptureSystem } from "./capture";
import { ExperienceDistributionSystem } from "./experience-distribution";
import { FleeSystem } from "./flee";
import { FriendshipSystem } from "./friendship";
import { HealingSystem } from "./healing";
import { RPGMegaEvolutionSystem } from "./mega-evolution";
import { ParticipationSystem } from "./participation";
import { ReviveSystem } from "./revive";
import { RPGBattleRulesSystem } from "./rules";

export const RPG_BATTLE_RESULT_VERSION = 2;

export class BattleResultSystem {
	static save(battle: Battle): void {
		if (!battle.rpg) return;

		const winnerSide = battle.sides.find(side => side.name === battle.winner);
		const winnerSides = new Set(
			[winnerSide, winnerSide?.allySide].filter((side): side is NonNullable<typeof side> => !!side)
		);
		const rules = RPGBattleRulesSystem.get(battle);
		const flee = FleeSystem.getResult(battle);
		const capture = CaptureSystem.getResult(battle);
		const outcome: RPGBattleOutcome = capture?.success ? 'capture' :
			flee?.success ? 'flee' : battle.winner ? 'win' : 'tie';
		const loserSides = outcome === 'tie' ? [] : outcome === 'flee' ? [flee!.fleeingSide] :
			battle.sides.filter(side => !winnerSides.has(side)).map(side => side.id);
		const experience = ExperienceDistributionSystem.getResults(battle);
		const result: RPGBattleResult = {
			version: RPG_BATTLE_RESULT_VERSION,
			battleType: battle.rpg.battleType || 'wild',
			sideRoles: RPGBattleRulesSystem.getSideRoles(battle),
			rules: structuredClone(rules),
			outcome,
			winner: battle.winner || '',
			winnerSide: winnerSide?.id,
			loserSides,
			sides: battle.sides.map(side => ({
				side: side.id,
				name: side.name,
				outcome: this.getSideOutcome(side.id, outcome, winnerSides, loserSides, flee, capture),
			})),
			field: {
				weather: battle.rpg.weather || '',
				weatherDuration: battle.rpg.weatherDuration,
				terrain: battle.rpg.terrain || '',
				terrainDuration: battle.rpg.terrainDuration,
			},
			formChanges: RPGMegaEvolutionSystem.getResults(battle).map(change => ({ ...change, reverted: true })),
			flee,
			capture,
			revives: ReviveSystem.getResults(battle),
			healing: HealingSystem.getResults(battle),
			rewards: RPGBattleRulesSystem.getRewards(battle, outcome),
			pokemon: battle.getAllPokemon().map(pokemon => ({
				side: pokemon.side.id,
				position: pokemon.position,
				rpgEnabled: pokemon.set.rpg !== undefined,
				name: pokemon.name,
				species: pokemon.set.species || pokemon.set.name,
				level: pokemon.rpg.level ?? pokemon.level,
				gender: pokemon.gender,
				shiny: !!pokemon.set.shiny,
				ability: toID(pokemon.set.ability),
				nature: pokemon.set.nature,
				active: pokemon.isActive,
				fainted: pokemon.fainted,
				hp: pokemon.hp,
				maxHP: pokemon.maxhp,
				status: pokemon.status,
				item: pokemon.item,
				moves: pokemon.baseMoveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxPP: slot.maxpp })),
				evs: { ...pokemon.set.evs },
				ivs: { ...pokemon.set.ivs },
				state: this.getPokemonState(pokemon),
			})),
			defeats: ParticipationSystem.getDefeats(battle),
			experience,
			friendship: FriendshipSystem.getResults(battle),
			itemEvents: [],
			pokemonChanges: [],
			evolutions: this.getEvolutionCandidates(battle, experience),
		};
		battle.rpg.result = result;
	}

	private static getEvolutionCandidates(
		battle: Battle, experience: RPGBattleResult['experience']
	): RPGBattleResult['evolutions'] {
		const candidates: RPGBattleResult['evolutions'] = [];
		for (const gain of experience) {
			if (gain.level <= gain.previousLevel) continue;
			const side = battle.getSide(gain.side);
			const pokemon = side.pokemon.find(entry => entry.position === gain.position);
			if (!pokemon?.set.rpg) continue;
			const pending = [battle.dex.species.get(pokemon.set.species || pokemon.species.name)];
			const visited = new Set<string>();
			while (pending.length) {
				const species = pending.shift()!;
				if (!species.exists || visited.has(species.id)) continue;
				visited.add(species.id);
				for (const evolutionName of species.evos || []) {
					const evolution = battle.dex.species.get(evolutionName);
					if (!evolution.exists || !evolution.evoLevel || gain.level < evolution.evoLevel) continue;
					candidates.push({
						side: gain.side, position: gain.position, fromSpecies: species.name,
						toSpecies: evolution.name,
						fromSpriteId: species.spriteid, toSpriteId: evolution.spriteid,
						shiny: !!pokemon.set.shiny,
						fromSizeClass: getRPGPokemonSizeClass(species.heightm),
						toSizeClass: getRPGPokemonSizeClass(evolution.heightm), level: gain.level,
					});
					pending.push(evolution);
				}
			}
		}
		return candidates;
	}

	private static getPokemonState(pokemon: Battle['p1']['pokemon'][number]): RPGPokemonState {
		return {
			...structuredClone(pokemon.rpg),
			level: pokemon.rpg.level ?? pokemon.level,
			hp: pokemon.hp,
			status: pokemon.status,
			sleepTurns: pokemon.status === 'slp' && typeof pokemon.statusState.time === 'number' ?
				pokemon.statusState.time : undefined,
			pp: pokemon.baseMoveSlots.map(slot => slot.pp),
			item: pokemon.item,
			evs: { ...pokemon.set.evs },
		};
	}

	private static getSideOutcome(
		side: SideID,
		outcome: RPGBattleOutcome,
		winnerSides: Set<Battle['p1'] | undefined>,
		loserSides: SideID[],
		flee: ReturnType<typeof FleeSystem.getResult>,
		capture: ReturnType<typeof CaptureSystem.getResult>
	): RPGSideOutcome {
		if (outcome === 'tie') return 'tied';
		if (outcome === 'flee') return side === flee?.fleeingSide ? 'fled' : 'neutral';
		if (outcome === 'capture' && side === capture?.target.side) return 'captured';
		if ([...winnerSides].some(winner => winner?.id === side)) return 'winner';
		return loserSides.includes(side) ? 'loser' : 'neutral';
	}
}
