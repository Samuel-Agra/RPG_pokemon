'use strict';

(function defineRPGBoxUI() {
	const TYPES = [
		'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
		'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
	];
	const FAVORITE_MARKERS = [
		['star', 'Estrela'], ['heart', 'Coração'],
		['magnifier', 'Lupa'], ['ribbon', 'Laço'],
		['flag-blue', 'Bandeira azul'], ['flag-red', 'Bandeira vermelha'],
		['flag-yellow', 'Bandeira amarela'], ['flag-green', 'Bandeira verde'],
		['flag-black', 'Bandeira preta'], ['flag-white', 'Bandeira branca'],
		['thumbs-up', 'Joinha'],
	];
	const TYPE_LABELS = {
		Normal: 'Normal', Fire: 'Fogo', Water: 'Água', Electric: 'Elétrico', Grass: 'Planta',
		Ice: 'Gelo', Fighting: 'Lutador', Poison: 'Veneno', Ground: 'Terrestre', Flying: 'Voador',
		Psychic: 'Psíquico', Bug: 'Inseto', Rock: 'Pedra', Ghost: 'Fantasma', Dragon: 'Dragão',
		Dark: 'Sombrio', Steel: 'Aço', Fairy: 'Fada',
	};
	const BACKGROUND_KEY = 'rpg-box-backgrounds-v1';
	const ui = {
		index: 0, selectedId: null, search: '', type: 'all', status: 'all',
		draftSearch: '', draftType: 'all', draftStatus: 'all', anchorId: null,
		outsideHandler: null, catalog: null,
	};

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function button(text, className = 'button') {
		const node = el('button', className, text);
		node.type = 'button';
		return node;
	}
	function backgroundSettings() {
		try {
			return JSON.parse(localStorage.getItem(BACKGROUND_KEY) || '{}');
		} catch {
			return {};
		}
	}
	function backgroundId(ownerId, index) {
		return backgroundSettings()[ownerId + ':' + index] || 'type-grass';
	}
	function saveBackground(ownerId, index, id) {
		const settings = backgroundSettings();
		settings[ownerId + ':' + index] = id;
		localStorage.setItem(BACKGROUND_KEY, JSON.stringify(settings));
	}
	function backgroundUrl(id) {
		return new URL('./assets/box-backgrounds/' + id + '.png', document.baseURI).href;
	}
	async function catalog() {
		if (ui.catalog) return ui.catalog;
		const response = await fetch(new URL('./assets/box-backgrounds/catalog.json', document.baseURI));
		if (!response.ok) throw new Error('Não foi possível carregar os fundos da Box.');
		const data = await response.json();
		ui.catalog = data.backgrounds || data;
		return ui.catalog;
	}
	function pokemonImage(deps, pokemon) {
		const image = el('img', 'box-pokemon-image');
		image.src = deps.spriteUrl(pokemon);
		image.alt = pokemon.name + ' em pixel art';
		image.loading = 'lazy';
		image.draggable = false;
		return image;
	}
	function favoriteSprite(marker, label) {
		const icon = el('span', 'box-favorite-sprite marker-' + (marker || 'star'));
		icon.setAttribute('role', 'img');
		icon.setAttribute('aria-label', label || 'Favorito');
		return icon;
	}
	function indicators(pokemon) {
		const names = {
			legendary: ['★', 'Lendário'], companion: ['❤', 'Companheiro'],
			training: ['⚔', 'Em treinamento'], fainted: ['💀', 'Desmaiado'],
		};
		const group = el('span', 'box-indicators');
		for (const id of pokemon.indicators || []) {
			if (id === 'favorite') {
				const marker = pokemon.metadata?.favoriteMarker || 'star';
				const definition = FAVORITE_MARKERS.find(entry => entry[0] === marker);
				group.append(favoriteSprite(marker, definition?.[1] || 'Favorito'));
				continue;
			}
			if (!names[id]) continue;
			const badge = el('span', 'box-indicator ' + id, names[id][0]);
			group.append(badge);
		}
		return group;
	}
	function allPokemon(view) {
		return [...view.team, ...view.boxes.flatMap(box => box.pokemon)];
	}
	function currentBox(view) {
		return view.boxes.find(box => box.index === ui.index) || view.boxes[0];
	}
	function firstEmpty(box) {
		const used = new Set(box.pokemon.map(pokemon => pokemon.location.slot));
		for (let slot = 0; slot < box.capacity; slot++) if (!used.has(slot)) return slot;
		return -1;
	}
	async function loadView(deps) {
		const query = new URLSearchParams({ characterId: deps.characterId });
		const filtering = !!ui.search || ui.type !== 'all' || ui.status !== 'all';
		if (!filtering) query.set('boxIndex', String(ui.index));
		if (ui.search) query.set('search', ui.search);
		if (ui.type !== 'all') query.set('type', ui.type);
		if (ui.status !== 'all') query.set('status', ui.status);
		return (await deps.api('/box?' + query)).box;
	}
	async function action(deps, operation, message) {
		try {
			await operation();
			if (message) deps.toast(message);
			await deps.refresh();
		} catch (error) {
			deps.toast(error.message, true);
		}
	}
	function move(deps, view, pokemonId, destination) {
		return action(deps, () => deps.api('/box/move', {
			method: 'POST',
			body: {
				characterId: deps.characterId, pokemonId, destination,
				expectedRevision: view.revision,
			},
		}), 'Pokémon movido.');
	}
	function draggable(node, pokemonId) {
		node.draggable = true;
		node.addEventListener('dragstart', event => {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/rpg-pokemon-id', pokemonId);
			node.classList.add('dragging');
		});
		node.addEventListener('dragend', () => node.classList.remove('dragging'));
	}
	function droppable(node, deps, view, destination) {
		node.addEventListener('dragover', event => {
			event.preventDefault();
			node.classList.add('drop-target');
		});
		node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
		node.addEventListener('drop', event => {
			event.preventDefault();
			node.classList.remove('drop-target');
			const pokemonId = event.dataTransfer.getData('text/rpg-pokemon-id');
			if (pokemonId) void move(deps, view, pokemonId, destination);
		});
	}
	function teamPanel(deps, view) {
		const panel = el('section', 'panel box-team-panel');
		const heading = el('div', 'box-section-heading');
		const eggs = Array.isArray(deps.teamEggs) ? deps.teamEggs : [];
		const teamUsed = view.team.length + eggs.length;
		heading.append(el('h2', '', 'Equipe atual'), el('span', 'tag', teamUsed + ' / 6'));
		panel.append(heading);
		const grid = el('div', 'box-team-grid');
		const byPosition = new Map(view.team.map(pokemon => [pokemon.location.position, pokemon]));
		const eggsByPosition = new Map(eggs.map((egg, index) => [view.team.length + index, egg]));
		for (let position = 0; position < 6; position++) {
			const pokemon = byPosition.get(position);
			const egg = eggsByPosition.get(position);
			const slot = button('', 'box-team-slot ' + (pokemon || egg ? 'occupied' : 'empty') +
				(egg ? ' box-team-egg-slot' : ''));
			slot.append(el('span', 'box-team-number', String(position + 1)));
			if (pokemon) {
				slot.dataset.pokemonId = pokemon.pokemonId;
				slot.append(pokemonImage(deps, pokemon), el('strong', '', pokemon.name), indicators(pokemon));
				slot.addEventListener('click', () => {
					ui.selectedId = pokemon.pokemonId;
					ui.anchorId = pokemon.pokemonId;
					void deps.refresh();
				});
				draggable(slot, pokemon.pokemonId);
				droppable(slot, deps, view, { destination: 'party', position });
			} else if (egg) {
				const image = pokemonImage(deps, {name: 'Egg', species: 'Egg'});
				slot.append(image, el('strong', '', 'Egg'), el('small', 'box-egg-locked', 'Não pode ser movido'));
				slot.disabled = true;
				slot.setAttribute('aria-label', 'Egg no slot ' + (position + 1) + '. Não pode ser movido para a Box.');
			} else {
				slot.append(el('span', 'box-empty-label', 'Adicionar'));
				droppable(slot, deps, view, { destination: 'party', position });
			}
			grid.append(slot);
		}
		panel.append(grid);
		return panel;
	}
	function filterLabel(label, values, selected, changed) {
		const field = el('label', 'box-filter');
		field.append(el('span', '', label));
		const select = el('select');
		for (const [value, text] of values) {
			const option = el('option', '', text);
			option.value = value;
			option.selected = selected === value;
			select.append(option);
		}
		select.addEventListener('change', () => changed(select.value));
		field.append(select);
		return field;
	}
	function nameSuggestions(deps, view, input, host) {
		host.replaceChildren();
		const query = input.value.trim().toLocaleLowerCase('pt-BR');
		if (!query) {
			host.classList.add('hidden');
			return;
		}
		const matches = allPokemon(view).filter(pokemon =>
			pokemon.name.toLocaleLowerCase('pt-BR').includes(query) ||
			pokemon.species.toLocaleLowerCase('pt-BR').includes(query)
		).slice(0, 12);
		if (!matches.length) {
			host.append(el('p', 'box-suggestion-empty', 'Nenhum Pokémon encontrado.'));
		} else {
			for (const pokemon of matches) {
				const result = button('', 'box-name-suggestion');
				result.append(pokemonImage(deps, pokemon), el('span', '', pokemon.name));
				result.addEventListener('click', () => {
					input.value = pokemon.name;
					ui.draftSearch = pokemon.name;
					ui.search = pokemon.name;
					ui.selectedId = pokemon.pokemonId;
					ui.anchorId = pokemon.pokemonId;
					if (pokemon.location.destination === 'box') ui.index = pokemon.location.boxIndex;
					void deps.refresh();
				});
				host.append(result);
			}
		}
		host.classList.remove('hidden');
	}
	function toolbar(deps, view) {
		const bar = el('form', 'panel box-toolbar');
		const search = el('label', 'box-search');
		search.append(el('span', '', 'Pesquisa por nome'));
		const input = el('input');
		input.type = 'search';
		input.placeholder = 'Nome, espécie ou Nº da Pokédex';
		input.value = ui.draftSearch;
		const suggestions = el('div', 'box-name-suggestions hidden');
		input.addEventListener('input', () => {
			ui.draftSearch = input.value;
			nameSuggestions(deps, view, input, suggestions);
		});
		input.addEventListener('focus', () => nameSuggestions(deps, view, input, suggestions));
		search.append(input, suggestions);
		const typeValues = [['all', 'Todos'], ...TYPES.map(type => [type, TYPE_LABELS[type] || type])];
		const statusValues = [
			['all', 'Todos'], ['healthy', 'Saudáveis'], ['alive', 'Vivos'],
			['fainted', 'Desmaiados'], ['statused', 'Com status'], ['poisoned', 'Envenenados'],
			['brn', 'Queimados'], ['par', 'Paralisados'], ['slp', 'Dormindo'], ['frz', 'Congelados'],
		];
		const submit = button('Pesquisar', 'button primary box-search-submit');
		submit.type = 'submit';
		bar.addEventListener('submit', event => {
			event.preventDefault();
			ui.search = ui.draftSearch.trim();
			ui.type = ui.draftType;
			ui.status = ui.draftStatus;
			ui.selectedId = null;
			void deps.refresh();
		});
		bar.append(
			search,
			filterLabel('Por tipo', typeValues, ui.draftType, value => { ui.draftType = value; }),
			filterLabel('Status', statusValues, ui.draftStatus, value => { ui.draftStatus = value; }),
			submit
		);
		return bar;
	}
	function searchResults(deps, view) {
		const active = !!ui.search || ui.type !== 'all' || ui.status !== 'all';
		if (!active) return null;
		const panel = el('section', 'panel box-search-results');
		const heading = el('div', 'box-search-results-heading');
		heading.append(
			el('h2', '', 'Resultados da pesquisa'),
			el('span', 'tag', String(view.results.length))
		);
		const clear = button('Limpar pesquisa', 'button small');
		clear.addEventListener('click', () => {
			ui.search = ui.draftSearch = '';
			ui.type = ui.draftType = 'all';
			ui.status = ui.draftStatus = 'all';
			ui.selectedId = null;
			void deps.refresh();
		});
		heading.append(clear);
		panel.append(heading);
		const list = el('div', 'box-search-result-list');
		if (!view.results.length) list.append(el('p', 'empty-state', 'Nenhum Pokémon encontrado.'));
		for (const pokemon of view.results) {
			const card = button('', 'box-search-result');
			card.append(pokemonImage(deps, pokemon), el('strong', '', pokemon.name));
			card.addEventListener('click', () => {
				ui.selectedId = pokemon.pokemonId;
				ui.anchorId = pokemon.pokemonId;
				if (pokemon.location.destination === 'box') ui.index = pokemon.location.boxIndex;
				void deps.refresh();
			});
			list.append(card);
		}
		panel.append(list);
		return panel;
	}
	function tabs(deps, view) {
		const list = el('div', 'box-tabs');
		for (const box of view.boxes) {
			const tab = button('', 'box-tab' + (box.index === ui.index ? ' active' : ''));
			tab.append(el('strong', '', box.name), el('small', '', (box.index + 1) + ' · ' + box.used + '/' + box.capacity));
			tab.addEventListener('click', () => {
				ui.index = box.index;
				ui.selectedId = null;
				void deps.refresh();
			});
			list.append(tab);
		}
		return list;
	}
	function renameBox(deps, view, box, title) {
		title.replaceChildren();
		const input = el('input', 'box-name-input');
		input.value = box.name;
		input.maxLength = 30;
		const save = button('Salvar', 'button primary small');
		const cancel = button('Cancelar', 'button small');
		const submit = () => void action(deps, () => deps.api('/box/boxes/' + box.index, {
			method: 'PATCH',
			body: {
				characterId: deps.characterId, name: input.value,
				expectedRevision: view.revision,
			},
		}), 'Box renomeada.');
		save.addEventListener('click', submit);
		cancel.addEventListener('click', () => void deps.refresh());
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') submit();
			if (event.key === 'Escape') void deps.refresh();
		});
		title.append(input, save, cancel);
		input.focus();
		input.select();
	}
	function backgroundPicker(deps, view, box, stage, backgrounds) {
		const picker = el('div', 'box-background-picker hidden');
		const heading = el('div', 'box-picker-heading');
		heading.append(el('strong', '', 'Escolha o fundo da Box'));
		const close = button('×', 'box-picker-close');
		close.addEventListener('click', () => picker.classList.add('hidden'));
		heading.append(close);
		picker.append(heading);
		const options = el('div', 'box-background-options');
		const current = backgroundId(view.ownerId, box.index);
		for (const background of backgrounds) {
			const option = button('', 'box-background-option' + (current === background.id ? ' selected' : ''));
			const preview = el('img');
			preview.src = backgroundUrl(background.id);
			preview.alt = '';
			option.append(preview, el('span', '', background.name));
			option.addEventListener('click', () => {
				saveBackground(view.ownerId, box.index, background.id);
				stage.style.backgroundImage = 'url("' + backgroundUrl(background.id) + '")';
				for (const child of options.children) child.classList.remove('selected');
				option.classList.add('selected');
				picker.classList.add('hidden');
			});
			options.append(option);
		}
		picker.append(options);
		return picker;
	}
	function boxGrid(deps, view, backgrounds) {
		const box = currentBox(view);
		const panel = el('section', 'panel box-storage-panel');
		if (!box) {
			panel.append(el('p', 'empty-state', 'Nenhuma Box disponível.'));
			return panel;
		}
		const heading = el('div', 'box-storage-heading');
		const title = el('div', 'box-storage-title');
		title.append(el('h2', '', box.name));
		const rename = button('Renomear', 'button small');
		rename.addEventListener('click', () => renameBox(deps, view, box, title));
		const chooseBackground = button('Escolher fundo', 'button small');
		heading.append(title, rename, chooseBackground);
		panel.append(heading);
		const stage = el('div', 'box-stage');
		stage.style.backgroundImage = 'url("' + backgroundUrl(backgroundId(view.ownerId, box.index)) + '")';
		const filtering = !!ui.search || ui.type !== 'all' || ui.status !== 'all';
		const visible = new Set((filtering ? view.results : box.pokemon).map(pokemon => pokemon.pokemonId));
		const bySlot = new Map(box.pokemon.map(pokemon => [pokemon.location.slot, pokemon]));
		for (let slotIndex = 0; slotIndex < box.capacity; slotIndex++) {
			const pokemon = bySlot.get(slotIndex);
			const slot = button('', 'box-grid-slot ' + (pokemon ? 'occupied' : 'empty'));
			if (pokemon) {
				if (pokemon.pokemonId === ui.selectedId) slot.classList.add('selected');
				slot.dataset.pokemonId = pokemon.pokemonId;
				slot.append(pokemonImage(deps, pokemon), indicators(pokemon));
				slot.addEventListener('click', () => {
					ui.selectedId = pokemon.pokemonId;
					ui.anchorId = pokemon.pokemonId;
					void deps.refresh();
				});
				draggable(slot, pokemon.pokemonId);
				droppable(slot, deps, view, { destination: 'box', boxIndex: box.index, slot: slotIndex });
			} else {
				slot.setAttribute('aria-label', 'Espaço vazio ' + (slotIndex + 1));
				droppable(slot, deps, view, { destination: 'box', boxIndex: box.index, slot: slotIndex });
			}
			stage.append(slot);
		}
		const picker = backgroundPicker(deps, view, box, stage, backgrounds);
		chooseBackground.addEventListener('click', () => picker.classList.toggle('hidden'));
		panel.append(stage, picker);
		return panel;
	}
	function openRelease(deps, view, pokemon, drawer) {
		const dialog = el('div', 'box-release-dialog');
		dialog.append(
			el('h3', '', 'Liberar ' + pokemon.name + '?'),
			el('p', '', 'Esta ação retira o Pokémon permanentemente. Ela não pode ser desfeita.')
		);
		const controls = el('div', 'form-actions');
		const no = button('Não');
		no.addEventListener('click', () => void deps.refresh());
		const yes = button('Sim, liberar', 'button danger destructive');
		yes.addEventListener('click', async () => {
			try {
				const result = await deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/release-challenge', {
					method: 'POST',
					body: { characterId: deps.characterId, expectedRevision: view.revision },
				});
				await deps.api('/box/pokemon', {
					method: 'DELETE',
					body: { challengeId: result.challenge.challengeId, confirmed: true },
				});
				ui.selectedId = null;
				deps.toast(pokemon.name + ' foi liberado.');
				await deps.refresh();
			} catch (error) {
				deps.toast(error.message, true);
			}
		});
		controls.append(no, yes);
		dialog.append(controls);
		drawer.replaceChildren(dialog);
	}
	function openFavoritePicker(deps, view, pokemon, drawer) {
		const workspace = drawer.parentElement;
		workspace.querySelector('.box-secondary-window')?.remove();
		const panel = el('div', 'panel box-favorite-picker box-secondary-window');
		panel.append(el('h3', '', 'Escolha um símbolo para ' + pokemon.name));
		const choices = el('div', 'box-favorite-choices');
		for (const [marker, label] of FAVORITE_MARKERS) {
			const choice = button('', 'box-favorite-choice' +
				(pokemon.metadata.favoriteMarker === marker ? ' selected' : ''));
			choice.append(favoriteSprite(marker, label), el('span', '', label));
			choice.addEventListener('click', () => void action(deps, () =>
				deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/metadata', {
					method: 'POST',
					body: {
						characterId: deps.characterId, expectedRevision: view.revision,
						metadata: { favorite: true, favoriteMarker: marker },
					},
				}), 'Símbolo de favorito atualizado.'));
			choices.append(choice);
		}
		panel.append(choices);
		const controls = el('div', 'form-actions');
		const cancel = button('Cancelar');
		cancel.addEventListener('click', () => panel.remove());
		controls.append(cancel);
		if (pokemon.metadata.favorite) {
			const remove = button('Remover favorito', 'button danger');
			remove.addEventListener('click', () => void action(deps, () =>
				deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/metadata', {
					method: 'POST',
					body: {
						characterId: deps.characterId, expectedRevision: view.revision,
						metadata: { favorite: false },
					},
				}), 'Removido dos favoritos.'));
			controls.append(remove);
		}
		panel.append(controls);
		workspace.append(panel);
		positionSecondaryWindow(workspace, drawer, panel);
	}
	function healingDescription(item) {
		const effect = item.effect || {};
		if (effect.type === 'revive') return effect.hpFraction === 1 ? 'Revive com todo o HP' : 'Revive com parte do HP';
		if (effect.type === 'cure-status') return 'Cura o status atual';
		if (effect.full) return effect.cureStatus ? 'Restaura HP e cura o status' : 'Restaura todo o HP';
		return 'Recupera ' + String(effect.amount || 0) + ' HP';
	}
	async function openHealingPicker(deps, view, pokemon, drawer) {
		const workspace = drawer.parentElement;
		workspace.querySelector('.box-secondary-window')?.remove();
		const panel = el('div', 'panel box-action-picker box-secondary-window');
		panel.append(el('h3', '', 'Curar ' + pokemon.name), el('p', '', 'Carregando itens disponíveis...'));
		workspace.append(panel);
		positionSecondaryWindow(workspace, drawer, panel);
		try {
			const data = await deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/healing-items', {
				method: 'POST', body: { characterId: deps.characterId },
			});
			panel.replaceChildren(el('h3', '', 'Curar ' + pokemon.name));
			const list = el('div', 'box-healing-items');
			if (!data.items.length) {
				list.append(el('p', 'empty-state', pokemon.fainted ?
					'Não há itens de revive disponíveis na Bag.' :
					'Não há itens aplicáveis a este Pokémon na Bag.'));
			}
			for (const item of data.items) {
				const choice = button('', 'box-healing-item');
				const icon = el('img');
				icon.src = new URL('./assets/item-icons/' + item.id + '.png', document.baseURI).href;
				icon.alt = '';
				icon.addEventListener('error', () => icon.remove());
				const copy = el('span');
				copy.append(el('strong', '', item.name + ' ×' + item.quantity), el('small', '', healingDescription(item)));
				choice.append(icon, copy);
				choice.addEventListener('click', () => void action(deps, () =>
					deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/use-healing-item', {
						method: 'POST', body: {
							characterId: deps.characterId, itemId: item.id,
							actionId: 'box-heal:' + pokemon.pokemonId + ':' + Date.now() + ':' + Math.random().toString(36).slice(2),
							expectedBoxRevision: data.boxRevision,
							expectedBagRevision: data.bagRevision,
						},
					}), item.name + ' utilizado em ' + pokemon.name + '.'));
				list.append(choice);
			}
			panel.append(list);
			const back = button('Cancelar');
			back.addEventListener('click', () => panel.remove());
			const controls = el('div', 'form-actions');
			controls.append(back);
			panel.append(controls);
		} catch (error) {
			deps.toast(error.message, true);
			void deps.refresh();
		}
	}
	function openDestinationPicker(deps, view, pokemon, drawer) {
		const workspace = drawer.parentElement;
		workspace.querySelector('.box-secondary-window')?.remove();
		const panel = el('div', 'panel box-action-picker box-secondary-window');
		panel.append(el('h3', '', 'Enviar ' + pokemon.name + ' para'));
		const list = el('div', 'box-destination-list');
		const teamFull = view.team.length + (deps.teamEggs?.length || 0) >= 6;
		const inTeam = pokemon.location.destination === 'party';
		const teamChoice = button('', 'box-destination' +
			(teamFull ? ' full' : '') + (inTeam ? ' current' : ''));
		teamChoice.append(
			el('strong', '', 'Equipe'),
			el('small', '', teamFull ? 'Equipe cheia' : (view.team.length + (deps.teamEggs?.length || 0)) + ' / 6')
		);
		teamChoice.disabled = teamFull || inTeam;
		teamChoice.addEventListener('click', () => void move(deps, view, pokemon.pokemonId, {
			destination: 'party', position: view.team.length,
		}));
		list.append(teamChoice);
		for (const box of view.boxes) {
			const full = box.used >= box.capacity;
			const current = pokemon.location.destination === 'box' && pokemon.location.boxIndex === box.index;
			const choice = button('', 'box-destination' + (full ? ' full' : '') + (current ? ' current' : ''));
			choice.append(
				el('strong', '', box.name),
				el('small', '', full ? 'Box cheia' : box.used + ' / ' + box.capacity)
			);
			choice.disabled = full || current;
			choice.addEventListener('click', () => {
				const slot = firstEmpty(box);
				if (slot >= 0) void move(deps, view, pokemon.pokemonId, {
					destination: 'box', boxIndex: box.index, slot,
				});
			});
			list.append(choice);
		}
		panel.append(list);
		const back = button('Cancelar');
		back.addEventListener('click', () => panel.remove());
		const controls = el('div', 'form-actions');
		controls.append(back);
		panel.append(controls);
		workspace.append(panel);
		positionSecondaryWindow(workspace, drawer, panel);
	}
	function positionSecondaryWindow(workspace, drawer, panel) {
		window.requestAnimationFrame(() => {
			const workspaceRect = workspace.getBoundingClientRect();
			const drawerRect = drawer.getBoundingClientRect();
			const gap = 10;
			let left = drawerRect.right - workspaceRect.left + gap;
			if (left + panel.offsetWidth > workspace.clientWidth - 8) {
				left = drawerRect.left - workspaceRect.left - panel.offsetWidth - gap;
			}
			left = Math.max(8, Math.min(left, workspace.clientWidth - panel.offsetWidth - 8));
			panel.style.left = left + 'px';
			panel.style.top = Math.max(8, drawerRect.top - workspaceRect.top) + 'px';
		});
	}
	function details(deps, view, pokemon) {
		const drawer = el('aside', 'panel box-detail-drawer box-detail-compact');
		const close = button('×', 'box-detail-close');
		close.setAttribute('aria-label', 'Fechar');
		close.addEventListener('click', () => closeDetailWindow(drawer));
		drawer.append(close);
		const hp = el('section', 'box-compact-hp');
		const hpHeading = el('div');
		const identity = el('div', 'box-compact-identity');
		identity.append(el('h2', '', pokemon.name));
		const types = el('div', 'box-type-list');
		for (const type of pokemon.types) types.append(el('span', 'box-type type-' + type.toLowerCase(), type));
		identity.append(types);
		const conditionLabels = {
			brn: 'Queimado', psn: 'Envenenado', tox: 'Intoxicado', par: 'Paralisado',
			slp: 'Dormindo', frz: 'Congelado',
		};
		if (pokemon.fainted || pokemon.status) {
			const status = pokemon.fainted ? 'fnt' : pokemon.status;
			const condition = el('span', 'box-condition status-' + status, status.toUpperCase());
			condition.title = pokemon.fainted ? 'Desmaiado' : conditionLabels[pokemon.status] || status.toUpperCase();
			identity.append(condition);
		}
		identity.append(el('strong', 'box-compact-level', 'Lv. ' + pokemon.level));
		hpHeading.append(identity);
		const track = el('div', 'box-hp-track' + (pokemon.hp <= 0 ? ' empty' : '')); 
		const hpRatio = pokemon.maxHP > 0 ? pokemon.hp / pokemon.maxHP : 0;
		const hpColor = pokemon.hp <= 0 ? ' empty' : hpRatio <= 0.25 ? ' low' : hpRatio <= 0.5 ? ' medium' : '';
		const fill = el('span', 'box-hp-fill' + hpColor);
		fill.style.width = Math.max(0, Math.min(100, hpRatio * 100)) + '%';
		track.append(fill);
		track.append(el('span', 'box-compact-hp-value', pokemon.hp + ' / ' + pokemon.maxHP));
		hp.append(hpHeading, track);
		drawer.append(hp);
		const actions = el('div', 'box-detail-actions box-compact-actions');
		const heal = button('Curar', 'button primary');
		heal.addEventListener('click', () => void openHealingPicker(deps, view, pokemon, drawer));
		const builder = button('Team Builder');
		builder.addEventListener('click', () => {
			closeDetailWindow(drawer);
			deps.openTeamBuilder(pokemon.pokemonId, 'box');
		});
		const favorite = button(pokemon.metadata.favorite ? 'Alterar favorito' : 'Favoritar');
		favorite.addEventListener('click', () => openFavoritePicker(deps, view, pokemon, drawer));
		const send = button('Enviar para');
		send.addEventListener('click', () => openDestinationPicker(deps, view, pokemon, drawer));
		const release = button('Liberar Pokémon', 'button danger');
		release.addEventListener('click', () => openRelease(deps, view, pokemon, drawer));
		actions.append(heal, builder, favorite, send, release);
		drawer.append(actions);
		return drawer;
	}
	function closeDetailWindow(drawer) {
		ui.selectedId = null;
		ui.anchorId = null;
		drawer.parentElement?.querySelector('.box-secondary-window')?.remove();
		drawer.remove();
		if (ui.outsideHandler) document.removeEventListener('pointerdown', ui.outsideHandler);
		ui.outsideHandler = null;
	}
	function watchOutsideClick(root, drawer) {
		if (ui.outsideHandler) document.removeEventListener('pointerdown', ui.outsideHandler);
		const handler = event => {
			if (!drawer.isConnected) {
				document.removeEventListener('pointerdown', handler);
				if (ui.outsideHandler === handler) ui.outsideHandler = null;
				return;
			}
			const secondary = root.querySelector('.box-secondary-window');
			if (drawer.contains(event.target) || secondary?.contains(event.target) ||
				event.target.closest?.('[data-pokemon-id]')) return;
			closeDetailWindow(drawer);
		};
		ui.outsideHandler = handler;
		window.setTimeout(() => {
			if (drawer.isConnected && ui.outsideHandler === handler) {
				document.addEventListener('pointerdown', handler);
			}
		}, 0);
	}
	function positionDetailWindow(workspace, drawer) {
		window.requestAnimationFrame(() => {
			const anchor = [...workspace.querySelectorAll('[data-pokemon-id]')]
				.find(node => node.dataset.pokemonId === ui.anchorId);
			if (!anchor) {
				drawer.style.left = 'auto';
				drawer.style.right = '12px';
				drawer.style.top = '12px';
				return;
			}
			const workspaceRect = workspace.getBoundingClientRect();
			const anchorRect = anchor.getBoundingClientRect();
			const gap = 10;
			const width = drawer.offsetWidth;
			const height = drawer.offsetHeight;
			let left = anchorRect.right - workspaceRect.left + gap;
			if (left + width > workspace.clientWidth - 8) {
				left = anchorRect.left - workspaceRect.left - width - gap;
			}
			left = Math.max(8, Math.min(left, workspace.clientWidth - width - 8));
			let top = anchorRect.top - workspaceRect.top + (anchorRect.height - height) / 2;
			top = Math.max(8, Math.min(top, Math.max(8, workspace.clientHeight - height - 8)));
			drawer.style.right = 'auto';
			drawer.style.left = left + 'px';
			drawer.style.top = top + 'px';
		});
	}
	async function render(deps) {
		const root = el('div', 'box-manager');
		const localDeps = { ...deps };
		localDeps.refresh = async () => {
			const scrollLeft = window.scrollX;
			const scrollTop = window.scrollY;
			const replacement = await render(deps);
			if (!root.isConnected) return;
			root.replaceWith(replacement);
			window.requestAnimationFrame(() => window.scrollTo(scrollLeft, scrollTop));
		};
		try {
			const [view, backgrounds] = await Promise.all([loadView(localDeps), catalog()]);
			if (!view.boxes.some(box => box.index === ui.index)) ui.index = view.boxes[0]?.index || 0;
			root.append(teamPanel(localDeps, view), toolbar(localDeps, view));
			const results = searchResults(localDeps, view);
			if (results) root.append(results);
			root.append(tabs(localDeps, view));
			const workspace = el('div', 'box-workspace');
			workspace.append(boxGrid(localDeps, view, backgrounds));
			root.append(workspace);
			const selected = allPokemon(view).find(pokemon => pokemon.pokemonId === ui.selectedId);
			if (selected) {
				const drawer = details(localDeps, view, selected);
				root.append(drawer);
				positionDetailWindow(root, drawer);
				watchOutsideClick(root, drawer);
			}
		} catch (error) {
			root.append(el('div', 'panel empty-state', error.message));
		}
		return root;
	}
	window.RPGBoxUI = Object.freeze({ render });
})();