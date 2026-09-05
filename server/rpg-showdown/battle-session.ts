import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import type { PokemonSet } from '../../sim/teams';
import {
	getRPGAllowedSexes,
	rollRPGPokemonSex,
	type RPGBattleResult,
	type RPGBattleState,
	type RPGBattleType,
} from '../../sim/rpg-showdown';
import { getRPGBattlePokemonCatalog } from './pokemon-catalog';
import { getRPGBattleScene } from './battle-scene';

export const RPG_BATTLE_SESSION_VERSION = 1;

/** Itens de treinamento de IV/EV deliberadamente excluídos do RPG. */
export const RPG_EXCLUDED_IV_EV_ITEM_IDS: ReadonlySet<string> = new Set([
	'bottlecap', 'goldbottlecap', 'machobrace',
	'pomegberry', 'kelpsyberry', 'qualotberry', 'hondewberry', 'grepaberry', 'tamatoberry',
	'hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos',
	'healthfeather', 'musclefeather', 'resistfeather', 'geniusfeather', 'cleverfeather', 'swiftfeather',
	'healthmochi', 'musclemochi', 'resistmochi', 'geniusmochi', 'clevermochi', 'swiftmochi',
	'freshstartmochi',
]);

const RPG_BREEDING_ONLY_HELD_ITEM_IDS: ReadonlySet<string> = new Set([
	'destinyknot',
	'poweranklet', 'powerband', 'powerbelt', 'powerbracer', 'powerlens', 'powerweight',
]);

export type RPGBattleSessionStatus =
	'draft' | 'inviting' | 'ready' | 'declined' | 'started' | 'ended' | 'cancelled';
export type RPGBattleFormat = 'singles' | 'doubles' | 'multi' | 'triples' | 'raid' | 'boss';
export type RPGBattleOpponentType = 'player' | 'npc' | 'wild' | 'boss' | 'horde';
export type RPGBattleTeam = 'A' | 'B';
export type RPGBattleParticipantKind = 'player' | 'npc' | 'wild' | 'boss' | 'horde';
export type RPGNPCBattleRole = 'generic' | 'gym-leader' | 'elite-four';
export type RPGInvitationResponse = 'pending' | 'accepted' | 'declined';
export type RPGFieldDuration = 'temporary' | 'permanent';

export interface RPGBattleParticipantPokemon {
	/** Position in the persistent character team; required for player Pokemon. */
	teamIndex?: number;
	/** Snapshot/configuration for NPC, wild, boss and horde Pokemon. */
	set?: PokemonSet;
	/** Controls the shiny roll for Pokemon created by the Master. */
	shinyMode?: 'random' | 'guaranteed' | 'disabled';
}

export interface RPGBattleParticipant {
	id: string;
	team: RPGBattleTeam;
	kind: RPGBattleParticipantKind;
	characterId?: string;
	avatar?: string;
	displayName: string;
	/** Role used by encounter rules and presentation for NPCs. */
	npcRole?: RPGNPCBattleRole;
	selectionLimit: number;
	/** Positions admitted before this battle, used for a tournament roster. */
	allowedTeamIndexes?: number[];
	pokemon: RPGBattleParticipantPokemon[];
}

export interface RPGBattleFieldCondition {
	id: '' | 'sunnyday' | 'raindance' | 'sandstorm' | 'snow' |
		'electricterrain' | 'grassyterrain' | 'psychicterrain' | 'mistyterrain';
	duration: RPGFieldDuration;
	turns: number;
}

export interface RPGInitialHazardSide {
	spikes: number;
	stealthRock: boolean;
	toxicSpikes: number;
}

export interface RPGInitialHazards {
	A: RPGInitialHazardSide;
	B: RPGInitialHazardSide;
}

export interface RPGInitialBuffSide {
	tailwind: boolean;
	reflect: boolean;
	lightScreen: boolean;
	auroraVeil: boolean;
	safeguard: boolean;
	mist: boolean;
}

export interface RPGInitialBuffs {
	A: RPGInitialBuffSide;
	B: RPGInitialBuffSide;
}

export interface RPGInitialGlobalEffects {
	trickRoom: boolean;
	magicRoom: boolean;
	wonderRoom: boolean;
	gravity: boolean;
	mudSport: boolean;
	waterSport: boolean;
	fairyLock: boolean;
	ionDeluge: boolean;
}

export interface RPGBattlePreparationConditions {
	sceneId: string;
	weather: RPGBattleFieldCondition;
	terrain: RPGBattleFieldCondition;
	startingTurn: number;
	timeOfDay: 'day' | 'night';
	isCave: boolean;
	isInWater: boolean;
	initialHazards: RPGInitialHazards;
	initialBuffs: RPGInitialBuffs;
	initialGlobalEffects: RPGInitialGlobalEffects;
}

export interface RPGBattlePreparationRules {
	canFlee: boolean;
	grantsExperience: boolean;
	allowSwitching: boolean;
	allowItems: boolean;
	playersChoosePokemon: boolean;
	/** Valor apostado por personagem Player. Zero desativa a aposta. */
	wagerAmount: number;
}

