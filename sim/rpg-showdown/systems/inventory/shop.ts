import {
	RPG_BAG_TIERS, RPGBagSystem,
	type RPGBagState, type RPGBagTier,
} from "./bag";
import { RPGItemRegistry, RPGItems, type RPGCurrency } from "./item-registry";

export const RPG_SHOP_VERSION = 2;

export interface RPGShopAccountState {
	version: number;
	ownerId: string;
	revision: number;
	balance: number;
	bag: RPGBagState;
	transactions: RPGShopTransaction[];
}

export interface RPGShopOffer {
	itemId: string;
	buyPrice?: number;
	sellPrice?: number;
	/** Ausente representa estoque ilimitado. */
	stock?: number;
}

export interface RPGShopBagUpgradeOffer {
	tier: RPGBagTier;
	unlockPrice: number;
}

export interface RPGShopCatalogState {
	version: number;
	shopId: string;
	revision: number;
	offers: RPGShopOffer[];
	bagUpgrades: RPGShopBagUpgradeOffer[];
}

export interface RPGShopTransaction {
	actionId: string;
	shopId: string;
	type: 'buy' | 'sell' | 'bag-upgrade';
	itemId: string;
	quantity: number;
	bagTier?: RPGBagTier;
	unitPrice: number;
	total: number;
	currency: RPGCurrency;
	accountRevision: number;
	bagRevision: number;
	catalogRevision: number;
}

export interface RPGShopTradeRequest {
	actionId: string;
	itemId: string;
	quantity: number;
}

export interface RPGShopBagUpgradeRequest {
	actionId: string;
	targetTier: RPGBagTier;
}

export interface RPGShopExpectedRevisions {
	account: number;
	bag: number;
	catalog: number;
}

export interface RPGShopTradeResult {
	account: RPGShopAccountState;
	catalog: RPGShopCatalogState;
	transaction: RPGShopTransaction;
	replayed: boolean;
}

export class RPGShopSystem {
	static createAccount(
		ownerId: string,
		balance: number,
		bag: RPGBagState,
		options: { revision?: number, transactions?: readonly RPGShopTransaction[], registry?: RPGItemRegistry } = {}
	): RPGShopAccountState {
		const normalizedOwner = ownerId.trim();
		if (!normalizedOwner) throw new Error('RPG Shop account requires ownerId');
		if (bag.ownerId !== normalizedOwner) throw new Error('RPG Shop account and Bag owners must match');
		this.validateMoney(balance, 'balance');
		const revision = options.revision ?? 0;
		if (!Number.isSafeInteger(revision) || revision < 0) {
			throw new Error('RPG Shop account revision must be a non-negative integer');
		}
		const account: RPGShopAccountState = {
			version: RPG_SHOP_VERSION,
			ownerId: normalizedOwner,
			revision,
			balance,
			bag: RPGBagSystem.migrate(bag, options.registry ?? RPGItems),
			transactions: [...structuredClone(options.transactions ?? [])],
		};
		this.validateTransactions(account.transactions, options.registry ?? RPGItems);
		return account;
	}

	static createCatalog(
		shopId: string,
		offers?: readonly RPGShopOffer[],
		options: {
			revision?: number,
			registry?: RPGItemRegistry,
			bagUpgrades?: readonly RPGShopBagUpgradeOffer[],
		} = {}
	): RPGShopCatalogState {
		const normalizedShop = shopId.trim();
		if (!normalizedShop) throw new Error('RPG Shop catalog requires shopId');
		const registry = options.registry ?? RPGItems;
		const source = offers ?? registry.list()
			.filter(item => item.price && (item.price.buy !== undefined || item.price.sell !== undefined))
			.map(item => ({
				itemId: item.id,
				buyPrice: item.price?.buy,
				sellPrice: item.price?.sell,
			}));
		const normalizedOffers = source.map(offer => this.normalizeOffer(offer, registry));
		if (new Set(normalizedOffers.map(offer => offer.itemId)).size !== normalizedOffers.length) {
			throw new Error('RPG Shop catalog cannot contain duplicated items');
		}
		const upgradeSource = options.bagUpgrades ?? Object.values(RPG_BAG_TIERS)
			.filter(tier => tier.unlockPrice > 0)
			.map(tier => ({ tier: tier.id, unlockPrice: tier.unlockPrice }));
		const bagUpgrades = upgradeSource.map(offer => this.normalizeBagUpgrade(offer));
		if (new Set(bagUpgrades.map(offer => offer.tier)).size !== bagUpgrades.length) {
			throw new Error('RPG Shop catalog cannot contain duplicated Bag tiers');
		}
		const revision = options.revision ?? 0;
		if (!Number.isSafeInteger(revision) || revision < 0) {
			throw new Error('RPG Shop catalog revision must be a non-negative integer');
		}
		return {
			version: RPG_SHOP_VERSION,
			shopId: normalizedShop,
			revision,
			offers: normalizedOffers,
			bagUpgrades,
		};
	}

