/** Estado puro da Bag; capacidade e quantidades são validadas por revisão antes de devolver uma nova versão. */
import { RPGItemRegistry, RPGItems } from "./item-registry";

export const RPG_BAG_VERSION = 5;

const REMOVED_TRAINING_ITEM_IDS = new Set([
	'trainingpass', 'sparringticket', 'agilitycoursepass', 'strategymanual',
]);

export type RPGBagTier = 'starter' | 'trainer' | 'adventurer' | 'expert' | 'master' | 'legendary';

export interface RPGBagTierDefinition {
	id: RPGBagTier;
	name: string;
	maxSlots: number;
	/** Pre?o acumulado para desbloquear este n?vel a partir da Bag inicial. */
	unlockPrice: number;
}

export const RPG_BAG_TIERS: Readonly<Record<RPGBagTier, RPGBagTierDefinition>> = Object.freeze({
	starter: { id: 'starter', name: 'Starter Bag', maxSlots: 10, unlockPrice: 0 },
	trainer: { id: 'trainer', name: 'Trainer Bag', maxSlots: 20, unlockPrice: 10000 },
	adventurer: { id: 'adventurer', name: 'Adventurer Bag', maxSlots: 30, unlockPrice: 30000 },
	expert: { id: 'expert', name: 'Expert Bag', maxSlots: 40, unlockPrice: 70000 },
	master: { id: 'master', name: 'Master Bag', maxSlots: 50, unlockPrice: 140000 },
	legendary: { id: 'legendary', name: 'Legendary Bag', maxSlots: 60, unlockPrice: 260000 },
});

export interface RPGBagEntry {
	itemId: string;
	quantity: number;
}

export interface RPGBagState {
	version: number;
	ownerId: string;
	revision: number;
	/** Todos os tipos guardados contam uma vaga: bolas, TMs, equipáveis, itens-chave etc. */
	/** Ausente significa sem limite de tipos diferentes. */
	maxSlots?: number;
	items: RPGBagEntry[];
	/** IDs favoritos que ainda possuem quantidade na Bag. */
	favorites: string[];
	/** IDs mantidos por compatibilidade e derivados das quantidades de missão. */
	missionItems: string[];
	/** Quantidade de cada pilha reservada para a categoria Itens de Missão. */
	missionQuantities: Record<string, number>;
	/** Anotação opcional associada à pilha exibida em Itens de Missão. */
	missionNotes: Record<string, string>;
}

export type RPGBagOperation = { type: 'add', itemId: string, quantity: number } |
	{ type: 'remove', itemId: string, quantity: number } |
	{ type: 'set', itemId: string, quantity: number };

export interface RPGBagChange {
	itemId: string;
	previousQuantity: number;
	quantity: number;
}

export interface RPGBagUpdateResult {
	bag: RPGBagState;
	changes: RPGBagChange[];
}

export interface RPGBagCapacity {
	usedSlots: number;
	maxSlots?: number;
	freeSlots?: number;
	full: boolean;
}

