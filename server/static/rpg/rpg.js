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
};
let battleSessionSyncBusy = false;
let battleSessionSyncTimer = null;

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
	const profile = character.profile || {stats: {}, pokedex: {}, badges: {}};
	const stats = profile.stats || {};
	const caught = profile.pokedex?.caught?.length || 0;
	const seen = profile.pokedex?.seen?.length || 0;

	const identity = createElement('section', 'panel overview-identity');
	const avatar = characterAvatarBadge(character); avatar.classList.add('overview-avatar');
	const identityText = createElement('div', 'overview-identity-copy');
	identityText.append(createElement('h1', '', character.characterName), createElement('strong', '', 'Treinador Pokémon'),
		editableTrainerTagline(character));
	identity.append(avatar, identityText);

	const wallet = section('Carteira');
	const bank = Math.max(0, Number(character.bank?.balance || 0));
	const walletGrid = createElement('div', 'overview-money-grid');
	walletGrid.append(profileMetric('Dinheiro', formatOverviewMoney(character.money)), profileMetric('Banco', formatOverviewMoney(bank)),
		profileMetric('Valor total', formatOverviewMoney(Number(character.money || 0) + bank)));
	wallet.body.append(walletGrid);

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
	const shopDirectory = await api('/shops');
	const grid = createElement('div', 'stat-grid');
	const teamTotal = characters.reduce((total, character) => total + (character.team?.length || 0), 0);
	const moneyTotal = characters.reduce((total, character) => total + (character.money || 0), 0);
	for (const [label, value] of [
		['Jogadores', String(characters.length)],
		['Pok\u00e9mon em equipes', String(teamTotal)],
		['Pokécoins totais', formatMoney(moneyTotal)],
		['Batalhas ativas', '0'],
	]) {
		const card = createElement('div', 'panel stat-card');
		card.append(createElement('small', '', label), createElement('strong', '', value));
		grid.append(card);
	}
	root.append(grid);

	const clock = section('Relógio da campanha');
	clock.panel.classList.add('campaign-clock');
	const clockCopy = createElement('div', 'campaign-clock-copy');
	clockCopy.append(
		createElement('strong', '', 'Avançar o tempo da campanha'),
		createElement('small', '', 'Fósseis, treinamentos e outros sistemas com espera só avançam por estes controles.')
	);
	const clockActions = createElement('div', 'campaign-clock-actions');
	for (const hours of [1, 8]) {
		const advance = button('+' + hours + 'h', 'button primary campaign-clock-button');
		advance.addEventListener('click', async () => {
			for (const control of clockActions.querySelectorAll('button')) control.disabled = true;
			try {
				const data = await api('/campaign/time/advance', { method: 'POST', body: { hours } });
				const time = data.time;
				showToast('Campanha avançada em ' + hours + 'h · ' +
					time.trainings.completed + ' treinamento(s), ' + time.fossils.completed + ' fóssil(is), ' +
					time.breedings.completed + ' ovo(s) produzido(s) e ' + time.incubations.completed + ' incubação(ões) concluída(s).');
				await renderDashboard();
			} catch (error) {
				for (const control of clockActions.querySelectorAll('button')) control.disabled = false;
				showToast(error.message, true);
			}
		});
		clockActions.append(advance);
	}
	clock.body.append(clockCopy, clockActions);
	root.append(clock.panel);
	const players = section('Personagens da campanha');
	players.panel.classList.add('master-players-panel');
	const list = createElement('div', 'master-list');
	for (const character of characters) {
		const row = createElement('div', 'master-row');
		row.append(characterAvatarBadge(character));
		const info = createElement('div', 'master-info');
		info.append(createElement('strong', '', character.characterName));
		info.append(createElement(
			'small', '',
			character.playerName + ' \u00b7 ' + formatMoney(character.money) +
			' \u00b7 ' + (character.team?.length || 0) + ' Pok\u00e9mon'
		));
		const actions = createElement('div', 'master-row-actions');
		const permissions = createElement('div', 'master-page-access');
		const pageToggle = (page, label) => {
			const allowed = character.pageAccess?.[page] !== false;
			const toggle = button(
				(allowed ? '✓ ' : '✕ ') + label,
				'master-access-toggle ' + (allowed ? 'allowed' : 'blocked')
			);
			toggle.setAttribute('aria-pressed', String(allowed));
			toggle.addEventListener('click', async () => {
				toggle.disabled = true;
				try {
					await api('/characters/page-access', {
						method: 'PUT', body: { characterId: character.id, page, allowed: !allowed },
					});
					await renderDashboard();
				} catch (error) {
					toggle.disabled = false;
					showToast(error.message, true);
				}
			});
			return toggle;
		};
		for (const [page, label] of [['box', 'Box'], ['bag', 'Bag'], ['training', 'Treinamento'], ['center', 'Centro Pokémon'], ['fossils', 'Paleontologia'], ['nursery', 'Berçário']]) {
			permissions.append(pageToggle(page, label));
		}
		const shopAccess = createElement('div', 'master-shop-access');
		const shopMain = createElement('div', 'master-shop-access-main');
		shopMain.append(pageToggle('shops', 'Lojas'));
		const shopExpanded = state.expandedShopAccessIds.has(character.id);
		const expandShops = button(shopExpanded ? '▾' : '▸', 'master-shop-access-expand');
		expandShops.title = shopExpanded ? 'Ocultar lojas' : 'Configurar lojas desta cidade';
		expandShops.setAttribute('aria-label', expandShops.title);
		expandShops.setAttribute('aria-expanded', String(shopExpanded));
		expandShops.addEventListener('click', () => {
			if (shopExpanded) state.expandedShopAccessIds.delete(character.id);
			else state.expandedShopAccessIds.add(character.id);
			void renderDashboard();
		});
		shopMain.append(expandShops);
		shopAccess.append(shopMain);
		if (shopExpanded) {
			const shopPanel = createElement('div', 'master-shop-access-panel');
			shopPanel.append(createElement('strong', '', 'Lojas disponíveis nesta cidade'));
			for (const shop of shopDirectory.shops) {
				const row = createElement('div', 'master-shop-access-row');
				row.append(createElement('span', '', shop.name));
				const allowed = character.shopAccess?.[shop.id] !== false;
				const toggle = button(
					allowed ? 'Disponível' : 'Bloqueada',
					'master-access-toggle master-shop-toggle ' + (allowed ? 'allowed' : 'blocked')
				);
				toggle.setAttribute('aria-pressed', String(allowed));
				toggle.addEventListener('click', async () => {
					toggle.disabled = true;
					try {
						await api('/characters/shop-access', {
							method: 'PUT',
							body: { characterId: character.id, shopId: shop.id, allowed: !allowed },
						});
						await renderDashboard();
					} catch (error) {
						toggle.disabled = false;
						showToast(error.message, true);
					}
				});
				row.append(toggle);
				shopPanel.append(row);
			}
			shopAccess.append(shopPanel);
		}
		permissions.append(shopAccess);
		const view = button('Visualizar como Player', 'button');
		view.addEventListener('click', () => viewAsPlayer(character, 'overview'));
		const box = button('Abrir Box', 'button');
		box.addEventListener('click', () => viewAsPlayer(character, 'box'));
		const bag = button('Abrir Bag', 'button');
		bag.addEventListener('click', () => viewAsPlayer(character, 'bag'));
		const center = button('Abrir Centro Pokémon', 'button');
		center.addEventListener('click', () => viewAsPlayer(character, 'center'));
		actions.append(view, box, bag, center);
		const controls = createElement('div', 'master-player-controls');
		controls.append(permissions, actions);
		row.append(info, controls);
		list.append(row);
	}
	if (!characters.length) list.append(createElement('p', '', 'Nenhum personagem foi criado.'));
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
			$('.dashboard-heading').classList.toggle('hidden', ['nursery', 'shops'].includes(state.dashboardView));
			const data = await api('/characters/all');
			const characters = data.characters;
			state.campaignCharacters = characters;
			resetMasterAvatar();
			$('#profile-name').textContent = 'Mestre';
			$('#profile-role').textContent = 'Controle da campanha';
			$('#dashboard-eyebrow').textContent = 'Painel do Mestre';
			$('#dashboard-eyebrow').classList.remove('hidden');
			$('#dashboard-title').textContent = state.dashboardView === 'battles' ? 'Prepara\u00e7\u00e3o de batalhas' : state.dashboardView === 'contests' ? 'Concursos Pok\u00e9mon' : 'Vis\u00e3o geral da campanha';
			$('#dashboard-description').textContent = state.dashboardView === 'battles' ? 'Monte o confronto, envie convites e aguarde as confirma\u00e7\u00f5es.' : 'Acompanhe personagens, equipes, recursos e batalhas.';
			$('#logout-button').textContent = 'Sair da sess\u00e3o';
			$('#logout-button').classList.add('danger');
			$('#delete-character').classList.add('hidden');
			body.replaceChildren(
				state.dashboardView === 'battles' ? await renderMasterBattles(characters) :
				state.dashboardView === 'contests' ? await window.RPGContestUI.render({state, api, master: true, characters, rerender: renderDashboard}) :
				state.dashboardView === 'nursery' ? await renderNursery() :
				state.dashboardView === 'shops' ? await renderShops() :
				await renderMasterBody(characters)
			);
		} else {
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
			$('#dashboard-title').textContent = state.dashboardView === 'battles' ? 'Convites de batalha' : state.dashboardView === 'contests' ? 'Concursos Pok\u00e9mon' : 'Ol\u00e1, ' + character.characterName;
			$('#dashboard-description').textContent = state.dashboardView === 'battles' ? 'Participe dos seus combates ou assista aos combates em andamento.' : 'Sua equipe e seus recursos persistentes.';
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
