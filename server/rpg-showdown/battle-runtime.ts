/**
 * Runtime privado das batalhas do RPG.
 *
 * A Battle Session continua sendo o contrato de preparação/persistência. Este
 * módulo é a ponte efêmera com o simulador: recebe ações estruturadas e nunca
 * exige que uma conta RPG entre em uma room comum do Showdown.
 */
import { Battle } from '../../sim/battle';
import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import type { Pokemon } from '../../sim/pokemon';
import type { PokemonSet } from '../../sim/teams';
import {
	CaptureSystem,
	FleeSystem,
	RPGInventorySystem,
	RPGItemUseSystem,
	RPGItems,
	RPGManager,
	RPG_STATE_VERSION,
	getRPGPokemonSizeClass,
	type RPGBattleResult,
	type RPGCaptureResult,
	type RPGFleeResult,
	type RPGInventoryState,
	type RPGBattleItemEvent,
} from '../../sim/rpg-showdown';
import type {
	RPGBattleFormat,
	RPGBattleLaunchRequest,
	RPGBattleParticipant,
	RPGBattleSession,
} from './battle-session';
import { getRPGItemIconPath } from './item-icons';
import type { RPGCharacterState } from './index';
import {
	analyzeRPGMove,
	getRPGMoveMetadata,
	type RPGMoveMetadata,
} from './battle-move-analysis';
import { getRPGAbilityDescriptionPTBR } from './ability-descriptions-pt-br';
import { getRPGStatusPresentation, type RPGStatusPresentation } from './status-descriptions-pt-br';

export type RPGBattleRuntimeStatus = 'active' | 'ended';
export type RPGBattleRuntimeSlotAction =
	| { type: 'move', move: number, target?: number, mega?: boolean }
	| { type: 'switch', pokemon: number }
	| { type: 'item', item: string, target: number, move?: number, actionId: string, expectedRevision?: number }
	| { type: 'capture', ball: string, target?: number, actionId: string, expectedRevision?: number }
	| { type: 'pass' };
export type RPGBattleRuntimeAction =
	| { type: 'move', move: number, active?: number, target?: number, mega?: boolean }
	| { type: 'switch', pokemon: number }
	| { type: 'turn', choices: RPGBattleRuntimeSlotAction[] }
	| { type: 'flee' };

export interface RPGRuntimeMove extends RPGMoveMetadata {
	id: string;
	name: string;
	type: string;
	category: string;
	pp: number;
	maxPP: number;
	disabled: boolean;
}

export interface RPGRuntimeBattleRef {
	side: 'p1' | 'p2';
	activeSlot: number;
	name: string;
}

export type RPGRuntimeBoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';
export interface RPGRuntimeVisualUpdate {
	target: RPGRuntimeBattleRef;
	hpFraction?: number;
	hpChange?: 'damage' | 'heal';
	status?: string;
	boost?: { stat: RPGRuntimeBoostStat; delta: number };
	active?: boolean;
}

export interface RPGRuntimeMoveAnimationEvent {
	sequence: number;
	type: 'move';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	move: {
		id: string;
		name: string;
		type: string;
		category: string;
		target: string;
	};
}

export interface RPGRuntimeMegaAnimationEvent {
	sequence: number;
	type: 'mega';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	transformation: {
		fromSpecies: string;
		fromSpriteId: string;
		toSpecies: string;
		toSpriteId: string;
		baseSpriteId: string;
		types: string[];
		ability: string;
		abilityDescription: string;
	};
}

export interface RPGRuntimeFaintAnimationEvent {
	sequence: number;
	type: 'faint';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
}

export interface RPGRuntimeResidualAnimationEvent {
	sequence: number;
	type: 'residual';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	appliedSequence: number;
	residual: {
		id: string;
		name: string;
		moveId: string;
		theme: string;
		color: string;
	};
}

export interface RPGRuntimeEntryAnimationEvent {
	sequence: number;
	type: 'entry';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	hazards: string[];
}

export interface RPGRuntimeItemAnimationEvent {
	sequence: number;
	type: 'item';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	animate: boolean;
	item: { id: string; name: string; sprite: number | null };
}
export interface RPGRuntimeHeldItemAnimationEvent {
	sequence: number;
	type: 'heldItem';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	consumed: boolean;
	berry: boolean;
	item: RPGItemPresentation;
}
export interface RPGRuntimeCaptureAnimationEvent {
	sequence: number;
	type: 'capture';
	actor: RPGRuntimeBattleRef;
	targets: RPGRuntimeBattleRef[];
	updates: RPGRuntimeVisualUpdate[];
	feedback?: 'blocked' | 'miss' | 'immune';
	ball: { id: string; name: string; sprite: number | null };
	success: boolean;
	shakes: number;
}
export type RPGRuntimeAnimationEvent = RPGRuntimeMoveAnimationEvent | RPGRuntimeMegaAnimationEvent |
	RPGRuntimeFaintAnimationEvent | RPGRuntimeResidualAnimationEvent | RPGRuntimeEntryAnimationEvent |
	RPGRuntimeItemAnimationEvent | RPGRuntimeHeldItemAnimationEvent | RPGRuntimeCaptureAnimationEvent;
export type RPGMegaPreviewStat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export interface RPGMegaPreview {
	name: string;
	species: string;
	spriteId: string;
	shiny: boolean;
	types: string[];
	ability: string;
	abilityDescription: string;
	stats: Record<RPGMegaPreviewStat, { normal: number; mega: number }>;
}

export interface RPGItemPresentation {
	id: string;
	name: string;
	sprite: number | null;
	icon: string | null;
}

export interface RPGPokemonOwnerPresentation {
	trainerId: string;
	characterId?: string;
	name: string;
	kind: RPGBattleParticipant['kind'];
}

export type RPGRuntimeHUDEffectKind =
	'weather' | 'terrain' | 'global' | 'buff' | 'hazard' | 'individual' | 'switch-lock';

export interface RPGRuntimeHUDEffect {
	id: string;
	name: string;
	kind: RPGRuntimeHUDEffectKind;
	icon: string;
	theme: string;
	duration: number | null;
	permanent: boolean;
	layers: number | null;
	maxLayers: number | null;
	sourceSide: 'p1' | 'p2' | null;
	sourcePokemon: string;
	targetSide: 'p1' | 'p2' | null;
	targetPokemonPosition: number | null;
	order: number;
}

export interface RPGRuntimeSideEffects {
	buffs: RPGRuntimeHUDEffect[];
	hazards: RPGRuntimeHUDEffect[];
}

export interface RPGRuntimePokemonEffects {
	individual: RPGRuntimeHUDEffect[];
	switchLocks: RPGRuntimeHUDEffect[];
}

export interface RPGRuntimeSwitchSlot {
	activeSlot: number;
	pokemonPosition: number | null;
	owner: RPGPokemonOwnerPresentation | null;
	required: boolean;
	trapped: boolean;
	maybeTrapped: boolean;
	canSwitch: boolean;
	blockedReason: string;
	availablePokemonPositions: number[];
}
export interface RPGRuntimePokemon {
	position: number;
	teamPosition: number;
	name: string;
	species: string;
	spriteId: string;
	baseSpriteId: string;
	heightM: number;
	sizeClass: 'small' | 'medium' | 'large' | 'giant';
	shiny: boolean;

	level: number;
	hp: number;
	maxHP: number;
	status: string;
	condition: RPGStatusPresentation | null;
	item: string;
	itemDetails: RPGItemPresentation;
	owner: RPGPokemonOwnerPresentation | null;
	controllable: boolean;
	active: boolean;
	activeSlot: number | null;
	revealed: boolean;
	gender: string;
	types: string[];
	ability: string;
	abilityDescription: string;
	canMegaEvo: boolean;
	megaEvolution: string;
	isMega: boolean;
	megaPreview: RPGMegaPreview | null;
	pokeball: string;
	pokeballSprite: number;
	boosts: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion', number>;
	fainted: boolean;
	automaticMove: string;
	moves: RPGRuntimeMove[];
	effects: RPGRuntimePokemonEffects;
}

export interface RPGRuntimeTrainer {
	id: string;
	characterId?: string;
	name: string;
	kind: RPGBattleParticipant['kind'];
	avatar?: string;
	pokemonPositions: number[];
}

export interface RPGRuntimeSide {
	id: 'p1' | 'p2';
	team: 'A' | 'B';
	name: string;
	requestState: '' | 'move' | 'switch' | 'teampreview';
	waiting: boolean;
	needsSwitch: boolean[];
	switchSlots: RPGRuntimeSwitchSlot[];
	trainers: RPGRuntimeTrainer[];
	pokemon: RPGRuntimePokemon[];
	effects: RPGRuntimeSideEffects;
}

export interface RPGBattleRuntimeSnapshot {
	sessionId: string;
	status: RPGBattleRuntimeStatus;
	turn: number;
	format: RPGBattleFormat;
	sides: RPGRuntimeSide[];
	log: string[];
	animations: RPGRuntimeAnimationEvent[];
	field: {
		weather: string;
		weatherTurns: number | null;
		terrain: string;
		terrainTurns: number | null;
		weatherDetails: RPGRuntimeHUDEffect | null;
		terrainDetails: RPGRuntimeHUDEffect | null;
		globalEffects: RPGRuntimeHUDEffect[];
	};
	result?: RPGBattleResult;
	lastAction?: RPGCaptureResult | RPGFleeResult;
}

type RPGBagSlotAction = Extract<RPGBattleRuntimeSlotAction, { type: 'item' | 'capture' }>;

interface QueuedBagAction {
	side: Battle['p1'];
	actor: Pokemon;
	choice: RPGBagSlotAction;
	persistInventory?: RPGBattleInventoryPersist;
	itemTurnKey: string;
}

interface RuntimeTurnChoice {
	command: string;
	bagAction?: QueuedBagAction & { id: string };
}

interface PendingTrainerSlotChoice {
	choice: RPGBattleRuntimeSlotAction;
}

interface PendingSideTurn {
	turn: number;
	requestState: Battle['p1']['requestState'];
	slots: Map<number, PendingTrainerSlotChoice>;
	submittedViewers: Set<string>;
}

interface RPGInitialPokemonState {
	hp: number;
	status: string;
	item: string;
	pp: number[];
}

