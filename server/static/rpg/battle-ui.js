'use strict';

/* global state, api, createElement, button, pokemonSprite, showToast, renderDashboard, rpgBattleRoom */

function rpgBattleField(label, control, className = '') {
	const field = createElement('label', 'battle-field ' + className);
	field.append(createElement('span', '', label), control);
	return field;
}

function rpgBattleSelect(options, value) {
	const select = createElement('select');
	for (const [id, label] of options) {
		const option = createElement('option', '', label);
		option.value = id;
		option.selected = id === value;
		select.append(option);
	}
	return select;
}

function rpgBattleCheck(label, checked = false) {
	const wrapper = createElement('label', 'battle-check');
	const input = createElement('input');
	input.type = 'checkbox';
	input.checked = checked;
	wrapper.append(input, createElement('span', '', label));
	return { wrapper, input };
}

function rpgBattleStep(number, title, description) {
	const step = createElement('section', 'battle-step');
	const heading = createElement('div', 'battle-step-heading');
	heading.append(createElement('span', 'battle-step-number', String(number)));
	const text = createElement('div');
	text.append(createElement('h3', '', title), createElement('p', '', description));
	heading.append(text);
	const body = createElement('div', 'battle-step-body');
	step.append(heading, body);
	return { step, body };
}

function rpgBattleStatus(status) {
	return ({
		draft: 'Rascunho', inviting: 'Aguardando confirma\u00e7\u00f5es', ready: 'Pronta para iniciar',
		declined: 'Convite recusado', started: 'Iniciada', ended: 'Encerrada', cancelled: 'Cancelada',
	})[status] || status;
}

function rpgBattleStatusClass(status) {
	return 'battle-status status-' + status;
}

function rpgControlledPokemonSet(species, level, index) {
	return {
		name: index ? species + ' ' + (index + 1) : species,
		species,
		item: '', ability: '', moves: [], nature: '', gender: '',
		evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
		level,
	};
}

function rpgBattleParticipantSummary(participant) {
	const count = participant.pokemon?.length || 0;
	return participant.displayName + ' \u00b7 ' + count + '/' + participant.selectionLimit + ' Pok\u00e9mon';
}

function rpgBattleCard(session, characters) {
	const card = createElement('article', 'panel battle-session-card');
	const head = createElement('div', 'battle-session-head');
	const title = createElement('div');
	title.append(
		createElement('strong', '', session.name || 'Batalha sem nome'),
		createElement('small', '', (session.format || 'Formato pendente') + ' \u00b7 ' +
			(session.opponentType || 'advers\u00e1rio pendente'))
	);
	head.append(title, createElement('span', rpgBattleStatusClass(session.status), rpgBattleStatus(session.status)));
	card.append(head);

	const teams = createElement('div', 'battle-teams');
	for (const teamId of ['A', 'B']) {
		const team = createElement('div', 'battle-team');
		team.append(createElement('strong', '', 'Equipe ' + teamId));
		const members = session.participants.filter(participant => participant.team === teamId);
		for (const participant of members) team.append(createElement('small', '', rpgBattleParticipantSummary(participant)));
		if (!members.length) team.append(createElement('small', '', 'Ainda n\u00e3o configurada'));
		teams.append(team);
	}
	card.append(teams);
	const special = createElement('div', 'battle-session-special');
	for (const teamId of ['A', 'B']) {
		const hazards = session.conditions?.initialHazards?.[teamId];
		if (!hazards) continue;
		const labels = [];
		if (hazards.spikes) labels.push('Spikes ×' + hazards.spikes);
		if (hazards.stealthRock) labels.push('Stealth Rock');
		if (hazards.toxicSpikes) labels.push('Toxic Spikes ×' + hazards.toxicSpikes);
		if (labels.length) special.append(createElement('span', '', 'Equipe ' + teamId + ': ' + labels.join(' · ')));
	}
	if (session.rules?.wagerAmount > 0) {
		special.append(createElement('strong', '', 'Aposta: ₽' + new Intl.NumberFormat('pt-BR').format(session.rules.wagerAmount) + ' por Player'));
	}
	if (special.children.length) card.append(special);

	if (session.invitations.length) {
		const invitationList = createElement('div', 'battle-invitations');
		for (const invitation of session.invitations) {
			const character = characters.find(item => item.id === invitation.characterId);
			invitationList.append(createElement(
				'span', 'invitation-' + invitation.response,
				(character?.characterName || invitation.characterId) + ': ' +
				({ pending: 'pendente', accepted: 'aceitou', declined: 'recusou' })[invitation.response]
			));
		}
		card.append(invitationList);
	}
	return card;
}

