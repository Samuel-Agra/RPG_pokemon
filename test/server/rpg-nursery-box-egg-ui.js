'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const box = fs.readFileSync(path.join(root, 'server/static/rpg/box-ui.js'), 'utf8');
const nursery = fs.readFileSync(path.join(root, 'server/static/rpg/nursery-ui.js'), 'utf8');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');

describe('RPG Egg presentation outside incubation', () => {
	it('shows Eggs in party slots without drag, drop, details, or Box movement', () => {
		assert.match(rpg, /teamEggs: teamEggs\(character\)/);
		assert.match(box, /const eggs = Array\.isArray\(deps\.teamEggs\)/);
		assert.match(box, /box-team-egg-slot/);
		assert.match(box, /slot\.disabled = true/);
		assert.match(box, /Não pode ser movido para a Box/);
		assert.match(box, /view\.team\.length \+ \(deps\.teamEggs\?\.length \|\| 0\) >= 6/);
	});

	it('uses the official Egg sprite in the Nursery instead of the CSS illustration', () => {
		assert.match(nursery, /const icon = el\('img', 'nursery-egg'\)/);
		assert.match(nursery, /options\.spriteUrl\(\{species: 'Egg'\}\)/);
		assert.doesNotMatch(nursery, /const icon = el\('span', 'nursery-egg'\)/);
	});
});