interface RuntimeRecord {
	session: RPGBattleSession;
	launch: RPGBattleLaunchRequest;
	battle: Battle;
	lastAction?: RPGCaptureResult | RPGFleeResult;
	trainers: { p1: RPGRuntimeTrainer[], p2: RPGRuntimeTrainer[] };
	revealed: [Set<Pokemon>, Set<Pokemon>];
	teamPositions: [Map<Pokemon, number>, Map<Pokemon, number>];
	readyViewers: Set<string>;
	characters: Map<string, RPGCharacterState>;
	customAnimations: (RPGRuntimeItemAnimationEvent | RPGRuntimeCaptureAnimationEvent)[];
	itemTurns: Set<string>;
	pendingBagActions: Map<string, QueuedBagAction>;
	pendingSideTurns: Map<SideID, PendingSideTurn>;
	initialPokemon: Map<Pokemon, RPGInitialPokemonState>;
	itemEvents: RPGBattleItemEvent[];
	finishedAt?: number;
}

export type RPGBattleInventoryPersist = (characterId: string, inventory: RPGInventoryState) => void;

export interface RPGRuntimeViewer {
	master: boolean;
	characterId?: string;
}

export class RPGBattleRuntimeManager {
	private readonly runtimes = new Map<string, RuntimeRecord>();
	private static readonly ENDED_RUNTIME_TTL = 60 * 60 * 1000;
	private static readonly MAX_ENDED_RUNTIMES = 50;

	start(
		session: RPGBattleSession,
		launch: RPGBattleLaunchRequest,
		getCharacter: (id: string) => RPGCharacterState
	): RPGBattleRuntimeSnapshot {
		this.pruneEndedRuntimes();
		if (this.runtimes.has(toID(session.id))) return this.snapshot(session.id);
		const characters = new Map<string, RPGCharacterState>();
		const runtimeCharacter = (id: string) => {
			const key = toID(id);
			let character = characters.get(key);
			if (!character) {
				character = structuredClone(getCharacter(id));
				characters.set(key, character);
			}
			return character;
		};
		const participantsA = session.participants.filter(participant => participant.team === 'A');
		const participantsB = session.participants.filter(participant => participant.team === 'B');
		const teamA = this.resolveRuntimeTeam(participantsA, runtimeCharacter, session.format === 'raid');
		const teamB = this.resolveRuntimeTeam(participantsB, runtimeCharacter, false);
		const teams = { A: teamA.team, B: teamB.team };
		if (!teams.A.length || !teams.B.length) throw new Error('RPG battle requires Pokemon on both teams');
		const trainers = { p1: teamA.trainers, p2: teamB.trainers };

		const rpg = structuredClone(launch.rpg);
		if (session.format === 'raid') rpg.layout = 'raid';
		rpg.sideRoles = {
			p1: this.sideRole(session.participants.filter(participant => participant.team === 'A')),
			p2: this.sideRole(session.participants.filter(participant => participant.team === 'B')),
		};
		if (session.opponentType === 'wild' || session.opponentType === 'horde') rpg.wildSide = 'p2';

		const battle = new Battle({
			formatid: this.formatId(session),
			format: this.customFormat(session),
			rpg,
			strictChoices: true,
			send() {},
		});
		battle.setPlayer('p1', { name: this.sideName(session, 'A'), team: teams.A });
		battle.setPlayer('p2', { name: this.sideName(session, 'B'), team: teams.B });
		const runtimeId = toID(session.id);
		const runtime: RuntimeRecord = {
			session: structuredClone(session), launch: structuredClone(launch), battle, trainers,
			revealed: [new Set(), new Set()],
			teamPositions: [
				new Map(battle.p1.pokemon.map((pokemon, index) => [pokemon, index])),
				new Map(battle.p2.pokemon.map((pokemon, index) => [pokemon, index])),
			],
			readyViewers: new Set(), characters, customAnimations: [], itemTurns: new Set(),
			pendingBagActions: new Map(), pendingSideTurns: new Map(), itemEvents: [],
			initialPokemon: new Map(battle.getAllPokemon().map(pokemon => [pokemon, {
				hp: pokemon.hp, status: pokemon.status, item: pokemon.item,
				pp: pokemon.baseMoveSlots.map(slot => slot.pp),
			}])),
		};
		this.runtimes.set(runtimeId, runtime);
		RPGManager.setQueuedBattleActionHandler(battle, (pokemon, actionId) => {
			this.executeQueuedBagAction(runtime, pokemon, actionId);
		});
		try {
			this.finishTeamPreview(battle);
			this.centerRaidOpponent(session, battle);
			this.applyInitialHazards(battle, launch.initialHazards);
			return this.snapshot(session.id);
		} catch (error) {
			this.runtimes.delete(runtimeId);
			throw error;
		}
	}

	snapshot(sessionId: string, viewer?: RPGRuntimeViewer): RPGBattleRuntimeSnapshot {
		const runtime = this.require(sessionId);
		const battle = runtime.battle;
		if (battle.ended && runtime.finishedAt === undefined) runtime.finishedAt = Date.now();
		for (const [index, side] of battle.sides.slice(0, 2).entries()) {
			for (const pokemon of side.active) if (pokemon) runtime.revealed[index].add(pokemon);
		}
		return {
			sessionId: runtime.session.id,
			status: battle.ended ? 'ended' : 'active',
			turn: battle.turn,
			format: runtime.session.format!,
			sides: battle.sides.slice(0, 2).map((side, index) => {
				const revealed = runtime.revealed[index];
				const trainers = structuredClone(index === 0 ? runtime.trainers.p1 : runtime.trainers.p2);
				const analysisTargets = battle.sides.slice(0, 2).flatMap((targetSide, targetIndex) => [
					...targetSide.active.filter((pokemon): pokemon is Pokemon => !!pokemon && !pokemon.fainted),
					...(targetIndex === index ? [] : [...runtime.revealed[targetIndex]]),
				]);
				const pokemon = side.pokemon.map(entry => {
					const activeSlot = side.active.indexOf(entry);
					const moveRequest = activeSlot >= 0 && side.activeRequest && 'active' in side.activeRequest ?
						side.activeRequest.active[activeSlot] : undefined;
					const automaticMove = moveRequest && entry.getLockedMove() ?
						(moveRequest.moves[0]?.move || 'Automatic move') : '';
					const teamPosition = runtime.teamPositions[index].get(entry)!;
					const snapshot = this.pokemonSnapshot(
						entry, teamPosition, activeSlot, revealed.has(entry),
						this.ownerForTeamPosition(trainers, teamPosition), battle.gen,
						moveRequest?.moves, automaticMove, analysisTargets
					);
					snapshot.controllable = viewer ? this.viewerControlsPokemon(runtime, side, entry, viewer) : false;
					return snapshot;
				});
				return {
					id: side.id as 'p1' | 'p2',
					team: index === 0 ? 'A' : 'B',
					name: side.name,
					requestState: side.requestState,
					waiting: !!side.activeRequest?.wait || side.isChoiceDone() ||
						!!viewer && this.viewerWaiting(runtime, side, viewer),
					needsSwitch: side.active.map((_, activeSlot) =>
						!!side.activeRequest?.forceSwitch?.[activeSlot]
					),
					switchSlots: this.switchSlots(side, trainers, pokemon, runtime.launch.allowSwitching),
					trainers,
					pokemon,
					effects: this.sideEffectsSnapshot(battle, side),
				};
			}),
			log: this.readableLog(battle.log),
			animations: [...this.animationEvents(battle.log), ...runtime.customAnimations]
				.filter(event => event.type !== 'faint' || !runtime.customAnimations.some(custom =>
					custom.type === 'capture' && custom.success && Math.ceil(custom.sequence) === event.sequence &&
					custom.targets.some(target =>
						target.side === event.actor.side && target.activeSlot === event.actor.activeSlot
					)
				))
				.sort((a, b) => a.sequence - b.sequence).slice(-80),
			field: {
				weather: battle.field.weather || '',
				weatherTurns: battle.field.weatherState.duration ?? null,
				terrain: battle.field.terrain || '',
				terrainTurns: battle.field.terrainState.duration ?? null,
				weatherDetails: battle.field.weather ? this.hudEffect(
					battle, battle.field.weather, battle.field.weatherState, 'weather'
				) : null,
				terrainDetails: battle.field.terrain ? this.hudEffect(
					battle, battle.field.terrain, battle.field.terrainState, 'terrain'
				) : null,
				globalEffects: Object.entries(battle.field.pseudoWeather)
					.map(([id, effect]) => this.hudEffect(battle, id, effect, 'global'))
					.sort((a, b) => b.order - a.order),
			},
			result: this.resultSnapshot(runtime),
			lastAction: runtime.lastAction && structuredClone(runtime.lastAction),
		};
	}

	ready(sessionId: string, viewer: RPGRuntimeViewer): RPGBattleRuntimeSnapshot {
		const runtime = this.require(sessionId);
		runtime.readyViewers.add(this.viewerKey(viewer));
		return this.snapshot(sessionId, viewer);
	}

