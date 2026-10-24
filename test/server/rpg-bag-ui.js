'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const bagUi = fs.readFileSync(path.join(root, 'server/static/rpg/bag-ui.js'), 'utf8');
const trainerSheetUi = fs.readFileSync(path.join(root, 'server/static/rpg/trainer-sheet-ui.js'), 'utf8');
const rpgUi = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const battleRoom = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');
const http = fs.readFileSync(path.join(root, 'server/rpg-showdown/http.ts'), 'utf8');

describe('RPG Bag frontend', () => {
	it('destaca a unidade preparada e permite escolher itens da Bag própria ou do armazenamento compartilhado', () => {
		assert.match(bagUi, /bagData\.canConceal && !item\.mission/);
		assert.match(bagUi, /selectedShared\.canConceal/);
		assert.match(bagUi, /\/trainer\/talents\/hidden-compartment/);
		assert.match(bagUi, /bag-ui-concealed-item/);
		assert.match(css, /\.bag-ui-concealed-item/);
		assert.match(trainerSheetUi, /Sua CD atual/);
	});
	it('shows bank and shared inventories separately and opens shared support caches', () => {
		assert.match(bagUi, /\['Banco', 'Compartilhado'\]/);
		assert.match(bagUi, /areaTitle\.append\(el\('small', '', 'Inventário'\), el\('h2', '', title\)\)/);
		assert.match(bagUi, /bag-ui-auxiliary-content/);
		assert.match(bagUi, /\/trainer\/support-caches/);
		assert.match(bagUi, /\/trainer\/shared-vehicles/);
		assert.match(bagUi, /entry\.kind === 'vehicle' \? 'Veículos' : 'Pontos de Apoio'/);
		assert.match(bagUi, /\/trainer\/shared-vehicle\?vehicleId=/);
		assert.match(http, /\/api\/rpg\/trainer\/shared-vehicle/);
		assert.match(bagUi, /selectedSharedId = entry\.key/);
		assert.match(bagUi, /action: 'withdraw'/);
		assert.match(bagUi, /renderSharedInventory\(\)/);
		assert.match(css, /\.bag-ui-auxiliary-panel/);
		assert.match(css, /\.bag-ui-shared-sidebar/);
		assert.match(bagUi, /\/trainer\/item-bank\?characterId=/);
		assert.match(bagUi, /bankAvailable = bagData\.bankAvailable !== false/);
		assert.match(bagUi, /auxiliaryExpanded\.Banco = false/);
		assert.match(bagUi, /toggle\.setAttribute\('aria-expanded'/);
		assert.match(bagUi, /toggle\.disabled = locked/);
		assert.match(css, /\.bag-ui-auxiliary-content\[hidden\] \{ display: none; \}/);
		assert.match(bagUi, /externalData\.itemTypes.*tipos de itens/);
		assert.match(bagUi, /externalData\.balance/);
		assert.match(bagUi, /\/rpg\/assets\/bags\/bank\.png/);
		assert(fs.existsSync(path.join(root, 'server/static/rpg/assets/bags/bank.png')));
		assert.match(bagUi, /showBankItemDetails\(item, card\)/);
		assert.match(bagUi, /action: item\.kind === 'pokemon' \? 'movePokemon' : 'move'/);
		assert.match(http, /\/api\/rpg\/trainer\/item-bank/);
	});
	it('mantém só o cabeçalho quando não há inventários compartilhados', () => {
		assert.match(bagUi, /const empty = sharedLoaded && !sharedError && !sharedInventory\.length/);
		assert.match(bagUi, /sharedToggle\.hidden = empty/);
		assert.match(bagUi, /sharedContent\.hidden = empty \|\| !auxiliaryExpanded\.Compartilhado/);
		assert.match(bagUi, /if \(empty\) return/);
	});
	it('expande abaixo das Pokécoins apenas as licenças válidas sem abrir janela', () => {
		assert.match(bagUi, /bagIdentity\.append\(licensesToggle, licensesList\)/);
		assert.match(bagUi, /licensesList\.hidden = !licensesExpanded/);
		assert.match(bagUi, /\(bagData\.licenses \|\| \[\]\)\.filter\(license => license\.valid && licenseNames\[license\.id\]\)/);
		assert.match(bagUi, /if \(!sidebar\.isConnected\) return/);
		assert.match(bagUi, /navigation\.getBoundingClientRect\(\)\.bottom -/);
		assert.match(bagUi, /if \(available > 0\) licensesList\.style\.maxHeight/);
		assert.match(bagUi, /if \(licensesExpanded\) requestAnimationFrame\(fitLicenses\)/);
		assert.match(css, /\.bag-ui-licenses-list \{ width: 100%; overflow-y: auto/);
		assert.match(css, /\.bag-ui-license-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 36px 54px/);
		assert.match(css, /\.bag-ui-license-row \{[\s\S]*?min-height: 42px/);
	});
	it('permite apenas ao Mestre conceder e revogar licenças na Bag do jogador', () => {
		assert.match(bagUi, /if \(options\.isMaster\) \{/);
		assert.match(bagUi, /\/trainer\/equipment\/license/);
		assert.match(bagUi, /license: \{ id, status, issuedBy: '' \}/);
		assert.match(bagUi, /available = Object\.entries\(licenseNames\)\.filter/);
		assert.match(bagUi, /'arma-fogo': 'Armas de fogo'/);
		assert.match(bagUi, /defensiva: 'Armas e proteção'/);
		assert.doesNotMatch(bagUi, /institucional: 'Equipamentos institucionais'/);
		assert.match(bagUi, /!owned\.some\(license => license\.id === id\)/);
		assert.match(bagUi, /veiculo: 'Veículos'/);
		assert.match(bagUi, /updateLicense\(license\.id, 'revoked'\)/);
		assert.match(bagUi, /updateLicense\(select\.value, 'active', !checkbox\.checked\)/);
		assert.match(bagUi, /bagData\.licenseFees\?\.\[select\.value\]/);
		assert.match(bagUi, /select\.addEventListener\('change', updateChargeText\)/);
	});
	it('permite ao Mestre apagar um Ponto de Apoio e não oferece banco para veículos', () => {
		assert.match(bagUi, /options\.isMaster && selectedShared\.kind === 'cache'/);
		assert.match(bagUi, /action: 'delete', cacheId: selectedShared\.cacheId/);
		assert.match(bagUi, /confirmContents: true/);
		assert.match(bagUi, /bankAvailable && item\.equipmentKind !== 'vehicle'/);
	});
	it('offers mission items and shared support caches under Enviar para without listing caches on the sheet', () => {
		assert.match(bagUi, /if \(action === 'move-to-mission'\) return 'Enviar para'/);
		assert.match(bagUi, /showSendDestinations\(item, dialog\)/);
		assert.match(bagUi, /makeButton\('Itens de Missão'/);
		assert.match(bagUi, /showSupportCacheDeposit\(item, cache, dialog\)/);
		assert.match(bagUi, /action: 'deposit', kind: 'pokemon'/);
		assert.match(bagUi, /createDialog\('bag-ui-send-destinations', parentDialog\)/);
		assert.match(bagUi, /createDialog\('bag-ui-send-deposit', parentDialog\)/);
		assert.match(css, /\.bag-ui-side-window\.bag-ui-send-destinations \{ width: min\(320px/);
		assert.match(css, /\.bag-ui-side-window\.bag-ui-send-deposit \{ width: min\(280px/);
		assert.doesNotMatch(trainerSheetUi, /section\('Pontos de Apoio', 'trainer-sheet-panel trainer-sheet-allied-caches'\)/);
		assert.doesNotMatch(trainerSheetUi, /openSupportCache\(/);
		assert.match(trainerSheetUi, /action: 'create', location: location\.value/);
	});
	it('lets the Master add catalogued trainer equipment in separated categories', () => {
		assert.match(bagUi, /makeButton\('Adicionar item'/);
		assert.match(bagUi, /\['trainer-kits', 'Kits'\]/);
		assert.match(bagUi, /\['trainer-vehicles', 'Veículos'\]/);
		assert.doesNotMatch(bagUi, /\['food-items', 'Alimentos e rações'\]/);
		assert.doesNotMatch(bagUi, /\['trainer-outfits', 'Trajes e melhorias'\]/);
		assert.match(bagUi, /kind === 'refill' && \['spray-pimenta', 'dispositivo-choque', 'taser'\]/);
		assert.match(bagUi, /'shield', 'ammunition'/);
		assert.match(bagUi, /action: 'grant', characterId: options\.characterId/);
		assert.match(bagUi, /showEquipmentDetails\(item, dialog, close\)/);
		assert.match(bagUi, /bag-ui-weight/);
	});
	it('offers random and explicit fossil grades when the Master adds an item', () => {
		assert.match(bagUi, /\['', 'Aleatório'\].*\['fragmented', 'Frag\.'\].*\['preserved', 'Pres\.'\].*\['exceptional', 'Excep\.'\]/);
		assert.match(bagUi, /\.\.\.\(selectedQuality \? \{ quality: selectedQuality \} : \{\}\)/);
		assert.match(bagUi, /if \(!item\.fossilQualities\) return \[item\]/);
		assert.match(bagUi, /fossilQuality: quality/);
		assert.match(bagUi, /action === 'give' \|\| action === 'discard'/);
		assert.doesNotMatch(bagUi, /name: 'Gerenciar ' \+ item\.name/);
	});
	it('shows ally fossil identification without permanently separating the Player Bag', () => {
		assert.match(bagUi, /bagData\.fossilAppraiser/);
		assert.match(bagUi, /\/bag\/fossil-identification\?/);
		assert.doesNotMatch(bagUi, /Esta identificação não separa os fósseis na sua Bag/);
	});
	it('loads the dedicated Bag module before the main RPG interface', () => {
		assert.match(html, /bag-ui\.js/);
		assert.ok(html.indexOf('bag-ui.js') < html.indexOf('rpg.js'));
		assert.match(rpgUi, /window\.RPGBagUI\.render/);
	});

	it('hides the generic player greeting on Box and Bag pages', () => {
		assert.match(rpgUi, /\['overview', 'team', 'box', 'bag', 'team-builder', 'center', 'fossils', 'nursery', 'shops'\]\.includes\(state\.dashboardView\)/);
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
		assert.match(rpgUi, /\['center', 'Centro Pokémon', centerBlocked\]/);
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
		assert.match(bagUi, /await options\.api\('\/bag\/master\/quantity'/);
		assert.match(bagUi, /options\.toast\('Bag atualizada pelo Mestre\.'\);\s*await load\(\)/);
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
