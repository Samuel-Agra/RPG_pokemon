(function () {
	'use strict';
	let currentTab = 'breeding';

	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const duration = milliseconds => {
		const hours = Math.max(0, Math.ceil(Number(milliseconds || 0) / 3_600_000));
		const days = Math.floor(hours / 24);
		return days ? days + 'd ' + (hours % 24) + 'h' : hours + 'h';
	};
	const statusLabels = {
		inviting: 'Aguardando Slot 2',
		configuring: 'Aguardando confirmações',
		awaiting_confirmation: 'Aguardando confirmações',
		breeding: 'Em procriação',
		egg_ready: 'Ovo produzido',
		collected: 'Ovo retirado',
		cancelled: 'Cancelada',
		carried: 'Sendo carregado',
		incubating: 'Incubando',
		ready_to_hatch: 'Pronto para chocar',
	};

	function eggIcon(options, egg) {
		if (egg?.portableIncubator && options.eggVisual) {
			return options.eggVisual(egg, 'nursery-egg portable');
		}
		const icon = el('img', 'nursery-egg plain-egg-visual');
		icon.src = options.spriteUrl({species: 'Egg'});
		icon.alt = 'Egg';
		icon.draggable = false;
		return icon;
	}
	function parentCard(parent, options, onEmpty, masterControlled) {
		const card = el(parent ? 'article' : 'button',
			'nursery-parent' + (!parent ? ' nursery-slot-empty' : ''));
		if (!parent) {
			card.type = 'button';
			card.disabled = !onEmpty;
			card.append(el('span', 'nursery-slot-plus', '+'));
			card.append(el('strong', '', onEmpty ?
				(masterControlled ? 'Escolher Pokémon' : 'Ocupar Slot 2') : 'Slot 2 vazio'));
			card.append(el('small', '', onEmpty ?
				(masterControlled ? 'Configurar parceiro do Mestre' : 'Use o Pokémon destacado acima') :
				'Aguardando outro treinador'));
			if (onEmpty) card.addEventListener('click', onEmpty);
			return card;
		}
		const sprite = el('img', 'nursery-parent-sprite');
		sprite.src = options.spriteUrl({species: parent.species, shiny: !!parent.shiny});
		sprite.alt = parent.species;
		const info = el('div', 'nursery-parent-info');
		info.append(el('small', 'nursery-slot-label', 'SLOT OCUPADO'));
		info.append(el('strong', '', parent.name));
		info.append(el('span', '', parent.species + ' · Nv. ' + parent.level + ' · ' +
			(parent.sex === 'M' ? '♂' : parent.sex === 'F' ? '♀' : 'Sem sexo')));
		info.append(el('small', '', 'Treinador: ' + parent.ownerName));
		card.append(sprite, info);
		return card;
	}
	async function render(options) {
		const root = el('div', 'nursery-page');
		root.append(el('div', 'nursery-loading', 'Preparando o Berçário...'));
		const query = options.characterId ? '?characterId=' + encodeURIComponent(options.characterId) : '';
		let view = (await options.api('/nursery' + query)).nursery;
		let selectedPokemonId = view.pokemon.find(pokemon => !pokemon.busy)?.pokemonId || '';
		let refreshing = false;
		const refreshTimer = window.setInterval(async () => {
			if (!root.isConnected) {
				window.clearInterval(refreshTimer);
				return;
			}
			if (refreshing) return;
			refreshing = true;
			try {
				const nextView = (await options.api('/nursery' + query)).nursery;
				if (JSON.stringify(nextView) !== JSON.stringify(view)) {
					view = nextView;
					paint();
				}
			} catch {}
			refreshing = false;
		}, 2500);

		async function action(name, body) {
			try {
				const result = await options.api('/nursery/' + name, {
					method: 'POST', body: {characterId: options.characterId, ...body},
				});
				if (result.nursery) view = result.nursery;
				ensureSelectedPokemon();
				paint();
				if (result.hatch) options.toast(result.hatch.pokemon.species + ' nasceu!');
				return result;
			} catch (error) {
				options.toast(error.message, true);
				paint();
			}
		}

		function header() {
			const head = el('header', 'nursery-header');
			const copy = el('div');
			copy.append(el('span', 'nursery-eyebrow', 'BERÇÁRIO POKÉMON'));
			copy.append(el('h1', '', 'Procriação e Incubação'));
			copy.append(el('p', '', 'Um espaço compartilhado: os Pokémon depositados aparecem para todos.'));
			const stats = el('div', 'nursery-capacity');
			if (view.ownerId) {
				stats.append(el('span', '', 'Equipe ' + view.capacity.teamUsed + '/6'));
				stats.append(el('span', '', 'Bag ' + view.capacity.bagUsedSlots + '/' + (view.capacity.bagMaxSlots ?? '∞')));
			} else {
				stats.append(el('span', '', 'Visão do Mestre'));
			}
			head.append(copy, stats);
			return head;
		}
		function tabs() {
			const bar = el('nav', 'nursery-tabs');
			for (const [id, label] of [['breeding', 'Procriação'], ['incubation', 'Incubação']]) {
				const button = el('button', 'nursery-tab' + (currentTab === id ? ' active' : ''), label);
				button.type = 'button';
				button.addEventListener('click', () => { currentTab = id; paint(); });
				bar.append(button);
			}
			return bar;
		}
		function ensureSelectedPokemon() {
			if (!view.pokemon.some(pokemon => pokemon.pokemonId === selectedPokemonId && !pokemon.busy)) {
				selectedPokemonId = view.pokemon.find(pokemon => !pokemon.busy)?.pokemonId || '';
			}
		}
		function selectedPokemon() {
			return view.pokemon.find(pokemon => pokemon.pokemonId === selectedPokemonId && !pokemon.busy);
		}
		function teamPicker() {
			if (!view.ownerId) return null;
			ensureSelectedPokemon();
			const panel = el('section', 'nursery-team-panel');
			const grid = el('div', 'nursery-team-grid');
			for (const pokemon of view.pokemon.slice(0, 6)) {
				const card = el('button', 'nursery-team-card' +
					(pokemon.pokemonId === selectedPokemonId ? ' selected' : '') +
					(pokemon.busy ? ' busy' : ''));
				card.type = 'button';
				card.disabled = pokemon.busy;
				card.setAttribute('aria-pressed', String(pokemon.pokemonId === selectedPokemonId));
				const sprite = el('img', 'nursery-team-sprite');
				sprite.src = options.spriteUrl({species: pokemon.species, shiny: pokemon.shiny});
				sprite.alt = pokemon.species;
				const copy = el('span', 'nursery-team-copy');
				const nameLine = el('span', 'nursery-team-name');
				nameLine.append(el('strong', '', pokemon.name));
				const sexSymbol = pokemon.gender === 'M' ? '♂' : pokemon.gender === 'F' ? '♀' : '⚲';
				nameLine.append(el('span', 'nursery-team-sex sex-' +
					(pokemon.gender === 'M' ? 'male' : pokemon.gender === 'F' ? 'female' : 'neutral'), sexSymbol));
				copy.append(nameLine);
				copy.append(el('small', '', 'Nv. ' + pokemon.level +
					(pokemon.busy ? ' · Indisponível' : '')));
				card.append(sprite, copy);
				card.addEventListener('click', () => {
					selectedPokemonId = pokemon.pokemonId;
					paint();
				});
				grid.append(card);
			}
			for (const egg of (view.teamEggs || [])) {
				const card = el('span', 'nursery-team-card nursery-team-egg busy');
				const icon = eggIcon(options, egg);
				icon.classList.add('nursery-team-egg-icon');
				const copy = el('span', 'nursery-team-copy');
				copy.append(el('strong', '', 'Egg'));
				copy.append(el('small', '', egg.status === 'ready_to_hatch' ? 'Pronto para chocar' :
					egg.status === 'incubating' ? 'Incubando · ' + egg.progress + '%' : 'Sendo carregado'));
				card.append(icon, copy);
				grid.append(card);
			}
			while (grid.children.length < 6) {
				grid.append(el('span', 'nursery-team-card nursery-team-vacant', 'Vaga vazia'));
			}
			const actions = el('div', 'nursery-team-actions');
			const hint = el('span', 'nursery-selection-hint',
				selectedPokemon() ? selectedPokemon().name + ' está selecionado' : 'Selecione um Pokémon disponível');
			const deposit = el('button', 'button primary nursery-slot-one', 'Colocar no Slot 1');
			deposit.type = 'button';
			deposit.disabled = !selectedPokemon();
			deposit.addEventListener('click', async () => {
				deposit.disabled = true;
				await action('create', {pokemonId: selectedPokemonId});
			});
			actions.append(hint, deposit);
			panel.append(grid, actions);
			return panel;
		}
		function geneticPreview(preview) {
			if (!preview) return null;
			const box = el('div', 'nursery-genetics');
			box.append(el('strong', '', 'Previsão genética'));
			if (!preview.compatibility.compatible) {
				box.append(el('p', 'nursery-incompatible', 'Incompatíveis: ' + preview.compatibility.reason));
				return box;
			}
			box.append(el('p', '', 'Possível filhote: ' + preview.possibleSpecies.join(' / ')));
			box.append(el('p', '', 'Natures: ' + preview.possibleNatures.join(' / ')));
			box.append(el('p', '', 'Abilities: ' + preview.possibleAbilities.join(' / ')));
			box.append(el('p', '', 'Egg Moves possíveis: ' + (preview.possibleEggMoves.join(', ') || 'nenhum')));
			for (const effect of preview.itemEffects || []) box.append(el('small', '', effect));
			return box;
		}
		function openMasterSlot1Menu() {
			const choices = Array.isArray(view.masterSlot1Options) ?
				view.masterSlot1Options.filter(option => option?.species && Array.isArray(option.sexes)) : [];
			if (!choices.length) {
				options.toast('Nenhum Pok\u00e9mon eleg\u00edvel foi encontrado para iniciar a requisi\u00e7\u00e3o.', true);
				return;
			}
			const layer = el('div', 'nursery-master-slot-layer');
			const menu = el('form', 'nursery-master-slot-menu');
			const close = () => layer.remove();
			layer.addEventListener('mousedown', event => {
				if (event.target === layer) close();
			});
			const heading = el('header', 'nursery-master-slot-head');
			const title = el('div');
			title.append(el('small', 'nursery-eyebrow', 'REQUISI\u00c7\u00c3O DO MESTRE'));
			title.append(el('h3', '', 'Criar Slot 1 de NPC'));
			const closeButton = el('button', 'nursery-master-slot-close', '\u00d7');
			closeButton.type = 'button';
			closeButton.setAttribute('aria-label', 'Fechar');
			closeButton.addEventListener('click', close);
			heading.append(title, closeButton);

			const preview = el('div', 'nursery-master-slot-preview');
			const sprite = el('img', 'nursery-master-slot-sprite');
			const previewCopy = el('div');
			const previewName = el('strong', '', choices[0].species);
			const previewSex = el('span');
			previewCopy.append(previewName, previewSex);
			preview.append(sprite, previewCopy);

			const field = (label, control) => {
				const wrapper = el('label', 'nursery-master-field');
				wrapper.append(el('span', '', label), control);
				return wrapper;
			};
			const npcName = el('input', 'textbox');
			npcName.type = 'text';
			npcName.maxLength = 40;
			npcName.required = true;
			npcName.placeholder = 'Nome do NPC';

			const species = el('input', 'textbox nursery-master-pokemon-input');
			species.type = 'text';
			species.required = true;
			species.autocomplete = 'off';
			species.placeholder = 'Digite o nome do Pok\u00e9mon';
			species.setAttribute('role', 'combobox');
			species.setAttribute('aria-autocomplete', 'list');
			const suggestions = el('div', 'nursery-master-pokemon-suggestions');
			suggestions.setAttribute('role', 'listbox');
			const speciesControl = el('div', 'nursery-master-pokemon-autocomplete');
			speciesControl.append(species, suggestions);

			const sex = el('select', 'textbox');
			sex.required = true;
			const sexLabels = {M: 'Macho', F: 'F\u00eamea', N: 'Sem sexo'};
			const selectedChoice = () => {
				const value = species.value.trim().toLowerCase();
				return choices.find(option => option.species.toLowerCase() === value);
			};
			const updatePreview = () => {
				const choice = selectedChoice();
				if (!choice) {
					sprite.removeAttribute('src');
					sprite.alt = '';
					previewName.textContent = species.value.trim() || 'Escolha um Pok\u00e9mon';
					previewSex.textContent = '';
					return;
				}
				sprite.src = options.spriteUrl({species: choice.species});
				sprite.alt = choice.species;
				previewName.textContent = choice.species;
				previewSex.textContent = sexLabels[sex.value] || '';
			};
			const updateSexOptions = () => {
				const previous = sex.value;
				const choice = selectedChoice();
				sex.replaceChildren();
				for (const allowedSex of choice?.sexes || []) {
					const option = el('option', '', sexLabels[allowedSex] || allowedSex);
					option.value = allowedSex;
					sex.append(option);
				}
				if ([...(choice?.sexes || [])].includes(previous)) sex.value = previous;
				sex.disabled = !choice;
				species.setCustomValidity(choice ? '' : 'Selecione um Pok\u00e9mon da lista.');
				updatePreview();
			};
			const closeSuggestions = () => {
				suggestions.classList.remove('open');
				species.setAttribute('aria-expanded', 'false');
			};
			const chooseSpecies = choice => {
				species.value = choice.species;
				updateSexOptions();
				closeSuggestions();
			};
			const renderSuggestions = () => {
				const query = species.value.trim().toLowerCase();
				const filtered = choices.filter(option => option.species.toLowerCase().includes(query));
				suggestions.replaceChildren();
				if (!filtered.length) {
					suggestions.append(el('span', 'nursery-master-pokemon-empty', 'Nenhum Pok\u00e9mon encontrado'));
				} else {
					for (const choice of filtered) {
						const option = el('button', 'nursery-master-pokemon-option');
						option.type = 'button';
						option.setAttribute('role', 'option');
						const icon = el('img');
						icon.src = options.spriteUrl({species: choice.species});
						icon.alt = '';
						option.append(icon, el('span', '', choice.species));
						option.addEventListener('mousedown', event => event.preventDefault());
						option.addEventListener('click', () => chooseSpecies(choice));
						suggestions.append(option);
					}
				}
				suggestions.classList.add('open');
				species.setAttribute('aria-expanded', 'true');
			};
			species.addEventListener('input', () => {
				updateSexOptions();
				renderSuggestions();
			});
			species.addEventListener('focus', renderSuggestions);
			species.addEventListener('blur', () => window.setTimeout(closeSuggestions, 100));
			species.addEventListener('keydown', event => {
				if (event.key === 'Escape') {
					closeSuggestions();
				} else if (event.key === 'Enter' && suggestions.classList.contains('open')) {
					const first = suggestions.querySelector('.nursery-master-pokemon-option');
					if (first) {
						event.preventDefault();
						first.click();
					}
				} else if (event.key === 'ArrowDown') {
					const first = suggestions.querySelector('.nursery-master-pokemon-option');
					if (first) {
						event.preventDefault();
						first.focus();
					}
				}
			});
			sex.addEventListener('change', updatePreview);
			species.value = choices[0].species;
			updateSexOptions();

			const level = el('input', 'textbox');
			level.type = 'number';
			level.min = '1';
			level.max = '100';
			level.step = '1';
			level.value = '50';

			const mainFields = el('div', 'nursery-master-main-fields nursery-master-slot1-fields');
			mainFields.append(
				field('Nome do NPC', npcName),
				field('Pok\u00e9mon', speciesControl),
				field('Sexo', sex),
				field('N\u00edvel', level)
			);

			const ivs = el('fieldset', 'nursery-master-ivs');
			ivs.append(el('legend', '', 'IVs'));
			const statLabels = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
			const ivInputs = {};
			for (const stat of Object.keys(statLabels)) {
				const input = el('input', 'textbox');
				input.type = 'number';
				input.min = '0';
				input.max = '31';
				input.step = '1';
				input.value = '31';
				ivInputs[stat] = input;
				ivs.append(field(statLabels[stat], input));
			}

			const heldItem = el('select', 'textbox');
			for (const item of view.breedingItems || []) {
				const option = el('option', '', item.name);
				option.value = item.id;
				heldItem.append(option);
			}
			const itemDescription = el('small', 'nursery-master-item-description');
			const updateItem = () => {
				const selected = (view.breedingItems || []).find(item => item.id === heldItem.value);
				itemDescription.textContent = selected?.description || '';
			};
			heldItem.addEventListener('change', updateItem);
			updateItem();
			const itemField = field('Held item reprodutivo', heldItem);
			itemField.append(itemDescription);

			const actions = el('div', 'nursery-master-slot-actions');
			const cancel = el('button', 'button', 'Cancelar');
			cancel.type = 'button';
			cancel.addEventListener('click', close);
			const submit = el('button', 'button primary', 'Abrir requisi\u00e7\u00e3o');
			submit.type = 'submit';
			actions.append(cancel, submit);
			menu.append(heading, preview, mainFields, ivs, itemField, actions);
			menu.addEventListener('submit', async event => {
				event.preventDefault();
				const choice = selectedChoice();
				if (!choice || !sex.value) {
					species.reportValidity();
					return;
				}
				submit.disabled = true;
				close();
				await action('master-slot1', {
					npcName: npcName.value.trim(),
					species: choice.species,
					sex: sex.value,
					level: Number(level.value),
					ivs: Object.fromEntries(Object.entries(ivInputs).map(([stat, input]) =>
						[stat, Number(input.value)])),
					item: heldItem.value,
				});
			});
			layer.append(menu);
			document.body.append(layer);
			npcName.focus();
		}
		function openMasterSlot2Menu(project) {
			const choices = Array.isArray(project.masterSlot2Options) ? project.masterSlot2Options : [];
			if (!choices.length) {
				options.toast('Nenhum parceiro compat\u00edvel foi encontrado para o Slot 1.', true);
				return;
			}
			const layer = el('div', 'nursery-master-slot-layer');
			const menu = el('form', 'nursery-master-slot-menu');
			const close = () => layer.remove();
			layer.addEventListener('mousedown', event => {
				if (event.target === layer) close();
			});
			const heading = el('header', 'nursery-master-slot-head');
			const title = el('div');
			title.append(el('small', 'nursery-eyebrow', 'CONTROLE DO MESTRE'));
			title.append(el('h3', '', 'Configurar Slot 2'));
			const closeButton = el('button', 'nursery-master-slot-close', '\u00d7');
			closeButton.type = 'button';
			closeButton.setAttribute('aria-label', 'Fechar');
			closeButton.addEventListener('click', close);
			heading.append(title, closeButton);

			const preview = el('div', 'nursery-master-slot-preview');
			const sprite = el('img', 'nursery-master-slot-sprite');
			const previewCopy = el('div');
			const previewName = el('strong', '', choices[0].species);
			const previewSex = el('span', '', 'G\u00eanero autom\u00e1tico: ' +
				(choices[0].sex === 'M' ? 'Macho' : choices[0].sex === 'F' ? 'F\u00eamea' : 'Sem sexo'));
			previewCopy.append(previewName, previewSex);
			preview.append(sprite, previewCopy);

			const field = (label, control) => {
				const wrapper = el('label', 'nursery-master-field');
				wrapper.append(el('span', '', label), control);
				return wrapper;
			};
			const species = el('select', 'textbox');
			for (let index = 0; index < choices.length; index++) {
				const choice = choices[index];
				const option = el('option', '', choice.species);
				option.value = String(index);
				species.append(option);
			}
			const updatePreview = () => {
				const choice = choices[Number(species.value)] || choices[0];
				sprite.src = options.spriteUrl({species: choice.species});
				sprite.alt = choice.species;
				previewName.textContent = choice.species;
				previewSex.textContent = 'G\u00eanero autom\u00e1tico: ' + (choice.sex === 'M' ? 'Macho' :
					choice.sex === 'F' ? 'F\u00eamea' : 'Sem sexo');
			};
			species.addEventListener('change', updatePreview);
			updatePreview();

			const level = el('input', 'textbox');
			level.type = 'number';
			level.min = '1';
			level.max = '100';
			level.step = '1';
			level.value = String(Math.max(1, Math.min(100, Number(project.slot1.level) || 1)));

			const mainFields = el('div', 'nursery-master-main-fields');
			mainFields.append(field('Pok\u00e9mon compat\u00edvel', species), field('N\u00edvel', level));

			const ivs = el('fieldset', 'nursery-master-ivs');
			ivs.append(el('legend', '', 'IVs'));
			const statLabels = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
			const ivInputs = {};
			for (const stat of Object.keys(statLabels)) {
				const input = el('input', 'textbox');
				input.type = 'number';
				input.min = '0';
				input.max = '31';
				input.step = '1';
				input.value = '31';
				ivInputs[stat] = input;
				ivs.append(field(statLabels[stat], input));
			}

			const heldItem = el('select', 'textbox');
			for (const item of view.breedingItems || []) {
				const option = el('option', '', item.name);
				option.value = item.id;
				heldItem.append(option);
			}
			const itemDescription = el('small', 'nursery-master-item-description');
			const updateItem = () => {
				const selected = (view.breedingItems || []).find(item => item.id === heldItem.value);
				itemDescription.textContent = selected?.description || '';
			};
			heldItem.addEventListener('change', updateItem);
			updateItem();
			const itemField = field('Held item reprodutivo', heldItem);
			itemField.append(itemDescription);

			const actions = el('div', 'nursery-master-slot-actions');
			const cancel = el('button', 'button', 'Cancelar');
			cancel.type = 'button';
			cancel.addEventListener('click', close);
			const submit = el('button', 'button primary', 'Adicionar ao Slot 2');
			submit.type = 'submit';
			actions.append(cancel, submit);
			menu.append(heading, preview, mainFields, ivs, itemField, actions);
			menu.addEventListener('submit', async event => {
				event.preventDefault();
				const choice = choices[Number(species.value)] || choices[0];
				submit.disabled = true;
				close();
				await action('master-slot2', {
					projectId: project.id,
					species: choice.species,
					level: Number(level.value),
					ivs: Object.fromEntries(Object.entries(ivInputs).map(([stat, input]) =>
						[stat, Number(input.value)])),
					item: heldItem.value,
				});
			});
			layer.append(menu);
			document.body.append(layer);
		}
		function projectCard(project) {
			const card = el('article', 'nursery-project nursery-project-row');
			const top = el('div', 'nursery-project-head');
			top.append(el('h3', '', 'Slot de ' + project.slot1.ownerName));
			top.append(el('span', 'nursery-status status-' + project.status, statusLabels[project.status] || project.status));
			card.append(top);
			const parents = el('div', 'nursery-parents');
			const masterCanFillSlot2 = view.viewerRole === 'master' && project.status === 'inviting' &&
				Array.isArray(project.masterSlot2Options) && project.masterSlot2Options.length > 0;
			const playerCanFillSlot2 = view.viewerRole !== 'master' &&
				project.status === 'inviting' && !!selectedPokemon();
			const fillSlot2 = masterCanFillSlot2 ? () => openMasterSlot2Menu(project) :
				playerCanFillSlot2 ? () => action('accept', {
					projectId: project.id, pokemonId: selectedPokemonId,
				}) : null;
			parents.append(
				parentCard(project.slot1, options),
				el('span', 'nursery-heart', '♥'),
				parentCard(project.slot2, options, fillSlot2, masterCanFillSlot2)
			);
			card.append(parents);
			card.append(el('p', 'nursery-owner', project.slot1.participantType === 'npc' ?
				'O ovo pertence ao NPC e desaparecerá ao término da procriação.' :
				'O ovo pertencerá a ' + project.slot1.ownerName + ' (Slot 1).'));

			const preview = geneticPreview(project.preview);
			if (preview) card.append(preview);
			if (['configuring', 'awaiting_confirmation'].includes(project.status) && project.slot2) {
				const confirms = el('div', 'nursery-confirmations');
				for (const owner of [...new Set([project.slot1.ownerId, project.slot2.ownerId])]) {
					confirms.append(el('span', project.confirmed[owner] ? 'confirmed' : '', 
						(owner === project.slot1.ownerId ? project.slot1.ownerName : project.slot2.ownerName) +
						(project.confirmed[owner] ? ' ✓' : ' · aguardando')));
				}
				card.append(confirms);
				if ([project.slot1.ownerId, project.slot2.ownerId].includes(view.ownerId) && !project.confirmed[view.ownerId]) {
					const confirm = el('button', 'button primary', 'Confirmar procriação');
					confirm.addEventListener('click', () => action('confirm', {projectId: project.id}));
					card.append(confirm);
				}
			}
			if (project.status === 'breeding') {
				const required = project.requiredBreedingTimeMs || 1;
				const remaining = project.remainingBreedingTimeMs || 0;
				const progress = Math.max(0, Math.min(100, Math.floor((required - remaining) / required * 100)));
				const meter = el('div', 'nursery-meter');
				const fill = el('i');
				fill.style.width = progress + '%';
				meter.append(fill);
				card.append(meter, el('p', 'nursery-time', progress + '% · Restam ' + duration(remaining)));
			}
			if (project.status === 'egg_ready' && project.eggOwnerId === view.ownerId) {
				const ready = el('div', 'nursery-ready');
				ready.append(eggIcon(options), el('div', '', 'O ovo foi produzido e aguarda retirada.'));
				const collect = el('button', 'button primary', 'Retirar ovo');
				collect.addEventListener('click', () => action('collect', {projectId: project.id}));
				ready.append(collect);
				card.append(ready);
			}
			if (['inviting', 'configuring', 'awaiting_confirmation', 'breeding'].includes(project.status) &&
				project.slot1.ownerId === view.ownerId) {
				const cancel = el('button', 'button nursery-cancel', 'Cancelar');
				cancel.addEventListener('click', () => action('cancel', {projectId: project.id}));
				card.append(cancel);
			} else if (['configuring', 'awaiting_confirmation', 'breeding'].includes(project.status) &&
				project.slot2?.ownerId === view.ownerId) {
				const withdraw = el('button', 'button nursery-cancel', 'Retirar Pokémon');
				withdraw.addEventListener('click', () => action('withdraw-slot2', {projectId: project.id}));
				card.append(withdraw);
			}
			if (view.viewerRole === 'master' && project.slot1.participantType === 'npc' &&
				['inviting', 'configuring', 'awaiting_confirmation', 'breeding'].includes(project.status)) {
				const cancelNpc = el('button', 'button nursery-cancel', 'Cancelar requisição do NPC');
				cancelNpc.addEventListener('click', () => action('master-cancel', {projectId: project.id}));
				card.append(cancelNpc);
			}
			return card;
		}
		function breedingPage() {
			const page = el('div', 'nursery-content');
			const picker = teamPicker();
			if (picker) {
				page.append(picker);
			} else {
				const masterTools = el('div', 'nursery-master-tools');
				const note = el('div', 'nursery-master-note',
					'Abra uma requisição de NPC para que um Player ofereça o próprio Pokémon no Slot 2.');
				const createNpc = el('button', 'button primary', 'Nova requisição de NPC');
				createNpc.type = 'button';
				createNpc.addEventListener('click', openMasterSlot1Menu);
				masterTools.append(note, createNpc);
				page.append(masterTools);
			}
			const activeStatuses = ['inviting', 'configuring', 'awaiting_confirmation', 'breeding'];
			const visible = view.projects.filter(project => activeStatuses.includes(project.status));
			const board = el('section', 'nursery-shared-board');
			const boardHead = el('header', 'nursery-shared-board-head');
			boardHead.append(
				el('div', '', ''),
				el('h2', '', 'Slots compartilhados'),
				el('span', 'nursery-board-count', visible.length + (visible.length === 1 ? ' vaga ativa' : ' vagas ativas'))
			);
			board.append(boardHead);
			if (!visible.length) {
				board.append(el('div', 'nursery-empty nursery-board-empty', 'Nenhuma procriação ativa.'));
			} else {
				const stack = el('div', 'nursery-slot-stack');
				for (const project of visible) stack.append(projectCard(project));
				board.append(stack);
			}
			page.append(board);

			const rescueEntries = [];
			for (const project of view.projects) {
				if (!['egg_ready', 'collected'].includes(project.status)) continue;
				const owners = [...new Set([project.slot1.ownerId, project.slot2OwnerId].filter(Boolean))];
				for (const ownerId of owners) {
					if (project.parentCollected?.[ownerId] === true) continue;
					if (view.ownerId && ownerId !== view.ownerId) continue;
					const parents = [project.slot1, project.slot2].filter(parent => parent?.ownerId === ownerId);
					if (parents.length) rescueEntries.push({project, ownerId, parents});
				}
			}
			const rescueBoard = el('section', 'nursery-shared-board nursery-rescue-board');
			const rescueHead = el('header', 'nursery-shared-board-head nursery-rescue-head');
			rescueHead.append(
				el('div', '', ''),
				el('h2', '', 'Pokémon aguardando resgate'),
				el('span', 'nursery-board-count', rescueEntries.length +
					(rescueEntries.length === 1 ? ' resgate pendente' : ' resgates pendentes'))
			);
			rescueBoard.append(rescueHead);
			if (!rescueEntries.length) {
				rescueBoard.append(el('div', 'nursery-empty nursery-board-empty',
					'Nenhum Pokémon aguardando resgate.'));
			} else {
				const rescueStack = el('div', 'nursery-rescue-stack');
				for (const entry of rescueEntries) {
					const rescueCard = el('article', 'nursery-rescue-card');
					const ownerName = entry.parents[0]?.ownerName || entry.ownerId;
					rescueCard.append(el('h3', '', view.ownerId ? 'Seus Pokémon' : 'Treinador: ' + ownerName));
					const pokemonGrid = el('div', 'nursery-rescue-pokemon-grid');
					for (const parent of entry.parents) pokemonGrid.append(parentCard(parent, options));
					rescueCard.append(pokemonGrid);
					if (view.ownerId === entry.ownerId) {
						const collectParent = el('button', 'button primary', 'Resgatar Pokémon');
						collectParent.addEventListener('click', () =>
							action('collect-parent', {projectId: entry.project.id}));
						rescueCard.append(collectParent);
					} else {
						rescueCard.append(el('small', 'nursery-rescue-waiting',
							'Aguardando o treinador resgatar.'));
					}
					rescueStack.append(rescueCard);
				}
				rescueBoard.append(rescueStack);
			}
			page.append(rescueBoard);
			return page;
		}
		function localChamber(incubator) {
			const egg = incubator.egg;
			const chamber = el('div', 'nursery-local-chamber' + (egg ? ' occupied' : ' empty'));
			const glass = el('div', 'nursery-local-glass');
			if (egg) glass.append(eggIcon(options, egg));
			chamber.append(glass);
			if (egg) {
				const meter = el('div', 'nursery-local-progress');
				meter.setAttribute('aria-label', 'Progresso da incubação: ' + egg.progress + '%');
				const fill = el('i');
				fill.style.width = egg.progress + '%';
				meter.append(fill);
				chamber.append(meter);
			}
			return chamber;
		}
		function incubationPage() {
			const page = el('div', 'nursery-content nursery-incubation-page');
			if (!view.ownerId) {
				const board = el('section', 'nursery-shared-board nursery-released-board');
				const head = el('header', 'nursery-shared-board-head nursery-released-head');
				head.append(el('div'), el('h2', '', 'Pokémon libertados'),
					el('span', 'nursery-board-count', (view.releasedPokemon || []).length + ' armazenados'));
				board.append(head);
				const released = view.releasedPokemon || [];
				if (!released.length) {
					board.append(el('div', 'nursery-empty nursery-board-empty',
						'Nenhum Pokémon libertado está sob os cuidados do Mestre.'));
				} else {
					const grid = el('div', 'nursery-released-grid');
					for (const pokemon of released) {
						const card = el('article', 'nursery-released-card');
						const sprite = el('img', 'nursery-released-sprite');
						sprite.src = options.spriteUrl({species: pokemon.species, shiny: pokemon.shiny});
						sprite.alt = pokemon.species;
						const copy = el('div', 'nursery-released-copy');
						copy.append(el('strong', '', pokemon.name));
						copy.append(el('span', '', pokemon.species + ' · Nv. ' + pokemon.level + ' · ' +
							(pokemon.gender === 'M' ? '♂' : pokemon.gender === 'F' ? '♀' : 'Sem sexo')));
						copy.append(el('small', '', 'Treinador original: ' + pokemon.ownerName));
						const commands = el('div', 'nursery-released-actions');
						const restore = el('button', 'button primary', 'Devolver');
						restore.addEventListener('click', () =>
							action('restore-released', {releasedId: pokemon.id}));
						const release = el('button', 'button danger', 'Liberar');
						release.addEventListener('click', () => {
							if (!window.confirm('Liberar ' + pokemon.name + ' definitivamente? Esta ação não pode ser desfeita.')) return;
							action('delete-released', {releasedId: pokemon.id});
						});
						commands.append(restore, release);
						card.append(sprite, copy, commands);
						grid.append(card);
					}
					board.append(grid);
				}
				page.append(board);
				return page;
			}
			const emptyLocal = view.incubators.find(incubator => !incubator.egg);
			const readyProjects = view.projects.filter(project =>
				project.status === 'egg_ready' && project.eggOwnerId === view.ownerId);
			for (const project of readyProjects) {
				const ready = el('section', 'nursery-panel nursery-produced-egg');
				const copy = el('div', 'nursery-produced-copy');
				copy.append(el('span', 'nursery-eyebrow', 'OVO PRODUZIDO'));
				copy.append(el('h2', '', 'Pronto para retirada'));
				copy.append(el('p', '', 'Leve o ovo com você ou coloque-o diretamente na incubadora local.'));
				const actions = el('div', 'nursery-produced-actions');
				const collect = el('button', 'button primary', 'Pegar o ovo');
				collect.addEventListener('click', () => action('collect', {projectId: project.id}));
				const deposit = el('button', 'button', 'Colocar na incubadora local');
				deposit.disabled = !emptyLocal;
				deposit.title = emptyLocal ? '' : 'A incubadora local está ocupada';
				deposit.addEventListener('click', () => action('collect-local', {
					projectId: project.id, incubatorId: emptyLocal?.id,
				}));
				actions.append(collect, deposit);
				ready.append(eggIcon(options), copy, actions);
				page.append(ready);
			}

			const carried = view.eggs.filter(egg => egg.status === 'carried');
			const localSummary = el('section', 'nursery-local-summary');
			const occupiedLocals = view.incubators.filter(incubator => incubator.egg).length;
			localSummary.append(
				el('div', '', ''),
				el('h2', '', 'Incubadoras locais'),
				el('span', 'nursery-board-count', occupiedLocals + ' / 9 vagas ocupadas')
			);
			page.append(localSummary);
			const incubatorGroups = el('div', 'nursery-local-incubators');
			for (let groupNumber = 1; groupNumber <= 3; groupNumber++) {
				const slots = view.incubators.filter(incubator => Number(incubator.group) === groupNumber);
				const panel = el('section', 'nursery-panel nursery-incubator nursery-local-incubator');
				const machine = el('div', 'nursery-local-machine');
				const machineSlots = el('div', 'nursery-local-machine-slots');
				const controls = el('div', 'nursery-local-controls-grid');
				for (const incubator of slots) {
					machineSlots.append(localChamber(incubator));
					const control = el('article', 'nursery-local-control' + (incubator.egg ? ' occupied' : ' empty'));
					if (incubator.egg) {
						const egg = incubator.egg;
						if (egg.status === 'ready_to_hatch') {
							const hatch = el('button', 'button primary', 'Chocar Egg');
							const teamFull = Number(view.capacity?.teamUsed || 0) >= Number(view.capacity?.teamMax || 6);
							hatch.disabled = teamFull;
							hatch.title = teamFull ?
								'É necessária uma vaga realmente livre na equipe para resgatar este Pokémon' : '';
							hatch.addEventListener('click', () => action('hatch', {eggId: egg.eggId}));
							control.append(hatch);
						} else {
							const remove = el('button', 'button', 'Pegar Egg e pausar');
							remove.addEventListener('click', () => action('remove', {eggId: egg.eggId}));
							control.append(remove);
						}
					}
					controls.append(control);
				}
				machine.append(machineSlots);
				panel.append(machine, controls);
				incubatorGroups.append(panel);
			}
			page.append(incubatorGroups);

			const portable = view.eggs.filter(egg => egg.portableIncubator);
			if (carried.length || portable.length) {
				const list = el('section', 'nursery-panel nursery-carried-eggs');
				const available = view.portableIncubators?.available || 0;
				list.append(el('h2', '', 'Ovos com o treinador'));
				list.append(el('p', 'nursery-portable-count', 'Incubadoras Portáteis: ' +
					(view.portableIncubators?.inUse || 0) + ' em uso · ' + available + ' disponíveis'));
				for (const egg of [...portable, ...carried]) {
					const row = el('div', 'nursery-egg-row nursery-portable-row');
					const info = el('span', 'nursery-carried-copy');
					info.append(el('strong', '', egg.portableIncubator ? 'Ovo na Incubadora Portátil' : 'Egg'));
					info.append(el('small', '', egg.portableIncubator ?
						'Incubando · ' + egg.progress + '%' : 'Sendo carregado · progresso ' + egg.progress + '%'));
					const commands = el('span', 'nursery-egg-actions');
					if (egg.portableIncubator && egg.status === 'ready_to_hatch') {
						const hatch = el('button', 'button primary', 'Chocar ovo');
						hatch.addEventListener('click', () => action('hatch', {eggId: egg.eggId}));
						commands.append(hatch);
					} else if (egg.portableIncubator) {
						const stop = el('button', 'button', 'Guardar incubadora');
						stop.addEventListener('click', () => action('portable-stop', {eggId: egg.eggId}));
						commands.append(stop);
					} else {
						const deposit = el('button', 'button primary', 'Depositar Egg');
						deposit.disabled = !emptyLocal;
						deposit.title = emptyLocal ? 'Depositar na primeira vaga local disponível' :
							'As nove vagas das incubadoras locais estão ocupadas';
						deposit.addEventListener('click', () => action('insert', {
							eggId: egg.eggId, incubatorId: emptyLocal?.id,
						}));
						const start = el('button', 'button', 'Usar Incubadora Portátil');
						start.disabled = available < 1;
						start.addEventListener('click', () => action('portable-start', {eggId: egg.eggId}));
						commands.append(deposit, start);
					}
					row.append(eggIcon(options, egg), info, commands);
					list.append(row);
				}
				page.append(list);
			}
			return page;
		}
		function paint() {
			root.replaceChildren(header(), tabs(), currentTab === 'breeding' ? breedingPage() : incubationPage());
		}
		paint();
		return root;
	}
	window.RPGNurseryUI = {render};
})();