	action(
		sessionId: string, viewer: RPGRuntimeViewer, action: RPGBattleRuntimeAction,
		persistInventory?: RPGBattleInventoryPersist
	): RPGBattleRuntimeSnapshot {
		const runtime = this.require(sessionId);
		if (!runtime.readyViewers.has(this.viewerKey(viewer))) {
			throw new Error('RPG battle introduction must finish before choosing an action');
		}
		if (runtime.battle.ended) throw new Error('RPG battle has already ended');
		const sideId = this.controlledSide(runtime.session, viewer);
		if (!sideId) throw new Error('RPG session cannot control a side in this battle');
		const side = runtime.battle.getSide(sideId);
		if (!side.requestState) throw new Error('RPG battle is waiting for the other side');
		if (side.isChoiceDone()) throw new Error('RPG battle choice was already submitted');

		if (action.type === 'flee') {
			const active = side.active.find(pokemon =>
				pokemon && !pokemon.fainted && this.viewerControlsPokemon(runtime, side, pokemon, viewer)
			);
			if (!active) throw new Error('RPG side has no active Pokemon able to flee');
			runtime.lastAction = FleeSystem.attempt(active);
			if (!runtime.lastAction.success) this.submit(runtime.battle, sideId, this.defaultChoice(side));
			return this.snapshot(sessionId, viewer);
		}
		if (action.type === 'turn') {
			const turnChoice = this.collectTrainerTurn(runtime, side, viewer, action.choices, persistInventory);
			if (turnChoice && !runtime.battle.ended) this.submitTurn(runtime, sideId, turnChoice);
			return this.snapshot(sessionId, viewer);
		}

		if (side.requestState === 'switch') {
			if (action.type !== 'switch') throw new Error('RPG battle requires a Pokemon switch');
			this.submit(runtime.battle, sideId, this.singleSwitchChoice(runtime, side, viewer, action.pokemon, true));
			return this.snapshot(sessionId, viewer);
		}
		if (side.requestState !== 'move') throw new Error('RPG battle is not accepting move choices');
		if (action.type === 'switch') {
			this.submit(runtime.battle, sideId, this.singleSwitchChoice(runtime, side, viewer, action.pokemon, false));
			return this.snapshot(sessionId, viewer);
		}
		if (side.active.filter(pokemon => pokemon && !pokemon.fainted).length > 1) {
			throw new Error('RPG multi-active battles require one choice for every active Pokemon');
		}
		const activeIndex = action.active ?? side.active.findIndex(pokemon => pokemon && !pokemon.fainted);
		const actingPokemon = side.active[activeIndex];
		if (!actingPokemon || !this.viewerControlsPokemon(runtime, side, actingPokemon, viewer)) {
			throw new Error('RPG viewer cannot choose a move for a partner trainer Pokemon');
		}
		const choices = side.active.map((pokemon, index) => {
			if (!pokemon || pokemon.fainted) return 'pass';
			const move = index === activeIndex ? this.positiveInteger(action.move, 'move position') : this.firstMove(pokemon);
			const target = index === activeIndex && action.target ? ` ${action.target}` : '';
			const mega = index === activeIndex && action.mega ? ' mega' : '';
			return `move ${move}${target}${mega}`;
		});
		this.submit(runtime.battle, sideId, choices.join(', '));
		return this.snapshot(sessionId, viewer);
	}

	private singleSwitchChoice(
		runtime: RuntimeRecord, side: Battle['p1'], viewer: RPGRuntimeViewer,
		pokemonPosition: number, forced: boolean
	): string {
		const slots = side.active.map((pokemon, activeSlot) => ({ pokemon, activeSlot })).filter(entry => {
			if (!entry.pokemon) return false;
			if (forced && !side.activeRequest?.forceSwitch?.[entry.activeSlot]) return false;
			if (!forced && entry.pokemon.fainted) return false;
			return this.viewerControlsPokemon(runtime, side, entry.pokemon, viewer);
		});
		if (slots.length !== 1) {
			throw new Error('RPG multi-active battles require the active slot to be identified in a turn action');
		}
		const position = this.positiveInteger(pokemonPosition, 'Pokemon position');
		this.validateSwitchChoice(runtime, side, viewer, slots[0].activeSlot, position, forced);
		return `switch ${position}`;
	}

	private validateSwitchChoice(
		runtime: RuntimeRecord, side: Battle['p1'], viewer: RPGRuntimeViewer,
		activeSlot: number, pokemonPosition: number, forced: boolean
	): void {
		const outgoing = side.active[activeSlot];
		const incoming = side.pokemon[pokemonPosition - 1];
		if (!outgoing) throw new Error(`RPG active position ${activeSlot + 1} has no Pokemon to replace`);
		if (!incoming) throw new Error('Selected RPG switch Pokemon does not exist');
		if (incoming.isActive) throw new Error('Selected RPG switch Pokemon is already active');
		if (incoming.fainted) throw new Error('A fainted Pokemon cannot enter battle');
		if (!this.viewerControlsPokemon(runtime, side, outgoing, viewer)) {
			throw new Error('RPG viewer cannot switch a partner trainer Pokemon');
		}
		const outgoingOwner = this.runtimePokemonOwner(runtime, side, outgoing);
		const incomingOwner = this.runtimePokemonOwner(runtime, side, incoming);
		if (!outgoingOwner || outgoingOwner.trainerId !== incomingOwner?.trainerId) {
			throw new Error('The replacement Pokemon must belong to the trainer being switched out');
		}
		if (!forced && !runtime.launch.allowSwitching) {
			throw new Error('Pokemon switching is disabled for this battle');
		}
		const moveRequest = side.activeRequest && 'active' in side.activeRequest ?
			side.activeRequest.active[activeSlot] : undefined;
		if (!forced && moveRequest?.trapped) throw new Error(this.trappedSwitchReason(outgoing));
	}

	private viewerControlsPokemon(
		runtime: RuntimeRecord, side: Battle['p1'], pokemon: Pokemon, viewer: RPGRuntimeViewer
	): boolean {
		const owner = this.runtimePokemonOwner(runtime, side, pokemon);
		if (!owner) return false;
		if (viewer.master) return owner.kind !== 'player';
		return !!viewer.characterId && owner.kind === 'player' && owner.characterId === viewer.characterId;
	}

	private runtimePokemonOwner(
		runtime: RuntimeRecord, side: Battle['p1'], pokemon: Pokemon
	): RPGPokemonOwnerPresentation | null {
		const index = side === runtime.battle.p1 ? 0 : 1;
		const trainers = index === 0 ? runtime.trainers.p1 : runtime.trainers.p2;
		const teamPosition = runtime.teamPositions[index].get(pokemon);
		return teamPosition === undefined ? null : this.ownerForTeamPosition(trainers, teamPosition);
	}

	private actionableSlots(side: Battle['p1']): boolean[] {
		const lockedMoves = side.active.map(pokemon =>
			side.requestState === 'move' && pokemon && !pokemon.fainted ? pokemon.getLockedMove() : null
		);
		return side.active.map((pokemon, activeSlot) => side.requestState === 'switch' ?
			!!side.activeRequest?.forceSwitch?.[activeSlot] :
			!!pokemon && !pokemon.fainted && !pokemon.volatiles['commanding'] && !lockedMoves[activeSlot]
		);
	}

	private viewerWaiting(runtime: RuntimeRecord, side: Battle['p1'], viewer: RPGRuntimeViewer): boolean {
		const pending = runtime.pendingSideTurns.get(side.id);
		return !!pending && pending.turn === runtime.battle.turn &&
			pending.requestState === side.requestState && pending.submittedViewers.has(this.viewerKey(viewer));
	}

	private collectTrainerTurn(
		runtime: RuntimeRecord,
		side: Battle['p1'],
		viewer: RPGRuntimeViewer,
		choices: RPGBattleRuntimeSlotAction[],
		persistInventory?: RPGBattleInventoryPersist
	): RuntimeTurnChoice | undefined {
		if (side.requestState !== 'move' && side.requestState !== 'switch') {
			throw new Error('RPG battle is not accepting turn choices');
		}
		const actionableSlots = this.actionableSlots(side);
		const controlledSlots = side.active.flatMap((pokemon, activeSlot) =>
			pokemon && this.viewerControlsPokemon(runtime, side, pokemon, viewer) && actionableSlots[activeSlot] ?
				[activeSlot] : []
		);
		const viewerKey = this.viewerKey(viewer);
		let pending = runtime.pendingSideTurns.get(side.id);
		if (!pending || pending.turn !== runtime.battle.turn || pending.requestState !== side.requestState) {
			pending = {
				turn: runtime.battle.turn,
				requestState: side.requestState,
				slots: new Map(),
				submittedViewers: new Set(),
			};
			runtime.pendingSideTurns.set(side.id, pending);
		}
		if (pending.submittedViewers.has(viewerKey)) {
			throw new Error('This trainer has already submitted its choices for the current turn');
		}
		if (!Array.isArray(choices) ||
			(choices.length !== side.active.length && choices.length !== controlledSlots.length)) {
			throw new Error('RPG trainer turn requires one choice for each Pokemon controlled by that trainer');
		}
		const incoming = new Map<number, RPGBattleRuntimeSlotAction>();
		if (choices.length === side.active.length) {
			for (const activeSlot of controlledSlots) incoming.set(activeSlot, choices[activeSlot]);
			for (const [activeSlot, choice] of choices.entries()) {
				if (controlledSlots.includes(activeSlot) || choice?.type === 'pass') continue;
				throw new Error('RPG viewer cannot choose an action for a partner trainer Pokemon');
			}
		} else {
			controlledSlots.forEach((activeSlot, index) => incoming.set(activeSlot, choices[index]));
		}
		for (const [activeSlot, choice] of incoming) {
			const pokemon = side.active[activeSlot];
			if (!pokemon || !actionableSlots[activeSlot] || !choice || choice.type === 'pass') {
				throw new Error(`RPG active position ${activeSlot + 1} must choose an action`);
			}
			if (pending.slots.has(activeSlot)) {
				throw new Error(`RPG active position ${activeSlot + 1} already has a submitted choice`);
			}
			if (choice.type === 'switch') {
				this.validateSwitchChoice(
					runtime, side, viewer, activeSlot,
					this.positiveInteger(choice.pokemon, 'Pokemon position'),
					side.requestState === 'switch'
				);
			} else if (side.requestState !== 'move') {
				throw new Error(`RPG active position ${activeSlot + 1} requires a switch`);
			} else if (choice.type === 'move') {
				this.positiveInteger(choice.move, 'move position');
			}
		}
		const bagChoices = [
			...[...pending.slots.values()].map(entry => entry.choice),
			...incoming.values(),
		].filter(choice => choice.type === 'item' || choice.type === 'capture');
		if (bagChoices.length > 1) {
			throw new Error('Only one Pokemon on each side can use a Bag item per turn');
		}
		for (const [activeSlot, choice] of incoming) pending.slots.set(activeSlot, { choice });
		pending.submittedViewers.add(viewerKey);
		if (actionableSlots.some((actionable, activeSlot) => actionable && !pending!.slots.has(activeSlot))) {
			return undefined;
		}
		const combined = side.active.map((_, activeSlot) =>
			actionableSlots[activeSlot] ? pending!.slots.get(activeSlot)!.choice : { type: 'pass' as const }
		);
		runtime.pendingSideTurns.delete(side.id);
		return this.turnChoice(runtime, side, combined, persistInventory);
	}

