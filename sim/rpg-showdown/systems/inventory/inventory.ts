import { RPGBagSystem, type RPGBagState } from "./bag";
import { RPGItemRegistry, RPGItems } from "./item-registry";

export const RPG_INVENTORY_VERSION = 1;
export const RPG_INVENTORY_EVENT_VERSION = 1;

export type RPGInventoryContext = 'battle' | 'world';
export type RPGInventoryEventType = 'reserved' | 'consumed' | 'released';
export type RPGInventoryTransactionStatus = RPGInventoryEventType;

export interface RPGInventoryEvent {
	version: number;
	eventId: string;
	actionId: string;
	type: RPGInventoryEventType;
	ownerId: string;
	itemId: string;
	quantity: number;
	context: RPGInventoryContext;
	reason: string;
	bagRevision: number;
}

export interface RPGInventoryTransaction {
	actionId: string;
	itemId: string;
	quantity: number;
	context: RPGInventoryContext;
	reason: string;
	status: RPGInventoryTransactionStatus;
	events: RPGInventoryEvent[];
}

export interface RPGInventoryState {
	version: number;
	bag: RPGBagState;
	transactions: RPGInventoryTransaction[];
}

export interface RPGInventoryReservationRequest {
	actionId: string;
	itemId: string;
	quantity?: number;
	context: RPGInventoryContext;
	reason: string;
}

export interface RPGInventoryUpdateResult {
	inventory: RPGInventoryState;
	event: RPGInventoryEvent;
	replayed: boolean;
}

export class RPGInventorySystem {
	static create(
		bag: RPGBagState,
		transactions: readonly RPGInventoryTransaction[] = [],
		registry: RPGItemRegistry = RPGItems
	): RPGInventoryState {
		const inventory: RPGInventoryState = {
			version: RPG_INVENTORY_VERSION,
			bag: structuredClone(bag),
			transactions: transactions.map(transaction => structuredClone(transaction)),
		};
		this.validate(inventory, registry);
		return inventory;
	}

	static migrate(value: unknown, registry: RPGItemRegistry = RPGItems): RPGInventoryState {
		if (!value || typeof value !== 'object') throw new Error('RPG inventory must be an object');
		const input = value as Partial<RPGInventoryState>;
		if (input.version !== undefined && input.version !== RPG_INVENTORY_VERSION) {
			throw new Error('Unsupported RPG inventory version: ' + String(input.version));
		}
		if (!input.bag) throw new Error('RPG inventory requires a Bag');
		const inventory: RPGInventoryState = {
			version: RPG_INVENTORY_VERSION,
			bag: RPGBagSystem.migrate(input.bag, registry),
			transactions: structuredClone(input.transactions || []),
		};
		this.validate(inventory, registry);
		return inventory;
	}

	static getReservedQuantity(inventory: RPGInventoryState, itemId: string): number {
		const id = RPGItemRegistry.normalizeId(itemId);
		return inventory.transactions
			.filter(transaction => transaction.itemId === id && transaction.status === 'reserved')
			.reduce((total, transaction) => total + transaction.quantity, 0);
	}

	static getAvailableQuantity(inventory: RPGInventoryState, itemId: string): number {
		return Math.max(
			0,
			RPGBagSystem.getQuantity(inventory.bag, itemId) - this.getReservedQuantity(inventory, itemId)
		);
	}

	static getEvents(inventory: RPGInventoryState): RPGInventoryEvent[] {
		return inventory.transactions.flatMap(transaction => structuredClone(transaction.events));
	}