export interface RPGBattleInvitation {
	characterId: string;
	response: RPGInvitationResponse;
	respondedAt?: number;
}

export interface RPGBattleWagerStake {
	characterId: string;
	team: RPGBattleTeam;
	amount: number;
}

export interface RPGBattleWagerPayout {
	characterId: string;
	amount: number;
}

export interface RPGBattleWagerState {
	amountPerPlayer: number;
	status: 'reserved' | 'settled' | 'refunded';
	stakes: RPGBattleWagerStake[];
	payouts: RPGBattleWagerPayout[];
}

export interface RPGBattleSession {
	version: number;
	id: string;
	name: string;
	status: RPGBattleSessionStatus;
	format?: RPGBattleFormat;
	opponentType?: RPGBattleOpponentType;
	participants: RPGBattleParticipant[];
	conditions: RPGBattlePreparationConditions;
	rules: RPGBattlePreparationRules;
	invitations: RPGBattleInvitation[];
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	endedAt?: number;
	result?: RPGBattleResult;
	wager?: RPGBattleWagerState;
	cancelledAt?: number;
}

export interface RPGCreateBattleSessionRequest {
	name?: string;
}

export interface RPGUpdateBattleSessionRequest {
	name?: string;
	format?: RPGBattleFormat;
	opponentType?: RPGBattleOpponentType;
	participants?: RPGBattleParticipant[];
	conditions?: Partial<RPGBattlePreparationConditions> & {
		weather?: Partial<RPGBattleFieldCondition>,
		terrain?: Partial<RPGBattleFieldCondition>,
		initialHazards?: Partial<Record<RPGBattleTeam, Partial<RPGInitialHazardSide>>>,
		initialBuffs?: Partial<Record<RPGBattleTeam, Partial<RPGInitialBuffSide>>>,
		initialGlobalEffects?: Partial<RPGInitialGlobalEffects>,
	};
	rules?: Partial<RPGBattlePreparationRules>;
}

export interface RPGBattleParticipantController {
	participantId: string;
	controller: 'master' | 'player';
	characterId?: string;
}

export interface RPGBattleLaunchRequest {
	sessionId: string;
	format: RPGBattleFormat;
	participants: RPGBattleParticipant[];
	controllers: RPGBattleParticipantController[];
	rpg: RPGBattleState;
	captureContext: {
		turnNumber: number,
		isNight: boolean,
		isCave: boolean,
		isInWater: boolean,
	};
	allowSwitching: boolean;
	initialHazards: RPGInitialHazards;
	initialBuffs: RPGInitialBuffs;
	initialGlobalEffects: RPGInitialGlobalEffects;
}

export interface RPGBattleSessionRepository {
	create(session: RPGBattleSession): void;
	get(id: string): RPGBattleSession | undefined;
	set(session: RPGBattleSession): void;
	list(): RPGBattleSession[];
}

export class RPGMemoryBattleSessionRepository implements RPGBattleSessionRepository {
	private readonly sessions = new Map<string, RPGBattleSession>();
	create(session: RPGBattleSession): void {
		if (this.sessions.has(session.id)) throw new Error('RPG battle session already exists');
		this.sessions.set(session.id, structuredClone(session));
	}
	get(id: string): RPGBattleSession | undefined {
		const session = this.sessions.get(id);
		return session && structuredClone(session);
	}
	set(session: RPGBattleSession): void {
		if (!this.sessions.has(session.id)) throw new Error('Unknown RPG battle session');
		this.sessions.set(session.id, structuredClone(session));
	}
	list(): RPGBattleSession[] {
		return [...this.sessions.values()].map(session => structuredClone(session));
	}
}

export interface RPGBattleSessionServiceOptions {
	repository?: RPGBattleSessionRepository;
	now?: () => number;
	createId?: () => string;
	getCharacterTeam?: (characterId: string) => PokemonSet[] | undefined;
	isCharacterPokemonAvailable?: (characterId: string, teamIndex: number) => boolean;
	random?: () => number;
}

export class RPGBattleSessionService {
	readonly repository: RPGBattleSessionRepository;
	private readonly now: () => number;
	private readonly createId: () => string;
	private readonly getCharacterTeam: (characterId: string) => PokemonSet[] | undefined;
	private readonly isCharacterPokemonAvailable: (characterId: string, teamIndex: number) => boolean;
	private readonly random: () => number;

	constructor(options: RPGBattleSessionServiceOptions = {}) {
		this.repository = options.repository || new RPGMemoryBattleSessionRepository();
		this.now = options.now || Date.now;
		this.createId = options.createId || (() => Math.random().toString(36).slice(2));
		this.getCharacterTeam = options.getCharacterTeam || (() => undefined);
		this.isCharacterPokemonAvailable = options.isCharacterPokemonAvailable || (() => true);
		this.random = options.random || Math.random;
	}

