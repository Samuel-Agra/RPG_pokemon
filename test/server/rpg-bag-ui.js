'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const bagUi = fs.readFileSync(path.join(root, 'server/static/rpg/bag-ui.js'), 'utf8');
const rpgUi = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const battleRoom = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');

describe('RPG Bag frontend', () => {
	it('loads the dedicated Bag module before the main RPG interface', () => {
		assert.match(html, /bag-ui\.js/);
		assert.ok(html.indexOf('bag-ui.js') < html.indexOf('rpg.js'));
		assert.match(rpgUi, /window\.RPGBagUI\.render/);
	});

	it('hides the generic player greeting on Box and Bag pages', () => {
		assert.match(rpgUi, /\['overview', 'team', 'box', 'bag', 'team-builder', 'center', 'fossils'\]\.includes\(state\.dashboardView\)/);
	});

	it('keeps blocked Bag and Box entries visible but prevents navigation', () => {
		assert.match(rpgUi, /\['bag', 'Bag', bagBlocked\]/);
		assert.match(rpgUi, /\['box', 'Box', boxBlocked\]/);
		assert.match(rpgUi, /\['center', 'Centro Pokémon', centerBlocked\]/);
		assert.match(rpgUi, /\['fossils', 'Paleontologia', fossilsBlocked\]/);
		assert.match(rpgUi, /\['fossils', 'Paleontologia'\]/);
		assert.match(rpgUi, /item\.disabled = blocked/);
		assert.match(rpgUi, /if \(blocked\) return/);
		assert.match(rpgUi, /currentEntry\?\.\[2\]/);
		assert.match(css, /\.nav-button\.locked/);
		assert.doesNotMatch(rpgUi, /Acesso bloqueado pelo Mestre/);
		assert.doesNotMatch(css, /content: 'Bloqueado'/);
	});

	it('renders the Pokemon Center flows and Master controls', () => {
		assert.match(rpgUi, /function renderPokemonCenter\(character\)/);
		assert.match(rpgUi, /Curar Equipe/);
		assert.match(rpgUi, /Curar Pokémon/);
		assert.match(rpgUi, /Reviver Pokémon/);
		assert.match(rpgUi, /\/pokemon-center\/recover/);
		assert.match(rpgUi, /expectedRevision: center\.revision/);
		assert.match(rpgUi, /\['center', 'Centro Pokémon'\]/);
		assert.match(rpgUi, /Abrir Centro Pokémon/);
		assert.doesNotMatch(rpgUi, /Centro de Treinamento/);
		assert.match(css, /\.pokemon-center-healing/);
		assert.match(css, /@keyframes pokemon-center-fill/);
	});
	it('renders a sprite-led vertical category menu, search, quantities and details', () => {
		assert.match(bagUi, /bag-ui-bag-sprite/);
		assert.match(bagUi, /assets\/bags/);
		assert.match(bagUi, /bagData\.categories/);
		assert.match(bagUi, /for \(const category of bagData\.categories\)/);
		assert.match(bagUi, /Pokécoins:/);
		assert.match(bagUi, /bag-ui-capacity/);
		assert.match(bagUi, /bag-ui-item-glyph/);
		assert.match(css, /contain: paint/);
		assert.doesNotMatch(bagUi, /el\('small', '', 'Dinheiro'\)/);
		assert.match(bagUi, /bag-ui-category-link/);
		assert.doesNotMatch(bagUi, /bag-ui-category-symbol/);
		assert.match(bagUi, /type = 'search'/);
		assert.match(bagUi, /bag-ui-detail-summary/);
		assert.match(bagUi, /\/bag\/favorite/);
		assert.match(bagUi, /equippedIn/);
	});

	it('connects valid item actions and Pokemon target selection to the backend', () => {
		assert.match(bagUi, /\/bag\/items\/.*\/targets/);
		assert.match(bagUi, /\/bag\/equip/);
		assert.match(bagUi, /\/bag\/remove-held/);
		assert.match(bagUi, /use-healing-item/);
		assert.match(bagUi, /openEvolution/);
		assert.match(bagUi, /openTM/);
		assert.match(bagUi, /compatibleMoves/);
	});

	it('exposes Master quantity, reward and custom item controls', () => {
		assert.match(bagUi, /Ferramentas do Mestre/);
		assert.match(bagUi, /Adicionar \/ recompensa/);
		assert.match(bagUi, /\/bag\/master\/quantity/);
		assert.match(bagUi, /\/bag\/master\/catalog/);
		assert.match(bagUi, /\/bag\/master\/items/);
		assert.match(bagUi, /\/bag\/master\/complete-mission/);
		assert.match(bagUi, /Entregue/);
		assert.match(bagUi, /showMoveToMission/);
		assert.match(bagUi, /Anotação/);
		assert.match(bagUi, /showEditMissionNote/);
		assert.match(bagUi, /\/bag\/mission-note/);
		assert.match(bagUi, /item\.missionNote/);
		assert.match(css, /\.bag-ui-mission-note/);
	});

	it('keeps Master Bag administration on the current page and blocks duplicate submissions', () => {
		assert.match(rpgUi, /document\.querySelector\('\.bag-ui-window-layer'\)/);
		assert.match(rpgUi, /state\.session\.role === 'player' && session\.status === 'inviting'/);
		assert.match(bagUi, /const result = await options\.api\('\/bag\/master\/quantity'/);
		assert.match(bagUi, /bagData = result\.bag/);
		assert.match(bagUi, /submit\.disabled = true/);
		assert.match(bagUi, /submit\.disabled = false/);
		assert.match(bagUi, /renderShell\(\)/);
		assert.match(bagUi, /const reposition = \(\) => window\.requestAnimationFrame/);
		assert.match(bagUi, /positionDialog\(dialog\)/);
	});
	it('shows item categories before the Master catalog and mission reward items', () => {
		assert.match(bagUi, /CATALOG_CATEGORIES/);
		assert.match(bagUi, /catalogCategoryPicker/);
		assert.match(bagUi, /Escolha uma categoria/);
		assert.match(bagUi, /Escolha a categoria da recompensa/);
		assert.match(bagUi, /stage\.replaceChildren/);
		assert.match(bagUi, /rewardArea\.replaceChildren/);
		assert.match(bagUi, /operation\.value === 'remove'/);
		assert.match(css, /\.bag-ui-catalog-categories/);
		assert.match(css, /\.bag-ui-catalog-category/);
	});

	it('uses Box-style anchored windows for every Bag action and closes them outside', () => {
		assert.match(bagUi, /bag-ui-window-layer/);
		assert.match(bagUi, /function createDialog\(className = '', parent = null, anchor = null\)/);
		assert.match(bagUi, /activeDialogGroup\.dialogs\.splice\(parentIndex \+ 1\)/);
		assert.match(bagUi, /document\.addEventListener\('pointerdown', group\.outsideHandler\)/);
		assert.match(bagUi, /showTargets\(item, 'use', dialog\)/);
		assert.match(bagUi, /showGive\(item, dialog\)/);
		assert.match(bagUi, /showMissionReward\(item, dialog\)/);
		assert.match(css, /\.bag-ui-window-layer/);
		assert.match(css, /\.bag-ui-dialog-card\.bag-ui-side-window/);
		assert.doesNotMatch(css, /\.bag-ui-dialog \{ position: fixed;[^}]*background:/);
	});
	it('uses the reduced backend Bag during battle', () => {
		assert.match(battleRoom, /context=battle/);
		assert.match(battleRoom, /registryCategory/);
		assert.match(battleRoom, /'battle'/);
	});

	it('keeps the Bag responsive and uses dynamic Pokemon HP colors', () => {
		assert.match(css, /\.bag-ui-category-grid/);
		assert.match(css, /\.bag-ui-target-grid/);
		assert.match(css, /\.bag-ui-hp-track \.healthy/);
		assert.match(css, /\.bag-ui-hp-track \.warning/);
		assert.match(css, /\.bag-ui-hp-track \.critical/);
		assert.match(css, /@media \(max-width: 480px\)/);
	});
});