	private turnChoice(
		runtime: RuntimeRecord, side: Battle['p1'],
		choices: RPGBattleRuntimeSlotAction[], persistInventory?: RPGBattleInventoryPersist
	): RuntimeTurnChoice {
		if (side.requestState !== 'move' && side.requestState !== 'switch') {
			throw new Error('RPG battle is not accepting turn choices');
		}
		const lockedMoves = side.active.map(pokemon =>
			side.requestState === 'move' && pokemon && !pokemon.fainted ? pokemon.getLockedMove() : null
		);
		const actionableSlots = side.active.map((pokemon, activeSlot) => side.requestState === 'switch' ?
			!!side.activeRequest?.forceSwitch?.[activeSlot] :
			!!pokemon && !pokemon.fainted && !pokemon.volatiles['commanding'] && !lockedMoves[activeSlot]
		);
		const actionableCount = actionableSlots.filter(Boolean).length;
		if (!Array.isArray(choices) || (choices.length !== actionableCount && choices.length !== side.active.length)) {
			throw new Error('RPG turn requires one choice for every Pokemon able or required to act');
		}
		const bagChoices = choices.filter(choice => choice.type === 'item' || choice.type === 'capture');
		if (bagChoices.length > 1) {
			throw new Error('Only one Pokemon on each side can use a Bag item per turn');
		}
		const itemTurnKey = `${runtime.battle.turn}:${side.id}`;
		if (bagChoices.length && runtime.itemTurns.has(itemTurnKey)) {
			throw new Error('This side has already used a Bag item this turn');
		}
		let actionableIndex = 0;
		const pendingFrom = side.choice.actions.length;
		const selectedSwitches = new Set<number>();
		let pendingBag: { id: string, actor: Pokemon, choice: RPGBagSlotAction } | undefined;
		const commands = side.active.map((pokemon, activeSlot) => {
			const choice = choices.length === side.active.length ? choices[activeSlot] :
				actionableSlots[activeSlot] ? choices[actionableIndex++] : { type: 'pass' as const };
			const forcedSwitch = side.requestState === 'switch' && actionableSlots[activeSlot];
			if (!actionableSlots[activeSlot]) {
				if (side.requestState === 'move' && lockedMoves[activeSlot]) return 'move 1';
				return 'pass';
			}
			if (!pokemon) throw new Error(`RPG active position ${activeSlot + 1} has no Pokemon`);
			if (choice.type === 'pass') {
				if (forcedSwitch) throw new Error(`RPG active position ${activeSlot + 1} cannot pass`);
				throw new Error(`RPG active position ${activeSlot + 1} must choose an action`);
			}
			if (choice.type === 'switch') {
				const pokemonPosition = this.positiveInteger(choice.pokemon, 'Pokemon position');
				if (selectedSwitches.has(pokemonPosition)) {
					throw new Error('The same reserve Pokemon cannot replace two active positions');
				}
				selectedSwitches.add(pokemonPosition);
				return `switch ${pokemonPosition}`;
			}
			if (side.requestState !== 'move') throw new Error(`RPG active position ${activeSlot + 1} requires a switch`);
			if (choice.type === 'item' || choice.type === 'capture') {
				const id = `${runtime.session.id}:${itemTurnKey}:${pokemon.position}:${choice.actionId}`;
				pendingBag = { id, actor: pokemon, choice };
				return `rpgitem ${id}`;
			}
			const move = this.positiveInteger(choice.move, 'move position');
			const target = choice.target ? ` ${choice.target}` : '';
			const mega = choice.mega ? ' mega' : '';
			return `move ${move}${target}${mega}`;
		});
		const command = commands.slice(pendingFrom).join(', ');
		if (!pendingBag) return { command };
		return {
			command,
			bagAction: {
				id: pendingBag.id, side, actor: pendingBag.actor, choice: pendingBag.choice,
				persistInventory, itemTurnKey,
			},
		};
	}

	private submitTurn(runtime: RuntimeRecord, sideId: SideID, turnChoice: RuntimeTurnChoice): void {
		const battle = runtime.battle;
		const side = battle.getSide(sideId);
		if (!side.choose(turnChoice.command)) {
			throw new Error(side.choice.error || 'Invalid RPG battle choice');
		}
		if (!side.isChoiceDone()) {
			side.clearChoice();
			throw new Error(`Incomplete RPG battle choice: ${turnChoice.command}`);
		}
		const pending = turnChoice.bagAction;
		if (pending) {
			const action = side.choice.actions.find(entry =>
				entry.choice === 'rpgItem' && entry.pokemon === pending.actor &&
				entry.rpgActionId === pending.id
			);
			if (!action) {
				side.clearChoice();
				throw new Error('RPG Bag action was not registered for the selected Pokemon');
			}
			runtime.pendingBagActions.set(pending.id, pending);
		}
		try {
			if (battle.allChoicesDone()) battle.commitChoices();
		} catch (error) {
			if (pending) runtime.pendingBagActions.delete(pending.id);
			throw error;
		}
	}

	private executeQueuedBagAction(runtime: RuntimeRecord, actor: Pokemon, actionId: string): void {
		const pending = runtime.pendingBagActions.get(actionId);
		if (!pending) throw new Error('RPG queued Bag action is unavailable');
		runtime.pendingBagActions.delete(actionId);
		if (pending.actor !== actor) throw new Error('RPG queued Bag action actor does not match');
		if (!actor.isActive || actor.fainted) return;
		this.applyBagAction(runtime, pending.side, actor, pending.choice, pending.persistInventory);
		runtime.itemTurns.add(pending.itemTurnKey);
	}

	private applyBagAction(
		runtime: RuntimeRecord, side: Battle['p1'], actor: Pokemon,
		choice: RPGBagSlotAction,
		persistInventory?: RPGBattleInventoryPersist
	): void {
		const owner = this.runtimePokemonOwner(runtime, side, actor);
		if (!owner?.characterId) throw new Error('Only a player character can use its Bag in battle');
		const character = runtime.characters.get(toID(owner.characterId));
		if (!character) throw new Error('RPG battle character inventory is unavailable');
		const inventory = RPGInventorySystem.migrate(character.inventory);
		if (choice.type === 'item') {
			const item = RPGItems.require(choice.item);
			if (item.category === 'ball') throw new Error('Poké Balls must use the capture action');
			const targetPosition = this.positiveInteger(choice.target, 'item target');
			const target = side.pokemon[targetPosition - 1];
			if (!target) throw new Error('Selected RPG item target does not exist');
			const targetOwner = this.runtimePokemonOwner(runtime, side, target);
			if (targetOwner?.characterId !== owner.characterId) {
				throw new Error('A Bag item can only target a Pokemon owned by the same character');
			}
			const previousPokemon = {
				hp: target.hp, status: target.status, statusState: target.statusState,
				movePP: target.moveSlots.map(slot => slot.pp),
				baseMovePP: target.baseMoveSlots.map(slot => slot.pp),
				rpg: structuredClone(target.rpg),
			};
			const result = RPGItemUseSystem.useInBattle(inventory, target, {
				actionId: choice.actionId, itemId: item.id, move: choice.move,
				expectedRevision: choice.expectedRevision,
			});
			if (!result.success || !result.consumed) {
				throw new Error('The RPG item had no valid effect on the selected Pokemon');
			}
			try {
				persistInventory?.(character.id, result.inventory);
			} catch (error) {
				target.hp = previousPokemon.hp;
				target.status = previousPokemon.status;
				target.statusState = previousPokemon.statusState;
				target.moveSlots.forEach((slot, index) => { slot.pp = previousPokemon.movePP[index]; });
				target.baseMoveSlots.forEach((slot, index) => { slot.pp = previousPokemon.baseMovePP[index]; });
				target.rpg = previousPokemon.rpg;
				throw error;
			}
			character.inventory = result.inventory;
			runtime.itemEvents.push({
				side: side.id, position: actor.position, item: item.id, itemName: item.name, quantity: 1,
				targetSide: target.side.id, targetPosition: target.position,
			});
			runtime.customAnimations.push({
				sequence: runtime.battle.log.length - 0.5, type: 'item', actor: this.pokemonRef(actor),
				targets: target.isActive ? [this.pokemonRef(target)] : [],
				animate: target.isActive,
				updates: [{
					target: this.pokemonRef(target), hpFraction: target.hp / target.maxhp, status: target.status,
				}],
				item: this.itemPresentation(item.id, item.name),
			});
			return;
		}
		if (side.id !== 'p1') throw new Error('Only team A can capture the wild opponent');
		const item = RPGItems.require(choice.ball);
		if (item.category !== 'ball' || item.effect?.type !== 'capture') {
			throw new Error('Selected RPG item is not a Poké Ball');
		}
		const fallback = runtime.battle.p2.active.findIndex(pokemon => pokemon && !pokemon.fainted);
		const targetSlot = choice.target ?? fallback;
		const target = runtime.battle.p2.active[targetSlot];
		if (!target || target.fainted) throw new Error('There is no active wild Pokemon in the selected position');
		if (!CaptureSystem.isAllowed(runtime.battle)) throw new Error('Capture is not allowed in this battle');
		if (!Number.isFinite(target.rpg.captureRate)) throw new Error('The wild Pokemon has no capture rate');
		const reserved = RPGInventorySystem.reserve(inventory, {
			actionId: choice.actionId, itemId: item.id, context: 'battle',
			reason: `capture:${side.id}:${target.position}`,
		}, choice.expectedRevision ?? inventory.bag.revision);
		const committed = RPGInventorySystem.commit(
			reserved.inventory, choice.actionId, reserved.inventory.bag.revision
		);
		persistInventory?.(character.id, committed.inventory);
		character.inventory = committed.inventory;
		const capture = CaptureSystem.attempt(target, {
			captorSide: side.id, ball: item.id,
			ballContext: {
				isNight: runtime.launch.captureContext.isNight,
				isCave: runtime.launch.captureContext.isCave,
				isInWater: runtime.launch.captureContext.isInWater,
			},
		});
		if (!capture.allowed) {
			throw new Error(`Capture is not allowed: ${capture.reason || 'invalid target'}`);
		}
		runtime.lastAction = capture;
		runtime.itemEvents.push({
			side: side.id, position: actor.position, item: item.id, itemName: item.name, quantity: 1,
			targetSide: target.side.id, targetPosition: target.position,
		});
		runtime.customAnimations.push({
			sequence: runtime.battle.log.length - 0.5, type: 'capture', actor: this.pokemonRef(actor),
			targets: [this.pokemonRef(target)], ball: this.itemPresentation(item.id, item.name),
			success: capture.success, shakes: capture.shakes,
			updates: capture.success ? [{ target: this.pokemonRef(target), active: false }] : [],
		});
	}

