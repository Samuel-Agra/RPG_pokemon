'use strict';

/* global document, window, rpgRuntimeItemIcon, rpgRuntimeSprite */
/* eslint-disable require-atomic-updates */

(function () {
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function makeButton(text, className = 'button') {
		const node = el('button', className, text);
		node.type = 'button';
		return node;
	}

	function itemIcon(item, className = '') {
		const frame = el('span', 'bag-ui-item-icon' + (className ? ' ' + className : ''));
		if (item.loaded && typeof window.rpgPortableIncubatorVisual === 'function') {
			frame.append(window.rpgPortableIncubatorVisual(true, 'bag-ui-item-glyph'));
			return frame;
		}
		const icon = typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(item) : null;
		if (icon) {
			icon.classList.add('bag-ui-item-glyph');
			frame.append(icon);
		} else if (!item.tags?.includes('mission')) {
			frame.classList.add('fallback');
			frame.textContent = '◆';
		} else {
			frame.classList.add('no-sprite');
		}
		return frame;
	}

	let activeDialogGroup = null;
	function closeDialogGroup() {
		if (!activeDialogGroup) return;
		document.removeEventListener('pointerdown', activeDialogGroup.outsideHandler);
		window.removeEventListener('resize', activeDialogGroup.positionAll);
		activeDialogGroup.layer.remove();
		activeDialogGroup = null;
	}
	function closeDialogFrom(dialog) {
		const group = dialog.group;
		const index = group.dialogs.indexOf(dialog);
		if (index < 0) return;
		for (const current of group.dialogs.splice(index)) current.card.remove();
		if (!group.dialogs.length) closeDialogGroup();
	}
	function positionDialog(dialog) {
		if (!dialog.card.isConnected) return;
		const gap = 10;
		const width = dialog.card.offsetWidth;
		const height = dialog.card.offsetHeight;
		let left;
		let top;
		if (dialog.parent?.card.isConnected) {
			const parentRect = dialog.parent.card.getBoundingClientRect();
			left = parentRect.right + gap;
			top = parentRect.top;
			if (left + width > window.innerWidth - 8) left = parentRect.left - width - gap;
			if (left < 8) {
				left = Math.max(8, Math.min(parentRect.left, window.innerWidth - width - 8));
				top = parentRect.bottom + gap;
				if (top + height > window.innerHeight - 8) top = Math.max(70, parentRect.top - height - gap);
			}
		} else {
			const reference = dialog.anchorRect || {
				left: 16, right: 16, top: 90, bottom: 90, width: 0, height: 0,
			};
			left = reference.right + gap;
			if (left + width > window.innerWidth - 8) left = reference.left - width - gap;
			top = reference.top + (reference.height - height) / 2;
		}
		dialog.card.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
		dialog.card.style.top = Math.max(70, Math.min(top, window.innerHeight - height - 8)) + 'px';
	}
	function createDialog(className = '', parent = null, anchor = null) {
		if (!parent || !activeDialogGroup || parent.group !== activeDialogGroup) {
			closeDialogGroup();
			const layer = el('div', 'bag-ui-window-layer');
			const group = {
				layer, dialogs: [], outsideHandler: null,
				positionAll: () => group.dialogs.forEach(positionDialog),
			};
			group.outsideHandler = event => {
				if (group.dialogs.some(dialog => dialog.card.contains(event.target))) return;
				closeDialogGroup();
			};
			activeDialogGroup = group;
			document.body.append(layer);
			window.addEventListener('resize', group.positionAll);
			window.setTimeout(() => {
				if (activeDialogGroup === group) document.addEventListener('pointerdown', group.outsideHandler);
			}, 0);
		} else {
			const parentIndex = activeDialogGroup.dialogs.indexOf(parent);
			for (const current of activeDialogGroup.dialogs.splice(parentIndex + 1)) current.card.remove();
		}
		const card = el('section', 'bag-ui-dialog-card bag-ui-side-window' + (className ? ' ' + className : ''));
		const rect = anchor?.getBoundingClientRect?.() || anchor;
		const dialog = {
			card, parent, group: activeDialogGroup,
			anchorRect: rect ? {
				left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
				width: rect.width, height: rect.height,
			} : null,
			overlay: { remove: () => closeDialogFrom(dialog) },
			closeAll: closeDialogGroup,
		};
		activeDialogGroup.dialogs.push(dialog);
		activeDialogGroup.layer.append(card);
		window.requestAnimationFrame(() => positionDialog(dialog));
		return dialog;
	}

	function dialogHeading(card, title, close) {
		const heading = el('div', 'bag-ui-dialog-heading');
		heading.append(el('h2', '', title));
		const closeButton = makeButton('×', 'bag-ui-close');
		closeButton.setAttribute('aria-label', 'Fechar');
		closeButton.addEventListener('click', close);
		heading.append(closeButton);
		card.append(heading);
		return heading;
	}

	function hpClass(target) {
		if (target.hp <= 0) return 'fainted';
		const ratio = target.maxHP ? target.hp / target.maxHP : 0;
		return ratio <= 0.2 ? 'critical' : ratio <= 0.5 ? 'warning' : 'healthy';
	}

	function pokemonTarget(target, onChoose) {
		const card = makeButton('', 'bag-ui-pokemon-target');
		card.disabled = !target.eligible;
		const sprite = el('span', 'bag-ui-pokemon-sprite');
		sprite.append(rpgRuntimeSprite({ species: target.species, shiny: target.shiny }, false, true));
		const info = el('span', 'bag-ui-pokemon-info');
		const identity = el('span', 'bag-ui-pokemon-name');
		identity.append(el('strong', '', target.name), el('small', '', target.species));
		const hp = el('span', 'bag-ui-pokemon-hp');
		hp.append(el('b', '', target.hp + ' / ' + target.maxHP + ' HP'));
		const track = el('span', 'bag-ui-hp-track');
		const fill = el('i', hpClass(target));
		fill.style.width = Math.max(0, Math.min(100, target.maxHP ? target.hp / target.maxHP * 100 : 0)) + '%';
		track.append(fill);
		hp.append(track);
		info.append(identity);
		if (target.status) info.append(el('span', 'bag-ui-status', target.status.toUpperCase()));
		info.append(hp);
		card.append(sprite, info);
		card.addEventListener('click', () => onChoose(target));
		return card;
	}

	function actionLabel(action, item) {
		if (action === 'favorite') return 'Favoritar';
		if (action === 'unfavorite') return 'Remover dos favoritos';
		if (action === 'move-to-mission') return 'Mover para Itens de Missão';
		if (action === 'remove-from-mission') return 'Retirar de Itens de Missão';
		if (action === 'edit-mission-note') return 'Alterar anotação';
		if (action === 'discard') return 'Descartar';
		if (action === 'give') return 'Dar para outro Player';
		if (action === 'equip') return 'Equipar';
		if (action === 'remove') return 'Remover';
		if (action === 'teach') return 'Ensinar';
		if (action === 'use' && item.registryCategory === 'evolution') return 'Usar';
		return action === 'use' ? 'Usar' : action;
	}

	const CATALOG_CATEGORIES = [
		['pokeballs', 'Poké Balls'], ['medicines', 'Medicamentos'],
		['held-items', 'Held Items'], ['evolution-items', 'Itens de Evolução'],
		['tms', 'TMs'], ['fossils', 'Fósseis'], ['treasures', 'Tesouros'],
		['mega-stones', 'Mega Pedras'], ['key-items', 'Itens-chave'],
		['mission-items', 'Itens de Missão'],
	];
	function catalogCategoryId(item) {
		if (item.tags?.includes('mission')) return 'mission-items';
		if (item.category === 'ball') return 'pokeballs';
		if (['healing', 'status', 'pp', 'revive'].includes(item.category)) return 'medicines';
		if (item.category === 'tm') return 'tms';
		if (item.category === 'evolution') return 'evolution-items';
		if (item.category === 'held') return item.tags?.includes('megastone') ? 'mega-stones' : 'held-items';
		if (item.category === 'key') return 'key-items';
		if (item.tags?.includes('fossil') || item.effect?.type === 'revive-fossil') return 'fossils';
		return 'treasures';
	}
	function catalogCategoryName(categoryId) {
		return CATALOG_CATEGORIES.find(category => category[0] === categoryId)?.[1] || categoryId;
	}
	function catalogCategoryPicker(items, onChoose) {
		const picker = el('div', 'bag-ui-catalog-categories');
		for (const [id, name] of CATALOG_CATEGORIES) {
			const count = items.filter(item => catalogCategoryId(item) === id).length;
			if (!count) continue;
			const choice = makeButton('', 'bag-ui-catalog-category');
			choice.append(el('strong', '', name), el('small', '', count + (count === 1 ? ' item' : ' itens')));
			choice.addEventListener('click', () => onChoose(id));
			picker.append(choice);
		}
		return picker;
	}

	async function render(options) {
		const root = el('div', 'bag-manager');
		let bagData = null;
		let activeCategory = null;
		let search = '';
		let loading = false;

		async function load() {
			if (loading) return;
			loading = true;
			if (!bagData) root.replaceChildren(el('div', 'panel loading-block', 'Abrindo a Bag...'));
			try {
				const data = await options.api('/bag?characterId=' + encodeURIComponent(options.characterId));
				closeDialogGroup();
				bagData = data.bag;
				if (!activeCategory && !search && bagData.categories.length) activeCategory = bagData.categories[0].id;
				renderShell();
			} catch (error) {
				root.replaceChildren(el('div', 'panel empty-state', error.message));
				options.toast(error.message, true);
			} finally {
				loading = false;
			}
		}

		function visibleItems() {
			const query = search.trim().toLowerCase();
			return (bagData.items || []).filter(item => {
				if (query && !item.name.toLowerCase().includes(query) && !item.id.includes(query.replace(/[^a-z0-9]/g, ''))) {
					return false;
				}
				if (!activeCategory || query) return true;
				return activeCategory === 'favorites' ? item.favorite : item.category === activeCategory;
			});
		}

		function renderSidebar() {
			const tierData = {
				starter: { sprite: 'starter', name: 'Bolsa de Ombro' },
				trainer: { sprite: 'trainer', name: 'Mochila Escolar' },
				adventurer: { sprite: 'adventurer', name: 'Mochila de Hiking' },
				expert: { sprite: 'expert', name: 'Mochila de Trekking' },
				master: { sprite: 'master', name: 'Mochila Cargueira Lateral' },
				legendary: { sprite: 'legendary', name: 'Mochila de Expedição Vertical' },
			};
			const tier = tierData[bagData.tier] || tierData.starter;
			const sidebar = el('aside', 'bag-ui-sidebar');
			const bagIdentity = el('div', 'bag-ui-bag-identity');
			const sprite = el('img', 'bag-ui-bag-sprite');
			sprite.src = '/rpg/assets/bags/' + tier.sprite + '.png';
			sprite.alt = tier.name;
			bagIdentity.append(
				sprite,
				el('small', 'bag-ui-capacity', bagData.capacity.usedSlots + ' / ' + (bagData.capacity.maxSlots || '∞') + ' tipos de itens'),
				el('div', 'bag-ui-pokecoins', 'Pokécoins: ' + new Intl.NumberFormat('pt-BR').format(bagData.money || 0) + ' ₽')
			);
			sidebar.append(bagIdentity);
			const navigation = el('nav', 'bag-ui-category-list');
			for (const category of bagData.categories) {
				const categoryButton = makeButton('', 'bag-ui-category-link' + (activeCategory === category.id ? ' active' : ''));
				categoryButton.append(el('strong', '', category.name));

				categoryButton.addEventListener('click', () => {
					activeCategory = category.id;
					search = '';
					renderShell();
				});
				navigation.append(categoryButton);
			}
			sidebar.append(navigation);
			return sidebar;
		}

		function renderItems(content) {
			const heading = el('div', 'bag-ui-list-heading');
			const category = bagData.categories.find(entry => entry.id === activeCategory);
			heading.append(el('h2', '', search ? 'Resultados da pesquisa' : category?.name || 'Itens'));
			content.append(heading);
			const items = visibleItems();
			if (!items.length) {
				content.append(el('p', 'empty-state bag-ui-empty', 'Nenhum item encontrado.'));
				return;
			}
			const list = el('div', 'bag-ui-item-grid');
			for (const item of items) {
				const card = makeButton('', 'bag-ui-item');
				const name = el('span', 'bag-ui-item-name');
				name.append(el('strong', '', item.name));
				card.append(itemIcon(item), name, el('b', 'bag-ui-quantity', '×' + item.quantity));
				if (item.favorite) card.append(el('span', 'bag-ui-favorite-mark', '★'));
				card.addEventListener('click', () => showItemDetails(item, card));
				list.append(card);
			}
			content.append(list);
		}

		function renderMasterTools(content) {
			if (!options.isMaster) return;
			const panel = el('section', 'bag-ui-master-tools');
			const text = el('div');
			text.append(el('strong', '', 'Ferramentas do Mestre'), el('small', '', 'Administre esta Bag sem sair da visualização do Player.'));
			const actions = el('div', 'bag-ui-master-actions');
			const manage = makeButton('Adicionar ou remover itens', 'button');
			manage.addEventListener('click', () => void showQuantityManager(manage));
			const create = makeButton('Criar Item de Missão', 'button');
			create.addEventListener('click', () => void showCustomItemCreator(create));
			actions.append(manage, create);
			panel.append(text, actions);
			content.append(panel);
		}

		function renderMainContent(content) {
			content.replaceChildren();
			if (bagData.itemUseLocked) {
				content.append(el(
					'div', 'bag-ui-use-lock',
					bagData.itemUseLockReason || 'Os itens não podem ser usados neste momento.'
				));
			}
			if (search.trim() || activeCategory) {
				renderItems(content);
			} else {
				const empty = el('div', 'bag-ui-category-prompt');
				empty.append(
					el('strong', '', 'Escolha uma categoria'),
					el('span', '', 'Os itens aparecerão aqui.')
				);
				content.append(empty);
			}
			renderMasterTools(content);
		}

		function renderShell() {
			root.replaceChildren();
			const panel = el('section', 'panel bag-ui-panel');
			const header = el('header', 'bag-ui-header');
			const title = el('div');
			title.append(el('small', '', 'Inventário'), el('h1', '', 'Bag'));
			header.append(title);

			const workspace = el('div', 'bag-ui-workspace');
			const main = el('div', 'bag-ui-main');
			const searchBar = el('label', 'bag-ui-search');
			searchBar.append(el('span', '', 'Pesquisar'));
			const input = el('input');
			input.type = 'search';
			input.placeholder = 'Nome do item';
			input.value = search;
			const content = el('div', 'bag-ui-content');
			input.addEventListener('input', () => {
				search = input.value;
				renderMainContent(content);
			});
			searchBar.append(input);
			main.append(searchBar, content);
			workspace.append(renderSidebar(), main);
			panel.append(header, workspace);
			root.append(panel);
			renderMainContent(content);
		}

		async function toggleFavorite(item) {
			try {
				await options.api('/bag/favorite', {
					method: 'POST', body: {
						characterId: options.characterId, itemId: item.id,
						favorite: !item.favorite, expectedRevision: bagData.revision,
					},
				});
				options.toast(item.favorite ? 'Item removido dos favoritos.' : 'Item adicionado aos favoritos.');
				await load();
			} catch (error) {
				options.toast(error.message, true);
			}
		}

		async function toggleMission(item, mission, quantity, note) {
			try {
				await options.api('/bag/mission', {
					method: 'POST', body: {
						characterId: options.characterId, itemId: item.id,
						mission, expectedRevision: bagData.revision,
						...(quantity === undefined ? {} : { quantity }),
						...(note === undefined ? {} : { note }),
						...(item.linkedEggId ? {linkedEggId: item.linkedEggId} : {}),
					},
				});
				options.toast(mission ? 'Item movido para Itens de Missão.' : 'Item retirado dos Itens de Missão.');
				await load();
				return true;
			} catch (error) {
				options.toast(error.message, true);
				return false;
			}
		}

		function showMoveToMission(item, parentDialog) {
			const dialog = createDialog('', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Mover para Itens de Missão', close);
			const content = el('div', 'bag-ui-transfer-content');
			const noteLabel = el('label', 'bag-ui-mission-note-field');
			const note = el('textarea');
			note.maxLength = 1000;
			note.rows = 5;
			note.placeholder = 'Escreva uma anotação para este Item de Missão.';
			noteLabel.append(el('strong', '', 'Anotação'), note);
			content.append(noteLabel);
			content.append(el('p', '', 'Quantidade de ' + item.name + ' que será separada como item de missão:'));
			const quantity = quantityInput(item.quantity);
			const actions = el('div', 'bag-ui-dialog-inline-actions');
			const confirm = makeButton('Mover', 'button primary');
			const cancel = makeButton('Cancelar', 'button');
			cancel.addEventListener('click', close);
			confirm.addEventListener('click', async () => {
				confirm.disabled = true;
				if (await toggleMission(item, true, Number(quantity.value), note.value)) close();
				else confirm.disabled = false;
			});
			actions.append(confirm, cancel);
			content.append(quantity, actions);
			dialog.card.append(content);
		}

		function showItemDetails(item, itemAnchor) {
			const dialog = createDialog('bag-ui-item-dialog', null, itemAnchor);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, item.name, close);
			const summary = el('div', 'bag-ui-detail-summary');
			const identity = el('div');
			identity.append(el('strong', '', item.name), el('small', '', item.registryCategory));
			summary.append(itemIcon(item, 'large'), identity, el('b', '', '×' + item.quantity));
			dialog.card.append(summary, el('p', 'bag-ui-description', item.description));
			if (item.mission && item.missionNote) {
				const annotation = el('div', 'bag-ui-mission-note');
				annotation.append(el('strong', '', 'Anotação'), el('p', '', item.missionNote));
				dialog.card.append(annotation);
			}
			if (item.equippedIn?.length) {
				const equipped = el('div', 'bag-ui-equipped');
				equipped.append(el('strong', '', 'Equipado em'));
				for (const pokemon of item.equippedIn) equipped.append(el('span', '', pokemon.name));
				dialog.card.append(equipped);
			}
			const actions = el('div', 'bag-ui-detail-actions');
			for (const action of item.actions || []) {
				const actionButton = makeButton(actionLabel(action, item), action === 'use' || action === 'equip' || action === 'teach' ? 'button primary' : 'button');
				actionButton.addEventListener('click', () => {
					if (action === 'favorite' || action === 'unfavorite') {
						close();
						void toggleFavorite(item);
					} else if (action === 'move-to-mission') {
						showMoveToMission(item, dialog);
					} else if (action === 'remove-from-mission') {
						close();
						void toggleMission(item, false, item.quantity);
					} else if (action === 'edit-mission-note') {
						showEditMissionNote(item, dialog);
					} else if (action === 'discard') {
						void showDiscard(item, dialog);
					} else if (action === 'give') {
						void showGive(item, dialog);
					} else if (action === 'teach') {
						const rect = itemAnchor?.getBoundingClientRect();
						const anchorRect = rect ? {
							left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
							width: rect.width, height: rect.height,
						} : undefined;
						close();
						void options.openTM(item, anchorRect);
					} else if (action === 'use' && item.registryCategory === 'evolution') {
						const rect = itemAnchor?.getBoundingClientRect();
						const anchorRect = rect ? {
							left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
							width: rect.width, height: rect.height,
						} : undefined;
						close();
						void options.openEvolution(item, anchorRect);
					} else if (action === 'equip') {
						void showTargets(item, 'equip', dialog);
					} else if (action === 'remove') {
						void showRemoveTargets(item, dialog);
					} else if (action === 'use' && item.registryCategory === 'ball') {
						options.toast('Use Poké Balls durante uma batalha selvagem.');
					} else if (action === 'use') {
						void showTargets(item, 'use', dialog);
					}
				});
				actions.append(actionButton);
			}
			if (options.isMaster && item.mission) {
				const delivered = makeButton('Entregue', 'button primary');
				delivered.addEventListener('click', () => {
					void showMissionReward(item, dialog);
				});
				actions.append(delivered);
			}
			const cancel = makeButton('Cancelar', 'button');
			cancel.addEventListener('click', close);
			actions.append(cancel);
			dialog.card.append(actions);
		}

		function showEditMissionNote(item, parentDialog) {
			const dialog = createDialog('', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Anotação de ' + item.name, close);
			const form = el('form', 'bag-ui-mission-note-form');
			const note = el('textarea');
			note.maxLength = 1000;
			note.rows = 7;
			note.placeholder = 'Escreva uma anotação para este Item de Missão.';
			note.value = item.missionNote || '';
			const counter = el('small', 'bag-ui-note-counter');
			const updateCounter = () => { counter.textContent = note.value.length + ' / 1000'; };
			note.addEventListener('input', updateCounter);
			updateCounter();
			const actions = el('div', 'bag-ui-dialog-inline-actions');
			const save = makeButton('Salvar', 'button primary');
			save.type = 'submit';
			const cancel = makeButton('Cancelar', 'button');
			cancel.addEventListener('click', close);
			actions.append(save, cancel);
			form.append(note, counter, actions);
			dialog.card.append(form);
			form.addEventListener('submit', async event => {
				event.preventDefault();
				save.disabled = true;
				try {
					await options.api('/bag/mission-note', {
						method: 'POST', body: {
							characterId: options.characterId, itemId: item.id,
							note: note.value, expectedRevision: bagData.revision,
						},
					});
					close();
					options.toast('Anotação do Item de Missão atualizada.');
					await load();
				} catch (error) {
					save.disabled = false;
					options.toast(error.message, true);
				}
			});
		}

		async function showMissionReward(item, parentDialog) {
			const dialog = createDialog('bag-ui-master-dialog', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, item.name + ' entregue', close);
			const form = el('form', 'bag-ui-master-form');
			const rewardType = el('select');
			for (const [value, label] of [['item', 'Item'], ['pokecoin', 'Pokecoin']]) {
				const option = el('option', '', label);
				option.value = value;
				rewardType.append(option);
			}
			const rewardArea = el('div', 'bag-ui-mission-reward');
			let selectedId = '';
			let selectedCategory = '';
			let catalog = [];
			const renderCategories = items => {
				selectedId = '';
				selectedCategory = '';
				rewardArea.replaceChildren(
					el('h3', '', 'Escolha a categoria da recompensa'),
					catalogCategoryPicker(items, categoryId => {
						selectedCategory = categoryId;
						renderItems(items);
					})
				);
			};
			const renderItems = items => {
				selectedId = '';
				const search = el('input');
				search.type = 'search';
				search.placeholder = 'Pesquisar em ' + catalogCategoryName(selectedCategory);
				const list = el('div', 'bag-ui-master-catalog');
				const quantity = quantityInput(99);
				quantity.name = 'rewardQuantity';
				const fill = () => {
					const query = search.value.trim().toLowerCase();
					const filtered = items.filter(candidate =>
						catalogCategoryId(candidate) === selectedCategory &&
						(!query || candidate.name.toLowerCase().includes(query) || candidate.id.includes(query))
					).slice(0, 300);
					if (!filtered.some(candidate => candidate.id === selectedId)) selectedId = '';
					list.replaceChildren();
					for (const entry of filtered) {
						const choice = makeButton(
							'', 'bag-ui-master-catalog-item' + (entry.id === selectedId ? ' selected' : '')
						);
						choice.append(itemIcon(entry), el('span', '', entry.name));
						choice.addEventListener('click', () => {
							selectedId = entry.id;
							fill();
						});
						list.append(choice);
					}
					if (!filtered.length) list.append(el('p', 'empty-state', 'Nenhum item disponível.'));
				};
				const back = makeButton('‹ Categorias', 'button bag-ui-catalog-back');
				back.addEventListener('click', () => renderCategories(items));
				search.addEventListener('input', fill);
				rewardArea.replaceChildren(
					back, el('h3', '', catalogCategoryName(selectedCategory)),
					search, list, el('label', '', 'Quantidade'), quantity
				);
				fill();
			};
			const renderReward = () => {
				selectedId = '';
				selectedCategory = '';
				if (rewardType.value === 'pokecoin') {
					const amount = quantityInput(Number.MAX_SAFE_INTEGER);
					amount.name = 'amount';
					rewardArea.replaceChildren(el('label', '', 'Quantidade de Pokecoins'), amount);
					return;
				}
				renderCategories(catalog.filter(candidate => candidate.id !== item.id));
			};
			form.append(el('label', '', 'Tipo da recompensa'), rewardType, rewardArea);
			const submit = makeButton('Confirmar entrega', 'button primary');
			submit.type = 'submit';
			form.append(submit);
			dialog.card.append(form);
			try {
				const data = await options.api('/bag/master/catalog');
				catalog = data.items || [];
				renderReward();
			} catch (error) {
				close();
				options.toast(error.message, true);
				return;
			}
			rewardType.addEventListener('change', renderReward);
			form.addEventListener('submit', async event => {
				event.preventDefault();
				if (rewardType.value === 'item' && !selectedId) {
					options.toast('Escolha a categoria e o item da recompensa.', true);
					return;
				}
				const reward = rewardType.value === 'item' ? {
					type: 'item', itemId: selectedId,
					quantity: Number(form.elements.rewardQuantity.value),
				} : { type: 'pokecoin', amount: Number(form.elements.amount.value) };
				submit.disabled = true;
				try {
					await options.api('/bag/master/complete-mission', {
						method: 'POST', body: {
							characterId: options.characterId, itemId: item.id,
							expectedRevision: bagData.revision, reward,
						},
					});
					close();
					options.toast(item.name + ' foi entregue e a recompensa foi concedida.');
					await load();
				} catch (error) {
					submit.disabled = false;
					options.toast(error.message, true);
				}
			});
		}

		async function showTargets(item, action, parentDialog) {
			const dialog = createDialog('bag-ui-target-dialog', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, (action === 'equip' ? 'Equipar ' : 'Usar ') + item.name, close);
			const content = el('div', 'bag-ui-target-content');
			content.append(el('p', 'loading-block', 'Procurando Pokémon compatíveis...'));
			dialog.card.append(content);
			try {
				const data = await options.api('/bag/items/' + encodeURIComponent(item.id) + '/targets?characterId=' + encodeURIComponent(options.characterId));
				const targets = data.targets;
				content.replaceChildren(el('p', 'bag-ui-target-instruction', 'Escolha o Pokémon'));
				const grid = el('div', 'bag-ui-target-grid');
				for (const target of targets.targets) {
					grid.append(pokemonTarget(target, selected => {
						if (item.effect?.type === 'restore-pp' && !item.effect.allMoves) {
							renderMoveTargets(item, selected, targets, content, close);
							return;
						}
						void applyTargetAction(item, selected, targets, action, undefined, close);
					}));
				}
				content.append(grid);
			} catch (error) {
				close();
				options.toast(error.message, true);
			}
		}

		function renderMoveTargets(item, target, revisions, content, close) {
			content.replaceChildren(el('p', 'bag-ui-target-instruction', 'Escolha o movimento de ' + target.name));
			const moves = el('div', 'bag-ui-move-targets');
			for (const move of target.compatibleMoves) {
				const moveButton = makeButton('', 'button bag-ui-move-target');
				moveButton.append(el('strong', '', move.name), el('small', '', 'PP ' + move.pp + ' / ' + move.maxPP));
				moveButton.addEventListener('click', () => void applyTargetAction(item, target, revisions, 'use', move.index, close));
				moves.append(moveButton);
			}
			content.append(moves);
		}

		async function applyTargetAction(item, target, revisions, action, move, close) {
			try {
				if (action === 'equip') {
					await options.api('/bag/equip', {
						method: 'POST', body: {
							characterId: options.characterId, pokemonId: target.pokemonId, itemId: item.id,
							expectedBagRevision: revisions.bagRevision, expectedBoxRevision: revisions.boxRevision,
						},
					});
					options.toast(item.name + ' foi equipado em ' + target.name + '.');
				} else {
					await options.api('/box/pokemon/' + encodeURIComponent(target.pokemonId) + '/use-healing-item', {
						method: 'POST', body: {
							characterId: options.characterId, itemId: item.id, actionId: window.crypto.randomUUID(),
							expectedBagRevision: revisions.bagRevision, expectedBoxRevision: revisions.boxRevision,
							...(move === undefined ? {} : { move }),
						},
					});
					options.toast(item.name + ' foi usado em ' + target.name + '.');
				}
				close();
				await load();
			} catch (error) {
				options.toast(error.message, true);
			}
		}

		async function showRemoveTargets(item, parentDialog) {
			const dialog = createDialog('', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Remover ' + item.name, close);
			const content = el('div', 'bag-ui-simple-list');
			for (const pokemon of item.equippedIn || []) {
				const select = makeButton(pokemon.name + ' · ' + pokemon.species, 'button');
				select.addEventListener('click', async () => {
					try {
						const targets = await options.api('/bag/items/' + encodeURIComponent(item.id) + '/targets?characterId=' + encodeURIComponent(options.characterId));
						await options.api('/bag/remove-held', {
							method: 'POST', body: {
								characterId: options.characterId, pokemonId: pokemon.pokemonId,
								expectedBagRevision: targets.targets.bagRevision,
								expectedBoxRevision: targets.targets.boxRevision,
							},
						});
						close();
						options.toast(item.name + ' voltou para a Bag.');
						await load();
					} catch (error) {
						options.toast(error.message, true);
					}
				});
				content.append(select);
			}
			dialog.card.append(content);
		}

		function quantityInput(maximum) {
			const input = el('input');
			input.type = 'number';
			input.min = '1';
			input.max = String(maximum);
			input.value = '1';
			return input;
		}

		function showDiscard(item, parentDialog) {
			const dialog = createDialog('', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Descartar ' + item.name, close);
			const content = el('div', 'bag-ui-transfer-content');
			content.append(el('p', '', item.linkedEggId ?
				'O Egg dentro desta incubadora também será descartado permanentemente.' :
				'Escolha quantas unidades serão descartadas permanentemente.'));
			const quantity = quantityInput(item.quantity);
			const actions = el('div', 'bag-ui-dialog-inline-actions');
			const confirm = makeButton('Confirmar descarte', 'button danger');
			const cancel = makeButton('Cancelar', 'button');
			cancel.addEventListener('click', close);
			confirm.addEventListener('click', async () => {
				confirm.disabled = true;
				try {
					await options.api('/bag/discard', {
						method: 'POST', body: {
							characterId: options.characterId, itemId: item.id,
							quantity: Number(quantity.value), expectedRevision: bagData.revision,
							...(item.linkedEggId ? {linkedEggId: item.linkedEggId} : {}),
						},
					});
					close();
					options.toast(item.name + ' foi descartado.');
					await load();
				} catch (error) {
					confirm.disabled = false;
					options.toast(error.message, true);
				}
			});
			actions.append(confirm, cancel);
			content.append(quantity, actions);
			dialog.card.append(content);
		}

		async function showGive(item, parentDialog) {
			const dialog = createDialog('bag-ui-transfer-dialog', parentDialog);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Dar ' + item.name, close);
			const content = el('div', 'bag-ui-transfer-content');
			content.append(el('p', '', item.linkedEggId ?
				'A incubadora e o Egg serão entregues juntos. O destino precisa ter espaço para ambos.' :
				'Escolha a quantidade e o Player que receberá o item.'));
			const quantity = quantityInput(item.quantity);
			const targets = el('div', 'bag-ui-transfer-targets');
			content.append(quantity, targets);
			dialog.card.append(content);
			try {
				const data = await options.api(
					'/bag/items/' + encodeURIComponent(item.id) + '/transfer-targets?characterId=' +
					encodeURIComponent(options.characterId) +
					(item.linkedEggId ? '&linkedEggId=' + encodeURIComponent(item.linkedEggId) : '')
				);
				const transfer = data.transfer;
				if (!transfer.targets.length) {
					targets.append(el('p', 'empty-state', 'Não há outro Player disponível.'));
					return;
				}
				for (const target of transfer.targets) {
					const targetButton = makeButton('', 'bag-ui-transfer-target' + (target.canReceive ? '' : ' unavailable'));
					const status = !target.bagAllowed ? 'Bag bloqueada' :
						(!target.canReceive ? 'Bag cheia' :
						(target.hasItem ? 'Já possui este item' :
						target.usedSlots + ' / ' + (target.maxSlots || '∞') + ' espaços'));
					targetButton.append(el('strong', '', target.characterName), el('small', '', status));
					targetButton.disabled = !target.canReceive;
					targetButton.addEventListener('click', async () => {
						targetButton.disabled = true;
						try {
							await options.api('/bag/transfer', {
								method: 'POST', body: {
									characterId: options.characterId, targetCharacterId: target.characterId,
									itemId: item.id, quantity: Number(quantity.value),
									expectedSenderRevision: transfer.senderRevision,
									expectedTargetRevision: target.revision,
									...(item.linkedEggId ? {linkedEggId: item.linkedEggId} : {}),
								},
							});
							close();
							options.toast(item.name + ' foi entregue para ' + target.characterName + '.');
							await load();
						} catch (error) {
							targetButton.disabled = false;
							options.toast(error.message, true);
						}
					});
					targets.append(targetButton);
				}
			} catch (error) {
				close();
				options.toast(error.message, true);
			}
		}

		async function showQuantityManager(anchor) {
			const dialog = createDialog('bag-ui-master-dialog', null, anchor);
			const close = () => dialog.overlay.remove();
			const reposition = () => window.requestAnimationFrame(() => {
				positionDialog(dialog);
				window.requestAnimationFrame(() => positionDialog(dialog));
			});
			dialogHeading(dialog.card, 'Administrar itens', close);
			const form = el('form', 'bag-ui-master-form');
			const operation = el('select');
			for (const [value, label] of [['add', 'Adicionar / recompensa'], ['remove', 'Remover'], ['set', 'Definir quantidade']]) {
				const option = el('option', '', label);
				option.value = value;
				operation.append(option);
			}
			const stage = el('div', 'bag-ui-catalog-stage');
			const quantityField = el('label', 'hidden');
			const quantity = el('input');
			quantity.type = 'number';
			quantity.min = '1';
			quantity.max = '99';
			quantity.value = '1';
			quantityField.append(el('span', '', 'Quantidade'), quantity);
			const submit = makeButton('Aplicar', 'button primary hidden');
			submit.type = 'submit';
			form.append(el('label', '', 'Operação'), operation, stage, quantityField, submit);
			dialog.card.append(form);
			try {
				const data = await options.api('/bag/master/catalog');
				const catalog = data.items || [];
				const owned = new Map();
				for (const item of bagData.items || []) {
					const previous = owned.get(item.id);
					owned.set(item.id, { ...item, quantity: (previous?.quantity || 0) + item.quantity });
				}
				let selectedId = '';
				let selectedCategory = '';
				const sourceItems = () => operation.value === 'remove' ?
					catalog.filter(item => owned.has(item.id)) : catalog;
				const renderCategories = () => {
					selectedId = '';
					selectedCategory = '';
					quantityField.classList.add('hidden');
					submit.classList.add('hidden');
					const source = sourceItems();
					stage.replaceChildren(
						el('h3', '', 'Escolha uma categoria'),
						catalogCategoryPicker(source, categoryId => {
							selectedCategory = categoryId;
							renderItems();
						})
					);
					if (!source.length) stage.append(el('p', 'empty-state', 'Nenhum item disponível.'));
					reposition();
				};
				const renderItems = () => {
					selectedId = '';
					quantityField.classList.remove('hidden');
					submit.classList.remove('hidden');
					const search = el('input');
					search.type = 'search';
					search.placeholder = 'Pesquisar em ' + catalogCategoryName(selectedCategory);
					const catalogList = el('div', 'bag-ui-master-catalog');
					const fill = () => {
						const query = search.value.trim().toLowerCase();
						const filtered = sourceItems().filter(entry =>
							catalogCategoryId(entry) === selectedCategory &&
							(!query || entry.name.toLowerCase().includes(query) || entry.id.includes(query))
						).slice(0, 300);
						if (!filtered.some(entry => entry.id === selectedId)) selectedId = '';
						catalogList.replaceChildren();
						for (const entry of filtered) {
							const choice = makeButton(
								'', 'bag-ui-master-catalog-item' + (entry.id === selectedId ? ' selected' : '')
							);
							choice.append(itemIcon(entry), el('span', '', entry.name));
							if (owned.has(entry.id)) choice.append(el('b', '', '×' + owned.get(entry.id).quantity));
							choice.addEventListener('click', () => {
								selectedId = entry.id;
								fill();
							});
							catalogList.append(choice);
						}
						if (!filtered.length) {
							catalogList.append(el('p', 'empty-state', 'Nenhum item disponível.'));
						}
						reposition();
					};
					const back = makeButton('‹ Categorias', 'button bag-ui-catalog-back');
					back.addEventListener('click', renderCategories);
					search.addEventListener('input', fill);
					stage.replaceChildren(
						back, el('h3', '', catalogCategoryName(selectedCategory)), search, catalogList
					);
					fill();
					reposition();
				};
				renderCategories();
				operation.addEventListener('change', () => {
					quantity.min = operation.value === 'set' ? '0' : '1';
					renderCategories();
				});
				form.addEventListener('submit', async event => {
					event.preventDefault();
					if (!selectedId) {
						options.toast('Escolha a categoria e o item.', true);
						return;
					}
					try {
						submit.disabled = true;
						const result = await options.api('/bag/master/quantity', {
							method: 'POST', body: {
								characterId: options.characterId, itemId: selectedId,
								operation: operation.value, quantity: Number(quantity.value),
								expectedRevision: bagData.revision,
							},
						});
						bagData = result.bag;
						close();
						options.toast('Bag atualizada pelo Mestre.');
						renderShell();
					} catch (error) {
						submit.disabled = false;
						options.toast(error.message, true);
					}
				});
			} catch (error) {
				close();
				options.toast(error.message, true);
			}
		}

		async function showCustomItemCreator(anchor) {
			const dialog = createDialog('bag-ui-master-dialog', null, anchor);
			const close = () => dialog.overlay.remove();
			dialogHeading(dialog.card, 'Criar Item de Missão', close);
			const form = el('form', 'bag-ui-create-form');
			function field(label, name, type = 'text', value = '') {
				const wrapper = el('label');
				wrapper.append(el('span', '', label));
				const input = el('input');
				input.name = name;
				input.type = type;
				input.value = value;
				wrapper.append(input);
				form.append(wrapper);
				return input;
			}
			const name = field('Nome', 'name');
			const description = field('Descrição', 'description');
			const initial = field('Quantidade para entregar', 'initial', 'number', '1');
			initial.min = '1';
			initial.max = '99';
			const submit = makeButton('Criar e entregar', 'button primary');
			submit.type = 'submit';
			form.append(submit);
			dialog.card.append(form);
			form.addEventListener('submit', async event => {
				event.preventDefault();
				try {
					const created = await options.api('/bag/master/items', {
						method: 'POST', body: {
							id: name.value, name: name.value,
							effect: { type: 'mission', description: description.value },
						},
					});
					await options.api('/bag/master/quantity', {
						method: 'POST', body: {
							characterId: options.characterId, itemId: created.item.id, operation: 'add',
							quantity: Number(initial.value), expectedRevision: bagData.revision,
						},
					});
					close();
					options.toast('Item de missão criado e entregue.');
					await load();
				} catch (error) {
					options.toast(error.message, true);
				}
			});
		}

		await load();
		return root;
	}

	window.RPGBagUI = { render };
}());
