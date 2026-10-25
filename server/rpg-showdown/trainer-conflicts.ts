/** Conflitos humanos da V3. Nenhuma operação deste módulo altera o simulador Pokémon. */
import { rpgTrainerAttackBonus, rpgTrainerDerivedStatistics,
	rollRPGTrainerAttack, rollRPGTrainerDamage, rollRPGTrainerInitiative,
	rollRPGTrainerSkillCheck, rpgTrainerResistanceBonus, rollRPGD20 } from './trainer-checks';
import { rpgTrainerAddExhaustion, rpgTrainerApplyCondition, rpgTrainerRemoveCondition,
	rpgTrainerStabilize, rpgTrainerSurvivalEffects,
	rpgTrainerTakeDamage } from './trainer-survival';
import type { RPGTrainerSheet } from './trainer-sheet';
import { rpgEquipmentAttackProfile } from './trainer-equipment';

export type RPGHumanAction = 'attack' | 'dash' | 'disengage' | 'dodge' | 'help' | 'hide' |
	'ready' | 'search' | 'use-item' | 'stabilize' | 'maneuver';
export type RPGHumanManeuver = 'grapple' | 'shove-prone' | 'shove-away' | 'disarm' | 'pin' | 'escape';
export interface RPGHumanParticipant {
	id: string; sheet: RPGTrainerSheet; x: number; y: number;
	initiative?: ReturnType<typeof rollRPGTrainerInitiative>;
	surprised?: boolean;
}
export interface RPGHumanTurn {
	participantId: string; movementSpent: number; actionUsed: boolean; interactionUsed: boolean;
	bonusUsed: boolean; reactionUsed: boolean; disengaged: boolean; dodging: boolean;
	dashed: boolean;
	ready?: { trigger: string, action: RPGHumanAction };
}
export interface RPGHumanConflict {
	round: number; order: string[]; current: number; participants: RPGHumanParticipant[];
	turns: Record<string, RPGHumanTurn>; active: boolean;
}

