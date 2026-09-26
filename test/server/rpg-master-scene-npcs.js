'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

describe('RPG master scene NPCs', () => {
	it('places campaign areas, scene NPCs, notes and events in order with a centered folder browser', () => {
		const ui = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/rpg.js'), 'utf8');
		const css = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/rpg.css'), 'utf8');
		const start = ui.indexOf("const notes = section('Anotações rápidas')");
		const scene = ui.indexOf("const scene = section('NPCs em cena')", start);
		const areas = ui.indexOf("const presence = section('Áreas da campanha')", scene);
		assert(start >= 0 && scene > start && areas > scene);
		assert(ui.includes('root.append(presence.panel, scene.panel, notes.panel, events.panel)'));
		assert(ui.includes("api('/campaign/scene-npcs', { method: 'PUT'"));
		assert(ui.includes("window.addEventListener('rpg:realtime-sync', synchronizeScene)"));
		assert(ui.includes("event.stopImmediatePropagation(); closePicker();"));
		assert(ui.includes("const grid = createElement('div', 'master-npc-folder-grid')"));
		assert(ui.includes("const breadcrumbs = createElement('nav', 'master-npc-breadcrumbs')"));
		assert(ui.includes("if (event.target === picker) closePicker()"));
		assert(css.includes('.master-scene-picker { position: fixed; z-index: 1000; inset: 0;'));
		assert(css.includes('.master-scene-team { grid-column: 2; grid-row: 1 / span 2;'));
		assert(css.includes('grid-template-columns: repeat(2, 42px); grid-template-rows: repeat(3, 42px)'));
		assert(css.includes('.master-scene-team .pokemon-sprite img { display: block; width: 38px; height: 38px;'));
		assert(css.includes('.master-scene-npc > strong { grid-column: 1; grid-row: 2;'));
		assert(ui.includes("createElement('span', 'master-scene-hidden-ball')"));
		assert(ui.includes('for (let index = 0; index < 6; index++)'));
		assert(css.includes('.master-scene-hidden-ball { display: block; width: 24px; height: 24px;'));
		assert(css.includes('background-position: -216px -504px;'));
		assert(ui.includes("member.addEventListener('click', () => void healPokemon(index, member))"));
		assert(ui.includes("scene.panel.classList.toggle('is-empty', !selected.length)"));
		assert(ui.includes('scene.panel.hidden = !result.npcs?.length'));
	});

	it('keeps only existing library NPCs in the persisted campaign selection', () => {
		const library = { folders: [], npcs: [
			{ id: 'npc-a', name: 'Ana', sprite: 'ace-trainer', team: [{ species: 'Eevee' }] },
			{ id: 'npc-b', name: 'Beto', sprite: 'hiker', team: [{ species: 'Geodude' }] },
		] };
		const service = new RPGLoginService({ masterCode: 'secret',
			repository: new RPGMemoryCharacterRepository(), masterNPCLibrary: library });
		const master = service.loginMaster('secret');
		assert.deepEqual(service.getCampaignSettings(master.token).sceneNpcIds, []);
		assert.deepEqual(service.setCampaignSceneNPCs(master.token, ['npc-b', 'npc-a', 'npc-b']).sceneNpcIds,
			['npc-b', 'npc-a']);
		assert.deepEqual(service.getCampaignSettings(master.token).sceneNpcIds, ['npc-b', 'npc-a']);
		assert.throws(() => service.setCampaignSceneNPCs(master.token, ['unknown']), /não encontrado/);
		assert.deepEqual(service.getCampaignSettings(master.token).sceneNpcIds, ['npc-b', 'npc-a']);
		assert.throws(() => service.setCampaignSceneNPCs(master.token, 'npc-a'), /inválida/);
		assert.deepEqual(service.setCampaignSceneNPCs(master.token, []).sceneNpcIds, []);
	});

	it('restores saved scene NPC IDs when the table service reloads', () => {
		const service = new RPGLoginService({ masterCode: 'secret',
			repository: new RPGMemoryCharacterRepository(),
			campaignSettings: { sceneNpcIds: ['npc-a', 'npc-a'] },
			masterNPCLibrary: { npcs: [{ id: 'npc-a', name: 'Ana' }] },
		});
		const master = service.loginMaster('secret');
		assert.deepEqual(service.getCampaignSettings(master.token).sceneNpcIds, ['npc-a']);
	});

	it('reveals individual Pokémon without exposing hidden team data', () => {
		const library = { npcs: [{ id: 'npc-a', name: 'Ana', sprite: 'ace-trainer', team: [
			{ species: 'Eevee', shiny: true, moves: ['Tackle'] }, { species: 'Mewtwo', level: 100 },
		] }] };
		const service = new RPGLoginService({ masterCode: 'secret',
			repository: new RPGMemoryCharacterRepository(), masterNPCLibrary: library });
		const master = service.loginMaster('secret');
		service.createCharacter({ characterName: 'Lucas', playerName: 'Lucas', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Charmander', gender: 'M', level: 5 } });
		const player = service.loginPlayer('lucas', 'senha-rpg');
		service.setCampaignSceneNPCs(master.token, ['npc-a']);
		const hidden = service.getCampaignSceneNPCs(player.token);
		assert.deepEqual(hidden.npcs[0].pokemon, [{ revealed: false }, { revealed: false }]);
		assert(!JSON.stringify(hidden).includes('Mewtwo'));
		assert.throws(() => service.setCampaignScenePokemonReveal(player.token, 'npc-a', 0, true));
		assert.deepEqual(service.setCampaignScenePokemonReveal(master.token, 'npc-a', 0, true)
			.sceneNpcRevealed, { 'npc-a': [0] });
		const visible = service.getCampaignSceneNPCs(player.token);
		assert.equal(visible.npcs[0].pokemon[0].species, 'Eevee');
		assert(!JSON.stringify(visible).includes('Tackle'));
		assert(!JSON.stringify(visible).includes('Mewtwo'));
		assert.throws(() => service.setCampaignScenePokemonReveal(master.token, 'npc-a', 3, true), /não encontrado/);
		service.setCampaignSceneNPCs(master.token, []);
		assert.deepEqual(service.getCampaignSettings(master.token).sceneNpcRevealed, {});
	});

	it('heals the saved NPC team and keeps its configured attributes', () => {
		const library = { npcs: [{ id: 'npc-a', name: 'Ana', team: [{ species: 'Eevee', level: 20,
			moves: ['Tackle', 'Growl'], evs: { hp: 0 }, ivs: { hp: 31 },
			rpg: { hp: 1, status: 'brn', pp: [0, 1] } }] }] };
		const service = new RPGLoginService({ masterCode: 'secret',
			repository: new RPGMemoryCharacterRepository(), masterNPCLibrary: library });
		const master = service.loginMaster('secret');
		assert.throws(() => service.healMasterNPC(master.token, 'missing'), /não encontrado/);
		const healed = service.healMasterNPC(master.token, 'npc-a');
		assert.equal(healed.team[0].rpg.status, '');
		assert(healed.team[0].rpg.hp > 1);
		assert.deepEqual(healed.team[0].rpg.pp, [35, 40]);
		assert.equal(healed.team[0].ivs.hp, 31);
		assert.deepEqual(service.getMasterNPCLibrary(master.token).npcs[0], healed);
	});

	it('heals only the Pokémon selected in the expanded NPC team', () => {
		const library = { npcs: [{ id: 'npc-a', name: 'Ana', team: [
			{ species: 'Eevee', level: 20, moves: ['Tackle'], rpg: { hp: 1, status: 'brn', pp: [0] } },
			{ species: 'Pikachu', level: 20, moves: ['Thunder Shock'], rpg: { hp: 2, status: 'par', pp: [1] } },
		] }] };
		const service = new RPGLoginService({ masterCode: 'secret',
			repository: new RPGMemoryCharacterRepository(), masterNPCLibrary: library });
		const master = service.loginMaster('secret');
		assert.throws(() => service.healMasterNPC(master.token, 'npc-a', 2), /não encontrado/);
		assert.throws(() => service.healMasterNPC(master.token, 'npc-a', -1), /não encontrado/);
		const healed = service.healMasterNPC(master.token, 'npc-a', 0);
		assert.equal(healed.team[0].rpg.status, '');
		assert(healed.team[0].rpg.hp > 1);
		assert.deepEqual(healed.team[0].rpg.pp, [35]);
		assert.deepEqual(healed.team[1], library.npcs[0].team[1]);
	});

	it('stores a saved NPC Pokémon’s battle state in the library', () => {
		const service = new RPGLoginService({ masterCode: 'secret', repository: new RPGMemoryCharacterRepository(),
			masterNPCLibrary: { npcs: [{ id: 'npc-a', name: 'Ana', team: [{ species: 'Eevee', level: 20,
				moves: ['tackle'], rpg: { hp: 40, pp: [35] } }] }] },
		});
		service.persistBattlePokemon({ participants: [{ team: 'B', kind: 'npc', sourceNpcId: 'npc-a',
			pokemon: [{ sourcePokemonIndex: 0 }] }] }, { pokemon: [{ side: 'p2', teamPosition: 0,
			species: 'Eevee', level: 20, item: '', evs: { hp: 252 }, ivs: { hp: 31 },
			state: { hp: 12, status: 'par', pp: [4] },
		}] });
		const stored = service.getMasterNPCLibrary(service.loginMaster('secret').token).npcs[0].team[0];
		assert.deepEqual(stored.rpg, { hp: 12, status: 'par', pp: [4] });
		assert.equal(stored.evs.hp, 252);
		assert.equal(stored.ivs.hp, 31);
	});

	it('persists PP spent by a saved NPC in contests', () => {
		const service = new RPGLoginService({ masterCode: 'secret', repository: new RPGMemoryCharacterRepository(),
			masterNPCLibrary: { npcs: [{ id: 'npc-a', name: 'Ana', team: [{ species: 'Eevee',
				moves: ['tackle'], rpg: { hp: 40, pp: [2] } }] }] },
		});
		assert.equal(service.consumeNPCContestMovePP('npc-a', 0, 'tackle'), true);
		assert.equal(service.consumeNPCContestMovePP('npc-a', 0, 'tackle'), true);
		assert.equal(service.consumeNPCContestMovePP('npc-a', 0, 'tackle'), false);
		assert.deepEqual(service.getMasterNPCLibrary(service.loginMaster('secret').token).npcs[0].team[0].rpg.pp, [0]);
	});
});
