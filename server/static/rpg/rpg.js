'use strict';

/* global document, window, localStorage, RPGAssets, rpgRuntimeSprite, RPG_BATTLE_SCENES, rpgLoadBattleScenes, rpgBattleSceneUrl */
/* eslint-disable require-atomic-updates */

const STORAGE_KEY = 'rpg-showdown-session-v1';
const STARTER_SPECIES = [
	'Bulbasaur', 'Charmander', 'Squirtle',
	'Chikorita', 'Cyndaquil', 'Totodile',
	'Treecko', 'Torchic', 'Mudkip',
	'Turtwig', 'Chimchar', 'Piplup',
	'Snivy', 'Tepig', 'Oshawott',
	'Chespin', 'Fennekin', 'Froakie',
	'Rowlet', 'Litten', 'Popplio',
	'Grookey', 'Scorbunny', 'Sobble',
	'Sprigatito', 'Fuecoco', 'Quaxly',
];

const DEFAULT_AVATARS = [
	{ id: 'lucas', name: 'Lucas' },
	{ id: 'dawn', name: 'Dawn' },
	{ id: 'hilbert', name: 'Hilbert' },
	{ id: 'hilda', name: 'Hilda' },
	{ id: 'nate', name: 'Nate' },
	{ id: 'rosa', name: 'Rosa' },
];
let AVATARS = [...DEFAULT_AVATARS];
const screens = [...document.querySelectorAll('.screen')];
let DEFAULT_AVATAR_ID = 'lucas';
const state = {
	session: null,
	characters: [],
	currentCharacter: null,
	deletionChallenge: null,
	battleSessions: [],
	campaignCharacters: [],
	dashboardView: 'overview',
	teamBuilderPokemonId: null,
	teamBuilderReturnView: 'box',
	dismissedBattleSessionIds: new Set(),
	expandedShopAccessIds: new Set(),
	expandedMasterPlayerIds: new Set(),
};
let battleSessionSyncBusy = false;
let battleSessionSyncTimer = null;
let masterPresenceSyncTimer = null;
let playerPresenceHeartbeatTimer = null;

const $ = selector => document.querySelector(selector);

function show(screen) {
	for (const element of screens) element.classList.toggle('hidden', element.id !== screen + '-screen');
	window.scrollTo({ top: 0, behavior: 'instant' });
}

function setHidden(element, hidden) {
	element.classList.toggle('hidden', hidden);
}

function setError(id, message) {
	const element = $('#' + id);
	element.textContent = message || '';
	setHidden(element, !message);
}
function friendlyError(message) {
	const translations = {
		'Invalid RPG master code': 'C\u00f3digo do Mestre inv\u00e1lido.',
		'Invalid RPG character or password': 'Personagem ou senha RPG inv\u00e1lidos.',
		'Invalid or expired RPG session': 'A sess\u00e3o RPG expirou.',
		'RPG session token required': 'Entre novamente para continuar.',
		'RPG character already exists': 'J\u00e1 existe um personagem com esse nome.',
		'Invalid RPG starter species': 'Escolha um Pok\u00e9mon inicial v\u00e1lido.',
		'Invalid RPG starter gender': 'Escolha um g\u00eanero v\u00e1lido para o Pok\u00e9mon.',
		'Invalid or expired RPG deletion challenge': 'A confirma\u00e7\u00e3o expirou. Clique em excluir novamente.',
		'Incorrect RPG deletion confirmation': 'A palavra digitada n\u00e3o corresponde \u00e0 confirma\u00e7\u00e3o.',
		'RPG deletion challenge does not match this session': 'Esta confirma\u00e7\u00e3o n\u00e3o pertence \u00e0 sess\u00e3o atual.',
		'RPG master must be viewing a player to delete the character': 'O Mestre precisa estar visualizando o Player.',
	};
	if (!message) return '';
	if (translations[message]) return translations[message];
	if (message.startsWith('RPG password must contain')) {
		return 'A senha RPG deve ter entre 4 e 128 caracteres.';
	}
	if (message.startsWith('RPG initial money must be')) {
		return 'A quantidade inicial de Pok\u00e9coins deve ser um n\u00famero inteiro entre 0 e 10.000.000 \u20bd.';
	}
	return message;
}

function showToast(message, error = false) {
	const toast = $('#toast');
	toast.textContent = message;
	toast.classList.toggle('error', error);
	toast.classList.remove('hidden');
	clearTimeout(showToast.timeout);
	showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

async function api(path, options = {}) {
	const headers = { ...(options.headers || {}) };
	if (options.body !== undefined) headers['Content-Type'] = 'application/json';
	if (state.session?.token) headers.Authorization = 'Bearer ' + state.session.token;
	const response = await fetch('/api/rpg' + path, {
		...options,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	let data = {};
	try {
		data = await response.json();
	} catch {}
	if (!response.ok) {
		throw new Error(
			friendlyError(data.error) || 'N\u00e3o foi poss\u00edvel comunicar com o servidor RPG.'
		);
	}
	return data;
}

function saveSession(session) {
	const identityChanged = state.session?.token !== session?.token;
	state.session = session;
	if (identityChanged) {
		state.battleSessions = [];
		state.dismissedBattleSessionIds.clear();
		masterNPCLibraryLoadedFromServer = false;
	}
	if (session) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
	} else {
		localStorage.removeItem(STORAGE_KEY);
	}
	updateSessionChip();
}

function updateSessionChip() {
	const chip = $('#session-chip');
	if (!state.session) {
		chip.classList.add('hidden');
		chip.textContent = '';
		return;
	}
	chip.classList.remove('hidden');
	chip.textContent = state.session.mode === 'master' ? 'Sess\u00e3o: Mestre' :
		state.session.role === 'master' ? 'Mestre vendo como Player' : 'Sess\u00e3o: Player';
}

function battleSessionSignature(sessions) {
	return JSON.stringify((sessions || []).map(session => [
		session.id, session.status, session.updatedAt,
		(session.invitations || []).map(invitation => [
			invitation.characterId, invitation.response, invitation.respondedAt || 0,
		]),
	]));
}

async function synchronizeBattleSessions() {
	const dashboard = $('#dashboard-screen');
	if (battleSessionSyncBusy || !state.session || !dashboard || dashboard.classList.contains('hidden') ||
		dashboard.classList.contains('battle-mode') || document.hidden ||
		dashboard.querySelector('.battle-editor') || document.querySelector('.modal-backdrop:not(.hidden)') ||
		document.querySelector('.bag-ui-window-layer')) return;
	battleSessionSyncBusy = true;
	try {
		const previousSignature = battleSessionSignature(state.battleSessions);
		const data = await api('/battle-sessions');
		const sessions = data.battleSessions || [];
		if (battleSessionSignature(sessions) === previousSignature) return;
		state.battleSessions = sessions;
		const activeIds = new Set(sessions.filter(session => session.status === 'started').map(session => session.id));
		for (const id of state.dismissedBattleSessionIds) {
			if (!activeIds.has(id)) state.dismissedBattleSessionIds.delete(id);
		}
		const isMasterMode = state.session.role === 'master' && state.session.mode === 'master';
		const characterId = state.currentCharacter?.id || state.session.characterId || state.session.viewAsCharacterId;
		const requiresBattleScreen = sessions.some(session => {
			if (session.status === 'started') return !state.dismissedBattleSessionIds.has(session.id);
			if (isMasterMode) return session.status === 'ready';
			return state.session.role === 'player' && session.status === 'inviting' && session.invitations?.some(invitation =>
				invitation.characterId === characterId && invitation.response === 'pending'
			);
		});
		if (state.dashboardView === 'battles' || requiresBattleScreen) {
			state.dashboardView = 'battles';
			await renderDashboard();
		}
	} catch (error) {
		if (/sess[aã]o|session/i.test(error.message)) {
			saveSession(null);
			show('entry');
		}
	} finally {
		battleSessionSyncBusy = false;
	}
}

function startBattleSessionSynchronization() {
	if (battleSessionSyncTimer) return;
	battleSessionSyncTimer = window.setInterval(() => void synchronizeBattleSessions(), 1000);
	window.addEventListener('focus', () => void synchronizeBattleSessions());
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) void synchronizeBattleSessions();
	});
	if (!masterPresenceSyncTimer) {
		masterPresenceSyncTimer = window.setInterval(async () => {
			const value = document.querySelector('[data-master-online-players]');
			if (!value || document.hidden || state.session?.role !== 'master' || state.session.mode !== 'master') return;
			try {
				const data = await api('/campaign/settings', {cache: 'no-store'});
				value.textContent = String(data.settings?.onlinePlayers || 0) + '/' + String(state.campaignCharacters.length);
				const list = document.querySelector('[data-master-online-list]');
				if (list) {
					const names = data.settings?.onlinePlayerNames || [];
					list.replaceChildren(...(names.length ? names.map(name => createElement('span', '', name)) : [createElement('small', '', 'Nenhum player online.') ]));
				}
				const areas = document.querySelector('[data-master-area-presence]');
				if (areas) renderMasterAreaPresence(areas, data.settings?.onlinePlayerAreas || []);
			} catch {}
		}, 5000);
	}
	if (!playerPresenceHeartbeatTimer) {
		const heartbeat = async () => {
			if (!state.session || state.session.role !== 'player' || document.hidden) return;
			try { await api('/presence', {method: 'POST', body: {area: state.dashboardView}}); } catch {}
		};
		playerPresenceHeartbeatTimer = window.setInterval(heartbeat, 4000);
		void heartbeat();
	}
}

function initials(value) {
	return String(value || 'R').trim().slice(0, 2).toUpperCase();
}

const rpgPokemonSpriteRegistry = new Map();

function rpgSpriteKey(value) {
	return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rpgRegisterPokemonSprites(catalog) {
	for (const pokemon of catalog || []) {
		const data = {spriteId: pokemon.spriteId, baseSpriteId: pokemon.baseSpriteId || pokemon.spriteId};
		for (const value of [pokemon.id, pokemon.name, pokemon.spriteId]) {
			const key = rpgSpriteKey(value);
			if (key) rpgPokemonSpriteRegistry.set(key, data);
		}
	}
}
window.rpgRegisterPokemonSprites = rpgRegisterPokemonSprites;

function rpgPokemonSpriteData(pokemonOrSpecies, shiny = false) {
	const pokemon = typeof pokemonOrSpecies === 'object' && pokemonOrSpecies ? pokemonOrSpecies : null;
	const species = pokemon ? pokemon.species || pokemon.name || 'Pokemon' : String(pokemonOrSpecies || 'Pokemon');
	const registered = rpgPokemonSpriteRegistry.get(rpgSpriteKey(species));
	const spriteId = String(pokemon?.spriteId || registered?.spriteId || rpgSpriteKey(species));
	const baseSpriteId = String(pokemon?.baseSpriteId || registered?.baseSpriteId || spriteId);
	const shinySprite = pokemon ? !!pokemon.shiny : !!shiny;
	return {species, spriteId, baseSpriteId, shiny: shinySprite};
}

function spriteUrl(pokemonOrSpecies, shiny = false) {
	const data = rpgPokemonSpriteData(pokemonOrSpecies, shiny);
	return RPGAssets.url('sprites/' + (data.shiny ? 'gen5-shiny/' : 'gen5/') + data.spriteId + '.png');
}

function spriteImage(pokemonOrSpecies, shiny = false) {
	const data = rpgPokemonSpriteData(pokemonOrSpecies, shiny);
	const image = createElement('img');
	const candidates = [];
	const add = path => { if (!candidates.includes(path)) candidates.push(path); };
	if (data.shiny) add(RPGAssets.url('sprites/gen5-shiny/' + data.spriteId + '.png'));
	add(RPGAssets.url('sprites/gen5/' + data.spriteId + '.png'));
	add(RPGAssets.url('sprites/ani/' + data.spriteId + '.gif'));
	if (data.baseSpriteId !== data.spriteId) {
		if (data.shiny) add(RPGAssets.url('sprites/gen5-shiny/' + data.baseSpriteId + '.png'));
		add(RPGAssets.url('sprites/gen5/' + data.baseSpriteId + '.png'));
		add(RPGAssets.url('sprites/ani/' + data.baseSpriteId + '.gif'));
	}
	let candidateIndex = 0;
	image.src = candidates[candidateIndex];
	image.alt = data.species + (data.shiny ? ' shiny' : '') + ' em pixel art';
	image.loading = 'lazy';
	image.addEventListener('error', event => {
		if (candidateIndex + 1 < candidates.length) {
			event.stopImmediatePropagation();
			image.src = candidates[++candidateIndex];
		}
	});
	return image;
}

function pokemonSprite(pokemon) {
	const species = pokemon.species || pokemon.name || 'Pokemon';
	const frame = createElement('div', 'pokemon-sprite');
	const image = spriteImage(pokemon);
	image.addEventListener('error', () => {
		image.remove();
		frame.textContent = initials(species);
		frame.classList.add('fallback');
	});
	frame.append(image);
	return frame;
}

function setStarterPickerOpen(open) {
	$('#starter-picker-options').classList.toggle('hidden', !open);
	$('#starter-picker-toggle').setAttribute('aria-expanded', String(open));
}

function selectStarter(species) {
	$('#starter-species').value = species;
	const selected = $('#starter-selected');
	const label = createElement('span');
	label.append(createElement('strong', '', species));
	label.append(createElement('small', '', 'Clique para ver os outros iniciais'));
	selected.replaceChildren(spriteImage(species), label);
	for (const option of document.querySelectorAll('.starter-option')) {
		const active = option.dataset.species === species;
		option.classList.toggle('selected', active);
		option.setAttribute('aria-selected', String(active));
	}
}

function renderStarterPicker() {
	const options = $('#starter-picker-options');
	options.replaceChildren();
	for (const species of STARTER_SPECIES) {
		const option = button('', 'starter-option');
		option.dataset.species = species;
		option.setAttribute('role', 'option');
		option.append(spriteImage(species), createElement('span', '', species));
		option.addEventListener('click', () => {
			selectStarter(species);
			setStarterPickerOpen(false);
		});
		options.append(option);
	}
	selectStarter('Squirtle');
}

function trainerImage(avatar) {
	const image = createElement('img');
	image.src = RPGAssets.url('sprites/trainers/' + avatar.id + '.png');
	image.alt = 'Avatar ' + avatar.name;
	image.loading = 'lazy';
	return image;
}

function fillCharacterAvatar(badge, character) {
	const avatarId = String(character.avatar || '');
	const avatar = AVATARS.find(option => option.id === avatarId) ||
		(/^[a-z0-9-]+$/.test(avatarId) ?
			{ id: avatarId, name: avatarId } : null);
	badge.classList.remove('has-sprite');
	if (!avatar) {
		badge.textContent = initials(character.characterName);
		return badge;
	}
	const image = trainerImage(avatar);
	image.addEventListener('error', () => {
		badge.classList.remove('has-sprite');
		badge.textContent = initials(character.characterName);
	});
	badge.replaceChildren(image);
	badge.classList.add('has-sprite');
	return badge;
}

function characterAvatarBadge(character) {
	return fillCharacterAvatar(createElement('div', 'avatar-badge'), character);
}

function renderMasterAreaPresence(container, players) {
	const areas = [
		['center', 'Centro Pokémon'], ['fossils', 'Paleontologia'], ['nursery', 'Berçário'],
		['shops', 'Lojas'], ['box', 'Box'],
	];
	container.replaceChildren();
	for (const [id, label] of areas) {
		const area = createElement('div', 'master-player-area');
		area.append(createElement('strong', '', label));
		const occupants = createElement('div', 'master-player-area-occupants');
		const present = players.filter(player => player.area === id);
		if (present.length) {
			for (const player of present) {
				const person = createElement('div', 'master-player-area-person');
				person.append(characterAvatarBadge({
					avatar: player.avatar, characterName: player.characterName || player.nick,
				}));
				person.append(createElement('span', '', player.nick));
				occupants.append(person);
			}
		}
		area.append(occupants);
		container.append(area);
	}
}

function renderMasterCampaignEvents(container, events) {
	container.replaceChildren();
	if (!events.length) {
		container.append(createElement('p', 'master-campaign-events-empty', 'Nenhum evento pendente.'));
		return;
	}
	const labels = {training: 'Treinamento', fossil: 'Paleontologia', breeding: 'Berçário', incubation: 'Incubação'};
	for (const event of [...events].reverse()) {
		const card = createElement('article', 'master-campaign-event event-' + event.type);
		const close = button('×', 'master-campaign-event-close');
		close.type = 'button'; close.setAttribute('aria-label', 'Remover evento');
		const heading = createElement('div', 'master-campaign-event-heading');
		heading.append(createElement('small', '', labels[event.type] || 'Evento'), createElement('strong', '', event.title));
		const date = new Date(event.occurredAt);
		const timestamp = Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', {
			day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
		}) : '';
		card.append(close, heading, createElement('p', '', event.description),
			createElement('span', 'master-campaign-event-owner', event.characterName),
			createElement('time', '', timestamp));
		close.addEventListener('click', async () => {
			close.disabled = true;
			try {
				await api('/campaign/events', {method: 'DELETE', body: {eventId: event.id}});
				const index = events.findIndex(entry => entry.id === event.id);
				if (index >= 0) events.splice(index, 1);
				renderMasterCampaignEvents(container, events);
			} catch (error) { close.disabled = false; showToast(error.message, true); }
		});
		container.append(card);
	}
}

function resetMasterAvatar() {
	const badge = $('#profile-avatar');
	badge.classList.remove('has-sprite');
	badge.textContent = 'M';
}

function setProfileAvatar(character) {
	fillCharacterAvatar($('#profile-avatar'), character);
}

function setAvatarPickerOpen(open) {
	$('#avatar-picker-options').classList.toggle('hidden', !open);
	if (open) {
		$('#avatar-search').focus();
	}
	$('#avatar-picker-toggle').setAttribute('aria-expanded', String(open));
}

function selectAvatar(avatarId) {
	const avatar = AVATARS.find(option => option.id === avatarId) ||
		AVATARS.find(option => option.id === DEFAULT_AVATAR_ID) || AVATARS[0];
	$('#avatar').value = avatar.id;
	const selected = $('#avatar-selected');
	const label = createElement('span');
	label.append(createElement('strong', '', avatar.name));
	label.append(createElement('small', '', 'Clique para ver os outros avatares'));
	selected.replaceChildren(trainerImage(avatar), label);
	for (const option of document.querySelectorAll('.avatar-option')) {
		const active = option.dataset.avatar === avatar.id;
		option.classList.toggle('selected', active);
		option.setAttribute('aria-selected', String(active));
	}
}

function avatarSearchText(value) {
	return String(value || '').normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function renderAvatarOptions() {
	const query = avatarSearchText($('#avatar-search').value);
	const matches = AVATARS.filter(avatar =>
		avatarSearchText(avatar.name).includes(query) || avatar.id.includes(query)
	);
	const results = $('#avatar-picker-results');
	results.replaceChildren();
	$('#avatar-result-count').textContent =
		matches.length + ' de ' + AVATARS.length + ' avatares sem vers\u00f5es repetidas';
	if (!matches.length) {
		results.append(createElement('div', 'empty-state', 'Nenhum avatar encontrado.'));
		return;
	}
	for (const avatar of matches) {
		const option = button('', 'avatar-option');
		option.dataset.avatar = avatar.id;
		option.setAttribute('role', 'option');
		option.append(trainerImage(avatar), createElement('span', '', avatar.name));
		option.addEventListener('click', () => {
			selectAvatar(avatar.id);
			setAvatarPickerOpen(false);
		});
		results.append(option);
	}
	selectAvatar($('#avatar').value);
}

function renderAvatarPicker() {
	$('#avatar-search').value = '';
	renderAvatarOptions();
	selectAvatar($('#avatar').value || DEFAULT_AVATAR_ID);
}

async function loadAvatarCatalog() {
	try {
		const response = await fetch('./avatars.json', { cache: 'no-cache' });
		if (!response.ok) throw new Error('RPG avatar catalog unavailable');
		const data = await response.json();
		if (!Array.isArray(data.avatars) || !data.avatars.length) {
			throw new Error('Invalid RPG avatar catalog');
		}
		AVATARS = data.avatars.map(avatar => ({
			id: String(avatar.id),
			name: String(avatar.name || avatar.id),
		}));
		DEFAULT_AVATAR_ID = String(data.defaultAvatarId || AVATARS[0].id);
		renderAvatarPicker();
	} catch {}
}

function createElement(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function removeNativeTitleTooltip(element) {
	if (!(element instanceof Element) || !element.hasAttribute('title')) return;
	const label = element.getAttribute('title') || '';
	if (label && !element.hasAttribute('aria-label') &&
		element.matches('button, a, input, select, textarea, img, [role]')) {
		element.setAttribute('aria-label', label);
	}
	element.removeAttribute('title');
}

function suppressNativeTitleTooltips(root = document) {
	if (root instanceof Element) removeNativeTitleTooltip(root);
	root.querySelectorAll?.('[title]').forEach(removeNativeTitleTooltip);
}

suppressNativeTitleTooltips();
new MutationObserver(mutations => {
	for (const mutation of mutations) {
		if (mutation.type === 'attributes') removeNativeTitleTooltip(mutation.target);
		for (const node of mutation.addedNodes || []) suppressNativeTitleTooltips(node);
	}
}).observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['title']});

function button(text, className = 'button') {
	const element = createElement('button', className, text);
	element.type = 'button';
	return element;
}