	create(input: RPGCreateBattleSessionRequest = {}): RPGBattleSession {
		const now = this.now();
		const session: RPGBattleSession = {
			version: RPG_BATTLE_SESSION_VERSION,
			id: this.requireId(this.createId()),
			name: this.optionalName(input.name),
			status: 'draft',
			participants: [],
			conditions: {
				sceneId: 'meadow',
				weather: { id: '', duration: 'temporary', turns: 5 },
				terrain: { id: '', duration: 'temporary', turns: 5 },
				startingTurn: 1,
				timeOfDay: 'day',
				isCave: false,
				isInWater: false,
				initialHazards: {
					A: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
					B: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
				},
				initialBuffs: {
					A: { tailwind: false, reflect: false, lightScreen: false, auroraVeil: false, safeguard: false, mist: false },
					B: { tailwind: false, reflect: false, lightScreen: false, auroraVeil: false, safeguard: false, mist: false },
				},
				initialGlobalEffects: {
					trickRoom: false, magicRoom: false, wonderRoom: false, gravity: false,
					mudSport: false, waterSport: false, fairyLock: false, ionDeluge: false,
				},
			},
			rules: {
				canFlee: true,
				grantsExperience: true,
				allowSwitching: true,
				allowItems: true,
				playersChoosePokemon: false,
				wagerAmount: 0,
			},
			invitations: [],
			createdAt: now,
			updatedAt: now,
		};
		this.repository.create(session);
		return structuredClone(session);
	}

	get(id: string): RPGBattleSession {
		const session = this.repository.get(this.requireId(id));
		if (!session) throw new Error('Unknown RPG battle session');
		return session;
	}

	list(characterId?: string): RPGBattleSession[] {
		const id = characterId && toID(characterId);
		return this.repository.list()
			.filter(session => !id || (
				session.status === 'started' || (session.status !== 'draft' &&
					session.participants.some(participant => participant.characterId === id))
			))
			.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
	}

