'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('RPG official Showdown animation vendor', () => {
	it('loads the official move and shared animation catalogs together', () => {
		const root = path.resolve(__dirname, '../..');
		const context = { console };
		context.window = context;
		context.Config = { routes: { client: 'https://play.pokemonshowdown.com/' } };
		context.RPGAssets = { url: value => 'https://play.pokemonshowdown.com/' + value };
		vm.createContext(context);
		vm.runInContext(fs.readFileSync(path.join(root, 'server/static/rpg/showdown-animation-adapter.js'), 'utf8'), context);
		for (const file of ['battle-animations.js', 'battle-animations-moves.js']) {
			vm.runInContext(fs.readFileSync(path.join(root, 'server/static/rpg/vendor/showdown', file), 'utf8'), context);
		}
		assert(Object.keys(context.BattleMoveAnims).length > 600);
		assert.equal(typeof context.BattleMoveAnims.flamethrower.anim, 'function');
		assert.equal(typeof context.BattleMoveAnims.surf.anim, 'function');
		assert.equal(typeof context.BattleOtherAnims.dance.anim, 'function');
		assert.equal(typeof context.RPGShowdownAnimations.play, 'function');
		assert.equal(typeof context.RPGShowdownAnimations.summon, 'function');
		assert.equal(typeof context.RPGShowdownAnimations.wildAppear, 'function');
		assert.equal(typeof context.RPGShowdownAnimations.capture, 'function');
		assert.equal(context.RPGShowdownAnimations.hasMove('Flame Thrower'), true);
		assert.equal(context.RPGShowdownAnimations.hasMove('golpe-inexistente'), false);
		assert.notEqual(context.BattleMoveAnims.flamethrower.anim, context.BattleMoveAnims.tackle.anim);
		assert.notEqual(context.BattleMoveAnims.surf.anim, context.BattleMoveAnims.tackle.anim);
	});
	it('preserves distinct official choreography and passes every area target', () => {
		const adapter = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		const room = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(!adapter.includes('|| window.BattleMoveAnims?.tackle'));
		assert(adapter.includes('const entry = window.BattleMoveAnims?.[moveId]'));
		assert(adapter.includes('entry.anim(scene, [scene.attacker, ...scene.defenders])'));
		assert(adapter.includes('this.defenders = elements.map'));
		const officialCall = room.indexOf('await window.RPGShowdownAnimations.play(event, field, attacker, targets, {');
		const genericLunge = room.indexOf("attacker.classList.add('rpg-attack-animation'", officialCall);
		assert(officialCall >= 0);
		assert(genericLunge > officialCall, 'generic lunge must only run inside the fallback');
		assert(room.slice(officialCall, genericLunge).includes('} catch (error) {'));
	});	it('keeps field target selection defined and connected to battle commands', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(source.includes('function requestFieldTarget(config)'));
		assert(source.includes('isMaster, battleCharacter ? loadBattleBag : null, snapshot.turn)'));
		assert(source.includes("element.classList.add('rpg-valid-target')"));
		assert(source.includes("pokemon?.automaticMove"));
		assert(source.includes("queueMicrotask(() => submit({ type: 'turn', choices }))"));
		assert(source.includes('function choose(choice, slot = selectedSlot)'));
		assert(source.includes('const actingSlot = selectedSlot;'));
		assert(source.includes('activeSlot: actingSlot'));
		assert(source.includes('}, actingSlot);'));
	});
	it('uses the official summon and recall sequence on the sprite without moving its field slot', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(source.includes('x: spriteRect.left - fieldRect.left + spriteRect.width / 2'));
		assert(source.includes("transform: 'translate3d(0, -10px, 0) scale(0)'"));
		assert(source.includes("transform: 'translate3d(0, 30px, 0) scale(1)'"));
		assert(source.includes('async function recall(field, pokemonElement'));
		assert(source.includes("transform: 'translate3d(0, -40px, 0) scale(0)'"));
		assert(source.includes('anchor.sprite.animate'));
		assert(!source.includes('pokemonElement.animate'));
		assert(!source.includes('fieldRect.width + 24'));
		const recall = source.slice(source.indexOf('async function recall'), source.indexOf('async function wildAppear'));
		assert(recall.indexOf('const ballAnimation') < recall.indexOf('const spriteAnimation'));
		assert(recall.includes('delay: duration(delay + 480)'));
		const summon = source.slice(source.indexOf('async function summon'), source.indexOf('async function recall'));
		assert(summon.indexOf('await spriteAnimation.ready') <
			summon.indexOf("classList.remove('rpg-switch-in-pending')"));
	});
	it('uses the official Showdown leaf effects around each wild Pokemon', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(source.includes('async function wildAppear'));
		assert(source.includes("leaf('leaf1'"));
		assert(source.includes("leaf('leaf2'"));
		const wild = source.slice(source.indexOf('async function wildAppear'), source.indexOf('async function capture'));
		assert(wild.indexOf('await spriteAnimation.ready') <
			wild.indexOf("classList.remove('rpg-switch-in-pending')"));
	});
	it('adapts native Showdown status animations and synchronizes each residual impact', () => {
		const adapter = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		const room = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(adapter.includes("options.id === 'brn' ? 'brn'"));
		assert(adapter.includes("options.id === 'psn' || options.id === 'tox' ? 'psn'"));
		assert(adapter.includes('window.BattleStatusAnims?.[statusId]'));
		assert(adapter.includes('const reaction = surface.animate'));
		assert(adapter.includes('options.onImpact?.()'));
		assert(room.includes("event.type === 'residual'"));
		assert(room.includes("playEffect('residual')"));
		assert(room.includes('applyAnimationUpdates(event)'));
	});	it('uses the selected Showdown ball sprite and anchors capture stars to the wild target', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(source.includes('const ball = switchBall(scene, options);'));
		assert(!source.includes('switchBall(scene, options.ball || options)'));
		assert(source.includes('new RPGShowdownScene(field, actorElement, [targetElement])'));
		assert(source.includes('window.BattleOtherAnims.shiny.anim(scene, [scene.defender])'));
	});
	it('shows a terminal result even when flee ends the battle without move animations', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(source.includes("if (snapshot.status === 'ended' && !pendingAnimations.length) {"));
		assert(source.includes("if (result?.outcome === 'flee') return 'Fuga';"));
		assert(!source.includes("snapshot.status === 'ended' && !pendingAnimations.length && battleUiPhase !== 'resolving_turn'"));
	});
	it('recovers the animation queue after an individual effect fails', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(source.includes('animationQueue = animationQueue.catch(() => undefined).then(async () => {'));
		assert(source.includes("console.error('RPG battle animation failed', error)"));
		assert(source.includes("attacker.classList.add('rpg-attack-animation'"));
	});
	it('accepts battles with null weather and terrain configuration', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		assert(source.includes('fieldState.weatherDetails || rpgRuntimeLegacyHUDEffect'));
	});
	it('keeps base field geometry while applying moderate visual size scales', () => {
		const room = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		const css = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.css'), 'utf8');
		const adapter = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(room.includes("const image = sprite?.querySelector('img')"));
		assert(room.includes('const surface = image || sprite || element'));
		assert(room.includes("ring.style.width = image.offsetWidth + 'px'"));
		assert(room.includes("ring.style.height = image.offsetHeight + 'px'"));
		assert(room.includes('registered?.ring?.remove()'));
		assert(room.includes("field.addEventListener('click', onFieldTargetClick)"));
		assert(room.includes('registered.surface.getBoundingClientRect()'));
		assert(room.includes('sort((a, b) => a.distance - b.distance)'));
		assert(!room.includes("surface.addEventListener('click', handler, { once: true })"));
		assert(css.includes('.rpg-target-ring { position: absolute;'));
		assert(css.includes('.rpg-field-pokemon.rpg-valid-target .rpg-showdown-sprite img'));
		assert(!css.includes('.rpg-field-pokemon.rpg-valid-target::after'));
		assert(!css.includes('.rpg-field-pokemon.rpg-valid-target .rpg-showdown-sprite::after'));
		assert(css.includes('.rpg-field-pokemon.player .rpg-showdown-sprite { width: 330px; height: 300px; }'));
		assert(css.includes('.rpg-field-pokemon.opponent .rpg-showdown-sprite { width: 285px; height: 260px; }'));
		assert(css.includes('.rpg-battle-center { grid-template-rows: minmax(620px, 1fr) auto; }'));
		assert(css.includes('.rpg-battle-field { min-height: 620px; isolation: isolate; }'));
		assert(css.includes('.rpg-combat-side-panel { overflow: visible; }'));
		assert(css.includes('.rpg-field-pokemon.active-count-2 .rpg-showdown-sprite,'));
		assert(css.includes('.rpg-field-pokemon.active-count-3 .rpg-showdown-sprite { width: 245px; height: 225px; }'));
		assert(css.includes('.rpg-field-pokemon.size-small .rpg-showdown-sprite { scale: 1.014; }'));
		assert(css.includes('.rpg-field-pokemon.size-medium .rpg-showdown-sprite { scale: 1.17; }'));
		assert(css.includes('.rpg-field-pokemon.size-large .rpg-showdown-sprite { scale: 1.3; }'));
		assert(css.includes('.rpg-field-pokemon.size-giant .rpg-showdown-sprite { scale: 1.495; }'));
		assert(css.includes('opacity: 0 !important;'));
		assert(css.includes('animation: none !important;'));
		assert(css.includes('visibility: hidden;'));
		assert(!css.includes('animation: rpg-switch-in .42s'));
		assert(!adapter.includes('--rpg-ball-scale'));
	});
	it('falls back when an official animation produces no visual output', () => {
		const adapter = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/showdown-animation-adapter.js'), 'utf8');
		assert(adapter.includes('this.visualCount++'));
		assert(adapter.includes('if (!scene.visualCount)'));
		assert(adapter.includes('A animação não produziu efeito visual'));
	});
	it('compacts visual slots and animates fainted Pokemon without changing sprite sizes', () => {
		const room = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.js'), 'utf8');
		const css = fs.readFileSync(path.resolve(__dirname, '../../server/static/rpg/battle-room.css'), 'utf8');
		assert(room.includes('visualIndex = slotIndex'));
		assert(room.includes('slot.dataset.visualSlot = visualIndex'));
		assert(room.includes('foeFormationSize, pokemon.activeSlot ?? index'));
		assert(room.includes("event.type === 'faint'"));
		assert(room.includes("ghost.classList.add('rpg-faint-ghost')"));
		assert(css.includes('@keyframes rpg-pokemon-faint'));
		assert(css.includes('.rpg-field-pokemon.opponent.active-count-3.active-slot-0 { top: 12%; }'));
		assert(css.includes('.rpg-field-pokemon.opponent.active-count-3.active-slot-2 { top: 8%; }'));
		assert(css.includes('.rpg-field-pokemon.player.active-count-3.active-slot-0 { left: 16%; }'));
		assert(css.includes('.rpg-field-pokemon.player.active-count-3.active-slot-1 { left: 28%; }'));
		assert(css.includes('.rpg-field-pokemon.player.active-count-3.active-slot-2 { left: 40%; }'));
		assert(css.includes('.rpg-field-pokemon.opponent.active-count-3.active-slot-0 { right: 40%; }'));
		assert(css.includes('.rpg-field-pokemon.opponent.active-count-3.active-slot-1 { right: 28%; }'));
		assert(css.includes('.rpg-field-pokemon.opponent.active-count-3.active-slot-2 { right: 16%; }'));
		assert(css.includes('.rpg-field-pokemon.opponent .rpg-showdown-sprite { width: 285px; height: 260px; }'));
		assert(css.includes('.rpg-battle-center { grid-template-rows: minmax(620px, 1fr) auto; }'));
		assert(css.includes('.rpg-battle-field { min-height: 620px; isolation: isolate; }'));
		assert(css.includes('.rpg-combat-side-panel { overflow: visible; }'));
	});
	it('executes official physical, special, status, and area choreography on real field anchors', async () => {
		const animations = [];
		class FakeElement {
			constructor(tagName = 'div', rect = { left: 0, top: 0, width: 0, height: 0 }) {
				this.tagName = tagName.toUpperCase();
				this.children = [];
				this.parent = null;
				this.style = {};
				this.className = '';
				this.rect = rect;
				this.classList = { contains: name => this.className.split(/\s+/).includes(name) };
			}
			append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
			remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
			querySelector(selector) {
				const wantsImage = selector.includes('img');
				const wantsSprite = selector.includes('.rpg-showdown-sprite');
				const visit = node => {
					if ((!wantsImage || node.tagName === 'IMG') && (!wantsSprite || selector.includes('img') || node.classList.contains('rpg-showdown-sprite'))) return node;
					for (const child of node.children) { const match = visit(child); if (match) return match; }
					return null;
				};
				return visit(this);
			}
			getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
			animate(keyframes, options) {
				animations.push({ element: this, keyframes, options });
				return { cancel() {} };
			}
		}
		const fakeDocument = { createElement: tag => new FakeElement(tag) };
		const context = { console, document: fakeDocument, setTimeout, clearTimeout, RPG_SHOWDOWN_ANIMATION_TIME_SCALE: 0.001 };
		context.window = context;
		context.Config = { routes: { client: 'https://play.pokemonshowdown.com/' } };
		context.RPGAssets = { url: value => 'https://play.pokemonshowdown.com/' + value };
		vm.createContext(context);
		const root = path.resolve(__dirname, '../..');
		vm.runInContext(fs.readFileSync(path.join(root, 'server/static/rpg/showdown-animation-adapter.js'), 'utf8'), context);
		for (const file of ['battle-animations.js', 'battle-animations-moves.js']) {
			vm.runInContext(fs.readFileSync(path.join(root, 'server/static/rpg/vendor/showdown', file), 'utf8'), context);
		}
		const field = new FakeElement('div', { left: 100, top: 50, width: 960, height: 620 });
		const makePokemon = (side, rect) => {
			const slot = new FakeElement('div', rect);
			slot.className = 'rpg-field-pokemon ' + side;
			const sprite = new FakeElement('span', rect);
			sprite.className = 'rpg-showdown-sprite';
			const image = new FakeElement('img', rect);
			image.src = side + '.png';
			image.currentSrc = image.src;
			image.naturalWidth = 160;
			image.naturalHeight = 160;
			sprite.append(image);
			slot.append(sprite);
			return { slot, sprite };
		};
		const attacker = makePokemon('player', { left: 260, top: 420, width: 210, height: 180 });
		const targetA = makePokemon('opponent', { left: 710, top: 160, width: 150, height: 140 });
		const targetB = makePokemon('opponent', { left: 850, top: 175, width: 140, height: 130 });
		for (const moveId of ['tackle', 'flamethrower', 'swordsdance', 'surf']) {
			animations.length = 0;
			await context.RPGShowdownAnimations.play({ move: { id: moveId } }, field, attacker.slot, [targetA.slot, targetB.slot]);
			assert(animations.length > 0, moveId + ' must create browser animations');
			for (const animation of animations) {
				for (const frame of animation.keyframes) {
					if (frame.left !== undefined) assert.match(frame.left, /px$/, moveId + ' effect coordinates must include CSS units');
					if (frame.top !== undefined) assert.match(frame.top, /px$/, moveId + ' effect coordinates must include CSS units');
				}
			}
			if (moveId === 'tackle') assert(animations.some(entry => entry.element === attacker.sprite));
		}
		const incompatible = [];
		for (const [moveId, entry] of Object.entries(context.BattleMoveAnims)) {
			if (typeof entry?.anim !== 'function') continue;
			animations.length = 0;
			try {
				await context.RPGShowdownAnimations.play({ move: { id: moveId } }, field, attacker.slot, [targetA.slot, targetB.slot]);
			} catch (error) {
				// Algumas entradas oficiais são marcadores vazios; o Showdown as representa pelo HUD, não por coreografia.
				if (!/produced no visual output|não produziu efeito visual/.test(error.message)) {
					incompatible.push(moveId + ': ' + error.message);
				}
			}
		}
		assert.deepEqual(incompatible, [], 'every official move choreography must be compatible with the RPG scene');
	});
});
