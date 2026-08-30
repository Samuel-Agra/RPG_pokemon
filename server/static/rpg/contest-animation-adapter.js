'use strict';

/* global window, document */
(function configureContestAnimations() {
	const wait = time => new Promise(resolve => window.setTimeout(resolve, time));
	const id = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	const persistentStageSignatures = new Map();
	const FLOOR_POSITIONS = Object.freeze([
		[18, 79, .72], [31, 70, .82], [43, 84, .9], [57, 73, .86], [69, 82, .96], [82, 68, .78],
	]);
	const PERSISTENT_PROPS = Object.freeze({
		spikes: {effect: 'caltrop', count: 6, className: 'hazard'},
		toxicspikes: {effect: 'poisoncaltrop', count: 5, className: 'hazard toxic'},
		floatingrocks: {effects: ['rock1', 'rock2', 'rock3'], count: 6, className: 'floating-rock'},
		stickyweb: {effect: 'web', count: 3, className: 'web'},
		raisedstones: {effects: ['rock1', 'rock2'], count: 5, className: 'stone'},
		debris: {effects: ['rock1', 'rock2'], count: 4, className: 'debris'},
		scatteredleaves: {effects: ['leaf1', 'leaf2'], count: 6, className: 'leaf'},
		frozenstage: {effect: 'iceball', count: 4, className: 'ice'},
		flamering: {effects: ['fireball', 'wisp'], count: 6, className: 'flame'},
		whirlpool: {effect: 'waterwisp', count: 6, className: 'water-ring'},
	});
	const PERSISTENT_TEXTURES = Object.freeze([
		{tags: ['wetstage', 'reflective'], file: 'surf-ripples.png', count: 3, className: 'water'},
		{tags: ['crackedground'], file: 'earthquake-cracks.png', count: 2, className: 'cracks'},
		{tags: ['darkenedstage'], file: 'smokescreen-cloud.png', count: 3, className: 'smoke'},
		{tags: ['mist', 'haze'], file: 'mist-wisps.png', count: 3, className: 'mist'},
		{tags: ['heatedsand', 'sandvortex'], file: 'sandsear-vortex.png', count: 2, className: 'sand'},
	]);
	const SELF_TAGS = new Set(['calm', 'dance', 'defense', 'expression', 'healing', 'playful', 'status']);
	const EXPRESSIVE_LINES = [
		(name, move) => [`Uau!! ${name} usou`, move, '!'],
		(name, move) => ['Que execução de', move, ` por ${name}!`],
		(name, move) => [`Olhem só! ${name} apresenta`, move, '!'],
		(name, move) => ['Brilhante! É hora de', move, '!'],
		(name, move) => [`${name} ilumina o palco com`, move, '!'],
		(name, move) => ['Que espetáculo! Vem aí', move, '!'],
		(name, move) => [`Incrível! ${name} executa`, move, '!'],
		(name, move) => ['O palco é todo de', move, '!'],
		(name, move) => [`Sensacional! ${name} mostra`, move, '!'],
		(name, move) => ['Atenção para esta execução de', move, '!'],
		(name, move) => [`${name} surpreende com`, move, '!'],
		(name, move) => ['Que presença! É', move, '!'],
		(name, move) => [`O público vibra: ${name} usa`, move, '!'],
		(name, move) => ['Uma entrada perfeita para', move, '!'],
		(name, move) => [`${name} domina o palco com`, move, '!'],
		(name, move) => ['Pura emoção em', move, '!'],
		(name, move) => [`Preparem-se! ${name} lança`, move, '!'],
		(name, move) => ['Que momento! Vejam', move, '!'],
		(name, move) => [`${name} transforma a cena com`, move, '!'],
		(name, move) => ['Uma apresentação memorável de', move, '!'],
		(name, move) => [`É show! ${name} escolheu`, move, '!'],
		(name, move) => ['O ritmo muda com', move, '!'],
		(name, move) => [`Magnífico! ${name} revela`, move, '!'],
		(name, move) => ['E agora... toda a força de', move, '!'],
	];

	function cue(stage, text, className = '') {
		const node = document.createElement('div');
		node.className = `contest-animation-cue ${className}`.trim();
		node.textContent = text; stage.append(node); return node;
	}
	function stageAnchor(stage) {
		const anchor = document.createElement('i');
		anchor.className = 'contest-show-target'; stage.append(anchor); return anchor;
	}
	function effectUrl(effect) {
		const data = window.BattleEffects?.[effect] || {url: `${effect}.png`};
		const url = data.url || `${effect}.png`;
		return /^https?:|^data:/i.test(url) ? url : window.RPGAssets.url(`fx/${url.replace(/^\//, '')}`);
	}
	function activeStageLayer(state) {
		const base = state?.base || {}; const temporary = state?.temporary || {};
		return {
			weather: temporary.weather || base.weather || '', terrain: temporary.terrain || base.terrain || '',
			tags: [...new Set([...(base.tags || []), ...(temporary.tags || [])].map(id).filter(Boolean))],
		};
	}
	function appendAtmosphere(layer, state) {
		const environment = document.createElement('div'); environment.className = 'rpg-field-environment contest-persistent-environment';
		const weather = document.createElement('i'); weather.className = `rpg-weather-effect weather ${id(state.weather)}weather`;
		const terrain = document.createElement('i'); terrain.className = `rpg-terrain-effect weather ${id(state.terrain)}terrainweather`;
		environment.append(terrain, weather); layer.append(environment);
	}
	function appendStageTexture(layer, tags) {
		for (const definition of PERSISTENT_TEXTURES) {
			if (!definition.tags.some(tag => tags.has(tag))) continue;
			const texture = document.createElement('div');
			texture.className = `contest-persistent-texture ${definition.className}`;
			for (let index = 0; index < definition.count; index++) {
				const [left, top, scale] = FLOOR_POSITIONS[(index * 2 + definition.file.length) % FLOOR_POSITIONS.length];
				const sprite = document.createElement('img'); sprite.alt = ''; sprite.setAttribute('aria-hidden', 'true');
				sprite.src = new URL(`./assets/contest-effects/${definition.file}`, document.baseURI).href;
				sprite.style.setProperty('--texture-left', `${left}%`); sprite.style.setProperty('--texture-top', `${top}%`);
				sprite.style.setProperty('--texture-scale', scale); sprite.style.setProperty('--texture-delay', `${index * 320}ms`);
				texture.append(sprite);
			}
			layer.append(texture);
		}
	}
	function appendPersistentProps(layer, tags, entering) {
		for (const [tag, definition] of Object.entries(PERSISTENT_PROPS)) {
			if (!tags.has(tag)) continue;
			for (let index = 0; index < definition.count; index++) {
				const [left, top, scale] = FLOOR_POSITIONS[(index + tag.length) % FLOOR_POSITIONS.length];
				const effects = definition.effects || [definition.effect]; const effect = effects[index % effects.length];
				const prop = document.createElement('img');
				prop.className = `contest-persistent-prop ${definition.className}${entering ? ' is-entering' : ''}`;
				prop.src = effectUrl(effect); prop.alt = ''; prop.setAttribute('aria-hidden', 'true');
				prop.style.setProperty('--prop-left', `${left}%`); prop.style.setProperty('--prop-top', `${top}%`);
				prop.style.setProperty('--prop-scale', scale); prop.style.setProperty('--prop-delay', `${index * 70}ms`);
				layer.append(prop);
			}
		}
	}
	function renderPersistentStage(stage, stageState, options = {}) {
		if (!stage) return;
		stage.querySelector('.contest-persistent-stage')?.remove();
		const state = activeStageLayer(stageState); const tags = new Set(state.tags);
		const signature = JSON.stringify(state); const cacheKey = options.cacheKey || '';
		const previous = cacheKey ? persistentStageSignatures.get(cacheKey) : signature;
		const entering = Boolean(cacheKey && previous !== undefined && previous !== signature);
		if (cacheKey) persistentStageSignatures.set(cacheKey, signature);
		const layer = document.createElement('div'); layer.className = 'contest-persistent-stage';
		appendAtmosphere(layer, state); appendStageTexture(layer, tags); appendPersistentProps(layer, tags, entering);
		stage.prepend(layer);
	}
	function expressiveCue(stage, pokemonName, move, event, category) {
		const variant = Math.abs(Number(event.sequence) || 0) % EXPRESSIVE_LINES.length;
		const [lead, moveName, tail] = EXPRESSIVE_LINES[variant](pokemonName || 'O Pokémon', move.name);
		const node = document.createElement('div');
		node.className = `contest-expressive-callout style-${variant % 8} tone-${id(category)}`;
		node.setAttribute('role', 'status');
		node.setAttribute('aria-live', 'polite');
		node.append(document.createElement('span'), document.createElement('strong'), document.createElement('span'));
		node.children[0].textContent = lead; node.children[1].textContent = moveName; node.children[2].textContent = tail;
		stage.append(node); return node;
	}
	function trainerChoreography(move) {
		const tags = new Set((move.tags || []).map(id));
		if (tags.has('dance') || tags.has('movement')) return 'flourish';
		if (tags.has('cute') || tags.has('playful') || tags.has('expression')) return 'cheer';
		if (move.battleCategory === 'Physical' || tags.has('power') || tags.has('impact')) return 'command';
		if (move.battleCategory === 'Special' || tags.has('energy') || tags.has('magic')) return 'conduct';
		return 'focus';
	}
	function moveSound(move) {
		const tags = new Set((move.tags || []).map(id));
		if (tags.has('healing') || tags.has('heal')) return 'heal';
		const statusSounds = {
			brn: 'statusBurn', psn: 'statusPoison', tox: 'statusPoison', par: 'statusParalysis',
			slp: 'statusSleep', frz: 'statusFreeze',
		};
		if (statusSounds[id(move.battleStatus)]) return statusSounds[id(move.battleStatus)];
		if (move.battleCategory === 'Physical' || move.battleCategory === 'Special' || Number(move.basePower) > 0) return 'impact';
		return '';
	}
	async function fallbackMove(stage, pokemon, move) {
		const effect = document.createElement('div');
		effect.className = `contest-show-fallback type-${id(move.type)} category-${id(move.battleCategory)}`;
		effect.append(cue(effect, move.name, 'contest-show-fallback-name'));
		stage.append(effect);
		pokemon.classList.add('contest-pokemon-performing');
		await wait(move.battleCategory === 'Status' ? 1050 : 1350);
		pokemon.classList.remove('contest-pokemon-performing'); effect.remove();
	}
	async function stageChange(stage, event) {
		const transformations = event.stageTransformations || [];
		const interactions = event.stageInteractions || [];
		if (!transformations.length && !interactions.length) return;
		const change = document.createElement('div');
		change.className = 'contest-stage-change';
		change.dataset.effects = [...transformations, ...interactions].map(id).join(' ');
		stage.append(change); await wait(720); change.remove();
	}

	async function playMove(stage, pokemon, trainer, move, event, options = {}) {
		if (!stage || !pokemon || !move) return;
		stage.classList.add('contest-show-running', `contest-show-type-${id(move.type)}`);
		const trainerAction = `contest-trainer-action-${trainerChoreography(move)}`;
		trainer?.classList.add('contest-trainer-presenting', trainerAction);
		if (event.megaActivated && window.RPGShowdownAnimations?.megaEvolve) {
			await window.RPGShowdownAnimations.megaEvolve(stage, pokemon, {onTransform: options.onMegaTransform});
			await wait(220);
		}
		const announcement = expressiveCue(stage, options.pokemonName, move, event, options.contestCategory);
		const spotlight = document.createElement('i'); spotlight.className = 'contest-show-spotlight'; stage.append(spotlight);
		await wait(420);
		const anchor = stageAnchor(stage);
		const personal = (move.tags || []).some(tag => SELF_TAGS.has(id(tag)));
		let soundPlayed = false;
		const playMoveSound = () => {
			if (soundPlayed) return;
			soundPlayed = true;
			const sound = moveSound(move); if (sound) window.RPGBattleAudio?.playEffect(sound);
		};
		try {
			if (!window.RPGShowdownAnimations?.play) throw new Error('Showdown animation adapter unavailable');
			await window.RPGShowdownAnimations.play({
				move: {
					id: move.moveId || move.id, name: move.name, type: move.type,
					category: move.battleCategory || 'Status', target: personal ? 'self' : 'normal',
				},
			}, stage, pokemon, personal ? [pokemon] : [anchor], {onImpact: playMoveSound});
		} catch (error) {
			playMoveSound();
			await fallbackMove(stage, pokemon, move);
		} finally {
			anchor.remove();
		}
		await stageChange(stage, event);
		await wait(180);
		announcement.remove(); spotlight.remove(); trainer?.classList.remove('contest-trainer-presenting', trainerAction);
		stage.classList.remove('contest-show-running', `contest-show-type-${id(move.type)}`);
	}
	async function entrance(stage) {
		if (!stage) return;
		const trainer = stage.querySelector('.contest-stage-trainer');
		const pokemon = stage.querySelector('.contest-stage-pokemon');
		stage.classList.add('contest-participant-entering');
		const announcement = cue(stage, 'Agora no palco', 'contest-entry-announcement');
		await Promise.all([
			trainer?.animate([
				{opacity: 0, transform: 'translate3d(70px, 8px, 0) scale(.94)'},
				{opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)'},
			], {duration: 900, easing: 'ease-out'}).finished.catch(() => undefined),
			pokemon?.animate([
				{opacity: 0, transform: 'translate3d(-50%, 28px, 0) scale(.75)'},
				{opacity: 1, transform: 'translate3d(-50%, 0, 0) scale(1)'},
			], {duration: 1000, easing: 'cubic-bezier(.2,.8,.35,1)'}).finished.catch(() => undefined),
		].filter(Boolean));
		await wait(250); announcement.remove(); stage.classList.remove('contest-participant-entering');
	}
	function altariaSprite() {
		if (typeof window.rpgRuntimeSprite === 'function') {
			return window.rpgRuntimeSprite({name: 'Altaria', species: 'Altaria', spriteId: 'altaria'});
		}
		const image = document.createElement('img'); image.src = window.RPGAssets.url('sprites/ani/altaria.gif'); image.alt = 'Altaria';
		return image;
	}
	async function cleanupStage(stage) {
		if (!stage || stage.dataset.hasTemporaryEffects !== 'true') return;
		stage.classList.add('contest-stage-cleanup-start');
		await wait(620);
		const cleaner = document.createElement('div'); cleaner.className = 'contest-cleanup-altaria'; cleaner.append(altariaSprite());
		const wind = document.createElement('div'); wind.className = 'contest-cleanup-wind';
		for (let index = 0; index < 7; index++) {
			const current = document.createElement('i'); current.style.setProperty('--wind-index', index); wind.append(current);
		}
		stage.append(cleaner, wind);
		await wait(620);
		stage.classList.add('contest-stage-cleaning');
		await wait(1250);
		stage.querySelector('.contest-persistent-stage')?.remove();
		stage.classList.add('contest-stage-cleaned');
		await wait(620);
		cleaner.remove(); wind.remove();
		stage.classList.remove('contest-stage-cleanup-start', 'contest-stage-cleaning', 'contest-stage-cleaned');
	}
	async function reaction(stage, reaction) {
		if (!stage || !reaction) return;
		const level = Math.max(1, Math.min(6, Number(reaction.level) || 1));
		const particleCounts = [3, 6, 10, 16, 24, 34];
		const reactionDurations = [1150, 1350, 1650, 2000, 2450, 3000];
		window.RPGBattleAudio?.playEffect(`contestAudience${level}`);
		const burst = document.createElement('div'); burst.className = `contest-audience-burst level-${level}`;
		const atmosphere = document.createElement('div'); atmosphere.className = 'contest-audience-atmosphere'; burst.append(atmosphere);
		const announcement = cue(burst, `${reaction.emoji || ''} ${reaction.label || ''}`.trim(), 'contest-audience-reaction');
		announcement.dataset.level = String(level);
		if (level >= 3) {
			for (let index = 0; index < Math.min(3, level - 2); index++) {
				const wave = document.createElement('b'); wave.className = 'contest-audience-wave'; wave.style.setProperty('--wave-index', index); burst.append(wave);
			}
		}
		for (let index = 0; index < particleCounts[level - 1]; index++) {
			const particle = document.createElement('i');
			particle.className = `particle-${index % 4}`;
			particle.style.setProperty('--particle-index', index);
			particle.style.setProperty('--particle-left', `${5 + ((index * 37) % 91)}%`);
			particle.style.setProperty('--particle-drift', `${((index * 29) % 81) - 40}px`);
			particle.style.setProperty('--particle-delay', `${(index % 9) * 38}ms`);
			burst.append(particle);
		}
		stage.append(burst); await wait(reactionDurations[level - 1]); burst.remove();
	}
	async function disqualify(stage) {
		if (!stage) return;
		const announcement = cue(stage, 'Apresentação encerrada', 'contest-exit-announcement');
		stage.classList.add('contest-participant-exiting'); await wait(900);
		announcement.remove(); stage.classList.remove('contest-participant-exiting');
	}

	window.RPGContestAnimations = Object.freeze({playMove, entrance, reaction, disqualify, cleanupStage, renderPersistentStage});
})();
