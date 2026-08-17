'use strict';

/* global state, api, button, createElement, pokemonSprite, showToast, renderDashboard, RPGAssets */

function rpgRuntimePokemonName(pokemon) {
	return pokemon?.name || pokemon?.species || 'Pok\u00e9mon';
}

function rpgRuntimeSpriteId(pokemon) {
	if (pokemon?.spriteId) return pokemon.spriteId;
	return String(pokemon?.species || pokemon?.name || '').normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rpgRuntimeSprite(pokemon, back = false, compact = false) {
	const wrap = createElement('span', 'rpg-showdown-sprite' + (back ? ' back' : '') + (compact ? ' compact' : ''));
	const image = createElement('img');
	const id = rpgRuntimeSpriteId(pokemon);
	const shiny = !!pokemon?.shiny;
	const paths = compact ? [
		RPGAssets.url('sprites/' + (shiny ? 'gen5-shiny/' : 'gen5/') + id + '.png'),
		RPGAssets.url('sprites/' + (shiny ? 'gen4-shiny/' : 'gen4/') + id + '.png'),
		...(shiny ? [RPGAssets.url('sprites/gen5/' + id + '.png')] : []),
	] : back ? [
		RPGAssets.url('sprites/' + (shiny ? 'ani-back-shiny/' : 'ani-back/') + id + '.gif'),
		RPGAssets.url('sprites/' + (shiny ? 'gen5-back-shiny/' : 'gen5-back/') + id + '.png'),
		...(shiny ? [RPGAssets.url('sprites/ani-back/' + id + '.gif'), RPGAssets.url('sprites/gen5-back/' + id + '.png')] : []),
	] : [
		RPGAssets.url('sprites/' + (shiny ? 'ani-shiny/' : 'ani/') + id + '.gif'),
		RPGAssets.url('sprites/' + (shiny ? 'gen5-shiny/' : 'gen5/') + id + '.png'),
		...(shiny ? [RPGAssets.url('sprites/ani/' + id + '.gif'), RPGAssets.url('sprites/gen5/' + id + '.png')] : []),
	];
	let index = 0;
	image.src = paths[index];
	image.alt = rpgRuntimePokemonName(pokemon) + (back ? ' de costas' : '');
	image.addEventListener('error', () => {
		index++;
		if (index < paths.length) image.src = paths[index];
		else wrap.classList.add('sprite-missing');
	});
	wrap.append(image);
	return wrap;
}

function rpgRuntimeTeamStrip(side, position) {
	const strip = createElement('div', 'rpg-team-strip ' + position);
	for (const pokemon of side?.pokemon || []) {
		const icon = createElement('span', 'rpg-team-icon' +
			(pokemon.fainted ? ' fainted' : pokemon.status ? ' statused' : '') +
			(pokemon.active ? ' active' : ''));
		icon.append(rpgRuntimeSprite(pokemon, false, true));
		icon.dataset.rpgTooltip = rpgRuntimePokemonName(pokemon) + '\nNv. ' + pokemon.level +
			'\nHP: ' + pokemon.hp + '/' + pokemon.maxHP +
			'\nStatus: ' + (pokemon.fainted ? 'Desmaiado' : pokemon.status?.toUpperCase() || 'Saud\u00e1vel') +
			'\nItem: ' + (pokemon.item || 'Nenhum');
		strip.append(icon);
	}
	return strip;
}

function rpgRuntimeHpBar(pokemon, className) {
	const bar = createElement('span', className);
	const fill = createElement('i');
	fill.style.width = (pokemon.maxHP ? Math.max(0, Math.min(100, pokemon.hp / pokemon.maxHP * 100)) : 0) + '%';
	if (pokemon.hp <= pokemon.maxHP / 4) fill.classList.add('critical');
	else if (pokemon.hp <= pokemon.maxHP / 2) fill.classList.add('warning');
	bar.append(fill);
	return bar;
}

function rpgRuntimeSyncStatusVisual(fieldPokemon, status) {
	if (!fieldPokemon) return;
	const sprite = fieldPokemon.querySelector('.rpg-showdown-sprite');
	if (!sprite) return;
	for (const previous of sprite.querySelectorAll('.rpg-sleep-zs, .rpg-freeze-overlay')) previous.remove();
	const statusId = rpgRuntimeEffectId(status);
	if (statusId === 'slp' || statusId === 'sleep') {
		const sleeping = createElement('span', 'rpg-sleep-zs');
		sleeping.setAttribute('aria-hidden', 'true');
		for (let index = 1; index <= 3; index++) sleeping.append(createElement('i', `rpg-sleep-z rpg-sleep-z-${index}`, 'Z'));
		sprite.append(sleeping);
	} else if (statusId === 'frz' || statusId === 'freeze' || statusId === 'frozen') {
		const frozen = createElement('span', 'rpg-freeze-overlay');
		frozen.setAttribute('aria-hidden', 'true');
		sprite.append(frozen);
	}
}

function rpgRuntimePlayShinyEntry(fieldPokemon) {
	if (!fieldPokemon || fieldPokemon.dataset.shiny !== 'true') return Promise.resolve();
	const sprite = fieldPokemon.querySelector('.rpg-showdown-sprite');
	if (!sprite) return Promise.resolve();
	for (const previous of sprite.querySelectorAll('.rpg-shiny-entry-stars')) previous.remove();
	const stars = createElement('span', 'rpg-shiny-entry-stars');
	stars.setAttribute('aria-hidden', 'true');
	const image = sprite.querySelector('img');
	const imageWidth = image?.offsetWidth || Math.round(sprite.offsetWidth * .72);
	const imageHeight = image?.offsetHeight || Math.round(sprite.offsetHeight * .72);
	const effectSize = Math.max(1, Math.round(Math.max(imageWidth, imageHeight) * 1.12));
	stars.style.left = Math.round((image?.offsetLeft || 0) + imageWidth / 2) + 'px';
	stars.style.top = Math.round((image?.offsetTop || 0) + imageHeight / 2) + 'px';
	stars.style.width = effectSize + 'px';
	stars.style.height = effectSize + 'px';
	sprite.append(stars);
	window.RPGBattleAudio?.playEffect('shinySparkle');
	return new Promise(resolve => {
		let finished = false;
		const finish = () => {
			if (finished) return;
			finished = true;
			stars.remove();
			resolve();
		};
		stars.addEventListener('animationend', finish, { once: true });
		setTimeout(finish, 1150);
	});
}

function rpgRuntimeFieldPokemon(pokemon, side, sideId, slotIndex = 0, activeCount = 1, visualIndex = slotIndex) {
	const slot = createElement('div', 'rpg-field-pokemon ' + side +
		' active-count-' + activeCount + ' active-slot-' + visualIndex +
		' size-' + (pokemon?.sizeClass || 'medium'));
	slot.dataset.activeSlot = slotIndex;
	slot.dataset.visualSlot = visualIndex;
	slot.dataset.pokemonSize = pokemon?.sizeClass || 'medium';
	slot.dataset.pokemonHeight = pokemon?.heightM || 0;
	slot.dataset.runtimeSide = sideId;
	if (!pokemon) return slot;
	slot.dataset.pokemonName = rpgRuntimePokemonName(pokemon);
	slot.dataset.spriteId = rpgRuntimeSpriteId(pokemon);
	slot.dataset.baseSpriteId = pokemon.baseSpriteId || slot.dataset.spriteId;
	slot.dataset.shiny = pokemon.shiny ? 'true' : 'false';
	slot.dataset.pokeball = pokemon.pokeball || 'pokeball';
	slot.dataset.pokeballSprite = pokemon.pokeballSprite || 0;
	slot.dataset.teamPosition = pokemon.teamPosition;


	slot.append(rpgRuntimeSprite(pokemon, side === 'player'));
	rpgRuntimeSyncStatusVisual(slot, pokemon.status);
	return slot;
}

function rpgRuntimeEffectId(value) {
	return String(value || 'none').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rpgRuntimeEnvironment(fieldState) {
	const effects = createElement('div', 'rpg-field-environment');
	const weather = rpgRuntimeEffectId(fieldState?.weather);
	const terrain = rpgRuntimeEffectId(fieldState?.terrain);
	effects.append(
		createElement('i', 'rpg-weather-effect weather ' + weather + 'weather'),
		createElement('i', 'rpg-terrain-effect weather ' + terrain + 'weather')
	);
	return effects;
}

function rpgRuntimeTrainerImage(trainer, characters) {
	const character = characters.find(entry => entry.id === trainer?.characterId);
	const avatar = character?.avatar || trainer?.avatar || 'pokemonbreeder';
	const image = createElement('img', 'rpg-side-trainer-image');
	image.src = RPGAssets.url('sprites/trainers/' + avatar + '.png');
	image.alt = 'Avatar de ' + (trainer?.name || 'treinador');
	return image;
}

function rpgRuntimeBoostMultiplier(stat, stage) {
	if (!stage) return 1;
	const base = stat === 'accuracy' || stat === 'evasion' ? 3 : 2;
	return stage > 0 ? (base + stage) / base : base / (base - stage);
}

function rpgRuntimeBoostRow(stat, stage) {
	const labels = {
		atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense',
		spe: 'Speed', accuracy: 'Accuracy', evasion: 'Evasiveness',
	};
	const row = createElement('div', 'rpg-boost-row ' + (stage > 0 ? 'raised' : stage < 0 ? 'lowered' : 'neutral'));
	const indicators = createElement('span', 'rpg-boost-indicators');
	const amount = Math.abs(stage || 0);
	for (let index = 0; index < 6; index++) {
		indicators.append(createElement('i', index < amount ? 'filled' : '', index < amount ? (stage > 0 ? '▲' : '▼') : '•'));
	}
	const multiplier = rpgRuntimeBoostMultiplier(stat, stage || 0);
	row.append(
		createElement('span', 'rpg-boost-name', labels[stat]),
		indicators,
		createElement('span', 'rpg-boost-value', stage ? 'x' + Number(multiplier.toFixed(2)) : '')
	);
	return row;
}

function rpgRuntimeBallIcon(pokemon) {
	const icon = createElement('i', 'rpg-pokeball-item-icon');
	const sprite = Number(pokemon?.pokeballSprite) || 0;
	icon.style.backgroundPosition = -((sprite % 16) * 24) + 'px ' + -(Math.floor(sprite / 16) * 24) + 'px';
	icon.setAttribute('aria-label', (pokemon?.pokeball || 'Poké Ball') + ', Pokémon ainda não revelado');
	icon.title = pokemon?.pokeball || 'Poké Ball';
	return icon;
}
function rpgRuntimeKnownTeam(side, trainer) {
	const positions = trainer?.pokemonPositions || side.pokemon.map(pokemon => pokemon.teamPosition);
	const team = createElement('div', 'rpg-side-team');
	for (let index = 0; index < 6; index++) {
		const position = positions[index];
		const pokemon = position === undefined ? null : side.pokemon.find(entry => entry.teamPosition === position);
		const cell = createElement('span', 'rpg-side-team-slot');
		if (!pokemon) {
			cell.classList.add('empty');
			cell.setAttribute('aria-label', 'Posição vazia');
		} else if (!pokemon.revealed) {
			cell.classList.add('unknown');
			cell.setAttribute('aria-label', 'Pokémon ainda não revelado');
			cell.append(rpgRuntimeBallIcon(pokemon));
		} else {
			cell.classList.add('revealed');
			if (pokemon.fainted) cell.classList.add('fainted');
			cell.append(rpgRuntimeSprite(pokemon, false, true));
			cell.setAttribute('aria-label', pokemon.name + (pokemon.fainted ? ', desmaiado' : ''));
		}
		team.append(cell);
	}
	return team;
}

function rpgRuntimeStatusSound(status) {
	return ({
		brn: 'statusBurn', psn: 'statusPoison', tox: 'statusPoison', par: 'statusParalysis',
		slp: 'statusSleep', frz: 'statusFreeze',
	})[rpgRuntimeEffectId(status)] || '';
}

function rpgRuntimeSidePanel(session, side, position, characters, selection) {
	side = side ? { ...side, trainers: Array.isArray(side.trainers) ? side.trainers : [], pokemon: Array.isArray(side.pokemon) ? side.pokemon : [] } :
		{ id: '', team: position === 'player' ? 'A' : 'B', name: '', trainers: [], pokemon: [] };
	selection ||= { trainer: 0, active: 0 };
	const panel = createElement('aside', 'rpg-combat-side-panel ' + position);
	const wildSide = side.trainers.length > 0 && side.trainers.every(trainer =>
		['wild', 'horde', 'boss'].includes(trainer.kind));
	const trainerMode = ['multi', 'raid', 'boss'].includes(session.format) && side.trainers.length > 1;

	function cycle(key, length, direction) {
		selection[key] = ((selection[key] || 0) + direction + length) % length;
		renderPanel();
	}
	function selector(label, key, length) {
		const wrap = createElement('div', 'rpg-side-selector');
		const previous = button('◀', 'rpg-side-selector-arrow');
		const next = button('▶', 'rpg-side-selector-arrow');
		previous.disabled = length < 2;
		next.disabled = length < 2;
		previous.addEventListener('click', () => cycle(key, length, -1));
		next.addEventListener('click', () => cycle(key, length, 1));
		wrap.append(previous, createElement('strong', '', label), next);
		return wrap;
	}
	function renderPanel() {
		panel.replaceChildren();
		const trainers = side.trainers.length ? side.trainers : [{ name: side.name, pokemonPositions: side.pokemon.map(pokemon => pokemon.teamPosition) }];
		selection.trainer = Math.min(selection.trainer || 0, trainers.length - 1);
		const trainer = trainers[selection.trainer];
		const trainerPositions = Array.isArray(trainer?.pokemonPositions) ? trainer.pokemonPositions :
			side.pokemon.map(pokemon => pokemon.teamPosition);
		if (!wildSide) {
			if (trainerMode) panel.append(selector(trainer.name, 'trainer', trainers.length));
			else panel.append(createElement('h3', 'rpg-side-trainer-name', trainer.name));
			panel.append(rpgRuntimeTrainerImage(trainer, characters), rpgRuntimeKnownTeam(side, trainer));
		}
		let active = side.pokemon.filter(pokemon => pokemon.active && !pokemon.fainted)
			.sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0));
		if (trainerMode) {
			active = active.filter(pokemon => trainerPositions.includes(pokemon.teamPosition));
		}
		selection.active = Math.min(selection.active || 0, Math.max(0, active.length - 1));
		const pokemon = active[selection.active] || side.pokemon.find(entry =>
			trainerPositions.includes(entry.teamPosition) && entry.revealed && !entry.fainted);
		if (!pokemon) {
			panel.append(createElement('p', 'rpg-side-no-active', 'Nenhum Pokémon ativo.'));
			return;
		}
		const gender = pokemon.gender === 'M' ? ' ♂' : pokemon.gender === 'F' ? ' ♀' : '';
		if (!trainerMode && active.length > 1) panel.append(selector(pokemon.name + gender, 'active', active.length));
		else panel.append(createElement('h4', 'rpg-side-pokemon-name', pokemon.name + gender));
		const types = createElement('div', 'rpg-side-types');
		for (const type of pokemon.types || []) types.append(createElement('span', 'type-' + type.toLowerCase(), type));
		if (pokemon.isMega) {
			const megaMarker = rpgMegaAssetSymbol();
			megaMarker.setAttribute('aria-label', 'Mega Evoluido');
			types.append(megaMarker);
		}
		const levelStatus = createElement('div', 'rpg-side-level-status');
		levelStatus.append(createElement('span', '', 'Lv. ' + pokemon.level));
		if (pokemon.status) levelStatus.append(createElement('b', 'status-' + pokemon.status, pokemon.status.toUpperCase()));
		panel.append(
			types,
			levelStatus,
			rpgRuntimeHpBar(pokemon, 'rpg-side-hp'),
			createElement('div', 'rpg-side-hp-text', pokemon.hp + ' / ' + pokemon.maxHP + ' HP')
		);
		if (position === 'player') {
			const ability = createElement('p', 'rpg-side-ability', 'Habilidade ' + (pokemon.ability || '—'));
			ability.dataset.rpgTooltip = pokemon.ability + '\n' + (pokemon.abilityDescription || 'Descrição não disponível.');
			panel.append(ability);
		}		const boosts = createElement('div', 'rpg-side-boosts');
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']) {
			boosts.append(rpgRuntimeBoostRow(stat, pokemon.boosts?.[stat] || 0));
		}
		panel.append(boosts);
	}
	renderPanel();
	return panel;
}
const RPG_HUD_ICON_SPRITES = {
	sun: [0, 0], rain: [1, 0], sandstorm: [2, 0], snow: [3, 0], wind: [4, 0], electric: [5, 0],
	grass: [0, 1], psychic: [1, 1], mist: [2, 1], trickroom: [3, 1], magicroom: [4, 1], wonderroom: [5, 1],
	gravity: [0, 2], mud: [1, 2], water: [2, 2], reflect: [3, 2], lightscreen: [4, 2], auroraveil: [5, 2],
	safeguard: [0, 3], mistshield: [1, 3], tailwind: [2, 3], luckychant: [3, 3], rocks: [4, 3], spikes: [5, 3],
	poison: [0, 4], web: [1, 4], steelsurge: [2, 4], wildfire: [3, 4], volcalith: [4, 4], vinelash: [5, 4],
	cannonade: [0, 5], trap: [1, 5], lock: [2, 5], benefit: [3, 5], hazard: [4, 5], field: [5, 5],
};
const RPG_HUD_EFFECT_NAMES = {
	sunnyday: 'Sunny Day', desolateland: 'Harsh Sun', raindance: 'Rain Dance', primordialsea: 'Heavy Rain',
	sandstorm: 'Sandstorm', snow: 'Snow', deltastream: 'Strong Winds', electricterrain: 'Electric Terrain',
	grassyterrain: 'Grassy Terrain', psychicterrain: 'Psychic Terrain', mistyterrain: 'Misty Terrain',
};
function rpgRuntimeLegacyHUDEffect(id, duration, kind) {
	id = rpgRuntimeEffectId(id);
	if (!id || id === 'none') return null;
	const icon = {
		sunnyday: 'sun', desolateland: 'sun', raindance: 'rain', primordialsea: 'rain', sandstorm: 'sandstorm',
		snow: 'snow', deltastream: 'wind', electricterrain: 'electric', grassyterrain: 'grass',
		psychicterrain: 'psychic', mistyterrain: 'mist',
	}[id] || 'field';
	return {
		id, name: RPG_HUD_EFFECT_NAMES[id] || id, kind, icon,
		theme: kind + '-' + id, duration: Number.isFinite(duration) ? duration : null,
		permanent: !Number.isFinite(duration), layers: null, maxLayers: null,
	};
}
function rpgRuntimeHUDEffectBadge(effect, pokemonName = '') {
	const theme = rpgRuntimeEffectId(effect?.theme || effect?.kind || 'field');
	const badge = createElement('div', 'rpg-hud-effect rpg-hud-kind-' + rpgRuntimeEffectId(effect?.kind) + ' rpg-hud-theme-' + theme);
	const icon = createElement('span', 'rpg-hud-effect-icon');
	const sprite = RPG_HUD_ICON_SPRITES[effect?.icon] || RPG_HUD_ICON_SPRITES.field;
	icon.style.backgroundPosition = (sprite[0] * 20) + '% ' + (sprite[1] * 20) + '%';
	icon.setAttribute('aria-hidden', 'true');
	const label = createElement('span', 'rpg-hud-effect-label');
	if (pokemonName) label.append(createElement('small', '', pokemonName), document.createTextNode(effect?.name || effect?.id || 'Efeito'));
	else label.textContent = effect?.name || effect?.id || 'Efeito';
	badge.append(icon, label);
	if (Number.isFinite(effect?.layers)) {
		badge.append(createElement('b', 'rpg-hud-effect-count', effect.layers + (effect.maxLayers ? '/' + effect.maxLayers : '')));
	} else if (!effect?.permanent && Number.isFinite(effect?.duration)) {
		badge.append(createElement('b', 'rpg-hud-effect-count', String(effect.duration)));
	}
	const source = effect?.sourcePokemon ? 'Criado por ' + effect.sourcePokemon + '.' : '';
	badge.title = [effect?.name || effect?.id, source, effect?.permanent ? 'Permanente.' : ''].filter(Boolean).join(' ');
	return badge;
}
function rpgRuntimeHUDEffectStack(effects, className, pokemonNames = new Map()) {
	const stack = createElement('div', 'rpg-hud-effect-stack ' + className);
	for (const effect of effects || []) {
		stack.append(rpgRuntimeHUDEffectBadge(effect, pokemonNames.get(effect.targetPokemonPosition) || ''));
	}
	return stack;
}
function rpgRuntimePokemonHUDEffects(side) {
	const effects = [];
	const names = new Map();
	for (const pokemon of side?.pokemon || []) {
		if (!pokemon.active || pokemon.fainted) continue;
		names.set(pokemon.position, pokemon.name);
		effects.push(...(pokemon.effects?.individual || []), ...(pokemon.effects?.switchLocks || []));
	}
	return { effects, names };
}
function rpgRuntimeFieldHUD(snapshot, own, foe) {
	const fieldState = snapshot?.field || {};
	const hud = createElement('section', 'rpg-battle-hud');
	hud.setAttribute('aria-label', 'Condicoes atuais do campo');
	const weather = fieldState.weatherDetails || rpgRuntimeLegacyHUDEffect(fieldState.weather, fieldState.weatherTurns, 'weather');
	const terrain = fieldState.terrainDetails || rpgRuntimeLegacyHUDEffect(fieldState.terrain, fieldState.terrainTurns, 'terrain');
	const center = createElement('div', 'rpg-hud-center');
	const turn = createElement('div', 'rpg-hud-turn');
	turn.append(createElement('span', '', 'Turno'), createElement('strong', '', String(snapshot?.turn || 1)));
	center.append(turn);
	if (weather) center.append(rpgRuntimeHUDEffectBadge(weather));
	if (terrain) center.append(rpgRuntimeHUDEffectBadge(terrain));
	const globalOwn = [];
	const globalFoe = [];
	for (const effect of fieldState.globalEffects || []) {
		if (effect.sourceSide === foe?.id) globalFoe.push(effect);
		else globalOwn.push(effect);
	}
	const ownSideEffects = [...(own?.effects?.buffs || []), ...(own?.effects?.hazards || [])];
	const foeSideEffects = [...(foe?.effects?.buffs || []), ...(foe?.effects?.hazards || [])];
	const ownPokemonEffects = rpgRuntimePokemonHUDEffects(own);
	const foePokemonEffects = rpgRuntimePokemonHUDEffects(foe);
	hud.append(
		center,
		rpgRuntimeHUDEffectStack(globalOwn, 'rpg-hud-global-own'),
		rpgRuntimeHUDEffectStack(globalFoe, 'rpg-hud-global-foe'),
		rpgRuntimeHUDEffectStack(ownSideEffects, 'rpg-hud-side-own'),
		rpgRuntimeHUDEffectStack(foeSideEffects, 'rpg-hud-side-foe'),
		rpgRuntimeHUDEffectStack(ownPokemonEffects.effects, 'rpg-hud-pokemon-own', ownPokemonEffects.names),
		rpgRuntimeHUDEffectStack(foePokemonEffects.effects, 'rpg-hud-pokemon-foe', foePokemonEffects.names)
	);
	return hud;
}
const RPG_PARTY_TYPE_COLORS = {
	normal: ['#8f9388', '#60655d'], fire: ['#dc744b', '#a6402b'], water: ['#579bd0', '#315f99'],
	electric: ['#e2c345', '#a98622'], grass: ['#66aa62', '#397740'], ice: ['#73c8cd', '#418e99'],
	fighting: ['#b35c4d', '#74352f'], poison: ['#9b5aa5', '#63346f'], ground: ['#c7a863', '#896d35'],
	flying: ['#91a6d4', '#6175a8'], psychic: ['#d66d9d', '#98436e'], bug: ['#9cab3d', '#65731e'],
	rock: ['#a9964e', '#70612b'], ghost: ['#76668f', '#483b61'], dragon: ['#7065cb', '#443b93'],
	dark: ['#55515b', '#302e35'], steel: ['#aeb6c4', '#727b8c'], fairy: ['#dda0c2', '#aa628b'],
};
function rpgPartyCardTypeStyle(card, types) {
	const normalized = (types || ['Normal']).slice(0, 2).map(type => String(type).toLowerCase());
	const first = RPG_PARTY_TYPE_COLORS[normalized[0]] || RPG_PARTY_TYPE_COLORS.normal;
	card.style.setProperty('--party-type-one', first[0]);
	card.style.setProperty('--party-type-one-dark', first[1]);
	card.classList.add(normalized.length > 1 ? 'dual-type' : 'single-type');
	if (normalized.length > 1) {
		const second = RPG_PARTY_TYPE_COLORS[normalized[1]] || RPG_PARTY_TYPE_COLORS.normal;
		card.style.setProperty('--party-type-two', second[0]);
		card.style.setProperty('--party-type-two-dark', second[1]);
	}
}
function rpgRuntimeItemIcon(itemDetails) {
	if (!itemDetails?.id) return null;
	if (itemDetails.icon) {
		const icon = createElement('img', 'rpg-party-item-icon rpg-local-item-icon');
		icon.src = itemDetails.icon;
		icon.alt = '';
		icon.setAttribute('aria-label', itemDetails.name);
		return icon;
	}
	if (!Number.isInteger(itemDetails.sprite)) return null;
	const icon = createElement('i', 'rpg-party-item-icon');
	icon.style.backgroundPosition = -((itemDetails.sprite % 16) * 24) + 'px ' + -(Math.floor(itemDetails.sprite / 16) * 24) + 'px';
	icon.setAttribute('aria-label', itemDetails.name);
	return icon;
}
function rpgMegaAssetSymbol() {
	const symbol = createElement('i', 'rpg-side-mega-symbol');
	const source = globalThis.RPGAssets?.megaSymbol;
	if (!source) {
		symbol.classList.add('fallback');
		return symbol;
	}
	const image = createElement('img', 'rpg-mega-symbol-image');
	image.src = source;
	image.alt = '';
	image.addEventListener('error', () => {
		image.remove();
		symbol.classList.add('fallback');
	}, { once: true });
	symbol.append(image);
	return symbol;
}
function rpgRuntimeStatusIcon(condition) {
	if (!condition?.id) return null;
	const labels = { brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ', psn: 'PSN', tox: 'TOX' };
	const icon = createElement('span', 'rpg-party-status status-' + condition.id, labels[condition.id] || condition.id.toUpperCase());
	icon.dataset.rpgTooltip = condition.name + '\n' + condition.description;
	icon.setAttribute('aria-label', condition.name + ': ' + condition.description);
	return icon;
}
function rpgRuntimePartyCard(pokemon, onSwitch, options = {}) {
	const cardState = pokemon.fainted ? 'fainted' : pokemon.active ? 'active' : options.selected ? 'selected' :
		options.blockedReason ? 'blocked' : 'available';
	const card = createElement('button', 'rpg-party-card state-' + cardState);
	card.type = 'button';
	card.disabled = !!options.disabled || (!options.allowActive && pokemon.active) || (!options.allowFainted && pokemon.fainted);
	card.dataset.pokemonPosition = pokemon.position + 1;
	rpgPartyCardTypeStyle(card, pokemon.types);
	const sprite = createElement('span', 'rpg-party-card-sprite');
	sprite.append(rpgRuntimeSprite(pokemon, false, true, true));
	const info = createElement('span', 'rpg-party-card-info');
	const conditionName = pokemon.fainted ? 'Desmaiado' : pokemon.condition?.name || 'Saudavel';
	const details = createElement('small', 'rpg-party-card-condition', 'Nv. ' + pokemon.level + ' \u00b7 ' + conditionName);
	const healthValue = createElement('small', 'rpg-party-hp-text', pokemon.hp + ' / ' + pokemon.maxHP + ' HP');
	const meterRow = createElement('span', 'rpg-party-meter-row');
	const item = createElement('span', 'rpg-party-item');
	const itemName = pokemon.itemDetails?.name || pokemon.item || 'Nenhum';
	const itemIcon = rpgRuntimeItemIcon(pokemon.itemDetails);
	item.append(document.createTextNode('Item:'));
	if (itemIcon) item.append(itemIcon);
	item.append(document.createTextNode(itemName));
	meterRow.append(rpgRuntimeHpBar(pokemon, 'rpg-mini-hp'), item);
	const heading = createElement('span', 'rpg-party-card-heading');
	heading.append(createElement('strong', 'rpg-party-card-name', rpgRuntimePokemonName(pokemon)));
	const typeBadges = createElement('span', 'rpg-side-types rpg-party-card-types');
	for (const type of pokemon.types || []) typeBadges.append(createElement('span', 'type-' + type.toLowerCase(), type));
	heading.append(typeBadges);
	info.append(heading, details, healthValue, meterRow);
	card.append(sprite, info);
	if (!pokemon.fainted) {
		const statusIcon = rpgRuntimeStatusIcon(pokemon.condition);
		if (statusIcon) card.append(statusIcon);
	}
	const stateLabels = { active: 'EM CAMPO', selected: 'SELECIONADO', fainted: 'DESMAIADO', blocked: 'BLOQUEADO' };
	if (stateLabels[cardState]) {
		const badge = createElement('span', 'rpg-party-state-badge', stateLabels[cardState]);
		if (options.blockedReason) badge.dataset.rpgTooltip = options.blockedReason;
		card.append(badge);
	}
	if (options.blockedReason) {
		card.setAttribute('aria-description', options.blockedReason);
		card.title = options.blockedReason;
	}
	if (!card.disabled) card.addEventListener('click', onSwitch);
	return card;
}
function rpgPostBattlePokemon(result, side, position) {
	return (result?.pokemon || []).find(pokemon => pokemon.side === side && pokemon.position === position);
}

function rpgPostBattleMoney(result) {
	return (result?.rewards || [])
		.filter(reward => ['money', 'currency', 'pokedollar'].includes(rpgRuntimeEffectId(reward.type)))
		.reduce((total, reward) => total + (Number(reward.amount) || 0), 0);
}

function rpgPostBattleTitle(result, ownSide, isMaster) {
	if (result?.outcome === 'capture') return 'Vitória · Captura realizada';
	if (result?.outcome === 'flee') return 'Fuga';
	if (result?.outcome === 'tie') return 'Empate';
	if (isMaster && !ownSide) return result?.winner ? result.winner + ' venceu!' : 'Batalha encerrada';
	return ownSide?.outcome === 'winner' ? 'Vitória!' : 'Derrota';
}

function rpgPostBattleSummary(snapshot, session, ownSide, foeSide) {
	const result = snapshot.result;
	if (result?.outcome === 'flee') return 'Você fugiu da batalha. O estado dos seus Pokémon foi preservado.';
	if (result?.outcome === 'capture' && result.capture?.pokemon) {
		return 'Você capturou ' + (result.capture.pokemon.name || result.capture.pokemon.species) + '.';
	}
	const opponent = foeSide?.trainers?.[0]?.name || foeSide?.name || 'o adversário';
	if (ownSide?.outcome === 'loser') return 'Você foi derrotado por ' + opponent + '.';
	if (session.opponentType === 'wild' || session.opponentType === 'horde') {
		const defeated = (result?.defeats || []).filter(entry => entry.side === foeSide?.id)
			.map(entry => entry.species).filter(Boolean);
		return defeated.length ? 'Você derrotou ' + [...new Set(defeated)].join(', ') + '.' : 'Você venceu o encontro selvagem.';
	}
	return 'Você venceu ' + opponent + '.';
}

function rpgPostBattleBlock(title) {
	const block = createElement('section', 'rpg-result-block');
	block.append(createElement('h3', '', title));
	const body = createElement('div', 'rpg-result-block-body');
	block.append(body);
	return { block, body };
}

function rpgPostBattleExperience(result, sideId, includeAll = false) {
	const entries = (result?.experience || []).filter(entry => includeAll || entry.side === sideId);
	if (!entries.length) return null;
	const section = rpgPostBattleBlock('Experiência');
	for (const entry of entries) {
		const pokemon = rpgPostBattlePokemon(result, entry.side, entry.position);
		const row = createElement('div', 'rpg-result-row');
		row.append(createElement('strong', '', pokemon?.name || pokemon?.species || 'Pokémon'));
		const details = createElement('span', '', '+' + entry.gained + ' EXP');
		if (entry.level > entry.previousLevel) details.append(document.createTextNode(' · subiu para o nível ' + entry.level));
		row.append(details);
		section.body.append(row);
	}
	return section.block;
}

function rpgPostBattleEvents(result) {
	const events = result?.itemEvents || [];
	if (!events.length) return null;
	const section = rpgPostBattleBlock('Eventos especiais');
	for (const event of events) {
		const row = createElement('p', 'rpg-result-event');
		row.textContent = event.quantity + '× ' + (event.itemName || event.item) + ' consumido.';
		section.body.append(row);
	}
	return section.block;
}

function rpgPostBattleMasterReport(snapshot) {
	const result = snapshot.result;
	const report = createElement('section', 'rpg-master-report hidden');
	const experience = rpgPostBattleExperience(result, '', true);
	if (experience) report.append(experience);
	const changes = rpgPostBattleBlock('Estado final de todos os Pokémon');
	for (const entry of result?.pokemonChanges || []) {
		const row = createElement('div', 'rpg-master-change');
		row.append(
			createElement('strong', '', entry.name || entry.species),
			createElement('span', '', 'HP ' + entry.previousHP + ' → ' + entry.hp + '/' + entry.maxHP),
			createElement('span', '', 'PP ' + entry.previousPP.join('/') + ' → ' + entry.pp.join('/')),
			createElement('span', '', 'Status ' + (entry.previousStatus || 'nenhum') + ' → ' + (entry.status || 'nenhum')),
			createElement('span', '', 'Item ' + (entry.previousItem || 'nenhum') + ' → ' + (entry.item || 'nenhum'))
		);
		changes.body.append(row);
	}
	report.append(changes.block);
	const events = rpgPostBattleEvents(result);
	if (events) report.append(events);
	if (result?.capture?.success && result.capture.pokemon) {
		const capture = rpgPostBattleBlock('Captura realizada');
		capture.body.append(createElement('p', '', result.capture.pokemon.species + ' · nível ' + result.capture.pokemon.level));
		report.append(capture.block);
	}
	const log = rpgPostBattleBlock('Registro detalhado');
	const list = createElement('ol', 'rpg-result-log');
	for (const line of snapshot.log || []) list.append(createElement('li', '', line));
	if (!list.children.length) list.append(createElement('li', '', 'Nenhum evento textual registrado.'));
	log.body.append(list);
	report.append(log.block);
	return report;
}

function rpgRuntimeResult(snapshot, session, viewSideId, isMaster, onClose) {
	const result = snapshot.result;
	const panel = createElement('div', 'rpg-battle-result');
	const sheet = createElement('div', 'rpg-result-sheet');
	let levelUpTimer = null;
	const leaveResult = destination => {
		if (levelUpTimer) clearTimeout(levelUpTimer);
		onClose(destination);
	};
	const close = button('×', 'rpg-result-close');
	close.type = 'button';
	close.setAttribute('aria-label', 'Fechar resultado e voltar ao painel');
	close.addEventListener('click', () => leaveResult('overview'));
	panel.append(close, sheet);
	const ownSide = result?.sides?.find(side => side.side === viewSideId);
	if ((result?.experience || []).some(entry => entry.side === viewSideId && entry.level > entry.previousLevel)) {
		levelUpTimer = setTimeout(() => window.RPGBattleAudio?.playEffect('levelUp'), 1100);
	}
	const foeRuntime = snapshot.sides?.find(side => side.id !== viewSideId);
	const header = createElement('header', 'rpg-result-header');
	header.append(
		createElement('h2', '', rpgPostBattleTitle(result, ownSide, isMaster && !viewSideId)),
		createElement('p', '', rpgPostBattleSummary(snapshot, session, ownSide, foeRuntime))
	);
	sheet.append(header);
	const rewards = createElement('div', 'rpg-result-rewards');
	const experience = rpgPostBattleExperience(result, viewSideId, false);
	if (experience) rewards.append(experience);
	const money = rpgPostBattleMoney(result);
	if (money > 0 && ownSide?.outcome === 'winner') {
		const section = rpgPostBattleBlock('Pokécoins');
		section.body.append(createElement('strong', 'rpg-result-money', '+ ₽' + new Intl.NumberFormat('pt-BR').format(money)));
		rewards.append(section.block);
	}
	if (result?.capture?.success && result.capture.pokemon) {
		const capture = rpgPostBattleBlock('Pokémon capturados');
		const card = createElement('div', 'rpg-result-capture');
		card.append(
			rpgRuntimeSprite(result.capture.pokemon, false, true),
			createElement('strong', '', result.capture.pokemon.name || result.capture.pokemon.species),
			createElement('span', '', 'Nível ' + result.capture.pokemon.level)
		);
		capture.body.append(card);
		rewards.append(capture.block);
	}
	const events = rpgPostBattleEvents(result);
	if (events) rewards.append(events);
	if (rewards.children.length) sheet.append(rewards);
	if (isMaster) {
		const toggle = button('Ver relatório completo', 'button rpg-master-report-toggle');
		const report = rpgPostBattleMasterReport(snapshot);
		toggle.addEventListener('click', () => {
			const opening = report.classList.contains('hidden');
			report.classList.toggle('hidden', !opening);
			toggle.textContent = opening ? 'Ocultar relatório completo' : 'Ver relatório completo';
		});
		sheet.append(toggle, report);
	}
	const actions = createElement('footer', 'rpg-result-actions');
	const overview = button('Ir para a vis\u00e3o geral', 'button primary');
	overview.addEventListener('click', () => leaveResult('overview'));
	actions.append(overview);
	sheet.append(actions);
	return panel;
}
function rpgMoveCategoryLabel(category) {
	return category;
}

function rpgMovePower(move) {
	if (move.variablePower) return 'variable';
	return move.basePower === null || move.basePower === undefined || move.category === 'Status' ? '—' : move.basePower;
}

function rpgMoveAccuracy(move) {
	return move.alwaysHits || move.accuracy === null || move.accuracy === undefined ? '—' : move.accuracy + '%';
}

function rpgMoveEffectivenessLabel(multiplier) {
	if (multiplier === 0) return 'Immune';
	if (multiplier >= 4) return 'Extremely effective';
	if (multiplier === 2) return 'Super effective';
	if (multiplier === 1) return 'Normally effective';
	if (multiplier === 0.5) return 'Not very effective';
	if (multiplier > 0 && multiplier <= 0.25) return 'Barely effective';
	return 'Conditional effect';
}

function rpgMoveOutcomeLabel(outcome) {
	return {
		applies: 'Can be applied', 'immune-type': 'Immune by type',
		'immune-ability': 'Immune by ability', 'blocked-field': 'Blocked by the field',
		'blocked-condition': 'Blocked by a condition', 'already-statused': 'Already has a status',
		reflected: 'Will be reflected', 'not-applicable': 'Does not apply',
	}[outcome] || 'Conditional result';
}

function rpgMoveEffectLine(effect) {
	const line = createElement('div', 'rpg-move-effect-line');
	const heading = createElement('div', 'rpg-move-effect-heading');
	if (effect.kind === 'status' && typeof effect.value === 'string') {
		const status = String(effect.value).toLowerCase();
		heading.append(createElement('b', 'rpg-move-status-badge status-' + status, status.toUpperCase()));
	}
	line.append(heading, createElement('p', 'rpg-move-effect-description', effect.description || 'Aplica um efeito adicional.'));
	return line;
}
function rpgMoveTargetRow(target, move) {
	const row = createElement('div', 'rpg-move-target-row outcome-' + target.damage.outcome);
	const identity = createElement('div', 'rpg-move-target-identity');
	identity.append(rpgRuntimeSprite(target, false, true));
	const name = createElement('span');
	name.append(createElement('strong', '', target.name));
	if (!target.inField) name.append(createElement('small', '', 'Revealed reserve'));
	identity.append(name);
	const results = createElement('div', 'rpg-move-target-results');
	if (move.category !== 'Status') {
		const multiplier = target.damage.multiplier;
		const damage = createElement('span', 'rpg-target-damage effectiveness-' + String(multiplier).replace('.', '-'));
		damage.append(
			createElement('span', '', multiplier === null ? target.damage.reason : rpgMoveEffectivenessLabel(multiplier)),
			createElement('b', '', multiplier === null ? '\u2014' : multiplier + '\u00d7')
		);
		results.append(damage);
	}
	const hasStatus = (move.effects || []).some(effect => effect.kind === 'status');
	if (hasStatus) {
		const status = createElement('span', 'rpg-target-effect outcome-' + target.effect.outcome);
		const statusNames = (move.effects || []).filter(effect => effect.kind === 'status').map(effect => effect.name).join(' / ');
		status.append(createElement('b', '', (statusNames || 'Effect') + ':'), createElement('span', '', rpgMoveOutcomeLabel(target.effect.outcome)));
		status.title = target.effect.reason || '';
		results.append(status);
	}
	if (move.category === 'Status' && !hasStatus) {
		results.append(createElement('span', 'rpg-target-effect', target.affected ? 'This Pokemon will be affected.' : 'This Pokemon will not be affected.'));
	}
	row.append(identity, results);
	return row;
}
function rpgMegaPreview(preview) {
	const panel = createElement('aside', 'rpg-mega-preview');
	panel.setAttribute('role', 'tooltip');
	panel.append(createElement('h4', '', preview.name));
	const overview = createElement('div', 'rpg-mega-preview-overview');
	const sprite = createElement('div', 'rpg-mega-preview-sprite');
	sprite.append(rpgRuntimeSprite(preview));
	const identity = createElement('div', 'rpg-mega-preview-identity');
	const types = createElement('div', 'rpg-mega-preview-types');
	for (const type of preview.types || []) types.append(createElement('span', 'rpg-type-badge type-' + type.toLowerCase(), type.toUpperCase()));
	const ability = createElement('div', 'rpg-mega-preview-ability');
	ability.append(createElement('strong', '', 'Habilidade: ' + preview.ability), createElement('p', '', preview.abilityDescription || 'Descricao nao disponivel.'));
	identity.append(types, ability);
	overview.append(sprite, identity);
	panel.append(overview);
	const labels = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense', spe: 'Speed' };
	const stats = createElement('section', 'rpg-mega-preview-stats');
	for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
		const values = preview.stats?.[stat];
		if (!values) continue;
		const normal = Math.max(0, Math.min(260, Number(values.normal) || 0));
		const mega = Math.max(0, Math.min(260, Number(values.mega) || 0));
		const increase = Math.max(0, mega - normal);
		const row = createElement('div', 'rpg-mega-stat-row');
		const track = createElement('div', 'rpg-mega-stat-track');
		const normalBar = createElement('span', 'rpg-mega-stat-normal');
		const increaseBar = createElement('span', 'rpg-mega-stat-increase');
		normalBar.style.width = (normal / 2.6) + '%';
		increaseBar.style.left = (normal / 2.6) + '%';
		increaseBar.style.width = (increase / 2.6) + '%';
		track.setAttribute('role', 'img');
		track.setAttribute('aria-label', labels[stat] + ': ' + normal + ' normal, ' + mega + ' apos Mega Evolucao, maximo 260');
		track.append(normalBar, increaseBar);
		row.append(createElement('strong', 'rpg-mega-stat-label', labels[stat]), track, createElement('span', 'rpg-mega-stat-value', normal + ' \u2192 ' + mega));
		stats.append(row);
	}
	panel.append(stats);
	return panel;
}
function rpgMoveTooltip(move, sideId) {
	const tooltip = createElement('aside', 'rpg-move-tooltip type-' + rpgRuntimeEffectId(move.type));
	tooltip.setAttribute('role', 'tooltip');
	const heading = createElement('div', 'rpg-move-tooltip-heading');
	heading.append(createElement('strong', '', move.name));
	tooltip.append(heading);
	if ((move.effects || []).length) {
		const effects = createElement('section', 'rpg-move-tooltip-section');
		for (const effect of move.effects) effects.append(rpgMoveEffectLine(effect));
		tooltip.append(effects);
	}
	const targets = (move.targets || []).filter(target => target.side !== sideId || target.selectable || target.affected);
	if (targets.length) {
		const targetSection = createElement('section', 'rpg-move-tooltip-section rpg-move-tooltip-targets');
		for (const target of targets) targetSection.append(rpgMoveTargetRow(target, move));
		tooltip.append(targetSection);
	}
	return tooltip;
}
function rpgMoveButton(move, index, sideId) {
	const options = arguments[3] || {};
	const cell = createElement('div', 'rpg-move-cell');
	const action = button('', 'rpg-move-button type-' + move.type.toLowerCase());
	action.dataset.moveIndex = index;
	action.disabled = move.disabled || move.pp <= 0;
	if (move.pp <= Math.max(1, Math.floor(move.maxPP / 4))) action.classList.add('low-pp');
	const title = createElement('div', 'rpg-move-title');
	title.append(createElement('strong', '', move.name));
	const categoryIcon = createElement('i', 'rpg-category-icon category-' + move.category.toLowerCase());
	categoryIcon.title = rpgMoveCategoryLabel(move.category);
	categoryIcon.setAttribute('aria-label', rpgMoveCategoryLabel(move.category));
	const identity = createElement('div', 'rpg-move-identity');
	identity.append(categoryIcon, createElement('span', 'rpg-type-badge type-' + move.type.toLowerCase(), move.type.toUpperCase()));
	const technical = createElement('div', 'rpg-move-technical');
	technical.append(createElement('span', '', 'Power ' + rpgMovePower(move)), createElement('span', '', 'Accuracy ' + rpgMoveAccuracy(move)));
	const range = createElement('div', 'rpg-move-range', move.targetLabel || move.target);
	const compactFlags = createElement('div', 'rpg-move-compact-flags');
	for (const flag of (move.flags || []).filter(flag => ['contact', 'sound', 'bullet', 'bite', 'punch', 'reflectable'].includes(flag.id)).slice(0, 2)) {
		compactFlags.append(createElement('span', '', '(' + flag.label.toLowerCase() + ')'));
	}
	const left = createElement('div', 'rpg-move-summary');
	left.append(identity, technical, range, compactFlags);
	const description = createElement('p', 'rpg-move-button-description', move.description || 'Descricao ainda nao disponivel em portugues.');
	const pp = createElement('b', 'rpg-move-pp', 'PP ' + move.pp + '/' + move.maxPP);
	const right = createElement('div', 'rpg-move-explanation');
	right.append(description, pp);
	const body = createElement('div', 'rpg-move-button-body');
	body.append(left, right);
	action.append(title, body);
	cell.append(action);
	if (options.staticDetails) {
		cell.classList.add('rpg-move-cell-static');
		action.disabled = false;
		return { cell, action };
	}
	cell.append(rpgMoveTooltip(move, sideId));
	let detailsTimer = null;
	let suppressNextClick = false;
	function cancelDetailsTimer() {
		if (detailsTimer !== null) clearTimeout(detailsTimer);
		detailsTimer = null;
	}
	action.addEventListener('pointerdown', event => {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		cancelDetailsTimer();
		detailsTimer = setTimeout(() => {
			detailsTimer = null;
			suppressNextClick = true;
			cell.classList.add('details-open');
		}, 1000);
	});
	action.addEventListener('pointerup', cancelDetailsTimer);
	action.addEventListener('pointercancel', cancelDetailsTimer);
	action.addEventListener('blur', cancelDetailsTimer);
	cell.addEventListener('mouseleave', () => {
		cancelDetailsTimer();
		suppressNextClick = false;
		cell.classList.remove('details-open');
	});
	action.addEventListener('click', event => {
		if (!suppressNextClick) return;
		suppressNextClick = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	}, true);
	return { cell, action };
}
globalThis.RPGBattleMoveCard = {
	render(move, options = {}) {
		return rpgMoveButton(move, options.index ?? -1, options.sideId || '', {
			staticDetails: options.staticDetails !== false,
		});
	},
};
function rpgBattleBagItemDescription(item) {
	const effect = item.effect || {};
	if (item.category === 'ball' || effect.type === 'capture') return 'captura um Pok\u00e9mon';
	if (effect.type === 'heal-hp') {
		if (effect.full && effect.cureStatus) return 'cura todo o HP e remove status';
		if (effect.full) return 'cura todo o HP de um Pok\u00e9mon';
		return 'cura ' + effect.amount + ' HP de um Pok\u00e9mon';
	}
	if (effect.type === 'cure-status') {
		const statusDescriptions = {
			psn: 'envenenamento', tox: 'envenenamento grave', brn: 'queimadura',
			frz: 'congelamento', slp: 'sono', par: 'paralisia',
		};
		const statuses = (effect.statuses || []).map(status => statusDescriptions[status] || status);
		return statuses.length ? 'remove ' + statuses.join(' e ') : 'remove todos os status';
	}
	if (effect.type === 'restore-pp') {
		const amount = effect.full ? 'todo o PP' : effect.amount + ' PP';
		return 'restaura ' + amount + (effect.allMoves ? ' de todos os golpes' : ' de um golpe');
	}
	if (effect.type === 'revive-party') return 'revive toda a equipe fora de combate';
	if (effect.type === 'revive') {
		const percentage = Math.round((effect.hpFraction || 0) * 100);
		return 'revive com ' + percentage + '% do HP fora de combate';
	}
	if (item.category === 'held') return 'item para um Pok\u00e9mon carregar';
	if (item.category === 'battle') return 'produz um efeito tempor\u00e1rio em batalha';
	return item.usableInBattle ? 'pode ser usado em batalha' : 'n\u00e3o pode ser usado em combate';
}
function rpgRuntimeCommands(session, side, foe, submit, observer, moveDetails, requestTarget, controllerParticipant, isMaster, loadBattleBag, battleTurn) {
	const panel = createElement('section', 'rpg-command-panel');
	if (observer || !side) {
		panel.append(createElement('div', 'rpg-observer-message',
			'Modo de observacao: o Mestre nao controla lados formados apenas por Players.'
		));
		return panel;
	}
	const tabs = createElement('div', 'rpg-command-tabs');
	const content = createElement('div', 'rpg-command-content');
	const waiting = side.waiting || !side.requestState;
	function controlsPokemon(pokemon) {
		if (typeof pokemon?.controllable === 'boolean') return pokemon.controllable;
		if (!pokemon?.owner) return true;
		if (isMaster) return pokemon.owner.kind !== 'player';
		return !!controllerParticipant?.characterId && pokemon.owner.characterId === controllerParticipant.characterId;
	}
	const active = side.pokemon.filter(pokemon => pokemon.active)
		.sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0));
	const activeCount = Math.max(active.length, side.needsSwitch?.length || 0);
	const choices = Array(activeCount).fill(null);
	let megaSlot = null;
	let pendingMoveConfirmation = null;
	for (let slot = 0; slot < activeCount; slot++) {
		const pokemon = active.find(entry => entry.activeSlot === slot);
		if (pokemon && !controlsPokemon(pokemon)) choices[slot] = { type: 'pass' };
		if (side.requestState === 'move' && (!pokemon || pokemon.fainted)) choices[slot] = { type: 'pass' };
		if (side.requestState === 'move' && pokemon?.automaticMove) choices[slot] = { type: 'pass' };
		if (!pokemon && !side.needsSwitch?.[slot]) choices[slot] = { type: 'pass' };
		if (side.requestState === 'switch' && !side.needsSwitch?.[slot]) choices[slot] = { type: 'pass' };
	}
	let selectedSlot = Math.max(0, choices.findIndex(choice => !choice));
	function pokemonAt(slot) {
		return active.find(pokemon => (pokemon.activeSlot ?? 0) === slot);
	}
	function activate(selected) {
		for (const tab of tabs.querySelectorAll('.rpg-command-tab')) tab.classList.toggle('active', tab === selected);
	}
	function nextSlot() {
		pendingMoveConfirmation = null;
		const next = choices.findIndex(choice => !choice);
		if (next >= 0) {
			selectedSlot = next;
			showFight();
			return;
		}
		submit({ type: 'turn', choices });
	}
	function choose(choice, slot = selectedSlot) {
		choices[slot] = choice;
		nextSlot();
	}
	function slotChooser(onSelect = showFight) {
		const wrap = createElement('div', 'rpg-active-choice-tabs');
		for (let slot = 0; slot < activeCount; slot++) {
			const pokemon = pokemonAt(slot);
			const choice = choices[slot];
			const label = pokemon ? pokemon.name : 'Posicao ' + (slot + 1);
			const tab = button((choice ? '\u2713 ' : '') + label, 'rpg-active-choice' + (slot === selectedSlot ? ' active' : ''));
			tab.disabled = waiting || !!choice && choice.type === 'pass' || pokemon && !controlsPokemon(pokemon);
			tab.addEventListener('click', () => { selectedSlot = slot; pendingMoveConfirmation = null; onSelect(); });
			wrap.append(tab);
		}
		return wrap;
	}
	function showFight() {
		content.replaceChildren();
		if (waiting) {
			content.append(createElement('p', 'rpg-waiting-choice', 'Escolhas enviadas. Aguardando o outro lado.'));
			return;
		}
		content.append(slotChooser());
		if (side.requestState === 'switch') {
			showTeam(true);
			return;
		}
		const pokemon = pokemonAt(selectedSlot);
		if (!pokemon || pokemon.fainted) {
			content.append(createElement('p', '', 'Esta posicao nao pode agir.'));
			return;
		}
		if (!controlsPokemon(pokemon)) {
			content.append(createElement('p', 'rpg-waiting-choice', 'Este Pokemon pertence a outro participante.'));
			return;
		}
		const grid = createElement('div', 'rpg-move-grid');
		const canShowMega = pokemon.canMegaEvo && (megaSlot === null || megaSlot === selectedSlot);
		if (canShowMega) grid.classList.add('has-mega');
		pokemon.moves.forEach((runtimeMove, index) => {
			const move = { ...(moveDetails.get(runtimeMove.id) || {}), ...runtimeMove };
			const rendered = rpgMoveButton(move, index, side.id);
			if (move.disabledReason) rendered.cell.prepend(createElement('div', 'rpg-move-blocked-label', 'Reason: ' + move.disabledReason));
			rendered.action.addEventListener('click', async () => {
				const actingSlot = selectedSlot;
				const mega = megaSlot === actingSlot;
				const manualTarget = ['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf'].includes(move.target);
				if (!manualTarget) {
					const confirmationKey = actingSlot + ':' + index;
					if (pendingMoveConfirmation !== confirmationKey) {
						pendingMoveConfirmation = confirmationKey;
						for (const cell of grid.querySelectorAll('.rpg-move-cell')) cell.classList.remove('selected');
						rendered.cell.classList.add('selected');
						return;
					}
					choose({ type: 'move', move: index + 1, mega }, actingSlot);
					return;
				}
				pendingMoveConfirmation = null;
				const validTargets = (move.targets || []).filter(target => target.inField && target.selectable);
				if (!validTargets.length) {
					showToast('Este golpe nao possui um alvo valido nas condicoes atuais.', true);
					return;
				}
				rendered.cell.classList.add('selected');
				const relation = await requestTarget({
					target: move.target, moveName: move.name, sideId: side.id,
					activeSlot: actingSlot, validTargets,
				});
				rendered.cell.classList.remove('selected');
				if (relation !== null) choose({ type: 'move', move: index + 1, target: relation, mega }, actingSlot);
			});
			grid.append(rendered.cell);
		});
		for (let index = pokemon.moves.length; index < 4; index++) grid.append(createElement('div', 'rpg-move-cell empty'));
		if (canShowMega) {
			const mega = button('', 'rpg-mega-button' + (megaSlot === selectedSlot ? ' active' : ''));
			mega.type = 'button';
			mega.setAttribute('aria-label', 'Ativar Mega Evolucao para ' + pokemon.name);
			mega.setAttribute('aria-pressed', String(megaSlot === selectedSlot));
			const megaSymbol = createElement('span', 'rpg-mega-symbol');
			megaSymbol.setAttribute('aria-hidden', 'true');
			megaSymbol.append(rpgMegaAssetSymbol());
			mega.append(megaSymbol);
			if (pokemon.megaPreview) grid.append(rpgMegaPreview(pokemon.megaPreview));
			let megaDetailsTimer = null;
			let megaDetailsOpen = false;
			mega.addEventListener('pointerdown', event => {
				if (event.pointerType === 'mouse' && event.button !== 0) return;
				clearTimeout(megaDetailsTimer);
				megaDetailsTimer = setTimeout(() => {
					megaDetailsOpen = true;
					grid.classList.add('mega-details-open');
				}, 1000);
			});
			for (const eventName of ['pointerup', 'pointercancel', 'blur']) {
				mega.addEventListener(eventName, () => clearTimeout(megaDetailsTimer));
			}
			mega.addEventListener('mouseleave', () => {
				clearTimeout(megaDetailsTimer);
				megaDetailsOpen = false;
				grid.classList.remove('mega-details-open');
			});
			mega.addEventListener('click', event => {
				if (megaDetailsOpen) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				megaSlot = megaSlot === selectedSlot ? null : selectedSlot;
				pendingMoveConfirmation = null;
				showFight();
			});
			grid.append(mega);
		}
		content.append(grid);
	}
	function showTeam(keepHeader = false) {
		if (!keepHeader) content.replaceChildren(slotChooser());
		const grid = createElement('div', 'rpg-party-grid');
		const alreadySelected = new Set(choices.filter(choice => choice?.type === 'switch').map(choice => choice.pokemon));
		const switchSlot = (side.switchSlots || []).find(entry => entry.activeSlot === selectedSlot);
		for (const pokemon of side.pokemon) {
			const position = pokemon.position + 1;
			let blockedReason = '';
			if (!controlsPokemon(pokemon)) blockedReason = 'Este Pokemon pertence a outro treinador.';
			else if (alreadySelected.has(position)) blockedReason = 'Este Pokemon ja foi escolhido para outra posicao.';
			else if (switchSlot && !switchSlot.availablePokemonPositions.includes(position) && !pokemon.active && !pokemon.fainted) {
				blockedReason = switchSlot.blockedReason || 'Este Pokemon nao pode entrar nesta posicao.';
			}
			const disabled = waiting || pokemon.active || pokemon.fainted || !!blockedReason ||
				(!session.rules.allowSwitching && side.requestState !== 'switch');
			grid.append(rpgRuntimePartyCard(pokemon, () => choose({ type: 'switch', pokemon: position }), {
				disabled, blockedReason, selected: alreadySelected.has(position),
			}));
		}
		content.append(grid);
	}
	function bagActionId(kind, itemId) {
		const unique = globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(36).slice(2);
		return ['rpg', kind, session.id, battleTurn || 1, itemId, unique].join(':');
	}
	function bagChoiceExists(exceptSlot = -1) {
		return choices.some((choice, slot) => slot !== exceptSlot && (choice?.type === 'item' || choice?.type === 'capture'));
	}
	function bagItemIcon(item) {
		const icon = rpgRuntimeItemIcon(item);
		if (icon) icon.classList.add('rpg-bag-item-icon');
		return icon || createElement('i', 'rpg-bag-item-icon fallback');
	}
	async function showBag() {
		activate([...tabs.children].find(entry => entry.textContent === 'Bag'));
		content.replaceChildren(slotChooser(showBag), createElement('p', 'rpg-bag-loading', 'Abrindo a Bag...'));
		if (waiting || side.requestState !== 'move') {
			content.append(createElement('p', 'rpg-bag-empty', 'A Bag só pode ser usada durante a escolha de ações.'));
			return;
		}
		const actor = pokemonAt(selectedSlot);
		if (!actor || actor.fainted || !controlsPokemon(actor)) {
			content.append(createElement('p', 'rpg-bag-empty', 'Selecione um Pokémon que possa agir neste turno.'));
			return;
		}
		if (bagChoiceExists(selectedSlot)) {
			content.append(createElement('p', 'rpg-bag-empty', 'Este lado já escolheu um item para o turno.'));
			return;
		}
		let data;
		try {
			data = await loadBattleBag();
		} catch (error) {
			content.append(createElement('p', 'rpg-bag-empty', error.message));
			return;
		}
		if (!data?.inventory?.bag) {
			content.append(createElement('p', 'rpg-bag-empty', 'Este combatente não possui uma Bag de Player.'));
			return;
		}
		const bag = data.inventory.bag;
		const definitionsById = new Map((data.items || []).map(item => [item.id, item]));
		const entries = (bag.items || []).map(entry => ({
			...entry, definition: definitionsById.get(entry.itemId),
		})).filter(entry => entry.definition && entry.quantity > 0);
		const shell = createElement('div', 'rpg-bag-shell');
		const inventoryView = createElement('div', 'rpg-bag-inventory');
		const bagTiers = {
			10: { id: 'starter', name: 'Bolsa de Ombro' },
			20: { id: 'trainer', name: 'Mochila Escolar' },
			30: { id: 'adventurer', name: 'Mochila de Hiking' },
			40: { id: 'expert', name: 'Mochila de Trekking' },
			50: { id: 'master', name: 'Mochila Cargueira Lateral' },
			60: { id: 'legendary', name: 'Mochila de Expedi\u00e7\u00e3o Vertical' },
		};
		const bagTier = bagTiers[bag.maxSlots] || { id: 'starter', name: 'Bag personalizada' };
		const bagTierPanel = createElement('aside', 'rpg-bag-tier-panel');
		const bagTierSprite = createElement('img', 'rpg-bag-tier-sprite');
		bagTierSprite.src = '/rpg/assets/bags/' + bagTier.id + '.png';
		bagTierSprite.alt = bagTier.name;
		const bagTierDetails = createElement('div', 'rpg-bag-tier-details');
		bagTierDetails.append(
			createElement('small', '', 'N\u00edvel da Bag'),
			createElement('strong', '', bagTier.name),
			createElement('span', '', bag.items.length + ' / ' + (bag.maxSlots || '\u221e') + ' tipos de itens')
		);
		bagTierPanel.append(bagTierSprite, bagTierDetails);
		function chooseBagAction(choice) {
			if (bagChoiceExists(selectedSlot)) {
				showToast('Só é possível usar um item da Bag por turno.', true);
				return;
			}
			choose(choice, selectedSlot);
		}
		function targetHeader(item, backHandler) {
			const header = createElement('div', 'rpg-bag-target-header');
			const backButton = button('‹ Voltar', 'button');
			backButton.addEventListener('click', backHandler);
			const identity = createElement('div', 'rpg-bag-selected-item');
			identity.append(bagItemIcon(item), createElement('strong', '', item.name));
			header.append(backButton, identity, createElement('span', '', 'Usar em:'));
			return header;
		}
		function selectMove(item, pokemon, backHandler) {
			inventoryView.replaceChildren(targetHeader(item, backHandler));
			const heading = createElement('p', 'rpg-bag-instruction', 'Escolha o golpe que recuperará PP em ' + pokemon.name + ':');
			const moves = createElement('div', 'rpg-bag-move-list');
			for (const [moveIndex, move] of (pokemon.moves || []).entries()) {
				const moveButton = button(move.name + ' · PP ' + move.pp + '/' + move.maxPP, 'rpg-bag-move');
				moveButton.disabled = move.pp >= move.maxPP;
				moveButton.addEventListener('click', () => chooseBagAction({
					type: 'item', item: item.id, target: pokemon.position + 1, move: moveIndex,
					actionId: bagActionId('item', item.id), expectedRevision: bag.revision,
				}));
				moves.append(moveButton);
			}
			inventoryView.append(heading, moves);
		}
		function selectMedicineTarget(item, backHandler) {
			inventoryView.replaceChildren(targetHeader(item, backHandler));
			const targetGrid = createElement('div', 'rpg-party-grid rpg-bag-target-grid');
			for (const pokemon of side.pokemon) {
				const sameTrainer = controlsPokemon(pokemon) && pokemon.owner?.characterId === actor.owner?.characterId;
				const disabled = !sameTrainer || pokemon.fainted;
				const select = () => {
					if (item.category === 'pp' && !item.effect?.allMoves) {
						selectMove(item, pokemon, () => selectMedicineTarget(item, backHandler));
						return;
					}
					chooseBagAction({
						type: 'item', item: item.id, target: pokemon.position + 1,
						actionId: bagActionId('item', item.id), expectedRevision: bag.revision,
					});
				};
				targetGrid.append(rpgRuntimePartyCard(pokemon, select, {
					disabled, allowActive: true, blockedReason: !sameTrainer ? 'Pertence a outro treinador.' :
						pokemon.fainted ? 'Revives não podem ser usados em combate.' : '',
				}));
			}
			inventoryView.append(targetGrid);
		}
		function captureTarget(item, target) {
			chooseBagAction({
				type: 'capture', ball: item.id, target: target.activeSlot,
				actionId: bagActionId('capture', item.id), expectedRevision: bag.revision,
			});
		}
		function selectCaptureTarget(item, backHandler) {
			const wildBattle = ['wild', 'horde'].includes(session.opponentType) || session.format === 'boss';
			if (!wildBattle) {
				showToast('Poké Balls só podem ser usadas em batalhas selvagens com captura permitida.', true);
				return;
			}
			const targets = (foe?.pokemon || []).filter(pokemon => pokemon.active && !pokemon.fainted);
			if (targets.length === 1) {
				captureTarget(item, targets[0]);
				return;
			}
			inventoryView.replaceChildren(targetHeader(item, backHandler));
			const targetGrid = createElement('div', 'rpg-bag-capture-targets');
			for (const pokemon of targets) {
				const targetButton = button('', 'rpg-bag-capture-target');
				targetButton.append(rpgRuntimeSprite(pokemon, false, true, true), createElement('strong', '', pokemon.name));
				targetButton.addEventListener('click', () => captureTarget(item, pokemon));
				targetGrid.append(targetButton);
			}
			inventoryView.append(targetGrid);
		}
		function renderItems() {
			inventoryView.replaceChildren();
			const supportedCategories = ['healing', 'pp', 'status', 'ball', 'battle'];
			const visible = entries.filter(entry =>
				entry.definition.usableInBattle && supportedCategories.includes(entry.definition.category)
			);
			if (!visible.length) {
				inventoryView.append(createElement('p', 'rpg-bag-empty', 'Nenhum item utiliz\u00e1vel em combate.'));
				return;
			}
			const list = createElement('div', 'rpg-bag-item-list');
			if (visible.length > 8) list.classList.add('scrollable');
			for (const entry of visible) {
				const item = entry.definition;
				const row = createElement('div', 'rpg-bag-item-row');
				const use = button('', 'rpg-bag-item-button');
				const itemName = createElement('span', 'rpg-bag-item-name');
				itemName.append(
					createElement('strong', '', item.name),
					createElement('em', 'rpg-bag-item-description', ' (' + rpgBattleBagItemDescription(item) + ')')
				);
				use.append(bagItemIcon(item), itemName, createElement('b', '', '\u00d7' + entry.quantity));
				use.addEventListener('click', () => item.category === 'ball' ?
					selectCaptureTarget(item, renderItems) : selectMedicineTarget(item, renderItems));
				row.append(use);
				list.append(row);
			}
			inventoryView.append(list);
		}
		shell.append(bagTierPanel, inventoryView);
		content.replaceChildren(slotChooser(showBag), shell);
		renderItems();
	}
	function showRun() {
		content.replaceChildren();
		const box = createElement('div', 'rpg-run-confirmation');
		box.append(createElement('h3', '', 'Consequencias da fuga'));
		const consequences = createElement('ul', 'rpg-run-consequences');
		for (const line of ['HP sera preservado', 'PP sera preservado', 'Status sera preservado', 'Nao recebera EXP', 'Nao recebera Loot']) {
			consequences.append(createElement('li', '', line));
		}
		const actions = createElement('div', 'rpg-run-actions');
		const yes = button('Confirmar fuga', 'button danger');
		yes.disabled = waiting;
		yes.addEventListener('click', () => submit({ type: 'flee' }));
		const no = button('Voltar ao combate', 'button');
		no.addEventListener('click', () => { activate(tabs.firstChild); showFight(); });
		actions.append(yes, no);
		box.append(consequences, actions);
		content.append(box);
	}
	const definitions = [
		['Lutar', showFight, false],
		['Pokemon', () => showTeam(false), !session.rules.allowSwitching && side.requestState !== 'switch'],
		['Bag', showBag, !session.rules.allowItems || !loadBattleBag],
		['Fugir', showRun, !session.rules.canFlee],
	];
	for (const [label, handler, disabled] of definitions) {
		const tab = button(label, 'rpg-command-tab');
		tab.disabled = disabled;
		tab.addEventListener('click', () => { activate(tab); pendingMoveConfirmation = null; handler(); });
		tabs.append(tab);
	}
	panel.append(tabs, content);
	tabs.firstChild.classList.add('active');
	if (!waiting && side.requestState === 'move' && choices.every(Boolean)) {
		const automatic = active.find(pokemon => pokemon.automaticMove);
		content.replaceChildren(createElement('p', 'rpg-waiting-choice',
			(automatic?.name || 'O Pokemon') + ' continua executando ' +
			(automatic?.automaticMove || 'o movimento preparado') + '.'
		));
		queueMicrotask(() => submit({ type: 'turn', choices }));
		return panel;
	}
	showFight();
	return panel;
}
async function rpgBattleRoom(session, character, characters = [], isMaster = false) {
	try { await rpgLoadBattleScenes(); } catch {}
	window.RPGBattleAudio?.playForBattle(session);
	document.getElementById('dashboard-screen')?.classList.add('battle-mode');
	const room = createElement('section', 'rpg-battle-room panel');
	let stopped = false;
	let busy = false;
	let snapshot;
	let visualSnapshot;
	let battleUiPhase = 'loading';
	let introStarted = false;
	const panelSelection = { A: { trainer: 0, active: 0 }, B: { trainer: 0, active: 0 } };
	let renderedSnapshotSignature = '';
	let activeRosterSignature = '';
	let activeRosterKeys = new Set();
	const pendingSwitchInKeys = new Set();
	const animatingSwitchInKeys = new Set();
	let animationInitialized = false;
	let lastQueuedAnimation = -1;
	let animationQueue = Promise.resolve();
	const moveDetails = new Map();
	const bagItemDetails = new Map();
	let battleCharacter = character;

	const viewerParticipant = character ? session.participants.find(entry => entry.characterId === character.id) : null;
	const masterParticipant = isMaster ? session.participants.find(entry => entry.kind !== 'player') : null;
	const controlledTeam = viewerParticipant?.team || masterParticipant?.team || 'A';
	const viewTeam = viewerParticipant?.team || 'A';
	const observer = isMaster && !masterParticipant;

	const engine = createElement('span', 'rpg-engine-state rpg-engine-state-hidden', 'Conectando ao simulador...');
	engine.setAttribute('role', 'status');
	engine.setAttribute('aria-live', 'polite');
	const back = button('Voltar ao painel', 'button rpg-leave-room');
	back.addEventListener('click', () => {
		stopped = true;
		state.dismissedBattleSessionIds?.add(session.id);
		window.RPGBattleAudio?.stop();
		state.dashboardView = 'overview';
		void renderDashboard();
	});
	const fieldControls = createElement('div', 'rpg-battle-field-controls');
	const skipIntro = button('Pular animacao', 'button rpg-skip-intro');
	skipIntro.addEventListener('click', () => void finishIntro(true));
	fieldControls.append(skipIntro, back);
	const live = createElement('div');
	room.append(engine, live);

	async function ensureMoveDetails() {
		const ids = [...new Set((snapshot?.sides || []).flatMap(side =>
			side.pokemon.flatMap(pokemon => pokemon.moves.map(move => move.id))
		))].filter(id => !moveDetails.has(id));
		if (!ids.length) return;
		try {
			const data = await api('/battle-reference?moves=' + encodeURIComponent(ids.join(',')));
			for (const move of data.moves || []) moveDetails.set(move.id, move);
		} catch {}
	}
	async function loadBattleBag() {
		if (!battleCharacter?.id) throw new Error('A Bag está disponível para personagens Player.');
		const data = await api('/bag?characterId=' + encodeURIComponent(battleCharacter.id) + '&context=battle');
		const view = data.bag;
		const inventory = {
			bag: {
				revision: view.revision, maxSlots: view.capacity?.maxSlots,
				items: (view.items || []).map(item => ({ itemId: item.id, quantity: item.quantity })),
			},
		};
		const items = (view.items || []).map(item => ({
			...item, category: item.registryCategory, usableInBattle: true,
		}));
		return { inventory, items };
	}
	async function submit(action) {
		if (battleUiPhase !== 'awaiting_action') {
			showToast('Aguarde a apresentação da batalha terminar.');
			return;
		}
		if (busy) return;
		busy = true;
		battleUiPhase = 'resolving_turn';
		room.classList.add('rpg-resolving-turn');
		engine.textContent = 'Resolvendo turno...';
		try {
			const data = await api('/battle-sessions/' + encodeURIComponent(session.id) + '/action', {
				method: 'POST', body: action,
			});
			snapshot = data.battle;
			if (action.type === 'flee') {
				window.RPGBattleAudio?.playEffect(snapshot.lastAction?.success ? 'fleeSuccess' : 'fleeBlocked');
			}
			await ensureMoveDetails();
			render();
		} catch (error) {
			battleUiPhase = 'awaiting_action';
			room.classList.remove('rpg-resolving-turn');
			showToast(error.message, true);
		} finally {
			busy = false;
		}
	}
	function wait(milliseconds) {
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}
	function redrawVisualSidePanels() {
		if (!visualSnapshot || !snapshot) return;
		const currentSides = Array.isArray(snapshot.sides) ? snapshot.sides : [];
		const visualSides = Array.isArray(visualSnapshot.sides) ? visualSnapshot.sides : [];
		const own = currentSides.find(side => side.team === viewTeam) || currentSides[0];
		const foe = currentSides.find(side => side.team !== viewTeam) || currentSides[1];
		const visualOwn = visualSides.find(side => side.id === own?.id) || own;
		const visualFoe = visualSides.find(side => side.id === foe?.id) || foe;
		const playerPanel = room.querySelector('.rpg-combat-side-panel.player');
		const opponentPanel = room.querySelector('.rpg-combat-side-panel.opponent');
		const replacePanel = (previous, next) => {
			if (!previous) return;
			const previousWidth = previous.querySelector('.rpg-side-hp i')?.style.width;
			const nextFill = next.querySelector('.rpg-side-hp i');
			const finalWidth = nextFill?.style.width;
			if (nextFill && previousWidth) nextFill.style.width = previousWidth;
			previous.replaceWith(next);
			if (nextFill && finalWidth && previousWidth !== finalWidth) {
				void nextFill.offsetWidth;
				nextFill.style.width = finalWidth;
			}
		};
		replacePanel(playerPanel, rpgRuntimeSidePanel(
			session, visualOwn, 'player', characters, panelSelection[own.team]
		));
		replacePanel(opponentPanel, rpgRuntimeSidePanel(
			session, visualFoe, 'opponent', characters, panelSelection[foe.team]
		));
	}
	function applyMegaTransformation(event, fieldPokemon) {
		const transformation = event.transformation;
		const side = visualSnapshot?.sides?.find(entry => entry.id === event.actor.side);
		const pokemon = side?.pokemon?.find(entry =>
			entry.active && entry.activeSlot === event.actor.activeSlot
		) || side?.pokemon?.find(entry => entry.name === event.actor.name);
		if (pokemon) Object.assign(pokemon, {
			species: transformation.toSpecies,
			spriteId: transformation.toSpriteId,
			baseSpriteId: transformation.baseSpriteId,
			types: [...transformation.types],
			ability: transformation.ability,
			abilityDescription: transformation.abilityDescription,
			canMegaEvo: false,
			isMega: true,
			megaEvolution: '',
			megaPreview: null,
		});
		const oldSprite = fieldPokemon.querySelector('.rpg-showdown-sprite');
		const nextSprite = rpgRuntimeSprite({
			name: event.actor.name,
			species: transformation.toSpecies,
			spriteId: transformation.toSpriteId,
			shiny: !!event.actor.shiny,
		}, fieldPokemon.classList.contains('player'));
		if (oldSprite) oldSprite.replaceWith(nextSprite);
		else fieldPokemon.append(nextSprite);
		rpgRuntimeSyncStatusVisual(fieldPokemon, pokemon.status);
		fieldPokemon.dataset.pokemonName = event.actor.name;
		fieldPokemon.dataset.spriteId = transformation.toSpriteId;
		fieldPokemon.dataset.baseSpriteId = transformation.baseSpriteId;
		redrawVisualSidePanels();
		return nextSprite;
	}
	function applyAnimationUpdates(event) {
		for (const update of event.updates || []) {
			const side = visualSnapshot?.sides?.find(entry => entry.id === update.target.side);
			const pokemon = side?.pokemon?.find(entry =>
				entry.active && entry.activeSlot === update.target.activeSlot
			) || side?.pokemon?.find(entry => entry.name === update.target.name);
			if (!pokemon) continue;
			if (Number.isFinite(update.hpFraction)) {
				pokemon.hp = Math.max(0, Math.min(pokemon.maxHP,
					Math.round(pokemon.maxHP * update.hpFraction)));
			}
			if (update.status !== undefined) {
				pokemon.status = update.status;
				rpgRuntimeSyncStatusVisual(runtimePokemonElement(update.target), update.status);
			}
			if (update.boost) {
				pokemon.boosts ||= {};
				pokemon.boosts[update.boost.stat] = Math.max(-6, Math.min(6,
					(pokemon.boosts[update.boost.stat] || 0) + update.boost.delta
				));
			}
			if (update.active === false) {
				pokemon.active = false;
				if (event.type === 'faint') pokemon.fainted = true;
			}
		}
		redrawVisualSidePanels();
	}
	function syncVisualActiveRoster() {
		if (!visualSnapshot || !snapshot) return;
		for (const currentSide of snapshot.sides || []) {
			const visualSide = visualSnapshot.sides?.find(side => side.id === currentSide.id);
			if (!visualSide) continue;
			const currentActive = (currentSide.pokemon || []).filter(pokemon => pokemon.active);
			for (const pokemon of visualSide.pokemon || []) {
				if (pokemon.active && !currentActive.some(active => active.teamPosition === pokemon.teamPosition)) {
					pokemon.active = false;
				}
			}
			for (const active of currentActive) {
				let pokemon = visualSide.pokemon.find(entry => entry.teamPosition === active.teamPosition);
				if (!pokemon) {
					pokemon = structuredClone(active);
					visualSide.pokemon.push(pokemon);
					continue;
				}
				const entering = !pokemon.active;
				pokemon.active = true;
				pokemon.activeSlot = active.activeSlot;
				pokemon.fainted = false;
				if (entering) {
					pokemon.boosts = {
						atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0,
					};
				}
			}
		}
		redrawVisualSidePanels();
	}
	async function finishIntro(skipped = false) {
		if (battleUiPhase === 'awaiting_action' || battleUiPhase === 'finished') return;
		battleUiPhase = 'loading';
		room.classList.add('rpg-intro-show-own', 'rpg-intro-show-foe', 'rpg-intro-show-panels');
		if (skipped) room.classList.add('rpg-intro-skipped');
		try {
			await api('/battle-sessions/' + encodeURIComponent(session.id) + '/runtime-ready', { method: 'POST' });
			battleUiPhase = 'awaiting_action';
			room.classList.remove('rpg-intro-running');
			room.classList.add('rpg-battle-ready');
			skipIntro.hidden = true;
			engine.textContent = snapshot?.sides.find(side => side.team === controlledTeam)?.requestState ?
				'Sua vez · turno ' + snapshot.turn : 'Turno ' + (snapshot?.turn || 1);
		} catch (error) {
			battleUiPhase = 'intro';
			showToast(error.message, true);
		}
	}
	async function playFieldSummons(position = 'all') {
		const field = room.querySelector('.rpg-battle-field');
		if (!field || !window.RPGShowdownAnimations?.summon) return;
		const selector = position === 'all' ? '.rpg-field-pokemon' : '.rpg-field-pokemon.' + position;
		const pokemon = [...field.querySelectorAll(selector)];
		await Promise.all(pokemon.map(async (element, index) => {
			window.RPGBattleAudio?.playCry(element.dataset.spriteId, {
				baseId: element.dataset.baseSpriteId,
				delay: index * 130 + 300,
			});
			await window.RPGShowdownAnimations.summon(field, element, {
				ball: element.dataset.pokeball,
				ballSprite: Number(element.dataset.pokeballSprite),
				delay: index * 130,
			});
			await rpgRuntimePlayShinyEntry(element);
		}));
	}

	async function runIntro() {
		if (introStarted || stopped) return;
		introStarted = true;
		battleUiPhase = 'intro';
		const bossIntro = session.format === 'boss';
		const wildIntro = session.opponentType === 'wild' || session.opponentType === 'horde' || bossIntro;
		room.classList.add('rpg-intro-running', bossIntro ? 'rpg-intro-boss' : wildIntro ? 'rpg-intro-wild' : 'rpg-intro-trainer');
		engine.textContent = 'Apresentando participantes...';
		await wait(300);
		if (battleUiPhase !== 'intro') return;
		if (wildIntro) {
			room.classList.add('rpg-intro-grass', 'rpg-intro-show-foe');
			const field = room.querySelector('.rpg-battle-field');
			const wildPokemon = field ? [...field.querySelectorAll('.rpg-field-pokemon.opponent')] : [];
			if (field && window.RPGShowdownAnimations?.wildAppear) {
				await Promise.all(wildPokemon.map(async (element, index) => {
					window.RPGBattleAudio?.playCry(element.dataset.spriteId, {
						baseId: element.dataset.baseSpriteId,
						delay: index * 100 + 400,
					});
					await window.RPGShowdownAnimations.wildAppear(field, element, { delay: index * 100 });
					await rpgRuntimePlayShinyEntry(element);
				}));
			} else {
				await wait(bossIntro ? 900 : 700);
			}
			if (battleUiPhase !== 'intro') return;
			room.classList.add('rpg-intro-show-own');
			engine.textContent = 'Treinador, escolha seu Pokémon!';
			await playFieldSummons('player');
		} else {
			room.classList.add('rpg-intro-show-own', 'rpg-intro-show-foe');
			engine.textContent = 'Treinadores enviaram seus Pokémon!';
			await playFieldSummons('all');
		}
		if (battleUiPhase !== 'intro') return;
		room.classList.add('rpg-intro-show-panels');
		await wait(520);
		if (battleUiPhase === 'intro') await finishIntro();
	}
	let cancelTargetSelection = null;
	function requestFieldTarget(config) {
		if (cancelTargetSelection) cancelTargetSelection();
		return new Promise(resolve => {
			const field = room.querySelector('.rpg-battle-field');
			if (!field) {
				resolve(null);
				return;
			}
			const candidates = [...field.querySelectorAll('.rpg-field-pokemon[data-runtime-side]')];
			const source = candidates.find(element => element.dataset.runtimeSide === config.sideId &&
				Number(element.dataset.activeSlot) === config.activeSlot);
			const valid = candidates.filter(element => (config.validTargets || []).some(target =>
				target.side === element.dataset.runtimeSide && target.activeSlot === Number(element.dataset.activeSlot)
			));
			if (!valid.length) {
				resolve(null);
				return;
			}
			field.classList.add('rpg-field-targeting');
			source?.classList.add('rpg-target-source');
			engine.textContent = config.moveName + ': clique no Pokémon alvo';
			let finished = false;
			const targetHandlers = new Map();
			let onFieldTargetClick = null;
			const cleanup = value => {
				if (finished) return;
				finished = true;
				field.classList.remove('rpg-field-targeting');
				source?.classList.remove('rpg-target-source');
				for (const element of valid) {
					element.classList.remove('rpg-valid-target', 'rpg-selected-target');
					const registered = targetHandlers.get(element);
					registered?.ring?.remove();
				}
				if (onFieldTargetClick) field.removeEventListener('click', onFieldTargetClick);
				document.removeEventListener('keydown', onKey);
				cancelTargetSelection = null;
				resolve(value);
			};
			const onKey = event => {
				if (event.key === 'Escape') cleanup(null);
			};
			document.addEventListener('keydown', onKey);
			for (const element of valid) {
				element.classList.add('rpg-valid-target');
				const sprite = element.querySelector('.rpg-showdown-sprite');
				const image = sprite?.querySelector('img');
				const surface = image || sprite || element;
				const ring = createElement('i', 'rpg-target-ring');
				if (sprite) {
					sprite.append(ring);
					if (image) {
						ring.style.left = image.offsetLeft + 'px';
						ring.style.top = image.offsetTop + 'px';
						ring.style.width = image.offsetWidth + 'px';
						ring.style.height = image.offsetHeight + 'px';
					}
				}
				const target = config.validTargets.find(entry => entry.side === element.dataset.runtimeSide &&
					entry.activeSlot === Number(element.dataset.activeSlot));
				targetHandlers.set(element, { surface, ring, target });
			}
			onFieldTargetClick = event => {
				const matches = [...targetHandlers.entries()].map(([element, registered]) => {
					const rect = registered.surface.getBoundingClientRect();
					if (event.clientX < rect.left || event.clientX > rect.right ||
						event.clientY < rect.top || event.clientY > rect.bottom) return null;
					const halfWidth = Math.max(1, rect.width / 2);
					const halfHeight = Math.max(1, rect.height / 2);
					const distance = ((event.clientX - (rect.left + halfWidth)) / halfWidth) ** 2 +
						((event.clientY - (rect.top + halfHeight)) / halfHeight) ** 2;
					return { element, distance };
				}).filter(Boolean).sort((a, b) => a.distance - b.distance);
				const selected = matches[0]?.element;
				if (!selected) return;
				event.preventDefault();
				event.stopPropagation();
				selected.classList.add('rpg-selected-target');
				const relation = targetHandlers.get(selected)?.target?.targetLoc;
				if (!Number.isInteger(relation)) return;
				setTimeout(() => cleanup(relation), 260);
			};
			field.addEventListener('click', onFieldTargetClick);
			cancelTargetSelection = () => cleanup(null);
		});
	}

	function runtimePokemonElement(ref) {
		if (!ref) return null;
		return room.querySelector('.rpg-field-pokemon[data-runtime-side="' + ref.side + '"][data-active-slot="' + ref.activeSlot + '"]') ||
			[...room.querySelectorAll('.rpg-field-pokemon[data-runtime-side="' + ref.side + '"]')]
				.find(element => element.dataset.pokemonName === ref.name) || null;
	}
	function runtimeEventTargets(event, attacker) {
		const explicit = (event.targets || []).map(runtimePokemonElement).filter(Boolean);
		if (explicit.length) return [...new Set(explicit)];
		const all = [...room.querySelectorAll('.rpg-field-pokemon[data-runtime-side]')];
		if (event.move.target === 'self') return attacker ? [attacker] : [];
		if (['all', 'allAdjacent'].includes(event.move.target)) return all.filter(element => element !== attacker);
		if (['allAdjacentFoes', 'foeSide', 'normal', 'randomNormal'].includes(event.move.target)) {
			return all.filter(element => element.dataset.runtimeSide !== event.actor.side);
		}
		return [];
	}
	async function playAnimationEvent(event) {
		if (stopped || !event?.actor) return;
		const field = room.querySelector('.rpg-battle-field');
		const attacker = runtimePokemonElement(event.actor);
		if (!field || !attacker) return;
		if (event.type === 'mega') {
			engine.textContent = event.actor.name + ' Mega Evoluiu para ' + event.transformation.toSpecies;
			await window.RPGShowdownAnimations?.megaEvolve?.(field, attacker, {
				onTransform: () => {
					const nextSprite = applyMegaTransformation(event, attacker);
					window.RPGBattleAudio?.playCry(event.transformation.toSpriteId, {
						baseId: event.transformation.baseSpriteId,
					});
					return nextSprite;
				},
			});
			await rpgRuntimePlayShinyEntry(attacker);
			await wait(160);
			return;
		}
		if (event.type === 'entry') {
			if (!event.updates?.length) return;
			const labels = {
				spikes: 'Spikes', stealthrock: 'Stealth Rock', toxicspikes: 'Toxic Spikes',
			};
			engine.textContent = event.actor.name + ' sofreu o efeito de ' +
				(event.hazards || []).map(id => labels[id] || id).join(' e ');
			attacker.classList.add('rpg-hit-animation', 'rpg-hit-rock');
			await wait(160);
			const entryStatus = event.updates?.find(update => update.status)?.status;
			window.RPGBattleAudio?.playEffect(rpgRuntimeStatusSound(entryStatus) || 'residual');
			applyAnimationUpdates(event);
			await wait(180);
			attacker.classList.remove('rpg-hit-animation', 'rpg-hit-rock');
			return;
		}
		if (event.type === 'faint') {
			engine.textContent = event.actor.name + ' desmaiou';
			window.RPGBattleAudio?.playEffect('faint');
			attacker.classList.add('rpg-faint-animation');
			await wait(1150);
			attacker.remove();
			return;
		}
		if (event.type === 'residual') {
			engine.textContent = event.actor.name + ' sofreu dano de ' + event.residual.name;
			await window.RPGShowdownAnimations?.residual?.(field, attacker, {
				...event.residual,
				onImpact: () => { window.RPGBattleAudio?.playEffect('residual'); applyAnimationUpdates(event); },
			});
			await wait(140);
			return;
		}
		if (event.type === 'item') {
			const targets = (event.targets || []).map(runtimePokemonElement).filter(Boolean);
			engine.textContent = event.actor.name + ' usou ' + event.item.name;
			const healingTarget = targets[0];
			if (event.animate !== false && healingTarget) {
				await window.RPGShowdownAnimations?.play?.({
					move: { id: 'recover', name: event.item.name, type: 'Normal', category: 'Status', target: 'self' },
				}, field, healingTarget, [healingTarget], {
					onImpact: () => window.RPGBattleAudio?.playEffect('heal'),
				});
			}
			await wait(220);
			return;
		}
		if (event.type === 'heldItem') {
			engine.textContent = event.actor.name + (event.consumed ? ' consumiu ' : ' ativou ') + event.item.name;
			const icon = rpgRuntimeItemIcon(event.item) || createElement('i', 'rpg-held-item-fallback');
			icon.classList.add('rpg-held-item-animation');
			attacker.append(icon);
			if (event.berry) {
				for (let bite = 1; bite <= 3; bite++) {
					window.RPGBattleAudio?.playEffect('berryBite');
					icon.classList.add('bite-' + bite);
					await wait(230);
				}
			} else {
				window.RPGBattleAudio?.playEffect('heldItemActivate');
				icon.classList.add('activated');
				await wait(620);
			}
			icon.remove();
			return;
		}
		if (event.type === 'capture') {
			const target = (event.targets || []).map(runtimePokemonElement).find(Boolean);
			if (!target) return;
			engine.textContent = event.actor.name + ' lançou ' + event.ball.name;
			await window.RPGShowdownAnimations?.capture?.(field, attacker, target, {
				ball: event.ball.id, ballSprite: event.ball.sprite, success: event.success, shakes: event.shakes,
				onThrow: () => window.RPGBattleAudio?.playEffect('captureThrow'),
				onClose: () => window.RPGBattleAudio?.playEffect('captureClose'),
				onShake: () => window.RPGBattleAudio?.playEffect('captureShake'),
				onSuccess: () => window.RPGBattleAudio?.playEffect('captureSuccess'),
				onFailure: () => window.RPGBattleAudio?.playEffect('captureFailure'),
			});
			engine.textContent = event.success ? event.actor.name + ' realizou a captura!' :
				'O Pokémon selvagem escapou da ' + event.ball.name + '.';
			await wait(300);
			return;
		}
		if (!event.move) return;
		const targets = runtimeEventTargets(event, attacker);
		engine.textContent = event.actor.name + ' usou ' + event.move.name;
		const typeId = rpgRuntimeEffectId(event.move.type);
		const categoryId = rpgRuntimeEffectId(event.move.category);
		const targetId = rpgRuntimeEffectId(event.move.target);
		let statusSounds = [];

		try {
			if (!window.RPGShowdownAnimations?.play) throw new Error('Adaptador de animações indisponível');
			const healingMove = event.updates?.some(update => update.hpChange === 'heal');
			const damagingMove = event.updates?.some(update => update.hpChange === 'damage');
			statusSounds = [...new Set((event.updates || [])
				.map(update => rpgRuntimeStatusSound(update.status)).filter(Boolean))];
			const sound = healingMove ? 'heal' : event.feedback === 'blocked' ? 'moveBlocked' :
				damagingMove ? 'impact' : '';
			const playOutcomeSounds = () => {
				if (sound) window.RPGBattleAudio?.playEffect(sound);
				for (const statusSound of statusSounds) window.RPGBattleAudio?.playEffect(statusSound);
			};
			await window.RPGShowdownAnimations.play(event, field, attacker, targets, {
				onImpact: sound || statusSounds.length ? playOutcomeSounds : undefined,
			});
		} catch (error) {
			// O movimento genérico é reservado ao fallback; a coreografia oficial controla atacante e alvos.
			if (event.move.category === 'Physical') {
				attacker.classList.add('rpg-attack-animation', 'rpg-attack-' + categoryId);
				await wait(760);
				attacker.classList.remove('rpg-attack-animation', 'rpg-attack-' + categoryId);
			}
			if (event.feedback === 'blocked') {
				window.RPGBattleAudio?.playEffect('moveBlocked');
			} else if (event.updates?.some(update => update.hpChange === 'damage')) {
				window.RPGBattleAudio?.playEffect('impact');
				for (const target of targets) target.classList.add('rpg-hit-animation', 'rpg-hit-' + typeId);
			} else if (event.updates?.some(update => update.hpChange === 'heal')) {
				window.RPGBattleAudio?.playEffect('heal');
			}
			for (const statusSound of statusSounds) window.RPGBattleAudio?.playEffect(statusSound);
			const effect = createElement('div', 'rpg-move-effect type-' + typeId + ' category-' + categoryId + ' target-' + targetId);
			effect.dataset.move = event.move.id;
			effect.append(createElement('strong', '', event.move.name), createElement('i', 'rpg-move-effect-core'));
			field.append(effect);
			await wait(event.move.category === 'Status' ? 1150 : 1450);
			effect.remove();
		} finally {
			attacker.classList.remove('rpg-attack-animation', 'rpg-attack-' + categoryId);
			for (const target of targets) target.classList.remove('rpg-hit-animation', 'rpg-hit-' + typeId);
		}
		await wait(280);
	}
	function queueAnimations(events) {
		const validEvents = events.filter(event => event?.actor && (event.type === 'mega' || event.type === 'faint' || event.type === 'item' || event.type === 'heldItem' || event.type === 'capture' || event.type === 'residual' || event.type === 'entry' || event.move));
		if (!validEvents.length) return;
		battleUiPhase = 'resolving_turn';
		room.classList.add('rpg-resolving-turn');
		// Uma animação com erro não pode bloquear permanentemente os turnos seguintes.
		animationQueue = animationQueue.catch(() => undefined).then(async () => {
			for (const event of validEvents) {
				try {
					await playAnimationEvent(event);
					applyAnimationUpdates(event);
				} catch (error) {
					console.error('RPG battle animation failed', error);
				}
			}
			visualSnapshot = structuredClone(snapshot);
			redrawVisualSidePanels();
			room.classList.remove('rpg-resolving-turn');
			if (snapshot?.status === 'ended') {
				showBattleResult();
			} else {
				battleUiPhase = 'awaiting_action';
				const side = snapshot?.sides?.find(entry => entry.team === controlledTeam);
				engine.textContent = side?.requestState ? 'Sua vez · turno ' + snapshot.turn : 'Turno ' + snapshot.turn;
			}
		}).catch(error => {
			console.error('RPG battle animation queue failed', error);
			room.classList.remove('rpg-resolving-turn');
			if (!stopped) battleUiPhase = 'awaiting_action';
		});
	}
	function postBattleAllowedSides() {
		const allowedSides = new Set();
		if (isMaster || observer || !character?.id) return allowedSides;
		for (const participant of session.participants || []) {
			if (participant.kind !== 'player') continue;
			if (isMaster || participant.characterId === character?.id) {
				allowedSides.add(participant.team === 'A' ? 'p1' : 'p2');
			}
		}
		return allowedSides;
	}
	function evolutionCandidatesForViewer() {
		const allowedSides = postBattleAllowedSides();
		return (snapshot?.result?.evolutions || []).filter(candidate =>
			allowedSides.has(candidate.side) && Number.isSafeInteger(candidate.teamPosition)
		);
	}
	function moveLearningCandidatesForViewer() {
		const allowedSides = postBattleAllowedSides();
		const pokemonByPosition = new Map((snapshot?.result?.pokemon || []).map(entry => [
			entry.side + ':' + entry.teamPosition, entry,
		]));
		return (snapshot?.result?.experience || []).flatMap(experience => {
			if (!allowedSides.has(experience.side) || !Number.isSafeInteger(experience.teamPosition)) return [];
			const pokemon = pokemonByPosition.get(experience.side + ':' + experience.teamPosition);
			return (experience.learnedMoves || []).map(learned => ({
				side: experience.side,
				teamPosition: experience.teamPosition,
				pokemonName: pokemon?.name || pokemon?.species || 'Pok\u00e9mon',
				species: pokemon?.species || pokemon?.name || 'Pok\u00e9mon',
				move: learned.move,
				level: learned.level,
				currentMoves: (pokemon?.moves || []).map(entry => entry.id),
			}));
		});
	}
	function showPostBattleProgression(destination) {
		const evolutions = evolutionCandidatesForViewer();
		const moves = moveLearningCandidatesForViewer();
		const orderedKeys = [];
		for (const pokemon of snapshot?.result?.pokemon || []) {
			const key = pokemon.side + ':' + pokemon.teamPosition;
			if (!orderedKeys.includes(key) && (
				evolutions.some(entry => entry.side + ':' + entry.teamPosition === key) ||
				moves.some(entry => entry.side + ':' + entry.teamPosition === key)
			)) orderedKeys.push(key);
		}
		let groupIndex = 0;
		const nextPokemon = () => {
			if (groupIndex >= orderedKeys.length) {
				finishPostBattle(destination);
				return;
			}
			const key = orderedKeys[groupIndex++];
			const pokemonEvolutions = evolutions.filter(entry => entry.side + ':' + entry.teamPosition === key);
			const pokemonMoves = moves.filter(entry => entry.side + ':' + entry.teamPosition === key);
			const learnMoves = () => void showMoveLearningPrompt(pokemonMoves, destination, nextPokemon);
			if (pokemonEvolutions.length) showEvolutionPrompt(pokemonEvolutions, destination, learnMoves);
			else learnMoves();
		};
		nextPokemon();
	}
	function finishPostBattle(destination) {
		stopped = true;
		window.RPGBattleAudio?.stopProgressionMusic();
		room.remove();
		document.getElementById('dashboard-screen')?.classList.remove('battle-mode');
		state.dashboardView = destination || 'overview';
		void renderDashboard();
	}

	function showEvolutionPrompt(candidates, destination, onComplete) {
		window.RPGBattleAudio?.playProgressionMusic();
		const currentSpecies = new Map((snapshot.result?.pokemon || []).map(entry => [
			entry.side + ':' + entry.teamPosition, entry.species,
		]));
		let index = 0;
		const next = () => {
			let candidate;
			while (index < candidates.length) {
				const possible = candidates[index++];
				const key = possible.side + ':' + possible.teamPosition;
				if (rpgRuntimeEffectId(currentSpecies.get(key)) === rpgRuntimeEffectId(possible.fromSpecies)) {
					candidate = possible;
					break;
				}
			}
			if (!candidate) {
				if (onComplete) onComplete();
				else finishPostBattle(destination);
				return;
			}
			const dialog = createElement('div', 'rpg-evolution-dialog');
			const card = createElement('div', 'rpg-evolution-card');
			const question = createElement('h2', '', 'Quer evoluir ' + candidate.fromSpecies + '?');
			const stage = createElement('div', 'rpg-evolution-stage');
			const battleField = room.querySelector('.rpg-battle-field');
			const evolutionScene = RPG_BATTLE_SCENES.find(entry =>
				entry.id === (session.conditions?.sceneId || 'meadow')
			) || RPG_BATTLE_SCENES.find(entry => entry.id === 'meadow');
			stage.style.backgroundImage = battleField?.style.backgroundImage ||
				(evolutionScene ? 'url("' + rpgBattleSceneUrl(evolutionScene) + '")' : '');
			stage.dataset.scene = battleField?.dataset.scene || evolutionScene?.id || 'meadow';
			const sourceRuntimePokemon = (snapshot.sides || []).find(side => side.id === candidate.side)?.pokemon.find(entry =>
				entry.teamPosition === candidate.teamPosition
			);
			const fromSizeClass = candidate.fromSizeClass || sourceRuntimePokemon?.sizeClass || 'medium';
			const toSizeClass = candidate.toSizeClass || 'medium';
			const fromSpriteId = candidate.fromSpriteId || sourceRuntimePokemon?.spriteId || rpgRuntimeEffectId(candidate.fromSpecies);
			const toSpriteId = candidate.toSpriteId || rpgRuntimeEffectId(candidate.toSpecies);
			const spriteHost = createElement('div', 'rpg-evolution-sprite');
			const sourceForm = createElement('div', 'rpg-evolution-form source size-' + fromSizeClass);
			const targetForm = createElement('div', 'rpg-evolution-form target size-' + toSizeClass);
			sourceForm.append(rpgRuntimeSprite({
				species: candidate.fromSpecies, name: candidate.fromSpecies, spriteId: fromSpriteId,
				shiny: candidate.shiny ?? sourceRuntimePokemon?.shiny ?? false,
			}));
			targetForm.append(rpgRuntimeSprite({
				species: candidate.toSpecies, name: candidate.toSpecies, spriteId: toSpriteId,
				shiny: candidate.shiny ?? sourceRuntimePokemon?.shiny ?? false,
			}));
			spriteHost.append(sourceForm, targetForm);
			const particles = createElement('div', 'rpg-evolution-particles');
			const particlePoints = [
				[-92, -54], [-58, -88], [-18, -102], [28, -96], [72, -70], [102, -28],
				[108, 22], [78, 68], [34, 94], [-16, 102], [-62, 82], [-98, 48],
				[-116, -4], [-42, -46], [48, -42], [62, 36], [-48, 42], [2, 68],
			];
			for (const [particleIndex, point] of particlePoints.entries()) {
				const particle = createElement('i');
				particle.style.setProperty('--particle-x', point[0] + 'px');
				particle.style.setProperty('--particle-y', point[1] + 'px');
				particle.style.setProperty('--particle-delay', (particleIndex % 6) * 70 + 'ms');
				particles.append(particle);
			}
			stage.append(
				spriteHost,
				createElement('div', 'rpg-evolution-light'),
				createElement('div', 'rpg-evolution-screen-flash'),
				particles
			);
			const message = createElement('p', 'rpg-evolution-message', candidate.fromSpecies + ' pode evoluir para ' + candidate.toSpecies + '.');
			const actions = createElement('div', 'rpg-evolution-actions');
			const accept = button('Sim', 'button primary');
			const refuse = button('N\u00e3o', 'button');
			accept.addEventListener('click', async () => {
				accept.disabled = true;
				refuse.disabled = true;
				try {
					const data = await api('/battle-sessions/' + encodeURIComponent(session.id) + '/evolution', {
						method: 'POST', body: { side: candidate.side, teamPosition: candidate.teamPosition, toSpecies: candidate.toSpecies },
					});
					message.textContent = data.evolution.fromSpecies + ' está evoluindo...';
					card.classList.add('evolving');
					window.RPGBattleAudio?.playCry(fromSpriteId, { baseId: sourceRuntimePokemon?.baseSpriteId });
					await wait(2250);
					window.RPGBattleAudio?.playEffect('evolution');
					await wait(850);
					window.RPGBattleAudio?.playCry(toSpriteId, { baseId: toSpriteId });
					await wait(1300);
					spriteHost.replaceChildren(rpgRuntimeSprite({
						species: data.evolution.toSpecies, name: data.evolution.toSpecies, spriteId: toSpriteId,
						shiny: data.evolution.shiny ?? candidate.shiny ?? sourceRuntimePokemon?.shiny ?? false,
					}));
					spriteHost.classList.add('size-' + toSizeClass);
					card.classList.remove('evolving');
					card.classList.add('evolved');
					question.textContent = 'Evolu\u00e7\u00e3o conclu\u00edda';
					message.textContent = data.evolution.fromSpecies + ' evoluiu para ' + data.evolution.toSpecies + '!';
					currentSpecies.set(candidate.side + ':' + candidate.teamPosition, data.evolution.toSpecies);
					const evolvedPokemon = (snapshot.result?.pokemon || []).find(entry =>
						entry.side === candidate.side && entry.teamPosition === candidate.teamPosition
					);
					if (evolvedPokemon) {
						const defaultName = rpgRuntimeEffectId(evolvedPokemon.name) === rpgRuntimeEffectId(data.evolution.fromSpecies);
						evolvedPokemon.species = data.evolution.toSpecies;
						if (defaultName) evolvedPokemon.name = data.evolution.toSpecies;
					}
					const evolvedRuntimePokemon = (snapshot.sides || []).find(side => side.id === candidate.side)?.pokemon.find(entry =>
						entry.teamPosition === candidate.teamPosition
					);
					if (evolvedRuntimePokemon) {
						evolvedRuntimePokemon.species = data.evolution.toSpecies;
						evolvedRuntimePokemon.spriteId = rpgRuntimeEffectId(data.evolution.toSpecies);
						evolvedRuntimePokemon.sizeClass = candidate.toSizeClass || evolvedRuntimePokemon.sizeClass;
					}
					if (data.character) battleCharacter = data.character;
					if (data.character?.id === state.currentCharacter?.id) state.currentCharacter = data.character;
					const proceed = button('Continuar', 'button primary');
					proceed.addEventListener('click', () => {
						dialog.remove();
						next();
					});
					actions.replaceChildren(proceed);
				} catch (error) {
					card.classList.remove('evolving');
					accept.disabled = false;
					refuse.disabled = false;
					showToast(error.message, true);
				}
			});
			refuse.addEventListener('click', () => {
				dialog.remove();
				next();
			});
			actions.append(accept, refuse);
			card.append(question, stage, message, actions);
			dialog.append(card);
			live.append(dialog);
		};
		next();
	}
	async function showMoveLearningPrompt(candidates, destination, onComplete) {
		if (!candidates.length) {
			if (onComplete) onComplete();
			else finishPostBattle(destination);
			return;
		}
		window.RPGBattleAudio?.playProgressionMusic();
		const ids = [...new Set(candidates.flatMap(candidate => [candidate.move, ...candidate.currentMoves]))]
			.filter(id => !moveDetails.has(rpgRuntimeEffectId(id)));
		if (ids.length) {
			try {
				const reference = await api('/battle-reference?moves=' + encodeURIComponent(ids.join(',')));
				for (const move of reference.moves || []) moveDetails.set(move.id, move);
			} catch {}
		}
		const moveName = move => moveDetails.get(rpgRuntimeEffectId(move))?.name || move;
		const learningMoveData = move => {
			const id = rpgRuntimeEffectId(move);
			const reference = moveDetails.get(id) || {};
			const pp = Number.isFinite(reference.pp) ? reference.pp : 0;
			return {
				id,
				name: reference.name || move,
				type: reference.type || 'Normal',
				category: reference.category || 'Status',
				pp,
				maxPP: Number.isFinite(reference.maxPP) ? reference.maxPP : pp,
				disabled: false,
				description: reference.description || 'Descri\u00e7\u00e3o ainda n\u00e3o dispon\u00edvel em portugu\u00eas.',
				basePower: reference.basePower ?? null,
				variablePower: !!reference.variablePower,
				accuracy: reference.accuracy ?? null,
				alwaysHits: !!reference.alwaysHits,
				target: reference.target || '',
				targetLabel: reference.targetLabel || reference.target || '',
				flags: reference.flags || [],
				effects: reference.effects || [],
				targets: reference.targets || [],
			};
		};
		const learningMoveCard = (move, selectable = false, sideId = '') => {
			const presentation = learningMoveData(move);
			const rendered = rpgMoveButton(presentation, -1, sideId, { staticDetails: true });
			rendered.cell.classList.add('rpg-move-learning-card-art');
			if (!selectable) rendered.action.classList.add('rpg-move-learning-preview');
			return rendered;
		};
		const movesByPokemon = new Map();
		for (const candidate of candidates) {
			const key = candidate.side + ':' + candidate.teamPosition;
			if (!movesByPokemon.has(key)) movesByPokemon.set(key, [...candidate.currentMoves]);
		}
		let index = 0;
		const next = () => {
			if (index >= candidates.length) {
				if (onComplete) onComplete();
				else finishPostBattle(destination);
				return;
			}
			const candidate = candidates[index++];
			const key = candidate.side + ':' + candidate.teamPosition;
			const knownMoves = movesByPokemon.get(key) || [];
			if (knownMoves.some(move => rpgRuntimeEffectId(move) === rpgRuntimeEffectId(candidate.move))) {
				next();
				return;
			}
			const learnedName = moveName(candidate.move);
			const progressionPokemon = (snapshot.result?.pokemon || []).find(entry =>
				entry.side === candidate.side && entry.teamPosition === candidate.teamPosition
			);
			const pokemonName = progressionPokemon?.name || progressionPokemon?.species || candidate.pokemonName;
			const pokemonSpecies = progressionPokemon?.species || candidate.species;
			const progressionRuntimePokemon = (snapshot.sides || []).find(side => side.id === candidate.side)?.pokemon.find(entry =>
				entry.teamPosition === candidate.teamPosition
			);
			const pokemonSizeClass = progressionRuntimePokemon?.sizeClass || 'medium';
			const dialog = createElement('div', 'rpg-evolution-dialog rpg-move-learning-dialog');
			const card = createElement('div', 'rpg-evolution-card rpg-move-learning-card');
			const title = createElement('h2', '', pokemonName + ' aprendeu ' + learnedName + '.');
			const stage = createElement('div', 'rpg-move-learning-stage size-' + pokemonSizeClass);
			stage.append(rpgRuntimeSprite({ species: pokemonSpecies, name: pokemonName }));
			const message = createElement('p', 'rpg-evolution-message', 'Quer ensinar ' + learnedName + '?');
			const newMovePanel = createElement('section', 'rpg-move-learning-new');
			newMovePanel.append(
				createElement('h3', '', 'Novo golpe'),
				learningMoveCard(candidate.move, false, candidate.side).cell
			);
			const moveGrid = createElement('div', 'rpg-move-learning-grid');
			const confirmation = createElement('div', 'rpg-move-learning-confirmation');
			const actions = createElement('div', 'rpg-evolution-actions');
			const accept = button('Sim', 'button primary');
			const refuse = button('N\u00e3o', 'button');
			const cancel = button('Cancelar', 'button rpg-move-learning-cancel');
			const leave = () => {
				dialog.remove();
				next();
			};
			cancel.addEventListener('click', leave);
			refuse.addEventListener('click', leave);
			const persist = async replaceIndex => {
				card.classList.add('learning');
				for (const control of card.querySelectorAll('button')) control.disabled = true;
				try {
					const body = { side: candidate.side, teamPosition: candidate.teamPosition, move: candidate.move };
					if (replaceIndex !== undefined) body.replaceIndex = replaceIndex;
					const data = await api('/battle-sessions/' + encodeURIComponent(session.id) + '/move-learning', {
						method: 'POST', body,
					});
					const nextMoves = replaceIndex === undefined ?
						[...knownMoves, candidate.move] :
						knownMoves.map((move, moveIndex) => moveIndex === replaceIndex ? candidate.move : move);
					movesByPokemon.set(key, nextMoves);
					if (data.character) battleCharacter = data.character;
					if (data.character?.id === state.currentCharacter?.id) state.currentCharacter = data.character;
					title.textContent = pokemonName + ' aprendeu ' + data.learning.move + '!';
					message.textContent = data.learning.forgottenMove ?
						pokemonName + ' esqueceu ' + data.learning.forgottenMove + '.' :
						'O novo golpe foi adicionado.';
					newMovePanel.remove();
					moveGrid.replaceChildren();
					for (const knownMove of nextMoves) {
						moveGrid.append(learningMoveCard(knownMove, false, candidate.side).cell);
					}
					confirmation.replaceChildren();
					const proceed = button('Continuar', 'button primary');
					proceed.addEventListener('click', leave);
					actions.replaceChildren(proceed);
					card.classList.remove('learning');
				} catch (error) {
					card.classList.remove('learning');
					for (const control of card.querySelectorAll('button')) control.disabled = false;
					showToast(error.message, true);
				}
			};
			accept.addEventListener('click', () => {
				actions.replaceChildren(cancel);
				message.textContent = knownMoves.length >= 4 ?
					'Escolha qual golpe ser\u00e1 substitu\u00eddo.' :
					pokemonName + ' aprender\u00e1 ' + learnedName + '.';
				if (knownMoves.length < 4) {
					void persist(undefined);
					return;
				}
				moveGrid.replaceChildren();
				knownMoves.forEach((knownMove, moveIndex) => {
					const choice = learningMoveCard(knownMove, true, candidate.side);
					choice.action.addEventListener('click', () => {
						for (const entry of moveGrid.children) entry.classList.remove('selected');
						choice.cell.classList.add('selected');
						const confirm = button('Sim', 'button primary');
						confirm.addEventListener('click', () => void persist(moveIndex));
						confirmation.replaceChildren(
							createElement('p', '', pokemonName + ' ir\u00e1 esquecer ' + moveName(knownMove) + '.'),
							confirm
						);
					});
					moveGrid.append(choice.cell);
				});
			});
			actions.append(accept, refuse);
			card.append(title, stage, message, newMovePanel, moveGrid, confirmation, actions, cancel);
			cancel.hidden = true;
			accept.addEventListener('click', () => { cancel.hidden = false; }, { once: true });
			dialog.append(card);
			live.append(dialog);
		};
		next();
	}
	function showBattleResult() {
		if (!snapshot || snapshot.status !== 'ended' || live.querySelector('.rpg-battle-result')) return;
		battleUiPhase = 'finished';
		skipIntro.hidden = true;
		stopped = true;
		window.RPGBattleAudio?.stop();
		const closeResult = destination => {
			live.querySelector('.rpg-battle-result')?.remove();
			showPostBattleProgression(destination);
		};
		const viewSideId = snapshot.sides?.find(side => side.team === viewTeam)?.id || '';
		const viewSide = snapshot.result?.sides?.find(side => side.side === viewSideId) ||
			snapshot.result?.sides?.find(side => side.id === viewSideId);
		if (!['capture', 'flee', 'tie'].includes(snapshot.result?.outcome)) {
			window.RPGBattleAudio?.playEffect(viewSide?.outcome === 'loser' ? 'defeat' : 'victory');
		}
		live.append(rpgRuntimeResult(snapshot, session, viewSideId, isMaster, closeResult));
	}
	function render() {
		if (!snapshot) return;
		const nextSnapshotSignature = JSON.stringify(snapshot);
		if (nextSnapshotSignature === renderedSnapshotSignature) return;
		renderedSnapshotSignature = nextSnapshotSignature;
		const sides = Array.isArray(snapshot.sides) ? snapshot.sides.filter(Boolean) : [];
		if (sides.length < 2) {
			engine.textContent = 'Estado da batalha incompleto';
			return;
		}
		const own = sides.find(side => side.team === viewTeam) || sides[0];
		const foe = sides.find(side => side.team !== viewTeam) || sides[1];
		const commandSide = sides.find(side => side.team === controlledTeam);
		const commandFoe = sides.find(side => side.team !== controlledTeam);
		const ownActive = (own?.pokemon || []).filter(pokemon => pokemon.active)
			.sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0));
		const foeActive = (foe?.pokemon || []).filter(pokemon => pokemon.active)
			.sort((a, b) => (a.activeSlot ?? 0) - (b.activeSlot ?? 0));
		if (battleUiPhase === 'awaiting_action' || snapshot.status === 'ended') {
			engine.textContent = snapshot.status === 'ended' ? 'Batalha encerrada' :
				commandSide?.waiting ? 'Escolha enviada \u00b7 aguardando advers\u00e1rio' :
				commandSide?.requestState ? 'Sua vez \u00b7 turno ' + snapshot.turn :
				'Turno ' + snapshot.turn;
		}
		const layout = createElement('div', 'rpg-battle-layout');
		const center = createElement('main', 'rpg-battle-center');
		const liveWeather = snapshot.field?.weather || session.conditions?.weather?.id || 'none';
		const liveTerrain = snapshot.field?.terrain || session.conditions?.terrain?.id || 'none';
		window.RPGBattleAudio?.setEnvironment({weather: liveWeather, terrain: liveTerrain});
		const field = createElement('div', 'rpg-battle-field weather-' + rpgRuntimeEffectId(liveWeather) +
			' terrain-' + rpgRuntimeEffectId(liveTerrain));
		const availableAnimations = Array.isArray(snapshot.animations) ?
			snapshot.animations.filter(event => event && Number.isFinite(event.sequence) && event.actor &&
				(event.type === 'mega' || event.type === 'faint' || event.type === 'item' || event.type === 'heldItem' || event.type === 'capture' || event.type === 'residual' || event.type === 'entry' || event.move)) : [];
		if (!animationInitialized) {
			animationInitialized = true;
			lastQueuedAnimation = availableAnimations.reduce((maximum, event) => Math.max(maximum, event.sequence), -1);
			visualSnapshot = structuredClone(snapshot);
		}
		const pendingAnimations = availableAnimations.filter(event => event.sequence > lastQueuedAnimation);
		if (pendingAnimations.length) lastQueuedAnimation = pendingAnimations[pendingAnimations.length - 1].sequence;
		if (!visualSnapshot || (!pendingAnimations.length && battleUiPhase !== 'resolving_turn')) {
			visualSnapshot = structuredClone(snapshot);
		}
		const visualSides = Array.isArray(visualSnapshot?.sides) ? visualSnapshot.sides : [];
		const visualOwn = visualSides.find(side => side.id === own.id) || own;
		const visualFoe = visualSides.find(side => side.id === foe.id) || foe;
		const nextRosterSignature = JSON.stringify([
			...ownActive.map(pokemon => ['own', pokemon.activeSlot, pokemon.position, pokemon.species]),
			...foeActive.map(pokemon => ['foe', pokemon.activeSlot, pokemon.position, pokemon.species]),
		]);
		const nextRosterKeys = new Set([
			...ownActive.map(pokemon => own.id + ':' + pokemon.teamPosition),
			...foeActive.map(pokemon => foe.id + ':' + pokemon.teamPosition),
		]);
		const previousRosterKeys = new Set(activeRosterKeys);
		const newlyActiveKeys = activeRosterKeys.size ?
			new Set([...nextRosterKeys].filter(key => !activeRosterKeys.has(key))) : new Set();
		for (const key of newlyActiveKeys) pendingSwitchInKeys.add(key);
		for (const key of [...pendingSwitchInKeys]) {
			if (!nextRosterKeys.has(key)) {
				pendingSwitchInKeys.delete(key);
				animatingSwitchInKeys.delete(key);
			}
		}
		if (activeRosterSignature && nextRosterSignature === activeRosterSignature) {
			field.classList.add('rpg-no-switch-animation');
		}
		activeRosterSignature = nextRosterSignature;
		activeRosterKeys = nextRosterKeys;
		const scene = RPG_BATTLE_SCENES.find(entry => entry.id === (session.conditions?.sceneId || 'meadow')) ||
			RPG_BATTLE_SCENES.find(entry => entry.id === 'meadow');
		if (scene) {
			field.style.backgroundImage = 'url("' + rpgBattleSceneUrl(scene) + '")';
			field.dataset.scene = scene.id;
			field.setAttribute('aria-label', 'Cenário: ' + scene.name);
		}
		const ownFormationSize = Math.max(own?.needsSwitch?.length || 0, ownActive.length, 1);
		const foeFormationSize = Math.max(foe?.needsSwitch?.length || 0, foeActive.length, 1);
		const foePokemon = foeActive.map((pokemon, index) =>
			rpgRuntimeFieldPokemon(pokemon, 'opponent', foe.id, pokemon.activeSlot ?? index, foeFormationSize, pokemon.activeSlot ?? index));
		const ownPokemon = ownActive.map((pokemon, index) =>
			rpgRuntimeFieldPokemon(pokemon, 'player', own.id, pokemon.activeSlot ?? index, ownFormationSize, pokemon.activeSlot ?? index));
		for (const event of pendingAnimations.filter(entry => entry.type === 'mega')) {
			const element = [...foePokemon, ...ownPokemon].find(candidate =>
				candidate.dataset.runtimeSide === event.actor.side &&
				Number(candidate.dataset.activeSlot) === event.actor.activeSlot
			);
			if (!element) continue;
			const currentSprite = element.querySelector('.rpg-showdown-sprite');
			const previousSprite = rpgRuntimeSprite({
				name: event.actor.name,
				species: event.transformation.fromSpecies,
				spriteId: event.transformation.fromSpriteId,
				shiny: !!event.actor.shiny,
			}, element.classList.contains('player'));
			if (currentSprite) currentSprite.replaceWith(previousSprite);
			const status = visualSnapshot?.sides?.find(side => side.id === event.actor.side)?.pokemon?.find(pokemon =>
				pokemon.active && pokemon.activeSlot === event.actor.activeSlot
			)?.status;
			rpgRuntimeSyncStatusVisual(element, status);
			element.dataset.spriteId = event.transformation.fromSpriteId;
			element.dataset.baseSpriteId = event.transformation.fromSpriteId;
		}
		const introEffects = createElement('div', 'rpg-intro-effects');
		field.append(
			rpgRuntimeEnvironment(snapshot.field),
			rpgRuntimeFieldHUD(snapshot, own, foe),
			fieldControls,
			introEffects,
			rpgRuntimeSidePanel(session, visualOwn, 'player', characters, panelSelection[own.team]),
			rpgRuntimeSidePanel(session, visualFoe, 'opponent', characters, panelSelection[foe.team]),
			...foePokemon,
			...ownPokemon
		);
		const switchGhosts = [];

		const previousField = room.querySelector('.rpg-battle-field');
		if (previousField && previousRosterKeys.size) {
			for (const previous of previousField.querySelectorAll('.rpg-field-pokemon[data-runtime-side]')) {
				const key = previous.dataset.runtimeSide + ':' + previous.dataset.teamPosition;
				if (!previousRosterKeys.has(key) || nextRosterKeys.has(key)) continue;
				const fainted = pendingAnimations.some(event => event.type === 'faint' &&
					event.actor.side === previous.dataset.runtimeSide &&
					event.actor.activeSlot === Number(previous.dataset.activeSlot));
				const captured = pendingAnimations.some(event => event.type === 'capture' && event.success &&
					(event.targets || []).some(target =>
						target.side === previous.dataset.runtimeSide &&
						target.activeSlot === Number(previous.dataset.activeSlot)
					));
				if (fainted) continue;
				const ghost = previous.cloneNode(true);
				ghost.classList.remove('rpg-valid-target', 'rpg-selected-target', 'rpg-target-source');
				if (captured) {
					ghost.classList.add('rpg-capture-ghost');
					field.append(ghost);
					continue;
				}
				ghost.classList.add('rpg-switch-out-ghost');
				field.append(ghost);
				switchGhosts.push(ghost);
			}
		}
		for (const event of pendingAnimations.filter(entry => entry.type === 'faint')) {
			const selector = '.rpg-field-pokemon[data-runtime-side="' + event.actor.side + '"][data-active-slot="' + event.actor.activeSlot + '"]';
			if (field.querySelector(selector)) continue;
			const previous = room.querySelector(selector);
			if (!previous) continue;
			const ghost = previous.cloneNode(true);
			ghost.classList.add('rpg-faint-ghost');
			field.append(ghost);
		}
		const switchedIn = [...field.querySelectorAll('.rpg-field-pokemon:not(.rpg-switch-out-ghost)')].filter(element =>
			pendingSwitchInKeys.has(element.dataset.runtimeSide + ':' + element.dataset.teamPosition));
		for (const element of switchedIn) element.classList.add('rpg-switch-in-pending');
		const switchesToAnimate = switchedIn.filter(element =>
			!animatingSwitchInKeys.has(element.dataset.runtimeSide + ':' + element.dataset.teamPosition));
		center.append(field);
		if (snapshot.status === 'active') center.append(rpgRuntimeCommands(session, commandSide, commandFoe, submit, observer, moveDetails, requestFieldTarget, viewerParticipant || masterParticipant, isMaster, battleCharacter ? loadBattleBag : null, snapshot.turn));
		layout.append(center, createElement('aside', 'rpg-battle-bag'));
		if (cancelTargetSelection) cancelTargetSelection();
		live.replaceChildren(layout);

		const animateSwitches = async () => {
			await Promise.all(switchGhosts.map(async (element, index) => {
				if (window.RPGShowdownAnimations?.recall) {
					await window.RPGShowdownAnimations.recall(field, element, {
						ball: element.dataset.pokeball,
						ballSprite: Number(element.dataset.pokeballSprite),
						delay: index * 80,
					});
				} else {
					element.remove();
				}
			}));
			for (const [index, originalElement] of switchesToAnimate.entries()) {
				const key = originalElement.dataset.runtimeSide + ':' + originalElement.dataset.teamPosition;
				const currentField = room.querySelector('.rpg-battle-field') || field;
				const element = currentField.querySelector(
					'.rpg-field-pokemon[data-runtime-side="' + originalElement.dataset.runtimeSide +
					'"][data-team-position="' + originalElement.dataset.teamPosition + '"]'
				);
				if (!element) {
					pendingSwitchInKeys.delete(key);
					animatingSwitchInKeys.delete(key);
					continue;
				}
				const side = snapshot.sides.find(entry => entry.id === element.dataset.runtimeSide);
				const wildSide = session.participants.some(participant => participant.team === side?.team &&
					['wild', 'horde', 'boss'].includes(participant.kind));
				if (wildSide) {
					if (window.RPGShowdownAnimations?.wildAppear) {
						window.RPGBattleAudio?.playCry(element.dataset.spriteId, {
							baseId: element.dataset.baseSpriteId,
							delay: index * 100 + 400,
						});
						await window.RPGShowdownAnimations.wildAppear(currentField, element, { delay: index * 100 });
						await rpgRuntimePlayShinyEntry(element);
					} else {
						element.classList.remove('rpg-switch-in-pending');
					}
					pendingSwitchInKeys.delete(key);
					animatingSwitchInKeys.delete(key);
					continue;
				}
				window.RPGBattleAudio?.playCry(element.dataset.spriteId, {
					baseId: element.dataset.baseSpriteId,
					delay: index * 130 + 300,
				});
				await window.RPGShowdownAnimations?.summon(currentField, element, {
					ball: element.dataset.pokeball,
					ballSprite: Number(element.dataset.pokeballSprite),
					delay: index * 130,
				});
				await rpgRuntimePlayShinyEntry(element);
				element.classList.remove('rpg-switch-in-pending');
				pendingSwitchInKeys.delete(key);
				animatingSwitchInKeys.delete(key);
			}
			syncVisualActiveRoster();
		};
		const hasSwitchAnimation = switchGhosts.length > 0 || switchesToAnimate.length > 0;
		const canAnimateSwitches = hasSwitchAnimation && introStarted && battleUiPhase !== 'intro';
		if (canAnimateSwitches) {
			for (const element of switchesToAnimate) {
				animatingSwitchInKeys.add(element.dataset.runtimeSide + ':' + element.dataset.teamPosition);
			}
		}
		if (pendingAnimations.length) {
			if (canAnimateSwitches && (switchGhosts.length > 0 || pendingAnimations.some(event => event.type === 'entry'))) {
				battleUiPhase = 'resolving_turn';
				room.classList.add('rpg-resolving-turn');
				animationQueue = animationQueue.catch(() => undefined).then(animateSwitches);
				queueAnimations(pendingAnimations);
			} else {
				queueAnimations(pendingAnimations);
				if (canAnimateSwitches) animationQueue = animationQueue.then(animateSwitches);
			}
		} else if (canAnimateSwitches) {
			void animateSwitches();
		}
		if (!introStarted) void runIntro();
		if (!pendingAnimations.length && snapshot.status === 'active' && battleUiPhase === 'resolving_turn') {
			battleUiPhase = 'awaiting_action';
			room.classList.remove('rpg-resolving-turn');
		}
		if (snapshot.status === 'ended' && !pendingAnimations.length) {
			room.classList.remove('rpg-resolving-turn');
			showBattleResult();
		}
	}
	async function refresh() {
		if (stopped || !room.isConnected) return;
		try {
			const data = await api('/battle-sessions/' + encodeURIComponent(session.id) + '/runtime');
			snapshot = data.battle;
			await ensureMoveDetails();
			render();
		} catch (error) {
			engine.textContent = 'Falha na conex\u00e3o';
			showToast(error.message, true);
		}
		if (!stopped && snapshot?.status !== 'ended') setTimeout(refresh, 1500);
	}

	try {
		const data = await api('/battle-sessions/' + encodeURIComponent(session.id) + '/runtime');
		snapshot = data.battle;
		await ensureMoveDetails();
		render();
		setTimeout(refresh, 1500);
	} catch (error) {
		engine.textContent = 'Combate indispon\u00edvel';
		live.append(createElement('p', 'notice error', error.message));
	}
	return room;
}