async function restoreSession() {
	let saved = null;
	try {
		saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
	if (!saved?.token) {
		show('entry');
		return;
	}
	state.session = saved;
	try {
		const data = await api('/session');
		saveSession(data.session);
		await renderDashboard();
	} catch {
		saveSession(null);
		show('entry');
		showToast('Sua sess\u00e3o RPG expirou. Entre novamente.', true);
	}
}

async function loadCharacters() {
	show('player');
	const list = $('#character-list');
	list.replaceChildren(createElement('div', 'panel loading-block', 'Carregando personagens...'));
	try {
		const data = await api('/characters');
		state.characters = data.characters;
		renderCharacterList();
	} catch (error) {
		list.replaceChildren();
		$('#character-empty strong').textContent = 'N\u00e3o foi poss\u00edvel carregar os personagens.';
		$('#character-empty p').textContent = error.message;
		$('#character-empty').classList.remove('hidden');
	}
}

function renderCharacterList() {
	const query = $('#character-search').value.trim().toLowerCase();
	const characters = state.characters.filter(character =>
		character.characterName.toLowerCase().includes(query) ||
		character.playerName.toLowerCase().includes(query)
	);
	const list = $('#character-list');
	list.replaceChildren();
	setHidden($('#character-empty'), characters.length > 0);
	for (const character of characters) {
		const card = createElement('article', 'panel character-card');
		const main = createElement('div', 'character-main');
		main.append(characterAvatarBadge(character));
		const title = createElement('div', 'character-title');
		title.append(createElement('strong', '', character.characterName));
		title.append(createElement('small', '', 'Jogador: ' + character.playerName));
		main.append(title);
		const open = button('Entrar', 'button');
		main.append(open);

		const login = createElement('form', 'character-login hidden');
		const label = createElement('label', '', 'Senha RPG');
		const input = createElement('input');
		input.type = 'password';
		input.required = true;
		input.autocomplete = 'current-password';
		input.setAttribute('aria-label', 'Senha RPG de ' + character.characterName);
		const submit = button('Confirmar entrada', 'button primary full-button');
		submit.type = 'submit';
		const error = createElement('p', 'form-error hidden');
		login.append(label, input, error, submit);

		open.addEventListener('click', () => {
			const willOpen = login.classList.contains('hidden');
			for (const other of document.querySelectorAll('.character-login')) other.classList.add('hidden');
			login.classList.toggle('hidden', !willOpen);
			if (willOpen) input.focus();
		});
		login.addEventListener('submit', async event => {
			event.preventDefault();
			error.classList.add('hidden');
			submit.disabled = true;
			submit.textContent = 'Entrando...';
			try {
				const data = await api('/session/player', {
					method: 'POST',
					body: { characterId: character.id, password: input.value },
				});
				input.value = '';
				saveSession(data.session);
				await renderDashboard();
			} catch (loginError) {
				error.textContent = loginError.message;
				error.classList.remove('hidden');
			} finally {
				submit.disabled = false;
				submit.textContent = 'Confirmar entrada';
			}
		});
		card.append(main, login);
		list.append(card);
	}
}

function dashboardNav(isMaster) {
	const nav = $('#dashboard-nav');
	nav.replaceChildren();
	const masterViewingPlayer = state.session?.role === 'master' && !isMaster;
	const bagBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.bag === false;
	const boxBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.box === false;
	const centerBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.center === false;
	const fossilsBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.fossils === false;
	const nurseryBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.nursery === false;
	const shopsBlocked = !masterViewingPlayer && state.currentCharacter?.pageAccess?.shops === false;
	const entries = isMaster ? [
		['overview', 'Vis\u00e3o geral'], ['players', 'Jogadores'], ['shops', 'Lojas'], ['battles', 'Batalhas'], ['contests', 'Concursos'],
		['npcs', 'NPCs e selvagens'], ['tournaments', 'Torneios'], ['nursery', 'Berçário'],
	] : [
		['overview', 'Vis\u00e3o geral'], ['team', 'Equipe'],
		['documents', 'Documentos'],
		['team-builder', 'Team Builder'],
		['center', 'Centro Pokémon', centerBlocked],
		['fossils', 'Paleontologia', fossilsBlocked],
		['nursery', 'Berçário', nurseryBlocked],
		['shops', 'Lojas', shopsBlocked],
		['bag', 'Bag', bagBlocked],
		['box', 'Box', boxBlocked],
		['battles', 'Batalhas'],
		['contests', 'Concursos'],
	];
	const currentEntry = entries.find(([view]) => view === state.dashboardView);
	if ((!currentEntry && state.dashboardView !== 'team-builder') || currentEntry?.[2]) {
		state.dashboardView = 'overview';
	}
	for (const [view, label, blocked = false] of entries) {
		const item = button(label, 'nav-button' + (view === state.dashboardView ? ' active' : '') +
			(blocked ? ' locked' : ''));
		item.disabled = blocked;
		item.setAttribute('aria-disabled', String(blocked));
		item.addEventListener('click', () => {
			if (blocked) return;
			if (view === 'team-builder') state.teamBuilderReturnView = 'team';
			state.dashboardView = view;
			if (state.session?.role === 'player') void api('/presence', {method: 'POST', body: {area: view}}).catch(() => {});
			void renderDashboard();
		});
		nav.append(item);
	}
}

function formatMoney(value) {
	return new Intl.NumberFormat('pt-BR').format(value || 0) + ' \u20bd';
}

const PORTABLE_INCUBATOR_ICON = './assets/item-icons/portableincubator.png?v=20260821-3';

function portableIncubatorVisual(loaded = true, className = '') {
	const frame = createElement('span', 'portable-incubator-visual' + (className ? ' ' + className : ''));
	const incubator = document.createElement('img');
	incubator.className = 'portable-incubator-shell';
	incubator.src = PORTABLE_INCUBATOR_ICON;
	incubator.alt = loaded ? 'Incubadora Portátil com Egg' : 'Incubadora Portátil vazia';
	frame.append(incubator);
	if (loaded) {
		const egg = document.createElement('img');
		egg.className = 'portable-incubator-egg';
		egg.src = spriteUrl({species: 'Egg'});
		egg.alt = '';
		frame.append(egg);
	}
	return frame;
}

function eggVisual(egg, className = '') {
	if (egg?.portableIncubator) return portableIncubatorVisual(true, className);
	const image = document.createElement('img');
	image.className = 'plain-egg-visual' + (className ? ' ' + className : '');
	image.src = spriteUrl({species: 'Egg'});
	image.alt = 'Egg';
	return image;
}

window.rpgPortableIncubatorVisual = portableIncubatorVisual;

function teamEggs(character) {
	return Array.isArray(character.teamEggs) ? character.teamEggs : [];
}

function teamUsed(character) {
	return (character.team?.length || 0) + teamEggs(character).length;
}

function bagUsed(character) {
	return (character.inventory?.bag?.items?.length || 0) + teamEggs(character).length * 5;
}

function boxCapacity(character) {
	const box = character.box || {};
	if (Array.isArray(box.boxes)) return box.boxes.length * 10;
	if (Number.isFinite(box.capacity)) return box.capacity;
	const tiers = { small: 10, initial: 40, standard: 80, expanded: 160, national: 320 };
	return tiers[box.tier] || 0;
}

function renderStats(character) {
	const grid = createElement('div', 'stat-grid');
	const stats = [
		['Pokécoins', formatMoney(character.money)],
		['Equipe', teamUsed(character) + ' / 6'],
		['Bag', bagUsed(character) + ' / ' + (character.inventory?.bag?.maxSlots || 0)],
		['Box', boxCapacity(character) + ' espa\u00e7os'],
	];
	for (const [label, value] of stats) {
		const card = createElement('div', 'panel stat-card');
		card.append(createElement('small', '', label), createElement('strong', '', value));
		grid.append(card);
	}
	return grid;
}

function section(title) {
	const panel = createElement('section', 'panel section-panel');
	const heading = createElement('div', 'section-title');
	heading.append(createElement('h2', '', title));
	const body = createElement('div', 'section-body');
	panel.append(heading, body);
	return { panel, heading, body };
}

function formatCampaignDuration(milliseconds) {
	const minutes = Math.max(0, Math.ceil(Number(milliseconds || 0) / 60000));
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	if (hours && remainder) return hours + 'h' + String(remainder).padStart(2, '0');
	if (hours) return hours + 'h';
	return remainder + 'min';
}

function teamPresetOwnedEntries(character) {
	const box = character.box || {};
	return [
		...(box.team || box.party || []),
		...(box.boxes || []).flatMap(storage =>
			(storage.pokemon || storage.slots || []).filter(Boolean)),
	];
}

function teamPresetOwnedSpecies(character) {
	const counts = new Map();
	const entries = teamPresetOwnedEntries(character);
	for (const entry of entries) {
		const id = String(entry.species || entry.pokemon?.species || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
		if (!id) continue;
		counts.set(id, (counts.get(id) || 0) + 1);
	}
	return counts;
}

function teamPresetAvailability(character, species) {
	const owned = teamPresetOwnedSpecies(character);
	const used = new Map();
	const missing = [];
	for (const name of species) {
		const id = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
		const next = (used.get(id) || 0) + 1;
		used.set(id, next);
		if (next > (owned.get(id) || 0)) missing.push(name);
	}
	return missing;
}

async function renderTeamPresetPlanner(character, body) {
	const toolbar = createElement('div', 'team-preset-toolbar');
	const intro = createElement('p', '', 'Monte equipes planejadas mesmo antes de possuir todos os Pok\u00e9mon.');
	const create = button('Criar equipe', 'button primary');
	toolbar.append(intro, create);
	const editor = createElement('div', 'team-preset-editor hidden');
	const list = createElement('div', 'team-preset-list');
	body.append(toolbar, editor, list);
	let catalog = [];
	try {
		catalog = await rpgLoadBattlePokemon();
	} catch (error) {
		list.append(createElement('p', 'form-error', error.message));
		return;
	}

	const catalogById = new Map(catalog.map(pokemon => [
		String(pokemon.id || pokemon.name).toLowerCase().replace(/[^a-z0-9]+/g, ''), pokemon,
	]));
	const evolutionRoot = name => {
		let current = catalogById.get(String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''));
		const visited = new Set();
		while (current?.prevo) {
			const id = String(current.id || current.name).toLowerCase().replace(/[^a-z0-9]+/g, '');
			if (visited.has(id)) break;
			visited.add(id);
			current = catalogById.get(String(current.prevo).toLowerCase().replace(/[^a-z0-9]+/g, '')) || current;
		}
		return String(current?.id || current?.name || name).toLowerCase().replace(/[^a-z0-9]+/g, '');
	};
	const ownedPreEvolutions = (name, owned) => {
		const result = [];
		let current = catalogById.get(String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''));
		const visited = new Set();
		while (current?.prevo) {
			const prevoId = String(current.prevo).toLowerCase().replace(/[^a-z0-9]+/g, '');
			if (!prevoId || visited.has(prevoId)) break;
			visited.add(prevoId);
			const prevo = catalogById.get(prevoId);
			if ((owned.get(prevoId) || 0) > 0) result.push(prevo?.name || current.prevo);
			current = prevo;
		}
		return result;
	};
	const sprite = (name, extraClass = '', note = '') => {
		const frame = createElement('span', 'team-preset-sprite' + (extraClass ? ' ' + extraClass : ''));
		frame.append(pokemonSprite({species: name, name}));
		if (note) frame.append(createElement('small', 'team-preset-owned-prevo', note));
		return frame;
	};
	const closeEditor = () => editor.classList.add('hidden');
	function openEditor(preset = null) {
		const selected = [...(preset?.species || [])];
		const selectedPokemonIds = [...(preset?.pokemonIds || [])];
		let activeSlot = Math.min(selected.length, 5);
		editor.classList.remove('hidden');
		const name = createElement('input'); name.maxLength = 30; name.placeholder = 'Nome da equipe'; name.value = preset?.name || '';
		const slots = createElement('div', 'team-preset-editor-slots');
		const search = createElement('input', 'team-preset-search'); search.type = 'search'; search.placeholder = 'Buscar Pok\u00e9mon...';
		const results = createElement('div', 'team-preset-results');
		const error = createElement('p', 'form-error hidden');
		const actions = createElement('div', 'team-preset-editor-actions');
		const cancel = button('Cancelar', 'button');
		const save = button('Salvar equipe', 'button primary');
		actions.append(cancel, save);
		editor.replaceChildren(createElement('h3', '', preset ? 'Editar equipe' : 'Nova equipe'), name, slots, search, results, error, actions);
		function renderSlots() {
			slots.replaceChildren();
			for (let index = 0; index < 6; index++) {
				const value = selected[index];
				const slot = createElement('div', 'team-preset-editor-slot' + (activeSlot === index ? ' active' : '') + (value ? ' filled' : ''));
				const choose = button('', 'team-preset-slot-choice');
				if (value) choose.append(sprite(value), createElement('strong', '', value));
				else choose.append(createElement('span', 'team-preset-slot-number', String(index + 1)), createElement('small', '', 'Escolher'));
				choose.addEventListener('click', () => { activeSlot = index; renderSlots(); search.focus(); });
				slot.append(choose);
				if (value) {
					const clear = button('\u00d7', 'team-preset-slot-remove');
					clear.title = 'Remover ' + value;
					clear.addEventListener('click', () => { selected[index] = undefined; activeSlot = index; renderSlots(); });
					slot.append(clear);
				}
				slots.append(slot);
			}
		}
		function renderResults() {
			const query = search.value.trim().toLowerCase();
			const matches = catalog.filter(pokemon => !pokemon.legendary && (
				!query || pokemon.name.toLowerCase().includes(query)
			));
			results.replaceChildren();
			for (const pokemon of matches) {
				const choice = button('', 'team-preset-result');
				choice.append(sprite(pokemon.name), createElement('span', '', pokemon.name));
				choice.addEventListener('click', () => {
					selected[activeSlot] = pokemon.name;
					selectedPokemonIds[activeSlot] = null;
					activeSlot = Math.min(5, activeSlot + 1);
					renderSlots();
				});
				results.append(choice);
			}
		}
		cancel.addEventListener('click', closeEditor);
		save.addEventListener('click', async () => {
			const filled = selected.map((species, index) => ({species, pokemonId: selectedPokemonIds[index] || null}))
				.filter(slot => !!slot.species);
			const species = filled.map(slot => slot.species);
			if (!name.value.trim() || !species.length) {
				error.textContent = 'Informe o nome e escolha ao menos um Pok\u00e9mon.'; error.classList.remove('hidden'); return;
			}
			save.disabled = true;
			try {
				await api('/team-presets' + (preset ? '/' + encodeURIComponent(preset.id) : ''), {
					method: preset ? 'PATCH' : 'POST', body: {
						characterId: character.id, name: name.value.trim(), species,
						pokemonIds: filled.map(slot => slot.pokemonId),
					},
				});
				showToast('Equipe salva.'); await renderDashboard();
			} catch (saveError) {
				error.textContent = saveError.message; error.classList.remove('hidden'); save.disabled = false;
			}
		});
		search.addEventListener('input', renderResults);
		renderSlots(); renderResults(); name.focus();
	}
	function openLineagePicker(preset, slotIndex) {
		const plannedSpecies = preset.species[slotIndex];
		const root = evolutionRoot(plannedSpecies);
		const candidates = teamPresetOwnedEntries(character).filter(entry =>
			evolutionRoot(entry.species || entry.pokemon?.species || '') === root);
		const layer = createElement('div', 'team-preset-lineage-layer');
		const dialog = createElement('div', 'team-preset-lineage-dialog');
		const heading = createElement('div', 'team-preset-lineage-heading');
		heading.append(createElement('div', '', ''), createElement('h3', '', 'Escolher para ' + plannedSpecies));
		const close = button('\u00d7', 'team-preset-lineage-close');
		heading.append(close);
		const choices = createElement('div', 'team-preset-lineage-choices');
		const automatic = button('Usar automaticamente a esp\u00e9cie exata', 'team-preset-lineage-option automatic');
		choices.append(automatic);
		for (const entry of candidates) {
			const species = entry.species || entry.pokemon?.species || 'Pok\u00e9mon';
			const name = entry.name || entry.pokemon?.name || species;
			const pokemonId = entry.pokemonId;
			const nickname = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '') ===
				String(species).toLowerCase().replace(/[^a-z0-9]+/g, '') ? '' : name;
			const details = createElement('span', 'team-preset-lineage-details');
			const summary = createElement('span', 'team-preset-lineage-summary');
			summary.append(createElement('strong', '', species));
			if (nickname) summary.append(createElement('span', 'team-preset-lineage-nickname', nickname));
			summary.append(createElement('b', 'team-preset-lineage-level', 'Lvl: ' + (entry.level || entry.pokemon?.level || 1)));
			const moves = createElement('span', 'team-preset-lineage-moves');
			const moveEntries = entry.moves || entry.pokemon?.moves || [];
			for (let moveIndex = 0; moveIndex < 4; moveIndex++) {
				const move = moveEntries[moveIndex];
				moves.append(createElement('span', move ? '' : 'empty', move?.name || move || '\u2014'));
			}
			details.append(summary, moves);
			const option = button('', 'team-preset-lineage-option' +
				(preset.pokemonIds?.[slotIndex] === pokemonId ? ' selected' : ''));
			option.append(pokemonSprite({species, name}), details);
			option.addEventListener('click', () => saveLink(pokemonId));
			choices.append(option);
		}
		if (!candidates.length) choices.append(createElement('p', 'team-preset-empty',
			'Voc\u00ea ainda n\u00e3o possui nenhum Pok\u00e9mon desta linha evolutiva.'));
		dialog.append(heading, choices); layer.append(dialog); document.body.append(layer);
		const dismiss = () => layer.remove();
		async function saveLink(pokemonId) {
			const pokemonIds = Array.from({length: preset.species.length}, (_, index) => preset.pokemonIds?.[index] || null);
			pokemonIds[slotIndex] = pokemonId || null;
			try {
				await api('/team-presets/' + encodeURIComponent(preset.id), {method: 'PATCH', body: {
					characterId: character.id, name: preset.name, species: preset.species, pokemonIds,
				}});
				dismiss(); await renderDashboard();
			} catch (linkError) { showToast(linkError.message, true); }
		}
		automatic.addEventListener('click', () => saveLink(null));
		close.addEventListener('click', dismiss);
		layer.addEventListener('click', event => { if (event.target === layer) dismiss(); });
	}
	function renderList() {
		list.replaceChildren();
		const presets = character.teamPresets || [];
		if (!presets.length) {
			list.append(createElement('p', 'team-preset-empty', 'Nenhuma equipe salva.'));
			return;
		}
		for (const preset of presets) {
			const availableEntries = teamPresetOwnedEntries(character);
			const owned = teamPresetOwnedSpecies(character);
			const represented = new Map();
			const usedPokemonIds = new Set();
			const unavailableSlots = [];
			const boxAllowed = state.session.role === 'master' || character.pageAccess?.box !== false;
			const card = createElement('article', 'team-preset-card');
			const heading = createElement('div', 'team-preset-card-heading');
			heading.append(createElement('strong', '', preset.name));
			if (!boxAllowed) heading.append(createElement('small', '', 'Box indispon\u00edvel'));
			const pokemon = createElement('div', 'team-preset-card-pokemon');
			for (const [slotIndex, species] of preset.species.entries()) {
				const id = String(species).toLowerCase().replace(/[^a-z0-9]+/g, '');
				const amount = (represented.get(id) || 0) + 1;
				represented.set(id, amount);
				const linkedId = preset.pokemonIds?.[slotIndex] || '';
				const linked = linkedId ? availableEntries.find(entry => entry.pokemonId === linkedId && !usedPokemonIds.has(linkedId)) : null;
				const isOwned = linked ? evolutionRoot(linked.species || linked.pokemon?.species || '') === evolutionRoot(species) :
					amount <= (owned.get(id) || 0);
				if (linked && isOwned) usedPokemonIds.add(linkedId);
				if (!isOwned) unavailableSlots.push(slotIndex);
				const prevos = isOwned ? [] : ownedPreEvolutions(species, owned);
				const note = linkedId ? 'Vinculado' : (prevos.length ? 'Possui ' + prevos.join(', ') : '');
				const trigger = button('', 'team-preset-lineage-trigger');
				trigger.title = 'Escolher um Pok\u00e9mon desta linha evolutiva';
				trigger.append(sprite(species, isOwned ? 'owned' : 'unowned', note));
				trigger.addEventListener('click', () => openLineagePicker(preset, slotIndex));
				pokemon.append(trigger);
			}
			if (unavailableSlots.length || !boxAllowed) card.classList.add('unavailable');
			const controls = createElement('div', 'team-preset-card-actions');
			const use = button('Usar', 'button primary');
			const edit = button('Editar', 'button'); const remove = button('Excluir', 'button danger');
			use.disabled = !!unavailableSlots.length || !boxAllowed;
			controls.append(use, edit, remove); card.append(heading, pokemon, controls);
			card.setAttribute('aria-disabled', String(!!unavailableSlots.length || !boxAllowed));
			use.addEventListener('click', async () => {
				try {
					await api('/team-presets/' + encodeURIComponent(preset.id) + '/apply', {
						method: 'POST', body: {characterId: character.id, expectedRevision: character.box.revision},
					});
					showToast('Equipe trocada com sucesso.'); await renderDashboard();
				} catch (applyError) { showToast(applyError.message, true); }
			});
			edit.addEventListener('click', () => openEditor(preset));
			remove.addEventListener('click', async () => {
				try {
					await api('/team-presets/' + encodeURIComponent(preset.id), {method: 'DELETE', body: {characterId: character.id}});
					showToast('Equipe exclu\u00edda.'); await renderDashboard();
				} catch (removeError) { showToast(removeError.message, true); }
			});
			list.append(card);
		}
	}
	create.addEventListener('click', () => openEditor());
	renderList();
}

const RPG_BADGE_REGIONS = [
	['kanto', 'Kanto', ['Rocha', 'Cascata', 'Trovão', 'Arco-íris', 'Alma', 'Pântano', 'Vulcão', 'Terra']],
	['johto', 'Johto', ['Zéfiro', 'Colmeia', 'Planície', 'Névoa', 'Tempestade', 'Mineral', 'Geleira', 'Nascente']],
	['hoenn', 'Hoenn', ['Pedra', 'Punho', 'Dínamo', 'Calor', 'Equilíbrio', 'Pena', 'Mente', 'Chuva']],
	['sinnoh', 'Sinnoh', ['Carvão', 'Floresta', 'Paralelepípedo', 'Pântano', 'Relíquia', 'Mina', 'Sincelo', 'Farol']],
	['unova', 'Unova', ['Trio', 'Básica', 'Inseto', 'Raio', 'Terremoto', 'Jato', 'Congelamento', 'Lenda']],
	['kalos', 'Kalos', ['Inseto', 'Penhasco', 'Briga', 'Planta', 'Voltagem', 'Fada', 'Psíquica', 'Iceberg']],
	['galar', 'Galar', ['Planta', 'Água', 'Fogo', 'Luta', 'Fada', 'Pedra', 'Noturna', 'Dragão']],
	['paldea', 'Paldea', ['Inseto', 'Planta', 'Elétrica', 'Água', 'Normal', 'Fantasma', 'Psíquica', 'Gelo']],
];
const RPG_BADGE_SHEET_ROW_POSITIONS = [
	'0%',
	'14.285714%',
	'28.571429%',
	'42.857143%',
	'57.142857%',
	'71.428571%',
	'85.714286%',
	'100%',
];

function profileMetric(label, value) {
	const metric = createElement('div', 'overview-metric');
	metric.append(createElement('small', '', label), createElement('strong', '', String(value)));
	return metric;
}

function formatOverviewMoney(value) {
	const amount = Number(value || 0);
	const formatter = Math.abs(amount) >= 1000 ? new Intl.NumberFormat('pt-BR', {
		notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1,
	}) : new Intl.NumberFormat('pt-BR');
	return '\u20bd ' + formatter.format(amount);
}

function editableTrainerTagline(character) {
	const quote = createElement('blockquote', 'overview-tagline');
	const text = createElement('span', '', character.profile?.tagline || 'A aventura está apenas começando.');
	quote.append(text);
	quote.tabIndex = 0;
	quote.setAttribute('role', 'button');
	quote.setAttribute('aria-label', 'Editar frase do treinador');
	let editing = false;
	let cancelling = false;
	let original = text.textContent;
	const finish = () => {
		editing = false;
		text.contentEditable = 'false';
		quote.classList.remove('editing');
	};
	const begin = () => {
		if (editing) return;
		editing = true;
		cancelling = false;
		original = text.textContent;
		text.contentEditable = 'true';
		quote.classList.add('editing');
		text.focus();
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(text);
		selection.removeAllRanges(); selection.addRange(range);
	};
	quote.addEventListener('click', begin);
	quote.addEventListener('keydown', event => {
		if (!editing && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); begin(); return; }
		if (!editing) return;
		if (event.key === 'Enter') { event.preventDefault(); text.blur(); }
		if (event.key === 'Escape') {
			event.preventDefault(); cancelling = true; text.textContent = original; text.blur();
		}
	});
	text.addEventListener('input', () => {
		if ((text.textContent || '').length > 120) text.textContent = (text.textContent || '').slice(0, 120);
	});
	text.addEventListener('blur', async () => {
		if (!editing) return;
		const next = (text.textContent || '').trim();
		if (cancelling || next === original) { text.textContent = original; finish(); return; }
		if (!next) { text.textContent = original; finish(); showToast('A frase não pode ficar vazia.', true); return; }
		finish();
		try {
			const data = await api('/profile/tagline', {method: 'PATCH', body: {characterId: character.id, tagline: next}});
			state.currentCharacter = data.character;
			text.textContent = data.character.profile.tagline;
		} catch (error) {
			text.textContent = original;
			showToast(error.message, true);
		}
	});
	return quote;
}

const RPG_POKEDEX_REGIONS = [
	{name: 'Kanto', minimum: 1, maximum: 151}, {name: 'Johto', minimum: 152, maximum: 251},
	{name: 'Hoenn', minimum: 252, maximum: 386}, {name: 'Sinnoh', minimum: 387, maximum: 493},
	{name: 'Unova', minimum: 494, maximum: 649}, {name: 'Kalos', minimum: 650, maximum: 721},
	{name: 'Alola', minimum: 722, maximum: 809, regionalForm: 'Alola'},
	{name: 'Galar', minimum: 810, maximum: 898, regionalForm: 'Galar'},
	{name: 'Hisui', minimum: 899, maximum: 905, regionalForm: 'Hisui'},
	{name: 'Paldea', minimum: 906, maximum: Infinity, regionalForm: 'Paldea'},
];

function rpgPokedexEntries(catalog) {
	const available = (catalog || []).filter(pokemon =>
		Number(pokemon.num || 0) > 0 && !/-Totem(?:-|$)/i.test(String(pokemon.name || '')));
	const isRegionalForm = pokemon => RPG_POKEDEX_REGIONS.some(region => region.regionalForm &&
		new RegExp(`-${region.regionalForm}(?:-|$)`, 'i').test(String(pokemon.name || '')));
	const entries = [];
	for (const region of RPG_POKEDEX_REGIONS) {
		const nativeByNumber = new Map();
		for (const pokemon of [...available].sort((a, b) => Number(a.num) - Number(b.num) || a.name.localeCompare(b.name))) {
			const number = Number(pokemon.num);
			if (number < region.minimum || number > region.maximum || isRegionalForm(pokemon)) continue;
			if (!nativeByNumber.has(number)) nativeByNumber.set(number, pokemon);
		}
		for (const pokemon of nativeByNumber.values()) entries.push({...pokemon, dexRegion: region.name});
		if (region.regionalForm) {
			const pattern = new RegExp(`-${region.regionalForm}(?:-|$)`, 'i');
			const regional = available.filter(pokemon => pattern.test(String(pokemon.name || '')))
				.sort((a, b) => Number(a.num) - Number(b.num) || a.name.localeCompare(b.name));
			for (const pokemon of regional) entries.push({...pokemon, dexRegion: region.name});
		}
	}
	return entries.map((pokemon, index) => ({...pokemon, dexNumber: index + 1}));
}