	update(id: string, input: RPGUpdateBattleSessionRequest): RPGBattleSession {
		const session = this.mutableDraft(id);
		if (input.name !== undefined) session.name = this.optionalName(input.name);
		if (input.format !== undefined) session.format = this.enumValue(input.format, [
			'singles', 'doubles', 'multi', 'triples', 'raid', 'boss',
		] as const, 'battle format');
		if (input.opponentType !== undefined) session.opponentType = this.enumValue(input.opponentType, [
			'player', 'npc', 'wild', 'boss', 'horde',
		] as const, 'opponent type');
		if (input.participants !== undefined) session.participants = this.participants(input.participants, session.format);
		if (input.conditions) session.conditions = this.conditions(session.conditions, input.conditions);
		if (input.rules) session.rules = this.rules(session.rules, input.rules);
		session.status = 'draft';
		session.invitations = [];
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	invite(id: string): RPGBattleSession {
		const session = this.mutableDraft(id);
		this.validateReadyConfiguration(session);
		const characterIds = [...new Set(session.participants
			.filter(participant => participant.kind === 'player')
			.map(participant => participant.characterId!))];
		session.invitations = characterIds.map(characterId => ({ characterId, response: 'pending' }));
		session.status = session.invitations.length ? 'inviting' : 'ready';
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	respond(id: string, characterId: string, response: Exclude<RPGInvitationResponse, 'pending'>): RPGBattleSession {
		const session = this.get(id);
		if (session.status !== 'inviting') throw new Error('RPG battle session is not accepting responses');
		const invitation = session.invitations.find(item => item.characterId === toID(characterId));
		if (!invitation) throw new Error('RPG character was not invited to this battle');
		if (invitation.response !== 'pending') throw new Error('RPG battle invitation was already answered');
		if (response === 'accepted') {
			const participants = session.participants.filter(item => item.characterId === invitation.characterId);
			if (participants.some(participant => !participant.pokemon.length)) {
				throw new Error('RPG player must select Pokemon before accepting the battle invitation');
			}
		}
		invitation.response = this.enumValue(response, ['accepted', 'declined'], 'invitation response');
		invitation.respondedAt = this.now();
		session.status = response === 'declined' ? 'declined' :
			session.invitations.every(item => item.response === 'accepted') ? 'ready' : 'inviting';
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	selectPokemon(id: string, characterId: string, pokemon: RPGBattleParticipantPokemon[]): RPGBattleSession {
		const session = this.get(id);
		if (session.status !== 'inviting') throw new Error('RPG battle session is not accepting selections');
		const normalizedCharacter = toID(characterId);
		const participant = session.participants.find(item =>
			item.kind === 'player' && item.characterId === normalizedCharacter
		);
		if (!participant) throw new Error('RPG character was not invited to this battle');
		const invitation = session.invitations.find(item => item.characterId === normalizedCharacter);
		if (!invitation || invitation.response !== 'pending') {
			throw new Error('RPG battle Pokemon selection must happen before answering the invitation');
		}
		if (!Array.isArray(pokemon) || !pokemon.length || pokemon.length > participant.selectionLimit) {
			throw new Error('RPG battle Pokemon selection must respect the participant limit');
		}
		const team = this.getCharacterTeam(normalizedCharacter);
		if (!team) throw new Error('Unknown RPG character');
		const indexes = pokemon.map(choice => choice.teamIndex);
		if (indexes.some(index => !Number.isSafeInteger(index) || index! < 0 || index! >= team.length)) {
			throw new Error('Invalid RPG character team Pokemon selection');
		}
		if (new Set(indexes).size !== indexes.length) {
			throw new Error('RPG character team Pokemon cannot be selected twice');
		}
		if (participant.allowedTeamIndexes?.length &&
			(indexes.length !== participant.selectionLimit || indexes.some(index => !participant.allowedTeamIndexes!.includes(index!)))) {
			throw new Error('Ordene somente todos os Pokémon inscritos neste torneio');
		}
		for (const teamIndex of indexes) this.requireAvailablePlayerPokemon(normalizedCharacter, teamIndex!);
		participant.pokemon = indexes.map(teamIndex => ({ teamIndex }));
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	start(id: string): { session: RPGBattleSession, launch: RPGBattleLaunchRequest } {
		const session = this.get(id);
		if (session.status !== 'ready') throw new Error('RPG battle session is not ready to start');
		this.validateReadyConfiguration(session);
		const now = this.now();
		session.status = 'started';
		session.startedAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return { session: structuredClone(session), launch: this.launchRequest(session) };
	}

	rollbackStart(id: string): RPGBattleSession {
		const session = this.get(id);
		if (session.status !== 'started') throw new Error('RPG battle session is not awaiting runtime rollback');
		session.status = 'ready';
		delete session.startedAt;
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	complete(id: string, result: RPGBattleResult): RPGBattleSession {
		const session = this.get(id);
		if (session.status === 'ended') return session;
		if (session.status !== 'started') throw new Error('RPG battle session is not active');
		const now = this.now();
		session.status = 'ended';
		session.result = structuredClone(result);
		session.endedAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return structuredClone(session);
	}

	cancel(id: string): RPGBattleSession {
		const session = this.get(id);
		if (session.status === 'started' || session.status === 'ended' || session.status === 'cancelled') {
			throw new Error('RPG battle session can no longer be cancelled');
		}
		const now = this.now();
		session.status = 'cancelled';
		session.cancelledAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return structuredClone(session);
	}

	private launchRequest(session: RPGBattleSession): RPGBattleLaunchRequest {
		const battleType = this.battleType(session.opponentType!);
		const weather = session.conditions.weather;
		const terrain = session.conditions.terrain;
		return {
			sessionId: session.id,
			format: session.format!,
			participants: structuredClone(session.participants),
			controllers: session.participants.map(participant => participant.kind === 'player' ? {
				participantId: participant.id, controller: 'player' as const, characterId: participant.characterId,
			} : {
				participantId: participant.id, controller: 'master' as const,
			}),
			rpg: {
				battleType,
				weather: weather.id || undefined,
				weatherDuration: weather.id && weather.duration === 'temporary' ? weather.turns : undefined,
				terrain: terrain.id || undefined,
				terrainDuration: terrain.id && terrain.duration === 'temporary' ? terrain.turns : undefined,
				modeRules: {
					[battleType]: {
						allowCapture: session.opponentType === 'wild' || session.opponentType === 'horde',
						allowFlee: session.rules.canFlee,
						allowBattleItems: session.rules.allowItems,
						experienceMultiplier: session.rules.grantsExperience ? undefined : 0,
					},
				},
			},
			captureContext: {
				turnNumber: session.conditions.startingTurn,
				isNight: session.conditions.timeOfDay === 'night',
				isCave: session.conditions.isCave,
				isInWater: session.conditions.isInWater,
			},
			allowSwitching: session.rules.allowSwitching,
			initialHazards: structuredClone(session.conditions.initialHazards),
			initialBuffs: structuredClone(session.conditions.initialBuffs),
			initialGlobalEffects: structuredClone(session.conditions.initialGlobalEffects),
		};
	}

	private validateReadyConfiguration(session: RPGBattleSession): void {
		if (!session.format) throw new Error('RPG battle format is required');
		if (!session.opponentType) throw new Error('RPG battle opponent type is required');
		for (const participant of session.participants.filter(entry => entry.kind !== 'player')) {
			for (const choice of participant.pokemon) {
				if (!choice.set) continue;
				if (session.format === 'raid' || session.format === 'boss') {
					choice.set.ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
				} else {
					choice.set.ivs ||= { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
				}
			}
		}
		for (const team of ['A', 'B'] as const) {
			if (!session.participants.some(participant => participant.team === team)) {
				throw new Error(`RPG battle team ${team} requires a participant`);
			}
		}
		const opponents = session.participants.filter(participant => participant.team === 'B');
		if (session.format === 'multi' && (session.opponentType === 'player' || session.opponentType === 'npc')) {
			const teamA = session.participants.filter(participant => participant.team === 'A');
			const teamB = session.participants.filter(participant => participant.team === 'B');
			if (teamA.length !== 2 || teamB.length !== 2) {
				throw new Error('RPG Multi battles require exactly two trainers on each team');
			}
			if (session.opponentType === 'npc' && !session.participants.some(participant => participant.kind === 'npc')) {
				throw new Error('RPG Multi battles against trainers require at least one NPC');
			}
		}
		if (!opponents.some(participant => participant.kind === session.opponentType)) {
			throw new Error('RPG battle opponent type does not match team B');
		}
		if (session.format === 'boss' && session.opponentType !== 'wild') {
			throw new Error('RPG Boss format requires a wild opponent');
		}
		if (session.rules.wagerAmount > 0 && session.opponentType !== 'player' && session.opponentType !== 'npc') {
			throw new Error('RPG wager is available only against a Player or NPC');
		}
		if (session.opponentType === 'npc' && (session.format === 'raid' || session.format === 'boss')) {
			throw new Error('RPG NPC battles support only singles, doubles, multi and triples');
		}
		const controlledOpponents = opponents.filter(participant => participant.kind !== 'player');
		const controlledPokemon = controlledOpponents.flatMap(participant => participant.pokemon);
		if (session.format === 'raid') {
			const raidPlayers = session.participants.filter(participant =>
				participant.team === 'A' && participant.kind === 'player'
			);
			if (session.opponentType !== 'wild' || controlledPokemon.length !== 1) {
				throw new Error('RPG Raid requires exactly one wild Pokemon on team B');
			}
			if (session.participants.some(participant => participant.team === 'A' && participant.kind !== 'player')) {
				throw new Error('RPG Raid team A accepts only player participants');
			}
			if (raidPlayers.length < 1 || raidPlayers.length > 3) {
				throw new Error('RPG Raid requires between one and three Player participants');
			}
		}
		if (session.format === 'boss') {
			if (controlledPokemon.length !== 1) throw new Error('RPG Boss requires exactly one wild Pokemon');
			const bossIds = new Set(getRPGBattlePokemonCatalog().filter(entry => entry.bossEligible).map(entry => entry.id));
			const set = controlledPokemon[0].set;
			if (!set || !bossIds.has(toID(set.species))) {
				throw new Error('RPG Boss accepts only eligible legendary or pseudo-legendary Pokemon');
			}
			if (!Number.isSafeInteger(set.level) || set.level < 1 || set.level > 999) {
				throw new Error('RPG Boss level must be between 1 and 999');
			}
		}
		if ((session.opponentType === 'wild' || session.opponentType === 'horde') && session.format !== 'boss') {
			const regularWildIds = new Set(getRPGBattlePokemonCatalog()
				.filter(entry => entry.regularWildEligible).map(entry => entry.id));
			if (controlledPokemon.some(choice => !choice.set || !regularWildIds.has(toID(choice.set.species)))) {
				throw new Error('RPG regular wild encounters do not accept legendary or mythical Pokemon');
			}
		}
		if (session.opponentType === 'wild' && session.format !== 'boss') {
			const expected = ({ singles: 1, doubles: 2, multi: 2, triples: 3, raid: 1 })[session.format];
			if (controlledPokemon.length !== expected) {
				throw new Error('RPG wild Pokemon count does not match the battle format');
			}
			if (controlledPokemon.some(choice => !Number.isSafeInteger(choice.set?.level) ||
				choice.set!.level < 1 || choice.set!.level > 100)) {
				throw new Error('RPG regular wild Pokemon level must be between 1 and 100');
			}
		}
		for (const participant of session.participants) {
			if (participant.kind === 'player') {
				for (const choice of participant.pokemon) {
					this.requireAvailablePlayerPokemon(participant.characterId!, choice.teamIndex!);
				}
			}
			const playerMayChoose = participant.kind === 'player';
			if (!playerMayChoose && !participant.pokemon.length) {
				throw new Error('RPG battle participant requires at least one selected Pokemon');
			}
		}
	}

	private requireAvailablePlayerPokemon(characterId: string, teamIndex: number): void {
		if (!this.isCharacterPokemonAvailable(characterId, teamIndex)) {
			throw new Error('Este Pok\u00e9mon est\u00e1 indispon\u00edvel e n\u00e3o pode participar da batalha');
		}
	}

	private participants(input: RPGBattleParticipant[], format?: RPGBattleFormat): RPGBattleParticipant[] {
		if (!Array.isArray(input) || input.length < 1 || input.length > 12) {
			throw new Error('RPG battle requires between 1 and 12 participants');
		}
		const ids = new Set<string>();
		return input.map((raw, index) => {
			const id = this.requireId(raw.id || `participant-${index + 1}`);
			if (ids.has(id)) throw new Error('RPG battle participant IDs must be unique');
			ids.add(id);
			const kind = this.enumValue(raw.kind, ['player', 'npc', 'wild', 'boss', 'horde'], 'participant kind');
			const team = this.enumValue(raw.team, ['A', 'B'], 'participant team');
			const selectionLimit = this.integer(
				raw.selectionLimit, 1, kind === 'player' ? 6 : 24, 'Pokemon selection limit'
			);
			const characterId = raw.characterId && toID(raw.characterId);
			const pokemon = Array.isArray(raw.pokemon) ? structuredClone(raw.pokemon) : [];
			if (pokemon.length > selectionLimit) throw new Error('RPG battle Pokemon selection exceeds its limit');
			let allowedTeamIndexes: number[] | undefined;
			if (kind === 'player') {
				if (!characterId) throw new Error('RPG player participant requires a character');
				const selectedIndexes = pokemon.map(choice => choice.teamIndex!);
				if (new Set(selectedIndexes).size !== selectedIndexes.length) {
					throw new Error('RPG character team Pokemon cannot be selected twice');
				}
				const teamSets = this.getCharacterTeam(characterId);
				if (!teamSets) throw new Error('Unknown RPG character');
				for (const choice of pokemon) {
					if (!Number.isSafeInteger(choice.teamIndex) || choice.teamIndex! < 0 || choice.teamIndex! >= teamSets.length) {
						throw new Error('Invalid RPG character team Pokemon selection');
					}
					this.requireAvailablePlayerPokemon(characterId, choice.teamIndex!);
					delete choice.set;
					delete choice.shinyMode;
				}
				allowedTeamIndexes = Array.isArray(raw.allowedTeamIndexes) ? raw.allowedTeamIndexes.map(value =>
					this.integer(value, 0, teamSets.length - 1, 'allowed team index')) : undefined;
				if (allowedTeamIndexes?.length && new Set(allowedTeamIndexes).size !== allowedTeamIndexes.length) {
					throw new Error('RPG allowed character Pokemon cannot be repeated');
				}
			} else {
				for (const choice of pokemon) {
					if (!choice.set?.species) throw new Error('RPG controlled participant Pokemon requires a set');
					const defaultShinyMode = format !== 'boss' && (kind === 'wild' || kind === 'horde') ? 'random' : 'disabled';
					choice.shinyMode = this.enumValue(
						choice.shinyMode || defaultShinyMode,
						['random', 'guaranteed', 'disabled'] as const,
						'controlled Pokemon shiny mode'
					);
					choice.set = this.prepareControlledPokemon(choice.set, kind, choice.shinyMode);
					delete choice.teamIndex;
				}
			}
			return {
				id, team, kind, characterId: kind === 'player' ? characterId : undefined,
				avatar: raw.avatar ? this.requiredText(raw.avatar, 'participant avatar', 80) : undefined,
				displayName: this.requiredText(raw.displayName, 'participant name', 80),
				npcRole: kind === 'npc' ? this.enumValue(
					raw.npcRole || 'generic', ['generic', 'gym-leader', 'elite-four'] as const, 'NPC battle role'
				) : undefined,
				selectionLimit, allowedTeamIndexes, pokemon,
			};
		});
	}

	private prepareControlledPokemon(
		input: PokemonSet, kind: RPGBattleParticipantKind,
		shinyMode: NonNullable<RPGBattleParticipantPokemon['shinyMode']>
	): PokemonSet {
		const set = structuredClone(input);
		const dex = Dex.mod('gen9');
		const species = dex.species.get(set.species);
		if (!species.exists) throw new Error('Invalid RPG controlled Pokemon species');
		const level = set.level ?? 5;
		if (!Number.isSafeInteger(level) || level < 1 || level > 999) {
			throw new Error('RPG controlled Pokemon level must be between 1 and 999');
		}
		set.level = level;
		set.name ||= species.name;
		if (set.gender) {
			if (!getRPGAllowedSexes(species.name).includes(set.gender as import('../../sim/rpg-showdown').RPGPokemonSex)) {
				throw new Error('RPG controlled Pokemon gender is not allowed for this species');
			}
		} else {
			set.gender = rollRPGPokemonSex(species.name, this.random);
		}
		if (!set.ability) {
			if (kind === 'wild' || kind === 'horde') {
				const normalAbilities = [species.abilities['0'], species.abilities['1']].filter(Boolean);
				const hiddenAbility = species.abilities['H'];
				const chooseHidden = !!hiddenAbility && this.randomIndex(3) === 2;
				const choices = chooseHidden ? [hiddenAbility] : normalAbilities;
				set.ability = choices[this.randomIndex(choices.length)] || hiddenAbility || species.abilities['0'];
			} else {
				set.ability = species.abilities['0'];
			}
		}
		if (!set.nature) {
			const natures = dex.natures.all();
			set.nature = ['wild', 'boss', 'horde'].includes(kind) ?
				natures[this.randomIndex(natures.length)].name : 'Hardy';
		}
		if (!set.item && ['wild', 'boss', 'horde'].includes(kind)) {
			set.item = this.randomWildHeldItem();
		}
		set.ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
		set.evs = this.randomEVs();
		set.moves = this.generationNineLevelMoves(species.id, level);
		set.shiny = shinyMode === 'guaranteed' || (shinyMode === 'random' && this.randomIndex(4096) === 0);
		return set;
	}

	private randomEVs(): StatsTable {
		const values = [0, 0, 0, 0, 0, 0];
		const available = [0, 1, 2, 3, 4, 5];
		for (let units = 0; units < 127; units++) {
			const position = this.randomIndex(available.length);
			const stat = available[position];
			values[stat]++;
			if (values[stat] === 63) available.splice(position, 1);
		}
		return {
			hp: values[0] * 4, atk: values[1] * 4, def: values[2] * 4,
			spa: values[3] * 4, spd: values[4] * 4, spe: values[5] * 4,
		};
	}

	private randomWildHeldItem(): string {
		const dex = Dex.mod('gen9');
		const evolutionItems = new Set(
			dex.species.all().flatMap(species => species.evoItem ? [toID(species.evoItem)] : [])
		);
		const eligible = dex.items.all().filter(item => (
			item.exists && !item.isNonstandard && !item.isPokeball &&
			!RPG_EXCLUDED_IV_EV_ITEM_IDS.has(item.id) &&
			!RPG_BREEDING_ONLY_HELD_ITEM_IDS.has(item.id) &&
			!item.megaStone && !item.zMove && !item.isPrimalOrb &&
			!item.forcedForme && !item.onPlate && !item.onMemory && !item.onDrive &&
			!evolutionItems.has(item.id)
		));
		const consumable = eligible.filter(item => (
			item.isBerry || item.isGem || Object.values(item).some(value => (
				typeof value === 'function' &&
				/(?:\.useItem|\.eatItem)\(|\.item\s*=\s*(['"])\1/.test(String(value))
			))
		));
		const roll = this.randomIndex(100);
		const pool = roll < 50 ? consumable : roll === 50 ?
			eligible.filter(item => !consumable.includes(item)) : [];
		return pool.length ? pool[this.randomIndex(pool.length)].name : '';
	}

	private generationNineLevelMoves(speciesId: ID, level: number): string[] {
		const dex = Dex.mod('gen9');
		const byGeneration = new Map<number, Map<string, number>>();
		for (const data of dex.species.getFullLearnset(speciesId)) {
			for (const [move, sources] of Object.entries(data.learnset)) {
				for (const source of sources) {
					const match = /^(\d+)L(\d+)$/.exec(source);
					if (!match || Number(match[2]) > level) continue;
					const generation = Number(match[1]);
					if (generation > 9) continue;
					const learnedAt = Number(match[2]);
					const learned = byGeneration.get(generation) || new Map<string, number>();
					learned.set(move, Math.max(learned.get(move) ?? 0, learnedAt));
					byGeneration.set(generation, learned);
				}
			}
		}
		const generation = [...byGeneration.keys()].sort((a, b) => b - a)[0];
		const learned = byGeneration.get(generation) || new Map<string, number>();
		const pool = [...learned].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
			.map(([id, learnedAt]) => ({ id, learnedAt, damaging: dex.moves.get(id).category !== 'Status' }));
		const damaging = pool.filter(move => move.damaging);
		if (!pool.length) throw new Error('RPG controlled Pokemon has no level-up moves at this level');
		if (pool.length <= 4) return pool.map(move => move.id);
		const selected = this.shuffle(damaging).slice(0, Math.min(2, damaging.length));
		const selectedIds = new Set(selected.map(move => move.id));
		selected.push(...this.shuffle(pool.filter(move => !selectedIds.has(move.id))).slice(0, 4 - selected.length));
		return this.shuffle(selected).map(move => move.id);
	}

	private shuffle<T>(values: readonly T[]): T[] {
		const result = [...values];
		for (let index = result.length - 1; index > 0; index--) {
			const target = this.randomIndex(index + 1);
			[result[index], result[target]] = [result[target], result[index]];
		}
		return result;
	}

	private randomIndex(length: number): number {
		const random = this.random();
		if (!Number.isFinite(random) || random < 0 || random >= 1) {
			throw new Error('RPG random source must return a value from 0 to below 1');
		}
		return Math.floor(random * length);
	}

	private conditions(
		current: RPGBattlePreparationConditions,
		input: RPGUpdateBattleSessionRequest['conditions']
	): RPGBattlePreparationConditions {
		const next = structuredClone(current);
		next.initialHazards ||= {
			A: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
			B: { spikes: 0, stealthRock: false, toxicSpikes: 0 },
		};
		next.initialBuffs ||= {
			A: { tailwind: false, reflect: false, lightScreen: false, auroraVeil: false, safeguard: false, mist: false },
			B: { tailwind: false, reflect: false, lightScreen: false, auroraVeil: false, safeguard: false, mist: false },
		};
		next.initialGlobalEffects ||= {
			trickRoom: false, magicRoom: false, wonderRoom: false, gravity: false,
			mudSport: false, waterSport: false, fairyLock: false, ionDeluge: false,
		};
		if (!input) return next;
		if (input.sceneId !== undefined) {
			const sceneId = this.requireId(input.sceneId);
			const scene = getRPGBattleScene(sceneId);
			if (!scene) throw new Error('Invalid RPG battle scene');
			next.sceneId = scene.id;
			next.isCave = scene.isCave;
			next.isInWater = scene.isInWater;
		}
		if (input.weather) next.weather = this.fieldCondition('weather', next.weather, input.weather);
		if (input.terrain) next.terrain = this.fieldCondition('terrain', next.terrain, input.terrain);
		if (input.initialHazards) {
			for (const team of ['A', 'B'] as const) {
				const hazards = input.initialHazards[team];
				if (!hazards) continue;
				if (hazards.spikes !== undefined) next.initialHazards[team].spikes = this.integer(hazards.spikes, 0, 3, `${team} Spikes`);
				if (hazards.stealthRock !== undefined) next.initialHazards[team].stealthRock = this.boolean(hazards.stealthRock, `${team} Stealth Rock`);
				if (hazards.toxicSpikes !== undefined) next.initialHazards[team].toxicSpikes = this.integer(hazards.toxicSpikes, 0, 2, `${team} Toxic Spikes`);
			}
		}
		if (input.initialBuffs) {
			for (const team of ['A', 'B'] as const) {
				const buffs = input.initialBuffs[team];
				if (!buffs) continue;
				for (const key of ['tailwind', 'reflect', 'lightScreen', 'auroraVeil', 'safeguard', 'mist'] as const) {
					if (buffs[key] !== undefined) next.initialBuffs[team][key] = this.boolean(buffs[key], `${team} initial ${key}`);
				}
			}
		}
		if (input.initialGlobalEffects) {
			for (const key of [
				'trickRoom', 'magicRoom', 'wonderRoom', 'gravity',
				'mudSport', 'waterSport', 'fairyLock', 'ionDeluge',
			] as const) {
				if (input.initialGlobalEffects[key] !== undefined) {
					next.initialGlobalEffects[key] = this.boolean(input.initialGlobalEffects[key], `initial ${key}`);
				}
			}
		}
		if (input.startingTurn !== undefined) next.startingTurn = this.integer(input.startingTurn, 1, 999999, 'starting turn');
		if (input.timeOfDay !== undefined) next.timeOfDay = this.enumValue(input.timeOfDay, ['day', 'night'], 'time of day');
		// Compatibility with saved requests created before scene selection existed.
		if (input.sceneId === undefined && input.isCave !== undefined) {
			next.isCave = this.boolean(input.isCave, 'cave condition');
		}
		if (input.sceneId === undefined && input.isInWater !== undefined) {
			next.isInWater = this.boolean(input.isInWater, 'water condition');
		}
		return next;
	}

	private fieldCondition(
		kind: 'weather' | 'terrain', current: RPGBattleFieldCondition, input: Partial<RPGBattleFieldCondition>
	): RPGBattleFieldCondition {
		const allowed = kind === 'weather' ? ['', 'sunnyday', 'raindance', 'sandstorm', 'snow'] as const :
			['', 'electricterrain', 'grassyterrain', 'psychicterrain', 'mistyterrain'] as const;
		const next = structuredClone(current);
		if (input.id !== undefined) next.id = this.enumValue(input.id, allowed, `${kind} condition`);
		if (input.duration !== undefined) next.duration = this.enumValue(input.duration, ['temporary', 'permanent'], `${kind} duration`);
		if (input.turns !== undefined) next.turns = this.integer(input.turns, 1, 1000, `${kind} turns`);
		return next;
	}

	private rules(current: RPGBattlePreparationRules, input: Partial<RPGBattlePreparationRules>): RPGBattlePreparationRules {
		const next = structuredClone(current);
		next.wagerAmount ??= 0;
		for (const key of ['canFlee', 'grantsExperience', 'allowSwitching', 'allowItems', 'playersChoosePokemon'] as const) {
			if (input[key] !== undefined) next[key] = this.boolean(input[key], key);
		}
		if (input.wagerAmount !== undefined) next.wagerAmount = this.integer(input.wagerAmount, 0, 10_000_000, 'wager amount');
		return next;
	}

	private mutableDraft(id: string): RPGBattleSession {
		const session = this.get(id);
		if (session.status === 'started' || session.status === 'ended' || session.status === 'cancelled') {
			throw new Error('RPG battle session can no longer be edited');
		}
		return session;
	}
	private battleType(opponent: RPGBattleOpponentType): RPGBattleType {
		if (opponent === 'wild' || opponent === 'horde') return 'wild';
		if (opponent === 'player') return 'trainer';
		return opponent;
	}
	private requireId(value: string): string {
		const id = toID(value);
		if (!id) throw new Error('Invalid RPG battle session identifier');
		return id;
	}
	private optionalName(value: string | undefined): string {
		if (value === undefined || value.trim() === '') return '';
		return this.requiredText(value, 'battle name', 100);
	}
	private requiredText(value: string, label: string, maximum: number): string {
		if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
			throw new Error(`RPG ${label} must contain between 1 and ${maximum} characters`);
		}
		return value.trim();
	}
	private integer(value: number, minimum: number, maximum: number, label: string): number {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
			throw new Error(`RPG ${label} must be an integer between ${minimum} and ${maximum}`);
		}
		return value;
	}
	private boolean(value: boolean, label: string): boolean {
		if (typeof value !== 'boolean') throw new Error(`RPG ${label} must be a boolean`);
		return value;
	}
	private enumValue<T extends string>(value: T, allowed: readonly T[], label: string): T {
		if (!allowed.includes(value)) throw new Error(`Invalid RPG ${label}`);
		return value;
	}
}
