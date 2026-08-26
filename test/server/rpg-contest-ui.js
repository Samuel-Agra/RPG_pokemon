'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG contest UI', () => {
	const root = path.resolve(__dirname, '../../server/static/rpg');
	it('loads a dedicated contest page and keeps its implementation separate from battle code', () => {
		const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
		const app = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
		assert.ok(html.includes('contest-ui.css'));
		assert.ok(html.includes('contest-ui.js'));
		assert.ok(app.includes("['contests', 'Concursos']"));
		assert.ok(app.includes('window.RPGContestUI.render'));
	});

	it('provides move selection, judging, reactions, results and an event-ready stage', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		for (const marker of ['select-move', 'submit-judging', 'audienceReactions', 'contest.results', 'select-pokemon']) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(css.includes('@keyframes contest-enter'));
		assert.ok(css.includes('@keyframes contest-move'));
	});
});