	private pokemonRef(pokemon: Pokemon): RPGRuntimeBattleRef {
		return {
			side: pokemon.side.id as 'p1' | 'p2', activeSlot: pokemon.side.active.indexOf(pokemon), name: pokemon.name,
		};
	}

	private itemPresentation(id: string, name: string): RPGItemPresentation {
		const sprite = Dex.items.get(id).spritenum;
		return {
			id, name,
			sprite: typeof sprite === 'number' && Number.isInteger(sprite) ? sprite : null,
			icon: getRPGItemIconPath(id),
		};
	}

	private viewerKey(viewer: RPGRuntimeViewer): string {
		return viewer.master ? 'master' : `player:${toID(viewer.characterId || '')}`;
	}

	private resolveRuntimeTeam(
		participants: RPGBattleParticipant[],
		getCharacter: (id: string) => RPGCharacterState,
		roundRobin: boolean
	): { team: PokemonSet[], trainers: RPGRuntimeTrainer[] } {
		const groups = participants.map(participant => {
			const character = participant.kind === 'player' ? getCharacter(participant.characterId!) : undefined;
			const sets = participant.pokemon.map(choice => {
				if (participant.kind !== 'player') return this.prepareControlledSet(choice.set!);
				const set = character!.team[choice.teamIndex!];
				if (!set) throw new Error('Selected RPG character Pokemon no longer exists');
				if (character!.box.party[choice.teamIndex!]?.metadata?.evTraining) {
					throw new Error('Este Pok\u00e9mon est\u00e1 em treinamento e n\u00e3o pode participar da batalha');
				}
				return structuredClone(set);
			});
			return { participant, character, sets };
		});
		const ordered: { group: typeof groups[number], set: PokemonSet }[] = [];
		if (roundRobin) {
			const maximum = Math.max(0, ...groups.map(group => group.sets.length));
			for (let index = 0; index < maximum; index++) {
				for (const group of groups) {
					if (group.sets[index]) ordered.push({ group, set: group.sets[index] });
				}
			}
		} else {
			for (const group of groups) {
				for (const set of group.sets) ordered.push({ group, set });
			}
		}
		const limited = ordered.slice(0, 24);
		const trainers = groups.map(group => ({
			id: group.participant.id,
			characterId: group.participant.characterId,
			name: group.participant.displayName,
			kind: group.participant.kind,
			avatar: group.participant.avatar || group.character?.avatar,
			pokemonPositions: limited.flatMap((entry, position) => entry.group === group ? [position] : []),
		}));
		return { team: limited.map(entry => entry.set), trainers };
	}

	private prepareControlledSet(input: PokemonSet): PokemonSet {
		const set = structuredClone(input);
		const species = Dex.mod('gen9').species.get(set.species);
		set.name ||= species.name;
		set.level ||= 5;
		set.rpg = {
			version: RPG_STATE_VERSION,
			level: set.level,
			captureRate: set.rpg?.captureRate ?? 45,
			...set.rpg,
		};
		return set;
	}

	private controlledSide(session: RPGBattleSession, viewer: RPGRuntimeViewer): 'p1' | 'p2' | undefined {
		for (const [team, side] of [['A', 'p1'], ['B', 'p2']] as const) {
			const participants = session.participants.filter(participant => participant.team === team);
			if (viewer.master && participants.some(participant => participant.kind !== 'player')) return side;
			if (!viewer.master && viewer.characterId && participants.some(
				participant => participant.kind === 'player' && participant.characterId === viewer.characterId
			)) return side;
		}
		return undefined;
	}

	private applyInitialHazards(battle: Battle, hazards: RPGBattleLaunchRequest['initialHazards'] | undefined): void {
		const empty = { spikes: 0, stealthRock: false, toxicSpikes: 0 };
		for (const [team, side] of [['A', battle.p1], ['B', battle.p2]] as const) {
			const configured = hazards?.[team] || empty;
			const source = (team === 'A' ? battle.p2 : battle.p1).pokemon[0];
			for (let layer = 0; layer < Math.min(3, configured.spikes || 0); layer++) {
				side.addSideCondition('spikes', source, Dex.getActiveMove('spikes'));
			}
			if (configured.stealthRock) {
				side.addSideCondition('stealthrock', source, Dex.getActiveMove('stealthrock'));
			}
			for (let layer = 0; layer < Math.min(2, configured.toxicSpikes || 0); layer++) {
				side.addSideCondition('toxicspikes', source, Dex.getActiveMove('toxicspikes'));
			}
		}
	}

	private sideRole(participants: RPGBattleParticipant[]) {
		const kind = participants.find(participant => participant.kind !== 'player')?.kind;
		if (!kind) return 'player' as const;
		if (kind === 'horde') return 'wild' as const;
		return kind === 'boss' ? 'boss' as const : kind;
	}

	private sideName(session: RPGBattleSession, team: 'A' | 'B'): string {
		return session.participants.filter(participant => participant.team === team)
			.map(participant => participant.displayName).join(' + ') || `Equipe ${team}`;
	}

	private activeSlots(session: RPGBattleSession): 1 | 2 | 3 {
		if (session.format === 'doubles' || session.format === 'multi') return 2;
		if (session.format === 'triples') return 3;
		if (session.format === 'raid') {
			const players = session.participants.filter(participant =>
				participant.team === 'A' && participant.kind === 'player'
			).length;
			return Math.max(1, Math.min(3, players)) as 1 | 2 | 3;
		}
		return 1;
	}

	private formatId(session: RPGBattleSession): ID {
		return toID(this.activeSlots(session) === 2 ? 'gen9doublescustomgame' : 'gen9customgame');
	}

	private customFormat(session: RPGBattleSession) {
		if (this.activeSlots(session) !== 3) return undefined;
		return { ...Dex.formats.get('gen9customgame'), gameType: 'triples' as const };
	}

	private finishTeamPreview(battle: Battle): void {
		for (const side of battle.sides.slice(0, 2)) {
			if (side.requestState === 'teampreview') this.submit(battle, side.id, 'team ' + side.pokemon.map((_, i) => i + 1).join(''));
		}
	}

	private pruneEndedRuntimes(now = Date.now()): void {
		const ended = [...this.runtimes.entries()]
			.filter((entry): entry is [string, RuntimeRecord] => entry[1].finishedAt !== undefined)
			.sort((a, b) => a[1].finishedAt! - b[1].finishedAt!);
		for (const [id, runtime] of ended) {
			if (now - runtime.finishedAt! >= RPGBattleRuntimeManager.ENDED_RUNTIME_TTL) this.runtimes.delete(id);
		}
		const retained = ended.filter(([id]) => this.runtimes.has(id));
		for (const [id] of retained.slice(0, Math.max(0, retained.length - RPGBattleRuntimeManager.MAX_ENDED_RUNTIMES))) {
			this.runtimes.delete(id);
		}
	}

	/** Keep the lone Raid opponent in the middle triples lane so all raiders can reach it. */
	private centerRaidOpponent(session: RPGBattleSession, battle: Battle): void {
		if (session.format !== 'raid' || this.activeSlots(session) !== 3) return;
		const active = battle.p2.active.filter((pokemon): pokemon is Pokemon => !!pokemon);
		if (active.length !== 1 || battle.p2.active[1] === active[0]) return;
		(battle.p2.active as (Pokemon | null)[]).splice(0, battle.p2.active.length, null, active[0], null);
		battle.makeRequest('move');
	}

	private defaultChoice(side: Battle['p1']): string {
		if (side.requestState === 'move') return side.active.map(pokemon => pokemon && !pokemon.fainted ? `move ${this.firstMove(pokemon)}` : 'pass').join(', ');
		if (side.requestState === 'switch') {
			const candidate = side.pokemon.find(pokemon => !pokemon.isActive && !pokemon.fainted);
			if (!candidate) throw new Error('RPG side has no Pokemon available to switch');
			return `switch ${candidate.position + 1}`;
		}
		throw new Error('RPG battle cannot consume this turn automatically');
	}

	private firstMove(pokemon: Pokemon): number {
		if (pokemon.getLockedMove()) return 1;
		const index = pokemon.getMoves().findIndex(move => !move.disabled && (move.pp ?? 0) > 0);
		return index < 0 ? 1 : index + 1;
	}

	private submit(battle: Battle, side: SideID, choice: string): void {
		if (!battle.choose(side, choice)) throw new Error(battle.getSide(side).choice.error || 'Invalid RPG battle choice');
	}

	private ownerForTeamPosition(
		trainers: RPGRuntimeTrainer[], teamPosition: number
	): RPGPokemonOwnerPresentation | null {
		const trainer = trainers.find(entry => entry.pokemonPositions.includes(teamPosition));
		if (!trainer) return null;
		return {
			trainerId: trainer.id,
			characterId: trainer.characterId,
			name: trainer.name,
			kind: trainer.kind,
		};
	}

