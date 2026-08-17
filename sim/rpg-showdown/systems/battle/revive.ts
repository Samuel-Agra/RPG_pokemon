import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type { RPGPokemonState, RPGReviveResult } from "../../state";

export interface RPGReviveOptions {
	/** Quantidade exata de HP; tem prioridade sobre fraction. */
	hp?: number;
	/** Fração do HP máximo; padrão 0.5. */
	fraction?: number;
}

export interface RPGStateReviveResult {
	success: boolean;
	changed: boolean;
	reason?: 'invalid-max-hp' | 'not-fainted';
	previousHP: number;
	restoredHP: number;
	maxHP: number;
	clearedStatus: boolean;
	previousState: RPGPokemonState;
	state: RPGPokemonState;
}

export class ReviveSystem {
	private static readonly results = new WeakMap<Battle, RPGReviveResult[]>();

	static revive(pokemon: Pokemon, options: RPGReviveOptions = {}): RPGReviveResult {
		const invalidReason = this.getInvalidReason(pokemon);
		if (invalidReason) return this.failure(pokemon, invalidReason);

		const restoredHP = this.getRestoredHP(pokemon, options);
		const previousStatus = pokemon.status;
		pokemon.side.pokemonLeft++;
		pokemon.fainted = false;
		pokemon.faintQueued = false;
		pokemon.subFainted = false;
		pokemon.status = '';
		pokemon.rpg.status = '';
		pokemon.rpg.sleepTurns = undefined;
		pokemon.hp = 1;
		pokemon.sethp(restoredHP);
		pokemon.rpg.hp = pokemon.hp;

		const result: RPGReviveResult = {
			success: true,
			side: pokemon.side.id,
			position: pokemon.position,
			species: pokemon.species.id,
			previousHP: 0,
			restoredHP: pokemon.hp,
			maxHP: pokemon.maxhp,
			clearedStatus: !!previousStatus,
			state: structuredClone(pokemon.rpg),
		};
		const results = this.results.get(pokemon.battle) || [];
		results.push(result);
		this.results.set(pokemon.battle, results);
		return structuredClone(result);
	}

	static reviveState(
		state: RPGPokemonState,
		maxHP: number,
		options: RPGReviveOptions = {}
	): RPGStateReviveResult {
		const previousState = structuredClone(state);
		const safeMaxHP = Math.trunc(maxHP);
		if (!Number.isSafeInteger(safeMaxHP) || safeMaxHP < 1) {
			return {
				success: false, changed: false, reason: 'invalid-max-hp',
				previousHP: Math.trunc(state.hp ?? 0), restoredHP: Math.trunc(state.hp ?? 0),
				maxHP: safeMaxHP, clearedStatus: false, previousState, state: previousState,
			};
		}
		const previousHP = Math.max(0, Math.min(safeMaxHP, Math.trunc(state.hp ?? safeMaxHP)));
		if (previousHP > 0) {
			return {
				success: false, changed: false, reason: 'not-fainted',
				previousHP, restoredHP: previousHP, maxHP: safeMaxHP,
				clearedStatus: false, previousState, state: previousState,
			};
		}
		let restoredHP = 0;
		if (options.hp !== undefined && Number.isFinite(options.hp)) {
			restoredHP = Math.max(1, Math.min(safeMaxHP, Math.trunc(options.hp)));
		} else {
			const fraction = options.fraction === undefined || !Number.isFinite(options.fraction) ?
				0.5 : Math.max(0, Math.min(1, options.fraction));
			restoredHP = Math.max(1, Math.floor(safeMaxHP * fraction));
		}
		const next: RPGPokemonState = {
			...structuredClone(state),
			hp: restoredHP,
			status: '',
			sleepTurns: undefined,
		};
		return {
			success: true, changed: true, previousHP, restoredHP, maxHP: safeMaxHP,
			clearedStatus: !!state.status, previousState, state: next,
		};
	}

	static getResults(battle: Battle): RPGReviveResult[] {
		return structuredClone(this.results.get(battle) || []);
	}

	static clear(battle: Battle): void {
		this.results.delete(battle);
	}

	private static getRestoredHP(pokemon: Pokemon, options: RPGReviveOptions): number {
		if (options.hp !== undefined && Number.isFinite(options.hp)) {
			return pokemon.battle.clampIntRange(options.hp, 1, pokemon.maxhp);
		}
		const fraction = options.fraction === undefined || !Number.isFinite(options.fraction) ?
			0.5 : Math.max(0, Math.min(1, options.fraction));
		return Math.max(1, Math.floor(pokemon.maxhp * fraction));
	}

	private static getInvalidReason(pokemon: Pokemon): RPGReviveResult['reason'] | undefined {
		if (pokemon.set.rpg === undefined) return 'not-rpg-pokemon';
		if (pokemon.battle.ended) return 'battle-ended';
		if (!pokemon.fainted && pokemon.hp > 0) return 'not-fainted';
		return undefined;
	}

	private static failure(pokemon: Pokemon, reason: RPGReviveResult['reason']): RPGReviveResult {
		return {
			success: false, reason,
			side: pokemon.side.id, position: pokemon.position, species: pokemon.species.id,
			previousHP: pokemon.hp, restoredHP: pokemon.hp, maxHP: pokemon.maxhp,
			clearedStatus: false, state: structuredClone(pokemon.rpg),
		};
	}
}
