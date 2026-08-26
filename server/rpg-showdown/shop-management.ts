import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

import {
	RPGBagSystem, RPGInventorySystem, RPGItems, RPGShopSystem,
	type RPGInventoryState, type RPGItemDefinition, type RPGShopTransaction,
} from '../../sim/rpg-showdown';
import {Dex} from '../../sim/dex';
import {getRPGItemIconPath} from './item-icons';
import {RPGBagManagement} from './bag-management';

export const RPG_COMMERCE_VERSION = 1;
export type RPGShopType = 'poke-mart' | 'equipment' | 'evolution' | 'tm' | 'mega-stone' | 'farm' | 'thrift';
export type RPGShopBuyMode = 'available' | 'hidden' | 'locked';

export interface RPGCommerceOffer {
	itemId: string;
	stock: number;
	buyMode: RPGShopBuyMode;
	buyEnabled?: boolean;
	sellEnabled?: boolean;
	buyPrice?: number;
	sellPrice?: number;
}

export interface RPGCommerceShopState {
	version: 1;
	id: string;
	type: RPGShopType;
	name: string;
	description: string;
	revision: number;
	offers: RPGCommerceOffer[];
}

export interface RPGCommerceState {
	version: 1;
	shops: RPGCommerceShopState[];
}

export interface RPGCommerceCharacter {
	id: string;
	money: number;
	inventory: RPGInventoryState;
	shopRevision?: number;
	shopTransactions?: RPGShopTransaction[];
}

export interface RPGCommerceTradeLine {
	itemId: string;
	quantity: number;
}

export interface RPGCommerceTradeRequest {
	actionId: string;
	type: 'buy' | 'sell';
	lines: RPGCommerceTradeLine[];
	expectedAccountRevision: number;
	expectedBagRevision: number;
	expectedCatalogRevision: number;
}

export interface RPGCommerceOfferInput {
	itemId: string;
	stock?: number;
	buyMode?: RPGShopBuyMode;
	buyPrice?: number;
	sellPrice?: number;
	buyEnabled?: boolean;
	sellEnabled?: boolean;
	remove?: boolean;
	expectedRevision: number;
}

export type RPGCommerceBulkAction = 'enable-buy' | 'disable-buy' | 'enable-sell' | 'disable-sell' |
	'increase-prices' | 'decrease-prices' | 'reset-prices';

export interface RPGCommerceBulkInput {
	action: RPGCommerceBulkAction;
	expectedRevision: number;
}

export interface RPGCommerceRepository {
	get(shopId: string): RPGCommerceShopState | undefined;
	set(shop: RPGCommerceShopState): void;
	list(): RPGCommerceShopState[];
}

const SHOP_DEFINITIONS: readonly Omit<RPGCommerceShopState, 'version' | 'revision' | 'offers'>[] = [
	{id: 'poke-mart-central', type: 'poke-mart', name: 'Poké Mart', description: 'Pokébolas e medicamentos.'},
	{id: 'equipment-central', type: 'equipment', name: 'Loja de Equipamentos', description: 'Held Items para batalhas.'},
	{id: 'evolution-central', type: 'evolution', name: 'Loja Evolutiva', description: 'Itens de evolução e Teracristalização.'},
	{id: 'tm-central', type: 'tm', name: 'Loja de TMs', description: 'Máquinas Técnicas e golpes.'},
	{id: 'mega-stone-central', type: 'mega-stone', name: 'Loja de Mega Pedras', description: 'Mega Stones para Pokémon compatíveis.'},
	{id: 'farm-central', type: 'farm', name: 'Fazenda', description: 'Berries e produtos agrícolas.'},
	{id: 'thrift-central', type: 'thrift', name: 'Brechó', description: 'Tesouros, fósseis e itens diversos.'},
];

function defaultShop(definition: typeof SHOP_DEFINITIONS[number]): RPGCommerceShopState {
	return {version: 1, ...definition, revision: 0, offers: []};
}

function initialShops(): RPGCommerceShopState[] {
	return SHOP_DEFINITIONS.map(defaultShop);
}

