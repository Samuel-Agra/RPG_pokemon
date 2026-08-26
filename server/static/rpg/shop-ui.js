'use strict';

/* global window, document, rpgRuntimeItemIcon */

(function () {
	let selectedShopId = null;
	let activeTab = 'buy';
	let activeFilter = 'all';
	let activeTypeFilter = 'all';
	let searchText = '';
	let syncTimer = null;
	const cart = new Map();
	const scrollPositions = new Map();

	const money = value => new Intl.NumberFormat('pt-BR').format(Number(value) || 0) + ' ₽';
	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const button = (text, className = 'button') => {
		const node = el('button', className, text);
		node.type = 'button';
		return node;
	};
	function itemIcon(item) {
		const frame = el('span', 'shop-item-icon');
		const runtime = typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon({
			id: item.itemId || item.id, icon: item.icon, name: item.name,
		}) : null;
		if (runtime) {
			runtime.classList.add('shop-item-glyph');
			frame.append(runtime);
		} else {
			frame.textContent = '◆';
			frame.classList.add('fallback');
		}
		return frame;
	}
	function characterQuery(options) {
		return options.characterId ? '?characterId=' + encodeURIComponent(options.characterId) : '';
	}
	async function loadShop(options, shopId) {
		return options.api('/shops/' + encodeURIComponent(shopId) + characterQuery(options));
	}
	function watchShop(root, view, options) {
		if (syncTimer) window.clearTimeout(syncTimer);
		const check = async () => {
			if (!root.isConnected || selectedShopId !== view.shop.id) return;
			try {
				const latest = await loadShop(options, view.shop.id);
				if (latest.shop.revision !== view.shop.revision) {
					await options.refresh();
					return;
				}
			} catch {}
			syncTimer = window.setTimeout(check, 800);
		};
		syncTimer = window.setTimeout(check, 800);
	}
	function maxQuantity(view, offer, tab) {
		if (tab === 'sell') return Math.max(0, offer.owned || 0);
		if (!offer.canBuy || !offer.buyPrice) return 0;
		const otherItemsCost = Array.from(cart.entries()).reduce((total, [itemId, quantity]) => {
			if (itemId === offer.itemId) return total;
			const otherOffer = view.offers.find(entry => entry.itemId === itemId);
			return total + Number(otherOffer?.buyPrice || 0) * quantity;
		}, 0);
		const availableMoney = Math.max(0, Number(view.money || 0) - otherItemsCost);
		return Math.max(0, Math.min(offer.stock || 0, Math.floor(availableMoney / offer.buyPrice), 99));
	}
	function quantityControl(view, offer, tab, onChange) {
		const row = el('div', 'shop-quantity');
		const minus = button('−', 'shop-quantity-button');
		const value = el('strong', 'shop-quantity-value', String(cart.get(offer.itemId) || 0));
		const plus = button('+', 'shop-quantity-button');
		const sync = () => {
			const current = cart.get(offer.itemId) || 0;
			value.textContent = String(current);
			minus.disabled = !current;
			plus.disabled = current >= maxQuantity(view, offer, tab);
		};
		const update = delta => {
			const current = cart.get(offer.itemId) || 0;
			const next = Math.max(0, Math.min(maxQuantity(view, offer, tab), current + delta));
			if (next) cart.set(offer.itemId, next);
			else cart.delete(offer.itemId);
			sync();
			onChange();
		};
		minus.addEventListener('click', event => { event.stopPropagation(); update(-1); });
		plus.addEventListener('click', event => { event.stopPropagation(); update(1); });
		sync();
		row.append(minus, value, plus);
		return row;
	}
	function shopDirectory(directory, options) {
		const root = el('div', 'shop-ui');
		const heading = el('section', 'panel shop-directory-heading');
		heading.append(el('p', 'eyebrow', 'COMÉRCIO DA CAMPANHA'), el('h1', '', 'Lojas'),
			el('p', '', 'Onde deseja ir? Cada estabelecimento possui catálogo e estoque próprios.'));
		const grid = el('div', 'shop-directory-grid');
		for (const shop of directory.shops) {
			const card = button('', 'panel shop-directory-card shop-type-' + shop.type);
			const copy = el('span', 'shop-directory-copy');
			copy.append(el('strong', '', shop.name), el('small', '', shop.description));
			const stock = el('span', 'shop-directory-stock',
				shop.availableItemTypes + (shop.availableItemTypes === 1 ? ' produto disponível' : ' produtos disponíveis'));
			card.append(copy, stock);
			card.addEventListener('click', () => {
				selectedShopId = shop.id;
				activeTab = options.isMaster ? 'admin' : 'buy';
				activeFilter = 'all';
				activeTypeFilter = 'all';
				searchText = '';
				cart.clear();
				void options.refresh();
			});
			grid.append(card);
		}
		root.append(heading, grid);
		return root;
	}
	function shopHeader(view, options) {
		const header = el('section', 'panel shop-header');
		const back = button('‹ Lojas', 'button shop-back');
		back.addEventListener('click', () => {
			selectedShopId = null;
			cart.clear();
			if (syncTimer) window.clearTimeout(syncTimer);
			void options.refresh();
		});
		const title = el('div', 'shop-title');
		title.append(el('p', 'eyebrow', view.shop.type.toUpperCase()), el('h1', '', view.shop.name),
			el('p', '', view.shop.description));
		header.append(back, title);
		if (view.money !== undefined) header.append(el('strong', 'shop-money', money(view.money)));
		return header;
	}
	function catalogPage(view, options) {
		const root = el('div', 'shop-ui');
		root.append(shopHeader(view, options));
		if (options.isMaster && !options.characterId) {
			root.append(masterAdministration(view, options));
			watchShop(root, view, options);
			return root;
		}
		const tabs = el('div', 'panel shop-tabs');
		for (const [id, label] of [['buy', 'COMPRAR'], ['sell', 'VENDER']]) {
			const tab = button(label, 'shop-tab' + (activeTab === id ? ' active' : ''));
			tab.addEventListener('click', () => {
				activeTab = id;
				activeFilter = 'all';
				activeTypeFilter = 'all';
				cart.clear();
				void options.refresh();
			});
			tabs.append(tab);
		}
		const tools = el('div', 'panel shop-tools');
		const search = el('input', 'shop-search');
		search.type = 'search';
		search.placeholder = 'Buscar item...';
		search.value = searchText;
		search.addEventListener('input', () => {
			searchText = search.value;
			renderItems();
		});
		tools.append(search);
		if (view.filters.length) {
			const filter = el('select', 'shop-filter');
			filter.append(new Option('Todos os efeitos', 'all'));
			for (const category of view.filters) filter.append(new Option(category, category));
			filter.value = activeFilter;
			filter.addEventListener('change', () => {
				activeFilter = filter.value;
				renderItems();
			});
			tools.append(filter);
		}
		if (view.shop.type === 'tm' && view.typeFilters?.length) {
			const typeFilter = el('select', 'shop-filter');
			typeFilter.append(new Option('Todos os tipos', 'all'));
			for (const type of view.typeFilters) typeFilter.append(new Option(type, type));
			typeFilter.value = activeTypeFilter;
			typeFilter.addEventListener('change', () => {
				activeTypeFilter = typeFilter.value;
				renderItems();
			});
			tools.append(typeFilter);
		}
		const list = el('section', 'panel shop-item-list');
		const scrollKey = view.shop.id + ':' + activeTab;
		list.addEventListener('scroll', () => scrollPositions.set(scrollKey, list.scrollTop));
		root.append(tabs, tools, list);
		const cartPanel = el('section', 'panel shop-cart');
		root.append(cartPanel);
		function eligible(offer) {
			if (activeTab === 'buy') return !!offer.buyEnabled;
			return !!offer.sellEnabled && offer.owned > 0;
		}
		function renderCart() {
			cartPanel.replaceChildren();
			const lines = [...cart.entries()].map(([itemId, quantity]) => ({
				offer: view.offers.find(item => item.itemId === itemId), quantity,
			})).filter(entry => entry.offer && entry.quantity > 0);
			const total = lines.reduce((sum, entry) => sum +
				Number(activeTab === 'buy' ? entry.offer.buyPrice : entry.offer.sellPrice) * entry.quantity, 0);
			const top = el('div', 'shop-cart-top');
			top.append(el('strong', '', activeTab === 'buy' ? 'Carrinho de compra' : 'Itens para vender'));
			if (!lines.length) {
				top.append(el('span', 'shop-cart-empty', 'Nenhum item selecionado.'));
				cartPanel.append(top);
				return;
			}
			const summary = el('span', 'shop-cart-summary',
				lines.reduce((sum, entry) => sum + entry.quantity, 0) + ' itens · ' + money(total));
			const confirm = button(activeTab === 'buy' ? 'Confirmar compra' : 'Confirmar venda', 'button primary');
			top.append(summary, confirm);
			const grid = el('div', 'shop-cart-grid');
			for (const entry of lines) {
				const price = Number(activeTab === 'buy' ? entry.offer.buyPrice : entry.offer.sellPrice);
				const card = el('div', 'shop-cart-item');
				card.append(itemIcon(entry.offer), el('strong', '', entry.offer.name),
					el('span', '', '×' + entry.quantity), el('b', '', money(price * entry.quantity)));
				grid.append(card);
			}
			confirm.addEventListener('click', async () => {
				confirm.disabled = true;
				try {
					await options.api('/shops/' + encodeURIComponent(view.shop.id) + '/trade' + characterQuery(options), {
						method: 'POST',
						body: {
							actionId: 'shop-' + Date.now() + '-' + Math.random().toString(36).slice(2),
							type: activeTab,
							lines: lines.map(entry => ({itemId: entry.offer.itemId, quantity: entry.quantity})),
							expectedAccountRevision: view.accountRevision,
							expectedBagRevision: view.bagRevision,
							expectedCatalogRevision: view.shop.revision,
						},
					});
					cart.clear();
					options.toast(activeTab === 'buy' ? 'Compra concluída.' : 'Venda concluída.');
					await options.refresh();
				} catch (error) {
					options.toast(error.message, true);
					await options.refresh();
				}
			});
			cartPanel.append(top, grid);
		}
		function renderItems() {
			const query = searchText.trim().toLowerCase();
			const visible = view.offers.filter(offer => eligible(offer) &&
				(activeFilter === 'all' || offer.effectGroup === activeFilter) &&
				(activeTypeFilter === 'all' || offer.effectType === activeTypeFilter) &&
				(!query || offer.name.toLowerCase().includes(query))
			);
			list.replaceChildren();
			if (!visible.length) {
				list.append(el('div', 'shop-empty', activeTab === 'buy' ?
					'Nenhum produto disponível neste filtro.' : 'Você não possui itens aceitos por esta loja.'));
			}
			for (const offer of visible) {
				const card = el('article', 'shop-item-card' + (!offer.canBuy && activeTab === 'buy' ? ' locked' : ''));
				const main = el('div', 'shop-item-main');
				const copy = el('span', 'shop-item-copy');
				copy.append(el('strong', '', offer.name), el('small', '', offer.description || ''));
				const meta = el('span', 'shop-item-meta');
				if (activeTab === 'buy') {
					meta.append(el('span', '', 'Possui: ×' + offer.owned),
						el('span', '', 'Estoque: ×' + offer.stock),
						el('b', '', money(offer.buyPrice)));
				} else {
					meta.append(el('span', '', 'Na Bag: ×' + offer.owned), el('b', '', money(offer.sellPrice)));
				}
				main.append(itemIcon(offer), copy, meta);
				card.append(main);
				if (!(activeTab === 'buy' && !offer.canBuy)) {
					card.append(quantityControl(view, offer, activeTab, renderCart));
				}
				list.append(card);
			}
			window.requestAnimationFrame(() => { list.scrollTop = scrollPositions.get(scrollKey) || 0; });
			renderCart();
		}
		renderItems();
		watchShop(root, view, options);
		return root;
	}
	function masterAdministration(view, options) {
		const panel = el('section', 'panel shop-master');
		const heading = el('div', 'shop-master-heading');
		const title = el('div');
		title.append(el('p', 'eyebrow', 'FERRAMENTAS DO MESTRE'), el('h2', '', 'Estoque compartilhado'));
		const bulk = el('div', 'shop-master-bulk');
		const bulkGroups = [
			[
				['Vender', 'enable-buy', 'success', 'Habilitar a venda de todos os itens'],
				['Vender', 'disable-buy', 'danger', 'Desabilitar a venda de todos os itens'],
			],
			[
				['Comprar', 'enable-sell', 'success', 'Habilitar a compra de todos os itens'],
				['Comprar', 'disable-sell', 'danger', 'Desabilitar a compra de todos os itens'],
			],
			[
				['Preço', 'increase-prices', 'success', 'Definir os preços em 110% do valor-base'],
				['Preço', 'decrease-prices', 'danger', 'Definir os preços em 90% do valor-base'],
			],
			[
				['Reset', 'reset-prices', 'neutral', 'Restaurar todos os preços-base'],
			],
		];
		for (const group of bulkGroups) {
			const pair = el('div', 'shop-bulk-group' + (group.length === 1 ? ' single' : ''));
			for (const [label, action, tone, tooltip] of group) {
				const control = button(label, 'shop-bulk-button ' + tone);
				control.title = tooltip;
				control.setAttribute('aria-label', tooltip);
				control.addEventListener('click', async () => {
					control.disabled = true;
					try {
						await options.api('/shops/' + encodeURIComponent(view.shop.id) + '/master-bulk', {
							method: 'POST', body: {action, expectedRevision: view.shop.revision},
						});
						options.toast('Todos os itens desta loja foram atualizados.');
						await options.refresh();
					} catch (error) {
						options.toast(error.message, true);
						await options.refresh();
					}
				});
				pair.append(control);
			}
			bulk.append(pair);
		}
		heading.append(title, bulk);
		panel.append(heading);
		const list = el('div', 'shop-master-stock');
		panel.append(list);
		async function saveOffer(offer, controls, reset = false) {
			const body = {
				itemId: offer.itemId,
				stock: Number(controls.stock.value || 0),
				buyEnabled: controls.sellToPlayer.checked,
				sellEnabled: controls.buyFromPlayer.checked,
				buyPrice: reset ? offer.baseBuyPrice : Number(controls.sellPrice.value || 0),
				sellPrice: reset ? offer.baseSellPrice : Number(controls.buyPrice.value || 0),
				expectedRevision: view.shop.revision,
			};
			for (const control of Object.values(controls)) control.disabled = true;
			try {
				const result = await options.api('/shops/' + encodeURIComponent(view.shop.id) + '/master-offer', {
					method: 'POST', body,
				});
				view.shop.revision = result.shop.revision;
				offer.stock = body.stock;
				offer.buyEnabled = body.buyEnabled;
				offer.sellEnabled = body.sellEnabled;
				offer.buyPrice = body.buyPrice;
				offer.sellPrice = body.sellPrice;
				controls.sellPrice.value = String(body.buyPrice);
				controls.buyPrice.value = String(body.sellPrice);
			} catch (error) {
				options.toast(error.message, true);
				await options.refresh();
			} finally {
				for (const control of Object.values(controls)) control.disabled = false;
			}
		}
		for (const offer of view.offers) {
			const row = el('article', 'shop-stock-row');
			const description = el('div', 'shop-stock-description');
			description.append(el('strong', '', offer.name), el('p', '', offer.description || 'Sem descrição.'));
			const stock = el('input', 'shop-stock-number');
			stock.type = 'number'; stock.min = '0'; stock.value = String(offer.stock);
			stock.setAttribute('aria-label', 'Quantidade disponível de ' + offer.name);
			const sellToPlayer = el('input'); sellToPlayer.type = 'checkbox'; sellToPlayer.checked = !!offer.buyEnabled;
			const buyFromPlayer = el('input'); buyFromPlayer.type = 'checkbox'; buyFromPlayer.checked = !!offer.sellEnabled;
			const sellPrice = el('input', 'shop-price-input'); sellPrice.type = 'number'; sellPrice.min = '0';
			sellPrice.value = String(offer.buyPrice || 0);
			const buyPrice = el('input', 'shop-price-input'); buyPrice.type = 'number'; buyPrice.min = '0';
			buyPrice.value = String(offer.sellPrice || 0);
			const sellControl = el('label', 'shop-stock-toggle');
			const sellState = el('span', 'shop-toggle-name');
			sellControl.append(sellToPlayer, sellState, sellPrice);
			const buyControl = el('label', 'shop-stock-toggle');
			const buyState = el('span', 'shop-toggle-name');
			buyControl.append(buyFromPlayer, buyState, buyPrice);
			const syncToggle = (input, state, label) => {
				state.textContent = label + ': ' + (input.checked ? 'Sim' : 'Não');
				state.classList.toggle('enabled', input.checked);
				state.classList.toggle('disabled', !input.checked);
			};
			syncToggle(sellToPlayer, sellState, 'Vender');
			syncToggle(buyFromPlayer, buyState, 'Comprar');
			const reset = button('Resetar preços', 'button shop-row-reset');
			const controls = {stock, sellToPlayer, buyFromPlayer, sellPrice, buyPrice, reset};
			sellToPlayer.addEventListener('change', () => {
				syncToggle(sellToPlayer, sellState, 'Vender');
				void saveOffer(offer, controls);
			});
			buyFromPlayer.addEventListener('change', () => {
				syncToggle(buyFromPlayer, buyState, 'Comprar');
				void saveOffer(offer, controls);
			});
			for (const control of [stock, sellPrice, buyPrice]) {
				control.addEventListener('change', () => void saveOffer(offer, controls));
			}
			reset.addEventListener('click', () => void saveOffer(offer, controls, true));
			const stockWrap = el('label', 'shop-stock-quantity');
			stockWrap.append(el('span', '', 'Qtd.'), stock);
			row.append(itemIcon(offer), description, stockWrap, sellControl, buyControl, reset);
			list.append(row);
		}
		return panel;
	}
	async function render(options) {
		if (syncTimer) window.clearTimeout(syncTimer);
		const directory = await options.api('/shops');
		if (!selectedShopId) return shopDirectory(directory, options);
		const exists = directory.shops.some(shop => shop.id === selectedShopId);
		if (!exists) selectedShopId = null;
		if (!selectedShopId) return shopDirectory(directory, options);
		const view = await loadShop(options, selectedShopId);
		return catalogPage(view, options);
	}
	window.RPGShopUI = {render};
}());