export class RPGBagSystem {
	static create(
		ownerId: string,
		items: readonly RPGBagEntry[] = [],
		options: {
			revision?: number, maxSlots?: number, favorites?: readonly string[],
			missionItems?: readonly string[], missionQuantities?: Readonly<Record<string, number>>,
			missionNotes?: Readonly<Record<string, string>>,
			registry?: RPGItemRegistry,
		} = {}
	): RPGBagState {
		if (typeof ownerId !== 'string' || !ownerId.trim()) throw new Error('RPG Bag requires ownerId');
		const revision = options.revision ?? 0;
		if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('RPG Bag revision must be a non-negative integer');
		if (options.maxSlots !== undefined && (!Number.isSafeInteger(options.maxSlots) || options.maxSlots < 1)) {
			throw new Error('RPG Bag maxSlots must be a positive integer');
		}
		const normalizedIds = items.map(item => RPGItemRegistry.normalizeId(item.itemId));
		if (new Set(normalizedIds).size !== normalizedIds.length) throw new Error('RPG Bag cannot contain duplicated items');
		const bag: RPGBagState = {
			version: RPG_BAG_VERSION,
			ownerId: ownerId.trim(),
			revision,
			maxSlots: options.maxSlots,
			items: [],
			favorites: [],
			missionItems: [],
			missionQuantities: {},
			missionNotes: {},
		};
		const populated = items.length ?
			this.apply(bag, items.map(item => ({ type: 'add', ...item })), revision, options.registry, false).bag : bag;
		const favorites = [...new Set((options.favorites || []).map(item => RPGItemRegistry.normalizeId(item)))]
			.filter(itemId => this.getQuantity(populated, itemId) > 0);
		for (const itemId of favorites) (options.registry || RPGItems).require(itemId);
		const missionQuantities: Record<string, number> = {};
		for (const [rawId, rawQuantity] of Object.entries(options.missionQuantities || {})) {
			const itemId = RPGItemRegistry.normalizeId(rawId);
			const total = this.getQuantity(populated, itemId);
			if (!total) continue;
			(options.registry || RPGItems).require(itemId);
			if (!Number.isSafeInteger(rawQuantity) || rawQuantity < 1 || rawQuantity > total) {
				throw new Error('Invalid RPG Bag mission quantity: ' + itemId);
			}
			missionQuantities[itemId] = rawQuantity;
		}
		for (const itemId of [...new Set((options.missionItems || []).map(item => RPGItemRegistry.normalizeId(item)))]) {
			const total = this.getQuantity(populated, itemId);
			if (!total || missionQuantities[itemId]) continue;
			(options.registry || RPGItems).require(itemId);
			missionQuantities[itemId] = total;
		}
		const missionItems = Object.keys(missionQuantities);
		const missionNotes: Record<string, string> = {};
		for (const [rawId, rawNote] of Object.entries(options.missionNotes || {})) {
			const itemId = RPGItemRegistry.normalizeId(rawId);
			const item = (options.registry || RPGItems).require(itemId);
			const note = this.normalizeMissionNote(rawNote);
			if (!note || !this.getQuantity(populated, itemId) ||
				(!missionQuantities[itemId] && !item.tags?.includes('mission'))) continue;
			missionNotes[itemId] = note;
		}
		return {
			...populated, favorites: favorites.filter(id => !missionQuantities[id]),
			missionItems, missionQuantities, missionNotes,
		};
	}

	static createForTier(
		ownerId: string,
		tier: RPGBagTier = 'starter',
		items: readonly RPGBagEntry[] = [],
		options: { revision?: number, registry?: RPGItemRegistry } = {}
	): RPGBagState {
		const definition = this.getTierDefinition(tier);
		return this.create(ownerId, items, { ...options, maxSlots: definition.maxSlots });
	}

	static getTierDefinition(tier: RPGBagTier): RPGBagTierDefinition {
		const definition = RPG_BAG_TIERS[tier];
		if (!definition) throw new Error('Unknown RPG Bag tier: ' + String(tier));
		return structuredClone(definition);
	}

	static getTier(bag: RPGBagState): RPGBagTier | undefined {
		return Object.values(RPG_BAG_TIERS)
			.find(definition => definition.maxSlots === bag.maxSlots)?.id;
	}

