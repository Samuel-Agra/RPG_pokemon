'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const bagUi = fs.readFileSync(path.join(root, 'server/static/rpg/bag-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');

describe('RPG Master player-view navigation', () => {
	it('opens the existing item grant selector from the Player card without navigating to the Bag', () => {
		assert.match(rpg, /button\('Dar item', 'button master-player-add-item'\)/);
		assert.match(rpg, /masterItemManagerOnly: true, anchor: addItem/);
		assert.match(bagUi, /if \(options\.masterItemManagerOnly\) \{[\s\S]*await showQuantityManager\(options\.anchor\)/);
		assert.match(bagUi, /if \(options\.onMasterItemUpdated\) await options\.onMasterItemUpdated\(\)/);
	});
	it('offers individual shared-inventory locks on the Player card', () => {
		assert.match(rpg, /button\('Inventários', 'master-shops-picker-toggle'\)/);
		assert.match(rpg, /\/characters\/shared-inventories\?characterId=/);
		assert.match(rpg, /inventoryId: entry\.id, allowed: !entry\.allowed/);
		assert.match(rpg, /\['Veículos', data\.vehicles\]/);
		assert.match(rpg, /\['Pontos de Apoio', data\.caches\]/);
	});
	it('returns to the Master overview after leaving a Player view', () => {
		assert.match(rpg,
			/async function exitPlayerView\(\)[\s\S]*saveSession\(data\.session\);[\s\S]*state\.dashboardView = 'overview';[\s\S]*await renderDashboard\(\);/
		);
		assert.match(rpg, /Voltar como Mestre/);
		assert.doesNotMatch(html, /id="view-banner"/);
	});
});