function rpgBattleEditor(characters, existing, onClose) {
	const form = createElement('form', 'panel battle-editor');
	const editorTitle = createElement('div', 'battle-editor-title');
	editorTitle.append(
		createElement('div', '', ''),
		button('Fechar', 'button')
	);
	editorTitle.firstChild.append(
		createElement('p', 'eyebrow', existing ? 'Editar prepara\u00e7\u00e3o' : 'Nova batalha'),
		createElement('h2', '', existing ? (existing.name || 'Batalha sem nome') : 'Preparar batalha')
	);
	editorTitle.lastChild.addEventListener('click', onClose);
	form.append(editorTitle);

	const basic = rpgBattleStep(1, 'Batalha e formato', 'Defina o nome, o formato de campo e o tipo de advers\u00e1rio.');
	const name = createElement('input');
	name.placeholder = 'Nome opcional';
	name.maxLength = 100;
	name.value = existing?.name || '';
	const format = rpgBattleSelect([
		['singles', 'Singles'], ['doubles', 'Doubles'], ['multi', 'Multi'],
		['triples', 'Triples'], ['raid', 'Raid'], ['boss', 'Boss'],
	], existing?.format || 'singles');
	const opponent = rpgBattleSelect([
		['player', 'Player'], ['npc', 'NPC'], ['wild', 'Pok\u00e9mon selvagem'],
		['boss', 'Boss'], ['horde', 'Horda'],
	], existing?.opponentType || 'wild');
	const basicGrid = createElement('div', 'battle-form-grid');
	basicGrid.append(rpgBattleField('Nome', name), rpgBattleField('Formato', format), rpgBattleField('Advers\u00e1rio', opponent));
	basic.body.append(basicGrid);
	form.append(basic.step);

	const participantsStep = rpgBattleStep(2, 'Participantes', 'Escolha quem entra em cada equipe.');
	const participantColumns = createElement('div', 'participant-columns');
	const playerChecks = new Map();
	for (const teamId of ['A', 'B']) {
		const column = createElement('div', 'participant-column');
		column.append(createElement('strong', '', 'Equipe ' + teamId));
		for (const character of characters) {
			const selected = existing?.participants.some(item =>
				item.team === teamId && item.characterId === character.id
			) || false;
			const choice = rpgBattleCheck(character.characterName, selected);
			choice.input.dataset.team = teamId;
			choice.input.dataset.character = character.id;
			choice.input.addEventListener('change', () => {
				if (choice.input.checked) {
					const other = playerChecks.get((teamId === 'A' ? 'B' : 'A') + ':' + character.id);
					if (other) other.checked = false;
				}
				refreshSelections();
			});
			playerChecks.set(teamId + ':' + character.id, choice.input);
			column.append(choice.wrapper);
		}
		if (!characters.length) column.append(createElement('small', '', 'Nenhum Player criado.'));
		column.dataset.participantTeam = teamId;
		participantColumns.append(column);
	}
	participantsStep.body.append(participantColumns);

	const controlled = createElement('div', 'controlled-opponent');
	const controlledName = createElement('input');
	const previousControlled = existing?.participants.find(item => item.kind !== 'player');
	controlledName.value = previousControlled?.displayName || '';
	controlledName.placeholder = 'Ex.: Squirtle selvagem';
	const controlledSpecies = createElement('input');
	controlledSpecies.value = previousControlled?.pokemon?.[0]?.set?.species || '';
	controlledSpecies.placeholder = 'Ex.: Squirtle';
	const controlledLevel = createElement('input');
	controlledLevel.type = 'number'; controlledLevel.min = '1'; controlledLevel.max = '999';
	controlledLevel.value = String(previousControlled?.pokemon?.[0]?.set?.level || 5);
	const controlledCount = createElement('input');
	controlledCount.type = 'number'; controlledCount.min = '1'; controlledCount.max = '6';
	controlledCount.value = String(previousControlled?.pokemon?.length || 1);
	controlled.append(
		rpgBattleField('Nome do advers\u00e1rio', controlledName),
		rpgBattleField('Esp\u00e9cie', controlledSpecies),
		rpgBattleField('N\u00edvel', controlledLevel),
		rpgBattleField('Quantidade na horda', controlledCount, 'horde-count')
	);
	participantsStep.body.append(controlled);
	form.append(participantsStep.step);

	const selectionStep = rpgBattleStep(3, 'Sele\u00e7\u00e3o dos Pok\u00e9mon', 'Defina o limite e quais membros da equipe persistente poder\u00e3o lutar.');
	const selectionArea = createElement('div', 'battle-selections');
	selectionStep.body.append(selectionArea);
	form.append(selectionStep.step);
	const selectionState = new Map();
	for (const participant of existing?.participants || []) {
		if (participant.kind !== 'player') continue;
		selectionState.set(participant.team + ':' + participant.characterId, {
			limit: participant.selectionLimit,
			indexes: new Set(participant.pokemon.map(choice => choice.teamIndex)),
		});
	}

	function refreshOpponentVisibility() {
		const playerOpponent = opponent.value === 'player';
		const wagerAllowed = playerOpponent || opponent.value === 'npc';
		wagerField.classList.toggle('hidden', !wagerAllowed);
		wagerAmount.disabled = !wagerAllowed;
		if (!wagerAllowed) wagerAmount.value = '0';
		participantColumns.querySelector('[data-participant-team="B"]').classList.toggle('hidden', !playerOpponent);
		controlled.classList.toggle('hidden', playerOpponent);
		controlled.querySelector('.horde-count').classList.toggle('hidden', opponent.value !== 'horde');
		refreshSelections();
	}

	function refreshSelections() {
		selectionArea.replaceChildren();
		const active = [...playerChecks.entries()].filter(([key, input]) =>
			input.checked && (key.startsWith('A:') || opponent.value === 'player')
		);
		for (const [key] of active) {
			const [teamId, characterId] = key.split(':');
			const character = characters.find(item => item.id === characterId);
			if (!character) continue;
			const saved = selectionState.get(key) || { limit: Math.min(6, character.team.length || 1), indexes: new Set() };
			selectionState.set(key, saved);
			const card = createElement('div', 'pokemon-selection-card');
			const heading = createElement('div', 'pokemon-selection-heading');
			heading.append(createElement('strong', '', 'Equipe ' + teamId + ' \u00b7 ' + character.characterName));
			const limit = rpgBattleSelect(Array.from({ length: 6 }, (_, index) => [String(index + 1), 'At\u00e9 ' + (index + 1)]), String(saved.limit));
			limit.addEventListener('change', () => { saved.limit = Number(limit.value); });
			heading.append(limit);
			card.append(heading);
			const list = createElement('div', 'pokemon-choice-grid');
			for (const [index, pokemon] of (character.team || []).entries()) {
				const choice = rpgBattleCheck('', saved.indexes.has(index));
				choice.wrapper.classList.add('pokemon-choice');
				choice.wrapper.append(pokemonSprite(pokemon));
				const info = createElement('span');
				info.append(createElement('strong', '', pokemon.name || pokemon.species));
				info.append(createElement('small', '', (pokemon.species || 'Pok\u00e9mon') + ' \u00b7 Nv. ' + (pokemon.level || 1)));
				choice.wrapper.append(info);
				choice.input.addEventListener('change', () => {
					if (choice.input.checked) saved.indexes.add(index);
					else saved.indexes.delete(index);
				});
				list.append(choice.wrapper);
			}
			card.append(list);
			selectionArea.append(card);
		}
		if (!active.length) selectionArea.append(createElement('p', 'battle-help', 'Selecione ao menos um Player na Equipe A.'));
	}
	opponent.addEventListener('change', refreshOpponentVisibility);

	const conditions = rpgBattleStep(4, 'Condi\u00e7\u00f5es iniciais', 'Configure o ambiente e o ponto inicial do confronto.');
	const weather = rpgBattleSelect([
		['', 'Nenhum'], ['sunnyday', 'Sunny'], ['raindance', 'Rain'], ['sandstorm', 'Sand'], ['snow', 'Snow'],
	], existing?.conditions.weather.id || '');
	const weatherDuration = rpgBattleSelect([['temporary', '5 turnos'], ['permanent', 'Permanente']], existing?.conditions.weather.duration || 'temporary');
	const terrain = rpgBattleSelect([
		['', 'Nenhum'], ['electricterrain', 'Electric'], ['grassyterrain', 'Grassy'],
		['psychicterrain', 'Psychic'], ['mistyterrain', 'Misty'],
	], existing?.conditions.terrain.id || '');
	const terrainDuration = rpgBattleSelect([['temporary', '5 turnos'], ['permanent', 'Permanente']], existing?.conditions.terrain.duration || 'temporary');
	const startingTurn = createElement('input');
	startingTurn.type = 'number'; startingTurn.min = '1'; startingTurn.value = String(existing?.conditions.startingTurn || 1);
	const timeOfDay = rpgBattleSelect([['day', 'Dia'], ['night', 'Noite']], existing?.conditions.timeOfDay || 'day');
	const conditionsGrid = createElement('div', 'battle-form-grid');
	conditionsGrid.append(
		rpgBattleField('Clima', weather),
		rpgBattleField('Terreno', terrain),
		rpgBattleField('Come\u00e7ar no turno', startingTurn),
		rpgBattleField('Dura\u00e7\u00e3o do clima', weatherDuration),
		rpgBattleField('Dura\u00e7\u00e3o do terreno', terrainDuration),
		rpgBattleField('Per\u00edodo', timeOfDay)
	);
	const initialHazards = existing?.conditions.initialHazards || {};
	const hazardEditor = (team, label) => {
		const saved = initialHazards[team] || {};
		const spikes = rpgBattleSelect([['0', 'Nenhum'], ['1', '1 camada'], ['2', '2 camadas'], ['3', '3 camadas']], String(saved.spikes || 0));
		const stealthRock = rpgBattleCheck('Stealth Rock', saved.stealthRock || false);
		const toxicSpikes = rpgBattleSelect([['0', 'Nenhum'], ['1', '1 camada'], ['2', '2 camadas']], String(saved.toxicSpikes || 0));
		const group = createElement('fieldset', 'battle-hazard-side');
		group.append(createElement('legend', '', label), rpgBattleField('Spikes', spikes), stealthRock.wrapper, rpgBattleField('Toxic Spikes', toxicSpikes));
		return { group, spikes, stealthRock: stealthRock.input, toxicSpikes };
	};
	const hazardsA = hazardEditor('A', 'No campo da Equipe A');
	const hazardsB = hazardEditor('B', 'No campo da Equipe B');
	const hazardsPanel = createElement('div', 'battle-hazards-panel');
	hazardsPanel.append(createElement('h3', '', 'Hazards iniciais'), createElement('p', 'battle-help', 'Entram ativos antes do primeiro turno.'), hazardsA.group, hazardsB.group);	const cave = rpgBattleCheck('A batalha acontece em uma caverna', existing?.conditions.isCave || false);
	const water = rpgBattleCheck('O alvo est\u00e1 na \u00e1gua', existing?.conditions.isInWater || false);
	conditions.body.append(conditionsGrid, hazardsPanel, cave.wrapper, water.wrapper);
	form.append(conditions.step);

	const rulesStep = rpgBattleStep(5, 'Regras especiais', 'Defina permiss\u00f5es, recompensas e o controle da sele\u00e7\u00e3o.');
	const canFlee = rpgBattleCheck('Permitir fuga', existing?.rules.canFlee ?? true);
	const experience = rpgBattleCheck('Conceder experi\u00eancia', existing?.rules.grantsExperience ?? true);
	const switching = rpgBattleCheck('Permitir trocar Pok\u00e9mon', existing?.rules.allowSwitching ?? true);
	const items = rpgBattleCheck('Permitir usar itens', existing?.rules.allowItems ?? true);
	const playerChoice = rpgBattleCheck('Permitir que Players escolham os pr\u00f3prios Pok\u00e9mon', existing?.rules.playersChoosePokemon || false);
	const wagerAmount = createElement('input');
	wagerAmount.type = 'number'; wagerAmount.min = '0'; wagerAmount.max = '10000000'; wagerAmount.step = '1';
	wagerAmount.value = String(existing?.rules.wagerAmount || 0);
	const wagerField = rpgBattleField('Aposta por Player (₽)', wagerAmount);
	wagerField.classList.add('battle-wager-field', 'hidden');
	wagerField.append(createElement('small', '', 'Cada Player paga este valor ao iniciar. Empate, fuga ou falha devolvem a aposta.'));
	const ruleGrid = createElement('div', 'battle-rule-grid');
	ruleGrid.append(canFlee.wrapper, experience.wrapper, switching.wrapper, items.wrapper, playerChoice.wrapper);
	rulesStep.body.append(ruleGrid, wagerField);
	form.append(rulesStep.step);

	const error = createElement('p', 'form-error hidden');
	const actions = createElement('div', 'battle-editor-actions');
	const cancel = button('Cancelar', 'button');
	cancel.addEventListener('click', onClose);
	const save = button('Salvar rascunho', 'button');
	save.type = 'submit'; save.dataset.invite = 'false';
	const invite = button('Salvar e enviar convites', 'button primary');
	invite.type = 'submit'; invite.dataset.invite = 'true';
	actions.append(cancel, save, invite);
	form.append(error, actions);

	form.addEventListener('submit', async event => {
		event.preventDefault();
		error.classList.add('hidden');
		const shouldInvite = event.submitter.dataset.invite === 'true';
		const submitButtons = [...actions.querySelectorAll('button')];
		for (const current of submitButtons) current.disabled = true;
		try {
			const participants = [];
			for (const [key, input] of playerChecks) {
				const [teamId, characterId] = key.split(':');
				if (!input.checked || (teamId === 'B' && opponent.value !== 'player')) continue;
				const character = characters.find(item => item.id === characterId);
				const saved = selectionState.get(key) || { limit: 1, indexes: new Set() };
				participants.push({
					id: 'player-' + teamId.toLowerCase() + '-' + characterId,
					team: teamId, kind: 'player', characterId,
					displayName: character.characterName,
					selectionLimit: saved.limit,
					pokemon: [...saved.indexes].map(teamIndex => ({ teamIndex })),
				});
			}
			if (!participants.some(item => item.team === 'A')) throw new Error('Escolha ao menos um Player para a Equipe A.');
			if (opponent.value === 'player') {
				if (!participants.some(item => item.team === 'B')) throw new Error('Escolha ao menos um Player para a Equipe B.');
			} else {
				const species = controlledSpecies.value.trim();
				if (!species) throw new Error('Informe a esp\u00e9cie do advers\u00e1rio.');
				const level = Number(controlledLevel.value);
				const count = opponent.value === 'horde' ? Number(controlledCount.value) : 1;
				if (!Number.isInteger(level) || level < 1 || level > 999) {
					throw new Error('O n\u00edvel do advers\u00e1rio deve estar entre 1 e 999.');
				}
				if (!Number.isInteger(count) || count < 1 || count > 6) {
					throw new Error('A horda deve ter entre 1 e 6 Pok\u00e9mon.');
				}
				participants.push({
					id: 'controlled-b', team: 'B', kind: opponent.value,
					displayName: controlledName.value.trim() || species,
					selectionLimit: count,
					pokemon: Array.from({ length: count }, (_, index) => ({
						set: rpgControlledPokemonSet(species, level, index),
					})),
				});
			}
			if (!playerChoice.input.checked && participants.some(item => item.kind === 'player' && !item.pokemon.length)) {
				throw new Error('Selecione os Pok\u00e9mon de cada Player ou permita que eles escolham.');
			}
			const request = {
				name: name.value.trim(), format: format.value, opponentType: opponent.value, participants,
				conditions: {
					weather: { id: weather.value, duration: weatherDuration.value, turns: 5 },
					terrain: { id: terrain.value, duration: terrainDuration.value, turns: 5 },
					startingTurn: Number(startingTurn.value), timeOfDay: timeOfDay.value,
					isCave: cave.input.checked, isInWater: water.input.checked,
					initialHazards: {
						A: { spikes: Number(hazardsA.spikes.value), stealthRock: hazardsA.stealthRock.checked, toxicSpikes: Number(hazardsA.toxicSpikes.value) },
						B: { spikes: Number(hazardsB.spikes.value), stealthRock: hazardsB.stealthRock.checked, toxicSpikes: Number(hazardsB.toxicSpikes.value) },
					},
				},
				rules: {
					canFlee: canFlee.input.checked, grantsExperience: experience.input.checked,
					allowSwitching: switching.input.checked, allowItems: items.input.checked,
					playersChoosePokemon: playerChoice.input.checked,
					wagerAmount: Number(wagerAmount.value || 0),
				},
			};
			let sessionId = existing?.id;
			if (!sessionId) {
				const created = await api('/battle-sessions', { method: 'POST', body: { name: request.name } });
				sessionId = created.battleSession.id;
			}
			await api('/battle-sessions/' + encodeURIComponent(sessionId), { method: 'PATCH', body: request });
			if (shouldInvite) await api('/battle-sessions/' + encodeURIComponent(sessionId) + '/invite', { method: 'POST' });
			showToast(shouldInvite ? 'Convites enviados.' : 'Rascunho de batalha salvo.');
			state.dashboardView = 'battles';
			await renderDashboard();
		} catch (submitError) {
			error.textContent = submitError.message;
			error.classList.remove('hidden');
			error.scrollIntoView({ behavior: 'smooth', block: 'center' });
		} finally {
			for (const current of submitButtons) current.disabled = false;
		}
	});

	refreshOpponentVisibility();
	return form;
}

