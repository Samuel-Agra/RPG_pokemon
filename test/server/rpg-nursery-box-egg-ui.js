'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const box = fs.readFileSync(path.join(root, 'server/static/rpg/box-ui.js'), 'utf8');
const nursery = fs.readFileSync(path.join(root, 'server/static/rpg/nursery-ui.js'), 'utf8');
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
		assert.match(nursery, /Colocar na incubadora local/);
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
		assert.doesNotMatch(nursery, /Vaga livre|VAGA ' \+ incubator\.slot|Incubadora local ' \+ groupNumber|Sem Egg disponível/);
		assert.match(teamBuilder, /Incubadoras Portáteis/);
		assert.match(teamBuilder, /Retirar Egg/);
		assert.match(teamBuilder, /Colocar Egg/);
		assert.match(teamBuilder, /deps\.selectedEgg\.status === 'ready_to_hatch'/);
		assert.match(teamBuilder, /button\('Chocar', 'button primary'\)/);
		assert.match(teamBuilder, /deps\.api\('\/nursery\/hatch'/);
		assert.match(bag, /linkedEggId/);
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
