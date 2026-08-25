import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

import {
	RPGBagSystem, RPGInventorySystem, RPGItems, RPGShopSystem,
	type RPGInventoryState, type RPGItemDefinition, type RPGShopTransaction,
} from '../../sim/rpg-showdown';
import {getRPGItemIconPath} from './item-icons';
import {RPGBagManagement} from './bag-management';

export const RPG_COMMERCE_VERSION = 1;
export type RPGShopType = 'poke-mart' | 'equipment' | 'evolution' | 'tm' | 'mega-stone' | 'farm' | 'thrift';
export type RPGShopBuyMode = 'available' | 'hidden' | 'locked';

export interface RPGCommerceOffer {
	itemId: string;
	stock: number;
	buyMode: RPGShopBuyMode;
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
	if (buyPrice === undefined && sellPrice === undefined) throw new Error('A oferta precisa comprar ou vender o item');
	return {
		itemId: item.id, stock: input.stock, buyMode: input.buyMode,
		...(buyPrice === undefined ? {} : {buyPrice}),
		...(sellPrice === undefined ? {} : {sellPrice}),
	};
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
				offer.buyMode === 'available' && offer.buyPrice !== undefined && offer.stock > 0
			).length,
		};
	}

	view(shopId: string, character?: RPGCommerceCharacter, master = false) {
		const shop = this.requireShop(shopId);
		const inventory = character ? RPGInventorySystem.migrate(character.inventory) : undefined;
		const offers = shop.offers.map(offer => this.offerView(shop, offer, inventory)).filter(offer =>
			master || offer.buyMode !== 'hidden' || (offer.sellPrice !== undefined && offer.owned > 0)
		);
		const candidates = master ? RPGItems.list().flatMap(item => {
			const group = itemGroup(item);
			if (group.shopType !== shop.type) return [];
			return [{
				id: item.id, name: item.name, category: group.category,
				description: RPGBagManagement.description(item), icon: getRPGItemIconPath(item.id),
				recommendedBuyPrice: item.price?.buy, recommendedSellPrice: item.price?.sell,
			}];
		}).sort((left, right) => left.name.localeCompare(right.name)) : undefined;
		return {
			version: RPG_COMMERCE_VERSION, shop: this.summary(shop),
			accountRevision: character?.shopRevision || 0,
			bagRevision: inventory?.bag.revision,
			money: character?.money,
			offers,
			filters: [...new Set(offers.map(offer => offer.category))],
			...(candidates ? {candidates} : {}),
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
			const buyPrice = input.buyEnabled === false ? undefined :
				input.buyPrice ?? existing?.buyPrice ?? item.price?.buy;
			const sellPrice = input.sellEnabled === false ? undefined :
				input.sellPrice ?? existing?.sellPrice ?? item.price?.sell;
			const offer = normalizeOffer({
				itemId,
				stock: input.stock ?? existing?.stock ?? 0,
				buyMode: input.buyMode ?? existing?.buyMode ?? 'available',
				...(buyPrice === undefined ? {} : {buyPrice}),
				...(sellPrice === undefined ? {} : {sellPrice}),
			}, shop.type);
			if (index >= 0) shop.offers[index] = offer;
			else shop.offers.push(offer);
			shop.offers.sort((left, right) => RPGItems.require(left.itemId).name.localeCompare(RPGItems.require(right.itemId).name));
		}
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
			const buyPrice = offer.buyMode === 'available' ? offer.buyPrice : undefined;
			if (buyPrice === undefined && offer.sellPrice === undefined) return [];
			return [{
				itemId: offer.itemId, stock: offer.stock,
				...(buyPrice === undefined ? {} : {buyPrice}),
				...(offer.sellPrice === undefined ? {} : {sellPrice: offer.sellPrice}),
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
			buyMode: offer.buyMode, buyVisible: offer.buyMode !== 'hidden',
			buyLocked: offer.buyMode === 'locked',
			buyPrice: offer.buyPrice, sellPrice: offer.sellPrice,
			canBuy: offer.buyMode === 'available' && offer.buyPrice !== undefined && offer.stock > 0,
			canSell: offer.sellPrice !== undefined,
			shopType: shop.type,
		};
	}

	private requireShop(shopId: string): RPGCommerceShopState {
		const shop = this.repository.get(String(shopId || ''));
		if (!shop) throw new Error('Estabelecimento desconhecido');
		return normalizeShop(shop);
	}
}
