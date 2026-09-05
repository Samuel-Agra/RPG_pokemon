'use strict';

/* global window, document */

/* Bridge for the Pokemon Showdown BattleMoveAnims choreography. */
window.Config = window.Config || { routes: { client: window.RPGAssets.host } };
if (!window.$) {
	const jqueryCompatibility = () => ({
		css() { return this; }, animate() { return this; }, delay() { return this; }, append() { return this; },
		children() { return this; }, last() { return this; }, remove() { return this; }, queue() { return []; },
	});
	jqueryCompatibility.easing = {};
	jqueryCompatibility.fx = { off: false };
	window.$ = window.jQuery = jqueryCompatibility;
}

(function () {
	const configuredTimeScale = Number(window.RPG_SHOWDOWN_ANIMATION_TIME_SCALE);
	const TIME_SCALE = Number.isFinite(configuredTimeScale) && configuredTimeScale > 0 ? configuredTimeScale : 1.65;
	const FX_ROOT = window.RPGAssets.url('fx/');
	const easing = transition => {
		if (transition === 'accel') return 'ease-in';
		if (transition === 'decel') return 'ease-out';
		if (transition === 'linear') return 'linear';
		if (transition === 'swing') return 'cubic-bezier(.42,0,.58,1)';
		if (transition === 'ballistic' || transition === 'ballistic2') return 'cubic-bezier(.2,.8,.35,1)';
		if (transition === 'ballisticUnder') return 'cubic-bezier(.65,0,.8,.35)';
		return 'ease-in-out';
	};
	const duration = value => Math.max(1, Math.round(value * TIME_SCALE));

	class RPGShowdownSprite {
		constructor(scene, element, isFrontSprite) {
			this.scene = scene;
			this.slotElement = element;
			this.element = element.querySelector('.rpg-showdown-sprite') || element;
			this.isFrontSprite = isFrontSprite;
			this.isMissedPokemon = false;
			const anchor = scene.canonicalAnchor(element, isFrontSprite);
			this.x = anchor.x;
			this.y = anchor.y;
			this.z = anchor.z;
			this.cursor = 0;
			this.current = { x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1 };
			this.segments = [];
			const image = this.element.querySelector('img') || element.querySelector('img');
			this.sp = { url: image?.currentSrc || image?.src || '', w: image?.naturalWidth || 160, h: image?.naturalHeight || 160 };
			this.sprite = this;
		}
		leftof(offset) { return this.x + (this.isFrontSprite ? 1 : -1) * offset; }
		behind(offset) { return this.z + (this.isFrontSprite ? 1 : -1) * offset; }
		delay(time) {
			this.cursor = Math.max(this.cursor, this.scene.timeOffset) + time;
			this.scene.note(this.cursor);
			return this;
		}
		anim(end = {}, transition) {
			this.scene.visualCount++;
			const startAt = Math.max(this.cursor, this.scene.timeOffset);
			const runFor = end.time === undefined ? 500 : end.time;
			const base = { x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1 };
			const destination = { ...base, ...end };
			this.segments.push({
				start: startAt,
				end: startAt + runFor,
				from: { ...this.current },
				to: destination,
				easing: easing(transition),
			});
			this.current = destination;
			this.cursor = startAt + runFor;
			this.scene.note(this.cursor);
			return this;
		}
		play(totalTime) {
			if (!this.segments.length) return;
			const frames = [];
			let previousTime = 0;
			let previousState = { x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1 };
			const appendFrame = (time, state, frameEasing) => {
				const delta = this.scene.spriteDelta(state, this);
				const offset = Math.max(0, Math.min(1, time / totalTime));
				const frame = {
					offset,
					transform: `translate3d(${delta.x}px, ${delta.y}px, 0) scale(${delta.scale})`,
					opacity: delta.opacity,
				};
				if (frameEasing) frame.easing = frameEasing;
				const last = frames[frames.length - 1];
				if (last?.offset === offset) frames[frames.length - 1] = frame;
				else frames.push(frame);
			};
			appendFrame(0, previousState);
			for (const segment of this.segments) {
				if (segment.start > previousTime) appendFrame(segment.start, previousState);
				appendFrame(segment.start, segment.from, segment.easing);
				appendFrame(segment.end, segment.to);
				previousTime = segment.end;
				previousState = segment.to;
			}
			if (previousTime < totalTime) appendFrame(totalTime, previousState);
			const animation = this.element.animate(frames, {
				duration: duration(totalTime),
				easing: 'linear',
				fill: 'both',
			});
			this.scene.animations.push(animation);
		}
	}
	class RPGShowdownScene {
		constructor(field, attackerElement, targetElements = []) {
			this.field = field;
			this.timeOffset = 0;
			this.maxTime = 0;
			this.animations = [];
			this.effectHandles = [];
			this.backgroundEffects = [];
			this.cameraSegments = [];
			this.visualCount = 0;
			this.layer = document.createElement('div');
			this.layer.className = 'rpg-showdown-fx-layer';
			field.append(this.layer);
			this.attacker = new RPGShowdownSprite(this, attackerElement, attackerElement.classList.contains('opponent'));
			const elements = targetElements?.length ? targetElements : [attackerElement];
			this.defenders = elements.map(element => new RPGShowdownSprite(this, element, element.classList.contains('opponent')));
			this.defender = this.defenders[0];
			this.sprites = [this.attacker, ...this.defenders];
			this.battle = { mySide: { x: this.attacker.x, y: this.attacker.y, z: this.attacker.z, active: [] } };
			this.$bg = this.backgroundQueue();
		}
		note(time) { this.maxTime = Math.max(this.maxTime, Number(time) || 0); }
		wait(time) { this.timeOffset += Number(time) || 0; this.note(this.timeOffset); }
		geometry() {
			const rect = this.field.getBoundingClientRect();
			const canvasScale = Math.max(0.01, Math.min(rect.width / 640, rect.height / 360));
			return {
				rect,
				canvasScale,
				offsetX: (rect.width - 640 * canvasScale) / 2,
				offsetY: (rect.height - 360 * canvasScale) / 2,
			};
		}
		perspective(z, data = {}) {
			return Math.max(0.1, data.gen === 5 ? 2 - z / 200 : 1.5 - 0.5 * z / 200);
		}
		canonicalAnchor(element, isFrontSprite) {
			const geometry = this.geometry();
			const visual = element.querySelector('.rpg-showdown-sprite img') ||
				element.querySelector('.rpg-showdown-sprite') || element.querySelector('img') || element;
			const visualRect = visual.getBoundingClientRect();
			const centerX = visualRect.left - geometry.rect.left + visualRect.width / 2;
			const centerY = visualRect.top - geometry.rect.top + visualRect.height / 2;
			const z = isFrontSprite ? 100 : 0;
			const perspective = this.perspective(z);
			const canonicalX = (centerX - geometry.offsetX) / geometry.canvasScale;
			const canonicalY = (centerY - geometry.offsetY) / geometry.canvasScale;
			return {
				x: (canonicalX - (210 + 220 * z / 200)) / perspective,
				y: ((245 - 110 * z / 200) - canonicalY) / perspective,
				z,
			};
		}
		coordNumbers(loc = {}, data = { w: 100, h: 100 }) {
			const geometry = this.geometry();
			const z = Number(loc.z) || 0;
			const perspective = this.perspective(z, data);
			const xscale = loc.xscale ?? loc.scale ?? 1;
			const yscale = loc.yscale ?? loc.scale ?? 1;
			const left = 210 + 220 * z / 200 + (Number(loc.x) || 0) * perspective;
			const top = 245 - 110 * z / 200 - (Number(loc.y) || 0) * perspective;
			const width = (data.w || 100) * perspective * xscale;
			const height = (data.h || 100) * perspective * yscale;
			return {
				left: geometry.offsetX + (left - width / 2) * geometry.canvasScale,
				top: geometry.offsetY + (top - height / 2) * geometry.canvasScale,
				width: width * geometry.canvasScale,
				height: height * geometry.canvasScale,
				opacity: loc.opacity ?? 1,
			};
		}
		cssFrame(frame) {
			return {
				left: `${frame.left}px`,
				top: `${frame.top}px`,
				width: `${frame.width}px`,
				height: `${frame.height}px`,
				opacity: frame.opacity,
			};
		}
		spriteDelta(loc, sprite) {
			const origin = this.coordNumbers({ x: sprite.x, y: sprite.y, z: sprite.z }, { w: 1, h: 1 });
			const destination = this.coordNumbers(loc, { w: 1, h: 1 });
			return {
				x: destination.left - origin.left,
				y: destination.top - origin.top,
				scale: loc.scale ?? 1,
				opacity: loc.opacity ?? 1,
			};
		}
		resolveEffect(effect) {
			const data = typeof effect === 'string' ? (window.BattleEffects?.[effect] || { url: effect + '.png', w: 100, h: 100 }) : effect;
			let url = data?.url || '';
			if (url && !/^https?:/i.test(url) && !url.startsWith('data:')) url = FX_ROOT + url.replace(/^\//, '');
			return { ...data, url };
		}
		showEffect(effect, start = {}, end = {}, transition, after, additionalCss) {
			this.visualCount++;
			const data = this.resolveEffect(effect);
			const image = document.createElement('img');
			image.className = 'rpg-showdown-fx';
			image.src = data.url;
			image.style.opacity = '0';
			if (additionalCss) Object.assign(image.style, additionalCss);
			this.layer.append(image);
			const handle = { element: image, data, current: start, segments: [] };
			this.effectHandles.push(handle);
			return this.animateEffect(handle, data, start, end, transition, after, additionalCss);
		}
		animateEffect(handle, effect, start = {}, end = {}, transition, after, additionalCss) {
			const data = this.resolveEffect(effect);
			const element = handle.element || handle;
			if (additionalCss) Object.assign(element.style, additionalCss);
			if (!handle.segments) {
				handle = { element, data, current: start, segments: [] };
				this.effectHandles.push(handle);
			}
			const startTime = (Number(start.time) || 0) + this.timeOffset;
			const endTime = (end.time === undefined ? (Number(start.time) || 0) + 500 : Number(end.time)) + this.timeOffset;
			const mergedEnd = { ...start, ...end };
			const from = this.coordNumbers(start, data);
			const to = this.coordNumbers(mergedEnd, data);
			const final = { ...to };
			if (after === 'fade' || after === 'gone') final.opacity = 0;
			if (after === 'explode') {
				final.left -= final.width;
				final.top -= final.height;
				final.width *= 3;
				final.height *= 3;
				final.opacity = 0;
			}
			handle.segments.push({ start: startTime, end: endTime, from, to, final, after, easing: easing(transition) });
			handle.current = mergedEnd;
			this.note(endTime + (after ? 100 : 0));
			return handle;
		}
		playEffect(handle, totalTime) {
			const frames = [{ offset: 0, opacity: 0 }];
			for (const segment of handle.segments) {
				const startOffset = Math.max(0, Math.min(1, segment.start / totalTime));
				const endOffset = Math.max(startOffset, Math.min(1, segment.end / totalTime));
				frames.push({ ...this.cssFrame(segment.from), offset: startOffset, easing: segment.easing });
				frames.push({ ...this.cssFrame(segment.to), offset: endOffset });
				if (segment.after) {
					frames.push({ ...this.cssFrame(segment.final), offset: Math.min(1, (segment.end + 100) / totalTime) });
				}
			}
			frames.sort((a, b) => a.offset - b.offset);
			const animation = handle.element.animate(frames, { duration: duration(totalTime), easing: 'linear', fill: 'both' });
			this.animations.push(animation);
		}
		backgroundEffect(background, runFor, opacity = 1, delay = 0) {
			this.visualCount++;
			const effect = document.createElement('div');
			effect.className = 'rpg-showdown-background-fx';
			effect.style.background = background;
			this.layer.append(effect);
			const start = this.timeOffset + delay;
			const end = start + runFor + 500;
			this.backgroundEffects.push({ effect, start, runFor, end, opacity });
			this.note(end);
		}
		backgroundQueue() {
			let cursor = 0;
			const api = {
				delay: time => { cursor += Number(time) || 0; this.note(cursor); return api; },
				animate: (styles, time = 400) => {
					const start = cursor;
					cursor += Number(time) || 0;
					this.cameraSegments.push({ start, end: cursor, styles: { ...styles } });
					this.visualCount++;
					this.note(cursor);
					return api;
				},
			};
			return api;
		}
		playBackgrounds(totalTime) {
			for (const entry of this.backgroundEffects) {
				const animation = entry.effect.animate([
					{ opacity: 0, offset: 0 },
					{ opacity: 0, offset: entry.start / totalTime },
					{ opacity: entry.opacity, offset: Math.min(1, (entry.start + 100) / totalTime) },
					{ opacity: entry.opacity, offset: Math.min(1, (entry.start + entry.runFor) / totalTime) },
					{ opacity: 0, offset: Math.min(1, entry.end / totalTime) },
				], { duration: duration(totalTime), easing: 'linear', fill: 'both' });
				this.animations.push(animation);
			}
			if (!this.cameraSegments.length) return;
			const frames = [{ offset: 0, transform: 'translate3d(0, 0, 0)' }];
			let lastY = 0;
			for (const segment of this.cameraSegments) {
				frames.push({ offset: segment.start / totalTime, transform: `translate3d(0, ${lastY}px, 0)` });
				lastY = Number(segment.styles.top ?? -90) + 90;
				frames.push({ offset: segment.end / totalTime, transform: `translate3d(0, ${lastY}px, 0)` });
			}
			frames.push({ offset: 1, transform: 'translate3d(0, 0, 0)' });
			const animation = this.field.animate(frames, { duration: duration(totalTime), easing: 'linear', fill: 'both' });
			this.animations.push(animation);
		}
		play() {
			const totalTime = Math.max(900, this.maxTime + 250);
			for (const sprite of this.sprites) sprite.play(totalTime);
			for (const effect of this.effectHandles) this.playEffect(effect, totalTime);
			this.playBackgrounds(totalTime);
			return totalTime;
		}
		cleanup() {
			for (const animation of this.animations) {
				try { animation.cancel(); } catch {}
			}
			this.layer.remove();
		}
	}
	function ballPosition(spritenum) {
		return { left: -((spritenum % 16) * 24), top: -(Math.floor(spritenum / 16) * 24) };
	}
	function switchBall(scene, options = {}) {
		const ball = document.createElement('i');
		ball.className = 'rpg-official-ball-sprite ball-' + (options.ball || 'pokeball');
		const sheet = ballPosition(Number(options.ballSprite) || 0);
		ball.style.backgroundPosition = `${sheet.left}px ${sheet.top}px`;
		scene.layer.append(ball);
		return ball;
	}
	function switchAnchor(field, pokemonElement) {
		const fieldRect = field.getBoundingClientRect();
		const sprite = pokemonElement.querySelector('.rpg-showdown-sprite') || pokemonElement;
		const spriteImage = sprite.querySelector('img') || sprite;
		const spriteRect = spriteImage.getBoundingClientRect();
		return {
			sprite,
			x: spriteRect.left - fieldRect.left + spriteRect.width / 2,
			y: spriteRect.top - fieldRect.top + spriteRect.height / 2,
		};
	}
	async function summon(field, pokemonElement, options = {}) {
		const scene = new RPGShowdownScene(field, pokemonElement, pokemonElement);
		const delay = Number(options.delay) || 0;
		const anchor = switchAnchor(field, pokemonElement);
		const ball = switchBall(scene, options);
		anchor.sprite.style.opacity = '0';
		const ballAnimation = ball.animate([
			{ left: `${anchor.x - 12}px`, top: `${anchor.y + 18}px`, opacity: 0, transform: 'scale(.7)' },
			{ left: `${anchor.x - 12}px`, top: `${anchor.y - 22}px`, opacity: 1, transform: 'scale(1)', offset: 0.62 },
			{ left: `${anchor.x - 12}px`, top: `${anchor.y - 22}px`, opacity: 0, transform: 'scale(1.15)' },
		], { duration: duration(480), delay: duration(delay), easing: easing('ballistic2'), fill: 'both' });
		const spriteAnimation = anchor.sprite.animate([
			{ transform: 'translate3d(0, -10px, 0) scale(0)', opacity: 0 },
			{ transform: 'translate3d(0, -10px, 0) scale(0)', opacity: 0, offset: 0.3 },
			{ transform: 'translate3d(0, 30px, 0) scale(1)', opacity: 1, offset: 0.7 },
			{ transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
		], { duration: duration(1000), delay: duration(delay), easing: 'ease-out', fill: 'both' });
		await spriteAnimation.ready.catch(() => undefined);
		pokemonElement.classList.remove('rpg-switch-in-pending');
		anchor.sprite.style.removeProperty('opacity');
		await new Promise(resolve => { setTimeout(resolve, duration(delay + 1050)); });
		try { ballAnimation.cancel(); } catch {}
		try { spriteAnimation.cancel(); } catch {}
		ball.remove();
		scene.layer.remove();
	}
	async function recall(field, pokemonElement, options = {}) {
		const scene = new RPGShowdownScene(field, pokemonElement, pokemonElement);
		const delay = Number(options.delay) || 0;
		const anchor = switchAnchor(field, pokemonElement);
		const ball = switchBall(scene, options);
		const opponent = pokemonElement.classList.contains('opponent');
		const ballAnimation = ball.animate([
			{
				left: `${anchor.x + (opponent ? 125 : -125) - 12}px`,
				top: `${anchor.y + (opponent ? -85 : 85) - 12}px`,
				opacity: 0,
				transform: `rotate(${opponent ? 25 : -25}deg) scale(.75)`,
			},
			{
				left: `${anchor.x - 12}px`, top: `${anchor.y - 12}px`,
				opacity: 1, transform: `rotate(${opponent ? -390 : 390}deg) scale(1)`,
			},
		], { duration: duration(520), delay: duration(delay), easing: easing('ballistic2'), fill: 'both' });
		const spriteAnimation = anchor.sprite.animate([
			{ transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
			{ transform: 'translate3d(0, -12px, 0) scale(.72)', opacity: 0.85, filter: 'brightness(2.2)', offset: 0.35 },
			{ transform: 'translate3d(0, -40px, 0) scale(0)', opacity: 0, filter: 'brightness(3)' },
		], { duration: duration(400), delay: duration(delay + 480), easing: 'ease-in', fill: 'both' });
		const closeAnimation = ball.animate([
			{ left: `${anchor.x - 12}px`, top: `${anchor.y - 12}px`, opacity: 1, transform: 'scale(1)' },
			{ left: `${anchor.x - 12}px`, top: `${anchor.y + 10}px`, opacity: 0, transform: 'scale(.7)' },
		], { duration: duration(300), delay: duration(delay + 690), easing: 'ease-in', fill: 'both' });
		await new Promise(resolve => { setTimeout(resolve, duration(delay + 1020)); });
		try { spriteAnimation.cancel(); } catch {}
		try { ballAnimation.cancel(); } catch {}
		try { closeAnimation.cancel(); } catch {}
		ball.remove();
		scene.layer.remove();
		pokemonElement.remove();
	}
	async function wildAppear(field, pokemonElement, options = {}) {
		const scene = new RPGShowdownScene(field, pokemonElement, pokemonElement);
		const delay = Number(options.delay) || 0;
		const anchor = switchAnchor(field, pokemonElement);
		anchor.sprite.style.opacity = '0';
		const spriteAnimation = anchor.sprite.animate([
			{ transform: 'translate3d(0, 18px, 0) scale(.88)', opacity: 0 },
			{ transform: 'translate3d(0, -5px, 0) scale(1.03)', opacity: 1, offset: 0.72 },
			{ transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
		], { duration: duration(760), delay: duration(delay), easing: 'ease-out', fill: 'both' });
		await spriteAnimation.ready.catch(() => undefined);
		pokemonElement.classList.remove('rpg-switch-in-pending');
		anchor.sprite.style.removeProperty('opacity');
		const leaf = (effect, x, y, rotation, leafDelay) => scene.showEffect(effect, {
			x: scene.attacker.x + x, y: scene.attacker.y + y, z: scene.attacker.z,
			scale: 0.55, opacity: 0, time: delay + leafDelay,
		}, {
			x: scene.attacker.x + x * 1.6, y: scene.attacker.y + y + 42, z: scene.attacker.z,
			scale: 0.85, opacity: 1, time: delay + leafDelay + 380,
		}, 'decel', 'fade', { transform: `rotate(${rotation}deg)` });
		leaf('leaf1', -28, -18, -35, 0);
		leaf('leaf2', 24, -12, 32, 70);
		leaf('leaf2', -8, -30, 12, 140);
		leaf('leaf1', 38, -22, 48, 210);
		const effectTime = scene.play();
		await new Promise(resolve => setTimeout(resolve, Math.max(duration(delay + 810), duration(effectTime + 60))));
		try { spriteAnimation.cancel(); } catch {}
		scene.cleanup();
	}
	async function megaEvolve(field, pokemonElement, options = {}) {
		const scene = new RPGShowdownScene(field, pokemonElement, [pokemonElement]);
		const oldSurface = pokemonElement.querySelector('.rpg-showdown-sprite') || pokemonElement;
		try {
			if (!window.BattleOtherAnims?.megaevo?.anim) {
				throw new Error('Animacao Mega do Showdown indisponivel');
			}
			window.BattleOtherAnims.megaevo.anim(scene, [scene.attacker]);
			const effectTime = scene.play();
			const collapse = oldSurface.animate([
				{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
				{ transform: 'scale(.05)', opacity: 0.35, filter: 'brightness(8)' },
			], { duration: duration(300), easing: 'ease-in', fill: 'forwards' });
			await new Promise(resolve => setTimeout(resolve, duration(300)));
			try { collapse.cancel(); } catch {}
			const nextSurface = options.onTransform?.() ||
				pokemonElement.querySelector('.rpg-showdown-sprite') || pokemonElement;
			const reveal = nextSurface.animate([
				{ transform: 'scale(.05)', opacity: 0.35, filter: 'brightness(8)' },
				{ transform: 'scale(1.08)', opacity: 1, filter: 'brightness(1.5)', offset: 0.78 },
				{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
			], { duration: duration(360), easing: 'ease-out', fill: 'both' });
			await new Promise(resolve => setTimeout(resolve, Math.max(duration(390), duration(effectTime - 300 + 80))));
			try { reveal.cancel(); } catch {}
		} finally {
			scene.cleanup();
		}
	}
	async function residual(field, pokemonElement, options = {}) {
		if (!pokemonElement) return;
		const scene = new RPGShowdownScene(field, pokemonElement, [pokemonElement]);
		const moveId = String(options.moveId || 'toxic').toLowerCase().replace(/[^a-z0-9]+/g, '');
		const surface = pokemonElement.querySelector('.rpg-showdown-sprite img') ||
			pokemonElement.querySelector('.rpg-showdown-sprite') || pokemonElement;
		const tintByTheme = {
			burn: 'brightness(.82) sepia(1) saturate(8) hue-rotate(330deg)',
			poison: 'brightness(.76) sepia(.9) saturate(6) hue-rotate(225deg)',
			toxic: 'brightness(.68) sepia(1) saturate(7) hue-rotate(220deg)',
			grass: 'brightness(.8) sepia(.8) saturate(5) hue-rotate(72deg)',
			water: 'brightness(.82) sepia(.7) saturate(5) hue-rotate(155deg)',
			ice: 'brightness(1.18) sepia(.45) saturate(3) hue-rotate(155deg)',
			sand: 'brightness(.84) sepia(.85) saturate(3) hue-rotate(12deg)',
			rock: 'brightness(.72) sepia(.65) saturate(2.4) hue-rotate(8deg)',
			ghost: 'brightness(.62) sepia(.7) saturate(5) hue-rotate(225deg)',
			dark: 'brightness(.5) saturate(.75)',
			electric: 'brightness(1.15) sepia(1) saturate(7) hue-rotate(20deg)',
			salt: 'brightness(1.42) saturate(.2)',
			neutral: 'brightness(.72) saturate(1.4)',
		};
		try {
			const statusId = options.id === 'brn' ? 'brn' :
				(options.id === 'psn' || options.id === 'tox' ? 'psn' : '');
			const statusEntry = statusId ? window.BattleStatusAnims?.[statusId] : null;
			if (statusEntry?.anim) {
				statusEntry.anim(scene, [scene.attacker]);
			} else {
				let entry = window.BattleMoveAnims?.[moveId];
				if (!entry?.anim) entry = window.BattleMoveAnims?.toxic;
				if (!entry?.anim) throw new Error('Animação residual indisponível');
				entry.anim(scene, [scene.attacker, scene.defender]);
			}
			if (!scene.visualCount) {
				window.BattleStatusAnims?.psn?.anim?.(scene, [scene.attacker]);
			}
			const totalTime = Math.max(650, scene.play());
			const tint = tintByTheme[options.theme] || tintByTheme.neutral;
			const glow = options.color || '#d96a6a';
			const reaction = surface.animate([
				{ transform: 'translate3d(0, 0, 0) rotate(0)', filter: 'none' },
				{ transform: 'translate3d(-9px, 2px, 0) rotate(-2deg)', filter: `${tint} drop-shadow(0 0 15px ${glow})`, offset: 0.22 },
				{ transform: 'translate3d(8px, -2px, 0) rotate(2deg)', filter: `${tint} drop-shadow(0 0 20px ${glow})`, offset: 0.42 },
				{ transform: 'translate3d(-5px, 1px, 0) rotate(-1deg)', filter: `${tint} drop-shadow(0 0 12px ${glow})`, offset: 0.62 },
				{ transform: 'translate3d(0, 0, 0) rotate(0)', filter: 'none' },
			], { duration: duration(totalTime), easing: 'ease-in-out', fill: 'both' });
			const impactAt = duration(Math.min(520, Math.max(240, totalTime * 0.45)));
			const impact = new Promise(resolve => setTimeout(() => {
				try { options.onImpact?.(); } finally { resolve(); }
			}, impactAt));
			await Promise.all([
				new Promise(resolve => setTimeout(resolve, duration(totalTime + 80))),
				impact,
			]);
			try { reaction.cancel(); } catch {}
		} finally {
			scene.cleanup();
		}
	}

	async function capture(field, actorElement, targetElement, options = {}) {
		if (!actorElement || !targetElement) return;
		const scene = new RPGShowdownScene(field, actorElement, [targetElement]);
		const actor = switchAnchor(field, actorElement);
		const target = switchAnchor(field, targetElement);
		const ball = switchBall(scene, options);
		const ballLeft = value => `${value - 12}px`;
		const ballTop = value => `${value - 12}px`;
		options.onThrow?.();
		const throwAnimation = ball.animate([
			{ left: ballLeft(actor.x), top: ballTop(actor.y - 10), opacity: 0, transform: 'rotate(-20deg) scale(.8)' },
			{ left: ballLeft((actor.x + target.x) / 2), top: ballTop(Math.min(actor.y, target.y) - 105), opacity: 1,
				transform: 'rotate(420deg) scale(1.15)', offset: 0.55 },
			{ left: ballLeft(target.x), top: ballTop(target.y - 12), opacity: 1, transform: 'rotate(760deg) scale(1)' },
		], { duration: duration(760), easing: easing('ballistic2'), fill: 'both' });
		await new Promise(resolve => setTimeout(resolve, duration(790)));
		options.onClose?.();
		const absorbAnimation = target.sprite.animate([
			{ transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
			{ transform: 'translate3d(0, -28px, 0) scale(.45)', opacity: 0.78, filter: 'brightness(2.4)', offset: 0.45 },
			{ transform: 'translate3d(0, -42px, 0) scale(0)', opacity: 0, filter: 'brightness(3)' },
		], { duration: duration(520), easing: 'ease-in', fill: 'both' });
		const dropAnimation = ball.animate([
			{ left: ballLeft(target.x), top: ballTop(target.y - 12), opacity: 1, transform: 'rotate(0deg)' },
			{ left: ballLeft(target.x), top: ballTop(target.y + 28), opacity: 1, transform: 'rotate(95deg)' },
		], { duration: duration(520), easing: 'ease-in', fill: 'both' });
		await new Promise(resolve => setTimeout(resolve, duration(550)));
		const shakes = Math.max(0, Math.min(4, Number(options.shakes) || 0));
		for (let shake = 0; shake < shakes; shake++) {
			options.onShake?.(shake);
			const shakeAnimation = ball.animate([
				{ left: ballLeft(target.x), top: ballTop(target.y + 28), transform: 'rotate(0deg)' },
				{ left: ballLeft(target.x - 9), top: ballTop(target.y + 27), transform: 'rotate(-24deg)', offset: 0.25 },
				{ left: ballLeft(target.x + 9), top: ballTop(target.y + 27), transform: 'rotate(24deg)', offset: 0.72 },
				{ left: ballLeft(target.x), top: ballTop(target.y + 28), transform: 'rotate(0deg)' },
			], { duration: duration(360), easing: 'ease-in-out', fill: 'both' });
			await new Promise(resolve => setTimeout(resolve, duration(410)));
			try { shakeAnimation.cancel(); } catch {}
		}
		if (options.success) {
			try {
				options.onSuccess?.();
				if (window.BattleOtherAnims?.shiny?.anim) {
					window.BattleOtherAnims.shiny.anim(scene, [scene.defender]);
					const shineTime = scene.play();
					await new Promise(resolve => setTimeout(resolve, duration(shineTime + 60)));
				}
			} finally {
				target.sprite.style.visibility = 'hidden';
				await ball.animate([
					{ left: ballLeft(target.x), top: ballTop(target.y + 28), opacity: 1, transform: 'scale(1)' },
					{ left: ballLeft(target.x), top: ballTop(target.y + 38), opacity: 0, transform: 'scale(.5)' },
				], { duration: duration(430), easing: 'ease-in', fill: 'forwards' }).finished.catch(() => undefined);
			}
		} else {
			options.onFailure?.();
			const escapeAnimation = target.sprite.animate([
				{ transform: 'translate3d(0, -42px, 0) scale(0)', opacity: 0, filter: 'brightness(3)' },
				{ transform: 'translate3d(0, 24px, 0) scale(1.08)', opacity: 1, filter: 'brightness(1.5)', offset: 0.72 },
				{ transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
			], { duration: duration(850), easing: 'ease-out', fill: 'both' });
			const ballOpen = ball.animate([
				{ left: ballLeft(target.x), top: ballTop(target.y + 28), opacity: 1, transform: 'scale(1)' },
				{ left: ballLeft(target.x), top: ballTop(target.y - 5), opacity: 0, transform: 'scale(1.35)' },
			], { duration: duration(430), easing: 'ease-out', fill: 'both' });
			await new Promise(resolve => setTimeout(resolve, duration(900)));
			try { escapeAnimation.cancel(); } catch {}
			try { ballOpen.cancel(); } catch {}
		}
		try { throwAnimation.cancel(); } catch {}
		try { absorbAnimation.cancel(); } catch {}
		try { dropAnimation.cancel(); } catch {}
		ball.remove();
		scene.cleanup();
	}
	window.RPGShowdownAnimations = {
		summon, recall, wildAppear, megaEvolve, residual, capture,
		hasMove(moveId) {
			return !!window.BattleMoveAnims?.[String(moveId || '').toLowerCase().replace(/[^a-z0-9]+/g, '')]?.anim;
		},
		async play(event, field, attackerElement, targetElements = [], options = {}) {
			const moveId = String(event.move.id || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
			const scene = new RPGShowdownScene(field, attackerElement, targetElements);
			try {
				const entry = window.BattleMoveAnims?.[moveId];
				if (!entry?.anim) throw new Error('Animação indisponível para ' + (moveId || 'golpe desconhecido'));
				entry.anim(scene, [scene.attacker, ...scene.defenders]);
				if (!scene.visualCount) throw new Error('A animação não produziu efeito visual');
				const totalTime = scene.play();
				const impactAt = duration(Math.min(900, Math.max(180, totalTime * 0.55)));
				const impact = !options.onImpact ? Promise.resolve() : new Promise(resolve => setTimeout(() => {
					try { options.onImpact?.(); } finally { resolve(); }
				}, impactAt));
				await Promise.all([new Promise(resolve => setTimeout(resolve, duration(totalTime + 80))), impact]);
			} finally {
				scene.cleanup();
			}
		},
	};
})();
