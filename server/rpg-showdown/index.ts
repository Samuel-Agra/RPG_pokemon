import {
	createHash,
	randomBytes as secureRandomBytes,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Dex } from "../../sim/dex";
import { toID } from "../../sim/dex-data";
import type { PokemonSet } from "../../sim/teams";
import {
	canRPGPokemonBreedAtCurrentStage,
	getExperienceForLevel,
	getRPGAllowedSexes,
	getRPGPokemonSizeClass,
	getSpeciesExperience,
	RPGBagSystem,
	RPGBoxSystem,
	RPGShopSystem,
	RPGInventorySystem,
	RPGItemUseSystem,
	RPGItems,
	RPG_STATE_VERSION,
	type RPGBattleResult,
	type RPGBoxState,
	type RPGCapturedPokemon,
	type RPGInventoryState,
	type RPGItemDefinition,
	type RPGShopTransaction,
} from "../../sim/rpg-showdown";
import {
	RPGBattleSessionService,
	type RPGBattleSession,
	type RPGBattleSessionRepository,
	type RPGCreateBattleSessionRequest,
	type RPGUpdateBattleSessionRequest,
	type RPGBattleLaunchRequest,
} from './battle-session';
import {
	RPGContestSessionService,
	type RPGContestSession,
	type RPGContestSessionRepository,
	type RPGCreateContestSessionRequest,
	type RPGUpdateContestSessionRequest,
} from './contest-session';
import {
	RPGBoxManagement,
	type RPGBoxManagementView,
	type RPGBoxMasterEdit,
	type RPGBoxMoveInput,
	type RPGBoxPokemonMetadata,
	type RPGBoxQuery,
	type RPGManagedStoredPokemon,
	type RPGItemEvolutionOption,
	type RPGItemEvolutionResult,
	type RPGTechnicalMachineTarget,
	type RPGTechnicalMachineResult,
	type RPGEVTrainingResult,
} from './box-management';
import {
	RPGBagManagement,
	type RPGManagedBagCategory,
	type RPGManagedBagContext,
	type RPGManagedBagItemView,
	type RPGManagedBagView,
	type RPGManagedBagTargetsView,
} from './bag-management';
import { getRPGItemIconPath } from './item-icons';
import {
	RPGTeamBuilderManagement,
	RPG_IV_VITAMINS,
	type RPGTeamBuilderManagementView,
} from './team-builder-management';
import { getRPGMoveMetadata, type RPGMoveMetadata } from './battle-move-analysis';
import {
	RPGFossilLab, type RPGFossilLabState, type RPGFossilMethod, type RPGFossilQuality,
} from './fossil-lab';
import {
	RPGNurseryGenetics, RPG_NURSERY_BREEDING_ITEMS, RPG_NURSERY_PARENT_RESCUE_TIME_MS,
	type RPGNurseryCharacterState, type RPGNurseryMasterPokemonInput,
	type RPGNurseryMasterSlot1Input, type RPGNurseryMasterSlot2Input,
	type RPGNurseryParent, type RPGNurseryProject,
} from './nursery';
import { RPGIncubation } from './incubation';
import {
	RPGFileCustomItemRepository,
	RPGMemoryCustomItemRepository,
	type RPGCustomItemRepository,
} from './custom-item-repository';
import {
	RPGCommerceManagement,
	RPGFileCommerceRepository,
	RPGMemoryCommerceRepository,
	type RPGCommerceBulkInput,
	type RPGCommerceOfferInput,
	type RPGCommerceRepository,
	type RPGCommerceTradeRequest,
} from './shop-management';

export * from './battle-session';
export * from './contest-session';
export * from './contest-move-catalog';
export * from './box-management';
export * from './bag-management';
export * from './team-builder-management';
export * from './custom-item-repository';
export * from './nursery';
export * from './incubation';
export * from './pokemon-catalog';
export * from './fossil-lab';
export * from './shop-management';

export const RPG_ACCOUNT_VERSION = 4;
export const RPG_SESSION_VERSION = 1;
export const RPG_DEFAULT_SESSION_TTL = 24 * 60 * 60 * 1000;
export const RPG_NURSERY_BREEDING_BASE_FEE = 5_000;
export const RPG_NURSERY_LOCAL_INCUBATION_FEE = 5_000;
const RPG_NURSERY_SHOP_ITEM_IDS = Object.freeze([
	'portableincubator', 'everstone', 'destinyknot',
	'powerweight', 'powerbracer', 'powerbelt', 'powerlens', 'powerband', 'poweranklet',
] as const);

export const RPG_DELETE_CHALLENGE_TTL = 2 * 60 * 1000;
const RPG_DELETE_WORDS = [
	'Pikachu', 'Squirtle', 'Charizard', 'Bulbasaur', 'Pokebola',
	'Pokedex', 'MasterBall', 'Kanto', 'Johto', 'Hoenn',
	'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea',
] as const;

const RPG_HATCH_BALL_PRIORITY = [
	'pokeball', 'premierball', 'healball', 'greatball', 'ultraball',
	'nestball', 'repeatball', 'timerball', 'quickball', 'duskball', 'diveball', 'netball',
	'luxuryball', 'friendball', 'loveball', 'lureball', 'levelball', 'heavyball', 'fastball',
	'moonball', 'dreamball', 'sportball', 'safariball', 'beastball', 'parkball',
	'strangeball', 'cherishball', 'masterball',
] as const;

export type RPGAccountRole = 'master' | 'player';
export type RPGSessionMode = 'master' | 'player';
export type RPGCharacterGender = 'M' | 'F' | 'N';

export interface RPGCharacterSelection {
	id: string;
	characterName: string;
	playerName: string;
	avatar: string;
}

export interface RPGCharacterPageAccess {
	bag: boolean;
	box: boolean;
	training: boolean;
	center: boolean;
	fossils: boolean;
	nursery: boolean;
	shops: boolean;
}

export interface RPGCampaignTimeAdvanceResult {
	hours: 1 | 8;
	milliseconds: number;
	charactersAffected: number;
	fossils: { advanced: number, completed: number };
	trainings: { advanced: number, completed: number };
	breedings: { advanced: number, completed: number };
	incubations: { advanced: number, completed: number };
}
export interface RPGTeamEggView {
	eggId: string;
	name: 'Egg';
	species: 'Egg';
	virtual: true;
	status: 'carried' | 'incubating' | 'ready_to_hatch';
	progress: number;
	remainingIncubationTimeMs: number;
	incubatorId?: string;
	portableIncubator: boolean;
	portableIncubatorId?: string;
}

export interface RPGCharacterState extends RPGCharacterSelection {
	version: number;
	pageAccess: RPGCharacterPageAccess;
	shopAccess?: Record<string, boolean>;
	money: number;
	team: PokemonSet[];
	/** Presentation-only Eggs that reserve party slots; never persisted as battle Pokémon. */
	teamEggs?: RPGTeamEggView[];
	portableIncubators?: {id: string, loaded: boolean, eggId?: string, mission?: boolean}[];
	box: RPGBoxState;
	inventory: RPGInventoryState;
	fossilLab?: RPGFossilLabState;
	nursery?: RPGNurseryCharacterState;
	shopRevision?: number;
	shopTransactions?: RPGShopTransaction[];
	createdAt: number;
	updatedAt: number;
}

interface RPGCredential {
	algorithm: 'scrypt';
	salt: string;
	hash: string;
}

export interface RPGStoredCharacter {
	state: RPGCharacterState;
	credential: RPGCredential;
}

export interface RPGCreateCharacterRequest {
	characterName: string;
	playerName: string;
	avatar: string;
	password: string;
	initialMoney: number;
	starter: {
		species: string,
		nickname?: string,
		gender: RPGCharacterGender,
		level?: number,
	};
}

export interface RPGSession {
	version: number;
	token: string;
	role: RPGAccountRole;
	mode: RPGSessionMode;
	characterId?: string;
	viewAsCharacterId?: string;
	createdAt: number;
	expiresAt: number;
}

type RPGInternalSession = Omit<RPGSession, 'token'>;

export interface RPGCharacterDeletionChallenge {
	challengeId: string;
	characterId: string;
	word: string;
	expiresAt: number;
}

export interface RPGCharacterDeletionResult {
	characterId: string;
	session: RPGSession;
}

interface RPGInternalDeletionChallenge extends RPGCharacterDeletionChallenge {
	sessionKey: string;
}

export interface RPGPokemonReleaseChallenge {
	challengeId: string;
	characterId: string;
	pokemonId: string;
	pokemonName: string;
	expiresAt: number;
}

interface RPGInternalPokemonReleaseChallenge extends RPGPokemonReleaseChallenge {
	sessionKey: string;
	expectedRevision: number;
}

export type RPGPermission =
	'characters:list-all' | 'character:read' | 'character:edit' |
	'team:read' | 'team:edit' | 'box:read' | 'box:edit' |
	'bag:read' | 'bag:edit' | 'money:read' | 'money:edit' |
	'battle:start' | 'battle:control-wild' | 'battle:control-npc' |
	'battle:observe-all' | 'session:view-as-player';

const MASTER_PERMISSIONS = new Set<RPGPermission>([
	'characters:list-all', 'character:read', 'character:edit',
	'team:read', 'team:edit', 'box:read', 'box:edit',
	'bag:read', 'bag:edit', 'money:read', 'money:edit',
	'battle:start', 'battle:control-wild', 'battle:control-npc',
	'battle:observe-all', 'session:view-as-player',
]);
const PLAYER_PERMISSIONS = new Set<RPGPermission>([
	'character:read', 'team:read', 'team:edit', 'box:read', 'box:edit', 'bag:read', 'bag:edit',
	'money:read', 'battle:start',
]);

export interface RPGCharacterRepository {
	create(record: RPGStoredCharacter): void;
	get(id: string): RPGStoredCharacter | undefined;
	delete(id: string): boolean;
	set(record: RPGStoredCharacter): void;
	list(): RPGStoredCharacter[];
}

export class RPGMemoryCharacterRepository implements RPGCharacterRepository {
	private readonly records = new Map<string, RPGStoredCharacter>();

	create(record: RPGStoredCharacter): void {
		if (this.records.has(record.state.id)) throw new Error('RPG character already exists');
		this.records.set(record.state.id, structuredClone(record));
	}
	get(id: string): RPGStoredCharacter | undefined {
		const record = this.records.get(toID(id));
		return record && structuredClone(record);
	}
	set(record: RPGStoredCharacter): void {
		if (!this.records.has(record.state.id)) throw new Error('Unknown RPG character');
		this.records.set(record.state.id, structuredClone(record));
	}
	delete(id: string): boolean {
		return this.records.delete(toID(id));
	}
	list(): RPGStoredCharacter[] {
		return [...this.records.values()].map(record => structuredClone(record));
	}
}

interface RPGCharacterFileData {
	version: 1;
	characters: RPGStoredCharacter[];
}

export class RPGFileCharacterRepository implements RPGCharacterRepository {
	private readonly records = new Map<string, RPGStoredCharacter>();
	readonly filePath: string;

	constructor(filePath = resolve('config/rpg-characters.json')) {
		this.filePath = resolve(filePath);
		if (!existsSync(this.filePath)) return;
		const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RPGCharacterFileData>;
		if (raw.version !== 1 || !Array.isArray(raw.characters)) {
			throw new Error('Invalid RPG character persistence file');
		}
		for (const record of raw.characters) {
			if (!record?.state?.id || !record.credential) throw new Error('Invalid RPG character persistence record');
			this.records.set(toID(record.state.id), structuredClone(record));
		}
	}

	create(record: RPGStoredCharacter): void {
		const id = toID(record.state.id);
		if (this.records.has(id)) throw new Error('RPG character already exists');
		this.records.set(id, structuredClone(record));
		this.persist();
	}
	get(id: string): RPGStoredCharacter | undefined {
		const record = this.records.get(toID(id));
		return record && structuredClone(record);
	}
	set(record: RPGStoredCharacter): void {
		const id = toID(record.state.id);
		const previous = this.records.get(id);
		if (!previous) throw new Error('Unknown RPG character');
		this.records.set(id, structuredClone(record));
		try {
			this.persist();
		} catch (error) {
			this.records.set(id, previous);
			throw error;
		}
	}	delete(id: string): boolean {
		const deleted = this.records.delete(toID(id));
		if (deleted) this.persist();
		return deleted;
	}
	list(): RPGStoredCharacter[] {
		return [...this.records.values()].map(record => structuredClone(record));
	}

	private persist(): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temporary = this.filePath + '.tmp';
		const data: RPGCharacterFileData = { version: 1, characters: [...this.records.values()] };
		writeFileSync(temporary, JSON.stringify(data, null, '	') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
}

interface RPGBattleSessionFileData {
	version: 1;
	sessions: RPGBattleSession[];
}

interface RPGContestSessionFileData {
	version: 1;
	sessions: RPGContestSession[];
}

/** Atomic JSON persistence for contest preparation and invitations. */
export class RPGFileContestSessionRepository implements RPGContestSessionRepository {
	private readonly sessions = new Map<string, RPGContestSession>();
	readonly filePath: string;

	constructor(filePath = resolve('config/rpg-contest-sessions.json')) {
		this.filePath = resolve(filePath);
		if (!existsSync(this.filePath)) return;
		const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RPGContestSessionFileData>;
		if (raw.version !== 1 || !Array.isArray(raw.sessions)) {
			throw new Error('Invalid RPG contest session persistence file');
		}
		for (const session of raw.sessions) {
			if (!session?.id) throw new Error('Invalid RPG contest session persistence record');
			this.sessions.set(toID(session.id), structuredClone(session));
		}
	}

