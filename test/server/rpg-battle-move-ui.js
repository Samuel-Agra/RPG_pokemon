'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.js'), 'utf8');
const battleUi = fs.readFileSync(path.join(root, 'server/static/rpg/battle-ui.js'), 'utf8');
const dashboardScript = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.css'), 'utf8');
const animationAdapter = fs.readFileSync(path.join(root, 'server/static/rpg/showdown-animation-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const hudSpritePath = path.join(root, 'server/static/rpg/assets/hud/battle-effects.png');
const assetConfig = fs.readFileSync(path.join(root, 'server/static/rpg/asset-config.js'), 'utf8');
const assetProvider = fs.readFileSync(path.join(root, 'server/static/rpg/asset-provider.js'), 'utf8');
const assetManifest = JSON.parse(fs.readFileSync(path.join(root, 'server/static/rpg/assets/external-assets.json'), 'utf8'));

describe('RPG battle move controls', () => {
	it('synchronizes invitations and battle starts without a manual refresh button', () => {
		assert(!html.includes('id="refresh-dashboard"'));
		assert(dashboardScript.includes('async function synchronizeBattleSessions()'));
		assert(dashboardScript.includes('window.setInterval(() => void synchronizeBattleSessions(), 1000)'));
		assert(dashboardScript.includes("return !state.dismissedBattleSessionIds.has(session.id);"));
		assert(dashboardScript.includes("if (isMasterMode) return session.status === 'ready';"));
		assert(dashboardScript.includes("invitation.response === 'pending'"));
		assert(dashboardScript.includes("dashboard.classList.contains('battle-mode')"));
		assert(dashboardScript.includes("dashboard.querySelector('.battle-editor')"));
		assert(dashboardScript.includes('state.battleSessions = [];'));
		assert(dashboardScript.includes('state.dismissedBattleSessionIds.clear();'));
		assert(dashboardScript.includes("return !state.dismissedBattleSessionIds.has(session.id)"));
		assert(script.includes('state.dismissedBattleSessionIds?.add(session.id)'));
	});
	it('leaves controlled Pokemon nature and gender blank so the backend can randomize wild encounters', () => {
		assert(battleUi.includes("item: '', ability: '', moves: [], nature: '', gender: ''"));
		assert(!battleUi.includes("moves: [], nature: 'Hardy'"));
		assert(!battleUi.includes("nature: '', gender: 'N'"));
		assert(html.includes('battle-ui.js?v=20260815-01'));
	});
	it('updates side panels only after each queued animation', () => {
		assert(script.includes('let visualSnapshot;'));
		assert(script.includes('function applyAnimationUpdates(event)'));
		assert(script.includes('await playAnimationEvent(event);\n\t\t\t\t\tapplyAnimationUpdates(event);'));
		assert(script.includes("pokemon.boosts[update.boost.stat]"));
		assert(script.includes("const previousWidth = previous.querySelector('.rpg-side-hp i')?.style.width"));
		assert(script.includes('void nextFill.offsetWidth'));
		assert(script.includes('rpgRuntimeSyncStatusVisual(slot, pokemon.status)'));
		assert(script.includes("sprite.querySelectorAll('.rpg-sleep-zs, .rpg-freeze-overlay')"));
		assert(style.includes('@keyframes rpg-sleep-z-rise'));
		assert(style.includes('.rpg-freeze-overlay'));
	});
	it('renders the fixed four-slot move grid from normalized runtime metadata', () => {
		assert(script.includes('function rpgMoveButton(move, index, sideId)'));
		assert(!script.includes("'O que ' + pokemon.name + ' fará?'"));
		assert(script.includes('function rpgRuntimeBallIcon(pokemon)'));
		assert(script.includes('pokemon?.pokeballSprite'));
		assert(style.includes('var(--rpg-asset-item-icons, none)'));
		assert(script.includes("'PP ' + move.pp + '/' + move.maxPP"));
		assert(script.includes('rpgMovePower(move)'));
		assert(script.includes('rpgMoveAccuracy(move)'));
		assert(script.includes('move.targetLabel'));
		assert(script.includes('for (let index = pokemon.moves.length; index < 4; index++)'));
		assert(style.includes('.rpg-move-grid { grid-template-columns: repeat(2, minmax(0, 1fr))'));
	});

	it('shows detailed effects, flags, revealed targets, and separate damage/status results', () => {
		assert(script.includes('function rpgMoveTooltip(move, sideId)'));
		assert(script.includes("effect.kind === 'status'"));
		assert(script.includes("'Revealed reserve'"));
		assert(script.includes('target.damage.multiplier'));
		assert(script.includes('target.effect.outcome'));
		assert(style.includes('.rpg-move-cell.details-open .rpg-move-tooltip'));
		assert(script.includes('detailsTimer = setTimeout(() => {'));
		assert(script.includes('}, 1000);'));
		assert(!style.includes('.rpg-move-cell:focus-within .rpg-move-tooltip'));
		assert(style.includes('width: clamp(380px, 48vw, 480px)'));
	});

	it('uses backend targetLoc instead of recalculating battle reach in the frontend', () => {
		assert(script.includes('target.inField && target.selectable'));
		assert(script.includes('config.validTargets.find'));
		assert(script.includes('targetHandlers.get(selected)?.target?.targetLoc'));
		assert(!script.includes('Math.abs(config.activeSlot + slot'));
	});

	it('keeps disabled reasons visible and uses provider category icons and all type colors', () => {
		assert(script.includes("'Reason: ' + move.disabledReason"));
		assert(style.includes('var(--rpg-asset-category-physical, none)'));
		assert(style.includes('var(--rpg-asset-category-special, none)'));
		assert(style.includes('var(--rpg-asset-category-status, none)'));
		assert(script.includes('effect.description'));
		assert(script.includes('identity.append(categoryIcon'));
		assert(script.includes('right.append(description, pp)'));
		assert(script.includes('body.append(left, right)'));
		for (const type of ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
			'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']) {
			assert(style.includes('.rpg-type-badge.type-' + type), 'missing type badge for ' + type);
		}
		assert(html.includes('battle-room.css?v=20260801-3'));
		assert(html.includes('battle-room.js?v=20260801-8'));
	});
	it('uses target sprite ids, typed tooltip borders, provider weather assets, and queued switching', () => {
		const analysis = fs.readFileSync(path.join(root, 'server/rpg-showdown/battle-move-analysis.ts'), 'utf8');
		const adapter = fs.readFileSync(path.join(root, 'server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(analysis.includes('spriteId: target.species.spriteid'));
		assert(script.includes("'rpg-move-tooltip type-' + rpgRuntimeEffectId(move.type)"));
		assert(style.includes('.rpg-move-tooltip.type-fire { border-color: #c74f2f; }'));
		assert(style.includes('var(--rpg-asset-weather-rain, none)'));
		assert(style.includes('var(--rpg-asset-weather-sand, none)'));
		assert(style.includes('var(--rpg-asset-weather-snow, none)'));
		assert(style.includes('var(--rpg-asset-terrain-electric, none)'));
		assert(assetProvider.includes('fx/weather-raindance.jpg'));
		assert(assetProvider.includes('fx/weather-electricterrain.png'));
		assert(!style.includes('@keyframes rpg-weather-drift'));
		assert(!style.includes('repeating-linear-gradient(105deg'));
		assert(script.includes("ghost.classList.add('rpg-switch-out-ghost')"));
		assert(script.includes("element.classList.add('rpg-switch-in-pending')"));
		assert(script.includes('window.RPGShowdownAnimations.recall(field, element'));
		assert(script.includes("event.type === 'capture' && event.success"));
		assert(script.includes("ghost.classList.add('rpg-capture-ghost')"));
		assert(script.includes('window.RPGShowdownAnimations.wildAppear(field, element'));
		assert(script.includes('const ownFormationSize = Math.max'));
		assert(script.includes('foeFormationSize, pokemon.activeSlot ?? index'));
		assert(adapter.includes('async function recall(field, pokemonElement'));
		assert(html.includes('showdown-animation-adapter.js?v=20260801-4'));
		assert(html.includes('battle-room.css?v=20260801-3'));
		assert(html.includes('battle-room.js?v=20260801-8'));
	});
	it('plays voluntary switches before move animations and forced replacements after fainting', () => {
		const scheduling = script.slice(
			script.indexOf('const hasSwitchAnimation ='),
			script.indexOf('if (!introStarted) void runIntro()')
		);
		assert(scheduling.includes("if (canAnimateSwitches && (switchGhosts.length > 0 || pendingAnimations.some(event => event.type === 'entry')))"));
		assert(scheduling.indexOf('animationQueue = animationQueue.catch(() => undefined).then(animateSwitches)') <
			scheduling.indexOf('queueAnimations(pendingAnimations)'));
		assert(scheduling.includes('if (canAnimateSwitches) animationQueue = animationQueue.then(animateSwitches)'));
		const hideIncoming = script.indexOf("element.classList.add('rpg-switch-in-pending')");
		const attachField = script.indexOf('live.replaceChildren(layout)');
		assert(hideIncoming >= 0 && hideIncoming < attachField, 'incoming sprite must be hidden before DOM insertion');
		assert(script.includes('const pendingSwitchInKeys = new Set()'));
		assert(script.includes('for (const key of newlyActiveKeys) pendingSwitchInKeys.add(key)'));
		assert(script.includes('pendingSwitchInKeys.has(element.dataset.runtimeSide'));
		assert(script.includes("const currentField = room.querySelector('.rpg-battle-field') || field"));
		assert(script.includes('pendingSwitchInKeys.delete(key)'));
	});	it('renders every battle condition inside the field and removes the old top HUD', () => {
		assert(script.includes('function rpgRuntimeFieldHUD(snapshot, own, foe)'));
		assert(script.includes('fieldState.weatherDetails'));
		assert(script.includes('fieldState.terrainDetails'));
		assert(script.includes('fieldState.globalEffects'));
		assert(script.includes('own?.effects?.buffs'));
		assert(script.includes('own?.effects?.hazards'));
		assert(script.includes('pokemon.effects?.individual'));
		assert(script.includes('pokemon.effects?.switchLocks'));
		assert(script.includes('rpgRuntimeFieldHUD(snapshot, own, foe)'));
		assert(!script.includes('function rpgRuntimeConditions(session)'));
		assert(!script.includes("createElement('header', 'rpg-battle-heading')"));
		assert(style.includes('.rpg-battle-hud { position: absolute;'));
		assert(style.includes('.rpg-hud-center {'));
		assert(style.includes('.rpg-hud-kind-buff'));
		assert(style.includes('.rpg-hud-kind-hazard'));
		assert(style.includes('.rpg-hud-theme-weatherrain'));
		assert(style.includes('.rpg-hud-theme-terrainelectric'));
		assert(style.includes('assets/hud/battle-effects.png'));
		assert(style.includes('background-size: 600% 600%'));
		assert(script.includes('const RPG_HUD_ICON_SPRITES = {'));
		assert(script.includes('reflect: [3, 2]'));
		assert(script.includes('cannonade: [0, 5]'));
		assert.equal(fs.readFileSync(hudSpritePath).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
	});

	it('centralizes external visual resources and keeps unverified binaries out of the RPG assets', () => {
		assert(assetConfig.includes('enableExternalShowdownAssets: true'));
		assert(assetProvider.includes("provider: enabled ? 'pokemon-showdown-external' : 'disabled'"));
		assert(assetProvider.includes("megaSymbol: enabled ? url('sprites/misc/mega.png') : null"));
		assert(assetProvider.includes("root.setProperty(property, enabled ? `url(\"${url(path)}\")` : 'none')"));
		assert(html.indexOf('asset-config.js') < html.indexOf('asset-provider.js'));
		assert(html.indexOf('asset-provider.js') < html.indexOf('showdown-animation-adapter.js'));
		assert.equal(assetManifest.external[0].bundled, false);
		assert.equal(assetManifest.external[0].temporary, true);
		assert(fs.existsSync(path.join(root, 'RPG-ASSET-POLICY.md')));
		const itemIconDirectory = path.join(root, 'server/static/rpg/assets/item-icons');
		assert(fs.existsSync(itemIconDirectory));
		assert.equal(fs.readdirSync(itemIconDirectory).filter(file => file.endsWith('.png')).length, 19);
		assert(script.includes('if (itemDetails.icon) {'));
		assert(script.includes("createElement('img', 'rpg-party-item-icon rpg-local-item-icon')"));
		assert(!fs.existsSync(path.join(root, 'server/static/rpg/assets/mega-evolution.webp')));
		assert(!fs.existsSync(path.join(root, 'server/static/rpg/battle-room.js.orig')));
		const rasterExtensions = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif']);
		const rasterFiles = [];
		const visit = directory => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const fullPath = path.join(directory, entry.name);
				if (entry.isDirectory()) visit(fullPath);
				else if (rasterExtensions.has(path.extname(entry.name).toLowerCase())) {
					rasterFiles.push(path.relative(path.join(root, 'server/static/rpg/assets'), fullPath).replace(/\\/g, '/'));
				}
			}
		};
		visit(path.join(root, 'server/static/rpg/assets'));
		assert.deepEqual(rasterFiles.sort(), assetManifest.local.map(asset => asset.path).sort());
		for (const localSource of [script, style,
			fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8'),
			fs.readFileSync(path.join(root, 'server/static/rpg/battle-ui-v2.js'), 'utf8'),
			fs.readFileSync(path.join(root, 'server/static/rpg/showdown-animation-adapter.js'), 'utf8')]) {
			assert(!localSource.includes('https://play.pokemonshowdown.com/'));
		}
	});

	it('can disable every external asset request through the central configuration', () => {
		const properties = new Map();
		const context = {
			window: { RPG_ASSET_CONFIG: { enableExternalShowdownAssets: false } },
			document: {
				baseURI: 'http://127.0.0.1:8000/rpg/',
				documentElement: { style: { setProperty(key, value) { properties.set(key, value); } } },
			},
			URL,
		};
		vm.runInNewContext(assetProvider, context);
		assert.equal(context.window.RPGAssets.external, false);
		assert.match(context.window.RPGAssets.url('sprites/gen5/pikachu.png'),
			/^http:\/\/127\.0\.0\.1:8000\/rpg\/assets\/external-disabled\//);
		assert.equal(properties.get('--rpg-asset-item-icons'), 'none');
		assert.equal(properties.get('--rpg-asset-weather-rain'), 'none');
		assert.equal(context.window.RPGAssets.megaSymbol, null);
	});

	it('preserves the recent Mega, party and flee controls after the HUD migration', () => {
		assert(script.includes('function rpgMegaPreview(preview)'));
		assert(script.includes("createElement('span', 'rpg-mega-symbol')"));
		assert(script.includes('function rpgMegaAssetSymbol()'));
		assert(script.includes('megaSymbol.append(rpgMegaAssetSymbol())'));
		assert(script.includes("const megaMarker = rpgMegaAssetSymbol()"));
		assert(style.includes('.rpg-mega-symbol .rpg-side-mega-symbol'));
		assert(style.includes('transform: translate(-2px, -2px) scale(2.35)'));
		assert(!style.includes('.rpg-mega-symbol::before'));
		assert(!script.includes('mega-evolution.webp'));
		assert(script.includes("grid.classList.add('mega-details-open')"));
		assert(script.includes("event.type === 'mega'"));
		assert(script.includes('applyMegaTransformation(event, attacker)'));
		assert(animationAdapter.includes('BattleOtherAnims.megaevo.anim'));
		assert(animationAdapter.includes('async function megaEvolve'));
		assert(script.includes("mega.addEventListener('mouseleave'"));
		assert(script.includes('if (megaDetailsOpen) {'));
		assert(!script.includes("grid.addEventListener('mouseleave'"));
		assert(script.includes('function rpgRuntimePartyCard(pokemon, onSwitch, options = {})'));
		assert(script.includes("createElement('div', 'rpg-run-confirmation')"));
		assert(script.includes("button('Voltar ao combate'"));
		assert(!script.includes("'Espaco de golpe vazio'"));
	});
	it('anchors medicine animation to an active healed target and skips reserves', () => {
		assert(script.includes("if (event.animate !== false && healingTarget)"));
		assert(script.includes("}, field, healingTarget, [healingTarget], {"));
		assert(script.includes("onImpact: () => window.RPGBattleAudio?.playEffect('heal')"));
		assert.equal(script.includes("targets.length ? targets : [attacker]"), false);
	});
	it('renders usable battle Bag items beside its tier sprite and scrolls only above eight items', () => {
		assert(!script.includes('rpg-bag-categories'));
		assert(!script.includes('rpg-bag-category'));
		assert(!script.includes("['favorites', 'Favoritos']"));
		assert(!script.includes('rpg-bag-favorite'));
		assert(!script.includes('favoriteItems'));
		assert(script.includes('rpgBattleBagItemDescription(item)'));
		assert(!script.includes('Pok' + String.fromCharCode(195)));
		assert(script.includes("const supportedCategories = ['healing', 'pp', 'status', 'ball']"));
		assert(script.includes('entry.definition.usableInBattle && supportedCategories.includes'));
		assert(script.includes('bagChoiceExists(selectedSlot)'));
		assert(script.includes("type: 'item', item: item.id, target: pokemon.position + 1"));
		assert(script.includes("type: 'capture', ball: item.id, target: target.activeSlot"));
		assert(script.includes("move: moveIndex"));
		assert(script.includes("50: { id: 'master', name: 'Mochila Cargueira Lateral' }"));
		assert(script.includes("60: { id: 'legendary'"));
		assert(script.includes("bagTierSprite.src = '/rpg/assets/bags/' + bagTier.id + '.png'"));
		assert(script.includes("if (visible.length > 8) list.classList.add('scrollable')"));
		for (const tier of ['starter', 'trainer', 'adventurer', 'expert', 'master', 'legendary']) {
			assert(fs.existsSync(path.join(root, 'server/static/rpg/assets/bags', tier + '.png')));
		}
		assert(style.includes('grid-template-columns: 172px minmax(0, 1fr)'));
		assert(style.includes('.rpg-bag-tier-panel'));
		assert(style.includes('.rpg-bag-item-list.scrollable'));
		assert(style.includes('.rpg-bag-item-row { width: 100%; min-width: 0; }'));
		assert(style.includes('width: 100%; min-width: 0; min-height: 39px'));
		assert(style.includes('.rpg-bag-item-description'));
		assert(style.includes('.rpg-bag-capture-target'));
	});
	it('renders the structured post-battle report and guarded evolution flow', () => {
		const runtime = fs.readFileSync(path.join(root, 'server/rpg-showdown/battle-runtime.ts'), 'utf8');
		const result = fs.readFileSync(path.join(root, 'sim/rpg-showdown/systems/battle/result.ts'), 'utf8');
		const http = fs.readFileSync(path.join(root, 'server/rpg-showdown/http.ts'), 'utf8');
		const dashboard = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
		assert(script.includes("rpgPostBattleBlock('Experiência')"));
		assert(script.includes("rpgPostBattleBlock('Dinheiro')"));
		assert(script.includes("rpgPostBattleBlock('Pokémon capturados')"));
		assert(script.includes("button('Ver relatório completo'"));
		assert(script.includes("button('Ir para a vis\\u00e3o geral'"));
		assert(!script.includes("['Abrir Box', 'box'"));
		assert(!script.includes("['Abrir Bag', 'bag'"));
		assert(script.includes("'/evolution'"));
		assert(script.includes("'/move-learning'"));
		assert(script.includes('showPostBattleProgression(destination)'));
		assert(script.includes('showMoveLearningPrompt(pokemonMoves, destination, nextPokemon)'));
		assert(script.includes("button('Cancelar', 'button rpg-move-learning-cancel')"));
		assert(script.includes("const options = arguments[3] || {}"));
		assert(script.includes("rpgMoveButton(presentation, -1, sideId, { staticDetails: true })"));
		assert(script.includes("createElement('h3', '', 'Novo golpe')"));
		assert(script.includes('learningMoveCard(knownMove, true, candidate.side)'));
		assert(!script.includes("button(moveName(knownMove), 'rpg-move-learning-move')"));
		assert(style.includes('.rpg-move-learning-new'));
		assert(style.includes('.rpg-move-learning-card-art .rpg-move-button'));
		assert(script.includes('newMovePanel.remove()'));
		assert(!script.includes('postBattleExitButton'));
		assert(!script.includes("button('Sair', 'button')"));
		assert(script.includes('actions.replaceChildren(proceed);'));
		assert(script.includes("createElement('div', 'rpg-evolution-light')"));
		assert(script.includes("createElement('div', 'rpg-evolution-screen-flash')"));
		assert(script.includes("createElement('div', 'rpg-evolution-particles')"));
		assert(script.includes("rpg-evolution-form source size-' + fromSizeClass"));
		assert(script.includes("rpg-evolution-form target size-' + toSizeClass"));
		assert(script.includes("playEffect('evolution')"));
		assert(script.includes('await wait(2250)'));
		assert(script.includes('await wait(1300)'));
		assert(style.includes('.rpg-result-sheet'));
		assert(style.includes('@keyframes rpg-evolution-full-flash'));
		assert(style.includes('@keyframes rpg-evolution-source-form'));
		assert(style.includes('@keyframes rpg-evolution-target-form'));
		assert(style.includes('@keyframes rpg-evolution-particle'));
		assert(runtime.includes('result.itemEvents = structuredClone(runtime.itemEvents)'));
		assert(runtime.includes('result.pokemonChanges = []'));
		assert(result.includes('evolutions: this.getEvolutionCandidates'));
		assert(http.includes("action === 'evolution'"));
		assert(http.includes("action === 'move-learning'"));
		assert(http.includes('evolution|move-learning'));
		assert(script.includes('if (isMaster || observer || !character?.id) return allowedSides;'));
		assert(script.includes("rpg-evolution-form source size-' + fromSizeClass"));
		assert(style.includes('.rpg-evolution-form.size-giant'));
		assert(script.includes("room.querySelector('.rpg-battle-field')"));
		assert(script.includes('stage.style.backgroundImage = battleField?.style.backgroundImage'));
		assert(style.includes('background-position: 50% 50%'));
		assert(style.includes('background-size: 165% auto'));
		assert(dashboard.includes('function renderPlayerBox(character)'));
		assert(dashboard.includes('async function renderPlayerBag(character)'));
	});
});