	private switchSlots(
		side: Battle['p1'], trainers: RPGRuntimeTrainer[], pokemon: RPGRuntimePokemon[], allowSwitching: boolean
	): RPGRuntimeSwitchSlot[] {
		return side.active.map((activePokemon, activeSlot) => {
			const current = activePokemon ? pokemon.find(entry => entry.position === activePokemon.position) : undefined;
			const owner = current?.owner || null;
			const required = !!side.activeRequest?.forceSwitch?.[activeSlot];
			const moveRequest = side.activeRequest && 'active' in side.activeRequest ?
				side.activeRequest.active[activeSlot] : undefined;
			const trapped = !required && !!moveRequest?.trapped;
			const maybeTrapped = !required && !!moveRequest?.maybeTrapped;
			const availablePokemonPositions = pokemon.filter(candidate =>
				!candidate.active && !candidate.fainted && candidate.owner?.trainerId === owner?.trainerId
			).map(candidate => candidate.position + 1);
			let blockedReason = '';
			if (!current) blockedReason = 'Não há Pokémon nesta posição ativa.';
			else if (!required && !allowSwitching) blockedReason = 'As regras desta batalha não permitem trocas voluntárias.';
			else if (trapped) blockedReason = this.trappedSwitchReason(activePokemon!);
			else if (!availablePokemonPositions.length) blockedReason = 'Este treinador não possui uma reserva apta para entrar.';
			return {
				activeSlot,
				pokemonPosition: current ? current.position + 1 : null,
				owner,
				required,
				trapped,
				maybeTrapped,
				canSwitch: !blockedReason,
				blockedReason,
				availablePokemonPositions,
			};
		});
	}

	private trappedSwitchReason(pokemon: Pokemon): string {
		const trappedSource = pokemon.volatiles['trapped']?.sourceEffect?.name;
		if (trappedSource) return `A troca está bloqueada por ${trappedSource}.`;
		const knownSources = ['meanlook', 'block', 'spiderweb', 'jawlock', 'octolock', 'fairylock'];
		const source = knownSources.find(id => pokemon.volatiles[id]);
		if (source) return `A troca está bloqueada por ${Dex.conditions.get(source).name}.`;
		return 'A troca está bloqueada pelas condições atuais do combate.';
	}
	private pokemonSnapshot(
		pokemon: Pokemon, teamPosition: number, activeSlot: number, revealed: boolean,
		owner: RPGPokemonOwnerPresentation | null, generation: number,
		requestMoves?: ReturnType<Pokemon['getMoves']>, automaticMove = '', analysisTargets?: Pokemon[]
	): RPGRuntimePokemon {
		const megaEvolution = pokemon.getItem().megaStone && typeof pokemon.canMegaEvo === 'string' ?
			pokemon.canMegaEvo : '';
		const availableMoves = requestMoves || pokemon.getMoves();
		const ability = pokemon.getAbility();
		const item = pokemon.getItem();
		const condition = getRPGStatusPresentation(pokemon.status, generation);
		const megaSpecies = megaEvolution ? Dex.species.get(megaEvolution) : null;
		const megaAbility = megaSpecies?.exists ? Dex.abilities.get(megaSpecies.abilities['0']) : null;
		const megaPreview: RPGMegaPreview | null = megaSpecies?.exists && megaAbility?.exists ? {
			name: megaSpecies.name,
			species: megaSpecies.name,
			spriteId: megaSpecies.spriteid,
			shiny: !!pokemon.set.shiny,
			types: [...megaSpecies.types],
			ability: megaAbility.name,
			abilityDescription: getRPGAbilityDescriptionPTBR(megaAbility.id),
			stats: {
				hp: { normal: pokemon.species.baseStats.hp, mega: megaSpecies.baseStats.hp },
				atk: { normal: pokemon.species.baseStats.atk, mega: megaSpecies.baseStats.atk },
				def: { normal: pokemon.species.baseStats.def, mega: megaSpecies.baseStats.def },
				spa: { normal: pokemon.species.baseStats.spa, mega: megaSpecies.baseStats.spa },
				spd: { normal: pokemon.species.baseStats.spd, mega: megaSpecies.baseStats.spd },
				spe: { normal: pokemon.species.baseStats.spe, mega: megaSpecies.baseStats.spe },
			},
		} : null;
		return {
			position: pokemon.position,
			teamPosition,
			name: pokemon.name,
			species: pokemon.species.name,
			spriteId: pokemon.species.spriteid,
			baseSpriteId: Dex.species.get(pokemon.species.baseSpecies).spriteid || pokemon.species.spriteid,
			heightM: pokemon.species.heightm,
			sizeClass: getRPGPokemonSizeClass(pokemon.species.heightm),
			shiny: !!pokemon.set.shiny,

			level: pokemon.level,
			hp: pokemon.hp,
			maxHP: pokemon.maxhp,
			status: pokemon.status,
			condition,
			item: pokemon.item,
			itemDetails: {
				id: item.exists ? item.id : '',
				name: item.exists ? item.name : 'Nenhum',
				sprite: item.exists && typeof item.spritenum === 'number' && Number.isInteger(item.spritenum) ? item.spritenum : null,
				icon: item.exists ? getRPGItemIconPath(item.id) : null,
			},
			owner,
			controllable: false,
			active: pokemon.isActive,
			activeSlot: pokemon.isActive && activeSlot >= 0 ? activeSlot : null,
			revealed,
			gender: pokemon.gender,
			types: pokemon.getTypes(),
			ability: ability.name,
			abilityDescription: getRPGAbilityDescriptionPTBR(ability.id),
			canMegaEvo: !!megaEvolution,
			megaEvolution,
			isMega: !!pokemon.species.isMega,
			megaPreview,
			pokeball: pokemon.rpg.captureBall || 'pokeball',
			pokeballSprite: Dex.items.get(pokemon.rpg.captureBall || 'pokeball').spritenum || Dex.items.get('pokeball').spritenum || 0,
			boosts: { ...pokemon.boosts },
			fainted: pokemon.fainted,
			automaticMove,
			effects: this.pokemonEffectsSnapshot(pokemon),
			moves: availableMoves.map(move => {
				const moveSlot = pokemon.moveSlots.find(slot => slot.id === move.id);
				const dexMove = pokemon.battle.dex.moves.get(move.id);
				return {
					id: move.id,
					name: move.move,
					type: dexMove.type,
					category: dexMove.category,
					pp: move.pp ?? moveSlot?.pp ?? 0,
					maxPP: move.maxpp ?? moveSlot?.maxpp ?? dexMove.pp,
					disabled: !!move.disabled,
					disabledReason: this.moveDisabledReason(move, moveSlot),
					...getRPGMoveMetadata(dexMove),
					targets: analyzeRPGMove(pokemon, dexMove, analysisTargets),
				};
			}),
		};
	}

	private resultSnapshot(runtime: RuntimeRecord): RPGBattleResult | undefined {
		const source = runtime.battle.rpg?.result;
		if (!source) return undefined;
		const result = structuredClone(source);
		result.itemEvents = structuredClone(runtime.itemEvents);
		result.pokemonChanges = [];
		for (const entry of result.pokemon) {
			if (entry.side !== 'p1' && entry.side !== 'p2') continue;
			const sideIndex: 0 | 1 = entry.side === 'p1' ? 0 : 1;
			const side = runtime.battle.sides[sideIndex];
			const pokemon = side.pokemon.find(candidate => candidate.position === entry.position);
			if (!pokemon) continue;
			entry.teamPosition = runtime.teamPositions[sideIndex].get(pokemon);
			const initial = runtime.initialPokemon.get(pokemon);
			if (initial) result.pokemonChanges.push({
				side: entry.side, position: entry.position, teamPosition: entry.teamPosition,
				name: entry.name, species: entry.species,
				previousHP: initial.hp, hp: entry.hp, maxHP: entry.maxHP,
				previousPP: [...initial.pp], pp: entry.moves.map(move => move.pp),
				previousStatus: initial.status, status: entry.status,
				previousItem: initial.item, item: entry.item,
			});
		}
		for (const evolution of result.evolutions || []) {
			const pokemon = result.pokemon.find(entry =>
				entry.side === evolution.side && entry.position === evolution.position
			);
			evolution.teamPosition = pokemon?.teamPosition;
		}
		for (const experience of result.experience || []) {
			const pokemon = result.pokemon.find(entry =>
				entry.side === experience.side && entry.position === experience.position
			);
			experience.teamPosition = pokemon?.teamPosition;
		}
		return result;
	}

	private sideEffectsSnapshot(battle: Battle, side: Battle['p1']): RPGRuntimeSideEffects {
		const hazards = new Set([
			'spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'steelsurge',
			'gmaxwildfire', 'gmaxvolcalith', 'gmaxvinelash', 'gmaxcannonade',
		]);
		const effects = Object.entries(side.sideConditions).map(([id, state]) => this.hudEffect(
			battle, id, state, hazards.has(id) ? 'hazard' : 'buff', side.id as 'p1' | 'p2'
		));
		return {
			buffs: effects.filter(effect => effect.kind === 'buff').sort((a, b) => b.order - a.order),
			hazards: effects.filter(effect => effect.kind === 'hazard').sort((a, b) => b.order - a.order),
		};
	}

	private pokemonEffectsSnapshot(pokemon: Pokemon): RPGRuntimePokemonEffects {
		const individual: RPGRuntimeHUDEffect[] = [];
		const switchLocks: RPGRuntimeHUDEffect[] = [];
		for (const [volatileId, state] of Object.entries(pokemon.volatiles)) {
			if (volatileId === 'partiallytrapped') {
				const effectId = state.sourceEffect?.id || volatileId;
				individual.push(this.hudEffect(
					pokemon.battle, effectId, state, 'individual', pokemon.side.id as 'p1' | 'p2', pokemon.position,
					state.sourceEffect?.name
				));
			}
			if (volatileId === 'trapped' || volatileId === 'noretreat') {
				const effectId = state.sourceEffect?.id || volatileId;
				switchLocks.push(this.hudEffect(
					pokemon.battle, effectId, state, 'switch-lock', pokemon.side.id as 'p1' | 'p2', pokemon.position,
					state.sourceEffect?.name
				));
			}
		}
		return {
			individual: individual.sort((a, b) => b.order - a.order),
			switchLocks: switchLocks.sort((a, b) => b.order - a.order),
		};
	}