	static migrateAccount(value: unknown, registry: RPGItemRegistry = RPGItems): RPGShopAccountState {
		if (!value || typeof value !== 'object') throw new Error('RPG Shop account must be an object');
		const input = value as Partial<RPGShopAccountState>;
		if (input.version !== undefined && ![1, RPG_SHOP_VERSION].includes(input.version)) {
			throw new Error('Unsupported RPG Shop account version: ' + String(input.version));
		}
		if (!input.bag) throw new Error('RPG Shop account requires a Bag');
		return this.createAccount(input.ownerId || '', input.balance ?? -1, input.bag, {
			revision: input.revision,
			transactions: input.transactions,
			registry,
		});
	}

	static migrateCatalog(value: unknown, registry: RPGItemRegistry = RPGItems): RPGShopCatalogState {
		if (!value || typeof value !== 'object') throw new Error('RPG Shop catalog must be an object');
		const input = value as Partial<RPGShopCatalogState>;
		if (input.version !== undefined && ![1, RPG_SHOP_VERSION].includes(input.version)) {
			throw new Error('Unsupported RPG Shop catalog version: ' + String(input.version));
		}
		if (!Array.isArray(input.offers)) throw new Error('RPG Shop catalog requires offers');
		return this.createCatalog(input.shopId || '', input.offers, {
			revision: input.revision, registry,
			bagUpgrades: input.bagUpgrades ?? [],
		});
	}

	static buy(
		account: RPGShopAccountState,
		catalog: RPGShopCatalogState,
		request: RPGShopTradeRequest,
		expected: RPGShopExpectedRevisions = {
			account: account.revision,
			bag: account.bag.revision,
			catalog: catalog.revision,
		},
		registry: RPGItemRegistry = RPGItems
	): RPGShopTradeResult {
		return this.trade('buy', account, catalog, request, expected, registry);
	}

	static sell(
		account: RPGShopAccountState,
		catalog: RPGShopCatalogState,
		request: RPGShopTradeRequest,
		expected: RPGShopExpectedRevisions = {
			account: account.revision,
			bag: account.bag.revision,
			catalog: catalog.revision,
		},
		registry: RPGItemRegistry = RPGItems
	): RPGShopTradeResult {
		return this.trade('sell', account, catalog, request, expected, registry);
	}

	static upgradeBag(
		account: RPGShopAccountState,
		catalog: RPGShopCatalogState,
		request: RPGShopBagUpgradeRequest,
		expected: RPGShopExpectedRevisions = {
			account: account.revision,
			bag: account.bag.revision,
			catalog: catalog.revision,
		},
		registry: RPGItemRegistry = RPGItems
	): RPGShopTradeResult {
		const actionId = request.actionId?.trim();
		if (!actionId) throw new Error('RPG Shop Bag upgrade requires actionId');
		const target = RPGBagSystem.getTierDefinition(request.targetTier);
		const previous = account.transactions.find(transaction => transaction.actionId === actionId);
		if (previous) {
			if (
				previous.shopId !== catalog.shopId || previous.type !== 'bag-upgrade' ||
				previous.bagTier !== target.id
			) {
				throw new Error('RPG Shop actionId was already used with different trade data');
			}
			return {
				account: structuredClone(account),
				catalog: structuredClone(catalog),
				transaction: structuredClone(previous),
				replayed: true,
			};
		}

		const checkedAccount = this.migrateAccount(account, registry);
		const checkedCatalog = this.migrateCatalog(catalog, registry);
		if (
			expected.account !== checkedAccount.revision ||
			expected.bag !== checkedAccount.bag.revision ||
			expected.catalog !== checkedCatalog.revision
		) {
			throw new Error('RPG Shop revision conflict');
		}
		const currentTierId = RPGBagSystem.getTier(checkedAccount.bag);
		if (!currentTierId) throw new Error('RPG Bag must use a priced tier before it can be upgraded');
		const current = RPGBagSystem.getTierDefinition(currentTierId);
		if (target.maxSlots <= current.maxSlots) throw new Error('RPG Bag upgrade must increase capacity');
		const targetOffer = checkedCatalog.bagUpgrades.find(offer => offer.tier === target.id);
		if (!targetOffer) throw new Error('RPG Shop does not offer Bag tier: ' + target.id);
		const currentUnlockPrice = current.id === 'starter' ? 0 :
			checkedCatalog.bagUpgrades.find(offer => offer.tier === current.id)?.unlockPrice;
		if (currentUnlockPrice === undefined) {
			throw new Error('RPG Shop cannot calculate the current Bag tier value');
		}
		const total = targetOffer.unlockPrice - currentUnlockPrice;
		if (!Number.isSafeInteger(total) || total < 1) throw new Error('RPG Shop Bag upgrade prices must increase by tier');
		if (checkedAccount.balance < total) throw new Error('Not enough Pokedollars');

		const nextBag = RPGBagSystem.upgradeToTier(checkedAccount.bag, target.id, expected.bag, registry);
		const transaction: RPGShopTransaction = {
			actionId,
			shopId: checkedCatalog.shopId,
			type: 'bag-upgrade',
			itemId: 'bagupgrade' + target.id,
			quantity: 1,
			bagTier: target.id,
			unitPrice: total,
			total,
			currency: 'pokedollar',
			accountRevision: checkedAccount.revision + 1,
			bagRevision: nextBag.revision,
			catalogRevision: checkedCatalog.revision + 1,
		};
		return {
			account: {
				...checkedAccount,
				revision: checkedAccount.revision + 1,
				balance: checkedAccount.balance - total,
				bag: nextBag,
				transactions: [...checkedAccount.transactions, transaction],
			},
			catalog: {
				...checkedCatalog,
				revision: checkedCatalog.revision + 1,
			},
			transaction: structuredClone(transaction),
			replayed: false,
		};
	}