	create(session: RPGContestSession): void {
		const id = toID(session.id);
		if (this.sessions.has(id)) throw new Error('RPG contest session already exists');
		this.sessions.set(id, structuredClone(session));
		try {
			this.persist();
		} catch (error) {
			this.sessions.delete(id);
			throw error;
		}
	}
	get(id: string): RPGContestSession | undefined {
		const session = this.sessions.get(toID(id));
		return session && structuredClone(session);
	}
	set(session: RPGContestSession): void {
		const id = toID(session.id);
		const previous = this.sessions.get(id);
		if (!previous) throw new Error('Unknown RPG contest session');
		this.sessions.set(id, structuredClone(session));
		try {
			this.persist();
		} catch (error) {
			this.sessions.set(id, previous);
			throw error;
		}
	}
	list(): RPGContestSession[] {
		return [...this.sessions.values()].map(session => structuredClone(session));
	}
	private persist(): void {
		mkdirSync(dirname(this.filePath), {recursive: true});
		const temporary = this.filePath + '.tmp';
		const data: RPGContestSessionFileData = {version: 1, sessions: [...this.sessions.values()]};
		writeFileSync(temporary, JSON.stringify(data, null, '\t') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
}

/** Atomic JSON persistence for battle preparation, invitations, results and recovery. */
export class RPGFileBattleSessionRepository implements RPGBattleSessionRepository {
	private readonly sessions = new Map<string, RPGBattleSession>();
	readonly filePath: string;

	constructor(filePath = resolve('config/rpg-battle-sessions.json')) {
		this.filePath = resolve(filePath);
		if (!existsSync(this.filePath)) return;
		const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RPGBattleSessionFileData>;
		if (raw.version !== 1 || !Array.isArray(raw.sessions)) {
			throw new Error('Invalid RPG battle session persistence file');
		}
		for (const session of raw.sessions) {
			if (!session?.id) throw new Error('Invalid RPG battle session persistence record');
			this.sessions.set(toID(session.id), structuredClone(session));
		}
	}

	create(session: RPGBattleSession): void {
		const id = toID(session.id);
		if (this.sessions.has(id)) throw new Error('RPG battle session already exists');
		this.sessions.set(id, structuredClone(session));
		try {
			this.persist();
		} catch (error) {
			this.sessions.delete(id);
			throw error;
		}
	}

	get(id: string): RPGBattleSession | undefined {
		const session = this.sessions.get(toID(id));
		return session && structuredClone(session);
	}

	set(session: RPGBattleSession): void {
		const id = toID(session.id);
		const previous = this.sessions.get(id);
		if (!previous) throw new Error('Unknown RPG battle session');
		this.sessions.set(id, structuredClone(session));
		try {
			this.persist();
		} catch (error) {
			this.sessions.set(id, previous);
			throw error;
		}
	}

	list(): RPGBattleSession[] {
		return [...this.sessions.values()].map(session => structuredClone(session));
	}

	private persist(): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temporary = this.filePath + '.tmp';
		const data: RPGBattleSessionFileData = { version: 1, sessions: [...this.sessions.values()] };
		writeFileSync(temporary, JSON.stringify(data, null, '	') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
}
export interface RPGLoginServiceOptions {
	masterCode: string;
	repository?: RPGCharacterRepository;
	battleSessionRepository?: RPGBattleSessionRepository;
	contestSessionRepository?: RPGContestSessionRepository;
	customItemRepository?: RPGCustomItemRepository;
	commerceRepository?: RPGCommerceRepository;
	sessionTtlMs?: number;
	now?: () => number;
	random?: () => number;
	randomBytes?: (size: number) => Buffer;
}

export class RPGLoginService {
	readonly repository: RPGCharacterRepository;
	readonly battleSessions: RPGBattleSessionService;
	readonly contestSessions: RPGContestSessionService;
	readonly customItems: RPGCustomItemRepository;
	readonly commerce: RPGCommerceManagement;
	private readonly sessions = new Map<string, RPGInternalSession>();
	private readonly masterCodeHash: Buffer;
	private readonly deletionChallenges = new Map<string, RPGInternalDeletionChallenge>();
	private readonly lastDeletionWord = new Map<string, string>();
	private readonly pokemonReleaseChallenges = new Map<string, RPGInternalPokemonReleaseChallenge>();
	private readonly sessionTtlMs: number;
	private readonly now: () => number;
	private readonly random: () => number;
	private readonly bytes: (size: number) => Buffer;

	constructor(options: RPGLoginServiceOptions) {
		if (typeof options.masterCode !== 'string' || !options.masterCode) {
			throw new Error('RPG master code must be configured');
		}
		this.repository = options.repository || new RPGMemoryCharacterRepository();
		this.customItems = options.customItemRepository || new RPGMemoryCustomItemRepository();
		this.commerce = new RPGCommerceManagement(options.commerceRepository || new RPGMemoryCommerceRepository());
		for (const item of this.customItems.list()) {
			const existing = RPGItems.get(item.id);
			if (!existing) RPGItems.register(item);
			else if (JSON.stringify(existing) !== JSON.stringify(item)) {
				throw new Error('RPG custom item conflicts with the item registry: ' + item.id);
			}
		}
		this.masterCodeHash = createHash('sha256').update(options.masterCode).digest();
		this.sessionTtlMs = options.sessionTtlMs ?? RPG_DEFAULT_SESSION_TTL;
		if (!Number.isSafeInteger(this.sessionTtlMs) || this.sessionTtlMs < 1) {
			throw new Error('RPG session TTL must be a positive integer');
		}
		this.now = options.now || Date.now;
		this.random = options.random || Math.random;
		this.bytes = options.randomBytes || secureRandomBytes;
		this.battleSessions = new RPGBattleSessionService({
			repository: options.battleSessionRepository,
			now: this.now,
			createId: () => this.bytes(18).toString('base64url'),
			getCharacterTeam: characterId => {
				const record = this.repository.get(characterId);
				if (!record) return undefined;
				this.resolveCompletedEVTrainings(record);
				return record.state.team;
			},
			isCharacterPokemonAvailable: (characterId, teamIndex) => {
				const record = this.repository.get(characterId);
				if (!record) return false;
				this.resolveCompletedEVTrainings(record);
				const pokemon = record.state.box.party[teamIndex];
				return !!pokemon && !pokemon.metadata?.evTraining &&
					!this.isPokemonBreeding(record.state.id, pokemon.pokemonId);
			},
			random: this.random,
		});
		this.contestSessions = new RPGContestSessionService({
			repository: options.contestSessionRepository,
			now: this.now,
			createId: () => this.bytes(18).toString('base64url'),
			random: this.random,
			getCharacterTeam: characterId => this.repository.get(characterId)?.state.team,
			isCharacterPokemonAvailable: (characterId, teamIndex) => {
				const record = this.repository.get(characterId);
				if (!record) return false;
				this.resolveCompletedEVTrainings(record);
				const pokemon = record.state.box.party[teamIndex] as RPGManagedStoredPokemon | undefined;
				return !!pokemon && !pokemon.metadata?.evTraining &&
					!this.isPokemonBreeding(record.state.id, pokemon.pokemonId);
			},
		});
	}

	listSelectableCharacters(): RPGCharacterSelection[] {
		return this.repository.list()
			.map(record => this.selection(record.state))
			.sort((a, b) => a.characterName.localeCompare(b.characterName));
	}

	createCharacter(request: RPGCreateCharacterRequest): RPGCharacterSelection {
		const characterName = this.text(request.characterName, 'character name', 30);
		const id = toID(characterName);
		if (!id) throw new Error('RPG character name requires letters or numbers');
		if (this.repository.get(id)) throw new Error('RPG character already exists');
		const playerName = this.text(request.playerName, 'player name', 50);
		const avatar = this.text(request.avatar, 'avatar', 200);
		this.validatePassword(request.password);
		if (!Number.isSafeInteger(request.initialMoney) || request.initialMoney < 0 || request.initialMoney > 10_000_000) {
			throw new Error('RPG initial money must be an integer between 0 and 10000000');
		}
		const starter = this.createStarter(request.starter);
		const now = this.now();
		const captured = this.toCapturedPokemon(starter);
		const box = RPGBoxSystem.create(id, {
			tier: 'small',
			party: [{
				pokemonId: id + ':starter:1', pokemon: captured,
				metadata: { ot: characterName, training: 'none' },
			} as RPGManagedStoredPokemon],
		});
		const inventory = RPGInventorySystem.create(RPGBagSystem.createForTier(id, 'starter'));
		const state: RPGCharacterState = {
			version: RPG_ACCOUNT_VERSION, id, characterName, playerName, avatar,
			pageAccess: {
				bag: true, box: true, training: true, center: true, fossils: true, nursery: true, shops: true,
			},
			shopAccess: Object.fromEntries(this.commerce.directory().shops.map(shop => [shop.id, true])),
			money: request.initialMoney, team: [starter], box, inventory,
			createdAt: now, updatedAt: now,
		};
		this.repository.create({ state, credential: this.hashPassword(request.password) });
		return this.selection(state);
	}

	loginMaster(code: string): RPGSession {
		const supplied = createHash('sha256').update(String(code)).digest();
		if (!timingSafeEqual(this.masterCodeHash, supplied)) throw new Error('Invalid RPG master code');
		return this.createSession({ role: 'master', mode: 'master' });
	}

	loginPlayer(characterId: string, password: string): RPGSession {
		const record = this.repository.get(characterId);
		if (!record || !this.verifyPassword(password, record.credential)) {
			throw new Error('Invalid RPG character or password');
		}
		return this.createSession({ role: 'player', mode: 'player', characterId: record.state.id });
	}

	getSession(token: string): RPGSession {
		const key = this.tokenKey(token);
		const session = this.sessions.get(key);
		if (!session || session.expiresAt <= this.now()) {
			this.sessions.delete(key);
			throw new Error('Invalid or expired RPG session');
		}
		return { ...structuredClone(session), token };
	}

	logout(token: string): void {
		this.sessions.delete(this.tokenKey(token));
	}

	viewAsPlayer(token: string, characterId: string): RPGSession {
		const session = this.getInternalSession(token);
		if (session.role !== 'master' || session.mode !== 'master') throw new Error('RPG master session required');
		const record = this.requireCharacter(characterId);
		session.mode = 'player';
		session.viewAsCharacterId = record.state.id;
		this.sessions.set(this.tokenKey(token), session);
		return { ...structuredClone(session), token };
	}

	exitPlayerView(token: string): RPGSession {
		const session = this.getInternalSession(token);
		if (session.role !== 'master') throw new Error('RPG master session required');
		session.mode = 'master';
		delete session.viewAsCharacterId;
		this.sessions.set(this.tokenKey(token), session);
		return { ...structuredClone(session), token };
	}

	createCharacterDeletionChallenge(token: string): RPGCharacterDeletionChallenge {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'player' || !session.viewAsCharacterId) {
			throw new Error('RPG master must be viewing a player to delete the character');
		}
		const characterId = this.requireCharacter(session.viewAsCharacterId).state.id;
		const sessionKey = this.tokenKey(token);
		const previous = this.lastDeletionWord.get(sessionKey);
		let wordIndex = this.int(RPG_DELETE_WORDS.length);
		if (RPG_DELETE_WORDS[wordIndex] === previous) {
			wordIndex = (wordIndex + 1) % RPG_DELETE_WORDS.length;
		}
		const word = RPG_DELETE_WORDS[wordIndex];
		const challenge: RPGInternalDeletionChallenge = {
			challengeId: this.bytes(18).toString('base64url'),
			characterId,
			word,
			expiresAt: this.now() + RPG_DELETE_CHALLENGE_TTL,
			sessionKey,
		};
		this.lastDeletionWord.set(sessionKey, word);
		this.deletionChallenges.set(challenge.challengeId, challenge);
		return {
			challengeId: challenge.challengeId,
			characterId: challenge.characterId,
			word: challenge.word,
			expiresAt: challenge.expiresAt,
		};
	}

	deleteViewedCharacter(
		token: string, challengeId: string, confirmation: string
	): RPGCharacterDeletionResult {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'player' || !session.viewAsCharacterId) {
			throw new Error('RPG master must be viewing a player to delete the character');
		}
		const id = this.text(challengeId, 'deletion challenge', 100);
		const challenge = this.deletionChallenges.get(id);
		if (!challenge || challenge.expiresAt <= this.now()) {
			this.deletionChallenges.delete(id);
			throw new Error('Invalid or expired RPG deletion challenge');
		}
		const sessionKey = this.tokenKey(token);
		if (challenge.sessionKey !== sessionKey || challenge.characterId !== session.viewAsCharacterId) {
			throw new Error('RPG deletion challenge does not match this session');
		}
		if (String(confirmation).trim().toLowerCase() !== challenge.word.toLowerCase()) {
			throw new Error('Incorrect RPG deletion confirmation');
		}
		if (!this.repository.delete(challenge.characterId)) throw new Error('Unknown RPG character');
		this.deletionChallenges.delete(id);
		this.lastDeletionWord.delete(sessionKey);
		for (const [otherId, otherChallenge] of this.deletionChallenges) {
			if (otherChallenge.characterId === challenge.characterId) this.deletionChallenges.delete(otherId);
		}
		for (const [otherKey, otherSession] of this.sessions) {
			if (otherSession.role === 'player' && otherSession.characterId === challenge.characterId) {
				this.sessions.delete(otherKey);
			} else if (otherSession.viewAsCharacterId === challenge.characterId) {
				otherSession.mode = 'master';
				delete otherSession.viewAsCharacterId;
				this.sessions.set(otherKey, otherSession);
			}
		}
		return { characterId: challenge.characterId, session: this.getSession(token) };
	}

	listAllCharacters(token: string): RPGCharacterState[] {
		this.requirePermission(token, 'characters:list-all');
		return this.repository.list().map(record => this.characterView(record));
	}

	advanceCampaignTime(token: string, hours: number): RPGCampaignTimeAdvanceResult {
		this.requireMasterRole(token);
		if (hours !== 1 && hours !== 8) throw new Error('O relógio da campanha só pode avançar 1 ou 8 horas');
		const milliseconds = hours * 60 * 60 * 1000;
		const now = this.now();
		const records = this.repository.list();
		const recordsById = new Map(records.map(record => [record.state.id, record]));
		const changedIds = new Set<string>();
		const result: RPGCampaignTimeAdvanceResult = {
			hours, milliseconds, charactersAffected: 0,
			fossils: { advanced: 0, completed: 0 },
			trainings: { advanced: 0, completed: 0 },
			breedings: { advanced: 0, completed: 0 },
			incubations: { advanced: 0, completed: 0 },
		};
		for (const record of records) {
			const fossils = record.state.fossilLab ?
				RPGFossilLab.advanceTime(record.state, milliseconds, now, this.random) : { advanced: 0, completed: 0 };
			const trainings = RPGBoxManagement.advanceTime(record.state, milliseconds, now);
			const breedings = {advanced: 0, completed: 0};
			const incubations = {advanced: 0, completed: 0};
			let nurseryChanged = false;
			for (const project of record.state.nursery?.projects || []) {
				let completedNow = false;
				if (project.status === 'breeding' && project.slot2) {
					const before = Math.max(0, project.remainingBreedingTimeMs ?? project.requiredBreedingTimeMs ?? 0);
					const after = Math.max(0, before - milliseconds);
					project.remainingBreedingTimeMs = after;
					if (after < before) breedings.advanced++;
					if (before > 0 && after === 0) {
						project.egg = RPGNurseryGenetics.createEgg(
							project.id, project.slot1, project.slot2, now, this.random
						);
						RPGIncubation.ensureEgg(project.egg);
						this.consumeCompletedNurseryItems(project, recordsById, changedIds);
						project.status = 'egg_ready';
						project.parentCollected = Object.fromEntries(
							[project.slot1, project.slot2]
								.filter(parent => parent.participantType === 'npc')
								.map(parent => [parent.ownerId, true])
						);
						project.parentRescueRemainingMs = Object.fromEntries(
							[...new Set([project.slot1, project.slot2]
								.filter(parent => parent.participantType === 'player')
								.map(parent => parent.ownerId))]
								.map(ownerId => [ownerId, RPG_NURSERY_PARENT_RESCUE_TIME_MS])
						);
						if (project.slot1.participantType === 'npc') delete project.egg;
						breedings.completed++;
						completedNow = true;
						nurseryChanged = true;
					}
				}
				if (!completedNow && ['egg_ready', 'collected'].includes(project.status)) {
					project.parentCollected ||= {};
					project.parentRescueRemainingMs ||= {};
					const owners = [...new Set([project.slot1, project.slot2]
						.filter(parent => parent?.participantType === 'player')
						.map(parent => parent!.ownerId))];
					for (const ownerId of owners) {
						if (project.parentCollected[ownerId]) {
							delete project.parentRescueRemainingMs[ownerId];
							continue;
						}
						const before = project.parentRescueRemainingMs[ownerId];
						if (before === undefined) {
							project.parentRescueRemainingMs[ownerId] = RPG_NURSERY_PARENT_RESCUE_TIME_MS;
							nurseryChanged = true;
							continue;
						}
						const after = Math.max(0, before - milliseconds);
						project.parentRescueRemainingMs[ownerId] = after;
						if (after !== before) nurseryChanged = true;
						if (after > 0) continue;
						const owner = recordsById.get(ownerId);
						if (!owner) continue;
						const ownerNursery = this.ensureNursery(owner);
						const parents = [project.slot1, project.slot2].filter(parent =>
							parent?.participantType === 'player' && parent.ownerId === ownerId
						);
						let releasedAll = true;
						for (const parent of parents) {
							const releasedId = project.id + ':' + ownerId + ':' + parent!.pokemonId;
							if (ownerNursery.releasedPokemon!.some(value => value.id === releasedId)) continue;
							const entry = owner.state.box.party.find(value => value.pokemonId === parent!.pokemonId);
							if (!entry) {
								releasedAll = false;
								continue;
							}
							const extracted = RPGBoxManagement.extract(
								owner.state, parent!.pokemonId, owner.state.box.revision
							);
							ownerNursery.releasedPokemon!.push({
								id: releasedId, projectId: project.id, ownerId,
								ownerName: parent!.ownerName, releasedAt: now, entry: extracted,
							});
							changedIds.add(ownerId);
						}
						if (releasedAll) {
							project.parentCollected[ownerId] = true;
							delete project.parentRescueRemainingMs[ownerId];
							nurseryChanged = true;
						}
					}
				}
				if (project.egg) {
					const advanced = RPGIncubation.advance(project.egg, milliseconds);
					if (advanced.advanced) incubations.advanced++;
					if (advanced.completed) incubations.completed++;
				}
			}
			result.fossils.advanced += fossils.advanced;
			result.fossils.completed += fossils.completed;
			result.trainings.advanced += trainings.advanced;
			result.trainings.completed += trainings.completed;
			result.breedings.advanced += breedings.advanced;
			result.breedings.completed += breedings.completed;
			result.incubations.advanced += incubations.advanced;
			result.incubations.completed += incubations.completed;
			if (fossils.advanced || trainings.advanced || breedings.advanced || incubations.advanced || nurseryChanged) {
				changedIds.add(record.state.id);
			}
		}
		for (const id of changedIds) {
			const record = recordsById.get(id);
			if (!record) continue;
			record.state.updatedAt = now;
			this.repository.set(record);
		}
		result.charactersAffected = changedIds.size;
		return result;
	}

	setCharacterPageAccess(
		token: string, characterId: string,
		page: 'bag' | 'box' | 'training' | 'center' | 'fossils' | 'nursery' | 'shops', allowed: boolean
	): RPGCharacterState {
		this.requireMasterRole(token);
		if (!['bag', 'box', 'training', 'center', 'fossils', 'nursery', 'shops'].includes(page)) {
			throw new Error('Invalid RPG character page access');
		}
		const record = this.requireCharacter(characterId);
		record.state.pageAccess = {
			bag: record.state.pageAccess?.bag !== false,
			box: record.state.pageAccess?.box !== false,
			training: record.state.pageAccess?.training !== false,
			center: record.state.pageAccess?.center !== false,
			fossils: record.state.pageAccess?.fossils !== false,
			nursery: record.state.pageAccess?.nursery !== false,
			shops: record.state.pageAccess?.shops !== false,
			[page]: allowed,
		};
		record.state.version = RPG_ACCOUNT_VERSION;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return structuredClone(record.state);
	}

	setCharacterShopAccess(token: string, characterId: string, shopId: string, allowed: boolean): RPGCharacterState {
		this.requireMasterRole(token);
		const id = String(shopId || '');
		if (!this.commerce.directory().shops.some(shop => shop.id === id)) {
			throw new Error('Loja RPG inválida');
		}
		const record = this.requireCharacter(characterId);
		record.state.shopAccess = {...this.characterShopAccess(record.state), [id]: allowed};
		record.state.version = RPG_ACCOUNT_VERSION;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return this.characterView(record);
	}

	getCharacter(token: string, characterId?: string): RPGCharacterState {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		this.requirePermission(token, 'character:read', target);
		const record = this.requireCharacter(target);
		this.resolveCompletedEVTrainings(record);
		return this.characterView(record);
	}

	getFossilLab(token: string, characterId?: string) {
		const record = this.requireBagRecord(token, characterId, 'bag:read', true);
		this.requireFossilLabAccess(token, record);
		const before = JSON.stringify(record.state.fossilLab || null);
		const view = RPGFossilLab.view(record.state, this.now(), this.random);
		if (JSON.stringify(record.state.fossilLab || null) !== before) {
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		return view;
	}

	analyzeFossil(token: string, characterId: string | undefined, itemId: string, quality?: RPGFossilQuality) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		RPGFossilLab.analyze(record.state, itemId, quality, this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return RPGFossilLab.view(record.state, this.now(), this.random);
	}

	startFossilRestoration(token: string, characterId: string | undefined, input: {
		itemId: string, method: RPGFossilMethod, quality?: RPGFossilQuality, sampleCount?: number,
		samples?: Partial<Record<RPGFossilQuality, number>>,
		nature?: string, ability?: string, gender?: 'M' | 'F' | 'N',
	}) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		RPGFossilLab.start(record.state, input, this.now(), this.random, this.bytes(12).toString('base64url'));
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return RPGFossilLab.view(record.state, this.now(), this.random);
	}

	donateFossil(token: string, characterId: string | undefined, itemId: string, quality?: RPGFossilQuality) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		RPGFossilLab.donate(record.state, itemId, quality, this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return RPGFossilLab.view(record.state, this.now(), this.random);
	}

	sellFossil(token: string, characterId: string | undefined, itemId: string, quality?: RPGFossilQuality) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		const value = RPGFossilLab.sell(record.state, itemId, quality, this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { value, fossilLab: RPGFossilLab.view(record.state, this.now(), this.random) };
	}

	receiveRestoredFossil(token: string, characterId: string | undefined, projectId: string) {
		const record = this.requireBoxRecord(token, characterId, 'box:edit', true);
		this.requireFossilLabAccess(token, record);
		const pokemon = RPGFossilLab.receive(record.state, projectId, this.now(), this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { pokemon, fossilLab: RPGFossilLab.view(record.state, this.now(), this.random) };
	}
	listCommerceShops(token: string, characterId?: string) {
		const session = this.getSession(token);
		const directory = this.commerce.directory();
		if (session.role === 'master') return directory;
		const requestedCharacterId = characterId || session.viewAsCharacterId || session.characterId;
		const record = this.requireBagRecord(token, requestedCharacterId, 'bag:read', true);
		this.requireCommerceAccess(token, record);
		const access = this.characterShopAccess(record.state);
		return {...directory, shops: directory.shops.map(shop => ({
			...shop, allowed: access[shop.id] !== false,
		}))};
	}

	getCommerceShop(token: string, shopId: string, characterId?: string) {
		const session = this.getSession(token);
		const requestedCharacterId = characterId || session.viewAsCharacterId || session.characterId;
		if (session.role === 'master' && session.mode === 'master' && !requestedCharacterId) {
			return this.commerce.view(shopId, undefined, true);
		}
		const record = this.requireBagRecord(token, requestedCharacterId, 'bag:read', true);
		this.requireCommerceAccess(token, record, shopId);
		return this.commerce.view(shopId, record.state, session.role === 'master');
	}

	configureCommerceOffer(token: string, shopId: string, input: RPGCommerceOfferInput) {
		this.requireMasterRole(token);
		this.commerce.configure(shopId, input);
		return this.commerce.view(shopId, undefined, true);
	}

	configureCommerceBulk(token: string, shopId: string, input: RPGCommerceBulkInput) {
		this.requireMasterRole(token);
		this.commerce.configureBulk(shopId, input);
		return this.commerce.view(shopId, undefined, true);
	}

	tradeCommerceShop(
		token: string, shopId: string, request: RPGCommerceTradeRequest, characterId?: string
	) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireCommerceAccess(token, record, shopId);
		const previousRecord = structuredClone(record);
		const prepared = this.commerce.prepareTrade(shopId, record.state, request);
		record.state.money = prepared.character.money;
		record.state.inventory = prepared.character.inventory;
		record.state.shopRevision = prepared.character.shopRevision;
		record.state.shopTransactions = prepared.character.shopTransactions;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		try {
			this.commerce.commit(prepared.shop);
		} catch (error) {
			this.repository.set(previousRecord);
			throw error;
		}
		return {
			view: this.commerce.view(shopId, record.state, this.getSession(token).role === 'master'),
			transactions: prepared.transactions,
		};
	}

	getNursery(token: string, characterId?: string) {
		const session = this.getSession(token);
		const requestedCharacterId = characterId || session.viewAsCharacterId || session.characterId;
		if (session.role === 'master' && !requestedCharacterId) return this.nurseryView();
		const record = this.requireBoxRecord(token, requestedCharacterId, 'box:read', true);
		this.requireNurseryAccess(token, record);
		const before = JSON.stringify(record.state.nursery || null);
		this.ensureNursery(record);
		if (JSON.stringify(record.state.nursery || null) !== before) this.persistNurseryRecord(record);
		return this.nurseryView(record);
	}

	purchaseNurseryItem(
		token: string, characterId: string | undefined, itemId: string,
		quantity: number, expectedBagRevision: number
	) {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireNurseryAccess(token, record);
		const id = toID(itemId);
		if (!(RPG_NURSERY_SHOP_ITEM_IDS as readonly string[]).includes(id)) {
			throw new Error('Este item não é vendido no Berçário');
		}
		if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
			throw new Error('Quantidade de compra inválida');
		}
		const inventory = RPGInventorySystem.migrate(record.state.inventory);
		if (inventory.bag.revision !== expectedBagRevision) throw new Error('RPG Bag revision conflict');
		const offers = RPG_NURSERY_SHOP_ITEM_IDS.map(offerId => {
			const item = RPGItems.require(offerId);
			if (item.price?.buy === undefined) throw new Error('Item do Berçário sem preço de compra: ' + item.name);
			return {itemId: item.id, buyPrice: item.price.buy};
		});
		const catalog = RPGShopSystem.createCatalog('nursery-shop', offers, {bagUpgrades: []});
		const account = RPGShopSystem.createAccount(record.state.id, record.state.money, inventory.bag);
		const purchase = RPGShopSystem.buy(account, catalog, {
			actionId: 'nursery-shop:' + this.bytes(18).toString('base64url'), itemId: id, quantity,
		}, {account: account.revision, bag: expectedBagRevision, catalog: catalog.revision});
		const capacity = RPGBagSystem.getCapacity(purchase.account.bag);
		const reservedEggSlots = this.activeEggs(record).length * 5;
		if (capacity.maxSlots !== undefined && capacity.usedSlots + reservedEggSlots > capacity.maxSlots) {
			throw new Error('A Bag não possui espaço para este item');
		}
		const working = structuredClone(record.state);
		working.inventory = RPGInventorySystem.migrate(working.inventory);
		working.inventory.bag = purchase.account.bag;
		working.money = purchase.account.balance;
		record.state = working;
		this.persistBoxRecord(record);
		return this.nurseryView(record);
	}

	createMasterNurseryProject(token: string, input: RPGNurseryMasterSlot1Input) {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'master') {
			throw new Error('Somente o Mestre pode criar uma requisi\u00e7\u00e3o de NPC');
		}
		const npcName = String(input.npcName || '').trim();
		if (!npcName || npcName.length > 40) {
			throw new Error('Informe um nome de NPC com at\u00e9 40 caracteres');
		}
		const availableSpecies = RPGNurseryGenetics.masterParentOptions();
		const selected = availableSpecies.find(option => toID(option.species) === toID(input.species));
		if (!selected) {
			throw new Error('Este Pok\u00e9mon n\u00e3o pode iniciar uma requisi\u00e7\u00e3o de procria\u00e7\u00e3o');
		}
		const sex = String(input.sex || '').toUpperCase() as import('../../sim/rpg-showdown').RPGPokemonSex;
		if (!selected.sexes.includes(sex)) {
			throw new Error('Escolha um sexo v\u00e1lido para esta esp\u00e9cie');
		}
		const selectedSpecies = selected.species;
		const records = this.repository.list();
		if (!records.length) throw new Error('Crie ao menos um Player antes de abrir a requisi\u00e7\u00e3o do NPC');
		const projectId = this.bytes(18).toString('base64url');
		const ownerId = toID('nursery-npc-' + projectId);
		const pokemon = this.masterNurseryPokemon(input, sex);
		const slot1 = RPGNurseryGenetics.parent(
			ownerId, npcName, 'npc', ownerId + '-pokemon', pokemon
		);
		const project: RPGNurseryProject = {
			id: projectId,
			slot1,
			slot2ParticipantType: 'player',
			eggOwnerId: ownerId,
			status: 'inviting',
			confirmed: {[ownerId]: true},
			slotConfirmations: {slot1: true, slot2: false},
			createdAt: this.now(),
		};
		const host = records[0];
		this.ensureNursery(host).projects.push(project);
		this.persistNurseryRecord(host);
		return this.nurseryView();
	}

	createNurseryProject(token: string, characterId: string | undefined, pokemonId: string) {
		const owner = this.requireBoxRecord(token, characterId, 'box:edit', true);
		this.requireNurseryAccess(token, owner);
		this.requireAvailablePokemon(owner, pokemonId);
		const slot1 = this.nurseryParent(owner, pokemonId);
		if (!canRPGPokemonBreedAtCurrentStage(slot1.species, slot1.sex)) {
			throw new Error('Pokémon no primeiro estágio que ainda podem evoluir não podem procriar');
		}
		if (this.isPokemonBreeding(owner.state.id, pokemonId)) {
			throw new Error('Este Pokémon já está em um slot do Berçário');
		}
		const now = this.now();
		const project: RPGNurseryProject = {
			id: this.bytes(18).toString('base64url'),
			slot1,
			slot2ParticipantType: 'player',
			eggOwnerId: owner.state.id,
			status: 'inviting',
			confirmed: {[owner.state.id]: false},
			slotConfirmations: {slot1: false, slot2: false},
			createdAt: now,
		};
		this.ensureNursery(owner).projects.push(project);
		this.persistNurseryRecord(owner);
		return this.nurseryView(owner);
	}

	acceptNurseryInvitation(token: string, projectId: string, pokemonId: string) {
		const actor = this.requireNurseryActor(token);
		this.requireNurseryAccess(token, actor);
		const found = this.requireNurseryProject(projectId);
		if (found.project.status !== 'inviting' && found.project.status !== 'configuring') {
			throw new Error('Este convite não está aguardando a seleção do segundo Pokémon');
		}

		if (found.project.slot1.ownerId === actor.state.id && found.project.slot1.pokemonId === pokemonId) {
			throw new Error('Escolha dois Pokémon diferentes');
		}
		this.requireAvailablePokemon(actor, pokemonId);
		if (this.isPokemonBreeding(actor.state.id, pokemonId, found.project.id)) {
			throw new Error('Este Pokémon já está em uma procriação');
		}
		const slot2 = this.nurseryParent(actor, pokemonId);
		const compatibility = RPGNurseryGenetics.preview(found.project.slot1, slot2).compatibility;
		if (!compatibility.compatible) {
			throw new Error('Este Pokémon não pode reproduzir com o Slot 1: ' + compatibility.reason);
		}
		found.project.slot2 = slot2;
		found.project.slot2OwnerId = actor.state.id;
		found.project.slot2OwnerName = actor.state.characterName;
		found.project.slot2ParticipantType = 'player';
		found.project.requestedPokecoins = 0;
		delete found.project.paymentTransferredAt;
		const npcRequest = found.project.slot1.participantType === 'npc';
		found.project.status = npcRequest ? 'awaiting_confirmation' : 'configuring';
		found.project.confirmed = {
			[found.project.slot1.ownerId]: npcRequest,
			[found.project.slot2.ownerId]: false,
		};
		found.project.slotConfirmations = {slot1: npcRequest, slot2: false};
		this.persistNurseryRecord(found.record);
		return this.nurseryView(actor);
	}

