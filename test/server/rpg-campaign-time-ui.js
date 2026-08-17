'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../server/static/rpg');

describe('RPG campaign clock frontend', () => {
	const ui = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
	const css = fs.readFileSync(path.join(root, 'rpg.css'), 'utf8');
	const http = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/http.ts'), 'utf8');

	it('renders exclusive Master controls for one-hour and eight-hour advances', () => {
		assert(ui.includes("section('Relógio da campanha')"));
		assert(ui.includes('for (const hours of [1, 8])'));
		assert(ui.includes("api('/campaign/time/advance'"));
		assert(css.includes('.campaign-clock-actions'));
	});

	it('connects the controls to the authenticated campaign time endpoint', () => {
		assert(http.includes("url.pathname === '/api/rpg/campaign/time/advance'"));
		assert(http.includes('this.login.advanceCampaignTime'));
	});
});
