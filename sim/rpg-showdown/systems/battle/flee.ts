import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type { RPGFleeResult } from "../../state";

import { RPGBattleRulesSystem } from "./rules";

export interface RPGFleeOptions {
	guaranteed?: boolean;
}

export class FleeSystem {
	private static readonly attempts = new WeakMap<Battle, Map<SideID, number>>();
	private static readonly results = new WeakMap<Battle, RPGFleeResult>();

	static isAllowed(battle: Battle): boolean {
		return RPGBattleRulesSystem.canFlee(battle);
	}

	static attempt(pokemon: Pokemon, options: RPGFleeOptions = {}): RPGFleeResult {
		const battle = pokemon.battle;
		const invalidReason = this.getInvalidReason(pokemon);
		if (invalidReason) return this.failure(pokemon, invalidReason);

		const opponent = this.getOpponent(pokemon);
		if (!opponent) return this.failure(pokemon, 'no-opponent');
		const attempts = this.incrementAttempts(battle, pokemon.side.id);
		const playerSpeed = Math.max(1, pokemon.storedStats.spe);
		const opponentSpeed = Math.max(1, opponent.storedStats.spe);
		const guaranteedBy = this.getGuarantee(pokemon, opponent, options);
		const trapped = pokemon.trapped || pokemon.maybeTrapped;
		if (trapped && !guaranteedBy) {
			return this.createResult(pokemon, opponent, {
				allowed: false, success: false, continued: true, reason: 'trapped',
				attempts, playerSpeed, opponentSpeed, escapeValue: 0, probability: 0,
			});
		}

		const calculation = this.calculate(playerSpeed, opponentSpeed, attempts);
		const escapeValue = guaranteedBy ? 256 : calculation.escapeValue;
		const probability = guaranteedBy ? 1 : calculation.probability;
		const success = guaranteedBy !== undefined || battle.random(256) < escapeValue;
		const result = this.createResult(pokemon, opponent, {
			allowed: true, success, continued: !success, attempts,
			playerSpeed, opponentSpeed, escapeValue, probability, guaranteedBy,
		});
		if (!success) return result;

		this.results.set(battle, result);
		battle.tie();
		return structuredClone(result);
	}

	static calculate(playerSpeed: number, opponentSpeed: number, attempts: number): {
		escapeValue: number, probability: number,
	} {
		const player = Math.max(1, Math.trunc(playerSpeed));
		const opponent = Math.max(1, Math.trunc(opponentSpeed));
		if (player >= opponent) return { escapeValue: 256, probability: 1 };
		const escapeValue = Math.min(
			256,
			Math.floor(player * 128 / opponent) + 30 * Math.max(1, Math.trunc(attempts))
		);
		return { escapeValue, probability: escapeValue / 256 };
	}

	static getResult(battle: Battle): RPGFleeResult | undefined {
		const result = this.results.get(battle);
		return result && structuredClone(result);
	}

	static clear(battle: Battle): void {
		this.attempts.delete(battle);
		this.results.delete(battle);
	}

	private static getInvalidReason(pokemon: Pokemon): RPGFleeResult['reason'] | undefined {
		if (!pokemon.battle.rpg) return 'not-rpg-battle';
		if (!this.isAllowed(pokemon.battle)) return 'flee-disabled';
		if (pokemon.battle.ended) return 'battle-ended';
		if (pokemon.fainted || pokemon.hp <= 0) return 'fainted';
		if (!pokemon.isActive) return 'not-active';
		return undefined;
	}

	private static getOpponent(pokemon: Pokemon): Pokemon | undefined {
		const wildSide = pokemon.battle.rpg?.wildSide || 'p2';
		const candidates = pokemon.battle.rpg?.battleType === 'wild' ?
			pokemon.battle.sides.find(side => side.id === wildSide)?.active : pokemon.foes(true);
		return candidates?.filter(target => target && !target.fainted)
			.sort((a, b) => b.storedStats.spe - a.storedStats.spe)[0] || undefined;
	}

	private static getGuarantee(
		pokemon: Pokemon,
		opponent: Pokemon,
		options: RPGFleeOptions
	): RPGFleeResult['guaranteedBy'] | undefined {
		if (options.guaranteed) return 'external';
		if (pokemon.getAbility().id === 'runaway') return 'run-away';
		if (pokemon.item === 'smokeball') return 'smoke-ball';
		if (pokemon.hasType('Ghost')) return 'ghost-type';
		if (pokemon.storedStats.spe >= opponent.storedStats.spe) return 'speed';
		return undefined;
	}

	private static incrementAttempts(battle: Battle, side: SideID): number {
		let battleAttempts = this.attempts.get(battle);
		if (!battleAttempts) {
			battleAttempts = new Map();
			this.attempts.set(battle, battleAttempts);
		}
		const attempts = (battleAttempts.get(side) || 0) + 1;
		battleAttempts.set(side, attempts);
		return attempts;
	}

	private static failure(pokemon: Pokemon, reason: RPGFleeResult['reason']): RPGFleeResult {
		return {
			allowed: false, success: false, continued: !pokemon.battle.ended, reason,
			fleeingSide: pokemon.side.id, pokemon: {
				side: pokemon.side.id, position: pokemon.position, species: pokemon.species.id,
			},
			attempts: 0, playerSpeed: Math.max(1, pokemon.storedStats.spe),
			opponentSpeed: 0, escapeValue: 0, probability: 0,
		};
	}

	private static createResult(
		pokemon: Pokemon,
		opponent: Pokemon,
		data: Omit<RPGFleeResult, 'fleeingSide' | 'pokemon' | 'opponent'>
	): RPGFleeResult {
		return {
			...data,
			fleeingSide: pokemon.side.id,
			pokemon: { side: pokemon.side.id, position: pokemon.position, species: pokemon.species.id },
			opponent: { side: opponent.side.id, position: opponent.position, species: opponent.species.id },
		};
	}
}
