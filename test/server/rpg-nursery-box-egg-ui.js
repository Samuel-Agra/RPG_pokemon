'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const box = fs.readFileSync(path.join(root, 'server/static/rpg/box-ui.js'), 'utf8');
const nursery = fs.readFileSync(path.join(root, 'server/static/rpg/nursery-ui.js'), 'utf8');
const nurseryBackend = fs.readFileSync(path.join(root, 'server/rpg-showdown/index.ts'), 'utf8');
const hatchUi = fs.readFileSync(path.join(root, 'server/static/rpg/nursery-hatch-ui.js'), 'utf8');
const nurseryCss = fs.readFileSync(path.join(root, 'server/static/rpg/nursery.css'), 'utf8');
const rpgCss = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');
const rpg = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const teamBuilder = fs.readFileSync(path.join(root, 'server/static/rpg/team-builder-ui.js'), 'utf8');
const bag = fs.readFileSync(path.join(root, 'server/static/rpg/bag-ui.js'), 'utf8');

describe('RPG Egg presentation outside incubation', () => {
	it('shows Eggs in party slots without drag, drop, details, or Box movement', () => {
		assert.match(rpg, /teamEggs: teamEggs\(character\)/);
		assert.match(box, /const eggs = Array\.isArray\(deps\.teamEggs\)/);
		assert.match(box, /box-team-egg-slot/);
		assert.match(box, /slot\.disabled = true/);
		assert.match(box, /Não pode ser movido para a Box/);
		assert.match(box, /view\.team\.length \+ \(deps\.teamEggs\?\.length \|\| 0\) >= 6/);
	});

	it('locks breeding parents in the party and excludes them from battle selection', () => {
		assert.match(box, /pokemon\?\.metadata\?\.breeding \? ' is-breeding'/);
		assert.match(box, /if \(!pokemon\.metadata\?\.breeding\)/);
		assert.match(box, /send\.disabled = pokemon\.metadata\?\.breeding === true/);
		assert.match(box, /release\.disabled = pokemon\.metadata\?\.breeding === true/);
		assert.match(rpg, /teamEggs: teamEggs\(character\)/);
		const battleV2 = fs.readFileSync(path.join(root, 'server/static/rpg/battle-ui-v2.js'), 'utf8');
		assert.match(battleV2, /metadata\?\.breeding/);
		assert.match(battleV2, /Indispon/);
		assert.match(nursery, /collect-parent/);
		assert.match(nursery, /Resgatar Pokémon/);
		assert.match(nursery, /parentCollected/);
		assert.match(nursery, /Pokémon aguardando resgate/);
		assert.match(nursery, /ownerId !== view\.ownerId/);
		assert.match(nursery, /page\.append\(board\)[\s\S]*page\.append\(rescueBoard\)/);
		assert.match(nursery, /const visible = view\.projects\.filter\(project => activeStatuses\.includes\(project\.status\)\)/);
		assert.match(nursery, /withdraw-slot2/);
		assert.match(nursery, /Retirar Pok\u00e9mon/);
		assert.match(nursery, /project\.slot1\.ownerId === view\.ownerId/);
		assert.match(nursery, /project\.slot2\?\.ownerId === view\.ownerId/);
	});

	it('keeps cancellation, Slot 2 withdrawal, fee and confirmation in one action row', () => {
		assert.match(nursery, /nursery-terms/);
		assert.match(nursery, /Cobrança em Pokécoins/);
		assert.match(nursery, /requestedPokecoins/);
		assert.match(nursery, /confirm\.disabled = !slot2Confirmed/);
		assert.match(nurseryCss, /nursery-charge-input/);
		assert.match(nursery, /if \(terms\) terms\.prepend\(cancel\)/);
		assert.match(nurseryCss, /nursery-terms \.nursery-cancel/);
	});

	it('keeps the empty rescue area compact and renders the Nursery shop below it', () => {
		assert.doesNotMatch(nursery, /Nenhum Pokémon aguardando resgate/);
		assert.match(nursery, /nursery-rescue-board' \+\s*\(!rescueEntries\.length \? ' empty'/);
		assert.match(nursery, /Loja do Berçário/);
		assert.match(nursery, /shop-buy/);
		assert.match(nursery, /expectedBagRevision: view\.shop\.bagRevision/);
		assert.match(nurseryCss, /nursery-rescue-board\.empty/);
		assert.match(nurseryCss, /nursery-shop-grid/);
		assert.match(nurseryCss, /nursery-shop-grid\{grid-template-columns:1fr/);
		assert.match(nurseryCss, /nursery-shop-buy\{grid-column:3/);
	});

	it('lets only the Master configure a compatible system partner in Slot 2', () => {
		assert.match(nursery, /masterSlot1Options/);
		assert.match(nursery, /openMasterSlot1Menu/);
		assert.match(nursery, /species\.setAttribute\('role', 'combobox'\)/);
		assert.match(nursery, /species\.addEventListener\('input'/);
		assert.match(nursery, /renderSuggestions/);
		assert.match(nursery, /nursery-master-pokemon-option/);
		assert.doesNotMatch(nursery, /Buscar Pok\u00e9mon por nome/);
		assert.match(nursery, /field\('Sexo', sex\)/);
		assert.match(nursery, /sex: sex.value/);
		assert.match(nursery, /master-slot1/);
		assert.match(nursery, /Nova requisi\u00e7\u00e3o de NPC/);
		assert.match(nursery, /master-cancel/);
		assert.match(nursery, /masterSlot2Options/);
		assert.match(nursery, /openMasterSlot2Menu/);
		assert.match(nursery, /master-slot2/);
		assert.match(nursery, /Held item reprodutivo/);
		assert.match(nursery, /Adicionar ao Slot 2/);
		assert.match(nursery, /G\\u00eanero autom\\u00e1tico/);
		assert.match(nurseryCss, /nursery-master-slot-layer/);
		assert.match(nurseryCss, /nursery-master-ivs/);
	});

	it('uses a plain Egg normally and the active Portable Incubator only while equipped', () => {
		assert.match(nursery, /egg\?\.portableIncubator/);
		assert.match(nursery, /options\.spriteUrl\(\{species: 'Egg'\}\)/);
		assert.match(rpg, /portableIncubatorVisual/);
		assert.match(rpg, /portable-incubator-egg/);
		assert.match(rpg, /plain-egg-visual/);
		assert.match(nursery, /nursery-egg plain-egg-visual/);
		assert.match(rpgCss, /plain-egg-visual\{transform:scale\(1\.75\)/);
		assert.match(rpgCss, /portable-incubator-egg\{[^}]*scale\(1\.5\)/);
		assert.match(nurseryCss, /nursery-egg\.portable-incubator-visual\{[^}]*background:transparent[^}]*box-shadow:none/);
		assert.doesNotMatch(rpg, /portableincubator-active\.png/);
		assert.match(box, /deps\.eggVisual\(egg/);
		assert.doesNotMatch(nursery, /const icon = el\('span', 'nursery-egg'\)/);
	});

	it('offers carrying or direct local incubation and exposes portable controls', () => {
		assert.match(nursery, /Pegar o ovo/);
		assert.match(nursery, /Incubadora local ·/);
		assert.match(nursery, /collect-local/);
		assert.match(nursery, /Usar Incubadora Portátil/);
		assert.match(nursery, /portable-start/);
		assert.match(nursery, /for \(let groupNumber = 1; groupNumber <= 3; groupNumber\+\+\)/);
		assert.match(nursery, /occupiedLocals \+ ' \/ 9 vagas ocupadas'/);
		assert.match(nursery, /nursery-local-machine-slots/);
		assert.match(nursery, /nursery-local-progress/);
		assert.match(nurseryCss, /nursery-local-glass \.nursery-egg\{[^}]*transform:scale\(3\)/);
		assert.match(nursery, /Depositar na primeira vaga local disponível/);
		assert.match(nursery, /incubatorId: emptyLocal\?\.id/);
		assert.match(nursery, /Depositar Egg ·/);
		assert.match(nursery, /localIncubation/);
		assert.doesNotMatch(nursery, /Pegar Egg e pausar/);
		assert.doesNotMatch(nursery, /Vaga livre|VAGA ' \+ incubator\.slot|Incubadora local ' \+ groupNumber|Sem Egg disponível/);
		assert.match(teamBuilder, /Incubadoras Portáteis/);
		assert.match(teamBuilder, /Retirar Egg/);
		assert.match(teamBuilder, /Colocar Egg/);
		assert.match(teamBuilder, /deps\.selectedEgg\.status === 'ready_to_hatch'/);
		assert.match(teamBuilder, /button\('Chocar', 'button primary'\)/);
		assert.match(teamBuilder, /deps\.api\('\/nursery\/hatch'/);
		assert.match(bag, /linkedEggId/);
	});

	it('animates a normal Egg and opens the Portable Incubator before hatching', () => {
		assert.doesNotMatch(hatchUi, /Clique no Egg para iniciar a eclosão/);
		assert.match(hatchUi, /opening-incubator/);
		assert.match(hatchUi, /rpg-hatch-incubator-part/);
		assert.match(hatchUi, /rpg-hatch-shell-half/);
		assert.match(hatchUi, /createElementNS/);
		assert.match(hatchUi, /crackPaths/);
		assert.match(hatchUi, /rpg-hatch-pokemon/);
		assert.match(hatchUi, /RPGNurseryHatch=Object.freeze/);
		assert.match(nursery, /RPGNurseryHatch.play/);
		assert.match(teamBuilder, /RPGNurseryHatch.play/);
		assert.match(nurseryCss, /rpg-hatch-card/);
		assert.match(nurseryCss, /rpg-hatch-egg-shake/);
		assert.match(nurseryCss, /rpg-hatch-crack-draw/);
		assert.match(nurseryCss, /width:230px;height:288px/);
		assert.match(nurseryCss, /max-width:290px;max-height:290px/);
		assert.match(nurseryCss, /rpg-hatch-incubator-lid/);
		assert.match(nurseryCss, /rpg-hatch-incubator \.rpg-hatch-egg-host\{[^}]*z-index:4[^}]*translate:-50% -50%[^}]*scale:\.63/);
		assert.match(nurseryCss, /incubator-open[^}]*rpg-hatch-egg-host\{scale:1\}/);
		assert.match(nurseryCss, /pointer-events:none/);
	});
	it('seeds nine persistent ready-to-hatch Eggs only once for Teste', () => {
		assert.match(nurseryBackend, /TEST_READY_EGG_FIXTURE_COUNT = 9/);
		assert.match(nurseryBackend, /status: 'ready_to_hatch'/);
		assert.match(nurseryBackend, /if \(existing\)/);
		assert.match(nurseryBackend, /incubator\.eggId = eggId/);
	});

	it('shows released Pokémon only in the Master incubation area with restore and permanent release controls', () => {
		assert.match(nursery, /Pokémon libertados/);
		assert.match(nursery, /view\.ownerId \? 'Incubação' : 'Abandono'/);
		assert.match(nursery, /Procriação e Abandono/);
		assert.match(nursery, /restore-released/);
		assert.match(nursery, /delete-released/);
		assert.match(nursery, /Liberar ' \+ pokemon\.name \+ ' definitivamente/);
		assert.match(nurseryCss, /nursery-released-grid/);
		assert.doesNotMatch(nursery, /30 dias|prazo de resgate|tempo para resgatar/i);
	});
});
