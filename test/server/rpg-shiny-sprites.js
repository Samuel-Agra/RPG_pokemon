'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('RPG shiny sprite presentation', () => {
	it('uses the official Showdown shiny directories for static, animated, and back sprites', () => {
		const room = read('server/static/rpg/battle-room.js');
		for (const directory of ['gen5-shiny/', 'gen4-shiny/', 'ani-shiny/', 'ani-back-shiny/', 'gen5-back-shiny/']) {
			assert(room.includes(directory), 'missing shiny sprite directory: ' + directory);
		}
		assert.match(room, /const shiny = !!pokemon\?\.shiny/);
		assert.match(room, /dataset\.shiny = pokemon\.shiny/);
	});

	it('passes shiny through the shared Team, Box, Team Builder, Bag, Mega, and evolution renderers', () => {
		const main = read('server/static/rpg/rpg.js');
		const room = read('server/static/rpg/battle-room.js');
		const bag = read('server/static/rpg/bag-ui.js');
		assert.match(main, /spriteUrl\(pokemon\)/);
		assert.match(main, /gen5-shiny/);
		assert.match(main, /shiny: evolution\.shiny/);
		assert.match(room, /shiny: !!event\.actor\.shiny/);
		assert.match(room, /shiny: candidate\.shiny/);
		assert.match(bag, /shiny: target\.shiny/);
	});

	it('plays the original rainbow-star effect only for shiny battle sprites on every entrance path', () => {
		const room = read('server/static/rpg/battle-room.js');
		const css = read('server/static/rpg/battle-room.css');
		const asset = path.join(ROOT, 'server/static/rpg/assets/effects/shiny-rainbow-stars-alpha.png');
		assert(fs.existsSync(asset), 'missing transparent rainbow-star sprite sheet');
		assert(fs.statSync(asset).size > 1000, 'rainbow-star sprite sheet is unexpectedly empty');
		assert.match(room, /function rpgRuntimePlayShinyEntry\(fieldPokemon\)/);
		assert.match(room, /fieldPokemon\.dataset\.shiny !== 'true'/);
		assert.match(room, /Math\.max\(imageWidth, imageHeight\) \* 1\.12/);
		assert.match(room, /image\?\.offsetLeft/);
		assert.match(room, /image\?\.offsetTop/);
		assert.match(room, /playEffect\('shinySparkle'\)/);
		assert((room.match(/await rpgRuntimePlayShinyEntry\(/g) || []).length >= 5,
			'shiny effect must cover intro, wild, switch, and Mega entrance paths');
		assert.match(css, /shiny-rainbow-stars-alpha\.png/);
		assert.match(css, /steps\(7, end\)/);
	});
});