function openPokedexSummary(character, catalog) {
	const profile = character.profile || {};
	const seen = new Set(profile.pokedex?.seen || []);
	const caught = new Set(profile.pokedex?.caught || []);
	const layer = createElement('div', 'overview-pokedex-layer');
	const dialog = createElement('section', 'overview-pokedex-dialog');
	dialog.setAttribute('role', 'dialog');
	dialog.setAttribute('aria-label', 'Pokédex');
	const deviceHitbox = createElement('div', 'overview-pokedex-device-hitbox');
	const close = button('', 'overview-pokedex-power-close');
	close.setAttribute('aria-label', 'Fechar Pokédex');
	const discover = button('', 'overview-pokedex-discover hidden');
	discover.setAttribute('aria-label', 'Marcar Pokémon como visto');
	const movesToggle = button('', 'overview-pokedex-moves-toggle hidden');
	movesToggle.setAttribute('aria-label', 'Mostrar possíveis moves');
	const dpad = createElement('div', 'overview-pokedex-dpad');
	const dpadImage = createElement('div', 'overview-pokedex-dpad-image');
	let deviceImageAnimationTimer = null;
	const animateDeviceImage = control => {
		clearTimeout(deviceImageAnimationTimer);
		dpadImage.className = 'overview-pokedex-dpad-image';
		void dpadImage.offsetWidth;
		dpadImage.classList.add(`press-${control}`);
		deviceImageAnimationTimer = setTimeout(() => { dpadImage.className = 'overview-pokedex-dpad-image'; }, 190);
	};
	const dpadDirections = [
		['up', 'Pokémon quatro números antes'], ['right', 'Próximo Pokémon'],
		['down', 'Pokémon quatro números depois'], ['left', 'Pokémon anterior'],
	];
	for (const [direction, label] of dpadDirections) {
		const control = button('', `overview-pokedex-dpad-${direction}`);
		control.dataset.direction = direction;
		control.setAttribute('aria-label', label);
		dpad.append(control);
	}
	const leftScreen = createElement('div', 'overview-pokedex-left-screen');
	const rightScreen = createElement('div', 'overview-pokedex-right-screen');
	const regions = createElement('header', 'overview-pokedex-regions');
	const grid = createElement('div', 'overview-pokedex-grid');
	const national = rpgPokedexEntries(catalog);
	const nationalById = new Map(national.map(pokemon => [String(pokemon.id || '').toLowerCase(), pokemon]));
	const masterViewingPlayer = state.session?.role === 'master' && state.session?.mode === 'player' &&
		String(state.session.viewAsCharacterId || '') === String(character.id || '');
	let selectedPokemon = null;
	let rightScreenMode = 'details';
	const movesCache = new Map();
	const evolutionChildren = new Map();
	for (const pokemon of national) {
		const parent = String(pokemon.prevo || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
		if (!parent) continue;
		if (!evolutionChildren.has(parent)) evolutionChildren.set(parent, []);
		evolutionChildren.get(parent).push(pokemon);
	}
	const evolutionaryLine = pokemon => {
		let root = pokemon;
		const visitedParents = new Set();
		while (root?.prevo) {
			const parentId = String(root.prevo).toLowerCase().replace(/[^a-z0-9]+/g, '');
			if (!parentId || visitedParents.has(parentId)) break;
			visitedParents.add(parentId);
			root = nationalById.get(parentId) || root;
			if (String(root.id || '').toLowerCase() !== parentId) break;
		}
		const result = [];
		const visit = entry => {
			if (!entry || result.includes(entry)) return;
			result.push(entry);
			for (const child of (evolutionChildren.get(String(entry.id || '').toLowerCase()) || []).sort((a, b) => a.num - b.num)) visit(child);
		};
		visit(root);
		return result;
	};
	const regionNames = ['Todas', ...RPG_POKEDEX_REGIONS.map(region => region.name)];
	let activeRegion = 'Todas';
	const renderDetails = pokemon => {
		selectedPokemon = pokemon;
		rightScreenMode = 'details';
		movesToggle.classList.remove('active');
		rightScreen.replaceChildren();
		const id = String(pokemon.id || '').toLowerCase();
		const known = seen.has(id) || caught.has(id);
		discover.classList.toggle('hidden', !masterViewingPlayer || known);
		movesToggle.classList.toggle('hidden', !known);
		if (!known) {
			rightScreen.append(createElement('p', 'overview-pokedex-detail-empty', 'Pokémon ainda não registrado.'));
			return;
		}
		const heading = createElement('header', 'overview-pokedex-detail-heading');
		const title = createElement('div', 'overview-pokedex-detail-title');
		title.append(createElement('strong', '', pokemon.name));
		const types = createElement('div', 'overview-pokedex-detail-types');
		for (const type of pokemon.types || []) types.append(createElement('span', 'type-' + String(type).toLowerCase(), type));
		title.append(types);
		heading.append(title, createElement('small', '', '#' + String(pokemon.dexNumber).padStart(4, '0')));
		const special = pokemon.mythical ? 'Mítico' : (pokemon.pseudoLegendary ? 'Pseudo-lendário' : (pokemon.legendary ? 'Lendário' : ''));
		const content = createElement('div', 'overview-pokedex-detail-content');
		const identity = createElement('div', 'overview-pokedex-detail-identity');
		const visual = pokemonSprite({species: pokemon.name, spriteId: pokemon.spriteId, baseSpriteId: pokemon.baseSpriteId});
		identity.append(visual);
		const stats = createElement('dl', 'overview-pokedex-detail-stats');
		for (const [label, key] of [['HP', 'hp'], ['Ataque', 'atk'], ['Defesa', 'def'], ['At. Esp.', 'spa'], ['Def. Esp.', 'spd'], ['Velocidade', 'spe']]) {
			stats.append(createElement('dt', '', label), createElement('dd', '', String(pokemon.baseStats?.[key] ?? '—')));
		}
		content.append(identity, stats);
		const abilities = createElement('div', 'overview-pokedex-detail-abilities');
		abilities.append(createElement('strong', '', 'Habilidades'));
		const abilityList = createElement('div', 'overview-pokedex-detail-ability-list');
		for (const ability of pokemon.abilityDetails || (pokemon.abilities || []).map(name => ({name}))) {
			abilityList.append(createElement('span', ability.hidden ? 'hidden-ability' : '', ability.name));
		}
		abilities.append(abilityList);
		const extra = createElement('div', 'overview-pokedex-detail-extra');
		if (special) extra.append(createElement('span', 'overview-pokedex-detail-special', special));
		const line = evolutionaryLine(pokemon);
		if (line.length > 1) {
			const evolution = createElement('section', 'overview-pokedex-detail-evolution');
			evolution.append(createElement('strong', '', 'Linha evolutiva'));
			const evolutionList = createElement('div', 'overview-pokedex-detail-evolution-list');
			for (const member of line) {
				const memberId = String(member.id || '').toLowerCase();
				const known = seen.has(memberId) || caught.has(memberId);
				const entry = createElement('div', known ? '' : 'unseen');
				entry.append(pokemonSprite({species: member.name, spriteId: member.spriteId, baseSpriteId: member.baseSpriteId}), createElement('span', '', known ? member.name : '???'));
				evolutionList.append(entry);
			}
			evolution.append(evolutionList); extra.append(evolution);
		}
		const alternativeForms = catalog.filter(entry => {
			const entryId = String(entry.id || '').toLowerCase();
			if (entryId === id || (!seen.has(entryId) && !caught.has(entryId))) return false;
			return (pokemon.baseSpriteId && entry.baseSpriteId === pokemon.baseSpriteId) || Number(entry.num) === Number(pokemon.num);
		});
		if (alternativeForms.length) {
			const forms = createElement('section', 'overview-pokedex-detail-forms');
			forms.append(createElement('strong', '', 'Formas conhecidas'));
			const formList = createElement('div', 'overview-pokedex-detail-form-list');
			for (const form of alternativeForms) formList.append(createElement('span', '', form.name));
			forms.append(formList); extra.append(forms);
		}
		rightScreen.append(heading, content, abilities, extra);
	};
	const renderMoves = async pokemon => {
		const id = String(pokemon.id || '').toLowerCase();
		if (!seen.has(id) && !caught.has(id)) return;
		rightScreenMode = 'moves';
		movesToggle.classList.add('active');
		rightScreen.replaceChildren(createElement('p', 'overview-pokedex-detail-empty', 'Carregando moves...'));
		try {
			let data = movesCache.get(id);
			if (!data) {
				data = await api(`/profile/pokedex/moves?characterId=${encodeURIComponent(character.id)}&species=${encodeURIComponent(id)}`);
				movesCache.set(id, data);
			}
			if (selectedPokemon !== pokemon || rightScreenMode !== 'moves') return;
			rightScreen.replaceChildren();
			const heading = createElement('header', 'overview-pokedex-moves-heading');
			heading.append(createElement('strong', '', pokemon.name), createElement('small', '', data.caught ? 'Moves possíveis' : 'Moves por nível'));
			rightScreen.append(heading);
			const sections = [['level', 'Por nível'], ['tm', 'TM'], ['egg', 'Egg Move']];
			for (const [key, label] of sections) {
				if (key !== 'level' && !data.caught) continue;
				const section = createElement('section', 'overview-pokedex-move-section');
				section.append(createElement('h4', '', label));
				const list = createElement('div', 'overview-pokedex-move-list');
				for (const move of data.moves[key] || []) {
					const row = createElement('div', 'overview-pokedex-move-row');
					row.append(createElement('span', `type-${String(move.type).toLowerCase()}`, move.type),
						createElement('strong', '', move.name));
					if (key === 'level') row.append(createElement('small', '', `Nv. ${move.level}`));
					list.append(row);
				}
				if (!list.childElementCount) list.append(createElement('p', 'overview-pokedex-move-empty', 'Nenhum move.'));
				section.append(list); rightScreen.append(section);
			}
		} catch (error) {
			if (rightScreenMode === 'moves') rightScreen.replaceChildren(createElement('p', 'overview-pokedex-detail-empty', error.message));
		}
	};
	const renderEntries = (regionName = 'Todas') => {
		grid.replaceChildren();
		for (const pokemon of national) {
			if (regionName !== 'Todas' && pokemon.dexRegion !== regionName) continue;
			const number = Number(pokemon.dexNumber || 0);
			const id = String(pokemon.id || '').toLowerCase();
			const isSeen = seen.has(id) || caught.has(id);
			const isCaught = caught.has(id);
			const card = createElement('article', 'overview-pokedex-entry' + (isSeen ? ' seen' : ' unseen') +
				(isCaught ? ' caught' : '') + (masterViewingPlayer && !isSeen ? ' master-preview' : ''));
			card.dataset.pokemonId = id;
			card.tabIndex = 0;
			card.setAttribute('role', 'button');
			card.setAttribute('aria-label', isSeen ? `Ver dados de ${pokemon.name}` : 'Pokémon ainda não registrado');
			card.append(createElement('small', '', '#' + String(number).padStart(4, '0')));
			const visual = pokemonSprite({species: pokemon.name, spriteId: pokemon.spriteId, baseSpriteId: pokemon.baseSpriteId});
			card.append(visual, createElement('strong', '', isSeen ? pokemon.name : '???'));
			if (isCaught) card.append(createElement('span', 'overview-pokedex-caught', 'Capturado'));
			const select = () => {
				grid.querySelectorAll('.overview-pokedex-entry.selected').forEach(entry => entry.classList.remove('selected'));
				card.classList.add('selected');
				renderDetails(pokemon);
			};
			card.addEventListener('click', select);
			card.addEventListener('keydown', event => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault(); select();
			});
			grid.append(card);
		}
		leftScreen.scrollTop = 0;
	};
	const navigatePokedex = offset => {
		if (!selectedPokemon) return;
		const current = national.findIndex(entry => String(entry.id || '').toLowerCase() === String(selectedPokemon.id || '').toLowerCase());
		if (current < 0) return;
		const target = national[Math.max(0, Math.min(national.length - 1, current + offset))];
		if (!target || target === selectedPokemon) return;
		if (activeRegion !== 'Todas' && activeRegion !== target.dexRegion) {
			activeRegion = target.dexRegion;
			regions.querySelectorAll('.overview-pokedex-region').forEach(item =>
				item.classList.toggle('active', item.dataset.region === activeRegion));
			renderEntries(activeRegion);
		}
		grid.querySelectorAll('.overview-pokedex-entry.selected').forEach(entry => entry.classList.remove('selected'));
		const card = grid.querySelector(`[data-pokemon-id="${String(target.id || '').toLowerCase()}"]`);
		if (card) {
			card.classList.add('selected');
			card.scrollIntoView({block: 'nearest', behavior: 'smooth'});
		}
		renderDetails(target);
	};
	for (const name of regionNames) {
		const region = button(name, 'overview-pokedex-region' + (name === 'Todas' ? ' active' : ''));
		region.dataset.region = name;
		region.addEventListener('click', () => {
			activeRegion = name;
			regions.querySelectorAll('.overview-pokedex-region').forEach(item => item.classList.toggle('active', item === region));
			renderEntries(name);
		});
		regions.append(region);
	}
	leftScreen.append(regions, grid);
	rightScreen.append(createElement('p', 'overview-pokedex-detail-empty', 'Selecione um Pokémon.'));
	dialog.append(deviceHitbox, dpadImage, close, discover, movesToggle, dpad, leftScreen, rightScreen);
	layer.append(dialog); document.body.append(layer);
	renderEntries();
	const keyboardControls = event => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close.click();
			return;
		}
		const directions = {ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left'};
		const direction = directions[event.key];
		if (!direction) return;
		event.preventDefault();
		dpad.querySelector(`[data-direction="${direction}"]`)?.click();
	};
	const dismiss = () => {
		window.removeEventListener('keydown', keyboardControls);
		layer.remove();
	};
	window.addEventListener('keydown', keyboardControls);
	close.addEventListener('click', () => {
		animateDeviceImage('power');
		setTimeout(dismiss, 150);
	});
	movesToggle.addEventListener('click', () => {
		if (!selectedPokemon) return;
		animateDeviceImage('moves');
		if (rightScreenMode === 'moves') renderDetails(selectedPokemon);
		else renderMoves(selectedPokemon);
	});
	dpad.addEventListener('click', event => {
		const control = event.target.closest('button');
		const direction = control?.dataset.direction;
		const offsets = {left: -1, right: 1, up: -4, down: 4};
		if (direction && offsets[direction]) {
			animateDeviceImage(direction);
			navigatePokedex(offsets[direction]);
		}
	});
	discover.addEventListener('click', async () => {
		if (!masterViewingPlayer || !selectedPokemon || discover.disabled) return;
		animateDeviceImage('discover');
		discover.disabled = true;
		try {
			const data = await api('/profile/pokedex/seen', {
				method: 'PATCH', body: {characterId: character.id, species: selectedPokemon.id || selectedPokemon.name},
			});
			const id = String(selectedPokemon.id || '').toLowerCase();
			seen.add(id);
			character.profile = data.character.profile;
			if (state.currentCharacter?.id === data.character.id) state.currentCharacter = data.character;
			const card = grid.querySelector(`[data-pokemon-id="${id}"]`);
			if (card) {
				card.classList.remove('unseen'); card.classList.add('seen');
				card.setAttribute('aria-label', `Ver dados de ${selectedPokemon.name}`);
				const name = card.querySelector('strong'); if (name) name.textContent = selectedPokemon.name;
			}
			renderDetails(selectedPokemon);
			showToast(`${selectedPokemon.name} foi marcado como visto.`);
		} catch (error) {
			showToast(error.message, true);
		} finally {
			discover.disabled = false;
		}
	});
	deviceHitbox.addEventListener('click', event => event.stopPropagation());
	layer.addEventListener('click', event => { if (event.target === layer) dismiss(); });
}

async function renderPlayerBody(character) {
	const root = createElement('div', 'player-overview');
	const campaignClock = await api('/campaign/clock', {cache: 'no-store'});
	const profile = character.profile || {stats: {}, pokedex: {}, badges: {}};
	const stats = profile.stats || {};
	const caught = profile.pokedex?.caught?.length || 0;
	const seen = profile.pokedex?.seen?.length || 0;

	const identity = createElement('section', 'panel overview-identity');
	const avatar = characterAvatarBadge(character); avatar.classList.add('overview-avatar');
	const identityText = createElement('div', 'overview-identity-copy');
	identityText.append(createElement('h1', '', character.characterName), createElement('strong', '', 'Treinador Pokémon'),
		editableTrainerTagline(character));
	const clock = createElement('div', 'overview-campaign-clock');
	const celestial = createElement('div', 'master-campaign-celestial overview-campaign-celestial');
	const orbit = createElement('div', 'master-campaign-celestial-orbit');
	const sun = createElement('img', 'master-campaign-sun');
	sun.src = './assets/campaign-clock/solgaleo-head.png'; sun.alt = 'Dia';
	const moon = createElement('img', 'master-campaign-moon');
	moon.src = './assets/campaign-clock/lunala-head.png?v=20260904-2'; moon.alt = 'Noite';
	orbit.append(sun, moon);
	celestial.append(orbit, createElement('span', 'master-campaign-horizon'));
	const campaignDate = new Date(campaignClock.currentDateTime);
	const campaignHour = campaignDate.getHours() + campaignDate.getMinutes() / 60;
	orbit.style.setProperty('--campaign-orbit-angle', ((campaignHour - 12) * 15) + 'deg');
	celestial.classList.toggle('is-night', campaignHour < 6 || campaignHour >= 18);
	const weekday = new Intl.DateTimeFormat('pt-BR', {weekday: 'short'}).format(campaignDate).replace('.', '').toUpperCase();
	const pad = number => String(number).padStart(2, '0');
	const dateLabel = weekday + ', ' + pad(campaignDate.getDate()) + '/' + pad(campaignDate.getMonth() + 1) + '/' +
		pad(campaignDate.getFullYear() % 100) + ', ' + pad(campaignDate.getHours()) + ':' + pad(campaignDate.getMinutes());
	clock.append(celestial, createElement('time', '', dateLabel));
	identity.append(avatar, identityText, clock);

	const wallet = section('Carteira');
	const bank = Math.max(0, Number(character.bank?.balance || 0));
	const walletGrid = createElement('div', 'overview-money-grid');
	const moneyMetric = profileMetric('Pokécoin', formatOverviewMoney(character.money));
	const bankMetric = profileMetric('Banco', formatOverviewMoney(bank));
	walletGrid.append(moneyMetric, bankMetric,
		profileMetric('Valor total', formatOverviewMoney(Number(character.money || 0) + bank)));
	wallet.body.append(walletGrid);
	const masterViewingPlayer = state.session?.role === 'master' && state.session?.mode === 'player';
	const playerEditingOwnMoney = state.session?.role === 'player' && state.session?.mode === 'player';
	if (masterViewingPlayer || playerEditingOwnMoney) {
		moneyMetric.classList.add('overview-bank-toggle');
		moneyMetric.setAttribute('role', 'button'); moneyMetric.setAttribute('tabindex', '0');
		moneyMetric.setAttribute('aria-expanded', 'false');
		const moneyPanel = createElement('div', 'overview-bank-panel overview-money-panel hidden');
		const moneyChoices = createElement('div', 'overview-bank-choices');
		const addMoney = button('Adicionar', 'button primary');
		const removeMoney = button('Remover', 'button danger');
		if (masterViewingPlayer) moneyChoices.append(addMoney);
		moneyChoices.append(removeMoney);
		moneyChoices.classList.toggle('single-action', !masterViewingPlayer);
		const moneyForm = createElement('form', 'overview-bank-form hidden');
		const moneyTitle = createElement('strong');
		const moneyAmount = createElement('input');
		moneyAmount.type = 'number'; moneyAmount.min = '1'; moneyAmount.step = '1'; moneyAmount.inputMode = 'numeric';
		moneyAmount.placeholder = 'Valor em Pokécoins';
		const moneyConfirm = button('', 'button primary'); moneyConfirm.type = 'submit';
		const moneyCancel = button('Cancelar', 'button'); moneyCancel.type = 'button';
		moneyForm.append(moneyTitle, moneyAmount, moneyConfirm, moneyCancel);
		moneyPanel.append(moneyChoices, moneyForm);
		wallet.panel.classList.add('overview-wallet-panel'); wallet.panel.append(moneyPanel);
		let moneyOperation = '';
		let outsideMoneyHandler;
		const closeMoney = () => {
			moneyPanel.classList.add('hidden'); moneyMetric.setAttribute('aria-expanded', 'false');
			moneyChoices.classList.remove('hidden'); moneyForm.classList.add('hidden'); moneyOperation = '';
			if (outsideMoneyHandler) document.removeEventListener('pointerdown', outsideMoneyHandler);
		};
		const toggleMoney = () => {
			if (!moneyPanel.classList.contains('hidden')) { closeMoney(); return; }
			for (const panel of wallet.panel.querySelectorAll('.overview-bank-panel:not(.overview-money-panel)')) {
				panel.classList.add('hidden');
			}
			bankMetric.setAttribute('aria-expanded', 'false');
			moneyPanel.classList.remove('hidden'); moneyMetric.setAttribute('aria-expanded', 'true');
			outsideMoneyHandler = event => {
				if (!moneyPanel.contains(event.target) && !moneyMetric.contains(event.target)) closeMoney();
			};
			setTimeout(() => document.addEventListener('pointerdown', outsideMoneyHandler), 0);
		};
		const chooseMoneyOperation = operation => {
			moneyOperation = operation; moneyChoices.classList.add('hidden'); moneyForm.classList.remove('hidden');
			moneyTitle.textContent = operation === 'add' ? 'Quanto deseja adicionar?' : 'Quanto deseja remover?';
			moneyConfirm.textContent = operation === 'add' ? 'Adicionar' : 'Remover';
			moneyConfirm.className = operation === 'add' ? 'button primary' : 'button danger';
			moneyAmount.max = operation === 'remove' ? String(Math.max(0, Number(character.money || 0))) : '';
			moneyAmount.value = ''; moneyAmount.focus();
		};
		moneyMetric.addEventListener('click', toggleMoney);
		moneyMetric.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMoney(); }
		});
		addMoney.addEventListener('click', () => chooseMoneyOperation('add'));
		removeMoney.addEventListener('click', () => chooseMoneyOperation('remove'));
		moneyCancel.addEventListener('click', () => {
			moneyChoices.classList.remove('hidden'); moneyForm.classList.add('hidden'); moneyOperation = '';
		});
		moneyForm.addEventListener('submit', async event => {
			event.preventDefault();
			const value = Number(moneyAmount.value);
			if (!Number.isSafeInteger(value) || value <= 0) { showToast('Informe um valor inteiro maior que zero.', true); return; }
			moneyConfirm.disabled = true;
			try {
				await api('/characters/money', {method: 'PUT', body: {
					characterId: character.id, operation: moneyOperation, amount: value,
				}});
				showToast(moneyOperation === 'add' ? 'Dinheiro adicionado.' : 'Dinheiro removido.');
				await renderDashboard();
			} catch (error) { moneyConfirm.disabled = false; showToast(error.message, true); }
		});
	}
	const bankAllowed = character.pageAccess?.bank !== false;
	if (bankAllowed) {
	bankMetric.classList.add('overview-bank-toggle');
	bankMetric.setAttribute('role', 'button');
	bankMetric.setAttribute('tabindex', '0');
	bankMetric.setAttribute('aria-expanded', 'false');
	const bankPanel = createElement('div', 'overview-bank-panel hidden');
	const bankChoices = createElement('div', 'overview-bank-choices');
	const deposit = button('Depositar', 'button primary');
	const withdraw = button('Retirar', 'button');
	bankChoices.append(deposit, withdraw);
	const bankForm = createElement('form', 'overview-bank-form hidden');
	const bankFormTitle = createElement('strong');
	const amount = createElement('input');
	amount.type = 'number'; amount.min = '1'; amount.step = '1'; amount.inputMode = 'numeric';
	amount.placeholder = 'Valor em Pokécoins';
	const confirm = button('', 'button primary'); confirm.type = 'submit';
	const cancel = button('Cancelar', 'button'); cancel.type = 'button';
	bankForm.append(bankFormTitle, amount, confirm, cancel);
	bankPanel.append(bankChoices, bankForm);
	wallet.panel.classList.add('overview-wallet-panel');
	wallet.panel.append(bankPanel);
	let bankMode = '';
	let outsideBankHandler;
	const closeBank = () => {
		bankPanel.classList.add('hidden'); bankMetric.setAttribute('aria-expanded', 'false');
		bankChoices.classList.remove('hidden'); bankForm.classList.add('hidden'); bankMode = '';
		if (outsideBankHandler) document.removeEventListener('pointerdown', outsideBankHandler);
	};
	const toggleBank = () => {
		const opening = bankPanel.classList.contains('hidden');
		if (!opening) { closeBank(); return; }
		for (const panel of wallet.panel.querySelectorAll('.overview-money-panel')) panel.classList.add('hidden');
		moneyMetric.setAttribute('aria-expanded', 'false');
		bankPanel.classList.remove('hidden'); bankMetric.setAttribute('aria-expanded', 'true');
		outsideBankHandler = event => {
			if (!bankPanel.contains(event.target) && !bankMetric.contains(event.target)) closeBank();
		};
		setTimeout(() => document.addEventListener('pointerdown', outsideBankHandler), 0);
	};
	const chooseBankMode = mode => {
		bankMode = mode; bankChoices.classList.add('hidden'); bankForm.classList.remove('hidden');
		bankFormTitle.textContent = mode === 'deposit' ? 'Quanto deseja depositar?' : 'Quanto deseja retirar?';
		confirm.textContent = mode === 'deposit' ? 'Depositar' : 'Resgatar';
		amount.max = String(mode === 'deposit' ? Math.max(0, Number(character.money || 0)) : bank);
		amount.value = ''; amount.focus();
	};
	bankMetric.addEventListener('click', toggleBank);
	bankMetric.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleBank(); }
	});
	deposit.addEventListener('click', () => chooseBankMode('deposit'));
	withdraw.addEventListener('click', () => chooseBankMode('withdraw'));
	cancel.addEventListener('click', () => {
		bankChoices.classList.remove('hidden'); bankForm.classList.add('hidden'); bankMode = '';
	});
	bankForm.addEventListener('submit', async event => {
		event.preventDefault();
		const value = Number(amount.value);
		if (!Number.isSafeInteger(value) || value <= 0) { showToast('Informe um valor inteiro maior que zero.', true); return; }
		confirm.disabled = true;
		try {
			await api('/bank/' + (bankMode === 'deposit' ? 'deposit' : 'redeem'), {
				method: 'POST', body: {amount: value, expectedRevision: Number(character.bank?.revision || 0)},
			});
			showToast(bankMode === 'deposit' ? 'Depósito realizado.' : 'Retirada realizada.');
			await renderDashboard();
		} catch (error) { confirm.disabled = false; showToast(error.message, true); }
	});
	}

	const statistics = section('Estatísticas');
	statistics.panel.classList.add('overview-statistics-panel');
	statistics.heading.classList.add('overview-statistics-toggle');
	statistics.heading.setAttribute('role', 'button');
	statistics.heading.setAttribute('tabindex', '0');
	statistics.heading.setAttribute('aria-expanded', 'false');
	statistics.heading.append(createElement('span', 'overview-statistics-chevron', '⌄'));
	const statisticsGrid = createElement('div', 'overview-metric-grid overview-statistics-grid');
	statisticsGrid.append(profileMetric('Vitórias', stats.wins || 0), profileMetric('Derrotas', stats.losses || 0),
		profileMetric('Fugas', stats.fleeAttempts || 0), profileMetric('Concursos disputados', stats.contestsEntered || 0),
		profileMetric('Concursos vencidos', stats.contestsWon || 0));
	statistics.body.append(statisticsGrid);
	const statisticsDetails = createElement('div', 'overview-statistics-details hidden');
	statisticsDetails.append(
		profileMetric('Pokémon derrotados', stats.pokemonDefeated || 0),
		profileMetric('Pokémon libertados', stats.pokemonReleased || 0),
		profileMetric('Itens utilizados', stats.itemsUsed || 0),
		profileMetric('Poké Balls lançadas', stats.pokeballsThrown || 0),
		profileMetric('Evoluções', stats.evolutions || 0),
		profileMetric('Ovos chocados', stats.eggsHatched || 0),
		profileMetric('Fósseis restaurados', stats.fossilsRestored || 0),
		profileMetric('Maior sequência de vitórias', stats.longestWinStreak || 0)
	);
	statistics.panel.append(statisticsDetails);
	let outsideStatisticsHandler;
	const closeStatistics = () => {
		statisticsDetails.classList.add('hidden');
		statistics.heading.setAttribute('aria-expanded', 'false');
		if (outsideStatisticsHandler) document.removeEventListener('pointerdown', outsideStatisticsHandler);
		outsideStatisticsHandler = undefined;
	};
	const toggleStatistics = () => {
		const opening = statisticsDetails.classList.contains('hidden');
		if (!opening) return closeStatistics();
		statisticsDetails.classList.remove('hidden');
		statistics.heading.setAttribute('aria-expanded', 'true');
		outsideStatisticsHandler = event => {
			if (!statistics.panel.contains(event.target)) closeStatistics();
		};
		setTimeout(() => document.addEventListener('pointerdown', outsideStatisticsHandler), 0);
	};
	statistics.heading.addEventListener('click', toggleStatistics);
	statistics.heading.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleStatistics(); }
		if (event.key === 'Escape') closeStatistics();
	});

	const pokedex = section('Pokédex');
	pokedex.panel.classList.add('overview-pokedex-panel');
	let catalog = [];
	try { catalog = await rpgLoadBattlePokemon(); } catch {}
	const dexTotal = Math.max(1, rpgPokedexEntries(catalog).length || 1025);
	const dexGrid = createElement('div', 'overview-pokedex-summary');
	dexGrid.append(profileMetric('Vistos', seen), profileMetric('Capturados', caught),
		profileMetric('Completude', Math.min(100, Math.round(caught / dexTotal * 100)) + '%'));
	const openDex = button('', 'overview-pokedex-open');
	const pokedexImage = document.createElement('img');
	pokedexImage.src = './assets/pokedex-kanto.png?v=20260831-1';
	pokedexImage.alt = 'Abrir Pokédex';
	openDex.append(pokedexImage);
	openDex.title = 'Abrir Pokédex';
	openDex.setAttribute('aria-label', 'Abrir Pokédex');
	openDex.disabled = !catalog.length;
	openDex.addEventListener('click', () => openPokedexSummary(character, catalog));
	pokedex.heading.append(openDex);
	pokedex.body.append(dexGrid);

	const team = section('Equipe');
	const teamStrip = createElement('div', 'overview-team-strip');
	for (const pokemon of character.team || []) {
		const card = createElement('div', 'overview-team-pokemon');
		card.append(pokemonSprite(pokemon), createElement('strong', '', pokemon.name || pokemon.species));
		teamStrip.append(card);
	}
	if (!teamStrip.children.length) teamStrip.append(createElement('p', '', 'Nenhum Pokémon na equipe.'));
	team.body.append(teamStrip);

	const badges = section('Insígnias');
	badges.panel.classList.add('overview-badges-panel');
	const badgeRegions = createElement('div', 'overview-badge-regions');
	for (const [regionIndex, [regionId, regionName, regionBadges]] of RPG_BADGE_REGIONS.entries()) {
		const earned = new Set(profile.badges?.[regionId] || []);
		const region = createElement('article', 'overview-badge-region');
		const title = createElement('div', 'overview-badge-title');
		title.append(createElement('strong', '', 'Insígnias de ' + regionName), createElement('span', '', earned.size + ' / ' + regionBadges.length));
		const slots = createElement('div', 'overview-badge-slots');
		for (const [badgeIndex, badgeName] of regionBadges.entries()) {
			const badgeId = String(badgeName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
			const slot = createElement('span', 'overview-badge badge-' + badgeId + (earned.has(badgeId) ? ' earned' : ''));
			if (regionIndex < RPG_BADGE_SHEET_ROW_POSITIONS.length) {
				slot.classList.add('official');
				slot.style.setProperty('--badge-x', (badgeIndex / 7 * 100) + '%');
				slot.style.setProperty('--badge-y', RPG_BADGE_SHEET_ROW_POSITIONS[regionIndex]);
			}
			slot.title = 'Insígnia ' + badgeName;
			slots.append(slot);
		}
		region.append(title, slots); badgeRegions.append(region);
	}
	badges.body.append(badgeRegions);

	root.append(identity, wallet.panel, team.panel, pokedex.panel, statistics.panel, badges.panel);
	return root;
}

function renderCurrentTeamPanel(character) {
	const team = section('Equipe atual');
	const list = createElement('div', 'pokemon-list');
	for (const [teamIndex, pokemon] of (character.team || []).entries()) {
		const training = character.box?.party?.[teamIndex]?.metadata?.evTraining;
		const row = createElement('div', 'pokemon-row' + (training ? ' is-training' : ''));
		row.append(pokemonSprite(pokemon));
		const info = createElement('div', 'pokemon-info');
		info.append(createElement('strong', '', pokemon.name || pokemon.species));
		info.append(createElement(
			'small', '',
			(pokemon.species || 'Pok\u00e9mon') + ' \u00b7 Nv. ' + (pokemon.level || 1) +
			' \u00b7 ' + (pokemon.nature || 'Natureza n\u00e3o definida')
		));
		const moves = (pokemon.moves || []).join(' \u00b7 ');
		if (moves) info.append(createElement('small', '', moves));
		if (training) info.append(createElement('small', 'training-time', 'Em treinamento \u00b7 Restam ' + formatCampaignDuration(training.remainingMs)));
		const builder = button('Team Builder', 'button pokemon-team-builder-button');
		builder.addEventListener('click', () => openTeamBuilder(character.box?.party?.[teamIndex]?.pokemonId, 'overview'));
		row.append(info, createElement('span', 'tag', pokemon.gender || 'N'), builder);
		list.append(row);
	}

	for (const egg of teamEggs(character)) {
		const row = createElement('div', 'pokemon-row pokemon-egg-row');
		const frame = createElement('div', 'pokemon-sprite pokemon-egg-sprite');
		frame.append(eggVisual(egg));
		const info = createElement('div', 'pokemon-info');
		info.append(createElement('strong', '', 'Egg'));
		const status = egg.status === 'ready_to_hatch' ? 'Pronto para chocar' :
			egg.status === 'incubating' ? 'Incubando · ' + egg.progress + '%' : 'Sendo carregado';
		info.append(createElement('small', '', status + ' · ocupa 1 vaga da equipe e 5 espaços da Bag'));
		row.append(frame, info, createElement('span', 'tag', 'OVO'));
		list.append(row);
	}	if (!list.children.length) list.append(createElement('p', '', 'Nenhum Pok\u00e9mon na equipe.'));
	team.body.append(list);
	return team.panel;
}

function renderPlayerTeamBody(character) {
	const root = createElement('div');
	const presets = section('Equipes salvas');
	root.append(presets.panel);
	void renderTeamPresetPlanner(character, presets.body);

	return root;
}

function openTeamBuilder(pokemonId, returnView = state.dashboardView) {
	if (!pokemonId) {
		showToast('Não foi possível identificar este Pokémon.', true);
		return;
	}
	state.teamBuilderPokemonId = pokemonId;
	state.teamBuilderReturnView = returnView === 'team-builder' ? 'box' : returnView;
	state.dashboardView = 'team-builder';
	void renderDashboard();
}

async function renderPlayerBox(character) {
	return window.RPGBoxUI.render({
		api, characterId: character.id, isMaster: state.session.role === 'master', teamEggs: teamEggs(character),
		refresh: renderDashboard, toast: showToast, openTeamBuilder,
		spriteUrl: pokemon => spriteUrl(pokemon), eggVisual, portableIncubatorVisual,
	});
}

