'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');

describe('RPG Master player-view navigation', () => {
	it('returns to the Master overview after leaving a Player view', () => {
		assert.match(rpg,
			/async function exitPlayerView\(\)[\s\S]*saveSession\(data\.session\);[\s\S]*state\.dashboardView = 'overview';[\s\S]*await renderDashboard\(\);/
		);
		assert.match(rpg, /Voltar como Mestre/);
		assert.doesNotMatch(html, /id="view-banner"/);
	});
});
