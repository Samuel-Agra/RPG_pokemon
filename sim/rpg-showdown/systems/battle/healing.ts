import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type {
	RPGHealingOrigin,
	RPGHealingResult,
	RPGPokemonState,
} from "../../state";

export interface RPGHPHealing {
	full?: boolean;
	amount?: number;
	fraction?: number;
}

export interface RPGPPHealing {
	full?: boolean;
	amount?: number;
	/** Índice do golpe; omitido restaura todos os golpes. */
	move?: number;
}

export interface RPGHealingRequest {
	origin: RPGHealingOrigin;
	hp?: RPGHPHealing;
	pp?: RPGPPHealing;
	cureStatus?: boolean;
}

export interface RPGStateHealingResult {
	success: boolean;
	changed: boolean;
	reason?: 'fainted' | 'invalid-max-hp';
	previousState: RPGPokemonState;
	state: RPGPokemonState;
}

export class HealingSystem {
	private static readonly results = new WeakMap<Battle, RPGHealingResult[]>();

	static heal(pokemon: Pokemon, request: RPGHealingRequest): RPGHealingResult {
		const invalidReason = this.getInvalidReason(pokemon);
		if (invalidReason) return this.failure(pokemon, request.origin, invalidReason);

		const previousHP = pokemon.hp;
		const previousPP = pokemon.baseMoveSlots.map(slot => slot.pp);
		const previousStatus = pokemon.status;
		this.restoreHP(pokemon, request.hp);
		this.restorePP(pokemon, request.pp);
		if (request.cureStatus && pokemon.status) pokemon.clearStatus();
		this.synchronize(pokemon);

		const result: RPGHealingResult = {
			success: true,
			changed: previousHP !== pokemon.hp || previousStatus !== pokemon.status ||
				previousPP.some((pp, index) => pp !== pokemon.baseMoveSlots[index].pp),
			origin: request.origin,
			side: pokemon.side.id,
			position: pokemon.position,
			species: pokemon.species.id,
			previousHP,
			hp: pokemon.hp,
			maxHP: pokemon.maxhp,
			previousPP,
			pp: pokemon.baseMoveSlots.map(slot => slot.pp),
			previousStatus,
			status: pokemon.status,
			state: structuredClone(pokemon.rpg),
		};
		const results = this.results.get(pokemon.battle) || [];
		results.push(result);
		this.results.set(pokemon.battle, results);
		return structuredClone(result);
	}

	static partialHP(pokemon: Pokemon, amount: number, origin: RPGHealingOrigin = 'item'): RPGHealingResult {
		return this.heal(pokemon, { origin, hp: { amount } });
	}

	static full(pokemon: Pokemon, origin: RPGHealingOrigin = 'external'): RPGHealingResult {
		return this.heal(pokemon, {
			origin, hp: { full: true }, pp: { full: true }, cureStatus: true,
		});
	}

	static pokemonCenter(pokemon: Pokemon): RPGHealingResult {
		return this.full(pokemon, 'pokemon-center');
	}

	static pokemonCenterState(
		state: RPGPokemonState,
		maxHP: number,
		maxPP: readonly number[]
	): RPGPokemonState {
		return {
			...structuredClone(state),
			hp: Math.max(1, Math.trunc(maxHP)),
			pp: maxPP.map(pp => Math.max(0, Math.trunc(pp))),
			status: '',
			sleepTurns: undefined,
		};
	}