	private hudEffect(
		battle: Battle, inputId: string, state: Pokemon['volatiles'][string], kind: RPGRuntimeHUDEffectKind,
		targetSide: 'p1' | 'p2' | null = null, targetPokemonPosition: number | null = null,
		nameOverride = ''
	): RPGRuntimeHUDEffect {
		const id = toID(inputId);
		const condition = battle.dex.conditions.get(id);
		const duration = Number.isFinite(state.duration) ? state.duration! : null;
		const layers = Number.isFinite(state.layers) ? state.layers : null;
		const source = state.source && typeof state.source === 'object' && 'side' in state.source ? state.source as Pokemon : null;
		const sourceSide = source?.side?.id === 'p1' || source?.side?.id === 'p2' ? source.side.id : null;
		const maxLayers: Record<string, number> = { spikes: 3, toxicspikes: 2 };
		return {
			id,
			name: nameOverride || condition.name || state.name || inputId,
			kind,
			icon: this.hudEffectIcon(id, kind),
			theme: this.hudEffectTheme(id, kind),
			duration,
			permanent: duration === null,
			layers,
			maxLayers: maxLayers[id] || null,
			sourceSide,
			sourcePokemon: source?.name || '',
			targetSide,
			targetPokemonPosition,
			order: state.effectOrder || 0,
		};
	}

	private hudEffectIcon(id: string, kind: RPGRuntimeHUDEffectKind): string {
		const icons: Record<string, string> = {
			sunnyday: 'sun', desolateland: 'sun', raindance: 'rain', primordialsea: 'rain',
			sandstorm: 'sandstorm', snow: 'snow', deltastream: 'wind',
			electricterrain: 'electric', grassyterrain: 'grass', psychicterrain: 'psychic', mistyterrain: 'mist',
			trickroom: 'trickroom', magicroom: 'magicroom', wonderroom: 'wonderroom', gravity: 'gravity',
			mudsport: 'mud', watersport: 'water', reflect: 'reflect', lightscreen: 'lightscreen',
			auroraveil: 'auroraveil', safeguard: 'safeguard', mist: 'mistshield', tailwind: 'tailwind',
			luckychant: 'luckychant',
			stealthrock: 'rocks', spikes: 'spikes', toxicspikes: 'poison', stickyweb: 'web',
			steelsurge: 'steelsurge', gmaxwildfire: 'wildfire', gmaxvolcalith: 'volcalith',
			gmaxvinelash: 'vinelash', gmaxcannonade: 'cannonade',
		};
		return icons[id] || ({
			hazard: 'hazard', buff: 'benefit', individual: 'trap', 'switch-lock': 'lock',
		} as const)[kind as 'hazard'] || 'field';
	}

	private hudEffectTheme(id: string, kind: RPGRuntimeHUDEffectKind): string {
		const themes: Record<string, string> = {
			sunnyday: 'weather-sun', desolateland: 'weather-harsh-sun',
			raindance: 'weather-rain', primordialsea: 'weather-heavy-rain', sandstorm: 'weather-sand',
			snow: 'weather-snow', deltastream: 'weather-strong-winds',
			electricterrain: 'terrain-electric', grassyterrain: 'terrain-grassy',
			psychicterrain: 'terrain-psychic', mistyterrain: 'terrain-misty',
		};
		return themes[id] || ({ buff: 'benefit', hazard: 'hazard', global: 'global', individual: 'individual',
			'switch-lock': 'switch-lock', weather: 'weather', terrain: 'terrain' } as const)[kind];
	}
	private moveDisabledReason(
		move: ReturnType<Pokemon['getMoves']>[number], moveSlot?: Pokemon['moveSlots'][number]
	): string {
		if (!move.disabled) return '';
		if ((move.pp ?? moveSlot?.pp ?? 0) <= 0) return 'Sem PP restante.';
		if (moveSlot?.disabledSource) return `Indisponível por ${moveSlot.disabledSource}.`;
		return typeof move.disabled === 'string' ? move.disabled : 'Indisponível nas condições atuais.';
	}
	private readableLog(lines: string[]): string[] {
		const result: string[] = [];
		for (const line of lines) {
			const parts = line.split('|');
			if (parts[1] === 'turn') result.push(`Turno ${parts[2]}`);
			if (parts[1] === 'move') result.push(`${this.logName(parts[2])} usou ${parts[3]}.`);
			if (parts[1] === '-damage') result.push(`${this.logName(parts[2])}: ${parts[3]}.`);
			if (parts[1] === '-heal') result.push(`${this.logName(parts[2])} recuperou vida: ${parts[3]}.`);
			if (parts[1] === 'switch') result.push(`${this.logName(parts[2])} entrou em campo.`);
			if (parts[1] === 'faint') result.push(`${this.logName(parts[2])} desmaiou.`);
			if (parts[1] === 'win') result.push(`${parts[2]} venceu a batalha.`);
			if (parts[1] === 'tie') result.push('A batalha terminou empatada.');
			if (parts[1] === '-status') result.push(`${this.logName(parts[2])} recebeu o status ${parts[3]}.`);
		}
		return result.slice(-80);
	}

	private animationEvents(lines: string[]): RPGRuntimeAnimationEvent[] {
		const events: RPGRuntimeAnimationEvent[] = [];
		const residualAges = new Map<string, number>();
		let current: RPGRuntimeMoveAnimationEvent | undefined;
		const protectiveMoves = new Set([
			'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap',
			'burningbulwark', 'obstruct', 'maxguard', 'wideguard', 'quickguard', 'craftyshield', 'matblock',
		]);
		let entering: RPGRuntimeEntryAnimationEvent | undefined;
		const refKey = (ref: RPGRuntimeBattleRef) => `${ref.side}:${ref.activeSlot}:${ref.name}`;
		const ageKey = (ref: RPGRuntimeBattleRef, effectId: string) => `${refKey(ref)}:${effectId}`;
		const rememberAge = (ref: RPGRuntimeBattleRef, effectId: string, sequence: number) => {
			residualAges.set(ageKey(ref, effectId), sequence);
		};
		for (let sequence = 0; sequence < lines.length; sequence++) {
			const parts = lines[sequence].split('|');
			let heldItemName = '';
			let heldItemConsumed = false;
			if (parts[1] === '-enditem') {
				heldItemName = parts[3] || '';
				heldItemConsumed = true;
			} else {
				const fromItem = parts.find(value => value.startsWith('[from] item: '));
				if (fromItem) heldItemName = fromItem.slice(13);
				if (parts[1] === '-activate' && /^item:\s*/i.test(parts[3] || '')) {
					heldItemName = (parts[3] || '').replace(/^item:\s*/i, '');
				}
			}
			if (heldItemName) {
				const actor = this.battleRef(parts[2]);
				const item = Dex.items.get(heldItemName);
				const previous = events[events.length - 1];
				const duplicate = previous?.type === 'heldItem' && actor &&
					previous.actor.side === actor.side && previous.actor.activeSlot === actor.activeSlot &&
					previous.item.id === item.id && sequence - previous.sequence <= 2;
				if (actor && item.exists && !duplicate) events.push({
					sequence, type: 'heldItem', actor, targets: [actor], updates: [],
					consumed: heldItemConsumed, berry: !!item.isBerry,
					item: this.itemPresentation(item.id, item.name),
				});
			}
			if (parts[1] === '-status') {
				const target = this.battleRef(parts[2]);
				const residual = this.residualPresentation(['', '-damage', parts[2], parts[3], `[from] ${parts[3]}`]);
				if (target && residual) rememberAge(target, residual.id, sequence);
			}
			if (parts[1] === '-start') {
				const target = this.battleRef(parts[2]);
				const residual = this.residualPresentation(['', '-damage', parts[2], '', `[from] ${parts[3]}`]);
				if (target && residual) rememberAge(target, residual.id, sequence);
			}
			if (parts[1] === '-weather' && parts[2] && parts[2] !== 'none') {
				const residual = this.residualPresentation(['', '-damage', '', '', `[from] ${parts[2]}`]);
				if (residual) residualAges.set(`global:${residual.id}`, sequence);
			}
			if (parts[1] === '-sidestart') {
				const side = /^(p[12])/.exec(parts[2])?.[1];
				const residual = this.residualPresentation(['', '-damage', '', '', `[from] ${parts[3]}`]);
				if (side && residual) residualAges.set(`${side}:${residual.id}`, sequence);
			}
			if (entering) {
				const target = this.battleRef(parts[2]);
				const sameTarget = target?.side === entering.actor.side &&
					target?.activeSlot === entering.actor.activeSlot && target?.name === entering.actor.name;
				const source = parts.find(value => value.startsWith('[from] '))?.slice(7) || '';
				const hazard = toID(source.replace(/^move:\s*/i, ''));
				if (sameTarget && parts[1] === '-damage' && ['spikes', 'stealthrock'].includes(hazard)) {
					const condition = /^(\d+)\/(\d+)/.exec(parts[3]) ||
						(/^0(?:\s|$)/.test(parts[3]) ? ['0', '0', '1'] : null);
					if (condition) {
						const hpFraction = Number(condition[1]) / Math.max(1, Number(condition[2]));
						const previous = entering.updates[entering.updates.length - 1];
						if (previous?.hpFraction !== hpFraction) entering.updates.push({ target, hpFraction });
					}
					if (!entering.hazards.includes(hazard)) entering.hazards.push(hazard);
					continue;
				}
				if (sameTarget && parts[1] === '-status' && ['psn', 'tox'].includes(parts[3])) {
					entering.updates.push({ target, status: parts[3] });
					if (!entering.hazards.includes('toxicspikes')) entering.hazards.push('toxicspikes');
					continue;
				}
			}
			if (parts[1] === '-mega') {
				current = undefined;
				entering = undefined;
				const actor = this.battleRef(parts[2]);
				const megaItem = Dex.items.get(parts[4]);
				const megaStone = megaItem.megaStone;
				const megaSpeciesName = typeof megaStone === 'string' ? megaStone :
					megaStone?.[parts[3]] || Object.values(megaStone || {})[0] ||
					(toID(parts[3]) === 'rayquaza' ? 'Rayquaza-Mega' : '');
				const species = Dex.species.get(megaSpeciesName);
				if (actor && species.exists) {
					const baseSpecies = Dex.species.get(species.baseSpecies);
					const ability = Dex.abilities.get(species.abilities['0']);
					events.push({
						sequence, type: 'mega', actor, targets: [actor], updates: [],
						transformation: {
							fromSpecies: baseSpecies.name,
							fromSpriteId: baseSpecies.spriteid,
							toSpecies: species.name,
							toSpriteId: species.spriteid,
							baseSpriteId: baseSpecies.spriteid,
							types: [...species.types],
							ability: ability.name,
							abilityDescription: getRPGAbilityDescriptionPTBR(ability.id),
						},
					});
				}
				continue;
			}
			if (parts[1] === 'move') {
				entering = undefined;
				const actor = this.battleRef(parts[2]);
				if (!actor) {
					current = undefined;
					continue;
				}
				const move = Dex.moves.get(parts[3]);
				current = {
					sequence, type: 'move', actor, targets: [], updates: [],
					move: {
						id: move.id, name: move.name || parts[3], type: move.type,
						category: move.category, target: move.target,
					},
				};
				const selectedTarget = this.battleRef(parts[4]);
				if (selectedTarget) current.targets.push(selectedTarget);
				events.push(current);
				continue;
			}
			if (current && parts[1] === '-miss') {
				current.feedback = 'miss';
				continue;
			}
			if (current && parts[1] === '-immune') {
				current.feedback = 'immune';
				continue;
			}
			if (current && parts[1] === '-activate') {
				const activated = toID((parts[3] || '').replace(/^move:\s*/i, ''));
				if (protectiveMoves.has(activated)) current.feedback = 'blocked';
			}
			if (parts[1] === 'switch' || parts[1] === 'drag') {
				current = undefined;
				const actor = this.battleRef(parts[2]);
				const previous = events[events.length - 1];
				const duplicate = actor && previous?.type === 'entry' &&
					previous.actor.side === actor.side && previous.actor.activeSlot === actor.activeSlot &&
					previous.actor.name === actor.name;
				entering = duplicate ? previous as RPGRuntimeEntryAnimationEvent : actor ? {
					sequence, type: 'entry', actor, targets: [actor], updates: [], hazards: [],
				} : undefined;
				if (entering && !duplicate) events.push(entering);
				continue;
			}
			if (parts[1] === 'turn' || parts[1] === 'win' || parts[1] === 'tie') {
				current = undefined;
				entering = undefined;
				continue;
			}
			if (parts[1] === 'faint') {
				entering = undefined;
				const fainted = this.battleRef(parts[2]);
				if (fainted && current && !current.targets.some(entry => entry.side === fainted.side && entry.activeSlot === fainted.activeSlot)) {
					current.targets.push(fainted);
				}
				if (fainted) events.push({
					sequence, type: 'faint', actor: fainted, targets: [],
					updates: [{ target: fainted, hpFraction: 0, active: false }],
				});
				current = undefined;
				continue;
			}
			if (parts[1] === '-damage') {
				const target = this.battleRef(parts[2]);
				const residual = this.residualPresentation(parts);
				if (target && residual) {
					const previous = events[events.length - 1];
					if (previous?.type === 'residual' && previous.sequence === sequence - 1 &&
						previous.actor.side === target.side && previous.actor.activeSlot === target.activeSlot &&
						previous.actor.name === target.name && previous.residual.id === residual.id) continue;
					const condition = /^(\d+)\/(\d+)/.exec(parts[3]) ||
						(/^0(?:\s|$)/.test(parts[3]) ? ['0', '0', '1'] : null);
					const hpFraction = condition ? Number(condition[1]) / Math.max(1, Number(condition[2])) : undefined;
					const appliedSequence = residualAges.get(ageKey(target, residual.id)) ??
						residualAges.get(`${target.side}:${residual.id}`) ??
						residualAges.get(`global:${residual.id}`) ?? 0;
					events.push({
						sequence, type: 'residual', actor: target, targets: [target],
						updates: hpFraction === undefined ? [] : [{ target, hpFraction }],
						appliedSequence, residual,
					});
					continue;
				}
			}
			if (!current || !['-damage', '-heal', '-status', '-curestatus', '-boost', '-unboost'].includes(parts[1])) continue;
			const target = this.battleRef(parts[2]);
			if (target && !current.targets.some(entry => entry.side === target.side && entry.activeSlot === target.activeSlot)) {
				current.targets.push(target);
			}
			if (!target) continue;
			if (parts[1] === '-damage' || parts[1] === '-heal') {
				const condition = /^(\d+)\/(\d+)/.exec(parts[3]) ||
					(/^0(?:\s|$)/.test(parts[3]) ? ['0', '0', '1'] : null);
				if (condition) current.updates.push({
					target, hpFraction: Number(condition[1]) / Math.max(1, Number(condition[2])),
					hpChange: parts[1] === '-heal' ? 'heal' : 'damage',
				});
			}
			if (parts[1] === '-status') current.updates.push({ target, status: parts[3] || '' });
			if (parts[1] === '-curestatus') current.updates.push({ target, status: '' });
			if (parts[1] === '-boost' || parts[1] === '-unboost') {
				const stat = parts[3] as RPGRuntimeBoostStat;
				const amount = Number(parts[4]) || 0;
				current.updates.push({
					target, boost: { stat, delta: parts[1] === '-unboost' ? -amount : amount },
				});
			}
		}
		for (let start = 0; start < events.length;) {
			if (events[start].type !== 'residual') {
				start++;
				continue;
			}
			let end = start + 1;
			while (end < events.length && events[end].type === 'residual') end++;
			const group = events.slice(start, end) as RPGRuntimeResidualAnimationEvent[];
			const sequences = group.map(event => event.sequence).sort((a, b) => a - b);
			group.sort((a, b) => a.appliedSequence - b.appliedSequence || a.sequence - b.sequence);
			group.forEach((event, index) => { event.sequence = sequences[index]; });
			events.splice(start, group.length, ...group);
			start = end;
		}
		return events.slice(-80);
	}