async function renderFossilLab(character) {
	return window.RPGFossilLabUI.render({
		api, characterId: character.id, toast: showToast,
		spriteUrl: pokemon => spriteUrl(pokemon),
	});
}
async function renderNursery(character = null) {
	return window.RPGNurseryUI.render({
		api, characterId: character?.id, toast: showToast,
		spriteUrl: pokemon => spriteUrl(pokemon), eggVisual, portableIncubatorVisual,
	});
}
async function renderShops(character = null) {
	return window.RPGShopUI.render({
		api, characterId: character?.id, toast: showToast, refresh: renderDashboard,
		isMaster: state.session.role === 'master' && state.session.mode === 'master',
	});
}
async function renderPlayerTeamBuilder(character) {
	const pokemonTeam = (character.team || []).slice(0, 6).map((pokemon, index) => {
		const stored = character.box?.party?.[index];
		return {...pokemon, pokemonId: stored?.pokemonId, metadata: stored?.metadata || {}};
	});
	const eggTeam = teamEggs(character).map(egg => ({
		...egg, pokemonId: 'egg:' + egg.eggId, name: 'Egg', species: 'Egg', virtualEgg: true,
	}));
	const team = [...pokemonTeam, ...eggTeam].slice(0, 6);
	const selectedInTeam = team.some(pokemon => pokemon.pokemonId === state.teamBuilderPokemonId);
	const canKeepBoxSelection = state.teamBuilderReturnView === 'box' && !!state.teamBuilderPokemonId;
	if (!state.teamBuilderPokemonId || (!selectedInTeam && !canKeepBoxSelection)) {
		state.teamBuilderPokemonId = team.find(pokemon => pokemon.pokemonId)?.pokemonId || null;
	}
	if (!state.teamBuilderPokemonId) {
		return createElement('div', 'panel empty-state', 'Nenhum Pokémon disponível na equipe.');
	}
	const selectedEgg = eggTeam.find(egg => egg.pokemonId === state.teamBuilderPokemonId);
	const boxPokemonReadOnly = !selectedEgg && !pokemonTeam.some(pokemon => pokemon.pokemonId === state.teamBuilderPokemonId);
	return window.RPGTeamBuilderUI.render({
		api, characterId: character.id, pokemonId: state.teamBuilderPokemonId, team, selectedEgg,
		boxRevision: character.box?.revision,
		portableIncubators: character.portableIncubators || [], refresh: renderDashboard,
		readOnly: !!selectedEgg || boxPokemonReadOnly, isMaster: state.session.role === 'master', toast: showToast,
		spriteUrl: pokemon => spriteUrl(pokemon), eggVisual, portableIncubatorVisual,
		switchPokemon: pokemonId => {
			state.teamBuilderPokemonId = pokemonId;
			state.dashboardView = 'team-builder';
			void renderDashboard();
		},
		close: () => {
			state.dashboardView = state.teamBuilderReturnView || 'team';
			state.teamBuilderPokemonId = null;
			void renderDashboard();
		},
	});
}
function evolutionDelay(milliseconds) {
	return new Promise(resolve => { window.setTimeout(resolve, milliseconds); });
}

function evolutionParticles() {
	const particles = createElement('div', 'rpg-evolution-particles');
	const points = [
		[-92, -54], [-58, -88], [-18, -102], [28, -96], [72, -70], [102, -28],
		[108, 22], [78, 68], [34, 94], [-16, 102], [-62, 82], [-98, 48],
		[-116, -4], [-42, -46], [48, -42], [62, 36], [-48, 42], [2, 68],
	];
	for (const [index, point] of points.entries()) {
		const particle = createElement('i');
		particle.style.setProperty('--particle-x', point[0] + 'px');
		particle.style.setProperty('--particle-y', point[1] + 'px');
		particle.style.setProperty('--particle-delay', (index % 6) * 70 + 'ms');
		particles.append(particle);
	}
	return particles;
}

async function playItemEvolution(dialog, card, evolution) {
	await rpgLoadBattleScenes();
	card.replaceChildren();
	const heading = createElement('h2', '', evolution.fromSpecies + ' está evoluindo...');
	const stage = createElement('div', 'rpg-evolution-stage');
	const scene = RPG_BATTLE_SCENES.find(entry => entry.id === 'meadow') || RPG_BATTLE_SCENES[0];
	if (scene) {
		stage.style.backgroundImage = 'url("' + rpgBattleSceneUrl(scene) + '")';
		stage.dataset.scene = scene.id;
	}
	const spriteHost = createElement('div', 'rpg-evolution-sprite');
	const source = createElement('div', 'rpg-evolution-form source size-' + evolution.fromSizeClass);
	const target = createElement('div', 'rpg-evolution-form target size-' + evolution.toSizeClass);
	source.append(rpgRuntimeSprite({ species: evolution.fromSpecies, spriteId: evolution.fromSpriteId, shiny: evolution.shiny }));
	target.append(rpgRuntimeSprite({ species: evolution.toSpecies, spriteId: evolution.toSpriteId, shiny: evolution.shiny }));
	spriteHost.append(source, target);
	stage.append(
		spriteHost, createElement('div', 'rpg-evolution-light'),
		createElement('div', 'rpg-evolution-screen-flash'), evolutionParticles()
	);
	const message = createElement('p', 'rpg-evolution-message', evolution.fromSpecies + ' está evoluindo...');
	card.append(heading, stage, message);
	window.RPGBattleAudio?.playProgressionMusic();
	card.classList.add('evolving');
	window.RPGBattleAudio?.playCry(evolution.fromSpriteId, { baseId: evolution.fromSpriteId });
	await evolutionDelay(2250);
	window.RPGBattleAudio?.playEffect('evolution');
	await evolutionDelay(850);
	window.RPGBattleAudio?.playCry(evolution.toSpriteId, { baseId: evolution.toSpriteId });
	await evolutionDelay(1300);
	spriteHost.replaceChildren(rpgRuntimeSprite({ species: evolution.toSpecies, spriteId: evolution.toSpriteId, shiny: evolution.shiny }));
	spriteHost.className = 'rpg-evolution-sprite size-' + evolution.toSizeClass;
	card.classList.remove('evolving');
	card.classList.add('evolved');
	heading.textContent = 'Evolução concluída';
	message.textContent = evolution.fromSpecies + ' evoluiu para ' + evolution.toSpecies + '!';
	window.RPGBattleAudio?.stopProgressionMusic();
	const actions = createElement('div', 'rpg-evolution-actions');
	const proceed = button('Continuar', 'button primary');
	proceed.addEventListener('click', async () => {
		dialog.remove();
		await renderDashboard();
	});
	actions.append(proceed);
	card.append(actions);
}

async function openEvolutionItemPicker(character, item, anchorRect) {
	const layer = createElement('div', 'rpg-tm-window-layer');
	const primary = createElement('aside', 'panel rpg-tm-side-window rpg-tm-primary-window');
	let secondary = null;
	let outsideHandler = null;
	const closeAll = () => {
		if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler);
		window.removeEventListener('resize', positionAll);
		layer.remove();
	};
	const positionPrimary = () => {
		if (!primary.isConnected) return;
		const gap = 10;
		const width = primary.offsetWidth;
		const height = primary.offsetHeight;
		const reference = anchorRect || {
			left: 16, right: 16, top: 90, bottom: 90, width: 0, height: 0,
		};
		let left = reference.right + gap;
		if (left + width > window.innerWidth - 8) left = reference.left - width - gap;
		primary.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
		let top = reference.top + (reference.height - height) / 2;
		top = Math.max(70, Math.min(top, window.innerHeight - height - 8));
		primary.style.top = top + 'px';
	};
	const positionSecondary = () => {
		if (!secondary?.isConnected) return;
		const gap = 10;
		const primaryRect = primary.getBoundingClientRect();
		const width = secondary.offsetWidth;
		const height = secondary.offsetHeight;
		let left = primaryRect.right + gap;
		let top = primaryRect.top;
		if (left + width > window.innerWidth - 8) left = primaryRect.left - width - gap;
		if (left < 8) {
			left = Math.max(8, Math.min(primaryRect.left, window.innerWidth - width - 8));
			top = primaryRect.bottom + gap;
			if (top + height > window.innerHeight - 8) top = Math.max(70, primaryRect.top - height - gap);
		}
		secondary.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
		secondary.style.top = Math.max(70, Math.min(top, window.innerHeight - height - 8)) + 'px';
	};
	function positionAll() {
		positionPrimary();
		positionSecondary();
	}
	layer.append(primary);
	document.body.append(layer);
	const close = button('×', 'button rpg-tm-window-close');
	close.setAttribute('aria-label', 'Fechar');
	close.addEventListener('click', closeAll);
	primary.append(close, createElement('h2', '', 'Usar ' + item.name + ' em quem?'));
	const content = createElement('div', 'rpg-tm-side-targets');
	content.append(createElement('p', '', 'Procurando Pokémon compatíveis...'));
	primary.append(content);
	outsideHandler = event => {
		if (primary.contains(event.target) || secondary?.contains(event.target)) return;
		closeAll();
	};
	window.setTimeout(() => document.addEventListener('pointerdown', outsideHandler), 0);
	window.addEventListener('resize', positionAll);
	window.requestAnimationFrame(positionPrimary);
	try {
		const data = await api('/box/evolution-targets', {
			method: 'POST', body: { characterId: character.id, itemId: item.id },
		});
		const choose = async (pokemon, option) => {
			if (!secondary) return;
			secondary.replaceChildren(createElement('p', 'loading-block', 'Usando ' + data.item.name + '...'));
			try {
				const result = await api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/use-evolution-item', {
					method: 'POST', body: {
						characterId: character.id, itemId: data.item.id, toSpecies: option.toSpecies,
						actionId: window.crypto.randomUUID(), expectedBoxRevision: data.boxRevision,
						expectedBagRevision: data.bagRevision,
					},
				});
				closeAll();
				const animationDialog = createElement('div', 'rpg-evolution-dialog rpg-item-evolution-dialog');
				const animationCard = createElement('div', 'rpg-evolution-card rpg-item-evolution-card');
				animationDialog.append(animationCard);
				document.body.append(animationDialog);
				await playItemEvolution(animationDialog, animationCard, result.evolution);
			} catch (error) {
				closeAll();
				showToast(error.message, true);
			}
		};
		const openSecondary = pokemon => {
			secondary?.remove();
			secondary = createElement('aside', 'panel rpg-tm-side-window rpg-tm-secondary-window');
			const closeSecondary = button('×', 'button rpg-tm-window-close');
			closeSecondary.setAttribute('aria-label', 'Fechar esta janela');
			closeSecondary.addEventListener('click', () => {
				secondary?.remove();
				secondary = null;
			});
			secondary.append(closeSecondary, createElement('h2', '', 'Evoluir ' + pokemon.name + ' para'));
			const optionsList = createElement('div', 'rpg-tm-side-targets');
			for (const option of pokemon.options) {
				const optionButton = button('', 'button rpg-item-evolution-target');
				optionButton.append(
					rpgRuntimeSprite({ species: option.toSpecies, spriteId: option.toSpriteId, shiny: option.shiny }, false, true),
					createElement('strong', '', option.toSpecies),
					createElement('small', '', 'Usar ' + data.item.name)
				);
				optionButton.addEventListener('click', () => void choose(pokemon, option));
				optionsList.append(optionButton);
			}
			secondary.append(optionsList);
			layer.append(secondary);
			window.requestAnimationFrame(positionSecondary);
		};
		content.replaceChildren();
		if (!data.targets.length) {
			content.append(createElement('p', 'empty-state', 'Nenhum Pokémon pode evoluir com este item.'));
		}
		for (const pokemon of data.targets) {
			const targetButton = button('', 'button rpg-item-evolution-target');
			targetButton.append(
				rpgRuntimeSprite({ species: pokemon.species, spriteId: pokemon.options[0].fromSpriteId, shiny: pokemon.options[0].shiny }, false, true),
				createElement('strong', '', pokemon.name),
				createElement('small', '', pokemon.species + ' · Nv. ' + pokemon.level)
			);
			targetButton.addEventListener('click', () => openSecondary(pokemon));
			content.append(targetButton);
		}
		window.requestAnimationFrame(positionAll);
	} catch (error) {
		closeAll();
		showToast(error.message, true);
	}
}

async function openTechnicalMachinePicker(character, item, anchorRect) {
	const layer = createElement('div', 'rpg-tm-window-layer');
	const primary = createElement('aside', 'panel rpg-tm-side-window rpg-tm-primary-window');
	let secondary = null;
	let outsideHandler = null;
	const closeAll = () => {
		if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler);
		window.removeEventListener('resize', positionAll);
		layer.remove();
	};
	const positionPrimary = () => {
		if (!primary.isConnected) return;
		const gap = 10;
		const width = primary.offsetWidth;
		const height = primary.offsetHeight;
		const reference = anchorRect || {
			left: 16, right: 16, top: 90, bottom: 90, width: 0, height: 0,
		};
		let left = reference.right + gap;
		if (left + width > window.innerWidth - 8) left = reference.left - width - gap;
		left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
		let top = reference.top + (reference.height - height) / 2;
		top = Math.max(70, Math.min(top, Math.max(70, window.innerHeight - height - 8)));
		primary.style.left = left + 'px';
		primary.style.top = top + 'px';
	};
	const positionSecondary = () => {
		if (!secondary?.isConnected) return;
		const gap = 10;
		const primaryRect = primary.getBoundingClientRect();
		const width = secondary.offsetWidth;
		const height = secondary.offsetHeight;
		let left = primaryRect.right + gap;
		let top = primaryRect.top;
		if (left + width > window.innerWidth - 8) left = primaryRect.left - width - gap;
		if (left < 8) {
			left = Math.max(8, Math.min(primaryRect.left, window.innerWidth - width - 8));
			top = primaryRect.bottom + gap;
			if (top + height > window.innerHeight - 8) top = Math.max(70, primaryRect.top - height - gap);
		}
		secondary.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
		secondary.style.top = Math.max(70, Math.min(top, window.innerHeight - height - 8)) + 'px';
	};
	function positionAll() {
		positionPrimary();
		positionSecondary();
	}
	layer.append(primary);
	document.body.append(layer);
	const close = button('×', 'button rpg-tm-window-close');
	close.setAttribute('aria-label', 'Fechar');
	close.addEventListener('click', closeAll);
	primary.append(close, createElement('h2', '', 'Usar ' + item.name));
	const content = createElement('div', 'rpg-tm-side-content');
	content.append(createElement('p', '', 'Procurando Pokémon da equipe...'));
	primary.append(content);
	outsideHandler = event => {
		if (primary.contains(event.target) || secondary?.contains(event.target)) return;
		closeAll();
	};
	window.setTimeout(() => document.addEventListener('pointerdown', outsideHandler), 0);
	window.addEventListener('resize', positionAll);
	window.requestAnimationFrame(positionPrimary);
	try {
		const data = await api('/box/tm-targets', {
			method: 'POST', body: { characterId: character.id, itemId: item.id },
		});
		const moveCard = (move, selectable, onSelect) => {
			const rendered = globalThis.RPGBattleMoveCard.render({
				...move, pp: move.pp, maxPP: move.maxPP || move.pp, disabled: false, targets: [],
			}, { staticDetails: true });
			rendered.cell.classList.add('rpg-move-learning-card-art', 'rpg-tm-combat-move');
			if (selectable) {
				rendered.action.addEventListener('click', onSelect);
			} else {
				rendered.action.classList.add('rpg-move-learning-preview');
			}
			return rendered.cell;
		};
		const teach = async (pokemon, forgottenMoveId) => {
			if (!secondary) return;
			secondary.replaceChildren(createElement('p', 'loading-block', 'Ensinando ' + data.move.name + '...'));
			try {
				const result = await api('/box/pokemon/' + encodeURIComponent(pokemon.pokemonId) + '/use-tm', {
					method: 'POST', body: {
						characterId: character.id, itemId: data.item.id, forgottenMoveId,
						actionId: window.crypto.randomUUID(), expectedBoxRevision: data.boxRevision,
						expectedBagRevision: data.bagRevision,
					},
				});
				secondary.replaceChildren(
					createElement('h3', '', result.learned.pokemonName + ' aprendeu ' + result.learned.moveName + '!')
				);
				if (result.learned.forgottenMoveName) secondary.append(createElement(
					'p', '', result.learned.pokemonName + ' esqueceu ' + result.learned.forgottenMoveName + '.'
				));
				const proceed = button('Continuar', 'button primary');
				proceed.addEventListener('click', async () => {
					closeAll();
					await renderDashboard();
				});
				secondary.append(proceed);
				window.requestAnimationFrame(positionSecondary);
			} catch (error) {
				closeAll();
				showToast(error.message, true);
			}
		};
		const openSecondary = pokemon => {
			secondary?.remove();
			secondary = createElement('aside', 'panel rpg-tm-side-window rpg-tm-secondary-window');
			const closeSecondary = button('×', 'button rpg-tm-window-close');
			closeSecondary.setAttribute('aria-label', 'Fechar esta janela');
			closeSecondary.addEventListener('click', () => {
				secondary?.remove();
				secondary = null;
			});
			secondary.append(closeSecondary, createElement('h2', '', pokemon.name));
			if (pokemon.hasOpenMoveSlot) {
				secondary.append(createElement(
					'p', '', pokemon.name + ' possui um espaço livre para aprender ' + data.move.name + '.'
				));
				const confirm = button('Ensinar ' + data.move.name, 'button primary');
				confirm.addEventListener('click', () => void teach(pokemon));
				secondary.append(confirm);
			} else {
				secondary.append(createElement(
					'h3', '', 'Qual movimento ' + pokemon.name + ' deve esquecer?'
				));
				const moves = createElement('div', 'rpg-tm-forget-grid');
				for (const knownMove of pokemon.moves) {
					moves.append(moveCard(
						knownMove, true, () => void teach(pokemon, knownMove.id)
					));
				}
				secondary.append(moves);
			}
			layer.append(secondary);
			window.requestAnimationFrame(positionSecondary);
		};
		const moveSummary = createElement('section', 'rpg-tm-move-summary');
		moveSummary.append(
			createElement('h3', '', 'Movimento da TM'),
			moveCard(data.move, false)
		);
		content.replaceChildren(moveSummary);
		const targets = createElement('div', 'rpg-tm-side-targets');
		targets.append(createElement('h3', '', 'Em quem ensinar?'));
		if (!data.targets.length) {
			targets.append(createElement('p', 'empty-state', 'Não há Pokémon na equipe atual.'));
		}
		for (const pokemon of data.targets) {
			const targetButton = button(
				'', 'button rpg-item-evolution-target' + (pokemon.eligible ? '' : ' unavailable')
			);
			const availability = pokemon.eligible ?
				(pokemon.hasOpenMoveSlot ? 'espaço livre' : 'substituir movimento') :
				pokemon.disabledReason;
			targetButton.append(
				rpgRuntimeSprite({ species: pokemon.species, shiny: pokemon.shiny }, false, true),
				createElement('strong', '', pokemon.name),
				createElement('small', '', pokemon.species + ' · Nv. ' + pokemon.level + ' · ' + availability)
			);
			targetButton.disabled = !pokemon.eligible;
			targetButton.setAttribute('aria-disabled', String(!pokemon.eligible));
			if (pokemon.eligible) targetButton.addEventListener('click', () => openSecondary(pokemon));
			targets.append(targetButton);
		}
		content.append(targets);
		window.requestAnimationFrame(positionAll);
	} catch (error) {
		closeAll();
		showToast(error.message, true);
	}
}

async function renderPlayerBag(character) {
	return window.RPGBagUI.render({
		api, characterId: character.id, isMaster: state.session.role === 'master',
		toast: showToast,
		openEvolution: (item, anchorRect) => openEvolutionItemPicker(character, item, anchorRect),
		openTM: (item, anchorRect) => openTechnicalMachinePicker(character, item, anchorRect),
	});
}

