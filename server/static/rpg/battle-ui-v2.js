'use strict';

/* global state, api, createElement, button, pokemonSprite, spriteImage, characterAvatarBadge, showToast, renderDashboard, RPGAssets */
/* global rpgBattleField, rpgBattleSelect, rpgBattleCheck, rpgBattleStep, rpgBattleCard, rpgControlledPokemonSet, rpgBattleRoom */

let RPG_BATTLE_POKEMON = [];
let RPG_BATTLE_SCENES = [];

async function rpgLoadBattleScenes() {
	if (RPG_BATTLE_SCENES.length) return RPG_BATTLE_SCENES;
	const data = await api('/battle-scenes');
	RPG_BATTLE_SCENES = data.scenes;
	return RPG_BATTLE_SCENES;
}

function rpgBattleSceneUrl(scene) {
	return RPGAssets.url(scene.imagePath);
}

function rpgScenePicker(selectedId = 'meadow') {
	let catalog = [];
	const picker = createElement('div', 'battle-scene-picker');
	const selected = createElement('input');
	selected.type = 'hidden';
	selected.value = selectedId || 'meadow';
	const toggle = button('', 'battle-scene-toggle');
	const options = createElement('div', 'battle-scene-options hidden');
	const search = createElement('input', 'battle-scene-search');
	search.type = 'search';
	search.placeholder = 'Pesquisar cenário...';
	const results = createElement('div', 'battle-scene-results');
	const captureInfo = createElement('div', 'battle-scene-capture-info');
	options.append(search, results);
	picker.append(selected, toggle, options, captureInfo);

	const groupName = group => ({ current: 'Atual', classic: 'Clássico', competitive: 'Competitivo' })[group] || group;
	function currentScene() {
		return catalog.find(scene => scene.id === selected.value) || catalog.find(scene => scene.id === 'meadow');
	}
	function boostText(scene) {
		if (!scene) return 'Sem modificador ambiental de Pokébola.';
		const boosts = [];
		if (scene.isCave) boosts.push('Dusk Ball');
		if (scene.isInWater) boosts.push('Dive Ball e Lure Ball');
		return boosts.length ? 'Bônus ambiental: ' + boosts.join(' · ') : 'Sem modificador ambiental de Pokébola.';
	}
	function sceneImage(scene) {
		const image = createElement('img');
		image.src = rpgBattleSceneUrl(scene);
		image.alt = '';
		image.loading = 'lazy';
		return image;
	}
	function renderToggle() {
		const scene = currentScene();
		if (!scene) {
			toggle.replaceChildren(createElement('span', 'species-placeholder', 'Carregando cenários...'), createElement('span', '', '▾'));
			captureInfo.textContent = '';
			return;
		}
		selected.value = scene.id;
		const text = createElement('span');
		text.append(createElement('strong', '', scene.name), createElement('small', '', groupName(scene.group)));
		toggle.replaceChildren(sceneImage(scene), text, createElement('span', '', '▾'));
		captureInfo.textContent = boostText(scene);
		captureInfo.classList.toggle('has-boost', scene.isCave || scene.isInWater);
	}
	function renderResults() {
		const query = search.value.trim().toLowerCase();
		const available = catalog.filter(scene => !query || scene.name.toLowerCase().includes(query) || scene.id.includes(query));
		results.replaceChildren();
		for (const scene of available) {
			const option = button('', 'battle-scene-option' + (scene.id === selected.value ? ' selected' : ''));
			const text = createElement('span');
			text.append(createElement('strong', '', scene.name), createElement('small', '', groupName(scene.group)));
			option.append(sceneImage(scene), text);
			option.addEventListener('click', () => {
				selected.value = scene.id;
				options.classList.add('hidden');
				toggle.setAttribute('aria-expanded', 'false');
				renderToggle();
			});
			results.append(option);
		}
		if (!available.length) results.append(createElement('div', 'empty-state', 'Nenhum cenário encontrado.'));
	}
	toggle.addEventListener('click', () => {
		const open = options.classList.contains('hidden');
		options.classList.toggle('hidden', !open);
		toggle.setAttribute('aria-expanded', String(open));
		if (open) { search.focus(); renderResults(); }
	});
	search.addEventListener('input', renderResults);
	renderToggle();
	return { picker, input: selected, setCatalog(nextCatalog) { catalog = nextCatalog; renderToggle(); } };
}

