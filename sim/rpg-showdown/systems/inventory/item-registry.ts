import { RPG_DEFAULT_ITEMS } from "../../data/items";

export const RPG_MAX_ITEM_STACK = 99;
export type RPGItemCategory = 'ball' | 'healing' | 'pp' | 'status' | 'revive' | 'battle' |
	'held' | 'tm' | 'evolution' | 'key' | 'custom';
export type RPGItemSource = 'showdown' | 'rpg' | 'custom';
export type RPGCurrency = 'pokedollar';
export type RPGItemPriceSource = 'gen9-sv' | 'legacy-game' | 'rpg' | 'custom';

export interface RPGItemPrice {
	currency: RPGCurrency;
	source: RPGItemPriceSource;
	buy?: number;
	sell?: number;
	reference?: string;
}

export interface RPGItemEffect {
	type: string;
	[key: string]: unknown;
}

export interface RPGItemDefinition {
	id: string;
	name: string;
	category: RPGItemCategory;
	stackLimit: number;
	usableInBattle: boolean;
	consumedOnUse: boolean;
	source: RPGItemSource;
	price?: RPGItemPrice;
	effect?: RPGItemEffect;
	tags?: string[];
}

export class RPGItemRegistry {
	private readonly items = new Map<string, RPGItemDefinition>();

	constructor(definitions: readonly RPGItemDefinition[] = RPG_DEFAULT_ITEMS) {
		this.registerMany(definitions);
	}

	static normalizeId(value: string): string {
		return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	}

	register(definition: RPGItemDefinition, replace = false): RPGItemDefinition {
		const normalized = this.validate(definition);
		if (!replace && this.items.has(normalized.id)) {
			throw new Error('RPG item is already registered: ' + normalized.id);
		}
		this.items.set(normalized.id, normalized);
		return structuredClone(normalized);
	}

	registerMany(definitions: readonly RPGItemDefinition[], replace = false): RPGItemDefinition[] {
		const normalized = definitions.map(definition => this.validate(definition));
		const ids = new Set<string>();
		for (const definition of normalized) {
			if (ids.has(definition.id) || (!replace && this.items.has(definition.id))) {
				throw new Error('RPG item is already registered: ' + definition.id);
			}
			ids.add(definition.id);
		}
		for (const definition of normalized) this.items.set(definition.id, definition);
		return structuredClone(normalized);
	}

	get(itemId: string): RPGItemDefinition | undefined {
		const item = this.items.get(RPGItemRegistry.normalizeId(itemId));
		return item && structuredClone(item);
	}

	require(itemId: string): RPGItemDefinition {
		const item = this.get(itemId);
		if (!item) throw new Error('Unknown RPG item: ' + itemId);
		return item;
	}

	unregister(itemId: string): boolean {
		return this.items.delete(RPGItemRegistry.normalizeId(itemId));
	}

	has(itemId: string): boolean {
		return this.items.has(RPGItemRegistry.normalizeId(itemId));
	}

	list(category?: RPGItemCategory): RPGItemDefinition[] {
		return [...this.items.values()]
			.filter(item => !category || item.category === category)
			.map(item => structuredClone(item));
	}

	private validate(definition: RPGItemDefinition): RPGItemDefinition {
		const item = structuredClone(definition);
		item.id = RPGItemRegistry.normalizeId(item.id);
		if (!item.id) throw new Error('RPG item requires an id');
		const categories: RPGItemCategory[] = [
			'ball', 'healing', 'pp', 'status', 'revive', 'battle', 'held', 'tm', 'evolution', 'key', 'custom',
		];
		if (!categories.includes(item.category)) throw new Error('RPG item ' + item.id + ' has an invalid category');
		if (!['showdown', 'rpg', 'custom'].includes(item.source)) {
			throw new Error('RPG item ' + item.id + ' has an invalid source');
		}
		if (typeof item.name !== 'string' || !item.name.trim()) throw new Error('RPG item ' + item.id + ' requires a name');
		if (!Number.isSafeInteger(item.stackLimit) || item.stackLimit < 1 || item.stackLimit > RPG_MAX_ITEM_STACK) {
			throw new Error('RPG item ' + item.id + ' stackLimit must be between 1 and ' + String(RPG_MAX_ITEM_STACK));
		}
		if (typeof item.usableInBattle !== 'boolean' || typeof item.consumedOnUse !== 'boolean') {
			throw new Error('RPG item ' + item.id + ' requires usage flags');
		}
		if (item.category === 'revive') item.usableInBattle = false;
		if (item.effect && (typeof item.effect.type !== 'string' || !item.effect.type.trim())) {
			throw new Error('RPG item ' + item.id + ' effect requires a type');
		}
		if (item.price) {
			if (item.price.currency !== 'pokedollar') {
				throw new Error('RPG item ' + item.id + ' has an unsupported currency');
			}
			if (!['gen9-sv', 'legacy-game', 'rpg', 'custom'].includes(item.price.source)) {
				throw new Error('RPG item ' + item.id + ' has an invalid price source');
			}
			if (item.price.buy === undefined && item.price.sell === undefined) {
				throw new Error('RPG item ' + item.id + ' price requires buy or sell');
			}
			for (const [kind, value] of Object.entries({ buy: item.price.buy, sell: item.price.sell })) {
				if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
					throw new Error('RPG item ' + item.id + ' requires a non-negative integer ' + kind + ' price');
				}
			}
			if (item.price.reference !== undefined && (typeof item.price.reference !== 'string' || !item.price.reference.trim())) {
				throw new Error('RPG item ' + item.id + ' has an invalid price reference');
			}
		}
		item.name = item.name.trim();
		item.tags = item.tags?.map(tag => RPGItemRegistry.normalizeId(tag)).filter(Boolean);
		return item;
	}
}

export const RPGItems = new RPGItemRegistry();
