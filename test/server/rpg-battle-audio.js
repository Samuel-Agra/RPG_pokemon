'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
describe('RPG battle audio', function () {
	function load() {
		const storage = new Map();
		const document = {
			listeners: {},
			addEventListener(type, listener) { this.listeners[type] = listener; }, removeEventListener() {},
			createElement() {
				return {
					className: '', type: '', setAttribute() {},
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
		vm.runInNewContext(source, {window, document, Audio, setInterval, clearInterval, setTimeout, clearTimeout});
		return {api: window.RPGBattleAudio, storage, audioInstances, document};
	}
	it('maps implemented encounter types to their requested tracks', function () {
		const {api} = load();
		assert.equal(api.selectTrack({opponentType: 'npc', participants: []}).file, 'dpp-trainer.mp3');
		assert.equal(api.selectTrack({opponentType: 'player', participants: []}).file, 'bw-rival.mp3');
		assert.equal(api.selectTrack({opponentType: 'wild', participants: []}).file, 'bw-trainer.mp3');
		assert.equal(api.selectTrack({opponentType: 'horde', participants: []}).file, 'hgss-johto-trainer.mp3');
		assert.equal(api.selectTrack({format: 'boss', opponentType: 'wild', participants: []}).file, 'hgss-kanto-trainer.mp3');
	});
	it('prioritizes special NPC roles and future activity metadata', function () {
		const {api} = load();
		assert.equal(api.selectTrack({
			opponentType: 'npc', participants: [{kind: 'npc', npcRole: 'gym-leader'}],
		}).file, 'bw2-kanto-gym-leader.mp3');
		assert.equal(api.selectTrack({
			opponentType: 'npc', participants: [{kind: 'npc', npcRole: 'elite-four'}],
		}).file, 'spl-elite4.mp3');
		assert.equal(api.selectTrack({musicContext: {activity: 'tournament'}, participants: []}).file, 'xy-trainer.mp3');
		assert.equal(api.selectTrack({
			musicContext: {activity: 'tournament', tournamentFinal: true}, participants: [],
		}).file, 'oras-rival.mp3');
		assert.equal(api.selectTrack({musicContext: {activity: 'performance'}, participants: []}).file, 'bw2-homika-dogars.mp3');
	});
	it('plays a Pokemon cry from the external provider at a restrained volume', function () {
		const {api, audioInstances} = load();
		api.playCry('charizard-megax', {baseId: 'charizard'});
		assert.equal(audioInstances.length, 1);
		assert.equal(audioInstances[0].src, 'https://play.pokemonshowdown.com/audio/cries/charizard-megax.mp3');
		assert(Math.abs(audioInstances[0].volume - 0.225) < 1e-9);
	});
	it('starts quietly and exposes an unmounted persistent volume control', function () {
		const {api, storage} = load();
		assert.equal(api.getVolume(), 0.18);
		const button = api.createVolumeButton();
		assert.equal(button.textContent, '\u266b 18%');
		button.onclick();
		assert.equal(api.getVolume(), 0.25);
		assert.equal(storage.get('rpg-battle-music-volume'), '0.25');
	});
	it('plays original local cues and keeps unchanged ambience running', function () {
		const {api, audioInstances} = load();
		const effect = api.playEffect('heal');
		assert.equal(effect.src, './assets/audio/heal.wav?v=20260811-11');
		assert.equal(api.setEnvironment({weather: 'RainDance', terrain: 'Electric Terrain'}), 'raindance|electricterrain');
		assert.equal(audioInstances.length, 3);
		assert.equal(audioInstances[1].src, './assets/audio/weather-rain.wav?v=20260811-11');
		assert.equal(audioInstances[2].src, './assets/audio/terrain-electric.wav?v=20260811-11');
		assert.equal(audioInstances[1].loop, true);
		api.setEnvironment({weather: 'RainDance', terrain: 'Electric Terrain'});
		assert.equal(audioInstances.length, 3, 'render updates must not restart ambience');
	});
	it('limits interface click sounds to controls inside the battle room', function () {
		const {audioInstances, document} = load();
		const control = inside => ({
			disabled: false,
			closest: selector => selector === '.rpg-battle-room' && inside ? {} : null,
			getAttribute: () => null,
		});
		document.listeners.click({target: {closest: () => control(false)}});
		assert.equal(audioInstances.length, 0);
		document.listeners.click({target: {closest: () => control(true)}});
		assert.equal(audioInstances[0].src, './assets/audio/ui-click.wav?v=20260811-11');
	});
	it('exposes the complete capture, faint, flee and block cue set', function () {
		const {api} = load();
		for (const name of ['captureThrow', 'captureClose', 'captureShake', 'captureFailure',
			'faint', 'fleeSuccess', 'fleeBlocked', 'moveBlocked']) assert(api.effects[name], name);
	});
	it('exposes status, held-item, level-up and quiet progression audio', function () {
		const {api, audioInstances} = load();
		for (const name of ['statusBurn', 'statusPoison', 'statusParalysis', 'statusSleep',
			'statusFreeze', 'berryBite', 'heldItemActivate', 'levelUp', 'shinySparkle']) assert(api.effects[name], name);
		const shiny = api.playEffect('shinySparkle');
		assert.equal(shiny.src, './assets/audio/shiny-sparkle.wav?v=20260811-11');
		const music = api.playProgressionMusic();
		assert.equal(music.src, './assets/audio/progression-theme.wav?v=20260811-11');
		assert.equal(music.loop, true);
		assert.equal(audioInstances.length, 2);
	});

});