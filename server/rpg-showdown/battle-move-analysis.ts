import type { HitEffect, Move, MoveTarget } from '../../sim/dex-moves';
import type { Pokemon } from '../../sim/pokemon';
import { getRPGMoveDescriptionPTBR } from './move-descriptions-pt-br';
import { getRPGStatusPresentation } from './status-descriptions-pt-br';

export interface RPGMoveFlag { id: string; label: string; description: string }
export interface RPGMoveEffect {
	kind: 'status' | 'volatileStatus' | 'boost' | 'sideCondition' | 'slotCondition' |
		'weather' | 'terrain' | 'pseudoWeather' | 'heal' | 'drain' | 'recoil' | 'switch' | 'forceSwitch';
	target: 'target' | 'self' | 'side' | 'field'; chance: number | null;
	value: string | number[] | SparseBoostsTable | boolean;
	name: string; description: string;
}
export interface RPGMoveMetadata {
	basePower: number | null; variablePower: boolean; accuracy: number | null; alwaysHits: boolean;
	priority: number; target: MoveTarget; targetLabel: string; description: string;
	flags: RPGMoveFlag[]; effects: RPGMoveEffect[];
}
export type RPGMoveApplicability = 'applies' | 'immune-type' | 'immune-ability' | 'blocked-field' |
	'blocked-condition' | 'already-statused' | 'reflected' | 'not-applicable';
export interface RPGMoveTargetAnalysis {
	side: 'p1' | 'p2'; activeSlot: number; teamPosition: number; name: string; species: string; spriteId: string;
	targetLoc: number; inField: boolean; selectable: boolean; affected: boolean;
	damage: { applicable: boolean; multiplier: number | null; stage: number | null; outcome: RPGMoveApplicability; reason: string };
	effect: { applicable: boolean; outcome: RPGMoveApplicability; reason: string; statuses: string[] };
}

const FLAGS: Record<string, [string, string]> = {
	bypasssub: ['Bypasses Substitute', 'This move bypasses Substitute.'], bite: ['Bite', 'Interacts with Strong Jaw.'],
	bullet: ['Bullet', 'Can be blocked by Bulletproof.'], charge: ['Charge', 'May require a preparation turn.'],
	contact: ['Contact', 'Triggers Rough Skin, Iron Barbs, and equivalent effects.'], dance: ['Dance', 'Can activate Dancer.'],
	defrost: ['Defrosts', 'Can thaw the user.'], distance: ['Long distance', 'Can reach distant positions in Triples.'],
	gravity: ['Blocked by Gravity', 'Cannot be used under Gravity.'], heal: ['Healing', 'Is affected by Heal Block.'],
	powder: ['Powder', 'Interacts with Grass types, Overcoat, and Safety Goggles.'], protect: ['Protect', 'Can be blocked by Protect.'],
	pulse: ['Pulse', 'Interacts with Mega Launcher.'], punch: ['Punch', 'Interacts with Iron Fist.'],
	recharge: ['Recharge', 'Requires a recharge turn after use.'], reflectable: ['Reflectable', 'Interacts with Magic Coat and Magic Bounce.'],
	slicing: ['Slicing', 'Interacts with Sharpness.'], snatch: ['Snatchable', 'Can be stolen by Snatch.'],
	sound: ['Sound', 'Can be blocked by Soundproof.'], wind: ['Wind', 'Interacts with Wind Rider and Wind Power.'],
};
const TARGETS: Record<MoveTarget, string> = {
	adjacentAlly: 'One adjacent ally', adjacentAllyOrSelf: 'User or one adjacent ally', adjacentFoe: 'One adjacent foe',
	all: 'Entire field', allAdjacent: 'All adjacent Pokémon', allAdjacentFoes: 'All adjacent foes',
	allies: 'All active allies', allySide: "User's side", allyTeam: "User's team", any: 'Any other Pokémon',
	foeSide: "Opponent's side", normal: 'One adjacent Pokémon', randomNormal: 'Random adjacent foe',
	scripted: 'Target defined by the effect', self: 'User',
};
const TYPE_ABILITIES: Partial<Record<string, string[]>> = {
	Fire: ['flashfire', 'wellbakedbody'], Water: ['dryskin', 'stormdrain', 'waterabsorb'],
	Electric: ['lightningrod', 'motordrive', 'voltabsorb'], Grass: ['sapsipper'], Ground: ['eartheater', 'levitate'],
};
const MOLD_BREAKER = ['moldbreaker', 'teravolt', 'turboblaze'];