async function renderPokemonCenter(character) {
	let center = (await api('/pokemon-center?characterId=' + encodeURIComponent(character.id))).center;
	const root = createElement('div', 'pokemon-center-page');
	const statusNames = {
		'': 'Normal', brn: 'Queimado', par: 'Paralisado', psn: 'Envenenado',
		tox: 'Gravemente envenenado', slp: 'Dormindo', frz: 'Congelado', fnt: 'Desmaiado',
	};
	const statusSymbols = { '': 'OK', brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ', fnt: 'FNT' };
	const statusBadge = (status, fainted = false) => {
		const normalized = fainted ? 'fnt' : String(status || '');
		const badge = createElement('span', 'box-condition status-' + (normalized || 'normal'),
			statusSymbols[normalized] || normalized.toUpperCase());
		badge.title = statusNames[normalized] || normalized.toUpperCase();
		badge.setAttribute('aria-label', badge.title);
		return badge;
	};
	const money = value => center.master ? 'Grátis para o Mestre' : formatMoney(value);
	const sprite = pokemon => {
		const image = createElement('img', 'pokemon-center-sprite');
		image.src = spriteUrl(pokemon);
		image.alt = pokemon.name;
		return image;
	};
	const pokemonCard = (pokemon, detailed = false) => {
		const card = createElement('div', 'pokemon-center-pokemon');
		const info = createElement('div', 'pokemon-center-pokemon-info');
		info.append(createElement('strong', '', pokemon.name), createElement('small', 'pokemon-center-hp', 'HP ' + pokemon.hp + ' / ' + pokemon.maxHP));
		if (pokemon.fainted) info.append(statusBadge('', true));
		else if (pokemon.status) info.append(statusBadge(pokemon.status));


		card.append(sprite(pokemon), info);
		return card;
	};
	let sceneMode = 'welcome';
	let sceneBalls = [];
	const healingSlotOrder = [5, 6, 3, 4, 1, 2];
	let sceneTerminal = null;
	const centerBalance = () => Math.max(0, Number(center.money) || 0).toLocaleString('pt-BR') + ' ₽';
	const buildCenterScene = () => {
		const scene = createElement('section', 'pokemon-center-scene pokemon-center-scene-' + sceneMode);
		scene.setAttribute('aria-label', 'Interior do Centro Pok?mon');
		const nurse = createElement('div', 'pokemon-center-scene-nurse');
		const nurseAtTable = sceneBalls.length > 0;
		if (nurseAtTable) nurse.classList.add('is-at-table');
		if (nurseAtTable && sceneMode === 'healing') nurse.classList.add('is-turning');
		const nurseImage = document.createElement('img');
		nurseImage.className = 'pokemon-center-nurse-front';
		nurseImage.src = './assets/pokemon-center-nurse.png?v=20260813-1';
		nurseImage.alt = 'Enfermeira do Centro Pokémon';
		nurseImage.draggable = false;
		const nurseSideImage = document.createElement('img');
		nurseSideImage.className = 'pokemon-center-nurse-side';
		nurseSideImage.src = './assets/pokemon-center-nurse-side.png?v=20260814-1';
		nurseSideImage.alt = '';
		nurseSideImage.draggable = false;
		nurse.append(nurseImage, nurseSideImage);
		const counterSymbol = createElement('div', 'pokemon-center-scene-counter-symbol');
		const healingTable = createElement('div', 'pokemon-center-scene-healing-table');
		for (const [visualIndex, teamSlot] of healingSlotOrder.entries()) {
			const socket = createElement('span', 'pokemon-center-healing-socket');
			socket.dataset.teamSlot = String(teamSlot);
			const pokemon = sceneBalls.find(entry => Number(entry.location?.position) + 1 === teamSlot);
			if (pokemon) {
				const ball = createElement('i', 'pokemon-center-healing-ball');
				const sprite = Number(pokemon.pokeballSprite) > 0 ? Number(pokemon.pokeballSprite) : 345;
				ball.classList.add('ball-' + (pokemon.captureBall || 'pokeball'));
				ball.style.backgroundPosition = -((sprite % 16) * 24) + 'px ' + -(Math.floor(sprite / 16) * 24) + 'px';
				ball.style.setProperty('--ball-delay', (visualIndex * 110) + 'ms');
				ball.title = pokemon.name + ' · Slot ' + teamSlot + ' · ' + (pokemon.captureBall || 'Poké Ball');
				ball.setAttribute('aria-label', ball.title);
				socket.append(ball);
			}
			healingTable.append(socket);
		}
		const terminal = createElement('div', 'pokemon-center-terminal');
		sceneTerminal = createElement('div', 'pokemon-center-terminal-content');
		terminal.append(sceneTerminal, createElement('strong', 'pokemon-center-terminal-balance', centerBalance()));
		if (sceneMode !== 'welcome') {
			const back = button('', 'pokemon-center-hardware-back');
			back.type = 'button';
			back.title = 'Voltar';
			back.setAttribute('aria-label', 'Voltar');
			back.addEventListener('click', sceneMode === 'menu' ? drawWelcome : drawMenu);
			scene.append(back);
		}
		scene.append(nurse, counterSymbol, healingTable, terminal);
		return scene;
	};
	const replaceCenterContent = (...nodes) => {
		root.replaceChildren(buildCenterScene());
		sceneTerminal.replaceChildren(...nodes);
	};
	const appendCenterContent = (...nodes) => sceneTerminal.append(...nodes);
	const drawWelcome = () => {
		sceneMode = 'welcome'; sceneBalls = []; replaceCenterContent();
		const welcome = createElement('section', 'panel pokemon-center-welcome');
		welcome.append(
			createElement('h2', '', 'Bem-vindo!'),
			createElement('p', '', 'Seus Pokémon precisam de cuidados?'),
			createElement('small', '', 'Inicie o atendimento para consultar as opções disponíveis.')
		);
		const enter = button('Iniciar', 'button primary pokemon-center-welcome-action');
		enter.addEventListener('click', drawMenu);
		welcome.append(enter);
		appendCenterContent(welcome);
	};
	const drawMenu = () => {
		sceneMode = 'menu'; sceneBalls = []; replaceCenterContent();
		const reception = createElement('section', 'panel pokemon-center-reception');
		const actions = createElement('div', 'pokemon-center-actions');
		for (const [label, action] of [
			['Curar Equipe', () => drawTeamConfirmation()],
			['Curar Pokémon', () => drawPokemonSelection(false)],
			['Reviver Pokémon', () => drawPokemonSelection(true)],
		]) {
			const control = button(label, 'button pokemon-center-action');
			control.addEventListener('click', action);
			actions.append(control);
		}
		reception.append(actions);
		appendCenterContent(reception);
	};
	const pageHeader = title => {
		const header = createElement('div', 'pokemon-center-page-heading');
		const text = createElement('div');
		text.append(createElement('h2', '', title));

		header.append(text);

		return header;
	};
	const drawTeamConfirmation = () => {
			sceneMode = 'detail'; sceneBalls = [];
		replaceCenterContent(pageHeader('Curar equipe.'));
		const affected = center.team.filter(pokemon => pokemon.needsRecovery);
		const list = createElement('div', 'pokemon-center-list');
		for (const pokemon of affected) list.append(pokemonCard(pokemon, true));
		if (!affected.length) list.append(createElement('p', 'empty-state', 'Sua equipe já está completamente recuperada.'));
		appendCenterContent(list);
		const footer = createElement('div', 'panel pokemon-center-confirm');
		footer.append(createElement('strong', '', 'Valor: ' + money(center.teamRecoveryCost)));
		const confirm = button('Confirmar', 'button primary');
		confirm.disabled = !affected.length;
		confirm.addEventListener('click', () => recover('team'));
		footer.append(confirm);
		appendCenterContent(footer);
	};
	const drawPokemonSelection = revive => {
			sceneMode = 'detail'; sceneBalls = [];
		replaceCenterContent(pageHeader(revive ? 'Reviver Pokémon' : 'Curar Pokémon', center.master ? 'Escolha um Pokémon da equipe ou das Boxes.' : 'Escolha um Pokémon da equipe.'));
		const available = (center.pokemon || center.team).filter(pokemon => revive ? pokemon.fainted : pokemon.needsRecovery);
		const list = createElement('div', 'pokemon-center-selection');
		for (const pokemon of available) {
			const choice = button('', 'pokemon-center-choice');
			choice.append(pokemonCard(pokemon));
			choice.addEventListener('click', () => drawPokemonConfirmation(pokemon, revive));
			list.append(choice);
		}
		if (!available.length) list.append(createElement('p', 'empty-state', revive ? 'Nenhum Pokémon está desmaiado.' : 'Nenhum Pokémon precisa de recuperação.'));
		appendCenterContent(list);
	};
	const drawPokemonConfirmation = (pokemon, revive) => {
			sceneMode = 'detail'; sceneBalls = [];
		replaceCenterContent(pageHeader(revive ? 'Reviver ' + pokemon.name + '?' : 'Curar ' + pokemon.name + '?', 'Confira o estado que será recuperado.'));
		const detail = createElement('section', 'panel pokemon-center-detail');
		detail.append(pokemonCard(pokemon, true));
		const value = revive ? pokemon.reviveCost : pokemon.fullRecoveryCost;
		detail.append(createElement('strong', 'pokemon-center-price', 'Valor: ' + money(value)));
		const confirm = button('Confirmar', 'button primary');
		confirm.addEventListener('click', () => recover(revive ? 'revive' : 'heal', pokemon.pokemonId));
		detail.append(confirm);
		appendCenterContent(detail);
	};
	const recover = async (action, pokemonId) => {
		sceneMode = 'healing';
		const eligible = action === 'team' ? center.team.filter(pokemon => pokemon.needsRecovery) :
			center.team.filter(pokemon => pokemon.pokemonId === pokemonId);
		sceneBalls = eligible.filter(pokemon => pokemon.location?.destination === 'party').slice(0, 6);
		replaceCenterContent();
		const animation = createElement('section', 'panel pokemon-center-healing');
		animation.append(createElement('span', 'pokemon-center-heal-symbol', '✚'), createElement('h2', '', 'Curando...'));
		const progress = createElement('div', 'pokemon-center-progress'); progress.append(createElement('span'));
		animation.append(progress);
		appendCenterContent(animation);
		const lastBallIndex = Math.max(0, ...sceneBalls.map(pokemon =>
			healingSlotOrder.indexOf(Number(pokemon.location?.position) + 1)).filter(index => index >= 0));
		const healingAudioTimer = window.setTimeout(() =>
			window.RPGBattleAudio?.playEffect('pokemonCenterHeal'), 620 + lastBallIndex * 110);
		try {
			const result = await api('/pokemon-center/recover', {
				method: 'POST', body: { characterId: character.id, action, pokemonId, expectedRevision: center.revision },
			});
			await new Promise(resolve => setTimeout(resolve, 1900));
			center = result.center;
			drawResult(result);
		} catch (error) {
			window.clearTimeout(healingAudioTimer);
			showToast(error.message, true);
			drawMenu();
		}
	};
	const drawResult = result => {
		sceneMode = 'result';

		replaceCenterContent(pageHeader(result.changes.length > 1 ? 'Equipe curada' : 'Pok\u00e9mon recuperado', 'Recupera\u00e7\u00e3o conclu\u00edda.'));
		const list = createElement('div', 'pokemon-center-list');
		for (const change of result.changes) {
			const card = createElement('section', 'panel pokemon-center-result');
			card.append(createElement('h3', '', change.name), createElement('p', '', 'HP: ' + change.hpBefore + ' → ' + change.hpAfter + ' / ' + change.maxHP));
			if (change.statusBefore) {
				const statusChange = createElement('p', 'pokemon-center-status-change');
				statusChange.append(
					createElement('span', '', 'Status:'),
					statusBadge(change.statusBefore),
					createElement('span', 'pokemon-center-status-arrow', String.fromCodePoint(0x2192)),
					statusBadge('')
				);
				card.append(statusChange);
			}


			if (change.revived) card.append(createElement('strong', 'pokemon-center-revived', 'Revivido'));
			list.append(card);
		}
		appendCenterContent(list);
		const finish = button('Continuar', 'button primary');
		finish.addEventListener('click', () => {
			const nurse = root.querySelector('.pokemon-center-scene-nurse.is-at-table');
			if (!nurse) return drawMenu();
			finish.disabled = true;
			nurse.classList.remove('is-turning');
			nurse.classList.add('is-returning');
			let completed = false;
			const completeReturn = () => {
				if (completed) return;
				completed = true;
				drawMenu();
			};
			nurse.addEventListener('animationend', event => {
				if (event.animationName === 'pokemon-center-nurse-face-forward') completeReturn();
			});
			window.setTimeout(completeReturn, 1100);
		});
		appendCenterContent(finish);
	};
	drawWelcome();
	return root;
}
async function renderMasterBody(characters) {
	const root = createElement('div');
	const [shopDirectory, campaignData, battleData, contestData] = await Promise.all([
		api('/shops'), api('/campaign/settings', {cache: 'no-store'}), api('/battle-sessions'), api('/contest-sessions'),
	]);
	const campaign = campaignData.settings;
	const activeBattles = (battleData.battleSessions || []).filter(session => session.status === 'started').length;
	const activeContests = (contestData.contestSessions || []).filter(session => session.status === 'started').length;
	const formatCampaignDate = value => {
		const date = new Date(value);
		const weekday = new Intl.DateTimeFormat('pt-BR', {weekday: 'short'}).format(date).replace('.', '').toUpperCase();
		const pad = number => String(number).padStart(2, '0');
		const calendar = pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + pad(date.getFullYear() % 100);
		const clock = pad(date.getHours()) + ':' + pad(date.getMinutes());
		return weekday + ', ' + calendar + ', ' + clock;
	};
	const top = createElement('section', 'panel master-campaign-overview');
	const identity = createElement('div', 'master-campaign-identity');
	const campaignName = createElement('h2', '', campaign.name);
	const campaignDate = createElement('time', '', formatCampaignDate(campaign.currentDateTime));
	identity.append(
		createElement('small', '', 'Campanha atual'),
		campaignName
	);
	const metrics = createElement('div', 'master-campaign-metrics');
	let activePlayersCard = null;
	for (const [label, value, detail] of [
		['Jogadores ativos', String(campaign.onlinePlayers || 0) + '/' + String(characters.length), 'online / cadastrados'],
		['Batalhas', String(activeBattles), 'em andamento'],
		['Concursos', String(activeContests), 'em andamento'],
		['Torneios', '0', 'em andamento'],
	]) {
		const card = createElement('div', 'master-campaign-metric');
		const metricValue = createElement('strong', '', value);
		if (label === 'Jogadores ativos') {
			metricValue.dataset.masterOnlinePlayers = '';
			activePlayersCard = card;
		}
		card.append(createElement('small', '', label), metricValue, createElement('span', '', detail));
		metrics.append(card);
	}
	const onlineDrawer = createElement('div', 'master-online-players-drawer hidden');
	const onlineList = createElement('div', 'master-online-players-list');
	onlineList.dataset.masterOnlineList = '';
	const onlineNames = campaign.onlinePlayerNames || [];
	onlineList.replaceChildren(...(onlineNames.length ? onlineNames.map(name => createElement('span', '', name)) : [createElement('small', '', 'Nenhum player online.') ]));
	onlineDrawer.append(createElement('strong', '', 'Players online'), onlineList);
	if (activePlayersCard) {
		activePlayersCard.append(onlineDrawer);
		activePlayersCard.classList.add('is-interactive');
		activePlayersCard.tabIndex = 0;
		activePlayersCard.setAttribute('role', 'button');
		activePlayersCard.setAttribute('aria-expanded', 'false');
		const toggleOnlineDrawer = () => {
			const opening = onlineDrawer.classList.contains('hidden');
			onlineDrawer.classList.toggle('hidden', !opening);
			activePlayersCard.setAttribute('aria-expanded', String(opening));
		};
		activePlayersCard.addEventListener('click', toggleOnlineDrawer);
		activePlayersCard.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleOnlineDrawer(); }
		});
		onlineDrawer.addEventListener('click', event => event.stopPropagation());
		root.addEventListener('click', event => {
			if (activePlayersCard.contains(event.target)) return;
			onlineDrawer.classList.add('hidden');
			activePlayersCard.setAttribute('aria-expanded', 'false');
		});
	}
	const toolbar = createElement('div', 'master-campaign-toolbar');
	const celestial = createElement('div', 'master-campaign-celestial');
	celestial.setAttribute('aria-label', 'Ciclo de dia e noite da campanha');
	const orbit = createElement('div', 'master-campaign-celestial-orbit');
	const sun = createElement('img', 'master-campaign-sun');
	sun.src = './assets/campaign-clock/solgaleo-head.png';
	sun.alt = 'Cabeça de Solgaleo representando o dia';
	const moon = createElement('img', 'master-campaign-moon');
	moon.src = './assets/campaign-clock/lunala-head.png?v=20260904-2';
	moon.alt = 'Cabeça de Lunala representando a noite';
	orbit.append(sun, moon);
	celestial.append(orbit, createElement('span', 'master-campaign-horizon'));
	const updateCampaignClock = () => {
		const date = new Date(campaign.currentDateTime);
		const hour = date.getHours() + date.getMinutes() / 60;
		orbit.style.setProperty('--campaign-orbit-angle', ((hour - 12) * 15) + 'deg');
		celestial.classList.toggle('is-night', hour < 6 || hour >= 18);
		campaignDate.textContent = formatCampaignDate(date);
	};
	updateCampaignClock();
	const clockActions = createElement('div', 'campaign-clock-actions');
	for (const hours of [1, 8]) {
		const advance = button('+' + hours + 'h', 'button primary campaign-clock-button');
		advance.addEventListener('click', async () => {
			for (const control of clockActions.querySelectorAll('button')) control.disabled = true;
			configure.disabled = true;
			orbit.style.setProperty('--campaign-orbit-shift', (hours * 15) + 'deg');
			orbit.classList.remove('is-advancing');
			void orbit.offsetWidth;
			orbit.classList.add('is-advancing');
			try {
				const [data] = await Promise.all([
					api('/campaign/time/advance', { method: 'POST', body: { hours } }),
					new Promise(resolve => window.setTimeout(resolve, 950)),
				]);
				const time = data.time;
				showToast('Campanha avançada em ' + hours + 'h · ' +
					time.trainings.completed + ' treinamento(s), ' + time.fossils.completed + ' fóssil(is), ' +
					time.breedings.completed + ' ovo(s) produzido(s) e ' + time.incubations.completed + ' incubação(ões) concluída(s).');
				campaign.currentDateTime = new Date(new Date(campaign.currentDateTime).getTime() + hours * 3600000).toISOString();
				if (time.events?.length) {
					campaign.events.push(...time.events);
					const eventsGrid = root.querySelector('[data-master-campaign-events]');
					if (eventsGrid) renderMasterCampaignEvents(eventsGrid, campaign.events);
				}
				orbit.classList.remove('is-advancing');
				updateCampaignClock();
				for (const control of clockActions.querySelectorAll('button')) control.disabled = false;
				configure.disabled = false;
			} catch (error) {
				orbit.classList.remove('is-advancing');
				for (const control of clockActions.querySelectorAll('button')) control.disabled = false;
				configure.disabled = false;
				showToast(error.message, true);
			}
		});
		clockActions.append(advance);
	}
	const configure = button('☀', 'button master-campaign-configure');
	configure.setAttribute('aria-label', 'Configurar campanha');
	configure.addEventListener('click', () => {
		root.querySelector('.master-campaign-settings')?.remove();
		const form = createElement('form', 'panel master-campaign-settings');
		const heading = createElement('div', 'master-campaign-settings-heading');
		heading.append(createElement('h3', '', 'Configurar campanha'));
		const close = button('×'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar'); close.addEventListener('click', () => form.remove());
		heading.append(close);
		const nameField = createElement('label'); nameField.append(createElement('span', '', 'Nome da campanha'));
		const name = createElement('input'); name.name = 'name'; name.maxLength = 80; name.value = campaign.name; nameField.append(name);
		const dateField = createElement('label'); dateField.append(createElement('span', '', 'Data e horário no RPG'));
		const date = createElement('input'); date.type = 'datetime-local'; date.name = 'currentDateTime';
		const current = new Date(campaign.currentDateTime); date.value = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 16); dateField.append(date);
		const actions = createElement('div', 'master-campaign-settings-actions');
		const cancel = button('Cancelar'); cancel.type = 'button'; cancel.addEventListener('click', () => form.remove());
		const save = button('Salvar configurações', 'primary'); save.type = 'submit'; actions.append(cancel, save);
		form.append(heading, nameField, dateField, actions);
		form.addEventListener('submit', async event => {
			event.preventDefault(); save.disabled = true;
			try {
				const data = await api('/campaign/settings', {method: 'PUT', body: {name: name.value, currentDateTime: new Date(date.value).toISOString()}});
				Object.assign(campaign, data.settings);
				campaignName.textContent = campaign.name;
				updateCampaignClock();
				form.remove();
				showToast('Configurações da campanha salvas.');
			} catch (error) { save.disabled = false; showToast(error.message, true); }
		});
		top.after(form); name.focus();
	});
	const timeControls = createElement('div', 'master-campaign-time-controls');
	timeControls.append(campaignDate, clockActions);
	toolbar.append(configure, celestial, timeControls);
	top.append(identity, metrics, toolbar);
	if (state.dashboardView === 'overview') root.append(top);
	if (state.dashboardView === 'overview') {
		const presence = section('Áreas da campanha');
		presence.panel.classList.add('master-area-presence-panel');
		const areaGrid = createElement('div', 'master-area-presence-grid');
		areaGrid.dataset.masterAreaPresence = '';
		renderMasterAreaPresence(areaGrid, campaign.onlinePlayerAreas || []);
		presence.body.append(areaGrid);
		root.append(presence.panel);

		const notes = section('Anotações rápidas');
		notes.panel.classList.add('master-quick-notes');
		const editor = createElement('textarea', 'master-quick-notes-editor');
		editor.value = campaign.quickNotes || '';
		editor.maxLength = 50000;
		editor.placeholder = 'Escreva lembretes, ideias e pendências da campanha...';
		const status = createElement('small', 'master-quick-notes-status', 'Salvo');
		let saveTimer = null;
		let revision = 0;
		const saveNotes = async () => {
			const currentRevision = ++revision;
			status.textContent = 'Salvando...';
			try {
				await api('/campaign/quick-notes', {method: 'PUT', body: {notes: editor.value}});
				if (currentRevision === revision) status.textContent = 'Salvo';
			} catch (error) {
				if (currentRevision === revision) status.textContent = 'Não foi possível salvar';
				showToast(error.message, true);
			}
		};
		editor.addEventListener('input', () => {
			status.textContent = 'Alterações pendentes';
			window.clearTimeout(saveTimer);
			saveTimer = window.setTimeout(() => void saveNotes(), 700);
		});
		editor.addEventListener('keydown', event => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
				event.preventDefault(); window.clearTimeout(saveTimer); void saveNotes();
			}
		});
		editor.addEventListener('blur', () => {
			if (status.textContent !== 'Alterações pendentes') return;
			window.clearTimeout(saveTimer);
			void saveNotes();
		});
		notes.body.append(editor, status);
		root.append(notes.panel);

		const events = section('Eventos');
		events.panel.classList.add('master-campaign-events-panel');
		const eventsGrid = createElement('div', 'master-campaign-events-grid');
		eventsGrid.dataset.masterCampaignEvents = '';
		renderMasterCampaignEvents(eventsGrid, campaign.events || []);
		events.body.append(eventsGrid);
		root.append(events.panel);
		return root;
	}
	const players = section('Personagens da campanha');
	players.panel.classList.add('master-players-panel');
	const list = createElement('div', 'master-list');
	const listHeader = createElement('div', 'master-player-summary-header');
	listHeader.append(
		createElement('span', '', 'Avatar'), createElement('span', '', 'Personagem'),
		createElement('span', '', 'Player'), createElement('span', '', 'Equipe')
	);
	list.append(listHeader);
	let masterDexTotal = 1025;
	try { masterDexTotal = Math.max(1, rpgPokedexEntries(await rpgLoadBattlePokemon()).length); } catch {}
	for (const character of characters) {
		const card = createElement('div', 'master-player-card');
		const row = createElement('div', 'master-player-summary-row');
		const expanded = state.expandedMasterPlayerIds.has(character.id);
		row.tabIndex = 0;
		row.setAttribute('role', 'button');
		row.setAttribute('aria-expanded', String(expanded));
		row.append(characterAvatarBadge(character));
		row.append(createElement('strong', 'master-player-character-name', character.characterName));
		row.append(createElement('span', 'master-player-nick', character.playerName));
		const team = createElement('div', 'master-player-summary-team');
		for (const pokemon of (character.team || []).slice(0, 6)) {
			const member = createElement('span', 'master-player-summary-pokemon');
			const image = spriteImage(pokemon);
			image.alt = pokemon.name || pokemon.species;
			member.append(image);
			team.append(member);
		}
		if (!character.team?.length) team.append(createElement('small', '', 'Sem Pokémon'));
		row.append(team);
		const toggleExpanded = () => {
			if (state.expandedMasterPlayerIds.has(character.id)) state.expandedMasterPlayerIds.delete(character.id);
			else state.expandedMasterPlayerIds.add(character.id);
			void renderDashboard();
		};
		row.addEventListener('click', toggleExpanded);
		row.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleExpanded(); }
		});
		const details = createElement('div', 'master-player-details');
		const tagline = createElement('blockquote', 'master-player-tagline',
			'“' + (character.profile?.tagline || 'A aventura está apenas começando.') + '”');
		details.append(tagline);
		const overview = createElement('div', 'master-player-overview-metrics');
		const caught = character.profile?.pokedex?.caught?.length || 0;
		overview.append(
			profileMetric('Pokédex', Math.min(100, Math.round(caught / masterDexTotal * 100)) + '%'),
			profileMetric('Pokécoin', formatOverviewMoney(character.money)),
			profileMetric('Banco', formatOverviewMoney(character.bank?.balance || 0))
		);
		details.append(overview);
		const badges = createElement('div', 'master-player-badge-summary');
		for (const [regionId, regionName, regionBadges] of RPG_BADGE_REGIONS) {
			const earned = new Set(character.profile?.badges?.[regionId] || []);
			const region = createElement('div', 'master-player-badge-region');
			region.append(createElement('strong', '', regionName),
				createElement('span', '', earned.size + '/' + regionBadges.length + ' insígnias'));
			badges.append(region);
		}
		details.append(badges);
		const conditions = createElement('div', 'master-player-conditions');
		conditions.append(createElement('h3', '', 'Condições especiais'));
		const conditionList = createElement('div', 'master-player-condition-list');
		const storedPokemon = [
			...(character.box?.party || []),
			...(character.box?.boxes || []).flatMap(box => box.slots || []).filter(Boolean),
		];
		for (const entry of storedPokemon) {
			const training = entry.metadata?.evTraining;
			const breeding = entry.metadata?.breeding;
			if (!training && !breeding) continue;
			const condition = createElement('div', 'master-player-condition');
			condition.append(pokemonSprite(entry.pokemon));
			const copy = createElement('div');
			copy.append(createElement('strong', '', entry.pokemon.name || entry.pokemon.species));
			if (training) copy.append(createElement('span', '', 'Em treinamento · Restam ' + formatCampaignDuration(training.remainingMs || 0)));
			if (breeding) {
				const project = (character.nursery?.projects || []).find(value =>
					[value.slot1, value.slot2].some(parent => parent?.ownerId === character.id && parent.pokemonId === entry.pokemonId));
				const remaining = project?.remainingBreedingTimeMs;
				copy.append(createElement('span', '', 'Em reprodução' +
					(Number.isFinite(remaining) ? ' · Restam ' + formatCampaignDuration(remaining) : '')));
			}
			condition.append(copy); conditionList.append(condition);
		}
		for (const egg of character.teamEggs || []) {
			if (egg.status !== 'incubating') continue;
			const condition = createElement('div', 'master-player-condition');
			condition.append(eggVisual());
			const copy = createElement('div');
			copy.append(createElement('strong', '', 'Ovo em incubação'),
				createElement('span', '', 'Restam ' + formatCampaignDuration(egg.remainingIncubationTimeMs || 0)));
			condition.append(copy); conditionList.append(condition);
		}
		if (!conditionList.children.length) conditionList.append(createElement('p', 'master-player-condition-empty', 'Nenhuma condição ativa.'));
		conditions.append(conditionList); details.append(conditions);
		const notes = createElement('label', 'master-player-private-notes');
		notes.append(createElement('strong', '', 'Anotações privadas'));
		const notesEditor = createElement('textarea');
		notesEditor.maxLength = 20000;
		notesEditor.placeholder = 'Registre informações privadas sobre este jogador...';
		notesEditor.value = campaign.playerNotes?.[character.id] || '';
		const resizeNotes = () => {
			notesEditor.style.height = 'auto';
			notesEditor.style.height = notesEditor.scrollHeight + 'px';
		};
		requestAnimationFrame(resizeNotes);
		const notesStatus = createElement('small', '', 'Salvo');
		let notesTimer = null;
		const savePlayerNote = async () => {
			notesStatus.textContent = 'Salvando...';
			try {
				await api('/campaign/player-note', {method: 'PUT', body: {characterId: character.id, note: notesEditor.value}});
				campaign.playerNotes ||= {}; campaign.playerNotes[character.id] = notesEditor.value;
				notesStatus.textContent = 'Salvo';
			} catch (error) { notesStatus.textContent = 'Erro ao salvar'; showToast(error.message, true); }
		};
		notesEditor.addEventListener('input', () => {
			resizeNotes();
			notesStatus.textContent = 'Alterações pendentes'; window.clearTimeout(notesTimer);
			notesTimer = window.setTimeout(() => void savePlayerNote(), 700);
		});
		notesEditor.addEventListener('blur', () => {
			if (notesStatus.textContent !== 'Alterações pendentes') return;
			window.clearTimeout(notesTimer); void savePlayerNote();
		});
		notes.append(notesEditor, notesStatus); details.append(notes);
		const actions = createElement('div', 'master-row-actions');
		const permissions = createElement('div', 'master-page-access');
		const pageToggle = (page, label) => {
			let allowed = character.pageAccess?.[page] !== false;
			const toggle = button(
				label,
				'master-access-toggle ' + (allowed ? 'allowed' : 'blocked')
			);
			toggle.setAttribute('aria-pressed', String(allowed));
			toggle.addEventListener('click', async () => {
				toggle.disabled = true;
				try {
					const data = await api('/characters/page-access', {
						method: 'PUT', body: { characterId: character.id, page, allowed: !allowed },
					});
					allowed = data.character.pageAccess?.[page] !== false;
					character.pageAccess = data.character.pageAccess;
					toggle.classList.toggle('allowed', allowed);
					toggle.classList.toggle('blocked', !allowed);
					toggle.setAttribute('aria-pressed', String(allowed));
					toggle.disabled = false;
				} catch (error) {
					toggle.disabled = false;
					showToast(error.message, true);
				}
			});
			return toggle;
		};
		for (const [page, label] of [['bank', 'Banco'], ['box', 'Box'], ['bag', 'Bag'], ['training', 'Treinamento'], ['center', 'Centro Pokémon'], ['fossils', 'Paleontologia'], ['nursery', 'Berçário']]) {
			permissions.append(pageToggle(page, label));
		}
		const shopAccess = createElement('div', 'master-shop-access');
		const shopMain = createElement('div', 'master-shop-access-main');
		let shopExpanded = state.expandedShopAccessIds.has(character.id);
		const shopsToggle = button('Lojas', 'master-shops-picker-toggle');
		shopsToggle.setAttribute('aria-expanded', String(shopExpanded));
		shopMain.append(shopsToggle);
		shopAccess.append(shopMain);
		const shopPanel = createElement('div', 'master-shop-access-panel');
		shopPanel.classList.toggle('hidden', !shopExpanded);
		for (const shop of shopDirectory.shops) {
				const row = createElement('div', 'master-shop-access-row');
				let allowed = character.shopAccess?.[shop.id] !== false;
				const toggle = button(
					shop.name,
					'master-access-toggle master-shop-toggle ' + (allowed ? 'allowed' : 'blocked')
				);
				toggle.setAttribute('aria-pressed', String(allowed));
				toggle.addEventListener('click', async () => {
					toggle.disabled = true;
					try {
						const data = await api('/characters/shop-access', {
							method: 'PUT',
							body: { characterId: character.id, shopId: shop.id, allowed: !allowed },
						});
						allowed = data.character.shopAccess?.[shop.id] !== false;
						character.shopAccess = data.character.shopAccess;
						toggle.classList.toggle('allowed', allowed);
						toggle.classList.toggle('blocked', !allowed);
						toggle.setAttribute('aria-pressed', String(allowed));
						toggle.disabled = false;
					} catch (error) {
						toggle.disabled = false;
						showToast(error.message, true);
					}
				});
				row.append(toggle);
			shopPanel.append(row);
		}
		shopAccess.append(shopPanel);
		let outsideShopsHandler;
		const closeShops = () => {
			shopExpanded = false;
			state.expandedShopAccessIds.delete(character.id);
			shopPanel.classList.add('hidden');
			shopsToggle.setAttribute('aria-expanded', 'false');
			if (outsideShopsHandler) document.removeEventListener('pointerdown', outsideShopsHandler);
			outsideShopsHandler = undefined;
		};
		shopsToggle.addEventListener('click', () => {
			shopExpanded = !shopExpanded;
			if (shopExpanded) state.expandedShopAccessIds.add(character.id);
			else state.expandedShopAccessIds.delete(character.id);
			shopPanel.classList.toggle('hidden', !shopExpanded);
			shopsToggle.setAttribute('aria-expanded', String(shopExpanded));
			if (!shopExpanded) return closeShops();
			outsideShopsHandler = event => {
				if (!shopAccess.contains(event.target)) closeShops();
			};
			setTimeout(() => document.addEventListener('pointerdown', outsideShopsHandler), 0);
		});
		permissions.append(shopAccess);
		const view = button('Visualizar como Player', 'button');
		view.addEventListener('click', () => viewAsPlayer(character, 'overview'));
		actions.append(view);
		details.append(actions);
		const controls = createElement('div', 'master-player-controls');
		controls.append(details, permissions);
		controls.classList.toggle('hidden', !expanded);
		card.append(row, controls);
		list.append(card);
	}
	if (!characters.length) {
		listHeader.remove();
		list.append(createElement('p', '', 'Nenhum personagem foi criado.'));
	}
	players.body.append(list);
	root.append(players.panel);
	return root;
}

async function viewAsPlayer(character, destination = 'overview') {
	try {
		const data = await api('/session/view-as', {
			method: 'POST',
			body: { characterId: character.id },
		});
		saveSession(data.session);
		state.dashboardView = destination;
		await renderDashboard();
	} catch (error) {
		showToast(error.message, true);
	}
}

async function exitPlayerView() {
	try {
		const data = await api('/session/view-as', { method: 'DELETE' });
		saveSession(data.session);
		state.dashboardView = 'overview';
		await renderDashboard();
	} catch (error) {
		showToast(error.message, true);
	}
}

async function openDeleteDialog() {
	const trigger = $('#delete-character');
	trigger.disabled = true;
	try {
		const data = await api('/character/delete-challenge', { method: 'POST' });
		state.deletionChallenge = data.challenge;
		$('#delete-character-name').textContent = state.currentCharacter.characterName;
		$('#delete-word').textContent = data.challenge.word;
		$('#delete-confirmation').value = '';
		setError('delete-error', '');
		$('#delete-modal').classList.remove('hidden');
		$('#delete-confirmation').focus();
	} catch (error) {
		showToast(error.message, true);
	} finally {
		trigger.disabled = false;
	}
}

const MASTER_NPC_LIBRARY_KEY = 'rpg-master-npc-library-v1';
let masterNPCLastCreatedFolderId = '';
let masterNPCLibraryLoadedFromServer = false;
let masterNPCLibrarySaveChain = Promise.resolve();
const masterNPCExpandedFolderIds = new Set();
const MASTER_NPC_FOLDER_COLORS = [
	{value: '#d69b35', light: '#ebc466'}, {value: '#c74740', light: '#f07b70'},
	{value: '#4c6f98', light: '#89a9cc'}, {value: '#4f8a67', light: '#85bd91'},
	{value: '#76539b', light: '#a486c4'}, {value: '#bd6e96', light: '#e59abb'},
];
const MASTER_NPC_DEFAULT_FOLDERS = [
	{id: 'pokemon', name: 'Pok\u00e9mon', parentId: null, kind: 'pokemon', locked: true},
	{id: 'free', name: 'NPCs livres', parentId: null, kind: 'free', locked: true},
	...['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea']
		.map(name => ({id: 'region-' + name.toLowerCase(), name, parentId: null, kind: 'region', locked: true})),
];