	setMasterNurserySlot2(token: string, input: RPGNurseryMasterSlot2Input) {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'master') {
			throw new Error('Somente o Mestre pode configurar o Slot 2 do sistema');
		}
		const found = this.requireNurseryProject(input.projectId);
		const project = found.project;
		if (project.slot1.participantType === 'npc') {
			throw new Error('A requisi\u00e7\u00e3o do NPC deve receber um Pok\u00e9mon de Player no Slot 2');
		}
		if (project.status !== 'inviting' || project.slot2) {
			throw new Error('O Slot 2 desta requisi\u00e7\u00e3o n\u00e3o est\u00e1 dispon\u00edvel');
		}
		const compatible = RPGNurseryGenetics.compatiblePartners(project.slot1);
		const selected = compatible.find(option => toID(option.species) === toID(input.species));
		if (!selected) throw new Error('O Pok\u00e9mon escolhido n\u00e3o pode reproduzir com o Slot 1');
		const ownerId = toID('nursery-npc-' + project.id);
		const pokemon = this.masterNurseryPokemon(input, selected.sex);
		project.slot2 = RPGNurseryGenetics.parent(
			ownerId, 'Mestre', 'npc', ownerId + '-pokemon', pokemon
		);
		project.slot2OwnerId = project.slot2.ownerId;
		project.slot2OwnerName = project.slot2.ownerName;
		project.slot2ParticipantType = 'npc';
		project.requestedPokecoins = 0;
		delete project.paymentTransferredAt;
		project.status = 'awaiting_confirmation';
		project.confirmed = {
			[project.slot1.ownerId]: false,
			[project.slot2.ownerId]: true,
		};
		project.slotConfirmations = {slot1: false, slot2: true};
		this.persistNurseryRecord(found.record);
		return this.nurseryView();
	}

	cancelMasterNurseryProject(token: string, projectId: string) {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'master') {
			throw new Error('Somente o Mestre pode cancelar a requisi\u00e7\u00e3o do NPC');
		}
		const found = this.requireNurseryProject(projectId);
		const project = found.project;
		if (project.slot1.participantType !== 'npc') {
			throw new Error('Esta requisi\u00e7\u00e3o n\u00e3o pertence a um NPC');
		}
		if (project.egg || ['egg_ready', 'collected', 'cancelled'].includes(project.status)) {
			throw new Error('Esta requisi\u00e7\u00e3o de NPC n\u00e3o pode mais ser cancelada');
		}
		project.status = 'cancelled';
		this.persistNurseryRecord(found.record);
		return this.nurseryView();
	}

	withdrawNurserySlot2(token: string, projectId: string) {
		const actor = this.requireNurseryActor(token);
		const found = this.requireNurseryProject(projectId);
		const project = found.project;
		if (!project.slot2 || project.slot2.ownerId !== actor.state.id || project.slot1.ownerId === actor.state.id) {
			throw new Error('Somente o treinador do Pokémon no Slot 2 pode retirá-lo');
		}
		if (project.egg || ['egg_ready', 'collected', 'cancelled'].includes(project.status)) {
			throw new Error('O Pokémon do Slot 2 não pode mais ser retirado desta procriação');
		}
		delete project.slot2;
		delete project.slot2OwnerId;
		delete project.slot2OwnerName;
		delete project.breedingStartedAt;
		delete project.requiredBreedingTimeMs;
		delete project.remainingBreedingTimeMs;
		delete project.requestedPokecoins;
		delete project.paymentTransferredAt;
		project.status = 'inviting';
		project.confirmed = {[project.slot1.ownerId]: project.slot1.participantType === 'npc'};
		project.slotConfirmations = {slot1: project.slot1.participantType === 'npc', slot2: false};
		this.persistNurseryRecord(found.record);
		return this.nurseryView(actor);
	}

	confirmNurseryProject(token: string, projectId: string, requestedPokecoins?: number) {
		const actor = this.requireNurseryActor(token);
		const found = this.requireNurseryProject(projectId);
		const project = found.project;
		if (project.status !== 'configuring' && project.status !== 'awaiting_confirmation') {
			throw new Error('Esta procriação não está aguardando confirmação');
		}
		if (!project.slot2) throw new Error('O segundo participante ainda não selecionou um Pokémon');
		if (![project.slot1.ownerId, project.slot2.ownerId].includes(actor.state.id)) {
			throw new Error('Você não participa desta procriação');
		}
		const preview = RPGNurseryGenetics.preview(project.slot1, project.slot2);
		if (!preview.compatibility.compatible) {
			throw new Error('Os Pokémon selecionados não são compatíveis: ' + preview.compatibility.reason);
		}
		const current = project.slotConfirmations ?? {
			slot1: !!project.confirmed[project.slot1.ownerId],
			slot2: !!project.confirmed[project.slot2.ownerId],
		};
		const confirmsSlot2 = project.slot2.ownerId === actor.state.id && !current.slot2;
		const confirmsSlot1 = project.slot1.ownerId === actor.state.id && !current.slot1 &&
			(project.slot1.ownerId !== project.slot2.ownerId || current.slot2);
		if (!confirmsSlot1 && !confirmsSlot2) {
			throw new Error('Este participante já confirmou a procriação');
		}
		if (confirmsSlot2) {
			const requested = requestedPokecoins ?? project.requestedPokecoins ?? 0;
			if (!Number.isSafeInteger(requested) || requested < 0 ||
				!Number.isSafeInteger(RPG_NURSERY_BREEDING_BASE_FEE + requested)) {
				throw new Error('A cobrança deve ser um valor inteiro e não negativo de Pokécoins');
			}
			project.requestedPokecoins = requested;
		} else if (!current.slot2) {
			throw new Error('O dono do Slot 2 precisa confirmar a cobrança primeiro');
		}

		const recordBeforeConfirmation = structuredClone(found.record);
		const next = {
			slot1: current.slot1 || confirmsSlot1,
			slot2: current.slot2 || confirmsSlot2,
		};
		project.slotConfirmations = next;
		project.confirmed = project.slot1.ownerId === project.slot2.ownerId ? {
			[project.slot1.ownerId]: next.slot1 && next.slot2,
		} : {
			[project.slot1.ownerId]: next.slot1,
			[project.slot2.ownerId]: next.slot2,
		};
		const startsBreeding = next.slot1 && next.slot2;
		if (!startsBreeding) {
			project.status = 'awaiting_confirmation';
			this.persistNurseryRecord(found.record);
			return this.nurseryView(actor);
		}

		const requestedFee = project.requestedPokecoins ?? 0;
		const totalFee = RPG_NURSERY_BREEDING_BASE_FEE + requestedFee;
		const records = new Map<string, RPGStoredCharacter>([[found.record.state.id, found.record]]);
		const recordFor = (ownerId: string) => {
			let record = records.get(ownerId);
			if (!record) {
				record = this.requireCharacter(ownerId);
				records.set(ownerId, record);
			}
			return record;
		};
		const payer = project.slot1.participantType === 'player' ? recordFor(project.slot1.ownerId) : undefined;
		const receiver = project.slot2.participantType === 'player' ? recordFor(project.slot2.ownerId) : undefined;
		if (payer && payer.state.money < totalFee) {
			throw new Error(`${payer.state.characterName} não possui ${totalFee.toLocaleString('pt-BR')} Pokécoins para a procriação`);
		}
		if (receiver && !Number.isSafeInteger(receiver.state.money + requestedFee)) {
			throw new Error('A cobrança tornaria o saldo do Slot 2 inválido');
		}

		const originals = new Map([...records].map(([id, record]) => [
			id, id === found.record.state.id ? recordBeforeConfirmation : structuredClone(record),
		]));
		if (payer) payer.state.money -= totalFee;
		if (receiver) receiver.state.money += requestedFee;
		const now = this.now();
		project.status = 'breeding';
		project.breedingStartedAt = now;
		project.requiredBreedingTimeMs = preview.requiredBreedingTimeMs;
		project.remainingBreedingTimeMs = preview.requiredBreedingTimeMs;
		project.paymentTransferredAt = now;
		for (const record of records.values()) record.state.updatedAt = now;
		try {
			for (const record of records.values()) this.repository.set(record);
		} catch (error) {
			for (const original of originals.values()) this.repository.set(original);
			throw error;
		}
		return this.nurseryView(actor);
	}

	cancelNurseryProject(token: string, projectId: string) {
		const actor = this.requireNurseryActor(token);
		const found = this.requireNurseryProject(projectId);
		const project = found.project;
		if (project.slot1.ownerId !== actor.state.id) {
			throw new Error('Somente o dono da requisi\u00e7\u00e3o do Slot 1 pode cancel\u00e1-la');
		}
		if (project.egg || ['egg_ready', 'collected'].includes(project.status)) {
			throw new Error('Uma procriação que já produziu um ovo não pode ser cancelada');
		}
		project.status = 'cancelled';
		this.persistNurseryRecord(found.record);
		return this.nurseryView(actor);
	}

	collectNurseryParent(token: string, projectId: string) {
		const actor = this.requireNurseryActor(token);
		const found = this.requireNurseryProject(projectId);
		const project = found.project;
		const ownedParents = [project.slot1, project.slot2].filter(parent =>
			parent?.ownerId === actor.state.id
		);
		if (!ownedParents.length) throw new Error('Você não possui um Pokémon nesta procriação');
		if (!['egg_ready', 'collected'].includes(project.status)) {
			throw new Error('A procria\u00e7\u00e3o ainda n\u00e3o terminou');
		}
		project.parentCollected ||= {};
		if (project.parentCollected[actor.state.id]) {
			throw new Error('Seu Pokémon já foi resgatado desta procriação');
		}
		project.parentCollected[actor.state.id] = true;
		if (project.parentRescueRemainingMs) delete project.parentRescueRemainingMs[actor.state.id];
		const ownerIds = [...new Set([project.slot1.ownerId, project.slot2?.ownerId]
			.filter((ownerId): ownerId is string => !!ownerId))];
		if (project.slot1.participantType === 'npc' &&
			ownerIds.every(ownerId => project.parentCollected?.[ownerId] === true)) {
			project.status = 'collected';
		}
		this.persistNurseryRecord(found.record);
		return this.nurseryView(actor);
	}

	restoreReleasedNurseryPokemon(token: string, releasedId: string) {
		this.requireMasterRole(token);
		for (const owner of this.repository.list()) {
			const nursery = this.ensureNursery(owner);
			const index = nursery.releasedPokemon!.findIndex(value => value.id === releasedId);
			if (index < 0) continue;
			const released = nursery.releasedPokemon![index];
			const destination = owner.state.box.party.length < 6 ? 'party' : 'box';
			if (destination === 'party') {
				RPGBoxManagement.insertParty(owner.state, released.entry);
			} else {
				RPGBoxManagement.insert(owner.state, released.entry);
			}
			nursery.releasedPokemon!.splice(index, 1);
			this.persistNurseryRecord(owner);
			return {nursery: this.nurseryView(), destination, ownerId: owner.state.id};
		}
		throw new Error('Pokémon libertado não encontrado');
	}

	deleteReleasedNurseryPokemon(token: string, releasedId: string) {
		this.requireMasterRole(token);
		for (const owner of this.repository.list()) {
			const nursery = this.ensureNursery(owner);
			const index = nursery.releasedPokemon!.findIndex(value => value.id === releasedId);
			if (index < 0) continue;
			const [released] = nursery.releasedPokemon!.splice(index, 1);
			this.persistNurseryRecord(owner);
			return {nursery: this.nurseryView(), deletedPokemonId: released.entry.pokemonId};
		}
		throw new Error('Pokémon libertado não encontrado');
	}

	collectNurseryEgg(token: string, projectId: string) {
		const actor = this.requireNurseryActor(token);
		const project = this.ensureNursery(actor).projects.find(value => value.id === projectId);
		if (!project || project.eggOwnerId !== actor.state.id) {
			throw new Error('Somente o proprietário do ovo pode retirá-lo');
		}
		if (project.status !== 'egg_ready' || !project.egg) throw new Error('Este ovo ainda não está disponível');
		const nursery = this.ensureNursery(actor);
		const carriedEggs = this.activeEggs(actor).length;
		RPGIncubation.carry(project.egg, {
			teamPokemon: actor.state.box.party.length,
			carriedEggs,
			bagUsedSlots: RPGBagSystem.getUsedSlots(RPGInventorySystem.migrate(actor.state.inventory).bag),
			bagMaxSlots: RPGInventorySystem.migrate(actor.state.inventory).bag.maxSlots,
		});
		project.status = 'collected';
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	collectNurseryEggToLocal(token: string, projectId: string, incubatorId: string) {
		const actor = this.requireNurseryActor(token);
		const nursery = this.ensureNursery(actor);
		const project = nursery.projects.find(value => value.id === projectId);
		if (!project || project.eggOwnerId !== actor.state.id) {
			throw new Error('Somente o proprietário do ovo pode depositá-lo');
		}
		if (project.status !== 'egg_ready' || !project.egg) throw new Error('Este ovo ainda não está disponível');
		const incubator = nursery.incubators.find(value => value.id === incubatorId);
		if (!incubator) throw new Error('Incubadora local desconhecida');
		if (actor.state.money < RPG_NURSERY_LOCAL_INCUBATION_FEE) {
			throw new Error('Você precisa de 5.000 Pokécoins para usar a incubadora local');
		}
		RPGIncubation.insertCreated(project.egg, incubator, this.now());
		actor.state.money -= RPG_NURSERY_LOCAL_INCUBATION_FEE;
		project.status = 'collected';
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	insertNurseryEgg(token: string, eggId: string, incubatorId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		const incubator = this.ensureNursery(actor).incubators.find(value => value.id === incubatorId);
		if (!incubator) throw new Error('Incubadora desconhecida');
		if (actor.state.money < RPG_NURSERY_LOCAL_INCUBATION_FEE) {
			throw new Error('Você precisa de 5.000 Pokécoins para usar a incubadora local');
		}
		RPGIncubation.insert(egg, incubator, this.now());
		actor.state.money -= RPG_NURSERY_LOCAL_INCUBATION_FEE;
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	removeNurseryEgg(token: string, eggId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		if (egg.status !== 'ready_to_hatch') {
			throw new Error('O Egg só pode sair da incubadora local quando estiver pronto para chocar');
		}
		throw new Error('O Egg pronto deve ser chocado para sair da incubadora local');
	}

	startPortableNurseryIncubator(token: string, eggId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		const inventory = RPGInventorySystem.migrate(actor.state.inventory);
		actor.state.inventory = inventory;
		const total = RPGBagSystem.getRegularQuantity(inventory.bag, 'portableincubator');
		const inUse = this.portableEggProjects(actor).filter(project => !project.egg?.portableIncubatorMission).length;
		if (inUse >= total) throw new Error('Você precisa ter uma Incubadora Portátil disponível na Bag');
		RPGIncubation.usePortable(egg, this.now(), actor.state.id + ':portable:' + egg.id);
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	stopPortableNurseryIncubator(token: string, eggId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		RPGIncubation.stopPortable(egg);
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	hatchNurseryEgg(token: string, eggId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		const incubator = egg.portableIncubator ? undefined :
			this.ensureNursery(actor).incubators.find(value => value.id === egg.incubatorId);
		if (!egg.portableIncubator && !incubator) throw new Error('Ovo sem incubadora válida');
		const otherReservedEggs = this.activeEggs(actor).filter(activeEgg => activeEgg.id !== egg.id).length;
		if (actor.state.box.party.length + otherReservedEggs >= 6) {
			throw new Error('Não há espaço livre na equipe para resgatar o Pokémon chocado');
		}

		const inventory = RPGInventorySystem.migrate(actor.state.inventory);
		const registeredBalls = RPGItems.list('ball').map(item => item.id);
		const ballPriority = [...new Set([...RPG_HATCH_BALL_PRIORITY, ...registeredBalls])];
		const captureBall = ballPriority.find(ball =>
			RPGBagSystem.getRegularQuantity(inventory.bag, ball) > 0
		);
		if (!captureBall) {
			throw new Error('É necessário ter ao menos uma Poké Ball na Bag para o Pokémon nascer');
		}

		const working = structuredClone(actor.state);
		working.inventory = RPGInventorySystem.migrate(working.inventory);
		const workingEgg = working.nursery?.projects
			.flatMap(project => project.egg ? [project.egg] : [])
			.find(candidate => candidate.id === egg.id && candidate.ownerId === working.id);
		if (!workingEgg) throw new Error('Ovo persistente não encontrado durante a eclosão');
		const workingIncubator = workingEgg.portableIncubator ? undefined :
			working.nursery?.incubators.find(value => value.id === workingEgg.incubatorId);
		const result = RPGIncubation.hatch(workingEgg, workingIncubator, this.now());
		working.inventory.bag = RPGBagSystem.remove(
			working.inventory.bag, captureBall, 1, working.inventory.bag.revision
		).bag;
		result.pokemon.rpg.captureBall = captureBall;
		RPGBoxManagement.insertParty(working, {
			pokemonId: working.id + ':hatch:' + workingEgg.id,
			pokemon: result.pokemon,
			metadata: {ot: working.characterName, training: 'none'},
		});
		actor.state = working;
		this.persistNurseryRecord(actor);
		return {hatch: result, nursery: this.nurseryView(actor)};
	}

	getBag(
		token: string, characterId?: string,
		query: { context?: RPGManagedBagContext, category?: RPGManagedBagCategory, search?: string } = {}
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:read', query.context === 'battle');
		const itemUseLockReason = query.context === 'battle' ? undefined :
			this.getWorldBagItemUseLock(token, record.state.id);
		return this.managedBagView(record, {
			...query, itemUseLocked: !!itemUseLockReason, itemUseLockReason,
		});
	}

	getBagItem(
		token: string, characterId: string | undefined, itemId: string, context: RPGManagedBagContext = 'world'
	): RPGManagedBagItemView {
		const view = this.getBag(token, characterId, { context, search: itemId });
		const item = view.items.find(entry => entry.id === toID(itemId));
		if (!item) throw new Error('O item não está disponível nesta Bag');
		return item;
	}

	getBagItemTargets(
		token: string, characterId: string | undefined, itemId: string
	): RPGManagedBagTargetsView {
		const record = this.requireBagRecord(token, characterId, 'bag:read');
		if (!record.state.inventory.bag.items.some(entry => entry.itemId === toID(itemId) && entry.quantity > 0)) {
			throw new Error('O item não está disponível nesta Bag');
		}
		return RPGBagManagement.targets(record.state, itemId);
	}

	setBagItemFavorite(
		token: string, characterId: string | undefined, itemId: string,
		favorite: boolean, expectedRevision: number
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:edit');
		RPGBagManagement.setFavorite(record.state, itemId, favorite, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	setBagItemMission(
		token: string, characterId: string | undefined, itemId: string,
		mission: boolean, expectedRevision: number, quantity?: number, note?: string, linkedEggId?: string
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:edit');
		const id = toID(itemId);
		if (id === 'portableincubator') {
			const loaded = this.portableEggProjects(record);
			if (linkedEggId) {
				const project = loaded.find(candidate => candidate.egg?.id === linkedEggId);
				if (!project?.egg) throw new Error('Incubadora carregada desconhecida');
				if (!!project.egg.portableIncubatorMission === mission) {
					throw new Error('A incubadora já está nesta categoria');
				}
				RPGBagManagement.setMissionItem(record.state, id, mission, expectedRevision, 1, note);
				project.egg.portableIncubatorMission = mission || undefined;
			} else {
				const inventory = RPGInventorySystem.migrate(record.state.inventory);
				const inUse = loaded.filter(project => !!project.egg?.portableIncubatorMission === !mission).length;
				const pool = mission ? RPGBagSystem.getRegularQuantity(inventory.bag, id) :
					RPGBagSystem.getMissionQuantity(inventory.bag, id);
				const movable = Math.max(0, pool - inUse);
				const amount = quantity === undefined ? movable : quantity;
				if (amount > movable) throw new Error('A quantidade inclui uma Incubadora Portátil carregada');
				RPGBagManagement.setMissionItem(record.state, id, mission, expectedRevision, amount, note);
			}
		} else {
			RPGBagManagement.setMissionItem(record.state, id, mission, expectedRevision, quantity, note);
		}
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	setBagItemMissionNote(
		token: string, characterId: string | undefined, itemId: string,
		note: string, expectedRevision: number
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:edit');
		RPGBagManagement.setMissionNote(record.state, itemId, note, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	equipBagHeldItem(
		token: string, characterId: string | undefined, pokemonId: string, itemId: string,
		expectedBagRevision: number, expectedBoxRevision: number
	): { bag: RPGManagedBagView, box: RPGBoxManagementView } {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		this.requirePermission(token, 'box:edit', record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const working = structuredClone(record.state);
		RPGBagManagement.equipHeldItem(
			working, pokemonId, itemId, expectedBagRevision, expectedBoxRevision
		);
		record.state = working;
		this.persistBoxRecord(record);
		return { bag: this.managedBagView(record), box: RPGBoxManagement.view(record.state) };
	}

	removeBagHeldItem(
		token: string, characterId: string | undefined, pokemonId: string,
		expectedBagRevision: number, expectedBoxRevision: number
	): { bag: RPGManagedBagView, box: RPGBoxManagementView } {
		const record = this.requireBagRecord(token, characterId, 'bag:edit', true);
		this.requireFossilLabAccess(token, record);
		this.requireWorldBagItemUse(token, record.state.id);
		this.requirePermission(token, 'box:edit', record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const working = structuredClone(record.state);
		RPGBagManagement.removeHeldItem(working, pokemonId, expectedBagRevision, expectedBoxRevision);
		record.state = working;
		this.persistBoxRecord(record);
		return { bag: this.managedBagView(record), box: RPGBoxManagement.view(record.state) };
	}

	masterSetBagItemQuantity(
		token: string, characterId: string, itemId: string, quantity: number, expectedRevision: number,
		operation: 'add' | 'remove' | 'set' = 'set'
	): RPGManagedBagView {
		this.requireMasterRole(token);
		const record = this.requireCharacter(characterId);
		if (toID(itemId) === 'portableincubator' && operation !== 'add') {
			const current = RPGBagSystem.getQuantity(RPGInventorySystem.migrate(record.state.inventory).bag, itemId);
			const resulting = operation === 'remove' ? current - quantity : quantity;
			if (resulting < this.portableEggProjects(record).length) {
				throw new Error('Remova ou descarte os Eggs das incubadoras carregadas primeiro');
			}
		}
		RPGBagManagement.updateQuantity(record.state, itemId, quantity, expectedRevision, operation);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	listBagItemCatalog(token: string, search = ''): (RPGItemDefinition & {
		icon: string | null, sprite: number | null,
	})[] {
		this.requireMasterRole(token);
		const query = toID(search);
		return RPGItems.list()
			.filter(item => !query || item.id.includes(query) || toID(item.name).includes(query))
			.map(item => ({
				...item,
				icon: item.source === 'custom' ? null : getRPGItemIconPath(item.id),
				sprite: item.source === 'custom' ? null :
				(Number.isInteger(Dex.items.get(item.id).spritenum) ? Dex.items.get(item.id).spritenum! : null),
			}));
	}

	getBagTransferTargets(token: string, characterId: string | undefined, itemId: string, linkedEggId?: string): {
		itemId: string,
		senderRevision: number,
		targets: {
			characterId: string, characterName: string, revision: number,
			usedSlots: number, maxSlots?: number, hasItem: boolean,
			bagAllowed: boolean, canReceive: boolean,
		}[],
	} {
		const sender = this.requireBagRecord(token, characterId, 'bag:read');
		const item = this.requireTransferableBagItem(sender, itemId);
		const senderBag = RPGInventorySystem.migrate(sender.state.inventory).bag;
		const loaded = item.id === 'portableincubator' && !!linkedEggId;
		if (loaded && !this.portableEggProjects(sender).some(project =>
			project.egg?.id === linkedEggId && !project.egg.portableIncubatorMission)) {
			throw new Error('Incubadora carregada desconhecida');
		}
		const targets = this.repository.list().filter(record => record.state.id !== sender.state.id).map(record => {
			const inventory = RPGInventorySystem.migrate(record.state.inventory);
			const capacity = RPGBagSystem.getCapacity(inventory.bag);
			const currentQuantity = RPGBagSystem.getQuantity(inventory.bag, item.id);
			const hasItem = currentQuantity > 0;
			const hasStackSpace = currentQuantity < item.stackLimit;
			const bagAllowed = record.state.pageAccess?.bag !== false;
			let canReceive = bagAllowed && hasStackSpace && (hasItem || !capacity.full);
			if (canReceive && loaded) {
				canReceive = RPGIncubation.canCarry({
					teamPokemon: record.state.box.party.length,
					carriedEggs: this.activeEggs(record).length,
					bagUsedSlots: capacity.usedSlots + (hasItem ? 0 : 1),
					bagMaxSlots: capacity.maxSlots,
				}, 1).allowed;
			}
			return {
				characterId: record.state.id, characterName: record.state.characterName,
				revision: inventory.bag.revision, usedSlots: capacity.usedSlots,
				...(capacity.maxSlots === undefined ? {} : { maxSlots: capacity.maxSlots }),
				hasItem, bagAllowed, canReceive,
			};
		}).sort((left, right) => left.characterName.localeCompare(right.characterName));
		return { itemId: item.id, senderRevision: senderBag.revision, targets };
	}

	discardBagItem(
		token: string, characterId: string | undefined, itemId: string,
		quantity: number, expectedRevision: number, linkedEggId?: string
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:edit');
		const item = this.requireTransferableBagItem(record, itemId);
		record.state.inventory = RPGInventorySystem.migrate(record.state.inventory);
		const loaded = item.id === 'portableincubator' && !!linkedEggId;
		if (loaded && quantity !== 1) throw new Error('A incubadora carregada deve ser descartada individualmente');
		const occupiedRegular = item.id === 'portableincubator' ? this.portableEggProjects(record)
			.filter(project => !project.egg?.portableIncubatorMission).length : 0;
		const regular = RPGBagSystem.getRegularQuantity(record.state.inventory.bag, item.id);
		if (loaded) {
			const project = this.portableEggProjects(record).find(candidate =>
				candidate.egg?.id === linkedEggId && !candidate.egg.portableIncubatorMission);
			if (!project) throw new Error('Incubadora carregada desconhecida');
		} else if (item.id === 'portableincubator' && quantity > regular - occupiedRegular) {
			throw new Error('A quantidade inclui uma Incubadora Portátil carregada');
		} else if (quantity > regular) {
			throw new Error('A quantidade excede os itens fora de Itens de Missão');
		}
		record.state.inventory.bag = RPGBagSystem.remove(
			record.state.inventory.bag, item.id, quantity, expectedRevision
		).bag;
		if (loaded) this.removePortableEggProject(record, linkedEggId!);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	transferBagItem(
		token: string, characterId: string | undefined, targetCharacterId: string,
		itemId: string, quantity: number, expectedSenderRevision: number, expectedTargetRevision: number,
		linkedEggId?: string
	): { sender: RPGManagedBagView, targetCharacterId: string } {
		const sender = this.requireBagRecord(token, characterId, 'bag:edit');
		const item = this.requireTransferableBagItem(sender, itemId);
		const target = this.requireCharacter(targetCharacterId);
		if (target.state.id === sender.state.id) throw new Error('Escolha outro Player para receber o item');
		if (target.state.pageAccess?.bag === false) throw new Error('A Bag do Player escolhido está bloqueada');
		if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('A quantidade deve ser um inteiro positivo');
		const loaded = item.id === 'portableincubator' && !!linkedEggId;
		if (loaded && quantity !== 1) throw new Error('A incubadora carregada deve ser entregue individualmente');
		const senderInventory = RPGInventorySystem.migrate(sender.state.inventory);
		const occupiedRegular = item.id === 'portableincubator' ? this.portableEggProjects(sender)
			.filter(project => !project.egg?.portableIncubatorMission).length : 0;
		if (!loaded && quantity > RPGBagSystem.getRegularQuantity(senderInventory.bag, item.id) - occupiedRegular) {
			throw new Error('A quantidade inclui uma Incubadora Portátil carregada');
		}
		let eggProject: RPGNurseryProject | undefined;
		if (loaded) {
			eggProject = this.portableEggProjects(sender).find(project =>
				project.egg?.id === linkedEggId && !project.egg.portableIncubatorMission);
			if (!eggProject?.egg) throw new Error('Incubadora carregada desconhecida');
		}
		const targetInventory = RPGInventorySystem.migrate(target.state.inventory);
		if (loaded) {
			const capacity = RPGBagSystem.getCapacity(targetInventory.bag);
			const hasItem = RPGBagSystem.getQuantity(targetInventory.bag, item.id) > 0;
			const carrying = RPGIncubation.canCarry({
				teamPokemon: target.state.box.party.length, carriedEggs: this.activeEggs(target).length,
				bagUsedSlots: capacity.usedSlots + (hasItem ? 0 : 1), bagMaxSlots: capacity.maxSlots,
			}, 1);
			if (!carrying.allowed) throw new Error('O Player precisa de 1 vaga na equipe e 5 espaços na Bag para receber o Egg');
		}
		const originalSender = structuredClone(sender);
		const originalTarget = structuredClone(target);
		const fossilQualities = RPGFossilLab.takeRandomQualities(sender.state, item.id, quantity, this.random);
		if (fossilQualities) RPGFossilLab.addKnownQualities(target.state, item.id, fossilQualities, this.random);
		const removed = RPGBagSystem.remove(senderInventory.bag, item.id, quantity, expectedSenderRevision);
		const added = RPGBagSystem.add(targetInventory.bag, item.id, quantity, expectedTargetRevision);
		sender.state.inventory = { ...senderInventory, bag: removed.bag };
		target.state.inventory = { ...targetInventory, bag: added.bag };
		if (eggProject?.egg) {
			this.removePortableEggProject(sender, eggProject.egg.id);
			eggProject.egg.ownerId = target.state.id;
			eggProject.eggOwnerId = target.state.id;
			eggProject.egg.portableIncubatorId = target.state.id + ':portable:' + eggProject.egg.id;
			delete eggProject.egg.portableIncubatorMission;
			this.ensureNursery(target).projects.push(eggProject);
		}
		this.persistBoxRecord(sender);
		try {
			this.persistBoxRecord(target);
		} catch (error) {
			this.repository.set(originalSender);
			this.repository.set(originalTarget);
			throw error;
		}
		return { sender: this.managedBagView(sender), targetCharacterId: target.state.id };
	}

	completeMissionItem(
		token: string, characterId: string, itemId: string, expectedRevision: number,
		reward: { type: 'item', itemId: string, quantity: number } | { type: 'pokecoin', amount: number }
	): { bag: RPGManagedBagView, money: number } {
		this.requireMasterRole(token);
		const record = this.requireCharacter(characterId);
		record.state.inventory = RPGInventorySystem.migrate(record.state.inventory);
		const item = RPGItems.require(itemId);
		const bag = record.state.inventory.bag;
		const missionQuantity = item.tags?.includes('mission') ?
			RPGBagSystem.getQuantity(bag, item.id) : RPGBagSystem.getMissionQuantity(bag, item.id);
		if (missionQuantity < 1) throw new Error('O item não está registrado como Item de Missão');
		if (bag.revision !== expectedRevision) throw new Error('RPG Bag revision conflict');
		const missionQuantities = { ...bag.missionQuantities };
		delete missionQuantities[item.id];
		const missionNotes = { ...bag.missionNotes };
		delete missionNotes[item.id];
		const prepared = {
			...bag, missionQuantities, missionItems: Object.keys(missionQuantities), missionNotes,
		};
		const operations: import('../../sim/rpg-showdown').RPGBagOperation[] = [
			{ type: 'remove', itemId: item.id, quantity: missionQuantity },
		];
		if (reward.type === 'item') {
			const rewardItem = RPGItems.require(reward.itemId);
			if (rewardItem.id === item.id) throw new Error('A recompensa deve ser diferente do item entregue');
			if (!Number.isSafeInteger(reward.quantity) || reward.quantity < 1 || reward.quantity > 99) {
				throw new Error('Quantidade de recompensa inválida');
			}
			operations.push({ type: 'add', itemId: rewardItem.id, quantity: reward.quantity });
		} else {
			if (!Number.isSafeInteger(reward.amount) || reward.amount < 1) {
				throw new Error('Quantidade de Pokécoins inválida');
			}
			if (!Number.isSafeInteger(record.state.money + reward.amount)) {
				throw new Error('Saldo de Pokécoins inválido');
			}
		}
		record.state.inventory.bag = RPGBagSystem.apply(prepared, operations, expectedRevision).bag;
		if (item.id === 'portableincubator') {
			for (const project of [...this.portableEggProjects(record)]) {
				if (project.egg?.portableIncubatorMission) this.removePortableEggProject(record, project.egg.id);
			}
		}
		if (reward.type === 'pokecoin') record.state.money += reward.amount;
		this.persistBoxRecord(record);
		return { bag: this.managedBagView(record), money: record.state.money };
	}

	createCustomBagItem(token: string, input: Omit<RPGItemDefinition, 'source'>): RPGItemDefinition {
		this.requireMasterRole(token);
		const requested = structuredClone(input);
		const description = typeof requested.effect?.description === 'string' ? requested.effect.description.trim() : '';
		const definition: RPGItemDefinition = {
			id: requested.id, name: requested.name, category: 'custom', stackLimit: 99,
			usableInBattle: false, consumedOnUse: false, source: 'custom',
			effect: { type: 'mission', description: description || 'Item de missão do RPG.' },
			tags: ['mission'],
		};
		const registered = RPGItems.register(definition);
		try {
			this.customItems.create(registered);
		} catch (error) {
			RPGItems.unregister(registered.id);
			throw error;
		}
		return structuredClone(registered);
	}

	getBox(token: string, characterId?: string, query: RPGBoxQuery = {}): RPGBoxManagementView {
		const record = this.requireBoxRecord(token, characterId, 'box:read');
		this.resolveCompletedEVTrainings(record);
		return this.managedBoxView(record, query);
	}

	renameCharacterBox(
		token: string, characterId: string | undefined, boxIndex: number, name: string, expectedRevision: number
	): RPGBoxManagementView {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		RPGBoxManagement.rename(record.state, boxIndex, name, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	moveBoxPokemon(
		token: string, characterId: string | undefined, input: RPGBoxMoveInput
	): RPGBoxManagementView {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		const sourceInParty = record.state.box.party.some(entry => entry.pokemonId === input.pokemonId);
		const destinationEntry = input.destination.destination === 'party' ?
			record.state.box.party[input.destination.position] :
			record.state.box.boxes[input.destination.boxIndex]?.slots[input.destination.slot];
		const destinationInParty = input.destination.destination === 'party';
		if (sourceInParty !== destinationInParty && (
			this.isPokemonBreeding(record.state.id, input.pokemonId) ||
			(destinationEntry && this.isPokemonBreeding(record.state.id, destinationEntry.pokemonId))
		)) {
			throw new Error('Pokémon em procriação deve permanecer na equipe até a produção do ovo');
		}
		RPGBoxManagement.move(record.state, input);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	updateBoxPokemonMetadata(
		token: string, characterId: string | undefined, pokemonId: string,
		metadata: Partial<RPGBoxPokemonMetadata>, expectedRevision: number
	): RPGBoxManagementView {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		RPGBoxManagement.metadata(record.state, pokemonId, metadata, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	getBoxHealingItems(token: string, characterId: string | undefined, pokemonId: string): {
		items: { id: string, name: string, quantity: number, category: string, effect: Record<string, unknown> }[],
		bagRevision: number, boxRevision: number,
	} {
		const record = this.requireBoxRecord(token, characterId, 'box:read');
		const pokemon = RPGBoxManagement.view(record.state).results.find(entry => entry.pokemonId === pokemonId);
		if (!pokemon) throw new Error('Unknown RPG Box Pokemon');
		const items = record.state.inventory.bag.items.flatMap(entry => {
			const item = RPGItems.get(entry.itemId);
			if (!item?.effect || entry.quantity < 1) return [];
			const effect = item.effect;
			let valid = false;
			if (pokemon.fainted) {
				valid = effect.type === 'revive';
			} else if (effect.type === 'heal-hp') {
				valid = pokemon.hp < pokemon.maxHP || (!!pokemon.status && effect.cureStatus === true);
			} else if (effect.type === 'cure-status' && pokemon.status) {
				const statuses = Array.isArray(effect.statuses) ? effect.statuses : [];
				valid = !statuses.length || statuses.includes(pokemon.status);
			}
			return valid ? [{
				id: item.id, name: item.name, quantity: entry.quantity,
				category: item.category, effect: structuredClone(effect),
			}] : [];
		});
		return {
			items, bagRevision: record.state.inventory.bag.revision,
			boxRevision: record.state.box.revision,
		};
	}

	useBoxHealingItem(
		token: string, characterId: string | undefined, pokemonId: string, itemId: string,
		actionId: string, expectedBoxRevision: number, expectedBagRevision: number, move?: number
	): { box: RPGBoxManagementView, inventory: RPGInventoryState } {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		this.requireWorldBagItemUse(token, record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const target = RPGBoxManagement.itemTarget(record.state, pokemonId);
		const result = RPGItemUseSystem.useOutsideBattle(record.state.inventory, [target], {
			actionId, itemId, expectedRevision: expectedBagRevision, move,
		});
		if (!result.success || !result.targets[0]?.changed) {
			throw new Error('O item não pode ser usado neste Pokémon: ' + (result.reason || 'sem efeito'));
		}
		RPGBoxManagement.applyItemState(
			record.state, pokemonId, result.targets[0].state, expectedBoxRevision
		);
		record.state.inventory = result.inventory;
		this.persistBoxRecord(record);
		return {
			box: RPGBoxManagement.view(record.state),
			inventory: structuredClone(record.state.inventory),
		};
	}
	getEvolutionItemTargets(
		token: string, characterId: string | undefined, itemId: string
	): {
		item: { id: string, name: string, quantity: number },
		targets: { pokemonId: string, name: string, species: string, level: number, options: RPGItemEvolutionOption[] }[],
		bagRevision: number, boxRevision: number,
	} {
		const record = this.requireBoxRecord(token, characterId, 'box:read');
		const item = RPGItems.require(itemId);
		if (item.category !== 'evolution' || item.effect?.type !== 'evolve') {
			throw new Error('Este item não é um item de evolução');
		}
		const quantity = RPGInventorySystem.getAvailableQuantity(record.state.inventory, item.id);
		if (quantity < 1) throw new Error('Este item não está disponível na Bag');
		const view = RPGBoxManagement.view(record.state);
		const targets = view.results.flatMap(pokemon => {
			if (pokemon.metadata.evTraining) return [];
			const options = RPGBoxManagement.itemEvolutionOptions(record.state, pokemon.pokemonId, item.id);
			return options.length ? [{
				pokemonId: pokemon.pokemonId, name: pokemon.name, species: pokemon.species,
				level: pokemon.level, options,
			}] : [];
		});
		return {
			item: { id: item.id, name: item.name, quantity }, targets,
			bagRevision: record.state.inventory.bag.revision, boxRevision: record.state.box.revision,
		};
	}

	useEvolutionItem(
		token: string, characterId: string | undefined, pokemonId: string, itemId: string,
		toSpecies: string, actionId: string, expectedBoxRevision: number, expectedBagRevision: number
	): { box: RPGBoxManagementView, inventory: RPGInventoryState, evolution: RPGItemEvolutionResult, replayed: boolean } {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		this.requireWorldBagItemUse(token, record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const item = RPGItems.require(itemId);
		if (item.category !== 'evolution' || item.effect?.type !== 'evolve') {
			throw new Error('Este item não é um item de evolução');
		}
		const reason = `item-evolution:${pokemonId}:${toID(toSpecies)}`;
		const previous = record.state.inventory.transactions.find(transaction => transaction.actionId === actionId);
		if (previous?.status === 'consumed') {
			if (previous.itemId !== item.id || previous.reason !== reason) {
				throw new Error('RPG inventory actionId conflict: ' + actionId);
			}
			const current = RPGBoxManagement.view(record.state).results.find(pokemon => pokemon.pokemonId === pokemonId);
			if (!current || current.speciesId !== toID(toSpecies)) {
				throw new Error('A evolução repetida não corresponde ao Pokémon atual');
			}
			const dexSpecies = Dex.mod('gen9').species.get(current.species);
			const evolution: RPGItemEvolutionResult = {
				pokemonId, fromSpecies: current.species, toSpecies: current.species,
				fromSpriteId: current.spriteId, toSpriteId: current.spriteId,
				shiny: !!current.shiny,
				fromSizeClass: getRPGPokemonSizeClass(dexSpecies.heightm),
				toSizeClass: getRPGPokemonSizeClass(dexSpecies.heightm), level: current.level,
			};
			return {
				box: RPGBoxManagement.view(record.state),
				inventory: structuredClone(record.state.inventory), evolution, replayed: true,
			};
		}
		const selected = RPGBoxManagement.view(record.state).results.find(pokemon => pokemon.pokemonId === pokemonId);
		if (!selected || selected.location.destination !== 'party') {
			throw new Error('TMs só podem ser usadas em Pokémon da equipe atual');
		}
		const working = structuredClone(record.state);
		const reserved = RPGInventorySystem.reserve(working.inventory, {
			actionId, itemId: item.id, context: 'world', reason,
		}, expectedBagRevision);
		working.inventory = reserved.inventory;
		const evolution = RPGBoxManagement.evolveWithItem(
			working, pokemonId, item.id, toSpecies, expectedBoxRevision
		);
		const committed = RPGInventorySystem.commit(working.inventory, actionId, working.inventory.bag.revision);
		working.inventory = committed.inventory;
		record.state = working;
		this.persistBoxRecord(record);
		return {
			box: RPGBoxManagement.view(record.state), inventory: structuredClone(record.state.inventory),
			evolution, replayed: false,
		};
	}
	getTechnicalMachineTargets(
		token: string, characterId: string | undefined, itemId: string
	): {
		item: { id: string, name: string, quantity: number },
		move: { id: string, name: string, type: string, category: string, pp: number, maxPP: number } & RPGMoveMetadata,
		targets: RPGTechnicalMachineTarget[], bagRevision: number, boxRevision: number,
	} {
		const record = this.requireBoxRecord(token, characterId, 'box:read');
		const item = RPGItems.require(itemId);
		const moveId = typeof item.effect?.move === 'string' ? toID(item.effect.move) : '';
		if (item.category !== 'tm' || item.effect?.type !== 'teach-move' || !moveId) {
			throw new Error('Este item não é uma TM');
		}
		const quantity = RPGInventorySystem.getAvailableQuantity(record.state.inventory, item.id);
		if (quantity < 1) throw new Error('Esta TM não está disponível na Bag');
		const move = Dex.mod('gen9').moves.get(moveId);
		if (!move.exists) throw new Error('A TM possui um movimento desconhecido');
		const targets = RPGBoxManagement.view(record.state).results.flatMap(pokemon => {
			if (pokemon.location.destination !== 'party' || pokemon.metadata.evTraining) return [];
			const moves = pokemon.moves.map(knownMove => {
				const known = Dex.mod('gen9').moves.get(knownMove.id);
				return { ...knownMove, ...getRPGMoveMetadata(known) };
			});
			const target = RPGBoxManagement.technicalMachineTarget(record.state, pokemon.pokemonId, move.id);
			if (target) return [{ ...target, moves, eligible: true }];
			const knowsMove = pokemon.moves.some(knownMove => knownMove.id === move.id);
			return [{
				pokemonId: pokemon.pokemonId, name: pokemon.name, species: pokemon.species,
				level: pokemon.level, shiny: !!pokemon.shiny, moves, hasOpenMoveSlot: pokemon.moves.length < 4,
				eligible: false,
				disabledReason: knowsMove ? 'Já conhece este movimento' : 'Não pode aprender esta TM',
			}];
		});
		return {
			item: { id: item.id, name: item.name, quantity },
			move: {
				id: move.id, name: move.name, type: move.type, category: move.category,
				pp: move.pp, maxPP: move.pp, ...getRPGMoveMetadata(move),
			},
			targets, bagRevision: record.state.inventory.bag.revision, boxRevision: record.state.box.revision,
		};
	}

	useTechnicalMachine(
		token: string, characterId: string | undefined, pokemonId: string, itemId: string,
		forgottenMoveId: string | undefined, actionId: string,
		expectedBoxRevision: number, expectedBagRevision: number
	): { box: RPGBoxManagementView, inventory: RPGInventoryState, learned: RPGTechnicalMachineResult, replayed: boolean } {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		this.requireWorldBagItemUse(token, record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const item = RPGItems.require(itemId);
		const moveId = typeof item.effect?.move === 'string' ? toID(item.effect.move) : '';
		if (item.category !== 'tm' || item.effect?.type !== 'teach-move' || !moveId) {
			throw new Error('Este item não é uma TM');
		}
		const replacement = toID(forgottenMoveId || '');
		const reason = `tm-learning:${pokemonId}:${moveId}:${replacement || '-'}`;
		const previous = record.state.inventory.transactions.find(transaction => transaction.actionId === actionId);
		if (previous?.status === 'consumed') {
			if (previous.itemId !== item.id || previous.reason !== reason) {
				throw new Error('RPG inventory actionId conflict: ' + actionId);
			}
			const current = RPGBoxManagement.view(record.state).results.find(pokemon => pokemon.pokemonId === pokemonId);
			const learnedMove = current?.moves.find(move => move.id === moveId);
			if (!current || !learnedMove) throw new Error('O uso repetido da TM não corresponde ao Pokémon atual');
			return {
				box: RPGBoxManagement.view(record.state), inventory: structuredClone(record.state.inventory),
				learned: {
					pokemonId, pokemonName: current.name, species: current.species,
					moveId: learnedMove.id, moveName: learnedMove.name, moves: structuredClone(current.moves),
				},
				replayed: true,
			};
		}
		const selected = RPGBoxManagement.view(record.state).results.find(pokemon => pokemon.pokemonId === pokemonId);
		if (!selected || selected.location.destination !== 'party') {
			throw new Error('TMs só podem ser usadas em Pokémon da equipe atual');
		}
		const working = structuredClone(record.state);
		const reserved = RPGInventorySystem.reserve(working.inventory, {
			actionId, itemId: item.id, context: 'world', reason,
		}, expectedBagRevision);
		working.inventory = reserved.inventory;
		const learned = RPGBoxManagement.teachTechnicalMachine(
			working, pokemonId, moveId, forgottenMoveId, expectedBoxRevision
		);
		working.inventory = RPGInventorySystem.commit(
			working.inventory, actionId, working.inventory.bag.revision
		).inventory;
		record.state = working;
		this.persistBoxRecord(record);
		return {
			box: RPGBoxManagement.view(record.state), inventory: structuredClone(record.state.inventory),
			learned, replayed: false,
		};
	}

	healBoxPokemonAtCenter(
		token: string, characterId: string | undefined, pokemonId: string, expectedRevision: number
	): RPGBoxManagementView {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		RPGBoxManagement.healAtCenter(record.state, pokemonId, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	getPokemonCenter(token: string, characterId?: string) {
		const record = this.requirePokemonCenterRecord(token, characterId, 'box:read');
		return this.pokemonCenterView(record, this.getSession(token).role === 'master');
	}

	usePokemonCenter(
		token: string, characterId: string | undefined, action: 'team' | 'heal' | 'revive',
		pokemonId: string | undefined, expectedRevision: number
	) {
		if (!['team', 'heal', 'revive'].includes(action)) throw new Error('Ação inválida do Centro Pokémon');
		const record = this.requirePokemonCenterRecord(token, characterId, 'box:edit');
		if (record.state.box.revision !== expectedRevision) throw new Error('RPG Box revision conflict');
		const master = this.getSession(token).role === 'master';
		const beforeCenter = this.pokemonCenterView(record, master);
		const eligible = action === 'team' ? beforeCenter.team.filter(pokemon => pokemon.needsRecovery) :
			beforeCenter.pokemon.filter(pokemon => pokemon.pokemonId === pokemonId &&
				(action === 'revive' ? pokemon.fainted : pokemon.needsRecovery));
		if (!eligible.length) throw new Error(action === 'revive' ?
			'Este Pokémon não está desmaiado' : 'Nenhum Pokémon precisa de recuperação');
		const cost = master ? 0 : eligible.reduce((sum, pokemon) =>
			sum + (action === 'revive' ? pokemon.reviveCost : pokemon.fullRecoveryCost), 0);
		if (!master && record.state.money < cost) throw new Error('Pokecoins insuficientes para o Centro Pokémon');
		const working = structuredClone(record.state);
		const changes = [];
		for (const pokemon of eligible) {
			const before = RPGBoxManagement.view(working).results.find(entry => entry.pokemonId === pokemon.pokemonId)!;
			if (action === 'revive') {
				const target = RPGBoxManagement.itemTarget(working, pokemon.pokemonId);
				RPGBoxManagement.applyItemState(working, pokemon.pokemonId, {
					...target.state, hp: Math.max(1, Math.floor(target.maxHP / 2)), status: '', sleepTurns: undefined,
				}, working.box.revision);
			} else {
				RPGBoxManagement.healAtCenter(working, pokemon.pokemonId, working.box.revision);
			}
			const after = RPGBoxManagement.view(working).results.find(entry => entry.pokemonId === pokemon.pokemonId)!;
			changes.push({
				pokemonId: pokemon.pokemonId, name: pokemon.name,
				hpBefore: before.hp, hpAfter: after.hp, maxHP: after.maxHP,
				statusBefore: before.status, statusAfter: after.status,
				pp: before.moves.map((move, index) => ({
					name: move.name, before: move.pp, after: after.moves[index]?.pp ?? move.pp,
					max: after.moves[index]?.maxPP ?? move.maxPP,
				})),
				revived: before.fainted && !after.fainted,
			});
		}
		working.money -= cost;
		record.state = working;
		this.persistBoxRecord(record);
		return { center: this.pokemonCenterView(record, master), cost, changes };
	}
	createPokemonReleaseChallenge(
		token: string, characterId: string | undefined, pokemonId: string, expectedRevision: number
	): RPGPokemonReleaseChallenge {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		this.requirePokemonNotBreeding(record, pokemonId);
		if (record.state.box.revision !== expectedRevision) throw new Error('RPG Box revision conflict');
		const pokemon = RPGBoxManagement.view(record.state).results.find(entry => entry.pokemonId === pokemonId);
		if (!pokemon) throw new Error('Unknown RPG Box Pokemon');
		const challengeId = this.bytes(18).toString('base64url');
		const challenge: RPGInternalPokemonReleaseChallenge = {
			challengeId, characterId: record.state.id, pokemonId, pokemonName: pokemon.name,
			expectedRevision, expiresAt: this.now() + RPG_DELETE_CHALLENGE_TTL,
			sessionKey: this.tokenKey(token),
		};
		this.pokemonReleaseChallenges.set(challengeId, challenge);
		return structuredClone(challenge);
	}

	releaseBoxPokemon(token: string, challengeId: string, confirmed: boolean): RPGBoxManagementView {
		const challenge = this.pokemonReleaseChallenges.get(challengeId);
		if (!challenge || challenge.sessionKey !== this.tokenKey(token) || challenge.expiresAt <= this.now()) {
			if (challenge) this.pokemonReleaseChallenges.delete(challengeId);
			throw new Error('Invalid or expired RPG Pokemon release challenge');
		}
		this.pokemonReleaseChallenges.delete(challengeId);
		if (confirmed !== true) throw new Error('RPG Pokemon release was not confirmed');
		const record = this.requireBoxRecord(token, challenge.characterId, 'box:edit');
		this.requirePokemonNotBreeding(record, challenge.pokemonId);
		RPGBoxManagement.release(record.state, challenge.pokemonId, challenge.expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	editBoxPokemonWithTeamBuilder(
		token: string, characterId: string | undefined, pokemonId: string,
		candidate: PokemonSet, expectedRevision: number
	): RPGBoxManagementView {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requirePermission(token, 'team:edit', record.state.id);
		if (!RPGBoxManagement.isPartyPokemon(record.state, pokemonId)) {
			throw new Error('Pokémon armazenado na Box está disponível apenas para consulta');
		}
		const session = this.getSession(token);
		if (session.role === 'master') {
			const current = RPGBoxManagement.pokemonSet(record.state, pokemonId);
			for (const field of ['species', 'gender', 'nature', 'item'] as const) {
				if (candidate[field] !== current[field]) {
					throw new Error('RPG Team Builder master field is locked: ' + field);
				}
			}
			if (!!candidate.shiny !== !!current.shiny) {
				throw new Error('RPG Team Builder master field is locked: shiny');
			}
			if (candidate.name !== current.name) {
				throw new Error('RPG Team Builder master field is locked: name');
			}
			const dex = Dex.mod('gen9');
			const species = dex.species.get(current.species);
			const allowedAbilities = new Set(Object.values(species.abilities).filter(Boolean).map(toID));
			if (!allowedAbilities.has(toID(candidate.ability))) {
				throw new Error('Esta Ability não está disponível para este Pokémon');
			}
			const allowedMoves = new Set(current.moves.map(toID));
			for (const data of dex.species.getFullLearnset(species.id)) {
				for (const [move, sources] of Object.entries(data.learnset)) {
					if (sources.some(source => source.startsWith("9"))) allowedMoves.add(move);
				}
			}
			if (candidate.moves.some(move => !allowedMoves.has(toID(move)))) {
				throw new Error('Este Pokémon não pode aprender um dos movimentos selecionados');
			}
			RPGBoxManagement.teamBuilder(record.state, pokemonId, candidate, expectedRevision, 999, true);
		} else {
			RPGBoxManagement.playerTeamBuilder(record.state, pokemonId, candidate, expectedRevision);
		}
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	getPokemonTeamBuilder(
		token: string, characterId: string | undefined, pokemonId: string
	): RPGTeamBuilderManagementView {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:read', pokemonId);
		if (RPGBoxManagement.resolveEVTraining(record.state, pokemonId, this.now())) {
			record.state.updatedAt = this.now();
			this.persistBoxRecord(record);
		}
		const session = this.getSession(token);
		return RPGTeamBuilderManagement.view(
			record.state, pokemonId, session.role === 'master'
		);
	}

	reorderPokemonMoves(
		token: string, characterId: string | undefined, pokemonId: string,
		fromSlot: number, toSlot: number, expectedRevision: number
	): RPGTeamBuilderManagementView {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requirePermission(token, 'team:edit', record.state.id);
		if (!RPGBoxManagement.isPartyPokemon(record.state, pokemonId)) {
			throw new Error('Pokémon armazenado na Box está disponível apenas para consulta');
		}
		RPGBoxManagement.reorderMoves(record.state, pokemonId, fromSlot, toSlot, expectedRevision);
		this.persistBoxRecord(record);
		const session = this.getSession(token);
		return RPGTeamBuilderManagement.view(record.state, pokemonId, session.role === 'master');
	}

	trainPokemonEVs(
		token: string, characterId: string | undefined, pokemonId: string,
		fromStat: import('./box-management').RPGTeamBuilderStat,
		toStat: import('./box-management').RPGTeamBuilderStat, amount: number, expectedRevision: number
	): { teamBuilder: RPGTeamBuilderManagementView, training: RPGEVTrainingResult } {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requireTrainingPageAccess(token, record);
		this.requirePermission(token, 'team:edit', record.state.id);
		this.requireWorldBagItemUse(token, record.state.id);
		const training = RPGBoxManagement.trainEVs(
			record.state, pokemonId, fromStat, toStat, amount, expectedRevision, this.now()
		);
		this.persistBoxRecord(record);
		const session = this.getSession(token);
		return {
			teamBuilder: RPGTeamBuilderManagement.view(
				record.state, pokemonId, session.role === 'master'
			),
			training,
		};
	}

	trainPokemonEVDistribution(
		token: string, characterId: string | undefined, pokemonId: string,
		evs: Record<import('./box-management').RPGTeamBuilderStat, number>, expectedRevision: number
	): {
		teamBuilder: RPGTeamBuilderManagementView,
		training: import('./box-management').RPGEVDistributionTrainingResult,
	} {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requireTrainingPageAccess(token, record);
		this.requirePermission(token, 'team:edit', record.state.id);
		this.requireWorldBagItemUse(token, record.state.id);
		const training = RPGBoxManagement.trainEVDistribution(
			record.state, pokemonId, evs, expectedRevision, this.now()
		);
		this.persistBoxRecord(record);
		const session = this.getSession(token);
		return {
			teamBuilder: RPGTeamBuilderManagement.view(record.state, pokemonId, session.role === 'master'),
			training,
		};
	}

	usePokemonIVVitamin(
		token: string, characterId: string | undefined, pokemonId: string, itemId: string, actionId: string,
		expectedBoxRevision: number, expectedBagRevision: number
	): { teamBuilder: RPGTeamBuilderManagementView, replayed: boolean } {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requireTrainingPageAccess(token, record);
		this.requirePermission(token, 'team:edit', record.state.id);
		this.requireWorldBagItemUse(token, record.state.id);
		this.requireAvailablePokemon(record, pokemonId);
		const item = RPGItems.require(itemId);
		const stat = RPG_IV_VITAMINS[item.id];
		if (!stat || item.effect?.type !== 'raise-iv') throw new Error('Este item não é uma vitamina de IV');
		const reason = 'iv-vitamin:' + pokemonId + ':' + stat;
		const previous = record.state.inventory.transactions.find(entry => entry.actionId === actionId);
		if (previous?.status === 'consumed') {
			if (previous.itemId !== item.id || previous.reason !== reason) {
				throw new Error('RPG inventory actionId conflict: ' + actionId);
			}
			const session = this.getSession(token);
			return {
				teamBuilder: RPGTeamBuilderManagement.view(
					record.state, pokemonId, session.role === 'master'
				),
				replayed: true,
			};
		}
		const working = structuredClone(record.state);
		working.inventory = RPGInventorySystem.reserve(working.inventory, {
			actionId, itemId: item.id, context: 'world', reason,
		}, expectedBagRevision).inventory;
		RPGBoxManagement.applyIVVitamin(working, pokemonId, stat, expectedBoxRevision);
		working.inventory = RPGInventorySystem.commit(
			working.inventory, actionId, working.inventory.bag.revision
		).inventory;
		working.updatedAt = this.now();
		record.state = working;
		this.persistBoxRecord(record);
		const session = this.getSession(token);
		return {
			teamBuilder: RPGTeamBuilderManagement.view(
				record.state, pokemonId, session.role === 'master'
			),
			replayed: false,
		};
	}

	masterEditBoxPokemon(
		token: string, characterId: string, pokemonId: string,
		edit: RPGBoxMasterEdit, expectedRevision: number
	): RPGBoxManagementView {
		this.requireViewedMasterCharacter(token, characterId);
		const record = this.requireCharacter(characterId);
		RPGBoxManagement.masterEdit(record.state, pokemonId, edit, expectedRevision);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	masterAddBoxPokemon(
		token: string, characterId: string, pokemon: RPGCapturedPokemon
	): RPGBoxManagementView {
		this.requireViewedMasterCharacter(token, characterId);
		const record = this.requireCharacter(characterId);
		const pokemonId = `${record.state.id}:master:${this.bytes(12).toString('base64url')}`;
		const entry: RPGManagedStoredPokemon = {
			pokemonId, pokemon: structuredClone(pokemon),
			metadata: { ot: record.state.characterName, training: 'none' },
		};
		RPGBoxManagement.insert(record.state, entry);
		this.persistBoxRecord(record);
		return this.managedBoxView(record);
	}

	transferBoxPokemon(
		token: string, fromCharacterId: string, toCharacterId: string, pokemonId: string,
		sourceRevision: number, destinationRevision: number
	): { source: RPGBoxManagementView, destination: RPGBoxManagementView } {
		this.requireViewedMasterCharacter(token, fromCharacterId);
		const source = this.requireCharacter(fromCharacterId);
		const destination = this.requireCharacter(toCharacterId);
		if (source.state.id === destination.state.id) throw new Error('RPG Pokemon transfer requires different characters');
		if (destination.state.box.revision !== destinationRevision) throw new Error('RPG destination Box revision conflict');
		this.requirePokemonNotBreeding(source, pokemonId);
		const originalSource = structuredClone(source);
		const entry = RPGBoxManagement.extract(source.state, pokemonId, sourceRevision);
		RPGBoxManagement.insert(destination.state, entry);
		this.persistBoxRecord(source);
		try {
			this.persistBoxRecord(destination);
		} catch (error) {
			this.repository.set(originalSource);
			throw error;
		}
		return {
			source: this.managedBoxView(source),
			destination: this.managedBoxView(destination),
		};
	}

	replaceCharacterTeam(token: string, characterId: string, input: PokemonSet[]): RPGCharacterState {
		this.requireViewedMasterCharacter(token, characterId);
		const record = this.requireCharacter(characterId);
		if (record.state.box.party.some(entry => this.isPokemonBreeding(record.state.id, entry.pokemonId))) {
			throw new Error('A equipe não pode ser substituída enquanto houver Pokémon em procriação');
		}
		if (!Array.isArray(input) || input.length < 1 || input.length > 6) {
			throw new Error('RPG character team must contain between 1 and 6 Pokemon');
		}
		const dex = Dex.mod('gen9');
		const team = input.map((rawSet, index) => {
			if (!rawSet || typeof rawSet !== 'object') throw new Error('Invalid RPG Pokemon set');
			const species = dex.species.get(rawSet.species);
			if (!species.exists) throw new Error(`Invalid RPG Pokemon species at team position ${index + 1}`);
			const level = Number(rawSet.level || 1);
			if (!Number.isInteger(level) || level < 1 || level > 100) {
				throw new Error('RPG player Pokemon level must be between 1 and 100');
			}
			if (!Array.isArray(rawSet.moves) || rawSet.moves.length < 1 || rawSet.moves.length > 4) {
				throw new Error('RPG Pokemon must have between 1 and 4 moves');
			}
			const moves = rawSet.moves.map(move => {
				const entry = dex.moves.get(move);
				if (!entry.exists) throw new Error('Invalid RPG Pokemon move: ' + move);
				return entry.id;
			});
			const set = structuredClone(rawSet);
			set.name = typeof set.name === 'string' && set.name.trim() ? set.name.trim() : species.name;
			set.species = species.name;
			set.level = level;
			set.moves = moves;
			return set;
		});
		const party = team.map((set, index) => {
			const previous = record.state.box.party[index] as RPGManagedStoredPokemon | undefined;
			return {
				pokemonId: previous?.pokemonId || `${record.state.id}:team:${index + 1}`,
				pokemon: this.toCapturedPokemon(set),
				...(previous?.metadata ? { metadata: structuredClone(previous.metadata) } : {}),
			};
		});
		const storedPokemonIds = new Set([
			...party.map(entry => entry.pokemonId),
			...record.state.box.boxes.flatMap(box => box.slots)
				.filter(Boolean).map(entry => entry!.pokemonId),
		]);
		record.state.team = team;
		record.state.box = RPGBoxSystem.create(record.state.id, {
			tier: record.state.box.tier,
			revision: record.state.box.revision + 1,
			party,
			boxes: record.state.box.boxes,
			placements: record.state.box.placements.filter(placement => storedPokemonIds.has(placement.pokemonId)),
		});
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return structuredClone(record.state);
	}

	createBattleSession(token: string, input: RPGCreateBattleSessionRequest = {}): RPGBattleSession {
		this.requireMasterMode(token);
		return this.battleSessions.create(input);
	}

	updateBattleSession(
		token: string, battleSessionId: string, input: RPGUpdateBattleSessionRequest
	): RPGBattleSession {
		this.requireMasterMode(token);
		return this.battleSessions.update(battleSessionId, input);
	}

	inviteBattleSession(token: string, battleSessionId: string): RPGBattleSession {
		this.requireMasterMode(token);
		return this.battleSessions.invite(battleSessionId);
	}

	listBattleSessions(token: string): RPGBattleSession[] {
		const session = this.getSession(token);
		if (session.mode === 'master') return this.battleSessions.list();
		const characterId = session.characterId || session.viewAsCharacterId;
		if (!characterId) throw new Error('RPG player session requires a character');
		return this.battleSessions.list(characterId);
	}

	getBattleSession(token: string, battleSessionId: string): RPGBattleSession {
		const session = this.getSession(token);
		const battleSession = this.battleSessions.get(battleSessionId);
		if (session.mode === 'master') return battleSession;
		const characterId = session.characterId || session.viewAsCharacterId;
		if (battleSession.status === 'draft' ||
			!battleSession.participants.some(participant => participant.characterId === characterId)) {
			throw new Error('RPG player session cannot access another battle session');
		}
		return battleSession;
	}

	selectBattleSessionPokemon(
		token: string, battleSessionId: string, pokemon: import('./battle-session').RPGBattleParticipantPokemon[]
	): RPGBattleSession {
		const session = this.getSession(token);
		if (session.role !== 'player' || session.mode !== 'player' || !session.characterId) {
			throw new Error('RPG player session required to select battle Pokemon');
		}
		return this.battleSessions.selectPokemon(battleSessionId, session.characterId, pokemon);
	}

	respondToBattleInvitation(
		token: string, battleSessionId: string, response: 'accepted' | 'declined'
	): RPGBattleSession {
		const session = this.getSession(token);
		if (session.role !== 'player' || session.mode !== 'player' || !session.characterId) {
			throw new Error('RPG player session required to answer a battle invitation');
		}
		return this.battleSessions.respond(battleSessionId, session.characterId, response);
	}

	startBattleSession(
		token: string, battleSessionId: string
	): { session: RPGBattleSession, launch: RPGBattleLaunchRequest } {
		this.requireMasterMode(token);
		const started = this.battleSessions.start(battleSessionId);
		try {
			started.session = this.reserveBattleWager(started.session);
			return started;
		} catch (error) {
			this.battleSessions.rollbackStart(battleSessionId);
			throw error;
		}
	}

	rollbackBattleSessionStart(battleSessionId: string): RPGBattleSession {
		this.refundBattleWager(this.battleSessions.get(battleSessionId));
		return this.battleSessions.rollbackStart(battleSessionId);
	}

	/** Restores safely restartable sessions after the process lost its in-memory battle runtime. */
	recoverInterruptedBattleSessions(): RPGBattleSession[] {
		const recovered: RPGBattleSession[] = [];
		for (const session of this.battleSessions.list().filter(entry => entry.status === 'started')) {
			this.refundBattleWager(session);
			recovered.push(this.battleSessions.rollbackStart(session.id));
		}
		return recovered;
	}

	persistBattleInventory(characterId: string, inventory: RPGInventoryState): void {
		const record = this.requireCharacter(characterId);
		const next = RPGInventorySystem.migrate(inventory);
		if (next.bag.ownerId !== record.state.id) {
			throw new Error('RPG inventory owner does not match the battle character');
		}
		record.state.inventory = next;
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}
	completeBattleSession(battleSessionId: string, result: RPGBattleResult): RPGBattleSession {
		const session = this.battleSessions.get(battleSessionId);
		if (session.status === 'ended') return session;
		this.persistBattlePokemon(session, result);
		this.persistCapture(session, result);
		this.persistBattleRewards(session, result);
		this.settleBattleWager(session, result);
		return this.battleSessions.complete(battleSessionId, result);
	}

	evolveBattlePokemon(
		token: string, battleSessionId: string, teamPosition: number, toSpecies: string, side?: string
	): { character: RPGCharacterState, evolution: { fromSpecies: string, toSpecies: string, level: number } } {
		const accountSession = this.getSession(token);
		const battleSession = this.getBattleSession(token, battleSessionId);
		if (battleSession.status !== 'ended' || !battleSession.result) {
			throw new Error('A batalha precisa estar encerrada antes da evolução');
		}
		if (!Number.isSafeInteger(teamPosition) || teamPosition < 0) {
			throw new Error('Posição de equipe inválida para evolução');
		}
		const target = Dex.mod('gen9').species.get(toSpecies);
		const candidate = battleSession.result.evolutions?.find(entry =>
			entry.teamPosition === teamPosition && toID(entry.toSpecies) === target.id && (!side || entry.side === side)
		);
		if (!target.exists || !candidate) throw new Error('Esta evolução não está disponível');
		const team = candidate.side === 'p1' ? 'A' : candidate.side === 'p2' ? 'B' : undefined;
		if (!team) throw new Error('Lado inválido para evolução');
		let offset = 0;
		let owner: RPGBattleSession['participants'][number] | undefined;
		let choice: RPGBattleSession['participants'][number]['pokemon'][number] | undefined;
		for (const participant of battleSession.participants.filter(entry => entry.team === team)) {
			for (const pokemon of participant.pokemon) {
				if (offset === teamPosition) {
					owner = participant;
					choice = pokemon;
				}
				offset++;
			}
		}
		if (owner?.kind !== 'player' || !owner.characterId || choice?.teamIndex === undefined) {
			throw new Error('A evolução precisa pertencer a um personagem Player');
		}
		const viewerCharacter = accountSession.characterId || accountSession.viewAsCharacterId;
		if (accountSession.mode !== 'master' && owner.characterId !== viewerCharacter) {
			throw new Error('O Player não pode evoluir o Pokémon de outro personagem');
		}
		const record = this.requireCharacter(owner.characterId);
		const set = record.state.team[choice.teamIndex];
		if (!set || toID(set.species) !== toID(candidate.fromSpecies)) {
			throw new Error('O Pokémon já mudou ou não corresponde à evolução pendente');
		}
		const dex = Dex.mod('gen9');
		const source = dex.species.get(set.species);
		if (!source.evos?.some(evolution => toID(evolution) === target.id)) {
			throw new Error('A espécie escolhida não é uma evolução válida');
		}
		const oldSpecies = source.name;
		const oldDefaultName = !set.name || toID(set.name) === source.id;
		const abilitySlot = Object.entries(source.abilities).find(([, ability]) => toID(ability) === toID(set.ability))?.[0];
		set.species = target.name;
		if (oldDefaultName) set.name = target.name;
		const evolvedAbility = abilitySlot ? target.abilities[abilitySlot as keyof typeof target.abilities] : undefined;
		if (evolvedAbility) {
			set.ability = evolvedAbility;
		} else if (!Object.values(target.abilities).some(ability => toID(ability) === toID(set.ability))) {
			set.ability = target.abilities[0];
		}
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return {
			character: structuredClone(record.state),
			evolution: { fromSpecies: oldSpecies, toSpecies: target.name, level: set.level || candidate.level },
		};
	}

	learnBattleMove(
		token: string, battleSessionId: string, teamPosition: number, move: string, replaceIndex?: number, side?: string
	): {
		character: RPGCharacterState,
		learning: { pokemon: string, move: string, forgottenMove?: string, moves: string[], alreadyKnown: boolean },
	} {
		const accountSession = this.getSession(token);
		const battleSession = this.getBattleSession(token, battleSessionId);
		if (battleSession.status !== 'ended' || !battleSession.result) {
			throw new Error('A batalha precisa estar encerrada antes do aprendizado de golpe');
		}
		if (!Number.isSafeInteger(teamPosition) || teamPosition < 0) {
			throw new Error('Posi\u00e7\u00e3o de equipe inv\u00e1lida para aprendizado de golpe');
		}
		const dex = Dex.mod('gen9');
		const targetMove = dex.moves.get(move);
		const candidate = battleSession.result.experience?.find(entry =>
			entry.teamPosition === teamPosition && (!side || entry.side === side) &&
			(entry.learnedMoves || []).some(learned => toID(learned.move) === targetMove.id)
		);
		if (!targetMove.exists || !candidate) throw new Error('Este golpe n\u00e3o est\u00e1 dispon\u00edvel para aprendizado');
		const team = candidate.side === 'p1' ? 'A' : candidate.side === 'p2' ? 'B' : undefined;
		if (!team) throw new Error('Lado inv\u00e1lido para aprendizado de golpe');
		let offset = 0;
		let owner: RPGBattleSession['participants'][number] | undefined;
		let choice: RPGBattleSession['participants'][number]['pokemon'][number] | undefined;
		for (const participant of battleSession.participants.filter(entry => entry.team === team)) {
			for (const pokemon of participant.pokemon) {
				if (offset === teamPosition) {
					owner = participant;
					choice = pokemon;
				}
				offset++;
			}
		}
		if (owner?.kind !== 'player' || !owner.characterId || choice?.teamIndex === undefined) {
			throw new Error('O aprendizado precisa pertencer a um personagem Player');
		}
		const viewerCharacter = accountSession.characterId || accountSession.viewAsCharacterId;
		if (accountSession.mode !== 'master' && owner.characterId !== viewerCharacter) {
			throw new Error('O Player n\u00e3o pode ensinar golpes ao Pok\u00e9mon de outro personagem');
		}
		const record = this.requireCharacter(owner.characterId);
		const set = record.state.team[choice.teamIndex];
		if (!set) throw new Error('O Pok\u00e9mon do aprendizado n\u00e3o est\u00e1 mais na equipe');
		set.moves ||= [];
		const alreadyKnown = set.moves.some(knownMove => toID(knownMove) === targetMove.id);
		let forgottenMove: string | undefined;
		if (!alreadyKnown) {
			if (set.moves.length >= 4) {
				if (!Number.isSafeInteger(replaceIndex) || replaceIndex! < 0 || replaceIndex! >= set.moves.length) {
					throw new Error('Escolha qual golpe ser\u00e1 esquecido');
				}
				forgottenMove = dex.moves.get(set.moves[replaceIndex!]).name || set.moves[replaceIndex!];
				set.moves[replaceIndex!] = targetMove.id;
			} else {
				set.moves.push(targetMove.id);
			}
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		return {
			character: structuredClone(record.state),
			learning: {
				pokemon: set.name || set.species,
				move: targetMove.name,
				forgottenMove,
				moves: set.moves.map(knownMove => dex.moves.get(knownMove).name || knownMove),
				alreadyKnown,
			},
		};
	}

	cancelBattleSession(token: string, battleSessionId: string): RPGBattleSession {
		this.requireMasterMode(token);
		return this.battleSessions.cancel(battleSessionId);
	}

	createContestSession(token: string, input: RPGCreateContestSessionRequest = {}): RPGContestSession {
		this.requireMasterMode(token);
		return this.contestSessions.create(input);
	}

	updateContestSession(
		token: string, contestSessionId: string, input: RPGUpdateContestSessionRequest
	): RPGContestSession {
		this.requireMasterMode(token);
		return this.contestSessions.update(contestSessionId, input);
	}

	inviteContestSession(token: string, contestSessionId: string): RPGContestSession {
		this.requireMasterMode(token);
		return this.contestSessions.invite(contestSessionId);
	}

	listContestSessions(token: string): RPGContestSession[] {
		const session = this.getSession(token);
		if (session.mode === 'master') return this.contestSessions.list();
		const characterId = session.characterId || session.viewAsCharacterId;
		if (!characterId) throw new Error('RPG player session requires a character');
		return this.contestSessions.list(characterId);
	}

	getContestSession(token: string, contestSessionId: string): RPGContestSession {
		const account = this.getSession(token);
		const contest = this.contestSessions.get(contestSessionId);
		if (account.mode === 'master') return contest;
		const characterId = account.characterId || account.viewAsCharacterId;
		if (contest.status === 'draft' || !contest.participants.some(entry => entry.characterId === characterId)) {
			throw new Error('RPG player session cannot access another contest session');
		}
		return contest;
	}

	selectContestPokemon(token: string, contestSessionId: string, teamIndex: number): RPGContestSession {
		const session = this.getSession(token);
		if (session.role !== 'player' || session.mode !== 'player' || !session.characterId) {
			throw new Error('RPG player session required to select a contest Pokemon');
		}
		return this.contestSessions.selectPokemon(contestSessionId, session.characterId, teamIndex);
	}

	respondToContestInvitation(
		token: string, contestSessionId: string, response: 'accepted' | 'declined'
	): RPGContestSession {
		const session = this.getSession(token);
		if (session.role !== 'player' || session.mode !== 'player' || !session.characterId) {
			throw new Error('RPG player session required to answer a contest invitation');
		}
		return this.contestSessions.respond(contestSessionId, session.characterId, response);
	}

	startContestSession(token: string, contestSessionId: string): RPGContestSession {
		this.requireMasterMode(token);
		return this.contestSessions.start(contestSessionId);
	}

	cancelContestSession(token: string, contestSessionId: string): RPGContestSession {
		this.requireMasterMode(token);
		return this.contestSessions.cancel(contestSessionId);
	}

	requirePermission(token: string, permission: RPGPermission, ownerId?: string): void {
		const session = this.getSession(token);
		const effectiveCharacter = session.mode === 'player' ?
			(session.characterId || session.viewAsCharacterId) : undefined;
		const permissions = session.mode === 'master' ? MASTER_PERMISSIONS : PLAYER_PERMISSIONS;
		if (!permissions.has(permission)) throw new Error('RPG session does not have permission: ' + permission);
		if (session.mode === 'player' && ownerId && toID(ownerId) !== effectiveCharacter) {
			throw new Error('RPG player session cannot access another character');
		}
	}

	private getWorldBagItemUseLock(token: string, ownerId: string): string | undefined {
		const loginSession = this.getSession(token);
		if (loginSession.role !== 'player' || loginSession.mode !== 'player') return;
		const battle = this.battleSessions.list(ownerId).find(entry => {
			if (entry.status === 'started' || entry.status === 'ready') return true;
			if (entry.status !== 'inviting') return false;
			const invitation = entry.invitations.find(item => item.characterId === toID(ownerId));
			return !!invitation && invitation.response !== 'declined';
		});
		if (!battle) return;
		return battle.status === 'started' ?
			'Itens da Bag externa não podem ser usados durante uma batalha.' :
			'Itens da Bag externa não podem ser usados enquanto existe um convite de batalha ativo.';
	}

	private ensureNursery(record: RPGStoredCharacter): RPGNurseryCharacterState {
		const createLocalIncubators = () => Array.from({length: 3}, (_, groupIndex) =>
			Array.from({length: 3}, (_, slotIndex) => ({
				id: record.state.id + ':incubator:' + (groupIndex + 1) + ':' + (slotIndex + 1),
				ownerId: record.state.id, kind: 'local' as const, group: groupIndex + 1, slot: slotIndex + 1,
			}))
		).flat();
		if (!record.state.nursery || record.state.nursery.version !== 1) {
			record.state.nursery = {version: 1, projects: [], incubators: createLocalIncubators(), releasedPokemon: []};
		}
		if (!Array.isArray(record.state.nursery.projects)) record.state.nursery.projects = [];
		if (!Array.isArray(record.state.nursery.releasedPokemon)) record.state.nursery.releasedPokemon = [];
		for (const project of record.state.nursery.projects) {
			if (!['egg_ready', 'collected'].includes(project.status) || project.parentCollected !== undefined) continue;
			project.parentCollected = Object.fromEntries(
				[...new Set([project.slot1.ownerId, project.slot2?.ownerId].filter(Boolean) as string[])]
					.map(ownerId => [ownerId, true])
			);
		}
		const desired = createLocalIncubators();
		const existing = Array.isArray(record.state.nursery.incubators) ?
			record.state.nursery.incubators : [];
		const desiredIds = new Set(desired.map(incubator => incubator.id));
		const legacy = existing.filter(incubator => !desiredIds.has(incubator.id));
		record.state.nursery.incubators = desired.map(target => {
			const source = existing.find(incubator => incubator.id === target.id) || legacy.shift();
			if (!source?.eggId) return target;
			if (source.id !== target.id) {
				for (const project of record.state.nursery!.projects) {
					if (project.egg?.incubatorId === source.id) project.egg.incubatorId = target.id;
				}
			}
			return {...target, eggId: source.eggId};
		});
		const eggs = record.state.nursery.projects.map(project => project.egg);
		for (const incubator of record.state.nursery.incubators) {
			const egg = eggs.find(candidate => candidate?.id === incubator.eggId);
			if (!egg || egg.incubatorId !== incubator.id || egg.portableIncubator ||
				!['incubating', 'ready_to_hatch'].includes(egg.status)) {
				delete incubator.eggId;
			}
		}
		for (const egg of eggs) {
			if (!egg?.incubatorId || egg.portableIncubator ||
				!['incubating', 'ready_to_hatch'].includes(egg.status)) continue;
			const incubator = record.state.nursery.incubators.find(value => value.id === egg.incubatorId);
			if (incubator && (!incubator.eggId || incubator.eggId === egg.id)) incubator.eggId = egg.id;
		}
		return record.state.nursery;
	}

	private characterView(record: RPGStoredCharacter): RPGCharacterState {
		const view = structuredClone(record.state);
		view.shopAccess = this.characterShopAccess(record.state);
		for (const entry of view.box.party) {
			if (!this.isPokemonBreeding(record.state.id, entry.pokemonId)) continue;
			entry.metadata = {...entry.metadata, breeding: true};
		}
		view.teamEggs = this.activeEggs(record).map(egg => ({
			...RPGIncubation.view(egg), name: 'Egg', species: 'Egg', virtual: true as const,
		}));
		view.portableIncubators = this.portableIncubatorSlots(record);
		return view;
	}

	private characterShopAccess(character: RPGCharacterState): Record<string, boolean> {
		return Object.fromEntries(this.commerce.directory().shops.map(shop => [
			shop.id, character.shopAccess?.[shop.id] !== false,
		]));
	}

	private managedBoxView(record: RPGStoredCharacter, query: RPGBoxQuery = {}): RPGBoxManagementView {
		const view = RPGBoxManagement.view(record.state, query);
		for (const pokemon of view.results) {
			if (!this.isPokemonBreeding(record.state.id, pokemon.pokemonId)) continue;
			pokemon.metadata.breeding = true;
			pokemon.actions.move = false;
			pokemon.actions.release = false;
			if (!pokemon.indicators.includes('breeding')) pokemon.indicators.push('breeding');
		}
		return view;
	}

	private managedBagView(
		record: RPGStoredCharacter,
		query: Parameters<typeof RPGBagManagement.view>[1] = {}
	): RPGManagedBagView {
		const view = RPGBagManagement.view(record.state, query);
		const reservedSlots = this.activeEggs(record).length * 5;
		view.capacity.usedSlots += reservedSlots;
		if (view.capacity.maxSlots === undefined) {
			view.capacity.freeSlots = undefined;
			view.capacity.full = false;
		} else {
			view.capacity.freeSlots = Math.max(0, view.capacity.maxSlots - view.capacity.usedSlots);
			view.capacity.full = view.capacity.usedSlots >= view.capacity.maxSlots;
		}
		if (view.context === 'world') {
			const loaded = this.portableEggProjects(record);
			const expanded: RPGManagedBagItemView[] = [];
			for (const item of view.items) {
				if (item.id !== 'portableincubator') {
					expanded.push(item);
					continue;
				}
				const matching = loaded.filter(project => !!project.egg?.portableIncubatorMission === item.mission);
				const emptyQuantity = Math.max(0, item.quantity - matching.length);
				if (emptyQuantity) expanded.push({...item, quantity: emptyQuantity});
				for (const project of matching) {
					expanded.push({
						...item, name: 'Incubadora Portátil carregada', quantity: 1,
						description: 'Contém um Egg em incubação. Qualquer movimentação desta incubadora também movimenta o Egg.',
						loaded: true, linkedEggId: project.egg!.id,
						icon: './assets/item-icons/portableincubator.png?v=20260821-3', sprite: null,
						actions: item.actions.filter(action => !['favorite', 'unfavorite'].includes(action)),
					});
				}
			}
			view.items = expanded;

		}
		return view;
	}

	private portableEggProjects(record: RPGStoredCharacter): RPGNurseryProject[] {
		return this.ensureNursery(record).projects.filter(project =>
			project.egg?.portableIncubator === true && project.egg.status !== 'hatched'
		);
	}

	private portableIncubatorSlots(record: RPGStoredCharacter) {
		const inventory = RPGInventorySystem.migrate(record.state.inventory);
		const total = RPGBagSystem.getQuantity(inventory.bag, 'portableincubator');
		const loaded = this.portableEggProjects(record).map(project => ({
			id: project.egg!.portableIncubatorId || record.state.id + ':portable:' + project.egg!.id,
			loaded: true, eggId: project.egg!.id,
			...(project.egg!.portableIncubatorMission ? {mission: true} : {}),
		}));
		return [...loaded, ...Array.from({length: Math.max(0, total - loaded.length)}, (_, index) => ({
			id: record.state.id + ':portable:empty:' + (index + 1), loaded: false,
		}))];
	}

	private removePortableEggProject(record: RPGStoredCharacter, eggId: string): RPGNurseryProject {
		const nursery = this.ensureNursery(record);
		const index = nursery.projects.findIndex(project => project.egg?.id === eggId && project.egg.portableIncubator);
		if (index < 0) throw new Error('A incubadora carregada não está ligada a este Egg');
		return nursery.projects.splice(index, 1)[0];
	}

	private activeEggs(record: RPGStoredCharacter) {
		return this.ensureNursery(record).projects
			.map(project => project.egg)
			.filter((egg): egg is NonNullable<typeof egg> =>
				!!egg && (egg.status === 'carried' ||
					(egg.portableIncubator === true && ['incubating', 'ready_to_hatch'].includes(egg.status))));
	}

	private nurseryView(record?: RPGStoredCharacter) {
		const nursery = record ? this.ensureNursery(record) : undefined;
		const projects = this.repository.list().flatMap(owner =>
			(owner.state.nursery?.projects || []).map(project => {
				const preview = project.slot2 ? RPGNurseryGenetics.preview(project.slot1, project.slot2) : undefined;
				const egg = project.egg ? RPGIncubation.view(project.egg) : undefined;
				return {
					id: project.id,
					status: project.status,
					slot1: structuredClone(project.slot1),
					slot2: project.slot2 ? structuredClone(project.slot2) : undefined,
					slot2OwnerId: project.slot2OwnerId,
					slot2OwnerName: project.slot2OwnerName,
					eggOwnerId: project.eggOwnerId,
					confirmed: structuredClone(project.confirmed),
					slotConfirmations: structuredClone(project.slotConfirmations),
					requestedPokecoins: project.requestedPokecoins ?? 0,
					paymentTransferredAt: project.paymentTransferredAt,
					createdAt: project.createdAt,
					requiredBreedingTimeMs: project.requiredBreedingTimeMs,
					remainingBreedingTimeMs: project.remainingBreedingTimeMs,
					parentCollected: structuredClone(project.parentCollected ??
						Object.fromEntries(
							[...new Set([project.slot1.ownerId, project.slot2?.ownerId].filter(Boolean))]
								.map(ownerId => [ownerId, true])
						)),
					preview,
					masterSlot2Options: !record && project.slot1.participantType !== 'npc' &&
						!project.slot2 && project.status === 'inviting' ?
						RPGNurseryGenetics.compatiblePartners(project.slot1) : [],
					egg,
				};
			})
		);
		const eggs = nursery ? nursery.projects
			.map(project => project.egg)
			.filter((egg): egg is NonNullable<typeof egg> => !!egg && egg.status !== 'hatched')
			.map(egg => RPGIncubation.view(egg)) : [];
		const inventory = record ? RPGInventorySystem.migrate(record.state.inventory) : undefined;
		const bag = inventory?.bag;
		const activeEggs = record ? this.activeEggs(record) : [];
		const portableTotal = inventory ? RPGInventorySystem.getAvailableQuantity(inventory, 'portableincubator') : 0;
		const portableInUse = eggs.filter(egg => egg.portableIncubator).length;
		const releasedPokemon = record ? undefined : this.repository.list().flatMap(owner => {
			const released = this.ensureNursery(owner).releasedPokemon || [];
			return released.map(value => ({
				id: value.id,
				ownerId: value.ownerId,
				ownerName: value.ownerName,
				pokemonId: value.entry.pokemonId,
				name: value.entry.pokemon.name || value.entry.pokemon.species,
				species: value.entry.pokemon.species,
				level: value.entry.pokemon.level,
				gender: value.entry.pokemon.gender,
				shiny: !!value.entry.pokemon.shiny,
			}));
		});
		const nurseryShop = record ? {
			money: record.state.money,
			bagRevision: inventory!.bag.revision,
			items: RPG_NURSERY_SHOP_ITEM_IDS.map(itemId => {
				const item = RPGItems.require(itemId);
				const breeding = RPG_NURSERY_BREEDING_ITEMS.find(entry => entry.id === item.id);
				return {
					id: item.id, name: item.name,
					description: breeding?.description || item.effect?.description || '',
					price: item.price!.buy!,
					quantity: RPGBagSystem.getRegularQuantity(inventory!.bag, item.id),
					icon: getRPGItemIconPath(item.id),
					sprite: Number.isInteger(Dex.items.get(item.id).spritenum) ?
						Dex.items.get(item.id).spritenum! : null,
				};
			}),
		} : undefined;
		return {
			version: 2,
			shared: true,
			viewerRole: record ? 'player' : 'master',
			ownerId: record?.state.id || '',
			accessAllowed: record ? record.state.pageAccess?.nursery !== false : true,
			fees: {
				breedingBase: RPG_NURSERY_BREEDING_BASE_FEE,
				localIncubation: RPG_NURSERY_LOCAL_INCUBATION_FEE,
			},
			pokemon: record ? record.state.box.party.map(entry => ({
				pokemonId: entry.pokemonId,
				name: entry.pokemon.name || entry.pokemon.species,
				species: entry.pokemon.species,
				level: entry.pokemon.level,
				gender: entry.pokemon.gender,
				shiny: !!entry.pokemon.shiny,
				busy: !!entry.metadata?.evTraining || this.isPokemonBreeding(record.state.id, entry.pokemonId),
			})) : [],
			projects,
			...(releasedPokemon ? {releasedPokemon} : {}),
			eggs,
			teamEggs: activeEggs.map(egg => ({
				...RPGIncubation.view(egg), name: 'Egg', species: 'Egg', virtual: true as const,
			})),
			incubators: nursery ? nursery.incubators.map(incubator => ({
				...incubator, kind: 'local' as const,
				egg: incubator.eggId ? eggs.find(egg => egg.eggId === incubator.eggId) : undefined,
			})) : [],
			breedingItems: RPG_NURSERY_BREEDING_ITEMS.map(item => ({...item})),
			...(nurseryShop ? {shop: nurseryShop} : {}),
			masterSlot1Options: record ? [] : RPGNurseryGenetics.masterParentOptions(),
			portableIncubators: {
				total: portableTotal, inUse: portableInUse, available: Math.max(0, portableTotal - portableInUse),
			},
			capacity: {
				teamPokemon: record?.state.box.party.length || 0,
				carriedEggs: activeEggs.length,
				teamUsed: (record?.state.box.party.length || 0) + activeEggs.length,
				teamMax: 6,
				bagUsedSlots: bag ? RPGBagSystem.getUsedSlots(bag) + activeEggs.length * 5 : 0,
				bagMaxSlots: bag?.maxSlots,
			},
		};
	}

	private masterNurseryPokemon(
		input: RPGNurseryMasterPokemonInput,
		sex: import('../../sim/rpg-showdown').RPGPokemonSex
	): RPGCapturedPokemon {
		const level = Number(input.level);
		if (!Number.isInteger(level) || level < 1 || level > 100) {
			throw new Error('O n\u00edvel do parceiro deve estar entre 1 e 100');
		}
		const item = toID(input.item || '');
		if (!RPG_NURSERY_BREEDING_ITEMS.some(option => option.id === item)) {
			throw new Error('Este held item n\u00e3o afeta a procria\u00e7\u00e3o');
		}
		const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
		const ivs = Object.fromEntries(stats.map(stat => {
			const value = Number(input.ivs?.[stat]);
			if (!Number.isInteger(value) || value < 0 || value > 31) {
				throw new Error('Cada IV deve estar entre 0 e 31');
			}
			return [stat, value];
		})) as RPGCapturedPokemon['ivs'];
		const species = Dex.mod('gen9').species.get(input.species);
		if (!species.exists || !getRPGAllowedSexes(species.name).includes(sex)) {
			throw new Error('O g\u00eanero autom\u00e1tico n\u00e3o \u00e9 v\u00e1lido para esta esp\u00e9cie');
		}
		const abilities = [...new Set(Object.values(species.abilities).filter(Boolean))];
		const natures = Dex.mod('gen9').natures.all();
		const ability = abilities[Math.floor(this.random() * abilities.length)] || species.abilities[0];
		const nature = natures[Math.floor(this.random() * natures.length)]?.name || 'Hardy';
		return {
			name: species.name, species: species.name, level, gender: sex, shiny: false,
			item, ability, nature, moves: ['tackle'],
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0}, ivs,
			rpg: {version: RPG_STATE_VERSION, level, friendship: 50, item, captureBall: 'pokeball'},
		};
	}

	private consumeCompletedNurseryItems(
		project: RPGNurseryProject, recordsById: Map<string, RPGStoredCharacter>, changedIds: Set<string>
	): void {
		for (const parent of [project.slot1, project.slot2]) {
			if (parent.item !== 'destinyknot') continue;
			parent.item = '';
			if (parent.participantType !== 'player') continue;
			const owner = recordsById.get(parent.ownerId);
			const entry = owner?.state.box.party.find(candidate => candidate.pokemonId === parent.pokemonId);
			if (!owner || !entry || toID(entry.pokemon.item || entry.pokemon.rpg?.item || '') !== 'destinyknot') {
				continue;
			}
			entry.pokemon.rpg.item = '';
			RPGBoxManagement.setHeldItem(owner.state, parent.pokemonId, undefined, owner.state.box.revision);
			changedIds.add(owner.state.id);
		}
	}

	private nurseryParent(record: RPGStoredCharacter, pokemonId: string): RPGNurseryParent {
		const entry = record.state.box.party.find(candidate => candidate.pokemonId === pokemonId);
		if (!entry) throw new Error('Somente um Pokémon da equipe pode participar da procriação');
		if (entry.metadata?.evTraining) throw new Error('Pokémon em treinamento está indisponível');
		return RPGNurseryGenetics.parent(
			record.state.id, record.state.characterName, 'player', pokemonId, entry.pokemon
		);
	}

	private requireNurseryActor(token: string): RPGStoredCharacter {
		const session = this.getSession(token);
		const id = toID(session.characterId || session.viewAsCharacterId || '');
		if (!id) throw new Error('Abra um personagem para usar o Berçário');
		const record = this.requireCharacter(id);
		this.requirePermission(token, 'box:edit', id);
		this.requireNurseryAccess(token, record);
		return record;
	}

	private requireNurseryProject(projectId: string): {record: RPGStoredCharacter, project: RPGNurseryProject} {
		for (const record of this.repository.list()) {
			const project = record.state.nursery?.projects?.find(value => value.id === projectId);
			if (project) return {record, project};
		}
		throw new Error('Projeto de procriação desconhecido');
	}

	private requireOwnedEgg(record: RPGStoredCharacter, eggId: string) {
		for (const project of this.ensureNursery(record).projects) {
			if (project.egg?.id === eggId && project.egg.ownerId === record.state.id) return project.egg;
		}
		throw new Error('Ovo desconhecido ou pertencente a outro treinador');
	}

	private isPokemonBreeding(ownerId: string, pokemonId: string, ignoredProjectId?: string): boolean {
		return this.repository.list().some(record => (record.state.nursery?.projects || []).some(project => {
			if (project.id === ignoredProjectId) return false;
			const participates = project.slot1.ownerId === ownerId && project.slot1.pokemonId === pokemonId ||
				project.slot2?.ownerId === ownerId && project.slot2.pokemonId === pokemonId;
			if (!participates) return false;
			if (['inviting', 'configuring', 'awaiting_confirmation', 'breeding'].includes(project.status)) return true;
			return ['egg_ready', 'collected'].includes(project.status) &&
				project.parentCollected !== undefined && project.parentCollected[ownerId] !== true;
		}));
	}

	private requireNurseryAccess(token: string, record: RPGStoredCharacter): void {
		const session = this.getSession(token);
		if (session.role === 'player' && record.state.pageAccess?.nursery === false) {
			throw new Error('O acesso ao Berçário está bloqueado');
		}
	}

	private requireCommerceAccess(token: string, record: RPGStoredCharacter, shopId?: string): void {
		if (this.getSession(token).role === 'master') return;
		if (record.state.pageAccess?.shops === false) {
			throw new Error('O Mestre bloqueou o acesso às Lojas.');
		}
		if (shopId && this.characterShopAccess(record.state)[shopId] === false) {
			throw new Error('Esta loja não está disponível na cidade atual.');
		}
	}

	private persistNurseryRecord(record: RPGStoredCharacter): void {
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}
	private requireAvailablePokemon(record: RPGStoredCharacter, pokemonId: string): void {
		const entry = record.state.box.party.find(pokemon => pokemon.pokemonId === pokemonId);
		if (entry?.metadata?.evTraining) {
			throw new Error('Pok\u00e9mon em treinamento est\u00e1 indispon\u00edvel at\u00e9 a conclus\u00e3o');
		}
		if (this.isPokemonBreeding(record.state.id, pokemonId)) {
			throw new Error('Pok\u00e9mon em procria\u00e7\u00e3o est\u00e1 indispon\u00edvel at\u00e9 a produ\u00e7\u00e3o do ovo');
		}
	}

	private requirePokemonNotBreeding(record: RPGStoredCharacter, pokemonId: string): void {
		if (this.isPokemonBreeding(record.state.id, pokemonId)) {
			throw new Error('Pokémon em procriação deve permanecer na equipe até a produção do ovo');
		}
	}

	private requireWorldBagItemUse(token: string, ownerId: string): void {
		const reason = this.getWorldBagItemUseLock(token, ownerId);
		if (reason) throw new Error(reason);
	}

	private requireFossilLabAccess(token: string, record: RPGStoredCharacter): void {
		const session = this.getSession(token);
		if (session.role === 'player' && record.state.pageAccess?.fossils === false) {
			throw new Error('O Mestre bloqueou o acesso ao laborat\u00f3rio de Paleontologia.');
		}
	}

	private requireBagRecord(
		token: string, characterId: string | undefined, permission: 'bag:read' | 'bag:edit',
		ignorePlayerPageAccess = false
	): RPGStoredCharacter {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		if (!target) throw new Error('RPG Bag requires a character');
		this.requirePermission(token, permission, target);
		const record = this.requireCharacter(target);
		if (session.role === 'player' && !ignorePlayerPageAccess && record.state.pageAccess?.bag === false) {
			throw new Error('O Mestre bloqueou o acesso à página da Bag.');
		}
		return record;
	}

	private requireBoxRecord(
		token: string, characterId: string | undefined, permission: 'box:read' | 'box:edit',
		ignorePlayerPageAccess = false
	): RPGStoredCharacter {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		if (!target) throw new Error('RPG Box requires a character');
		this.requirePermission(token, permission, target);
		const record = this.requireCharacter(target);
		if (session.role === 'player' && !ignorePlayerPageAccess && record.state.pageAccess?.box === false) {
			throw new Error('O Mestre bloqueou o acesso \u00e0 p\u00e1gina da Box.');
		}
		return record;
	}

	private requireTeamBuilderRecord(
		token: string, characterId: string | undefined, permission: 'box:read' | 'box:edit', pokemonId: string
	): RPGStoredCharacter {
		const record = this.requireBoxRecord(token, characterId, permission, true);
		const session = this.getSession(token);
		if (session.role === 'player' && record.state.pageAccess?.box === false &&
			!RPGBoxManagement.isPartyPokemon(record.state, pokemonId)) {
			throw new Error('O Mestre bloqueou o acesso \u00e0 p\u00e1gina da Box.');
		}
		return record;
	}

	private requirePokemonCenterRecord(
		token: string, characterId: string | undefined, permission: 'box:read' | 'box:edit'
	): RPGStoredCharacter {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		if (!target) throw new Error('O Centro Pokémon requer um personagem');
		this.requirePermission(token, permission, target);
		const record = this.requireCharacter(target);
		if (session.role === 'player' && record.state.pageAccess?.center === false) {
			throw new Error('O acesso ao Centro Pokémon está bloqueado');
		}
		return record;
	}

	private pokemonCenterView(record: RPGStoredCharacter, master: boolean) {
		const view = RPGBoxManagement.view(record.state);
		const storedById = new Map(record.state.box.party.map(entry => [entry.pokemonId, entry]));
		for (const box of record.state.box.boxes) {
			for (const entry of box.slots) if (entry) storedById.set(entry.pokemonId, entry);
		}
		const recoveryView = (pokemon: (typeof view.results)[number]) => {
			const stored = storedById.get(pokemon.pokemonId);
			const captureBall = stored?.pokemon.rpg.captureBall || 'pokeball';
			const missingHP = Math.max(0, pokemon.maxHP - pokemon.hp);
			const missingPP = pokemon.moves.reduce((sum, move) => sum + Math.max(0, move.maxPP - move.pp), 0);
			const fullRecoveryCost = missingHP + missingPP * 10 + (pokemon.status ? 100 : 0) +
				(pokemon.fainted ? 400 : 0);
			return {
				...pokemon, missingHP, missingPP, captureBall,
				pokeballSprite: Dex.mod('gen9').items.get(captureBall).spritenum ||
					Dex.mod('gen9').items.get('pokeball').spritenum || 0,
				needsRecovery: missingHP > 0 || missingPP > 0 || !!pokemon.status,
				fullRecoveryCost: master ? 0 : fullRecoveryCost,
				reviveCost: master ? 0 : 500,
			};
		};
		const team = view.team.map(recoveryView);
		const pokemon = (master ? view.results : view.team).map(recoveryView);
		return {
			version: 1, ownerId: record.state.id, revision: view.revision,
			money: record.state.money, master, accessAllowed: master || record.state.pageAccess?.center !== false,
			team, pokemon, teamRecoveryCost: team.reduce((sum, entry) => sum + entry.fullRecoveryCost, 0),
		};
	}
	private requireTrainingPageAccess(token: string, record: RPGStoredCharacter): void {
		const session = this.getSession(token);
		if (session.role === 'player' && record.state.pageAccess?.training === false) {
			throw new Error('O Mestre bloqueou o acesso ao Treinamento.');
		}
	}

	private resolveCompletedEVTrainings(record: RPGStoredCharacter): boolean {
		const pokemonIds = RPGBoxManagement.view(record.state).results.map(pokemon => pokemon.pokemonId);
		let resolved = false;
		for (const pokemonId of pokemonIds) {
			resolved = RPGBoxManagement.resolveEVTraining(record.state, pokemonId, this.now()) || resolved;
		}
		if (resolved) this.persistBoxRecord(record);
		return resolved;
	}

	private persistBoxRecord(record: RPGStoredCharacter): void {
		RPGFossilLab.ensure(record.state, this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}

	private requireTransferableBagItem(record: RPGStoredCharacter, itemId: string): RPGItemDefinition {
		const item = RPGItems.require(itemId);
		const bag = RPGInventorySystem.migrate(record.state.inventory).bag;
		if (!RPGBagSystem.has(bag, item.id)) throw new Error('O item não está disponível nesta Bag');
		if (item.tags?.includes('mission') || RPGBagSystem.getRegularQuantity(bag, item.id) < 1) {
			throw new Error('Itens de Missão não podem ser descartados nem entregues');
		}
		return item;
	}

	private requireMasterRole(token: string): void {
		if (this.getSession(token).role !== 'master') throw new Error('RPG master session required');
	}

	private requireViewedMasterCharacter(token: string, characterId: string): void {
		const session = this.getSession(token);
		if (session.role !== 'master') throw new Error('RPG master session required');
		if (session.mode === 'player' && toID(characterId) !== toID(session.viewAsCharacterId || '')) {
			throw new Error('RPG master can only edit the character currently being viewed');
		}
	}

	private requireMasterMode(token: string): void {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'master') {
			throw new Error('RPG master session required');
		}
	}

	private reserveBattleWager(session: RPGBattleSession): RPGBattleSession {
		const amount = session.rules.wagerAmount || 0;
		if (!amount) return session;
		if (session.opponentType !== 'player' && session.opponentType !== 'npc') {
			throw new Error('A aposta está disponível apenas contra Player ou NPC');
		}
		const participants = session.participants.filter(participant =>
			participant.kind === 'player' && participant.characterId &&
			(session.opponentType === 'player' || participant.team === 'A')
		);
		const stakes = [...new Map(participants.map(participant => [participant.characterId!, {
			characterId: participant.characterId!, team: participant.team, amount,
		}])).values()];
		if (!stakes.length) throw new Error('A aposta requer ao menos um personagem Player');
		const records = stakes.map(stake => ({ stake, record: this.requireCharacter(stake.characterId) }));
		for (const { stake, record } of records) {
			if (record.state.money < stake.amount) {
				throw new Error(`${record.state.characterName} não possui ₽${stake.amount} para a aposta`);
			}
		}
		for (const { stake, record } of records) {
			record.state.money -= stake.amount;
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		session.wager = { amountPerPlayer: amount, status: 'reserved', stakes, payouts: [] };
		session.updatedAt = this.now();
		this.battleSessions.repository.set(session);
		return structuredClone(session);
	}

	private refundBattleWager(session: RPGBattleSession): void {
		if (!session.wager || session.wager.status !== 'reserved') return;
		for (const stake of session.wager.stakes) {
			const record = this.requireCharacter(stake.characterId);
			const nextMoney = record.state.money + stake.amount;
			if (!Number.isSafeInteger(nextMoney)) throw new Error('O reembolso tornaria o saldo inválido');
			record.state.money = nextMoney;
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		session.wager.status = 'refunded';
		session.wager.payouts = session.wager.stakes.map(stake => ({ characterId: stake.characterId, amount: stake.amount }));
		session.updatedAt = this.now();
		this.battleSessions.repository.set(session);
	}

	private settleBattleWager(session: RPGBattleSession, result: RPGBattleResult): void {
		const wager = session.wager;
		if (!wager || wager.status !== 'reserved') return;
		if (result.outcome === 'tie' || result.outcome === 'flee') {
			this.refundBattleWager(session);
			return;
		}
		const winnerTeam = result.outcome === 'capture' ? 'A' :
			result.winnerSide === 'p1' ? 'A' : result.winnerSide === 'p2' ? 'B' : undefined;
		if (!winnerTeam) {
			this.refundBattleWager(session);
			return;
		}
		const winners = [...new Set(wager.stakes.filter(stake => stake.team === winnerTeam).map(stake => stake.characterId))];
		const playerStakeTotal = wager.stakes.reduce((total, stake) => total + stake.amount, 0);
		const pot = session.opponentType === 'npc' && winnerTeam === 'A' ? playerStakeTotal * 2 : playerStakeTotal;
		if (!winners.length || !pot) {
			wager.status = 'settled';
			wager.payouts = [];
			session.updatedAt = this.now();
			this.battleSessions.repository.set(session);
			return;
		}
		const base = Math.floor(pot / winners.length);
		let remainder = pot % winners.length;
		const payouts = winners.map(characterId => ({ characterId, amount: base + (remainder-- > 0 ? 1 : 0) }));
		for (const payout of payouts) {
			const record = this.requireCharacter(payout.characterId);
			const nextMoney = record.state.money + payout.amount;
			if (!Number.isSafeInteger(nextMoney)) throw new Error('O prêmio da aposta tornaria o saldo inválido');
			record.state.money = nextMoney;
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		wager.status = 'settled';
		wager.payouts = payouts;
		session.updatedAt = this.now();
		this.battleSessions.repository.set(session);
	}

	private persistBattleRewards(session: RPGBattleSession, result: RPGBattleResult): void {
		const money = result.rewards
			.filter(reward => ['money', 'currency', 'pokedollar'].includes(toID(reward.type)))
			.reduce((total, reward) => total + (Number.isSafeInteger(reward.amount) && reward.amount! > 0 ? reward.amount! : 0), 0);
		if (!money) return;
		const winnerTeam = result.outcome === 'capture' ? 'A' :
			result.winnerSide === 'p1' ? 'A' : result.winnerSide === 'p2' ? 'B' : undefined;
		if (!winnerTeam) return;
		const characterIds = new Set(session.participants
			.filter(participant => participant.team === winnerTeam && participant.kind === 'player' && participant.characterId)
			.map(participant => participant.characterId!));
		for (const characterId of characterIds) {
			const record = this.requireCharacter(characterId);
			const nextMoney = record.state.money + money;
			if (!Number.isSafeInteger(nextMoney)) throw new Error('A recompensa tornaria o saldo inválido');
			record.state.money = nextMoney;
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
	}

	private persistBattlePokemon(session: RPGBattleSession, result: RPGBattleResult): void {
		for (const [team, side] of [['A', 'p1'], ['B', 'p2']] as const) {
			const finalPokemon = result.pokemon.filter(pokemon => pokemon.side === side);
			const legacyPokemon = [...finalPokemon].sort((a, b) => a.position - b.position);
			let position = 0;
			for (const participant of session.participants.filter(entry => entry.team === team)) {
				for (const choice of participant.pokemon) {
					const stablePosition = position++;
					const finalState = finalPokemon.find(pokemon => pokemon.teamPosition === stablePosition) ||
						legacyPokemon[stablePosition];
					if (participant.kind !== 'player' || choice.teamIndex === undefined || !finalState) continue;
					const record = this.requireCharacter(participant.characterId!);
					const set = record.state.team[choice.teamIndex];
					if (!set) continue;
					set.level = finalState.level;
					set.item = finalState.item;
					set.evs = { ...finalState.evs };
					set.rpg = structuredClone(finalState.state);
					const stored = record.state.box.party[choice.teamIndex] as RPGManagedStoredPokemon | undefined;
					if (stored) {
						stored.pokemon = this.toCapturedPokemon(set);
						stored.metadata = { ...(stored.metadata || {}), lastBattleAt: this.now() };
						record.state.box.revision++;
					}
					record.state.updatedAt = this.now();
					this.repository.set(record);
				}
			}
		}
	}

	private persistCapture(session: RPGBattleSession, result: RPGBattleResult): void {
		if (!result.capture?.success || !result.capture.pokemon) return;
		const owner = session.participants.find(participant => participant.team === 'A' && participant.kind === 'player');
		if (!owner?.characterId) return;
		const record = this.requireCharacter(owner.characterId);
		const placement = RPGBoxSystem.placeCapture(record.state.box, result.capture, {
			placementId: `${session.id}:capture`,
			pokemonId: `${owner.characterId}:capture:${session.id}`,
		});
		if (!placement.success) return;
		record.state.box = placement.storage;
		const capturedEntry = RPGBoxManagement.view(record.state).results.find(entry =>
			entry.pokemonId === `${owner.characterId}:capture:${session.id}`
		);
		if (capturedEntry) {
			RPGBoxManagement.metadata(record.state, capturedEntry.pokemonId, {
				ot: record.state.characterName, lastBattleAt: this.now(), training: 'none',
			}, record.state.box.revision);
		}
		if (placement.placement?.location.destination === 'party' && placement.pokemon) {
			record.state.team.push(this.capturedToSet(placement.pokemon));
		}
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}

	private capturedToSet(pokemon: RPGCapturedPokemon): PokemonSet {
		return {
			name: pokemon.name, species: pokemon.species, level: pokemon.level, gender: pokemon.gender,
			shiny: pokemon.shiny, item: pokemon.item, ability: pokemon.ability, nature: pokemon.nature,
			moves: [...pokemon.moves], evs: { ...pokemon.evs }, ivs: { ...pokemon.ivs }, rpg: structuredClone(pokemon.rpg),
		};
	}

	private createStarter(input: RPGCreateCharacterRequest['starter']): PokemonSet {
		const dex = Dex.mod('gen9');
		const species = dex.species.get(input.species);
		if (!species.exists || species.isNonstandard) throw new Error('Invalid RPG starter species');
		const level = input.level ?? 5;
		if (!Number.isSafeInteger(level) || level < 1 || level > 100) {
			throw new Error('RPG starter level must be between 1 and 100');
		}
		if (!['M', 'F', 'N'].includes(input.gender)) throw new Error('Invalid RPG starter gender');
		if (!getRPGAllowedSexes(species.name).includes(input.gender)) {
			throw new Error('RPG starter gender is not allowed for this species');
		}
		const abilities = Object.entries(species.abilities)
			.filter(([slot]) => slot !== 'S').map(([, ability]) => ability);
		const natures = dex.natures.all();
		const moves = this.levelMoves(species.id, level);
		const evs = this.randomEVs();
		const ivs = { hp: 16, atk: 16, def: 16, spa: 16, spd: 16, spe: 16 };
		const experienceData = getSpeciesExperience(species.id);
		return {
			name: input.nickname?.trim() || species.name,
			species: species.name,
			item: '',
			ability: abilities[this.int(abilities.length)] || species.abilities['0'],
			moves,
			nature: natures[this.int(natures.length)].name,
			gender: input.gender,
			evs,
			ivs,
			level,
			shiny: this.int(10) === 0,
			happiness: 50,
			rpg: {
				version: RPG_STATE_VERSION, level, evs, friendship: 50, item: '', captureBall: 'pokeball',
				experience: experienceData ? getExperienceForLevel(experienceData.growthRate, level) : undefined,
			},
		};
	}

	private levelMoves(speciesId: ID, level: number): string[] {
		const learned = new Map<string, number>();
		for (const data of Dex.mod('gen9').species.getFullLearnset(speciesId)) {
			for (const [move, sources] of Object.entries(data.learnset)) {
				for (const source of sources) {
					const match = /^9L(\d+)$/.exec(source);
					if (!match || Number(match[1]) > level) continue;
					learned.set(move, Math.max(learned.get(move) ?? 0, Number(match[1])));
				}
			}
		}
		const moves = [...learned].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(-4).map(([move]) => move);
		if (!moves.length) throw new Error('RPG starter has no Generation 9 level moves at this level');
		return moves;
	}

	private randomEVs(): StatsTable {
		const values = [0, 0, 0, 0, 0, 0];
		const available = [0, 1, 2, 3, 4, 5];
		for (let units = 0; units < 127; units++) {
			const position = this.int(available.length);
			const stat = available[position];
			values[stat]++;
			if (values[stat] === 63) available.splice(position, 1);
		}
		return {
			hp: values[0] * 4, atk: values[1] * 4, def: values[2] * 4,
			spa: values[3] * 4, spd: values[4] * 4, spe: values[5] * 4,
		};
	}

	private toCapturedPokemon(set: PokemonSet): RPGCapturedPokemon {
		return {
			name: set.name, species: set.species, level: set.level, gender: set.gender,
			shiny: !!set.shiny, item: set.item, ability: set.ability, nature: set.nature,
			moves: [...set.moves], evs: { ...set.evs }, ivs: { ...set.ivs },
			rpg: structuredClone(set.rpg || {}),
		};
	}

	private createSession(input: Pick<RPGInternalSession, 'role' | 'mode' | 'characterId'>): RPGSession {
		const token = this.bytes(32).toString('base64url');
		const createdAt = this.now();
		const session: RPGInternalSession = {
			version: RPG_SESSION_VERSION, ...input,
			createdAt, expiresAt: createdAt + this.sessionTtlMs,
		};
		this.sessions.set(this.tokenKey(token), session);
		return { ...structuredClone(session), token };
	}

	private getInternalSession(token: string): RPGInternalSession {
		this.getSession(token);
		return structuredClone(this.sessions.get(this.tokenKey(token))!);
	}
	private tokenKey(token: string): string {
		if (typeof token !== 'string' || token.length < 20) throw new Error('Invalid RPG session token');
		return createHash('sha256').update(token).digest('hex');
	}
	private hashPassword(password: string): RPGCredential {
		const salt = this.bytes(16);
		return { algorithm: 'scrypt', salt: salt.toString('base64'), hash: scryptSync(password, salt, 32).toString('base64') };
	}
	private verifyPassword(password: string, credential: RPGCredential): boolean {
		try {
			const expected = Buffer.from(credential.hash, 'base64');
			const actual = scryptSync(String(password), Buffer.from(credential.salt, 'base64'), expected.length);
			return timingSafeEqual(expected, actual);
		} catch {
			return false;
		}
	}
	private validatePassword(password: string): void {
		if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
			throw new Error('RPG password must contain between 4 and 128 characters');
		}
	}
	private text(value: string, label: string, maximum: number): string {
		if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
			throw new Error(`RPG ${label} must contain between 1 and ${maximum} characters`);
		}
		return value.trim();
	}
	private selection(state: RPGCharacterState): RPGCharacterSelection {
		return { id: state.id, characterName: state.characterName, playerName: state.playerName, avatar: state.avatar };
	}
	private requireCharacter(id: string): RPGStoredCharacter {
		const record = this.repository.get(id);
		if (!record) throw new Error('Unknown RPG character');
		return record;
	}
	private int(maximum: number): number {
		const value = this.random();
		if (!Number.isFinite(value) || value < 0 || value >= 1) {
			throw new Error('RPG random source must return a value from 0 to below 1');
		}
		return Math.floor(value * maximum);
	}
}

function seededTestPokemon(
	species: string, level: number, moves: string[], ability: string, item = '', nature = 'Hardy'
): PokemonSet {
	const trained = species === 'Charizard';
	return {
		name: species, species, item, ability, moves, nature, gender: 'M', level, shiny: false, happiness: 70,
		evs: trained ? { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } :
		{ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
		rpg: {
			version: RPG_STATE_VERSION, level, friendship: 70, item, captureBall: 'pokeball',
		},
	};
}

function restoredTestTeam(): PokemonSet[] {
	return [
		seededTestPokemon('Charizard', 50, ['flamethrower', 'airslash', 'solarbeam', 'roost'],
			'Blaze', 'charizarditey', 'Timid'),
		seededTestPokemon('Ralts', 15, ['raindance', 'psychicterrain', 'spikes', 'reflect'], 'Synchronize'),
		seededTestPokemon('Haunter', 25, ['shadowpunch', 'toxic', 'hex', 'trickroom'], 'Levitate'),
		seededTestPokemon('Bulbasaur', 15, ['tackle', 'growl', 'vinewhip', 'poisonpowder'], 'Overgrow'),
	];
}

function testEvolutionTeam(): PokemonSet[] {
	return [
		seededTestPokemon('Charmander', 50, ['sunnyday', 'grassyterrain', 'stealthrock', 'tailwind'], 'Blaze'),
		seededTestPokemon('Charmeleon', 50, ['flamethrower', 'firefang', 'slash', 'scaryface'], 'Blaze'),
		seededTestPokemon('Charizard', 50, ['flamethrower', 'airslash', 'solarbeam', 'roost'], 'Blaze', '', 'Timid'),
	];
}

const TEST_STORAGE_FIXTURES = [
	{ id: 'Teste', password: '1234', bagTier: 'legendary', boxTier: 'national' },
	{ id: 'Teste2', password: '4321', bagTier: 'trainer', boxTier: 'initial' },
] as const;

const REMOVED_TEST_STORAGE_FIXTURES = ['teste3', 'teste4', 'teste5', 'teste6'] as const;

const TEST_BAG_CATEGORY_FIXTURES = [
	{ itemId: 'quickball', quantity: 7 },
	{ itemId: 'duskball', quantity: 4 },
	{ itemId: 'maxpotion', quantity: 4 },
	{ itemId: 'antidote', quantity: 6 },
	{ itemId: 'maxether', quantity: 3 },
	{ itemId: 'leftovers', quantity: 2 },
	{ itemId: 'sitrusberry', quantity: 5 },
	{ itemId: 'thunderstone', quantity: 3 },
	{ itemId: 'firestone', quantity: 2 },
	{ itemId: 'tm001', quantity: 2 },
	{ itemId: 'tm049', quantity: 1 },
	{ itemId: 'helixfossil', quantity: 2 },
	{ itemId: 'domefossil', quantity: 1 },
	{ itemId: 'venusaurite', quantity: 1 },
	{ itemId: 'charizarditex', quantity: 1 },
] as const;

const TEST_BOX_POKEDEX_FIXTURES = [
	{ species: 'Flaaffy', move: 'thundershock', ability: 'Static' },
	{ species: 'Ampharos', move: 'thunderpunch', ability: 'Static' },
	{ species: 'Bellossom', move: 'absorb', ability: 'Chlorophyll' },
	{ species: 'Marill', move: 'tackle', ability: 'Huge Power' },
	{ species: 'Azumarill', move: 'bubblebeam', ability: 'Huge Power' },
	{ species: 'Sudowoodo', move: 'rockthrow', ability: 'Sturdy' },
	{ species: 'Politoed', move: 'watergun', ability: 'Water Absorb' },
	{ species: 'Hoppip', move: 'absorb', ability: 'Chlorophyll' },
	{ species: 'Skiploom', move: 'fairywind', ability: 'Chlorophyll' },
] as const;
const TEST_READY_EGG_FIXTURE_COUNT = 9;
const TEST_READY_EGG_INCUBATION_TIME_MS = 72 * 60 * 60 * 1000;

/** Adds each visual Egg fixture once. Hatched fixtures remain consumed after a restart. */
function ensureReadyTestEggs(record: RPGStoredCharacter): boolean {
	const nursery = record.state.nursery ||= {
		version: 1, projects: [], releasedPokemon: [],
		incubators: Array.from({length: TEST_READY_EGG_FIXTURE_COUNT}, (_, index) => ({
			id: record.state.id + ':incubator:' + (Math.floor(index / 3) + 1) + ':' + (index % 3 + 1),
			ownerId: record.state.id, kind: 'local' as const,
			group: Math.floor(index / 3) + 1, slot: index % 3 + 1,
		})),
	};
	let changed = false;
	for (let index = 0; index < TEST_READY_EGG_FIXTURE_COUNT; index++) {
		const projectId = record.state.id + ':fixture:hatch:' + (index + 1);
		const eggId = projectId + ':egg';
		const incubatorId = record.state.id + ':incubator:' + (Math.floor(index / 3) + 1) + ':' + (index % 3 + 1);
		const incubator = nursery.incubators.find(entry => entry.id === incubatorId);
		const existing = nursery.projects.find(project => project.id === projectId);
		if (existing) {
			if (incubator && !incubator.eggId && existing.egg?.status === 'ready_to_hatch') {
				incubator.eggId = existing.egg.id;
				existing.egg.incubatorId = incubator.id;
				changed = true;
			}
			continue;
		}
		if (!incubator || incubator.eggId) continue;
		const createdAt = Date.now() + index;
		const fixtureOwnerId = 'nurserytestfixture';
		nursery.projects.push({
			id: projectId,
			slot1: {
				ownerId: fixtureOwnerId, ownerName: 'Fixture de Eclosão', participantType: 'npc',
				pokemonId: fixtureOwnerId + ':parent:' + (index + 1), species: 'Charizard', name: 'Charizard',
				sex: 'M', level: 50, evolutionStage: 3, nature: 'Hardy', ability: 'Blaze', item: '',
				ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, moves: ['flamethrower'],
			},
			slot2ParticipantType: 'npc', eggOwnerId: record.state.id, status: 'collected',
			confirmed: {}, createdAt, parentCollected: {[fixtureOwnerId]: true},
			egg: {
				id: eggId, ownerId: record.state.id, status: 'ready_to_hatch', createdAt,
				genetics: {
					species: 'Charmander', sex: index % 2 ? 'F' : 'M', nature: 'Hardy', ability: 'Blaze',
					ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
					ivOrigins: {hp: 'random', atk: 'random', def: 'random', spa: 'random', spd: 'random', spe: 'random'},
					moves: ['scratch', 'growl'], eggMoves: [], shiny: false,
					family: 'EVOLUTION_CHARMANDER', lineage: 'CHARMANDER',
					parentIds: [fixtureOwnerId + ':parent:1', fixtureOwnerId + ':parent:2'],
					parentOwnerIds: [fixtureOwnerId, fixtureOwnerId],
				},
				requiredIncubationTimeMs: TEST_READY_EGG_INCUBATION_TIME_MS,
				accumulatedIncubationTimeMs: TEST_READY_EGG_INCUBATION_TIME_MS,
				incubatorId,
			},
		});
		incubator.eggId = eggId;
		changed = true;
	}
	return changed;
}
function ensurePermanentTestCharacters(service: RPGLoginService, masterCode: string): void {
	for (const characterId of REMOVED_TEST_STORAGE_FIXTURES) service.repository.delete(characterId);
	const missing: { id: string, password: string, starter: RPGCreateCharacterRequest['starter'], team: PokemonSet[] }[] = [];
	if (!service.repository.get('teste')) missing.push({
		id: 'Teste', password: '1234',
		starter: { species: 'Charizard', nickname: 'Charizard', gender: 'M', level: 50 },
		team: restoredTestTeam(),
	});
	if (!service.repository.get('teste2')) missing.push({
		id: 'Teste2', password: '4321',
		starter: { species: 'Charmander', nickname: 'Charmander', gender: 'M', level: 50 },
		team: testEvolutionTeam(),
	});

	for (const entry of missing) service.createCharacter({
		characterName: entry.id, playerName: entry.id, avatar: 'red', password: entry.password,
		initialMoney: 3000, starter: entry.starter,
	});
	if (missing.length) {
		const master = service.loginMaster(masterCode);
		for (const entry of missing) service.replaceCharacterTeam(master.token, entry.id, entry.team);
		service.logout(master.token);
	}
	const testBagItems = [
		{ itemId: 'potion', quantity: 12 },
		{ itemId: 'superpotion', quantity: 8 },
		{ itemId: 'hyperpotion', quantity: 3 },
		{ itemId: 'revive', quantity: 2 },
		{ itemId: 'pokeball', quantity: 15 },
		{ itemId: 'greatball', quantity: 10 },
		{ itemId: 'ultraball', quantity: 5 },
		{ itemId: 'masterball', quantity: 1 },
	] as const;
	for (const { id: characterId } of TEST_STORAGE_FIXTURES) {
		const record = service.repository.get(toID(characterId));
		if (!record || record.state.inventory.bag.items.length) continue;
		record.state.inventory = {
			...record.state.inventory,
			bag: RPGBagSystem.apply(
				record.state.inventory.bag,
				testBagItems.map(item => ({ type: 'add' as const, ...item })),
				record.state.inventory.bag.revision
			).bag,
		};
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
	for (const fixture of TEST_STORAGE_FIXTURES) {
		const record = service.repository.get(toID(fixture.id));
		if (!record) continue;
		let changed = false;
		const currentBagTier = RPGBagSystem.getTier(record.state.inventory.bag);
		const targetBag = RPGBagSystem.getTierDefinition(fixture.bagTier);
		const currentBag = currentBagTier ? RPGBagSystem.getTierDefinition(currentBagTier) : undefined;
		if (!currentBag || currentBag.maxSlots < targetBag.maxSlots) {
			record.state.inventory = {
				...record.state.inventory,
				bag: currentBag ? RPGBagSystem.upgradeToTier(
					record.state.inventory.bag, fixture.bagTier, record.state.inventory.bag.revision
				) : RPGBagSystem.createForTier(
					record.state.id, fixture.bagTier, record.state.inventory.bag.items,
					{ revision: record.state.inventory.bag.revision + 1 }
				),
			};
			changed = true;
		}
		const currentBox = RPGBoxSystem.getTier(record.state.box.tier);
		const targetBox = RPGBoxSystem.getTier(fixture.boxTier);
		if (currentBox.totalBoxSlots < targetBox.totalBoxSlots) {
			record.state.box = RPGBoxSystem.migrate({
				...record.state.box,
				version: 1,
				tier: fixture.boxTier,
			});
			changed = true;
		}
		if (changed) {
			record.state.updatedAt = Date.now();
			service.repository.set(record);
		}
	}
	const testRecord = service.repository.get('teste');
	if (testRecord) {
		let showcaseChanged = ensureReadyTestEggs(testRecord);
		const missingItems = TEST_BAG_CATEGORY_FIXTURES.filter(item =>
			RPGBagSystem.getQuantity(testRecord.state.inventory.bag, item.itemId) < item.quantity
		).map(item => ({ type: 'set' as const, ...item }));
		if (missingItems.length) {
			testRecord.state.inventory = {
				...testRecord.state.inventory,
				bag: RPGBagSystem.apply(
					testRecord.state.inventory.bag, missingItems,
					testRecord.state.inventory.bag.revision
				).bag,
			};
			showcaseChanged = true;
		}
		if (!testRecord.state.inventory.bag.favorites.includes('quickball')) {
			testRecord.state.inventory = {
				...testRecord.state.inventory,
				bag: RPGBagSystem.setFavorite(
					testRecord.state.inventory.bag, 'quickball', true,
					testRecord.state.inventory.bag.revision
				),
			};
			showcaseChanged = true;
		}
		const storedPokemon = [
			...testRecord.state.box.party,
			...testRecord.state.box.boxes.flatMap(box => box.slots).filter(Boolean),
		];
		if (!storedPokemon.some(entry => entry && (
			entry.pokemonId === 'teste:fixture:eevee' || toID(entry.pokemon.species) === 'eevee'
		))) {
			RPGBoxManagement.insert(testRecord.state, {
				pokemonId: 'teste:fixture:eevee',
				pokemon: seededTestPokemon(
					'Eevee', 10, ['tackle', 'tailwhip', 'sandattack', 'quickattack'], 'Run Away'
				) as unknown as RPGCapturedPokemon,
				metadata: { ot: 'Teste', training: 'none' },
			});
			showcaseChanged = true;
		}
		if (showcaseChanged) {
			testRecord.state.updatedAt = Date.now();
			service.repository.set(testRecord);
		}
		const storedIds = new Set([
			...testRecord.state.box.party.map(entry => entry.pokemonId),
			...testRecord.state.box.boxes.flatMap(box => box.slots)
				.filter(Boolean).map(entry => entry!.pokemonId),
		]);
		let addedFixture = false;
		for (const [index, fixture] of TEST_BOX_POKEDEX_FIXTURES.entries()) {
			const pokedexNumber = 180 + index;
			const pokemonId = `teste:pokedex:${pokedexNumber}`;
			if (storedIds.has(pokemonId)) continue;
			const species = Dex.mod('gen9').species.get(fixture.species);
			if (!species.exists || species.num !== pokedexNumber) {
				throw new Error(`Invalid RPG test Pokedex fixture: ${pokedexNumber}`);
			}
			RPGBoxManagement.insert(testRecord.state, {
				pokemonId,
				pokemon: seededTestPokemon(
					species.name, 10, [fixture.move], fixture.ability
				) as unknown as RPGCapturedPokemon,
				metadata: { ot: 'Teste', training: 'none' },
			});
			addedFixture = true;
		}
		if (addedFixture) {
			testRecord.state.updatedAt = Date.now();
			service.repository.set(testRecord);
		}
	}
	const testCharizard = testRecord?.state.team.find(pokemon => toID(pokemon.species) === 'charizard');
	const testRalts = testRecord?.state.team.find(pokemon => toID(pokemon.species) === 'ralts');
	if (
		testRecord && testCharizard && testRalts &&
		testCharizard.level === 15 && !testCharizard.item &&
		testRalts.level === 50 && toID(testRalts.item) === 'charizarditey'
	) {
		const charizardState = {
			level: testCharizard.level, item: testCharizard.item,
			evs: structuredClone(testCharizard.evs), rpg: structuredClone(testCharizard.rpg),
		};
		testCharizard.level = testRalts.level;
		testCharizard.item = testRalts.item;
		testCharizard.evs = structuredClone(testRalts.evs);
		testCharizard.rpg = structuredClone(testRalts.rpg);
		testRalts.level = charizardState.level;
		testRalts.item = charizardState.item;
		testRalts.evs = charizardState.evs;
		testRalts.rpg = charizardState.rpg;
		testRecord.state.updatedAt = Date.now();
		service.repository.set(testRecord);
	}
	if (testRecord) {
		let restoredFixture = false;
		const legacyRaltsIndex = testRecord.state.team.findIndex(pokemon =>
			toID(pokemon.species) === 'kirlia'
		);
		if (legacyRaltsIndex >= 0) {
			testRecord.state.team[legacyRaltsIndex] = seededTestPokemon(
				'Ralts', 15, ['raindance', 'psychicterrain', 'spikes', 'reflect'], 'Synchronize'
			);
			restoredFixture = true;
		}
		const legacyBulbasaurIndex = testRecord.state.team.findIndex(pokemon =>
			toID(pokemon.species) === 'ivysaur' && pokemon.level === 17
		);
		if (legacyBulbasaurIndex >= 0) {
			testRecord.state.team[legacyBulbasaurIndex] = seededTestPokemon(
				'Bulbasaur', 15, ['tackle', 'growl', 'vinewhip', 'poisonpowder'], 'Overgrow'
			);
			restoredFixture = true;
		}
		if (restoredFixture) {
			testRecord.state.updatedAt = Date.now();
			service.repository.set(testRecord);
		}
	}
	const fixtureMoves: Record<string, Record<string, string[]>> = {
		teste: {
			ralts: ['raindance', 'psychicterrain', 'spikes', 'reflect'],
			haunter: ['shadowpunch', 'toxic', 'hex', 'trickroom'],
		},
		teste2: {
			charmander: ['sunnyday', 'grassyterrain', 'stealthrock', 'tailwind'],
		},
	};
	for (const [characterId, speciesMoves] of Object.entries(fixtureMoves)) {
		const record = service.repository.get(characterId);
		if (!record) continue;
		let changed = false;
		for (const pokemon of record.state.team) {
			const moves = speciesMoves[toID(pokemon.species)];
			if (!moves || pokemon.moves?.join(',') === moves.join(',')) continue;
			pokemon.moves = [...moves];
			changed = true;
		}
		if (changed) {
			record.state.updatedAt = Date.now();
			service.repository.set(record);
		}
	}
}
function migrateCharacterPageAccess(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		const pageAccess = {
			bag: record.state.pageAccess?.bag !== false,
			box: record.state.pageAccess?.box !== false,
			training: record.state.pageAccess?.training !== false,
			center: record.state.pageAccess?.center !== false,
			fossils: record.state.pageAccess?.fossils !== false,
			nursery: record.state.pageAccess?.nursery !== false,
			shops: record.state.pageAccess?.shops !== false,
		};
		const shopAccess = Object.fromEntries(service.commerce.directory().shops.map(shop => [
			shop.id, record.state.shopAccess?.[shop.id] !== false,
		]));
		if (record.state.version === RPG_ACCOUNT_VERSION &&
			JSON.stringify(record.state.pageAccess) === JSON.stringify(pageAccess) &&
			JSON.stringify(record.state.shopAccess) === JSON.stringify(shopAccess)) continue;
		record.state.version = RPG_ACCOUNT_VERSION;
		record.state.pageAccess = pageAccess;
		record.state.shopAccess = shopAccess;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
function migrateCharacterBags(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		const inventory = RPGInventorySystem.migrate(record.state.inventory);
		if (JSON.stringify(inventory) === JSON.stringify(record.state.inventory)) continue;
		record.state.inventory = inventory;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
function migrateCharacterBoxes(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		const original = JSON.stringify(record.state.box);
		if (Array.isArray(record.state.box.party) && Array.isArray(record.state.box.boxes) &&
			Array.isArray(record.state.box.placements)) {
			const storedPokemonIds = new Set([
				...record.state.box.party.map(entry => entry.pokemonId),
				...record.state.box.boxes.flatMap(box => box.slots || [])
					.filter(Boolean).map(entry => entry.pokemonId),
			]);
			record.state.box.placements = record.state.box.placements.filter(placement =>
				storedPokemonIds.has(placement.pokemonId)
			);
		}
		const migrated = RPGBoxSystem.migrate(record.state.box);
		if (JSON.stringify(migrated) === original) continue;
		record.state.box = migrated;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
function repairOrphanedBoxPlacements(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		const storedPokemonIds = new Set([
			...record.state.box.party.map(entry => entry.pokemonId),
			...record.state.box.boxes.flatMap(box => box.slots)
				.filter(Boolean).map(entry => entry!.pokemonId),
		]);
		const placements = record.state.box.placements.filter(placement =>
			storedPokemonIds.has(placement.pokemonId)
		);
		if (placements.length === record.state.box.placements.length) continue;
		record.state.box.placements = placements;
		record.state.box.revision++;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
export function createRPGLoginServiceFromConfig(
	config: {
		rpgmastercode?: string,
		rpgcharacterfile?: string,
		rpgbattlefile?: string,
		rpgcontestfile?: string,
		rpgcustomitemfile?: string,
		rpgshopfile?: string,
		rpgseedtestaccount?: boolean,
	} = Config
): RPGLoginService {
	const masterCode = config.rpgmastercode || '';
	const repository = new RPGFileCharacterRepository(
		config.rpgcharacterfile || resolve('config/rpg-characters.json')
	);
	const battleSessionRepository = new RPGFileBattleSessionRepository(
		config.rpgbattlefile || resolve('config/rpg-battle-sessions.json')
	);
	const contestSessionRepository = new RPGFileContestSessionRepository(
		config.rpgcontestfile || resolve('config/rpg-contest-sessions.json')
	);
	const customItemRepository = new RPGFileCustomItemRepository(
		config.rpgcustomitemfile || resolve('config/rpg-custom-items.json')
	);
	const commerceRepository = new RPGFileCommerceRepository(
		config.rpgshopfile || resolve('config/rpg-shops.json')
	);
	const service = new RPGLoginService({
		masterCode, repository, battleSessionRepository, contestSessionRepository,
		customItemRepository, commerceRepository,
	});
	migrateCharacterPageAccess(service);
	migrateCharacterBags(service);
	migrateCharacterBoxes(service);
	service.recoverInterruptedBattleSessions();
	repairOrphanedBoxPlacements(service);
	if (config.rpgseedtestaccount !== false) ensurePermanentTestCharacters(service, masterCode);
	return service;
}
