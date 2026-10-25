'use strict';

/* global window, document, rpgRuntimeItemIcon */

(function () {
	let selectedShopId = null;
	let activeTab = 'buy';
	let activeFilter = 'all';
	let activeTypeFilter = 'all';
	let searchText = '';
	let shopSyncHandler = null;
	const cart = new Map();
	const trainerCart = new Map();
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
			id: item.itemId || item.id, icon: item.icon, sprite: item.sprite, name: item.name,
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
		if (shopSyncHandler) window.removeEventListener('rpg:realtime-sync', shopSyncHandler);
		const signature = current => JSON.stringify({ revision: current.shop.revision,
			trainerOffers: current.trainerOffers?.map(offer => [offer.itemId, offer.stock, offer.price,
				offer.sellPrice, offer.owned, offer.licenseActive, offer.canBuy, offer.canSell,
				offer.buyEnabled, offer.sellEnabled]) });
		const handler = async () => {
			if (!root.isConnected || selectedShopId !== view.shop.id) {
				window.removeEventListener('rpg:realtime-sync', handler);
				return;
			}
			try {
				const latest = await loadShop(options, view.shop.id);
				if (signature(latest) !== signature(view)) {
					const parent = root.parentElement;
					const parentScroll = parent?.scrollTop || 0;
					const pageScroll = window.scrollY;
					const updated = await render(options);
					if (!root.isConnected) return;
					root.replaceWith(updated);
					if (parent) parent.scrollTop = parentScroll;
					window.scrollTo(0, pageScroll);
				}
			} catch {}
		};
		shopSyncHandler = handler;
		window.addEventListener('rpg:realtime-sync', handler);
	}
	function maxQuantity(view, offer, tab) {
		if (tab === 'sell') return Math.max(0, offer.owned || 0);
		if (!offer.canBuy || !offer.buyPrice) return 0;
		const otherItemsCost = Array.from(cart.entries()).reduce((total, [itemId, quantity]) => {
			if (itemId === offer.itemId) return total;
			const otherOffer = view.offers.find(entry => entry.itemId === itemId);
			return total + Number(otherOffer?.buyPrice || 0) * quantity;
		}, 0);
		const trainerCost = view.shop.type === 'farm' ? [...trainerCart.entries()].reduce((total, [itemId, quantity]) => {
			const selected = view.trainerOffers?.find(entry => entry.itemId === itemId);
			return total + Number(selected?.price || 0) * quantity;
		}, 0) : 0;
		const availableMoney = Math.max(0, Number(view.money || 0) - otherItemsCost - trainerCost);
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
		const bindRepeater = (control, delta) => {
			let delayTimer = null;
			let repeatTimer = null;
			let releaseTimer = null;
			let handledPointer = false;
			const stop = () => {
				if (delayTimer !== null) window.clearTimeout(delayTimer);
				if (repeatTimer !== null) window.clearInterval(repeatTimer);
				delayTimer = null;
				repeatTimer = null;
			};
			const release = () => {
				stop();
				if (releaseTimer !== null) window.clearTimeout(releaseTimer);
				releaseTimer = window.setTimeout(() => { handledPointer = false; }, 0);
			};
			control.addEventListener('pointerdown', event => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.stopPropagation();
				handledPointer = true;
				if (releaseTimer !== null) window.clearTimeout(releaseTimer);
				update(delta);
				if (control.disabled) return;
				if (typeof control.setPointerCapture === 'function') control.setPointerCapture(event.pointerId);
				delayTimer = window.setTimeout(() => {
					repeatTimer = window.setInterval(() => {
						if (control.disabled) {
							stop();
							return;
						}
						update(delta);
					}, 60);
				}, 280);
			});
			for (const eventName of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) {
				control.addEventListener(eventName, release);
			}
			control.addEventListener('click', event => {
				event.stopPropagation();
				if (handledPointer) {
					event.preventDefault();
					handledPointer = false;
					return;
				}
				update(delta);
			});
		};
		bindRepeater(minus, -1);
		bindRepeater(plus, 1);
		sync();
		row.append(minus, value, plus);
		return row;
	}
	function shopDirectory(directory, options) {
		const root = el('div', 'shop-ui');
		const masterDirectory = options.isMaster && !options.characterId;
		const heading = el('section', 'panel shop-directory-heading' + (masterDirectory ? ' master-section-heading' : ''));
		if (masterDirectory) {
			const copy = el('div');
			copy.append(el('span', 'nursery-eyebrow', 'COMÉRCIO DA CAMPANHA'));
			copy.append(el('h1', '', 'Lojas'));
			copy.append(el('p', '', 'Gerencie estoques, preços e o acesso dos jogadores.'));
			heading.append(copy, el('span', 'master-section-status', 'Visão do Mestre'));
		} else {
			heading.append(el('h1', '', 'Lojas'));
		}
		const grid = el('div', 'shop-directory-grid');
		for (const shop of directory.shops) {
			const blocked = shop.allowed === false;
			const card = button('', 'panel shop-directory-card shop-type-' + shop.type + (blocked ? ' blocked' : ''));
			const copy = el('span', 'shop-directory-copy');
			copy.append(el('strong', '', shop.name), el('small', '', shop.description));
			if (blocked) copy.append(el('span', 'shop-directory-blocked-label', 'Indisponível'));
			card.append(copy);
			card.disabled = blocked;
			card.setAttribute('aria-disabled', String(blocked));
			card.addEventListener('click', () => {
				selectedShopId = shop.id;
				activeTab = options.isMaster ? 'admin' : 'buy';
				activeFilter = 'all';
				activeTypeFilter = 'all';
				searchText = '';
				cart.clear();
				trainerCart.clear();
				void options.refresh();
			});
			grid.append(card);
		}
		root.append(heading, grid);
		return root;
	}
	function shopHeader(view, options) {
		const masterShop = options.isMaster && !options.characterId;
		const header = el('section', 'panel shop-header' + (masterShop ? ' master-section-heading' : ''));
		const back = button('‹ Lojas', 'button shop-back');
		back.addEventListener('click', () => {
			selectedShopId = null;
			cart.clear();
			trainerCart.clear();
			if (shopSyncHandler) window.removeEventListener('rpg:realtime-sync', shopSyncHandler);
			void options.refresh();
		});
		const title = el('div', 'shop-title');
		title.append(el('p', masterShop ? 'nursery-eyebrow' : 'eyebrow', view.shop.type.toUpperCase()), el('h1', '', view.shop.name),
			el('p', '', view.shop.description));
		header.append(back, title);
		if (view.money !== undefined) header.append(el('strong', 'shop-money', money(view.money)));
		return header;
	}
	function trainerEquipmentSection(view, options, onCartChange) {
		const masterShop = options.isMaster && !options.characterId;
		const section = el('div', 'shop-trainer-section');
		if (view.shop.type === 'farm' && !masterShop) {
			section.append(el('h2', 'panel shop-trainer-heading', 'Alimentos'));
		}
		const offers = view.trainerOffers || [];
		if (masterShop) {
			const panel = el('section', 'panel shop-master');
			const rowControls = new Map();
			const heading = el('div', 'shop-master-heading');
			const title = el('div');
			title.append(el('p', 'eyebrow', 'FERRAMENTAS DO MESTRE'),
				el('h2', '', view.shop.type === 'farm' ? 'Alimentos' : 'Estoque compartilhado'));
			const bulk = el('div', 'shop-master-bulk');
			const bulkGroups = [
				[['+', 'increase-stock', 'success', 'Adicionar uma unidade aos itens disponíveis para venda'],
					['−', 'decrease-stock', 'danger', 'Remover uma unidade dos itens disponíveis para venda']],
				[['Vender', 'enable-buy', 'success', 'Habilitar a venda de todos os itens'],
					['Vender', 'disable-buy', 'danger', 'Desabilitar a venda de todos os itens']],
				[['Comprar', 'enable-sell', 'success', 'Habilitar a compra de todos os itens'],
					['Comprar', 'disable-sell', 'danger', 'Desabilitar a compra de todos os itens']],
				[['Preço', 'increase-prices', 'success', 'Definir os preços em 110% do valor-base'],
					['Preço', 'decrease-prices', 'danger', 'Definir os preços em 90% do valor-base']],
				[['Reset', 'reset-prices', 'neutral', 'Restaurar todos os preços-base']],
			];
			for (const group of bulkGroups) {
				const pair = el('div', 'shop-bulk-group' + (group.length === 1 ? ' single' : ''));
				for (const [label, action, tone, description] of group) {
					const control = button(label, 'shop-bulk-button ' + tone);
					control.title = description;
					control.setAttribute('aria-label', description);
					control.addEventListener('click', async () => {
						control.disabled = true;
						try {
							const updated = await options.api('/trainer/equipment/offer/bulk', {
								method: 'POST', body: { shopId: view.shop.id, action },
							});
							for (const latest of updated) {
								const offer = offers.find(item => item.itemId === latest.itemId);
								if (offer) Object.assign(offer, latest);
								rowControls.get(latest.itemId)?.(latest);
							}
							options.toast('Todos os itens desta loja foram atualizados.');
						} catch (error) { options.toast(error.message, true); }
						control.disabled = false;
					});
					pair.append(control);
				}
				bulk.append(pair);
			}
			heading.append(title, bulk);
			const list = el('div', 'shop-master-stock');
			panel.append(heading, list);
			for (const offer of offers) {
				const row = el('article', 'shop-stock-row');
				const copy = el('div', 'shop-stock-description');
				copy.append(el('strong', '', offer.name), el('p', '', `${offer.weight} kg · ${offer.category}`));
				const stock = el('input', 'shop-stock-number');
				stock.type = 'number'; stock.min = '0'; stock.max = '100000'; stock.value = String(offer.stock);
				stock.setAttribute('aria-label', 'Estoque de ' + offer.name);
				const price = el('input', 'shop-price-input');
				price.type = 'number'; price.min = '0'; price.max = '10000000'; price.value = String(offer.price);
				price.setAttribute('aria-label', 'Preço de venda de ' + offer.name);
				const sellPrice = el('input', 'shop-price-input');
				sellPrice.type = 'number'; sellPrice.min = '0'; sellPrice.max = '10000000';
				sellPrice.value = String(offer.sellPrice);
				sellPrice.setAttribute('aria-label', 'Preço de compra de ' + offer.name);
				const buyEnabled = el('input'); buyEnabled.type = 'checkbox'; buyEnabled.checked = !!offer.buyEnabled;
				const sellEnabled = el('input'); sellEnabled.type = 'checkbox'; sellEnabled.checked = !!offer.sellEnabled;
				const toggle = (input, label, priceInput) => {
					const wrapper = el('label', 'shop-stock-toggle');
					const state = el('span', 'shop-toggle-name');
					const update = () => {
						state.textContent = label + ': ' + (input.checked ? 'Sim' : 'Não');
						state.classList.toggle('enabled', input.checked);
						state.classList.toggle('disabled', !input.checked);
					};
					input.addEventListener('change', update);
					update();
					wrapper.append(input, state, priceInput);
					return { wrapper, update };
				};
				const sellControl = toggle(buyEnabled, 'Vender', price);
				const buyControl = toggle(sellEnabled, 'Comprar', sellPrice);
				const applyOffer = latest => {
					stock.value = String(latest.stock);
					price.value = String(latest.price);
					sellPrice.value = String(latest.sellPrice);
					buyEnabled.checked = !!latest.buyEnabled;
					sellEnabled.checked = !!latest.sellEnabled;
					sellControl.update();
					buyControl.update();
				};
				rowControls.set(offer.itemId, applyOffer);
				const save = button('Resetar preços', 'button shop-row-reset');
				const saveOffer = async () => {
					for (const control of [stock, price, sellPrice, buyEnabled, sellEnabled, save]) control.disabled = true;
					try {
						const updated = await options.api('/trainer/equipment/offer', { method: 'POST', body: {
							shopId: view.shop.id, itemId: offer.itemId,
							stock: Number(stock.value), price: Number(price.value), sellPrice: Number(sellPrice.value),
							buyEnabled: buyEnabled.checked, sellEnabled: sellEnabled.checked,
						} });
						Object.assign(offer, updated, { canBuy: updated.buyEnabled && updated.stock > 0,
							canSell: updated.sellEnabled });
						applyOffer(offer);
						options.toast('Estoque atualizado.');
					} catch (error) {
						options.toast(error.message, true);
						applyOffer(offer);
					}
					for (const control of [stock, price, sellPrice, buyEnabled, sellEnabled, save]) control.disabled = false;
				};
				for (const control of [stock, price, sellPrice, buyEnabled, sellEnabled]) {
					control.addEventListener('change', () => void saveOffer());
				}
				save.addEventListener('click', () => {
					price.value = String(offer.basePrice);
					sellPrice.value = String(offer.baseSellPrice);
					void saveOffer();
				});
				const stockWrap = el('label', 'shop-stock-quantity');
				stockWrap.append(el('span', '', 'Qtd.'), stock);
				row.append(itemIcon(offer), copy, stockWrap, sellControl.wrapper, buyControl.wrapper, save);
				list.append(row);
			}
			section.append(panel);
			return section;
		}
		const tools = el('div', 'panel shop-tools');
		const search = el('input', 'shop-search');
		search.type = 'search'; search.placeholder = 'Buscar item...'; search.value = searchText;
		tools.append(search);
		const list = el('section', 'panel shop-item-list');
		const cartPanel = view.shop.type === 'farm' ? null : el('section', 'panel shop-cart');
		section.append(tools, list);
		if (cartPanel) section.append(cartPanel);
		const visible = offers.filter(offer => activeTab === 'buy' ? offer.canBuy : offer.canSell && offer.owned > 0);
		const buy = activeTab === 'buy';
		const unitPrice = offer => Number(buy ? offer.price : offer.sellPrice);
		const maxQuantity = offer => {
			if (!buy) return Math.min(offer.instances?.[0]?.quantity || 0, 99);
			const otherCost = [...trainerCart.entries()].reduce((sum, [itemId, quantity]) => {
				if (itemId === offer.itemId) return sum;
				const selected = offers.find(item => item.itemId === itemId);
				return sum + Number(selected?.price || 0) * quantity;
			}, 0);
			const berryCost = view.shop.type === 'farm' ? [...cart.entries()].reduce((sum, [itemId, quantity]) => {
				const selected = view.offers.find(item => item.itemId === itemId);
				return sum + Number(selected?.buyPrice || 0) * quantity;
			}, 0) : 0;
			return Math.min(offer.stock, Math.floor(Math.max(0, Number(view.money || 0) - otherCost - berryCost) /
				unitPrice(offer)), 99);
		};
		const renderCart = () => {
			if (!cartPanel) { onCartChange(); return; }
			cartPanel.replaceChildren();
			const lines = [...trainerCart.entries()].map(([itemId, quantity]) => ({ offer: offers.find(item => item.itemId === itemId), quantity }))
				.filter(line => line.offer && line.quantity > 0);
			const top = el('div', 'shop-cart-top');
			top.append(el('strong', '', buy ? 'Carrinho de compra' : 'Itens para vender'));
			if (!lines.length) {
				top.append(el('span', 'shop-cart-empty', 'Nenhum item selecionado.'));
				cartPanel.append(top);
				return;
			}
			const total = lines.reduce((sum, line) => sum + unitPrice(line.offer) * line.quantity, 0);
			top.append(el('span', 'shop-cart-summary', lines.reduce((sum, line) => sum + line.quantity, 0) + ' itens · ' + money(total)));
			const confirm = button(buy ? 'Confirmar compra' : 'Confirmar venda', 'button primary');
			confirm.addEventListener('click', async () => {
				confirm.disabled = true;
				try {
					let currentView = view;
					for (const line of lines) {
						await options.api('/trainer/equipment', { method: 'POST', body: {
							action: buy ? 'buy' : 'sell', characterId: options.characterId,
							expectedRevision: currentView.equipmentRevision, shopId: view.shop.id,
							...(buy ? { itemId: line.offer.itemId } : { instanceId: line.offer.instances?.[0]?.id }),
							quantity: line.quantity,
						} });
						trainerCart.delete(line.offer.itemId);
						if (lines.length > 1) currentView = await loadShop(options, view.shop.id);
					}
					options.toast(buy ? 'Compra concluída.' : 'Venda concluída.');
					await options.refresh();
				} catch (error) { options.toast(error.message, true); await options.refresh(); }
			});
			top.append(confirm);
			const grid = el('div', 'shop-cart-grid');
			for (const line of lines) {
				const card = el('div', 'shop-cart-item');
				card.append(itemIcon(line.offer), el('strong', '', line.offer.name),
					el('span', '', '×' + line.quantity), el('b', '', money(unitPrice(line.offer) * line.quantity)));
				grid.append(card);
			}
			cartPanel.append(top, grid);
		};
		const renderItems = () => {
			list.replaceChildren();
			const filtered = visible.filter(offer => offer.name.toLowerCase().includes(search.value.trim().toLowerCase()));
			if (!filtered.length) list.append(el('div', 'shop-empty', buy ?
				'Nenhum produto disponível neste filtro.' : 'Você não possui itens aceitos por esta loja.'));
			for (const offer of filtered) {
				const card = el('article', 'shop-item-card' + (buy && !offer.licenseActive ? ' locked' : ''));
				const main = el('div', 'shop-item-main');
				const copy = el('span', 'shop-item-copy');
				const description = `${offer.weight} kg · ${offer.category}` + (buy && !offer.licenseActive ? ' · Licença necessária' : '');
				copy.append(el('strong', '', offer.name), el('small', '', description));
				const meta = el('span', 'shop-item-meta');
				meta.append(el('span', '', buy ? 'Possui: ×' + offer.owned : 'Na Bag: ×' + offer.owned));
				if (buy) meta.append(el('span', '', 'Estoque: ×' + offer.stock));
				meta.append(el('b', '', money(unitPrice(offer))));
				main.append(itemIcon(offer), copy, meta);
				card.append(main);
				if (!buy || offer.licenseActive) {
					const quantity = el('div', 'shop-quantity');
					const minus = button('−', 'shop-quantity-button');
					const value = el('strong', 'shop-quantity-value', String(trainerCart.get(offer.itemId) || 0));
					const plus = button('+', 'shop-quantity-button');
					const update = delta => {
						const next = Math.max(0, Math.min(maxQuantity(offer), (trainerCart.get(offer.itemId) || 0) + delta));
						if (next) trainerCart.set(offer.itemId, next);
						else trainerCart.delete(offer.itemId);
						value.textContent = String(next); minus.disabled = !next; plus.disabled = next >= maxQuantity(offer);
						renderCart();
					};
					minus.addEventListener('click', () => update(-1));
					plus.addEventListener('click', () => update(1));
					minus.disabled = !trainerCart.get(offer.itemId);
					plus.disabled = (trainerCart.get(offer.itemId) || 0) >= maxQuantity(offer);
					quantity.append(minus, value, plus);
					card.append(quantity);
				}
				list.append(card);
			}
			renderCart();
		};
		search.addEventListener('input', renderItems);
		renderItems();
		return section;
	}
	function trainerCatalogPage(view, options) {
		const root = el('div', 'shop-ui');
		root.append(shopHeader(view, options));
		if (!(options.isMaster && !options.characterId)) {
			const tabs = el('div', 'panel shop-tabs');
			for (const [id, label] of [['buy', 'COMPRAR'], ['sell', 'VENDER']]) {
				const tab = button(label, 'shop-tab' + (activeTab === id ? ' active' : ''));
				tab.addEventListener('click', () => { activeTab = id; trainerCart.clear(); void options.refresh(); });
				tabs.append(tab);
			}
			root.append(tabs);
		}
		root.append(trainerEquipmentSection(view, options));
		watchShop(root, view, options);
		return root;
	}
	function catalogPage(view, options) {
		const root = el('div', 'shop-ui');
		root.append(shopHeader(view, options));
		if (options.isMaster && !options.characterId) {
			root.append(masterAdministration(view, options));
			if (view.shop.type === 'farm') root.append(trainerEquipmentSection(view, options));
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
				trainerCart.clear();
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
		function eligible(offer) {
			if (activeTab === 'buy') return !!offer.buyEnabled && offer.stock > 0;
			return !!offer.sellEnabled && offer.owned > 0;
		}
		function renderCart() {
			cartPanel.replaceChildren();
			const lines = [...cart.entries()].map(([itemId, quantity]) => ({
				offer: view.offers.find(item => item.itemId === itemId), quantity,
			})).filter(entry => entry.offer && entry.quantity > 0);
			const equipmentLines = view.shop.type === 'farm' ? [...trainerCart.entries()]
				.map(([itemId, quantity]) => ({ offer: view.trainerOffers?.find(item => item.itemId === itemId), quantity }))
				.filter(entry => entry.offer && entry.quantity > 0) : [];
			const allLines = [...lines.map(entry => ({ ...entry, equipment: false })),
				...equipmentLines.map(entry => ({ ...entry, equipment: true }))];
			const priceOf = entry => Number(entry.equipment ?
				(activeTab === 'buy' ? entry.offer.price : entry.offer.sellPrice) :
				(activeTab === 'buy' ? entry.offer.buyPrice : entry.offer.sellPrice));
			const total = allLines.reduce((sum, entry) => sum + priceOf(entry) * entry.quantity, 0);
			const top = el('div', 'shop-cart-top');
			top.append(el('strong', '', activeTab === 'buy' ? 'Carrinho de compra' : 'Itens para vender'));
			if (!allLines.length) {
				top.append(el('span', 'shop-cart-empty', 'Nenhum item selecionado.'));
				cartPanel.append(top);
				return;
			}
			const summary = el('span', 'shop-cart-summary',
				allLines.reduce((sum, entry) => sum + entry.quantity, 0) + ' itens · ' + money(total));
			const confirm = button(activeTab === 'buy' ? 'Confirmar compra' : 'Confirmar venda', 'button primary');
			top.append(summary, confirm);
			const grid = el('div', 'shop-cart-grid');
			for (const entry of allLines) {
				const price = priceOf(entry);
				const originalPrice = entry.equipment ? price : Number(activeTab === 'buy' ?
					entry.offer.buyPriceBeforeTalent : entry.offer.sellPriceBeforeTalent);
				const talent = entry.equipment ? null : activeTab === 'buy' ? entry.offer.buyTalent : entry.offer.sellTalent;
				const card = el('div', 'shop-cart-item');
				card.append(itemIcon(entry.offer), el('strong', '', entry.offer.name),
					el('span', '', '×' + entry.quantity), el('b', '', money(price * entry.quantity)));
				if (talent && originalPrice !== price) {
					card.append(el('span', 'shop-cart-benefit', talent + ': ' +
					money(originalPrice * entry.quantity) + ' → ' + money(price * entry.quantity)));
				}
				grid.append(card);
			}
			confirm.addEventListener('click', async () => {
				confirm.disabled = true;
				try {
					await options.api('/shops/' + encodeURIComponent(view.shop.id) +
						(view.shop.type === 'farm' ? '/farm-cart' : '/trade') + characterQuery(options), {
						method: 'POST',
						body: {
							actionId: 'shop-' + Date.now() + '-' + Math.random().toString(36).slice(2),
							type: activeTab,
							lines: lines.map(entry => ({ itemId: entry.offer.itemId, quantity: entry.quantity })),
							...(view.shop.type === 'farm' ? {
								equipmentRevision: view.equipmentRevision,
								equipmentLines: equipmentLines.map(entry => ({ itemId: entry.offer.itemId,
									quantity: entry.quantity, ...(activeTab === 'sell' ? { instanceId: entry.offer.instances?.[0]?.id } : {}) })),
							} : {}),
							expectedAccountRevision: view.accountRevision,
							expectedBagRevision: view.bagRevision,
							expectedCatalogRevision: view.shop.revision,
						},
					});
					cart.clear();
					trainerCart.clear();
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
		if (view.shop.type === 'farm') root.append(trainerEquipmentSection(view, options, renderCart));
		root.append(cartPanel);
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
				['+', 'increase-stock', 'success', 'Adicionar uma unidade aos itens disponíveis para venda'],
				['−', 'decrease-stock', 'danger', 'Remover uma unidade dos itens disponíveis para venda'],
			],
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
						const updated = await options.api('/shops/' + encodeURIComponent(view.shop.id) + '/master-bulk', {
							method: 'POST', body: { action, expectedRevision: view.shop.revision },
						});
						view.shop.revision = updated.shop.revision;
						view.offers = updated.offers;
						panel.replaceWith(masterAdministration(view, options));
						options.toast('Todos os itens desta loja foram atualizados.');
					} catch (error) {
						options.toast(error.message, true);
						control.disabled = false;
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
				controls.stock.value = String(offer.stock);
				controls.sellPrice.value = String(offer.buyPrice || 0);
				controls.buyPrice.value = String(offer.sellPrice || 0);
				controls.sellToPlayer.checked = !!offer.buyEnabled;
				controls.buyFromPlayer.checked = !!offer.sellEnabled;
				for (const [input, label] of [[controls.sellToPlayer, 'Vender'], [controls.buyFromPlayer, 'Comprar']]) {
					const state = input.closest('label').querySelector('.shop-toggle-name');
					state.textContent = label + ': ' + (input.checked ? 'Sim' : 'Não');
					state.classList.toggle('enabled', input.checked);
					state.classList.toggle('disabled', !input.checked);
				}
			} finally {
				for (const control of Object.values(controls)) control.disabled = false;
			}
		}
		for (const offer of view.offers) {
			const scientistOnly = /^player(?:potion|antidote|awakening|burnheal|iceheal|paralyzeheal|superpotion|hyperpotion|fullheal|maxpotion|fullrestore)$/.test(offer.itemId);
			const row = el('article', 'shop-stock-row');
			const description = el('div', 'shop-stock-description');
			description.append(el('strong', '', offer.name), el('p', '', offer.description || 'Sem descrição.'));
			const stock = el('input', 'shop-stock-number');
			stock.type = 'number'; stock.min = '0'; stock.value = String(offer.stock);
			stock.setAttribute('aria-label', 'Quantidade disponível de ' + offer.name);
			const sellToPlayer = el('input'); sellToPlayer.type = 'checkbox'; sellToPlayer.checked =
				!scientistOnly && !!offer.buyEnabled;
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
			const controls = { stock, sellToPlayer, buyFromPlayer, sellPrice, buyPrice, reset };
			sellToPlayer.addEventListener('change', () => {
				syncToggle(sellToPlayer, sellState, 'Vender');
				void saveOffer(offer, controls);
			});
			buyFromPlayer.addEventListener('change', () => {
				syncToggle(buyFromPlayer, buyState, 'Comprar');
				void saveOffer(offer, controls);
			});
			for (const control of scientistOnly ? [buyPrice] : [stock, sellPrice, buyPrice]) {
				control.addEventListener('change', () => void saveOffer(offer, controls));
			}
			reset.addEventListener('click', () => void saveOffer(offer, controls, true));
			const stockWrap = el('label', 'shop-stock-quantity');
			stockWrap.append(el('span', '', 'Qtd.'), stock);
			row.append(itemIcon(offer), description);
			if (scientistOnly) {
				const stockSpace = el('span', 'shop-stock-quantity shop-stock-placeholder');
				const sellSpace = el('span', 'shop-stock-toggle shop-stock-placeholder');
				stockSpace.setAttribute('aria-hidden', 'true');
				sellSpace.setAttribute('aria-hidden', 'true');
				row.append(stockSpace, sellSpace);
			} else row.append(stockWrap, sellControl);
			row.append(buyControl, reset);
			list.append(row);
		}
		return panel;
	}
	async function render(options) {
		if (shopSyncHandler) window.removeEventListener('rpg:realtime-sync', shopSyncHandler);
		const directory = await options.api('/shops' + characterQuery(options));
		if (!selectedShopId) return shopDirectory(directory, options);
		const exists = directory.shops.some(shop => shop.id === selectedShopId);
		if (!exists) selectedShopId = null;
		if (!selectedShopId) return shopDirectory(directory, options);
		const view = await loadShop(options, selectedShopId);
		return view.shop.type.startsWith('trainer-') ? trainerCatalogPage(view, options) : catalogPage(view, options);
	}
	window.RPGShopUI = { render };
}());