function normalizedId(value: string): string {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function itemGroup(item: RPGItemDefinition): {shopType?: RPGShopType, category: string} {
	const tags = new Set(item.tags || []);
	if (tags.has('breeding') || tags.has('nursery') || tags.has('incubator')) return {category: 'nursery'};
	if (item.category === 'ball') return {shopType: 'poke-mart', category: 'pokeballs'};
	if (['healing', 'status', 'pp', 'revive'].includes(item.category)) {
		return {shopType: 'poke-mart', category: 'medicines'};
	}
	if (item.category === 'tm') return {shopType: 'tm', category: 'tms'};
	if (tags.has('megastone')) return {shopType: 'mega-stone', category: 'mega-stones'};
	if (tags.has('berry')) return {shopType: 'farm', category: 'berries'};
	if (item.category === 'held') return {shopType: 'equipment', category: 'held-items'};
	if (tags.has('terastal') || tags.has('teracrystal')) {
		return {shopType: 'evolution', category: 'terastalization'};
	}
	if (item.category === 'evolution') return {shopType: 'evolution', category: 'evolution-items'};
	if (tags.has('fossil')) return {shopType: 'thrift', category: 'fossils'};
	if (tags.has('treasure')) return {shopType: 'thrift', category: 'treasures'};
	if (item.price && (item.price.buy !== undefined || item.price.sell !== undefined)) {
		return {shopType: 'thrift', category: 'other'};
	}
	return {category: 'unassigned'};
}

function normalizeShop(input: RPGCommerceShopState): RPGCommerceShopState {
	if (input.version !== 1) throw new Error('Unsupported RPG commerce shop version');
	const definition = SHOP_DEFINITIONS.find(entry => entry.id === input.id);
	if (!definition || definition.type !== input.type) throw new Error('Invalid RPG commerce establishment');
	if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('Invalid RPG commerce revision');
	const offers = (input.offers || []).map(offer => normalizeOffer(offer, input.type));
	if (new Set(offers.map(offer => offer.itemId)).size !== offers.length) {
		throw new Error('RPG commerce establishment has duplicated offers');
	}
	return {version: 1, ...definition, revision: input.revision, offers};
}

function normalizePrice(value: number | undefined, label: string): number | undefined {
	if (value === undefined) return;
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(label + ' must be a non-negative integer');
	return value;
}

function normalizeOffer(input: RPGCommerceOffer, shopType: RPGShopType): RPGCommerceOffer {
	const item = RPGItems.require(input.itemId);
	const group = itemGroup(item);
	if (group.shopType !== shopType) throw new Error('Este item não pertence a este tipo de loja');
	if (!Number.isSafeInteger(input.stock) || input.stock < 0) throw new Error('Estoque inválido');
	if (!['available', 'hidden', 'locked'].includes(input.buyMode)) throw new Error('Disponibilidade de compra inválida');
	const buyPrice = normalizePrice(input.buyPrice, 'Buy price');
	const sellPrice = normalizePrice(input.sellPrice, 'Sell price');
	return {
		itemId: item.id, stock: input.stock, buyMode: input.buyMode,
		buyEnabled: input.buyEnabled ?? (input.buyMode === 'available' && buyPrice !== undefined),
		sellEnabled: input.sellEnabled ?? sellPrice !== undefined,
		...(buyPrice === undefined ? {} : {buyPrice}),
		...(sellPrice === undefined ? {} : {sellPrice}),
	};
}

function basePrices(item: RPGItemDefinition): {buy: number, sell: number} {
	return {buy: item.price?.buy ?? 0, sell: item.price?.sell ?? 0};
}

function effectFilters(item: RPGItemDefinition, shopType: RPGShopType, category: string) {
	if (shopType === 'poke-mart') {
		const group = item.category === 'ball' ? 'Pokébolas' : item.category === 'revive' ? 'Revives' :
			item.category === 'status' ? 'Status' : 'Curas';
		return {effectGroup: group};
	}
	if (shopType === 'evolution') {
		return {effectGroup: category === 'terastalization' ? 'Teracristalização' : 'Itens de evolução'};
	}
	if (shopType === 'tm') {
		const moveId = typeof item.effect?.move === 'string' ? item.effect.move : '';
		const move = Dex.moves.get(moveId);
		const categories = {Physical: 'Físico', Special: 'Especial', Status: 'Status'};
		return {
			effectGroup: categories[move.category as keyof typeof categories] || 'Status',
			effectType: move.type || 'Normal',
		};
	}
	if (shopType === 'farm') {
		const offensive = /apicot|custap|lansat|liechi|micle|petaya|salac|starf/i.test(item.id);
		return {effectGroup: offensive ? 'Ofensivo' : 'Defensivo'};
	}
	if (shopType === 'equipment') {
		const tags = new Set(item.tags || []);
		if (tags.has('consumable') || /herb|policy|seed|orb|sash|button|pack|card|service/i.test(item.name)) {
			return {effectGroup: 'Uso único por batalha'};
		}
		if (/vest|shield|eviolite|helmet|boots|cloak|goggles|umbre|pads|band|leftovers|sludge/i.test(item.name)) {
			return {effectGroup: 'Defensivo'};
		}
		if (/choice|belt|glasses|lens|claw|fang|plate|charcoal|magnet|water|sand|spoon|scarf|feather|ice/i.test(item.name)) {
			return {effectGroup: 'Ofensivo'};
		}
		return {effectGroup: 'Utilidade'};
	}
	return {};
}

export class RPGMemoryCommerceRepository implements RPGCommerceRepository {
	private readonly shops = new Map(initialShops().map(shop => [shop.id, shop]));

	get(shopId: string): RPGCommerceShopState | undefined {
		const shop = this.shops.get(String(shopId || ''));
		return shop && structuredClone(shop);
	}
	set(shop: RPGCommerceShopState): void {
		const normalized = normalizeShop(shop);
		this.shops.set(normalized.id, structuredClone(normalized));
	}
	list(): RPGCommerceShopState[] {
		return [...this.shops.values()].map(shop => structuredClone(shop));
	}
}

export class RPGFileCommerceRepository implements RPGCommerceRepository {
	private readonly memory = new RPGMemoryCommerceRepository();
	readonly filePath: string;

	constructor(filePath = resolve('config/rpg-shops.json')) {
		this.filePath = resolve(filePath);
		if (!existsSync(this.filePath)) return;
		const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RPGCommerceState>;
		if (raw.version !== 1 || !Array.isArray(raw.shops)) throw new Error('Invalid RPG commerce persistence file');
		for (const shop of raw.shops) this.memory.set(shop);
	}
	get(shopId: string): RPGCommerceShopState | undefined {
		return this.memory.get(shopId);
	}
	set(shop: RPGCommerceShopState): void {
		const previous = this.memory.get(shop.id);
		this.memory.set(shop);
		try {
			this.persist();
		} catch (error) {
			if (previous) this.memory.set(previous);
			throw error;
		}
	}
	list(): RPGCommerceShopState[] {
		return this.memory.list();
	}
	private persist(): void {
		mkdirSync(dirname(this.filePath), {recursive: true});
		const temporary = this.filePath + '.tmp';
		const data: RPGCommerceState = {version: 1, shops: this.memory.list()};
		writeFileSync(temporary, JSON.stringify(data, null, '\t') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
}

export class RPGCommerceManagement {
	constructor(readonly repository: RPGCommerceRepository = new RPGMemoryCommerceRepository()) {}

	directory(): {version: number, shops: ReturnType<RPGCommerceManagement['summary']>[]} {
		return {version: RPG_COMMERCE_VERSION, shops: this.repository.list().map(shop => this.summary(shop))};
	}

	summary(shop: RPGCommerceShopState) {
		return {
			id: shop.id, type: shop.type, name: shop.name, description: shop.description,
			revision: shop.revision,
			availableItemTypes: shop.offers.filter(offer =>
				(offer.buyEnabled ?? offer.buyMode === 'available') && offer.buyPrice !== undefined && offer.stock > 0
			).length,
		};
	}

	view(shopId: string, character?: RPGCommerceCharacter, master = false) {
		const shop = this.requireShop(shopId);
		const inventory = character ? RPGInventorySystem.migrate(character.inventory) : undefined;
		const candidates = this.shopItems(shop);
		const configured = new Map(shop.offers.map(offer => [offer.itemId, offer]));
		const sourceOffers = master ? candidates.map(candidate => configured.get(candidate.id) || {
			itemId: candidate.id, stock: 0, buyMode: 'hidden' as const,
			buyEnabled: false, sellEnabled: false,
			buyPrice: candidate.recommendedBuyPrice, sellPrice: candidate.recommendedSellPrice,
		}) : shop.offers;
		const offers = sourceOffers.map(offer => this.offerView(shop, offer, inventory)).filter(offer =>
			master || offer.buyEnabled || (offer.sellEnabled && offer.owned > 0)
		);
		return {
			version: RPG_COMMERCE_VERSION, shop: this.summary(shop),
			accountRevision: character?.shopRevision || 0,
			bagRevision: inventory?.bag.revision,
			money: character?.money,
			offers,
			filters: [...new Set(offers.map(offer => offer.effectGroup).filter(Boolean))],
			typeFilters: [...new Set(offers.map(offer => offer.effectType).filter(Boolean))],
			...(master ? {candidates} : {}),
		};
	}

	configure(shopId: string, input: RPGCommerceOfferInput): RPGCommerceShopState {
		const shop = this.requireShop(shopId);
		if (input.expectedRevision !== shop.revision) throw new Error('RPG commerce revision conflict');
		const itemId = normalizedId(input.itemId);
		if (!itemId) throw new Error('Selecione um item');
		const index = shop.offers.findIndex(offer => offer.itemId === itemId);
		if (input.remove) {
			if (index >= 0) shop.offers.splice(index, 1);
		} else {
			const item = RPGItems.require(itemId);
			const existing = index >= 0 ? shop.offers[index] : undefined;
			const base = basePrices(item);
			const buyEnabled = input.buyEnabled ?? (input.buyMode !== undefined ?
				input.buyMode === 'available' : existing?.buyEnabled ??
				(existing?.buyMode === 'available' && existing.buyPrice !== undefined));
			const sellEnabled = input.sellEnabled ?? existing?.sellEnabled ?? existing?.sellPrice !== undefined;
			const buyPrice = input.buyPrice ?? existing?.buyPrice ?? base.buy;
			const sellPrice = input.sellPrice ?? existing?.sellPrice ?? base.sell;
			const offer = normalizeOffer({
				itemId,
				stock: input.stock ?? existing?.stock ?? 0,
				buyMode: buyEnabled ? 'available' : 'hidden',
				buyEnabled, sellEnabled, buyPrice, sellPrice,
			}, shop.type);
			if (index >= 0) shop.offers[index] = offer;
			else shop.offers.push(offer);
			shop.offers.sort((left, right) => RPGItems.require(left.itemId).name.localeCompare(RPGItems.require(right.itemId).name));
		}
		shop.revision++;
		this.repository.set(shop);
		return shop;
	}

	configureBulk(shopId: string, input: RPGCommerceBulkInput): RPGCommerceShopState {
		const shop = this.requireShop(shopId);
		if (input.expectedRevision !== shop.revision) throw new Error('RPG commerce revision conflict');
		const allowed: RPGCommerceBulkAction[] = [
			'enable-buy', 'disable-buy', 'enable-sell', 'disable-sell',
			'increase-prices', 'decrease-prices', 'reset-prices',
		];
		if (!allowed.includes(input.action)) throw new Error('Ação em massa inválida');
		shop.offers = this.materializeOffers(shop).map(offer => {
			const item = RPGItems.require(offer.itemId);
			const base = basePrices(item);
			if (input.action === 'enable-buy') return {...offer, buyEnabled: true, buyMode: 'available' as const};
			if (input.action === 'disable-buy') return {...offer, buyEnabled: false, buyMode: 'hidden' as const};
			if (input.action === 'enable-sell') return {...offer, sellEnabled: true};
			if (input.action === 'disable-sell') return {...offer, sellEnabled: false};
			if (input.action === 'reset-prices') return {...offer, buyPrice: base.buy, sellPrice: base.sell};
			const multiplier = input.action === 'increase-prices' ? 1.1 : 0.9;
			return {
				...offer,
				buyPrice: Math.max(0, Math.round(Number(offer.buyPrice || 0) * multiplier)),
				sellPrice: Math.max(0, Math.round(Number(offer.sellPrice || 0) * multiplier)),
			};
		});
		shop.revision++;
		this.repository.set(shop);
		return shop;
	}

	prepareTrade(
		shopId: string, character: RPGCommerceCharacter, request: RPGCommerceTradeRequest
	): {character: RPGCommerceCharacter, shop: RPGCommerceShopState, transactions: RPGShopTransaction[]} {
		const shop = this.requireShop(shopId);
		if (!request.actionId?.trim()) throw new Error('A transação requer um identificador');
		if (!Array.isArray(request.lines) || !request.lines.length || request.lines.length > 100) {
			throw new Error('O carrinho precisa possuir entre 1 e 100 itens');
		}
		const ids = request.lines.map(line => normalizedId(line.itemId));
		if (new Set(ids).size !== ids.length) throw new Error('O carrinho possui itens repetidos');
		let account = RPGShopSystem.createAccount(
			character.id, character.money, RPGInventorySystem.migrate(character.inventory).bag, {
				revision: character.shopRevision || 0,
				transactions: character.shopTransactions || [],
			}
		);
		let catalog = this.catalog(shop);
		const transactions: RPGShopTransaction[] = [];
		for (let index = 0; index < request.lines.length; index++) {
			const line = request.lines[index];
			const revisions = index === 0 ? {
				account: request.expectedAccountRevision,
				bag: request.expectedBagRevision,
				catalog: request.expectedCatalogRevision,
			} : {
				account: account.revision,
				bag: account.bag.revision,
				catalog: catalog.revision,
			};
			const result = request.type === 'buy' ? RPGShopSystem.buy(account, catalog, {
				actionId: request.actionId + ':' + index, itemId: line.itemId, quantity: line.quantity,
			}, revisions) : RPGShopSystem.sell(account, catalog, {
				actionId: request.actionId + ':' + index, itemId: line.itemId, quantity: line.quantity,
			}, revisions);
			account = result.account;
			catalog = result.catalog;
			transactions.push(result.transaction);
		}
		const nextShop = structuredClone(shop);
		for (const catalogOffer of catalog.offers) {
			const offer = nextShop.offers.find(entry => entry.itemId === catalogOffer.itemId);
			if (offer && catalogOffer.stock !== undefined) offer.stock = catalogOffer.stock;
		}
		nextShop.revision = catalog.revision;
		return {
			character: {
				...character, money: account.balance,
				inventory: {...RPGInventorySystem.migrate(character.inventory), bag: account.bag},
				shopRevision: account.revision, shopTransactions: account.transactions,
			},
			shop: nextShop, transactions,
		};
	}

	commit(shop: RPGCommerceShopState): void {
		this.repository.set(shop);
	}

	private catalog(shop: RPGCommerceShopState) {
		const offers = shop.offers.flatMap(offer => {
			const buyPrice = offer.buyEnabled && offer.buyMode === 'available' ? offer.buyPrice : undefined;
			const sellPrice = offer.sellEnabled ? offer.sellPrice : undefined;
			if (buyPrice === undefined && sellPrice === undefined) return [];
			return [{
				itemId: offer.itemId, stock: offer.stock,
				...(buyPrice === undefined ? {} : {buyPrice}),
				...(sellPrice === undefined ? {} : {sellPrice}),
			}];
		});
		return RPGShopSystem.createCatalog(shop.id, offers, {
			revision: shop.revision, bagUpgrades: [],
		});
	}

	private offerView(shop: RPGCommerceShopState, offer: RPGCommerceOffer, inventory?: RPGInventoryState) {
		const item = RPGItems.require(offer.itemId);
		const group = itemGroup(item);
		return {
			itemId: item.id, name: item.name, category: group.category,
			description: RPGBagManagement.description(item), icon: getRPGItemIconPath(item.id),
			stock: offer.stock, owned: inventory ? RPGInventorySystem.getAvailableQuantity(inventory, item.id) : 0,
			buyMode: offer.buyMode,
			buyEnabled: offer.buyEnabled ?? (offer.buyMode === 'available' && offer.buyPrice !== undefined),
			sellEnabled: offer.sellEnabled ?? offer.sellPrice !== undefined,
			buyVisible: offer.buyEnabled ?? offer.buyMode !== 'hidden',
			buyLocked: offer.buyMode === 'locked',
			buyPrice: offer.buyPrice ?? basePrices(item).buy,
			sellPrice: offer.sellPrice ?? basePrices(item).sell,
			baseBuyPrice: basePrices(item).buy, baseSellPrice: basePrices(item).sell,
			canBuy: !!offer.buyEnabled && offer.buyMode === 'available' && offer.buyPrice !== undefined && offer.stock > 0,
			canSell: !!offer.sellEnabled && offer.sellPrice !== undefined,
			...effectFilters(item, shop.type, group.category),
			shopType: shop.type,
		};
	}

	private shopItems(shop: RPGCommerceShopState) {
		return RPGItems.list().flatMap(item => {
			const group = itemGroup(item);
			if (group.shopType !== shop.type) return [];
			const base = basePrices(item);
			return [{
				id: item.id, name: item.name, category: group.category,
				description: RPGBagManagement.description(item), icon: getRPGItemIconPath(item.id),
				recommendedBuyPrice: base.buy, recommendedSellPrice: base.sell,
				...effectFilters(item, shop.type, group.category),
			}];
		}).sort((left, right) => left.name.localeCompare(right.name));
	}

	private materializeOffers(shop: RPGCommerceShopState): RPGCommerceOffer[] {
		const configured = new Map(shop.offers.map(offer => [offer.itemId, offer]));
		return this.shopItems(shop).map(candidate => configured.get(candidate.id) || {
			itemId: candidate.id, stock: 0, buyMode: 'hidden',
			buyEnabled: false, sellEnabled: false,
			buyPrice: candidate.recommendedBuyPrice, sellPrice: candidate.recommendedSellPrice,
		});
	}

	private requireShop(shopId: string): RPGCommerceShopState {
		const shop = this.repository.get(String(shopId || ''));
		if (!shop) throw new Error('Estabelecimento desconhecido');
		return normalizeShop(shop);
	}
}