export function getRPGMoveMetadata(move: Move): RPGMoveMetadata {
	const normalizedEffects = effects(move);
	return {
		basePower: move.basePower || move.damage ? move.basePower : null,
		variablePower: !!(move.basePowerCallback || move.damageCallback || move.damage || move.ohko),
		accuracy: move.accuracy === true ? null : move.accuracy, alwaysHits: move.accuracy === true,
		priority: move.priority, target: move.target, targetLabel: TARGETS[move.target],
		description: getRPGMoveDescriptionPTBR(move, normalizedEffects),
		flags: Object.keys(move.flags).filter(flag => !!move.flags[flag as keyof typeof move.flags]).map(flag => {
			const [label, description] = FLAGS[flag] || [flag, 'Característica técnica do simulador.'];
			return { id: flag, label, description };
		}),
		effects: normalizedEffects,
	};
}
export function analyzeRPGMove(source: Pokemon, move: Move, knownTargets?: Pokemon[]): RPGMoveTargetAnalysis[] {
	const targets = knownTargets || source.battle.sides.slice(0, 2).flatMap(side => side.active
		.filter((target): target is Pokemon => !!target && !target.fainted));
	return [...new Set(targets)].filter(target => !target.fainted).map(target => analyze(source, target, move));
}
function analyze(source: Pokemon, target: Pokemon, move: Move): RPGMoveTargetAnalysis {
	const affected = target.isActive && isAffected(source, target, move);
	return {
		side: target.side.id as 'p1' | 'p2', activeSlot: target.side.active.indexOf(target),
		teamPosition: target.side.pokemon.indexOf(target),
		name: target.name, species: target.species.name, spriteId: target.species.spriteid,
		targetLoc: target.isActive ? source.getLocOf(target) : 0,
		inField: target.isActive, selectable: isSelectable(source, target, move), affected,
		damage: damage(source, target, move, affected || !target.isActive),
		effect: statusEffect(source, target, move, affected || !target.isActive),
	};
}
function isSelectable(source: Pokemon, target: Pokemon, move: Move): boolean {
	if (['all', 'allAdjacent', 'allAdjacentFoes', 'allies', 'allySide', 'allyTeam', 'foeSide', 'randomNormal', 'scripted'].includes(move.target)) return false;
	return move.target === 'self' ? source === target : source.battle.validTarget(target, source, move.target);
}
function isAffected(source: Pokemon, target: Pokemon, move: Move): boolean {
	const ally = source.isAlly(target);
	switch (move.target) {
	case 'all': return true;
	case 'allAdjacent': return source !== target && source.isAdjacent(target);
	case 'allAdjacentFoes': return !ally && source.isAdjacent(target);
	case 'allies': case 'allySide': case 'allyTeam': return ally;
	case 'foeSide': return !ally;
	case 'self': return source === target;
	case 'randomNormal': case 'scripted': return !ally && source.isAdjacent(target);
	default: return source.battle.validTarget(target, source, move.target);
	}
}
function damage(source: Pokemon, target: Pokemon, move: Move, affected: boolean) {
	if (!affected || move.category === 'Status') return {
		applicable: false, multiplier: null, stage: null, outcome: 'not-applicable' as const,
		reason: affected ? 'O golpe não causa dano direto.' : 'Fora do alcance do golpe.',
	};
	const weather = source.battle.field.effectiveWeather();
	if (move.type === 'Fire' && weather === 'primordialsea' || move.type === 'Water' && weather === 'desolateland') {
		return { applicable: false, multiplier: 0, stage: null, outcome: 'blocked-field' as const,
			reason: 'O clima extremo anula este tipo de golpe.' };
	}
	if (move.priority > 0 && !source.isAlly(target) && target.isGrounded() === true &&
		source.battle.field.terrain === 'psychicterrain') {
		return { applicable: false, multiplier: 0, stage: null, outcome: 'blocked-field' as const,
			reason: 'Psychic Terrain bloqueia golpes prioritários contra Pokémon no chão.' };
	}
	if (move.flags['protect'] && target.isProtected()) return {
		applicable: false, multiplier: 0, stage: null, outcome: 'blocked-condition' as const,
		reason: 'O alvo está protegido neste turno.',
	};
	if (move.flags['powder'] && (target.hasType('Grass') || target.hasAbility('overcoat') || target.hasItem('safetygoggles'))) {
		return { applicable: false, multiplier: 0, stage: null, outcome: 'immune-type' as const,
			reason: 'O alvo é imune a golpes de pó.' };
	}
	const ignoresAbility = !!move.ignoreAbility || source.hasAbility(MOLD_BREAKER);
	if (!ignoresAbility && !source.battle.suppressingAbility(target)) {
		const groundException = move.type === 'Ground' && (move.id === 'thousandarrows' || 'gravity' in source.battle.field.pseudoWeather);
		if ((TYPE_ABILITIES[move.type] || []).includes(target.ability) && !(groundException && target.ability === 'levitate')) {
			return immune(`Imune por ${target.getAbility().name}.`, 'immune-ability');
		}
		if (move.flags['sound'] && target.ability === 'soundproof') return immune('Imune por Soundproof.', 'immune-ability');
		if (move.flags['bullet'] && target.ability === 'bulletproof') return immune('Imune por Bulletproof.', 'immune-ability');
	}
	const stage = typeStage(source, target, move);
	if (!Number.isFinite(stage)) return immune('Imune pela combinação atual de tipos.', 'immune-type');
	if (!ignoresAbility && target.hasAbility('wonderguard') && stage <= 0) {
		return immune('Wonder Guard bloqueia golpes que não são superefetivos.', 'immune-ability');
	}
	const multiplier = Math.pow(2, stage);
	return { applicable: true, multiplier, stage, outcome: 'applies' as const,
		reason: multiplier === 1 ? 'Dano neutro.' : `Multiplicador de dano por tipo: ${multiplier}x.` };
}
function typeStage(source: Pokemon, target: Pokemon, move: Move): number {
	let stage = 0;
	for (const type of target.getTypes()) {
		let mod = source.battle.dex.getEffectiveness(move, type);
		if (move.id === 'freezedry' && type === 'Water') mod = 1;
		if (move.id === 'flyingpress') mod += source.battle.dex.getEffectiveness('Flying', type);
		stage += mod;
	}
	const ignores = move.ignoreImmunity === true || (typeof move.ignoreImmunity === 'object' && move.ignoreImmunity[move.type]);
	const groundedGroundHit = move.type === 'Ground' && (move.id === 'thousandarrows' || target.isGrounded() === true);
	if (!ignores && !groundedGroundHit && !source.battle.dex.getImmunity(move, target.getTypes()) &&
		!target.hasItem('ringtarget')) return -Infinity;
	return stage;
}
function statusEffect(source: Pokemon, target: Pokemon, move: Move, affected: boolean) {
	const statuses = effects(move).filter(effect => effect.kind === 'status').map(effect => String(effect.value));
	if (!affected || !statuses.length) return { applicable: false, outcome: 'not-applicable' as const,
		reason: affected ? 'O golpe não tenta aplicar um status principal.' : 'Fora do alcance do golpe.', statuses };
	if (target.status) return { applicable: false, outcome: 'already-statused' as const,
		reason: `O alvo já possui o status ${target.status}.`, statuses };
	for (const status of statuses) if (!source.battle.dex.getImmunity(status, target)) return {
		applicable: false, outcome: 'immune-type' as const, reason: `A tipagem atual é imune a ${status}.`, statuses,
	};
	const grounded = target.isGrounded() === true;
	if (grounded && source.battle.field.terrain === 'mistyterrain') return { applicable: false, outcome: 'blocked-field' as const,
		reason: 'Misty Terrain impede status em Pokémon no chão.', statuses };
	if (grounded && source.battle.field.terrain === 'electricterrain' && statuses.includes('slp')) return {
		applicable: false, outcome: 'blocked-field' as const, reason: 'Electric Terrain impede sono.', statuses,
	};
	if (target.side.sideConditions['safeguard'] && !source.hasAbility('infiltrator')) return {
		applicable: false, outcome: 'blocked-condition' as const, reason: 'Safeguard bloqueia o status.', statuses,
	};
	if (move.flags['protect'] && target.isProtected()) return {
		applicable: false, outcome: 'blocked-condition' as const, reason: 'O alvo está protegido neste turno.', statuses,
	};
	if (target.volatiles['substitute'] && !move.flags['bypasssub'] && !move.flags['sound']) return {
		applicable: false, outcome: 'blocked-condition' as const, reason: 'Substitute bloqueia o efeito.', statuses,
	};
	if (move.flags['powder'] && (target.hasType('Grass') || target.hasAbility('overcoat') || target.hasItem('safetygoggles'))) return {
		applicable: false, outcome: 'immune-type' as const, reason: 'O alvo é imune a golpes de pó.', statuses,
	};
	if (source.hasAbility('prankster') && move.category === 'Status' && !source.isAlly(target) && target.hasType('Dark')) return {
		applicable: false, outcome: 'immune-type' as const, reason: 'O tipo Dark é imune a golpes priorizados por Prankster.', statuses,
	};
	const suppressed = source.battle.suppressingAbility(target);
	if (target.ability === 'comatose' && !suppressed) return {
		applicable: false, outcome: 'immune-ability' as const, reason: 'Comatose impede status mesmo contra Mold Breaker.', statuses,
	};
	if (!(move.ignoreAbility || source.hasAbility(MOLD_BREAKER)) && !suppressed) {
		const a = target.ability;
		if (move.category === 'Status' && a === 'goodasgold') return {
			applicable: false, outcome: 'immune-ability' as const, reason: 'Good as Gold bloqueia golpes de status.', statuses,
		};
		if (move.flags['reflectable'] && a === 'magicbounce') return {
			applicable: false, outcome: 'reflected' as const, reason: 'Magic Bounce reflete o efeito ao usuário.', statuses,
		};
		const blocked = a === 'purifyingsalt' ||
			(statuses.includes('slp') && ['insomnia', 'sweetveil', 'vitalspirit'].includes(a)) ||
			(statuses.some(s => s === 'psn' || s === 'tox') && ['immunity', 'pastelveil'].includes(a)) ||
			(statuses.includes('brn') && a === 'waterveil') || (statuses.includes('par') && a === 'limber') ||
			(statuses.includes('frz') && a === 'magmaarmor');
		if (blocked) return { applicable: false, outcome: 'immune-ability' as const,
			reason: `${target.getAbility().name} impede este status.`, statuses };
	}
	return { applicable: true, outcome: 'applies' as const, reason: 'O status pode ser aplicado.', statuses };
}
function immune(reason: string, outcome: 'immune-type' | 'immune-ability') {
	return { applicable: false, multiplier: 0, stage: null, outcome, reason };
}
const VOLATILE_DETAILS: Record<string, [string, string]> = {
	confusion: ['Confusion', 'Dura de 2 a 5 turnos. A cada ação há 1/3 de chance de causar dano a si mesmo em vez de executar o golpe.'],
	flinch: ['Flinch', 'Impede o alvo de agir naquele turno quando aplicado antes da ação dele.'],
};
const STAT_NAMES: Record<string, string> = {
	atk: 'Ataque', def: 'Defesa', spa: 'Ataque Especial', spd: 'Defesa Especial',
	spe: 'Velocidade', accuracy: 'Precisão', evasion: 'Evasão',
};
function readableEffectId(value: unknown): string {
	return String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
		.replace(/^./, character => character.toUpperCase());
}
function effectPresentation(kind: RPGMoveEffect['kind'], value: RPGMoveEffect['value']): [string, string] {
	if (kind === 'status') {
		const status = getRPGStatusPresentation(String(value));
		return status ? [status.name, status.description] : [readableEffectId(value), 'Aplica este status principal ao alvo.'];
	}
	if (kind === 'volatileStatus') return VOLATILE_DETAILS[String(value)] || [readableEffectId(value), 'Aplica esta condição temporária ao alvo.'];
	if (kind === 'boost' && value && typeof value === 'object' && !Array.isArray(value)) {
		const changes = Object.entries(value).map(([stat, stages]) => {
			const amount = Number(stages);
			return `${STAT_NAMES[stat] || stat} ${amount > 0 ? 'aumenta' : 'diminui'} ${Math.abs(amount)} estágio${Math.abs(amount) === 1 ? '' : 's'}`;
		});
		return ['Stat changes', changes.join('; ') + '.'];
	}
	if (Array.isArray(value) && value.length >= 2) {
		const fraction = `${value[0]}/${value[1]}`;
		if (kind === 'heal') return ['Cura', `Recupera ${fraction} do HP máximo.`];
		if (kind === 'drain') return ['Dreno', `O usuário recupera ${fraction} do dano causado.`];
		if (kind === 'recoil') return ['Dano de recuo', `O usuário sofre ${fraction} do dano causado.`];
	}
	const names: Partial<Record<RPGMoveEffect['kind'], string>> = {
		sideCondition: 'Side condition', slotCondition: 'Slot condition', weather: 'Weather', terrain: 'Terrain',
		pseudoWeather: 'Field effect', heal: 'Healing', drain: 'Drain', recoil: 'Recoil',
		switch: 'User switch', forceSwitch: 'Forced switch',
	};
	const name = names[kind] || readableEffectId(kind);
	return [name, typeof value === 'string' ? `${name}: ${readableEffectId(value)}.` : `${name}.`];
}
function effects(move: Move): RPGMoveEffect[] {
	const result: RPGMoveEffect[] = [];
	const push = (kind: RPGMoveEffect['kind'], target: RPGMoveEffect['target'], chance: number | null, value: RPGMoveEffect['value']) => {
		const [name, description] = effectPresentation(kind, value);
		result.push({ kind, target, chance, value, name, description });
	};
	const add = (effect: HitEffect, target: RPGMoveEffect['target'], chance: number | null) => {
		if (effect.status) push('status', target, chance, effect.status);
		if (effect.volatileStatus) push('volatileStatus', target, chance, effect.volatileStatus);
		if (effect.boosts) push('boost', target, chance, { ...effect.boosts });
		if (effect.sideCondition) push('sideCondition', 'side', chance, effect.sideCondition);
		if (effect.slotCondition) push('slotCondition', 'side', chance, effect.slotCondition);
		if (effect.weather) push('weather', 'field', chance, effect.weather);
		if (effect.terrain) push('terrain', 'field', chance, effect.terrain);
		if (effect.pseudoWeather) push('pseudoWeather', 'field', chance, effect.pseudoWeather);
	};
	add(move, 'target', 100);
	for (const secondary of move.secondaries || []) {
		add(secondary, 'target', secondary.chance ?? 100);
		if (secondary.self) add(secondary.self, 'self', secondary.chance ?? 100);
	}
	if (move.self) add(move.self, 'self', move.self.chance ?? 100);
	if (move.selfBoost?.boosts) push('boost', 'self', 100, { ...move.selfBoost.boosts });
	if (move.heal) push('heal', 'target', 100, [...move.heal]);
	if (move.drain) push('drain', 'self', 100, [...move.drain]);
	if (move.recoil) push('recoil', 'self', 100, [...move.recoil]);
	if (move.selfSwitch) push('switch', 'self', 100, true);
	if (move.forceSwitch) push('forceSwitch', 'target', 100, true);
	return result;
}