	private residualPresentation(parts: string[]): RPGRuntimeResidualAnimationEvent['residual'] | undefined {
		const from = parts.find(value => value.startsWith('[from] '))?.slice(7).trim();
		if (!from) return undefined;
		const sourceId = toID(from.replace(/^move:\s*/i, '').replace(/^item:\s*/i, ''));
		const poisoned = sourceId === 'psn' || sourceId === 'tox';
		if (sourceId === 'brn') {
			return { id: 'brn', name: 'Queimadura', moveId: 'firespin', theme: 'burn', color: '#e24b32' };
		}
		if (poisoned) {
			const toxic = sourceId === 'tox' || /\btox\b/.test(parts[3] || '');
			return toxic ?
				{ id: 'tox', name: 'Envenenamento grave', moveId: 'toxic', theme: 'toxic', color: '#762b91' } :
				{ id: 'psn', name: 'Envenenamento', moveId: 'toxic', theme: 'poison', color: '#a24cc2' };
		}
		const fixed: Record<string, RPGRuntimeResidualAnimationEvent['residual']> = {
			leechseed: { id: 'leechseed', name: 'Leech Seed', moveId: 'leechseed', theme: 'grass', color: '#57a842' },
			saltcure: { id: 'saltcure', name: 'Salt Cure', moveId: 'saltcure', theme: 'salt', color: '#e9e6d4' },
			curse: { id: 'curse', name: 'Curse', moveId: 'curse', theme: 'ghost', color: '#65458c' },
			nightmare: { id: 'nightmare', name: 'Nightmare', moveId: 'nightmare', theme: 'ghost', color: '#473064' },
			sandstorm: { id: 'sandstorm', name: 'Sandstorm', moveId: 'scorchingsands', theme: 'sand', color: '#bd9654' },
			hail: { id: 'hail', name: 'Hail', moveId: 'iciclespear', theme: 'ice', color: '#9edceb' },
			seaoffire: { id: 'seaoffire', name: 'Sea of Fire', moveId: 'firepledge', theme: 'burn', color: '#e24b32' },
			gmaxwildfire: { id: 'gmaxwildfire', name: 'G-Max Wildfire', moveId: 'gmaxwildfire', theme: 'burn', color: '#e24b32' },
			gmaxvinelash: { id: 'gmaxvinelash', name: 'G-Max Vine Lash', moveId: 'gmaxvinelash', theme: 'grass', color: '#57a842' },
			gmaxcannonade: { id: 'gmaxcannonade', name: 'G-Max Cannonade', moveId: 'gmaxcannonade', theme: 'water', color: '#4b91d1' },
			gmaxvolcalith: { id: 'gmaxvolcalith', name: 'G-Max Volcalith', moveId: 'gmaxvolcalith', theme: 'rock', color: '#a99058' },
			stickybarb: { id: 'stickybarb', name: 'Sticky Barb', moveId: 'bind', theme: 'dark', color: '#554c5d' },
			blacksludge: { id: 'blacksludge', name: 'Black Sludge', moveId: 'toxic', theme: 'poison', color: '#a24cc2' },
		};
		if (fixed[sourceId]) return fixed[sourceId];
		if (!parts.includes('[partiallytrapped]') && !/^move:/i.test(from)) return undefined;
		const move = Dex.moves.get(sourceId);
		if (!move.exists) return undefined;
		const themes: Record<string, { theme: string, color: string }> = {
			Fire: { theme: 'burn', color: '#e24b32' }, Water: { theme: 'water', color: '#4b91d1' },
			Grass: { theme: 'grass', color: '#57a842' }, Poison: { theme: 'poison', color: '#a24cc2' },
			Ground: { theme: 'sand', color: '#bd9654' }, Rock: { theme: 'rock', color: '#a99058' },
			Ice: { theme: 'ice', color: '#9edceb' }, Ghost: { theme: 'ghost', color: '#65458c' },
			Dark: { theme: 'dark', color: '#554c5d' }, Electric: { theme: 'electric', color: '#e4c83c' },
		};
		const visual = themes[move.type] || { theme: 'neutral', color: '#d96a6a' };
		return { id: move.id, name: move.name, moveId: move.id, ...visual };
	}
	private battleRef(value = ''): RPGRuntimeBattleRef | undefined {
		const match = /^(p[12])([a-z]):\s*(.+)$/.exec(value);
		if (!match) return undefined;
		return {
			side: match[1] as 'p1' | 'p2',
			activeSlot: match[2].charCodeAt(0) - 97,
			name: match[3],
		};
	}

	private logName(value = ''): string {
		return value.replace(/^p\d[a-z]?:\s*/, '');
	}

	private positiveInteger(value: number, label: string): number {
		if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid RPG ${label}`);
		return value;
	}

	private require(sessionId: string): RuntimeRecord {
		const runtime = this.runtimes.get(toID(sessionId));
		if (!runtime) throw new Error('RPG battle runtime is not active');
		return runtime;
	}
}