function readMasterNPCLibrary() {
	let stored = {};
	try { stored = JSON.parse(localStorage.getItem(MASTER_NPC_LIBRARY_KEY) || '{}'); } catch {}
	const customFolders = Array.isArray(stored.folders) ? stored.folders.filter(folder => folder?.id && folder?.name) : [];
	return {
		folders: [...MASTER_NPC_DEFAULT_FOLDERS, ...customFolders.filter(folder => !folder.locked)],
		npcs: Array.isArray(stored.npcs) ? stored.npcs : [],
		notes: Array.isArray(stored.notes) ? stored.notes : [],
	};
}

function saveMasterNPCLibrary(library) {
	const stored = {
		folders: library.folders.filter(folder => !folder.locked),
		npcs: library.npcs,
		notes: library.notes || [],
	};
	localStorage.setItem(MASTER_NPC_LIBRARY_KEY, JSON.stringify(stored));
	if (state.session?.role === 'master') {
		masterNPCLibrarySaveChain = masterNPCLibrarySaveChain
			.then(() => api('/master-npc-library', {method: 'PUT', body: {library: stored}}))
			.catch(error => showToast('N\u00e3o foi poss\u00edvel salvar a biblioteca no servidor: ' + error.message, true));
	}
}

async function loadMasterNPCLibraryFromServer() {
	if (masterNPCLibraryLoadedFromServer || state.session?.role !== 'master') return;
	const local = readMasterNPCLibrary();
	const response = await api('/master-npc-library');
	if (response.library) {
		localStorage.setItem(MASTER_NPC_LIBRARY_KEY, JSON.stringify(response.library));
	} else if (local.npcs.length || local.notes.length || local.folders.some(folder => !folder.locked)) {
		saveMasterNPCLibrary(local);
	}
	masterNPCLibraryLoadedFromServer = true;
}

window.RPGMasterNPCLibrary = {
	async load() {
		await loadMasterNPCLibraryFromServer();
		return structuredClone(readMasterNPCLibrary());
	},
};

async function renderMasterNPCLibraryDashboard() {
	try { await loadMasterNPCLibraryFromServer(); } catch (error) { showToast('Falha ao carregar a biblioteca do servidor: ' + error.message, true); }
	return renderMasterNPCFolders();
}

function masterNPCId(prefix) {
	return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function closeMasterNPCFolderMenu() {
	document.querySelector('.master-npc-folder-menu')?.remove();
}

function masterNPCFolderDescendants(library, folderId) {
	const ids = new Set([folderId]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const folder of library.folders) {
			if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
				ids.add(folder.id);
				changed = true;
			}
		}
	}
	return ids;
}

function openMasterNPCFolderMenu(event, folder, library, refresh) {
	event.preventDefault();
	event.stopPropagation();
	closeMasterNPCFolderMenu();
	const menu = createElement('div', 'master-npc-folder-menu');
	menu.setAttribute('role', 'menu');
	const remove = button('Excluir', 'danger');
	remove.setAttribute('role', 'menuitem');
	remove.addEventListener('click', () => {
		const descendantIds = masterNPCFolderDescendants(library, folder.id);
		const nestedCount = descendantIds.size - 1;
		const npcCount = library.npcs.filter(npc => descendantIds.has(npc.folderId)).length;
		const noteCount = (library.notes || []).filter(note => descendantIds.has(note.folderId)).length;
		if ((nestedCount || npcCount || noteCount) && !confirm(
			'A pasta "' + folder.name + '" possui ' +
			(nestedCount ? nestedCount + ' subpasta(s)' : '') +
			(nestedCount && (npcCount || noteCount) ? ', ' : '') +
			(npcCount ? npcCount + ' NPC(s)' : '') +
			(npcCount && noteCount ? ' e ' : '') +
			(noteCount ? noteCount + ' bloco(s) de notas' : '') +
			'. Excluir a pasta e todo o seu conte\u00fado?'
		)) return;
		library.folders = library.folders.filter(entry => !descendantIds.has(entry.id));
		library.npcs = library.npcs.filter(npc => !descendantIds.has(npc.folderId));
		library.notes = (library.notes || []).filter(note => !descendantIds.has(note.folderId));
		saveMasterNPCLibrary(library);
		closeMasterNPCFolderMenu();
		refresh();
		showToast('Pasta exclu\u00edda.');
	});
	menu.append(remove);
	document.body.append(menu);
	const width = menu.offsetWidth;
	const height = menu.offsetHeight;
	menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)) + 'px';
	menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) + 'px';
	setTimeout(() => document.addEventListener('click', closeMasterNPCFolderMenu, {once: true}), 0);
}

function masterNPCField(label, name, value = '', multiline = false) {
	const wrapper = createElement('label', 'master-npc-form-field');
	wrapper.append(createElement('span', '', label));
	const control = document.createElement(multiline ? 'textarea' : 'input');
	control.name = name;
	control.value = value;
	if (multiline) control.rows = 4;
	wrapper.append(control);
	return wrapper;
}

function masterNPCControl(label, control) {
	const wrapper = createElement('label', 'master-npc-compact-control');
	wrapper.append(createElement('span', '', label), control);
	return wrapper;
}

function masterNPCMoveCard(move, onClick) {
	const type = String(move?.type || 'normal').toLowerCase();
	const card = button('', 'team-builder-move-card rpg-move-button type-' + type);
	card.type = 'button';
	if (!move) {
		card.classList.add('empty');
		card.append(createElement('strong', '', 'Espa\u00e7o de golpe'));
		if (onClick) card.addEventListener('click', onClick);
		return card;
	}
	const title = createElement('div', 'rpg-move-title'); title.append(createElement('strong', '', move.name || move.moveName || move.moveId));
	const identity = createElement('div', 'rpg-move-identity');
	const battleCategory = move.battleCategory || move.category || 'Status';
	const category = createElement('i', 'rpg-category-icon category-' + String(battleCategory).toLowerCase());
	category.setAttribute('aria-label', battleCategory);
	identity.append(category, createElement('span', 'rpg-type-badge type-' + type, String(move.type || 'Normal').toUpperCase()));
	const technical = createElement('div', 'rpg-move-technical');
	technical.append(createElement('span', '', move.basePower == null ? 'Power \u2014' : 'Power ' + move.basePower), createElement('span', '', move.alwaysHits ? 'Accuracy \u2014' : 'Accuracy ' + (move.accuracy ?? '\u2014') + '%'));
	const summary = createElement('div', 'rpg-move-summary'); summary.append(identity, technical, createElement('div', 'rpg-move-range', move.targetLabel || move.target || ''));
	const explanation = createElement('div', 'rpg-move-explanation'); explanation.append(createElement('p', 'rpg-move-button-description', move.description || 'Sem efeito adicional.'), createElement('b', 'rpg-move-pp', 'PP ' + (move.pp ?? '\u2014')));
	const body = createElement('div', 'rpg-move-button-body'); body.append(summary, explanation);
	card.append(title, body);
	if (onClick) card.addEventListener('click', onClick);
	return card;
}

function masterNPCTrainerPicker(selectedId = '') {
	const field = createElement('div', 'master-npc-form-field master-npc-visual-field');
	field.append(createElement('span', '', 'Sprite do treinador'));
	const input = createElement('input');
	input.type = 'hidden';
	input.name = 'sprite';
	input.value = selectedId || '';
	const toggle = button('', 'master-npc-trainer-toggle');
	const renderToggle = () => {
		const avatar = AVATARS.find(entry => entry.id === input.value);
		toggle.replaceChildren();
		if (avatar) toggle.append(trainerImage(avatar), createElement('strong', '', avatar.name));
		else toggle.append(createElement('span', 'master-npc-picker-placeholder', '+'), createElement('strong', '', 'Escolher treinador'));
	};
	const options = createElement('div', 'master-npc-trainer-options hidden');
	for (const avatar of AVATARS) {
		const option = button('', 'master-npc-trainer-option');
		option.type = 'button';
		option.append(trainerImage(avatar), createElement('span', '', avatar.name));
		option.addEventListener('click', () => {
			input.value = avatar.id;
			options.classList.add('hidden');
			renderToggle();
		});
		options.append(option);
	}
	toggle.type = 'button';
	toggle.addEventListener('click', () => options.classList.toggle('hidden'));
	field.append(input, toggle, options);
	const closeOutside = event => {
		if (!field.isConnected) {
			document.removeEventListener('pointerdown', closeOutside);
			return;
		}
		if (!field.contains(event.target)) options.classList.add('hidden');
	};
	document.addEventListener('pointerdown', closeOutside);
	renderToggle();
	return field;
}

function masterNPCTeamPicker(existing) {
	const field = createElement('div', 'master-npc-form-field master-npc-team-field');
	field.append(createElement('span', '', 'Equipe do NPC'));
	const legacy = String(existing?.teams || '').split(/[,;\n]+/).map(species => species.trim()).filter(Boolean);
	const selected = (Array.isArray(existing?.team) ? existing.team : legacy).map(entry =>
		typeof entry === 'string' ? {species: entry, name: entry, level: 50, nature: 'Serious', moves: [], ability: '', item: '',
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}} : structuredClone(entry)
	);
	const input = createElement('input');
	input.type = 'hidden';
	input.name = 'team';
	const members = createElement('div', 'master-npc-team-members');
	const update = () => {
		input.value = JSON.stringify(selected);
		members.replaceChildren();
		for (const [index, pokemon] of selected.entries()) {
			const species = pokemon.species || pokemon.name;
			const member = createElement('div', 'master-npc-team-member');
			member.append(pokemonSprite(pokemon), createElement('strong', '', species), createElement('small', '', 'Nv. ' + (pokemon.level || 1)));
			member.addEventListener('click', () => void openPokemonManager(pokemon, index));
			const remove = button('\u00d7', 'danger');
			remove.type = 'button';
			remove.setAttribute('aria-label', 'Remover ' + species);
			remove.addEventListener('click', event => { event.stopPropagation(); selected.splice(index, 1); update(); });
			member.append(remove);
			members.append(member);
		}
		if (!selected.length) members.append(createElement('div', 'master-npc-team-empty', 'Nenhum Pok\u00e9mon escolhido.'));
	};
	const add = button('Adicionar Pok\u00e9mon');
	add.type = 'button';
	const picker = createElement('div', 'master-npc-pokemon-picker hidden');
	const search = createElement('input');
	search.type = 'search';
	search.placeholder = 'Buscar Pok\u00e9mon...';
	const results = createElement('div', 'master-npc-pokemon-results');
	const manager = createElement('div', 'master-npc-pokemon-manager hidden');
	let catalog = [];
	const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
	const natures = ['Hardy','Lonely','Brave','Adamant','Naughty','Bold','Docile','Relaxed','Impish','Lax','Timid','Hasty','Serious','Jolly','Naive','Modest','Mild','Quiet','Bashful','Rash','Calm','Gentle','Sassy','Careful','Quirky'];
	async function openPokemonManager(source, editingIndex = -1) {
		picker.classList.add('hidden');
		manager.classList.remove('hidden');
		manager.replaceChildren(createElement('div', 'loading-block', 'Carregando ficha...'));
		const pokemon = typeof source === 'string' ? catalog.find(entry => entry.name === source) : catalog.find(entry => entry.name === source.name || entry.name === source.species) || source;
		const draft = editingIndex >= 0 ? structuredClone(selected[editingIndex]) : {
			species: pokemon.name, name: pokemon.name, level: 50, nature: 'Serious', gender: pokemon.genders?.[0] || '',
			ability: pokemon.abilities?.[0] || '', item: '', shiny: false, moves: [], evs: Object.fromEntries(stats.map(id => [id, 0])), ivs: Object.fromEntries(stats.map(id => [id, 0])),
		};
		const query = new URLSearchParams({species: draft.species, level: String(draft.level || 50)});
		let legalMoves = [], itemCatalog = [];
		try {
			const [moveData, itemData] = await Promise.all([api('/contest-pokemon-moves?' + query), api('/bag/master/catalog')]);
			legalMoves = moveData.moves || [];
			itemCatalog = (itemData.items || []).filter(entry => (entry.category === 'held' || entry.tags?.includes('held')) && !entry.tags?.some(tag => ['breeding', 'contestonly', 'primalorb', 'megastone', 'berry'].includes(tag)));
		} catch {}
		manager.replaceChildren();
		const heading = createElement('div', 'master-npc-pokemon-manager-head');
		heading.append(createElement('h4', '', 'Gerenciar Pok\u00e9mon'));
		const automatic = button('Configurar automaticamente', 'primary');
		heading.append(automatic);
		manager.append(heading);
		const toolbar = createElement('div', 'master-npc-pokemon-toolbar');
		const level = createElement('input'); level.type = 'number'; level.min = '1'; level.max = '100'; level.value = String(draft.level || 50);
		const friendship = createElement('input'); friendship.type = 'number'; friendship.min = '0'; friendship.max = '255'; friendship.value = String(draft.friendship ?? draft.rpg?.friendship ?? 100);
		const performance = createElement('input'); performance.type = 'number'; performance.min = '0'; performance.max = '100'; performance.value = String(draft.performance ?? draft.rpg?.contestPerformance ?? 0);
		const nature = createElement('select'); for (const value of natures) nature.append(new Option(value, value)); nature.value = draft.nature || 'Serious';
		const abilityDetails = Array.isArray(pokemon.abilityDetails) ? pokemon.abilityDetails : (pokemon.abilities || []).map(name => ({name, description: 'Descri\u00e7\u00e3o indispon\u00edvel.'}));
		const ability = createElement('select'); for (const entry of abilityDetails) ability.append(new Option(entry.name, entry.name)); ability.value = draft.ability || ability.options[0]?.value || '';
		const gender = createElement('select'); for (const value of pokemon.genders || ['M','F']) gender.append(new Option(value === 'M' ? 'Masculino' : value === 'F' ? 'Feminino' : 'Sem g\u00eanero', value)); gender.value = draft.gender || gender.options[0]?.value || '';
		const shiny = createElement('input'); shiny.type = 'checkbox'; shiny.checked = !!draft.shiny;
		const item = createElement('input'); item.type = 'hidden'; item.value = draft.item || '';
		const pokemonName = createElement('div', 'master-npc-pokemon-name'); pokemonName.append(createElement('small', '', 'Pok\u00e9mon'), createElement('strong', '', draft.species));
		toolbar.append(
			pokemonName,
			masterNPCControl('Shiny', shiny),
			masterNPCControl('G\u00eanero', gender),
			masterNPCControl('Level', level),
			masterNPCControl('Amizade', friendship),
			masterNPCControl('Performance', performance)
		);
		manager.append(toolbar);
		const showdownBody = createElement('div', 'master-npc-pokemon-showdown-body');
		const portrait = createElement('div', 'master-npc-pokemon-portrait'); portrait.append(pokemonSprite(draft));
		shiny.addEventListener('change', () => {
			portrait.replaceChildren(pokemonSprite({...pokemon, ...draft, shiny: shiny.checked}));
		});
		const center = createElement('div', 'master-npc-pokemon-center');
		const typeRow = createElement('div', 'master-npc-pokemon-types');
		for (const type of pokemon.types || []) typeRow.append(createElement('span', 'type-' + String(type).toLowerCase(), type));
		const hpBase = pokemon.baseStats?.hp || 1;
		const maximumHP = draft.species === 'Shedinja' ? 1 : Math.floor((2 * hpBase + Number(draft.ivs?.hp || 0) + Math.floor(Number(draft.evs?.hp || 0) / 4)) * Number(level.value) / 100) + Number(level.value) + 10;
		const hp = createElement('div', 'master-npc-pokemon-hp'); hp.append(createElement('strong', '', 'HP'), createElement('span', '', maximumHP + ' / ' + maximumHP), createElement('i'));
		const properties = createElement('div', 'master-npc-pokemon-properties');
		const itemProperty = createElement('div', 'master-npc-property-picker');
		const itemButton = button('', 'master-npc-property-button master-npc-item-button');
		const itemOptions = createElement('div', 'master-npc-property-dropdown hidden');
		const itemSearch = createElement('input'); itemSearch.type = 'search'; itemSearch.placeholder = 'Buscar held item...';
		const itemResults = createElement('div', 'master-npc-property-results');
		const itemIcon = entry => {
			const host = createElement('span', 'master-npc-item-icon');
			const visual = entry && typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(entry) : null;
			if (visual) host.append(visual);
			return host;
		};
		const renderItemButton = () => {
			const selectedItem = itemCatalog.find(entry => entry.id === item.value); const copy = createElement('span', 'master-npc-item-copy');
			copy.append(createElement('strong', '', selectedItem?.name || 'Sem item'), createElement('small', '', selectedItem?.description || 'Clique para escolher um held item.'));
			itemButton.replaceChildren(itemIcon(selectedItem), copy);
		};
		const renderItems = () => {
			const query = rpgSpriteKey(itemSearch.value); itemResults.replaceChildren();
			const empty = button('', 'master-npc-property-option'); empty.append(itemIcon(null), createElement('strong', '', 'Sem item')); empty.addEventListener('click', () => { item.value = ''; itemOptions.classList.add('hidden'); renderItemButton(); }); itemResults.append(empty);
			for (const entry of itemCatalog.filter(candidate => !query || rpgSpriteKey(candidate.name).includes(query))) {
				const option = button('', 'master-npc-property-option'); const copy = createElement('span', 'master-npc-item-copy'); copy.append(createElement('strong', '', entry.name), createElement('small', '', entry.description || 'Sem descri\u00e7\u00e3o.'));
				option.append(itemIcon(entry), copy); option.addEventListener('click', () => { item.value = entry.id; itemOptions.classList.add('hidden'); renderItemButton(); }); itemResults.append(option);
			}
		};
		itemButton.addEventListener('click', () => { itemOptions.classList.toggle('hidden'); renderItems(); if (!itemOptions.classList.contains('hidden')) itemSearch.focus(); }); itemSearch.addEventListener('input', renderItems); itemOptions.append(itemSearch, itemResults); itemProperty.append(createElement('span', '', 'Item'), item, itemButton, itemOptions); renderItemButton();
		const abilityProperty = createElement('div', 'team-builder-main-property team-builder-main-ability contest-ability-property');
		const abilityButton = button('', 'contest-ability-button');
		const abilityOptions = createElement('section', 'panel contest-ability-dropdown hidden');
		const abilityResults = createElement('div', 'contest-ability-results'); abilityOptions.append(abilityResults);
		const renderAbilityButton = () => { const entry = abilityDetails.find(candidate => candidate.name === ability.value); abilityButton.replaceChildren(createElement('strong', '', entry?.name || 'Sem habilidade')); };
		for (const entry of abilityDetails) {
			const option = button('', 'contest-ability-option' + (entry.name === ability.value ? ' selected' : ''));
			option.append(createElement('strong', '', entry.name), createElement('small', '', entry.description || 'Descri\u00e7\u00e3o indispon\u00edvel.'));
			if (entry.hidden) option.append(createElement('span', 'contest-ability-hidden-label', 'Habilidade Oculta'));
			option.addEventListener('click', () => {
				ability.value = entry.name; abilityOptions.classList.add('hidden'); renderAbilityButton();
				abilityResults.querySelectorAll('.contest-ability-option').forEach(node => node.classList.toggle('selected', node === option));
			}); abilityResults.append(option);
		}
		abilityButton.addEventListener('click', () => abilityOptions.classList.toggle('hidden'));
		abilityProperty.append(createElement('span', 'contest-npc-property-label', 'Habilidade'), ability, abilityButton, abilityOptions);
		ability.classList.add('hidden'); renderAbilityButton();
		properties.append(itemProperty, abilityProperty);
		center.append(typeRow, hp, properties);
		const moveSelects = [];
		const movesPanel = createElement('div', 'master-npc-pokemon-moves team-builder-four-moves'); movesPanel.append(createElement('h4', '', 'Golpes'));
		const moveSlots = [];
		const moveChoice = id => legalMoves.find(move => move.moveId === id);
		const renderMoveSlot = index => {
			const slot = moveSlots[index];
			slot.replaceChildren(masterNPCMoveCard(moveChoice(moveSelects[index].value), () => {
				movesPanel.querySelector('.master-npc-move-dropdown')?.remove();
				const dropdown = createElement('div', 'master-npc-move-dropdown');
				const searchMove = createElement('input'); searchMove.type = 'search'; searchMove.placeholder = 'Buscar golpe...';
				const choices = createElement('div', 'master-npc-move-choices');
				const draw = () => {
					const query = rpgSpriteKey(searchMove.value); choices.replaceChildren();
					const clear = button('Remover golpe'); clear.type = 'button'; clear.addEventListener('click', () => { moveSelects[index].value = ''; dropdown.remove(); renderMoveSlot(index); }); choices.append(clear);
					const typeOrder = {Normal:0,Grass:1,Fire:2,Water:3,Electric:4,Bug:5,Flying:6,Poison:7,Rock:8,Ground:9,Ice:10,Fighting:11,Psychic:12,Ghost:13,Dragon:14,Dark:15,Steel:16,Fairy:17};
					const categoryOrder = {Physical:0,Special:1,Status:2};
					const ordered = legalMoves.filter(entry => !query || rpgSpriteKey(entry.name || entry.moveName).includes(query)).sort((first, second) =>
						(typeOrder[first.type] ?? 18) - (typeOrder[second.type] ?? 18) ||
						(categoryOrder[first.battleCategory] ?? 3) - (categoryOrder[second.battleCategory] ?? 3) ||
						String(first.name).localeCompare(String(second.name), 'en', {sensitivity: 'base'}));
					for (const move of ordered) {
						const row = button('', 'team-builder-simple-move');
						const category = createElement('i', 'rpg-category-icon category-' + String(move.battleCategory || 'Status').toLowerCase());
						row.append(createElement('strong', '', move.name), createElement('span', 'team-builder-type type-' + String(move.type).toLowerCase(), move.type), category,
							createElement('span', '', move.basePower == null ? '\u2014' : String(move.basePower)), createElement('span', '', move.accuracy == null ? '\u2014' : move.accuracy + '%'),
							createElement('span', '', String(move.pp)), createElement('small', '', move.description || 'Sem efeito adicional.'));
						row.addEventListener('click', () => { moveSelects[index].value = move.moveId; dropdown.remove(); renderMoveSlot(index); }); choices.append(row);
					}
				};
				searchMove.addEventListener('input', draw); dropdown.append(searchMove, choices); movesPanel.append(dropdown); draw(); searchMove.focus();
			}));
		};
		for (let index = 0; index < 4; index++) {
			const select = createElement('select'); select.append(new Option('Sem move', ''));
			for (const move of legalMoves) select.append(new Option(move.name || move.moveName || move.moveId, move.moveId));
			select.value = draft.moves?.[index] || '';
			select.classList.add('hidden'); moveSelects.push(select);
			const slot = createElement('div', 'team-builder-move-slot'); slot.append(select); moveSlots.push(slot); movesPanel.append(slot); renderMoveSlot(index);
		}
		const reloadMoves = async () => {
			const preserved = moveSelects.map(select => select.value);
			const moveQuery = new URLSearchParams({species: draft.species, level: String(Math.max(1, Math.min(100, Number(level.value) || 1)))});
			try { legalMoves = (await api('/contest-pokemon-moves?' + moveQuery)).moves || legalMoves; } catch {}
			for (const [index, select] of moveSelects.entries()) {
				select.replaceChildren(new Option('Sem move', ''));
				for (const move of legalMoves) select.append(new Option(move.name || move.moveName || move.moveId, move.moveId));
				select.value = preserved[index] || '';
				renderMoveSlot(index);
			}
		};
		level.addEventListener('change', () => void reloadMoves());
		const attributes = createElement('div', 'master-npc-pokemon-attributes');
		const attributeHead = createElement('div', 'master-npc-pokemon-attribute-head');
		attributeHead.append(createElement('h4', '', 'Atributos'), createElement('span', '', 'EV'), createElement('span', '', 'IV'), createElement('span', '', 'Total')); attributes.append(attributeHead);
		const attributeSummary = createElement('div', 'master-npc-attribute-summary');
		const attributeEditor = createElement('div', 'master-npc-attribute-editor hidden');
		const evInputs = {}, ivInputs = {};
		for (const id of stats) {
			const ev = createElement('input'); ev.type = 'number'; ev.min = '0'; ev.max = '252'; ev.value = String(draft.evs?.[id] || 0); evInputs[id] = ev;
			const iv = createElement('input'); iv.type = 'number'; iv.min = '0'; iv.max = '31'; iv.value = String(draft.ivs?.[id] || 0); ivInputs[id] = iv;
			const row = createElement('div', 'master-npc-pokemon-stat'); row.append(createElement('strong', '', id.toUpperCase()), masterNPCControl('EV', ev), masterNPCControl('IV', iv)); attributeEditor.append(row);
		}
		const updateAttributeSummary = () => {
			attributeSummary.querySelectorAll('.master-npc-attribute-summary-row:not(.heading)').forEach(row => row.remove());
			for (const id of stats) {
				const base = pokemon.baseStats?.[id] || 1; const ev = Number(evInputs[id].value || 0); const iv = Number(ivInputs[id].value || 0); const lv = Number(level.value || 1);
				const total = id === 'hp' ? (draft.species === 'Shedinja' ? 1 : Math.floor((2 * base + iv + Math.floor(ev / 4)) * lv / 100) + lv + 10) : Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * lv / 100) + 5));
				const row = createElement('div', 'master-npc-attribute-summary-row'); row.append(createElement('strong', '', id === 'hp' ? 'HP' : id.toUpperCase()), createElement('span', '', String(ev)), createElement('span', '', String(iv)), createElement('b', '', String(total))); attributeSummary.append(row);
			}
		};
		for (const input of [...Object.values(evInputs), ...Object.values(ivInputs), level]) input.addEventListener('input', updateAttributeSummary);
		const attributeFooter = createElement('div', 'master-npc-attribute-footer');
		const naturePicker = createElement('div', 'contest-nature-picker master-npc-nature-picker');
		const natureLabel = button('', 'contest-nature-button'); natureLabel.type = 'button';
		const natureButtonLabel = createElement('span', '', 'Natureza');
		const natureButtonValue = createElement('strong', '', nature.value);
		natureLabel.append(natureButtonLabel, natureButtonValue);
		const naturePanel = createElement('div', 'contest-nature-panel hidden');
		const natureMatrix = [['Hardy','Bold','Modest','Calm','Timid'],['Lonely','Docile','Mild','Gentle','Hasty'],['Adamant','Impish','Bashful','Careful','Jolly'],['Naughty','Lax','Rash','Quirky','Naive'],['Brave','Relaxed','Quiet','Sassy','Serious']];
		const natureStats = ['Attack','Defense','Sp. Attack','Sp. Defense','Speed'];
		const natureGrid = createElement('div', 'contest-nature-grid');
		const natureCorner = createElement('div', 'contest-nature-corner'); natureCorner.append(createElement('span', '', '\u2212'), createElement('strong', '', '+')); natureGrid.append(natureCorner);
		for (const stat of natureStats) natureGrid.append(createElement('strong', 'contest-nature-axis increase', '+ ' + stat));
		for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
			natureGrid.append(createElement('strong', 'contest-nature-axis decrease', '\u2212 ' + natureStats[rowIndex]));
			for (let columnIndex = 0; columnIndex < 5; columnIndex++) {
				const name = natureMatrix[rowIndex][columnIndex]; const neutral = rowIndex === columnIndex;
				const option = button('', 'contest-nature-option' + (neutral ? ' neutral' : '') + (name === nature.value ? ' selected' : ''));
				option.dataset.nature = name;
				option.append(createElement('strong', '', name));
				if (neutral) option.append(createElement('small', 'contest-nature-neutral-label', 'Neutro'));
				else option.append(createElement('small', 'contest-nature-increase', '+ ' + natureStats[columnIndex]), createElement('small', 'contest-nature-decrease', '\u2212 ' + natureStats[rowIndex]));
				option.addEventListener('click', () => {
					nature.value = name; nature.dispatchEvent(new Event('change'));
					natureGrid.querySelectorAll('.contest-nature-option').forEach(node => node.classList.toggle('selected', node.dataset.nature === name));
					naturePanel.classList.add('hidden');
				}); natureGrid.append(option);
			}
		}
		naturePanel.append(natureGrid); natureLabel.addEventListener('click', () => naturePanel.classList.toggle('hidden'));
		nature.addEventListener('change', () => {
			natureButtonValue.textContent = nature.value;
			natureGrid.querySelectorAll('.contest-nature-option').forEach(node => node.classList.toggle('selected', node.dataset.nature === nature.value));
		});
		naturePicker.append(nature, natureLabel, naturePanel);
		const editAttributes = button('Editar atributos'); editAttributes.type = 'button'; editAttributes.addEventListener('click', () => attributeEditor.classList.toggle('hidden'));
		attributeFooter.append(naturePicker, editAttributes); attributes.append(attributeSummary, attributeFooter, attributeEditor); updateAttributeSummary();
		showdownBody.append(portrait, center, attributes); manager.append(showdownBody, movesPanel);
		const managerActions = createElement('div', 'master-npc-editor-actions');
		const cancel = button('Cancelar'); cancel.type = 'button'; cancel.addEventListener('click', () => manager.classList.add('hidden'));
		const confirmPokemon = button(editingIndex >= 0 ? 'Salvar Pok\u00e9mon' : 'Adicionar \u00e0 equipe', 'primary'); confirmPokemon.type = 'button';
		const applyAutomatic = () => {
			nature.value = natures[Math.floor(Math.random() * natures.length)];
			nature.dispatchEvent(new Event('change'));
			if (ability.options.length) {
				ability.selectedIndex = Math.floor(Math.random() * ability.options.length); renderAbilityButton();
				abilityResults.querySelectorAll('.contest-ability-option').forEach((node, index) => node.classList.toggle('selected', index === ability.selectedIndex));
			}
			if (itemCatalog.length) { item.value = itemCatalog[Math.floor(Math.random() * itemCatalog.length)].id; renderItemButton(); }
			for (const input of Object.values(ivInputs)) input.value = String(Math.floor(Math.random() * 32));
			let remaining = 508; const order = [...stats].sort(() => Math.random() - .5);
			for (const id of order) { const value = Math.min(252, remaining); evInputs[id].value = String(value); remaining -= value; }
			const pool = [...legalMoves].sort(() => Math.random() - .5).slice(0, 4);
			for (let index = 0; index < moveSelects.length; index++) { moveSelects[index].value = pool[index]?.moveId || ''; renderMoveSlot(index); }
			updateAttributeSummary();
		};
		automatic.addEventListener('click', applyAutomatic);
		confirmPokemon.addEventListener('click', () => {
			const configured = {...draft, level: Number(level.value), friendship: Number(friendship.value), performance: Number(performance.value), nature: nature.value, ability: ability.value, gender: gender.value, shiny: shiny.checked, item: item.value.trim(),
				moves: moveSelects.map(select => select.value).filter(Boolean), evs: Object.fromEntries(stats.map(id => [id, Number(evInputs[id].value)])), ivs: Object.fromEntries(stats.map(id => [id, Number(ivInputs[id].value)]))};
			if (editingIndex >= 0) selected[editingIndex] = configured; else selected.push(configured);
			manager.classList.add('hidden'); update();
		});
		managerActions.append(cancel, confirmPokemon); manager.append(managerActions);
	}
	const renderResults = () => {
		const query = rpgSpriteKey(search.value);
		results.replaceChildren();
		for (const pokemon of catalog.filter(entry => !query || rpgSpriteKey(entry.name).includes(query))) {
			const option = button('', 'master-npc-pokemon-option');
			option.type = 'button';
			option.append(pokemonSprite(pokemon), createElement('span', '', pokemon.name));
			option.addEventListener('click', () => {
				if (selected.length >= 6) return showToast('A equipe j\u00e1 possui seis Pok\u00e9mon.', true);
				void openPokemonManager(pokemon);
			});
			results.append(option);
		}
	};
	add.addEventListener('click', async () => {
		if (selected.length >= 6) return showToast('A equipe j\u00e1 possui seis Pok\u00e9mon.', true);
		picker.classList.toggle('hidden');
		if (!picker.classList.contains('hidden') && !catalog.length) {
			results.replaceChildren(createElement('div', 'loading-block', 'Carregando Pok\u00e9mon...'));
			try { catalog = (await api('/battle-pokemon')).pokemon || []; renderResults(); } catch (error) { showToast(error.message, true); }
		}
		if (!picker.classList.contains('hidden')) search.focus();
	});
	search.addEventListener('input', renderResults);
	picker.append(search, results);
	field.append(input, members, add, picker, manager);
	const closeOutside = event => {
		if (!field.isConnected) {
			document.removeEventListener('pointerdown', closeOutside);
			return;
		}
		if (!field.contains(event.target)) {
			picker.classList.add('hidden');
			manager.classList.add('hidden');
		} else {
			for (const property of manager.querySelectorAll('.master-npc-property-picker')) {
				if (!property.contains(event.target)) property.querySelector('.master-npc-property-dropdown')?.classList.add('hidden');
			}
			for (const property of manager.querySelectorAll('.contest-ability-property')) {
				if (!property.contains(event.target)) property.querySelector('.contest-ability-dropdown')?.classList.add('hidden');
			}
			if (!event.target.closest('.master-npc-pokemon-attributes')) {
				manager.querySelector('.master-npc-attribute-editor')?.classList.add('hidden');
				manager.querySelector('.contest-nature-panel')?.classList.add('hidden');
			}
			if (!event.target.closest('.master-npc-pokemon-moves')) manager.querySelector('.master-npc-move-dropdown')?.remove();
		}
	};
	document.addEventListener('pointerdown', closeOutside);
	update();
	return field;
}