async function rpgLoadBattlePokemon() {
	if (RPG_BATTLE_POKEMON.length) return RPG_BATTLE_POKEMON;
	const data = await api('/battle-pokemon');
	RPG_BATTLE_POKEMON = data.pokemon;
	return RPG_BATTLE_POKEMON;
}

function rpgSpeciesSprite(entry) {
	const image = spriteImage(entry.name);
	const ids = [...new Set([entry.spriteId, entry.baseSpriteId].filter(Boolean))];
	const urls = ids.flatMap(id => [
		RPGAssets.url('sprites/gen5/' + id + '.png'),
		RPGAssets.url('sprites/ani/' + id + '.gif'),
	]);
	let index = 0;
	if (urls.length) image.src = urls[0];
	image.addEventListener('error', () => {
		index++;
		if (index < urls.length) image.src = urls[index];
		else { image.removeAttribute('src'); image.classList.add('missing-sprite'); }
	});
	return image;
}

function rpgFormatRules(format) {
	return ({
		singles: { activeA: 1, activeB: 1, wildSlots: 1, description: '1 contra 1 ao mesmo tempo.' },
		doubles: { activeA: 2, activeB: 2, wildSlots: 2, description: '2 contra 2 ao mesmo tempo.' },
		multi: { activeA: 2, activeB: 2, wildSlots: 2, description: '2 treinadores contra 2; cada treinador usa 1 Pok\u00e9mon ativo.' },
		triples: { activeA: 3, activeB: 3, wildSlots: 3, description: '3 contra 3 ao mesmo tempo.' },
		raid: { activeA: Infinity, activeB: 1, wildSlots: 1, description: '1 Pok\u00e9mon ativo de cada Player contra 1 alvo.' },
		boss: { activeA: 1, activeB: 1, wildSlots: 1, description: 'Encontro selvagem contra lend\u00e1rio ou pseudolend\u00e1rio eleg\u00edvel; n\u00edvel at\u00e9 999.' },
	})[format];
}

function rpgSpeciesPicker(catalog, selectedId = '', bossOnly = false) {
	const picker = createElement('div', 'battle-species-picker');
	const selected = createElement('input');
	selected.type = 'hidden';
	selected.value = selectedId;
	const toggle = button('', 'battle-species-toggle');
	const options = createElement('div', 'battle-species-options hidden');
	const search = createElement('input', 'battle-species-search');
	search.type = 'search';
	search.placeholder = 'Pesquisar Pok\u00e9mon...';
	const results = createElement('div', 'battle-species-results');
	options.append(search, results);
	picker.append(selected, toggle, options);

	function currentEntry() {
		return catalog.find(entry => entry.id === selected.value);
	}
	function renderToggle() {
		const entry = currentEntry();
		if (!entry) {
			toggle.replaceChildren(createElement('span', 'species-placeholder', 'Escolha um Pok\u00e9mon'), createElement('span', '', '\u25BE'));
			return;
		}
		const text = createElement('span');
		text.append(createElement('strong', '', entry.name));
		if (entry.bossEligible) {
			text.append(createElement('small', '', entry.pseudoLegendary ? 'Pseudolend\u00e1rio' : 'Lend\u00e1rio'));
		}
		toggle.replaceChildren(rpgSpeciesSprite(entry), text, createElement('span', '', '\u25BE'));
	}
	function renderResults() {
		const query = search.value.trim().toLowerCase();
		const available = catalog.filter(entry => (bossOnly ? entry.bossEligible : entry.regularWildEligible) &&
			(!query || entry.name.toLowerCase().includes(query) || entry.id.includes(query))
		);
		results.replaceChildren();
		for (const entry of available) {
			const option = button('', 'battle-species-option');
			option.append(rpgSpeciesSprite(entry), createElement('span', '', entry.name));
			option.addEventListener('click', () => {
				selected.value = entry.id;
				options.classList.add('hidden');
				toggle.setAttribute('aria-expanded', 'false');
				renderToggle();
			});
			results.append(option);
		}
		if (!available.length) results.append(createElement('div', 'empty-state', 'Nenhum Pok\u00e9mon encontrado.'));
	}
	toggle.addEventListener('click', () => {
		const open = options.classList.contains('hidden');
		options.classList.toggle('hidden', !open);
		toggle.setAttribute('aria-expanded', String(open));
		if (open) { search.focus(); renderResults(); }
	});
	search.addEventListener('input', renderResults);
	renderToggle();
	return { picker, input: selected };
}

