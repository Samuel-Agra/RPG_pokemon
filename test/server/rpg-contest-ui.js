'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG contest UI', () => {
	const root = path.resolve(__dirname, '../../server/static/rpg');
	it('loads a dedicated contest page and keeps its implementation separate from battle code', () => {
		const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
		const app = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
		const baseCSS = fs.readFileSync(path.join(root, 'rpg.css'), 'utf8');
		assert.ok(html.includes('contest-ui.css'));
		assert.ok(html.includes('contest-ui.js'));
		assert.ok(app.includes("['contests', 'Concursos']"));
		assert.ok(app.includes('window.RPGContestUI.render'));
		assert.match(baseCSS, /\.topbar[\s\S]*?z-index: 80/);
	});

	it('provides move selection, judging, reactions, results and an event-ready stage', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		for (const marker of ['select-move', 'submit-judging', 'audienceReactions', 'contest.results', '/selection', '/response']) {
			assert.ok(ui.includes(marker), marker);
		}
		for (const section of ['Concurso e formato', 'Participantes', 'Condições iniciais']) {
			assert.ok(ui.includes(section), section);
		}
		assert.ok(!ui.includes('window.prompt'));
		assert.ok(!ui.includes("step(3, 'Seleção dos Pokémon'"));
		assert.ok(!ui.includes("step(5, 'Regras especiais'"));
		for (const marker of ['NPCs temporários', 'Criar NPC temporário', '/battle-pokemon', '/contest-moves']) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(ui.includes("rpgPlayerParticipantChoice(character, 'A'"));
		for (const className of ['team-builder-showdown-card', 'team-builder-showdown-toolbar',
			'team-builder-showdown-body', 'team-builder-portrait', 'team-builder-details', 'team-builder-four-moves']) {
			assert.ok(ui.includes(className), className);
		}
		for (const marker of ['contest-npc-hp-controls', 'Editar atributos', 'team-builder-stats-browser',
			'currentPP', 'evs: {...evs}', 'ivs: {...ivs}']) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(ui.includes("if (profile.includeExperience) detailGrid.append(toolbarCell('XP', experience))"));
		assert.ok(ui.includes('if (profile.includeExperience) rpgState.experience = Number(experience.value)'));
		for (const marker of ['team-builder-master-status-popover', 'team-builder-master-status-header',
			'team-builder-master-status-grid', 'team-builder-master-status-choice', 'statusOutsideHandler']) {
			assert.ok(ui.includes(marker), marker);
		}
		for (const marker of ['team-builder-master-hp-popover', 'team-builder-master-hp-controls',
			'team-builder-master-hp-slider', 'team-builder-master-hp-number', 'hpOutsideHandler',
			"el('span', 'team-builder-stat-fill')", "hpTrack.classList.add(Number(hp.value) <= 0 ? 'fainted'"]) {
			assert.ok(ui.includes(marker), marker);
		}
		for (const marker of ['contest-pokemon-search-box', 'contest-species-dropdown', 'speciesOutsideHandler',
			'!entry.legendary', 'speciesSearch.value = pokemon.name']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes("'contest-npc-property-label', 'Item'"));
		assert.ok(ui.includes("'contest-npc-property-label', 'Habilidade'"));
		assert.ok(ui.includes("'contest-npc-property-label', 'Categoria e pontuação'"));
		assert.ok(ui.includes("profile.scope === 'contest' ? itemContestProperty : abilityProperty"));
		assert.ok(css.includes('.contest-item-build-summary'));
		assert.ok(ui.includes("profile.scope === 'contest' ? contestMovePanel : statsPanel"));
		assert.ok(ui.includes("moveSection.append(moveHeading, moveChips, moveSearch, moveResults)"));
		assert.ok(ui.includes("if (profile.scope !== 'contest') creator.append(statsEditor)"));
		assert.ok(css.includes('.contest-side-moves .contest-selected-moves'));
		for (const marker of ['contest-moves-toolbar-title', "'Moves'", 'contest-move-dropdown hidden',
			'function openMovePicker()', 'function closeMovePicker()', "actionButton('Espaço de golpe', openMovePicker)"]) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(!ui.includes("el('small', '', 'Escolha até quatro')"));
		assert.ok(!ui.includes('contest-move-toolbar-heading'));
		assert.ok(!ui.includes('contest-side-moves-title'));
		assert.match(css, /\.contest-npc-showdown-body \{ grid-template-columns: 180px minmax\(360px, 1fr\) 27%; \}/);
		assert.match(css, /\.contest-pokemon-toolbar \{ grid-template-columns: auto minmax\(360px, 1fr\) 27%; \}/);
		assert.match(css, /\.contest-moves-toolbar-title[^}]*justify-content: flex-start[^}]*width: 100%[^}]*text-align: left/);
		assert.ok(css.includes('.contest-editor, .contest-npc-creator.team-builder-showdown-card { overflow: visible; }'));
		for (const marker of ['/contest-pokemon-moves?', 'function loadPokemonMoves()',
			"row.className = 'team-builder-simple-move'", 'pokemonMoveCatalog']) assert.ok(ui.includes(marker), marker);
		for (const marker of ['Normal: 0, Grass: 1, Fire: 2, Water: 3',
			'const battleCategoryOrder = {Physical: 0, Special: 1, Status: 2}',
			'moveTypeOrder[first.type]', 'battleCategoryOrder[first.battleCategory]']) assert.ok(ui.includes(marker), marker);
		const http = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/http.ts'), 'utf8');
		assert.ok(http.includes("'/api/rpg/contest-pokemon-moves'"));
		const moves = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-move-catalog.ts'), 'utf8');
		assert.ok(moves.includes('dex.species.getFullLearnset(species.id)'));
		assert.ok(moves.includes("source.startsWith('9M') || source.startsWith('9E')"));
		assert.ok(moves.includes('description: metadata.description'));
		assert.ok(moves.includes("import {getRPGMoveMetadata} from './battle-move-analysis'"));
		assert.match(css, /\.contest-side-moves \.team-builder-four-moves \.team-builder-move-card\.rpg-move-button[^}]*height: 50px[^}]*min-height: 50px[^}]*max-height: 50px/);
		assert.ok(css.includes('[data-temporary-npc-build="contest"] .team-builder-main-property .contest-npc-property-label'));
		for (const marker of ['contest-item-search', 'contest-item-dropdown', 'contest-item-results',
			"'Sem item'", 'entry.description', 'itemOutsideHandler']) assert.ok(ui.includes(marker), marker);
		for (const marker of ["['beauty', 'cute', 'cool', 'smart', 'tough']", 'entry.contest?.canScore',
			'left.contest.points - right.contest.points', 'contest-item-category-heading', "' por estar equipado'"]) {
			assert.ok(ui.includes(marker), marker);
		}
		for (const marker of ['rpgRuntimeItemIcon(entry)', 'contest-item-option-text', 'contest-item-option-icon',
			'contest-selected-item-icon', 'contest-selected-item-glyph', 'selectedItemIcon.replaceChildren()']) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(!css.includes('.contest-selected-item-icon:empty { display: none; }'));
		assert.ok(!ui.includes('Item carregado (opcional)'));
		assert.ok(ui.includes('if (profile.showPortraitName) portrait.append'));
		assert.ok(ui.includes("selectedPokemon.genders || ['M', 'F']"));
		assert.ok(!ui.includes("el('span', '', 'Apelido')"));
		assert.ok(!ui.includes('contest-species-picker-panel'));
		assert.ok(css.includes('@keyframes contest-enter'));
		assert.ok(css.includes('@keyframes contest-move'));
	});

	it('reuses the current temporary NPC builder in battle preparation', () => {
		const contest = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const battle = fs.readFileSync(path.join(root, 'battle-ui-v2.js'), 'utf8');
		assert.ok(contest.includes("contest: {scope: 'contest'"));
		assert.ok(contest.includes("battle: {scope: 'battle'"));
		assert.ok(contest.includes('function contestTemporaryNPCEditor'));
		assert.ok(contest.includes('function battleTemporaryNPCEditor'));
		assert.ok(contest.includes('return {render, battleTemporaryNPCEditor}'));
		assert.ok(battle.includes('window.RPGContestUI.battleTemporaryNPCEditor'));
		assert.ok(battle.includes("if (opponent.value === 'npc')"));
		assert.ok(battle.includes("team: 'B', kind: 'npc'"));
		assert.ok(battle.includes('avatar: npc.avatar'));
		assert.ok(battle.includes('pokemon: [structuredClone(npc.pokemon)]'));
		assert.ok(!battle.includes('Cadastre um NPC antes de preparar esse tipo de batalha.'));
	});

	it('serves descriptions for the held-item picker catalog', () => {
		const service = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/index.ts'), 'utf8');
		assert.ok(service.includes('description: RPGBagManagement.description(item)'));
	});

	it('excludes berries, breeding items and non-equippable items from contest scoring', () => {
		const catalog = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-item-catalog.ts'), 'utf8');
		assert.ok(catalog.includes("tags.has('berry')"));
		assert.ok(catalog.includes("tags.has('breeding')"));
		assert.ok(catalog.includes("item.category !== 'held' && !tags.has('held')"));
		assert.ok(catalog.includes('canScore: false'));
		for (const marker of ["'cellbattery'", "'berryjuice'", "category: 'tough'", 'points: 2',
			"scoringMode: 'mega-activation'", "balanceGroup: 'mega-stones'"]) assert.ok(catalog.includes(marker), marker);
		const runtime = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-runtime.ts'), 'utf8');
		assert.ok(runtime.includes('activateMega?: boolean'));
		assert.ok(runtime.includes('score.total += score.itemBonus'));
	});

	it('uses the account trainer catalog for temporary NPC sprites', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert(ui.includes("fetch('./avatars.json'"));
		assert(ui.includes("avatar: selectedAvatar.id"));
		assert(ui.includes("title.insertBefore(avatarPicker, title.lastChild)"));
		assert(ui.includes('selectedAvatar = avatar; npcName.value = avatar.name'));
		assert(ui.includes("profile.scope === 'contest' && participant.avatar"));
		assert(css.includes('.contest-temporary-trainer-sprite'));
		assert(css.includes('.contest-npc-avatar-dropdown'));
		assert(css.includes('.contest-npc-avatar-option'));
	});

	it('generates contest-only temporary NPCs by contest rank', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		for (const marker of ['Criar NPC aleatório', 'generateRandomNPC(rankId)',
			"normal: {level: 20, quality: 0}", "master: {level: 90, quality: 4}",
			"entry.contest.category === category", 'randomRank: rankId']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes("if (profile.scope === 'contest')"));
	});

	it('lets the master choose a persistent contest background', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const service = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-session.ts'), 'utf8');
		for (const id of ['classic-hall', 'sunset-harbor', 'neon-arena', 'enchanted-clearing', 'festival-plaza', 'snowy-overlook']) {
			assert.ok(ui.includes(id), id);
			assert.ok(fs.existsSync(path.join(root, 'assets/contest-backgrounds', `${id}.png`)), id);
		}
		assert.ok(ui.includes('backgroundId: backgroundInput.value'));
		assert.ok(ui.includes("new URL(`./assets/contest-backgrounds/${id}.png`, document.baseURI).href"));
		assert.ok(ui.includes("stage.classList.add('has-background')"));
		assert.ok(service.includes('backgroundId?: string'));
		assert.ok(css.includes('.contest-background-options'));
	});
});
