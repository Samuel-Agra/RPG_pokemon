/** Reserva, aplica e confirma itens; ações inválidas liberam a reserva e reenvios não repetem o consumo. */
import type { Pokemon } from "../../../pokemon";
import type { RPGHealingResult, RPGPokemonState } from "../../state";
import { HealingSystem, type RPGHealingRequest } from "../battle/healing";
import { ReviveSystem } from "../battle/revive";
import { RPGBattleRulesSystem } from "../battle/rules";
import {
	RPGInventorySystem,
	type RPGInventoryEvent,
	type RPGInventoryState,
	type RPGInventoryTransaction,
} from "./inventory";
import { type RPGItemDefinition, type RPGItemRegistry, RPGItems } from "./item-registry";

export interface RPGItemUseRequest {
	actionId: string;
	itemId: string;
	move?: number;
	expectedRevision?: number;
}

export interface RPGWorldItemTarget {
	pokemonId: string;
	state: RPGPokemonState;
	maxHP: number;
	maxPP?: readonly number[];
}

export interface RPGWorldItemTargetResult {
	pokemonId: string;
	changed: boolean;
	reason?: string;
	previousState: RPGPokemonState;
	state: RPGPokemonState;
}

export interface RPGBattleItemUseResult {
	success: boolean;
	consumed: boolean;
	replayed: boolean;
	reason?: string;
	inventory: RPGInventoryState;
	event: RPGInventoryEvent;
	healing?: RPGHealingResult;
}

export interface RPGWorldItemUseResult {
	success: boolean;
	consumed: boolean;
	replayed: boolean;
	reason?: string;
	inventory: RPGInventoryState;
	event: RPGInventoryEvent;
	targets: RPGWorldItemTargetResult[];
}

export class RPGItemUseSystem {
	static useInBattle(
		inventory: RPGInventoryState,
		pokemon: Pokemon,
		request: RPGItemUseRequest,
		registry: RPGItemRegistry = RPGItems
	): RPGBattleItemUseResult {
		if (!RPGBattleRulesSystem.canUseBattleItems(pokemon.battle)) {
			throw new Error('RPG battle mode does not allow Bag items');
		}
		const reserved = RPGInventorySystem.reserve(inventory, {
			actionId: request.actionId,
			itemId: request.itemId,
			context: 'battle',
			reason: 'item-use:battle:' + pokemon.side.id + ':' + String(pokemon.position) +
				':move:' + this.moveKey(request.move),
		}, request.expectedRevision ?? inventory.bag.revision, registry);
		const transaction = this.getTransaction(reserved.inventory, request.actionId);
		const terminal = this.getBattleReplay(reserved.inventory, transaction);
		if (terminal) return terminal;

		const item = registry.require(request.itemId);
		const healingRequest = this.getHealingRequest(item, pokemon.status, request.move);
		if (!healingRequest) {
			return this.releaseBattle(reserved.inventory, request.actionId, 'unsupported-or-invalid-effect', registry);
		}
		const healing = HealingSystem.heal(pokemon, healingRequest);
		if (!healing.success || !healing.changed) {
			return this.releaseBattle(
				reserved.inventory,
				request.actionId,
				healing.reason || 'no-effect',
				registry,
				healing
			);
		}
		const committed = RPGInventorySystem.commit(
			reserved.inventory,
			request.actionId,
			reserved.inventory.bag.revision,
			registry
		);
		return {
			success: true,
			consumed: true,
			replayed: false,
			inventory: committed.inventory,
			event: committed.event,
			healing,
		};
	}

	static useOutsideBattle(
		inventory: RPGInventoryState,
		targets: readonly RPGWorldItemTarget[],
		request: RPGItemUseRequest,
		registry: RPGItemRegistry = RPGItems
	): RPGWorldItemUseResult {
		const targetIds = targets.map(target => {
			if (typeof target.pokemonId !== 'string' || !target.pokemonId.trim()) {
				throw new Error('RPG item target requires pokemonId');
			}
			return target.pokemonId.trim();
		});
		if (new Set(targetIds).size !== targetIds.length) {
			throw new Error('RPG item use cannot contain duplicated targets');
		}

		const reserved = RPGInventorySystem.reserve(inventory, {
			actionId: request.actionId,
			itemId: request.itemId,
			context: 'world',
			reason: 'item-use:world:' + JSON.stringify(targetIds) + ':move:' + this.moveKey(request.move),
		}, request.expectedRevision ?? inventory.bag.revision, registry);
		const transaction = this.getTransaction(reserved.inventory, request.actionId);
		const terminal = this.getWorldReplay(reserved.inventory, transaction);
		if (terminal) return terminal;

		const item = registry.require(request.itemId);
		const partyEffect = item.effect?.type === 'revive-party';
		if (!targets.length || (!partyEffect && targets.length !== 1)) {
			return this.releaseWorld(
				reserved.inventory, request.actionId, 'invalid-target-count', [], registry
			);
		}
		const results = targets.map(target => this.applyOutsideBattle(item, target, request.move));
		if (!results.some(result => result.changed)) {
			return this.releaseWorld(reserved.inventory, request.actionId, 'no-effect', results, registry);
		}
		const committed = RPGInventorySystem.commit(
			reserved.inventory,
			request.actionId,
			reserved.inventory.bag.revision,
			registry
		);
		return {
			success: true,
			consumed: true,
			replayed: false,
			inventory: committed.inventory,
			event: committed.event,
			targets: results,
		};
	}

