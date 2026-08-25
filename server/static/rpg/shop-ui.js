'use strict';

/* global window, document, rpgRuntimeItemIcon */

(function () {
	let selectedShopId = null;
	let activeTab = 'buy';
	let activeFilter = 'all';
	let searchText = '';
	let detailItemId = null;
	const cart = new Map();

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
				searchText = '';
				detailItemId = null;
				cart.clear();
				void options.refresh();
			});
			grid.append(card);
		}
		root.append(heading, grid);
		return root;
	}
	function detailsPanel(offer, tab) {
		const panel = el('aside', 'panel shop-details');
		if (!offer) {
			panel.append(el('h3', '', 'Detalhes do item'), el('p', '', 'Selecione um item para consultar suas informações.'));
			return panel;
		}
		const head = el('div', 'shop-details-head');
		head.append(itemIcon(offer), el('div', '', ''));
		head.lastChild.append(el('h3', '', offer.name), el('span', 'shop-category-label', offer.category));
		panel.append(head, el('p', 'shop-details-description', offer.description || 'Sem descrição.'));
		panel.append(el('dl', 'shop-details-data'));
		const data = panel.lastChild;
		const add = (label, value) => {
			data.append(el('dt', '', label), el('dd', '', value));
		};
		add('Possui', '×' + offer.owned);
		add('Estoque', '×' + offer.stock);
		const price = tab === 'sell' ? offer.sellPrice : offer.buyPrice;
		add(tab === 'sell' ? 'Valor de venda' : 'Preço', price === undefined ? 'Indisponível' : money(price));
		return panel;
	}
	function catalogPage(view, options) {
		const root = el('div', 'shop-ui');
		const header = el('section', 'panel shop-header');
		const back = button('‹ Lojas', 'button shop-back');
		back.addEventListener('click', () => {
			selectedShopId = null;
			cart.clear();
			void options.refresh();
		});
		const title = el('div', 'shop-title');
		title.append(el('p', 'eyebrow', view.shop.type.toUpperCase()), el('h1', '', view.shop.name),
			el('p', '', view.shop.description));
		header.append(back, title);
		if (view.money !== undefined) header.append(el('strong', 'shop-money', money(view.money)));
		root.append(header);
		if (options.isMaster && !options.characterId) {
			root.append(masterAdministration(view, options));
			return root;
		}
		const tabs = el('div', 'panel shop-tabs');
		for (const [id, label] of [['buy', 'COMPRAR'], ['sell', 'VENDER']]) {
			const tab = button(label, 'shop-tab' + (activeTab === id ? ' active' : ''));
			tab.addEventListener('click', () => {
				activeTab = id;
				activeFilter = 'all';
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
		const filter = el('select', 'shop-filter');
		filter.append(new Option('Todos', 'all'));
		for (const category of view.filters) filter.append(new Option(category, category));
		filter.value = activeFilter;
		filter.addEventListener('change', () => {
			activeFilter = filter.value;
			renderItems();
		});
		tools.append(search, filter);
		const layout = el('div', 'shop-catalog-layout');
		const list = el('section', 'panel shop-item-list');
		const side = el('div', 'shop-side');
		layout.append(list, side);
		root.append(tabs, tools, layout);
		const cartPanel = el('section', 'panel shop-cart');
		root.append(cartPanel);
		function eligible(offer) {
			if (activeTab === 'buy') return offer.buyVisible;
			return offer.canSell && offer.owned > 0;
		}
		function renderCart() {
			cartPanel.replaceChildren();
			const lines = [...cart.entries()].map(([itemId, quantity]) => ({
				offer: view.offers.find(item => item.itemId === itemId), quantity,
			})).filter(entry => entry.offer && entry.quantity > 0);
			const total = lines.reduce((sum, entry) => sum +
				Number(activeTab === 'buy' ? entry.offer.buyPrice : entry.offer.sellPrice) * entry.quantity, 0);
			cartPanel.append(el('strong', '', activeTab === 'buy' ? 'Carrinho de compra' : 'Itens para vender'));
			if (!lines.length) {
				cartPanel.append(el('span', 'shop-cart-empty', 'Nenhum item selecionado.'));
				return;
			}
			const summary = el('span', 'shop-cart-summary',
				lines.reduce((sum, entry) => sum + entry.quantity, 0) + ' itens · ' + money(total));
			const confirm = button(activeTab === 'buy' ? 'Confirmar compra' : 'Confirmar venda', 'button primary');
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
			cartPanel.append(summary, confirm);
		}
		function renderItems() {
			const query = searchText.trim().toLowerCase();
			const visible = view.offers.filter(offer => eligible(offer) &&
				(activeFilter === 'all' || offer.category === activeFilter) &&
				(!query || offer.name.toLowerCase().includes(query))
			);
			list.replaceChildren();
			if (!visible.length) {
				list.append(el('div', 'shop-empty', activeTab === 'buy' ?
					'Nenhum produto disponível neste filtro.' : 'Você não possui itens aceitos por esta loja.'));
			}
			for (const offer of visible) {
				const card = el('article', 'shop-item-card' + (offer.buyLocked ? ' locked' : ''));
				const main = el('button', 'shop-item-main');
				main.type = 'button';
				const copy = el('span', 'shop-item-copy');
				copy.append(el('strong', '', offer.name), el('small', '', offer.description || ''));
				const meta = el('span', 'shop-item-meta');
				if (activeTab === 'buy') {
					meta.append(el('span', '', 'Possui: ×' + offer.owned),
						el('span', '', offer.buyLocked ? 'Bloqueado' : 'Estoque: ×' + offer.stock),
						el('b', '', offer.buyPrice === undefined ? 'Indisponível' : money(offer.buyPrice)));
				} else {
					meta.append(el('span', '', 'Na Bag: ×' + offer.owned),
						el('b', '', offer.sellPrice === undefined ? 'Não aceito' : money(offer.sellPrice)));
				}
				main.append(itemIcon(offer), copy, meta);
				main.addEventListener('click', () => {
					detailItemId = offer.itemId;
					side.replaceChildren(detailsPanel(offer, activeTab));
				});
				card.append(main);
				if (!(activeTab === 'buy' && offer.buyLocked)) {
					card.append(quantityControl(view, offer, activeTab, renderCart));
				}
				list.append(card);
			}
			const selected = view.offers.find(offer => offer.itemId === detailItemId && eligible(offer)) || visible[0];
			side.replaceChildren(detailsPanel(selected, activeTab));
			renderCart();
		}
		renderItems();
		return root;
	}
	function masterAdministration(view, options) {
		const panel = el('section', 'panel shop-master');
		const heading = el('div', 'shop-master-heading');
		heading.append(el('div', '', ''));
		heading.firstChild.append(el('p', 'eyebrow', 'FERRAMENTAS DO MESTRE'),
			el('h2', '', 'Estoque compartilhado'));
		heading.append(el('span', '', view.offers.length + ' itens configurados'));
		panel.append(heading);
		const body = el('div', 'shop-master-layout');
		const list = el('div', 'shop-master-offers');
		const editor = el('form', 'shop-master-editor');
		body.append(list, editor);
		panel.append(body);
		const candidateById = new Map(view.candidates.map(item => [item.id, item]));
		function editForm(offer) {
			editor.replaceChildren();
			const title = el('h3', '', offer ? 'Editar oferta' : 'Adicionar item');
			const itemSelect = el('select');
			for (const candidate of view.candidates) {
				itemSelect.append(new Option(candidate.name + ' · ' + candidate.category, candidate.id));
			}
			itemSelect.value = offer?.itemId || view.candidates[0]?.id || '';
			itemSelect.disabled = !!offer;
			const buyEnabled = el('input'); buyEnabled.type = 'checkbox'; buyEnabled.checked = offer ? offer.buyPrice !== undefined : true;
			const sellEnabled = el('input'); sellEnabled.type = 'checkbox'; sellEnabled.checked = offer ? offer.sellPrice !== undefined : true;
			const buyPrice = el('input'); buyPrice.type = 'number'; buyPrice.min = '0';
			const sellPrice = el('input'); sellPrice.type = 'number'; sellPrice.min = '0';
			const stock = el('input'); stock.type = 'number'; stock.min = '0'; stock.value = String(offer?.stock || 0);
			const mode = el('select');
			mode.append(new Option('Disponível', 'available'), new Option('Visível, mas bloqueado', 'locked'),
				new Option('Oculto quando bloqueado', 'hidden'));
			mode.value = offer?.buyMode || 'available';
			function suggested() {
				const candidate = candidateById.get(itemSelect.value);
				if (!offer) {
					buyPrice.value = candidate?.recommendedBuyPrice ?? '';
					sellPrice.value = candidate?.recommendedSellPrice ?? '';
				}
			}
			if (offer) {
				buyPrice.value = offer.buyPrice ?? '';
				sellPrice.value = offer.sellPrice ?? '';
			} else suggested();
			itemSelect.addEventListener('change', suggested);
			const field = (label, control) => {
				const wrap = el('label', 'shop-master-field');
				wrap.append(el('span', '', label), control);
				return wrap;
			};
			const buyToggle = el('label', 'shop-master-check');
			buyToggle.append(buyEnabled, el('span', '', 'Loja vende ao Player'));
			const sellToggle = el('label', 'shop-master-check');
			sellToggle.append(sellEnabled, el('span', '', 'Loja compra do Player'));
			const actions = el('div', 'shop-master-actions');
			const save = button('Salvar oferta', 'button primary');
			save.type = 'submit';
			actions.append(save);
			if (offer) {
				const remove = button('Remover', 'button danger');
				remove.addEventListener('click', async () => {
					if (!window.confirm('Remover este item do estabelecimento?')) return;
					await submit({itemId: offer.itemId, remove: true});
				});
				actions.prepend(remove);
			}
			editor.append(title, field('Item', itemSelect), buyToggle, field('Preço de compra', buyPrice),
				field('Estoque global', stock), field('Exibição', mode), sellToggle,
				field('Preço pago ao Player', sellPrice), actions);
			editor.addEventListener('submit', async event => {
				event.preventDefault();
				await submit({
					itemId: itemSelect.value,
					stock: Number(stock.value),
					buyMode: mode.value,
					buyEnabled: buyEnabled.checked,
					sellEnabled: sellEnabled.checked,
					...(buyPrice.value === '' ? {} : {buyPrice: Number(buyPrice.value)}),
					...(sellPrice.value === '' ? {} : {sellPrice: Number(sellPrice.value)}),
				});
			});
		}
		async function submit(payload) {
			try {
				await options.api('/shops/' + encodeURIComponent(view.shop.id) + '/master-offer', {
					method: 'POST', body: {...payload, expectedRevision: view.shop.revision},
				});
				options.toast('Estoque da loja atualizado.');
				await options.refresh();
			} catch (error) {
				options.toast(error.message, true);
				await options.refresh();
			}
		}
		for (const offer of view.offers) {
			const row = button('', 'shop-master-offer');
			row.append(itemIcon(offer));
			const copy = el('span');
			copy.append(el('strong', '', offer.name), el('small', '',
				'Estoque ×' + offer.stock + ' · Compra ' +
				(offer.buyPrice === undefined ? 'não' : money(offer.buyPrice)) + ' · Venda ' +
				(offer.sellPrice === undefined ? 'não' : money(offer.sellPrice))));
			row.append(copy);
			row.addEventListener('click', () => editForm(offer));
			list.append(row);
		}
		if (!view.offers.length) list.append(el('p', 'shop-empty', 'Nenhum item configurado.'));
		editForm(null);
		return panel;
	}
	async function render(options) {
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
