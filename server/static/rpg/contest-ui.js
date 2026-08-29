'use strict';

window.RPGContestUI = (() => {
	let refreshTimer = null;
	const dismissedContestResults = new Set();
	let pokemonCatalog = null;
	let moveCatalog = null;
	let itemCatalog = null;
	let avatarCatalog = null;
	const contestAnimationCursors = new Map();
	let contestAnimationQueue = Promise.resolve();
	let contestAnimationActive = false;
	const labels = {beauty: 'Beleza', cute: 'Fofura', cool: 'Estilo', smart: 'Inteligência', tough: 'Força',
		normal: 'Normal', great: 'Great', super: 'Super', hyper: 'Hyper', master: 'Master'};
	const criteria = [
		['visualComposition', 'Composição visual'], ['sequenceContinuity', 'Continuidade'],
		['stageUse', 'Uso do palco'], ['trainerPokemonSync', 'Sincronia'],
		['interpretationFinale', 'Interpretação e final'],
	];
	const contestBackgrounds = [
		{id: 'classic-hall', name: 'Salão clássico'}, {id: 'sunset-harbor', name: 'Porto ao pôr do sol'},
		{id: 'neon-arena', name: 'Arena neon'}, {id: 'enchanted-clearing', name: 'Clareira encantada'},
		{id: 'festival-plaza', name: 'Praça de festival'}, {id: 'snowy-overlook', name: 'Mirante nevado'},
	];
	const contestBackgroundUrl = id => new URL(`./assets/contest-backgrounds/${id}.png`, document.baseURI).href;
	const contestCategoryHeaderUrl = id => new URL(`./assets/contest-category-headers/${id}.png?v=20260829-2`, document.baseURI).href;
	const contestStats = [['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Attack'], ['spd', 'Sp. Defense'], ['spe', 'Speed']];
	const contestNatures = ['Adamant', 'Bashful', 'Bold', 'Brave', 'Calm', 'Careful', 'Docile', 'Gentle', 'Hardy', 'Hasty',
		'Impish', 'Jolly', 'Lax', 'Lonely', 'Mild', 'Modest', 'Naive', 'Naughty', 'Quiet', 'Quirky', 'Rash', 'Relaxed',
		'Sassy', 'Serious', 'Timid'];
	const natureModifiers = {Adamant:['atk','spa'], Bold:['def','atk'], Brave:['atk','spe'], Calm:['spd','atk'], Careful:['spd','spa'],
		Gentle:['spd','def'], Hasty:['spe','def'], Impish:['def','spa'], Jolly:['spe','spa'], Lax:['def','spd'], Lonely:['atk','def'],
		Mild:['spa','def'], Modest:['spa','atk'], Naive:['spe','spd'], Naughty:['atk','spd'], Quiet:['spa','spe'], Rash:['spa','spd'],
		Relaxed:['def','spe'], Sassy:['spd','spe'], Timid:['spe','atk']};
	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const cssId = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	const contestMoveTraitLabels = Object.freeze({
		weather: 'Clima', terrain: 'Terrain', dance: 'Dança', sound: 'Som', healing: 'Cura',
		movement: 'Movimento', light: 'Luz', wind: 'Vento', flower: 'Flores', wave: 'Onda',
		explosion: 'Explosão', defense: 'Defesa', speed: 'Velocidade', playful: 'Expressivo',
		magic: 'Mágico', beam: 'Feixe', shadow: 'Sombra', mist: 'Névoa', smoke: 'Fumaça',
	});
	const contestBattleCategoryLabels = Object.freeze({physical: 'Físico', special: 'Especial', status: 'Status'});
	function contestMoveTraits(move) {
		const traits = [];
		const battleCategory = contestBattleCategoryLabels[cssId(move.battleCategory)];
		if (battleCategory) traits.push(battleCategory);
		for (const tag of move.tags || []) {
			const label = contestMoveTraitLabels[cssId(tag)];
			if (label && !traits.includes(label)) traits.push(label);
			if (traits.length >= 3) break;
		}
		return traits;
	}
	const actionButton = (text, handler, primary = false) => {
		const node = el('button', `button${primary ? ' primary' : ''}`, text);
		node.type = 'button'; node.addEventListener('click', handler); return node;
	};
	const confirmableAction = (label, handler) => {
		const control = el('div', 'contest-confirmable-action');
		control.setAttribute('aria-live', 'polite');
		const showInitial = () => control.replaceChildren(actionButton(label, showConfirmation));
		const showConfirmation = () => {
			const confirm = actionButton('Confirmar', () => {
				confirm.disabled = true; cancel.disabled = true;
				void Promise.resolve(handler()).catch(error => {
					console.error('RPG contest abandon action failed', error);
					showInitial();
				});
			}, true);
			confirm.classList.add('contest-abandon-confirm');
			const cancel = actionButton('Cancelar', showInitial);
			cancel.classList.add('contest-abandon-cancel');
			control.replaceChildren(confirm, cancel);
		};
		showInitial();
		return control;
	};
	const field = (label, control, help = '') => {
		const wrapper = el('label', 'field'); wrapper.append(el('span', '', label), control);
		if (help) wrapper.append(el('small', '', help)); return wrapper;
	};
	const select = (options, value) => {
		const node = el('select');
		for (const [optionValue, label] of options) {
			const option = el('option', '', label); option.value = optionValue; node.append(option);
		}
		node.value = value; return node;
	};
	const step = (number, title, description) => {
		const section = el('section', 'battle-editor-step');
		const heading = el('div', 'battle-step-heading'); heading.append(el('span', 'battle-step-number', String(number)));
		const text = el('div'); text.append(el('h3', '', title), el('p', '', description)); heading.append(text);
		const body = el('div', 'battle-step-body'); section.append(heading, body); return {section, body};
	};
	async function rerenderPreservingViewport(context) {
		const scrollLeft = window.scrollX;
		const scrollTop = window.scrollY;
		const active = document.activeElement;
		const focusId = active?.id || '';
		const focusName = active?.getAttribute?.('name') || '';
		await context.rerender();
		window.scrollTo(scrollLeft, scrollTop);
		const replacement = focusId ? document.getElementById(focusId) :
			(focusName ? document.querySelector(`[name="${CSS.escape(focusName)}"]`) : null);
		if (replacement instanceof HTMLElement) replacement.focus({preventScroll: true});
	}
	async function refresh(context) { await rerenderPreservingViewport(context); }
	function preContestFingerprint(sessions) {
		return JSON.stringify(sessions);
	}
	function schedulePreContestRefresh(context, page, sessions) {
		const fingerprint = preContestFingerprint(sessions);
		const check = async () => {
			if (!page.isConnected) return;
			try {
				const data = await context.api('/contest-sessions');
				const latestSessions = data.contestSessions || [];
				if (preContestFingerprint(latestSessions) !== fingerprint) {
					await rerenderPreservingViewport(context);
					return;
				}
			} catch {
				// Uma falha momentânea não deve interromper as próximas atualizações.
			}
			if (page.isConnected) refreshTimer = window.setTimeout(check, 1200);
		};
		refreshTimer = window.setTimeout(check, 1200);
	}
	function badges(session) {
		const row = el('div', 'contest-badges');
		for (const text of [labels[session.category], labels[session.rank], `${session.participants.length} participantes`]) {
			row.append(el('span', 'contest-badge', text));
		}
		return row;
	}
	async function runtime(context, session) {
		const data = await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/runtime`);
		initializeContestAnimationCursor(data.contest, true);
		return renderRuntime(context, session, data.contest);
	}
	function initializeContestAnimationCursor(contest, force = false) {
		if (!contest?.sessionId) return;
		if (!force && contestAnimationCursors.has(contest.sessionId)) return;
		contestAnimationCursors.set(contest.sessionId,
			(contest.events || []).reduce((maximum, event) => Math.max(maximum, event.sequence), -1));
	}
	function takePendingContestAnimations(contest) {
		if (!contest?.sessionId) return [];
		if (!contestAnimationCursors.has(contest.sessionId)) {
			initializeContestAnimationCursor(contest);
			return [];
		}
		const cursor = contestAnimationCursors.get(contest.sessionId);
		const pending = (contest.events || []).filter(event => event.sequence > cursor)
			.sort((left, right) => left.sequence - right.sequence);
		if (pending.length) contestAnimationCursors.set(contest.sessionId, pending[pending.length - 1].sequence);
		return pending;
	}
	function enterContestMode() {
		document.getElementById('dashboard-screen')?.classList.add('contest-mode');
	}
	function leaveContestMode() {
		if (refreshTimer) window.clearTimeout(refreshTimer);
		refreshTimer = null;
		window.RPGBattleAudio?.stop();
		document.getElementById('dashboard-screen')?.classList.remove('contest-mode');
	}
	function contestBackButton(context) {
		const back = actionButton('Voltar', () => {
			leaveContestMode();
			context.state.dashboardView = 'overview';
			void context.rerender();
		});
		back.classList.add('rpg-leave-room');
		return back;
	}
	function scheduleActiveContestRefresh(context, session, page, contest) {
		const fingerprint = JSON.stringify(contest);
		const check = async () => {
			if (!page.isConnected) return;
			if (contestAnimationActive) {
				refreshTimer = window.setTimeout(check, 250);
				return;
			}
			try {
				const data = await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/runtime`);
				if (JSON.stringify(data.contest) !== fingerprint) {
					void transitionRuntimePage(context, session, page, data.contest);
					return;
				}
			} catch {
				// Mantém o palco atual durante uma falha momentânea de atualização.
			}
			if (page.isConnected) refreshTimer = window.setTimeout(check, 1200);
		};
		refreshTimer = window.setTimeout(check, 1200);
	}
	function replaceRuntimePage(context, session, currentPage, contest) {
		if (refreshTimer) window.clearTimeout(refreshTimer);
		refreshTimer = null;
		const scrollLeft = window.scrollX; const scrollTop = window.scrollY;
		const nextPage = renderRuntime(context, session, contest);
		let mountedPage = nextPage;
		if (currentPage?.isConnected) {
			currentPage.className = nextPage.className;
			currentPage.replaceChildren(...nextPage.childNodes);
			mountedPage = currentPage;
		} else {
			document.getElementById('dashboard-body')?.replaceChildren(nextPage);
		}
		window.scrollTo(scrollLeft, scrollTop);
		if (!mountedPage.classList.contains('contest-final-page')) {
			scheduleActiveContestRefresh(context, session, mountedPage, contest);
		}
		return mountedPage;
	}
	async function playContestAnimationEvents(page, contest, events) {
		const stage = page?.querySelector?.('.contest-stage');
		if (!stage || !window.RPGContestAnimations) return;
		const pokemon = stage.querySelector('.contest-stage-pokemon');
		const trainer = stage.querySelector('.contest-stage-trainer');
		for (const event of events) {
			if (event.type === 'move-selected') {
				const participant = contest.participants.find(entry => entry.id === event.participantId);
				const move = participant?.pokemon.moves.find(entry => entry.moveId === event.moveId || entry.id === event.moveId);
				if (move) await window.RPGContestAnimations.playMove(stage, pokemon, trainer, move, event, {
					pokemonName: participant.pokemon.name, contestCategory: contest.category,
				});
			} else if (event.type === 'judging-complete') {
				await window.RPGContestAnimations.reaction(stage, event.audienceReaction);
			} else if (event.type === 'participant-disqualified') {
				await window.RPGContestAnimations.disqualify(stage);
			}
		}
	}
	function transitionRuntimePage(context, session, currentPage, contest) {
		const pending = takePendingContestAnimations(contest);
		if (!pending.length || !currentPage?.isConnected) return Promise.resolve(replaceRuntimePage(context, session, currentPage, contest));
		contestAnimationActive = true;
		currentPage.classList.add('contest-animating');
		contestAnimationQueue = contestAnimationQueue.catch(() => undefined).then(async () => {
			const beforeReplacement = pending.filter(event =>
				['move-selected', 'judging-complete', 'participant-disqualified'].includes(event.type));
			await playContestAnimationEvents(currentPage, contest, beforeReplacement);
			const entered = pending.some(event => event.type === 'participant-enter');
			if (entered) await window.RPGContestAnimations?.cleanupStage?.(currentPage.querySelector('.contest-stage'));
			const mountedPage = replaceRuntimePage(context, session, currentPage, contest);
			if (entered && !mountedPage.classList.contains('contest-final-page')) {
				mountedPage.classList.add('contest-animating');
				await window.RPGContestAnimations?.entrance?.(mountedPage.querySelector('.contest-stage'));
				mountedPage.classList.remove('contest-animating');
			}
		}).catch(error => {
			console.error('RPG contest animation queue failed', error);
			replaceRuntimePage(context, session, currentPage, contest);
		}).finally(() => {
			contestAnimationActive = false;
			currentPage?.classList.remove('contest-animating');
		});
		return contestAnimationQueue;
	}
	async function applyRuntimeResponse(context, session, request) {
		let data;
		try {
			data = await request;
		} catch (requestError) {
			try {
				data = await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/runtime`);
			} catch {
				throw requestError;
			}
			if (data.contest?.status !== 'ended') throw requestError;
		}
		const currentPage = document.querySelector('#dashboard-body > .contest-page, #dashboard-body > .contest-final-page');
		await transitionRuntimePage(context, session, currentPage, data.contest);
	}
	function renderRuntime(context, session, contest) {
		enterContestMode();
		if (contest.status === 'ended' && contest.results) {
			if (refreshTimer) window.clearTimeout(refreshTimer);
			refreshTimer = null;
			window.RPGBattleAudio?.stop();
			return resultsPanel(context, session, contest);
		}
		window.RPGBattleAudio?.playForContest?.();
		const wrap = el('div', 'contest-page');
		const stage = el('section', 'contest-stage');
		const stageControls = el('div', 'contest-stage-controls');
		if (window.RPGBattleAudio?.createVerticalVolumeControl) stageControls.append(window.RPGBattleAudio.createVerticalVolumeControl());
		if (window.RPGBattleAudio?.createEffectsToggleButton) stageControls.append(window.RPGBattleAudio.createEffectsToggleButton());
		stageControls.append(contestBackButton(context)); stage.append(stageControls);
		const backgroundId = contest.scenario?.backgroundId || session.scenario?.backgroundId;
		if (backgroundId) {
			stage.classList.add('has-background'); stage.style.backgroundImage = `url("${contestBackgroundUrl(backgroundId)}")`;
		}
		const current = contest.participants.find(item => item.id === contest.currentParticipantId);
		if (current) {
			const activeStageState = current.stageStates?.[contest.round - 1];
			const temporaryStage = activeStageState?.temporary;
			stage.dataset.hasTemporaryEffects = String(Boolean(temporaryStage?.weather || temporaryStage?.terrain || temporaryStage?.tags?.length));
			const stageHeading = el('div', `contest-stage-heading category-${contest.category}`);
			const categoryArt = el('img', 'contest-stage-category-art');
			categoryArt.src = contestCategoryHeaderUrl(contest.category);
			categoryArt.alt = labels[contest.category];
			const stageIdentity = el('div', 'contest-stage-identity');
			stageIdentity.append(
				el('span', '', current.displayName),
				el('span', '', current.pokemon.name),
				el('small', '', `Rodada ${contest.round}`),
			);
			stageHeading.append(categoryArt, stageIdentity);
			stage.append(stageHeading);
			const actors = el('div', 'contest-stage-actors');
			const trainer = el('img', 'contest-stage-trainer');
			trainer.src = RPGAssets.url(`sprites/trainers/${current.avatar || 'pokemonbreeder'}.png`);
			trainer.alt = `Treinador ${current.displayName}`;
			const pokemonHost = el('div', `contest-stage-pokemon size-${current.pokemon.sizeClass || 'medium'}`);
			pokemonHost.dataset.pokemonHeight = current.pokemon.heightM || 0;
			const animatedPokemon = typeof rpgRuntimeSprite === 'function' ? rpgRuntimeSprite({
				name: current.pokemon.name, species: current.pokemon.species, shiny: current.pokemon.shiny,
				spriteId: current.pokemon.spriteId,
			}) : spriteImage(current.pokemon.species);
			pokemonHost.append(animatedPokemon); actors.append(trainer, pokemonHost); stage.append(actors);
			window.RPGContestAnimations?.renderPersistentStage?.(stage, activeStageState, {
				cacheKey: `${contest.sessionId || session.id}:${current.id}:${contest.round}`,
			});
		}
		if (contest.canJudge) stage.append(judgePanel(context, session, contest.category));
		wrap.append(stage);
		const canViewCurrentMoves = Boolean(current && (context.master || current.characterId === context.character?.id));
		if (canViewCurrentMoves) {
			const content = el('section', 'panel contest-stage-content');
			let activateMega = false;
			const moves = el('div', 'contest-moves');
			const currentRoundMoves = current.rounds[contest.round - 1] || [];
			const firstRoundMoves = current.rounds[0] || [];
			if (current.pokemon.megaEligible && !current.pokemon.megaActivated) {
				const mega = actionButton(`Mega Evoluir para ${current.pokemon.megaSpecies}`, () => {
					activateMega = !activateMega;
					mega.classList.toggle('primary', activateMega);
				});
				mega.disabled = !contest.canAct; moves.append(mega);
			}
			for (const move of current.pokemon.moves) {
				const moveId = cssId(move.id);
				const positions = currentRoundMoves.reduce((result, usedMove, index) => {
					if (cssId(usedMove) === moveId) result.push(index + 1);
					return result;
				}, []);
				const usedInFirstRound = contest.round === 2 && firstRoundMoves.some(usedMove => cssId(usedMove) === moveId);
				const button = el('button', `contest-move rpg-move-button type-${cssId(move.type)}${usedInFirstRound ? ' used-first-round' : ''}`);
				button.type = 'button'; button.disabled = !contest.canAct;
				const heading = el('span', 'contest-move-heading');
				heading.append(el('strong', '', move.name), el('span', `rpg-type-badge type-${cssId(move.type)}`, move.type.toUpperCase()));
				const details = el('span', 'contest-move-details');
				const traits = el('span', 'contest-move-traits');
				for (const trait of contestMoveTraits(move)) traits.append(el('small', '', trait));
				details.append(traits);
				const affectsStage = move.changesField || (move.tags || []).some(tag => cssId(tag) === 'fieldchange');
				if (affectsStage) details.append(el('span', 'contest-move-field', '◇ Afeta o palco'));
				if (positions.length) {
					const order = el('span', 'contest-move-order');
					for (const position of positions) order.append(el('b', '', String(position)));
					details.append(order);
				}
				button.append(heading, details);
				button.addEventListener('click', async () => {
					await applyRuntimeResponse(context, session, context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`,
						{method: 'POST', body: {type: 'select-move', moveId: move.id, activateMega}}));
				});
				moves.append(button);
			}
			content.append(moves);
			wrap.append(content);
		}
		if (!context.master && current && current.characterId === context.character?.id) {
			const actions = el('div', 'contest-actions');
			actions.append(confirmableAction('Abandonar concurso', async () => {
				await applyRuntimeResponse(context, session, context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`,
					{method: 'POST', body: {type: 'abandon'}}));
			})); wrap.append(actions);
		}
		if (context.master && current?.kind === 'npc') {
			const actions = el('div', 'contest-actions');
			actions.append(confirmableAction('Abandonar com este NPC', async () => {
				await applyRuntimeResponse(context, session, context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`,
					{method: 'POST', body: {type: 'abandon'}}));
			})); wrap.append(actions);
		}
		return wrap;
	}
	function judgePanel(context, session, category) {
		const form = el('form', `contest-stage-judge category-${category}`);
		form.append(el('h3', '', 'Avaliação do mestre'));
		const grid = el('div', 'contest-judge-grid');
		for (const [id, label] of criteria) {
			const field = el('label', ''); field.append(el('span', '', label));
			const input = el('input'); input.name = id; input.type = 'number'; input.min = '-1'; input.max = '5'; input.value = '3';
			field.append(input); grid.append(field);
		}
		form.append(grid);
		const submit = el('button', 'button contest-stage-judge-submit', 'Confirmar notas'); submit.type = 'submit'; form.append(submit);
		form.addEventListener('submit', async event => {
			event.preventDefault(); const data = new FormData(form); const values = {};
			for (const [id] of criteria) values[id] = Number(data.get(id));
			await applyRuntimeResponse(context, session, context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`,
				{method: 'POST', body: {type: 'submit-judging', criteria: values}}));
		});
		return form;
	}
	function resultsPanel(context, session, contest) {
		const page = el('div', 'contest-final-page');
		const resultById = new Map(contest.results.map(result => [result.participantId, result]));
		const ordered = [...contest.participants].sort((left, right) => {
			const leftPlace = resultById.get(left.id)?.place ?? 999; const rightPlace = resultById.get(right.id)?.place ?? 999;
			return leftPlace - rightPlace;
		});
		const finalists = ordered.filter(participant => {
			const result = resultById.get(participant.id);
			return !result?.disqualified && Number(result?.place) >= 1 && Number(result?.place) <= 3;
		});
		const moveName = (participant, moveId) => participant.pokemon.moves.find(move => move.id === moveId)?.name || moveId;
		const ceremony = el('section', `contest-stage contest-final-ceremony category-${contest.category}`);
		const backgroundId = contest.scenario?.backgroundId || session.scenario?.backgroundId;
		if (backgroundId) {
			ceremony.classList.add('has-background'); ceremony.style.backgroundImage = `url("${contestBackgroundUrl(backgroundId)}")`;
		}
		const ceremonyHeading = el('div', `contest-stage-heading contest-final-ceremony-heading category-${contest.category}`);
		const categoryArt = el('img', 'contest-stage-category-art'); categoryArt.src = contestCategoryHeaderUrl(contest.category);
		categoryArt.alt = labels[contest.category];
		const ceremonyIdentity = el('div', 'contest-stage-identity'); ceremonyIdentity.append(el('span', '', 'Cerimônia final'), el('small', '', 'Pódio do concurso'));
		ceremonyHeading.append(categoryArt, ceremonyIdentity); ceremony.append(ceremonyHeading);
		for (const participant of finalists) {
			const result = resultById.get(participant.id); const place = Number(result.place);
			const entry = el('article', `contest-final-podium-entry place-${place}`);
			const pokemonBehind = Number(participant.pokemon.heightM) >= 1.5;
			const pokemonOnViewerRight = place === 2;
			const pokemonHost = el('div', `contest-final-podium-pokemon ${pokemonBehind ? 'behind' : 'front'}${pokemonOnViewerRight ? ' look-right' : ''} size-${participant.pokemon.sizeClass || 'medium'}`);
			const animatedPokemon = typeof rpgRuntimeSprite === 'function' ? rpgRuntimeSprite({
				name: participant.pokemon.name, species: participant.pokemon.species, shiny: participant.pokemon.shiny,
				spriteId: participant.pokemon.spriteId,
			}) : spriteImage(participant.pokemon.species);
			pokemonHost.append(animatedPokemon);
			const trainer = el('img', 'contest-final-podium-trainer');
			trainer.src = RPGAssets.url(`sprites/trainers/${participant.avatar || 'pokemonbreeder'}.png`);
			trainer.alt = `Treinador ${participant.displayName}`;
			const label = el('button', 'contest-final-podium-label'); label.type = 'button';
			label.append(el('strong', '', place === 1 ? 'Campeão' : `${place}º lugar`), el('span', '', participant.displayName),
				el('small', '', participant.pokemon.name), el('small', 'contest-final-podium-score', `Nota final: ${result.total}`));
			const details = el('div', 'contest-final-podium-details');
			for (let round = 0; round < 2; round++) {
				const block = el('div', 'contest-final-podium-round'); block.append(el('strong', '', `${round + 1}ª rodada`));
				const moves = el('div', 'contest-final-move-sequence');
				for (const move of participant.rounds[round]) moves.append(el('span', '', moveName(participant, move)));
				block.append(moves);
				const reaction = participant.audienceReactions[round];
				if (reaction) block.append(el('p', 'contest-final-reaction', `${reaction.emoji} ${reaction.label}`));
				details.append(block);
			}
			label.addEventListener('click', () => {
				const opening = !entry.classList.contains('details-open');
				for (const other of ceremony.querySelectorAll('.contest-final-podium-entry.details-open')) other.classList.remove('details-open');
				entry.classList.toggle('details-open', opening);
			});
			entry.append(pokemonHost, trainer, label, details); ceremony.append(entry);
		}
		page.append(ceremony);
		const remaining = ordered.filter(participant => {
			const result = resultById.get(participant.id);
			return result?.disqualified || Number(result?.place) >= 4;
		});
		if (remaining.length) {
			const podium = el('section', 'panel contest-final-participants'); podium.append(el('h3', '', 'Demais participantes'));
			const cards = el('div', 'contest-final-participant-grid');
		for (const participant of remaining) {
			const result = resultById.get(participant.id); const card = el('article', 'contest-final-participant');
			const identity = el('div', 'contest-final-identity');
			if (participant.avatar) {
				const trainer = el('img', 'contest-final-trainer'); trainer.src = RPGAssets.url(`sprites/trainers/${participant.avatar}.png`); trainer.alt = participant.displayName; identity.append(trainer);
			}
			const pokemon = spriteImage(participant.pokemon.species); pokemon.classList.add('contest-final-pokemon'); identity.append(pokemon);
			const heading = el('div'); heading.append(el('strong', '', result?.disqualified ? 'Desclassificado' : `${result?.place || '—'}º lugar`),
				el('h4', '', participant.displayName), el('small', '', participant.pokemon.name));
			if (result && !result.disqualified) heading.append(el('span', 'contest-final-score', `Nota final: ${result.total}`));
			card.append(identity, heading);
			const details = el('details', 'contest-final-rounds'); details.append(el('summary', '', 'Ver apresentações'));
			for (let round = 0; round < 2; round++) {
				const block = el('div', 'contest-final-round'); block.append(el('strong', '', `${round + 1}ª rodada`));
				const moves = el('div', 'contest-final-move-sequence');
				for (const move of participant.rounds[round]) moves.append(el('span', '', moveName(participant, move)));
				block.append(moves);
				const reaction = participant.audienceReactions[round];
				if (reaction) block.append(el('p', 'contest-final-reaction', `${reaction.emoji} ${reaction.label}`));
				details.append(block);
			}
			card.append(details); cards.append(card);
		}
			podium.append(cards); page.append(podium);
		}
		const highlightLabels = {visualComposition: 'Composição visual', sequenceContinuity: 'Continuidade', stageUse: 'Uso do palco pelos jurados',
			trainerPokemonSync: 'Sincronia', interpretationFinale: 'Interpretação e encerramento'};
		const highlights = el('section', 'panel contest-final-highlights'); highlights.append(el('h3', '', 'Destaques do concurso'));
		const highlightGrid = el('div', 'contest-highlight-grid');
		const participantNames = ids => ids.map(id => contest.participants.find(participant => participant.id === id)?.displayName || id).join(' e ');
		for (const [criterion, label] of Object.entries(highlightLabels)) highlightGrid.append(el('div', '', `${label}: ${participantNames(contest.highlights?.judgeCategories?.[criterion] || [])}`));
		for (const [label, ids] of [['Reação do público', contest.highlights?.audience], ['Uso do cenário', contest.highlights?.scenario],
			['Melhor combo', contest.highlights?.combo], ['Evolução entre rodadas', contest.highlights?.evolution]]) {
			highlightGrid.append(el('div', '', `${label}: ${participantNames(ids || [])}`));
		}
		highlights.append(highlightGrid); page.append(highlights);
		if (context.master) {
			const review = el('details', 'panel contest-master-review'); review.append(el('summary', '', 'Revisar detalhes do mestre'));
			for (const participant of ordered) {
				const row = el('div', 'contest-master-result-row'); row.append(el('strong', '', participant.displayName));
				const result = resultById.get(participant.id);
				if (result && 'total' in result) row.append(el('span', '', `Total: ${result.total} · Performance: +${result.performanceGain}`));
				review.append(row);
				for (let round = 0; round < 2; round++) {
					const judging = participant.judging?.[round]; const mechanical = participant.roundScores?.[round];
					if (!judging) continue;
					const detail = el('p', 'contest-master-round-detail');
					const criterionNotes = criteria.map(([id, label]) => `${label}: ${judging.criteria[id]}`).join(' · ');
					detail.textContent = `${round + 1}ª rodada — ${criterionNotes}`;
					if (mechanical) detail.textContent += ` · Mecânica: ${mechanical.total} · Final: ${judging.totalAfterJudging}`;
					review.append(detail);
				}
			}
			page.append(review);
		}
		const actions = el('div', 'contest-final-actions');
		if (window.RPGBattleAudio?.createEffectsToggleButton) actions.append(window.RPGBattleAudio.createEffectsToggleButton());
		actions.append(actionButton(context.master ? 'Encerrar e sair' : 'Encerrar', () => {
			dismissedContestResults.add(session.id); leaveContestMode(); void context.rerender();
		}, true));
		if (context.master) {
			const future = actionButton('Salvar como registro da campanha (futuramente)', () => {}, false); future.disabled = true; actions.append(future);
		}
		page.append(actions); return page;
	}
	const temporaryNPCProfiles = {
		contest: {scope: 'contest', finishLabel: 'Adicionar NPC ao concurso', includeExperience: false, statePopovers: true, showPortraitName: false},
		battle: {scope: 'battle', finishLabel: 'Adicionar NPC ao combate', includeExperience: false, statePopovers: true, showPortraitName: false},
	};
	function buildTemporaryNPCEditor(context, initialParticipants, profile) {
		const root = el('div', 'contest-temporary-npcs');
		root.dataset.temporaryNpcBuild = profile.scope;
		const heading = el('div', 'contest-temporary-heading');
		heading.append(el('div', '', 'NPCs temporários'));
		const headingActions = el('div', 'contest-temporary-heading-actions');
		const create = actionButton('＋ Criar NPC temporário', () => void openCreator(), true); headingActions.append(create);
		const creator = el('section', 'panel team-builder-showdown-card contest-npc-creator hidden'); const cards = el('div', 'contest-temporary-list');
		const participants = (initialParticipants || []).filter(item => item.kind === 'npc').map(item => structuredClone(item));
		async function loadTemporaryCatalogs() {
			if (pokemonCatalog && moveCatalog && itemCatalog && avatarCatalog) return;
			const [pokemonData, moveData, itemData, avatarData] = await Promise.all([
				context.api('/battle-pokemon'), context.api('/contest-moves'), context.api('/bag/master/catalog'),
				fetch('./avatars.json', {cache: 'no-cache'}).then(response => {
					if (!response.ok) throw new Error('Catálogo de sprites de treinador indisponível.');
					return response.json();
				}),
			]);
			pokemonCatalog = pokemonData.pokemon || []; moveCatalog = moveData.moves || []; itemCatalog = itemData.items || [];
			avatarCatalog = avatarData.avatars || [];
		}
		if (profile.scope === 'contest') {
			const randomButton = actionButton('✦ Criar NPC aleatório', () => void generateRandomNPC());
			randomButton.classList.add('contest-random-npc-button');
			headingActions.append(randomButton);
		}
		heading.append(headingActions); root.append(heading);
		function renderCards() {
			cards.replaceChildren();
			for (const participant of participants) {
				const card = el('article', 'contest-temporary-card'); const set = participant.pokemon.set;
				if (profile.scope === 'contest' && participant.avatar) {
					const trainer = el('img', 'contest-temporary-trainer-sprite');
					trainer.src = RPGAssets.url(`sprites/trainers/${participant.avatar}.png`);
					trainer.alt = `Treinador ${participant.displayName}`; trainer.loading = 'lazy'; card.append(trainer);
				}
				card.append(pokemonSprite(set)); const info = el('div');
				info.append(el('strong', '', participant.displayName), el('small', '', `${set.name || set.species} · Nv. ${set.level}`), el('small', '', set.moves.join(' · ')));
				if (profile.scope === 'contest' && participant.randomRank) {
					info.append(el('small', 'contest-random-npc-rank', `NPC aleatório · ${labels[participant.randomRank]}`));
				}
				card.append(info, actionButton('Remover', () => { participants.splice(participants.indexOf(participant), 1); renderCards(); })); cards.append(card);
			}
		}
		async function openCreator() {
			create.disabled = true;
			try {
				await loadTemporaryCatalogs();
				renderCreator(); creator.classList.remove('hidden'); create.classList.add('hidden');
			} finally { create.disabled = false; }
		}
		async function generateRandomNPC() {
			const ranks = {
				normal: {level: 20, quality: 0}, great: {level: 35, quality: 1}, super: {level: 50, quality: 2},
				hyper: {level: 70, quality: 3}, master: {level: 90, quality: 4},
			};
			const rankId = profile.contestRank?.() || 'normal';
			const rank = ranks[rankId]; if (!rank) return;
			const randomButton = headingActions.querySelector('.contest-random-npc-button');
			if (randomButton) randomButton.disabled = true;
			try {
				await loadTemporaryCatalogs();
				const eligiblePokemon = pokemonCatalog.filter(entry => !entry.legendary);
				let pokemon = null; let legalMoves = [];
				for (let attempt = 0; attempt < 12 && legalMoves.length < 4; attempt++) {
					pokemon = eligiblePokemon[Math.floor(Math.random() * eligiblePokemon.length)];
					const query = new URLSearchParams({species: pokemon.name, level: String(rank.level)});
					const data = await context.api('/contest-pokemon-moves?' + query); legalMoves = data.moves || [];
				}
				if (!pokemon || legalMoves.length < 4) throw new Error('Não foi possível montar um NPC aleatório.');
				const category = profile.contestCategory?.() || 'beauty';
				const scoredMoves = legalMoves.map(move => ({move, quality:
					move.baseScore + (move.category === category ? 3 : 0) + Math.min(2, move.tags?.length / 4 || 0) - (move.penalties?.length || 0) * 3,
				})).sort((left, right) => left.quality - right.quality);
				const windowStart = Math.round((scoredMoves.length - 4) * rank.quality / 4);
				const movePool = scoredMoves.slice(Math.max(0, windowStart - 3), Math.min(scoredMoves.length, windowStart + 7));
				const selected = [];
				while (selected.length < 4 && movePool.length) {
					const weightedIndex = rank.quality >= 3 ? movePool.length - 1 : Math.floor(Math.random() * movePool.length);
					selected.push(movePool.splice(weightedIndex, 1)[0].move);
				}
				const usefulItems = itemCatalog.filter(entry => entry.contest?.canScore && entry.contest.category === category && entry.contest.scoringMode === 'passive');
				const desiredPoints = rank.quality >= 4 ? 3 : rank.quality >= 2 ? 2 : 1;
				const itemChoices = usefulItems.filter(entry => entry.contest.points === desiredPoints);
				const heldItem = itemChoices[Math.floor(Math.random() * itemChoices.length)] || null;
				const avatar = avatarCatalog[Math.floor(Math.random() * avatarCatalog.length)] || {id: 'lucas-contest', name: 'Lucas'};
				const allowedGenders = pokemon.genders || ['M', 'F'];
				const gender = allowedGenders[Math.floor(Math.random() * allowedGenders.length)] || '';
				const hpBase = pokemon.baseStats?.hp || 50;
				const maximumHP = pokemon.id === 'shedinja' ? 1 : Math.floor((2 * hpBase + 31) * rank.level / 100) + rank.level + 10;
				const index = participants.length + 1; const id = `npc-random-${index}-${avatar.id}`;
				participants.push({id, kind: 'npc', displayName: avatar.name, avatar: avatar.id, randomRank: rankId, pokemon: {set: {
					name: pokemon.name, species: pokemon.name, level: rank.level, moves: selected.map(move => move.moveId),
					ability: pokemon.abilities?.[0] || '', item: heldItem?.id || '', nature: contestNatures[Math.floor(Math.random() * contestNatures.length)],
					gender, shiny: false, evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
					ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, rpg: {hp: maximumHP,
						pp: selected.map(move => move.pp), status: '', friendship: 100, contestPerformance: rank.quality * 5,
						contestPerformanceTrainerId: id},
				}}});
				renderCards();
			} catch (error) {
				window.alert(error.message);
			} finally {
				if (randomButton) randomButton.disabled = false;
			}
		}
		function renderCreator() {
			creator.replaceChildren(); const title = el('div', 'contest-npc-coordinator-bar');
			title.append(el('h4', '', 'Criar NPC temporário'), actionButton('Cancelar', closeCreator)); creator.append(title);
			const npcName = el('input'); npcName.placeholder = 'Nome do coordenador'; npcName.maxLength = 60;
			let selectedAvatar = avatarCatalog[0] || {id: 'lucas', name: 'Lucas'};
			const avatarPicker = el('div', 'contest-npc-avatar-picker');
			let avatarOutsideHandler = null;
			const avatarButton = actionButton('', event => {
				event.stopPropagation();
				const opening = avatarDropdown.classList.contains('hidden');
				avatarDropdown.classList.toggle('hidden', !opening);
				if (opening) {
					renderAvatarChoices(); avatarSearch.focus();
					avatarOutsideHandler = outsideEvent => {
						if (!avatarPicker.contains(outsideEvent.target)) closeAvatarPicker();
					};
					setTimeout(() => document.addEventListener('pointerdown', avatarOutsideHandler), 0);
				} else {
					closeAvatarPicker();
				}
			});
			avatarButton.className = 'contest-npc-avatar-button';
			avatarButton.setAttribute('aria-label', 'Escolher sprite do treinador');
			const trainerSprite = avatar => {
				const image = el('img');
				image.src = RPGAssets.url(`sprites/trainers/${avatar.id}.png`);
				image.alt = avatar.name; image.loading = 'lazy'; return image;
			};
			function syncAvatarButton() {
				avatarButton.replaceChildren(trainerSprite(selectedAvatar));
				avatarButton.title = selectedAvatar.name;
			}
			const avatarSearch = el('input', 'contest-npc-avatar-search');
			avatarSearch.type = 'search'; avatarSearch.placeholder = 'Buscar treinador...';
			const avatarResults = el('div', 'contest-npc-avatar-results');
			const avatarDropdown = el('section', 'panel contest-npc-avatar-dropdown hidden');
			avatarDropdown.append(avatarSearch, avatarResults); avatarPicker.append(avatarButton, avatarDropdown);
			const normalizeAvatarText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
			function closeAvatarPicker() {
				avatarDropdown.classList.add('hidden');
				if (avatarOutsideHandler) document.removeEventListener('pointerdown', avatarOutsideHandler);
				avatarOutsideHandler = null;
			}
			function renderAvatarChoices() {
				const query = normalizeAvatarText(avatarSearch.value); avatarResults.replaceChildren();
				const matches = avatarCatalog.filter(avatar => !query || normalizeAvatarText(avatar.name).includes(query) || avatar.id.includes(query));
				for (const avatar of matches) {
					const option = actionButton('', () => {
						selectedAvatar = avatar; npcName.value = avatar.name; syncAvatarButton(); closeAvatarPicker();
					});
					option.className = `contest-npc-avatar-option${avatar.id === selectedAvatar.id ? ' selected' : ''}`;
					option.append(trainerSprite(avatar), el('span', '', avatar.name)); avatarResults.append(option);
				}
				if (!matches.length) avatarResults.append(el('p', 'empty-state', 'Nenhum treinador encontrado.'));
			}
			avatarSearch.addEventListener('input', renderAvatarChoices);
			syncAvatarButton();
			title.insertBefore(avatarPicker, title.lastChild);
			title.insertBefore(field('Nome do NPC', npcName), title.lastChild);
			let selectedPokemon = null;
			let pokemonMoveCatalog = [];
			let moveCatalogRequest = 0;
			const speciesSearch = el('input', 'contest-pokemon-search'); speciesSearch.type = 'search';
			speciesSearch.placeholder = 'Buscar'; speciesSearch.autocomplete = 'off';
			const level = el('input'); level.type = 'number'; level.min = '1'; level.max = '100'; level.value = '50';
			const gender = select([['', 'Aleatório'], ['M', 'Masculino'], ['F', 'Feminino'], ['N', 'Sem gênero']], '');
			const nature = select(contestNatures.map(value => [value, value]), 'Serious');
			const friendship = el('input'); friendship.type = 'number'; friendship.min = '0'; friendship.max = '255'; friendship.value = '100';
			const performance = el('input'); performance.type = 'number'; performance.min = '0'; performance.max = '100'; performance.value = '0';
			const experience = el('input'); experience.type = 'number'; experience.min = '0'; experience.value = '0';
			const hp = el('input'); hp.type = 'number'; hp.min = '0'; hp.value = '1';
			const status = select([['', 'Nenhum'], ['brn', 'Queimado'], ['par', 'Paralisado'], ['psn', 'Envenenado'], ['tox', 'Gravemente envenenado'], ['slp', 'Dormindo'], ['frz', 'Congelado']], '');
			const item = el('input'); item.type = 'hidden';
			const itemSearch = el('input', 'contest-item-search'); itemSearch.type = 'search';
			itemSearch.placeholder = 'Sem item'; itemSearch.autocomplete = 'off';
			const ability = select([['', 'Selecione o Pokémon']], '');
			const shiny = el('input'); shiny.type = 'checkbox'; shiny.className = 'hidden';
			const toolbar = el('div', 'team-builder-showdown-toolbar contest-pokemon-toolbar');
			const pokemonSearchBox = el('div', 'team-builder-nickname-box contest-pokemon-search-box');
			pokemonSearchBox.append(el('span', '', 'Pokémon'), speciesSearch);
			const detailGrid = el('div', 'team-builder-detail-grid');
			const toolbarCell = (label, control) => { const cell = el('div', 'team-builder-detail-cell'); cell.append(el('small', '', label), control); return cell; };
			const shinyText = el('strong', 'contest-shiny-toggle', 'Não'); shinyText.tabIndex = 0; shinyText.setAttribute('role', 'button');
			shinyText.addEventListener('click', () => { shiny.checked = !shiny.checked; shiny.dispatchEvent(new Event('change')); });
			shiny.addEventListener('change', () => { shinyText.textContent = shiny.checked ? 'Sim' : 'Não'; });
			detailGrid.append(toolbarCell('Shiny', shinyText), toolbarCell('Gênero', gender), toolbarCell('Level', level));
			if (profile.includeExperience) detailGrid.append(toolbarCell('XP', experience));
			toolbar.append(pokemonSearchBox, detailGrid);
			if (profile.scope === 'contest') toolbar.append(el('div', 'contest-moves-toolbar-title', 'Moves'));
			creator.append(toolbar);
			const details = el('div', 'team-builder-details contest-npc-details');
			const typeStatus = el('div', 'team-builder-type-status-row'); const types = el('div', 'team-builder-current-types');
			if (profile.statePopovers) {
				status.className = 'hidden';
				const statusTrigger = el('span', 'box-condition status-normal team-builder-healing-trigger team-builder-master-state-trigger', 'Normal');
				statusTrigger.tabIndex = 0; statusTrigger.setAttribute('role', 'button'); statusTrigger.setAttribute('aria-label', 'Alterar status');
				let statusPopover = null; let statusOutsideHandler = null;
				const statusChoices = [
					['', 'OK', 'Normal'], ['brn', 'BRN', 'Burn'], ['par', 'PAR', 'Paralysis'],
					['psn', 'PSN', 'Poison'], ['tox', 'TOX', 'Badly Poisoned'],
					['slp', 'SLP', 'Sleep'], ['frz', 'FRZ', 'Freeze'],
				];
				function syncStatusTrigger() {
					const selected = statusChoices.find(([value]) => value === status.value) || statusChoices[0];
					statusTrigger.className = `box-condition status-${status.value || 'normal'} team-builder-healing-trigger team-builder-master-state-trigger`;
					statusTrigger.textContent = status.value ? selected[1] : selected[2];
				}
				function closeStatusPopover() {
					if (statusOutsideHandler) document.removeEventListener('pointerdown', statusOutsideHandler);
					statusOutsideHandler = null; statusPopover?.remove(); statusPopover = null;
				}
				function makeStatusChoice([value, symbol, title]) {
					const choice = actionButton('', () => {
						status.value = value; syncStatusTrigger(); closeStatusPopover();
					});
					choice.className = 'team-builder-healing-choice team-builder-master-status-choice' + (status.value === value ? ' selected' : '');
					choice.setAttribute('aria-label', title);
					choice.append(el('span', `box-condition status-${value || 'normal'}`, symbol));
					return choice;
				}
				function openStatusPopover() {
					closeStatusPopover();
					const panel = el('div', 'team-builder-healing-popover team-builder-master-state-popover team-builder-master-status-popover');
					const header = el('div', 'team-builder-master-status-header');
					header.append(el('strong', 'team-builder-popover-title', 'Status'), makeStatusChoice(statusChoices[0]));
					const grid = el('div', 'team-builder-master-status-grid');
					for (const choice of statusChoices.slice(1)) grid.append(makeStatusChoice(choice));
					panel.append(header, grid); document.body.append(panel); statusPopover = panel;
					const rect = statusTrigger.getBoundingClientRect(); const width = Math.min(132, window.innerWidth - 20);
					panel.style.width = width + 'px';
					panel.style.left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left)) + 'px';
					panel.style.top = Math.min(window.innerHeight - panel.offsetHeight - 10, rect.bottom + 5) + 'px';
					statusOutsideHandler = event => {
						if (panel.contains(event.target) || statusTrigger.contains(event.target)) return;
						closeStatusPopover();
					};
					setTimeout(() => document.addEventListener('pointerdown', statusOutsideHandler), 0);
				}
				statusTrigger.addEventListener('click', event => { event.stopPropagation(); openStatusPopover(); });
				statusTrigger.addEventListener('keydown', event => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault(); openStatusPopover();
				});
				syncStatusTrigger(); typeStatus.append(types, statusTrigger, status);
			} else {
				status.className = 'box-condition status-normal contest-status-select'; typeStatus.append(types, status);
				status.addEventListener('change', () => { status.className = `box-condition status-${status.value || 'normal'} contest-status-select`; });
			}
			const hpPanel = el('div', 'team-builder-main-hp'); const hpTop = el('div');
			const hpValue = el('span'); const hpTrack = el('div', 'team-builder-stat-track hp'); const hpFill = el('span', 'team-builder-stat-fill'); hpTrack.append(hpFill);
			const hpControls = el('div', 'contest-npc-hp-controls');
			const hpDown = actionButton('−', () => { hp.value = String(Math.max(0, Number(hp.value) - 1)); syncHP(); });
			const hpUp = actionButton('+', () => { hp.value = String(Math.min(currentMaxHP(), Number(hp.value) + 1)); syncHP(); });
			hpControls.append(hpDown, hp, hpUp); hpTop.append(el('strong', '', 'HP'), hpValue); hpPanel.append(hpTop, hpTrack);
			if (!profile.statePopovers) {
				hpPanel.append(hpControls);
			} else {
				hp.classList.add('hidden'); hpPanel.append(hp);
				hpPanel.classList.add('team-builder-healing-trigger', 'team-builder-master-state-trigger');
				hpPanel.tabIndex = 0; hpPanel.setAttribute('role', 'button'); hpPanel.setAttribute('aria-label', 'Definir HP');
				let hpPopover = null; let hpOutsideHandler = null;
				function closeHPPopover() {
					if (hpOutsideHandler) document.removeEventListener('pointerdown', hpOutsideHandler);
					hpOutsideHandler = null; hpPopover?.remove(); hpPopover = null;
				}
				function hpTone(value, maximum) {
					if (value <= 0) return 'fainted';
					const ratio = maximum ? value / maximum : 0;
					return ratio <= .2 ? 'critical' : ratio <= .5 ? 'warning' : 'healthy';
				}
				function openHPPopover() {
					closeHPPopover();
					const panel = el('div', 'team-builder-healing-popover team-builder-master-state-popover team-builder-master-hp-popover');
					panel.append(el('strong', 'team-builder-popover-title', 'Definir HP'));
					const controls = el('div', 'team-builder-master-hp-controls');
					const maximum = currentMaxHP();
					const slider = el('input', 'team-builder-master-hp-slider'); slider.type = 'range';
					const number = el('input', 'team-builder-master-hp-number'); number.type = 'number';
					for (const control of [slider, number]) {
						control.min = '0'; control.max = String(maximum); control.step = '1'; control.value = hp.value;
					}
					function syncPopoverHP(rawValue) {
						const value = Math.max(0, Math.min(maximum, Math.round(Number(rawValue) || 0)));
						slider.value = String(value); number.value = String(value);
						slider.classList.remove('healthy', 'warning', 'critical', 'fainted');
						slider.classList.add(hpTone(value, maximum));
						slider.style.setProperty('--hp-fill', (maximum ? value / maximum * 100 : 0) + '%');
					}
					slider.addEventListener('input', () => syncPopoverHP(slider.value));
					number.addEventListener('input', () => syncPopoverHP(number.value));
					syncPopoverHP(hp.value); controls.append(slider, number);
					const apply = actionButton('Aplicar', () => {
						hp.value = String(Math.max(0, Math.min(maximum, Number(number.value) || 0)));
						syncHP(); closeHPPopover();
					});
					apply.className = 'team-builder-healing-choice team-builder-master-apply';
					panel.append(controls, apply); document.body.append(panel); hpPopover = panel;
					const rect = hpPanel.getBoundingClientRect(); const width = Math.min(rect.width + 90, window.innerWidth - 20);
					panel.style.width = width + 'px';
					panel.style.left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left)) + 'px';
					panel.style.top = Math.min(window.innerHeight - panel.offsetHeight - 10, rect.bottom + 5) + 'px';
					hpOutsideHandler = event => {
						if (panel.contains(event.target) || hpPanel.contains(event.target)) return;
						closeHPPopover();
					};
					setTimeout(() => document.addEventListener('pointerdown', hpOutsideHandler), 0);
				}
				hpPanel.addEventListener('click', event => { event.stopPropagation(); openHPPopover(); });
				hpPanel.addEventListener('keydown', event => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault(); openHPPopover();
				});
			}
			function currentMaxHP() {
				if (!selectedPokemon) return 1;
				if (selectedPokemon.id === 'shedinja') return 1;
				return Math.floor((2 * selectedPokemon.baseStats.hp + Number(ivs.hp) + Math.floor(Number(evs.hp) / 4)) * Number(level.value) / 100) + Number(level.value) + 10;
			}
			function syncHP(reset = false) {
				const maximum = currentMaxHP(); if (reset) hp.value = String(maximum);
				hp.max = String(maximum); hp.value = String(Math.max(0, Math.min(maximum, Number(hp.value) || 0)));
				const ratio = maximum ? Number(hp.value) / maximum : 0;
				hpTrack.classList.remove('healthy', 'warning', 'critical', 'fainted');
				hpTrack.classList.add(Number(hp.value) <= 0 ? 'fainted' : ratio <= .2 ? 'critical' : ratio <= .5 ? 'warning' : 'healthy');
				hpValue.textContent = `${hp.value} / ${maximum}`; hpFill.style.width = `${maximum ? Number(hp.value) / maximum * 100 : 0}%`;
			}
			hp.addEventListener('input', () => syncHP());
			const itemProperty = el('div', 'team-builder-main-property team-builder-main-item');
			const selectedItemIcon = el('span', 'contest-selected-item-icon');
			itemProperty.append(el('span', 'contest-npc-property-label', 'Item'), selectedItemIcon, itemSearch, item);
			const itemContestProperty = el('div', 'team-builder-main-property contest-item-build-summary');
			const itemContestCategory = el('strong', '', 'Sem categoria');
			const itemContestPoints = el('small', '', '0 pontos');
			itemContestProperty.append(el('span', 'contest-npc-property-label', 'Categoria e pontuação'),
				itemContestCategory, itemContestPoints);
			const categoryOrder = ['beauty', 'cute', 'cool', 'smart', 'tough'];
			const heldItems = itemCatalog
				.filter(entry => entry.category === 'held' || entry.tags?.includes('held'))
				.filter(entry => profile.scope === 'contest' || !entry.tags?.includes('contestonly'))
				.filter(entry => profile.scope !== 'contest' || entry.contest?.canScore)
				.sort((left, right) => profile.scope === 'contest' ?
					(left.contest.scoringMode === 'tera-matching-moves' ? 5 : categoryOrder.indexOf(left.contest.category)) -
					(right.contest.scoringMode === 'tera-matching-moves' ? 5 : categoryOrder.indexOf(right.contest.category)) ||
					left.contest.points - right.contest.points || left.name.localeCompare(right.name, 'pt-BR') :
					left.name.localeCompare(right.name, 'pt-BR'));
			const itemOptions = el('section', 'panel contest-item-dropdown hidden');
			const itemResults = el('div', 'contest-item-results'); itemOptions.append(itemResults); itemProperty.append(itemOptions);
			let itemOutsideHandler = null;
			function closeItemPicker() {
				itemOptions.classList.add('hidden');
				if (itemOutsideHandler) document.removeEventListener('pointerdown', itemOutsideHandler);
				itemOutsideHandler = null;
			}
			function selectItem(entry) {
				item.value = entry?.name || ''; itemSearch.value = entry?.name || '';
				const contestItem = entry?.contest;
				itemContestCategory.textContent = contestItem?.scoringMode === 'tera-matching-moves' ?
					`Teralização ${contestItem.teraType}` : contestItem?.canScore ? labels[contestItem.category] : 'Sem categoria';
				itemContestPoints.textContent = contestItem?.canScore ?
					`${contestItem.points} ${contestItem.points === 1 ? 'ponto' : 'pontos'}` +
					(contestItem.scoringMode === 'mega-activation' ? ' ao Mega Evoluir' :
						contestItem.scoringMode === 'tera-matching-moves' ? ` com 2 moves ${contestItem.teraType}` : '') : '0 pontos';
				selectedItemIcon.replaceChildren();
				const selectedIcon = entry && typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(entry) : null;
				if (selectedIcon) { selectedIcon.classList.add('contest-selected-item-glyph'); selectedItemIcon.append(selectedIcon); }
				itemSearch.placeholder = entry ? '' : 'Sem item'; closeItemPicker();
			}
			function renderItemResults() {
				const query = itemSearch.value.trim().toLowerCase(); itemResults.replaceChildren();
				const none = actionButton('', () => selectItem(null)); none.className = 'contest-item-option';
				const noneIcon = el('span', 'contest-item-option-icon empty');
				const noneText = el('span', 'contest-item-option-text');
				noneText.append(el('strong', '', 'Sem item'), el('small', '', 'O Pokémon não carregará nenhum item.'));
				none.append(noneIcon, noneText); itemResults.append(none);
				let visibleCategory = null;
				for (const entry of heldItems.filter(entry => !query || entry.name.toLowerCase().includes(query) || entry.id.includes(query))) {
					const group = entry.contest.scoringMode === 'tera-matching-moves' ? 'terastalization' : entry.contest.category;
					if (profile.scope === 'contest' && group !== visibleCategory) {
						visibleCategory = group;
						itemResults.append(el('div', 'contest-item-category-heading', group === 'terastalization' ? 'Teralização' : labels[group]));
					}
					const option = actionButton('', () => selectItem(entry)); option.className = 'contest-item-option';
					const text = el('span', 'contest-item-option-text');
					text.append(el('strong', '', entry.name));
					if (profile.scope === 'contest') {
						const contestItem = entry.contest;
						const scoring = contestItem.scoringMode === 'tera-matching-moves' ?
							`Teralização ${contestItem.teraType} · +5 pontos ao usar pelo menos 2 moves ${contestItem.teraType}` :
							`${labels[contestItem.category]} · ${contestItem.points} ${contestItem.points === 1 ? 'ponto' : 'pontos'}` +
							(contestItem.scoringMode === 'mega-activation' ? ' ao Mega Evoluir' : ' por estar equipado');
						text.append(el('small', 'contest-item-score', scoring));
					} else {
						text.append(el('small', '', entry.description || entry.effect?.description || 'Descrição indisponível.'));
					}
					const icon = typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(entry) : null;
					const iconHost = el('span', 'contest-item-option-icon');
					if (icon) { icon.classList.add('contest-item-option-glyph'); iconHost.append(icon); }
					else iconHost.textContent = '◆';
					option.append(iconHost, text);
					itemResults.append(option);
				}
			}
			function openItemPicker() {
				itemOptions.classList.remove('hidden'); renderItemResults(); itemSearch.focus();
				if (!itemOutsideHandler) {
					itemOutsideHandler = event => { if (!itemProperty.contains(event.target)) closeItemPicker(); };
					setTimeout(() => document.addEventListener('pointerdown', itemOutsideHandler), 0);
				}
			}
			itemSearch.addEventListener('focus', openItemPicker);
			itemSearch.addEventListener('input', () => {
				item.value = ''; itemContestCategory.textContent = 'Sem categoria'; itemContestPoints.textContent = '0 pontos';
				renderItemResults();
			});
			const abilityProperty = el('div', 'team-builder-main-property team-builder-main-ability'); abilityProperty.append(el('span', 'contest-npc-property-label', 'Habilidade'), ability);
			const properties = el('div', 'team-builder-property-grid');
			properties.append(itemProperty, profile.scope === 'contest' ? itemContestProperty : abilityProperty);
			details.append(typeStatus, hpPanel, properties);
			const evs = Object.fromEntries(contestStats.map(([id]) => [id, 0]));
			const ivs = Object.fromEntries(contestStats.map(([id]) => [id, 31]));
			const statsPanel = el('div', 'team-builder-summary-stats contest-npc-stats');
			function calculatedStat(id) {
				if (!selectedPokemon) return 0;
				const base = selectedPokemon.baseStats[id]; const iv = Number(ivs[id]); const ev = Number(evs[id]); const lvl = Number(level.value);
				if (id === 'hp') return selectedPokemon.id === 'shedinja' ? 1 : Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100) + lvl + 10;
				const neutral = Math.floor((2 * base + iv + Math.floor(ev / 4)) * lvl / 100) + 5;
				const modifier = natureModifiers[nature.value]; return Math.floor(neutral * (modifier?.[0] === id ? 1.1 : modifier?.[1] === id ? .9 : 1));
			}
			function renderStats() {
				statsPanel.replaceChildren(); const header = el('div', 'team-builder-summary-title');
				header.append(el('strong', '', 'Atributos'), el('small', '', 'EV'), el('small', '', 'IV'), el('small', '', 'Total')); statsPanel.append(header);
				for (const [id, label] of contestStats) {
					const row = el('div', 'team-builder-summary-stat'); const track = el('span', 'team-builder-summary-track nature-neutral');
					const fill = el('span'); const total = calculatedStat(id); fill.style.width = `${Math.min(100, total / 330 * 100)}%`; track.append(fill);
					row.append(el('span', '', label), track, el('small', '', String(evs[id])), el('small', '', String(ivs[id])), el('strong', '', String(total))); statsPanel.append(row);
				}
				const footer = el('div', 'team-builder-summary-nature'); footer.append(el('span', '', `Natureza: ${nature.value}`), actionButton('Editar atributos', openStatsEditor)); statsPanel.append(footer);
			}

			const speciesGrid = el('div', 'contest-species-grid');
			const portrait = el('div', 'team-builder-portrait contest-npc-portrait');
			function renderPortrait() {
				portrait.replaceChildren();
				if (!selectedPokemon) return portrait.append(el('div', 'contest-pokemon-placeholder', 'Selecione um Pokémon'));
				const sprite = spriteImage(selectedPokemon.name); sprite.classList.add('team-builder-large-sprite');
				portrait.append(sprite);
				if (profile.showPortraitName) portrait.append(el('strong', '', selectedPokemon.name));
				types.replaceChildren();
				for (const type of selectedPokemon.types || []) types.append(el('span', `team-builder-type type-${type.toLowerCase()}`, type));
				const allowedGenders = selectedPokemon.genders || ['M', 'F'];
				const genderOptions = allowedGenders.length > 1 ? [['', 'Aleatório']] : [];
				for (const value of allowedGenders) genderOptions.push([value,
					value === 'M' ? 'Masculino' : value === 'F' ? 'Feminino' : 'Sem gênero']);
				gender.replaceChildren(...genderOptions.map(([value, label]) => {
					const option = el('option', '', label); option.value = value; return option;
				}));
				gender.value = allowedGenders.length === 1 ? allowedGenders[0] : '';
				ability.replaceChildren(...(selectedPokemon.abilities || []).map(name => { const option = el('option', '', name); option.value = name; return option; }));
				ability.value = selectedPokemon.abilities?.[0] || ''; syncDetailedStats(); syncHP(true);
			}
			function renderSpecies() {
				const query = speciesSearch.value.trim().toLowerCase(); speciesGrid.replaceChildren();
				const available = pokemonCatalog.filter(entry => !entry.legendary &&
					(!query || entry.name.toLowerCase().includes(query) || entry.id.includes(query)));
				for (const pokemon of available) {
					const option = actionButton('', async () => {
						selectedPokemon = pokemon; speciesSearch.value = pokemon.name;
						selectedMoves.splice(0); pokemonMoveCatalog = []; renderPortrait(); renderMoves(); closeSpeciesPicker();
						await loadPokemonMoves();
					});
					option.className = `contest-species-option${selectedPokemon?.id === pokemon.id ? ' selected' : ''}`;
					option.append(pokemonSprite({species: pokemon.name}), el('span', '', pokemon.name)); speciesGrid.append(option);
				}
				if (!available.length) speciesGrid.append(el('p', 'empty-state contest-species-empty', 'Nenhum Pokémon encontrado.'));
			}
			const speciesModal = el('section', 'panel contest-species-dropdown hidden');
			speciesModal.append(speciesGrid); pokemonSearchBox.append(speciesModal);
			let speciesOutsideHandler = null;
			function openSpeciesPicker() {
				speciesModal.classList.remove('hidden'); renderSpecies(); speciesSearch.focus();
				if (!speciesOutsideHandler) {
					speciesOutsideHandler = event => {
						if (!pokemonSearchBox.contains(event.target)) closeSpeciesPicker();
					};
					setTimeout(() => document.addEventListener('pointerdown', speciesOutsideHandler), 0);
				}
			}
			function closeSpeciesPicker() {
				speciesModal.classList.add('hidden');
				if (speciesOutsideHandler) document.removeEventListener('pointerdown', speciesOutsideHandler);
				speciesOutsideHandler = null;
			}
			speciesSearch.addEventListener('focus', () => { if (speciesModal.classList.contains('hidden')) openSpeciesPicker(); });
			speciesSearch.addEventListener('input', () => {
				if (selectedPokemon && speciesSearch.value.trim().toLowerCase() !== selectedPokemon.name.toLowerCase()) {
					selectedPokemon = null; pokemonMoveCatalog = []; selectedMoves.splice(0); renderPortrait(); renderMoves();
				}
				renderSpecies();
			});
			renderPortrait();
			const selectedMoves = [];
			const moveSearch = el('input', 'contest-catalog-search'); moveSearch.type = 'search'; moveSearch.placeholder = 'Filtrar golpes...';
			const moveResults = el('div', 'contest-move-results');
			const moveChips = el('div', 'team-builder-four-moves contest-selected-moves');
			const contestMovePanel = el('section', 'team-builder-summary-stats contest-side-moves');
			const contestMovePicker = el('section', 'panel contest-move-dropdown hidden');
			contestMovePicker.append(moveSearch, moveResults);
			contestMovePanel.append(moveChips, contestMovePicker);
			const builderBody = el('div', 'team-builder-showdown-body contest-npc-showdown-body');
			builderBody.append(portrait, details, profile.scope === 'contest' ? contestMovePanel : statsPanel); creator.append(builderBody);

			const statsEditor = el('section', 'panel team-builder-browser team-builder-stats-browser hidden');
			function openStatsEditor() { statsEditor.classList.toggle('hidden'); }
			const statsHeading = el('div', 'team-builder-section-heading'); statsHeading.append(el('h2', '', 'Atributos'), actionButton('Fechar', openStatsEditor));
			statsEditor.append(statsHeading);
			const statsHeader = el('div', 'team-builder-stats-header'); statsHeader.append(el('span'), el('strong', '', 'Base'), el('strong', '', 'EVs'), el('strong', '', 'IVs'), el('strong', '', 'Total')); statsEditor.append(statsHeader);
			const totalEV = el('small');
			function syncDetailedStats() {
				let sum = 0;
				for (const [id] of contestStats) {
					const evInput = statsEditor.querySelector(`[data-ev="${id}"]`); const ivInput = statsEditor.querySelector(`[data-iv="${id}"]`); const output = statsEditor.querySelector(`[data-total="${id}"]`); const baseOutput = statsEditor.querySelector(`[data-base="${id}"]`);
					if (!evInput) continue; evs[id] = Math.max(0, Math.min(252, Math.round(Number(evInput.value) / 4) * 4)); ivs[id] = Math.max(0, Math.min(31, Math.round(Number(ivInput.value) || 0)));
					evInput.value = String(evs[id]); ivInput.value = String(ivs[id]); baseOutput.textContent = String(selectedPokemon?.baseStats?.[id] ?? '—'); output.textContent = String(calculatedStat(id)); sum += evs[id];
				}
				totalEV.textContent = `EVs: ${sum} / 508`; renderStats(); syncHP();
			}
			for (const [id, label] of contestStats) {
				const row = el('div', 'team-builder-detailed-stat nature-neutral'); const base = el('strong', '', '—'); base.dataset.base = id; row.append(el('strong', 'team-builder-stat-name', label), base);
				const ev = el('input'); ev.type = 'number'; ev.min = '0'; ev.max = '252'; ev.step = '4'; ev.value = String(evs[id]); ev.dataset.ev = id;
				const iv = el('input'); iv.type = 'number'; iv.min = '0'; iv.max = '31'; iv.value = String(ivs[id]); iv.dataset.iv = id;
				const total = el('strong', 'team-builder-stat-total', '0'); total.dataset.total = id; row.append(ev, iv, total); statsEditor.append(row);
				ev.addEventListener('change', syncDetailedStats); iv.addEventListener('change', syncDetailedStats);
			}
			const statsMeta = el('div', 'contest-npc-stats-meta'); statsMeta.append(field('Natureza', nature), totalEV, field('Amizade', friendship), field('Performance', performance)); statsEditor.append(statsMeta);
			nature.addEventListener('change', syncDetailedStats);
			level.addEventListener('change', () => { syncDetailedStats(); syncHP(true); void loadPokemonMoves(); });
			if (profile.scope !== 'contest') creator.append(statsEditor);
			renderStats(); syncDetailedStats();

			async function loadPokemonMoves() {
				if (profile.scope !== 'contest' || !selectedPokemon) return;
				const request = ++moveCatalogRequest;
				const query = new URLSearchParams({species: selectedPokemon.name, level: level.value});
				const data = await context.api('/contest-pokemon-moves?' + query);
				if (request !== moveCatalogRequest || !selectedPokemon) return;
				pokemonMoveCatalog = data.moves || [];
				const allowed = new Set(pokemonMoveCatalog.map(move => move.moveId));
				for (let index = selectedMoves.length - 1; index >= 0; index--) {
					if (!allowed.has(selectedMoves[index].moveId)) selectedMoves.splice(index, 1);
				}
				renderMoves();
			}
			function simpleContestMoveRow(move, handler) {
				const row = actionButton('', handler); row.className = 'team-builder-simple-move';
				const category = el('i', `rpg-category-icon category-${move.battleCategory.toLowerCase()}`);
				category.setAttribute('aria-label', move.battleCategory);
				row.append(el('strong', '', move.name), el('span', `team-builder-type type-${move.type.toLowerCase()}`, move.type),
					category, el('span', '', move.basePower === null ? '—' : String(move.basePower)),
					el('span', '', move.accuracy === null ? '—' : `${move.accuracy}%`), el('span', '', String(move.pp)),
					el('small', '', move.description || 'Sem efeito adicional.'));
				return row;
			}
			let moveOutsideHandler = null;
			function closeMovePicker() {
				contestMovePicker.classList.add('hidden');
				if (moveOutsideHandler) document.removeEventListener('pointerdown', moveOutsideHandler);
				moveOutsideHandler = null;
			}
			function openMovePicker() {
				if (profile.scope !== 'contest') return moveSearch.focus();
				contestMovePicker.classList.remove('hidden'); renderMoves(); moveSearch.focus();
				if (!moveOutsideHandler) {
					moveOutsideHandler = event => {
						if (!contestMovePanel.contains(event.target)) closeMovePicker();
					};
					setTimeout(() => document.addEventListener('pointerdown', moveOutsideHandler), 0);
				}
			}
			function renderMoves() {
				moveChips.replaceChildren();
				for (let slot = 0; slot < 4; slot++) {
					const move = selectedMoves[slot];
					if (!move) {
						const empty = actionButton('Espaço de golpe', openMovePicker);
						empty.className = 'team-builder-move-card empty'; moveChips.append(empty);
						continue;
					}
					const wrapper = el('div', 'team-builder-move-slot');
					const card = actionButton('', () => { selectedMoves.splice(slot, 1); renderMoves(); });
					card.className = `team-builder-move-card rpg-move-button type-${String(move.type).toLowerCase()}`;
					const top = el('div', 'team-builder-move-top'); top.append(el('strong', '', move.name), el('span', 'team-builder-type', move.type));
					const body = el('div', 'rpg-move-button-body'); const summary = el('div', 'rpg-move-button-summary');
					summary.append(el('strong', '', `Power ${move.basePower ?? '—'}`), el('strong', '', `Accuracy ${move.accuracy === null ? '—' : move.accuracy + '%'}`), el('small', '', move.battleCategory));
					body.append(summary, el('small', '', move.description || `${labels[move.category]} · ${move.baseScore} pontos`)); card.append(top, body);
					const pp = el('div', 'team-builder-master-pp-control'); const down = actionButton('▼', () => { move.currentPP = Math.max(0, (move.currentPP ?? move.pp) - 1); renderMoves(); });
					const up = actionButton('▲', () => { move.currentPP = Math.min(move.pp, (move.currentPP ?? move.pp) + 1); renderMoves(); });
					pp.append(up, el('span', 'team-builder-master-pp-value', `PP ${move.currentPP ?? move.pp}/${move.pp}`), down); wrapper.append(card, pp); moveChips.append(wrapper);
				}
				const query = moveSearch.value.trim().toLowerCase(); moveResults.replaceChildren();
				const availableMoves = profile.scope === 'contest' ? pokemonMoveCatalog : moveCatalog;
				const moveTypeOrder = {
					Normal: 0, Grass: 1, Fire: 2, Water: 3, Electric: 4, Bug: 5,
					Flying: 6, Poison: 7, Rock: 8, Ground: 9, Ice: 10, Fighting: 11,
					Psychic: 12, Ghost: 13, Dragon: 14, Dark: 15, Steel: 16, Fairy: 17,
				};
				const battleCategoryOrder = {Physical: 0, Special: 1, Status: 2};
				const filteredMoves = availableMoves.filter(entry => !selectedMoves.some(selected => selected.moveId === entry.moveId) &&
					(!query || entry.name.toLowerCase().includes(query) || entry.moveId.includes(query)))
					.sort((first, second) =>
						(moveTypeOrder[first.type] ?? 18) - (moveTypeOrder[second.type] ?? 18) ||
						(battleCategoryOrder[first.battleCategory] ?? 3) - (battleCategoryOrder[second.battleCategory] ?? 3) ||
						first.name.localeCompare(second.name, 'en', {sensitivity: 'base'})
					);
				for (const move of filteredMoves) {
					const choose = () => {
						if (selectedMoves.length < 4) selectedMoves.push({...move, currentPP: move.pp});
						renderMoves(); if (profile.scope === 'contest') closeMovePicker();
					};
					if (profile.scope === 'contest') moveResults.append(simpleContestMoveRow(move, choose));
					else {
						const option = actionButton(move.name, choose); option.className = 'contest-move-option';
						option.append(el('small', '', `${labels[move.category]} · ${move.baseScore} pts`)); moveResults.append(option);
					}
				}
				if (profile.scope === 'contest' && !filteredMoves.length) {
					moveResults.append(el('p', 'empty-state', selectedPokemon ? 'Nenhum move encontrado.' : 'Selecione um Pokémon primeiro.'));
				}
			}
			moveSearch.addEventListener('input', renderMoves); renderMoves();
			const moveSection = el('section', 'team-builder-selected-moves contest-catalog-section');
			const moveHeading = el('div', 'team-builder-section-heading'); moveHeading.append(el('h2', '', 'Golpes'));
			if (profile.scope !== 'contest') {
				moveSection.append(moveHeading, moveChips, moveSearch, moveResults); creator.append(moveSection);
			}
			const error = el('p', 'form-error hidden'); const finish = actionButton(profile.finishLabel, () => {
				try {
					if (!npcName.value.trim()) throw new Error('Informe o nome do NPC.');
					if (!selectedPokemon) throw new Error('Selecione um Pokémon.');
					if (!selectedMoves.length) throw new Error('Selecione pelo menos um golpe.');
					if (![level, friendship, performance, hp].every(input => input.checkValidity())) throw new Error('Revise os valores numéricos do NPC.');
					if (profile.scope !== 'contest' && Object.values(evs).reduce((sum, value) => sum + value, 0) !== 508) {
						throw new Error('Os EVs devem totalizar 508.');
					}
					const index = participants.length + 1; const id = `npc-${index}-${npcName.value}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
					const rpgState = {hp: Number(hp.value), pp: selectedMoves.map(move => move.currentPP ?? move.pp), status: status.value, friendship: Number(friendship.value),
						contestPerformance: Number(performance.value), contestPerformanceTrainerId: id};
					if (profile.includeExperience) rpgState.experience = Number(experience.value);
					participants.push({id, kind: 'npc', displayName: npcName.value.trim(), avatar: selectedAvatar.id, pokemon: {set: {
						name: selectedPokemon.name, species: selectedPokemon.name, level: Number(level.value),
						moves: selectedMoves.map(move => move.moveId), ability: ability.value, item: item.value.trim(), nature: nature.value,
						gender: gender.value, shiny: shiny.checked, evs: {...evs}, ivs: {...ivs}, rpg: rpgState,
					}}}); renderCards(); closeCreator();
				} catch (caught) { error.textContent = caught.message; error.classList.remove('hidden'); }
			}, true);
			creator.append(error, finish);
		}
		function closeCreator() { creator.classList.add('hidden'); creator.replaceChildren(); create.classList.remove('hidden'); }
		renderCards(); root.append(creator, cards); return {root, participants: () => structuredClone(participants)};
	}
	function contestTemporaryNPCEditor(context, initialParticipants, contestCategory, contestRank) {
		return buildTemporaryNPCEditor(context, initialParticipants, {...temporaryNPCProfiles.contest, contestCategory, contestRank});
	}
	function battleTemporaryNPCEditor(context, initialParticipants) {
		return buildTemporaryNPCEditor(context, initialParticipants, temporaryNPCProfiles.battle);
	}
	function contestEditor(context, existing, onClose) {
		const form = el('form', 'panel battle-editor contest-editor');
		const header = el('div', 'battle-editor-title');
		const heading = el('div'); heading.append(el('p', 'eyebrow', existing ? 'Editar preparação' : 'Novo concurso'));
		heading.append(el('h2', '', existing?.name || 'Preparar concurso')); header.append(heading, actionButton('Fechar', onClose));
		form.append(header);

		const basic = step(1, 'Concurso e formato', 'Defina a identidade, categoria e nível do concurso.');
		const name = el('input'); name.maxLength = 80; name.value = existing?.name || ''; name.placeholder = 'Nome do concurso';
		const mode = select([['solo', 'Solo']], 'solo'); mode.disabled = true;
		const category = select([['beauty', 'Beleza'], ['cute', 'Fofura'], ['cool', 'Estilo'], ['smart', 'Inteligência'], ['tough', 'Força']], existing?.category || 'beauty');
		const rank = select([['normal', 'Normal'], ['great', 'Great'], ['super', 'Super'], ['hyper', 'Hyper'], ['master', 'Master']], existing?.rank || 'normal');
		const basicGrid = el('div', 'contest-basic-grid'); basicGrid.append(field('Nome', name), field('Formato', mode), field('Categoria', category), field('Rank', rank));
		basic.body.append(basicGrid); form.append(basic.section);

		const participantsStep = step(2, 'Participantes', 'O Mestre escolhe os participantes; cada treinador escolhe qual Pokémon levar.');
		const participantColumns = el('div', 'contest-participant-columns');
		const players = el('div', 'participant-column contest-player-list'); players.append(el('strong', '', 'Equipe A'));
		const playerInputs = new Map();
		for (const character of context.characters) {
			const checked = !!existing?.participants.some(item => item.kind === 'player' && item.characterId === character.id);
			const choice = rpgPlayerParticipantChoice(character, 'A', checked, false, () => {});
			playerInputs.set(character.id, choice.input); players.append(choice.wrapper);
		}
		if (!context.characters.length) players.append(el('small', '', 'Nenhum Player criado.'));
		const registeredNPCs = el('div', 'participant-column contest-registered-npcs');
		registeredNPCs.append(el('strong', '', 'NPCs'), el('div', 'contest-reserved-npcs', 'Espaço reservado para os NPCs cadastrados da campanha.'));
		participantColumns.append(players, registeredNPCs);
		const temporaryNPCs = contestTemporaryNPCEditor(context, existing?.participants || [], () => category.value, () => rank.value);
		participantsStep.body.append(participantColumns, temporaryNPCs.root); form.append(participantsStep.section);

		const conditions = step(3, 'Condições iniciais', 'Defina o clima e o terreno permanentes do palco.');
		const backgroundPicker = el('div', 'contest-background-picker');
		const backgroundInput = el('input'); backgroundInput.type = 'hidden'; backgroundInput.value = existing?.scenario?.backgroundId || 'classic-hall';
		const backgroundToggle = actionButton('', () => {
			const opening = backgroundOptions.classList.contains('hidden'); backgroundOptions.classList.toggle('hidden', !opening);
			if (opening) renderBackgroundOptions();
		});
		backgroundToggle.className = 'contest-background-toggle';
		const backgroundOptions = el('div', 'panel contest-background-options hidden');
		function backgroundImage(entry) {
			const image = el('img'); image.src = contestBackgroundUrl(entry.id); image.alt = ''; image.loading = 'lazy'; return image;
		}
		function renderBackgroundToggle() {
			const selected = contestBackgrounds.find(entry => entry.id === backgroundInput.value) || contestBackgrounds[0];
			backgroundInput.value = selected.id; backgroundToggle.replaceChildren(backgroundImage(selected), el('strong', '', selected.name), el('span', '', '▾'));
		}
		function renderBackgroundOptions() {
			backgroundOptions.replaceChildren();
			for (const entry of contestBackgrounds) {
				const option = actionButton('', () => {
					backgroundInput.value = entry.id; backgroundOptions.classList.add('hidden'); renderBackgroundToggle();
				});
				option.className = `contest-background-option${entry.id === backgroundInput.value ? ' selected' : ''}`;
				option.append(backgroundImage(entry), el('strong', '', entry.name)); backgroundOptions.append(option);
			}
		}
		backgroundPicker.append(backgroundInput, backgroundToggle, backgroundOptions); renderBackgroundToggle();
		const weather = select([['', 'Nenhum'], ['sun', 'Sol'], ['rain', 'Chuva'], ['sand', 'Tempestade de areia'], ['snow', 'Neve']], existing?.scenario?.weather || '');
		const terrain = select([['', 'Nenhum'], ['electric', 'Elétrico'], ['grassy', 'Grama'], ['psychic', 'Psíquico'], ['misty', 'Névoa']], existing?.scenario?.terrain || '');
		const conditionGrid = el('div', 'contest-condition-grid');
		conditionGrid.append(field('Cenário', backgroundPicker), field('Clima inicial', weather), field('Terreno inicial', terrain));
		conditions.body.append(conditionGrid); form.append(conditions.section);

		const error = el('p', 'form-error hidden'); const actions = el('div', 'battle-editor-actions');
		const save = actionButton('Salvar rascunho', () => {}); save.type = 'submit'; save.dataset.invite = 'false';
		const invite = actionButton('Salvar e enviar convites', () => {}, true); invite.type = 'submit'; invite.dataset.invite = 'true';
		actions.append(actionButton('Cancelar', onClose), save, invite); form.append(error, actions);
		form.addEventListener('submit', async event => {
			event.preventDefault(); error.classList.add('hidden');
			for (const button of actions.querySelectorAll('button')) button.disabled = true;
			try {
				const participants = [];
				for (const [characterId, input] of playerInputs) {
					if (!input.checked) continue; const character = context.characters.find(item => item.id === characterId);
					participants.push({id: `${characterId}-contest`, kind: 'player', characterId, displayName: character.characterName, avatar: character.avatar});
				}
				participants.push(...temporaryNPCs.participants());
				const request = {name: name.value.trim(), mode: 'solo', category: category.value, rank: rank.value, participants,
					scenario: {id: existing?.scenario?.id || 'classic-stage', name: name.value.trim() || 'Palco do concurso', tags: [],
						backgroundId: backgroundInput.value, weather: weather.value, terrain: terrain.value}};
				let sessionId = existing?.id;
				if (!sessionId) {
					const created = await context.api('/contest-sessions', {method: 'POST', body: {name: request.name}}); sessionId = created.contestSession.id;
				}
				await context.api(`/contest-sessions/${encodeURIComponent(sessionId)}`, {method: 'PATCH', body: request});
				if (event.submitter.dataset.invite === 'true') await context.api(`/contest-sessions/${encodeURIComponent(sessionId)}/invite`, {method: 'POST'});
				await refresh(context);
			} catch (submitError) {
				error.textContent = submitError.message; error.classList.remove('hidden'); error.scrollIntoView({behavior: 'smooth', block: 'center'});
			} finally { for (const button of actions.querySelectorAll('button')) button.disabled = false; }
		});
		return form;
	}
	function playerPokemonSelection(context, session, participant) {
		const panel = el('div', 'player-battle-selection contest-pokemon-selection');
		panel.append(el('strong', '', 'Escolha o Pokémon para o concurso'));
		const grid = el('div', 'pokemon-choice-grid'); let selected = participant.pokemon?.teamIndex;
		for (const [index, pokemon] of (context.character.team || []).entries()) {
			const metadata = context.character.box?.party?.[index]?.metadata || {};
			const fainted = (pokemon.rpg?.hp ?? 1) <= 0; const unavailable = fainted || !!metadata.evTraining || !!metadata.breeding;
			const label = el('label', `battle-check pokemon-choice${unavailable ? ' unavailable' : ''}`); const input = el('input');
			input.type = 'radio'; input.name = `contest-${session.id}`; input.disabled = unavailable; input.checked = selected === index;
			input.addEventListener('change', () => { selected = index; }); label.append(input, pokemonSprite(pokemon));
			const info = el('span'); info.append(el('strong', '', pokemon.name || pokemon.species), el('small', '', `${pokemon.species} · Nv. ${pokemon.level || 1}`));
			if (fainted) info.append(el('small', 'form-error', 'Desmaiado'));
			else if (metadata.evTraining) info.append(el('small', '', 'Em treinamento'));
			else if (metadata.breeding) info.append(el('small', '', 'Em procriação'));
			label.append(info); grid.append(label);
		}
		panel.getPokemonSelection = () => {
			if (!Number.isSafeInteger(selected)) throw new Error('Escolha um Pokémon para o concurso.');
			return selected;
		};
		panel.append(grid); return panel;
	}
	function playerContestCard(context, session) {
		const card = el('article', 'panel battle-session-card contest-invitation-card');
		const header = el('div', 'battle-session-head');
		const title = el('div');
		title.append(el('strong', '', session.name || 'Concurso sem nome'),
			el('small', '', `${labels[session.category] || session.category} · ${labels[session.rank] || session.rank} · Solo`));
		const statusLabels = {draft: 'Rascunho', inviting: 'Aguardando respostas', ready: 'Pronto', declined: 'Recusado'};
		header.append(title, el('span', `battle-status status-${session.status}`, statusLabels[session.status] || session.status));
		card.append(header);

		const summary = el('div', 'battle-teams contest-invitation-summary');
		const contestInfo = el('div', 'battle-team');
		contestInfo.append(el('strong', '', 'Concurso'), el('small', '', `Categoria: ${labels[session.category] || session.category}`),
			el('small', '', `Nível: ${labels[session.rank] || session.rank}`));
		const participants = el('div', 'battle-team'); participants.append(el('strong', '', 'Participantes'));
		for (const participant of session.participants) {
			participants.append(el('small', '', participant.displayName));
		}
		summary.append(contestInfo, participants); card.append(summary);

		if (session.invitations.length) {
			const invitationList = el('div', 'battle-invitations');
			for (const invitation of session.invitations) {
				const participant = session.participants.find(item => item.characterId === invitation.characterId);
				const responseLabel = {pending: 'pendente', accepted: 'aceitou', declined: 'recusou'}[invitation.response];
				invitationList.append(el('span', `invitation-${invitation.response}`,
					`${participant?.displayName || invitation.characterId}: ${responseLabel}`));
			}
			card.append(invitationList);
		}

		const invitation = session.invitations.find(item => item.characterId === context.character?.id);
		const participant = session.participants.find(item => item.characterId === context.character?.id);
		const selection = invitation?.response === 'pending' && participant && !participant.pokemon ?
			playerPokemonSelection(context, session, participant) : null;
		if (selection) card.append(selection);
		if (invitation?.response === 'pending') {
			const actions = el('div', 'battle-session-actions');
			actions.append(actionButton('Recusar', async () => {
				await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/response`, {method: 'POST', body: {response: 'declined'}});
				await refresh(context);
			}));
			const accept = actionButton('Aceitar', async () => {
				if (selection?.getPokemonSelection) {
					await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/selection`,
						{method: 'POST', body: {teamIndex: selection.getPokemonSelection()}});
				}
				await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/response`, {method: 'POST', body: {response: 'accepted'}});
				await refresh(context);
			}, true);
			actions.lastChild.classList.add('danger');
			actions.append(accept); card.append(actions);
		}
		return card;
	}
	function sessionCard(context, session, openEditor) {
		if (!context.master) return playerContestCard(context, session);
		const card = el('article', 'panel contest-card'); const header = el('div', 'contest-card-header');
		const title = el('div'); title.append(el('h3', '', session.name)); title.append(badges(session)); header.append(title);
		const actions = el('div', 'contest-actions');
		if (session.status === 'started') actions.append(actionButton('Abrir palco', async () => {
			const root = document.getElementById('dashboard-body'); root.replaceChildren(await runtime(context, session));
		}, true));
		if (context.master && session.status === 'ready') actions.append(actionButton('Iniciar', async () => {
			await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/start`, {method: 'POST'}); await refresh(context);
		}, true));
		if (context.master && ['draft', 'declined'].includes(session.status)) actions.prepend(actionButton('Editar preparação', () => openEditor(session)));
		if (context.master && !['started', 'ended', 'cancelled'].includes(session.status)) {
			actions.append(actionButton('Cancelar concurso', async () => {
				await context.api(`/contest-sessions/${encodeURIComponent(session.id)}`, {method: 'DELETE'}); await refresh(context);
			}));
		}
		header.append(actions); card.append(header);
		return card;
	}
	async function render(context) {
		if (refreshTimer) window.clearTimeout(refreshTimer);
		context.master = context.master || context.state.session?.role === 'master';
		const data = await context.api('/contest-sessions'); const sessions = data.contestSessions || [];
		const active = sessions.find(session => session.status === 'started');
		if (active) {
			const runtimeData = await context.api(`/contest-sessions/${encodeURIComponent(active.id)}/runtime`);
			initializeContestAnimationCursor(runtimeData.contest, true);
			const page = renderRuntime(context, active, runtimeData.contest);
			if (!page.classList.contains('contest-final-page')) {
				scheduleActiveContestRefresh(context, active, page, runtimeData.contest);
			}
			return page;
		}
		const completed = sessions.find(session => session.status === 'ended' && !dismissedContestResults.has(session.id));
		if (completed) {
			try {
				return await runtime(context, completed);
			} catch {
				dismissedContestResults.add(completed.id);
			}
		}
		const page = el('div', 'contest-page');
		const toolbar = el('div', 'panel contest-toolbar');
		toolbar.append(el('div', '', context.master ? 'Prepare e acompanhe apresentações.' : 'Convites e apresentações disponíveis.'));
		const editorHost = el('div');
		const openEditor = session => {
			editorHost.replaceChildren(contestEditor(context, session, () => editorHost.replaceChildren()));
			editorHost.scrollIntoView({behavior: 'smooth', block: 'start'});
		};
		if (context.master) toolbar.append(actionButton('＋ Novo concurso', () => openEditor(), true));
		page.append(toolbar, editorHost); const list = el('div', 'contest-list');
		const visibleSessions = sessions.filter(session => !['cancelled', 'started', 'ended'].includes(session.status));
		for (const session of visibleSessions) list.append(sessionCard(context, session, openEditor));
		if (!visibleSessions.length) list.append(el('div', 'panel empty-state', 'Nenhum concurso em preparação.'));
		page.append(list);
		schedulePreContestRefresh(context, page, sessions);
		return page;
	}
	return {render, battleTemporaryNPCEditor, stopAudio: () => window.RPGBattleAudio?.stop()};
})();