	static reserve(
		inventory: RPGInventoryState,
		request: RPGInventoryReservationRequest,
		expectedRevision = inventory.bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGInventoryUpdateResult {
		this.validate(inventory, registry);
		const normalized = this.normalizeRequest(request, registry);
		const existing = this.find(inventory, normalized.actionId);
		if (existing) {
			this.assertSameAction(existing, normalized);
			return this.replay(inventory, existing, 'reserved');
		}
		if (expectedRevision !== inventory.bag.revision) throw new Error('RPG inventory revision conflict');
		const item = registry.require(normalized.itemId);
		if (!item.consumedOnUse) throw new Error('RPG item is not consumable: ' + item.id);
		if (normalized.context === 'battle' && !item.usableInBattle) {
			throw new Error('RPG item cannot be used in battle: ' + item.id);
		}
		if (this.getAvailableQuantity(inventory, item.id) < normalized.quantity) {
			throw new Error('Not enough available RPG item: ' + item.id);
		}

		const next = structuredClone(inventory);
		next.bag.revision++;
		const event = this.createEvent(next.bag, normalized, 'reserved');
		next.transactions.push({ ...normalized, status: 'reserved', events: [event] });
		return { inventory: next, event: structuredClone(event), replayed: false };
	}

	static commit(
		inventory: RPGInventoryState,
		actionId: string,
		expectedRevision = inventory.bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGInventoryUpdateResult {
		this.validate(inventory, registry);
		const transaction = this.requireTransaction(inventory, actionId);
		if (transaction.status === 'consumed') return this.replay(inventory, transaction, 'consumed');
		if (transaction.status === 'released') throw new Error('RPG inventory action was already released: ' + actionId);
		if (expectedRevision !== inventory.bag.revision) throw new Error('RPG inventory revision conflict');

		const next = structuredClone(inventory);
		const current = this.requireTransaction(next, actionId);
		const removed = RPGBagSystem.remove(next.bag, current.itemId, current.quantity, expectedRevision, registry);
		next.bag = removed.bag;
		current.status = 'consumed';
		const event = this.createEvent(next.bag, current, 'consumed');
		current.events.push(event);
		return { inventory: next, event: structuredClone(event), replayed: false };
	}

	static release(
		inventory: RPGInventoryState,
		actionId: string,
		expectedRevision = inventory.bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGInventoryUpdateResult {
		this.validate(inventory, registry);
		const transaction = this.requireTransaction(inventory, actionId);
		if (transaction.status === 'released') return this.replay(inventory, transaction, 'released');
		if (transaction.status === 'consumed') throw new Error('RPG inventory action was already consumed: ' + actionId);
		if (expectedRevision !== inventory.bag.revision) throw new Error('RPG inventory revision conflict');

		const next = structuredClone(inventory);
		const current = this.requireTransaction(next, actionId);
		next.bag.revision++;
		current.status = 'released';
		const event = this.createEvent(next.bag, current, 'released');
		current.events.push(event);
		return { inventory: next, event: structuredClone(event), replayed: false };
	}

	private static normalizeRequest(
		request: RPGInventoryReservationRequest,
		registry: RPGItemRegistry
	): Omit<RPGInventoryTransaction, 'status' | 'events'> {
		if (!request || typeof request !== 'object') throw new Error('RPG inventory reservation requires a request');
		if (typeof request.actionId !== 'string' || !request.actionId.trim()) {
			throw new Error('RPG inventory reservation requires actionId');
		}
		if (request.context !== 'battle' && request.context !== 'world') {
			throw new Error('Invalid RPG inventory context');
		}
		if (typeof request.reason !== 'string' || !request.reason.trim()) {
			throw new Error('RPG inventory reservation requires a reason');
		}
		const quantity = request.quantity ?? 1;
		if (!Number.isSafeInteger(quantity) || quantity < 1) {
			throw new Error('RPG inventory reservation quantity must be a positive integer');
		}
		return {
			actionId: request.actionId.trim(),
			itemId: registry.require(request.itemId).id,
			quantity,
			context: request.context,
			reason: request.reason.trim(),
		};
	}

	private static createEvent(
		bag: RPGBagState,
		action: Omit<RPGInventoryTransaction, 'status' | 'events'>,
		type: RPGInventoryEventType
	): RPGInventoryEvent {
		return {
			version: RPG_INVENTORY_EVENT_VERSION,
			eventId: action.actionId + ':' + type,
			actionId: action.actionId,
			type,
			ownerId: bag.ownerId,
			itemId: action.itemId,
			quantity: action.quantity,
			context: action.context,
			reason: action.reason,
			bagRevision: bag.revision,
		};
	}

	private static find(inventory: RPGInventoryState, actionId: string): RPGInventoryTransaction | undefined {
		return inventory.transactions.find(transaction => transaction.actionId === actionId);
	}

	private static requireTransaction(inventory: RPGInventoryState, actionId: string): RPGInventoryTransaction {
		if (typeof actionId !== 'string' || !actionId.trim()) throw new Error('RPG inventory action requires actionId');
		const transaction = this.find(inventory, actionId.trim());
		if (!transaction) throw new Error('Unknown RPG inventory action: ' + actionId);
		return transaction;
	}

	private static assertSameAction(
		transaction: RPGInventoryTransaction,
		request: Omit<RPGInventoryTransaction, 'status' | 'events'>
	): void {
		if (
			transaction.itemId !== request.itemId ||
			transaction.quantity !== request.quantity ||
			transaction.context !== request.context ||
			transaction.reason !== request.reason
		) {
			throw new Error('RPG inventory actionId conflict: ' + request.actionId);
		}
	}

	private static replay(
		inventory: RPGInventoryState,
		transaction: RPGInventoryTransaction,
		type: RPGInventoryEventType
	): RPGInventoryUpdateResult {
		const event = transaction.events.find(entry => entry.type === type);
		if (!event) throw new Error('RPG inventory action has no ' + type + ' event: ' + transaction.actionId);
		return {
			inventory: structuredClone(inventory),
			event: structuredClone(event),
			replayed: true,
		};
	}

	private static validate(inventory: RPGInventoryState, registry: RPGItemRegistry = RPGItems): void {
		if (inventory.version !== RPG_INVENTORY_VERSION) {
			throw new Error('Unsupported RPG inventory version: ' + String(inventory.version));
		}
		RPGBagSystem.apply(inventory.bag, [], inventory.bag.revision, registry);
		if (!Array.isArray(inventory.transactions)) throw new Error('RPG inventory requires transactions');
		const actionIds = new Set<string>();
		for (const transaction of inventory.transactions) {
			if (typeof transaction.actionId !== 'string' || !transaction.actionId.trim() ||
				actionIds.has(transaction.actionId)) {
				throw new Error('Invalid or duplicated RPG inventory actionId');
			}
			const item = registry.require(transaction.itemId);
			if (transaction.itemId !== item.id) throw new Error('Invalid RPG inventory item id: ' + transaction.itemId);
			if (!Number.isSafeInteger(transaction.quantity) || transaction.quantity < 1) {
				throw new Error('Invalid RPG inventory transaction quantity');
			}
			if (transaction.context !== 'battle' && transaction.context !== 'world') {
				throw new Error('Invalid RPG inventory transaction context');
			}
			if (typeof transaction.reason !== 'string' || !transaction.reason.trim()) {
				throw new Error('Invalid RPG inventory transaction reason');
			}
			if (!['reserved', 'consumed', 'released'].includes(transaction.status)) {
				throw new Error('Invalid RPG inventory transaction status');
			}
			if (!Array.isArray(transaction.events) || !transaction.events.length) {
				throw new Error('RPG inventory transaction requires events');
			}
			for (const event of transaction.events) this.validateEvent(inventory.bag, transaction, event);
			if (!transaction.events.some(event => event.type === transaction.status)) {
				throw new Error('RPG inventory transaction status has no matching event');
			}
			actionIds.add(transaction.actionId);
		}
		for (const item of inventory.bag.items) {
			if (this.getReservedQuantity(inventory, item.itemId) > item.quantity) {
				throw new Error('RPG inventory reservations exceed item quantity: ' + item.itemId);
			}
		}
	}

	private static validateEvent(
		bag: RPGBagState,
		transaction: RPGInventoryTransaction,
		event: RPGInventoryEvent
	): void {
		if (event.version !== RPG_INVENTORY_EVENT_VERSION ||
			event.eventId !== event.actionId + ':' + event.type ||
			event.actionId !== transaction.actionId ||
			event.ownerId !== bag.ownerId ||
			event.itemId !== transaction.itemId ||
			event.quantity !== transaction.quantity ||
			event.context !== transaction.context ||
			event.reason !== transaction.reason ||
			!Number.isSafeInteger(event.bagRevision) || event.bagRevision < 0 ||
			!['reserved', 'consumed', 'released'].includes(event.type)) {
			throw new Error('Invalid RPG inventory event: ' + transaction.actionId);
		}
	}
}