	static healState(
		state: RPGPokemonState,
		maxHP: number,
		maxPP: readonly number[],
		request: RPGHealingRequest
	): RPGStateHealingResult {
		const previousState = structuredClone(state);
		const safeMaxHP = Math.trunc(maxHP);
		if (!Number.isSafeInteger(safeMaxHP) || safeMaxHP < 1) {
			return { success: false, changed: false, reason: 'invalid-max-hp', previousState, state: previousState };
		}
		const currentHP = Math.max(0, Math.min(safeMaxHP, Math.trunc(state.hp ?? safeMaxHP)));
		if (currentHP <= 0) {
			return { success: false, changed: false, reason: 'fainted', previousState, state: previousState };
		}
		const next = structuredClone(state);
		let hp = currentHP;
		if (request.hp?.full) {
			hp = safeMaxHP;
		} else if (request.hp?.amount !== undefined && Number.isFinite(request.hp.amount)) {
			hp = Math.min(safeMaxHP, hp + Math.max(0, Math.trunc(request.hp.amount)));
		} else if (request.hp?.fraction !== undefined && Number.isFinite(request.hp.fraction)) {
			hp = Math.min(safeMaxHP, hp + Math.max(0, Math.floor(safeMaxHP * request.hp.fraction)));
		}
		next.hp = hp;

		const maximumPP = maxPP.map(value => Math.max(0, Math.trunc(value)));
		const pp = maximumPP.map((maximum, index) =>
			Math.max(0, Math.min(maximum, Math.trunc(state.pp?.[index] ?? maximum)))
		);
		const previousPP = [...pp];
		if (request.pp) {
			const indexes = request.pp.move === undefined ?
				pp.map((value, index) => index) : [Math.trunc(request.pp.move)];
			for (const index of indexes) {
				if (pp[index] === undefined) continue;
				if (request.pp.full) {
					pp[index] = maximumPP[index];
				} else if (Number.isFinite(request.pp.amount)) {
					pp[index] = Math.min(maximumPP[index], pp[index] + Math.max(0, Math.trunc(request.pp.amount!)));
				}
			}
		}
		next.pp = pp;
		if (request.cureStatus) {
			next.status = '';
			next.sleepTurns = undefined;
		}
		const changed = hp !== currentHP || pp.some((value, index) => value !== previousPP[index]) ||
			(!!request.cureStatus && !!state.status);
		return { success: true, changed, previousState, state: changed ? next : previousState };
	}

	static getResults(battle: Battle): RPGHealingResult[] {
		return structuredClone(this.results.get(battle) || []);
	}

	static clear(battle: Battle): void {
		this.results.delete(battle);
	}

	private static restoreHP(pokemon: Pokemon, healing: RPGHPHealing | undefined): void {
		if (!healing) return;
		let amount = 0;
		if (healing.full) {
			amount = pokemon.maxhp - pokemon.hp;
		} else if (healing.amount !== undefined && Number.isFinite(healing.amount)) {
			amount = Math.max(0, Math.trunc(healing.amount));
		} else if (healing.fraction !== undefined && Number.isFinite(healing.fraction)) {
			amount = Math.max(0, Math.floor(pokemon.maxhp * healing.fraction));
		}
		pokemon.hp = pokemon.battle.clampIntRange(pokemon.hp + amount, 1, pokemon.maxhp);
	}

	private static restorePP(pokemon: Pokemon, healing: RPGPPHealing | undefined): void {
		if (!healing) return;
		const indexes = healing.move === undefined ?
			pokemon.baseMoveSlots.map((slot, index) => index) : [Math.trunc(healing.move)];
		for (const index of indexes) {
			const baseSlot = pokemon.baseMoveSlots[index];
			if (!baseSlot) continue;
			const amount = healing.full ? baseSlot.maxpp - baseSlot.pp :
				Number.isFinite(healing.amount) ? Math.max(0, Math.trunc(healing.amount!)) : 0;
			baseSlot.pp = pokemon.battle.clampIntRange(baseSlot.pp + amount, 0, baseSlot.maxpp);
			const activeSlot = pokemon.moveSlots[index];
			if (activeSlot?.id === baseSlot.id) activeSlot.pp = baseSlot.pp;
		}
	}

	private static synchronize(pokemon: Pokemon): void {
		pokemon.rpg.hp = pokemon.hp;
		pokemon.rpg.pp = pokemon.baseMoveSlots.map(slot => slot.pp);
		pokemon.rpg.status = pokemon.status;
		pokemon.rpg.sleepTurns = pokemon.status === 'slp' && typeof pokemon.statusState.time === 'number' ?
			pokemon.statusState.time : undefined;
	}

	private static getInvalidReason(pokemon: Pokemon): RPGHealingResult['reason'] | undefined {
		if (pokemon.set.rpg === undefined) return 'not-rpg-pokemon';
		if (pokemon.battle.ended) return 'battle-ended';
		if (pokemon.fainted || pokemon.hp <= 0) return 'fainted';
		return undefined;
	}

	private static failure(
		pokemon: Pokemon,
		origin: RPGHealingOrigin,
		reason: RPGHealingResult['reason']
	): RPGHealingResult {
		const pp = pokemon.baseMoveSlots.map(slot => slot.pp);
		return {
			success: false, changed: false, reason, origin,
			side: pokemon.side.id, position: pokemon.position, species: pokemon.species.id,
			previousHP: pokemon.hp, hp: pokemon.hp, maxHP: pokemon.maxhp,
			previousPP: pp, pp: [...pp], previousStatus: pokemon.status, status: pokemon.status,
			state: structuredClone(pokemon.rpg),
		};
	}
}