function renderMasterNPCForm(library, folderId, existing, refresh) {
	const form = createElement('form', 'panel master-npc-editor');
	form.append(createElement('h3', '', existing ? 'Editar NPC' : 'Criar NPC'));
	const grid = createElement('div', 'master-npc-form-grid');
	grid.append(
		masterNPCTrainerPicker(existing?.sprite),
		masterNPCField('Nome', 'name', existing?.name),
		masterNPCField('Papel', 'role', existing?.role),
		masterNPCField('Local', 'location', existing?.location),
		masterNPCField('Especialidade', 'specialty', existing?.specialty),
		masterNPCField('Uso', 'usage', existing?.usage),
		masterNPCField('Informa\u00e7\u00f5es b\u00e1sicas e localiza\u00e7\u00e3o', 'basicInfo', existing?.basicInfo, true),
		masterNPCField('Descri\u00e7\u00e3o', 'description', existing?.description, true),
		masterNPCTeamPicker(existing),
		masterNPCField('Anota\u00e7\u00f5es', 'notes', existing?.notes, true)
	);
	form.append(grid);
	const actions = createElement('div', 'master-npc-editor-actions');
	if (existing) {
		const remove = button('Excluir NPC');
		remove.type = 'button';
		let deletionArmed = false;
		remove.addEventListener('click', () => {
			if (!deletionArmed) {
				deletionArmed = true;
				remove.classList.add('danger');
				remove.textContent = 'Confirmar exclus\u00e3o';
				return;
			}
			library.npcs = library.npcs.filter(npc => npc.id !== existing.id);
			saveMasterNPCLibrary(library);
			showToast('NPC exclu\u00eddo.');
			refresh();
		});
		actions.append(remove);
	}
	const cancel = button('Cancelar');
	cancel.type = 'button';
	cancel.addEventListener('click', refresh);
	const save = button(existing ? 'Salvar altera\u00e7\u00f5es' : 'Salvar NPC', 'primary');
	save.type = 'submit';
	actions.append(cancel, save);
	form.append(actions);
	form.addEventListener('submit', event => {
		event.preventDefault();
		const values = Object.fromEntries(new FormData(form));
		values.name = String(values.name || '').trim();
		try { values.team = JSON.parse(String(values.team || '[]')); } catch { values.team = []; }
		delete values.teams;
		if (!values.name) return showToast('Informe o nome do NPC.', true);
		const npc = {...existing, ...values, id: existing?.id || masterNPCId('npc'), folderId, order: existing?.order ?? Date.now()};
		const index = library.npcs.findIndex(entry => entry.id === npc.id);
		if (index >= 0) library.npcs[index] = npc;
		else library.npcs.push(npc);
		saveMasterNPCLibrary(library);
		showToast(existing ? 'NPC atualizado.' : 'NPC salvo.');
		refresh();
	});
	return form;
}

function renderMasterNPCRow(npc, library, refresh) {
	const details = createElement('details', 'panel master-npc-row');
	const summary = createElement('summary', 'master-npc-summary');
	const sprite = createElement('span', 'master-npc-row-sprite');
	if (npc.sprite) {
		const image = createElement('img');
		image.src = RPGAssets.url('sprites/trainers/' + npc.sprite.replace(/\.png$/i, '') + '.png');
		image.alt = '';
		sprite.append(image);
	} else sprite.textContent = initials(npc.name);
	summary.append(sprite, createElement('strong', '', npc.name || '\u2014'));
	for (const value of [npc.role, npc.location, npc.specialty]) summary.append(createElement('span', '', value || '\u2014'));
	const teamEntries = (Array.isArray(npc.team) ? npc.team : String(npc.teams || '').split(/[,;\n]+/))
		.map(entry => typeof entry === 'string' ? {species: entry.trim(), name: entry.trim()} : entry)
		.filter(entry => String(entry?.species || entry?.name || '').trim()).slice(0, 6);
	summary.append(createElement('span', '', npc.usage || '\u2014'));
	details.append(summary);
	const expanded = createElement('div', 'master-npc-expanded');
	const sections = [
		['Informa\u00e7\u00f5es b\u00e1sicas e localiza\u00e7\u00e3o', npc.basicInfo],
		['Descri\u00e7\u00e3o', npc.description], ['Equipes do NPC', null], ['Anota\u00e7\u00f5es', npc.notes],
	];
	for (const [title, content] of sections) {
		const section = createElement('section');
		section.append(createElement('h4', '', title));
		if (title === 'Equipes do NPC') {
			const team = createElement('div', 'master-npc-expanded-team');
			for (const entry of teamEntries) {
				const member = createElement('div', 'master-npc-expanded-member');
				member.append(pokemonSprite(entry), createElement('strong', '', entry.name || entry.species));
				team.append(member);
			}
			if (!teamEntries.length) team.append(createElement('p', '', 'Nenhum Pok\u00e9mon registrado.'));
			section.append(team);
		} else section.append(createElement('p', '', content || 'Nenhuma informa\u00e7\u00e3o registrada.'));
		expanded.append(section);
	}
	const actions = createElement('div', 'master-npc-row-actions');
	const edit = button('Editar');
	edit.addEventListener('click', () => details.replaceWith(renderMasterNPCForm(library, npc.folderId, npc, refresh)));
	actions.append(edit);
	expanded.append(actions);
	details.append(expanded);
	return details;
}

function sanitizeMasterNoteHTML(value) {
	const template = document.createElement('template');
	template.innerHTML = String(value || '');
	const allowedTags = new Set(['DIV', 'P', 'BR', 'HR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'SUP', 'SUB', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'SPAN', 'FONT']);
	let removed = true;
	while (removed) {
		removed = false;
		for (const child of [...template.content.querySelectorAll('*')]) {
			if (allowedTags.has(child.tagName)) continue;
			child.replaceWith(...child.childNodes);
			removed = true;
		}
	}
	for (const child of [...template.content.querySelectorAll('*')]) {
			const alignment = child.style.textAlign;
			const color = child.style.color;
			const backgroundColor = child.style.backgroundColor;
			const fontFamily = child.style.fontFamily;
			const fontSize = child.style.fontSize;
			const face = child.getAttribute('face');
			const size = child.getAttribute('size');
			child.removeAttribute('style');
			for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
			if (['left', 'center', 'right', 'justify'].includes(alignment)) child.style.textAlign = alignment;
			if (color) child.style.color = color;
			if (backgroundColor) child.style.backgroundColor = backgroundColor;
			if (fontFamily && /^[\w\s,'-]+$/.test(fontFamily)) child.style.fontFamily = fontFamily;
			if (fontSize && /^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%))$/.test(fontSize)) child.style.fontSize = fontSize;
			if (child.tagName === 'FONT' && face && /^[\w\s,'-]+$/.test(face)) child.setAttribute('face', face);
			if (child.tagName === 'FONT' && /^[1-7]$/.test(size || '')) child.setAttribute('size', size);
	}
	return template.innerHTML;
}

function masterNoteToolbarIcon(name) {
	const icons = {
		undo: '<path d="M9 6H4l3-3M4 6c7-1 10 2 10 7"/>',
		redo: '<path d="M9 6h5l-3-3m3 3C7 5 4 8 4 13"/>',
		bold: '<path d="M6 3h5a3 3 0 0 1 0 6H6zm0 6h6a3 3 0 0 1 0 6H6z"/><path d="M6 3v12"/>',
		italic: '<path d="M9 3h5M4 15h5M11 3 7 15"/>',
		underline: '<path d="M5 3v6a4 4 0 0 0 8 0V3M4 16h10"/>',
		strikethrough: '<path d="M12.8 5.5C12.2 3.5 6 2.5 6 6c0 1.4 1.6 2 3.5 2.5M4 9h11m-8 3c.8 3 7 2.5 7-.5 0-1.3-1.4-2-3.2-2.5"/>',
		superscript: '<path d="m4 7 5 7m0-7-5 7"/><path d="M11 3c3-2 4 2 0 4h4"/>',
		subscript: '<path d="m4 4 5 7m0-7-5 7"/><path d="M11 12c3-2 4 2 0 4h4"/>',
		insertunorderedlist: '<circle cx="3" cy="5" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="3" cy="13" r="1"/><path d="M7 5h8M7 9h8M7 13h8"/>',
		insertorderedlist: '<path d="M2 4h2v3M2 7h3m-3 3c3-2 4 1 0 3h3M8 5h7M8 9h7M8 13h7"/>',
		justifyleft: '<path d="M3 4h12M3 7h8M3 10h12M3 13h8"/>',
		justifycenter: '<path d="M3 4h12M5 7h8M3 10h12M5 13h8"/>',
		justifyright: '<path d="M3 4h12M7 7h8M3 10h12M7 13h8"/>',
		justifyfull: '<path d="M3 4h12M3 7h12M3 10h12M3 13h12"/>',
		outdent: '<path d="M8 4h7M8 7h7M8 11h7M8 14h7M2 9h5M2 9l3-3M2 9l3 3"/>',
		indent: '<path d="M8 4h7M8 7h7M8 11h7M8 14h7M2 9h5M7 9 4 6M7 9l-3 3"/>',
		inserthorizontalrule: '<path d="M2 9h14"/><path d="m5 6-2 3 2 3m8-6 2 3-2 3"/>',
		removeformat: '<path d="M4 4h9M8.5 4 5 14m2.5-4 4 4M10 14h5"/><path d="m11 10 4 4-2 2-4-4z"/>',
	};
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 18 18');
	svg.setAttribute('aria-hidden', 'true');
	svg.innerHTML = icons[name.toLowerCase()] || '';
	return svg;
}

function renderMasterNoteForm(library, folderId, existing, refresh, saveLibrary = saveMasterNPCLibrary) {
	const playerDocument = saveLibrary === savePlayerDocuments;
	const form = createElement('form', 'panel master-note-editor');
	form.append(createElement('h3', '', existing ? 'Editar bloco de notas' : 'Criar bloco de notas'));
	const title = masterNPCField('T\u00edtulo', 'title', existing?.title || '');
	const textField = createElement('div', 'master-npc-form-field master-note-text-field');
	textField.append(createElement('span', '', 'Texto'));
	const editor = createElement('div', 'master-note-content-editor');
	editor.contentEditable = 'true';
	editor.setAttribute('role', 'textbox');
	editor.setAttribute('aria-multiline', 'true');
	editor.dataset.placeholder = 'Escreva livremente...';
	if (existing?.format === 'rich') editor.innerHTML = sanitizeMasterNoteHTML(existing.content);
	else editor.textContent = existing?.content || '';
	const toolbar = createElement('div', 'master-note-toolbar');
	const command = (titleText, name, value = null) => {
		const control = button('', 'master-note-format-button format-' + name.toLowerCase()); control.type = 'button'; control.setAttribute('aria-label', titleText);
		control.append(masterNoteToolbarIcon(name));
		control.addEventListener('mousedown', event => event.preventDefault());
		control.addEventListener('click', () => { editor.focus(); document.execCommand(name, false, value); });
		return control;
	};
	const format = createElement('select', 'master-note-format-select');
	for (const [label, value] of [['Texto', 'p'], ['T\u00edtulo', 'h2'], ['Subt\u00edtulo', 'h3'], ['Cita\u00e7\u00e3o', 'blockquote']]) format.append(new Option(label, value));
	format.addEventListener('change', () => { editor.focus(); document.execCommand('formatBlock', false, format.value); format.value = 'p'; });
	const font = createElement('select', 'master-note-format-select');
	for (const value of [
		'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS',
		'Courier New', 'Garamond', 'Georgia', 'Impact', 'Palatino Linotype', 'Segoe UI',
		'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
	]) font.append(new Option(value, value));
	font.addEventListener('change', () => { editor.focus(); document.execCommand('fontName', false, font.value); });
	const size = createElement('select', 'master-note-format-select');
	for (const value of [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]) size.append(new Option(String(value), String(value)));
	size.value = '12';
	size.setAttribute('aria-label', 'Tamanho da fonte');
	size.addEventListener('change', () => {
		editor.focus();
		document.execCommand('fontSize', false, '7');
		for (const element of editor.querySelectorAll('font[size="7"]')) {
			element.removeAttribute('size');
			element.style.fontSize = size.value + 'pt';
		}
	});
	const colorControl = (label, commandName, initial) => {
		const wrapper = createElement('label', 'master-note-color-control');
		wrapper.append(createElement('span', '', label));
		const input = createElement('input'); input.type = 'color'; input.value = initial;
		input.setAttribute('aria-label', label);
		input.addEventListener('input', () => { editor.focus(); document.execCommand(commandName, false, input.value); });
		wrapper.append(input); return wrapper;
	};
	const groupStart = control => { control.classList.add('toolbar-group-start'); return control; };
	const textColor = colorControl('Texto', 'foreColor', '#263d5a');
	const highlightColor = colorControl('Marca-texto', 'hiliteColor', '#fff29a');
	toolbar.append(
		command('Desfazer', 'undo'), command('Refazer', 'redo'),
		groupStart(format), font, size,
		groupStart(command('Negrito', 'bold')), command('It\u00e1lico', 'italic'), command('Sublinhado', 'underline'), command('Riscado', 'strikeThrough'),
		command('Subscrito', 'subscript'), command('Sobrescrito', 'superscript'), command('Limpar formata\u00e7\u00e3o', 'removeFormat'),
		groupStart(textColor), highlightColor,
		groupStart(command('Lista com marcadores', 'insertUnorderedList')), command('Lista numerada', 'insertOrderedList'),
		command('Diminuir recuo', 'outdent'), command('Aumentar recuo', 'indent'),
		groupStart(command('Alinhar \u00e0 esquerda', 'justifyLeft')), command('Centralizar', 'justifyCenter'),
		command('Alinhar \u00e0 direita', 'justifyRight'), command('Justificar', 'justifyFull'),
		groupStart(command('Inserir linha divis\u00f3ria', 'insertHorizontalRule'))
	);
	textField.append(editor, toolbar);
	form.append(title, textField);
	let selectedPokemon = playerDocument && Array.isArray(existing?.pokemonSprites) ? structuredClone(existing.pokemonSprites) : [];
	if (playerDocument) {
		const pokemonField = createElement('div', 'master-npc-form-field player-note-pokemon-field');
		pokemonField.append(createElement('span', '', 'Sprites de Pokémon'));
		const selectedList = createElement('div', 'player-note-pokemon-selected');
		const pickerToggle = button('Adicionar Pokémon');
		pickerToggle.type = 'button';
		const picker = createElement('div', 'player-note-pokemon-picker hidden');
		const search = createElement('input');
		search.type = 'search';
		search.placeholder = 'Buscar Pokémon...';
		const results = createElement('div', 'player-note-pokemon-results');
		let catalog = [];
		const pokemonKey = pokemon => String(pokemon?.id || pokemon?.spriteId || pokemon?.name || pokemon?.species || '');
		const renderSelected = () => {
			selectedList.replaceChildren();
			for (const pokemon of selectedPokemon) {
				const entry = createElement('div', 'player-note-pokemon-chip');
				entry.append(pokemonSprite(pokemon), createElement('strong', '', pokemon.name || pokemon.species));
				const remove = button('×', 'danger');
				remove.type = 'button';
				remove.setAttribute('aria-label', 'Remover ' + (pokemon.name || pokemon.species));
				remove.addEventListener('click', () => {
					selectedPokemon = selectedPokemon.filter(candidate => pokemonKey(candidate) !== pokemonKey(pokemon));
					renderSelected(); renderResults();
				});
				entry.append(remove); selectedList.append(entry);
			}
			selectedList.classList.toggle('hidden', !selectedPokemon.length);
		};
		const renderResults = () => {
			const query = rpgSpriteKey(search.value);
			results.replaceChildren();
			for (const pokemon of catalog.filter(entry => !query || rpgSpriteKey(entry.name).includes(query))) {
				const selected = selectedPokemon.some(candidate => pokemonKey(candidate) === pokemonKey(pokemon));
				const option = button('', 'master-npc-pokemon-option' + (selected ? ' selected' : ''));
				option.type = 'button';
				option.append(pokemonSprite(pokemon), createElement('span', '', pokemon.name));
				option.addEventListener('click', () => {
					if (selected) selectedPokemon = selectedPokemon.filter(candidate => pokemonKey(candidate) !== pokemonKey(pokemon));
					else selectedPokemon.push({id: pokemon.id, name: pokemon.name, species: pokemon.name, spriteId: pokemon.spriteId, baseSpriteId: pokemon.baseSpriteId});
					renderSelected(); renderResults();
				});
				results.append(option);
			}
		};
		pickerToggle.addEventListener('click', async () => {
			picker.classList.toggle('hidden');
			if (picker.classList.contains('hidden')) return;
			if (!catalog.length) {
				results.replaceChildren(createElement('div', 'loading-block', 'Carregando Pokémon...'));
				try { catalog = (await api('/battle-pokemon')).pokemon || []; renderResults(); } catch (error) { showToast(error.message, true); }
			}
			search.focus();
		});
		search.addEventListener('input', renderResults);
		picker.append(search, results);
		pokemonField.append(selectedList, pickerToggle, picker);
		form.append(pokemonField);
		renderSelected();
		const closePickerOutside = event => {
			if (!form.isConnected) return document.removeEventListener('pointerdown', closePickerOutside);
			if (!pokemonField.contains(event.target)) picker.classList.add('hidden');
		};
		document.addEventListener('pointerdown', closePickerOutside);
	}
	const actions = createElement('div', 'master-npc-editor-actions');
	if (existing) {
		const remove = button('Excluir bloco');
		remove.type = 'button';
		let deletionArmed = false;
		remove.addEventListener('click', () => {
			if (!deletionArmed) {
				deletionArmed = true;
				remove.classList.add('danger');
				remove.textContent = 'Confirmar exclus\u00e3o';
				return;
			}
			library.notes = (library.notes || []).filter(note => note.id !== existing.id);
			saveLibrary(library); refresh(); showToast('Bloco de notas exclu\u00eddo.');
		});
		actions.append(remove);
	}
	const cancel = button('Cancelar'); cancel.type = 'button'; cancel.addEventListener('click', refresh);
	const save = button(existing ? 'Salvar altera\u00e7\u00f5es' : 'Salvar bloco', 'primary'); save.type = 'submit';
	actions.append(cancel, save); form.append(actions);
	form.addEventListener('submit', event => {
		event.preventDefault();
		const values = Object.fromEntries(new FormData(form));
		values.title = String(values.title || '').trim();
		values.content = sanitizeMasterNoteHTML(editor.innerHTML);
		values.format = 'rich';
		if (playerDocument) values.pokemonSprites = selectedPokemon;
		if (!values.title) return showToast('Informe o t\u00edtulo do bloco de notas.', true);
		const note = {...existing, ...values, id: existing?.id || masterNPCId('note'), folderId, order: existing?.order ?? Date.now()};
		library.notes ||= [];
		const index = library.notes.findIndex(entry => entry.id === note.id);
		if (index >= 0) library.notes[index] = note; else library.notes.push(note);
		saveLibrary(library); refresh(); showToast(existing ? 'Bloco atualizado.' : 'Bloco de notas salvo.');
	});
	return form;
}

function renderMasterNoteRow(note, library, refresh, saveLibrary = saveMasterNPCLibrary) {
	const playerDocument = saveLibrary === savePlayerDocuments;
	const details = createElement('details', 'panel master-note-row');
	const summary = createElement('summary', 'master-note-summary');
	const edit = button('Editar'); edit.type = 'button';
	edit.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		details.replaceWith(renderMasterNoteForm(library, note.folderId, note, refresh, saveLibrary));
	});
	summary.append(createElement('strong', '', note.title || 'Sem t\u00edtulo'), edit);
	const expanded = createElement('div', 'master-note-expanded');
	const content = createElement('div', 'master-note-rendered');
	if (note.format === 'rich') content.innerHTML = sanitizeMasterNoteHTML(note.content);
	else content.textContent = note.content || '';
	if (!content.textContent.trim()) content.textContent = 'Este bloco est\u00e1 vazio.';
	expanded.append(content);
	if (playerDocument && Array.isArray(note.pokemonSprites) && note.pokemonSprites.length) {
		const pokemonList = createElement('div', 'player-note-pokemon-display');
		for (const pokemon of note.pokemonSprites) {
			const entry = createElement('div', 'player-note-pokemon-display-entry');
			entry.append(pokemonSprite(pokemon), createElement('strong', '', pokemon.name || pokemon.species));
			pokemonList.append(entry);
		}
		expanded.append(pokemonList);
	}
	details.append(summary, expanded);
	return details;
}

function enableMasterLibraryRecordSorting(list, library, saveLibrary = saveMasterNPCLibrary) {
	let dragged = null;
	for (const row of list.querySelectorAll('.master-library-sortable')) {
		row.draggable = true;
		row.addEventListener('dragstart', event => {
			if (event.target.closest('button, input, select, textarea, [contenteditable="true"]')) {
				event.preventDefault();
				return;
			}
			dragged = row;
			row.classList.add('dragging');
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', row.dataset.recordId || '');
		});
		row.addEventListener('dragend', () => {
			row.classList.remove('dragging');
			list.querySelectorAll('.drag-target').forEach(element => element.classList.remove('drag-target'));
			dragged = null;
		});
	}
	list.addEventListener('dragover', event => {
		if (!dragged) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		const target = event.target.closest('.master-library-sortable');
		list.querySelectorAll('.drag-target').forEach(element => element.classList.remove('drag-target'));
		if (!target || target === dragged) return;
		target.classList.add('drag-target');
		const before = event.clientY < target.getBoundingClientRect().top + target.offsetHeight / 2;
		list.insertBefore(dragged, before ? target : target.nextSibling);
	});
	list.addEventListener('drop', event => {
		if (!dragged) return;
		event.preventDefault();
		const rows = [...list.querySelectorAll('.master-library-sortable')];
		rows.forEach((row, index) => {
			const collection = row.dataset.recordType === 'note' ? library.notes : library.npcs;
			const record = collection.find(entry => entry.id === row.dataset.recordId);
			if (record) record.order = index;
		});
		saveLibrary(library);
		showToast('Organiza\u00e7\u00e3o salva.');
	});
}

function renderMasterNPCFolders(folderId = null) {
	const library = readMasterNPCLibrary();
	const root = createElement('div', 'master-npc-library');
	const refresh = () => {
		const next = renderMasterNPCFolders(folderId);
		if (root.isConnected) root.replaceWith(next);
		else $('#dashboard-body').replaceChildren(next);
	};
	if (folderId) {
		const trail = [];
		let cursor = library.folders.find(folder => folder.id === folderId);
		while (cursor) { trail.unshift(cursor); cursor = library.folders.find(folder => folder.id === cursor.parentId); }
		const breadcrumbs = createElement('nav', 'master-npc-breadcrumbs');
		const folderToggle = button('', 'master-npc-folder-collapse-toggle');
		const foldersCollapsed = !masterNPCExpandedFolderIds.has(folderId);
		folderToggle.setAttribute('aria-label', foldersCollapsed ? 'Mostrar pastas' : 'Minimizar pastas');
		folderToggle.setAttribute('aria-expanded', String(!foldersCollapsed));
		folderToggle.classList.toggle('collapsed', foldersCollapsed);
		folderToggle.append(createElement('span', 'master-npc-folder-collapse-arrow'));
		folderToggle.addEventListener('click', () => {
			const collapsed = !root.querySelector('.master-npc-folder-grid')?.classList.contains('folders-collapsed');
			if (collapsed) masterNPCExpandedFolderIds.delete(folderId);
			else masterNPCExpandedFolderIds.add(folderId);
			root.querySelector('.master-npc-folder-grid')?.classList.toggle('folders-collapsed', collapsed);
			folderToggle.classList.toggle('collapsed', collapsed);
			folderToggle.setAttribute('aria-expanded', String(!collapsed));
			folderToggle.setAttribute('aria-label', collapsed ? 'Mostrar pastas' : 'Minimizar pastas');
		});
		const home = button('NPCs e selvagens');
		home.addEventListener('click', () => root.replaceWith(renderMasterNPCFolders()));
		breadcrumbs.append(folderToggle, home);
		for (const folder of trail) {
			breadcrumbs.append(createElement('span', '', '\u203a'));
			const crumb = button(folder.name);
			crumb.addEventListener('click', () => root.replaceWith(renderMasterNPCFolders(folder.id)));
			breadcrumbs.append(crumb);
		}
		root.append(breadcrumbs);
	}
	const grid = createElement('div', 'master-npc-folder-grid');
	if (folderId && !masterNPCExpandedFolderIds.has(folderId)) grid.classList.add('folders-collapsed');
	for (const folder of library.folders.filter(folder => folder.parentId === folderId)) {
		const tile = button('', 'panel master-npc-folder folder-' + folder.kind);
		if (folder.color) {
			tile.style.setProperty('--npc-folder-color', folder.color);
			tile.style.setProperty('--npc-folder-light', folder.lightColor || folder.color);
		}
		if (folder.id === masterNPCLastCreatedFolderId) {
			tile.classList.add('folder-created');
			masterNPCLastCreatedFolderId = '';
		}
		tile.append(createElement('span', 'master-npc-folder-icon'), createElement('div', 'master-npc-folder-copy'));
		tile.lastChild.append(createElement('strong', '', folder.name), createElement('small', '', 'Abrir pasta'));
		tile.addEventListener('click', () => root.replaceWith(renderMasterNPCFolders(folder.id)));
		if (!folder.locked) tile.addEventListener('contextmenu', event => openMasterNPCFolderMenu(event, folder, library, refresh));
		grid.append(tile);
	}
	const createFolder = createElement('section', 'master-npc-folder-create');
	createFolder.tabIndex = 0;
	createFolder.setAttribute('role', 'button');
	const createIcon = createElement('span', 'master-npc-folder-create-icon', '+');
	const createCopy = createElement('div', 'master-npc-folder-create-copy');
	const createTitle = createElement('strong', '', 'Criar pasta');
	const createHint = createElement('small', '', folderId ? 'Criar dentro desta pasta' : 'Nova organiza\u00e7\u00e3o personalizada');
	createCopy.append(createTitle, createHint);
	createFolder.append(createIcon, createCopy);
	const beginCreation = () => {
		if (createFolder.classList.contains('editing')) return;
		createFolder.classList.add('editing');
		createFolder.removeAttribute('role');
		createFolder.tabIndex = -1;
		const input = createElement('input', 'master-npc-folder-name');
		input.type = 'text';
		input.maxLength = 40;
		input.placeholder = 'Nome da pasta';
		createTitle.replaceWith(input);
		createHint.textContent = 'Escolha uma cor para criar';
		const palette = createElement('div', 'master-npc-folder-palette');
		const cancelCreation = event => {
			if (event && createFolder.contains(event.target)) return;
			document.removeEventListener('pointerdown', cancelCreation);
			refresh();
		};
		for (const color of MASTER_NPC_FOLDER_COLORS) {
			const swatch = button('', 'master-npc-folder-swatch');
			swatch.type = 'button';
			swatch.style.setProperty('--swatch-color', color.value);
			swatch.setAttribute('aria-label', 'Criar pasta com esta cor');
			swatch.addEventListener('click', event => {
				event.stopPropagation();
				const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
				if (!name) { input.focus(); return showToast('Informe um nome para a pasta.', true); }
				if (library.folders.some(entry => entry.parentId === folderId && entry.name.localeCompare(name, 'pt-BR', {sensitivity: 'base'}) === 0)) return showToast('J\u00e1 existe uma pasta com esse nome.', true);
				const id = masterNPCId('folder');
				library.folders.push({id, name, parentId: folderId, kind: 'custom', color: color.value, lightColor: color.light});
				saveMasterNPCLibrary(library);
				masterNPCLastCreatedFolderId = id;
				document.removeEventListener('pointerdown', cancelCreation);
				refresh();
				showToast('Pasta criada.');
			});
			palette.append(swatch);
		}
		createFolder.append(palette);
		input.addEventListener('click', event => event.stopPropagation());
		input.addEventListener('keydown', event => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			document.removeEventListener('pointerdown', cancelCreation);
			refresh();
		});
		setTimeout(() => document.addEventListener('pointerdown', cancelCreation), 0);
		input.focus();
	};
	createFolder.addEventListener('click', beginCreation);
	createFolder.addEventListener('keydown', event => {
		if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginCreation(); }
	});
	grid.append(createFolder);
	root.append(grid);
	if (folderId && folderId !== 'pokemon') {
		const listHeader = createElement('div', 'master-npc-list-header');
		const listActions = createElement('div', 'master-npc-list-actions');
		const createNote = button('Criar bloco de notas', 'primary');
		const createNPC = button('Criar NPC', 'primary');
		createNote.addEventListener('click', () => root.replaceWith(renderMasterNoteForm(library, folderId, null, refresh)));
		createNPC.addEventListener('click', () => root.replaceWith(renderMasterNPCForm(library, folderId, null, refresh)));
		listActions.append(createNote, createNPC);
		listHeader.append(createElement('h3', '', 'NPCs e anota\u00e7\u00f5es'), listActions);
		root.append(listHeader);
		const npcs = library.npcs.filter(npc => npc.folderId === folderId);
		const notes = (library.notes || []).filter(note => note.folderId === folderId);
		if (!npcs.length && !notes.length) root.append(createElement('div', 'panel master-npc-empty', 'Nenhum arquivo salvo nesta pasta.'));
		if (npcs.length && !notes.length) {
			const columns = createElement('div', 'master-npc-column-labels');
			for (const label of ['Sprite', 'Nome', 'Papel', 'Local', 'Especialidade', 'Uso']) columns.append(createElement('span', '', label));
			root.append(columns);
		}
		if (npcs.length || notes.length) {
			const recordList = createElement('div', 'master-library-record-list');
			const records = [
				...npcs.map((record, index) => ({type: 'npc', record, fallback: index})),
				...notes.map((record, index) => ({type: 'note', record, fallback: npcs.length + index})),
			].sort((a, b) => {
				const aOrder = Number.isFinite(Number(a.record.order)) ? Number(a.record.order) : a.fallback;
				const bOrder = Number.isFinite(Number(b.record.order)) ? Number(b.record.order) : b.fallback;
				return aOrder - bOrder;
			});
			for (const entry of records) {
				const row = entry.type === 'npc' ? renderMasterNPCRow(entry.record, library, refresh) : renderMasterNoteRow(entry.record, library, refresh);
				row.classList.add('master-library-sortable');
				row.dataset.recordType = entry.type;
				row.dataset.recordId = entry.record.id;
				recordList.append(row);
			}
			enableMasterLibraryRecordSorting(recordList, library);
			root.append(recordList);
		}
	}
	return root;
}

