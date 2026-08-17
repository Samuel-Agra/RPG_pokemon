'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'server/rpg-showdown/index.ts'), 'utf8');
const sceneAsset = path.join(root, 'server/static/rpg/assets/pokemon-center-interior-v1.png');
const nurseAsset = path.join(root, 'server/static/rpg/assets/pokemon-center-nurse.png');
const nurseSideAsset = path.join(root, 'server/static/rpg/assets/pokemon-center-nurse-side.png');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');

describe('RPG Pokemon Center frontend', () => {
	it('uses the shared abbreviated and colored status badges in every recovery flow', () => {
		assert.match(rpg, /const statusSymbols = \{ '': 'OK', brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ', fnt: 'FNT' \}/);
		assert.match(rpg, /'box-condition status-' \+ \(normalized \|\| 'normal'\)/);
		assert.match(rpg, /if \(pokemon\.fainted\) info\.append\(statusBadge\('', true\)\)/);
		assert.match(rpg, /else if \(pokemon\.status\) info\.append\(statusBadge\(pokemon\.status\)\)/);
		assert.match(rpg, /statusBadge\(change\.statusBefore\)/);
		assert.match(rpg, /statusBadge\(''\)/);
		assert.doesNotMatch(rpg, /classList.*status-label|createElement\('span', 'status-label'/);
		assert.match(css, /\.pokemon-center-status-change \{ display: flex/);
		assert.match(css, /\.box-condition\.status-normal/);
		assert.match(rpg, /pokemon-center-scene pokemon-center-scene-/);
		assert.match(rpg, /const healingSlotOrder = \[5, 6, 3, 4, 1, 2\]/);
		assert.match(rpg, /pokemon-center-healing-ball/);
		assert.match(rpg, /sceneBalls = eligible\.filter/);
		assert.match(rpg, /pokemon\.pokeballSprite/);
		assert.match(rpg, /Number\(pokemon\.pokeballSprite\) > 0 .* : 345/);
		assert.match(rpg, /pokemon\.captureBall/);
		assert.match(backend, /pokeballSprite: Dex\.mod\('gen9'\)\.items\.get\(captureBall\)/);
		assert.match(css, /pokemon-center-interior-v1\.png/);
		assert.equal(fs.existsSync(sceneAsset), true);
		assert.equal(fs.existsSync(nurseAsset), true);
		assert.equal(fs.existsSync(nurseSideAsset), true);
		assert.match(rpg, /pokemon-center-nurse\.png/);
		assert.match(rpg, /pokemon-center-nurse-side\.png/);
		assert.match(rpg, /const nurseAtTable = sceneBalls\.length > 0/);
		assert.match(rpg, /nurseAtTable && sceneMode === 'healing'/);
		assert.match(css, /pokemon-center-nurse-approach-table/);
		assert.match(rpg, /pokemon-center-scene-nurse\.is-at-table/);
		assert.match(rpg, /pokemon-center-nurse-face-forward/);
		assert.match(css, /pokemon-center-nurse-leave-table/);
		assert.match(css, /pokemon-center-nurse-face-forward/);
		assert.match(rpg, /pokemon-center-scene-counter-symbol/);
		assert.match(css, /pokemon-center-healing-socket:nth-child\(6\)/);
		assert.match(css, /pokemon-center-ball-arrive/);
		assert.match(css, /background-image: var\(--rpg-asset-item-icons/);
		assert.match(css, /scale: 2;/);
		assert.match(rpg, /const drawWelcome = \(\) =>/);
		assert.match(rpg, /sceneMode === 'menu' \? drawWelcome : drawMenu/);
		assert.match(rpg, /button\('Iniciar', 'button primary pokemon-center-welcome-action'\)/);
		assert.doesNotMatch(rpg, /pokemon-center-master-editor/);
		assert.doesNotMatch(rpg, /pokemon-center-master-fields/);
		assert.doesNotMatch(css, /pokemon-center-master-editor/);
		assert.doesNotMatch(css, /pokemon-center-master-fields/);
		assert.doesNotMatch(rpg, /Aplicar estado/);
	});

	it('cache-busts the updated Pokemon Center assets', () => {
		assert.match(html, /rpg\.css\?v=20260814-18/);
		assert.match(html, /rpg\.js\?v=20260814-18/);
	});
});