	private static trade(
		type: 'buy' | 'sell',
		account: RPGShopAccountState,
		catalog: RPGShopCatalogState,
		request: RPGShopTradeRequest,
		expected: RPGShopExpectedRevisions,
		registry: RPGItemRegistry
	): RPGShopTradeResult {
		const actionId = request.actionId?.trim();
		if (!actionId) throw new Error('RPG Shop trade requires actionId');
		const itemId = RPGItemRegistry.normalizeId(request.itemId);
		if (!Number.isSafeInteger(request.quantity) || request.quantity < 1) {
			throw new Error('RPG Shop trade quantity must be a positive integer');
		}

		const previous = account.transactions.find(transaction => transaction.actionId === actionId);
		if (previous) {
			if (
				previous.shopId !== catalog.shopId || previous.type !== type ||
				previous.itemId !== itemId || previous.quantity !== request.quantity
			) {
				throw new Error('RPG Shop actionId was already used with different trade data');
			}
			return {
				account: structuredClone(account),
				catalog: structuredClone(catalog),
				transaction: structuredClone(previous),
				replayed: true,
			};
		}

		const checkedAccount = this.migrateAccount(account, registry);
		const checkedCatalog = this.migrateCatalog(catalog, registry);
		if (
			expected.account !== checkedAccount.revision ||
			expected.bag !== checkedAccount.bag.revision ||
			expected.catalog !== checkedCatalog.revision
		) {
			throw new Error('RPG Shop revision conflict');
		}
		const offerIndex = checkedCatalog.offers.findIndex(entry => entry.itemId === itemId);
		if (offerIndex < 0) throw new Error('RPG Shop does not trade item: ' + itemId);
		const offer = checkedCatalog.offers[offerIndex];
		const unitPrice = type === 'buy' ? offer.buyPrice : offer.sellPrice;
		if (unitPrice === undefined) {
			throw new Error('RPG Shop item cannot be ' + (type === 'buy' ? 'bought' : 'sold') + ': ' + itemId);
		}
		const total = unitPrice * request.quantity;
		this.validateMoney(total, 'trade total');

		let nextBag: RPGBagState;
		let nextBalance: number;
		let nextStock = offer.stock;
		if (type === 'buy') {
			if (offer.stock !== undefined && offer.stock < request.quantity) {
				throw new Error('RPG Shop does not have enough stock: ' + itemId);
			}
			if (checkedAccount.balance < total) throw new Error('Not enough Pokedollars');
			nextBag = RPGBagSystem.add(checkedAccount.bag, itemId, request.quantity, expected.bag, registry).bag;
			nextBalance = checkedAccount.balance - total;
			if (nextStock !== undefined) nextStock -= request.quantity;
		} else {
			nextBag = RPGBagSystem.remove(checkedAccount.bag, itemId, request.quantity, expected.bag, registry).bag;
			nextBalance = checkedAccount.balance + total;
			this.validateMoney(nextBalance, 'balance');
			if (nextStock !== undefined) {
				nextStock += request.quantity;
				if (!Number.isSafeInteger(nextStock)) throw new Error('RPG Shop stock limit exceeded');
			}
		}

		const transaction: RPGShopTransaction = {
			actionId,
			shopId: checkedCatalog.shopId,
			type,
			itemId,
			quantity: request.quantity,
			unitPrice,
			total,
			currency: 'pokedollar',
			accountRevision: checkedAccount.revision + 1,
			bagRevision: nextBag.revision,
			catalogRevision: checkedCatalog.revision + 1,
		};
		const nextOffers = structuredClone(checkedCatalog.offers);
		nextOffers[offerIndex] = { ...nextOffers[offerIndex], stock: nextStock };
		if (nextStock === undefined) delete nextOffers[offerIndex].stock;
		return {
			account: {
				...checkedAccount,
				revision: checkedAccount.revision + 1,
				balance: nextBalance,
				bag: nextBag,
				transactions: [...checkedAccount.transactions, transaction],
			},
			catalog: {
				...checkedCatalog,
				revision: checkedCatalog.revision + 1,
				offers: nextOffers,
			},
			transaction: structuredClone(transaction),
			replayed: false,
		};
	}