let playerDocumentsLibrary = null;
let playerDocumentsSaveChain = Promise.resolve();
let playerDocumentsLastCreatedFolderId = '';
const playerDocumentsExpandedFolderIds = new Set();

function normalizePlayerDocuments(value) {
	const source = value && typeof value === 'object' ? value : {};
	return {
		folders: Array.isArray(source.folders) ? source.folders.filter(folder => folder?.id && folder?.name).map(folder => ({...folder, locked: false, kind: 'custom'})) : [],
		notes: Array.isArray(source.notes) ? source.notes.filter(note => note?.id && note?.folderId) : [],
		npcs: [],
	};
}

function savePlayerDocuments(library) {
	playerDocumentsLibrary = normalizePlayerDocuments(library);
	const stored = {folders: playerDocumentsLibrary.folders, notes: playerDocumentsLibrary.notes};
	playerDocumentsSaveChain = playerDocumentsSaveChain
		.then(() => api('/documents', {method: 'PUT', body: {library: stored}}))
		.catch(error => showToast('N\u00e3o foi poss\u00edvel salvar os documentos: ' + error.message, true));
}

async function renderPlayerDocumentsDashboard() {
	const response = await api('/documents');
	playerDocumentsLibrary = normalizePlayerDocuments(response.library);
	return renderPlayerDocumentFolders();
}

function renderPlayerDocumentFolders(folderId = null) {
	const library = playerDocumentsLibrary || normalizePlayerDocuments(null);
	const root = createElement('div', 'master-npc-library player-documents-library');
	const refresh = () => {
		const next = renderPlayerDocumentFolders(folderId);
		if (root.isConnected) root.replaceWith(next);
		else $('#dashboard-body').replaceChildren(next);
	};
	if (folderId) {
		const trail = [];
		let cursor = library.folders.find(folder => folder.id === folderId);
		while (cursor) { trail.unshift(cursor); cursor = library.folders.find(folder => folder.id === cursor.parentId); }
		const breadcrumbs = createElement('nav', 'master-npc-breadcrumbs');
		const folderToggle = button('', 'master-npc-folder-collapse-toggle');
		const foldersCollapsed = !playerDocumentsExpandedFolderIds.has(folderId);
		folderToggle.setAttribute('aria-label', foldersCollapsed ? 'Mostrar pastas' : 'Minimizar pastas');
		folderToggle.setAttribute('aria-expanded', String(!foldersCollapsed));
		folderToggle.classList.toggle('collapsed', foldersCollapsed);
		folderToggle.append(createElement('span', 'master-npc-folder-collapse-arrow'));
		folderToggle.addEventListener('click', () => {
			const collapsed = !root.querySelector('.master-npc-folder-grid')?.classList.contains('folders-collapsed');
			if (collapsed) playerDocumentsExpandedFolderIds.delete(folderId); else playerDocumentsExpandedFolderIds.add(folderId);
			root.querySelector('.master-npc-folder-grid')?.classList.toggle('folders-collapsed', collapsed);
			folderToggle.classList.toggle('collapsed', collapsed);
			folderToggle.setAttribute('aria-expanded', String(!collapsed));
			folderToggle.setAttribute('aria-label', collapsed ? 'Mostrar pastas' : 'Minimizar pastas');
		});
		const home = button('Documentos');
		home.addEventListener('click', () => root.replaceWith(renderPlayerDocumentFolders()));
		breadcrumbs.append(folderToggle, home);
		for (const folder of trail) {
			breadcrumbs.append(createElement('span', '', '\u203a'));
			const crumb = button(folder.name);
			crumb.addEventListener('click', () => root.replaceWith(renderPlayerDocumentFolders(folder.id)));
			breadcrumbs.append(crumb);
		}
		root.append(breadcrumbs);
	}
	const grid = createElement('div', 'master-npc-folder-grid');
	if (folderId && !playerDocumentsExpandedFolderIds.has(folderId)) grid.classList.add('folders-collapsed');
	for (const folder of library.folders.filter(folder => folder.parentId === folderId)) {
		const tile = button('', 'panel master-npc-folder folder-custom');
		if (folder.color) {
			tile.style.setProperty('--npc-folder-color', folder.color);
			tile.style.setProperty('--npc-folder-light', folder.lightColor || folder.color);
		}
		if (folder.id === playerDocumentsLastCreatedFolderId) { tile.classList.add('folder-created'); playerDocumentsLastCreatedFolderId = ''; }
		tile.append(createElement('span', 'master-npc-folder-icon'), createElement('div', 'master-npc-folder-copy'));
		tile.lastChild.append(createElement('strong', '', folder.name), createElement('small', '', 'Abrir pasta'));
		tile.addEventListener('click', () => root.replaceWith(renderPlayerDocumentFolders(folder.id)));
		tile.addEventListener('contextmenu', event => {
			event.preventDefault(); event.stopPropagation(); closeMasterNPCFolderMenu();
			const menu = createElement('div', 'master-npc-folder-menu');
			menu.style.left = event.clientX + 'px'; menu.style.top = event.clientY + 'px';
			const remove = button('Excluir', 'danger');
			remove.addEventListener('click', () => {
				const ids = masterNPCFolderDescendants(library, folder.id);
				const hasContent = ids.size > 1 || library.notes.some(note => ids.has(note.folderId));
				if (hasContent && !confirm('Esta pasta possui conteúdo. Excluir a pasta e todos os blocos de notas dentro dela?')) return;
				library.folders = library.folders.filter(entry => !ids.has(entry.id));
				library.notes = library.notes.filter(note => !ids.has(note.folderId));
				savePlayerDocuments(library); closeMasterNPCFolderMenu(); refresh(); showToast('Pasta excluída.');
			});
			menu.append(remove); document.body.append(menu);
			const width = menu.offsetWidth;
			const height = menu.offsetHeight;
			menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)) + 'px';
			menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)) + 'px';
			setTimeout(() => document.addEventListener('click', closeMasterNPCFolderMenu, {once: true}), 0);
		});
		grid.append(tile);
	}
	const createFolder = createElement('section', 'master-npc-folder-create');
	createFolder.tabIndex = 0; createFolder.setAttribute('role', 'button');
	const createIcon = createElement('span', 'master-npc-folder-create-icon', '+');
	const createCopy = createElement('div', 'master-npc-folder-create-copy');
	const createTitle = createElement('strong', '', 'Criar pasta');
	const createHint = createElement('small', '', folderId ? 'Criar dentro desta pasta' : 'Nova organização personalizada');
	createCopy.append(createTitle, createHint); createFolder.append(createIcon, createCopy);
	const beginCreation = () => {
		if (createFolder.classList.contains('editing')) return;
		createFolder.classList.add('editing'); createFolder.removeAttribute('role'); createFolder.tabIndex = -1;
		const input = createElement('input', 'master-npc-folder-name'); input.type = 'text'; input.maxLength = 40; input.placeholder = 'Nome da pasta';
		createTitle.replaceWith(input); createHint.textContent = 'Escolha uma cor para criar';
		const palette = createElement('div', 'master-npc-folder-palette');
		const cancelCreation = event => { if (event && createFolder.contains(event.target)) return; document.removeEventListener('pointerdown', cancelCreation); refresh(); };
		for (const color of MASTER_NPC_FOLDER_COLORS) {
			const swatch = button('', 'master-npc-folder-swatch'); swatch.type = 'button'; swatch.style.setProperty('--swatch-color', color.value);
			swatch.setAttribute('aria-label', 'Criar pasta com esta cor');
			swatch.addEventListener('click', event => {
				event.stopPropagation(); const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
				if (!name) { input.focus(); return showToast('Informe um nome para a pasta.', true); }
				if (library.folders.some(entry => entry.parentId === folderId && entry.name.localeCompare(name, 'pt-BR', {sensitivity: 'base'}) === 0)) return showToast('Já existe uma pasta com esse nome.', true);
				const id = masterNPCId('folder'); library.folders.push({id, name, parentId: folderId, kind: 'custom', color: color.value, lightColor: color.light});
				savePlayerDocuments(library); playerDocumentsLastCreatedFolderId = id; document.removeEventListener('pointerdown', cancelCreation); refresh(); showToast('Pasta criada.');
			}); palette.append(swatch);
		}
		createFolder.append(palette); input.addEventListener('click', event => event.stopPropagation());
		input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); document.removeEventListener('pointerdown', cancelCreation); refresh(); } });
		setTimeout(() => document.addEventListener('pointerdown', cancelCreation), 0); input.focus();
	};
	createFolder.addEventListener('click', beginCreation);
	createFolder.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginCreation(); } });
	grid.append(createFolder); root.append(grid);
	if (folderId) {
		const listHeader = createElement('div', 'master-npc-list-header');
		const createNote = button('Criar bloco de notas', 'primary');
		createNote.addEventListener('click', () => root.replaceWith(renderMasterNoteForm(library, folderId, null, refresh, savePlayerDocuments)));
		listHeader.append(createElement('h3', '', 'Blocos de notas'), createNote); root.append(listHeader);
		const notes = library.notes.filter(note => note.folderId === folderId);
		if (!notes.length) root.append(createElement('div', 'panel master-npc-empty', 'Nenhum bloco de notas salvo nesta pasta.'));
		else {
			const recordList = createElement('div', 'master-library-record-list');
			for (const note of [...notes].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))) {
				const row = renderMasterNoteRow(note, library, refresh, savePlayerDocuments);
				row.classList.add('master-library-sortable'); row.dataset.recordType = 'note'; row.dataset.recordId = note.id; recordList.append(row);
			}
			enableMasterLibraryRecordSorting(recordList, library, savePlayerDocuments); root.append(recordList);
		}
	}
	return root;
}

function closeDeleteDialog() {
	state.deletionChallenge = null;
	$('#delete-confirmation').value = '';
	$('#delete-modal').classList.add('hidden');
	setError('delete-error', '');
}

async function confirmCharacterDeletion(event) {
	event.preventDefault();
	if (!state.deletionChallenge) return;
	const submit = $('#confirm-delete');
	submit.disabled = true;
	submit.textContent = 'Excluindo...';
	setError('delete-error', '');
	try {
		const data = await api('/character', {
			method: 'DELETE',
			body: {
				challengeId: state.deletionChallenge.challengeId,
				confirmation: $('#delete-confirmation').value,
			},
		});
		saveSession(data.result.session);
		const deletedName = state.currentCharacter.characterName;
		state.currentCharacter = null;
		closeDeleteDialog();
		await renderDashboard();
		showToast('A conta de ' + deletedName + ' foi exclu\u00edda.');
	} catch (error) {
		setError('delete-error', error.message);
		$('#delete-confirmation').select();
	} finally {
		submit.disabled = false;
		submit.textContent = 'Excluir permanentemente';
	}
}

async function renderDashboard() {
	show('dashboard');
	if (state.dashboardView !== 'contests') window.RPGContestUI?.stopAudio?.();
	document.getElementById('dashboard-screen').classList.remove('battle-mode', 'contest-mode');
	const body = $('#dashboard-body');
	body.replaceChildren(createElement('div', 'panel loading-block', 'Carregando painel...'));
	const isMasterMode = state.session.role === 'master' && state.session.mode === 'master';
	dashboardNav(isMasterMode);

	try {
		if (isMasterMode) {
			$('.dashboard-heading').classList.toggle('hidden', ['overview', 'nursery', 'shops'].includes(state.dashboardView));
			$('.dashboard-heading').classList.toggle('master-section-heading', state.dashboardView !== 'overview');
			$('#dashboard-heading-status').classList.toggle('hidden', state.dashboardView === 'overview');
			const data = await api('/characters/all');
			const characters = data.characters;
			state.campaignCharacters = characters;
			resetMasterAvatar();
			$('#profile-name').textContent = 'Mestre';
			$('#profile-role').textContent = 'Controle da campanha';
			$('#dashboard-eyebrow').textContent = state.dashboardView === 'battles' ? 'CENTRO DE BATALHAS' :
				state.dashboardView === 'contests' ? 'PALCO DE CONCURSOS' :
				state.dashboardView === 'npcs' ? 'ARQUIVO DA CAMPANHA' :
				state.dashboardView === 'players' ? 'GESTÃO DE JOGADORES' :
				state.dashboardView === 'tournaments' ? 'CENTRAL DE TORNEIOS' : 'PAINEL DO MESTRE';
			$('#dashboard-eyebrow').classList.remove('hidden');
			$('#dashboard-title').textContent = state.dashboardView === 'battles' ? 'Prepara\u00e7\u00e3o de batalhas' :
				state.dashboardView === 'contests' ? 'Concursos Pok\u00e9mon' :
				state.dashboardView === 'npcs' ? 'NPCs e selvagens' :
				state.dashboardView === 'players' ? 'Jogadores' :
				state.dashboardView === 'tournaments' ? 'Torneios' :
				'Vis\u00e3o geral da campanha';
			$('#dashboard-description').textContent = state.dashboardView === 'battles' ? 'Monte o confronto, envie convites e aguarde as confirma\u00e7\u00f5es.' :
				state.dashboardView === 'contests' ? 'Organize apresenta\u00e7\u00f5es, participantes e convites do concurso.' :
				state.dashboardView === 'npcs' ? 'Organize Pok\u00e9mon importantes e NPCs para batalhas e concursos.' :
				state.dashboardView === 'players' ? 'Acompanhe e gerencie os treinadores desta campanha.' :
				state.dashboardView === 'tournaments' ? 'Crie e acompanhe os torneios da campanha.' :
				'Acompanhe personagens, equipes, recursos e batalhas.';
			$('#logout-button').textContent = 'Sair da sess\u00e3o';
			$('#logout-button').classList.add('danger');
			$('#delete-character').classList.add('hidden');
			body.replaceChildren(
				state.dashboardView === 'battles' ? await renderMasterBattles(characters) :
				state.dashboardView === 'contests' ? await window.RPGContestUI.render({state, api, master: true, characters, rerender: renderDashboard}) :
				state.dashboardView === 'npcs' ? await renderMasterNPCLibraryDashboard() :
				state.dashboardView === 'nursery' ? await renderNursery() :
				state.dashboardView === 'shops' ? await renderShops() :
				await renderMasterBody(characters)
			);
		} else {
			$('.dashboard-heading').classList.remove('master-section-heading');
			$('#dashboard-heading-status').classList.add('hidden');
			$('.dashboard-heading').classList.toggle('hidden', ['overview', 'team', 'box', 'bag', 'team-builder', 'center', 'fossils', 'nursery', 'shops'].includes(state.dashboardView));
			const data = await api('/character');
			const character = data.character;
			state.currentCharacter = character;
			dashboardNav(false);
			setProfileAvatar(character);
			$('#profile-name').textContent = character.characterName;
			$('#profile-role').textContent = state.session.role === 'master' ? 'Visualiza\u00e7\u00e3o do Mestre' : character.playerName;
			$('#dashboard-eyebrow').textContent = '';
			$('#dashboard-eyebrow').classList.add('hidden');
			$('#dashboard-title').textContent = state.dashboardView === 'battles' ? 'Convites de batalha' :
				state.dashboardView === 'contests' ? 'Concursos Pok\u00e9mon' :
				state.dashboardView === 'documents' ? 'Documentos' : 'Ol\u00e1, ' + character.characterName;
			$('#dashboard-description').textContent = state.dashboardView === 'battles' ? 'Participe dos seus combates ou assista aos combates em andamento.' :
				state.dashboardView === 'documents' ? 'Organize suas pastas e blocos de notas.' : 'Sua equipe e seus recursos persistentes.';
			const viewing = state.session.role === 'master';
			$('#logout-button').textContent = viewing ? 'Voltar como Mestre' : 'Sair da sess\u00e3o';
			$('#logout-button').classList.toggle('danger', !viewing);
			$('#delete-character').classList.toggle('hidden', !viewing);
			const playerView = state.dashboardView === 'battles' ? await renderPlayerBattles(character) :
				state.dashboardView === 'contests' ? await window.RPGContestUI.render({state, api, master: false, character, rerender: renderDashboard}) :
				state.dashboardView === 'box' ? await renderPlayerBox(character) :
				state.dashboardView === 'bag' ? await renderPlayerBag(character) :
				state.dashboardView === 'team' ? renderPlayerTeamBody(character) :
				state.dashboardView === 'team-builder' ? await renderPlayerTeamBuilder(character) :
				state.dashboardView === 'center' ? await renderPokemonCenter(character) :
				state.dashboardView === 'fossils' ? await renderFossilLab(character) :
				state.dashboardView === 'nursery' ? await renderNursery(character) :
				state.dashboardView === 'shops' ? await renderShops(character) :
				state.dashboardView === 'documents' ? await renderPlayerDocumentsDashboard() :
				await renderPlayerBody(character);
			body.replaceChildren(playerView);
		}
	} catch (error) {
		if (/session/i.test(error.message)) {
			saveSession(null);
			show('entry');
		}
		body.replaceChildren(createElement('div', 'panel empty-state', error.message));
		showToast(error.message, true);
	}
}

async function logout() {
	try {
		await api('/session', { method: 'DELETE' });
	} catch {}
	saveSession(null);
	state.currentCharacter = null;
	show('entry');
	showToast('Sess\u00e3o RPG encerrada.');
}

$('#choose-master').addEventListener('click', () => {
	setError('master-error', '');
	$('#master-code').value = '';
	show('master');
	$('#master-code').focus();
});
$('#choose-player').addEventListener('click', loadCharacters);
$('#open-create').addEventListener('click', () => {
	setError('create-error', '');
	$('#create-form').reset();
	$('#initial-money').value = '3000';
	selectStarter('Squirtle');
	$('#avatar').value = DEFAULT_AVATAR_ID;
	renderAvatarPicker();
	setAvatarPickerOpen(false);
	setStarterPickerOpen(false);
	show('create');
});
$('#starter-picker-toggle').addEventListener('click', () => {
	const open = $('#starter-picker-toggle').getAttribute('aria-expanded') !== 'true';
	setStarterPickerOpen(open);
});
$('#avatar-picker-toggle').addEventListener('click', () => {
	const open = $('#avatar-picker-toggle').getAttribute('aria-expanded') !== 'true';
	setAvatarPickerOpen(open);
});
$('#avatar-search').addEventListener('input', renderAvatarOptions);
$('#character-search').addEventListener('input', renderCharacterList);
$('#logout-button').addEventListener('click', () => {
	if (state.session?.role === 'master' && state.session.mode !== 'master') return exitPlayerView();
	return logout();
});
$('#delete-character').addEventListener('click', openDeleteDialog);
$('#cancel-delete').addEventListener('click', closeDeleteDialog);
$('#delete-form').addEventListener('submit', confirmCharacterDeletion);

$('#home-button').addEventListener('click', () => state.session ? renderDashboard() : show('entry'));

for (const back of document.querySelectorAll('[data-back]')) {
	back.addEventListener('click', () => {
		if (back.dataset.back === 'player') loadCharacters();
		else show(back.dataset.back);
	});
}

for (const toggle of document.querySelectorAll('.password-toggle')) {
	toggle.addEventListener('click', () => {
		const input = document.getElementById(toggle.dataset.target);
		input.type = input.type === 'password' ? 'text' : 'password';
		toggle.setAttribute('aria-label', input.type === 'password' ? 'Mostrar senha' : 'Ocultar senha');
	});
}

$('#master-form').addEventListener('submit', async event => {
	event.preventDefault();
	const submit = event.submitter;
	setError('master-error', '');
	submit.disabled = true;
	submit.textContent = 'Entrando...';
	try {
		const data = await api('/session/master', {
			method: 'POST',
			body: { code: $('#master-code').value },
		});
		$('#master-code').value = '';
		saveSession(data.session);
		await renderDashboard();
	} catch (error) {
		setError('master-error', error.message);
	} finally {
		submit.disabled = false;
		submit.textContent = 'Entrar no painel';
	}
});

$('#create-form').addEventListener('submit', async event => {
	event.preventDefault();
	const form = event.currentTarget;
	const data = new FormData(form);
	const password = String(data.get('password') || '');
	const confirmation = String(data.get('confirmPassword') || '');
	if (password !== confirmation) {
		setError('create-error', 'As duas senhas RPG precisam ser iguais.');
		return;
	}
	const submit = event.submitter;
	setError('create-error', '');
	submit.disabled = true;
	submit.textContent = 'Criando...';
	const request = {
		characterName: String(data.get('characterName') || ''),
		playerName: String(data.get('playerName') || ''),
		avatar: String(data.get('avatar') || ''),
		password,
		initialMoney: Number(data.get('initialMoney')),
		starter: {
			species: String(data.get('starterSpecies') || ''),
			nickname: String(data.get('starterName') || ''),
			gender: String(data.get('starterGender') || ''),
			level: 5,
		},
	};
	try {
		const created = await api('/characters', { method: 'POST', body: request });
		const login = await api('/session/player', {
			method: 'POST',
			body: { characterId: created.character.id, password },
		});
		form.reset();
		saveSession(login.session);
		await renderDashboard();
		showToast('Personagem criado com sucesso.');
	} catch (error) {
		setError('create-error', error.message);
	} finally {
		submit.disabled = false;
		submit.textContent = 'Criar e entrar';
	}
});

async function startRPG() {
	renderStarterPicker();
	renderAvatarPicker();
	await loadAvatarCatalog();
	await restoreSession();
	startBattleSessionSynchronization();
}

startRPG();
