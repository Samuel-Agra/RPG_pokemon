import type { Pokemon } from "../pokemon";
import type { Battle } from "../battle";

import { BattleEndedEvent } from "./events/battle-ended";
import { BattleStartedEvent } from "./events/battle-started";
import { PokemonCreatedEvent } from "./events/pokemon-created";
import { PokemonFaintedEvent } from "./events/pokemon-fainted";
import { PokemonSwitchInEvent } from "./events/pokemon-switch-in";
import { PokemonSwitchOutEvent } from "./events/pokemon-switch-out";
import { CaptureSystem } from "./systems/battle/capture";
import { EVSystem } from "./systems/battle/ev";
import { ExperienceDistributionSystem } from "./systems/battle/experience-distribution";
import { FleeSystem } from "./systems/battle/flee";
import { FriendshipSystem } from "./systems/battle/friendship";
import { HealingSystem } from "./systems/battle/healing";
import { RPGMegaEvolutionSystem } from "./systems/battle/mega-evolution";
import { ParticipationSystem } from "./systems/battle/participation";
import { ReviveSystem } from "./systems/battle/revive";
import { WildEncounterSystem } from "./systems/battle/wild-encounter";
import { RPGLogger } from "./logger";
import { RPGStateCodec } from "./systems/state-codec";

export class RPGManager {
	private static readonly startedBattles = new WeakSet<Battle>();
	private static readonly queuedBattleActionHandlers = new WeakMap<
		Battle, (pokemon: Pokemon, actionId: string) => void
	>();

	private static isRPGPokemon(pokemon: Pokemon): boolean {
		return pokemon.set.rpg !== undefined;
	}

	static onPokemonSetInitialized(pokemon: Pokemon): void {
		EVSystem.distributeWild(pokemon);
		WildEncounterSystem.applyLegendaryLevel(pokemon);
	}

	static onPokemonCreated(pokemon: Pokemon): void {
		if (!this.isRPGPokemon(pokemon)) return;

		pokemon.battle.rpg = RPGStateCodec.migrateBattle(pokemon.battle.rpg);
		pokemon.rpg = RPGStateCodec.migratePokemon(pokemon.rpg);
		RPGLogger.debug('Pokemon criado:', pokemon.name);
		PokemonCreatedEvent.execute(pokemon);
	}

	static onSwitchIn(pokemon: Pokemon): void {
		if (!pokemon.battle.rpg) return;

		if (!this.startedBattles.has(pokemon.battle)) {
			BattleStartedEvent.execute(pokemon.battle, pokemon);
			this.startedBattles.add(pokemon.battle);
		}
		ParticipationSystem.registerSwitchIn(pokemon);
		if (this.isRPGPokemon(pokemon)) PokemonSwitchInEvent.execute(pokemon);
	}

	static onSwitchOut(pokemon: Pokemon): void {
		if (!this.isRPGPokemon(pokemon)) return;
		PokemonSwitchOutEvent.execute(pokemon);
	}

	static onPokemonFainted(pokemon: Pokemon, source: Pokemon | null): void {
		if (!pokemon.battle.rpg) return;
		PokemonFaintedEvent.execute(pokemon, source);
	}

	static onMegaEvolution(pokemon: Pokemon): void {
		RPGMegaEvolutionSystem.record(pokemon);
	}

	static setQueuedBattleActionHandler(
		battle: Battle, handler: (pokemon: Pokemon, actionId: string) => void
	): void {
		this.queuedBattleActionHandlers.set(battle, handler);
	}

	static runQueuedBattleAction(battle: Battle, pokemon: Pokemon, actionId: string): void {
		const handler = this.queuedBattleActionHandlers.get(battle);
		if (!handler) throw new Error('RPG queued battle action handler is unavailable');
		handler(pokemon, actionId);
	}

	static onBattleEnd(battle: Battle): void {
		BattleEndedEvent.execute(battle);
		RPGMegaEvolutionSystem.restoreAtBattleEnd(battle);
		CaptureSystem.clear(battle);
		ExperienceDistributionSystem.clear(battle);
		FleeSystem.clear(battle);
		FriendshipSystem.clear(battle);
		HealingSystem.clear(battle);
		RPGMegaEvolutionSystem.clear(battle);
		ParticipationSystem.clear(battle);
		ReviveSystem.clear(battle);
		this.queuedBattleActionHandlers.delete(battle);
		this.startedBattles.delete(battle);
	}
}
