'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG fossil restoration laboratory frontend', () => {
	const root = path.resolve(__dirname, '../../server/static/rpg');
	const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const main = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
	const ui = fs.readFileSync(path.join(root, 'fossil-lab-ui.js'), 'utf8');
	const css = fs.readFileSync(path.join(root, 'fossil-lab.css'), 'utf8');

	it('loads the dedicated laboratory resources before the main interface', () => {
		assert(html.includes('fossil-lab.css'));
		assert(html.includes('fossil-lab-ui.js'));
		assert(html.indexOf('fossil-lab-ui.js') < html.indexOf('rpg.js'));
	});

	it('exposes the laboratory in player navigation and routing', () => {
		assert(main.includes("['fossils', 'Paleontologia'"));
		assert(main.includes("state.dashboardView === 'fossils' ? await renderFossilLab(character)"));
	});

	it('renders restoration, archive, locked research, project progress and responsive layout', () => {
		for (const expected of [
			'Restauração', 'Arquivo Paleontológico', 'Pesquisa Experimental',
			'Iniciar restauração', 'Doar à pesquisa', 'Receber na Box',
		]) assert(ui.includes(expected), expected);
		assert(css.includes('@media (max-width: 720px)'));
		assert(css.includes('.fossil-progress'));
	});

	it('preserves page and fossil-list scroll positions when repainting a selection', () => {
		assert.match(ui, /const currentList = root\.querySelector\('\.fossil-list'\)/);
		assert.match(ui, /pageY: window\.scrollY/);
		assert.match(ui, /listTop: currentList\?\.scrollTop \|\| 0/);
		assert.match(ui, /nextList\.scrollTop = scroll\.listTop/);
		assert.match(ui, /window\.scrollTo\(scroll\.pageX, scroll\.pageY\)/);
		assert.match(ui, /window\.requestAnimationFrame\(restoreScroll\)/);
	});
});