function integer(value: number, label: string, min = 0, max = 100_000): number {
	if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} inválido`);
	return value;
}
function participant(conflict: RPGHumanConflict, id: string): RPGHumanParticipant {
	const found = conflict.participants.find(entry => entry.id === id);
	if (!found) throw new Error('Treinador não participa deste conflito');
	return found;
}
function current(conflict: RPGHumanConflict, id: string): RPGHumanTurn {
	if (!conflict.active || conflict.order[conflict.current] !== id) throw new Error('Não é o turno deste treinador');
	return conflict.turns[id];
}
function canAct(entry: RPGHumanParticipant, conflict: RPGHumanConflict): void {
	if (!rpgTrainerSurvivalEffects(entry.sheet).canAct || (entry.surprised && conflict.round === 1)) {
		throw new Error('O treinador não pode agir neste turno');
	}
}
function distance(a: RPGHumanParticipant, b: RPGHumanParticipant): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
function copy(conflict: RPGHumanConflict): RPGHumanConflict { return structuredClone(conflict); }
function newTurn(id: string): RPGHumanTurn {
	return { participantId: id, movementSpent: 0, actionUsed: false, interactionUsed: false,
		bonusUsed: false, reactionUsed: false, disengaged: false, dodging: false, dashed: false };
}

/** A ordem é sorteada uma vez; o desempate reutiliza a regra da ficha humana. */
export function startRPGHumanConflict(entries: RPGHumanParticipant[], random: () => number = Math.random): RPGHumanConflict {
	if (!Array.isArray(entries) || entries.length < 2 || entries.length > 100 ||
		new Set(entries.map(entry => entry.id)).size !== entries.length ||
			entries.some(entry => !/^[\w-]{1,80}$/.test(entry.id) || !Number.isFinite(entry.x) || !Number.isFinite(entry.y))) {
		throw new Error('Participantes do conflito inválidos');
	}
	const participants = structuredClone(entries).map(entry => ({ ...entry,
		initiative: rollRPGTrainerInitiative(entry.sheet, random) }));
	const tie = new Map<string, number>();
	for (const entry of participants) tie.set(entry.id, random());
	const order = [...participants].sort((a, b) =>
		b.initiative!.total - a.initiative!.total ||
		b.initiative!.dexterityBonus - a.initiative!.dexterityBonus ||
		tie.get(a.id)! - tie.get(b.id)!).map(entry => entry.id);
	return { round: 1, order, current: 0, participants,
		turns: Object.fromEntries(order.map(id => [id, newTurn(id)])), active: true };
}

export function endRPGHumanTurn(state: RPGHumanConflict, id: string): RPGHumanConflict {
	current(state, id);
	const next = copy(state);
	next.participants.find(entry => entry.id === id)!.surprised = false;
	if (++next.current >= next.order.length) { next.current = 0; next.round++; }
	const incoming = next.order[next.current];
	next.turns[incoming] = newTurn(incoming);
	// A reação se renova no início do turno; a surpresa termina somente após o primeiro turno próprio.
	return next;
}

export function moveRPGHuman(state: RPGHumanConflict, id: string, x: number, y: number,
	options: { difficult?: boolean, crawl?: boolean, swim?: boolean, climb?: boolean, stand?: boolean } = {}): RPGHumanConflict {
	const turn = current(state, id);
	const actor = participant(state, id);
	canAct(actor, state);
	if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Posição inválida');
	const speed = rpgTrainerDerivedStatistics(actor.sheet).movementMeters;
	const cost = Math.hypot(x - actor.x, y - actor.y) *
		(options.difficult || options.crawl || options.swim || options.climb ? 2 : 1) + (options.stand ? speed / 2 : 0);
	if (turn.movementSpent + cost > speed * (turn.dashed ? 2 : 1) + 0.00001) {
		throw new Error('Deslocamento insuficiente');
	}
	const next = copy(state);
	next.participants.find(entry => entry.id === id)!.x = x;
	next.participants.find(entry => entry.id === id)!.y = y;
	next.turns[id].movementSpent += cost;
	return next;
}

/** Consome a economia de ações. Bônus precisam ser explicitamente concedidos pela habilidade. */
export function useRPGHumanAction(state: RPGHumanConflict, id: string, action: RPGHumanAction,
	options: { kind?: 'action' | 'interaction' | 'bonus', bonusGranted?: boolean,
		trigger?: string, } = {}): RPGHumanConflict {
	const turn = current(state, id);
	canAct(participant(state, id), state);
	const kind = options.kind || 'action';
	if (kind === 'interaction' && action !== 'use-item') throw new Error('Esta ação exige uma ação completa');
	if (kind === 'bonus' && !options.bonusGranted) throw new Error('Ação bônus não concedida');
	if (kind === 'interaction' && turn.interactionUsed) throw new Error('Interação simples já utilizada');
	if (kind === 'bonus' && turn.bonusUsed) throw new Error('Ação bônus já utilizada');
	if (kind === 'action' && turn.actionUsed) throw new Error('Ação já utilizada');
	if (action === 'ready' && (!options.trigger || !options.trigger.trim())) throw new Error('Gatilho necessário');
	const next = copy(state);
	const updated = next.turns[id];
	if (kind === 'interaction') updated.interactionUsed = true;
	else if (kind === 'bonus') updated.bonusUsed = true;
	else updated.actionUsed = true;
	if (action === 'disengage') updated.disengaged = true;
	if (action === 'dodge') updated.dodging = true;
	if (action === 'dash') updated.dashed = true;
	if (action === 'ready') updated.ready = { trigger: options.trigger!.trim(), action };
	return next;
}

export function triggerRPGHumanReaction(state: RPGHumanConflict, id: string,
	kind: 'opportunity' | 'prepared', targetId?: string): RPGHumanConflict {
	const actor = participant(state, id);
	const turn = state.turns[id];
	if (!state.active || turn.reactionUsed || !rpgTrainerSurvivalEffects(actor.sheet).canReact ||
		(actor.surprised && state.round === 1)) throw new Error('Reação indisponível');
	if (kind === 'prepared' && !turn.ready) throw new Error('Ação não foi preparada');
	if (kind === 'opportunity') {
		const target = participant(state, targetId || '');
		if (distance(actor, target) > 1.5 || state.turns[target.id].disengaged) {
			throw new Error('Ataque de oportunidade indisponível');
		}
	}
	const next = copy(state);
	next.turns[id].reactionUsed = true;
	delete next.turns[id].ready;
	return next;
}

export interface RPGHumanAttackOptions {
	weaponId?: string;
	weapon?: { dice: number, sides: number, ranged?: boolean, normalRange?: number, maximumRange?: number };
	proficient?: boolean; nonlethal?: boolean; cover?: 0 | 2 | 5 | 'total';
	concealed?: boolean; visible?: boolean; adjacentHostile?: boolean;
}
export function attackRPGHuman(state: RPGHumanConflict, attackerId: string, targetId: string,
	options: RPGHumanAttackOptions = {}, random: () => number = Math.random) {
	const attacker = participant(state, attackerId);
	const target = participant(state, targetId);
	const turn = current(state, attackerId);
	canAct(attacker, state);
	if (turn.actionUsed) throw new Error('Ação já utilizada');
	if (options.weaponId && options.weapon) throw new Error('Informe apenas uma arma para o ataque');
	const catalogWeapon = options.weaponId ? rpgEquipmentAttackProfile(options.weaponId) : null;
	const weapon = catalogWeapon || options.weapon;
	const ranged = !!weapon?.ranged;
	const separation = distance(attacker, target);
	if ((!ranged && separation > 1.5) || (ranged && separation > (weapon?.maximumRange || 0))) {
		throw new Error('Alvo fora do alcance');
	}
	if (options.cover === 'total') throw new Error('Alvo em cobertura total');
	if (options.nonlethal && ranged && !catalogWeapon?.nonlethal) {
		throw new Error('Ataque à distância não pode ser convertido em não letal');
	}
	const adverse = rpgTrainerSurvivalEffects(attacker.sheet).attackDisadvantage ||
		(ranged && (separation > (weapon?.normalRange || 0) || options.adjacentHostile)) ||
		options.concealed || options.visible === false || state.turns[targetId].dodging;
	const defense = rpgTrainerDerivedStatistics(target.sheet).defense + (options.cover || 0);
	const attack = rollRPGTrainerAttack(rpgTrainerAttackBonus(attacker.sheet,
		ranged ? 'dexterity' : 'strength', !!options.proficient), defense, random,
	{ disadvantages: adverse ? 1 : 0 });
	const strength = Math.floor((attacker.sheet.attributes!.strength - 10) / 2);
	const dexterity = Math.floor((attacker.sheet.attributes!.dexterity - 10) / 2);
	const damage = attack.hit ? (weapon ?
		rollRPGTrainerDamage(weapon.dice, weapon.sides, ranged ? dexterity : strength,
			attack.critical, random).total + (catalogWeapon?.closeRangeBonus && separation <= 6 ?
			catalogWeapon.closeRangeBonus : 0) :
		Math.max(1, 1 + strength)) : 0;
	const next = copy(state);
	next.turns[attackerId].actionUsed = true;
	if (damage) next.participants.find(entry => entry.id === targetId)!.sheet =
		rpgTrainerTakeDamage(target.sheet, damage, { nonlethal: !!options.nonlethal || !!catalogWeapon?.nonlethal });
	return { state: next, attack, damage };
}

/** Atletismo contra a melhor defesa escolhida pelo alvo; empates preservam a posição. */
export function maneuverRPGHuman(state: RPGHumanConflict, actorId: string, targetId: string,
	maneuver: RPGHumanManeuver, defenseSkill: 'atletismo' | 'acrobacia',
	random: () => number = Math.random) {
	const actor = participant(state, actorId);
	const target = participant(state, targetId);
	const turn = current(state, actorId);
	canAct(actor, state);
	if (turn.actionUsed || distance(actor, target) > 1.5) throw new Error('Manobra indisponível');
	if (maneuver === 'pin' && !target.sheet.survival?.conditions.some(condition =>
		condition.id === 'agarrado' && condition.source === actorId)) throw new Error('Imobilizar exige agarramento prévio');
	const attackerSkill = maneuver === 'escape' ? 'acrobacia' : 'atletismo';
	const first = rollRPGTrainerSkillCheck(actor.sheet, attackerSkill, undefined, { dc: 0 }, random);
	const second = rollRPGTrainerSkillCheck(target.sheet, defenseSkill, undefined, { dc: 0 }, random);
	const success = first.total > second.total;
	const next = copy(state);
	next.turns[actorId].actionUsed = true;
	if (success) {
		const affected = next.participants.find(entry => entry.id === (maneuver === 'escape' ? actorId : targetId))!;
		if (maneuver === 'grapple') affected.sheet = rpgTrainerApplyCondition(affected.sheet, { id: 'agarrado', source: actorId });
		if (maneuver === 'shove-prone') affected.sheet = rpgTrainerApplyCondition(affected.sheet, { id: 'caido', source: actorId });
		if (maneuver === 'pin') affected.sheet = rpgTrainerApplyCondition(affected.sheet, { id: 'imobilizado', source: actorId });
		if (maneuver === 'escape') {
			affected.sheet = rpgTrainerRemoveCondition(affected.sheet, 'agarrado');
			affected.sheet = rpgTrainerRemoveCondition(affected.sheet, 'imobilizado');
		}
		if (maneuver === 'shove-away') affected.x += first.total - second.total >= 5 ? 3 : 1.5;
	}
	return { state: next, success, margin: first.total - second.total,
		pushMeters: success && maneuver === 'shove-away' ? first.total - second.total >= 5 ? 3 : 1.5 : 0,
		attacker: first, defender: second };
}

export type RPGChaseBand = 'contact' | 'short' | 'medium' | 'long' | 'escaped';
const CHASE_BANDS: RPGChaseBand[] = ['contact', 'short', 'medium', 'long', 'escaped'];
export interface RPGHumanChase { band: RPGChaseBand; dashes: Record<string, number>; round: number }
export function startRPGHumanChase(band: RPGChaseBand = 'short'): RPGHumanChase {
	if (!CHASE_BANDS.includes(band)) throw new Error('Faixa de perseguição inválida');
	return { band, dashes: {}, round: 1 };
}
export function advanceRPGHumanChase(chase: RPGHumanChase, fugitiveTotal: number, pursuerTotal: number,
	obstacleFailure: 'fugitive' | 'pursuer' | null = null): RPGHumanChase {
	integer(fugitiveTotal, 'Teste do fugitivo', -100, 1000);
	integer(pursuerTotal, 'Teste do perseguidor', -100, 1000);
	if (chase.band === 'escaped') return structuredClone(chase);
	const margin = fugitiveTotal - pursuerTotal;
	let shift = margin === 0 ? 0 : Math.sign(margin) * (Math.abs(margin) >= 5 ? 2 : 1);
	if (obstacleFailure === 'fugitive') shift--;
	if (obstacleFailure === 'pursuer') shift++;
	const index = Math.max(0, Math.min(4, CHASE_BANDS.indexOf(chase.band) + shift));
	return { ...structuredClone(chase), band: CHASE_BANDS[index], round: chase.round + 1 };
}
export function dashRPGHumanChase(chase: RPGHumanChase, id: string, sheet: RPGTrainerSheet,
	random: () => number = Math.random) {
	const next = structuredClone(chase);
	const count = (next.dashes[id] || 0) + 1;
	next.dashes[id] = count;
	const safe = Math.max(1, 3 + Math.floor((sheet.attributes!.constitution - 10) / 2));
	if (count <= safe) return { chase: next, sheet, save: null };
	const dc = 10 + (count - safe - 1) * 2;
	const roll = rollRPGD20(random);
	const success = roll.natural + rpgTrainerResistanceBonus(sheet, 'fortitude') >= dc;
	return { chase: next, sheet: success ? sheet : rpgTrainerAddExhaustion(sheet, 1),
		save: { ...roll, dc, success } };
}

export function stabilizeRPGHumanTarget(state: RPGHumanConflict, actorId: string, targetId: string,
	random: () => number = Math.random) {
	const actor = participant(state, actorId);
	const target = participant(state, targetId);
	const turn = current(state, actorId);
	canAct(actor, state);
	if (turn.actionUsed || distance(actor, target) > 1.5) throw new Error('Atendimento indisponível');
	const check = rollRPGTrainerSkillCheck(actor.sheet, 'medicina', 'wisdom', { dc: 10 }, random);
	const next = copy(state);
	next.turns[actorId].actionUsed = true;
	if (check.success) next.participants.find(entry => entry.id === targetId)!.sheet = rpgTrainerStabilize(target.sheet);
	return { state: next, check };
}
