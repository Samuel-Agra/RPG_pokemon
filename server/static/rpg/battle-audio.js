'use strict';
(function configureRPGBattleAudio() {
	const STORAGE_KEY = 'rpg-battle-music-volume';
	const EFFECTS_STORAGE_KEY = 'rpg-effects-muted';
	const DEFAULT_VOLUME = 0.18;
	const DEFAULT_EFFECT_VOLUME = 0.35;
	const VOLUME_STEPS = [0, 0.1, 0.18, 0.25, 0.35, 0.5];
	const LOCAL_AUDIO_ROOT = './assets/audio/';
	const LOCAL_AUDIO_VERSION = '20260901-17';
	const localAudioUrl = file => LOCAL_AUDIO_ROOT + file + '?v=' + LOCAL_AUDIO_VERSION;
	const EFFECTS = Object.freeze({
		click: {file: 'ui-click.wav', gain: .55}, impact: {file: 'impact.wav', gain: 1.1},
		residual: {file: 'residual-damage.wav', gain: .9}, heal: {file: 'heal.wav', gain: .85},
		captureSuccess: {file: 'capture-success.wav', gain: 1}, victory: {file: 'victory.wav', gain: 1},
		defeat: {file: 'defeat.wav', gain: .95}, evolution: {file: 'evolution.wav', gain: 1},
		captureThrow: {file: 'capture-throw.wav', gain: .8},
		captureClose: {file: 'capture-close.wav', gain: .85},
		captureShake: {file: 'capture-shake.wav', gain: .75},
		eggShake: {file: 'capture-shake.wav', gain: .48},
		captureFailure: {file: 'capture-failure.wav', gain: .9},
		faint: {file: 'faint.wav', gain: .9},
		fleeSuccess: {file: 'flee-success.wav', gain: .85},
		fleeBlocked: {file: 'flee-blocked.wav', gain: .85},
		moveBlocked: {file: 'move-blocked.wav', gain: .9},
		statusBurn: {file: 'status-burn.wav', gain: .78},
		statusPoison: {file: 'status-poison.wav', gain: .8},
		statusParalysis: {file: 'status-paralysis.wav', gain: .72},
		statusSleep: {file: 'status-sleep.wav', gain: .68},
		statusFreeze: {file: 'status-freeze.wav', gain: .82},
		berryBite: {file: 'berry-bite.wav', gain: .72},
		heldItemActivate: {file: 'held-item-activate.wav', gain: .72},
		levelUp: {file: 'level-up.wav', gain: .9},
		pokemonCenterHeal: {file: 'pokemon-center-heal.wav', gain: .78},
		shinySparkle: {file: 'shiny-sparkle.wav', gain: .62},
		contestAudience1: {file: 'contest-audience-1.wav', gain: .55},
		contestAudience2: {file: 'contest-audience-2.wav', gain: .62},
		contestAudience3: {file: 'contest-audience-3.wav', gain: .72},
		contestAudience4: {file: 'contest-audience-4.wav', gain: .82},
		contestAudience5: {file: 'contest-audience-5.wav', gain: .92},
		contestAudience6: {file: 'contest-audience-6.wav', gain: 1},
	});
	const PROGRESSION_MUSIC = Object.freeze({file: 'progression-theme.wav', gain: .22});
	const ENVIRONMENTS = Object.freeze({
		raindance: {file: 'weather-rain.wav', gain: .5}, rain: {file: 'weather-rain.wav', gain: .5},
		sunnyday: {file: 'weather-sun.wav'}, sun: {file: 'weather-sun.wav'},
		sandstorm: {file: 'weather-sand.wav'}, sand: {file: 'weather-sand.wav'},
		snow: {file: 'weather-snow.wav'}, hail: {file: 'weather-snow.wav'},
		electricterrain: {file: 'terrain-electric.wav', gain: .38}, electric: {file: 'terrain-electric.wav', gain: .38},
		grassyterrain: {file: 'terrain-grassy.wav', gain: .4}, grassy: {file: 'terrain-grassy.wav', gain: .4},
		psychicterrain: {file: 'terrain-psychic.wav'}, psychic: {file: 'terrain-psychic.wav'},
		mistyterrain: {file: 'terrain-misty.wav', gain: .36}, misty: {file: 'terrain-misty.wav', gain: .36},
	});
	const TRACKS = Object.freeze({
		npc: {name: 'DPP Trainer', file: 'dpp-trainer.mp3', loopStart: 13.440, loopEnd: 96.959},
		player: {name: 'BW Rival', file: 'bw-rival.mp3', loopStart: 19.180, loopEnd: 57.373},
		gymLeader: {name: 'BW2 Kanto Gym Leader', file: 'bw2-kanto-gym-leader.mp3', loopStart: 14.626, loopEnd: 58.986},
		tournament: {name: 'XY Trainer', file: 'xy-trainer.mp3', loopStart: 7.802, loopEnd: 82.469},
		tournamentFinal: {name: 'ORAS Rival', file: 'oras-rival.mp3', loopStart: 14.303, loopEnd: 69.149},
		performance: {name: 'BW2 Homika/Dogars', file: 'bw2-homika-dogars.mp3', loopStart: 1.661, loopEnd: 68.131},
		eliteFour: {name: 'SPL Elite 4', file: 'spl-elite4.mp3', loopStart: 3.962, loopEnd: 152.509},
		boss: {name: 'HGSS Kanto Trainer', file: 'hgss-kanto-trainer.mp3', loopStart: 13.003, loopEnd: 94.656},
		horde: {name: 'HGSS Johto Trainer', file: 'hgss-johto-trainer.mp3', loopStart: 23.731, loopEnd: 125.086},
		wild: {name: 'BW Trainer', file: 'bw-trainer.mp3', loopStart: 14.629, loopEnd: 110.109},
	});
	function normalized(value) {
		return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.toLowerCase().replace(/[^a-z0-9]+/g, '');
	}
	function clampVolume(value) {
		const number = Number(value);
		return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : DEFAULT_VOLUME;
	}
	function storedVolume() {
		try {
			const stored = window.localStorage?.getItem(STORAGE_KEY);
			return stored === null ? DEFAULT_VOLUME : clampVolume(stored);
		} catch {
			return DEFAULT_VOLUME;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
	}
	function npcDescriptor(session) {
		return (session?.participants || []).filter(participant => participant?.kind === 'npc')
			.map(participant => [
				participant.npcRole, participant.role, participant.category, participant.displayName,
			].map(normalized).join(' ')).join(' ');
	}
	function selectTrack(session) {
		const activity = normalized(
			session?.musicContext?.activity || session?.activityType || session?.battleActivity
		);
		const tournamentFinal = session?.musicContext?.tournamentFinal === true ||
			session?.tournament?.final === true || normalized(session?.tournamentRound) === 'final';
		if (activity === 'performance' || activity === 'performancedispute') return TRACKS.performance;
		if (tournamentFinal) return TRACKS.tournamentFinal;
		if (activity === 'tournament' || session?.tournament) return TRACKS.tournament;
		const npc = npcDescriptor(session);
		if (npc.includes('elite4') || npc.includes('elitefour') || npc.includes('elitedosquatro')) {
			return TRACKS.eliteFour;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		if (npc.includes('gymleader') || npc.includes('liderdeginasio')) return TRACKS.gymLeader;
		if (session?.format === 'boss' || session?.opponentType === 'boss') return TRACKS.boss;
		if (session?.opponentType === 'horde') return TRACKS.horde;
		if (session?.opponentType === 'player') return TRACKS.player;
		if (session?.opponentType === 'npc') return TRACKS.npc;
		if (session?.opponentType === 'wild') return TRACKS.wild;
		return null;
	}
	let volume = storedVolume();
	let effectsMuted = storedEffectsMuted();
	let audio = null;
	let currentFile = '';
	let unlockHandler = null;
	const cryAudios = new Set();
	const cryTimers = new Set();
	const effectAudios = new Set();
	const environmentAudios = new Map();
	let environmentSignature = '';
	let progressionAudio = null;
	const fadeTimers = new Set();
	function fadeAudio(target, targetVolume, duration, onComplete) {
		if (!target) return;
		if (target.rpgFadeTimer) {
			clearInterval(target.rpgFadeTimer);
			fadeTimers.delete(target.rpgFadeTimer);
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		const initial = Number(target.volume) || 0;
		const steps = Math.max(1, Math.round(duration / 50));
		let step = 0;
		const timer = setInterval(() => {
			step++;
			const progress = Math.min(1, step / steps);
			target.volume = Math.max(0, Math.min(1, initial + (targetVolume - initial) * progress));
			if (progress < 1) return;
			clearInterval(timer);
			fadeTimers.delete(timer);
			target.rpgFadeTimer = null;
			onComplete?.();
		}, 50);
		target.rpgFadeTimer = timer;
		fadeTimers.add(timer);
	}
	function removeUnlockHandler() {
		if (!unlockHandler) return;
		document.removeEventListener('pointerdown', unlockHandler);
		document.removeEventListener('keydown', unlockHandler);
		unlockHandler = null;
	}
	function tryPlay() {
		if (!audio || !volume) return;
		const playResult = audio.play();
		if (!playResult?.catch) return;
		playResult.catch(() => {
			if (unlockHandler) return;
			unlockHandler = () => {
				removeUnlockHandler();
				if (audio && volume) void audio.play().catch(() => undefined);
			};
			document.addEventListener('pointerdown', unlockHandler, {once: true});
			document.addEventListener('keydown', unlockHandler, {once: true});
		});
	}
	function cryIdentifier(value) {
		return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
			.toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '');
	}
	function playCry(value, options = {}) {
		if (!window.RPGAssets?.external || effectsMuted) return null;
		const ids = [...new Set([cryIdentifier(value), cryIdentifier(options.baseId)].filter(Boolean))];
		if (!ids.length) return null;
		const start = () => {
			cryTimers.delete(timer);
			let candidate = 0;
			const attempt = () => {
				if (candidate >= ids.length || effectsMuted) return;
				const cry = new Audio(window.RPGAssets.url('audio/cries/' + ids[candidate++] + '.mp3'));
				cry.volume = Math.min(0.35, DEFAULT_EFFECT_VOLUME * .8);
				cryAudios.add(cry);
				const cleanup = () => cryAudios.delete(cry);
				cry.addEventListener('ended', cleanup, {once: true});
				cry.addEventListener('error', () => {
					cleanup();
					attempt();
				}, {once: true});
				void cry.play().catch(cleanup);
			};
			attempt();
		};
		const delay = Math.max(0, Number(options.delay) || 0);
		const timer = delay ? setTimeout(start, delay) : null;
		if (timer) cryTimers.add(timer);
		else start();
		return timer;
	}
	function playEffect(name) {
		const definition = EFFECTS[name];
		if (!definition || effectsMuted) return null;
		const effect = new Audio(localAudioUrl(definition.file));
		effect.preload = 'auto';
		effect.volume = Math.min(.5, DEFAULT_EFFECT_VOLUME * definition.gain);
		effectAudios.add(effect);
		const cleanup = () => effectAudios.delete(effect);
		effect.addEventListener('ended', cleanup, {once: true});
		effect.addEventListener('error', cleanup, {once: true});
		void effect.play().catch(cleanup);
		return effect;
	}
	function stopEnvironment(options = {}) {
		const fade = options.fade !== false;
		for (const ambience of environmentAudios.values()) {
			const finish = () => { ambience.pause(); ambience.currentTime = 0; };
			if (fade && !ambience.paused && ambience.volume) fadeAudio(ambience, 0, 900, finish);
			else finish();
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		environmentAudios.clear();
		environmentSignature = '';
	}
	function setEnvironment(field = {}) {
		const ids = [...new Set([normalized(field.weather), normalized(field.terrain)]
			.filter(id => id && id !== 'none' && ENVIRONMENTS[id]))];
		const signature = ids.join('|');
		if (signature === environmentSignature) return signature;
		stopEnvironment({fade: true});
		environmentSignature = signature;
		for (const id of ids) {
			const ambience = new Audio(localAudioUrl(ENVIRONMENTS[id].file));
			ambience.loop = true; ambience.preload = 'auto';
			ambience.rpgGain = ENVIRONMENTS[id].gain || .32;
			ambience.rpgTargetVolume = Math.min(.14, volume * ambience.rpgGain);
			ambience.volume = 0;
			environmentAudios.set(id, ambience);
			if (volume) {
				void ambience.play().then(() => fadeAudio(ambience, ambience.rpgTargetVolume, 750)).catch(() => undefined);
			}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		return signature;
	}
	function playProgressionMusic() {
		if (progressionAudio) return progressionAudio;
		progressionAudio = new Audio(localAudioUrl(PROGRESSION_MUSIC.file));
		progressionAudio.loop = true;
		progressionAudio.preload = 'auto';
		progressionAudio.volume = 0;
		progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
		if (volume) void progressionAudio.play().then(() => {
			fadeAudio(progressionAudio, progressionAudio.rpgTargetVolume, 900);
		}).catch(() => undefined);
		return progressionAudio;
	}
	function stopProgressionMusic(options = {}) {
		const current = progressionAudio;
		progressionAudio = null;
		if (!current) return;
		const finish = () => { current.pause(); current.currentTime = 0; };
		if (options.fade !== false && !current.paused && current.volume) fadeAudio(current, 0, 650, finish);
		else finish();
	}
	function playForBattle(session) {
		const track = selectTrack(session);
		if (!track || !window.RPGAssets?.external) {
			stop();
			return track;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		if (audio && currentFile === track.file) {
			audio.volume = volume;
			tryPlay();
			return track;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		stop();
		audio = new Audio(window.RPGAssets.url('audio/' + track.file));
		audio.loop = false;
		audio.preload = 'auto';
		audio.addEventListener('timeupdate', () => {
			if (audio && audio.currentTime >= track.loopEnd) audio.currentTime = track.loopStart;
		});
		audio.addEventListener('ended', () => {
			if (!audio) return;
			audio.currentTime = track.loopStart;
			tryPlay();
		});
		audio.volume = volume;
		currentFile = track.file;
		tryPlay();
		return track;
	}
	function storedEffectsMuted() {
		try { return window.localStorage?.getItem(EFFECTS_STORAGE_KEY) === 'true'; } catch { return false; }
	}
	function playForContest() {
		return playForBattle({musicContext: {activity: 'performance'}, participants: []});
	}
	function stop() {
		removeUnlockHandler();
		stopEnvironment({fade: true});
		for (const timer of cryTimers) clearTimeout(timer);
		cryTimers.clear();
		for (const cry of cryAudios) {
			cry.pause();
			cry.currentTime = 0;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		cryAudios.clear();
		if (audio) {
			audio.pause();
			audio.currentTime = 0;
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		audio = null;
		currentFile = '';
	}
	function setVolume(nextVolume) {
		volume = clampVolume(nextVolume);
		if (audio) {
			audio.volume = volume;
			if (volume) tryPlay();
			else audio.pause();
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		for (const ambience of environmentAudios.values()) {
			ambience.rpgTargetVolume = Math.min(.14, volume * (ambience.rpgGain || .32));
			ambience.volume = ambience.rpgTargetVolume;
			if (volume && ambience.paused) void ambience.play().catch(() => undefined);
			else if (!volume) ambience.pause();
		}
		if (progressionAudio) {
			progressionAudio.rpgTargetVolume = Math.min(.07, volume * PROGRESSION_MUSIC.gain);
			progressionAudio.volume = progressionAudio.rpgTargetVolume;
		}
		try {
			window.localStorage?.setItem(STORAGE_KEY, String(volume));
		} catch {}
		return volume;
	}
	function setEffectsMuted(muted) {
		effectsMuted = !!muted;
		if (effectsMuted) {
			for (const timer of cryTimers) clearTimeout(timer);
			cryTimers.clear();
			for (const effect of effectAudios) { effect.pause(); effect.currentTime = 0; }
			for (const cry of cryAudios) { cry.pause(); cry.currentTime = 0; }
			effectAudios.clear(); cryAudios.clear();
		}
		try { window.localStorage?.setItem(EFFECTS_STORAGE_KEY, String(effectsMuted)); } catch {}
		return effectsMuted;
	}
	function createVolumeButton() {
		const control = document.createElement('button');
		control.type = 'button';
		control.className = 'button rpg-battle-volume-control';
		const update = () => {
			const percent = Math.round(volume * 100);
			control.textContent = volume ? '\u266b ' + percent + '%' : '\u266b Mudo';
			control.title = 'Volume do áudio do RPG: ' + percent + '%';
			control.setAttribute('aria-label', control.title);
			control.setAttribute('aria-pressed', volume ? 'false' : 'true');
		};
		control.addEventListener('click', () => {
			const currentIndex = VOLUME_STEPS.findIndex(step => Math.abs(step - volume) < 0.001);
			setVolume(VOLUME_STEPS[(currentIndex + 1 + VOLUME_STEPS.length) % VOLUME_STEPS.length]);
			update();
		});
		update();
		return control;
	}
	function createVerticalVolumeControl() {
		const wrapper = document.createElement('div');
		wrapper.className = 'rpg-vertical-volume';
		const panel = document.createElement('div');
		panel.className = 'rpg-vertical-volume-panel hidden';
		const value = document.createElement('output');
		value.className = 'rpg-vertical-volume-value';
		const slider = document.createElement('input');
		slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
		slider.className = 'rpg-vertical-volume-slider';
		slider.setAttribute('orient', 'vertical');
		const control = document.createElement('button');
		control.type = 'button'; control.className = 'button rpg-contest-volume-control';
		const update = () => {
			const percent = Math.round(volume * 100);
			slider.value = String(percent); slider.style.setProperty('--volume-percent', `${percent}%`);
			value.value = `${percent}%`; value.textContent = percent ? `${percent}%` : 'Mudo';
			control.textContent = percent ? `♫ ${percent}%` : '♫ Mudo';
			control.title = `Volume do áudio do RPG: ${percent}%`;
			control.setAttribute('aria-label', control.title);
			control.setAttribute('aria-expanded', String(!panel.classList.contains('hidden')));
		};
		const closeOutside = event => {
			if (wrapper.contains(event.target)) return;
			panel.classList.add('hidden'); document.removeEventListener('pointerdown', closeOutside, true); update();
		};
		control.addEventListener('click', () => {
			const opening = panel.classList.contains('hidden');
			panel.classList.toggle('hidden'); update();
			if (opening) {
				document.addEventListener('pointerdown', closeOutside, true);
				slider.focus({preventScroll: true});
			} else document.removeEventListener('pointerdown', closeOutside, true);
		});
		slider.addEventListener('input', () => { setVolume(Number(slider.value) / 100); update(); });
		panel.append(value, slider); wrapper.append(panel, control); update(); return wrapper;
	}
	function createEffectsToggleButton() {
		const control = document.createElement('button');
		control.type = 'button'; control.className = 'button rpg-contest-effects-control';
		const update = () => {
			control.textContent = effectsMuted ? '♩ Efeitos mudos' : '♪ Efeitos';
			control.title = effectsMuted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros';
			control.setAttribute('aria-label', control.title);
			control.setAttribute('aria-pressed', String(effectsMuted));
			control.classList.toggle('muted', effectsMuted);
		};
		control.addEventListener('click', () => { setEffectsMuted(!effectsMuted); update(); });
		update(); return control;
	}
	document.addEventListener('click', event => {
		const control = event.target?.closest?.('button, [role="button"], .button');
		if (control?.closest?.('.rpg-battle-room') && !control.disabled &&
			control.getAttribute?.('aria-disabled') !== 'true') playEffect('click');
	});
	document.addEventListener('change', event => {
		if (event.target?.matches?.('.rpg-battle-room select')) playEffect('click');
	});
	window.RPGBattleAudio = Object.freeze({
		tracks: TRACKS, effects: EFFECTS, environments: ENVIRONMENTS,
		selectTrack, playForBattle, playForContest, playCry, playEffect, setEnvironment, stopEnvironment,
		playProgressionMusic, stopProgressionMusic, stop, setVolume, setEffectsMuted,
		getVolume: () => volume, getEffectsMuted: () => effectsMuted,
		createVolumeButton, createVerticalVolumeControl, createEffectsToggleButton,
	});
})();