	static upgradeToTier(
		bag: RPGBagState,
		targetTier: RPGBagTier,
		expectedRevision = bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGBagState {
		const checked = this.migrate(bag, registry);
		if (checked.revision !== expectedRevision) throw new Error('RPG Bag revision conflict');
		const currentTier = this.getTier(checked);
		if (!currentTier) throw new Error('RPG Bag must use a priced tier before it can be upgraded');
		const current = this.getTierDefinition(currentTier);
		const target = this.getTierDefinition(targetTier);
		if (target.maxSlots <= current.maxSlots) throw new Error('RPG Bag upgrade must increase capacity');
		return {
			...checked,
			revision: checked.revision + 1,
			maxSlots: target.maxSlots,
		};
	}
	static migrate(value: unknown, registry: RPGItemRegistry = RPGItems): RPGBagState {
		if (!value || typeof value !== 'object') throw new Error('RPG Bag must be an object');
		const input = value as Partial<RPGBagState>;
		if (input.version !== undefined && input.version !== 1 && input.version !== 2 &&
			input.version !== 3 && input.version !== 4 && input.version !== RPG_BAG_VERSION) {
			throw new Error('Unsupported RPG Bag version: ' + String(input.version));
		}
		if (!Array.isArray(input.items)) throw new Error('RPG Bag requires an items array');
		const items = input.items.filter(entry =>
			!REMOVED_TRAINING_ITEM_IDS.has(RPGItemRegistry.normalizeId(entry.itemId))
		);
		return this.create(input.ownerId || '', items, {
			revision: input.revision ?? 0,
			maxSlots: input.maxSlots,
			favorites: input.favorites,
			missionItems: input.missionItems,
			missionQuantities: input.missionQuantities,
			missionNotes: input.missionNotes,
			registry,
		});
	}

	/** Cada itemId presente usa exatamente uma vaga, independentemente da quantidade ou categoria. */
	static getUsedSlots(bag: RPGBagState): number {
		return bag.items.length;
	}

	static getFreeSlots(bag: RPGBagState): number | undefined {
		if (bag.maxSlots === undefined) return undefined;
		return Math.max(0, bag.maxSlots - this.getUsedSlots(bag));
	}

	static getCapacity(bag: RPGBagState): RPGBagCapacity {
		const usedSlots = this.getUsedSlots(bag);
		const freeSlots = this.getFreeSlots(bag);
		return {
			usedSlots,
			maxSlots: bag.maxSlots,
			freeSlots,
			full: bag.maxSlots !== undefined && usedSlots >= bag.maxSlots,
		};
	}

	static getQuantity(bag: RPGBagState, itemId: string): number {
		const id = RPGItemRegistry.normalizeId(itemId);
		return bag.items.find(entry => entry.itemId === id)?.quantity ?? 0;
	}

	static getMissionQuantity(bag: RPGBagState, itemId: string): number {
		const id = RPGItemRegistry.normalizeId(itemId);
		return bag.missionQuantities[id] || 0;
	}

	static getRegularQuantity(bag: RPGBagState, itemId: string): number {
		return Math.max(0, this.getQuantity(bag, itemId) - this.getMissionQuantity(bag, itemId));
	}

	static has(bag: RPGBagState, itemId: string, quantity = 1): boolean {
		if (!Number.isSafeInteger(quantity) || quantity < 0) return false;
		return this.getQuantity(bag, itemId) >= quantity;
	}

	static add(
		bag: RPGBagState, itemId: string, quantity: number, expectedRevision = bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGBagUpdateResult {
		return this.apply(bag, [{ type: 'add', itemId, quantity }], expectedRevision, registry);
	}

	static remove(
		bag: RPGBagState, itemId: string, quantity: number, expectedRevision = bag.revision,
		registry: RPGItemRegistry = RPGItems
	): RPGBagUpdateResult {
		return this.apply(bag, [{ type: 'remove', itemId, quantity }], expectedRevision, registry);
	}

	static apply(
		bag: RPGBagState,
		operations: readonly RPGBagOperation[],
		expectedRevision: number,
		registry: RPGItemRegistry = RPGItems,
		incrementRevision = true
	): RPGBagUpdateResult {
		this.validateState(bag, registry);
		if (expectedRevision !== bag.revision) throw new Error('RPG Bag revision conflict');
		if (!operations.length) return { bag: structuredClone(bag), changes: [] };

		const quantities = new Map(bag.items.map(entry => [entry.itemId, entry.quantity]));
		const previous = new Map(quantities);
		for (const operation of operations) {
			const item = registry.require(operation.itemId);
			if (!Number.isSafeInteger(operation.quantity) || operation.quantity < (operation.type === 'set' ? 0 : 1)) {
				throw new Error('RPG Bag ' + operation.type + ' quantity must be a valid integer');
			}
			const current = quantities.get(item.id) ?? 0;
			const next = operation.type === 'add' ? current + operation.quantity :
				operation.type === 'remove' ? current - operation.quantity : operation.quantity;
			if (!Number.isSafeInteger(next) || next < 0) throw new Error('Not enough RPG item: ' + item.id);
			if (next > item.stackLimit) throw new Error('RPG item stack limit exceeded: ' + item.id);
			if (next) quantities.set(item.id, next);
			else quantities.delete(item.id);
		}
		if (bag.maxSlots !== undefined && quantities.size > bag.maxSlots) throw new Error('RPG Bag has no free slots');

		const ids = new Set([...previous.keys(), ...quantities.keys()]);
		const changes = [...ids]
			.filter(id => (previous.get(id) ?? 0) !== (quantities.get(id) ?? 0))
			.map(itemId => ({
				itemId,
				previousQuantity: previous.get(itemId) ?? 0,
				quantity: quantities.get(itemId) ?? 0,
			}));
		const missionQuantities = Object.fromEntries(Object.entries(bag.missionQuantities)
			.flatMap(([itemId, quantity]) => {
				const total = quantities.get(itemId) || 0;
				const next = Math.min(quantity, total);
				return next > 0 ? [[itemId, next]] : [];
			}));
		const missionItems = Object.keys(missionQuantities);
		const missionNotes = Object.fromEntries(Object.entries(bag.missionNotes).filter(([itemId]) =>
			quantities.has(itemId) && (missionQuantities[itemId] || registry.require(itemId).tags?.includes('mission'))
		));
		return {
			bag: {
				...structuredClone(bag),
				version: RPG_BAG_VERSION,
				revision: bag.revision + (incrementRevision && changes.length ? 1 : 0),
				items: [...quantities].map(([itemId, quantity]) => ({ itemId, quantity })),
				favorites: bag.favorites.filter(itemId => quantities.has(itemId) && !missionQuantities[itemId]),
				missionItems, missionQuantities, missionNotes,
			},
			changes,
		};
	}

	static setFavorite(
		bag: RPGBagState, itemId: string, favorite: boolean,
		expectedRevision = bag.revision, registry: RPGItemRegistry = RPGItems
	): RPGBagState {
		this.validateState(bag, registry);
		if (expectedRevision !== bag.revision) throw new Error('RPG Bag revision conflict');
		const id = registry.require(itemId).id;
		if (favorite && !this.has(bag, id)) throw new Error('Only an item present in the RPG Bag can be favorited');
		const favorites = new Set(bag.favorites);
		if (favorite) favorites.add(id);
		else favorites.delete(id);
		if (favorites.size === bag.favorites.length && bag.favorites.every(entry => favorites.has(entry))) {
			return structuredClone(bag);
		}
		return { ...structuredClone(bag), revision: bag.revision + 1, favorites: [...favorites] };
	}

	static setMissionItem(
		bag: RPGBagState, itemId: string, mission: boolean,
		expectedRevision = bag.revision, registry: RPGItemRegistry = RPGItems, quantity?: number, note?: string
	): RPGBagState {
		this.validateState(bag, registry);
		if (expectedRevision !== bag.revision) throw new Error('RPG Bag revision conflict');
		const id = registry.require(itemId).id;
		const total = this.getQuantity(bag, id);
		if (!total) throw new Error('Only an item present in the RPG Bag can be moved to mission items');
		const missionQuantities = { ...bag.missionQuantities };
		const missionNotes = { ...bag.missionNotes };
		if (mission) {
			const current = missionQuantities[id] || 0;
			const available = total - current;
			const moved = quantity === undefined ? available : quantity;
			if (!Number.isSafeInteger(moved) || moved < 1 || moved > available) {
				throw new Error('Invalid RPG Bag mission quantity');
			}
			missionQuantities[id] = current + moved;
			if (note !== undefined) {
				const normalized = this.normalizeMissionNote(note);
				if (normalized) missionNotes[id] = normalized;
				else delete missionNotes[id];
			}
		} else {
			if (!missionQuantities[id]) return structuredClone(bag);
			delete missionQuantities[id];
			delete missionNotes[id];
		}
		const missionItems = Object.keys(missionQuantities);
		return {
			...structuredClone(bag), revision: bag.revision + 1, missionItems, missionQuantities, missionNotes,
			favorites: mission ? bag.favorites.filter(entry => entry !== id) : [...bag.favorites],
		};
	}

	static setMissionNote(
		bag: RPGBagState, itemId: string, note: string,
		expectedRevision = bag.revision, registry: RPGItemRegistry = RPGItems
	): RPGBagState {
		this.validateState(bag, registry);
		if (expectedRevision !== bag.revision) throw new Error('RPG Bag revision conflict');
		const item = registry.require(itemId);
		if (!this.has(bag, item.id) ||
			(!bag.missionQuantities[item.id] && !item.tags?.includes('mission'))) {
			throw new Error('O item não está registrado como Item de Missão');
		}
		const normalized = this.normalizeMissionNote(note);
		const missionNotes = { ...bag.missionNotes };
		if (normalized) missionNotes[item.id] = normalized;
		else delete missionNotes[item.id];
		if ((bag.missionNotes[item.id] || '') === normalized) return structuredClone(bag);
		return { ...structuredClone(bag), revision: bag.revision + 1, missionNotes };
	}

	private static normalizeMissionNote(note: unknown): string {
		if (typeof note !== 'string') throw new Error('A anotação do Item de Missão deve ser um texto');
		const normalized = note.trim();
		if (normalized.length > 1000) {
			throw new Error('A anotação do Item de Missão pode ter no máximo 1000 caracteres');
		}
		return normalized;
	}

	private static validateState(bag: RPGBagState, registry: RPGItemRegistry): void {
		if (bag.version !== RPG_BAG_VERSION) throw new Error('Unsupported RPG Bag version: ' + String(bag.version));
		if (typeof bag.ownerId !== 'string' || !bag.ownerId.trim()) throw new Error('RPG Bag requires ownerId');
		if (!Number.isSafeInteger(bag.revision) || bag.revision < 0) throw new Error('Invalid RPG Bag revision');
		if (bag.maxSlots !== undefined && (!Number.isSafeInteger(bag.maxSlots) || bag.maxSlots < 1)) {
			throw new Error('Invalid RPG Bag maxSlots');
		}
		if (!Array.isArray(bag.items)) throw new Error('RPG Bag requires an items array');
		if (!Array.isArray(bag.favorites)) throw new Error('RPG Bag requires a favorites array');
		if (!Array.isArray(bag.missionItems)) throw new Error('RPG Bag requires a missionItems array');
		if (!bag.missionQuantities || typeof bag.missionQuantities !== 'object' || Array.isArray(bag.missionQuantities)) {
			throw new Error('RPG Bag requires missionQuantities');
		}
		if (!bag.missionNotes || typeof bag.missionNotes !== 'object' || Array.isArray(bag.missionNotes)) {
			throw new Error('RPG Bag requires missionNotes');
		}
		const ids = new Set<string>();
		for (const entry of bag.items) {
			const item = registry.require(entry.itemId);
			if (entry.itemId !== item.id || ids.has(item.id)) {
				throw new Error('Invalid or duplicated RPG Bag item: ' + entry.itemId);
			}
			if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > item.stackLimit) {
				throw new Error('Invalid RPG Bag quantity: ' + item.id);
			}
			ids.add(item.id);
		}
		if (bag.maxSlots !== undefined && ids.size > bag.maxSlots) throw new Error('RPG Bag has no free slots');
		const favorites = new Set<string>();
		for (const itemId of bag.favorites) {
			const id = registry.require(itemId).id;
			if (itemId !== id || !ids.has(id) || favorites.has(id)) {
				throw new Error('Invalid or duplicated RPG Bag favorite: ' + itemId);
			}
			favorites.add(id);
		}
		const missionItems = new Set<string>();
		for (const itemId of bag.missionItems) {
			const id = registry.require(itemId).id;
			const quantity = bag.missionQuantities[id];
			if (itemId !== id || !ids.has(id) || missionItems.has(id) ||
				!Number.isSafeInteger(quantity) || quantity < 1 || quantity > this.getQuantity(bag, id)) {
				throw new Error('Invalid or duplicated RPG Bag mission item: ' + itemId);
			}
			missionItems.add(id);
		}
		if (Object.keys(bag.missionQuantities).length !== missionItems.size ||
			Object.keys(bag.missionQuantities).some(id => !missionItems.has(id))) {
			throw new Error('RPG Bag mission quantities do not match mission items');
		}
		for (const [itemId, note] of Object.entries(bag.missionNotes)) {
			const item = registry.require(itemId);
			if (!ids.has(item.id) || (!bag.missionQuantities[item.id] && !item.tags?.includes('mission')) ||
				this.normalizeMissionNote(note) !== note) {
				throw new Error('Invalid RPG Bag mission note: ' + itemId);
			}
		}
	}
}
