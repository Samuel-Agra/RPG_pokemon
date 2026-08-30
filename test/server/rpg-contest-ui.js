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
		assert.ok(ui.includes("profile.scope === 'contest' ? contestMovePanel : battleStatsHost"));
		assert.ok(ui.includes('moveSection.append(moveHeading, moveChips, contestMovePicker)'));
		assert.ok(ui.includes("if (profile.scope !== 'contest') battleStatsHost.append(statsEditor)"));
		assert.ok(ui.includes("const ev = el('div', 'team-builder-ev-control')"));
		assert.ok(ui.includes("const evSlider = el('input', 'team-builder-ev-slider')"));
		assert.ok(ui.includes('function availableEVMaximum(id)'));
		assert.ok(ui.includes("const natureGrid = el('div', 'contest-nature-grid')"));
		assert.ok(ui.includes("statsMeta.append(naturePicker, totalEV)"));
		assert.ok(ui.includes("document.addEventListener('pointerdown', statsOutsideHandler)"));
		assert.ok(ui.includes('function closeStatsEditor()'));
		assert.ok(css.includes('.contest-nature-option.selected'));
		assert.ok(ui.includes("'contest-nature-increase'"));
		assert.ok(ui.includes("'contest-nature-decrease'"));
		assert.ok(ui.includes("'contest-nature-neutral-label', 'Neutro'"));
		assert.ok(!ui.includes('A coluna mostra o atributo aumentado'));
		assert.ok(ui.includes("if (profile.scope === 'contest') row.append(track)"));
		assert.ok(css.includes('.contest-battle-stats-editor'));
		assert.ok(ui.includes("moveSection.classList.add('contest-battle-move-section')"));
		assert.ok(ui.includes('moveSection.append(moveHeading, moveChips, contestMovePicker)'));
		assert.ok(ui.includes('const availableMoves = pokemonMoveCatalog'));
		assert.ok(css.includes('.contest-battle-move-section .contest-move-dropdown'));
		assert.ok(css.includes('.contest-battle-move-section .contest-selected-moves { grid-template-columns: repeat(4'));
		assert.ok(ui.includes('function temporaryMoveCard(move, handler)'));
		assert.ok(ui.includes("el('b', 'rpg-move-pp'"));
		assert.ok(!ui.includes("const pp = el('div', 'team-builder-master-pp-control')"));
		for (const marker of ['rpg-move-identity', 'rpg-move-technical', 'rpg-move-range', 'rpg-move-explanation']) {
			assert.ok(ui.includes(marker), marker);
		}
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
		assert.ok(moves.includes('const generation = Math.max(...availableGenerations, 1)'));
		assert.ok(moves.includes('source.startsWith(`${generation}M`)'));
		assert.ok(moves.includes('source.startsWith(`${generation}E`)'));
		assert.ok(moves.includes('description: metadata.description'));
		assert.ok(moves.includes("import {getRPGMoveMetadata} from './battle-move-analysis'"));
		assert.match(css, /\.contest-side-moves \.team-builder-four-moves \.team-builder-move-card\.rpg-move-button[^}]*height: 50px[^}]*min-height: 50px[^}]*max-height: 50px/);
		assert.ok(css.includes('[data-temporary-npc-build="contest"] .team-builder-main-property .contest-npc-property-label'));
		for (const marker of ['contest-item-search', 'contest-item-dropdown', 'contest-item-results',
			"'Sem item'", 'entry.description', 'itemOutsideHandler']) assert.ok(ui.includes(marker), marker);
		for (const marker of ['itemDivisionDefinitions', 'battleItemDivision(entry)', 'contest-item-division-select',
			"!entry.tags?.includes('breeding')", "'Held Items'", "'Mega Stones'", "'Berries'", "'Teralização'"]) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(ui.includes("!entry.tags?.includes('primalorb')"));
		assert.ok(ui.includes("profile.scope === 'battle' ? `Criar NPC temporário · Pokémon ${nextPokemonNumber} de até 6`"));
		assert.ok(ui.includes("actionButton('Adicionar Pokemon'"));
		assert.ok(ui.includes('function saveCurrentPokemon()'));
		assert.ok(ui.includes('function completeBattleEVs()'));
		assert.ok(ui.includes('Math.floor(Math.random() * available.length)'));
		assert.ok(ui.includes('const ivs = Object.fromEntries(contestStats.map(([id]) => [id, 0]))'));
		assert.ok(!ui.includes("throw new Error('Os EVs devem totalizar 508.')"));
		assert.ok(css.includes('.contest-npc-creator-actions'));
		for (const marker of ['contest-ability-dropdown', 'pokemonAbilityDetails()', 'renderAbilityResults()',
			"'Habilidade Oculta'", 'entry.description']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes("'Nenhuma habilidade disponível.'"));
		assert.ok(css.includes('.contest-temporary-card > .contest-temporary-team-sprites'));
		assert.ok(css.includes('flex-flow: row nowrap'));
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
		assert.ok(css.includes('@keyframes contest-trainer-idle'));
		assert.ok(css.includes('.contest-stage-trainer { position: absolute; left: 59%; bottom: 31%;'));
		assert.ok(css.includes('.contest-stage-pokemon { position: absolute; left: 50%;'));
		assert.ok(ui.includes("size-${pokemon.sizeClass || 'medium'}"));
		for (const size of ['small', 'medium', 'large', 'giant']) assert.ok(css.includes(`.contest-stage-pokemon.size-${size}`));
		assert.ok(!css.includes('@keyframes contest-move'));
	});

	it('reuses the current temporary NPC builder in battle preparation', () => {
		const contest = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const battle = fs.readFileSync(path.join(root, 'battle-ui-v2.js'), 'utf8');
		assert.ok(contest.includes("contest: {scope: 'contest'"));
		assert.ok(contest.includes("battle: {scope: 'battle'"));
		assert.ok(contest.includes('function contestTemporaryNPCEditor'));
		assert.ok(contest.includes('function battleTemporaryNPCEditor'));
		assert.ok(contest.includes('return {render, battleTemporaryNPCEditor,'));
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

	it('shows contest-only Terastallization items with their type condition', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		for (const marker of ["'tera-matching-moves'", "tags.has('contestterastalization')", "['terastalization', 'Teralização']",
			"group === 'terastalization' ? 'Teralização'", '+5 pontos ao usar pelo menos 2 moves']) {
			assert.ok(ui.includes(marker), marker);
		}
	});

	it('uses the account trainer catalog for temporary NPC sprites', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert(ui.includes("fetch('./avatars.json'"));
		assert(ui.includes("avatar: selectedAvatar.id"));
		assert(ui.includes("title.insertBefore(avatarPicker, title.lastChild)"));
		assert(ui.includes('selectedAvatar = avatar; npcName.value = avatar.name'));
		assert(ui.includes('if (participant.avatar)'));
		assert(css.includes('.contest-temporary-trainer-sprite'));
		assert(css.includes('.contest-npc-avatar-dropdown'));
		assert(css.includes('.contest-npc-avatar-option'));
	});

	it('generates contest-only temporary NPCs by contest rank', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		for (const marker of ['Criar NPC aleatório', 'generateRandomNPC()', "profile.contestRank?.() || 'normal'",
			"normal: {level: 20, quality: 0}", "master: {level: 90, quality: 4}",
			"entry.contest.category === category", 'randomRank: rankId', 'contestMoveScoreForCategory(move, category)',
			"beauty: 'cool', cool: 'beauty', cute: 'tough', tough: 'cute'", 'Math.min(10, baseScore + 2)',
			'Math.min(2, Math.floor(baseScore / 2))']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes("if (profile.scope === 'contest')"));
	});

	it('generates ranked temporary battle NPCs in a selected level range', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const battle = fs.readFileSync(path.join(root, 'battle-ui-v2.js'), 'utf8');
		for (const marker of ["['1-20', '1 - 20']", "['81-100', '81 - 100']", "['master', 'Master']",
			'generateRandomBattleNPC(levelRange.value, difficulty.value)', 'function randomBattleEVs(',
			'normal: {index: 0, iv: [0, 10]}', 'master: {index: 4, iv: [28, 31]}',
			'const totals = [64, 160, 280, 400, 508]', 'randomLevelRange: levelRangeValue']) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(css.includes('.contest-random-npc-config'));
		assert.ok(css.includes('.contest-random-npc-fields'));
		assert.ok(ui.includes('const teamSize = Math.max(1, Math.min(6, Number(profile.battleTeamSize?.()) || 1))'));
		assert.ok(ui.includes('for (let slot = 0; slot < teamSize; slot++)'));
		assert.ok(ui.includes('pokemon: pokemonTeam[0], pokemonTeam'));
		assert.ok(battle.includes("rpgBattleStep(2, 'Sele\\u00e7\\u00e3o dos Pok\\u00e9mon'"));
		assert.ok(battle.includes("rpgBattleStep(3, 'Participantes'"));
		assert.ok(battle.includes('initialTemporaryNPCs, () => Number(teamLimit.value)'));
		assert.ok(battle.includes('form.append(pokemonStep.step, participantsStep.step)'));
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

	it('matches battle session cleanup and cancellation rules', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const runtime = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-runtime.ts'), 'utf8');
		assert.ok(ui.includes('Cancelar concurso'));
		assert.ok(ui.includes("method: 'DELETE'"));
		assert.ok(ui.includes("sessions.filter(session => !['cancelled', 'started', 'ended'].includes(session.status))"));
		assert.ok(!ui.includes("session.status === 'started' || session.status === 'ended'"));
		assert.ok(runtime.includes('ENDED_RUNTIME_TTL = 60 * 60 * 1000'));
		assert.ok(runtime.includes('MAX_ENDED_RUNTIMES = 50'));
		assert.ok(runtime.includes('this.pruneEndedRuntimes()'));
		assert.ok(runtime.includes('state.finishedAt = this.now()'));
	});

	it('updates invitations and preparation changes without discarding unchanged forms', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		assert.ok(ui.includes('function schedulePreContestRefresh(context, page, sessions)'));
		assert.ok(ui.includes("const data = await context.api('/contest-sessions')"));
		assert.ok(ui.includes('preContestFingerprint(latestSessions) !== fingerprint'));
		assert.ok(ui.includes('if (!page.isConnected) return'));
		assert.ok(ui.includes('schedulePreContestRefresh(context, page, sessions)'));
		assert.ok(ui.includes('async function rerenderPreservingViewport(context)'));
		assert.ok(ui.includes('window.scrollTo(scrollLeft, scrollTop)'));
		assert.ok(ui.includes('replacement.focus({preventScroll: true})'));
	});

	it('keeps the active contest fluid and does not reset unchanged judging fields', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		assert.ok(ui.includes('function scheduleActiveContestRefresh(context, session, page, contest)'));
		assert.ok(ui.includes('if (JSON.stringify(data.contest) !== fingerprint)'));
		assert.ok(ui.includes('function replaceRuntimePage(context, session, currentPage, contest)'));
		assert.ok(ui.includes('currentPage.replaceChildren(...nextPage.childNodes)'));
		assert.ok(!ui.includes('window.setTimeout(() => void rerenderPreservingViewport(context), 1200)'));
		assert.ok(!ui.includes("document.getElementById('dashboard-content')"));
	});

	it('keeps the contest scenery visual and moves all information below it', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes("const actors = el('div', `contest-stage-actors mode-${contest.mode || 'solo'}`)"));
		assert.ok(ui.includes("el('img', 'contest-stage-trainer')"));
		assert.ok(ui.includes("typeof rpgRuntimeSprite === 'function'"));
		assert.ok(ui.includes("const content = el('section', 'panel contest-stage-content')"));
		assert.ok(ui.includes('wrap.append(stage)'));
		assert.ok(ui.includes('wrap.append(content)'));
		assert.ok(css.includes('@keyframes contest-trainer-idle'));
		assert.ok(!css.includes('@keyframes contest-move'));
	});

	it('keeps only compact type-colored move controls below the active stage', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(!ui.includes("'contest-performer', `Performance"));
		assert.ok(!ui.includes("'O público aguarda a apresentação.'"));
		assert.ok(ui.includes("const cssId = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')"));
		assert.ok(ui.includes('`contest-move rpg-move-button type-${cssId(move.type)}${usedInFirstRound'));
		assert.ok(css.includes('.contest-move { position: relative; box-sizing: border-box; display: grid;'));
		assert.ok(css.includes('min-height: 70px;'));
		assert.ok(css.includes('text-align: left;'));
		assert.ok(css.includes('#dashboard-screen.contest-mode { margin-top: -20px;'));
		assert.ok(ui.includes('currentRoundMoves = current.rounds[contest.round - 1] || []'));
		assert.ok(ui.includes("usedInFirstRound ? ' used-first-round' : ''"));
		assert.ok(ui.includes("el('b', '', String(position))"));
		assert.ok(ui.includes("move.changesField || (move.tags || []).some(tag => cssId(tag) === 'fieldchange')"));
		assert.ok(ui.includes("'◇ Afeta o palco'"));
		assert.ok(ui.includes('function contestMoveTraits(move)'));
		for (const trait of ['Clima', 'Terrain', 'Dança', 'Som', 'Cura', 'Movimento', 'Luz', 'Vento']) {
			assert.ok(ui.includes(`'${trait}'`), trait);
		}
		assert.ok(css.includes('.contest-move-traits small, .contest-move-field'));
		assert.ok(css.includes('.contest-move.used-first-round'));
		assert.ok(css.includes('.contest-move-order { position: absolute; z-index: 2; top: -10px; left: 50%;'));
	});

	it('expands an active contest like a battle room and restores the overview on return', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const dashboard = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
		assert.ok(ui.includes("classList.add('contest-mode')"));
		assert.ok(ui.includes("actionButton('Voltar'"));
		assert.ok(ui.includes("back.classList.add('rpg-leave-room')"));
		assert.ok(ui.includes("context.state.dashboardView = 'overview'"));
		assert.ok(css.includes('#dashboard-screen.contest-mode .sidebar'));
		assert.ok(css.includes('#dashboard-screen.contest-mode .contest-stage { min-height: clamp(560px, 52vw, 760px); }'));
		assert.ok(css.includes('#dashboard-screen.contest-mode .contest-stage-pokemon'));
		assert.ok(css.includes('.contest-stage-controls { position: absolute; z-index: 20; right: 14px; bottom: 14px; display: flex; flex-direction: column;'));
		assert.ok(css.includes('.contest-stage-controls .button'));
		assert.ok(dashboard.includes("classList.remove('battle-mode', 'contest-mode')"));
	});

	it('shows finished category artwork and dynamic presentation identity at the top center of the stage', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes("const stageHeading = el('div', `contest-stage-heading category-${contest.category}`)"));
		assert.ok(ui.includes("new URL(`./assets/contest-category-headers/${id}.png?v=20260829-2`, document.baseURI).href"));
		assert.ok(ui.includes('categoryArt.src = contestCategoryHeaderUrl(contest.category)'));
		assert.ok(ui.includes("categoryArt.alt = labels[contest.category]"));
		assert.ok(ui.includes("el('span', '', current.displayName)"));
		assert.ok(ui.includes("pokemonTeam.map(pokemon => pokemon.name).join(' · ')"));
		assert.ok(ui.includes("el('small', '', `Rodada ${contest.round}`)"));
		assert.ok(css.includes('top: 10px; left: 50%;'));
		assert.ok(css.includes('width: clamp(230px, 24vw, 330px);'));
		assert.ok(css.includes('transform: translateX(-50%)'));
		assert.ok(css.includes('.contest-stage-category-art'));
		assert.ok(css.includes('.contest-stage-identity'));
		assert.ok(css.includes('font-size: 22px; font-weight: 700;'));
		for (const category of ['beauty', 'cute', 'cool', 'smart', 'tough']) {
			assert.ok(css.includes(`.contest-stage-heading.category-${category}`));
			assert.ok(fs.existsSync(path.join(root, 'assets', 'contest-category-headers', `${category}.png`)));
		}
		for (const ornament of ["content: '✦'", "content: '♥'", "content: '★'", "content: '◈'", "content: '▲'"]) {
			assert.ok(css.includes(ornament), ornament);
		}
		assert.ok(css.includes("font-family: 'Arial Rounded MT Bold'"));
		assert.ok(css.includes("font-family: Impact, 'Arial Black'"));
	});

	it('lets the Master abandon the NPC whose presentation is active', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		assert.ok(ui.includes("context.master && current?.kind === 'npc'"));
		assert.ok(ui.includes("confirmableAction('Abandonar com este NPC'"));
		assert.ok(ui.includes("body: {type: 'abandon'}"));
	});

	it('replaces each abandon button with inline Confirmar and Cancelar actions', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes("const confirmableAction = (label, handler) =>"));
		assert.ok(ui.includes("actionButton('Confirmar'"));
		assert.ok(ui.includes("actionButton('Cancelar', showInitial)"));
		assert.ok(ui.includes("cancel.classList.add('contest-abandon-cancel')"));
		assert.ok(ui.includes("confirmableAction('Abandonar concurso'"));
		assert.ok(!ui.includes('window.confirm'));
		assert.ok(css.includes('.contest-confirmable-action { display: inline-grid;'));
		assert.ok(css.includes('.contest-confirmable-action .contest-abandon-cancel'));
	});

	it('queues contest choreography in event order before replacing the visual snapshot', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
		for (const marker of ['contestAnimationCursors', 'contestAnimationQueue', 'contestAnimationActive',
			'event.sequence > cursor', 'await playContestAnimationEvents(currentPage, contest, beforeReplacement)',
			"pending.some(event => event.type === 'participant-enter')"]) {
			assert.ok(ui.includes(marker), marker);
		}
		assert.ok(ui.indexOf('await playContestAnimationEvents(currentPage, contest, beforeReplacement)') <
			ui.indexOf('const mountedPage = replaceRuntimePage(context, session, currentPage, contest)'));
		for (const marker of ['window.RPGContestAnimations', 'RPGShowdownAnimations.play',
			'personal ? [pokemon] : [anchor]', 'await stageChange(stage, event)', 'await wait(180)',
			'fallbackMove(stage, pokemon, move)']) {
			assert.ok(adapter.includes(marker), marker);
		}
		assert.ok(html.indexOf('battle-animations-moves.js') < html.indexOf('contest-animation-adapter.js'));
		assert.ok(html.indexOf('contest-animation-adapter.js') < html.indexOf('contest-ui.js'));
	});

	it('keeps the prepared contest theme playing through runtime refreshes and stops it on exit', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const dashboard = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
		assert.ok(ui.includes('window.RPGBattleAudio?.playForContest?.()'));
		assert.ok(ui.includes('window.RPGBattleAudio?.stop()'));
		assert.ok(ui.indexOf("if (contest.status === 'ended' && contest.results)") <
			ui.indexOf('window.RPGBattleAudio?.playForContest?.()'));
		assert.ok(ui.includes("window.RPGBattleAudio?.stop();\n\t\t\treturn resultsPanel(context, session, contest);"));
		assert.ok(ui.includes('window.RPGBattleAudio.createVerticalVolumeControl()'));
		assert.ok(ui.includes('window.RPGBattleAudio.createEffectsToggleButton()'));
		assert.ok(css.includes('.contest-stage-controls > .rpg-vertical-volume > .button { width: 94px; }'));
		assert.ok(css.includes('center / 6px calc(100% - 16px) no-repeat'));
		assert.ok(ui.includes("stopAudio: () => window.RPGBattleAudio?.stop()"));
		assert.ok(dashboard.includes("if (state.dashboardView !== 'contests') window.RPGContestUI?.stopAudio?.()"));
	});

	it('plays an existing matching sound at each contest move impact', () => {
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		for (const sound of ['heal', 'statusBurn', 'statusFreeze', 'statusParalysis', 'statusPoison',
			'statusSleep', 'impact']) assert.ok(adapter.includes(`'${sound}'`));
		assert.ok(adapter.includes("if (move.battleCategory === 'Physical' || move.battleCategory === 'Special' || Number(move.basePower) > 0) return 'impact'"));
		assert.ok(adapter.includes("return ''"));
		assert.ok(adapter.includes('{onImpact: playMoveSound}'));
		assert.ok(adapter.includes('if (sound) window.RPGBattleAudio?.playEffect(sound)'));
		const runtime = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-runtime.ts'), 'utf8');
		for (const field of ['type: definition.type', 'battleCategory: definition.battleCategory',
			'basePower: definition.basePower', 'battleStatus: definition.battleStatus', 'tags: [...definition.tags]',
			'changesField: definition.changesField']) {
			assert.ok(runtime.includes(field));
		}
	});

	it('narrates every contest move with expressive typography and synchronized trainer gestures', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(adapter.includes('const EXPRESSIVE_LINES = ['));
		assert.ok((adapter.match(/\(name, move\) =>/g) || []).length >= 20);
		assert.ok(adapter.includes('expressiveCue(stage, options.pokemonName, move, event, options.contestCategory)'));
		assert.ok(adapter.includes("node.append(document.createElement('span'), document.createElement('strong')"));
		assert.ok(adapter.includes('trainerChoreography(move)'));
		assert.ok(ui.includes('pokemonName: performer.name, contestCategory: contest.category'));
		assert.ok(css.includes('left: clamp(42px, 6vw, 92px)'));
		for (let variant = 0; variant < 8; variant++) assert.ok(css.includes(`.contest-expressive-callout.style-${variant}`));
		for (const gesture of ['command', 'flourish', 'cheer', 'conduct', 'focus']) {
			assert.ok(css.includes(`.contest-trainer-action-${gesture}`));
		}
	});

	it('scales the audience animation through all six reaction levels', () => {
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const audio = fs.readFileSync(path.join(root, 'battle-audio.js'), 'utf8');
		assert.ok(adapter.includes('const particleCounts = [3, 6, 10, 16, 24, 34]'));
		assert.ok(adapter.includes("Math.max(1, Math.min(6, Number(reaction.level) || 1))"));
		assert.ok(adapter.includes("className = 'contest-audience-wave'"));
		assert.ok(adapter.includes('playEffect(`contestAudience${level}`)'));
		for (let level = 1; level <= 6; level++) assert.ok(css.includes(`.contest-audience-burst.level-${level}`));
		for (let level = 1; level <= 6; level++) {
			assert.ok(audio.includes(`contestAudience${level}: {file: 'contest-audience-${level}.wav'`));
			assert.ok(fs.existsSync(path.join(root, 'assets', 'audio', `contest-audience-${level}.wav`)));
		}
		for (const animation of ['uneasy', 'warmth', 'flash', 'historic-flash', 'wave']) {
			assert.ok(css.includes(`@keyframes contest-audience-${animation}`));
		}
	});

	it('keeps contest weather, terrain and stage props visible until the participant round ends', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes('current.stageStates?.[contest.round - 1]'));
		assert.ok(ui.includes('renderPersistentStage?.(stage'));
		for (const marker of ['rpg-weather-effect weather', 'rpg-terrain-effect weather',
			"spikes: {effect: 'caltrop'", "toxicspikes: {effect: 'poisoncaltrop'",
			"floatingrocks: {effects: ['rock1', 'rock2', 'rock3']", "stickyweb: {effect: 'web'"]) {
			assert.ok(adapter.includes(marker), marker);
		}
		assert.ok(adapter.includes('persistentStageSignatures'));
		assert.ok(adapter.includes("previous !== undefined && previous !== signature"));
		for (const filename of ['surf-ripples.png', 'earthquake-cracks.png', 'smokescreen-cloud.png',
			'mist-wisps.png', 'sandsear-vortex.png']) {
			assert.ok(adapter.includes(filename), filename);
			assert.ok(fs.existsSync(path.join(root, 'assets', 'contest-effects', filename)), filename);
		}
		for (const marker of ['.contest-persistent-stage', '.contest-persistent-prop.is-entering',
			'@keyframes contest-prop-land', '@keyframes contest-sprite-mist', '@keyframes contest-sprite-sand']) {
			assert.ok(css.includes(marker), marker);
		}
		assert.ok(css.includes('.contest-persistent-environment { z-index: 3; }'));
		assert.ok(!css.includes('.contest-persistent-stage { position: absolute; z-index: 1;'));
	});

	it('lets Altaria clear changed stage effects before the next participant enters', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const adapter = fs.readFileSync(path.join(root, 'contest-animation-adapter.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes('stage.dataset.hasTemporaryEffects = String(Boolean('));
		assert.ok(ui.includes("if (entered) await window.RPGContestAnimations?.cleanupStage?."));
		assert.ok(ui.indexOf('cleanupStage?.(currentPage.querySelector') < ui.indexOf('const mountedPage = replaceRuntimePage'));
		for (const marker of ["stage.dataset.hasTemporaryEffects !== 'true'", "name: 'Altaria'",
			"className = 'contest-cleanup-altaria'", "className = 'contest-cleanup-wind'"]) {
			assert.ok(adapter.includes(marker), marker);
		}
		for (const marker of ['@keyframes contest-participant-leave-stage', '@keyframes contest-altaria-cleanup',
			'@keyframes contest-cleanup-wind', '@keyframes contest-clear-persistent-stage']) assert.ok(css.includes(marker), marker);
	});

	it('shows current contest moves only to their Player or to the Master', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		assert.ok(ui.includes('const canViewCurrentMoves = Boolean(current && (context.master || current.characterId === context.character?.id))'));
		assert.ok(ui.includes('if (canViewCurrentMoves) {'));
		assert.ok(ui.indexOf("const content = el('section', 'panel contest-stage-content')") > ui.indexOf('if (canViewCurrentMoves) {'));
		assert.ok(ui.indexOf('wrap.append(content)') > ui.indexOf('if (canViewCurrentMoves) {'));
	});

	it('places the Master judging panel inside the stage with category styling', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		assert.ok(ui.includes('if (contest.canJudge) stage.append(judgePanel(context, session, contest.category))'));
		assert.ok(!ui.includes('if (contest.canJudge) wrap.append(judgePanel'));
		assert.ok(ui.includes("const form = el('form', `contest-stage-judge category-${category}`)"));
		assert.ok(ui.includes("'button contest-stage-judge-submit', 'Confirmar notas'"));
		assert.ok(css.includes('top: clamp(92px, 16%, 132px); right: clamp(30px, 5vw, 78px)'));
		assert.ok(css.includes('color: var(--judge-ink) !important'));
		for (const category of ['beauty', 'cute', 'cool', 'smart', 'tough']) {
			assert.ok(css.includes(`.contest-stage-judge.category-${category}`));
		}
	});

	it('supports solo, duo and trio formations with per-Pokemon move limits', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		const session = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-session.ts'), 'utf8');
		const runtime = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-runtime.ts'), 'utf8');
		const http = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/http.ts'), 'utf8');
		for (const marker of ["['solo', 'Solo'], ['duo', 'Dupla'], ['trio', 'Trio']", 'mode: mode.value',
			"session.mode === 'trio' ? 3 : session.mode === 'duo' ? 2 : 1", 'body: {teamIndexes: selection.getPokemonSelection()}',
			'current.pokemonTeam?.length ? current.pokemonTeam : [current.pokemon]', 'current.roundPokemonIndexes',
			'body: {type: \'select-move\', moveId: move.id, pokemonIndex, activateMega}']) assert.ok(ui.includes(marker), marker);
		for (const marker of ['.contest-stage-actors.mode-duo .contest-stage-trainer',
			'.contest-stage-actors.mode-duo .contest-stage-pokemon.slot-0', '.contest-stage-actors.mode-duo .contest-stage-pokemon.slot-1',
			'.contest-stage-actors.mode-trio .contest-stage-pokemon.slot-0', '.contest-stage-actors.mode-trio .contest-stage-pokemon.slot-1',
			'.contest-stage-actors.mode-trio .contest-stage-pokemon.slot-2']) assert.ok(css.includes(marker), marker);
		for (const marker of ["export type RPGContestMode = 'solo' | 'duo' | 'trio'", 'pokemonTeam?: RPGContestPokemonSelection[]',
			'RPG ${session.mode} contest requires exactly ${required} Pokemon']) assert.ok(session.includes(marker), marker);
		for (const marker of ['pokemonTeam: RPGContestRuntimePokemon[]', 'roundPokemonIndexes: [number[], number[]]',
			"state.session.mode === 'trio' ? 1 : state.session.mode === 'duo' ? 2 : 3", 'pokemonIndex,\n\t\t\tstageTransformations']) {
			assert.ok(runtime.includes(marker), marker);
		}
		assert.ok(http.includes('body.teamIndexes.map(Number)'));
	});

	it('matches the battle invitation card for contest players', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		for (const marker of ['function playerContestCard(context, session)', 'battle-session-card contest-invitation-card',
			'battle-session-head', 'battle-status status-${session.status}', 'battle-teams contest-invitation-summary',
			'battle-invitations', 'battle-session-actions', 'selection.getPokemonSelection()']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes('battle-check pokemon-choice${unavailable'));
		assert.ok(!ui.includes("actionButton('Salvar seleção'"));
	});

	it('saves battle Pokémon only when the player accepts the invitation', () => {
		const battle = fs.readFileSync(path.join(root, 'battle-ui-v2.js'), 'utf8');
		assert.ok(!battle.includes("button('Salvar sele\\u00e7\\u00e3o'"));
		assert.ok(battle.includes('panel.getPokemonSelection = () =>'));
		assert.ok(battle.includes('panel.append(grid)'));
	});

	it('keeps the final ceremony visible and exposes only the final score to players', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const runtime = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/contest-runtime.ts'), 'utf8');
		for (const marker of ['Cerimônia final', 'Demais participantes', 'Destaques do concurso', 'Reação do público',
			'Uso do cenário', 'Melhor combo', 'Evolução entre rodadas', "context.master ? 'Encerrar e sair' : 'Encerrar'",
			'Revisar detalhes do mestre']) assert.ok(ui.includes(marker), marker);
		assert.ok(ui.includes("if (contest.status === 'ended' && contest.results) {"));
		assert.ok(ui.includes('return resultsPanel(context, session, contest)'));
		assert.ok(ui.includes("refreshTimer = null"));
		assert.ok(ui.includes("if (!page.classList.contains('contest-final-page'))"));
		assert.ok(ui.includes("session.status === 'ended' && !dismissedContestResults.has(session.id)"));
		assert.ok(ui.includes('dismissedContestResults.add(session.id)'));
		assert.ok(ui.includes("data = await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/runtime`)"));
		assert.ok(ui.includes('Nota final: ${result.total}'));
		assert.ok(!ui.includes('pontos · +'));
		assert.ok(runtime.includes('viewer.master ? structuredClone(state.results) : state.results.map'));
		assert.ok(runtime.includes('participantId: result.participantId, place: result.place, total: result.total, disqualified: result.disqualified'));
		assert.ok(runtime.includes('participant.judging = [null, null]'));
		assert.ok(runtime.includes('participant.roundScores = [null, null]'));
	});

	it('keeps the contest scenario for a three-place ceremony and lists cards from fourth place onward', () => {
		const ui = fs.readFileSync(path.join(root, 'contest-ui.js'), 'utf8');
		const css = fs.readFileSync(path.join(root, 'contest-ui.css'), 'utf8');
		for (const marker of ['contest-final-ceremony', 'contestBackgroundUrl(backgroundId)', 'contest-final-podium-entry place-${place}',
			"place === 1 ? 'Campeão'", "Number(pokemon.heightM) >= 1.5", 'frontPosition = 0', 'behindPosition = 0',
			"result?.disqualified || Number(result?.place) >= 4", 'Demais participantes']) assert.ok(ui.includes(marker), marker);
		for (const marker of ['.contest-final-podium-entry.place-1', '.contest-final-podium-entry.place-2',
			'.contest-final-podium-entry.place-3', '.contest-final-podium-pokemon.behind', '.contest-final-podium-pokemon.front',
			'.contest-final-podium-pokemon.look-right img { transform: scaleX(-1); }', 'top: -18%']) {
			assert.ok(css.includes(marker), marker);
		}
		assert.ok(ui.includes('const pokemonOnViewerRight = position === 1'));
		assert.ok(ui.includes("pokemonOnViewerRight ? ' look-right' : ''"));
		assert.ok(ui.includes("const label = el('button', 'contest-final-podium-label')"));
		assert.ok(ui.includes("entry.classList.toggle('details-open', opening)"));
		assert.ok(ui.includes("const details = el('div', 'contest-final-podium-details')"));
		assert.ok(!ui.includes("const list = el('ul', 'contest-final-comments')"));
		for (const category of ['beauty', 'cute', 'cool', 'smart', 'tough']) {
			assert.ok(css.includes(`.contest-final-ceremony.category-${category}`));
		}
		assert.ok(css.includes('.contest-final-podium-entry.details-open .contest-final-podium-details'));
		assert.ok(css.includes('.contest-final-podium-round .contest-final-move-sequence span { color: #263d61; background: #fff; }'));
		assert.ok(css.includes('.contest-final-podium-entry.place-2 .contest-final-podium-trainer { bottom: 24%;'));
		assert.ok(css.includes('.contest-final-podium-entry.place-3 .contest-final-podium-trainer { bottom: 29%;'));
	});
});