async function renderMasterBattles(characters) {
	const root = createElement('div');
	const toolbar = createElement('div', 'panel battle-toolbar');
	const text = createElement('div');
	text.append(createElement('strong', '', 'Prepara\u00e7\u00e3o de batalhas'), createElement('small', '', 'Monte o cen\u00e1rio e envie convites aos Players.'));
	const create = button('\uFF0B Nova batalha', 'button primary');
	toolbar.append(text, create);
	root.append(toolbar);

	const editorHost = createElement('div');
	root.append(editorHost);
	function openEditor(session) {
		editorHost.replaceChildren(rpgBattleEditor(characters, session, () => editorHost.replaceChildren()));
		editorHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	create.addEventListener('click', () => openEditor());

	const data = await api('/battle-sessions');
	state.battleSessions = data.battleSessions;
	const activeSessions = state.battleSessions.filter(item => item.status === 'started');
	for (const session of activeSessions) root.append(await rpgBattleRoom(session, null, characters, true));
	const list = createElement('div', 'battle-session-list');
	for (const session of state.battleSessions) {
		const card = rpgBattleCard(session, characters);
		const actions = createElement('div', 'battle-session-actions');
		if (session.status === 'draft' || session.status === 'declined') {
			const edit = button('Editar prepara\u00e7\u00e3o', 'button');
			edit.addEventListener('click', () => openEditor(session));
			actions.append(edit);
		}
		if (session.status === 'ready') {
			const start = button('Iniciar batalha', 'button primary');
			start.addEventListener('click', async () => {
				start.disabled = true;
				try {
					await api('/battle-sessions/' + encodeURIComponent(session.id) + '/start', { method: 'POST' });
					showToast('Batalha confirmada e pedido de in\u00edcio criado.');
					await renderDashboard();
				} catch (error) { showToast(error.message, true); } finally { start.disabled = false; }
			});
			actions.append(start);
		}
		if (!['started', 'ended', 'cancelled'].includes(session.status)) {
			const cancel = button('Cancelar batalha', 'button danger');
			cancel.addEventListener('click', async () => {
				cancel.disabled = true;
				try {
					await api('/battle-sessions/' + encodeURIComponent(session.id), { method: 'DELETE' });
					showToast('Batalha cancelada.');
					await renderDashboard();
				} catch (error) { showToast(error.message, true); }
			});
			actions.append(cancel);
		}
		card.append(actions);
		list.append(card);
	}
	if (!state.battleSessions.length) {
		list.append(createElement('div', 'panel empty-state', 'Nenhuma batalha foi preparada.'));
	}
	root.append(list);
	return root;
}

function rpgPlayerPokemonSelection(session, character) {
	const participant = session.participants.find(item => item.characterId === character.id);
	if (!participant || !session.rules.playersChoosePokemon || session.status !== 'inviting') return null;
	const panel = createElement('div', 'player-battle-selection');
	panel.append(createElement('strong', '', 'Escolha seus Pok\u00e9mon (' + participant.selectionLimit + ' no m\u00e1ximo)'));
	const selected = new Set(participant.pokemon.map(choice => choice.teamIndex));
	const grid = createElement('div', 'pokemon-choice-grid');
	for (const [index, pokemon] of (character.team || []).entries()) {
		const choice = rpgBattleCheck('', selected.has(index));
		choice.wrapper.classList.add('pokemon-choice');
		choice.wrapper.append(pokemonSprite(pokemon));
		const info = createElement('span');
		info.append(createElement('strong', '', pokemon.name || pokemon.species));
		info.append(createElement('small', '', 'Nv. ' + (pokemon.level || 1)));
		choice.wrapper.append(info);
		choice.input.addEventListener('change', () => {
			if (choice.input.checked) selected.add(index); else selected.delete(index);
		});
		grid.append(choice.wrapper);
	}
	const save = button('Salvar sele\u00e7\u00e3o', 'button');
	save.addEventListener('click', async () => {
		if (!selected.size || selected.size > participant.selectionLimit) {
			showToast('Escolha entre 1 e ' + participant.selectionLimit + ' Pok\u00e9mon.', true);
			return;
		}
		save.disabled = true;
		try {
			await api('/battle-sessions/' + encodeURIComponent(session.id) + '/selection', {
				method: 'POST', body: { pokemon: [...selected].map(teamIndex => ({ teamIndex })) },
			});
			showToast('Sele\u00e7\u00e3o salva. Agora voc\u00ea pode aceitar o convite.');
			await renderDashboard();
		} catch (error) { showToast(error.message, true); } finally { save.disabled = false; }
	});
	panel.append(grid, save);
	return panel;
}

async function renderPlayerBattles(character) {
	const root = createElement('div');
	const data = await api('/battle-sessions');
	state.battleSessions = data.battleSessions;
	const activeSessions = state.battleSessions.filter(item => item.status === 'started');
	for (const session of activeSessions) root.append(await rpgBattleRoom(session, character, [character], false));
	const list = createElement('div', 'battle-session-list');
	for (const session of state.battleSessions.filter(item => !['cancelled', 'started', 'ended'].includes(item.status))) {
		const card = rpgBattleCard(session, [character]);
		const invitation = session.invitations.find(item => item.characterId === character.id);
		const selection = rpgPlayerPokemonSelection(session, character);
		if (selection) card.append(selection);
		if (invitation?.response === 'pending') {
			const actions = createElement('div', 'battle-session-actions');
			for (const [response, label, className] of [
				['declined', 'Recusar', 'button danger'], ['accepted', 'Aceitar', 'button primary'],
			]) {
				const action = button(label, className);
				action.addEventListener('click', async () => {
					action.disabled = true;
					try {
						if (response === 'accepted' && selection?.getPokemonSelection) {
							await api('/battle-sessions/' + encodeURIComponent(session.id) + '/selection', {
								method: 'POST', body: {pokemon: selection.getPokemonSelection()},
							});
						}
						await api('/battle-sessions/' + encodeURIComponent(session.id) + '/response', {
							method: 'POST', body: { response },
						});
						showToast(response === 'accepted' ? 'Convite aceito.' : 'Convite recusado.');
						await renderDashboard();
					} catch (error) { showToast(error.message, true); } finally { action.disabled = false; }
				});
				actions.append(action);
			}
			card.append(actions);
		}
		list.append(card);
	}
	if (!list.children.length && !activeSessions.length) {
		list.append(createElement('div', 'panel empty-state', 'Nenhum convite de batalha recebido.'));
	}
	root.append(list);
	return root;
}