	private static normalizeOffer(offer: RPGShopOffer, registry: RPGItemRegistry): RPGShopOffer {
		const item = registry.require(offer.itemId);
		if (offer.buyPrice === undefined && offer.sellPrice === undefined) {
			throw new Error('RPG Shop offer requires buyPrice or sellPrice: ' + item.id);
		}
		if (offer.buyPrice !== undefined) this.validateMoney(offer.buyPrice, 'buy price');
		if (offer.sellPrice !== undefined) this.validateMoney(offer.sellPrice, 'sell price');
		if (offer.stock !== undefined && (!Number.isSafeInteger(offer.stock) || offer.stock < 0)) {
			throw new Error('RPG Shop stock must be a non-negative integer');
		}
		return {
			itemId: item.id,
			...(offer.buyPrice === undefined ? {} : { buyPrice: offer.buyPrice }),
			...(offer.sellPrice === undefined ? {} : { sellPrice: offer.sellPrice }),
			...(offer.stock === undefined ? {} : { stock: offer.stock }),
		};
	}

	private static normalizeBagUpgrade(offer: RPGShopBagUpgradeOffer): RPGShopBagUpgradeOffer {
		const tier = RPGBagSystem.getTierDefinition(offer.tier);
		this.validateMoney(offer.unlockPrice, 'Bag unlock price');
		if (tier.id === 'starter' || offer.unlockPrice < 1) {
			throw new Error('RPG Shop Bag upgrade requires a paid tier');
		}
		return { tier: tier.id, unlockPrice: offer.unlockPrice };
	}

	private static validateTransactions(transactions: readonly RPGShopTransaction[], registry: RPGItemRegistry): void {
		if (!Array.isArray(transactions)) throw new Error('RPG Shop account requires transactions');
		const actionIds = new Set<string>();
		for (const transaction of transactions) {
			if (!transaction.actionId?.trim() || actionIds.has(transaction.actionId)) {
				throw new Error('Invalid or duplicated RPG Shop actionId');
			}
			actionIds.add(transaction.actionId);
			if (!transaction.shopId?.trim() || !['buy', 'sell', 'bag-upgrade'].includes(transaction.type)) {
				throw new Error('Invalid RPG Shop transaction');
			}
			if (transaction.type === 'bag-upgrade') {
				const tier = transaction.bagTier && RPGBagSystem.getTierDefinition(transaction.bagTier);
				if (!tier || transaction.itemId !== 'bagupgrade' + tier.id || transaction.quantity !== 1) {
					throw new Error('Invalid RPG Shop Bag upgrade transaction');
				}
			} else {
				registry.require(transaction.itemId);
				if (transaction.bagTier !== undefined) throw new Error('Invalid Bag tier on RPG Shop item transaction');
			}
			if (!Number.isSafeInteger(transaction.quantity) || transaction.quantity < 1) {
				throw new Error('Invalid RPG Shop transaction quantity');
			}
			this.validateMoney(transaction.unitPrice, 'transaction unit price');
			this.validateMoney(transaction.total, 'transaction total');
			if (transaction.total !== transaction.unitPrice * transaction.quantity || transaction.currency !== 'pokedollar') {
				throw new Error('Invalid RPG Shop transaction total or currency');
			}
			for (const revision of [transaction.accountRevision, transaction.bagRevision, transaction.catalogRevision]) {
				if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid RPG Shop transaction revision');
			}
		}
	}

	private static validateMoney(value: number, label: string): void {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error('RPG Shop ' + label + ' must be a non-negative safe integer');
		}
	}
}