function rpgPlayerParticipantChoice(character, teamId, checked, locked, onChange) {
	const choice = rpgBattleCheck('', checked);
	choice.wrapper.classList.add('battle-player-choice');
	choice.input.disabled = locked;
	choice.input.dataset.team = teamId;
	choice.input.dataset.character = character.id;
	choice.wrapper.append(characterAvatarBadge(character));
	const text = createElement('span');
	text.append(createElement('strong', '', character.characterName));
	text.append(createElement('small', '', (character.team?.length || 0) + ' Pok\u00e9mon na equipe'));
	choice.wrapper.append(text);
	choice.input.addEventListener('change', onChange);
	return choice;
}

function rpgBattleEditor(characters, existing, onClose) {
	const form = createElement('form', 'panel battle-editor');
	const title = createElement('div', 'battle-editor-title');
	const titleText = createElement('div');
	titleText.append(createElement('p', 'eyebrow', existing ? 'Editar prepara\u00e7\u00e3o' : 'Nova batalha'));
	titleText.append(createElement('h2', '', existing?.name || 'Preparar batalha'));
	const close = button('Fechar', 'button');
	close.addEventListener('click', onClose);
	title.append(titleText, close);
	form.append(title);

	const basic = rpgBattleStep(1, 'Batalha e formato', 'O formato define quantos Pok\u00e9mon ficam ativos ao mesmo tempo.');
	const name = createElement('input');
	name.maxLength = 100; name.placeholder = 'Nome opcional'; name.value = existing?.name || '';
	const format = rpgBattleSelect([
		['singles', 'Singles'], ['doubles', 'Doubles'], ['multi', 'Multi'],
		['triples', 'Triples'], ['raid', 'Raid'], ['boss', 'Boss'],
	], existing?.format || 'singles');
	const opponent = rpgBattleSelect([
		['player', 'Player'], ['npc', 'NPC'], ['wild', 'Pok\u00e9mon selvagem'], ['horde', 'Horda'],
	], existing?.opponentType === 'boss' ? 'wild' : existing?.opponentType || 'wild');
	const formatHelp = createElement('p', 'format-help');
	const basicGrid = createElement('div', 'battle-form-grid');
	basicGrid.append(rpgBattleField('Nome', name), rpgBattleField('Formato', format), rpgBattleField('Advers\u00e1rio', opponent));
	basic.body.append(basicGrid, formatHelp);
	form.append(basic.step);

	const participantsStep = rpgBattleStep(2, 'Participantes', 'O Mestre escolhe os participantes; cada treinador escolhe quais Pok\u00e9mon levar.');
	const columns = createElement('div', 'participant-columns');
	const playerInputs = new Map();
	for (const teamId of ['A', 'B']) {
		const column = createElement('div', 'participant-column');
		column.dataset.participantTeam = teamId;
		column.append(createElement('strong', '', 'Equipe ' + teamId));
		for (const character of characters) {
			const inExisting = existing?.participants.some(item => item.team === teamId && item.characterId === character.id) || false;
			const choice = rpgPlayerParticipantChoice(character, teamId, inExisting, false, () => {
				if (choice.input.checked) {
					const other = playerInputs.get((teamId === 'A' ? 'B' : 'A') + ':' + character.id);
					if (other) other.checked = false;
				}
			});
			playerInputs.set(teamId + ':' + character.id, choice.input);
			column.append(choice.wrapper);
		}
		if (!characters.length) column.append(createElement('small', '', 'Nenhum Player criado.'));
		columns.append(column);
	}
	participantsStep.body.append(columns);
	const npcPanel = createElement('div', 'npc-placeholder hidden');
	npcPanel.append(
		createElement('strong', '', 'NPCs da campanha'),
		createElement('p', '', 'Nenhum NPC cadastrado. A cria\u00e7\u00e3o e as equipes de NPCs ser\u00e3o adicionadas na pr\u00f3xima parte.'),
	);
	participantsStep.body.append(npcPanel);
	form.append(participantsStep.step);

	const pokemonStep = rpgBattleStep(3, 'Sele\u00e7\u00e3o dos Pok\u00e9mon', 'O Mestre define apenas a quantidade permitida. Players e NPCs escolhem suas equipes.');
	const teamLimit = rpgBattleSelect(Array.from({ length: 6 }, (_, index) => [String(index + 1), String(index + 1)]), '1');
	const existingPlayer = existing?.participants.find(item => item.kind === 'player');
	teamLimit.value = String(existingPlayer?.selectionLimit || 1);
	const limitRow = createElement('div', 'team-limit-row');
	limitRow.append(rpgBattleField('Quantidade m\u00e1xima por treinador', teamLimit), createElement('p', '', 'Cada treinador far\u00e1 a pr\u00f3pria sele\u00e7\u00e3o ao receber o convite.'));
	const wildArea = createElement('div', 'wild-selection-area');
	pokemonStep.body.append(limitRow, wildArea);
	form.append(pokemonStep.step);

	const conditions = rpgBattleStep(4, 'Condi\u00e7\u00f5es iniciais', 'Configure o ambiente e o ponto inicial do confronto.');
	const weather = rpgBattleSelect([['', 'Nenhum'], ['sunnyday', 'Sunny'], ['raindance', 'Rain'], ['sandstorm', 'Sand'], ['snow', 'Snow']], existing?.conditions.weather.id || '');
	const terrain = rpgBattleSelect([['', 'Nenhum'], ['electricterrain', 'Electric'], ['grassyterrain', 'Grassy'], ['psychicterrain', 'Psychic'], ['mistyterrain', 'Misty']], existing?.conditions.terrain.id || '');
	const startingTurn = createElement('input'); startingTurn.type = 'number'; startingTurn.min = '1'; startingTurn.value = String(existing?.conditions.startingTurn || 1);
	const weatherDuration = rpgBattleSelect([['temporary', '5 turnos'], ['permanent', 'Permanente']], existing?.conditions.weather.duration || 'temporary');
	const terrainDuration = rpgBattleSelect([['temporary', '5 turnos'], ['permanent', 'Permanente']], existing?.conditions.terrain.duration || 'temporary');
	const timeOfDay = rpgBattleSelect([['day', 'Dia'], ['night', 'Noite']], existing?.conditions.timeOfDay || 'day');
	const conditionsGrid = createElement('div', 'battle-form-grid');
	conditionsGrid.append(
		rpgBattleField('Clima', weather), rpgBattleField('Terreno', terrain), rpgBattleField('Come\u00e7ar no turno', startingTurn),
		rpgBattleField('Dura\u00e7\u00e3o do clima', weatherDuration), rpgBattleField('Dura\u00e7\u00e3o do terreno', terrainDuration), rpgBattleField('Per\u00edodo', timeOfDay)
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
	hazardsPanel.append(createElement('h3', '', 'Hazards iniciais'), createElement('p', 'battle-help', 'Entram ativos antes do primeiro turno.'), hazardsA.group, hazardsB.group);
	const scene = rpgScenePicker(existing?.conditions.sceneId || 'meadow');	const sceneField = rpgBattleField('Cen\u00e1rio da batalha', scene.picker);
	sceneField.classList.add('battle-scene-field');
	conditions.body.append(conditionsGrid, hazardsPanel, sceneField);
	void rpgLoadBattleScenes().then(catalog => scene.setCatalog(catalog)).catch(error => {
		scene.picker.append(createElement('p', 'form-error', error.message));
	});
	form.append(conditions.step);

	const rulesStep = rpgBattleStep(5, 'Regras especiais', 'As escolhas de equipe pertencem aos treinadores participantes.');
	const canFlee = rpgBattleCheck('Permitir fuga', existing?.rules.canFlee ?? true);
	const experience = rpgBattleCheck('Conceder experi\u00eancia', existing?.rules.grantsExperience ?? true);
	const switching = rpgBattleCheck('Permitir trocar Pok\u00e9mon', existing?.rules.allowSwitching ?? true);
	const items = rpgBattleCheck('Permitir usar itens', existing?.rules.allowItems ?? true);
	const wagerAmount = createElement('input');
	wagerAmount.type = 'number'; wagerAmount.min = '0'; wagerAmount.max = '10000000'; wagerAmount.step = '1';
	wagerAmount.value = String(existing?.rules.wagerAmount || 0);
	const wagerField = rpgBattleField('Aposta por Player (₽)', wagerAmount);
	wagerField.classList.add('battle-wager-field', 'hidden');
	wagerField.append(createElement('small', '', 'Cada Player paga este valor ao iniciar. Empate, fuga ou falha devolvem a aposta.'));
	const rulesGrid = createElement('div', 'battle-rule-grid');
	rulesGrid.append(canFlee.wrapper, experience.wrapper, switching.wrapper, items.wrapper);
	rulesStep.body.append(rulesGrid, wagerField);
	form.append(rulesStep.step);

	let wildSelectors = [];
	let hordeCount = null;
	async function refreshMode() {
		if (opponent.value === 'npc' && (format.value === 'raid' || format.value === 'boss')) {
			format.value = 'singles';
		}
		const rules = rpgFormatRules(format.value);
		formatHelp.textContent = rules.description;
		const isRaid = format.value === 'raid';
		const isBoss = format.value === 'boss';
		if (isBoss || isRaid) opponent.value = 'wild';
		opponent.disabled = isBoss || isRaid;
		const isPlayer = opponent.value === 'player';
		const isNpc = opponent.value === 'npc';
		const isWild = opponent.value === 'wild' || opponent.value === 'horde';
		const wagerAllowed = isPlayer || isNpc;
		wagerField.classList.toggle('hidden', !wagerAllowed);
		wagerAmount.disabled = !wagerAllowed;
		if (!wagerAllowed) wagerAmount.value = '0';
		columns.classList.remove('hidden');
		npcPanel.classList.toggle('hidden', !isNpc);
		columns.querySelector('[data-participant-team="B"]').classList.toggle('hidden', !isPlayer);
		for (const [key, input] of playerInputs) {
			if (key.startsWith('A:') && isRaid) { input.checked = true; input.disabled = true; }
			else input.disabled = false;
			if (key.startsWith('B:') && !isPlayer) input.checked = false;
		}
		teamLimit.disabled = isRaid;
		if (isRaid) teamLimit.value = '6';
		wildArea.classList.toggle('hidden', !isWild);
		wildArea.replaceChildren();
		wildSelectors = [];
		hordeCount = null;
		if (!isWild) return;
		const catalog = await rpgLoadBattlePokemon();
		const oldControlled = existing?.participants.find(item => item.kind !== 'player');
		const total = opponent.value === 'horde' ? 1 : rules.wildSlots;
		if (opponent.value === 'horde') {
			const info = createElement('p', 'format-help', 'Quando um membro da horda desmaiar, o pr\u00f3ximo igual entrar\u00e1. Ativos simult\u00e2neos: ' + rules.activeB + '.');
			wildArea.append(info);
			hordeCount = createElement('input'); hordeCount.type = 'number'; hordeCount.min = '1'; hordeCount.max = '24'; hordeCount.value = String(oldControlled?.pokemon.length || 6);
			wildArea.append(rpgBattleField('Quantidade total da horda', hordeCount));
		}
		for (let index = 0; index < total; index++) {
			const previousChoice = oldControlled?.pokemon[index];
			const previous = previousChoice?.set;
			const wasGuaranteed = opponent.value === 'horde' ?
				oldControlled?.pokemon.some(choice => choice.shinyMode === 'guaranteed') :
				previousChoice?.shinyMode === 'guaranteed';
			const row = createElement('div', 'wild-pokemon-row');
			row.append(createElement('strong', '', opponent.value === 'horde' ? 'Pok\u00e9mon da horda' : 'Escolha o Pok\u00e9mon ' + (index + 1)));
			const picker = rpgSpeciesPicker(catalog, previous?.species?.toLowerCase().replace(/[^a-z0-9]+/g, '') || '', isBoss);
			const level = createElement('input'); level.type = 'number'; level.min = '1'; level.max = isBoss ? '999' : '100'; level.value = String(previous?.level || (isBoss ? 100 : 5));
			const guaranteedShiny = rpgBattleCheck('Shiny garantido', wasGuaranteed);
			const levelOptions = createElement('div', 'wild-level-options');
			levelOptions.append(rpgBattleField('N\u00edvel', level), guaranteedShiny.wrapper);
			row.append(picker.picker, levelOptions);
		wildSelectors.push({ species: picker.input, level, guaranteedShiny: guaranteedShiny.input });
			wildArea.append(row);
		}
	}
	format.addEventListener('change', () => void refreshMode());
	opponent.addEventListener('change', () => void refreshMode());

	const error = createElement('p', 'form-error hidden');
	const actions = createElement('div', 'battle-editor-actions');
	const cancel = button('Cancelar', 'button'); cancel.addEventListener('click', onClose);
	const save = button('Salvar rascunho', 'button'); save.type = 'submit'; save.dataset.invite = 'false';
	const invite = button('Salvar e enviar convites', 'button primary'); invite.type = 'submit'; invite.dataset.invite = 'true';
	actions.append(cancel, save, invite);
	form.append(error, actions);

	form.addEventListener('submit', async event => {
		event.preventDefault();
		error.classList.add('hidden');
		for (const item of actions.querySelectorAll('button')) item.disabled = true;
		try {
			if (opponent.value === 'npc') throw new Error('Cadastre um NPC antes de preparar esse tipo de batalha.');
			const participants = [];
			const isRaid = format.value === 'raid';
			for (const [key, input] of playerInputs) {
				const [teamId, characterId] = key.split(':');
				if (!input.checked || (teamId === 'B' && opponent.value !== 'player')) continue;
				const character = characters.find(item => item.id === characterId);
				participants.push({
					id: 'player-' + teamId.toLowerCase() + '-' + characterId, team: teamId, kind: 'player', characterId,
					displayName: character.characterName, selectionLimit: isRaid ? 6 : Number(teamLimit.value),
					pokemon: isRaid ? (character.team || []).slice(0, 6).flatMap((_, teamIndex) =>
						character.box?.party?.[teamIndex]?.metadata?.evTraining ? [] : [{ teamIndex }]
					) : [],
				});
			}
			if (!participants.some(item => item.team === 'A')) throw new Error('Escolha ao menos um Player para a Equipe A.');
			if (opponent.value === 'player' && !participants.some(item => item.team === 'B')) throw new Error('Escolha ao menos um Player para a Equipe B.');
			if (opponent.value === 'wild' || opponent.value === 'horde') {
				const selected = wildSelectors.map(item => ({
					species: item.species.value, level: Number(item.level.value),
					guaranteedShiny: item.guaranteedShiny.checked,
				}));
				if (selected.some(item => !item.species)) throw new Error('Escolha todos os Pok\u00e9mon selvagens.');
				const catalog = await rpgLoadBattlePokemon();
				if (format.value === 'boss' && selected.some(item => !catalog.find(entry => entry.id === item.species)?.bossEligible)) {
					throw new Error('Boss aceita somente lend\u00e1rios e pseudolend\u00e1rios eleg\u00edveis.');
				}
				const copies = opponent.value === 'horde' ? Number(hordeCount.value) : selected.length;
				if (!Number.isInteger(copies) || copies < 1 || copies > 24) throw new Error('A horda deve ter entre 1 e 24 Pok\u00e9mon.');
				const guaranteedHordeIndex = opponent.value === 'horde' && selected[0].guaranteedShiny ?
					Math.floor(Math.random() * copies) : -1;
				const pokemon = Array.from({ length: copies }, (_, index) => {
					const source = selected[opponent.value === 'horde' ? 0 : index];
					const entry = catalog.find(item => item.id === source.species);
					const maximum = format.value === 'boss' ? 999 : 100;
					if (!Number.isInteger(source.level) || source.level < 1 || source.level > maximum) throw new Error('N\u00edvel selvagem inv\u00e1lido.');
					let shinyMode = source.guaranteedShiny ? 'guaranteed' : format.value === 'boss' ? 'disabled' : 'random';
					if (opponent.value === 'horde' && guaranteedHordeIndex >= 0) {
						shinyMode = index === guaranteedHordeIndex ? 'guaranteed' : 'disabled';
					}
					return { set: rpgControlledPokemonSet(entry.name, source.level, index), shinyMode };
				});
				participants.push({
					id: 'wild-b', team: 'B', kind: opponent.value, displayName: format.value === 'boss' ? 'Boss selvagem' : opponent.value === 'horde' ? 'Horda selvagem' : 'Pok\u00e9mon selvagem',
					selectionLimit: pokemon.length, pokemon,
				});
			}
			const request = {
				name: name.value.trim(), format: format.value,
				opponentType: format.value === 'boss' ? 'wild' : opponent.value,
				participants,
				conditions: {
					weather: { id: weather.value, duration: weatherDuration.value, turns: 5 }, terrain: { id: terrain.value, duration: terrainDuration.value, turns: 5 },
					sceneId: scene.input.value, startingTurn: Number(startingTurn.value), timeOfDay: timeOfDay.value,
					initialHazards: {
						A: { spikes: Number(hazardsA.spikes.value), stealthRock: hazardsA.stealthRock.checked, toxicSpikes: Number(hazardsA.toxicSpikes.value) },
						B: { spikes: Number(hazardsB.spikes.value), stealthRock: hazardsB.stealthRock.checked, toxicSpikes: Number(hazardsB.toxicSpikes.value) },
					},
				},
				rules: {
					canFlee: canFlee.input.checked, grantsExperience: experience.input.checked,
					allowSwitching: switching.input.checked, allowItems: items.input.checked,
					playersChoosePokemon: true, wagerAmount: Number(wagerAmount.value || 0),
				},
			};
			let sessionId = existing?.id;
			if (!sessionId) {
				const created = await api('/battle-sessions', { method: 'POST', body: { name: request.name } });
				sessionId = created.battleSession.id;
			}
			await api('/battle-sessions/' + encodeURIComponent(sessionId), { method: 'PATCH', body: request });
			if (event.submitter.dataset.invite === 'true') await api('/battle-sessions/' + encodeURIComponent(sessionId) + '/invite', { method: 'POST' });
			showToast(event.submitter.dataset.invite === 'true' ? 'Convites enviados.' : 'Rascunho salvo.');
			await renderDashboard();
		} catch (submitError) {
			error.textContent = submitError.message; error.classList.remove('hidden');
			error.scrollIntoView({ behavior: 'smooth', block: 'center' });
		} finally {
			for (const item of actions.querySelectorAll('button')) item.disabled = false;
		}
	});

	void refreshMode();
	return form;
}

function rpgTrainingDuration(milliseconds) {
	const minutes = Math.max(0, Math.ceil(Number(milliseconds || 0) / 60000));
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	if (hours && remainder) return hours + 'h' + String(remainder).padStart(2, '0');
	if (hours) return hours + 'h';
	return remainder + 'min';
}

function rpgPlayerPokemonSelection(session, character) {
	const participant = session.participants.find(item => item.characterId === character.id);
	if (!participant || session.status !== 'inviting' || session.format === 'raid') return null;
	const invitation = session.invitations.find(item => item.characterId === character.id);
	if (invitation?.response !== 'pending') return null;
	const panel = createElement('div', 'player-battle-selection');
	panel.append(createElement('strong', '', 'Escolha quais Pok\u00e9mon levar (m\u00e1ximo: ' + participant.selectionLimit + ')'));
	const selected = new Set(participant.pokemon.map(choice => choice.teamIndex));
	const grid = createElement('div', 'pokemon-choice-grid');
	for (const [index, pokemon] of (character.team || []).entries()) {
		const training = character.box?.party?.[index]?.metadata?.evTraining;
		if (training) selected.delete(index);
		const choice = rpgBattleCheck('', !training && selected.has(index));
		choice.wrapper.classList.add('pokemon-choice');
		if (training) choice.wrapper.classList.add('is-training');
		choice.input.disabled = !!training;
		choice.wrapper.append(pokemonSprite(pokemon));
		const info = createElement('span');
		info.append(createElement('strong', '', pokemon.name || pokemon.species), createElement('small', '', (pokemon.species || '') + ' \u00b7 Nv. ' + (pokemon.level || 1)));
		if (training) info.append(createElement('small', 'training-time', 'Em treinamento \u00b7 Restam ' + rpgTrainingDuration(training.remainingMs)));
		choice.wrapper.append(info);
		choice.input.addEventListener('change', () => { if (choice.input.checked) selected.add(index); else selected.delete(index); });
		grid.append(choice.wrapper);
	}
	const save = button('Salvar sele\u00e7\u00e3o', 'button');
	save.addEventListener('click', async () => {
		if (!selected.size || selected.size > participant.selectionLimit) return showToast('Escolha entre 1 e ' + participant.selectionLimit + ' Pok\u00e9mon.', true);
		save.disabled = true;
		try {
			await api('/battle-sessions/' + encodeURIComponent(session.id) + '/selection', { method: 'POST', body: { pokemon: [...selected].map(teamIndex => ({ teamIndex })) } });
			showToast('Sele\u00e7\u00e3o salva. Agora aceite o convite.');
			await renderDashboard();
		} catch (error) { showToast(error.message, true); } finally { save.disabled = false; }
	});
	panel.getPokemonSelection = () => {
		if (!selected.size || selected.size > participant.selectionLimit) throw new Error('Escolha entre 1 e ' + participant.selectionLimit + ' Pokémon.');
		return [...selected].map(teamIndex => ({teamIndex}));
	};

	panel.append(grid, save);
	return panel;
}

async function renderMasterBattles(characters) {
	const root = createElement('div');
	const toolbar = createElement('div', 'panel battle-toolbar');
	const text = createElement('div');
	text.append(createElement('strong', '', 'Prepara\u00e7\u00e3o de batalhas'), createElement('small', '', 'Monte o cen\u00e1rio e envie convites aos participantes.'));
	const create = button('\uFF0B Nova batalha', 'button primary');
	toolbar.append(text, create); root.append(toolbar);
	const editorHost = createElement('div'); root.append(editorHost);
	const openEditor = session => {
		editorHost.replaceChildren(rpgBattleEditor(characters, session, () => editorHost.replaceChildren()));
		editorHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};
	create.addEventListener('click', () => openEditor());
	const data = await api('/battle-sessions'); state.battleSessions = data.battleSessions;
	const activeSessions = state.battleSessions.filter(item => item.status === 'started');
	for (const session of activeSessions) root.append(await rpgBattleRoom(session, null, characters, true));
	const list = createElement('div', 'battle-session-list');
	for (const session of state.battleSessions.filter(item => !['cancelled', 'started', 'ended'].includes(item.status))) {
		const card = rpgBattleCard(session, characters);
		const actions = createElement('div', 'battle-session-actions');
		if (session.status === 'draft' || session.status === 'declined') {
			const edit = button('Editar prepara\u00e7\u00e3o', 'button'); edit.addEventListener('click', () => openEditor(session)); actions.append(edit);
		}
		if (session.status === 'ready') {
			const launch = button('Iniciar batalha', 'button primary');
			launch.addEventListener('click', async () => {
				launch.disabled = true;
				try {
					await api('/battle-sessions/' + encodeURIComponent(session.id) + '/start', { method: 'POST' });
					showToast('Campo de batalha RPG aberto.');
					await renderDashboard();
				} catch (error) { showToast(error.message, true); } finally { launch.disabled = false; }
			});
			actions.append(launch);
		}
		if (!['started', 'ended', 'cancelled'].includes(session.status)) {
			const cancel = button('Cancelar batalha', 'button danger');
			cancel.addEventListener('click', async () => {
				cancel.disabled = true;
				try { await api('/battle-sessions/' + encodeURIComponent(session.id), { method: 'DELETE' }); await renderDashboard(); }
				catch (error) { showToast(error.message, true); }
			});
			actions.append(cancel);
		}
		card.append(actions); list.append(card);
	}
	if (!list.children.length && !activeSessions.length) list.append(createElement('div', 'panel empty-state', 'Nenhuma batalha em prepara\u00e7\u00e3o.'));
	root.append(list);
	return root;
}
