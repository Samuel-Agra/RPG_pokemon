'use strict';

/* global document, window, rpgRuntimeItemIcon */

(function defineRPGTeamBuilderUI() {
	const STATS = [
		['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'],
		['spa', 'Sp. Attack'], ['spd', 'Sp. Defense'], ['spe', 'Speed'],
	];
	const STATUS_LABELS = {
		'': 'Saudável', brn: 'Burn', psn: 'Poison', tox: 'Badly Poisoned',
		par: 'Paralysis', slp: 'Sleep', frz: 'Freeze',
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
	function actionId() {
		return window.crypto?.randomUUID?.() ||
			('rpg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
	}
	function typeBadge(type) {
		return el('span', 'team-builder-type type-' + String(type).toLowerCase(), type);
	}
	function input(type, value, disabled = false) {
		const node = el('input');
		node.type = type;
		node.value = value ?? '';
		node.disabled = disabled;
		return node;
	}
	function formatMoney(value) {
		return new Intl.NumberFormat('pt-BR').format(value || 0) + ' ₽';
	}
	function formatDuration(milliseconds) {
		const minutes = Math.round(milliseconds / 60000);
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		if (!hours) return minutes + ' min';
		return rest ? hours + 'h' + String(rest).padStart(2, '0') : hours + 'h';
	}
	function trainingIcon() {
		const icon = el('span', 'team-builder-training-symbol');
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML = '<svg viewBox="0 0 48 32" focusable="false">' +
			'<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
			'<path class="training-icon-bar" d="M13 16h22"/>' +
			'<path class="training-icon-grip" d="M20 16h8"/>' +
			'<path class="training-icon-plate outer" d="M7 9v14M11 7v18M41 9v14M37 7v18"/>' +
			'<path class="training-icon-shine" d="M11 8v5M37 8v5"/>' +
			'</g></svg>';
		return icon;
	}
	function itemIcon(item) {
		const host = el('span', 'team-builder-item-icon');
		const icon = item && typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(item) : null;
		if (icon) {
			icon.classList.add('team-builder-item-glyph');
			host.append(icon);
		} else if (item?.icon) {
			const image = el('img');
			image.src = item.icon;
			image.alt = '';
			host.append(image);
		} else if (item) {
			host.textContent = '◆';
		} else {
			host.classList.add('empty');
		}
		return host;
	}
	function statBar(value, maximum, tone = '') {
		const track = el('span', 'team-builder-stat-track ' + tone);
		const fill = el('span', 'team-builder-stat-fill');
		fill.style.width = Math.max(0, Math.min(100, value / maximum * 100)) + '%';
		track.append(fill);
		return track;
	}
	function hpTone(value, maximum) {
		if (value <= 0 || maximum <= 0) return 'fainted';
		const ratio = value / maximum;
		if (ratio <= 0.2) return 'critical';
		if (ratio <= 0.5) return 'warning';
		return 'healthy';
	}

	function releaseBlockedReason(pokemon) {
		if (pokemon?.metadata?.breeding) return 'Pokémon em procriação não pode ser liberado.';
		if (pokemon?.metadata?.evTraining) return 'Pokémon em treinamento não pode ser liberado.';
		return '';
	}
	function openTeamReleaseConfirmation(deps, pokemon) {
		document.querySelector('.team-builder-context-menu')?.remove();
		const backdrop = el('div', 'modal-backdrop team-builder-release-backdrop');
		const dialog = el('section', 'panel team-builder-release-dialog');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.append(
			el('h2', '', 'Liberar ' + (pokemon.name || pokemon.species) + '?'),
			el('p', '', 'Esta ação retira o Pokémon permanentemente e não pode ser desfeita.')
		);
		const actions = el('div', 'team-builder-release-actions');
		const cancel = button('Cancelar');
		const confirm = button('Sim, liberar', 'button destructive');
		const close = () => backdrop.remove();
		cancel.addEventListener('click', close);
		backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
		confirm.addEventListener('click', async () => {
			cancel.disabled = true;
			confirm.disabled = true;
			try {
				const result = await deps.api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/release-challenge', {
					method: 'POST', body: {
						characterId: deps.characterId, expectedRevision: deps.boxRevision,
					},
				});
				await deps.api('/box/pokemon', {
					method: 'DELETE', body: {challengeId: result.challenge.challengeId, confirmed: true},
				});
				close();
				deps.toast((pokemon.name || pokemon.species) + ' foi liberado.');
				await deps.refresh();
			} catch (error) {
				cancel.disabled = false;
				confirm.disabled = false;
				deps.toast(error.message, true);
			}
		});
		actions.append(cancel, confirm);
		dialog.append(actions);
		backdrop.append(dialog);
		document.body.append(backdrop);
		cancel.focus();
	}
	function bindTeamReleaseMenu(slot, deps, pokemon) {
		if (pokemon?.virtualEgg) return;
		slot.addEventListener('contextmenu', event => {
			event.preventDefault();
			event.stopPropagation();
			document.querySelector('.team-builder-context-menu')?.remove();
			const menu = el('div', 'team-builder-context-menu');
			menu.setAttribute('role', 'menu');
			const release = button('Liberar Pokémon', 'team-builder-context-release');
			release.setAttribute('role', 'menuitem');
			const reason = releaseBlockedReason(pokemon);
			release.disabled = !!reason;
			if (reason) menu.append(release, el('small', '', reason));
			else menu.append(release);
			release.addEventListener('click', () => openTeamReleaseConfirmation(deps, pokemon));
			document.body.append(menu);
			const bounds = menu.getBoundingClientRect();
			menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8)) + 'px';
			menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8)) + 'px';
			const dismiss = outside => {
				if (menu.contains(outside.target)) return;
				menu.remove();
				document.removeEventListener('pointerdown', dismiss, true);
			};
			window.setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
		});
	}
	function moveCard(choice, pp, click, showPP = true) {
		const type = String(choice?.type || 'normal').toLowerCase();
		const card = button('', 'team-builder-move-card rpg-move-button type-' + type);
		if (!choice) {
			card.classList.add('empty');
			card.setAttribute('aria-label', 'Espaço de golpe vazio');
			if (click) card.addEventListener('click', click);
			return card;
		}
		const title = el('div', 'rpg-move-title');
		title.append(el('strong', '', choice.name));
		const categoryIcon = el('i', 'rpg-category-icon category-' + choice.category.toLowerCase());
		categoryIcon.setAttribute('aria-label', choice.category);
		const identity = el('div', 'rpg-move-identity');
		identity.append(categoryIcon, el('span', 'rpg-type-badge type-' + type, choice.type.toUpperCase()));
		const technical = el('div', 'rpg-move-technical');
		technical.append(
			el('span', '', choice.basePower === null ? 'Power —' : 'Power ' + choice.basePower),
			el('span', '', choice.alwaysHits ? 'Accuracy —' : 'Accuracy ' + (choice.accuracy ?? '—') + '%')
		);
		const range = el('div', 'rpg-move-range', choice.targetLabel || choice.target || '');
		const flags = el('div', 'rpg-move-compact-flags');
		for (const flag of (choice.flags || []).filter(entry =>
			['contact', 'sound', 'bullet', 'bite', 'punch', 'reflectable'].includes(entry.id)).slice(0, 2)) {
			flags.append(el('span', '', '(' + String(flag.label || flag.id).toLowerCase() + ')'));
		}
		const summary = el('div', 'rpg-move-summary');
		summary.append(identity, technical, range, flags);
		const explanation = el('div', 'rpg-move-explanation');
		explanation.append(el('p', 'rpg-move-button-description', choice.description || 'Sem efeito adicional.'));
		if (showPP) explanation.append(el('b', 'rpg-move-pp', 'PP ' + (pp ?? choice.pp) + '/' + choice.pp));
		const body = el('div', 'rpg-move-button-body');
		body.append(summary, explanation);
		card.append(title, body);
		if (click) card.addEventListener('click', click);
		return card;
	}
	async function render(deps) {
		const root = el('div', 'team-builder-page');
		if (deps.selectedEgg) {
			root.classList.add('read-only', 'team-builder-egg-view');
			const strip = el('section', 'panel team-builder-team-strip');
			const slots = el('div', 'team-builder-team-slots');
			for (let index = 0; index < 6; index++) {
				const member = deps.team?.[index];
				if (!member?.pokemonId) {
					const empty = el('span', 'team-builder-team-slot empty');
					empty.setAttribute('aria-label', 'Espaço vazio ' + (index + 1));
					slots.append(empty);
					continue;
				}
				const slot = button('', 'team-builder-team-slot' +
					(member.virtualEgg ? ' team-builder-team-egg-slot' : '') +
					(member.pokemonId === deps.pokemonId ? ' active' : ''));
				const sprite = member.virtualEgg && deps.eggVisual ?
					deps.eggVisual(member, 'team-builder-team-egg-visual') : el('img');
				if (!member.virtualEgg || !deps.eggVisual) {
					sprite.src = deps.spriteUrl(member);
					sprite.alt = member.virtualEgg ? 'Egg' : (member.species || member.name);
				}
				slot.append(sprite, el('strong', '', member.name || member.species),
					el('small', '', member.virtualEgg ? 'Lv. ?' : 'Lv. ' + (member.level || 1)));
				slot.addEventListener('click', () => {
					if (member.pokemonId !== deps.pokemonId) deps.switchPokemon(member.pokemonId);
				});
				bindTeamReleaseMenu(slot, deps, member);
				slots.append(slot);
			}
			strip.append(slots);
			const card = el('section', 'panel team-builder-showdown-card team-builder-egg-card');
			const toolbar = el('div', 'team-builder-showdown-toolbar');
			const nicknameBox = el('div', 'team-builder-nickname-box team-builder-egg-nickname-box');
			nicknameBox.append(el('span', '', 'Apelido'), el('strong', 'team-builder-egg-nickname', 'Egg'));
			const detailGrid = el('div', 'team-builder-detail-grid');
			for (const label of ['Shiny', 'Gênero', 'Level', 'XP']) {
				const cell = el('div', 'team-builder-detail-cell');
				cell.append(el('small', '', label), el('strong', '', '?'));
				detailGrid.append(cell);
			}
			toolbar.append(nicknameBox, detailGrid);
			const body = el('div', 'team-builder-showdown-body team-builder-egg-body');
			const portrait = el('div', 'team-builder-portrait');
			const sprite = deps.eggVisual ?
				deps.eggVisual(deps.selectedEgg, 'team-builder-large-sprite team-builder-large-egg-sprite') :
				el('img', 'team-builder-large-sprite team-builder-large-egg-sprite');
			if (!deps.eggVisual) {
				sprite.src = deps.spriteUrl({species: 'Egg'});
				sprite.alt = 'Egg';
			}
			portrait.append(sprite, el('strong', '', 'Egg'));
			const message = el('div', 'team-builder-egg-message');
			message.append(el('p', '', 'Parece que tem algo se mexendo.'));
			body.append(portrait, message);
			card.append(toolbar, body);
			const incubatorPanel = el('section', 'panel team-builder-egg-incubators');
			incubatorPanel.append(el('h2', '', 'Incubadoras Portáteis'));
			const incubatorGrid = el('div', 'team-builder-incubator-grid');
			const incubators = Array.isArray(deps.portableIncubators) ? deps.portableIncubators : [];
			for (const [index, incubator] of incubators.entries()) {
				const linkedHere = incubator.eggId === deps.selectedEgg.eggId;
				const unit = el('article', 'team-builder-incubator-unit' +
					(linkedHere ? ' selected' : '') + (incubator.loaded ? ' loaded' : ' empty'));
				const image = deps.portableIncubatorVisual ?
					deps.portableIncubatorVisual(incubator.loaded, 'team-builder-incubator-sprite') :
					el('span', 'team-builder-incubator-sprite');
				const copy = el('div', 'team-builder-incubator-copy');
				copy.append(el('strong', '', 'Incubadora Portátil ' + (index + 1)));
				copy.append(el('small', '', incubator.loaded ?
					(linkedHere ? 'Contém este Egg' : 'Contém outro Egg') : 'Disponível'));
				unit.append(image, copy);
				if (linkedHere) {
					if (deps.selectedEgg.status === 'ready_to_hatch') {
						const hatch = button('Chocar', 'button primary');
						hatch.addEventListener('click', async () => {
							hatch.disabled = true;
							try {
								await window.RPGNurseryHatch.play(deps, deps.selectedEgg, () =>
									deps.api('/nursery/hatch', {method: 'POST', body: {
										characterId: deps.characterId, eggId: deps.selectedEgg.eggId,
									}})
								);
								await deps.refresh();
							} catch (error) { hatch.disabled = false; deps.toast(error.message, true); }
						});
						unit.append(hatch);
					} else {
						const remove = button('Retirar Egg', 'button');
						remove.addEventListener('click', async () => {
							remove.disabled = true;
							try {
								await deps.api('/nursery/portable-stop', {method: 'POST', body: {
									characterId: deps.characterId, eggId: deps.selectedEgg.eggId,
								}});
								deps.toast('Egg retirado da Incubadora Portátil.');
								await deps.refresh();
							} catch (error) { remove.disabled = false; deps.toast(error.message, true); }
						});
						unit.append(remove);
					}
				} else if (!incubator.loaded && !deps.selectedEgg.portableIncubator) {
					const insert = button('Colocar Egg', 'button primary');
					insert.addEventListener('click', async () => {
						insert.disabled = true;
						try {
							await deps.api('/nursery/portable-start', {method: 'POST', body: {
								characterId: deps.characterId, eggId: deps.selectedEgg.eggId,
							}});
							deps.toast('Egg colocado na Incubadora Portátil.');
							await deps.refresh();
						} catch (error) { insert.disabled = false; deps.toast(error.message, true); }
					});
					unit.append(insert);
				}
				incubatorGrid.append(unit);
			}
			if (!incubators.length) incubatorGrid.append(el('p', 'empty-state',
				'Você não possui nenhuma Incubadora Portátil.'));
			incubatorPanel.append(incubatorGrid);
			root.append(strip, card, incubatorPanel);
			return root;
		}
		let data;
		const isReadOnly = () => deps.readOnly === true || data?.readOnly === true;
		let draftMoves = [];
		let draftPP = [];
		let draftAbility = '';
		let draftNickname = '';
		let draftLevel = 1;
		let draftExperience = 0;
		let draftEVs = {};
		let draftIVs = {};
		let activePane = null;
		let activeMoveSlot = 0;
		let draggedMoveSlot = null;
		let suppressMoveClickUntil = 0;
		let message = '';
		let healingPopover = null;
		let healingOutsideHandler = null;

		function hydrateDrafts() {
			draftMoves = data.pokemon.moves.map(move => move.id);
			draftPP = data.pokemon.moves.map(move => move.pp);
			draftAbility = data.pokemon.ability;
			draftNickname = data.pokemon.name;
			draftLevel = data.pokemon.level;
			draftExperience = data.experience.current;
			draftEVs = Object.fromEntries(STATS.map(([id]) => [id, data.pokemon.evs[id] || 0]));
			draftIVs = Object.fromEntries(STATS.map(([id]) => [id, data.pokemon.ivs[id] ?? 31]));
		}

		async function load() {
			const query = new URLSearchParams({ characterId: deps.characterId });
			data = (await deps.api('/team-builder/' + encodeURIComponent(deps.pokemonId) + '?' + query)).teamBuilder;
			hydrateDrafts();
			draw();
		}
		async function run(operation, success) {
			if (isReadOnly()) return;
			try {
				const result = await operation();
				if (success) deps.toast(success);
				if (result?.teamBuilder) {
					data = result.teamBuilder;
					hydrateDrafts();
					message = result.training ?
						'Treinamento iniciado: ' + result.training.amount + ' EVs serão transferidos · ' +
						formatMoney(result.training.cost) + ' · ' +
						formatDuration(result.training.roleplayDurationMs) + ' no relógio da campanha.' : '';
					draw();
				} else {
					await load();
				}
			} catch (error) {
				deps.toast(error.message, true);
			}
		}
		function choiceById(id) {
			return data.moves.choices.find(move => move.id === id);
		}
		function currentPP(slot) {
			return draftPP[slot] ?? maximumPP(slot);
		}
		function maximumPP(slot) {
			const current = data.pokemon.moves[slot];
			if (current && current.id === draftMoves[slot]) return current.maxPP;
			return choiceById(draftMoves[slot])?.pp || 1;
		}
		function setMasterPP(slot, rawValue) {
			if (isReadOnly() || !data.permissions.master) return;
			const maximum = maximumPP(slot);
			draftPP[slot] = Math.max(0, Math.min(maximum, Math.round(Number(rawValue) || 0)));
			window.clearTimeout(setMasterPP.timer);
			setMasterPP.timer = window.setTimeout(() => {
				const pp = draftMoves.map((move, index) => Math.max(0, Math.min(maximumPP(index), currentPP(index))));
				void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId), {
					method: 'PATCH', body: {
						characterId: deps.characterId, expectedRevision: data.boxRevision, edit: { pp },
					},
				}), 'PP atualizado.');
			}, 250);
		}
		function candidate() {
			const pokemon = data.pokemon;
			return {
				name: data.permissions.nickname ? (draftNickname.trim() || pokemon.species) : pokemon.name,
				species: pokemon.species,
				level: data.permissions.master ? Number(draftLevel) : pokemon.level,
				gender: pokemon.gender,
				shiny: pokemon.shiny,
				nature: pokemon.nature,
				item: pokemon.item,
				ability: draftAbility,
				moves: data.permissions.master ? draftMoves.map(id => choiceById(id)?.name || id) :
					pokemon.moves.map(move => move.name),
				evs: { ...draftEVs },
				ivs: { ...draftIVs },
			};
		}
		function saveGeneral() {
			if (isReadOnly()) return;
			if (data.permissions.master) {
				const evValues = STATS.map(([id]) => Number(draftEVs[id]));
				if (evValues.some(value => !Number.isSafeInteger(value) || value < 0 || value > 252 || value % 4 !== 0) ||
					evValues.reduce((sum, value) => sum + value, 0) !== 508) {
					deps.toast('Os EVs devem ser múltiplos de 4, respeitar 252 por atributo e totalizar 508.', true);
					return;
				}
			}
			if (!draftMoves.length) {
				deps.toast('O Pokémon precisa ter pelo menos um golpe.', true);
				return;
			}
			void run(() => deps.api('/team-builder/' + encodeURIComponent(deps.pokemonId), {
				method: 'POST',
				body: {
					characterId: deps.characterId,
					expectedRevision: data.boxRevision,
					pokemon: candidate(),
				},
			}), 'Alterações salvas.');
		}
		function saveNickname() {
			if (isReadOnly() || !data.permissions.nickname) return;
			void run(() => deps.api('/team-builder/' + encodeURIComponent(deps.pokemonId) + '/nickname', {
				method: 'POST',
				body: {
					characterId: deps.characterId,
					expectedRevision: data.boxRevision,
					nickname: draftNickname.trim() || data.pokemon.species,
				},
			}), 'Apelido atualizado.');
		}
		function teachTM(choice, slot) {
			const forgottenMoveId = draftMoves.length >= 4 ? draftMoves[slot] : undefined;
			void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId) + '/use-tm', {
				method: 'POST',
				body: {
					characterId: deps.characterId, itemId: choice.tmItemId,
					forgottenMoveId, actionId: actionId(),
					expectedBoxRevision: data.boxRevision, expectedBagRevision: data.bagRevision,
				},
			}), choice.name + ' foi ensinado.');
		}
		function teamStrip() {
			const strip = el('section', 'panel team-builder-team-strip');
			const slots = el('div', 'team-builder-team-slots');
			for (let index = 0; index < 6; index++) {
				const pokemon = deps.team?.[index];
				if (!pokemon?.pokemonId) {
					const empty = el('span', 'team-builder-team-slot empty');
					empty.setAttribute('aria-label', 'Espaço vazio ' + (index + 1));
					slots.append(empty);
					continue;
				}
				const slot = button('', 'team-builder-team-slot' +
					(pokemon.virtualEgg ? ' team-builder-team-egg-slot' : '') +
					(pokemon.pokemonId === deps.pokemonId ? ' active' : ''));
				const sprite = pokemon.virtualEgg && deps.eggVisual ?
					deps.eggVisual(pokemon, 'team-builder-team-egg-visual') : el('img');
				if (!pokemon.virtualEgg || !deps.eggVisual) {
					sprite.src = deps.spriteUrl(pokemon);
					sprite.alt = pokemon.species || pokemon.name;
				}
				slot.append(
					sprite,
					el('strong', '', pokemon.name || pokemon.species),
					el('small', '', pokemon.virtualEgg ? 'Lv. ?' : 'Lv. ' + (pokemon.level || 1))
				);
				slot.addEventListener('click', () => {
					if (pokemon.pokemonId !== deps.pokemonId) deps.switchPokemon(pokemon.pokemonId);
				});
				bindTeamReleaseMenu(slot, deps, pokemon);
				slots.append(slot);
			}
			strip.append(slots);
			return strip;
		}
		function statusLabel() {
			return STATUS_LABELS[data.permanentState.status] || data.permanentState.status || 'Saudável';
		}
		function calculatedStat(id) {
			const stat = data.stats.find(entry => entry.id === id);
			if (!stat) return 0;
			const ev = Number(draftEVs[id] || 0);
			const iv = Number(draftIVs[id] ?? 31);
			if (id === 'hp') {
				if (data.pokemon.speciesId === 'shedinja') return 1;
				return Math.floor((2 * stat.base + iv + Math.floor(ev / 4)) * draftLevel / 100) + draftLevel + 10;
			}
			const neutral = Math.floor((2 * stat.base + iv + Math.floor(ev / 4)) * draftLevel / 100) + 5;
			return Math.floor(neutral * (data.nature.plus === id ? 1.1 : data.nature.minus === id ? 0.9 : 1));
		}
		function openPane(name, moveSlot) {
			if (isReadOnly()) return;
			if (name === 'stats' && !data.permissions.training && !isReadOnly()) return;
			activePane = activePane === name && (name !== 'moves' || activeMoveSlot === moveSlot) ? null : name;
			if (moveSlot !== undefined) activeMoveSlot = moveSlot;
			draw();
		}
		function compactStats() {
			const locked = !data.permissions.training && !isReadOnly();
			const panel = el('div', 'team-builder-summary-stats' + (locked ? ' locked' : ''));
			if (!isReadOnly()) {
				panel.tabIndex = 0;
				panel.setAttribute('role', 'button');
				panel.setAttribute('aria-label', locked ? 'Treinamento bloqueado' : 'Abrir atributos');
			}
			const title = el('div', 'team-builder-summary-title');
			title.append(el('strong', '', 'Atributos'), el('small', '', 'EV'), el('small', '', 'IV'), el('small', '', 'Total'));
			panel.append(title);
			for (const [id, label] of STATS) {
				const total = calculatedStat(id);
				const row = el('div', 'team-builder-summary-stat');
				const track = el('span', 'team-builder-summary-track nature-' +
					(data.nature.plus === id ? 'raised' : data.nature.minus === id ? 'lowered' : 'neutral'));
				const fill = el('span');
				fill.style.width = Math.max(0, Math.min(100, total / 330 * 100)) + '%';
				track.append(fill);
				row.append(
					el('span', '', label), track,
					el('small', 'team-builder-summary-ev', String(draftEVs[id] || 0)),
					el('small', 'team-builder-summary-iv', String(draftIVs[id] ?? 31)),
					el('strong', 'team-builder-live-total', String(total))
				);
				row.dataset.stat = id;
				panel.append(row);
			}
			const nature = el('div', 'team-builder-summary-nature');
			nature.append(el('span', 'team-builder-summary-nature-name', 'Natureza: ' + data.nature.name));
			const natureModifiers = el('span', 'team-builder-summary-nature-modifiers');
			const raised = data.nature.plus ? STATS.find(([id]) => id === data.nature.plus)?.[1] : null;
			const lowered = data.nature.minus ? STATS.find(([id]) => id === data.nature.minus)?.[1] : null;
			if (raised || lowered) {
				if (raised) natureModifiers.append(el('strong', 'raised', '+' + raised));
				if (raised && lowered) natureModifiers.append(el('span', 'separator', '·'));
				if (lowered) natureModifiers.append(el('strong', 'lowered', '-' + lowered));
			} else {
				natureModifiers.append(el('strong', 'neutral', 'Sem alteração'));
			}
			nature.append(natureModifiers);
			panel.append(nature);
			if (!isReadOnly()) {
				panel.addEventListener('click', () => openPane('stats'));
				panel.addEventListener('keydown', event => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					openPane('stats');
				});
			}
			return panel;
		}
		function closeHealingPopover() {
			if (healingOutsideHandler) document.removeEventListener('pointerdown', healingOutsideHandler);
			healingOutsideHandler = null;
			healingPopover?.remove();
			healingPopover = null;
		}
		function healingEffectText(item) {
			const effect = item.effect || {};
			if (effect.type === 'cure-status') return 'Cura ' + statusLabel() + '.';
			if (effect.full) return effect.cureStatus ? 'Cura o status e restaura todo o HP.' : 'Restaura todo o HP.';
			return 'Recupera ' + String(effect.amount || 0) + ' HP.';
		}
		function positionHealingPopover(anchor, panel) {
			document.body.append(panel); healingPopover = panel;
			const rect = anchor.getBoundingClientRect();
			const requestedWidth = panel.classList.contains('team-builder-master-hp-popover') ? rect.width + 90 :
				panel.classList.contains('team-builder-master-status-popover') ? 132 : 250;
			const width = Math.min(requestedWidth, window.innerWidth - 20);
			panel.style.width = width + 'px';
			panel.style.left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left)) + 'px';
			panel.style.top = Math.min(window.innerHeight - panel.offsetHeight - 10, rect.bottom + 5) + 'px';
			healingOutsideHandler = event => {
				if (panel.contains(event.target) || anchor.contains(event.target)) return;
				closeHealingPopover();
			};
			setTimeout(() => document.addEventListener('pointerdown', healingOutsideHandler), 0);
		}
		function openMasterStatePopover(anchor, mode) {
			closeHealingPopover();
			const panel = el('div', 'team-builder-healing-popover team-builder-master-state-popover');
			if (mode === 'hp') {
				panel.classList.add('team-builder-master-hp-popover');
				panel.append(el('strong', 'team-builder-popover-title', 'Definir HP'));
				const controls = el('div', 'team-builder-master-hp-controls');
				const slider = input('range', data.permanentState.hp);
				slider.className = 'team-builder-master-hp-slider';
				const number = input('number', data.permanentState.hp);
				number.className = 'team-builder-master-hp-number';
				for (const control of [slider, number]) {
					control.min = 0; control.max = data.permanentState.maxHP; control.step = 1;
				}
				const syncHP = rawValue => {
					const hp = Math.max(0, Math.min(data.permanentState.maxHP, Math.round(Number(rawValue) || 0)));
					slider.value = String(hp);
					number.value = String(hp);
					slider.classList.remove('healthy', 'warning', 'critical', 'fainted');
					slider.classList.add(hpTone(hp, data.permanentState.maxHP));
					slider.style.setProperty('--hp-fill', (data.permanentState.maxHP ? hp / data.permanentState.maxHP * 100 : 0) + '%');
				};
				slider.addEventListener('input', () => syncHP(slider.value));
				number.addEventListener('input', () => syncHP(number.value));
				syncHP(data.permanentState.hp);
				controls.append(slider, number);
				const apply = button('Aplicar', 'team-builder-healing-choice team-builder-master-apply');
				apply.addEventListener('click', () => {
					const hp = Math.max(0, Math.min(data.permanentState.maxHP, Number(number.value) || 0));
					closeHealingPopover();
					void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId), {
						method: 'PATCH', body: { characterId: deps.characterId, expectedRevision: data.boxRevision, edit: { hp } },
					}), 'HP atualizado.');
				});
				panel.append(controls, apply);
			} else {
				panel.classList.add('team-builder-master-status-popover');
				const makeStatusChoice = (status, symbol, title) => {
					const choice = button('', 'team-builder-healing-choice team-builder-master-status-choice' +
						(data.permanentState.status === status ? ' selected' : ''));
					choice.setAttribute('aria-label', title);
					choice.append(el('span', 'box-condition status-' + (status || 'normal'), symbol));
					choice.addEventListener('click', () => {
						closeHealingPopover();
						void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId), {
							method: 'PATCH', body: {
								characterId: deps.characterId, expectedRevision: data.boxRevision, edit: { status },
							},
						}), 'Status atualizado.');
					});
					return choice;
				};
				const header = el('div', 'team-builder-master-status-header');
				header.append(
					el('strong', 'team-builder-popover-title', 'Status'),
					makeStatusChoice('', 'OK', 'Normal'),
				);
				const choices = el('div', 'team-builder-master-status-grid');
				for (const statusChoice of [
					['brn', 'BRN', 'Burn'], ['par', 'PAR', 'Paralysis'],
					['psn', 'PSN', 'Poison'], ['tox', 'TOX', 'Badly Poisoned'],
					['slp', 'SLP', 'Sleep'], ['frz', 'FRZ', 'Freeze'],
				]) {
					choices.append(makeStatusChoice(...statusChoice));
				}
				panel.append(header, choices);
			}
			positionHealingPopover(anchor, panel);
		}
		async function openHealingPopover(anchor, mode) {
			closeHealingPopover();
			try {
				const response = await deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId) + '/healing-items', {
					method: 'POST', body: { characterId: deps.characterId },
				});
				const items = response.items.filter(item => mode === 'hp' ? item.effect?.type === 'heal-hp' :
					item.effect?.type === 'cure-status' || (item.effect?.type === 'heal-hp' && item.effect?.cureStatus));
				if (!items.length || !anchor.isConnected) return;
				const panel = el('div', 'team-builder-healing-popover');
				for (const item of items) {
					const choice = button('', 'team-builder-healing-choice');
					choice.append(el('strong', '', item.name), el('small', '', healingEffectText(item)));
					choice.addEventListener('click', event => {
						event.stopPropagation(); closeHealingPopover();
						void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId) + '/use-healing-item', {
							method: 'POST', body: {
								characterId: deps.characterId, itemId: item.id,
								actionId: 'team-builder-heal:' + deps.pokemonId + ':' + Date.now() + ':' + Math.random().toString(36).slice(2),
								expectedBoxRevision: response.boxRevision, expectedBagRevision: response.bagRevision,
							},
						}), item.name + ' utilizado.');
					});
					panel.append(choice);
				}
				positionHealingPopover(anchor, panel);

			} catch (error) { deps.toast(error.message, true); }
		}
		function makeHealingTrigger(element, mode) {
			element.classList.add('team-builder-healing-trigger');
			element.tabIndex = 0; element.setAttribute('role', 'button');
			element.addEventListener('click', event => { event.stopPropagation(); void openHealingPopover(element, mode); });
			element.addEventListener('keydown', event => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault(); void openHealingPopover(element, mode);
			});
		}
		function makeMasterStateTrigger(element, mode) {
			element.classList.add('team-builder-healing-trigger', 'team-builder-master-state-trigger');
			element.tabIndex = 0; element.setAttribute('role', 'button');
			element.addEventListener('click', event => { event.stopPropagation(); openMasterStatePopover(element, mode); });
			element.addEventListener('keydown', event => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault(); openMasterStatePopover(element, mode);
			});
		}
		function selectedPokemonCard() {
			const card = el('section', 'panel team-builder-showdown-card');
			const toolbar = el('div', 'team-builder-showdown-toolbar');
			const nicknameBox = el('label', 'team-builder-nickname-box');
			nicknameBox.append(el('span', '', 'Apelido'));
			const nickname = input('text', draftNickname, isReadOnly() || !data.permissions.nickname);
			nickname.className = 'team-builder-nickname-input';
			nickname.setAttribute('aria-label', 'Apelido');
			if (!isReadOnly()) {
				nickname.addEventListener('input', () => { draftNickname = nickname.value; });
				nickname.addEventListener('change', saveNickname);
			}
			nicknameBox.append(nickname);
			const detailGrid = el('div', 'team-builder-detail-grid');
			const levelControl = data.permissions.master && !isReadOnly() ? input('number', draftLevel) : el('strong', '', String(draftLevel));
			if (data.permissions.master && !isReadOnly()) {
				levelControl.min = 1;
				levelControl.max = 999;
				levelControl.addEventListener('input', () => {
					draftLevel = Math.max(1, Math.min(999, Number(levelControl.value) || 1));
				});
				levelControl.addEventListener('change', saveGeneral);
			}
			const xpText = data.experience.nextLevel === undefined ?
				new Intl.NumberFormat('pt-BR').format(data.experience.current) + ' · nível máximo' :
				new Intl.NumberFormat('pt-BR').format(data.experience.current) + ' / ' +
					new Intl.NumberFormat('pt-BR').format(data.experience.nextLevel);
			let xpControl = xpText;
			if (data.permissions.master && !isReadOnly()) {
				const wrapper = el('div', 'team-builder-xp-editor');
				const experience = input('number', draftExperience);
				experience.min = 0; experience.max = Number.MAX_SAFE_INTEGER; experience.step = 1;
				experience.setAttribute('aria-label', 'Experiência atual');
				experience.addEventListener('input', () => {
					draftExperience = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(experience.value) || 0)));
				});
				experience.addEventListener('change', () => {
					experience.value = String(draftExperience);
					void run(() => deps.api('/box/pokemon/' + encodeURIComponent(deps.pokemonId), {
						method: 'PATCH', body: {
							characterId: deps.characterId, expectedRevision: data.boxRevision,
							edit: { experience: draftExperience },
						},
					}), 'Experiência atualizada.');
				});
				wrapper.append(experience);
				if (data.experience.nextLevel !== undefined) {
					wrapper.append(el('span', '', '/ ' + new Intl.NumberFormat('pt-BR').format(data.experience.nextLevel)));
				} else {
					wrapper.append(el('span', '', '· nível máximo'));
				}
				xpControl = wrapper;
			}
			for (const [label, value] of [
				['Shiny', data.pokemon.shiny ? 'Sim' : 'Não'], ['Gênero', data.pokemon.gender || 'N'],
				['Level', levelControl], ['XP', xpControl],
			]) {
				const cell = el('div', 'team-builder-detail-cell');
				cell.append(el('small', '', label), typeof value === 'string' ? el('strong', '', value) : value);
				detailGrid.append(cell);
			}
			toolbar.append(nicknameBox, detailGrid);
			const trainingJob = data.pokemon.metadata.evTraining;
			if (trainingJob) {
				toolbar.classList.add('has-training-origin');
				const trainingOrigin = button('', 'team-builder-training-origin' +
					(activePane === 'training' ? ' active' : ''));
				trainingOrigin.append(trainingIcon());
				trainingOrigin.setAttribute('aria-label', 'Ver treinamento em andamento');
				trainingOrigin.setAttribute('aria-expanded', String(activePane === 'training'));
				trainingOrigin.addEventListener('click', () => {
					activePane = activePane === 'training' ? null : 'training';
					draw();
				});
				toolbar.append(trainingOrigin);
			} else if (isReadOnly()) {
				toolbar.classList.add('has-box-origin');
				const boxOrigin = button('Box →', 'team-builder-box-origin');
				boxOrigin.addEventListener('click', deps.close);
				toolbar.append(boxOrigin);
			}
			const body = el('div', 'team-builder-showdown-body');
			const portrait = el('div', 'team-builder-portrait');
			const sprite = el('img', 'team-builder-large-sprite');
			sprite.src = deps.spriteUrl(data.pokemon);
			sprite.alt = data.pokemon.species;
			portrait.append(sprite, el('strong', '', data.pokemon.species));
			const details = el('div', 'team-builder-details');
			const typeStatus = el('div', 'team-builder-type-status-row');
			const types = el('div', 'team-builder-current-types');
			for (const type of data.pokemon.types) types.append(typeBadge(type));
			typeStatus.append(types);
			if (data.permanentState.status || data.permissions.master) {
				const status = data.permanentState.status ?
					el('span', 'box-condition status-' + data.permanentState.status,
						String(data.permanentState.status).toUpperCase()) :
					el('span', 'box-condition status-normal', 'Normal');
				typeStatus.append(status);
				if (!isReadOnly() && data.permissions.master) makeMasterStateTrigger(status, 'status');
				else if (!isReadOnly()) makeHealingTrigger(status, 'status');
			}
			const hp = el('div', 'team-builder-main-hp');
			const hpTop = el('div');
			hpTop.append(el('strong', '', 'HP'), el('span', '', data.permanentState.hp + ' / ' + data.permanentState.maxHP));
			hp.append(hpTop, statBar(
				data.permanentState.hp, data.permanentState.maxHP,
				'hp ' + hpTone(data.permanentState.hp, data.permanentState.maxHP)
			));
			if (!isReadOnly() && data.permissions.master) makeMasterStateTrigger(hp, 'hp');
			else if (!isReadOnly() && data.permanentState.hp > 0 && data.permanentState.hp < data.permanentState.maxHP) makeHealingTrigger(hp, 'hp');
			const item = button('', 'team-builder-main-property team-builder-main-item');
			item.append(itemIcon(data.items.current), el('strong', '', data.items.current?.name || 'Nenhum item'));
			if (!isReadOnly()) item.addEventListener('click', () => openPane('items'));
			else { item.tabIndex = -1; item.setAttribute('aria-disabled', 'true'); }
			const ability = data.abilities.find(entry => entry.id === String(draftAbility).toLowerCase().replace(/[^a-z0-9]/g, '')) ||
				data.abilities.find(entry => entry.current);
			const abilityButton = button('', 'team-builder-main-property team-builder-main-ability');
			abilityButton.append(el('span', '', 'Habilidade:'), el('strong', '', ability?.name || draftAbility));
			if (!isReadOnly()) abilityButton.addEventListener('click', () => openPane('abilities'));
			else { abilityButton.tabIndex = -1; abilityButton.setAttribute('aria-disabled', 'true'); }
			const properties = el('div', 'team-builder-property-grid');
			properties.append(item, abilityButton);
			details.append(typeStatus, hp, properties);
			body.append(portrait, details, compactStats());
			card.append(toolbar, body);
			return card;
		}
		function selectedMoves() {
			const section = el('section', 'panel team-builder-selected-moves');
			const heading = el('div', 'team-builder-section-heading');
			heading.append(el('h2', '', 'Golpes'));
			section.append(heading);
			const grid = el('div', 'team-builder-four-moves');
			for (let slot = 0; slot < 4; slot++) {
				const id = draftMoves[slot];
				const editablePP = !!id && data.permissions.master && !isReadOnly();
				const card = moveCard(choiceById(id), currentPP(slot), isReadOnly() ? null : () => {
					if (Date.now() >= suppressMoveClickUntil) openPane('moves', slot);
				}, !editablePP);
				const moveSlot = el('div', 'team-builder-move-slot');
				moveSlot.append(card);
				if (editablePP) {
					const maximum = maximumPP(slot);
					const ppControl = el('div', 'team-builder-master-pp-control');
					const ppUp = button('', 'team-builder-pp-arrow up');
					const ppDown = button('', 'team-builder-pp-arrow down');
					const ppValue = el('span', 'team-builder-master-pp-value');
					ppUp.setAttribute('aria-label', 'Aumentar PP de ' + choiceById(id).name);
					ppDown.setAttribute('aria-label', 'Diminuir PP de ' + choiceById(id).name);
					const updatePPControl = delta => {
						if (delta) setMasterPP(slot, currentPP(slot) + delta);
						ppValue.textContent = 'PP ' + currentPP(slot) + '/' + maximum;
						ppUp.disabled = currentPP(slot) >= maximum;
						ppDown.disabled = currentPP(slot) <= 0;
					};
					ppUp.addEventListener('click', () => updatePPControl(1));
					ppDown.addEventListener('click', () => updatePPControl(-1));
					updatePPControl(0);
					ppControl.append(ppUp, ppValue, ppDown);
					moveSlot.append(ppControl);
				}
				if (isReadOnly()) {
					card.tabIndex = -1;
					card.setAttribute('aria-disabled', 'true');
				}
				if (id && !isReadOnly()) {
					card.draggable = true;
					card.dataset.moveSlot = String(slot);
					card.addEventListener('dragstart', event => {
						draggedMoveSlot = slot;
						card.classList.add('dragging');
						event.dataTransfer.effectAllowed = 'move';
						event.dataTransfer.setData('text/plain', String(slot));
					});
					card.addEventListener('dragover', event => {
						if (draggedMoveSlot === null || draggedMoveSlot === slot) return;
						event.preventDefault();
						event.dataTransfer.dropEffect = 'move';
						card.classList.add('drag-target');
					});
					card.addEventListener('dragleave', () => card.classList.remove('drag-target'));
					card.addEventListener('drop', event => {
						event.preventDefault();
						card.classList.remove('drag-target');
						const fromSlot = draggedMoveSlot;
						draggedMoveSlot = null;
						suppressMoveClickUntil = Date.now() + 300;
						if (fromSlot === null || fromSlot === slot) return;
						activePane = null;
						void run(() => deps.api('/team-builder/' + encodeURIComponent(deps.pokemonId) + '/reorder-moves', {
							method: 'POST',
							body: {
								characterId: deps.characterId, fromSlot, toSlot: slot,
								expectedRevision: data.boxRevision,
							},
						}), 'Ordem dos golpes atualizada.');
					});
					card.addEventListener('dragend', () => {
						draggedMoveSlot = null;
						card.classList.remove('dragging');
						grid.querySelectorAll('.drag-target').forEach(target => target.classList.remove('drag-target'));
					});
				}
				grid.append(moveSlot);
			}
			section.append(grid);
			return section;
		}
		function itemLine(item, selected = false) {
			const line = button('', 'team-builder-browser-row item-row' + (selected ? ' selected' : ''));
			line.append(itemIcon(item));
			const text = el('span');
			text.append(el('strong', '', item?.name || 'Nenhum item'), el('small', '', item?.description || 'Sem item equipado.'));
			line.append(text);
			if (item?.quantity > 0) line.append(el('b', '', '×' + item.quantity));
			return line;
		}
		function itemPane() {
			const pane = el('section', 'panel team-builder-browser');
			pane.append(el('h2', '', 'Equipar item'));
			const current = itemLine(data.items.current, true);
			current.disabled = true;
			pane.append(current);
			const favorites = data.items.choices.filter(item => item.favorite);
			const groups = [
				['Favoritos', favorites],
				['Held Items', data.items.choices.filter(item => !item.berry && !item.megaStone)],
				['Berries', data.items.choices.filter(item => item.berry)],
				['Mega Stones', data.items.choices.filter(item => item.megaStone)],
			];
			for (const [label, items] of groups) {
				pane.append(el('h3', 'team-builder-browser-heading', label));
				const list = el('div', 'team-builder-browser-list');
				for (const item of items) {
					const line = itemLine(item, item.id === data.items.current?.id);
					line.disabled = isReadOnly() || item.id === data.items.current?.id;
					if (!isReadOnly()) line.addEventListener('click', () => void run(() => deps.api('/bag/equip', {
						method: 'POST',
						body: {
							characterId: deps.characterId, pokemonId: deps.pokemonId, itemId: item.id,
							expectedBagRevision: data.bagRevision, expectedBoxRevision: data.boxRevision,
						},
					}), item.name + ' equipado.'));
					list.append(line);
				}
				if (items.length) pane.append(list);
			}
			if (data.items.current && !isReadOnly()) {
				const remove = button('Remover item', 'button danger');
				remove.addEventListener('click', () => void run(() => deps.api('/bag/remove-held', {
					method: 'POST',
					body: {
						characterId: deps.characterId, pokemonId: deps.pokemonId,
						expectedBagRevision: data.bagRevision, expectedBoxRevision: data.boxRevision,
					},
				}), 'Item devolvido para a Bag.'));
				pane.append(remove);
			}
			return pane;
		}
		function abilityPane() {
			const pane = el('section', 'panel team-builder-browser');
			pane.append(el('h2', '', 'Habilidades'));
			const current = data.abilities.find(entry => entry.id === String(draftAbility).toLowerCase().replace(/[^a-z0-9]/g, ''));
			if (current) {
				const selected = el('div', 'team-builder-browser-row selected');
				selected.append(el('strong', '', current.name), el('small', '', current.description));
				pane.append(selected);
			}
			for (const [label, hidden] of [['Habilidades', false], ['Habilidade Oculta', true]]) {
				const abilities = data.abilities.filter(entry => entry.hidden === hidden);
				if (!abilities.length) continue;
				pane.append(el('h3', 'team-builder-browser-heading', label));
				for (const ability of abilities) {
					const line = button('', 'team-builder-browser-row ability-row' + (ability.id === current?.id ? ' selected' : ''));
					line.append(el('strong', '', ability.name), el('small', '', ability.description));
					line.disabled = isReadOnly() || !data.permissions.master || ability.id === current?.id;
					if (!isReadOnly()) line.addEventListener('click', () => {
						draftAbility = ability.name;
						activePane = null;
						saveGeneral();
					});
					pane.append(line);
				}
			}
			if (!data.permissions.master) pane.append(el('p', 'team-builder-readonly-note', 'As habilidades são apenas para consulta.'));
			return pane;
		}
		function simpleMoveRow(choice, selectable, selected = false, showLearnedAt = false) {
			const row = button('', 'team-builder-simple-move' + (selected ? ' selected' : ''));
			const name = el('strong', '', choice.name);
			const type = typeBadge(choice.type);
			const typeInfo = el('span', 'team-builder-move-type-info');
			if (showLearnedAt && choice.learnedAt !== undefined) {
				typeInfo.append(el('small', 'team-builder-move-level', `Nv. ${choice.learnedAt}`));
			}
			typeInfo.append(type);
			const category = el('i', 'rpg-category-icon category-' + choice.category.toLowerCase());
			category.setAttribute('aria-label', choice.category);
			const power = el('span', '', choice.basePower === null ? '—' : String(choice.basePower));
			const accuracy = el('span', '', choice.alwaysHits ? '—' : String(choice.accuracy ?? '—') + '%');
			const pp = el('span', '', String(choice.pp));
			row.append(name, typeInfo, category, power, accuracy, pp, el('small', '', choice.description || 'Sem efeito adicional.'));
			row.disabled = !selectable;
			return row;
		}
		function chooseMove(choice) {
			if (isReadOnly()) return;
			if (draftMoves.includes(choice.id) && draftMoves[activeMoveSlot] !== choice.id) {
				deps.toast('Este golpe já está selecionado.', true);
				return;
			}
			if (!data.permissions.master) {
				if (!choice.tmItemId || !choice.tmQuantity) return;
				activePane = null;
				teachTM(choice, activeMoveSlot);
				return;
			}
			if (activeMoveSlot < draftMoves.length) draftMoves[activeMoveSlot] = choice.id;
			else draftMoves.push(choice.id);
			activePane = null;
			saveGeneral();
		}
		function appendMoveGroup(pane, title, choices, mode) {
			pane.append(el('h3', 'team-builder-browser-heading', title));
			if (!choices.length) return;
			const list = el('div', 'team-builder-simple-move-list');
			const typeOrder = {
				Normal: 0, Grass: 1, Fire: 2, Water: 3, Electric: 4, Bug: 5,
				Flying: 6, Poison: 7, Rock: 8, Ground: 9, Ice: 10, Fighting: 11,
				Psychic: 12, Ghost: 13, Dragon: 14, Dark: 15, Steel: 16, Fairy: 17,
			};
			const categoryOrder = { Physical: 0, Special: 1, Status: 2 };
			const orderedChoices = [...choices].sort((first, second) =>
				(typeOrder[first.type] ?? 18) - (typeOrder[second.type] ?? 18) ||
				(categoryOrder[first.category] ?? 3) - (categoryOrder[second.category] ?? 3) ||
				first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }));
			for (const choice of orderedChoices) {
				const selectable = !isReadOnly() && (data.permissions.master || mode === 'owned-tm');
				const row = simpleMoveRow(choice, selectable, false, mode === 'level');
				if (selectable) row.addEventListener('click', () => chooseMove(choice));
				list.append(row);
			}
			pane.append(list);
		}
		function movePane() {
			const pane = el('section', 'panel team-builder-browser');
			pane.append(el('h2', '', 'Escolher move'));
			const selected = choiceById(draftMoves[activeMoveSlot]);
			if (selected) pane.append(simpleMoveRow(selected, false, true));
			appendMoveGroup(pane, 'TMs disponíveis na Bag',
				data.moves.choices.filter(choice => choice.tmCompatible && choice.tmQuantity > 0), 'owned-tm');
			appendMoveGroup(pane, 'Aprendidos por nível',
				data.moves.choices.filter(choice => choice.learnedAt !== undefined), 'level');
			appendMoveGroup(pane, 'TMs compatíveis',
				data.moves.choices.filter(choice => choice.tmCompatible), 'tm');
			if (data.permissions.master) appendMoveGroup(pane, 'Outros golpes compatíveis',
				data.moves.choices.filter(choice => choice.source === 'master' &&
					choice.learnedAt === undefined && !choice.tmCompatible), 'master');
			return pane;
		}
		function statsPane() {
			const pane = el('section', 'panel team-builder-browser team-builder-stats-browser');
			const heading = el('div', 'team-builder-section-heading');
			const totalLabel = el('small', '', 'EVs: 0 / 508');
			heading.append(el('h2', '', 'Atributos'), totalLabel);
			pane.append(heading);
			const header = el('div', 'team-builder-stats-header');
			header.append(el('span', '', ''), el('strong', '', 'Base'), el('strong', '', 'EVs'), el('strong', '', 'IVs'), el('strong', '', 'Total'));
			pane.append(header);
			const evControls = {};
			const ivControls = {};
			const totalOutputs = {};
			const canEditEV = !isReadOnly() && (data.permissions.master || data.evs.training.eligible);
			const availableMaximum = id => {
				const usedByOthers = STATS.reduce((sum, [stat]) => sum + (stat === id ? 0 : Number(draftEVs[stat] || 0)), 0);
				return Math.max(0, Math.min(252, Math.floor((508 - usedByOthers) / 4) * 4));
			};
			for (const [id, label] of STATS) {
				const stat = data.stats.find(entry => entry.id === id);
				const row = el('div', 'team-builder-detailed-stat nature-' +
					(data.nature.plus === id ? 'raised' : data.nature.minus === id ? 'lowered' : 'neutral'));
				const base = el('div', 'team-builder-base-stat');
				base.append(el('strong', '', String(stat.base)), statBar(stat.base, 255, 'base'));
				const ev = el('div', 'team-builder-ev-control');
				const slider = input('range', draftEVs[id], !canEditEV);
				slider.className = 'team-builder-ev-slider';
				slider.min = 0;
				slider.max = 252;
				slider.step = 4;
				slider.value = String(draftEVs[id]);
				const number = input('number', draftEVs[id], !canEditEV);
				number.className = 'team-builder-ev-value';
				number.min = 0;
				number.max = 252;
				number.step = 4;
				ev.append(number, slider);
				evControls[id] = { slider, number };
				let iv;
				if (data.permissions.master && !isReadOnly()) {
					iv = input('number', draftIVs[id]);
					iv.min = 0;
					iv.max = 31;
					iv.addEventListener('input', () => {
						draftIVs[id] = Math.max(0, Math.min(31, Number(iv.value) || 0));
						sync();
					});
					ivControls[id] = iv;
				} else {
					iv = el('strong', 'team-builder-iv-readonly', String(draftIVs[id]));
				}
				const total = el('strong', 'team-builder-stat-total', String(calculatedStat(id)));
				totalOutputs[id] = total;
				row.append(el('strong', 'team-builder-stat-name', label), base, ev, iv, total);
				pane.append(row);
			}
			const summary = el('p', 'team-builder-training-summary');
			const submit = button(data.permissions.master ? 'Salvar atributos' : 'Confirmar treinamento', 'button primary');
			const sync = () => {
				const values = Object.values(draftEVs).map(Number);
				const total = values.reduce((sum, value) => sum + value, 0);
				totalLabel.textContent = 'EVs: ' + total + ' / 508';
				for (const [id] of STATS) {
					const maximum = availableMaximum(id);
					evControls[id].number.max = maximum;
					evControls[id].number.value = String(draftEVs[id]);
					evControls[id].slider.value = String(draftEVs[id]);
					evControls[id].slider.style.setProperty('--ev-fill', Number(draftEVs[id]) / 252 * 100 + '%');
					totalOutputs[id].textContent = String(calculatedStat(id));
				}
				const moved = STATS.reduce((sum, [id]) => sum + Math.max(0, draftEVs[id] - data.pokemon.evs[id]), 0);
				const balanced = STATS.reduce((sum, [id]) => sum + Math.abs(draftEVs[id] - data.pokemon.evs[id]), 0) === moved * 2;
				if (isReadOnly()) {
					summary.textContent = '';
				} else if (data.pokemon.metadata.evTraining) {
					summary.textContent = 'Treinamento em andamento · Restam ' +
						formatDuration(data.pokemon.metadata.evTraining.remainingMs || 0) + '.';
				} else if (data.permissions.master) {
					summary.textContent = 'O Mestre altera os valores diretamente.';
				} else if (total !== 508) {
					summary.textContent = 'Total atual: ' + total + ' / 508. Distribua todos os pontos.';
				} else if (!moved) {
					summary.textContent = '';
				} else {
					const steps = moved / data.evs.training.evStep;
					summary.textContent = moved + ' EVs redistribuídos · Custo: ' +
						formatMoney(steps * data.evs.training.costPerStep) + ' · Tempo no relógio da campanha: ' +
						formatDuration(steps * data.evs.training.roleplayDurationPerStepMs);
				}
				submit.disabled = data.permissions.master ? total !== 508 :
					total !== 508 || moved <= 0 || moved % 4 !== 0 || !balanced || !data.evs.training.eligible;
			};
			const setEV = (id, raw) => {
				const maximum = availableMaximum(id);
				draftEVs[id] = Math.max(0, Math.min(maximum, Math.round(Number(raw) / 4) * 4));
				sync();
			};
			for (const [id] of STATS) {
				evControls[id].slider.addEventListener('input', () => setEV(id, evControls[id].slider.value));
				evControls[id].number.addEventListener('input', () => setEV(id, evControls[id].number.value));
			}
			const trainingMeta = el('div', 'team-builder-training-meta');
			trainingMeta.append(
				el('p', 'team-builder-nature-readonly', 'Natureza: ' + data.nature.label),
				el('p', 'team-builder-training-money', 'Pokécoins: ' + formatMoney(data.money))
			);
			pane.append(trainingMeta, summary);
			if (isReadOnly()) {
				sync();
				return pane;
			} else if (data.permissions.master) {
				submit.addEventListener('click', saveGeneral);
				pane.append(submit);
			} else {
				submit.addEventListener('click', () => void run(() => deps.api(
					'/team-builder/' + encodeURIComponent(deps.pokemonId) + '/train-ev', {
						method: 'POST',
						body: { characterId: deps.characterId, evs: { ...draftEVs }, expectedRevision: data.boxRevision },
					}
				), 'Treinamento iniciado.'));
				pane.append(submit);
				const vitamins = el('div', 'team-builder-vitamins');
				for (const vitamin of data.ivs.vitamins) {
					const use = button('', 'team-builder-vitamin');
					use.append(itemIcon(vitamin), el('span', '', vitamin.name), el('b', '', '×' + vitamin.quantity));
					use.disabled = !vitamin.usable;
					use.addEventListener('click', () => void run(() => deps.api(
						'/team-builder/' + encodeURIComponent(deps.pokemonId) + '/use-vitamin', {
							method: 'POST',
							body: {
								characterId: deps.characterId, itemId: vitamin.id, actionId: actionId(),
								expectedBoxRevision: data.boxRevision, expectedBagRevision: data.bagRevision,
							},
						}
					), '+2 IV em ' + vitamin.stat + '.'));
					vitamins.append(use);
				}
				pane.append(vitamins);
			}
			sync();
			return pane;
		}
		function trainingPane() {
			const training = data.pokemon.metadata.evTraining;
			if (!training) return null;
			const duration = Math.max(1, Number(training.durationMs) || Number(training.remainingMs) || 1);
			const remaining = Math.max(0, Math.min(duration, Number(training.remainingMs) || 0));
			const elapsed = duration - remaining;
			const progress = Math.max(0, Math.min(100, elapsed / duration * 100));
			const panel = el('section', 'team-builder-active-training');
			const header = el('div', 'team-builder-active-training-header');
			const identity = el('div', 'team-builder-active-training-identity');
			identity.append(trainingIcon());
			const title = el('span');
			title.append(el('strong', '', 'Treinamento de EVs'), el('small', '', 'Pok\u00e9mon indispon\u00edvel at\u00e9 a conclus\u00e3o'));
			identity.append(title);
			header.append(identity, el('strong', 'team-builder-training-percent', Math.round(progress) + '%'));
			const progressTrack = el('div', 'team-builder-training-progress');
			const progressFill = el('span');
			progressFill.style.width = progress + '%';
			progressTrack.append(progressFill);
			const facts = el('div', 'team-builder-training-facts');
			for (const [label, value] of [
				['Tempo decorrido', formatDuration(elapsed)],
				['Tempo restante', formatDuration(remaining)],
				['Dura\u00e7\u00e3o total', formatDuration(duration)],
				['Custo', formatMoney(training.cost || 0)],
				['EVs redistribu\u00eddos', String(training.amount || 0)],
				['Blocos de 4 EVs', String(training.steps || Math.ceil((training.amount || 0) / 4))],
			]) {
				const fact = el('span');
				fact.append(el('small', '', label), el('strong', '', value));
				facts.append(fact);
			}
			const changes = el('div', 'team-builder-training-changes');
			for (const [id, label] of STATS) {
				const change = Number(training.changes?.[id] || 0);
				if (!change) continue;
				const entry = el('span', change > 0 ? 'raised' : 'lowered');
				entry.append(el('small', '', label), el('strong', '', (change > 0 ? '+' : '') + change + ' EV'));
				changes.append(entry);
			}
			panel.append(header, progressTrack, facts);
			if (changes.children.length) panel.append(changes);
			return panel;
		}

		function activeBrowser() {
			if (activePane === 'items') return itemPane();
			if (activePane === 'abilities') return abilityPane();
			if (activePane === 'moves') return movePane();
			if (activePane === 'stats') return statsPane();
			if (activePane === 'training') return trainingPane();
			return null;
		}
		function draw() {
			closeHealingPopover();
			root.classList.toggle('read-only', isReadOnly());
			root.replaceChildren();
			root.append(teamStrip(), selectedPokemonCard(), selectedMoves());
			if (message) root.append(el('div', 'team-builder-result', message));
			const browser = activeBrowser();
			if (browser) root.append(browser);
		}
		try {
			await load();
		} catch (error) {
			root.replaceChildren(el('div', 'panel empty-state', error.message));
		}
		return root;
	}

	window.RPGTeamBuilderUI = Object.freeze({ render });
})();
