'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const teamBuilder = fs.readFileSync(path.join(root, 'server/static/rpg/team-builder-ui.js'), 'utf8');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const box = fs.readFileSync(path.join(root, 'server/static/rpg/box-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/team-builder.css'), 'utf8');
const rpgCss = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');

describe('RPG Team Builder frontend', () => {
	it('loads the dedicated module and stylesheet before the main RPG interface', () => {
		assert.match(html, /team-builder\.css/);
		assert.match(html, /team-builder-ui\.js/);
		assert.ok(html.indexOf('team-builder-ui.js') < html.indexOf('rpg.js'));
		assert.match(teamBuilder, /window\.RPGTeamBuilderUI/);
	});

	it('uses abbreviated status badges beside the level and anchors team details outside the Box stage', () => {
		assert.match(box, /const status = pokemon\.fainted \? 'fnt' : pokemon\.status/);
		assert.match(box, /status\.toUpperCase\(\)/);
		assert.match(box, /root\.append\(drawer\)/);
		assert.match(box, /positionDetailWindow\(root, drawer\)/);
		assert.doesNotMatch(box, /workspace\.append\(drawer\)/);
		assert.match(rpgCss, /\.box-compact-identity > \.box-condition \+[\s\S]*margin-left: 0/);
		assert.match(rpgCss, /\.box-manager \{ position: relative/);
	});
	it('opens an existing persistent Pokemon from both Team and Box', () => {
		assert.match(rpg, /character\.box\?\.party\?\.\[teamIndex\]\?\.pokemonId/);
		assert.match(rpg, /window\.RPGTeamBuilderUI\.render/);
		assert.match(rpg, /teamBuilderPokemonId/);
		assert.match(box, /deps\.openTeamBuilder\(pokemon\.pokemonId, 'box'\)/);
		assert.doesNotMatch(box, /A pÃ¯Â¿Â½gina TeamBulder serÃ¯Â¿Â½ criada/);
	});

	it('shows a carried Egg as a read-only Team Builder member', () => {
		assert.match(rpg, /const eggTeam = teamEggs\(character\)\.map/);
		assert.match(rpg, /pokemonId: 'egg:' \+ egg\.eggId/);
		assert.match(teamBuilder, /if \(deps\.selectedEgg\)/);
		assert.match(teamBuilder, /const sprite = pokemon\.virtualEgg && deps\.eggVisual/);
		assert.match(teamBuilder, /deps\.eggVisual\(pokemon, 'team-builder-team-egg-visual'\)/);
		assert.match(teamBuilder, /deps\.spriteUrl\(\{species: 'Egg'\}\)/);
		assert.match(teamBuilder, /for \(const label of \['Shiny', 'Gênero', 'Level', 'XP'\]\)/);
		assert.match(teamBuilder, /Parece que tem algo se mexendo\./);
		assert.match(css, /\.team-builder-egg-message/);
		assert.match(css, /\.dashboard-content > \.team-builder-page/);
		assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
		assert.match(css, /team-builder-four-moves \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);\s*min-width: 0;\s*overflow-x: hidden/);
		assert.match(css, /team-builder-egg-card \.team-builder-showdown-toolbar \{\s*min-height: 75px/);
		assert.match(css, /team-builder-team-egg-slot > \.portable-incubator-visual\.team-builder-team-egg-visual/);
		assert.match(css, /width: 38px;\s*height: 44px;\s*overflow: hidden/);
		assert.match(css, /team-builder-team-egg-slot > \.portable-incubator-visual > \.portable-incubator-shell/);
		assert.match(css, /team-builder-team-egg-slot > \.portable-incubator-visual > \.portable-incubator-egg/);
		assert.match(css, /top: 54%;\s*left: 50%;[\s\S]*?width: 56%;\s*height: 58%/);
	});
	it('keeps a Box Pokemon selected in read-only mode until a party Pokemon is chosen', () => {
		assert.match(rpg, /const canKeepBoxSelection = state\.teamBuilderReturnView === 'box'/);
		assert.match(rpg, /const selectedEgg = eggTeam\.find/);
		assert.match(rpg, /const boxPokemonReadOnly = !selectedEgg && !pokemonTeam\.some/);
		assert.match(rpg, /readOnly: !!selectedEgg \|\| boxPokemonReadOnly/);
		assert.match(teamBuilder, /const isReadOnly = \(\) => deps\.readOnly === true \|\| data\?\.readOnly === true/);
		assert.match(teamBuilder, /button\('Box →', 'team-builder-box-origin'\)/);
		assert.match(teamBuilder, /toolbar\.append\(boxOrigin\)/);
		assert.match(teamBuilder, /function openPane\(name, moveSlot\) \{[\s\S]*if \(isReadOnly\(\)\) return/);
		assert.match(teamBuilder, /isReadOnly\(\) \? null : \(\) =>/);
		assert.match(teamBuilder, /if \(!isReadOnly\(\)\) item\.addEventListener/);
		assert.match(teamBuilder, /isReadOnly\(\) \|\| !data\.permissions\.nickname/);
		assert.match(teamBuilder, /if \(id && !isReadOnly\(\)\)/);
		assert.match(teamBuilder, /const selectable = !isReadOnly\(\)/);
		assert.match(css, /\.team-builder-box-origin/);
		assert.match(css, /\.team-builder-box-origin[\s\S]*justify-self: end/);
		assert.match(css, /\.team-builder-box-origin[\s\S]*min-width: 120px/);
		assert.match(css, /\.team-builder-page\.read-only \.team-builder-summary-stats/);
	});
	it('opens training progress below the moves only after clicking the training symbol', () => {
		assert.match(teamBuilder, /const trainingJob = data\.pokemon\.metadata\.evTraining/);
		assert.match(teamBuilder, /team-builder-training-origin/);
		assert.match(teamBuilder, /function trainingIcon\(\)/);
		assert.match(teamBuilder, /<svg viewBox="0 0 48 32"/);
		assert.doesNotMatch(teamBuilder, /\.title\s*=/);
		assert.match(teamBuilder, /Ver treinamento em andamento/);
		assert.doesNotMatch(teamBuilder, /root\.querySelector\('\.team-builder-active-training'\)/);
		assert.match(teamBuilder, /activePane === 'training' \? null : 'training'/);
		assert.match(teamBuilder, /if \(activePane === 'training'\) return trainingPane\(\)/);
		assert.match(teamBuilder, /const progress = Math\.max/);
		assert.match(teamBuilder, /Tempo restante/);
		assert.match(teamBuilder, /training\.changes\?\.\[id\]/);
		assert.ok(teamBuilder.indexOf("team-builder-active-training", teamBuilder.indexOf("section.append(grid)")) >
			teamBuilder.indexOf("section.append(grid)"));
		assert.match(css, /\.team-builder-training-symbol/);
		assert.match(css, /\.team-builder-training-progress/);
	});

	it('shows all six party slots and keeps Team Builder before Bag and Box', () => {
		assert.match(teamBuilder, /function teamStrip\(\)/);
		assert.match(teamBuilder, /index < 6/);
		assert.match(teamBuilder, /deps\.switchPokemon/);
		assert.match(css, /grid-template-columns: repeat\(6/);
		const navigation = rpg.slice(rpg.indexOf("['overview', 'Vis\\u00e3o geral'], ['team', 'Equipe']"));
		assert.ok(navigation.indexOf("['team-builder', 'Team Builder']") < navigation.indexOf("['bag', 'Bag', bagBlocked]"));
		assert.ok(navigation.indexOf("['bag', 'Bag', bagBlocked]") < navigation.indexOf("['box', 'Box', boxBlocked]"));
		assert.match(rpg, /masterViewingPlayer = state\.session\?\.role === 'master'/);
		assert.doesNotMatch(rpg, /boxBlocked \? \[\['team-builder'/);
		assert.match(navigation, /\['team-builder', 'Team Builder'\]/);
	});

	it('shows the new selected-Pokemon layout with integrated RPG information', () => {
		assert.doesNotMatch(teamBuilder, /Equipe atual/);
		assert.match(teamBuilder, /function selectedPokemonCard\(\)/);
		assert.match(teamBuilder, /team-builder-large-sprite/);
		assert.doesNotMatch(teamBuilder, /Pokecoins/);
		assert.doesNotMatch(teamBuilder, /â† Voltar/);
		assert.match(teamBuilder, /team-builder-nickname-box/);
		assert.match(teamBuilder, /team-builder-type-status-row/);
		assert.match(teamBuilder, /box-condition status-/);
		assert.doesNotMatch(teamBuilder, /team-builder-status-property/);
		assert.match(teamBuilder, /data\.experience\.nextLevel/);
		const selectedCard = teamBuilder.slice(teamBuilder.indexOf('function selectedPokemonCard()'));
		assert.ok(selectedCard.indexOf("['Shiny'") < selectedCard.indexOf("['Gênero'"));
		assert.ok(selectedCard.indexOf("['Gênero'") < selectedCard.indexOf("['Level'"));
		assert.ok(selectedCard.indexOf("['Level'") < selectedCard.indexOf("['XP'"));
		assert.match(css, /\.team-builder-detail-cell small[\s\S]*position: absolute/);
		assert.match(teamBuilder, /data\.permanentState\.hp/);
		assert.match(teamBuilder, /function hpTone\(value, maximum\)/);
		assert.match(teamBuilder, /ratio <= 0\.2/);
		assert.match(teamBuilder, /ratio <= 0\.5/);
		assert.match(css, /\.team-builder-stat-track\.hp\.warning/);
		assert.match(css, /\.team-builder-stat-track\.hp\.critical/);
		assert.match(css, /\.team-builder-stat-track\.hp\.fainted/);
		assert.match(teamBuilder, /statusLabel\(\)/);
		assert.match(teamBuilder, /calculatedStat\(id\)/);
		assert.match(teamBuilder, /team-builder-summary-iv/);
		assert.match(teamBuilder, /team-builder-summary-nature/);
		assert.match(teamBuilder, /'Natureza: ' \+ data\.nature\.name/);
		assert.match(teamBuilder, /'\+' \+ raised/);
		assert.match(teamBuilder, /'-' \+ lowered/);
		assert.match(teamBuilder, /String\(draftIVs\[id\] \?\? 31\)/);
		assert.match(teamBuilder, /total \/ 330 \* 100/);
		assert.match(css, /grid-template-columns: repeat\(4/);
	});

	it('groups Bag-backed items and exposes read-only Ability information', () => {
		assert.match(teamBuilder, /\['Favoritos', favorites\]/);
		assert.match(teamBuilder, /if \(items\.length\) pane\.append\(list\)/);
		assert.doesNotMatch(teamBuilder, /Nenhum item disponível nesta categoria/);
		assert.match(teamBuilder, /\['Held Items'/);
		assert.match(teamBuilder, /\['Berries'/);
		assert.match(teamBuilder, /\['Mega Stones'/);
		assert.match(teamBuilder, /!item\.berry && !item\.megaStone/);
		assert.match(teamBuilder, /item\?\.description/);
		assert.match(teamBuilder, /rpgRuntimeItemIcon/);
		assert.match(teamBuilder, /data\.items\.current\?\.name \|\| 'Nenhum item'/);
		assert.doesNotMatch(teamBuilder, /Nenhum item equipado/);
		assert.match(teamBuilder, /team-builder-main-ability/);
		assert.match(teamBuilder, /'Habilidade:'/);
		assert.match(teamBuilder, /\/bag\/equip/);
		assert.match(teamBuilder, /\/bag\/remove-held/);
		assert.match(teamBuilder, /Habilidade Oculta/);
		assert.match(teamBuilder, /line\.disabled = isReadOnly\(\) \|\| !data\.permissions\.master/);
	});

	it('shows selected, owned-TM, level and compatible-TM move groups', () => {
		assert.match(teamBuilder, /appendMoveGroup\(pane, 'TMs [^']* na Bag'/);
		assert.match(teamBuilder, /appendMoveGroup\(pane, 'Aprendidos por/);
		assert.match(teamBuilder, /appendMoveGroup\(pane, 'TMs compat/);
		assert.match(teamBuilder, /choice\.tmQuantity > 0/);
		assert.match(teamBuilder, /choice\.learnedAt !== undefined/);
		assert.match(teamBuilder, /mode === 'owned-tm'/);
		assert.match(teamBuilder, /\/use-tm/);
		assert.match(teamBuilder, /function simpleMoveRow/);
		assert.match(teamBuilder, /rpg-category-icon category-/);
		assert.match(teamBuilder, /Normal: 0, Grass: 1, Fire: 2, Water: 3, Electric: 4, Bug: 5/);
		assert.match(teamBuilder, /Psychic: 12, Ghost: 13, Dragon: 14, Dark: 15, Steel: 16, Fairy: 17/);
		assert.match(teamBuilder, /const categoryOrder = \{ Physical: 0, Special: 1, Status: 2 \}/);
		const ordering = teamBuilder.slice(teamBuilder.indexOf('const orderedChoices'));
		assert.ok(ordering.indexOf('typeOrder[first.type]') < ordering.indexOf('categoryOrder[first.category]'));
		assert.ok(ordering.indexOf('categoryOrder[first.category]') < ordering.indexOf('first.name.localeCompare'));
		assert.match(teamBuilder, /first\.name\.localeCompare\(second\.name/);
		assert.match(css, /\.team-builder-simple-move \.rpg-category-icon[\s\S]*border-radius: 7px/);
		assert.match(teamBuilder, /rpg-move-button type-/);
		assert.match(teamBuilder, /rpg-move-button-body/);
		const draw = teamBuilder.slice(teamBuilder.indexOf('function draw()'));
		assert.ok(draw.indexOf('selectedMoves()') < draw.indexOf('activeBrowser()'));
	});


	it('reorders known moves with drag and drop without invoking the TM flow', () => {
		assert.doesNotMatch(teamBuilder, /Clique para consultar ou arraste/);
		assert.match(teamBuilder, /card\.draggable = true/);
		assert.match(teamBuilder, /addEventListener\('dragstart'/);
		assert.match(teamBuilder, /addEventListener\('drop'/);
		assert.match(teamBuilder, /\/reorder-moves/);
		assert.match(teamBuilder, /fromSlot, toSlot: slot/);
		assert.match(css, /team-builder-move-card\.drag-target/);
	});

	it('connects training permission and full EV redistribution', () => {
		assert.match(rpg, /\['training', 'Treinamento'\]/);
		assert.match(teamBuilder, /data\.permissions\.training/);
		assert.doesNotMatch(teamBuilder, /O Mestre bloqueou o acesso ao Treinamento/);
		assert.match(teamBuilder, /body: \{ characterId: deps\.characterId, evs: \{ \.\.\.draftEVs \}/);
		assert.match(teamBuilder, /\/train-ev/);
		assert.match(teamBuilder, /costPerStep/);
		assert.match(teamBuilder, /roleplayDurationPerStepMs/);
		assert.match(teamBuilder, /Tempo no relógio da campanha/);
		assert.match(teamBuilder, /Treinamento em andamento/);
		assert.match(teamBuilder, /Math\.round\(Number\(raw\) \/ 4\) \* 4/);
		assert.match(teamBuilder, /508 - usedByOthers/);
		assert.match(teamBuilder, /slider\.max = 252/);
		assert.match(teamBuilder, /slider\.value = String\(draftEVs\[id\]\)/);
		assert.match(teamBuilder, /--ev-fill/);
		assert.match(css, /team-builder-ev-control \{ display: grid; grid-template-columns: 78px/);
		assert.match(css, /team-builder-ev-value \{[\s\S]*box-sizing: border-box/);
		assert.match(css, /team-builder-ev-slider::-webkit-slider-thumb/);
		assert.match(teamBuilder, /Confirmar treinamento/);
		assert.match(teamBuilder, /Natureza: ' \+ data\.nature\.label/);
		assert.match(teamBuilder, /Pokécoins: ' \+ formatMoney\(data\.money\)/);
		assert.doesNotMatch(teamBuilder, /valores diretamente\. Natureza/);
		assert.doesNotMatch(teamBuilder, /Diminua um atributo antes de aumentar outro/);
		assert.match(css, /team-builder-training-meta/);
		assert.doesNotMatch(teamBuilder, /team-builder-actions/);
		assert.match(teamBuilder, /nickname\.addEventListener\('change', saveGeneral\)/);
		assert.match(teamBuilder, /levelControl\.addEventListener\('change', saveGeneral\)/);
		assert.match(teamBuilder, /Salvar atributos/);
	});

	it('opens discreet Bag medicine choices from damaged HP and current status', () => {
		assert.match(teamBuilder, /function openHealingPopover\(anchor, mode\)/);
		assert.match(teamBuilder, /\/healing-items/);
		assert.match(teamBuilder, /mode === 'hp' \? item\.effect\?\.type === 'heal-hp'/);
		assert.match(teamBuilder, /item\.effect\?\.type === 'cure-status'/);
		assert.match(teamBuilder, /\/use-healing-item/);
		assert.match(teamBuilder, /data\.permanentState\.hp > 0 && data\.permanentState\.hp < data\.permanentState\.maxHP/);
		assert.match(teamBuilder, /data\.permanentState\.status \|\| data\.permissions\.master/);
		assert.match(teamBuilder, /document\.addEventListener\('pointerdown', healingOutsideHandler\)/);
		assert.match(css, /\.team-builder-healing-popover/);
		assert.match(css, /\.team-builder-healing-choice/);
	});
	it('lets the Master directly set HP and status from the same discreet controls', () => {
		assert.match(teamBuilder, /function openMasterStatePopover\(anchor, mode\)/);
		assert.match(teamBuilder, /Definir HP/);
		assert.match(teamBuilder, /team-builder-popover-title', 'Status/);
		assert.match(teamBuilder, /makeStatusChoice\('', 'OK', 'Normal'\)/);
		assert.match(teamBuilder, /\['psn', 'PSN', 'Poison'\]/);
		assert.match(teamBuilder, /team-builder-master-status-choice/);
		assert.match(teamBuilder, /team-builder-master-status-grid/);
		assert.match(teamBuilder, /panel\.classList\.add\('team-builder-master-status-popover'\)/);
		assert.match(teamBuilder, /edit: \{ hp \}/);
		assert.match(teamBuilder, /team-builder-master-hp-slider/);
		assert.match(teamBuilder, /team-builder-master-hp-number/);
		assert.match(teamBuilder, /slider\.addEventListener\('input'/);
		assert.match(teamBuilder, /number\.addEventListener\('input'/);
		assert.match(teamBuilder, /slider\.classList\.add\(hpTone\(hp, data\.permanentState\.maxHP\)\)/);
		assert.match(css, /\.team-builder-master-hp-slider\.warning/);
		assert.match(css, /\.team-builder-master-hp-slider\.critical/);
		assert.match(css, /\.team-builder-master-hp-slider\.fainted/);
		assert.match(teamBuilder, /edit: \{ status \}/);
		assert.match(teamBuilder, /if \(!isReadOnly\(\) && data\.permissions\.master\) makeMasterStateTrigger\(hp, 'hp'\)/);
		assert.match(teamBuilder, /data\.permanentState\.status \|\| data\.permissions\.master/);
		assert.match(css, /\.team-builder-master-state-popover/);
		assert.match(css, /\.team-builder-master-hp-controls/);
		assert.match(css, /\.team-builder-master-hp-slider::\-webkit-slider-thumb/);
		assert.match(css, /\.team-builder-master-status-grid[\s\S]*grid-template-columns: 44px max-content/);
		assert.match(css, /\.team-builder-master-status-header[\s\S]*grid-template-columns: 44px max-content/);
		assert.match(css, /\.status-normal/);
	});
	it('lets the Master adjust every current move PP with integrated arrow controls', () => {
		assert.match(teamBuilder, /let draftPP = \[\]/);
		assert.match(teamBuilder, /function maximumPP\(slot\)/);
		assert.match(teamBuilder, /function setMasterPP\(slot, rawValue\)/);
		assert.match(teamBuilder, /data\.permissions\.master && !isReadOnly\(\)/);
		assert.match(teamBuilder, /team-builder-pp-arrow up/);
		assert.match(teamBuilder, /team-builder-pp-arrow down/);
		assert.match(teamBuilder, /setMasterPP\(slot, currentPP\(slot\) \+ delta\)/);
		assert.match(teamBuilder, /edit: \{ pp \}/);
		assert.match(css, /\.team-builder-master-pp-control/);
		assert.match(css, /\.team-builder-pp-arrow\.up::before/);
		assert.match(css, /\.team-builder-pp-arrow\.down::before/);
		assert.doesNotMatch(css, /\.team-builder-master-pp-control input/);
	});

	it('lets the Master edit persistent experience from the XP detail cell', () => {
		assert.match(teamBuilder, /let draftExperience = 0/);
		assert.match(teamBuilder, /draftExperience = data\.experience\.current/);
		assert.match(teamBuilder, /team-builder-xp-editor/);
		assert.match(teamBuilder, /edit: \{ experience: draftExperience \}/);
		assert.match(teamBuilder, /Experiência atualizada/);
		assert.match(css, /\.team-builder-xp-editor/);
	});

	it('shows IVs read-only to Players and consumes compatible vitamins', () => {
		assert.match(teamBuilder, /data\.ivs\.vitamins/);
		assert.match(teamBuilder, /\/use-vitamin/);
		assert.match(teamBuilder, /expectedBagRevision: data\.bagRevision/);
		assert.match(teamBuilder, /expectedBoxRevision: data\.boxRevision/);
		assert.match(teamBuilder, /team-builder-iv-readonly/);
	});

	it('keeps empty move slots from reading maxPP from an undefined move', () => {
		assert.match(teamBuilder, /if \(current && current\.id === draftMoves\[slot\]\) return current\.maxPP/);
	});
	it('keeps empty move groups as adjacent headings without placeholder content', () => {
		assert.match(teamBuilder, /pane\.append\(el\('h3', 'team-builder-browser-heading', title\)\);\s*if \(!choices\.length\) return/);
		assert.doesNotMatch(teamBuilder, /Nenhum golpe nesta categoria\./);
		assert.match(css, /\.team-builder-browser-heading \+ \.team-builder-browser-heading \{\s*margin-top: 0;\s*border-top: 0;/);
	});
	it('uses the new Showdown-inspired responsive visual structure', () => {
		assert.match(css, /\.team-builder-showdown-card/);
		assert.match(css, /\.team-builder-showdown-body/);
		assert.match(css, /\.team-builder-four-moves/);
		assert.match(css, /\.team-builder-browser/);
		assert.match(css, /\.team-builder-simple-move/);
		assert.match(css, /\.team-builder-detailed-stat/);
		assert.match(css, /team-builder-summary-nature/);
		assert.match(css, /@media \(max-width: 700px\)/);
	});
});