	private static applyOutsideBattle(
		item: RPGItemDefinition,
		target: RPGWorldItemTarget,
		move: number | undefined
	): RPGWorldItemTargetResult {
		if (typeof target.pokemonId !== 'string' || !target.pokemonId.trim()) {
			throw new Error('RPG item target requires pokemonId');
		}
		const previousState = structuredClone(target.state);
		if (item.effect?.type === 'revive' || item.effect?.type === 'revive-party') {
			const result = ReviveSystem.reviveState(target.state, target.maxHP, {
				fraction: this.numberEffect(item, 'hpFraction'),
			});
			if (!result.changed) {
				return {
					pokemonId: target.pokemonId,
					changed: false,
					reason: result.reason,
					previousState,
					state: previousState,
				};
			}
			const state = structuredClone(result.state);
			const friendshipChange = this.numberEffect(item, 'friendshipChange');
			if (friendshipChange) {
				state.friendship = Math.max(0, Math.min(255, (state.friendship ?? 50) + friendshipChange));
			}
			return { pokemonId: target.pokemonId, changed: true, previousState, state };
		}

		const request = this.getHealingRequest(item, target.state.status || '', move);
		if (!request) {
			return {
				pokemonId: target.pokemonId,
				changed: false,
				reason: 'unsupported-or-invalid-effect',
				previousState,
				state: previousState,
			};
		}
		const result = HealingSystem.healState(target.state, target.maxHP, target.maxPP || [], request);
		return {
			pokemonId: target.pokemonId,
			changed: result.changed,
			reason: result.reason || (result.changed ? undefined : 'no-effect'),
			previousState,
			state: result.changed ? result.state : previousState,
		};
	}

	private static getHealingRequest(
		item: RPGItemDefinition,
		currentStatus: string,
		move: number | undefined
	): RPGHealingRequest | undefined {
		const effect = item.effect;
		if (!effect) return undefined;
		switch (effect.type) {
			case 'heal-hp':
				return {
					origin: 'item',
					hp: {
						full: effect.full === true,
						amount: this.numberEffect(item, 'amount'),
						fraction: this.numberEffect(item, 'fraction'),
					},
					cureStatus: effect.cureStatus === true,
				};
			case 'restore-pp': {
				const allMoves = effect.allMoves === true;
				if (!allMoves && (!Number.isSafeInteger(move) || move! < 0)) return undefined;
				return {
					origin: 'item',
					pp: {
						full: effect.full === true,
						amount: this.numberEffect(item, 'amount'),
						move: allMoves ? undefined : move,
					},
				};
			}
			case 'cure-status': {
				const statuses = Array.isArray(effect.statuses) ?
					effect.statuses.filter((status): status is string => typeof status === 'string') : undefined;
				return {
					origin: 'item',
					cureStatus: !!currentStatus && (!statuses || statuses.includes(currentStatus)),
				};
			}
			default:
				return undefined;
		}
	}

	private static moveKey(move: number | undefined): string {
		return move === undefined ? 'none' : String(move);
	}

	private static numberEffect(item: RPGItemDefinition, field: string): number | undefined {
		const value = item.effect?.[field];
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}

	private static getTransaction(inventory: RPGInventoryState, actionId: string): RPGInventoryTransaction {
		const transaction = inventory.transactions.find(entry => entry.actionId === actionId.trim());
		if (!transaction) throw new Error('RPG item use reservation was not created: ' + actionId);
		return transaction;
	}

	private static getBattleReplay(
		inventory: RPGInventoryState,
		transaction: RPGInventoryTransaction
	): RPGBattleItemUseResult | undefined {
		if (transaction.status === 'reserved') return undefined;
		const event = transaction.events.find(entry => entry.type === transaction.status)!;
		return {
			success: transaction.status === 'consumed',
			consumed: transaction.status === 'consumed',
			replayed: true,
			reason: transaction.status === 'released' ? 'previously-released' : undefined,
			inventory: structuredClone(inventory),
			event: structuredClone(event),
		};
	}

	private static getWorldReplay(
		inventory: RPGInventoryState,
		transaction: RPGInventoryTransaction
	): RPGWorldItemUseResult | undefined {
		if (transaction.status === 'reserved') return undefined;
		const event = transaction.events.find(entry => entry.type === transaction.status)!;
		return {
			success: transaction.status === 'consumed',
			consumed: transaction.status === 'consumed',
			replayed: true,
			reason: transaction.status === 'released' ? 'previously-released' : undefined,
			inventory: structuredClone(inventory),
			event: structuredClone(event),
			targets: [],
		};
	}

	private static releaseBattle(
		inventory: RPGInventoryState,
		actionId: string,
		reason: string,
		registry: RPGItemRegistry,
		healing?: RPGHealingResult
	): RPGBattleItemUseResult {
		const released = RPGInventorySystem.release(inventory, actionId, inventory.bag.revision, registry);
		return {
			success: false,
			consumed: false,
			replayed: false,
			reason,
			inventory: released.inventory,
			event: released.event,
			healing,
		};
	}

	private static releaseWorld(
		inventory: RPGInventoryState,
		actionId: string,
		reason: string,
		targets: RPGWorldItemTargetResult[],
		registry: RPGItemRegistry
	): RPGWorldItemUseResult {
		const released = RPGInventorySystem.release(inventory, actionId, inventory.bag.revision, registry);
		return {
			success: false,
			consumed: false,
			replayed: false,
			reason,
			inventory: released.inventory,
			event: released.event,
			targets,
		};
	}
}
