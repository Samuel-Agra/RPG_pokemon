'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
describe('RPG battle audio', () => {
	function load() {
		const storage = new Map();
		const document = {
			listeners: {},
			addEventListener(type, listener) { this.listeners[type] = listener; }, removeEventListener() {},
			createElement() {
				const classes = new Set();
				return {
					className: '', type: '', setAttribute() {}, style: { setProperty() {} },
					children: [], append(...children) { this.children.push(...children); }, focus() {},
					contains(node) { return this === node || this.children.some(child => child.contains?.(node)); },
					classList: {
						add: (...names) => names.forEach(name => classes.add(name)),
						remove: (...names) => names.forEach(name => classes.delete(name)),
						toggle: name => classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true),
						contains: name => classes.has(name),
					},
					addEventListener(type, listener) { this['on' + type] = listener; },
				};
			},
		};
		const audioInstances = [];
		class Audio {
			constructor(src) {
				this.src = src; this.currentTime = 0; this.paused = true; this.listeners = {};
				audioInstances.push(this);
			}
			addEventListener(type, listener) { this.listeners[type] = listener; }
			play() { this.paused = false; return Promise.resolve(); }
			pause() { this.paused = true; }
		}
		const window = {
			document, Audio,
			RPGAssets: {
				external: true,
				url: value => 'https://play.pokemonshowdown.com/' + value,
			},
			localStorage: {
				getItem: key => storage.has(key) ? storage.get(key) : null,
				setItem: (key, value) => storage.set(key, value),
			},
		};
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-audio.js'), 'utf8');
		vm.runInNewContext(source, { window, document, Audio, setInterval, clearInterval, setTimeout, clearTimeout });
		return { api: window.RPGBattleAudio, storage, audioInstances, document };
	}
	it('maps implemented encounter types to their requested tracks', () => {
		const { api } = load();
		assert.equal(api.selectTrack({ opponentType: 'npc', participants: [] }).file, 'dpp-trainer.mp3');
		assert.equal(api.selectTrack({ opponentType: 'player', participants: [] }).file, 'bw-rival.mp3');
		assert.equal(api.selectTrack({ opponentType: 'wild', participants: [] }).file, 'bw-trainer.mp3');
		assert.equal(api.selectTrack({ opponentType: 'horde', participants: [] }).file, 'hgss-johto-trainer.mp3');
		assert.equal(api.selectTrack({ format: 'boss', opponentType: 'wild', participants: [] }).file, 'hgss-kanto-trainer.mp3');
	});
	it('prioritizes special NPC roles and future activity metadata', () => {
		const { api } = load();
		assert.equal(api.selectTrack({
			opponentType: 'npc', participants: [{ kind: 'npc', npcRole: 'gym-leader' }],
		}).file, 'bw2-kanto-gym-leader.mp3');
		assert.equal(api.selectTrack({
			opponentType: 'npc', participants: [{ kind: 'npc', npcRole: 'elite-four' }],
		}).file, 'spl-elite4.mp3');
		assert.equal(api.selectTrack({ musicContext: { activity: 'tournament' }, participants: [] }).file, 'xy-trainer.mp3');
		assert.equal(api.selectTrack({
			musicContext: { activity: 'tournament', tournamentFinal: true }, participants: [],
		}).file, 'oras-rival.mp3');
		assert.equal(api.selectTrack({ musicContext: { activity: 'performance' }, participants: [] }).file, 'bw2-homika-dogars.mp3');
	});
	it('plays the prepared performance theme for contests without restarting it on refresh', () => {
		const { api, audioInstances } = load();
		assert.equal(api.playForContest().file, 'bw2-homika-dogars.mp3');
		assert.equal(audioInstances.length, 1);
		assert.equal(audioInstances[0].src, 'https://play.pokemonshowdown.com/audio/bw2-homika-dogars.mp3');
		api.playForContest();
		assert.equal(audioInstances.length, 1, 'contest refresh must preserve the current music instance');
		assert.equal(audioInstances[0].paused, false);
	});
	it('plays a Pokemon cry from the external provider at a restrained volume', () => {
		const { api, audioInstances } = load();
		api.playCry('charizard-megax', { baseId: 'charizard' });
		assert.equal(audioInstances.length, 1);
		assert.equal(audioInstances[0].src, 'https://play.pokemonshowdown.com/audio/cries/charizard-megax.mp3');
		assert(Math.abs(audioInstances[0].volume - 0.28) < 1e-9);
	});
	it('starts quietly and exposes an unmounted persistent volume control', () => {
		const { api, storage } = load();
		assert.equal(api.getVolume(), 0.18);
		const button = api.createVolumeButton();
		assert.equal(button.textContent, '\u266b 18%');
		button.onclick();
		assert.equal(api.getVolume(), 0.25);
		assert.equal(storage.get('rpg-battle-music-volume'), '0.25');
	});
	it('provides a continuous vertical contest volume slider whose minimum is mute', () => {
		const { api, document } = load();
		const wrapper = api.createVerticalVolumeControl();
		const [panel, button] = wrapper.children;
		const [value, slider] = panel.children;
		assert.equal(slider.type, 'range');
		assert.equal(slider.min, '0');
		assert.equal(slider.max, '100');
		panel.classList.add('hidden');
		button.onclick();
		assert.equal(panel.classList.contains('hidden'), false);
		document.listeners.pointerdown({ target: {} });
		assert.equal(panel.classList.contains('hidden'), true, 'clicking outside must close the slider');
		slider.value = '0'; slider.oninput();
		assert.equal(api.getVolume(), 0);
		assert.equal(value.textContent, 'Mudo');
		assert.equal(button.textContent, '♫ Mudo');
	});
	it('persists an independent effects mute without muting contest music', () => {
		const { api, storage, audioInstances } = load();
		api.playForContest();
		const control = api.createEffectsToggleButton();
		control.onclick();
		assert.equal(api.getEffectsMuted(), true);
		assert.equal(storage.get('rpg-effects-muted'), 'true');
		assert.equal(api.playEffect('impact'), null);
		assert.equal(audioInstances[0].paused, false, 'music remains active when effects are muted');
		control.onclick();
		assert.equal(api.getEffectsMuted(), false);
		assert(api.playEffect('impact'));
	});
	it('plays original local cues and keeps unchanged ambience running', () => {
		const { api, audioInstances } = load();
		const effect = api.playEffect('heal');
		assert.equal(effect.src, './assets/audio/heal.wav?v=20260901-17');
		assert.equal(api.setEnvironment({ weather: 'RainDance', terrain: 'Electric Terrain' }), 'raindance|electricterrain');
		assert.equal(audioInstances.length, 3);
		assert.equal(audioInstances[1].src, './assets/audio/weather-rain.wav?v=20260901-17');
		assert.equal(audioInstances[2].src, './assets/audio/terrain-electric.wav?v=20260901-17');
		assert.equal(audioInstances[1].loop, true);
		api.setEnvironment({ weather: 'RainDance', terrain: 'Electric Terrain' });
		assert.equal(audioInstances.length, 3, 'render updates must not restart ambience');
	});
	it('limits interface click sounds to controls inside the battle room', () => {
		const { audioInstances, document } = load();
		const control = inside => ({
			disabled: false,
			closest: selector => selector === '.rpg-battle-room' && inside ? {} : null,
			getAttribute: () => null,
		});
		document.listeners.click({ target: { closest: () => control(false) } });
		assert.equal(audioInstances.length, 0);
		document.listeners.click({ target: { closest: () => control(true) } });
		assert.equal(audioInstances[0].src, './assets/audio/ui-click.wav?v=20260901-17');
	});
	it('exposes the complete capture, faint, flee and block cue set', () => {
		const { api } = load();
		for (const name of ['captureThrow', 'captureClose', 'captureShake', 'eggShake', 'captureFailure',
			'faint', 'fleeSuccess', 'fleeBlocked', 'moveBlocked']) assert(api.effects[name], name);
	});
	it('exposes status, held-item, level-up and quiet progression audio', () => {
		const { api, audioInstances } = load();
		for (const name of ['statusBurn', 'statusPoison', 'statusParalysis', 'statusSleep',
			'statusFreeze', 'berryBite', 'heldItemActivate', 'levelUp', 'shinySparkle']) assert(api.effects[name], name);
		const shiny = api.playEffect('shinySparkle');
		assert.equal(shiny.src, './assets/audio/shiny-sparkle.wav?v=20260901-17');
		const music = api.playProgressionMusic();
		assert.equal(music.src, './assets/audio/progression-theme.wav?v=20260901-17');
		assert.equal(music.loop, true);
		assert.equal(audioInstances.length, 2);
	});
});
