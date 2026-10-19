import {
	createHash,
	randomBytes as secureRandomBytes,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from 'node:util';

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
	type RPGBagState,
	type RPGItemDefinition,
	type RPGShopTransaction,
} from "../../sim/rpg-showdown";
/**
 * Fachada principal do servidor RPG.
 *
 * Centraliza autenticação, personagens e a coordenação dos serviços de mundo.
 * As classes especializadas continuam responsáveis pelas regras de cada área;
 * este arquivo valida permissões, reúne os estados e delimita as transações que
 * precisam ser persistidas como uma única operação.
 */
import {
	RPGMemoryBattleSessionRepository,
	RPGBattleSessionService,
	type RPGBattleSession,
	type RPGBattleSessionRepository,
	type RPGCreateBattleSessionRequest,
	type RPGUpdateBattleSessionRequest,
	type RPGBattleLaunchRequest,
} from './battle-session';
import {
	RPGMemoryContestSessionRepository,
	RPGContestSessionService,
	type RPGContestSession,
	type RPGContestSessionRepository,
	type RPGCreateContestSessionRequest,
	type RPGUpdateContestSessionRequest,
} from './contest-session';
import {
	RPGMemoryContestComboRepository,
	RPGContestComboService,
	type RPGContestComboDefinition,
	type RPGContestComboRepository,
} from './contest-scoring';
import { RPGMySQLPersistence, rpgMySQLConfig } from './database/mysql-persistence';
import { createRPGPendingTrainerSheet, type RPGTrainerChatRoll, type RPGTrainerSheet } from './trainer-sheet';
import {
	RPG_EQUIPMENT_CATALOG, rpgAssertEquipmentLicense, rpgEquipment, rpgEquipmentSlots,
	rpgEquipmentWeight, rpgInitialTrainerInventory, rpgCanAcquireKitDomain, rpgEquipmentDerivedOptions, rpgKitBonus,
	type RPGEquipmentInstance, type RPGTrainerInventory, type RPGLicense,
} from './trainer-equipment';
import {
	RPG_DIFFICULTIES, RPG_SKILL_ATTRIBUTES, RPG_KNOWLEDGE_DOMAINS, RPG_CRAFT_DOMAINS,
	rpgTrainerDerivedStatistics,
	rpgTrainerAttackBonus, rpgTrainerProficiency, rpgTrainerResistanceBonus, rpgTrainerSkillBonus,
	rpgTrainerSkillAttributes,
	rollRPGTrainerAttributeCheck, rollRPGTrainerResistance, rollRPGTrainerSkillCheck, rpgHelpBonus,
	type RPGTrainerAttribute, type RPGTrainerCheckOptions, type RPGTrainerResistance,
} from './trainer-checks';
import { rpgArtisticInspirationOption, rpgCaptivatingDistractionOption, rpgEncouragingPresenceOption,
	rpgEnchanterAllyOptions, rpgEnchanterSocialChemistryOption,
	rpgDetectiveCapturePlanOption, rpgDetectiveDuoOption, rpgExcavationMasterOption, rpgExpeditionLeaderOption,
	rpgExplorerLifelineOption, rpgTeamCaptainOption,
	rpgDiplomatIntroductionOption,
	rpgDiplomatProxyOption,
	rpgCosmopolitanEtiquetteOption,
	rpgChoreographyGroupOption,
	rpgTechnicalOpinionOption, rpgPhotographicSequenceOption, rpgPhotographicPanoramaOption,
	rpgGuardPerimeterOption,
	rpgCommanderOperationOption,
	rpgResolveTrainerRollTalents, rpgSetSharedArchive, rpgUpdatePersistentHypothesis,
	rpgSharedArchiveOptions, rpgTrainerRollTalents } from './trainer-roll-talents';
import { rpgTrainerHeroicMessage, rpgTrainerRerollCandidate, rpgTrainerRerollMessage,
	rpgUseTrainerSheetTalent } from './trainer-active-talents';
import {
	rpgTrainerAddExhaustion, rpgTrainerAddWound, rpgTrainerApplyCondition, rpgTrainerConditionTick,
	rpgTrainerDeathSave, rpgTrainerHeal, rpgTrainerReduceExhaustion, rpgTrainerRemoveCondition, rpgTrainerRest,
	rpgTrainerStabilize, rpgTrainerStartRest, rpgTrainerTakeDamage, rpgTrainerTreatWound,
	rpgTrainerSurvival,
	type RPGTrainerSurvivalAction,
} from './trainer-survival';
import { RPG_TRAINER_CLASS_FEATURES } from './trainer-class-features';
import { rpgScientistRecordFormulas, rpgScientistRecordLimit, rpgScientistRecordProduction,
	rpgSetScientistRecord, RPG_SCIENTIST_RECORDS } from './trainer-scientist-records';
import { resolveRPGExposure, prepareRPGCamp, type RPGExposure } from './trainer-exploration';
import { resolveRPGMasterExcavation } from './trainer-excavation';
import { advanceRPGTravel, createRPGTravelState, resolveRPGForcedMarch,
	type RPGHex, type RPGTravelLeg } from './trainer-travel';
import { planRPGCraft, RPG_CRAFT_RECIPES } from './trainer-campaign-work';
import {
	chooseRPGTrainerTalent, rpgTrainerTalentCatalog, RPG_TALENT_APPROVAL_KEYS, type RPGTrainerTalentChoice,
} from './trainer-talents';
import {
	advanceRPGTrainerLevel, awardRPGTrainerXP, lowerRPGTrainerLevel,
	rpgBadgeXP, rpgContestPodiumXP, rpgTrainerLevelForXP, rpgTrainerXPToNextLevel, RPG_TRAINER_LEVEL_XP,
	type RPGTrainerXPReward,
} from './trainer-progression';
import {
	completeRPGTrainerSheet, rollRPGTrainerAttributeGroup, RPG_STANDARD_ATTRIBUTES, RPG_TRAINER_CLASSES,
	RPG_TRAINER_PILOTING_DOMAINS, rpgTrainerModifier,
	type RPGTrainerAttributeMethod, type RPGTrainerCompletion,
} from './trainer-creation';
import {
	getRPGDefaultTablePermissions, RPGAccountManagement, RPGMemoryAccountRepository,
	RPGMemoryPlatformSessionRepository, type RPGTablePermission, type RPGTableRole,
} from './account-management';
import { applyRPGContestPerformance, type RPGContestPlacement } from './contest-progression';
import { classifyRPGContestItem, type RPGContestItemClassification } from './contest-item-catalog';
import { getRPGContestMoveCatalog } from './contest-move-catalog';
import { RPGTournamentSessionService, type RPGTournament } from './tournament-session';
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
	rpgCanUseAthleteEVTraining,
	type RPGTeamBuilderManagementView,
} from './team-builder-management';
import { getRPGMoveMetadata, type RPGMoveMetadata } from './battle-move-analysis';
import {
	RPGFossilLab, RPG_FOSSILS, type RPGFossilLabState, type RPGFossilMethod, type RPGFossilQuality,
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
	type RPGCommerceShopState,
	type RPGCommerceTradeRequest,
} from './shop-management';

export * from './battle-session';
export * from './contest-session';
export * from './contest-move-catalog';
export * from './contest-item-catalog';
export * from './contest-runtime';
export * from './contest-scoring';
export * from './contest-stage';
export * from './contest-progression';
export * from './box-management';
export * from './bag-management';
export * from './team-builder-management';
export * from './custom-item-repository';
export * from './nursery';
export * from './incubation';
export * from './pokemon-catalog';
export * from './fossil-lab';
export * from './shop-management';
export * from './account-management';
export * from './trainer-sheet';
export * from './trainer-excavation';
export * from './trainer-creation';
export * from './trainer-checks';
export * from './trainer-conflicts';
export * from './trainer-travel';
export * from './trainer-exploration';
export * from './trainer-interactions';
export * from './trainer-campaign-work';
export * from './trainer-progression';
export * from './trainer-class-features';
export * from './trainer-talents-catalog';
export * from './trainer-talents';
export * from './trainer-survival';
export * from './trainer-equipment';

export const RPG_ACCOUNT_VERSION = 5;
export const RPG_SESSION_VERSION = 1;
const RPG_PLATFORM_INITIAL_MONEY = 3000;
// A ordem corresponde à folha de insígnias e à ficha exibida na visão geral.
const GYM_BADGE_NAMES: Record<string, string[]> = {
	kanto: ['Rocha', 'Cascata', 'Trovão', 'Arco-íris', 'Alma', 'Pântano', 'Vulcão', 'Terra'],
	johto: ['Zéfiro', 'Colmeia', 'Planície', 'Névoa', 'Tempestade', 'Mineral', 'Geleira', 'Nascente'],
	hoenn: ['Pedra', 'Punho', 'Dínamo', 'Calor', 'Equilíbrio', 'Pena', 'Mente', 'Chuva'],
	sinnoh: ['Carvão', 'Floresta', 'Paralelepípedo', 'Pântano', 'Relíquia', 'Mina', 'Sincelo', 'Farol'],
	unova: ['Trio', 'Básica', 'Inseto', 'Raio', 'Terremoto', 'Jato', 'Congelamento', 'Lenda'],
	kalos: ['Inseto', 'Penhasco', 'Briga', 'Planta', 'Voltagem', 'Fada', 'Psíquica', 'Iceberg'],
	galar: ['Planta', 'Água', 'Fogo', 'Luta', 'Fada', 'Pedra', 'Noturna', 'Dragão'],
	paldea: ['Inseto', 'Planta', 'Elétrica', 'Água', 'Normal', 'Fantasma', 'Psíquica', 'Gelo'],
};
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

export interface RPGPlayerRosterEntry extends RPGCharacterSelection {
	accountId?: string;
	online: boolean;
	presence: 'online' | 'idle' | 'offline';
	occupiedTeamSlots: number;
	team: {
		species: string,
		shiny?: boolean,
		spriteId?: string,
		baseSpriteId?: string,
	}[];
}

export interface RPGCharacterPageAccess {
	bank: boolean;
	bag: boolean;
	box: boolean;
	training: boolean;
	center: boolean;
	fossils: boolean;
	nursery: boolean;
	shops: boolean;
}

export interface RPGTeamPreset {
	id: string;
	name: string;
	species: string[];
	pokemonIds?: (string | null)[];
	createdAt: number;
	updatedAt: number;
}

export interface RPGCampaignTimeAdvanceResult {
	hours: 1 | 8;
	milliseconds: number;
	charactersAffected: number;
	fossils: { advanced: number, completed: number };
	trainings: { advanced: number, completed: number };
	breedings: { advanced: number, completed: number };
	incubations: { advanced: number, completed: number };
	events: RPGCampaignEvent[];
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
	safeRemoval?: boolean;
}

export interface RPGCharacterState extends RPGCharacterSelection {
	version: number;
	/** Ausente apenas em personagens criados antes da escolha de gênero. */
	characterGender?: 'M' | 'F';
	pageAccess: RPGCharacterPageAccess;
	shopAccess?: Record<string, boolean>;
	money: number;
	bank?: RPGBankAccount;
	profile?: RPGTrainerProfile;
	trainerSheet?: RPGTrainerSheet;
	trainerInventory?: RPGTrainerInventory;
	team: PokemonSet[];
	teamPresets?: RPGTeamPreset[];
	/** Presentation-only Eggs that reserve party slots; never persisted as battle Pokémon. */
	teamEggs?: RPGTeamEggView[];
	portableIncubators?: { id: string, loaded: boolean, eggId?: string, mission?: boolean }[];
	box: RPGBoxState;
	inventory: RPGInventoryState;
	fossilLab?: RPGFossilLabState;
	nursery?: RPGNurseryCharacterState;
	shopRevision?: number;
	shopTransactions?: RPGShopTransaction[];
	completedContestRewards?: string[];
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
	/** Version 2 ownership; absent only in pre-migration file-backed fixtures. */
	accountId?: string;
	tableId?: string;
}

export interface RPGCreateCharacterRequest {
	characterName: string;
	/** Opcional para chamadas legadas; o formulário atual sempre informa M ou F. */
	characterGender?: 'M' | 'F';
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
	platformAccountId?: string;
	/** Identifica a mesa e a associação que autorizaram esta sessão RPG. */
	platformTableId?: string;
	platformMembershipId?: string;
	/** Papel da conta na mesa selecionada, preservado ao entrar no mundo RPG. */
	platformTableRole?: RPGTableRole;
	platformTablePermissions?: Partial<Record<RPGTablePermission, boolean>>;
	createdAt: number;
	expiresAt: number;
}

export type RPGInternalSession = Omit<RPGSession, 'token'> & {
	lastSeenAt: number, activeArea?: string, idle?: boolean,
};

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

export interface RPGCharacterDeletionStore {
	challenges: Map<string, RPGInternalDeletionChallenge>;
	lastWords: Map<string, string>;
	pokemonReleaseChallenges?: Map<string, RPGInternalPokemonReleaseChallenge>;
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
	'money:read', 'money:edit', 'battle:start',
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
	constructor(records: RPGStoredCharacter[] = [], private readonly changed?: (record: RPGStoredCharacter | null, id: string) => void) {
		for (const record of records) this.records.set(toID(record.state.id), structuredClone(record));
	}

	create(record: RPGStoredCharacter): void {
		if (this.records.has(record.state.id)) throw new Error('RPG character already exists');
		this.records.set(record.state.id, structuredClone(record));
		this.changed?.(record, record.state.id);
	}
	get(id: string): RPGStoredCharacter | undefined {
		const record = this.records.get(toID(id));
		return record && structuredClone(record);
	}
	set(record: RPGStoredCharacter): void {
		if (!this.records.has(record.state.id)) throw new Error('Unknown RPG character');
		this.records.set(record.state.id, structuredClone(record));
		this.changed?.(record, record.state.id);
	}
	delete(id: string): boolean {
		const normalized = toID(id);
		const deleted = this.records.delete(normalized);
		if (deleted) this.changed?.(null, normalized);
		return deleted;
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
export interface RPGCampaignEvent {
	id: string;
	type: 'training' | 'fossil' | 'breeding' | 'incubation';
	title: string;
	description: string;
	characterId: string;
	characterName: string;
	occurredAt: string;
}

export interface RPGScientificPublication {
	id: string; characterId: string; characterName: string; title: string; summary: string;
	knowledge: string; submittedAt: string; status: 'pending' | 'accepted' | 'rejected';
	decidedAt?: string; payment?: number;
}

export interface RPGConfidantRequest {
	id: string; characterId: string; characterName: string; confidantName: string;
	submittedAt: string; roll: { natural: number, bonus: number, total: number };
	status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string;
}

export interface RPGForageRequest {
	id: string; characterId: string; characterName: string; submittedAt: string;
	status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string;
	foodQuantity: number;
}

export interface RPGTrueBondRequest {
	id: string; characterId: string; characterName: string; npcName: string;
	submittedAt: string; status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string;
}

export interface RPGSupplierOrder {
	id: string; characterId: string; characterName: string; itemId: string; itemName: string;
	itemKind: 'pokemon' | 'equipment'; price: number; requestedAt: string;
	icon?: string | null; sprite?: number | null;
	status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string; reason?: string;
	source?: 'parallel-market'; quantity?: number;
}

export interface RPGCustomScientistRecordRequest {
	id: string; characterId: string; characterName: string; slot: number;
	recipientCharacterId: string; name: string; description: string; submittedAt: string;
	status: 'pending' | 'accepted' | 'rejected'; decidedAt?: string;
	kitTier?: number; charges?: number;
}

export interface RPGTrainerProfile {
	version: 1;
	tagline: string;
	stats: {
		wins: number,
		losses: number,
		fleeAttempts: number,
		pokemonCaptured: number,
		pokemonReleased: number,
		itemsUsed: number,
		pokeballsThrown: number,
		contestsEntered: number,
		contestsWon: number,
		pokemonDefeated: number,
		evolutions: number,
		eggsHatched: number,
		fossilsRestored: number,
		currentWinStreak: number,
		longestWinStreak: number,
	};
	pokedex: { seen: string[], caught: string[] };
	badges: Record<string, string[]>;
}

export interface RPGBankAccount {
	version: 1;
	balance: number;
	revision: number;
}

export interface RPGBankView extends RPGBankAccount {
	money: number;
}

interface RPGContestSessionFileData {
	version: 1;
	sessions: RPGContestSession[];
}

interface RPGContestComboFileData {
	version: 1;
	combos: RPGContestComboDefinition[];
}

export class RPGFileContestComboRepository implements RPGContestComboRepository {
	private readonly combos = new Map<string, RPGContestComboDefinition>();
	readonly filePath: string;
	constructor(filePath = resolve('config/rpg-contest-combos.json')) {
		this.filePath = resolve(filePath);
		if (!existsSync(this.filePath)) return;
		const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<RPGContestComboFileData>;
		if (raw.version !== 1 || !Array.isArray(raw.combos)) throw new Error('Invalid RPG contest combo persistence file');
		for (const combo of raw.combos) {
			if (!combo?.id || combo.source !== 'master') throw new Error('Invalid RPG contest combo persistence record');
			this.combos.set(toID(combo.id), structuredClone(combo));
		}
	}
	list(): RPGContestComboDefinition[] {
		return [...this.combos.values()].map(combo => structuredClone(combo));
	}
	set(combo: RPGContestComboDefinition): void {
		const id = toID(combo.id);
		const previous = this.combos.get(id);
		this.combos.set(id, structuredClone(combo));
		try {
			this.persist();
		} catch (error) {
			if (previous) this.combos.set(id, previous);
			else this.combos.delete(id);
			throw error;
		}
	}
	delete(id: string): boolean {
		const normalized = toID(id);
		const previous = this.combos.get(normalized);
		if (!previous) return false;
		this.combos.delete(normalized);
		try {
			this.persist();
			return true;
		} catch (error) {
			this.combos.set(normalized, previous);
			throw error;
		}
	}
	private persist(): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temporary = this.filePath + '.tmp';
		writeFileSync(temporary, JSON.stringify({ version: 1, combos: [...this.combos.values()] }, null, '\t') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
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
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temporary = this.filePath + '.tmp';
		const data: RPGContestSessionFileData = { version: 1, sessions: [...this.sessions.values()] };
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
	contestComboRepository?: RPGContestComboRepository;
	customItemRepository?: RPGCustomItemRepository;
	commerceRepository?: RPGCommerceRepository;
	masterNPCLibraryFile?: string;
	playerDocumentsFile?: string;
	campaignSettingsFile?: string;
	tournamentFile?: string;
	tournaments?: RPGTournament[];
	tournamentChanged?: (tournament: RPGTournament) => void;
	mysqlPersistence?: RPGMySQLPersistence;
	accountManagement?: RPGAccountManagement;
	legacyTableId?: string;
	masterNPCLibrary?: Record<string, unknown> | null;
	playerDocuments?: Record<string, Record<string, unknown>>;
	campaignSettings?: Record<string, unknown> | null;
	sessionTtlMs?: number;
	now?: () => number;
	random?: () => number;
	randomBytes?: (size: number) => Buffer;
	sessionStore?: Map<string, RPGInternalSession>;
	deletionStore?: RPGCharacterDeletionStore;
}

interface RPGSupportCache {
	revision: number;
	bag: RPGBagState;
	equipment: RPGEquipmentInstance[];
	concealedItem?: { ownerCharacterId: string, kind: 'pokemon' | 'equipment', itemId: string,
		instanceId?: string, };
	ownerCharacterId?: string;
	location?: string;
}

export class RPGLoginService {
	readonly repository: RPGCharacterRepository;
	readonly battleSessions: RPGBattleSessionService;
	readonly contestSessions: RPGContestSessionService;
	readonly contestCombos: RPGContestComboService;
	readonly customItems: RPGCustomItemRepository;
	readonly commerce: RPGCommerceManagement;
	readonly tournaments: RPGTournamentSessionService;
	private readonly sessions: Map<string, RPGInternalSession>;
	private readonly masterCodeHash: Buffer;
	private readonly deletionChallenges: RPGCharacterDeletionStore['challenges'];
	private readonly lastDeletionWord: RPGCharacterDeletionStore['lastWords'];
	private readonly pokemonReleaseChallenges: Map<string, RPGInternalPokemonReleaseChallenge>;
	private readonly sessionTtlMs: number;
	private readonly now: () => number;
	private readonly random: () => number;
	private readonly bytes: (size: number) => Buffer;
	private readonly masterNPCLibraryFile?: string;
	private masterNPCLibrary: Record<string, unknown> | null = null;
	private readonly playerDocumentsFile?: string;
	private playerDocuments: Record<string, Record<string, unknown>> = {};
	private readonly campaignSettingsFile?: string;
	private campaignSettings: {
		name: string, currentDateTime: string, quickNotes: string, events: RPGCampaignEvent[],
		publications: RPGScientificPublication[], customRecordRequests: RPGCustomScientistRecordRequest[],
		confidantRequests: RPGConfidantRequest[],
		forageRequests: RPGForageRequest[],
		trueBondRequests: RPGTrueBondRequest[],
		supplierOrders: RPGSupplierOrder[],
		playerNotes: Record<string, string>, sceneNpcIds: string[], sceneNpcRevealed: Record<string, number[]>,
		equipmentOffers: Record<string, Record<string, { stock: number, price: number }>>,
		supportCaches: Record<string, RPGSupportCache>,
		trainerHelp: { characterId: string, skill: string, total: number, bonus: number }[],
	};
	readonly mysqlPersistence?: RPGMySQLPersistence;
	readonly accounts: RPGAccountManagement;
	readonly legacyTableId?: string;

	constructor(options: RPGLoginServiceOptions) {
		if (typeof options.masterCode !== 'string' || !options.masterCode) {
			throw new Error('RPG master code must be configured');
		}
		this.repository = options.repository || new RPGMemoryCharacterRepository();
		this.sessions = options.sessionStore || new Map<string, RPGInternalSession>();
		this.deletionChallenges = options.deletionStore?.challenges || new Map();
		this.lastDeletionWord = options.deletionStore?.lastWords || new Map();
		this.pokemonReleaseChallenges = options.deletionStore?.pokemonReleaseChallenges || new Map();
		this.mysqlPersistence = options.mysqlPersistence;
		this.accounts = options.accountManagement || new RPGAccountManagement();
		this.legacyTableId = options.legacyTableId;
		this.customItems = options.customItemRepository || new RPGMemoryCustomItemRepository();
		this.commerce = new RPGCommerceManagement(options.commerceRepository || new RPGMemoryCommerceRepository());
		this.tournaments = new RPGTournamentSessionService(options.tournamentFile || resolve('config/rpg-tournaments.json'),
			options.random, options.tournaments || null, options.tournamentChanged);
		this.contestCombos = new RPGContestComboService(options.contestComboRepository);
		for (const item of this.customItems.list()) {
			const existing = RPGItems.get(item.id);
			if (!existing) RPGItems.register(item);
			else if (!isDeepStrictEqual(existing, item)) {
				if (item.effect?.originalItemId && item.tags?.includes('playercrafted') &&
					isDeepStrictEqual({ ...existing, price: item.price }, item)) RPGItems.register(item, true);
				else throw new Error('RPG custom item conflicts with the item registry: ' + item.id);
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
		this.campaignSettingsFile = options.campaignSettingsFile && resolve(options.campaignSettingsFile);
		this.campaignSettings = {
			name: 'Minha campanha', currentDateTime: new Date(this.now()).toISOString(), quickNotes: '', events: [],
			publications: [], customRecordRequests: [], supplierOrders: [], confidantRequests: [], forageRequests: [], trueBondRequests: [],
			playerNotes: {}, sceneNpcIds: [], sceneNpcRevealed: {},
			equipmentOffers: {}, supportCaches: {}, trainerHelp: [],
		};
		const initialCampaignSettings = options.campaignSettings || (this.campaignSettingsFile && existsSync(this.campaignSettingsFile) ?
			JSON.parse(readFileSync(this.campaignSettingsFile, 'utf8')) as Record<string, unknown> : null);
		if (initialCampaignSettings) {
			const stored = initialCampaignSettings as Partial<typeof this.campaignSettings>;
			if (Array.isArray(stored.trainerHelp)) {
				this.campaignSettings.trainerHelp = stored.trainerHelp.filter(entry =>
					entry && typeof entry.characterId === 'string' && typeof entry.skill === 'string' &&
					Number.isSafeInteger(entry.total) && Number.isSafeInteger(entry.bonus) &&
					entry.bonus >= 0 && entry.bonus <= 5).slice(-100);
			}
			if (stored.equipmentOffers && typeof stored.equipmentOffers === 'object' && !Array.isArray(stored.equipmentOffers)) {
				this.campaignSettings.equipmentOffers = structuredClone(stored.equipmentOffers);
			}
			if (stored.supportCaches && typeof stored.supportCaches === 'object' && !Array.isArray(stored.supportCaches)) {
				this.campaignSettings.supportCaches = structuredClone(stored.supportCaches);
			}
			if (typeof stored.name === 'string' && stored.name.trim()) this.campaignSettings.name = stored.name.trim().slice(0, 80);
			if (typeof stored.currentDateTime === 'string' && Number.isFinite(Date.parse(stored.currentDateTime))) {
				this.campaignSettings.currentDateTime = new Date(stored.currentDateTime).toISOString();
			}
			if (typeof stored.quickNotes === 'string') this.campaignSettings.quickNotes = stored.quickNotes.slice(0, 50_000);
			if (Array.isArray(stored.sceneNpcIds)) this.campaignSettings.sceneNpcIds = [...new Set(stored.sceneNpcIds
				.filter((id): id is string => typeof id === 'string' && !!id))].slice(0, 100);
			if (stored.sceneNpcRevealed && typeof stored.sceneNpcRevealed === 'object' && !Array.isArray(stored.sceneNpcRevealed)) {
				this.campaignSettings.sceneNpcRevealed = Object.fromEntries(Object.entries(stored.sceneNpcRevealed)
					.filter(([id, slots]) => this.campaignSettings.sceneNpcIds.includes(id) && Array.isArray(slots))
					.map(([id, slots]) => [id, [...new Set((slots as unknown[]).filter((slot): slot is number =>
						Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < 6))]]));
			}
			if (Array.isArray(stored.events)) this.campaignSettings.events = stored.events.slice(-200);
			if (Array.isArray(stored.publications)) this.campaignSettings.publications = stored.publications.filter(entry =>
				entry && typeof entry.id === 'string' && typeof entry.characterId === 'string' &&
				['pending', 'accepted', 'rejected'].includes(entry.status));
			if (Array.isArray(stored.confidantRequests)) this.campaignSettings.confidantRequests =
				stored.confidantRequests.filter(entry => entry && typeof entry.id === 'string' &&
					typeof entry.characterId === 'string' && typeof entry.confidantName === 'string' &&
					['pending', 'accepted', 'rejected'].includes(entry.status));
			if (Array.isArray(stored.forageRequests)) this.campaignSettings.forageRequests =
				stored.forageRequests.filter(entry => entry && typeof entry.id === 'string' &&
					typeof entry.characterId === 'string' && Number.isSafeInteger(entry.foodQuantity) &&
					entry.foodQuantity > 0 && ['pending', 'accepted', 'rejected'].includes(entry.status));
			if (Array.isArray(stored.trueBondRequests)) this.campaignSettings.trueBondRequests =
				stored.trueBondRequests.filter(entry => entry && typeof entry.id === 'string' &&
					typeof entry.characterId === 'string' && typeof entry.npcName === 'string' &&
					['pending', 'accepted', 'rejected'].includes(entry.status));
			if (Array.isArray(stored.supplierOrders)) this.campaignSettings.supplierOrders = stored.supplierOrders.filter(entry =>
				entry && typeof entry.id === 'string' && typeof entry.characterId === 'string' &&
				['pokemon', 'equipment'].includes(entry.itemKind) &&
				['pending', 'accepted', 'rejected'].includes(entry.status));
			if (Array.isArray(stored.customRecordRequests)) this.campaignSettings.customRecordRequests =
				stored.customRecordRequests.filter(entry => entry && typeof entry.id === 'string' &&
					typeof entry.characterId === 'string' && Number.isSafeInteger(entry.slot) &&
					['pending', 'accepted', 'rejected'].includes(entry.status));
			if (stored.playerNotes && typeof stored.playerNotes === 'object' && !Array.isArray(stored.playerNotes)) {
				this.campaignSettings.playerNotes = Object.fromEntries(Object.entries(stored.playerNotes)
					.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
					.map(([id, note]) => [id, note.slice(0, 20_000)]));
			}
		}
		this.masterNPCLibraryFile = options.masterNPCLibraryFile && resolve(options.masterNPCLibraryFile);
		const initialMasterNPCLibrary = options.masterNPCLibrary || (this.masterNPCLibraryFile && existsSync(this.masterNPCLibraryFile) ?
			JSON.parse(readFileSync(this.masterNPCLibraryFile, 'utf8')) as unknown : null);
		if (initialMasterNPCLibrary) {
			const stored = initialMasterNPCLibrary;
			if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Invalid RPG master NPC library file');
			this.masterNPCLibrary = structuredClone(stored as Record<string, unknown>);
		}
		this.playerDocumentsFile = options.playerDocumentsFile && resolve(options.playerDocumentsFile);
		const initialPlayerDocuments = options.playerDocuments || (this.playerDocumentsFile && existsSync(this.playerDocumentsFile) ?
			JSON.parse(readFileSync(this.playerDocumentsFile, 'utf8')) as unknown : null);
		if (initialPlayerDocuments) {
			const stored = initialPlayerDocuments;
			if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Invalid RPG player documents file');
			this.playerDocuments = structuredClone(stored as Record<string, Record<string, unknown>>);
		}
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

	createCharacter(request: RPGCreateCharacterRequest, platformAccountId?: string): RPGCharacterSelection {
		const characterName = this.text(request.characterName, 'character name', 30);
		if (request.characterGender !== undefined && !['M', 'F'].includes(request.characterGender)) {
			throw new Error('Invalid RPG character gender');
		}
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
			}],
		});
		const inventory = RPGInventorySystem.create(RPGBagSystem.createForTier(id, 'starter'));
		const state: RPGCharacterState = {
			version: RPG_ACCOUNT_VERSION, id, characterName, playerName, avatar,
			characterGender: request.characterGender || 'M',
			pageAccess: {
				bank: true, bag: true, box: true, training: true, center: true, fossils: true, nursery: true, shops: true,
			},
			shopAccess: Object.fromEntries(this.commerce.directory().shops.map(shop => [shop.id, true])),
			money: request.initialMoney, bank: { version: 1, balance: 0, revision: 0 },
			profile: this.createTrainerProfile(starter.species), trainerSheet: createRPGPendingTrainerSheet(),
			team: [starter], box, inventory,
			createdAt: now, updatedAt: now,
		};
		const credential = this.hashPassword(request.password);
		return this.persistAtomically(() => {
			let linkage: Pick<RPGStoredCharacter, 'accountId' | 'tableId'> = {};
			if (platformAccountId && this.legacyTableId) {
				if (this.repository.list().some(record => record.accountId === platformAccountId)) {
					throw new Error('Esta conta já possui personagem nesta mesa');
				}
				linkage = { accountId: platformAccountId, tableId: this.legacyTableId };
			} else if (this.legacyTableId) {
				const linked = this.accounts.linkLegacyCharacter({
					characterId: id, displayName: playerName, credential,
					tableId: this.legacyTableId, createdAt: now,
				});
				linkage = { accountId: linked.account.id, tableId: this.legacyTableId };
			}
			this.repository.create({ state, credential, ...linkage });
			return this.selection(state);
		});
	}

	createCharacterForPlatformSession(token: string, request: RPGCreateCharacterRequest): RPGCharacterSelection {
		const session = this.getInternalSession(token);
		if (!session.platformAccountId || session.role !== 'player') throw new Error('Sessão global de Player necessária');
		const account = this.accounts.repository.getAccount(session.platformAccountId);
		if (!account || account.status !== 'active') throw new Error('Conta global indisponível');
		// A conta global autentica o dono. A credencial aleatória apenas mantém registros
		// antigos compatíveis e nunca é exibida nem usada no fluxo da versão 2.
		const character = this.createCharacter({
			...request,
			playerName: account.handle,
			password: this.bytes(32).toString('base64url'),
			initialMoney: RPG_PLATFORM_INITIAL_MONEY,
		}, session.platformAccountId);
		session.characterId = character.id; this.sessions.set(this.tokenKey(token), session);
		return character;
	}

	/** Preserva o personagem e altera somente a conta que o controla dentro da mesma mesa. */
	transferCharacterOwnership(token: string, characterId: string, targetAccountId: string): RPGCharacterSelection {
		const session = this.getSession(token);
		this.requireMasterMode(token); this.requirePlatformTablePermission(token, 'characters.manage');
		if (!session.platformTableId || session.platformTableId !== this.legacyTableId) {
			throw new Error('Mesa da sessão inválida');
		}
		const member = this.accounts.repository.getMembership(session.platformTableId, targetAccountId);
		if (!member || member.status !== 'active') {
			throw new Error('O destino precisa ser um membro ativo capaz de controlar personagens');
		}
		const record = this.requireCharacter(characterId);
		if (record.tableId !== session.platformTableId) throw new Error('O personagem não pertence a esta mesa');
		if (record.accountId === member.accountId) return this.selection(record.state);
		if (this.repository.list().some(candidate => candidate.accountId === member.accountId)) {
			throw new Error('A conta de destino já possui um personagem nesta mesa');
		}
		return this.persistAtomically(() => {
			record.accountId = member.accountId; record.state.updatedAt = this.now();
			this.repository.set(record); return this.selection(record.state);
		});
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
		session.lastSeenAt = this.now();
		this.sessions.set(key, session);
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

	/** Returns only the visual roster data that another player is allowed to see. */
	listOtherPlayers(token: string): RPGPlayerRosterEntry[] {
		const session = this.getSession(token);
		if (!['player', 'master'].includes(session.role) || !['player', 'master'].includes(session.mode)) {
			throw new Error('A lista de Players não está disponível nesta visualização');
		}
		// A visualização como Player não retira esse personagem da lista do Mestre.
		const currentCharacterId = session.role === 'master' ? undefined : session.viewAsCharacterId || session.characterId;
		const onlineThreshold = this.now() - 90_000;
		const presenceByCharacter = new Map<string, 'online' | 'idle'>();
		for (const active of this.sessions.values()) {
			if (!(active.role === 'player' && active.characterId && active.expiresAt > this.now() &&
				active.lastSeenAt >= onlineThreshold)) continue;
			const current = presenceByCharacter.get(active.characterId);
			if (current !== 'online') presenceByCharacter.set(active.characterId, active.idle ? 'idle' : 'online');
		}
		const onlineCharacterIds = new Set([...this.sessions.values()].filter(active =>
			active.role === 'player' && active.characterId && active.expiresAt > this.now() &&
			active.lastSeenAt >= onlineThreshold
		).map(active => active.characterId!));
		return this.repository.list()
			.filter(record => record.state.id !== currentCharacterId)
			.map(record => ({
				...this.selection(record.state),
				...(record.accountId ? { accountId: record.accountId } : {}),
				online: onlineCharacterIds.has(record.state.id),
				presence: presenceByCharacter.get(record.state.id) ?? ('offline' as const),
				occupiedTeamSlots: Math.min(6, record.state.box.party.length + this.activeEggs(record).length),
				team: record.state.team.slice(0, 6).map(pokemon => {
					const visual = pokemon as typeof pokemon & {
						shiny?: boolean, spriteId?: string, baseSpriteId?: string,
					};
					return {
						species: String(pokemon.species || pokemon.name || 'Pokémon'),
						...(visual.shiny ? { shiny: true } : {}),
						...(visual.spriteId ? { spriteId: visual.spriteId } : {}),
						...(visual.baseSpriteId ? { baseSpriteId: visual.baseSpriteId } : {}),
					};
				}),
			}))
			.sort((a, b) => a.characterName.localeCompare(b.characterName, 'pt-BR'));
	}

	advanceCampaignTime(token: string, hours: number): RPGCampaignTimeAdvanceResult {
		this.requireMasterRole(token);
		if (hours !== 1 && hours !== 8) throw new Error('O relógio da campanha só pode avançar 1 ou 8 horas');
		return this.persistAtomically(() => this.advanceCampaignTimeTransaction(hours));
	}

	private advanceCampaignTimeTransaction(hours: 1 | 8): RPGCampaignTimeAdvanceResult {
		const milliseconds = hours * 60 * 60 * 1000;
		const now = this.now();
		const campaignStart = Date.parse(this.campaignSettings.currentDateTime);
		const records = this.repository.list();
		const recordsById = new Map(records.map(record => [record.state.id, record]));
		const changedIds = new Set<string>();
		const result: RPGCampaignTimeAdvanceResult = {
			hours, milliseconds, charactersAffected: 0,
			fossils: { advanced: 0, completed: 0 },
			trainings: { advanced: 0, completed: 0 },
			breedings: { advanced: 0, completed: 0 },
			incubations: { advanced: 0, completed: 0 },
			events: [],
		};
		const completedEvents: RPGCampaignEvent[] = [];
		const addEvent = (
			record: RPGStoredCharacter, type: RPGCampaignEvent['type'], title: string, description: string
		) => completedEvents.push({
			id: this.bytes(12).toString('base64url'), type, title, description,
			characterId: record.state.id, characterName: record.state.characterName,
			occurredAt: this.campaignSettings.currentDateTime,
		});
		for (const record of records) {
			if (RPGBoxManagement.expireTrainingRewards(record.state)) changedIds.add(record.state.id);
			if (RPGBoxManagement.expireContestHarmonizations(record.state)) changedIds.add(record.state.id);
			if (record.state.trainerSheet?.status === 'complete') {
				const sheet = record.state.trainerSheet;
				if (hours === 8) {
					sheet.talentRestCycle = (sheet.talentRestCycle || 0) + 1;
					changedIds.add(record.state.id);
				}
				const eligible = rpgTrainerLevelForXP(sheet.experience);
				if (eligible > sheet.level) {
					if (sheet.levelUpWaitingSince === undefined) {
						sheet.levelUpWaitingSince = campaignStart;
						changedIds.add(record.state.id);
					}
					if (campaignStart + milliseconds - sheet.levelUpWaitingSince >= 8 * 3_600_000 &&
						(sheet.levelUpReady || 0) < Math.min(eligible, sheet.level + 1)) {
						sheet.levelUpReady = sheet.level + 1;
						changedIds.add(record.state.id);
					}
				}
			}
			const completingTrainings = [
				...record.state.box.party,
				...record.state.box.boxes.flatMap(box => box.slots).filter((entry): entry is NonNullable<typeof entry> => !!entry),
			].map(entry => entry).filter(entry => {
				const job = entry.metadata?.evTraining;
				return job && (job.remainingMs ?? Math.max(0, (job.completesAt ?? now) - now)) <= milliseconds;
			});
			const completingFossils = (record.state.fossilLab?.projects || []).filter(project => {
				if (project.receivedAt) return false;
				const remaining = project.remainingMs ?? Math.max(0, project.completesAt - now);
				return remaining > 0 && remaining <= milliseconds;
			});
			const fossils = record.state.fossilLab ?
				RPGFossilLab.advanceTime(record.state, milliseconds, now, this.random) : { advanced: 0, completed: 0 };
			const trainings = RPGBoxManagement.advanceTime(record.state, milliseconds, now);
			for (const entry of completingTrainings) {
				addEvent(record, 'training', 'Treinamento concluído',
					`${entry.pokemon.name || entry.pokemon.species} concluiu seu treinamento.`);
			}
			for (const project of completingFossils) {
				addEvent(record, 'fossil', 'Restauração concluída',
					`O projeto de ${project.species} terminou no laboratório paleontológico.`);
			}
			const breedings = { advanced: 0, completed: 0 };
			const incubations = { advanced: 0, completed: 0 };
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
						const producedEggSpecies = project.egg.genetics.species;
						if (project.slot1.participantType === 'npc') delete project.egg;
						breedings.completed++;
						addEvent(record, 'breeding', 'Ovo produzido',
							`${project.slot1.name} e ${project.slot2.name} produziram um ovo de ${producedEggSpecies}.`);
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
					if (advanced.completed) {
						addEvent(record, 'incubation', 'Ovo pronto para chocar',
							`O ovo de ${project.egg.genetics.species} concluiu a incubação.`);
					}
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
		this.campaignSettings.currentDateTime = new Date(
			Date.parse(this.campaignSettings.currentDateTime) + milliseconds
		).toISOString();
		this.campaignSettings.trainerHelp = [];
		for (const event of completedEvents) event.occurredAt = this.campaignSettings.currentDateTime;
		this.campaignSettings.events.push(...completedEvents);
		this.campaignSettings.events = this.campaignSettings.events.slice(-200);
		result.events = structuredClone(completedEvents);
		for (const event of completedEvents) {
			this.appendTableSystemLog(event.type, event.title,
				`${event.characterName}: ${event.description}`, [event.characterId], now);
		}
		this.persistCampaignSettings();
		result.charactersAffected = changedIds.size;
		return result;
	}

	setCharacterPageAccess(
		token: string, characterId: string,
		page: 'bank' | 'bag' | 'box' | 'training' | 'center' | 'fossils' | 'nursery' | 'shops', allowed: boolean
	): RPGCharacterState {
		this.requireMasterRole(token);
		if (!['bank', 'bag', 'box', 'training', 'center', 'fossils', 'nursery', 'shops'].includes(page)) {
			throw new Error('Invalid RPG character page access');
		}
		const record = this.requireCharacter(characterId);
		record.state.pageAccess = {
			bank: record.state.pageAccess?.bank !== false,
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

	/** Bridges an authenticated global account into this table-scoped RPG world. */
	authorizePlatformSession(token: string, context: import('./account-management').RPGActiveTableContext): RPGSession {
		if (context.table.id !== this.legacyTableId) throw new Error('RPG table scope mismatch');
		const elevated = context.membership.role === 'owner' || context.membership.role === 'master';
		const expectedRole: RPGAccountRole = elevated ? 'master' : 'player';
		const character = elevated ? undefined :
			this.repository.list().find(record => record.accountId === context.account.id);
		const existing = this.sessions.get(this.tokenKey(token));
		if (existing && existing.platformAccountId === context.account.id &&
			existing.role === expectedRole) {
			existing.platformTableRole = context.membership.role;
			existing.platformTablePermissions = { ...context.membership.permissions };
			existing.platformTableId = context.table.id;
			existing.platformMembershipId = `${context.membership.tableId}:${context.membership.accountId}`;
			existing.characterId = character?.state.id;
			existing.expiresAt = context.session.expiresAt; existing.lastSeenAt = this.now();
			this.sessions.set(this.tokenKey(token), existing); return { ...structuredClone(existing), token };
		}
		const session: RPGInternalSession = {
			version: RPG_SESSION_VERSION, role: expectedRole,
			mode: elevated ? 'master' : 'player',
			characterId: character?.state.id, createdAt: context.session.createdAt,
			platformAccountId: context.account.id,
			platformTableId: context.table.id,
			platformMembershipId: `${context.membership.tableId}:${context.membership.accountId}`,
			platformTableRole: context.membership.role,
			platformTablePermissions: { ...context.membership.permissions },
			expiresAt: context.session.expiresAt, lastSeenAt: this.now(),
		};
		this.sessions.set(this.tokenKey(token), session);
		return { ...structuredClone(session), token };
	}

	getMasterNPCLibrary(token: string): Record<string, unknown> | null {
		const session = this.getSession(token);
		if (session.role !== 'master') throw new Error('RPG master session required');
		return this.masterNPCLibrary && structuredClone(this.masterNPCLibrary);
	}

	setMasterNPCLibrary(token: string, library: unknown): Record<string, unknown> {
		const session = this.getSession(token);
		if (session.role !== 'master') throw new Error('RPG master session required');
		if (!library || typeof library !== 'object' || Array.isArray(library)) throw new Error('Invalid RPG master NPC library');
		this.masterNPCLibrary = structuredClone(library as Record<string, unknown>);
		this.persistMasterNPCLibrary();
		return structuredClone(this.masterNPCLibrary);
	}

	private persistMasterNPCLibrary(): void {
		if (!this.masterNPCLibrary) return;
		if (this.mysqlPersistence) {
			this.mysqlPersistence.upsertSingleton('rpg_master_npc_library', this.masterNPCLibrary, this.legacyTableId);
		} else if (this.masterNPCLibraryFile) {
			mkdirSync(dirname(this.masterNPCLibraryFile), { recursive: true });
			const temporary = this.masterNPCLibraryFile + '.tmp';
			writeFileSync(temporary, JSON.stringify(this.masterNPCLibrary, null, '\t') + '\n', 'utf8');
			renameSync(temporary, this.masterNPCLibraryFile);
		}
	}

	healMasterNPC(token: string, npcId: string, pokemonIndex?: number): Record<string, unknown> {
		this.requireMasterRole(token);
		const npc = (Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
			.find(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === npcId) as
			Record<string, unknown> | undefined;
		if (!npc) throw new Error('NPC não encontrado');
		const team = Array.isArray(npc.team) ? npc.team : String(npc.teams || '').split(/[,;\n]+/)
			.map(species => species.trim()).filter(Boolean).map(species => ({ species, name: species, level: 50, moves: [] }));
		if (pokemonIndex !== undefined && (!Number.isInteger(pokemonIndex) || pokemonIndex < 0 ||
			pokemonIndex >= team.length)) throw new Error('Pokémon do NPC não encontrado');
		if (!Array.isArray(npc.team)) npc.team = team;
		for (const [index, member] of team.entries()) {
			if (pokemonIndex !== undefined && index !== pokemonIndex) continue;
			if (!member || typeof member !== 'object') continue;
			const pokemon = member as Record<string, unknown>;
			const species = Dex.mod('gen9').species.get(String(pokemon.species || pokemon.name || ''));
			const level = Math.max(1, Math.min(100, Number(pokemon.level) || 1));
			const ivs = pokemon.ivs as Record<string, number> | undefined;
			const evs = pokemon.evs as Record<string, number> | undefined;
			const maximum = toID(species.name) === 'shedinja' ? 1 :
				Math.floor((2 * (species.baseStats?.hp || 50) + (ivs?.hp || 0) +
					Math.floor((evs?.hp || 0) / 4)) * level / 100) + level + 10;
			pokemon.rpg = { ...(pokemon.rpg && typeof pokemon.rpg === 'object' ? pokemon.rpg : {}),
				hp: maximum, status: '', sleepTurns: 0,
				pp: (Array.isArray(pokemon.moves) ? pokemon.moves : []).map(move =>
					Dex.mod('gen9').moves.get(String(move)).pp || 1),
			};
		}
		this.persistMasterNPCLibrary();
		return structuredClone(npc);
	}

	listTournaments(token: string): RPGTournament[] {
		const session = this.getSession(token);
		this.tournaments.repairOrphanedMatches(
			new Set(this.battleSessions.list().filter(entry => !['ended', 'cancelled'].includes(entry.status)).map(entry => entry.id)),
			new Set(this.contestSessions.list().filter(entry => !['ended', 'cancelled'].includes(entry.status)).map(entry => entry.id))
		);
		const tournaments = this.tournaments.list();
		if (session.role === 'master') return tournaments;
		return tournaments.filter(tournament => tournament.participants.some(participant => participant.characterId === session.characterId));
	}
	getTournament(token: string, id: string): RPGTournament {
		const tournament = this.tournaments.get(id);
		if (!this.listTournaments(token).some(entry => entry.id === tournament.id)) throw new Error('Torneio indisponível');
		return tournament;
	}
	createTournament(token: string, input: Parameters<RPGTournamentSessionService['create']>[0]): RPGTournament {
		this.requireMasterMode(token); return this.tournaments.create(input);
	}
	startTournament(token: string, id: string): RPGTournament { this.requireMasterMode(token); return this.tournaments.start(id); }
	setTournamentRoster(token: string, id: string, pokemonIds: string[]): RPGTournament {
		const session = this.getSession(token); if (!session.characterId) throw new Error('Sessão de Player necessária');
		const record = this.requireCharacter(session.characterId);
		const available = new Set(record.state.box.party.map(entry => entry.pokemonId));
		if (!Array.isArray(pokemonIds) || pokemonIds.some(pokemonId => !available.has(pokemonId))) throw new Error('Escolha apenas Pokémon da sua equipe atual');
		return this.tournaments.setRoster(id, session.characterId, pokemonIds);
	}
	reportTournamentMatch(token: string, id: string, matchId: string, winnerId: string): RPGTournament {
		this.requireMasterMode(token); return this.tournaments.report(id, matchId, winnerId);
	}
	launchTournamentMatch(token: string, id: string, matchId: string, npcSelections: Record<string, number[]> = {}): { tournament: RPGTournament, sessionId: string, activity: string } {
		this.requireMasterMode(token);
		const tournament = this.tournaments.get(id);
		const match = tournament.matches.find(entry => entry.id === matchId);
		if (!match || match.status !== 'ready' || match.automatic) throw new Error('Confronto indisponível');
		const sideAIds = match.participant1Ids || [match.participant1Id];
		const sideBIds = match.participant2Ids || [match.participant2Id];
		const entrants = [...sideAIds, ...sideBIds].map(participantId => tournament.participants.find(entry => entry.id === participantId)!);
		const temporarySet = (participant: typeof entrants[number]): PokemonSet => {
			const speciesPool = Dex.mod('gen9').species.all().filter(species => species.exists && species.num > 0 && !species.isNonstandard && !species.forme);
			const species = speciesPool[Math.floor(this.random() * speciesPool.length)] || Dex.mod('gen9').species.get('Eevee');
			return { name: species.name, species: species.name, level: Math.max(1, Math.min(100, Math.round(participant.strength || 50))), ability: species.abilities[0], nature: 'Hardy', gender: '', item: '', moves: ['tackle'], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } };
		};
		const pokemonLimit = Math.max(1, Math.min(6, Number(tournament.conditions.pokemonLimit) || 1));
		const battlePokemonLimit = tournament.activity === 'battle' ? Math.max(1, Math.min(pokemonLimit, Number(tournament.conditions.battlePokemonLimit) || pokemonLimit)) : pokemonLimit;
		const rosterIndexes = (participant: typeof entrants[number]) => {
			if (!participant.characterId || !participant.rosterPokemonIds?.length) return [];
			const record = this.requireCharacter(participant.characterId);
			const indexes = participant.rosterPokemonIds.map(pokemonId => record.state.box.party.findIndex(entry => entry.pokemonId === pokemonId));
			if (indexes.some(index => index < 0)) throw new Error(`${participant.name} alterou a equipe inscrita no torneio`);
			return indexes;
		};
		const pokemon = (participant: typeof entrants[number]) => (participant.pokemon?.length ? participant.pokemon.slice(0, pokemonLimit) : [temporarySet(participant)]).map(storedSet => {
			const set = structuredClone(storedSet as PokemonSet);
			set.rpg = { ...set.rpg, hp: undefined, pp: undefined, status: '', sleepTurns: undefined, item: set.item || '' };
			return { set };
		});
		const selectedNPCPokemon = (participant: typeof entrants[number]) => {
			const available = pokemon(participant); const indexes = Array.isArray(npcSelections[participant.id]) ? npcSelections[participant.id] : [];
			if (indexes.length !== battlePokemonLimit || new Set(indexes).size !== indexes.length || indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= available.length)) throw new Error(`Escolha exatamente ${battlePokemonLimit} Pokémon de ${participant.name}`);
			return indexes.map(index => available[index]);
		};
		let sessionId: string;
		if (tournament.activity === 'battle') {
			let session = this.battleSessions.create({ name: `${tournament.name} · Rodada ${match.round}` }); sessionId = session.id;
			session = this.battleSessions.update(sessionId, { format: tournament.format as import('./battle-session').RPGBattleFormat, opponentType: entrants.some(entry => entry.type === 'npc') ? 'npc' : 'player', participants: entrants.map((entry, index) => { const registeredIndexes = entry.type === 'player' ? rosterIndexes(entry) : []; return { id: `${entry.id}-${index}`, team: index < sideAIds.length ? 'A' : 'B', kind: entry.type === 'player' ? 'player' : 'npc', characterId: entry.characterId, avatar: entry.avatar, displayName: entry.name, npcRole: entry.type === 'npc' ? 'generic' : undefined, selectionLimit: battlePokemonLimit, allowedTeamIndexes: entry.type === 'player' ? registeredIndexes : undefined, pokemon: entry.type === 'player' ? registeredIndexes.slice(0, battlePokemonLimit).map(teamIndex => ({ teamIndex })) : selectedNPCPokemon(entry) }; }), conditions: { ...tournament.conditions, weather: { id: tournament.conditions.weather || '', duration: tournament.conditions.weatherDuration || 'temporary', turns: 5 }, terrain: { id: tournament.conditions.terrain || '', duration: tournament.conditions.terrainDuration || 'temporary', turns: 5 } } as never, rules: { ...(tournament.conditions.rules as object || {}), canFlee: false, playersChoosePokemon: false } });
			this.battleSessions.invite(session.id);
		} else {
			let session = this.contestSessions.create({ name: `${tournament.name} · Rodada ${match.round}` }); sessionId = session.id;
			const presentationSize = tournament.format === 'trio' ? 3 : tournament.format === 'duo' ? 2 : 1;
			session = this.contestSessions.update(sessionId, { mode: tournament.format as import('./contest-session').RPGContestMode, category: (tournament.conditions.category || 'beauty') as import('./contest-session').RPGContestCategory, rank: (tournament.conditions.rank || 'normal') as import('./contest-session').RPGContestRank, scenario: { weather: String(tournament.conditions.weather || '').replace(/day$/, '') as never, terrain: String(tournament.conditions.terrain || '').replace(/terrain$/, '') as never }, participants: entrants.map(entry => ({ id: entry.id, kind: entry.type === 'player' ? 'player' : 'npc', characterId: entry.characterId, avatar: entry.avatar, displayName: entry.name, ...(entry.type === 'player' ? { allowedTeamIndexes: rosterIndexes(entry) } : { pokemonTeam: pokemon(entry).slice(0, presentationSize) }) })) as never });
			this.contestSessions.invite(session.id);
		}
		return { tournament: this.tournaments.link(id, matchId, sessionId), sessionId, activity: tournament.activity };
	}
	cancelTournament(token: string, id: string): RPGTournament { this.requireMasterMode(token); return this.tournaments.cancel(id); }

	getPlayerDocuments(token: string): Record<string, unknown> | null {
		const characterId = this.playerDocumentCharacterId(token);
		return this.playerDocuments[characterId] ? structuredClone(this.playerDocuments[characterId]) : null;
	}

	setPlayerDocuments(token: string, library: unknown): Record<string, unknown> {
		const characterId = this.playerDocumentCharacterId(token);
		if (!library || typeof library !== 'object' || Array.isArray(library)) throw new Error('Invalid RPG player documents');
		this.playerDocuments[characterId] = structuredClone(library as Record<string, unknown>);
		if (this.mysqlPersistence) {
			this.mysqlPersistence.upsertJSON('rpg_player_documents', 'character_id', characterId,
				'state', this.playerDocuments[characterId], {}, this.legacyTableId);
		} else if (this.playerDocumentsFile) {
			mkdirSync(dirname(this.playerDocumentsFile), { recursive: true });
			const temporary = this.playerDocumentsFile + '.tmp';
			writeFileSync(temporary, JSON.stringify(this.playerDocuments, null, '\t') + '\n', 'utf8');
			renameSync(temporary, this.playerDocumentsFile);
		}
		return structuredClone(this.playerDocuments[characterId]);
	}

	getCampaignSettings(token: string): {
		name: string, currentDateTime: string, quickNotes: string, sceneNpcIds: string[],
		sceneNpcRevealed: Record<string, number[]>,
		onlinePlayers: number, onlinePlayerNames: string[],
		onlinePlayerAreas: { characterId: string, nick: string, characterName: string, avatar: string, area: string }[],
	} {
		this.requireMasterRole(token);
		const onlineCharacterIds = new Set<string>();
		const onlineThreshold = this.now() - 90_000;
		for (const session of this.sessions.values()) {
			if (session.role === 'player' && session.characterId && session.expiresAt > this.now() &&
				session.lastSeenAt >= onlineThreshold) {
				onlineCharacterIds.add(session.characterId);
			}
		}
		const onlinePlayerNames = [...onlineCharacterIds].map(id => this.repository.get(id)?.state.playerName || id)
			.sort((a, b) => a.localeCompare(b, 'pt-BR'));
		const onlinePlayerAreas = [...this.sessions.values()].filter(session =>
			session.role === 'player' && session.characterId && onlineCharacterIds.has(session.characterId) && session.activeArea
		).map(session => {
			const state = this.repository.get(session.characterId!)?.state;
			return state ? {
				characterId: state.id, nick: state.playerName, characterName: state.characterName,
				avatar: state.avatar, area: session.activeArea!,
			} : null;
		}).filter((entry): entry is NonNullable<typeof entry> => !!entry)
			.filter((entry, index, entries) => entries.findIndex(other => other.characterId === entry.characterId) === index);
		return {
			...structuredClone(this.campaignSettings), onlinePlayers: onlineCharacterIds.size,
			onlinePlayerNames, onlinePlayerAreas,
		};
	}

	getCampaignClock(token: string): { currentDateTime: string } {
		this.getSession(token);
		return { currentDateTime: this.campaignSettings.currentDateTime };
	}

	updatePlayerPresence(token: string, area: unknown, idle: unknown): {
		online: boolean, idle: boolean, area: string,
	} {
		const key = this.tokenKey(token);
		const publicSession = this.getSession(token);
		if (publicSession.role !== 'player') return { online: false, idle: false, area: '' };
		const allowedAreas = new Set(['center', 'fossils', 'nursery', 'shops', 'box']);
		const activeArea = typeof area === 'string' && allowedAreas.has(area) ? area : '';
		const session = this.sessions.get(key)!;
		session.activeArea = activeArea;
		session.idle = idle === true;
		this.sessions.set(key, session);
		return { online: true, idle: session.idle, area: activeArea };
	}

	setCampaignSettings(token: string, input: unknown): { name: string, currentDateTime: string } {
		this.requireMasterRole(token);
		this.requirePlatformTablePermission(token, 'campaign.configure');
		if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração de campanha inválida');
		const value = input as { name?: unknown, currentDateTime?: unknown };
		const name = String(value.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
		const date = new Date(String(value.currentDateTime || ''));
		if (!name) throw new Error('Informe o nome da campanha');
		if (!Number.isFinite(date.getTime())) throw new Error('Informe uma data e hora válidas');
		this.campaignSettings = { ...this.campaignSettings, name, currentDateTime: date.toISOString() };
		this.persistCampaignSettings();
		return structuredClone(this.campaignSettings);
	}

	setCampaignQuickNotes(token: string, notes: unknown): { quickNotes: string } {
		this.requireMasterRole(token);
		if (typeof notes !== 'string') throw new Error('Anotação rápida inválida');
		this.campaignSettings.quickNotes = notes.slice(0, 50_000);
		this.persistCampaignSettings();
		return { quickNotes: this.campaignSettings.quickNotes };
	}

	setCampaignSceneNPCs(token: string, ids: unknown): { sceneNpcIds: string[] } {
		this.requireMasterRole(token);
		if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) {
			throw new Error('Lista de NPCs em cena inválida');
		}
		const available = new Set((Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
			.map(npc => npc && typeof npc === 'object' ? (npc as Record<string, unknown>).id : undefined)
			.filter((id): id is string => typeof id === 'string'));
		const unique = [...new Set(ids)];
		if (unique.some(id => !available.has(id))) throw new Error('NPC não encontrado nas anotações do Mestre');
		this.campaignSettings.sceneNpcIds = unique;
		this.campaignSettings.sceneNpcRevealed = Object.fromEntries(Object.entries(this.campaignSettings.sceneNpcRevealed)
			.filter(([id]) => unique.includes(id)));
		this.persistCampaignSettings();
		return { sceneNpcIds: [...unique] };
	}

	getCampaignSceneNPCs(token: string) {
		this.getSession(token);
		const library = Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [];
		const npcs = this.campaignSettings.sceneNpcIds.flatMap(id => {
			const npc = library.find(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === id);
			if (!npc || typeof npc !== 'object') return [];
			const value = npc as Record<string, unknown>;
			const team = Array.isArray(value.team) ? value.team : String(value.teams || '').split(/[,;\n]+/)
				.map(species => ({ species: species.trim() })).filter(member => member.species);
			return [{ id, name: String(value.name || 'NPC'), sprite: String(value.sprite || ''),
				pokemon: team.slice(0, 6).map((member, index) => {
					if (!this.campaignSettings.sceneNpcRevealed[id]?.includes(index)) return { revealed: false };
					const pokemon = member && typeof member === 'object' ? member as Record<string, unknown> : {};
					return { revealed: true, species: String(pokemon.species || ''),
						name: String(pokemon.name || pokemon.species || ''), shiny: pokemon.shiny === true };
				}),
			}];
		});
		return { npcs };
	}

	setCampaignScenePokemonReveal(token: string, npcId: unknown, index: unknown, revealed: unknown) {
		this.requireMasterRole(token);
		if (typeof npcId !== 'string' || !this.campaignSettings.sceneNpcIds.includes(npcId) ||
			!Number.isInteger(index) || (index as number) < 0 || (index as number) >= 6 || typeof revealed !== 'boolean') {
			throw new Error('Pokémon em cena inválido');
		}
		const npc = (Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
			.find(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === npcId) as
			Record<string, unknown> | undefined;
		const team = Array.isArray(npc?.team) ? npc.team : String(npc?.teams || '').split(/[,;\n]+/).filter(Boolean);
		if (!team[index as number]) throw new Error('Pokémon não encontrado neste NPC');
		const slots = new Set(this.campaignSettings.sceneNpcRevealed[npcId] || []);
		if (revealed) slots.add(index as number); else slots.delete(index as number);
		this.campaignSettings.sceneNpcRevealed[npcId] = [...slots].sort((a, b) => a - b);
		this.persistCampaignSettings();
		return { sceneNpcRevealed: structuredClone(this.campaignSettings.sceneNpcRevealed) };
	}

	dismissCampaignEvent(token: string, eventId: unknown): { events: RPGCampaignEvent[] } {
		this.requireMasterRole(token);
		if (typeof eventId !== 'string' || !eventId) throw new Error('Evento inválido');
		this.campaignSettings.events = this.campaignSettings.events.filter(event => event.id !== eventId);
		this.persistCampaignSettings();
		return { events: structuredClone(this.campaignSettings.events) };
	}

	private supplierCatalog() {
		const pokemonItems = RPGItems.list().filter(item => item.source !== 'custom' &&
			Number.isSafeInteger(item.price?.buy) && (item.price?.buy || 0) > 0 &&
			!['key', 'custom'].includes(item.category) && item.id !== 'masterball' &&
			!item.tags?.some(tag => ['mission', 'fossil', 'megastone', 'unique', 'restricted'].includes(tag)))
			.map(item => ({ id: item.id, name: item.name, category: item.category,
				kind: 'pokemon' as const, price: item.price!.buy!, icon: getRPGItemIconPath(item.id),
				sprite: Number.isInteger(Dex.items.get(item.id).spritenum) ? Dex.items.get(item.id).spritenum! : null,
				tags: item.tags || [] }));
		const equipment = Object.values(RPG_EQUIPMENT_CATALOG).filter(item => item.rarity === 'common' &&
			item.legality === 'free' && !item.vehicle && item.price > 0)
			.map(item => ({ id: item.id, name: item.name, category: 'trainer-equipment',
				kind: 'equipment' as const, price: item.price, icon: null, sprite: null, tags: ['trainer-equipment'] }));
		return [...pokemonItems, ...equipment].map(item => ({ ...item,
			orderPrice: Math.ceil(item.price * 1.2) }));
	}

	private parallelMarketCatalog() {
		const pokemonItems = RPGItems.list().filter(item => item.source !== 'custom' &&
			Number.isSafeInteger(item.price?.buy) && (item.price?.buy || 0) > 0 &&
			!['key', 'custom'].includes(item.category) && item.id !== 'masterball' &&
			!item.tags?.some(tag => ['mission', 'fossil', 'megastone', 'unique'].includes(tag)))
			.map(item => ({ id: item.id, name: item.name, category: item.category,
				kind: 'pokemon' as const, price: item.price!.buy!, icon: getRPGItemIconPath(item.id),
				sprite: Number.isInteger(Dex.items.get(item.id).spritenum) ? Dex.items.get(item.id).spritenum! : null,
				tags: item.tags || [] }));
		const equipment = Object.values(RPG_EQUIPMENT_CATALOG).filter(item => item.price > 0 && !item.vehicle)
			.map(item => ({ id: item.id, name: item.name, category: 'trainer-equipment',
				kind: 'equipment' as const, price: item.price, icon: null, sprite: null,
				tags: ['trainer-equipment'] }));
		return [...pokemonItems, ...equipment];
	}

	getParallelMarketCatalog(token: string) {
		const session = this.getSession(token);
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		const record = characterId ? this.requireCharacter(toID(characterId)) : null;
		if (session.mode !== 'player' || !session.platformTableId || record?.tableId !== session.platformTableId ||
			record.state.trainerSheet?.status !== 'complete' ||
			!record.state.trainerSheet.talents.class.includes('ladino:mercado-paralelo')) {
			throw new Error('Mercado Paralelo indisponível');
		}
		return { items: this.parallelMarketCatalog() };
	}

	requestParallelMarketOrder(token: string, input: { requestId: string, itemId: string,
		itemKind: 'pokemon' | 'equipment', quantity: number, }) {
		const session = this.getSession(token);
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (session.mode !== 'player' || !session.platformTableId || !characterId) throw new Error('Entre como jogador em uma mesa');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId || record.state.trainerSheet?.status !== 'complete' ||
			!record.state.trainerSheet.talents.class.includes('ladino:mercado-paralelo')) {
			throw new Error('Mercado Paralelo indisponível');
		}
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('Identificador da encomenda inválido');
		if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) throw new Error('Quantidade inválida');
		const prior = this.campaignSettings.supplierOrders.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.source !== 'parallel-market' || prior.characterId !== record.state.id ||
				prior.itemId !== input.itemId || prior.itemKind !== input.itemKind || prior.quantity !== input.quantity) {
				throw new Error('Identificador da encomenda já utilizado');
			}
			return { order: structuredClone(prior), repeated: true };
		}
		if (this.campaignSettings.supplierOrders.some(entry => entry.source === 'parallel-market' &&
			entry.characterId === record.state.id && entry.status === 'pending')) {
			throw new Error('Já existe um pedido do Mercado Paralelo aguardando avaliação');
		}
		const item = this.parallelMarketCatalog().find(entry => entry.id === input.itemId && entry.kind === input.itemKind);
		if (!item) throw new Error('Item indisponível para o Mercado Paralelo');
		const price = item.price * input.quantity;
		if (!Number.isSafeInteger(price) || record.state.money < price) throw new Error('Pokécoins insuficientes para a compra');
		const order: RPGSupplierOrder = { id: input.requestId, characterId: record.state.id,
			characterName: record.state.characterName, itemId: item.id, itemName: item.name,
			itemKind: item.kind, price, quantity: input.quantity, source: 'parallel-market',
			icon: item.icon, sprite: item.sprite, requestedAt: this.campaignSettings.currentDateTime,
			status: 'pending' };
		this.campaignSettings.supplierOrders.push(order);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.supplierOrders.pop(); throw error;
		}
		return { order: structuredClone(order), repeated: false };
	}

	getSupplierCatalog(token: string) {
		const session = this.getSession(token);
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		const record = characterId ? this.requireCharacter(toID(characterId)) : null;
		const sheet = record?.state.trainerSheet;
		if (session.mode !== 'player' || !session.platformTableId || record?.tableId !== session.platformTableId ||
			sheet?.status !== 'complete' ||
			sheet.classId !== 'diplomata' || !sheet.talents.class.includes('diplomata:canal-oficial')) {
			throw new Error('Rede de Fornecedores indisponível');
		}
		return { items: this.supplierCatalog() };
	}

	requestSupplierOrder(token: string, input: { requestId: string, itemId: string, itemKind: 'pokemon' | 'equipment' }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (record.tableId !== session.platformTableId || sheet?.status !== 'complete' ||
			sheet.classId !== 'diplomata' || !sheet.talents.class.includes('diplomata:canal-oficial')) {
			throw new Error('Rede de Fornecedores indisponível');
		}
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('Identificador da encomenda inválido');
		const prior = this.campaignSettings.supplierOrders.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.characterId !== record.state.id || prior.itemId !== input.itemId ||
				prior.itemKind !== input.itemKind) throw new Error('Identificador da encomenda já utilizado');
			return { order: structuredClone(prior), repeated: true };
		}
		if (this.campaignSettings.supplierOrders.some(entry => entry.characterId === record.state.id &&
			entry.status === 'pending')) throw new Error('Já existe uma encomenda aguardando avaliação');
		const item = this.supplierCatalog().find(entry => entry.id === input.itemId && entry.kind === input.itemKind);
		if (!item) throw new Error('Item indisponível para encomenda');
		const order: RPGSupplierOrder = { id: input.requestId, characterId: record.state.id,
			characterName: record.state.characterName, itemId: item.id, itemName: item.name,
			itemKind: item.kind, price: item.orderPrice, icon: item.icon, sprite: item.sprite,
			requestedAt: this.campaignSettings.currentDateTime,
			status: 'pending' };
		this.campaignSettings.supplierOrders.push(order);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.supplierOrders.pop(); throw error;
		}
		return { order: structuredClone(order), repeated: false };
	}

	decideSupplierOrder(token: string, id: string, accepted: boolean) {
		this.requireMasterRole(token);
		const order = this.campaignSettings.supplierOrders.find(entry => entry.id === id);
		if (!order || typeof accepted !== 'boolean') throw new Error('Encomenda ou decisão inválida');
		if (order.status !== 'pending') return { order: structuredClone(order), repeated: true };
		const record = this.requireCharacter(order.characterId);
		const previous = structuredClone(record);
		const working = structuredClone(record);
		const previousOrder = structuredClone(order);
		const active = !!record.tableId && !!record.accountId &&
			this.accounts.repository.getMembership(record.tableId, record.accountId)?.status === 'active';
		const requiredTalent = order.source === 'parallel-market' ? 'ladino:mercado-paralelo' : 'diplomata:canal-oficial';
		if (accepted && (!active || record.state.trainerSheet?.status !== 'complete' ||
			!record.state.trainerSheet.talents.class.includes(requiredTalent))) {
			throw new Error('Treinador indisponível para receber a encomenda');
		}
		const insufficient = accepted && record.state.money < order.price;
		order.status = accepted && !insufficient ? 'accepted' : 'rejected';
		order.decidedAt = this.campaignSettings.currentDateTime;
		if (insufficient) order.reason = 'Pokécoins insuficientes; encomenda cancelada.';
		if (order.status === 'accepted') {
			const item = (order.source === 'parallel-market' ? this.parallelMarketCatalog() : this.supplierCatalog())
				.find(entry => entry.id === order.itemId && entry.kind === order.itemKind);
			if (!item) {
				Object.assign(order, previousOrder); throw new Error('Item da encomenda não está mais disponível; recuse o pedido');
			}
			try {
				if (order.itemKind === 'pokemon') {
					working.state.inventory = { ...working.state.inventory, bag: RPGBagSystem.add(
						working.state.inventory.bag, order.itemId, order.quantity || 1, working.state.inventory.bag.revision).bag };
				} else {
					const inventory = this.ensureTrainerInventory(working);
					const definition = rpgEquipment(order.itemId);
					const stack = inventory.items.find(entry => entry.itemId === definition.id && entry.location === 'bag' &&
						!entry.equipped && entry.quantity < definition.stackLimit && entry.charges === undefined);
					let remaining = order.quantity || 1;
					if (stack) {
						const added = Math.min(remaining, definition.stackLimit - stack.quantity);
						stack.quantity += added; remaining -= added;
					}
					while (remaining) {
						const added = Math.min(remaining, definition.stackLimit);
						inventory.items.push({ id: secureRandomBytes(12).toString('hex'), itemId: definition.id,
							quantity: added, location: 'bag', equipped: false,
							...(definition.maxCharges !== undefined ? { charges: definition.maxCharges } : {}) });
						remaining -= added;
					}
					inventory.revision++;
				}
				working.state.money -= order.price;
				working.state.updatedAt = this.now();
				this.validateTrainerInventory(working);
			} catch (error) { Object.assign(order, previousOrder); throw error; }
		}
		try {
			this.persistAtomically(() => {
				if (order.status === 'accepted') this.repository.set(working);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(order, previousOrder);
			this.repository.set(previous);
			throw error;
		}
		return { order: structuredClone(order), money: working.state.money };
	}

	requestTrainerConfidant(token: string, input: { requestId: string, confidantName: string }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.classId !== 'encantador' ||
			!sheet.talents.class.includes('encantador:confidente')) throw new Error('Confidente indisponível');
		if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) {
			throw new Error('Identificador de confidente inválido');
		}
		const confidantName = typeof input.confidantName === 'string' ? input.confidantName.trim() : '';
		if (confidantName.length < 2 || confidantName.length > 80) {
			throw new Error('Informe o nome do confidente com 2 a 80 caracteres');
		}
		const prior = this.campaignSettings.confidantRequests.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.characterId !== record.state.id || prior.confidantName !== confidantName) {
				throw new Error('Identificador de confidente já utilizado');
			}
			return { request: structuredClone(prior), repeated: true };
		}
		if (sheet.confidantName) throw new Error('Este treinador já possui um confidente confirmado');
		if (this.campaignSettings.confidantRequests.some(entry => entry.characterId === record.state.id &&
			entry.status === 'pending')) throw new Error('Já existe um confidente aguardando avaliação');
		// Esta rolagem usa somente o bônus normal da perícia; talentos, ajuda e vantagem não são aplicados.
		const result = rollRPGTrainerSkillCheck(sheet, 'persuasao', undefined, { dc: 0 }, this.random);
		const request: RPGConfidantRequest = { id: input.requestId, characterId: record.state.id,
			characterName: record.state.characterName, confidantName,
			submittedAt: this.campaignSettings.currentDateTime,
			roll: { natural: result.natural, bonus: result.bonus, total: result.total }, status: 'pending' };
		this.campaignSettings.confidantRequests.push(request);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.confidantRequests.pop(); throw error;
		}
		return { request: structuredClone(request), repeated: false };
	}

	requestTrainerForage(token: string, requestId: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId || record.state.trainerSheet?.status !== 'complete' ||
			!record.state.trainerSheet.talents.class.includes('explorador:forrageador-eficiente')) {
			throw new Error('Forrageador Eficiente indisponível');
		}
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error('Identificador de forrageio inválido');
		const prior = this.campaignSettings.forageRequests.find(entry => entry.id === requestId);
		if (prior) {
			if (prior.characterId !== record.state.id) throw new Error('Identificador de forrageio já utilizado');
			return { request: structuredClone(prior), repeated: true };
		}
		if (this.campaignSettings.forageRequests.some(entry => entry.characterId === record.state.id &&
			entry.status === 'pending')) throw new Error('Já existe um forrageio aguardando avaliação');
		const request: RPGForageRequest = { id: requestId, characterId: record.state.id,
			characterName: record.state.characterName, submittedAt: this.campaignSettings.currentDateTime,
			foodQuantity: rpgTrainerProficiency(record.state.trainerSheet.level), status: 'pending' };
		this.campaignSettings.forageRequests.push(request);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.forageRequests.pop(); throw error;
		}
		return { request: structuredClone(request), repeated: false };
	}

	decideTrainerForage(token: string, id: string, accepted: boolean) {
		this.requireMasterRole(token);
		const session = this.getSession(token);
		const request = this.campaignSettings.forageRequests.find(entry => entry.id === id);
		if (!request || typeof accepted !== 'boolean') throw new Error('Pedido de forrageio ou decisão inválidos');
		if (request.status !== 'pending') return { request: structuredClone(request), repeated: true };
		const record = this.requireCharacter(request.characterId);
		if (session.platformTableId && record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		if (accepted && (record.state.trainerSheet?.status !== 'complete' ||
			!record.state.trainerSheet.talents.class.includes('explorador:forrageador-eficiente'))) {
			throw new Error('Explorador indisponível para receber os alimentos');
		}
		const previousRequest = structuredClone(request);
		const previousRecord = structuredClone(record);
		const working = structuredClone(record);
		if (accepted) {
			const inventory = this.ensureTrainerInventory(working);
			const stackLimit = rpgEquipment('alimento').stackLimit;
			let remaining = request.foodQuantity;
			for (const stack of inventory.items.filter(item => item.itemId === 'alimento' &&
				item.location === 'bag' && !item.equipped && item.quantity < stackLimit)) {
				const added = Math.min(remaining, stackLimit - stack.quantity);
				stack.quantity += added; remaining -= added;
				if (!remaining) break;
			}
			while (remaining) {
				const quantity = Math.min(remaining, stackLimit);
				inventory.items.push({ id: secureRandomBytes(12).toString('hex'), itemId: 'alimento',
					quantity, location: 'bag', equipped: false });
				remaining -= quantity;
			}
			inventory.revision++;
			working.state.updatedAt = this.now();
			this.validateTrainerInventory(working);
		}
		request.status = accepted ? 'accepted' : 'rejected';
		request.decidedAt = this.campaignSettings.currentDateTime;
		try {
			this.persistAtomically(() => {
				if (accepted) this.repository.set(working);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(request, previousRequest);
			if (accepted) this.repository.set(previousRecord);
			throw error;
		}
		return { request: structuredClone(request), repeated: false };
	}

	decideTrainerConfidant(token: string, id: string, accepted: boolean) {
		this.requireMasterRole(token);
		const session = this.getSession(token);
		const request = this.campaignSettings.confidantRequests.find(entry => entry.id === id);
		if (!request || request.status !== 'pending' || typeof accepted !== 'boolean') {
			throw new Error('Pedido de confidente ou decisão inválidos');
		}
		const record = this.requireCharacter(request.characterId);
		if (session.platformTableId && record.tableId !== session.platformTableId) {
			throw new Error('Personagem fora da mesa atual');
		}
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('encantador:confidente') ||
			accepted && sheet.confidantName) throw new Error('Confidente indisponível');
		const previousRecord = structuredClone(record);
		const previousRequest = structuredClone(request);
		request.status = accepted ? 'accepted' : 'rejected';
		request.decidedAt = this.campaignSettings.currentDateTime;
		if (accepted) {
			sheet.confidantName = request.confidantName;
			record.state.updatedAt = this.now();
		}
		try {
			this.persistAtomically(() => {
				if (accepted) this.repository.set(record);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(request, previousRequest);
			if (accepted) this.repository.set(previousRecord);
			throw error;
		}
		return { request: structuredClone(request), confidantName: sheet.confidantName || null };
	}

	requestTrainerTrueBond(token: string, input: { requestId: string, npcName: string }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.talents.apex !== 'encantador:laco-verdadeiro') {
			throw new Error('Laço Verdadeiro indisponível');
		}
		if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) {
			throw new Error('Identificador de Laço Verdadeiro inválido');
		}
		const npcName = typeof input.npcName === 'string' ? input.npcName.trim() : '';
		if (npcName.length < 2 || npcName.length > 80) throw new Error('Informe o nome do NPC com 2 a 80 caracteres');
		const prior = this.campaignSettings.trueBondRequests.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.characterId !== record.state.id || prior.npcName !== npcName) {
				throw new Error('Identificador de Laço Verdadeiro já utilizado');
			}
			return { request: structuredClone(prior), repeated: true };
		}
		if (sheet.trueBondNpcName) throw new Error('Este treinador já possui um Laço Verdadeiro');
		if (this.campaignSettings.trueBondRequests.some(entry => entry.characterId === record.state.id &&
			entry.status === 'pending')) throw new Error('Já existe um Laço Verdadeiro aguardando avaliação');
		const request: RPGTrueBondRequest = { id: input.requestId, characterId: record.state.id,
			characterName: record.state.characterName, npcName,
			submittedAt: this.campaignSettings.currentDateTime, status: 'pending' };
		this.campaignSettings.trueBondRequests.push(request);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.trueBondRequests.pop(); throw error;
		}
		return { request: structuredClone(request), repeated: false };
	}

	decideTrainerTrueBond(token: string, id: string, accepted: boolean) {
		this.requireMasterRole(token);
		const session = this.getSession(token);
		const request = this.campaignSettings.trueBondRequests.find(entry => entry.id === id);
		if (!request || request.status !== 'pending' || typeof accepted !== 'boolean') {
			throw new Error('Pedido de Laço Verdadeiro ou decisão inválidos');
		}
		const record = this.requireCharacter(request.characterId);
		if (session.platformTableId && record.tableId !== session.platformTableId) {
			throw new Error('Personagem fora da mesa atual');
		}
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.talents.apex !== 'encantador:laco-verdadeiro' ||
			accepted && sheet.trueBondNpcName) throw new Error('Laço Verdadeiro indisponível');
		const previousRecord = structuredClone(record);
		const previousRequest = structuredClone(request);
		request.status = accepted ? 'accepted' : 'rejected';
		request.decidedAt = this.campaignSettings.currentDateTime;
		if (accepted) {
			sheet.trueBondNpcName = request.npcName;
			record.state.updatedAt = this.now();
		}
		try {
			this.persistAtomically(() => {
				if (accepted) this.repository.set(record);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(request, previousRequest);
			if (accepted) this.repository.set(previousRecord);
			throw error;
		}
		return { request: structuredClone(request), npcName: sheet.trueBondNpcName || null };
	}

	removeTrainerTrueBond(token: string) {
		const session = this.getSession(token);
		if (session.role !== 'master' || session.mode !== 'player' || !session.viewAsCharacterId ||
			!session.platformTableId) throw new Error('Apenas o Mestre visualizando o jogador pode remover o Laço Verdadeiro');
		const record = this.requireCharacter(toID(session.viewAsCharacterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.talents.apex !== 'encantador:laco-verdadeiro' ||
			!sheet.trueBondNpcName) throw new Error('Nenhum Laço Verdadeiro para remover');
		const previousRecord = structuredClone(record);
		const npcName = sheet.trueBondNpcName;
		delete sheet.trueBondNpcName;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previousRecord); throw error;
		}
		return { npcName, removed: true };
	}

	createScientificPublication(token: string, input: { requestId: string, title: string, summary: string }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) {
			throw new Error('Entre como jogador em uma mesa para criar o artigo');
		}
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		const knowledge = sheet?.talentSelections?.find(selection =>
			selection.id === 'cientista:publicacao-de-referencia')?.variant;
		// O pré-requisito vale na aquisição; fichas que já possuíam o talento continuam utilizáveis.
		if (!sheet?.talents.class.includes('cientista:publicacao-de-referencia') ||
			!knowledge?.startsWith('conhecimento:')) {
			throw new Error('Publicação de Referência não está disponível para este treinador');
		}
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('Identificador do artigo inválido');
		const prior = this.campaignSettings.publications.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.characterId !== characterId || prior.title !== String(input.title || '').trim() ||
				prior.summary !== String(input.summary || '').trim()) {
				throw new Error('Identificador do artigo já utilizado');
			}
			return { publication: structuredClone(prior), repeated: true };
		}
		const title = String(input.title || '').trim();
		const summary = String(input.summary || '').trim();
		if (title.length < 3 || title.length > 120 || summary.length < 10 || summary.length > 3000) {
			throw new Error('Informe título e resumo do artigo (3–120 e 10–3000 caracteres)');
		}
		if (this.campaignSettings.publications.some(entry => entry.characterId === characterId &&
			entry.status === 'pending')) throw new Error('Já existe um artigo aguardando avaliação');
		const publication: RPGScientificPublication = { id: input.requestId, characterId,
			characterName: record.state.characterName, title, summary, knowledge,
			submittedAt: this.campaignSettings.currentDateTime, status: 'pending' };
		this.campaignSettings.publications.push(publication);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.publications.pop(); throw error;
		}
		return { publication: structuredClone(publication), repeated: false };
	}

	decideScientificPublication(token: string, id: string, accepted: boolean, payment: number) {
		this.requireMasterRole(token);
		const publication = this.campaignSettings.publications.find(entry => entry.id === id);
		if (!publication || publication.status !== 'pending') throw new Error('Artigo não está pendente');
		if (typeof accepted !== 'boolean' || !Number.isSafeInteger(payment) || payment < 0 || payment > 1_000_000 ||
			!accepted && payment !== 0) throw new Error('Decisão ou pagamento inválido');
		const record = this.requireCharacter(publication.characterId);
		if (accepted && !Number.isSafeInteger(record.state.money + payment)) {
			throw new Error('Pagamento ultrapassa o limite de Pokécoins');
		}
		const previous = structuredClone(record);
		const previousPublication = structuredClone(publication);
		publication.status = accepted ? 'accepted' : 'rejected';
		publication.decidedAt = this.campaignSettings.currentDateTime;
		publication.payment = accepted ? payment : 0;
		if (accepted) { record.state.money += payment; record.state.updatedAt = this.now(); }
		try {
			this.persistAtomically(() => {
				if (accepted) this.repository.set(record);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(publication, previousPublication);
			if (accepted) this.repository.set(previous);
			throw error;
		}
		return { publication: structuredClone(publication), money: record.state.money };
	}

	requestCustomScientistRecord(token: string, input: { requestId: string, slot: number,
		recipientCharacterId: string, name: string, description: string, }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (record.tableId !== session.platformTableId || !sheet?.talents.class.includes('cientista:registro-avancado'))
			throw new Error('Registro Avançado indisponível');
		if (!Number.isSafeInteger(input.slot) || input.slot < 0 || input.slot >= rpgScientistRecordLimit(sheet))
			throw new Error('Espaço de registro inválido');
		if (!this.trainerRecordRecipients(token).some(person => person.id === input.recipientCharacterId))
			throw new Error('Destinatário indisponível nesta mesa');
		const name = String(input.name || '').trim();
		const description = String(input.description || '').trim();
		if (name.length < 3 || name.length > 100 || description.length < 10 || description.length > 2000)
			throw new Error('Informe nome (3–100) e descrição (10–2000 caracteres)');
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('Identificador inválido');
		const prior = this.campaignSettings.customRecordRequests.find(entry => entry.id === input.requestId);
		if (prior) {
			if (prior.characterId !== characterId || prior.slot !== input.slot || prior.name !== name ||
				prior.description !== description || prior.recipientCharacterId !== input.recipientCharacterId)
				throw new Error('Identificador já utilizado');
			return { request: structuredClone(prior), repeated: true };
		}
		if (this.campaignSettings.customRecordRequests.some(entry => entry.characterId === characterId &&
			entry.slot === input.slot && entry.status === 'pending')) throw new Error('Já existe um registro aguardando aprovação neste espaço');
		const request: RPGCustomScientistRecordRequest = { id: input.requestId, characterId,
			characterName: record.state.characterName, slot: input.slot, recipientCharacterId: input.recipientCharacterId,
			name, description, submittedAt: this.campaignSettings.currentDateTime, status: 'pending' };
		this.campaignSettings.customRecordRequests.push(request);
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) {
			this.campaignSettings.customRecordRequests.pop(); throw error;
		}
		return { request: structuredClone(request), repeated: false };
	}

	decideCustomScientistRecord(token: string, id: string, accepted: boolean, kitTier: number, charges: number) {
		this.requireMasterRole(token);
		const request = this.campaignSettings.customRecordRequests.find(entry => entry.id === id);
		if (!request || request.status !== 'pending') throw new Error('Registro não está pendente');
		if (typeof accepted !== 'boolean' || accepted && (!Number.isSafeInteger(kitTier) || kitTier < 1 || kitTier > 3 ||
			!Number.isSafeInteger(charges) || charges < 1 || charges > 20)) throw new Error('Nível do kit ou cargas inválidos');
		const record = this.requireCharacter(request.characterId);
		const recipient = this.repository.get(request.recipientCharacterId);
		const sheet = record.state.trainerSheet;
		if (accepted && (!sheet?.talents.class.includes('cientista:registro-avancado') ||
			request.slot >= rpgScientistRecordLimit(sheet) ||
			!record.tableId || !record.accountId ||
			this.accounts.repository.getMembership(record.tableId, record.accountId)?.status !== 'active' ||
			!recipient || recipient.tableId !== record.tableId || !recipient.accountId ||
			this.accounts.repository.getMembership(record.tableId, recipient.accountId)?.status !== 'active')) {
			throw new Error('Cientista ou destinatário indisponível para aprovação');
		}
		const previous = structuredClone(record);
		const previousRequest = structuredClone(request);
		request.status = accepted ? 'accepted' : 'rejected';
		request.decidedAt = this.campaignSettings.currentDateTime;
		if (accepted && sheet) {
			request.kitTier = kitTier; request.charges = charges;
			const records = (sheet.scientistRecords || []).filter(entry => entry.slot !== request.slot);
			records.push({ slot: request.slot, formulaId: `custom:${request.id}`,
				recipientCharacterId: request.recipientCharacterId,
				custom: { name: request.name, description: request.description, kitTier, charges } });
			if (sheet.talents.apex === 'cientista:biblioteca-de-procedimentos' &&
				records.filter(entry => entry.custom || RPG_SCIENTIST_RECORDS.some(formula =>
					formula.id === entry.formulaId && formula.advanced)).length > 2) {
				Object.assign(request, previousRequest); throw new Error('A biblioteca permite até dois Registros Avançados ativos');
			}
			sheet.scientistRecords = records.sort((a, b) => a.slot - b.slot);
			record.state.updatedAt = this.now();
		}
		try {
			this.persistAtomically(() => {
				if (accepted) this.repository.set(record);
				this.persistCampaignSettings();
			});
		} catch (error) {
			Object.assign(request, previousRequest);
			if (accepted) this.repository.set(previous);
			throw error;
		}
		return { request: structuredClone(request) };
	}

	setCampaignPlayerNote(token: string, characterId: unknown, note: unknown): { note: string } {
		this.requireMasterRole(token);
		if (typeof characterId !== 'string' || !this.repository.get(characterId)) throw new Error('Player inválido');
		if (typeof note !== 'string') throw new Error('Anotação inválida');
		this.campaignSettings.playerNotes[characterId] = note.slice(0, 20_000);
		this.persistCampaignSettings();
		return { note: this.campaignSettings.playerNotes[characterId] };
	}

	setCharacterShopAccess(token: string, characterId: string, shopId: string, allowed: boolean): RPGCharacterState {
		this.requireMasterRole(token);
		const id = String(shopId || '');
		if (!this.commerce.directory().shops.some(shop => shop.id === id)) {
			throw new Error('Loja RPG inválida');
		}
		const record = this.requireCharacter(characterId);
		record.state.shopAccess = { ...this.characterShopAccess(record.state), [id]: allowed };
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

	getTrainerCreation(token: string) {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId) throw new Error('Entre com um personagem para criar a ficha');
		const record = this.requireCharacter(session.characterId);
		return {
			method: record.state.trainerSheet?.creation?.method || null,
			standardValues: [...RPG_STANDARD_ATTRIBUTES],
			skillDomains: { conhecimento: [...RPG_KNOWLEDGE_DOMAINS], oficio: [...RPG_CRAFT_DOMAINS],
				pilotagem: [...RPG_TRAINER_PILOTING_DOMAINS] },
			classes: structuredClone(RPG_TRAINER_CLASSES),
			classFeatures: structuredClone(RPG_TRAINER_CLASS_FEATURES),
			sheet: structuredClone(record.state.trainerSheet || createRPGPendingTrainerSheet()),
		};
	}

	chooseTrainerAttributeMethod(token: string, method: unknown): RPGTrainerAttributeMethod {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId) throw new Error('Entre com um personagem para escolher o método');
		if (method !== 'standard' && method !== 'rolled') throw new Error('Método de atributos inválido');
		const record = this.requireCharacter(session.characterId);
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		if (sheet.status !== 'pending') throw new Error('A ficha do treinador já foi concluída');
		if ((sheet.creation?.rolls?.length || sheet.creation?.rollProgress?.dice.length) && sheet.creation.method !== method) {
			throw new Error('O método não pode mudar depois da primeira rolagem');
		}
		if (sheet.creation?.method === method) return method;
		record.state.trainerSheet = { ...sheet, creation: { method, rolls: null } };
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return method;
	}

	rollTrainerAttributes(token: string): { dice: number[] | null, value: number | null,
		index: number, values: number[], valid: boolean | null, complete: boolean, } {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId) throw new Error('Entre com um personagem para rolar os atributos');
		const record = this.requireCharacter(session.characterId);
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		if (sheet.status !== 'pending') throw new Error('A ficha do treinador já foi concluída');
		if (sheet.creation?.method !== 'rolled') throw new Error('Escolha atributos rolados antes de rolar');
		if (sheet.creation?.rolls?.length) return {
			dice: null, value: null, index: 6, values: [...sheet.creation.rolls], valid: true, complete: true,
		};
		const previous = sheet.creation?.rollProgress;
		const progress = previous?.dice.length === 6 ? { dice: [], values: [] } :
			{ dice: previous?.dice.map(group => [...group]) || [], values: [...(previous?.values || [])] };
		const group = rollRPGTrainerAttributeGroup(() => this.int(6) + 1);
		progress.dice.push(group.dice);
		progress.values.push(group.value);
		const complete = progress.values.length === 6;
		const valid = complete ? progress.values.reduce((total, value) => total + value, 0) >= 70 &&
			Math.max(...progress.values) >= 14 : null;
		record.state.trainerSheet = { ...sheet, creation: valid ?
			{ method: 'rolled', rolls: progress.values, dice: progress.dice } :
			{ method: 'rolled', rolls: null, rollProgress: progress } };
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { dice: [...group.dice], value: group.value, index: progress.values.length,
			values: [...progress.values], valid, complete };
	}

	completeTrainerCreation(token: string, input: RPGTrainerCompletion): RPGTrainerSheet {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId) throw new Error('Entre com um personagem para concluir a ficha');
		const record = this.requireCharacter(session.characterId);
		const pending = record.state.trainerSheet || createRPGPendingTrainerSheet();
		if (!pending.creation?.method) throw new Error('Escolha o método de atributos antes de concluir a ficha');
		const sheet = completeRPGTrainerSheet(pending, input, pending.creation.method);
		const money = record.state.money + (RPG_TRAINER_CLASSES[sheet.classId!].money || 0);
		if (!Number.isSafeInteger(money) || money > 10_000_000) throw new Error('Limite de Pokécoin excedido');
		const trainerInventory = rpgInitialTrainerInventory(sheet);
		const pokemonGear = (sheet.equipment || []).filter(entry => !RPG_EQUIPMENT_CATALOG[entry.itemId]);
		const inventory = RPGInventorySystem.migrate(record.state.inventory);
		const reserved = rpgEquipmentSlots(trainerInventory.items);
		const bag = { ...inventory.bag, generalReservedSlots: reserved };
		if (pokemonGear.length) {
			inventory.bag = RPGBagSystem.apply(bag, pokemonGear.map(entry => ({
				type: 'add' as const, itemId: entry.itemId, quantity: entry.quantity,
			})), bag.revision).bag;
		} else if (bag.maxSlots !== undefined && RPGBagSystem.getUsedSlots(bag) > bag.maxSlots) {
			throw new Error('O equipamento inicial não cabe na Bag');
		} else inventory.bag = bag;
		record.state.trainerSheet = sheet;
		record.state.trainerInventory = trainerInventory;
		record.state.inventory = inventory;
		record.state.money = money;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return structuredClone(sheet);
	}

	/** Itens humanos são instâncias: duas unidades podem ter cargas e destinos diferentes. */
	private ensureTrainerInventory(record: RPGStoredCharacter): RPGTrainerInventory {
		if (!record.state.trainerInventory) {
			const inventory = rpgInitialTrainerInventory(record.state.trainerSheet || createRPGPendingTrainerSheet());
			const bag = record.state.inventory.bag;
			// Fichas anteriores ganham suas instâncias sem descartar itens caso a Bag já esteja cheia.
			while (bag.maxSlots !== undefined && bag.items.length + rpgEquipmentSlots(inventory.items) > bag.maxSlots) {
				const overflow = [...inventory.items].reverse().find(entry => entry.location === 'bag' && !entry.equipped);
				if (!overflow) break;
				overflow.location = 'bank';
			}
			record.state.trainerInventory = inventory;
		}
		record.state.trainerInventory.pokemonStorage ||= [];
		for (const item of record.state.trainerInventory.items) {
			if (item.itemId.startsWith('kit-ladinagem-') && item.charges === undefined) item.charges = 5;
		}
		record.state.inventory.bag.generalReservedSlots = rpgEquipmentSlots(record.state.trainerInventory.items);
		return record.state.trainerInventory;
	}

	/** Diferencia a ausência do kit, nível insuficiente e falta de cargas antes de usar o registro. */
	private scientificKitForRecord(inventory: RPGTrainerInventory, minimumTier: number,
		requiredCharges: number): RPGEquipmentInstance {
		const kits = inventory.items.filter(item => item.location === 'bag' &&
			item.itemId.startsWith('kit-cientifico-'));
		if (!kits.length) throw new Error('Você precisa de um Kit Científico na Bag para usar este registro');
		const eligible = kits.filter(item => (rpgEquipment(item.itemId).tier || 1) >= minimumTier);
		if (!eligible.length) throw new Error(`Este registro exige um Kit Científico de nível ${minimumTier} ou superior na Bag`);
		const kit = eligible.find(item => (item.charges || 0) >= requiredCharges);
		if (!kit) throw new Error(`Este registro exige ${requiredCharges} carga(s) em um mesmo Kit Científico; nenhum kit adequado possui cargas suficientes`);
		return kit;
	}

	private validateTrainerInventory(record: RPGStoredCharacter): void {
		const equipment = this.ensureTrainerInventory(record);
		const bag = RPGInventorySystem.migrate(record.state.inventory).bag;
		const reserved = rpgEquipmentSlots(equipment.items);
		const max = bag.maxSlots;
		if (max !== undefined && bag.items.length + reserved > max) throw new Error('A Bag não tem espaços suficientes');
		const strength = record.state.trainerSheet?.attributes?.strength || 10;
		const bagWeight = ({ starter: 1, trainer: 1.5, adventurer: 2.5, expert: 3.5, master: 5, legendary: 6.5 })[
			RPGBagSystem.getTier(bag) || 'starter'];
		const carried = rpgEquipmentWeight(equipment.items, 'bag') + bag.items.reduce((sum, item) => sum + item.quantity * 0.1, 0) + bagWeight;
		if (carried > strength * 7.5 + 1e-9) throw new Error('O peso excede a capacidade máxima do treinador');
		const slots = new Set<string>();
		const instanceIds = new Set<string>();
		for (const entry of equipment.items) {
			const item = rpgEquipment(entry.itemId);
			if (!entry.id || instanceIds.has(entry.id) ||
				!['bag', 'bank', 'vehicle'].includes(entry.location)) throw new Error('Instância de equipamento inválida');
			instanceIds.add(entry.id);
			if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > item.stackLimit) {
				throw new Error('Pilha de equipamento inválida');
			}
			if (entry.charges !== undefined && (item.maxCharges === undefined || !Number.isSafeInteger(entry.charges) ||
				entry.charges < 0 || entry.charges > item.maxCharges)) throw new Error('Cargas inválidas');
			if (entry.equipped) {
				if (entry.location !== 'bag' || !item.equipSlot || entry.quantity !== 1) throw new Error('Equipamento não pode ser vestido');
				if (item.equipSlot !== 'accessory' && slots.has(item.equipSlot)) throw new Error('Espaço de equipamento ocupado');
				slots.add(item.equipSlot);
			}
			if (item.vehicle && entry.location === 'bag') throw new Error('Veículos devem ficar na garagem ou no banco');
			if (entry.location === 'vehicle') {
				if (!item.vehicle && !entry.vehicleId) throw new Error('Carga sem veículo');
				if (entry.vehicleId && !equipment.items.some(owner => owner.id === entry.vehicleId &&
					rpgEquipment(owner.itemId).vehicle && owner.location === 'vehicle')) throw new Error('Veículo da carga indisponível');
			}
		}
		if (slots.has('body-improvement') && !slots.has('body-outfit')) throw new Error('A melhoria de corpo exige um traje');
		if (slots.has('head-improvement') && !slots.has('body-outfit')) throw new Error('A melhoria de cabeça exige um traje');
		for (const stored of equipment.pokemonStorage || []) {
			const item = RPGItems.require(stored.itemId);
			if (!Number.isSafeInteger(stored.quantity) || stored.quantity < 1 || stored.quantity > item.stackLimit ||
				!['bank', 'vehicle'].includes(stored.location) ||
				(stored.location === 'vehicle' && !equipment.items.some(vehicle => vehicle.id === stored.vehicleId &&
					vehicle.location === 'vehicle' && rpgEquipment(vehicle.itemId).vehicle))) {
				throw new Error('Item Pokémon armazenado inválido');
			}
		}
		for (const vehicle of equipment.items.filter(entry => rpgEquipment(entry.itemId).vehicle && entry.location === 'vehicle')) {
			const spec = rpgEquipment(vehicle.itemId).vehicle!;
			const cargo = equipment.items.filter(entry => entry.vehicleId === vehicle.id);
			const pokemonCargo = (equipment.pokemonStorage || []).filter(entry => entry.vehicleId === vehicle.id);
			if (rpgEquipmentSlots(cargo, 'vehicle') + pokemonCargo.length > spec.cargoSpaces ||
				rpgEquipmentWeight(cargo, 'vehicle') + pokemonCargo.reduce((sum, entry) => sum + entry.quantity * 0.1, 0) > spec.cargoKg) {
				throw new Error('Carga excede a capacidade do veículo');
			}
		}
		record.state.inventory = { ...record.state.inventory, bag: { ...bag, generalReservedSlots: reserved } };
	}

	getTrainerEquipment(token: string, characterId?: string) {
		const record = this.requireBagRecord(token, characterId, 'bag:read');
		const equipment = this.ensureTrainerInventory(record);
		const bag = record.state.inventory.bag;
		const bagWeight = ({ starter: 1, trainer: 1.5, adventurer: 2.5, expert: 3.5, master: 5, legendary: 6.5 })[
			RPGBagSystem.getTier(bag) || 'starter'];
		const derived = record.state.trainerSheet?.status === 'complete' ?
			rpgTrainerDerivedStatistics(record.state.trainerSheet, rpgEquipmentDerivedOptions(record.state.trainerSheet,
				equipment, bag.items.reduce((total, entry) => total + entry.quantity, 0), bagWeight)) : null;
		return { inventory: structuredClone(equipment), catalog: RPG_EQUIPMENT_CATALOG,
			capacity: RPGBagSystem.getCapacity({ ...bag, generalReservedSlots: rpgEquipmentSlots(equipment.items) }),
			derived };
	}

	/** Cada esconderijo pertence à mesa e a um Explorador; os membros ativos compartilham o acesso. */
	getSupportCaches(token: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) return [];
		return Object.entries(this.campaignSettings.supportCaches).flatMap(([cacheId, cache]) => {
			const ownerCharacterId = cache.ownerCharacterId || cacheId;
			const owner = this.repository.get(ownerCharacterId);
			if (!owner || owner.tableId !== session.platformTableId || !owner.accountId ||
				this.accounts.repository.getMembership(session.platformTableId!, owner.accountId)?.status !== 'active') return [];
			return [{ cacheId, ownerCharacterId, ownerName: owner.state.characterName,
				location: cache.location || 'Local não informado' }];
		});
	}

	createSupportCache(token: string, location: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.characterId) {
			throw new Error('Entre como jogador para criar um Ponto de Apoio');
		}
		const owner = this.requireBagRecord(token, session.viewAsCharacterId || session.characterId, 'bag:edit');
		this.requireWorldBagItemUse(token, owner.state.id);
		const sheet = owner.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('explorador:ponto-de-apoio')) {
			throw new Error('Este treinador não possui Ponto de Apoio');
		}
		const place = typeof location === 'string' ? location.trim() : '';
		if (!place || place.length > 160) throw new Error('Informe o local do Ponto de Apoio (até 160 caracteres)');
		const limit = Math.max(1, rpgTrainerModifier(sheet.attributes!.wisdom));
		const owned = this.getSupportCaches(token).filter(cache => cache.ownerCharacterId === owner.state.id);
		if (owned.length >= limit) throw new Error(`Limite de ${limit} Ponto(s) de Apoio atingido`);
		if (owned.some(cache => cache.location.toLocaleLowerCase('pt-BR') === place.toLocaleLowerCase('pt-BR'))) {
			throw new Error('Já existe um Ponto de Apoio com esse local');
		}
		const cacheId = `${owner.state.id}-${secureRandomBytes(12).toString('hex')}`;
		try {
			this.persistAtomically(() => {
				this.campaignSettings.supportCaches[cacheId] = {
					revision: 0, ownerCharacterId: owner.state.id, location: place,
					bag: RPGBagSystem.create(`support-${cacheId}`, [], { maxSlots: 20 }), equipment: [],
				};
				this.persistCampaignSettings();
			});
		} catch (error) {
			delete this.campaignSettings.supportCaches[cacheId];
			throw error;
		}
		return this.getSupportCache(token, cacheId);
	}

	deleteSupportCache(token: string, input: { cacheId: string, expectedRevision: number, confirmContents?: boolean }) {
		if (!input || typeof input.cacheId !== 'string' || !Number.isSafeInteger(input.expectedRevision)) {
			throw new Error('Ponto de Apoio inválido');
		}
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.characterId) {
			throw new Error('Entre como jogador para excluir um Ponto de Apoio');
		}
		const actor = this.requireBagRecord(token, session.viewAsCharacterId || session.characterId, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const view = this.getSupportCache(token, input.cacheId);
		if (view.ownerCharacterId !== actor.state.id) {
			throw new Error('Somente o Explorador proprietário pode excluir este Ponto de Apoio');
		}
		const cache = this.campaignSettings.supportCaches[input.cacheId];
		if (cache.revision !== input.expectedRevision) {
			throw new Error('O Ponto de Apoio mudou; atualize e tente novamente');
		}
		if ((cache.bag.items.some(item => item.quantity > 0) || cache.equipment.some(item => item.quantity > 0)) &&
			input.confirmContents !== true) {
			throw new Error('O Ponto de Apoio contém itens; confirme a exclusão do local e de todo o seu conteúdo');
		}
		const previousCaches = structuredClone(this.campaignSettings.supportCaches);
		try {
			this.persistAtomically(() => {
				delete this.campaignSettings.supportCaches[input.cacheId];
				this.persistCampaignSettings();
			});
		} catch (error) {
			this.campaignSettings.supportCaches = previousCaches;
			throw error;
		}
		return { cacheId: input.cacheId, deleted: true };
	}

	getSupportCache(token: string, cacheId: string) {
		const session = this.getSession(token);
		const actorId = session.viewAsCharacterId || session.characterId;
		if (session.mode !== 'player' || !actorId) throw new Error('Entre como jogador para acessar o Ponto de Apoio');
		const actor = this.requireBagRecord(token, actorId, 'bag:read');
		const owner = this.getSupportCaches(token).find(entry => entry.cacheId === cacheId);
		if (!owner || actor.tableId !== session.platformTableId) throw new Error('Ponto de Apoio indisponível nesta mesa');
		const cache = this.campaignSettings.supportCaches[cacheId];
		const concealment = cache.concealedItem;
		const concealedStatus = concealment ? 'hidden' : undefined;
		const snapshot = structuredClone(actor.state);
		snapshot.inventory = RPGInventorySystem.create(cache.bag);
		const bagView = RPGBagManagement.view(snapshot);
		const equipment = this.ensureTrainerInventory(actor);
		const mapEquipment = (entries: RPGEquipmentInstance[]) => entries.map(entry => ({
			id: entry.id, itemId: entry.itemId, name: rpgEquipment(entry.itemId).name,
			quantity: entry.quantity, category: 'food-items', kind: 'equipment',
			spaces: rpgEquipment(entry.itemId).spaces, charges: entry.charges,
			...(concealment?.kind === 'equipment' && concealment.instanceId === entry.id ? { concealedStatus } : {}),
		}));
		return { ...owner, revision: cache.revision, usedSlots: RPGBagSystem.getUsedSlots(cache.bag), maxSlots: 20,
			canDeposit: !!this.repository.get(owner.ownerCharacterId)?.state.trainerSheet?.talents.class.includes('explorador:ponto-de-apoio'),
			items: [...bagView.items.filter(item => !item.mission).map(item => ({
				id: item.id, itemId: item.id, name: item.name, quantity: item.quantity,
				category: item.category, kind: 'pokemon', icon: item.icon, sprite: item.sprite,
				...(concealment?.kind === 'pokemon' && concealment.itemId === item.id ? { concealedStatus } : {}),
			})), ...mapEquipment(cache.equipment)],
			canConceal: !!actor.state.trainerSheet?.talents.class.includes('ladino:compartimento-clandestino'),
			concealmentOwnerId: concealment?.ownerCharacterId,
			bagRevision: actor.state.inventory.bag.revision, equipmentRevision: equipment.revision };
	}

	setTrainerHiddenCompartment(token: string, input: { container: 'bag' | 'support-cache', cacheId?: string,
		action: 'conceal' | 'reveal', kind?: 'pokemon' | 'equipment', itemId?: string, instanceId?: string, }) {
		const session = this.getSession(token);
		const actorId = session.viewAsCharacterId || session.characterId;
		if (session.mode !== 'player' || !actorId || !session.platformTableId) {
			throw new Error('Entre como jogador em uma mesa para preparar o compartimento');
		}
		if (!input || !['bag', 'support-cache'].includes(input.container) ||
			!['conceal', 'reveal'].includes(input.action)) throw new Error('Compartimento inválido');
		const original = this.requireBagRecord(token, actorId, 'bag:edit');
		this.requireWorldBagItemUse(token, original.state.id);
		const actor = structuredClone(original);
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('ladino:compartimento-clandestino')) {
			throw new Error('Este treinador não possui Compartimento Clandestino');
		}
		if (!sheet.proficiencies?.includes('kit-ladinagem') || !sheet.skills.trained.includes('ladinagem')) {
			throw new Error('É necessário domínio do Kit de Ladinagem e treinamento em Ladinagem');
		}
		if (input.container === 'support-cache' && (!input.cacheId ||
			!this.getSupportCaches(token).some(entry => entry.cacheId === input.cacheId))) {
			throw new Error('Armazenamento compartilhado indisponível nesta mesa');
		}
		const previousCaches = structuredClone(this.campaignSettings.supportCaches);
		const cache = input.container === 'support-cache' ? structuredClone(previousCaches[input.cacheId!]) : null;
		const current = cache ? cache.concealedItem : sheet.concealedBagItem;
		if (input.action === 'reveal') {
			if (!current || cache?.concealedItem && cache.concealedItem.ownerCharacterId !== actor.state.id) {
				throw new Error('Nenhum compartimento deste Ladino para desfazer');
			}
			if (cache) { cache.concealedItem = undefined; cache.revision++; } else sheet.concealedBagItem = undefined;
		} else {
			if (!['pokemon', 'equipment'].includes(input.kind || '') || !input.itemId) {
				throw new Error('Escolha um item válido do armazenamento');
			}
			const bag = cache?.bag || actor.state.inventory.bag;
			const equipment = cache?.equipment || this.ensureTrainerInventory(actor).items;
			const kind = input.kind!;
			const itemId = kind === 'pokemon' ? RPGItems.require(input.itemId).id : rpgEquipment(input.itemId).id;
			if (kind === 'pokemon') {
				if (RPGBagSystem.getRegularQuantity(bag, itemId) < 1) {
					throw new Error('O item não está disponível neste armazenamento');
				}
			} else {
				const entry = equipment.find(item => item.id === input.instanceId && item.itemId === itemId &&
					item.quantity > 0 && !item.equipped && (cache || item.location === 'bag'));
				if (!entry) throw new Error('O equipamento não está disponível neste armazenamento');
				if (rpgEquipment(itemId).spaces > 1) throw new Error('O item ocupa mais de um espaço');
			}
			const stillPresent = current && (current.kind === 'pokemon' ?
				RPGBagSystem.getRegularQuantity(bag, current.itemId) > 0 :
				equipment.some(item => item.id === current.instanceId && item.quantity > 0));
			if (stillPresent) throw new Error('Este armazenamento já possui um Compartimento Clandestino');
			const kit = this.ensureTrainerInventory(actor).items.find(item =>
				item.itemId.startsWith('kit-ladinagem-') && item.location === 'bag' && (item.charges || 0) > 0);
			if (!kit) throw new Error('É necessário um Kit de Ladinagem com ao menos uma carga');
			kit.charges!--;
			this.ensureTrainerInventory(actor).revision++;
			const concealed = { kind, itemId, ...(kind === 'equipment' ? { instanceId: input.instanceId } : {}) };
			if (cache) { cache.concealedItem = { ...concealed, ownerCharacterId: actor.state.id }; cache.revision++; } else sheet.concealedBagItem = concealed;
		}
		actor.state.updatedAt = this.now();
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (cache) { this.campaignSettings.supportCaches[input.cacheId!] = cache; this.persistCampaignSettings(); }
			});
		} catch (error) {
			this.repository.set(original);
			this.campaignSettings.supportCaches = previousCaches;
			throw error;
		}
		return { hidden: !!(cache?.concealedItem || sheet.concealedBagItem) };
	}

	changeSupportCache(token: string, input: { cacheId: string, action: 'deposit' | 'withdraw',
		kind: 'pokemon' | 'equipment', itemId?: string, instanceId?: string, quantity: number,
		expectedRevision: number, expectedBagRevision: number, expectedEquipmentRevision: number, }) {
		if (!input || !['deposit', 'withdraw'].includes(input.action) ||
			!['pokemon', 'equipment'].includes(input.kind) ||
			!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
			throw new Error('Movimentação inválida para o Ponto de Apoio');
		}
		const cacheId = input.cacheId;
		const view = this.getSupportCache(token, cacheId);
		if (input.action === 'deposit' && !view.canDeposit) {
			throw new Error('Este Ponto de Apoio só permite retirar itens após a perda do talento');
		}
		const session = this.getSession(token);
		const actor = structuredClone(this.requireBagRecord(token,
			session.viewAsCharacterId || session.characterId, 'bag:edit'));
		this.requireWorldBagItemUse(token, actor.state.id);
		const previousActor = structuredClone(actor);
		const previousCaches = structuredClone(this.campaignSettings.supportCaches);
		const cache = structuredClone(previousCaches[cacheId]);
		const equipment = this.ensureTrainerInventory(actor);
		if (cache.revision !== input.expectedRevision ||
			actor.state.inventory.bag.revision !== input.expectedBagRevision ||
			equipment.revision !== input.expectedEquipmentRevision) {
			throw new Error('Os itens mudaram; atualize o Ponto de Apoio e tente novamente');
		}
		if (input.kind === 'pokemon') {
			const item = RPGItems.require(input.itemId || '');
			if (input.action === 'withdraw' && cache.concealedItem?.kind === 'pokemon' &&
				cache.concealedItem.itemId === item.id) cache.concealedItem = undefined;
			if (item.tags?.includes('mission')) throw new Error('Itens de missão não podem ser guardados no Ponto de Apoio');
			if (input.action === 'deposit' && item.id === 'portableincubator' &&
				this.portableEggProjects(actor).length) {
				throw new Error('Incubadoras com Egg não podem ser guardadas no Ponto de Apoio');
			}
			if (input.action === 'deposit') {
				if (RPGBagSystem.getRegularQuantity(actor.state.inventory.bag, item.id) < input.quantity) {
					throw new Error('Quantidade insuficiente na Bag');
				}
				actor.state.inventory.bag = RPGBagSystem.remove(actor.state.inventory.bag, item.id, input.quantity).bag;
				cache.bag = RPGBagSystem.add(cache.bag, item.id, input.quantity).bag;
			} else {
				cache.bag = RPGBagSystem.remove(cache.bag, item.id, input.quantity).bag;
				actor.state.inventory.bag = RPGBagSystem.add(actor.state.inventory.bag, item.id, input.quantity).bag;
			}
		} else {
			const source = input.action === 'deposit' ? equipment.items : cache.equipment;
			const destination = input.action === 'deposit' ? cache.equipment : equipment.items;
			const entry = source.find(item => item.id === input.instanceId);
			if (input.action === 'withdraw' && cache.concealedItem?.kind === 'equipment' &&
				cache.concealedItem.instanceId === input.instanceId) cache.concealedItem = undefined;
			if (!entry || input.quantity > entry.quantity ||
				(input.action === 'deposit' && (entry.location !== 'bag' || entry.equipped)) ||
				entry.charges !== undefined && input.quantity !== entry.quantity) {
				throw new Error('Equipamento indisponível para transferência');
			}
			const definition = rpgEquipment(entry.itemId);
			if (input.action === 'withdraw') rpgAssertEquipmentLicense(equipment, definition, this.now());
			const moved: RPGEquipmentInstance = { ...entry, id: secureRandomBytes(12).toString('hex'),
				quantity: input.quantity, location: 'bag', equipped: false, vehicleId: undefined };
			entry.quantity -= input.quantity;
			if (!entry.quantity) source.splice(source.indexOf(entry), 1);
			if (definition.vehicle) throw new Error('Veículos não cabem no Ponto de Apoio');
			const stack = moved.charges === undefined && destination.find(item => item.itemId === moved.itemId &&
				item.location === 'bag' && !item.equipped && item.charges === undefined &&
				item.quantity + moved.quantity <= definition.stackLimit);
			if (stack) stack.quantity += moved.quantity;
			else destination.push(moved);
			equipment.revision++;
		}
		cache.bag.generalReservedSlots = rpgEquipmentSlots(cache.equipment);
		if (RPGBagSystem.getUsedSlots(cache.bag) > 20) throw new Error('O Ponto de Apoio comporta no máximo 20 espaços');
		cache.revision++;
		this.validateTrainerInventory(actor);
		actor.state.updatedAt = this.now();
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				this.campaignSettings.supportCaches[cacheId] = cache;
				this.persistCampaignSettings();
			});
		} catch (error) {
			this.repository.set(previousActor);
			this.campaignSettings.supportCaches = previousCaches;
			throw error;
		}
		return this.getSupportCache(token, cacheId);
	}

	getTrainerEquipmentOffers(token: string, shopId: string, characterId?: string) {
		const record = this.requireBagRecord(token, characterId, 'bag:read', true);
		this.requireCommerceAccess(token, record, shopId);
		return structuredClone(this.campaignSettings.equipmentOffers[shopId] || {});
	}

	setTrainerEquipmentOffer(token: string, shopId: string, itemId: string, stock: number, price?: number) {
		this.requireMasterRole(token);
		if (!this.commerce.directory().shops.some(shop => shop.id === shopId)) throw new Error('Loja inválida');
		const item = rpgEquipment(itemId);
		if (!Number.isSafeInteger(stock) || stock < 0) throw new Error('Estoque inválido');
		const selectedPrice = price ?? item.price;
		if (!Number.isSafeInteger(selectedPrice) || selectedPrice < 0) throw new Error('Preço inválido');
		const previous = structuredClone(this.campaignSettings.equipmentOffers);
		this.campaignSettings.equipmentOffers[shopId] ||= {};
		this.campaignSettings.equipmentOffers[shopId][item.id] = { stock, price: selectedPrice };
		try { this.persistAtomically(() => this.persistCampaignSettings()); } catch (error) { this.campaignSettings.equipmentOffers = previous; throw error; }
		return structuredClone(this.campaignSettings.equipmentOffers[shopId][item.id]);
	}

	setTrainerLicense(token: string, characterId: string, license: RPGLicense, waiveFee = false) {
		this.requireMasterRole(token);
		const record = this.requireCharacter(toID(characterId));
		if (!['contencao', 'defensiva', 'medica', 'cientifica', 'tecnologica', 'veiculo', 'arma-fogo', 'restrito', 'institucional'].includes(license?.id) ||
			!['active', 'temporary', 'suspended', 'revoked'].includes(license?.status) ||
			(license.expiresAt !== undefined && (!Number.isSafeInteger(license.expiresAt) || license.expiresAt <= 0))) {
			throw new Error('Licença inválida');
		}
		const previous = structuredClone(record);
		const inventory = this.ensureTrainerInventory(record);
		const current = inventory.licenses.find(entry => entry.id === license.id &&
			['active', 'temporary'].includes(entry.status) && (entry.expiresAt === undefined || entry.expiresAt > this.now()));
		const activating = license.status === 'active' || license.status === 'temporary';
		const fee = activating && !current && !waiveFee ?
			(['arma-fogo', 'restrito'].includes(license.id) ? 5000 : license.id === 'institucional' ? 0 : 1000) : 0;
		if (record.state.money < fee) throw new Error('Pokécoin insuficiente para a licença');
		record.state.money -= fee;
		inventory.licenses = [...inventory.licenses.filter(entry => entry.id !== license.id),
			{ ...license, issuedBy: this.getSession(token).platformAccountId || 'master' }];
		inventory.revision++;
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(previous); throw error; }
		return structuredClone(inventory.licenses);
	}

	grantTrainerKitDomain(token: string, characterId: string, domain: string) {
		this.requireMasterRole(token);
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' || !rpgCanAcquireKitDomain(sheet, domain)) throw new Error('Pré-requisito de domínio não atendido');
		if ((sheet.proficiencies || []).includes(domain)) return structuredClone(sheet.proficiencies);
		const previous = structuredClone(record);
		sheet.proficiencies = [...(sheet.proficiencies || []), domain];
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(previous); throw error; }
		return structuredClone(sheet.proficiencies);
	}

	/** Compra, consumo, banco e transferência compartilham a mesma validação e o mesmo COMMIT. */
	changeTrainerEquipment(token: string, input: {
		action: 'buy' | 'sell' | 'grant' | 'transfer' | 'move' | 'movePokemon' | 'equip' | 'consume' | 'refill',
		characterId?: string, expectedRevision: number, itemId?: string, instanceId?: string,
		quantity?: number, shopId?: string, targetCharacterId?: string, expectedTargetRevision?: number,
		expectedBagRevision?: number, sourceLocation?: 'bag' | 'bank' | 'vehicle',
		location?: RPGEquipmentInstance['location'], vehicleId?: string, equipped?: boolean,
		refillInstanceId?: string,
	}) {
		if (!input || !['buy', 'sell', 'grant', 'transfer', 'move', 'movePokemon', 'equip', 'consume', 'refill'].includes(input.action)) {
			throw new Error('Ação de equipamento inválida');
		}
		const actor = structuredClone(this.requireBagRecord(token, input.characterId, 'bag:edit'));
		const actorInventory = this.ensureTrainerInventory(actor);
		if (actorInventory.revision !== input.expectedRevision) throw new Error('Inventário alterado; atualize antes de tentar novamente');
		const previousActor = structuredClone(actor);
		const previousOffers = structuredClone(this.campaignSettings.equipmentOffers);
		const workingOffers = structuredClone(previousOffers);
		const quantity = input.quantity ?? 1;
		if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Quantidade inválida');
		let target: RPGStoredCharacter | undefined;
		let previousTarget: RPGStoredCharacter | undefined;
		if (input.action === 'transfer') {
			target = structuredClone(this.requireCharacter(toID(input.targetCharacterId || '')));
			if (target.state.id === actor.state.id || target.state.pageAccess?.bag === false) throw new Error('Destinatário indisponível');
			previousTarget = structuredClone(target);
			if (this.ensureTrainerInventory(target).revision !== input.expectedTargetRevision) throw new Error('Inventário do destinatário alterado');
		}
		const find = (id: string | undefined) => {
			const entry = actorInventory.items.find(candidate => candidate.id === id);
			if (!entry) throw new Error('Equipamento não encontrado');
			return entry;
		};
		const add = (inventory: RPGTrainerInventory, itemId: string, count: number, location: RPGEquipmentInstance['location'], vehicleId?: string) => {
			const item = rpgEquipment(itemId);
			if (item.vehicle && location === 'bag') throw new Error('Veículo precisa de garagem');
			if (location === 'vehicle' && !item.vehicle && !vehicleId) throw new Error('Escolha um veículo para a carga');
			let left = count;
			for (const stack of inventory.items.filter(entry => entry.itemId === item.id && entry.location === location &&
				entry.vehicleId === vehicleId && !entry.equipped && entry.quantity < item.stackLimit)) {
				const moved = Math.min(left, item.stackLimit - stack.quantity);
				stack.quantity += moved; left -= moved;
				if (!left) break;
			}
			while (left) {
				const moved = Math.min(left, item.stackLimit);
				inventory.items.push({ id: secureRandomBytes(12).toString('hex'), itemId: item.id, quantity: moved,
					equipped: false, location, ...(vehicleId ? { vehicleId } : {}),
					...(item.maxCharges !== undefined ? { charges: item.maxCharges } : {}) });
				left -= moved;
			}
		};
		const take = (entry: RPGEquipmentInstance, count: number) => {
			if (entry.equipped || count > entry.quantity) throw new Error('Quantidade indisponível ou item equipado');
			entry.quantity -= count;
			if (!entry.quantity) actorInventory.items.splice(actorInventory.items.indexOf(entry), 1);
		};
		if (input.action === 'grant') {
			this.requireMasterRole(token);
			add(actorInventory, rpgEquipment(input.itemId || '').id, quantity,
				rpgEquipment(input.itemId || '').vehicle ? 'vehicle' : 'bag');
		} else if (input.action === 'buy') {
			const item = rpgEquipment(input.itemId || '');
			const shopId = input.shopId || '';
			this.requireCommerceAccess(token, actor, shopId);
			const offer = workingOffers[shopId]?.[item.id];
			if (!offer || offer.stock < quantity || offer.price <= 0) throw new Error('Equipamento não está disponível na loja');
			rpgAssertEquipmentLicense(actorInventory, item, this.now());
			const cost = offer.price * quantity;
			if (!Number.isSafeInteger(cost) || cost > actor.state.money) throw new Error('Pokécoin insuficiente');
			actor.state.money -= cost; offer.stock -= quantity;
			add(actorInventory, item.id, quantity, item.vehicle ? 'vehicle' : 'bag');
		} else if (input.action === 'sell') {
			const entry = find(input.instanceId);
			const item = rpgEquipment(entry.itemId);
			const shopId = input.shopId || '';
			this.requireCommerceAccess(token, actor, shopId);
			const offer = workingOffers[shopId]?.[item.id];
			if (!offer || offer.price <= 0) throw new Error('A loja não negocia este equipamento');
			if (entry.location !== 'bag' && entry.location !== 'vehicle') throw new Error('Retire o item do banco antes de vender');
			const payment = Math.floor(offer.price * 0.25 / 10) * 10 * quantity;
			if (actor.state.money + payment > 10_000_000) throw new Error('Limite de Pokécoin excedido');
			take(entry, quantity); actor.state.money += payment; offer.stock += quantity;
		} else if (input.action === 'transfer') {
			const entry = find(input.instanceId);
			if (entry.location !== 'bag') throw new Error('Somente itens da Bag podem ser entregues');
			const item = rpgEquipment(entry.itemId);
			if (item.vehicle || item.stackLimit === 1 && quantity !== 1) throw new Error('Transferência inválida');
			const destination = this.ensureTrainerInventory(target!);
			rpgAssertEquipmentLicense(destination, item, this.now());
			if (item.stackLimit === 1 || entry.charges !== undefined) {
				if (quantity !== entry.quantity) throw new Error('Item com cargas deve ser transferido inteiro');
				take(entry, quantity);
				destination.items.push({ ...structuredClone(entry), id: secureRandomBytes(12).toString('hex'), quantity, equipped: false });
			} else { take(entry, quantity); add(destination, item.id, quantity, 'bag'); }
			destination.revision++;
		} else if (input.action === 'move') {
			const entry = find(input.instanceId);
			const location = input.location;
			if (!location || location === entry.location || entry.equipped || quantity !== entry.quantity) throw new Error('Movimentação inválida');
			if (location === 'bank' || entry.location === 'bank') this.requireBankRecord(token, actor.state.id, 'money:edit');
			const item = rpgEquipment(entry.itemId);
			if (location !== 'bank') rpgAssertEquipmentLicense(actorInventory, item, this.now());
			if (item.vehicle && location === 'bag') throw new Error('Veículo exige garagem');
			if (location === 'vehicle' && !item.vehicle && !input.vehicleId) throw new Error('Escolha o veículo');
			if (item.vehicle && location === 'bank' && (actorInventory.items.some(cargo => cargo.vehicleId === entry.id) ||
				(actorInventory.pokemonStorage || []).some(cargo => cargo.vehicleId === entry.id))) {
				throw new Error('Retire a carga antes de guardar o veículo');
			}
			entry.location = location;
			entry.vehicleId = location === 'vehicle' && !item.vehicle ? input.vehicleId : undefined;
		} else if (input.action === 'movePokemon') {
			const source = input.sourceLocation;
			const destination = input.location;
			if (!source || !destination || source === destination ||
				!['bag', 'bank', 'vehicle'].includes(source) || !['bag', 'bank', 'vehicle'].includes(destination) ||
				(source === 'vehicle' && destination === 'vehicle')) throw new Error('Movimentação inválida');
			if (source === 'bank' || destination === 'bank') this.requireBankRecord(token, actor.state.id, 'money:edit');
			const item = RPGItems.require(input.itemId || '');
			if (item.tags?.includes('mission')) throw new Error('Item de Missão não pode ser armazenado');
			const storage = actorInventory.pokemonStorage ||= [];
			if (source === 'bag' || destination === 'bag') {
				if (actor.state.inventory.bag.revision !== input.expectedBagRevision) throw new Error('RPG Bag revision conflict');
			}
			if (source === 'bag') {
				if (RPGBagSystem.getRegularQuantity(actor.state.inventory.bag, item.id) < quantity) {
					throw new Error('Quantidade fora de Itens de Missão insuficiente');
				}
				actor.state.inventory = { ...actor.state.inventory, bag: RPGBagSystem.remove(
					actor.state.inventory.bag, item.id, quantity, input.expectedBagRevision
				).bag };
			} else {
				const available = storage.filter(entry => entry.itemId === item.id && entry.location === source &&
					(source !== 'vehicle' || entry.vehicleId === input.vehicleId));
				if (available.reduce((sum, entry) => sum + entry.quantity, 0) < quantity) throw new Error('Quantidade armazenada insuficiente');
				let left = quantity;
				for (const entry of available) {
					const moved = Math.min(left, entry.quantity);
					entry.quantity -= moved; left -= moved;
					if (!entry.quantity) storage.splice(storage.indexOf(entry), 1);
					if (!left) break;
				}
			}
			if (destination === 'bag') {
				actor.state.inventory = { ...actor.state.inventory, bag: RPGBagSystem.add(
					actor.state.inventory.bag, item.id, quantity, input.expectedBagRevision
				).bag };
			} else {
				if (destination === 'vehicle' && !actorInventory.items.some(entry => entry.id === input.vehicleId &&
					entry.location === 'vehicle' && rpgEquipment(entry.itemId).vehicle)) throw new Error('Veículo indisponível');
				let left = quantity;
				for (const entry of storage.filter(candidate => candidate.itemId === item.id &&
					candidate.location === destination && candidate.vehicleId === (destination === 'vehicle' ? input.vehicleId : undefined))) {
					const moved = Math.min(left, item.stackLimit - entry.quantity);
					entry.quantity += moved; left -= moved;
					if (!left) break;
				}
				while (left) {
					const moved = Math.min(left, item.stackLimit);
					storage.push({ itemId: item.id, quantity: moved, location: destination,
						...(destination === 'vehicle' ? { vehicleId: input.vehicleId } : {}) });
					left -= moved;
				}
			}
		} else if (input.action === 'equip') {
			const entry = find(input.instanceId);
			if (entry.location !== 'bag') throw new Error('O item deve estar na Bag');
			if (!rpgEquipment(entry.itemId).equipSlot) throw new Error('Este item não pode ser equipado');
			entry.equipped = !!input.equipped;
		} else if (input.action === 'consume') {
			const entry = find(input.instanceId);
			if (entry.location !== 'bag' && !(entry.location === 'vehicle' && rpgEquipment(entry.itemId).vehicle)) {
				throw new Error('O item não está disponível para uso');
			}
			if (entry.charges !== undefined) {
				if (entry.charges < quantity) throw new Error('Cargas insuficientes');
				entry.charges -= quantity;
				if (entry.charges === 0 && rpgEquipment(entry.itemId).category === 'refill') {
					entry.quantity--;
					if (entry.quantity) entry.charges = rpgEquipment(entry.itemId).maxCharges;
					else actorInventory.items.splice(actorInventory.items.indexOf(entry), 1);
				}
			} else take(entry, quantity);
		} else if (input.action === 'refill') {
			const kit = find(input.instanceId);
			const refill = find(input.refillInstanceId);
			const kitRule = rpgEquipment(kit.itemId);
			const refillRule = rpgEquipment(refill.itemId);
			if ((kit.location !== 'bag' && !(kit.location === 'vehicle' && kitRule.vehicle)) ||
				refill.location !== 'bag' || kit.charges === undefined ||
				!refillRule.refillFor || !(refillRule.refillFor === 'device' ? kitRule.category === 'device' :
			refillRule.refillFor === 'vehicle' ? !!kitRule.vehicle : kitRule.id.startsWith(refillRule.refillFor)) ||
			kit.charges === kitRule.maxCharges) {
				throw new Error('Refil incompatível ou desnecessário');
			}
			const used = Math.min(kitRule.maxCharges! - kit.charges, refill.charges ?? refillRule.maxCharges!);
			if (used < 1) throw new Error('Refil sem cargas');
			kit.charges += used;
			refill.charges = (refill.charges ?? refillRule.maxCharges!) - used;
			if (refill.charges === 0) {
				refill.quantity--;
				if (refill.quantity) refill.charges = refillRule.maxCharges;
				else actorInventory.items.splice(actorInventory.items.indexOf(refill), 1);
			}
		}
		actorInventory.revision++;
		this.validateTrainerInventory(actor);
		if (target) this.validateTrainerInventory(target);
		actor.state.updatedAt = this.now();
		if (target) target.state.updatedAt = this.now();
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (target) this.repository.set(target);
				if (input.action === 'buy' || input.action === 'sell') {
					this.campaignSettings.equipmentOffers = workingOffers;
					this.persistCampaignSettings();
				}
			});
		} catch (error) {
			this.repository.set(previousActor);
			if (previousTarget) this.repository.set(previousTarget);
			this.campaignSettings.equipmentOffers = previousOffers;
			throw error;
		}
		return { inventory: structuredClone(actorInventory), money: actor.state.money,
			...(target ? { targetInventory: structuredClone(target.state.trainerInventory) } : {}) };
	}

	getTrainerProgression(token: string, characterId?: string) {
		const state = this.getCharacter(token, characterId);
		const sheet = state.trainerSheet || createRPGPendingTrainerSheet();
		if (sheet.status !== 'complete') return { sheet, xpToNextLevel: rpgTrainerXPToNextLevel(sheet.experience) };
		const domains = (family: string, defaults: readonly string[]) => [...new Set([
			...defaults.map(domain => `${family}:${domain}`),
			...sheet.skills.trained.filter(skill => skill.startsWith(family + ':')),
		])];
		const pilotage = RPG_TRAINER_PILOTING_DOMAINS.map(category => `pilotagem:${category}`);
		const skillIds = Object.keys(RPG_SKILL_ATTRIBUTES).flatMap(family => family === 'pilotagem' ? pilotage :
			family === 'conhecimento' ? [family, ...domains(family, RPG_KNOWLEDGE_DOMAINS)] :
			family === 'oficio' ? [family, ...domains(family, RPG_CRAFT_DOMAINS)] : [family]);
		const skills = skillIds.map(id => {
			const family = id.split(':')[0];
			const trained = sheet.skills.trained.includes(id);
			const requiresTraining = !trained && (['ladinagem', 'pilotagem', 'oficio',
				'adestramento-pokemon', 'montaria-pokemon'].includes(family) || id === 'conhecimento:organizacoes');
			const halfProficiency = !trained && sheet.talents.general.includes('conhecimento-diversificado') &&
				(sheet.talentSelections || []).some(selection => selection.id === 'conhecimento-diversificado' &&
					(selection.skill === id || selection.variant === id));
			const observationEligible = !trained && sheet.talents.general.includes('aprendizado-por-observacao') &&
				id !== 'conhecimento' && id !== 'oficio';
			return { id, trained, focused: sheet.skills.focused.includes(id), halfProficiency, requiresTraining,
				attributes: ['conhecimento', 'oficio'].includes(id) ? [] : rpgTrainerSkillAttributes(sheet, id),
				observationEligible,
				bonus: requiresTraining || ['conhecimento', 'oficio'].includes(id) ? null : rpgTrainerSkillBonus(sheet, id) };
		});
		const resistances = (['fortitude', 'reflexes', 'will'] as const).map(id => ({
			id, trained: sheet.resistances.includes(id), bonus: rpgTrainerResistanceBonus(sheet, id),
		}));
		const equipment = state.trainerInventory || rpgInitialTrainerInventory(sheet);
		const bag = state.inventory.bag;
		const bagWeight = ({ starter: 1, trainer: 1.5, adventurer: 2.5, expert: 3.5, master: 5, legendary: 6.5 })[
			RPGBagSystem.getTier(bag) || 'starter'];
		const derived = rpgTrainerDerivedStatistics(sheet, rpgEquipmentDerivedOptions(sheet, equipment,
			bag.items.reduce((total, item) => total + item.quantity, 0), bagWeight));
		const attacks = { melee: rpgTrainerAttackBonus(sheet, 'strength', false),
			ranged: rpgTrainerAttackBonus(sheet, 'dexterity', false) };
		const nextLevelXP = sheet.level >= 10 ? null : RPG_TRAINER_LEVEL_XP[sheet.level];
		return { sheet, xpToNextLevel: nextLevelXP === null ? null : Math.max(0, nextLevelXP - sheet.experience),
			nextLevelXP,
			eligibleLevel: rpgTrainerLevelForXP(sheet.experience),
			canLevelUp: sheet.level < rpgTrainerLevelForXP(sheet.experience) &&
				(sheet.levelUpReady || 0) > sheet.level &&
				!Object.values(sheet.pendingChoices || {}).some(count => count > 0),
			proficiency: rpgTrainerProficiency(sheet.level), skills, resistances, derived, attacks,
			rollTalents: [...rpgTrainerRollTalents(sheet), ...this.getTrainerAllyRollTalents(token, state.id)],
			supportCaches: this.getSession(token).mode === 'player' ? this.getSupportCaches(token) : [],
			helpTalents: this.getTrainerAllyHelpTalents(token, state.id),
			investigativePartner: sheet.talents.class.includes('detetive:parceiro-investigativo') ? {
				pokemonId: sheet.investigativePartnerPokemonId || null,
				pokemonName: RPGBoxManagement.view(state).results.find(pokemon =>
					pokemon.pokemonId === sheet.investigativePartnerPokemonId)?.name ||
					sheet.investigativePartnerName || null,
				unavailable: !!sheet.investigativePartnerUnavailable,
				canUnlink: this.getSession(token).role === 'master' &&
					this.getSession(token).mode === 'player' &&
					this.getSession(token).viewAsCharacterId === state.id,
				pokemon: RPGBoxManagement.view(state).results.map(pokemon => ({
					id: pokemon.pokemonId, name: pokemon.name, species: pokemon.species,
					spriteId: pokemon.spriteId, shiny: pokemon.shiny,
					level: pokemon.level, types: pokemon.types,
					friendship: [...state.box.party, ...state.box.boxes.flatMap(box => box.slots)
						.filter((entry): entry is NonNullable<typeof entry> => !!entry)]
						.find(entry => entry.pokemonId === pokemon.pokemonId)?.pokemon.rpg.friendship || 0,
				})).sort((a, b) => Number(b.friendship >= 50) - Number(a.friendship >= 50) ||
					a.name.localeCompare(b.name, 'pt-BR')),
			} : null,
			archiveRecipients: sheet.talents.class.includes('arqueologo:acervo-compartilhado') ?
				this.trainerArchiveRecipients(token) : [],
			scientistRecord: sheet.classId === 'cientista' ? {
				slots: sheet.scientistRecords || [], limit: rpgScientistRecordLimit(sheet),
				formulas: rpgScientistRecordFormulas(sheet).map(formula => ({ ...formula,
					charges: rpgScientistRecordProduction(formula.id, sheet, false).charges })),
				recipients: this.trainerRecordRecipients(token),
				allowCustom: sheet.talents.class.includes('cientista:registro-avancado'),
				pending: this.campaignSettings.customRecordRequests.filter(entry =>
					entry.characterId === state.id && entry.status === 'pending'),
			} : null,
			activeTalentUses: { restCycle: sheet.talentRestCycle || 0, used: sheet.talentUses || {} },
			comfortingArtRecipients: sheet.talents.class.includes('artista:arte-reconfortante') ?
				this.trainerArchiveRecipients(token) : [],
			revigoratingMeal: sheet.classId === 'cozinheiro' ? {
				available: (sheet.talentRestCycle || 0) > 0 &&
					sheet.talentUses?.['cozinheiro:refeicao-revigorante'] !== sheet.talentRestCycle,
				recipients: this.trainerArchiveRecipients(token).filter(person => {
					const target = this.repository.get(person.id)?.state.trainerSheet;
					return target?.revigoratingMealCycle !== (sheet.talentRestCycle || 0) &&
						rpgTrainerSurvival(target!).lifeState !== 'dead';
				}),
			} : null,
			friendshipSnacks: sheet.talents.class.includes('cozinheiro:petisco-de-amizade') ? {
				rations: ['racao-pokemon', 'racao-artesanal-pokemon'].map(itemId => ({ itemId,
					quantity: equipment.items.filter(item => item.itemId === itemId && item.location === 'bag')
						.reduce((sum, item) => sum + item.quantity, 0) })),
				recipients: this.trainerRecordRecipients(token).map(person => {
					const owner = this.repository.get(person.id)!;
					return { ...person, pokemon: [
						...owner.state.box.party,
						...owner.state.box.boxes.flatMap(box => box.slots).filter(entry => !!entry),
					].map(entry => ({ id: entry.pokemonId,
						name: entry.pokemon.name || entry.pokemon.species })) };
				}),
			} : null,
			enrichmentRoutine: sheet.talents.class.includes('criador-pokemon:rotina-de-enriquecimento') ||
				sheet.talents.apex === 'criador-pokemon:guardiao-de-geracoes' ? {
				guardian: sheet.talents.apex === 'criador-pokemon:guardiao-de-geracoes',
				guardianRemainingMs: Math.max(0, (sheet.guardianEnrichmentUsedAt || 0) + 7 * 86_400_000 -
				Date.parse(this.campaignSettings.currentDateTime)),
				recipients: this.trainerRecordRecipients(token).map(person => {
					const owner = this.repository.get(person.id)!;
					const now = Date.parse(this.campaignSettings.currentDateTime);
					return { ...person, pokemon: [
						...owner.state.box.party,
						...owner.state.box.boxes.flatMap(box => box.slots).filter(entry => !!entry),
					].map(entry => ({ id: entry.pokemonId, name: entry.pokemon.name || entry.pokemon.species,
						remainingMs: Math.max(0, (entry.pokemon.rpg.lastEnrichmentRoutineAt || 0) +
						2 * 86_400_000 - now) })) };
				}),
			} : null,
			impeccablePreparation: sheet.talents.class.includes('criador-pokemon:preparacao-impecavel') ? {
				recipients: this.trainerRecordRecipients(token).map(person => {
					const owner = this.repository.get(person.id)!;
					const now = Date.parse(this.campaignSettings.currentDateTime);
					return { ...person, pokemon: [
						...owner.state.box.party,
						...owner.state.box.boxes.flatMap(box => box.slots).filter(entry => !!entry),
					].map(entry => ({ id: entry.pokemonId, name: entry.pokemon.name || entry.pokemon.species,
						prepared: entry.metadata?.contestImpeccablePreparationAt === now })) };
				}),
			} : null,
			trainingReward: sheet.talents.class.includes('cozinheiro:recompensa-de-treinamento') ? {
				rations: ['racao-pokemon', 'racao-artesanal-pokemon'].map(itemId => ({ itemId,
					quantity: equipment.items.filter(item => item.itemId === itemId && item.location === 'bag')
						.reduce((sum, item) => sum + item.quantity, 0) })),
				recipients: this.trainerRecordRecipients(token).map(person => {
					const owner = this.repository.get(person.id)!;
					return { ...person, pokemon: owner.state.box.party
						.filter(entry => !entry.metadata?.breeding && !entry.metadata?.evTraining &&
							entry.metadata?.training !== 'roleplay')
						.map(entry => ({ id: entry.pokemonId, name: entry.pokemon.name || entry.pokemon.species,
							prepared: !!entry.metadata?.trainingReward })) };
				}),
			} : null,
			contestHarmonization: sheet.talents.class.includes('cozinheiro:harmonizacao-de-sabores') ? {
				chef: sheet.talents.apex === 'cozinheiro:chef-pokemon',
				availableFood: equipment.items.filter(item => item.itemId === 'alimento' && item.location === 'bag')
					.reduce((sum, item) => sum + item.quantity, 0),
				recipients: this.trainerRecordRecipients(token).map(person => {
					const owner = this.repository.get(person.id)!;
					return { ...person, pokemon: owner.state.box.party
						.filter(entry => !entry.metadata?.breeding && !entry.metadata?.evTraining &&
							entry.metadata?.training !== 'roleplay')
						.map(entry => ({ id: entry.pokemonId, name: entry.pokemon.name || entry.pokemon.species,
							prepared: !!entry.metadata?.contestHarmonization })) };
				}),
			} : null,
			choreography: sheet.classId === 'coreografo' ? {
				pokemon: state.box.party.filter(entry => !entry.metadata?.breeding && !entry.metadata?.evTraining &&
					entry.metadata?.training !== 'roleplay').map(entry => ({ id: entry.pokemonId,
					name: entry.pokemon.name || entry.pokemon.species, friendship: entry.pokemon.rpg.friendship || 0 })),
				recipients: this.trainerRecordRecipients(token).filter(person => person.id !== state.id).map(person => {
					const owner = this.repository.get(person.id)!;
					return { ...person, pokemon: owner.state.box.party.filter(entry => !entry.metadata?.breeding &&
						!entry.metadata?.evTraining && entry.metadata?.training !== 'roleplay')
						.map(entry => ({ id: entry.pokemonId, name: entry.pokemon.name || entry.pokemon.species })) };
				}),
				tags: [...new Set(getRPGContestMoveCatalog().flatMap(move => move.tags))].sort(),
				prepared: sheet.choreography || { rehearsals: [], formations: [] },
				groupRecipients: this.trainerArchiveRecipients(token),
				groupPreparations: sheet.choreographyGroups || [],
				proficiency: rpgTrainerProficiency(sheet.level),
				currentDateTime: this.campaignSettings.currentDateTime,
			} : null,
			artisanRation: sheet.talents.class.includes('cozinheiro:racao-artesanal-pokemon') ? {
				availableFood: equipment.items.filter(item => item.itemId === 'alimento' && item.location === 'bag')
					.reduce((sum, item) => sum + item.quantity, 0),
			} : null,
			captainPlan: sheet.talents.class.includes('atleta:capitao-de-time') ? {
				plan: sheet.captainPlan || null,
				recipients: this.trainerArchiveRecipients(token),
			} : null,
			capturePlan: sheet.talents.class.includes('detetive:plano-de-captura') ? {
				plan: sheet.capturePlan || null,
				recipients: this.trainerArchiveRecipients(token),
			} : null,
			introductionLetter: sheet.talents.class.includes('diplomata:carta-de-apresentacao') ? {
				letter: sheet.introductionLetter || null,
				recipients: this.trainerArchiveRecipients(token).filter(person => person.id !== state.id),
			} : null,
			diplomatProxy: sheet.talents.apex === 'diplomata:acordo-impossivel' ? {
				preparation: sheet.diplomatProxy || null,
				recipients: this.trainerArchiveRecipients(token).filter(person => person.id !== state.id),
				proficiency: rpgTrainerProficiency(sheet.level),
				currentDateTime: this.campaignSettings.currentDateTime,
			} : null,
			cosmopolitanEtiquette: sheet.talents.class.includes('diplomata:etiqueta-cosmopolita') ? {
				orientation: sheet.cosmopolitanEtiquette || null,
				recipients: this.trainerArchiveRecipients(token).filter(person => person.id !== state.id),
			} : null,
			supplierOrder: sheet.talents.class.includes('diplomata:canal-oficial') ? {
				pending: this.campaignSettings.supplierOrders.find(entry =>
					entry.characterId === state.id && entry.status === 'pending' && entry.source !== 'parallel-market') || null,
			} : null,
			parallelMarket: sheet.talents.class.includes('ladino:mercado-paralelo') ? {
				pending: this.campaignSettings.supplierOrders.find(entry =>
					entry.characterId === state.id && entry.status === 'pending' && entry.source === 'parallel-market') || null,
			} : null,
			publication: sheet.talents.class.includes('cientista:publicacao-de-referencia') ? {
				accepted: this.campaignSettings.publications.filter(entry =>
					entry.characterId === state.id && entry.status === 'accepted').length,
				pending: this.campaignSettings.publications.some(entry =>
					entry.characterId === state.id && entry.status === 'pending'),
			} : null,
			confidant: sheet.talents.class.includes('encantador:confidente') ? {
				name: sheet.confidantName || null,
				pending: this.campaignSettings.confidantRequests.find(entry =>
					entry.characterId === state.id && entry.status === 'pending') || null,
			} : null,
			forage: sheet.talents.class.includes('explorador:forrageador-eficiente') ? {
				pending: this.campaignSettings.forageRequests.find(entry =>
					entry.characterId === state.id && entry.status === 'pending') || null,
				foodQuantity: rpgTrainerProficiency(sheet.level),
			} : null,
			trueBond: sheet.talents.apex === 'encantador:laco-verdadeiro' ? {
				name: sheet.trueBondNpcName || null,
				pending: this.campaignSettings.trueBondRequests.find(entry =>
					entry.characterId === state.id && entry.status === 'pending') || null,
			} : null,
			persistentHypothesis: sheet.talents.class.includes('cientista:hipotese-persistente') ?
				sheet.persistentHypothesis || null : null,
			rerollAvailability: this.getTrainerRerollAvailability(token, state.id) };
	}

	updateTrainerPersistentHypothesis(token: string,
		input: { action: 'failure' | 'reset' }) {
		const session = this.getSession(token);
		if (session.mode !== 'player') throw new Error('Entre como jogador para registrar a pesquisa');
		const characterId = session.viewAsCharacterId || session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		const original = structuredClone(record);
		record.state.trainerSheet = rpgUpdatePersistentHypothesis(record.state.trainerSheet ||
			createRPGPendingTrainerSheet(), input);
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { hypothesis: structuredClone(record.state.trainerSheet.persistentHypothesis || null) };
	}

	consumeTrainerPersistentHypothesis(token: string, characterId: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || toID(session.viewAsCharacterId || session.characterId || '') !== toID(characterId)) {
			throw new Error('Treinador da pesquisa indisponível');
		}
		const record = this.requireCharacter(toID(characterId));
		const hypothesis = record.state.trainerSheet?.persistentHypothesis;
		if (!hypothesis?.failures || hypothesis.awaitingOutcome) throw new Error('Tentativa de pesquisa indisponível');
		const original = structuredClone(record);
		hypothesis.awaitingOutcome = true;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
	}

	useTrainerSheetTalent(token: string, talentId: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player') throw new Error('Entre como jogador para usar o talento');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		const original = structuredClone(record);
		const outcome = rpgUseTrainerSheetTalent(record.state.trainerSheet || createRPGPendingTrainerSheet(),
			talentId, this.random);
		record.state.trainerSheet = outcome.sheet;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { sheet: structuredClone(outcome.sheet), die: outcome.die, recovered: outcome.recovered };
	}

	/** Talentos de armadilhas consomem suas cargas reais do Kit de Ladinagem. */
	useTrainerTrapmaker(token: string, mode: 'basic' | 'combined' | 'labyrinth' = 'basic') {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const original = this.requireCharacter(toID(characterId));
		if (original.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		this.requireWorldBagItemUse(token, original.state.id);
		const actor = structuredClone(original);
		const talentId = mode === 'labyrinth' ? 'ladino:labirinto-de-gatilhos' :
			mode === 'combined' ? 'ladino:armadilha-combinada' : 'ladino:armadilheiro';
		const talentName = mode === 'labyrinth' ? 'Labirinto de Gatilhos' :
			mode === 'combined' ? 'Armadilha Combinada' : 'Armadilheiro';
		if (actor.state.trainerSheet?.status !== 'complete' ||
			!(mode === 'labyrinth' ? actor.state.trainerSheet.talents.apex === talentId :
			actor.state.trainerSheet.talents.class.includes(talentId))) {
			throw new Error(`Este treinador não possui ${talentName}`);
		}
		const requiredCharges = mode === 'labyrinth' ? 4 : mode === 'combined' ? 2 : 1;
		const inventory = this.ensureTrainerInventory(actor);
		const kits = inventory.items.filter(item => item.itemId.startsWith('kit-ladinagem-') &&
			item.location === 'bag' && item.quantity > 0);
		if (!kits.length) throw new Error('Você precisa de um Kit de Ladinagem na Bag');
		const kit = kits.find(item => (item.charges || 0) >= requiredCharges);
		if (!kit) throw new Error(mode === 'labyrinth' ?
			'O Kit de Ladinagem precisa de pelo menos quatro cargas' : mode === 'combined' ?
				'O Kit de Ladinagem precisa de pelo menos duas cargas' : 'O Kit de Ladinagem está sem cargas');
		kit.charges! -= requiredCharges;
		inventory.revision++;
		actor.state.updatedAt = this.now();
		this.validateTrainerInventory(actor);
		try { this.persistAtomically(() => this.repository.set(actor)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { chargesRemaining: kit.charges, kitInstanceId: kit.id };
	}

	/** Disfarce Social gasta uma carga real do kit, sem consumir o talento. */
	useTrainerSocialDisguise(token: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const previous = this.requireCharacter(toID(characterId));
		if (previous.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		this.requireWorldBagItemUse(token, previous.state.id);
		const actor = structuredClone(previous);
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('encantador:disfarce-social')) {
			throw new Error('Este treinador não possui Disfarce Social');
		}
		if (!sheet.proficiencies?.includes('kit-disfarce')) throw new Error('Domínio do Kit de Disfarce necessário');
		const inventory = this.ensureTrainerInventory(actor);
		const kits = inventory.items.filter(item => item.itemId === 'kit-disfarce' && item.location === 'bag');
		if (!kits.length) throw new Error('Você precisa de um Kit de Disfarce na Bag');
		const kit = kits.find(item => (item.charges || 0) > 0);
		if (!kit) throw new Error('O Kit de Disfarce está sem cargas');
		kit.charges!--;
		inventory.revision++;
		actor.state.updatedAt = this.now();
		this.validateTrainerInventory(actor);
		this.persistAtomically(() => this.repository.set(actor));
		return { chargesRemaining: kit.charges, kitInstanceId: kit.id };
	}

	/** O Artista distribui o benefício; cada descanso curto renova o limite de participantes. */
	useTrainerComfortingArt(token: string, recipientCharacterId: string, effect: 'will' | 'exhaustion') {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const actor = this.requireCharacter(toID(actorId));
		const source = actor.state.trainerSheet;
		if (!source || source.status !== 'complete' || !source.talents.class.includes('artista:arte-reconfortante')) {
			throw new Error('Este treinador não possui Arte Reconfortante');
		}
		if (effect !== 'will' && effect !== 'exhaustion') throw new Error('Benefício de Arte Reconfortante inválido');
		const restStartedAt = rpgTrainerSurvival(source).lastShortRest?.completedAt ?? -1;
		const target = this.requireCharacter(toID(recipientCharacterId));
		if (target.tableId !== session.platformTableId || !target.accountId ||
			this.accounts.repository.getMembership(session.platformTableId, target.accountId)?.status !== 'active' ||
			target.state.trainerSheet?.status !== 'complete') {
			throw new Error('Participante indisponível nesta mesa');
		}
		const previous = source.comfortingArtSession;
		const recipients = previous?.restStartedAt === restStartedAt ? previous.recipientCharacterIds : [];
		if (recipients.includes(target.state.id)) throw new Error('Participante já recebeu Arte Reconfortante neste descanso');
		if (recipients.length >= rpgTrainerProficiency(source.level)) {
			throw new Error('Limite de participantes de Arte Reconfortante atingido');
		}
		const originalActor = structuredClone(actor);
		const originalTarget = target === actor ? null : structuredClone(target);
		const nextActor = structuredClone(source);
		nextActor.comfortingArtSession = { restStartedAt,
			recipientCharacterIds: [...recipients, target.state.id] };
		let nextTarget = target === actor ? nextActor : structuredClone(target.state.trainerSheet!);
		if (effect === 'exhaustion') nextTarget = rpgTrainerReduceExhaustion(nextTarget);
		else nextTarget.comfortingArt = { sourceCharacterId: actor.state.id,
			sourceName: actor.state.characterName, restCycle: nextTarget.talentRestCycle || 0 };
		actor.state.trainerSheet = target === actor ? nextTarget : nextActor;
		actor.state.updatedAt = this.now();
		if (target !== actor) {
			target.state.trainerSheet = nextTarget;
			target.state.updatedAt = this.now();
		}
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (target !== actor) this.repository.set(target);
			});
		} catch (error) {
			this.repository.set(originalActor);
			if (originalTarget) this.repository.set(originalTarget);
			throw error;
		}
		return { effect, recipientCharacterId: target.state.id, sheet: structuredClone(nextTarget) };
	}

	/** Uma receita consome um Alimento por até cinco participantes; o resultado é uma cura humana, não um item. */
	useTrainerRevigoratingMeal(token: string, input: { requestId: string, dc: number, recipientCharacterIds: string[] }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			![10, 15, 20].includes(input.dc) || !Array.isArray(input.recipientCharacterIds) ||
			!input.recipientCharacterIds.length || input.recipientCharacterIds.length > 30 ||
			input.recipientCharacterIds.some(id => typeof id !== 'string') ||
			new Set(input.recipientCharacterIds).size !== input.recipientCharacterIds.length) {
			throw new Error('Escolha a CD e participantes diferentes para a refeição');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' || sheet.classId !== 'cozinheiro') {
			throw new Error('Refeição Revigorante exige um Cozinheiro com ficha completa');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify({
			dc: input.dc, recipients: input.recipientCharacterIds,
		})).digest('hex');
		const previous = sheet.revigoratingMealReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de refeição já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		const cycle = sheet.talentRestCycle || 0;
		if (!cycle || sheet.talentUses?.['cozinheiro:refeicao-revigorante'] === cycle) {
			throw new Error('Refeição Revigorante estará disponível após o próximo descanso longo de 8 horas');
		}
		this.requireBagRecord(token, actor.state.id, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const valid = new Set(this.trainerArchiveRecipients(token).map(person => person.id));
		const recipients = input.recipientCharacterIds.map(id => {
			if (!valid.has(id)) throw new Error('Participante indisponível nesta mesa');
			return id === actor.state.id ? actor : structuredClone(this.requireCharacter(toID(id)));
		});
		for (const target of recipients) {
			if (target.state.trainerSheet?.revigoratingMealCycle === cycle) {
				throw new Error(`${target.state.characterName} já recebeu Refeição Revigorante neste descanso`);
			}
			if (rpgTrainerSurvival(target.state.trainerSheet!).lifeState === 'dead') {
				throw new Error(`${target.state.characterName} não pode ser curado`);
			}
		}
		const foodCount = Math.ceil(recipients.length / 5);
		const inventory = this.ensureTrainerInventory(actor);
		const food = inventory.items.filter(item => item.itemId === 'alimento' && item.location === 'bag' && !item.equipped);
		if (food.reduce((sum, item) => sum + item.quantity, 0) < foodCount) {
			throw new Error(`Alimento insuficiente na Bag: ${foodCount} necessário(s)`);
		}
		let remaining = foodCount;
		for (const item of food) {
			const used = Math.min(item.quantity, remaining);
			item.quantity -= used; remaining -= used;
			if (!item.quantity) inventory.items.splice(inventory.items.indexOf(item), 1);
			if (!remaining) break;
		}
		const roll = rollRPGTrainerSkillCheck(sheet, 'oficio:culinaria', undefined,
			{ dc: input.dc, naturalFloor: sheet.talents.apex === 'cozinheiro:mestre-da-cozinha' ? 10 : 0 }, this.random);
		const healing = Math.max(1, rpgTrainerProficiency(sheet.level) + Math.floor((sheet.attributes!.wisdom - 10) / 2));
		const comfortingMeal = sheet.talents.class.includes('cozinheiro:refeicao-reconfortante');
		const recoveryNutrition = sheet.talents.class.includes('cozinheiro:nutricao-de-recuperacao');
		const recovered = recipients.map(target => {
			const targetSheet = target.state.trainerSheet!;
			const before = targetSheet.hitPoints.current || 0;
			const exhaustionBefore = rpgTrainerSurvival(targetSheet).exhaustion;
			target.state.trainerSheet = roll.success ? rpgTrainerHeal(targetSheet, healing) : targetSheet;
			if (roll.success && comfortingMeal && exhaustionBefore > 0) {
				target.state.trainerSheet = rpgTrainerReduceExhaustion(target.state.trainerSheet);
			}
			if (roll.success && recoveryNutrition) target.state.trainerSheet.nutritionRecoveryPending = true;
			target.state.trainerSheet.revigoratingMealCycle = cycle;
			target.state.updatedAt = this.now();
			return { id: target.state.id, name: target.state.characterName,
				recovered: (target.state.trainerSheet.hitPoints.current || 0) - before,
				exhaustionReduced: exhaustionBefore - rpgTrainerSurvival(target.state.trainerSheet).exhaustion };
		});
		const result = { dc: input.dc, natural: roll.natural, effectiveNatural: roll.effectiveNatural,
			total: roll.total, bonus: roll.total - roll.effectiveNatural,
			success: roll.success, foodConsumed: foodCount, healing: roll.success ? healing : 0, recipients: recovered };
		actor.state.trainerSheet!.talentUses = { ...actor.state.trainerSheet!.talentUses,
			'cozinheiro:refeicao-revigorante': cycle };
		actor.state.trainerSheet!.revigoratingMealReceipts = [
			...(actor.state.trainerSheet!.revigoratingMealReceipts || []).slice(-19),
			{ requestId: input.requestId, fingerprint, cycle, result },
		];
		inventory.revision++;
		this.validateTrainerInventory(actor);
		actor.state.updatedAt = this.now();
		const changed = [actor, ...recipients.filter(target => target !== actor)];
		const originals = changed.map(target => structuredClone(this.requireCharacter(target.state.id)));
		try { this.persistAtomically(() => { for (const target of changed) this.repository.set(target); }); } catch (error) {
			for (const original of originals) this.repository.set(original);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Um preparo usa a proporção 3:4, com uma rolagem por lote e sem consumir ingredientes na falha. */
	useTrainerArtisanRation(token: string, input: { requestId: string, foodQuantity: number }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			!Number.isSafeInteger(input.foodQuantity) || input.foodQuantity < 3 ||
			input.foodQuantity > 999 || input.foodQuantity % 3) {
			throw new Error('Escolha uma quantidade de Alimentos múltipla de 3');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('cozinheiro:racao-artesanal-pokemon')) {
			throw new Error('Este treinador não possui Ração Artesanal Pokémon');
		}
		const previous = sheet.artisanRationReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.foodQuantity !== input.foodQuantity) throw new Error('Identificador de preparo já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		this.requireBagRecord(token, actor.state.id, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const inventory = this.ensureTrainerInventory(actor);
		const foods = inventory.items.filter(item => item.itemId === 'alimento' && item.location === 'bag' &&
			!item.equipped);
		if (foods.reduce((sum, item) => sum + item.quantity, 0) < input.foodQuantity) {
			throw new Error('Alimentos insuficientes na Bag');
		}
		const kit = inventory.items.find(item => item.location === 'bag' && item.itemId.startsWith('kit-culinaria-'));
		if (!kit) throw new Error('Kit de Culinária necessário para preparar a ração');
		const kitBonus = rpgKitBonus(sheet, kit.itemId);
		if (kitBonus.disadvantage) throw new Error('Domínio do Kit de Culinária necessário');
		const check = rollRPGTrainerSkillCheck(sheet, 'oficio:culinaria', undefined,
			{ dc: 12, bonus: kitBonus.bonus,
				naturalFloor: sheet.talents.apex === 'cozinheiro:mestre-da-cozinha' ? 10 : 0 }, this.random);
		const produced = check.success ? input.foodQuantity / 3 * 4 : 0;
		if (produced) {
			let remaining = input.foodQuantity;
			for (const item of foods) {
				const used = Math.min(item.quantity, remaining);
				item.quantity -= used; remaining -= used;
				if (!item.quantity) inventory.items.splice(inventory.items.indexOf(item), 1);
				if (!remaining) break;
			}
			remaining = produced;
			for (const stack of inventory.items.filter(item => item.itemId === 'racao-artesanal-pokemon' &&
				item.location === 'bag' && !item.equipped && item.quantity < 9)) {
				const added = Math.min(remaining, 9 - stack.quantity);
				stack.quantity += added; remaining -= added;
				if (!remaining) break;
			}
			while (remaining) {
				const quantity = Math.min(9, remaining);
				inventory.items.push({ id: secureRandomBytes(12).toString('hex'),
					itemId: 'racao-artesanal-pokemon', quantity, equipped: false, location: 'bag' });
				remaining -= quantity;
			}
			inventory.revision++;
			this.validateTrainerInventory(actor);
		}
		const result = { foodQuantity: input.foodQuantity, produced, natural: check.natural,
			effectiveNatural: check.effectiveNatural,
			bonus: check.total - check.effectiveNatural, total: check.total, success: check.success };
		sheet.artisanRationReceipts = [...(sheet.artisanRationReceipts || []).slice(-29),
			{ requestId: input.requestId, foodQuantity: input.foodQuantity, result }];
		actor.state.updatedAt = this.now();
		const original = structuredClone(this.requireCharacter(actor.state.id));
		try { this.persistAtomically(() => this.repository.set(actor)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { result, repeated: false };
	}

	/** Reserva os pontos finais do próximo concurso do Pokémon, com consumo imediato do Alimento. */
	useTrainerContestHarmonization(token: string, input: { requestId: string, characterId: string,
		pokemonIds: string[], }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('Identificador de preparo inválido');
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('cozinheiro:harmonizacao-de-sabores')) {
			throw new Error('Este treinador não possui Harmonização de Sabores');
		}
		const maxPokemon = sheet.talents.apex === 'cozinheiro:chef-pokemon' ? 3 : 1;
		if (!Array.isArray(input.pokemonIds) || input.pokemonIds.length < 1 ||
			input.pokemonIds.length > maxPokemon || new Set(input.pokemonIds).size !== input.pokemonIds.length ||
			input.pokemonIds.some(id => typeof id !== 'string' || !id)) {
			throw new Error(`Escolha de um a ${maxPokemon} Pokémon diferentes`);
		}
		const fingerprint = createHash('sha256').update(JSON.stringify([input.characterId, input.pokemonIds])).digest('hex');
		const previous = sheet.contestHarmonizationReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de preparo já utilizado');
			return { result: previous.result, repeated: true };
		}
		if (!this.trainerRecordRecipients(token).some(person => person.id === input.characterId)) {
			throw new Error('Escolha um treinador da mesa');
		}
		this.requireBagRecord(token, actor.state.id, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const owner = input.characterId === actor.state.id ? actor :
			structuredClone(this.requireCharacter(toID(input.characterId)));
		if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
		const inventory = this.ensureTrainerInventory(actor);
		const foods = inventory.items.filter(item => item.itemId === 'alimento' && item.location === 'bag' &&
			!item.equipped);
		if (foods.reduce((sum, item) => sum + item.quantity, 0) < input.pokemonIds.length) {
			throw new Error(`São necessários ${input.pokemonIds.length} Alimentos na Bag`);
		}
		const names = input.pokemonIds.map(id => {
			const pokemon = RPGBoxManagement.pokemonSet(owner.state, id);
			return pokemon.name || pokemon.species;
		});
		RPGBoxManagement.prepareContestHarmonization(owner.state, input.pokemonIds, input.requestId);
		let remaining = input.pokemonIds.length;
		for (const food of foods) {
			const used = Math.min(food.quantity, remaining);
			food.quantity -= used; remaining -= used;
			if (!food.quantity) inventory.items.splice(inventory.items.indexOf(food), 1);
			if (!remaining) break;
		}
		inventory.revision++;
		const result = { names };
		sheet.contestHarmonizationReceipts = [...(sheet.contestHarmonizationReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		this.validateTrainerInventory(actor);
		const originals = [actor.state.id, owner.state.id].filter((id, index, ids) => ids.indexOf(id) === index)
			.map(id => structuredClone(this.requireCharacter(id)));
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (owner !== actor) this.repository.set(owner);
			});
		} catch (error) {
			for (const original of originals) this.repository.set(original);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Registra ensaios no relógio da mesa; preparos breves não sobrevivem à próxima hora sem uso. */
	prepareTrainerChoreography(token: string, input: { requestId: string,
		kind: 'rehearsal' | 'formation' | 'guest' | 'theme' | 'instinct' | 'warmup' | 'evacuation',
		characterId?: string, pokemonIds?: string[], tag?: string,
		recipientCharacterIds?: string[], activity?: string, }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			!['rehearsal', 'formation', 'guest', 'theme', 'instinct', 'warmup', 'evacuation'].includes(input.kind)) {
			throw new Error('Preparo coreográfico inválido');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.classId !== 'coreografo') {
			throw new Error('Este treinador não é Coreógrafo');
		}
		const ids = input.pokemonIds || [];
		if (!Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length ||
			ids.some(id => typeof id !== 'string' || !id)) throw new Error('Escolha Pokémon diferentes');
		const fingerprint = createHash('sha256').update(JSON.stringify([input.kind, input.characterId || '', ids,
			input.tag || '', input.recipientCharacterIds || [], input.activity || ''])).digest('hex');
		const choreography = sheet.choreography ||= { rehearsals: [], formations: [] };
		const previous = choreography.receipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de ensaio já utilizado');
			return { result: previous.result, repeated: true };
		}
		const targetId = input.kind === 'guest' ? toID(input.characterId) : actor.state.id;
		if (input.kind === 'guest' && (!sheet.talents.class.includes('coreografo:diretor-convidado') ||
			!this.trainerRecordRecipients(token).some(person => person.id === targetId) || targetId === actor.state.id)) {
			throw new Error('Escolha outro treinador da mesa para Diretor Convidado');
		}
		const target = targetId === actor.state.id ? actor : structuredClone(this.requireCharacter(targetId));
		if (target.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const now = Date.parse(this.campaignSettings.currentDateTime);
		const after = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();
		const names: string[] = [];
		if (!['theme', 'warmup', 'evacuation'].includes(input.kind)) {
			const expected = input.kind === 'guest' ? ids.length : input.kind === 'formation' ?
				(sheet.talents.class.includes('coreografo:formacao-em-trio') && ids.length === 3 ? 3 : 2) : 1;
			if (!expected || ids.length !== expected) throw new Error(`Escolha ${expected || 1} Pokémon para este preparo`);
			for (const id of ids) {
				const entry = target.state.box.party.find(pokemon => pokemon.pokemonId === id);
				if (!entry || entry.metadata?.breeding || entry.metadata?.evTraining ||
					entry.metadata?.training === 'roleplay') throw new Error('Escolha Pokémon disponíveis na equipe');
				names.push(entry.pokemon.name || entry.pokemon.species);
			}
		}
		let readyAt = this.campaignSettings.currentDateTime;
		if (input.kind === 'warmup' || input.kind === 'evacuation') {
			const talentId = input.kind === 'warmup' ? 'coreografo:preparacao-corporal-conjunta' :
				'coreografo:conducao-de-evacuacao';
			if (!sheet.talents.class.includes(talentId)) throw new Error('Preparação coletiva não aprendida');
			const recipients = input.recipientCharacterIds || [];
			const limit = rpgTrainerProficiency(sheet.level) * (input.kind === 'evacuation' ? 2 : 1);
			if (!Array.isArray(recipients) || !recipients.length || recipients.length > limit ||
				new Set(recipients).size !== recipients.length ||
					recipients.some(id => !this.trainerArchiveRecipients(token).some(person => person.id === id))) {
				throw new Error(`Escolha de um a ${limit} participantes da mesa`);
			}
			const activity = String(input.activity || '').trim();
			if (!activity || activity.length > 100) throw new Error('Descreva a atividade em até 100 caracteres');
			sheet.choreographyGroups = [...(sheet.choreographyGroups || []).filter(entry => entry.kind !== input.kind),
				{ kind: input.kind, activity, recipientCharacterIds: [...recipients],
					usedRecipientIds: [], expiresAt: after(1) }];
		} else if (input.kind === 'rehearsal') {
			choreography.rehearsals = [...choreography.rehearsals.filter(entry => entry.pokemonId !== ids[0]),
				{ pokemonId: ids[0], readyAt: after(1) }];
			readyAt = after(1);
		} else if (input.kind === 'formation') {
			const required = ids.length === 3 ? 'coreografo:formacao-em-trio' : 'coreografo:formacao-em-dupla';
			if (!sheet.talents.class.includes(required)) throw new Error('Formação não aprendida');
			if (!ids.every(id => choreography.rehearsals.some(entry => entry.pokemonId === id &&
				Date.parse(entry.readyAt) <= now))) throw new Error('Ensaie individualmente com todos os Pokémon primeiro');
			readyAt = after(ids.length === 3 ? 2 : 1);
			choreography.formations = [...choreography.formations.filter(entry =>
				entry.pokemonIds.length !== ids.length || !entry.pokemonIds.every(id => ids.includes(id))),
			{ pokemonIds: [...ids], readyAt }];
		} else if (input.kind === 'guest') {
			readyAt = after(1);
			const guestSheet = target.state.trainerSheet;
			if (guestSheet?.status !== 'complete') throw new Error('O convidado precisa ter ficha concluída');
			const guest = guestSheet.choreography ||= { rehearsals: [], formations: [] };
			if (guest.guestDirection && Date.parse(guest.guestDirection.expiresAt) > now) {
				throw new Error('Este participante já possui Diretor Convidado');
			}
			guest.guestDirection = { directorId: actor.state.id, pokemonIds: [...ids],
				readyAt, expiresAt: after(2) };
		} else if (input.kind === 'theme') {
			if (!sheet.talents.class.includes('coreografo:tema-unificado')) throw new Error('Tema Unificado não aprendido');
			const tag = String(input.tag || '').trim().toLowerCase();
			if (!tag || !getRPGContestMoveCatalog().some(move => move.tags.includes(tag))) {
				throw new Error('Escolha um tema presente nos golpes do concurso');
			}
			choreography.theme = { tag, expiresAt: after(1) };
		} else {
			if (sheet.talents.apex !== 'coreografo:entrosamento-instintivo') {
				throw new Error('Entrosamento Instintivo não aprendido');
			}
			const entry = target.state.box.party.find(pokemon => pokemon.pokemonId === ids[0]);
			if (!entry || (entry.pokemon.rpg.friendship || 0) < 50) throw new Error('Pokémon requer 50 de amizade');
			choreography.instinct = { pokemonId: ids[0], expiresAt: after(1) };
		}
		const result = { kind: input.kind, names, readyAt };
		choreography.receipts = [...(choreography.receipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		const originalActor = this.requireCharacter(actor.state.id);
		const originalTarget = target === actor ? undefined : this.requireCharacter(target.state.id);
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (target !== actor) this.repository.set(target);
			});
		} catch (error) {
			this.repository.set(originalActor);
			if (originalTarget) this.repository.set(originalTarget);
			throw error;
		}
		return { result, repeated: false };
	}

	trainerContestChoreography(characterId: string, teamIndexes: readonly number[]) {
		const record = this.repository.get(characterId);
		const sheet = record?.state.trainerSheet;
		const choreography = sheet?.choreography;
		const now = Date.parse(this.campaignSettings.currentDateTime);
		const pokemonIds = teamIndexes.map(index => record?.state.box.party[index]?.pokemonId || '');
		const rehearsed = pokemonIds.map(id => !!id && !!choreography?.rehearsals.some(entry =>
			entry.pokemonId === id && Date.parse(entry.readyAt) <= now) ||
			!!id && choreography?.instinct?.pokemonId === id && Date.parse(choreography.instinct.expiresAt) > now);
		const formation = !!choreography?.formations.some(entry => Date.parse(entry.readyAt) <= now &&
			entry.pokemonIds.length === pokemonIds.length && entry.pokemonIds.every(id => pokemonIds.includes(id))) &&
			rehearsed.every(Boolean);
		const guest = choreography?.guestDirection;
		return { rehearsed, formation,
			themeTag: choreography?.theme && Date.parse(choreography.theme.expiresAt) > now ? choreography.theme.tag : null,
			guest: !!guest && Date.parse(guest.readyAt) <= now && Date.parse(guest.expiresAt) > now &&
				guest.pokemonIds.length === pokemonIds.length && guest.pokemonIds.every(id => pokemonIds.includes(id)),
		};
	}

	contestHarmonizationPrepared(characterId: string, teamIndexes: readonly number[]): boolean {
		const record = this.repository.get(characterId);
		return !!record && RPGBoxManagement.contestHarmonizationPrepared(record.state, teamIndexes);
	}

	contestImpeccablePreparationPrepared(characterId: string, teamIndexes: readonly number[]): boolean {
		const record = this.repository.get(characterId);
		if (!record) return false;
		const now = Date.parse(this.campaignSettings.currentDateTime);
		return teamIndexes.some(index => record.state.box.party[index]?.metadata?.contestImpeccablePreparationAt === now);
	}

	consumeContestHarmonization(characterId: string, teamIndexes: readonly number[]): void {
		const record = this.repository.get(characterId);
		if (!record || !RPGBoxManagement.consumeContestHarmonization(record.state, teamIndexes)) return;
		this.persistBoxRecord(record);
	}

	/** O início do concurso consome, em uma transação, todos os preparos usados ou desperdiçados. */
	consumeContestHarmonizations(participants: readonly { characterId?: string, teamIndexes: number[] }[]): void {
		const originals = new Map<string, RPGStoredCharacter>();
		const changed: RPGStoredCharacter[] = [];
		for (const participant of participants) {
			if (!participant.characterId) continue;
			const original = this.repository.get(participant.characterId);
			if (!original) continue;
			const record = structuredClone(original);
			let modified = RPGBoxManagement.consumeContestHarmonization(record.state, participant.teamIndexes);
			for (const index of participant.teamIndexes) {
				const entry = record.state.box.party[index];
				if (entry?.metadata?.contestImpeccablePreparationAt === undefined) continue;
				delete entry.metadata.contestImpeccablePreparationAt;
				modified = true;
			}
			const choreography = record.state.trainerSheet?.choreography;
			if (choreography?.theme || choreography?.guestDirection) {
				delete choreography.theme;
				delete choreography.guestDirection;
				modified = true;
			}
			if (!modified) continue;
			originals.set(record.state.id, structuredClone(original));
			record.state.updatedAt = this.now();
			changed.push(record);
		}
		if (!changed.length) return;
		try { this.persistAtomically(() => { for (const record of changed) this.repository.set(record); }); } catch (error) {
			for (const original of originals.values()) this.repository.set(original);
			throw error;
		}
	}

	/** Prepara uma única sessão futura de treinamento, consumindo a ração agora. */
	useTrainerTrainingReward(token: string, input: { requestId: string, rationItemId: string,
		characterId: string, pokemonId: string, }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			!['racao-pokemon', 'racao-artesanal-pokemon'].includes(input.rationItemId)) {
			throw new Error('Escolha uma Ração Pokémon válida');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('cozinheiro:recompensa-de-treinamento')) {
			throw new Error('Este treinador não possui Recompensa de Treinamento');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify([input.rationItemId,
			input.characterId, input.pokemonId])).digest('hex');
		const previous = sheet.trainingRewardReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de recompensa já utilizado');
			return { result: previous.result, repeated: true };
		}
		if (!this.trainerRecordRecipients(token).some(person => person.id === input.characterId)) {
			throw new Error('Escolha um treinador da mesa');
		}
		this.requireBagRecord(token, actor.state.id, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const owner = input.characterId === actor.state.id ? actor :
			structuredClone(this.requireCharacter(toID(input.characterId)));
		if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
		const inventory = this.ensureTrainerInventory(actor);
		const ration = inventory.items.find(item => item.itemId === input.rationItemId &&
			item.location === 'bag' && !item.equipped && item.quantity > 0);
		if (!ration) throw new Error('É necessária uma Ração Pokémon na Bag');
		const pokemon = RPGBoxManagement.pokemonSet(owner.state, input.pokemonId);
		RPGBoxManagement.prepareTrainingReward(owner.state, input.pokemonId);
		ration.quantity--;
		if (!ration.quantity) inventory.items.splice(inventory.items.indexOf(ration), 1);
		inventory.revision++;
		const result = { name: pokemon.name || pokemon.species };
		sheet.trainingRewardReceipts = [...(sheet.trainingRewardReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		this.validateTrainerInventory(actor);
		const originals = [actor.state.id, owner.state.id].filter((id, index, ids) => ids.indexOf(id) === index)
			.map(id => structuredClone(this.requireCharacter(id)));
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (owner !== actor) this.repository.set(owner);
			});
		} catch (error) {
			for (const original of originals) this.repository.set(original);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Uma Ração Pokémon prepara três porções imediatas; só Pokémon persistidos recebem amizade automática. */
	useTrainerFriendshipSnack(token: string, input: { requestId: string, rationItemId?: string,
		servings: { characterId?: string, pokemonId?: string, otherPokemon?: string }[], }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			!Array.isArray(input.servings) || !input.servings.length || input.servings.length > 3 ||
			input.servings.some(serving => !serving || typeof serving !== 'object')) {
			throw new Error('Escolha de um a três Pokémon para os petiscos');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('cozinheiro:petisco-de-amizade')) {
			throw new Error('Este treinador não possui Petisco de Amizade');
		}
		const rationItemId = input.rationItemId || 'racao-pokemon';
		if (!['racao-pokemon', 'racao-artesanal-pokemon'].includes(rationItemId)) {
			throw new Error('Escolha uma Ração Pokémon válida');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify({ rationItemId,
			servings: input.servings })).digest('hex');
		const previous = sheet.friendshipSnackReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de petiscos já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		this.requireBagRecord(token, actor.state.id, 'bag:edit');
		this.requireWorldBagItemUse(token, actor.state.id);
		const inventory = this.ensureTrainerInventory(actor);
		const ration = inventory.items.find(item => item.itemId === rationItemId && item.location === 'bag' &&
			!item.equipped && item.quantity > 0);
		if (!ration) throw new Error('É necessária uma Ração Pokémon na Bag');
		const available = new Set(this.trainerRecordRecipients(token).map(person => person.id));
		const records = new Map<string, RPGStoredCharacter>([[actor.state.id, actor]]);
		const used = new Set<string>();
		const at = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isFinite(at)) throw new Error('Horário da campanha inválido');
		const served = input.servings.map(serving => {
			if (typeof serving.otherPokemon === 'string' && serving.otherPokemon.trim()) {
				const name = serving.otherPokemon.trim();
				if (name.length > 80) throw new Error('Nome do outro Pokémon muito longo');
				return { name, friendshipGained: null };
			}
			if (!serving.characterId || !serving.pokemonId || !available.has(serving.characterId)) {
				throw new Error('Escolha um treinador e um de seus Pokémon');
			}
			const key = `${serving.characterId}:${serving.pokemonId}`;
			if (used.has(key)) throw new Error('Cada Pokémon pode receber somente um petisco por preparo');
			used.add(key);
			let owner = records.get(serving.characterId);
			if (!owner) {
				owner = structuredClone(this.requireCharacter(toID(serving.characterId)));
				if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
				records.set(serving.characterId, owner);
			}
			const target = RPGBoxManagement.itemTarget(owner.state, serving.pokemonId);
			const last = target.state.lastFriendshipSnackAt;
			let gained = 0;
			if (last === undefined || at - last >= 7 * 86_400_000) {
				const current = Math.max(0, Math.min(255, target.state.friendship ?? 50));
				gained = Math.min(255 - current, sheet.talents.apex === 'cozinheiro:chef-pokemon' ? 10 : 5);
				target.state.friendship = current + gained;
				target.state.lastFriendshipSnackAt = at;
				RPGBoxManagement.applyItemState(owner.state, serving.pokemonId, target.state, owner.state.box.revision);
			}
			owner.state.updatedAt = this.now();
			return { name: RPGBoxManagement.pokemonSet(owner.state, serving.pokemonId).name ||
				RPGBoxManagement.pokemonSet(owner.state, serving.pokemonId).species, friendshipGained: gained };
		});
		ration.quantity--;
		if (!ration.quantity) inventory.items.splice(inventory.items.indexOf(ration), 1);
		inventory.revision++;
		const result = { served };
		sheet.friendshipSnackReceipts = [...(sheet.friendshipSnackReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		actor.state.updatedAt = this.now();
		this.validateTrainerInventory(actor);
		const originals = [...records.keys()].map(id => structuredClone(this.requireCharacter(id)));
		try { this.persistAtomically(() => { for (const record of records.values()) this.repository.set(record); }); } catch (error) {
			for (const original of originals) this.repository.set(original);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Aplica a amizade da rotina uma vez por Pokémon a cada dois dias de campanha. */
	useTrainerEnrichmentRoutine(token: string, input: { requestId: string, characterId: string, pokemonId: string }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) {
			throw new Error('Identificador da rotina inválido');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('criador-pokemon:rotina-de-enriquecimento')) {
			throw new Error('Este treinador não possui Rotina de Enriquecimento');
		}
		const characterId = toID(input.characterId);
		const pokemonId = String(input.pokemonId || '');
		if (!characterId || !pokemonId || !this.trainerRecordRecipients(token).some(person => person.id === characterId)) {
			throw new Error('Escolha um treinador ativo nesta mesa');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify({ characterId, pokemonId })).digest('hex');
		const previous = sheet.enrichmentRoutineReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador da rotina já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		const owner = actor.state.id === characterId ? actor :
			structuredClone(this.requireCharacter(characterId));
		if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
		const now = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isFinite(now)) throw new Error('Horário da campanha inválido');
		const target = RPGBoxManagement.itemTarget(owner.state, pokemonId);
		const last = target.state.lastEnrichmentRoutineAt;
		if (last !== undefined && now - last < 2 * 86_400_000) {
			throw new Error('Este Pokémon já recebeu a Rotina de Enriquecimento nos últimos dois dias');
		}
		const current = Math.max(0, Math.min(255, target.state.friendship ?? 50));
		const friendshipGained = Math.min(5, 255 - current);
		target.state.friendship = current + friendshipGained;
		target.state.lastEnrichmentRoutineAt = now;
		RPGBoxManagement.applyItemState(owner.state, pokemonId, target.state, owner.state.box.revision);
		const result = { name: RPGBoxManagement.pokemonSet(owner.state, pokemonId).name ||
			RPGBoxManagement.pokemonSet(owner.state, pokemonId).species,
		friendshipGained, availableAt: now + 2 * 86_400_000 };
		sheet.enrichmentRoutineReceipts = [...(sheet.enrichmentRoutineReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		actor.state.updatedAt = this.now(); owner.state.updatedAt = this.now();
		const originalActor = structuredClone(this.requireCharacter(actor.state.id));
		const originalOwner = owner === actor ? null : structuredClone(this.requireCharacter(owner.state.id));
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (owner !== actor) this.repository.set(owner);
			});
		} catch (error) {
			this.repository.set(originalActor);
			if (originalOwner) this.repository.set(originalOwner);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Uma rotina em grupo usa um único intervalo de sete dias e grava todos os donos atomicamente. */
	useTrainerGuardianEnrichment(token: string, input: {
		requestId: string, pokemon: { characterId: string, pokemonId: string }[],
	}) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		if (!input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) || !Array.isArray(input.pokemon) ||
			input.pokemon.length < 1 || input.pokemon.length > 6) throw new Error('Escolha de rotina inválida');
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.talents.apex !== 'criador-pokemon:guardiao-de-geracoes') {
			throw new Error('Este treinador não possui Guardião de Gerações');
		}
		const pokemon = input.pokemon.map(entry => ({ characterId: toID(entry.characterId),
			pokemonId: String(entry.pokemonId || '') }));
		const keys = pokemon.map(entry => `${entry.characterId}:${entry.pokemonId}`);
		if (keys.some(key => key.endsWith(':')) || new Set(keys).size !== keys.length) {
			throw new Error('Escolha cada Pokémon apenas uma vez');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify(pokemon)).digest('hex');
		const previous = sheet.guardianEnrichmentReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador da rotina já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		const now = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isFinite(now)) throw new Error('Horário da campanha inválido');
		if (sheet.guardianEnrichmentUsedAt !== undefined && now - sheet.guardianEnrichmentUsedAt < 7 * 86_400_000) {
			throw new Error('Guardião de Gerações estará disponível após sete dias de campanha');
		}
		const allowed = new Set(this.trainerRecordRecipients(token).map(person => person.id));
		const owners = new Map<string, typeof actor>([[actor.state.id, actor]]);
		const resultPokemon: { name: string, friendshipGained: number }[] = [];
		for (const entry of pokemon) {
			if (!allowed.has(entry.characterId) || !entry.pokemonId) throw new Error('Escolha um treinador ativo nesta mesa');
			let owner = owners.get(entry.characterId);
			if (!owner) {
				owner = structuredClone(this.requireCharacter(entry.characterId));
				if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
				owners.set(entry.characterId, owner);
			}
			const target = RPGBoxManagement.itemTarget(owner.state, entry.pokemonId);
			const last = target.state.lastEnrichmentRoutineAt;
			if (last !== undefined && now - last < 2 * 86_400_000) {
				throw new Error('Um dos Pokémon já recebeu a Rotina de Enriquecimento nos últimos dois dias');
			}
			const current = Math.max(0, Math.min(255, target.state.friendship ?? 50));
			const friendshipGained = Math.min(5, 255 - current);
			target.state.friendship = current + friendshipGained;
			target.state.lastEnrichmentRoutineAt = now;
			RPGBoxManagement.applyItemState(owner.state, entry.pokemonId, target.state, owner.state.box.revision);
			const set = RPGBoxManagement.pokemonSet(owner.state, entry.pokemonId);
			resultPokemon.push({ name: set.name || set.species, friendshipGained });
		}
		const result = { pokemon: resultPokemon, availableAt: now + 7 * 86_400_000 };
		sheet.guardianEnrichmentUsedAt = now;
		sheet.guardianEnrichmentReceipts = [...(sheet.guardianEnrichmentReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		const originals = [...owners.keys()].map(id => structuredClone(this.requireCharacter(id)));
		for (const owner of owners.values()) owner.state.updatedAt = this.now();
		try { this.persistAtomically(() => { for (const owner of owners.values()) this.repository.set(owner); }); } catch (error) {
			for (const original of originals) this.repository.set(original);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Prepara um Pokémon para seu próximo concurso, sem alterar golpes ou notas dos jurados. */
	useTrainerImpeccablePreparation(token: string, input: { requestId: string, characterId: string, pokemonId: string }) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId || !input || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) {
			throw new Error('Preparação Impecável inválida');
		}
		const actor = structuredClone(this.requireCharacter(toID(actorId)));
		if (actor.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = actor.state.trainerSheet;
		if (sheet?.status !== 'complete' || !sheet.talents.class.includes('criador-pokemon:preparacao-impecavel')) {
			throw new Error('Este treinador não possui Preparação Impecável');
		}
		const characterId = toID(input.characterId);
		const pokemonId = String(input.pokemonId || '');
		if (!characterId || !pokemonId || !this.trainerRecordRecipients(token).some(person => person.id === characterId)) {
			throw new Error('Escolha um treinador ativo nesta mesa');
		}
		const fingerprint = createHash('sha256').update(JSON.stringify({ characterId, pokemonId })).digest('hex');
		const previous = sheet.impeccablePreparationReceipts?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador da preparação já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		const owner = actor.state.id === characterId ? actor : structuredClone(this.requireCharacter(characterId));
		if (owner.tableId !== session.platformTableId) throw new Error('Pokémon fora da mesa atual');
		const entry = [...owner.state.box.party, ...owner.state.box.boxes.flatMap(box => box.slots).filter(Boolean)]
			.find(candidate => candidate?.pokemonId === pokemonId);
		if (!entry) throw new Error('Pokémon não encontrado com este treinador');
		const now = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isFinite(now)) throw new Error('Horário da campanha inválido');
		entry.metadata = { ...entry.metadata, contestImpeccablePreparationAt: now };
		owner.state.box.revision++;
		const result = { name: entry.pokemon.name || entry.pokemon.species };
		sheet.impeccablePreparationReceipts = [...(sheet.impeccablePreparationReceipts || []).slice(-29),
			{ requestId: input.requestId, fingerprint, result }];
		actor.state.updatedAt = this.now(); owner.state.updatedAt = this.now();
		const originalActor = structuredClone(this.requireCharacter(actor.state.id));
		const originalOwner = owner === actor ? null : structuredClone(this.requireCharacter(owner.state.id));
		try {
			this.persistAtomically(() => {
				this.repository.set(actor);
				if (owner !== actor) this.repository.set(owner);
			});
		} catch (error) {
			this.repository.set(originalActor);
			if (originalOwner) this.repository.set(originalOwner);
			throw error;
		}
		return { result, repeated: false };
	}

	/** Remove o bônus preparado somente após a mensagem da resistência ter sido gravada. */
	consumeTrainerComfortingArt(token: string, characterId: string) {
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (!sheet?.comfortingArt) return;
		const original = structuredClone(record);
		delete sheet.comfortingArt;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
	}

	setTrainerInvestigativePartner(token: string, pokemonId: string | null) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' ||
			!sheet.talents.class.includes('detetive:parceiro-investigativo')) {
			throw new Error('Este treinador não possui Parceiro Investigativo');
		}
		if (pokemonId === null) {
			if (session.role !== 'master') throw new Error('Somente o Mestre pode desvincular o parceiro');
			if (!sheet.investigativePartnerPokemonId) throw new Error('Nenhum parceiro vinculado');
		} else {
			if (sheet.investigativePartnerPokemonId) throw new Error('O Parceiro Investigativo já foi escolhido');
			const entry = [...record.state.box.party, ...record.state.box.boxes.flatMap(box => box.slots)]
				.find(candidate => candidate?.pokemonId === pokemonId);
			if (!entry) throw new Error('Escolha um Pokémon seu da equipe ou da Box');
			if ((entry.pokemon.rpg.friendship || 0) < 50) {
				throw new Error('O Pokémon precisa de pelo menos 50 de Amizade');
			}
		}
		const previous = structuredClone(record);
		if (pokemonId === null) {
			delete sheet.investigativePartnerPokemonId;
			delete sheet.investigativePartnerName;
			delete sheet.investigativePartnerUnavailable;
		} else {
			sheet.investigativePartnerPokemonId = pokemonId;
			sheet.investigativePartnerName = RPGBoxManagement.pokemonSet(record.state, pokemonId).name ||
				RPGBoxManagement.pokemonSet(record.state, pokemonId).species;
			sheet.investigativePartnerUnavailable = false;
		}
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { pokemonId: sheet.investigativePartnerPokemonId || null };
	}

	setTrainerTrustedPartnerName(token: string, name: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' ||
			!sheet.talents.class.includes('detetive:parceiro-de-confianca')) {
			throw new Error('Este treinador não possui Parceiro de Confiança');
		}
		if (typeof name !== 'string' || name.trim().length > 80) {
			throw new Error('O nome do parceiro deve ter até 80 caracteres');
		}
		const previous = structuredClone(record);
		sheet.trustedPartnerName = name.trim();
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { name: sheet.trustedPartnerName };
	}

	setTrainerCosmopolitanEtiquette(token: string, community: string, dc: number,
		recipientCharacterIds: string[]) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.classId !== 'diplomata' ||
			!sheet.talents.class.includes('diplomata:etiqueta-cosmopolita') ||
			!sheet.skills.trained.includes('conhecimento:regioes')) {
			throw new Error('Etiqueta Cosmopolita indisponível');
		}
		if (typeof community !== 'string' || !community.trim() || community.trim().length > 80) {
			throw new Error('Informe a comunidade em até 80 caracteres');
		}
		if (![10, 15, 20].includes(dc)) throw new Error('Escolha uma das três CDs da comunidade');
		if (!Array.isArray(recipientCharacterIds) || recipientCharacterIds.some(id => typeof id !== 'string') ||
			new Set(recipientCharacterIds).size !== recipientCharacterIds.length ||
				recipientCharacterIds.length > rpgTrainerProficiency(sheet.level)) {
			throw new Error('Escolha até seu bônus de proficiência em aliados diferentes');
		}
		const valid = new Set(this.trainerArchiveRecipients(token).filter(person => person.id !== record.state.id)
			.map(person => person.id));
		if (recipientCharacterIds.some(id => !valid.has(id))) throw new Error('Aliado indisponível nesta mesa');
		const roll = rollRPGTrainerSkillCheck(sheet, 'conhecimento:regioes', undefined, { dc }, this.random);
		if (roll.success) {
			const previous = structuredClone(record);
			sheet.cosmopolitanEtiquette = {
				community: community.trim(), recipientCharacterIds: [record.state.id, ...recipientCharacterIds],
			};
			record.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
				this.repository.set(previous); throw error;
			}
		}
		return { roll, orientation: structuredClone(sheet.cosmopolitanEtiquette || null) };
	}

	setTrainerCaptainPlan(token: string, recipientCharacterIds: string[]) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' || !sheet.talents.class.includes('atleta:capitao-de-time')) {
			throw new Error('Este treinador não possui Capitão de Time');
		}
		if (!Array.isArray(recipientCharacterIds) ||
			recipientCharacterIds.some(id => typeof id !== 'string') ||
			new Set(recipientCharacterIds).size !== recipientCharacterIds.length ||
				recipientCharacterIds.length > rpgTrainerProficiency(sheet.level)) {
			throw new Error('Escolha até seu bônus de proficiência em aliados diferentes');
		}
		const valid = new Set(this.trainerArchiveRecipients(token)
			.map(person => person.id));
		if (recipientCharacterIds.some(id => !valid.has(id))) throw new Error('Aliado indisponível nesta mesa');
		const original = structuredClone(record);
		if (recipientCharacterIds.length) sheet.captainPlan = {
			description: 'Atividade física em equipe', recipientCharacterIds,
		};
		else throw new Error('Escolha ao menos um participante para o plano');
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { plan: structuredClone(sheet.captainPlan || null) };
	}

	setTrainerCapturePlan(token: string, description: string, recipientCharacterIds: string[]) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' || !sheet.talents.class.includes('detetive:plano-de-captura')) {
			throw new Error('Este treinador não possui Plano de Captura');
		}
		if (!Array.isArray(recipientCharacterIds) ||
			recipientCharacterIds.some(id => typeof id !== 'string') ||
			new Set(recipientCharacterIds).size !== recipientCharacterIds.length ||
				recipientCharacterIds.length > rpgTrainerProficiency(sheet.level)) {
			throw new Error('Escolha até seu bônus de proficiência em participantes diferentes');
		}
		const valid = new Set(this.trainerArchiveRecipients(token).map(person => person.id));
		if (recipientCharacterIds.some(id => !valid.has(id))) throw new Error('Participante indisponível nesta mesa');
		const detail = typeof description === 'string' ? description.trim() : '';
		if (recipientCharacterIds.length && (!detail || detail.length > 160)) {
			throw new Error('Descreva a abordagem e o alvo em até 160 caracteres');
		}
		const original = structuredClone(record);
		sheet.capturePlan = recipientCharacterIds.length ? {
			description: detail, recipientCharacterIds: [...recipientCharacterIds], usedRecipientIds: [],
			readyAt: new Date(Date.parse(this.campaignSettings.currentDateTime) + 30 * 60_000).toISOString(),
		} : undefined;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(original); throw error;
		}
		return { plan: structuredClone(sheet.capturePlan || null) };
	}

	setTrainerIntroductionLetter(token: string, recipientCharacterId: string, institution: string, subject: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.classId !== 'diplomata' ||
			!sheet.talents.class.includes('diplomata:carta-de-apresentacao')) {
			throw new Error('Este treinador não possui Carta de Apresentação');
		}
		if (typeof recipientCharacterId !== 'string' || typeof institution !== 'string' ||
			typeof subject !== 'string') throw new Error('Dados da carta inválidos');
		const recipientId = toID(recipientCharacterId);
		if (recipientId) {
			if (recipientId === record.state.id || !this.trainerArchiveRecipients(token)
				.some(person => person.id === recipientId)) throw new Error('Escolha um aliado ativo nesta mesa');
			if (!institution.trim() || institution.trim().length > 80 ||
				!subject.trim() || subject.trim().length > 160) {
				throw new Error('Informe a instituição e o assunto da carta nos limites indicados');
			}
		} else if (institution.trim() || subject.trim()) throw new Error('Escolha o destinatário da carta');
		const previous = structuredClone(record);
		sheet.introductionLetter = recipientId ? { id: secureRandomBytes(12).toString('hex'), recipientCharacterId: recipientId,
			institution: institution.trim(), subject: subject.trim(), used: false } : undefined;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { letter: structuredClone(sheet.introductionLetter || null) };
	}

	setTrainerDiplomatProxy(token: string, recipients: {
		characterId: string, proposal: string, audience: string,
	}[]) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!actorId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(actorId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		const sheet = record.state.trainerSheet;
		if (sheet?.status !== 'complete' || sheet.classId !== 'diplomata' ||
			sheet.talents.apex !== 'diplomata:acordo-impossivel') {
			throw new Error('Este treinador não possui Voz por Procuração');
		}
		if (!Array.isArray(recipients) || recipients.length > rpgTrainerProficiency(sheet.level) ||
			recipients.some(entry => !entry || typeof entry.characterId !== 'string' ||
				typeof entry.proposal !== 'string' || typeof entry.audience !== 'string')) {
			throw new Error('Escolha até seu bônus de proficiência em aliados diferentes');
		}
		const ids = recipients.map(entry => toID(entry.characterId));
		const valid = new Set(this.trainerArchiveRecipients(token).filter(person => person.id !== record.state.id)
			.map(person => person.id));
		if (new Set(ids).size !== ids.length || ids.some(id => !id || !valid.has(id))) {
			throw new Error('Aliado indisponível ou repetido nesta mesa');
		}
		if (recipients.some(entry => !entry.proposal.trim() || entry.proposal.trim().length > 160 ||
			!entry.audience.trim() || entry.audience.trim().length > 100)) {
			throw new Error('Informe a proposta e o interlocutor de cada aliado nos limites indicados');
		}
		const previous = structuredClone(record);
		const readyAt = Date.parse(this.campaignSettings.currentDateTime) + 10 * 60_000;
		if (!Number.isFinite(readyAt)) throw new Error('Relógio da campanha indisponível');
		sheet.diplomatProxy = recipients.length ? {
			id: secureRandomBytes(12).toString('hex'), readyAt: new Date(readyAt).toISOString(),
			expiresAt: new Date(readyAt + 24 * 60 * 60_000).toISOString(),
			recipients: recipients.map((entry, index) => ({ characterId: ids[index],
				proposal: entry.proposal.trim(), audience: entry.audience.trim(), used: false })),
		} : undefined;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { preparation: structuredClone(sheet.diplomatProxy || null) };
	}

	consumeTrainerDiplomatProxyRoll(token: string, characterId: string, keys: readonly string[]): void {
		const session = this.getSession(token);
		if (!session.platformTableId) return;
		for (const key of keys.filter(value => value.startsWith('diplomata:acordo-impossivel@'))) {
			const [sourceId, preparationId] = key.split('@')[1].split(':');
			const original = this.repository.get(sourceId);
			if (!original || original.tableId !== session.platformTableId || !original.accountId ||
				this.accounts.repository.getMembership(session.platformTableId, original.accountId)?.status !== 'active') continue;
			const source = structuredClone(original);
			const preparation = source.state.trainerSheet?.diplomatProxy;
			const target = preparation?.recipients.find(entry => entry.characterId === characterId && !entry.used);
			if (!preparation || preparation.id !== preparationId || !target ||
				Date.parse(preparation.readyAt) > Date.parse(this.campaignSettings.currentDateTime) ||
				Date.parse(preparation.expiresAt) <= Date.parse(this.campaignSettings.currentDateTime)) continue;
			target.used = true;
			source.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(source)); } catch (error) {
				this.repository.set(original); throw error;
			}
		}
	}

	consumeTrainerIntroductionLetterRoll(token: string, characterId: string, keys: readonly string[]): void {
		const session = this.getSession(token);
		if (!session.platformTableId) return;
		for (const key of keys.filter(value => value.startsWith('diplomata:carta-de-apresentacao@'))) {
			const [sourceId, letterId] = key.split('@')[1].split(':');
			const original = this.repository.get(sourceId);
			if (!original || original.tableId !== session.platformTableId || !original.accountId ||
				this.accounts.repository.getMembership(session.platformTableId, original.accountId)?.status !== 'active') continue;
			const source = structuredClone(original);
			const sheet = source.state.trainerSheet;
			if (sheet?.classId !== 'diplomata' || !sheet.talents.class.includes('diplomata:carta-de-apresentacao') ||
				!sheet.introductionLetter || sheet.introductionLetter.used ||
				sheet.introductionLetter.id !== letterId ||
				sheet.introductionLetter.recipientCharacterId !== characterId) continue;
			sheet.introductionLetter.used = true;
			source.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(source)); } catch (error) {
				this.repository.set(original); throw error;
			}
		}
	}

	consumeTrainerCapturePlanRoll(token: string, characterId: string, keys: readonly string[]): void {
		const session = this.getSession(token);
		if (!session.platformTableId) return;
		for (const key of keys.filter(value => value.startsWith('detetive:plano-de-captura@'))) {
			const sourceId = key.split('@')[1];
			const original = this.repository.get(sourceId);
			if (!original || original.tableId !== session.platformTableId || !original.accountId ||
				this.accounts.repository.getMembership(session.platformTableId, original.accountId)?.status !== 'active') continue;
			const source = structuredClone(original);
			const sheet = source.state.trainerSheet;
			const plan = sheet?.capturePlan;
			if (!sheet?.talents.class.includes('detetive:plano-de-captura') || !plan ||
				!plan.recipientCharacterIds.includes(characterId) || plan.usedRecipientIds.includes(characterId)) continue;
			plan.usedRecipientIds.push(characterId);
			source.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(source)); } catch (error) {
				this.repository.set(original); throw error;
			}
		}
	}

	/** Guarda a referência da rolagem real do chat; texto enviado pelo usuário não entra neste registro. */
	recordTrainerChatRoll(token: string, kind: 'attribute' | 'skill' | 'resistance', label: string,
		bonusTerms: string,
		posted: { id: string, message: string, createdAt: number },
		result: { natural: number, effectiveNatural?: number, total: number, dice: number[],
			mode: 'normal' | 'advantage' | 'disadvantage', }, naturalFloor = 0,
		naturalFloorSource?: string) {
		const session = this.getSession(token);
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId || !session.platformAccountId) throw new Error('Treinador da rolagem indisponível');
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete') throw new Error('Ficha não concluída');
		const roll: RPGTrainerChatRoll = { messageId: posted.id, message: posted.message, label, bonusTerms,
			authorAccountId: session.platformAccountId, kind, mode: result.mode,
			diceCount: result.dice.length, bonus: result.total - (result.effectiveNatural ?? result.natural),
			...(naturalFloor ? { naturalFloor } : {}),
			...(naturalFloorSource ? { naturalFloorSource } : {}),
			campaignTime: this.campaignSettings.currentDateTime, createdAt: posted.createdAt };
		sheet.lastChatRolls = { ...sheet.lastChatRolls, any: roll,
			...(kind === 'resistance' ? { resistance: roll } : {}),
			...(kind === 'skill' ? { skill: roll } : {}) };
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}

	getTrainerRerollAvailability(token: string, characterId: string) {
		const session = this.getSession(token);
		const state = this.getCharacter(token, characterId);
		const sheet = state.trainerSheet;
		const current = this.campaignSettings.currentDateTime;
		return { sortudo: !!rpgTrainerRerollCandidate(sheet, 'sortudo', session.platformAccountId,
			current, this.now()),
		determinado: !!rpgTrainerRerollCandidate(sheet, 'determinado', session.platformAccountId,
			current, this.now()),
		'esforco-heroico': !!rpgTrainerRerollCandidate(sheet, 'esforco-heroico', session.platformAccountId,
			current, this.now()) };
	}

	/** Aplica o talento ao último teste elegível e atualiza sua mensagem original na mesma transação. */
	async rerollTrainerChatTalent(token: string, talentId: 'sortudo' | 'determinado' | 'esforco-heroico') {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId || !session.platformAccountId ||
			!this.mysqlPersistence) throw new Error('Entre como jogador em uma mesa para repetir a rolagem');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		if (!['sortudo', 'determinado', 'esforco-heroico'].includes(talentId)) {
			throw new Error('Talento de alteração de teste inválido');
		}
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete' || !sheet.talents.general.includes(talentId)) {
			throw new Error('Este treinador não possui o talento');
		}
		const cycle = sheet.talentRestCycle || 0;
		if (sheet.talentUses?.[talentId] === cycle) throw new Error('Talento já usado neste descanso longo');
		if (talentId === 'esforco-heroico' &&
			(sheet.survival?.exhaustion || 0) >= 5) throw new Error('Exaustão alta demais para Esforço Heroico');
		const candidate = rpgTrainerRerollCandidate(sheet, talentId, session.platformAccountId,
			this.campaignSettings.currentDateTime, this.now());
		if (!candidate) {
			throw new Error('Nenhuma rolagem elegível desde o último avanço do relógio');
		}
		const original = await this.mysqlPersistence.getTableChatRollMessage(session.platformTableId,
			session.platformAccountId, candidate.messageId, this.now());
		if (original !== candidate.message) throw new Error('A rolagem original não está mais disponível');
		const heroic = talentId === 'esforco-heroico';
		const reroll = heroic ? null : rpgTrainerRerollMessage(original, candidate, talentId, this.random);
		const exhausted = heroic ? rpgTrainerAddExhaustion(sheet, 1) : structuredClone(sheet);
		const message = heroic ? rpgTrainerHeroicMessage(original, exhausted.survival!.exhaustion) : reroll!.message;
		const previous = structuredClone(record);
		const next = exhausted;
		next.talentUses = { ...next.talentUses, [talentId]: cycle };
		for (const roll of Object.values(next.lastChatRolls || {})) {
			if (roll?.messageId === candidate.messageId) roll.rerolled = true;
		}
		record.state.trainerSheet = next;
		record.state.updatedAt = this.now();
		try {
			this.persistAtomically(() => {
				this.mysqlPersistence!.markTableChatRollRerolled(session.platformTableId!,
					session.platformAccountId!, candidate.messageId, original, message, talentId);
				this.repository.set(record);
			});
		} catch (error) { this.repository.set(previous); throw error; }
		return { messageId: candidate.messageId, message, ...(reroll || {}), talentId,
			...(heroic ? { exhaustion: next.survival!.exhaustion } : {}) };
	}

	/** Exibe apenas treinadores de contas ativas da mesa atual; a mesma busca valida a rolagem. */
	getTrainerAllyRollTalents(token: string, characterId: string, attribute?: RPGTrainerAttribute) {
		return [...this.enchanterAllyOptions(token, characterId), ...this.detectiveDuoOptions(token, characterId),
			...this.diplomatProxyOptions(token, characterId, attribute),
			...this.cosmopolitanEtiquetteOptions(token, characterId),
			...this.diplomatIntroductionOptions(token, characterId),
			...this.encouragingPresenceOptions(token, characterId),
			...this.choreographyGroupOptions(token, characterId),
			...this.teamCaptainOptions(token, characterId),
			...this.detectiveCapturePlanOptions(token, characterId),
			...this.expeditionLeaderOptions(token, characterId),
			...this.explorerLifelineOptions(token, characterId),
			...this.artisticInspirationOptions(token, characterId),
			...this.technicalOpinionOptions(token, characterId),
			...this.photographicSequenceOptions(token, characterId),
			...this.photographicPanoramaOptions(token, characterId),
			...this.guardPerimeterOptions(token, characterId),
			...this.commanderOperationOptions(token, characterId),
			...this.captivatingDistractionOptions(token, characterId),
			...this.excavationMasterOptions(token, characterId),
			...this.sharedArchiveOptions(token, characterId)];
	}

	private enchanterAllyOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => record.state.trainerSheet ? rpgEnchanterAllyOptions(record.state.id,
				record.state.characterName, record.state.trainerSheet) : []);
	}

	private getTrainerAllyHelpTalents(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgEnchanterSocialChemistryOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private diplomatProxyOptions(token: string, characterId: string, attribute?: RPGTrainerAttribute) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		const recipient = this.repository.get(characterId);
		if (!recipient || recipient.tableId !== session.platformTableId || !recipient.state.trainerSheet) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgDiplomatProxyOption(record.state.id,
					record.state.characterName, record.state.trainerSheet, characterId,
					recipient.state.trainerSheet!, this.campaignSettings.currentDateTime, attribute);
				return option ? [option] : [];
			});
	}

	private cosmopolitanEtiquetteOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.tableId === session.platformTableId &&
			record.accountId && this.accounts.repository.getMembership(session.platformTableId!,
			record.accountId)?.status === 'active').flatMap(record => {
			const option = record.state.trainerSheet && rpgCosmopolitanEtiquetteOption(record.state.id,
				record.state.characterName, record.state.trainerSheet, characterId);
			return option ? [option] : [];
		});
	}

	private diplomatIntroductionOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgDiplomatIntroductionOption(record.state.id,
					record.state.characterName, record.state.trainerSheet, characterId);
				return option ? [option] : [];
			});
	}

	private detectiveDuoOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		const record = this.repository.get(characterId);
		if (!record || record.tableId !== session.platformTableId) return [];
		const sheet = record.state.trainerSheet;
		const partner = record.state.box.party.find(entry =>
			entry.pokemonId === sheet?.investigativePartnerPokemonId);
		if (!sheet || !partner || partner.metadata?.evTraining ||
			this.isPokemonBreeding(characterId, partner.pokemonId) ||
			partner.pokemon.rpg.hp !== undefined && partner.pokemon.rpg.hp <= 0) return [];
		const species = Dex.mod('gen9').species.get(partner.pokemon.species);
		if (!species.exists) return [];
		const option = rpgDetectiveDuoOption(sheet,
			partner.pokemon.name || partner.pokemon.species, species.baseStats.spa);
		return option ? [option] : [];
	}

	private choreographyGroupOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		const options = this.repository.list().filter(record =>
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => record.state.trainerSheet ? rpgChoreographyGroupOption(record.state.id,
				record.state.characterName, record.state.trainerSheet, characterId,
				this.campaignSettings.currentDateTime) : []);
		const self = this.repository.get(characterId);
		if (self?.tableId === session.platformTableId && self.state.trainerSheet?.classId === 'coreografo') {
			const prep = self.state.trainerSheet.choreography;
			const now = Date.parse(this.campaignSettings.currentDateTime);
			if (self.state.box.party.some(pokemon =>
				prep?.rehearsals.some(entry => entry.pokemonId === pokemon.pokemonId &&
					Date.parse(entry.readyAt) <= now) ||
					prep?.instinct?.pokemonId === pokemon.pokemonId && Date.parse(prep.instinct.expiresAt) > now)) {
				options.push({ key: 'coreografo:ensaio-conjunto', id: 'coreografo:ensaio-conjunto',
					name: 'Ensaio Conjunto', bonus: 2, advantage: false,
					condition: 'Atuação conjunta com Pokémon ensaiado e disposto da equipe ativa.',
					targets: ['skill:atuacao'] });
			}
		}
		return options;
	}

	consumeTrainerChoreographyRoll(token: string, characterId: string, keys: readonly string[]): void {
		const session = this.getSession(token);
		if (!session.platformTableId) return;
		for (const key of keys.filter(value => value.startsWith('coreografo:warmup@'))) {
			const sourceId = key.split('@')[1];
			const original = this.repository.get(sourceId);
			if (!original || original.tableId !== session.platformTableId) continue;
			const source = structuredClone(original);
			const group = source.state.trainerSheet?.choreographyGroups?.find(entry => entry.kind === 'warmup');
			if (!group || !group.recipientCharacterIds.includes(characterId) ||
				group.usedRecipientIds.includes(characterId)) continue;
			group.usedRecipientIds.push(characterId);
			try { this.persistAtomically(() => this.repository.set(source)); } catch (error) {
				this.repository.set(original); throw error;
			}
		}
	}

	private teamCaptainOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record =>
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgTeamCaptainOption(record.state.id,
					record.state.characterName, record.state.trainerSheet, characterId);
				return option ? [option] : [];
			});
	}

	private detectiveCapturePlanOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record =>
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgDetectiveCapturePlanOption(record.state.id,
					record.state.characterName, record.state.trainerSheet, characterId,
					this.campaignSettings.currentDateTime);
				return option ? [option] : [];
			});
	}

	private expeditionLeaderOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgExpeditionLeaderOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private explorerLifelineOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgExplorerLifelineOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private trainerArchiveRecipients(token: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.tableId === session.platformTableId &&
			record.accountId && record.state.trainerSheet?.status === 'complete' &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.map(record => ({ id: record.state.id, name: record.state.characterName }));
	}

	private trainerRecordRecipients(token: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.tableId === session.platformTableId &&
			record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.map(record => ({ id: record.state.id, name: record.state.characterName }));
	}

	setTrainerScientistRecord(token: string, slot: number, entry: {
		formulaId: string, recipientCharacterId: string,
	} | null) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		if (entry && !this.trainerRecordRecipients(token).some(person => person.id === entry.recipientCharacterId)) {
			throw new Error('Destinatário indisponível nesta mesa');
		}
		const previous = structuredClone(record);
		record.state.trainerSheet = rpgSetScientistRecord(record.state.trainerSheet ||
			createRPGPendingTrainerSheet(), slot, entry);
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { records: structuredClone(record.state.trainerSheet.scientistRecords) };
	}

	/** O servidor valida autoria, treinamento, vagas e vínculo do destinatário à mesma mesa. */
	setTrainerSharedArchive(token: string, slot: number, entry: {
		topic: string, knowledge: string, recipientCharacterId: string,
	} | null) {
		const session = this.getSession(token);
		if (session.mode !== 'player' || !session.platformTableId) throw new Error('Entre como jogador em uma mesa');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		if (record.tableId !== session.platformTableId) throw new Error('Personagem fora da mesa atual');
		if (entry && !this.trainerArchiveRecipients(token).some(person => person.id === entry.recipientCharacterId)) {
			throw new Error('Destinatário indisponível nesta mesa');
		}
		const previous = structuredClone(record);
		record.state.trainerSheet = rpgSetSharedArchive(record.state.trainerSheet ||
			createRPGPendingTrainerSheet(), slot, entry);
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
			this.repository.set(previous); throw error;
		}
		return { archives: structuredClone(record.state.trainerSheet.sharedArchives) };
	}

	private sharedArchiveOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.tableId === session.platformTableId &&
			record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => record.state.trainerSheet ? rpgSharedArchiveOptions(record.state.id,
				record.state.characterName, record.state.trainerSheet, characterId) : []);
	}

	private encouragingPresenceOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgEncouragingPresenceOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private artisticInspirationOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgArtisticInspirationOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private technicalOpinionOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgTechnicalOpinionOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private photographicSequenceOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgPhotographicSequenceOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private photographicPanoramaOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgPhotographicPanoramaOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private guardPerimeterOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgGuardPerimeterOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private commanderOperationOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgCommanderOperationOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private captivatingDistractionOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgCaptivatingDistractionOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	private excavationMasterOptions(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return [];
		return this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.flatMap(record => {
				const option = record.state.trainerSheet && rpgExcavationMasterOption(record.state.id,
					record.state.characterName, record.state.trainerSheet);
				return option ? [option] : [];
			});
	}

	/** Catálogo público da mesa; a consulta ainda exige sessão válida na mesa selecionada. */
	getTrainerRules(token: string) {
		this.getSession(token);
		return {
			attributes: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
			skills: RPG_SKILL_ATTRIBUTES, difficulties: RPG_DIFFICULTIES,
			resistances: ['fortitude', 'reflexes', 'will'],
			classes: structuredClone(RPG_TRAINER_CLASSES),
			classFeatures: structuredClone(RPG_TRAINER_CLASS_FEATURES),
			equipment: RPG_EQUIPMENT_CATALOG,
		};
	}

	getTrainerActivities(token: string, characterId?: string) {
		const state = this.getCharacter(token, characterId);
		return { activities: structuredClone(state.trainerSheet?.activities || {}),
			recipes: RPG_CRAFT_RECIPES };
	}

	/** O Mestre arbitra a cena; tempo, contadores e inventário vêm sempre do servidor. */
	applyTrainerActivity(token: string, input: {
		characterId: string, requestId: string,
		action: { type: 'exposure', exposure: Omit<RPGExposure, 'consecutiveTests'> } |
			{ type: 'camp', difficulty: 10 | 15 | 20 | 25, adequateShelter: boolean,
				foodAvailable: boolean, waterAvailable: boolean, safeLocation: boolean, } |
				{ type: 'travel-start', hex: RPGHex } |
				{ type: 'travel-reset', hex: RPGHex } |
				{ type: 'travel-advance', leg: RPGTravelLeg, hoursBudget: number } |
				{ type: 'craft-start', recipeId: string } |
				{ type: 'craft-complete', craftId: string } |
				{ type: 'record-use', sourceCharacterId: string, slot: number } |
				{ type: 'record-start', sourceCharacterId: string, slot: number } |
				{ type: 'record-complete', craftId: string } |
				{ type: 'record-cancel', craftId: string } |
				{ type: 'excavation', coordinatorCharacterId: string, skill: string,
					attribute?: RPGTrainerAttribute, dc: number, },
	}) {
		if (!input || typeof input.characterId !== 'string' ||
			!(/^[a-zA-Z0-9_-]{8,100}$/).test(input.requestId) ||
			!input.action || typeof input.action !== 'object') throw new Error('Atividade inválida');
		const session = this.getSession(token);
		if (session.mode === 'player' && (input.action.type === 'craft-start' ||
			input.action.type === 'craft-complete' || input.action.type === 'record-use' ||
			input.action.type === 'record-start' ||
			input.action.type === 'record-complete' || input.action.type === 'record-cancel')) {
			const actorId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
			if (!session.platformTableId || !actorId || toID(input.characterId) !== actorId) {
				throw new Error('Fabricação permitida apenas ao próprio treinador');
			}
		} else {
			this.requireMasterMode(token);
			this.requirePlatformTablePermission(token, 'characters.manage');
		}
		const original = this.requireCharacter(toID(input.characterId));
		if (session.mode === 'player' && original.tableId !== session.platformTableId) {
			throw new Error('Personagem fora da mesa atual');
		}
		if (input.action.type === 'record-use' || input.action.type === 'record-start' ||
			input.action.type === 'record-complete') {
			this.requireWorldBagItemUse(token, original.state.id);
		}
		const actor = structuredClone(original);
		const sheet = actor.state.trainerSheet;
		if (!sheet || sheet.status !== 'complete') throw new Error('Treinador sem ficha completa');
		const activities = sheet.activities ||= {};
		const fingerprint = createHash('sha256').update(JSON.stringify(input.action)).digest('hex');
		const receipt = activities.receipts?.find(entry => entry.id === input.requestId);
		if (receipt) {
			if (receipt.fingerprint !== fingerprint) throw new Error('Identificador de atividade já utilizado');
			return { result: structuredClone(receipt.result), repeated: true };
		}
		const action = input.action;
		const now = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isSafeInteger(now)) throw new Error('Tempo da campanha inválido');
		let result: Record<string, unknown>;
		switch (action.type) {
			case 'record-use': {
				if (!session.platformTableId || typeof action.sourceCharacterId !== 'string' ||
					!Number.isSafeInteger(action.slot) || action.slot < 0) throw new Error('Registro inválido');
				const source = this.requireCharacter(toID(action.sourceCharacterId));
				if (source.tableId !== session.platformTableId || !source.accountId ||
					this.accounts.repository.getMembership(session.platformTableId, source.accountId)?.status !== 'active') {
					throw new Error('Cientista indisponível nesta mesa');
				}
				const sourceSheet = source.state.trainerSheet;
				const entry = sourceSheet?.scientistRecords?.find(item => item.slot === action.slot);
				if (!sourceSheet || !entry || entry.recipientCharacterId !== actor.state.id ||
					action.slot >= rpgScientistRecordLimit(sourceSheet)) throw new Error('Registro não pertence a este treinador');
				const production = rpgScientistRecordProduction(entry.formulaId, sourceSheet,
					source.state.id === actor.state.id, entry.custom);
				const inventory = this.ensureTrainerInventory(actor);
				const kit = this.scientificKitForRecord(inventory, production.minimumKitTier, production.charges);
				kit.charges = (kit.charges || 0) - production.charges;
				result = { formulaName: production.formula.name, effect: production.formula.effect,
					minutes: production.minutes, chargesConsumed: production.charges, kitInstanceId: kit.id };
				break;
			}
			case 'record-start': {
				if (!session.platformTableId || typeof action.sourceCharacterId !== 'string' ||
					!Number.isSafeInteger(action.slot) || action.slot < 0) throw new Error('Registro inválido');
				const source = this.requireCharacter(toID(action.sourceCharacterId));
				if (source.tableId !== session.platformTableId || !source.accountId ||
					this.accounts.repository.getMembership(session.platformTableId, source.accountId)?.status !== 'active') {
					throw new Error('Cientista indisponível nesta mesa');
				}
				const sourceSheet = source.state.trainerSheet;
				const entry = sourceSheet?.scientistRecords?.find(item => item.slot === action.slot);
				if (!sourceSheet || !entry || entry.recipientCharacterId !== actor.state.id ||
					action.slot >= rpgScientistRecordLimit(sourceSheet)) throw new Error('Registro não pertence a este treinador');
				const production = rpgScientistRecordProduction(entry.formulaId, sourceSheet,
					source.state.id === actor.state.id, entry.custom);
				if ((activities.recordCrafts || []).some(craft => craft.sourceCharacterId === source.state.id &&
					craft.slot === action.slot && craft.formulaId === entry.formulaId &&
					craft.completedAt === undefined && craft.cancelledAt === undefined)) {
					throw new Error('Esta fórmula já está em preparação');
				}
				if ((activities.recordCrafts || []).filter(craft =>
					craft.completedAt === undefined && craft.cancelledAt === undefined).length >= 20) {
					throw new Error('Há preparações demais em andamento');
				}
				const inventory = this.ensureTrainerInventory(actor);
				this.scientificKitForRecord(inventory, production.minimumKitTier, production.charges);
				const craft = { id: input.requestId, sourceCharacterId: source.state.id, slot: action.slot,
					formulaId: entry.formulaId, startedAt: now };
				(activities.recordCrafts ||= []).push(craft);
				result = { craft, minutes: production.minutes, charges: production.charges,
					formulaName: production.formula.name }; break;
			}
			case 'record-cancel':
			case 'record-complete': {
				const craft = activities.recordCrafts?.find(item => item.id === action.craftId &&
					item.completedAt === undefined && item.cancelledAt === undefined);
				if (!craft) throw new Error('Preparação indisponível');
				if (action.type === 'record-cancel') {
					craft.cancelledAt = now;
					result = { craft, cancelled: true }; break;
				}
				if (!session.platformTableId) throw new Error('Mesa indisponível');
				const source = this.requireCharacter(craft.sourceCharacterId);
				const sourceSheet = source.state.trainerSheet;
				const entry = sourceSheet?.scientistRecords?.find(item => item.slot === craft.slot);
				if (source.tableId !== session.platformTableId || !source.accountId ||
					this.accounts.repository.getMembership(session.platformTableId, source.accountId)?.status !== 'active' ||
					!sourceSheet || !entry || entry.recipientCharacterId !== actor.state.id ||
					entry.formulaId !== craft.formulaId || craft.slot >= rpgScientistRecordLimit(sourceSheet)) {
					throw new Error('O Registro Reprodutível foi alterado ou retirado');
				}
				const production = rpgScientistRecordProduction(craft.formulaId, sourceSheet,
					source.state.id === actor.state.id, entry.custom);
				if (now - craft.startedAt < production.minutes * 60_000) {
					throw new Error('A preparação ainda não atingiu o tempo necessário');
				}
				const inventory = this.ensureTrainerInventory(actor);
				const kit = this.scientificKitForRecord(inventory, production.minimumKitTier, production.charges);
				kit.charges = (kit.charges || 0) - production.charges;
				craft.completedAt = now;
				result = { craft, formulaName: production.formula.name, effect: production.formula.effect,
					chargesConsumed: production.charges, kitInstanceId: kit.id }; break;
			}
			case 'excavation': {
				const session = this.getSession(token);
				if (!session.platformTableId || original.tableId !== session.platformTableId ||
					typeof action.coordinatorCharacterId !== 'string') {
					throw new Error('Escavação fora da mesa atual');
				}
				const coordinator = this.requireCharacter(toID(action.coordinatorCharacterId));
				if (coordinator.tableId !== original.tableId || !coordinator.accountId ||
					this.accounts.repository.getMembership(original.tableId!, coordinator.accountId)?.status !== 'active') {
					throw new Error('Coordenador indisponível nesta mesa');
				}
				result = { ...resolveRPGMasterExcavation(sheet,
					coordinator.state.trainerSheet || createRPGPendingTrainerSheet(), action, this.random),
				coordinatorCharacterId: coordinator.state.id };
				break;
			}
			case 'exposure': {
				if (!action.exposure || typeof action.exposure !== 'object') throw new Error('Exposição inválida');
				const kind = action.exposure.kind;
				const previous = activities.exposureTests?.[kind] || 0;
				const outcome = resolveRPGExposure(sheet,
					{ ...action.exposure, consecutiveTests: previous }, this.random);
				Object.assign(sheet, outcome.sheet);
				(activities.exposureTests ||= {})[kind] = outcome.exposure.consecutiveTests;
				result = { check: outcome.check, damage: outcome.damage, avoided: outcome.avoided,
					consecutiveTests: outcome.exposure.consecutiveTests }; break;
			}
			case 'camp': {
				const { type, ...conditions } = action;
				result = prepareRPGCamp(sheet, conditions, this.random); break;
			}
			case 'travel-start': {
				if (activities.travel) throw new Error('Viagem já iniciada');
				activities.travel = createRPGTravelState(action.hex);
				result = { travel: activities.travel }; break;
			}
			case 'travel-reset': {
				activities.travel = createRPGTravelState(action.hex);
				result = { travel: activities.travel }; break;
			}
			case 'travel-advance': {
				if (!activities.travel) throw new Error('Viagem não iniciada');
				const inventory = this.ensureTrainerInventory(actor);
				const bag = RPGInventorySystem.migrate(actor.state.inventory).bag;
				const pokemonQuantity = bag.items.reduce((sum, entry) => sum + entry.quantity, 0);
				const carriedKg = rpgEquipmentDerivedOptions(sheet, inventory, pokemonQuantity).carriedKg;
				const previousHours = activities.travel.travelHoursToday;
				const outcome = advanceRPGTravel(activities.travel, sheet,
					{ ...action.leg, carriedKg }, action.hoursBudget);
				const march = resolveRPGForcedMarch(sheet, previousHours,
					Math.min(24, outcome.state.travelHoursToday), this.random);
				Object.assign(sheet, march.sheet);
				activities.travel = outcome.state;
				result = { ...outcome, forcedMarch: march.saves }; break;
			}
			case 'craft-start': {
				const recipe = RPG_CRAFT_RECIPES[action.recipeId];
				if (!recipe || session.mode === 'player' &&
					(!['cientista:producao-farmaceutica-pokemon', 'cientista:farmacologia-avancada',
						'cientista:mestre-de-formulacao']
						.includes(recipe.requiredTalent || '') ||
						!(sheet.talents.class.includes(recipe.requiredTalent || '') ||
							sheet.talents.apex === recipe.requiredTalent))) throw new Error('Receita não conhecida');
				if (session.mode === 'player') planRPGCraft(sheet, this.ensureTrainerInventory(actor),
					action.recipeId, { startedAt: now, campaignTime: now + recipe.hours * 3_600_000,
						random: this.random });
				if ((activities.crafts || []).filter(entry => entry.completedAt === undefined).length >= 20) {
					throw new Error('Fabricação com muitos projetos pendentes');
				}
				const craft = { id: input.requestId, recipeId: action.recipeId, startedAt: now };
				(activities.crafts ||= []).push(craft);
				result = { craft }; break;
			}
			case 'craft-complete': {
				const craft = activities.crafts?.find(entry => entry.id === action.craftId);
				if (!craft || craft.completedAt !== undefined) throw new Error('Fabricação indisponível');
				if (session.mode === 'player' &&
					!['cientista:producao-farmaceutica-pokemon', 'cientista:farmacologia-avancada',
						'cientista:mestre-de-formulacao']
						.includes(RPG_CRAFT_RECIPES[craft.recipeId]?.requiredTalent || '')) {
					throw new Error('Fabricação indisponível');
				}
				const inventory = this.ensureTrainerInventory(actor);
				const plan = planRPGCraft(sheet, inventory, craft.recipeId,
					{ startedAt: craft.startedAt, campaignTime: now, random: this.random });
				const kit = inventory.items.find(entry => entry.id === plan.kitInstanceId)!;
				kit.charges = (kit.charges || 0) - plan.chargesConsumed;
				for (const [itemId, amount] of Object.entries(plan.produced ? plan.inputsConsumed : {})) {
					let remaining = amount;
					for (const entry of inventory.items.filter(item => item.itemId === itemId && item.location === 'bag')) {
						const used = Math.min(remaining, entry.quantity);
						entry.quantity -= used; remaining -= used;
					}
				}
				inventory.items = inventory.items.filter(entry => entry.quantity > 0);
				if (plan.produced) {
					if (plan.produced.kind === 'pokemon-item') {
						if (plan.recipe.id.startsWith('pharmacy:')) {
							const originalId = plan.recipe.outputId.slice('player'.length);
							const baseItem = RPGItems.require(originalId);
							const creatorKey = createHash('sha256').update(`${original.tableId || this.legacyTableId || ''}:${actor.state.id}`).digest('hex').slice(0, 24);
							const craftedId = `${plan.recipe.outputId}creator${creatorKey}`;
							const craftedName = `${baseItem.name} de @${actor.state.playerName.replace(/^@/, '')}`;
							const bag = actor.state.inventory.bag;
							const equivalent = bag.items.filter(entry => {
								const item = RPGItems.get(entry.itemId);
								return item?.source === 'custom' && item.name === craftedName &&
									item.effect?.originalItemId === originalId && !bag.missionQuantities[entry.itemId];
							});
							const quantity = equivalent.reduce((sum, entry) => sum + entry.quantity, 0) +
								plan.produced.quantity;
							if (quantity > baseItem.stackLimit) {
								throw new Error(`Não há espaço na pilha de ${craftedName}: limite de ${baseItem.stackLimit} unidades.`);
							}
							if (!this.customItems.list().some(item => item.id === craftedId)) {
								const definition: RPGItemDefinition = { ...baseItem, id: craftedId,
									name: craftedName, source: 'custom',
									price: { ...baseItem.price! },
									effect: { ...baseItem.effect!, originalItemId: originalId,
										creatorCharacterId: actor.state.id },
									tags: [...(baseItem.tags || []), 'player-crafted'] };
								const existing = RPGItems.get(craftedId);
								const registered = existing || RPGItems.register(definition);
								try { this.customItems.create(registered); } catch (error) {
									if (!existing) RPGItems.unregister(registered.id);
									throw error;
								}
							}
							for (const entry of equivalent) {
								if (entry.itemId !== craftedId) {
									actor.state.inventory.bag = RPGBagSystem.remove(actor.state.inventory.bag,
										entry.itemId, entry.quantity).bag;
								}
							}
							const previousQuantity = equivalent.filter(entry => entry.itemId !== craftedId)
								.reduce((sum, entry) => sum + entry.quantity, 0);
							plan.produced.itemId = craftedId;
							actor.state.inventory.bag = RPGBagSystem.add(actor.state.inventory.bag,
								craftedId, previousQuantity + plan.produced.quantity).bag;
						} else actor.state.inventory.bag = RPGBagSystem.add(actor.state.inventory.bag,
							plan.produced.itemId, plan.produced.quantity).bag;
					} else {
						const definition = rpgEquipment(plan.produced.itemId);
						let remaining = plan.produced.quantity;
						while (remaining) {
							const quantity = Math.min(remaining, definition.stackLimit);
							inventory.items.push({ id: secureRandomBytes(12).toString('hex'),
								itemId: definition.id, quantity, equipped: false, location: 'bag' });
							remaining -= quantity;
						}
					}
				}
				craft.completedAt = now;
				result = { craft, produced: plan.produced, check: plan.check,
					chargesConsumed: plan.chargesConsumed, inputsConsumed: plan.inputsConsumed };
				break;
			}
			default: throw new Error('Atividade inválida');
		}
		(activities.receipts ||= []).push({ id: input.requestId, fingerprint, result: structuredClone(result) });
		sheet.activities = activities;
		actor.state.updatedAt = this.now();
		if (actor.state.trainerInventory) {
			actor.state.trainerInventory.revision++;
			this.validateTrainerInventory(actor);
		}
		this.repository.set(actor);
		return { result: structuredClone(result), repeated: false };
	}

	/** Uma ajuda pendente pertence ao personagem e à mesa, não à sessão do navegador. */
	offerTrainerHelp(token: string, skill: string, attribute: RPGTrainerAttribute | undefined,
		mode: 'normal' | 'advantage' | 'disadvantage', selectedTalents: string[] = []) {
		const session = this.getSession(token);
		const actorId = session.viewAsCharacterId || session.characterId;
		if (session.mode !== 'player' || !actorId) throw new Error('Entre como jogador para ajudar');
		const character = this.getCharacter(token, actorId);
		const sheet = character.trainerSheet;
		if (!sheet || !Object.prototype.hasOwnProperty.call(RPG_SKILL_ATTRIBUTES, skill.split(':')[0])) {
			throw new Error('Perícia de ajuda inválida');
		}
		if (attribute && !rpgTrainerSkillAttributes(sheet, skill).includes(attribute)) {
			throw new Error('Atributo incompatível com a perícia');
		}
		if (!['normal', 'advantage', 'disadvantage'].includes(mode)) throw new Error('Modo de rolagem inválido');
		if (this.campaignSettings.trainerHelp.some(entry => entry.characterId === character.id && entry.skill === skill)) {
			throw new Error('Você já ofereceu ajuda para essa perícia neste período');
		}
		const talents = rpgResolveTrainerRollTalents(sheet, 'skill', skill, selectedTalents,
			[...this.getTrainerAllyRollTalents(token, character.id),
				...this.getTrainerAllyHelpTalents(token, character.id)], attribute);
		const observedSkill = talents.chosen.some(talent => talent.id === 'aprendizado-por-observacao');
		const result = rollRPGTrainerSkillCheck(sheet, skill, attribute, {
			dc: 0, bonus: talents.bonus,
			naturalFloor: talents.naturalFloor,
			temporarilyTrained: observedSkill,
			advantages: (mode === 'advantage' ? 1 : 0) + talents.advantages,
			disadvantages: mode === 'disadvantage' ? 1 : 0,
		}, this.random);
		const specialized = sheet.talents.general.includes('ajuda-especializada') &&
			sheet.skills.trained.includes(skill);
		const teamwork = sheet.talents.class.includes('atleta:trabalho-em-equipe') &&
			(skill === 'atletismo' || skill === 'acrobacia');
		const collaborativeResearch = sheet.talents.class.includes('cientista:pesquisa-colaborativa') &&
			(['conhecimento', 'investigacao', 'medicina', 'medicina-pokemon', 'natureza', 'tecnologia']
				.includes(skill.split(':')[0]));
		const bonus = Math.max(rpgHelpBonus(result.total),
			(specialized && result.total >= 10 || teamwork || collaborativeResearch ||
				talents.chosen.some(talent => talent.id === 'encantador:quimica-social')) ? 2 : 0);
		this.persistAtomically(() => {
			this.campaignSettings.trainerHelp.push({ characterId: character.id, skill, total: result.total, bonus });
			this.campaignSettings.trainerHelp = this.campaignSettings.trainerHelp.slice(-100);
			this.persistCampaignSettings();
		});
		return { result, bonus, talents: talents.chosen };
	}

	consumeTrainerHelp(token: string, skill: string, excludedHelperId?: string):
	{ bonus: number, helperName: string } | null {
		const session = this.getSession(token);
		const actorId = session.viewAsCharacterId || session.characterId;
		if (session.mode !== 'player' || !actorId) throw new Error('Entre como jogador para receber ajuda');
		const available = this.campaignSettings.trainerHelp.filter(entry =>
			entry.skill === skill && entry.characterId !== actorId && entry.characterId !== excludedHelperId);
		if (!available.length) return null;
		const best = available.reduce((winner, entry) => entry.bonus > winner.bonus ? entry : winner);
		const helperName = this.repository.get(best.characterId)?.state.characterName || 'Personagem';
		this.persistAtomically(() => {
			this.campaignSettings.trainerHelp = this.campaignSettings.trainerHelp.filter(entry =>
				entry.skill !== skill || entry.characterId === actorId || entry.characterId === excludedHelperId);
			this.persistCampaignSettings();
		});
		return { bonus: best.bonus, helperName };
	}

	/** Rolagem humana arbitrada pelo Mestre, idempotente e restrita ao personagem desta mesa. */
	rollTrainerCheck(token: string, input: {
		characterId: string, requestId: string, kind: 'attribute' | 'skill' | 'resistance',
		attribute?: RPGTrainerAttribute, skill?: string, resistance?: RPGTrainerResistance,
		options: RPGTrainerCheckOptions,
	}) {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		if (!input || typeof input !== 'object' || typeof input.characterId !== 'string' ||
			typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId) ||
			!input.options || typeof input.options !== 'object') throw new Error('Teste do treinador inválido');
		const record = this.requireCharacter(toID(input.characterId));
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		const fingerprint = createHash('sha256').update(JSON.stringify({
			kind: input.kind, attribute: input.attribute, skill: input.skill,
			resistance: input.resistance, options: input.options,
		})).digest('hex');
		const previous = sheet.checks?.find(entry => entry.requestId === input.requestId);
		if (previous) {
			if (previous.fingerprint !== fingerprint) throw new Error('Identificador de teste já utilizado');
			return { result: structuredClone(previous.result), repeated: true };
		}
		let result;
		switch (input.kind) {
			case 'attribute':
				result = rollRPGTrainerAttributeCheck(sheet, input.attribute!, input.options, this.random); break;
			case 'skill':
				result = rollRPGTrainerSkillCheck(sheet, input.skill!, input.attribute, input.options, this.random); break;
			case 'resistance':
				result = rollRPGTrainerResistance(sheet, input.resistance!, input.options, this.random); break;
			default: throw new Error('Tipo de teste inválido');
		}
		const next = structuredClone(sheet);
		next.checks = [...(next.checks || []), { requestId: input.requestId, fingerprint, result }];
		record.state.trainerSheet = next;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { result, repeated: false };
	}

	/** Alterações da sobrevivência humana são arbitradas pelo Mestre e persistidas com a ficha. */
	applyTrainerSurvival(token: string, characterId: string, action: RPGTrainerSurvivalAction) {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		if (!action || typeof action !== 'object') throw new Error('Ação de sobrevivência inválida');
		let next: RPGTrainerSheet;
		let result: Record<string, unknown> = {};
		switch (action.type) {
			case 'damage':
				next = rpgTrainerTakeDamage(sheet, action.amount, action); break;
			case 'heal':
				next = rpgTrainerHeal(sheet, action.amount); break;
			case 'death-save': {
				const outcome = rpgTrainerDeathSave(sheet, this.random);
				next = outcome.sheet; result = { natural: outcome.natural }; break;
			}
			case 'stabilize':
				next = rpgTrainerStabilize(sheet); break;
			case 'exhaustion':
				next = rpgTrainerAddExhaustion(sheet, action.levels); break;
			case 'condition-add':
				next = rpgTrainerApplyCondition(sheet, action.condition); break;
			case 'condition-remove':
				next = rpgTrainerRemoveCondition(sheet, action.conditionId); break;
			case 'condition-tick': {
				const outcome = rpgTrainerConditionTick(sheet, this.random);
				next = outcome.sheet; result = { damage: outcome.damage, actionLost: outcome.actionLost }; break;
			}
			case 'wound-add':
				next = rpgTrainerAddWound(sheet, action.woundId, action.description); break;
			case 'wound-treat':
				next = rpgTrainerTreatWound(sheet, action.woundId); break;
			case 'rest-start':
				next = rpgTrainerStartRest(sheet, action.kind,
					Date.parse(this.campaignSettings.currentDateTime)); break;
			case 'rest': {
				const outcome = rpgTrainerRest(sheet, action.kind,
					Date.parse(this.campaignSettings.currentDateTime), action, this.random);
				next = outcome.sheet; result = { recovered: outcome.recovered }; break;
			}
			default: throw new Error('Ação de sobrevivência inválida');
		}
		record.state.trainerSheet = next;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { sheet: structuredClone(next), ...result };
	}

	/** O próprio treinador em 0 PV pode fazer seu teste de morte; retries não rolam outro dado. */
	rollOwnTrainerDeathSave(token: string, requestId: string) {
		const session = this.getSession(token);
		if (session.mode !== 'player') throw new Error('Entre como jogador para rolar o teste de morte');
		if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error('Identificador de rolagem inválido');
		const characterId = session.role === 'master' ? session.viewAsCharacterId : session.characterId;
		if (!characterId) throw new Error('Nenhum personagem selecionado');
		const record = this.requireCharacter(toID(characterId));
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		const previous = sheet.checks?.find(entry => entry.requestId === requestId);
		if (previous) {
			if (previous.fingerprint !== 'death-save') throw new Error('Identificador de rolagem já utilizado');
			return { sheet: structuredClone(sheet), natural: Number(previous.result.natural), repeated: true };
		}
		const outcome = rpgTrainerDeathSave(sheet, this.random);
		outcome.sheet.checks = [...(outcome.sheet.checks || []),
			{ requestId, fingerprint: 'death-save', result: { natural: outcome.natural } }];
		record.state.trainerSheet = outcome.sheet;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { sheet: structuredClone(outcome.sheet), natural: outcome.natural, repeated: false };
	}

	getTrainerTalents(token: string, characterId?: string) {
		const state = this.getCharacter(token, characterId);
		const sheet = state.trainerSheet || createRPGPendingTrainerSheet();
		return { talents: rpgTrainerTalentCatalog(sheet), sheet };
	}

	chooseTrainerTalent(token: string, choice: RPGTrainerTalentChoice): RPGTrainerSheet {
		const session = this.getSession(token);
		const characterId = session.mode === 'player' && (session.role === 'master' ?
			session.viewAsCharacterId : session.characterId);
		if (!characterId) throw new Error('Entre com um personagem para escolher talento');
		const record = this.requireCharacter(characterId);
		const original = structuredClone(record);
		const previous = record.state.trainerSheet || createRPGPendingTrainerSheet();
		const sheet = chooseRPGTrainerTalent(previous, choice);
		record.state.trainerSheet = sheet;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(original); throw error; }
		return structuredClone(sheet);
	}

	previewOwnTrainerLevel(token: string) {
		const session = this.getSession(token);
		const characterId = session.mode === 'player' && (session.role === 'master' ?
			session.viewAsCharacterId : session.characterId);
		if (!characterId) throw new Error('Entre com um personagem para atualizar a ficha');
		const next = advanceRPGTrainerLevel(this.requireCharacter(characterId).state.trainerSheet ||
			createRPGPendingTrainerSheet());
		return { pendingChoices: next.pendingChoices, talents: rpgTrainerTalentCatalog(next) };
	}

	advanceOwnTrainerLevel(token: string, choices: RPGTrainerTalentChoice[]): RPGTrainerSheet {
		const session = this.getSession(token);
		const characterId = session.mode === 'player' && (session.role === 'master' ?
			session.viewAsCharacterId : session.characterId);
		if (!characterId) throw new Error('Entre com um personagem para atualizar a ficha');
		const record = this.requireCharacter(characterId);
		const previous = structuredClone(record);
		if (!Array.isArray(choices) || choices.length < 1 || choices.length > 2) {
			throw new Error('Escolha os talentos do novo nível antes de atualizar a ficha');
		}
		let sheet = advanceRPGTrainerLevel(record.state.trainerSheet || createRPGPendingTrainerSheet());
		for (const choice of choices) sheet = chooseRPGTrainerTalent(sheet, choice);
		if (Object.values(sheet.pendingChoices || {}).some(count => count > 0)) {
			throw new Error('Escolha todos os talentos do novo nível');
		}
		sheet.levelUpReady = sheet.level;
		if (rpgTrainerLevelForXP(sheet.experience) > sheet.level) {
			sheet.levelUpWaitingSince = Date.parse(this.campaignSettings.currentDateTime);
		} else delete sheet.levelUpWaitingSince;
		record.state.trainerSheet = sheet;
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(previous); throw error; }
		return structuredClone(record.state.trainerSheet);
	}

	adjustMasterTrainerLevel(token: string, characterId: string, direction: 'up' | 'down', requestId: string): RPGTrainerSheet {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		if (direction !== 'up' && direction !== 'down') throw new Error('Ajuste de nível inválido');
		if (typeof requestId !== 'string' || !/^[a-zA-Z0-9:_-]{8,100}$/.test(requestId)) {
			throw new Error('Identificador de nível inválido');
		}
		const record = this.requireCharacter(toID(characterId));
		const previous = structuredClone(record);
		const sheet = record.state.trainerSheet || createRPGPendingTrainerSheet();
		const repeated = sheet.levelAdjustments?.find(entry => entry.requestId === requestId);
		if (repeated) {
			if (repeated.direction !== direction) throw new Error('Identificador de nível já utilizado para outra ação');
			return structuredClone(sheet);
		}
		if (direction === 'up') {
			if (sheet.level >= 10) throw new Error('Nível máximo alcançado');
			if (rpgTrainerLevelForXP(sheet.experience) > sheet.level) {
				throw new Error('O treinador já possui XP suficiente para o próximo nível');
			}
			const threshold = RPG_TRAINER_LEVEL_XP[sheet.level];
			record.state.trainerSheet = { ...sheet, experience: threshold,
				levelUpWaitingSince: Date.parse(this.campaignSettings.currentDateTime),
				levelUpReady: Math.min(sheet.levelUpReady || sheet.level, sheet.level) };
		} else record.state.trainerSheet = lowerRPGTrainerLevel(sheet);
		record.state.trainerSheet.levelAdjustments = [...(sheet.levelAdjustments || []), {
			requestId, direction, from: sheet.level, to: record.state.trainerSheet.level,
			at: this.now(), by: this.getSession(token).platformAccountId || 'master',
		}];
		record.state.updatedAt = this.now();
		try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(previous); throw error; }
		return structuredClone(record.state.trainerSheet);
	}

	approveTrainerTalentPrerequisite(token: string, characterId: string, key: string,
		reason: string): RPGTrainerSheet {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		if (!RPG_TALENT_APPROVAL_KEYS.has(key) || typeof reason !== 'string' ||
			!reason.trim() || reason.length > 500) throw new Error('Aprovação de pré-requisito inválida');
		const record = this.requireCharacter(toID(characterId));
		const session = this.getSession(token);
		if (session.platformTableId && record.tableId !== session.platformTableId) {
			throw new Error('Personagem de outra mesa');
		}
		const previous = structuredClone(record);
		const sheet = structuredClone(record.state.trainerSheet || createRPGPendingTrainerSheet());
		if (!sheet.talentApprovals?.some(approval => approval.key === key)) {
			sheet.talentApprovals = [...(sheet.talentApprovals || []), {
				key, reason: reason.trim(), approvedBy: this.getSession(token).platformAccountId || 'master',
				approvedAt: this.now(),
			}];
			record.state.trainerSheet = sheet;
			record.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(record)); } catch (error) {
				this.repository.set(previous); throw error;
			}
		}
		return structuredClone(sheet);
	}

	grantMasterTrainerXP(token: string, characterId: string, amount: number, reason: string,
		requestId: string): { sheet: RPGTrainerSheet, awarded: boolean, levelsGained: number } {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		const session = this.getSession(token);
		const record = this.requireCharacter(toID(characterId));
		const reward: RPGTrainerXPReward = {
			kind: 'master', sourceId: requestId, amount, reason, grantedAt: this.now(),
			grantedBy: session.platformAccountId || 'master',
		};
		return this.awardTrainerExperience(record, reward);
	}

	private awardTrainerExperience(record: RPGStoredCharacter, reward: RPGTrainerXPReward) {
		const original = structuredClone(record);
		const previous = record.state.trainerSheet || createRPGPendingTrainerSheet();
		const result = awardRPGTrainerXP(previous, reward);
		if (result.awarded) {
			record.state.trainerSheet = result.sheet;
			if (result.sheet.status === 'complete' &&
				rpgTrainerLevelForXP(result.sheet.experience) > result.sheet.level &&
				result.sheet.levelUpWaitingSince === undefined) {
				result.sheet.levelUpWaitingSince = Date.parse(this.campaignSettings.currentDateTime);
			}
			record.state.updatedAt = this.now();
			try { this.persistAtomically(() => this.repository.set(record)); } catch (error) { this.repository.set(original); throw error; }
		}
		return { ...result, sheet: structuredClone(result.sheet) };
	}

	getBank(token: string, characterId?: string): RPGBankView {
		const record = this.requireBankRecord(token, characterId, 'money:read');
		return { ...this.bankAccount(record.state), money: record.state.money };
	}

	adjustCharacterMoney(
		token: string, characterId: string, operation: 'add' | 'remove', amount: number
	): RPGCharacterState {
		const session = this.getSession(token);
		const target = toID(characterId);
		if (session.role === 'master') {
			this.requireMasterRole(token);
		} else if (session.mode !== 'player' || toID(session.characterId || '') !== target || operation !== 'remove') {
			throw new Error('O Player só pode remover dinheiro da própria carteira');
		}
		if (!['add', 'remove'].includes(operation)) throw new Error('Operação de dinheiro inválida');
		if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('O valor deve ser um inteiro maior que zero');
		const record = this.requireCharacter(target);
		const nextMoney = operation === 'add' ? record.state.money + amount : record.state.money - amount;
		if (!Number.isSafeInteger(nextMoney) || nextMoney < 0) throw new Error('Pokécoins insuficientes na carteira');
		record.state.money = nextMoney;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return this.characterView(record);
	}

	setTrainerTagline(token: string, characterId: string | undefined, tagline: string): RPGCharacterState {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		this.requirePermission(token, session.role === 'master' ? 'character:edit' : 'character:read', target);
		const record = this.requireCharacter(target);
		this.trainerProfile(record.state).tagline = this.text(tagline, 'trainer tagline', 120);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return this.characterView(record);
	}

	markPokedexSpeciesSeen(token: string, characterId: string, speciesName: string): RPGCharacterState {
		const session = this.getSession(token);
		const target = toID(characterId);
		if (session.role !== 'master' || session.mode !== 'player' ||
			!session.viewAsCharacterId || toID(session.viewAsCharacterId) !== target) {
			throw new Error('RPG master must be viewing this player to edit the Pokedex');
		}
		const species = Dex.mod('gen9').species.get(speciesName);
		if (!species.exists || species.num <= 0) throw new Error('Invalid RPG Pokedex species');
		const record = this.requireCharacter(target);
		this.addPokedexSpecies(this.trainerProfile(record.state), 'seen', species.id);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return this.characterView(record);
	}

	depositBank(token: string, characterId: string | undefined, amount: number, expectedRevision: number): RPGBankView {
		const record = this.requireBankRecord(token, characterId, 'money:edit');
		const bank = this.bankAccount(record.state);
		this.validateBankTransfer(amount, expectedRevision, bank);
		if (record.state.money < amount) throw new Error('Pokécoins insuficientes na carteira');
		if (!Number.isSafeInteger(bank.balance + amount)) throw new Error('O depósito tornaria o saldo bancário inválido');
		record.state.money -= amount;
		bank.balance += amount;
		bank.revision++;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { ...bank, money: record.state.money };
	}

	redeemBank(token: string, characterId: string | undefined, amount: number, expectedRevision: number): RPGBankView {
		const record = this.requireBankRecord(token, characterId, 'money:edit');
		const bank = this.bankAccount(record.state);
		this.validateBankTransfer(amount, expectedRevision, bank);
		if (bank.balance < amount) throw new Error('Pokécoins insuficientes no banco');
		if (!Number.isSafeInteger(record.state.money + amount)) throw new Error('O resgate tornaria o saldo da carteira inválido');
		bank.balance -= amount;
		record.state.money += amount;
		bank.revision++;
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return { ...bank, money: record.state.money };
	}

	createTeamPreset(token: string, characterId: string | undefined, input: {
		name: string, species: string[], pokemonIds?: (string | null)[],
	}): RPGCharacterState {
		const record = this.requireTeamPresetRecord(token, characterId);
		const presets = record.state.teamPresets ||= [];
		if (presets.length >= 12) throw new Error('Cada personagem pode salvar no m\u00e1ximo 12 equipes');
		const now = this.now();
		const species = this.teamPresetSpecies(input.species);
		presets.push({
			id: this.bytes(12).toString('base64url'), name: this.text(input.name, 'team preset name', 30),
			species, pokemonIds: this.teamPresetPokemonIds(input.pokemonIds, species.length), createdAt: now, updatedAt: now,
		});
		record.state.updatedAt = now;
		this.repository.set(record);
		return this.characterView(record);
	}

	updateTeamPreset(
		token: string, characterId: string | undefined, presetId: string, input: {
			name: string, species: string[], pokemonIds?: (string | null)[],
		}
	): RPGCharacterState {
		const record = this.requireTeamPresetRecord(token, characterId);
		const preset = (record.state.teamPresets || []).find(entry => entry.id === presetId);
		if (!preset) throw new Error('Equipe salva n\u00e3o encontrada');
		preset.name = this.text(input.name, 'team preset name', 30);
		preset.species = this.teamPresetSpecies(input.species);
		preset.pokemonIds = this.teamPresetPokemonIds(input.pokemonIds, preset.species.length);
		preset.updatedAt = this.now();
		record.state.updatedAt = preset.updatedAt;
		this.repository.set(record);
		return this.characterView(record);
	}

	deleteTeamPreset(token: string, characterId: string | undefined, presetId: string): RPGCharacterState {
		const record = this.requireTeamPresetRecord(token, characterId);
		const presets = record.state.teamPresets || [];
		const index = presets.findIndex(entry => entry.id === presetId);
		if (index < 0) throw new Error('Equipe salva n\u00e3o encontrada');
		presets.splice(index, 1);
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return this.characterView(record);
	}

	applyTeamPreset(token: string, characterId: string | undefined, presetId: string, expectedRevision: number): RPGCharacterState {
		const record = this.requireBoxRecord(token, characterId, 'box:edit');
		const preset = (record.state.teamPresets || []).find(entry => entry.id === presetId);
		if (!preset) throw new Error('Equipe salva n\u00e3o encontrada');
		if (this.activeEggs(record).length) throw new Error('A equipe n\u00e3o pode ser trocada enquanto estiver carregando Eggs');
		if (record.state.box.party.some(entry => this.isPokemonBreeding(record.state.id, entry.pokemonId))) {
			throw new Error('A equipe n\u00e3o pode ser trocada enquanto houver Pok\u00e9mon em procria\u00e7\u00e3o');
		}
		const available = [
			...record.state.box.party,
			...record.state.box.boxes.flatMap(box => box.slots.filter(Boolean)),
		];
		const used = new Set<string>();
		const pokemonIds = preset.species.map((speciesName, index) => {
			const linkedId = preset.pokemonIds?.[index] || '';
			const match = linkedId ? available.find(entry => entry && !used.has(entry.pokemonId) &&
				entry.pokemonId === linkedId) : available.find(entry => entry && !used.has(entry.pokemonId) &&
					toID(entry.pokemon.species) === toID(speciesName));
			if (!match) throw new Error(`Voc\u00ea n\u00e3o possui um ${speciesName} dispon\u00edvel para esta equipe`);
			if (linkedId && this.teamPresetEvolutionRoot(match.pokemon.species) !== this.teamPresetEvolutionRoot(speciesName)) {
				throw new Error(`O Pok\u00e9mon vinculado a ${speciesName} n\u00e3o pertence mais \u00e0 mesma linha evolutiva`);
			}
			used.add(match.pokemonId);
			return match.pokemonId;
		});
		RPGBoxManagement.applyParty(record.state, { pokemonIds, expectedRevision });
		this.persistBoxRecord(record);
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
		this.trainerProfile(record.state).stats.fossilsRestored++;
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
		return { ...directory, shops: directory.shops.map(shop => ({
			...shop, allowed: access[shop.id] !== false,
		})) };
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
		const previousShop = this.commerce.repository.get(shopId);
		const prepared = this.commerce.prepareTrade(shopId, record.state, request);
		record.state.money = prepared.character.money;
		record.state.inventory = prepared.character.inventory;
		record.state.shopRevision = prepared.character.shopRevision;
		record.state.shopTransactions = prepared.character.shopTransactions;
		if (record.state.trainerSheet?.status === 'complete') this.validateTrainerInventory(record);
		record.state.updatedAt = this.now();
		this.persistAtomically(() => {
			this.repository.set(record);
			try {
				this.commerce.commit(prepared.shop);
			} catch (error) {
				this.repository.set(previousRecord);
				if (previousShop) this.commerce.repository.set(previousShop);
				throw error;
			}
		});
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

	/** O exame revela somente informações que o Criador pode observar, sem expor os demais genes do ovo. */
	examineNurseryEgg(token: string, eggId: string, breederId?: string) {
		const session = this.getSession(token);
		if (!session.characterId || session.role !== 'player') throw new Error('Entre como jogador para examinar o Egg');
		const owner = this.requireBoxRecord(token, session.characterId, 'box:read', true);
		const breeder = this.repository.get(toID(breederId || session.characterId));
		if (!breeder || breeder.tableId !== owner.tableId || !breeder.accountId ||
			this.accounts.repository.getMembership(owner.tableId!, breeder.accountId)?.status !== 'active' ||
			breeder.state.trainerSheet?.status !== 'complete' ||
			breeder.state.trainerSheet.classId !== 'criador-pokemon') {
			throw new Error('Escolha um Criador Pokémon ativo nesta mesa');
		}
		const egg = this.ensureNursery(owner).projects.flatMap(project => project.egg ? [project.egg] : [])
			.find(candidate => candidate.id === eggId && candidate.ownerId === owner.state.id && candidate.status !== 'hatched');
		if (!egg) throw new Error('Egg não encontrado com este treinador');
		const view = RPGIncubation.view(egg);
		return { breederName: breeder.state.characterName, remainingIncubationTimeMs: view.remainingIncubationTimeMs,
			species: egg.genetics.species, form: egg.genetics.species,
			sex: egg.genetics.sex === 'N' ? null : egg.genetics.sex };
	}

	private firstCareCandidates(token: string) {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId || !session.platformTableId) {
			throw new Error('Entre como Criador Pokémon nesta mesa');
		}
		const actor = this.requireCharacter(session.characterId);
		if (actor.state.trainerSheet?.status !== 'complete' ||
			actor.state.trainerSheet.classId !== 'criador-pokemon') throw new Error('Somente Criador Pokémon pode prestar Primeiros Cuidados');
		const now = Date.parse(this.campaignSettings.currentDateTime);
		if (!Number.isFinite(now)) throw new Error('Horário da campanha inválido');
		const days = actor.state.trainerSheet.talents.apex === 'criador-pokemon:restaurador-pokemon' ? 2 :
			actor.state.trainerSheet.talents.class.includes('criador-pokemon:recuperacao-acompanhada') ? 5 : 7;
		const players = this.repository.list().filter(record => record.tableId === session.platformTableId &&
			record.accountId && this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active')
			.map(record => {
				const entries = [...record.state.box.party, ...record.state.box.boxes.flatMap(box => box.slots).filter(entry => !!entry)];
				const cooldowns = new Map(entries.map(entry => [entry.pokemonId, entry.metadata?.lastFirstCareAt || 0]));
				return { characterId: record.state.id, name: record.state.characterName,
					pokemon: RPGBoxManagement.view(record.state, { status: 'fainted' }).results.map(pokemon => ({
						id: pokemon.pokemonId, name: pokemon.name, species: pokemon.species,
						spriteId: pokemon.spriteId, baseSpriteId: pokemon.baseSpriteId, shiny: pokemon.shiny,
						level: pokemon.level, types: pokemon.types, hp: pokemon.hp, maxHP: pokemon.maxHP,
						remainingMs: Math.max(0, (cooldowns.get(pokemon.pokemonId) || 0) + days * 86_400_000 - now),
					})) };
			}).filter(player => player.pokemon.length);
		return { actor, now, players };
	}

	getFirstCareCandidates(token: string) {
		const { actor, players } = this.firstCareCandidates(token);
		const kit = this.ensureTrainerInventory(actor).items.find(item => item.itemId === 'kit-medicina-pokemon' &&
			item.location === 'bag' && (item.charges || 0) > 0);
		return { players, kitAvailable: !!kit };
	}

	performFirstCare(token: string, characterId: string, pokemonId: string) {
		const { actor, now, players } = this.firstCareCandidates(token);
		const selected = players.find(player => player.characterId === characterId)?.pokemon.find(pokemon => pokemon.id === pokemonId);
		if (!selected) throw new Error('Pokémon desmaiado não encontrado nesta mesa');
		if (selected.remainingMs > 0) throw new Error('Este Pokémon ainda não pode receber Primeiros Cuidados');
		this.requireWorldBagItemUse(token, actor.state.id);
		const originalActor = structuredClone(actor);
		const owner = actor.state.id === characterId ? actor : structuredClone(this.requireCharacter(characterId));
		const originalOwner = owner === actor ? null : structuredClone(this.requireCharacter(characterId));
		const inventory = this.ensureTrainerInventory(actor);
		const kit = inventory.items.find(item => item.itemId === 'kit-medicina-pokemon' && item.location === 'bag' &&
			(item.charges || 0) > 0);
		if (!kit) throw new Error('É necessário um Kit de Medicina Pokémon com uma carga na Bag');
		const target = RPGBoxManagement.itemTarget(owner.state, pokemonId);
		const restored = actor.state.trainerSheet?.talents.apex === 'criador-pokemon:restaurador-pokemon' ?
			Math.ceil(target.maxHP * 0.1) : 1;
		target.state.hp = restored;
		RPGBoxManagement.applyItemState(owner.state, pokemonId, target.state, owner.state.box.revision);
		const entry = [...owner.state.box.party, ...owner.state.box.boxes.flatMap(box => box.slots).filter(slot => !!slot)]
			.find(pokemon => pokemon.pokemonId === pokemonId)!;
		entry.metadata = { ...entry.metadata, lastFirstCareAt: now };
		const supplyRoll = actor.state.trainerSheet?.talents.class.includes('criador-pokemon:socorro-bem-administrado') ?
			this.int(6) + 1 : null;
		const chargeSaved = supplyRoll !== null && supplyRoll >= 5;
		if (!chargeSaved) kit.charges!--;
		inventory.revision++;
		actor.state.updatedAt = this.now(); owner.state.updatedAt = this.now();
		try { this.persistAtomically(() => { this.repository.set(actor); if (owner !== actor) this.repository.set(owner); }); } catch (error) {
			this.repository.set(originalActor);
			if (originalOwner) this.repository.set(originalOwner);
			throw error;
		}
		return { pokemonName: selected.name, hp: restored, kitCharges: kit.charges,
			supplyRoll, chargeSaved, breederName: actor.state.characterName };
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
			return { itemId: item.id, buyPrice: item.price.buy };
		});
		const catalog = RPGShopSystem.createCatalog('nursery-shop', offers, { bagUpgrades: [] });
		const account = RPGShopSystem.createAccount(record.state.id, record.state.money, inventory.bag);
		const purchase = RPGShopSystem.buy(account, catalog, {
			actionId: 'nursery-shop:' + this.bytes(18).toString('base64url'), itemId: id, quantity,
		}, { account: account.revision, bag: expectedBagRevision, catalog: catalog.revision });
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
			confirmed: { [ownerId]: true },
			slotConfirmations: { slot1: true, slot2: false },
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
			confirmed: { [owner.state.id]: false },
			slotConfirmations: { slot1: false, slot2: false },
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
		found.project.slotConfirmations = { slot1: npcRequest, slot2: false };
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
		project.slotConfirmations = { slot1: false, slot2: true };
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
		project.confirmed = { [project.slot1.ownerId]: project.slot1.participantType === 'npc' };
		project.slotConfirmations = { slot1: project.slot1.participantType === 'npc', slot2: false };
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
		const breedingReduction = [project.slot1, project.slot2].reduce((reduction, parent) => {
			if (parent.participantType !== 'player') return reduction;
			const sheet = recordFor(parent.ownerId).state.trainerSheet;
			if (sheet?.status !== 'complete' || sheet.classId !== 'criador-pokemon') return reduction;
			if (sheet.talents.apex === 'criador-pokemon:mestre-do-bercario') return Math.max(reduction, 0.3);
			return sheet.talents.class.includes('criador-pokemon:reproducao-assistida') ?
				Math.max(reduction, 0.2) : reduction;
		}, 0);
		const breedingTime = Math.ceil(preview.requiredBreedingTimeMs! * (1 - breedingReduction));
		project.requiredBreedingTimeMs = breedingTime;
		project.remainingBreedingTimeMs = breedingTime;
		project.paymentTransferredAt = now;
		for (const record of records.values()) record.state.updatedAt = now;
		try {
			this.persistAtomically(() => {
				for (const record of records.values()) this.repository.set(record);
			});
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
			return { nursery: this.nurseryView(), destination, ownerId: owner.state.id };
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
			return { nursery: this.nurseryView(), deletedPokemonId: released.entry.pokemonId };
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
		const nursery = this.ensureNursery(actor);
		const incubator = nursery.incubators.find(value => value.id === egg.incubatorId);
		if (!incubator) throw new Error('Este Egg não está em uma incubadora local');
		const inventory = RPGInventorySystem.migrate(actor.state.inventory);
		const capacity = RPGIncubation.canCarry({
			teamPokemon: actor.state.box.party.length,
			carriedEggs: this.activeEggs(actor).length,
			bagUsedSlots: RPGBagSystem.getUsedSlots(inventory.bag),
			bagMaxSlots: inventory.bag.maxSlots,
		});
		if (!capacity.allowed) throw new Error('A retirada exige 1 espaço na equipe e 5 espaços na Bag');
		RPGIncubation.remove(egg, incubator);
		const lost = !this.hasEmergencyIncubationAlly(actor) && this.random() < 0.25;
		if (lost) {
			const project = nursery.projects.find(value => value.egg?.id === eggId);
			if (project) delete project.egg;
		}
		this.persistNurseryRecord(actor);
		return { nursery: this.nurseryView(actor), lost };
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
		const talents = actor.state.trainerSheet?.status === 'complete' &&
			actor.state.trainerSheet.classId === 'criador-pokemon' ? actor.state.trainerSheet.talents.class : [];
		if (!egg.assistedIncubation) {
			const reduction = this.hasNurseryMasterAlly(actor) ? 0.3 :
				talents.includes('criador-pokemon:incubacao-assistida') ? 0.2 : 0;
			if (reduction) egg.requiredIncubationTimeMs = Math.ceil(egg.requiredIncubationTimeMs! * (1 - reduction));
			if (reduction) egg.assistedIncubation = true;
		}
		egg.portableBreederId = talents.length ? actor.state.id : undefined;
		egg.welcomedBirth = talents.includes('criador-pokemon:nascimento-acolhido');
		egg.guardianBirth = this.hasGuardianBreederAlly(actor);
		this.persistNurseryRecord(actor);
		return this.nurseryView(actor);
	}

	stopPortableNurseryIncubator(token: string, eggId: string) {
		const actor = this.requireNurseryActor(token);
		const egg = this.requireOwnedEgg(actor, eggId);
		RPGIncubation.stopPortable(egg);
		const lost = !this.hasEmergencyIncubationAlly(actor) && this.random() < 0.25;
		if (lost) {
			const project = this.ensureNursery(actor).projects.find(value => value.egg?.id === eggId);
			if (project) delete project.egg;
		}
		this.persistNurseryRecord(actor);
		return { nursery: this.nurseryView(actor), lost };
	}

	/** Um Criador com o talento protege os Eggs de todos os membros ativos da mesma mesa. */
	private hasEmergencyIncubationAlly(actor: RPGStoredCharacter): boolean {
		return this.repository.list().some(record => {
			if (record.tableId !== actor.tableId) return false;
			if (actor.tableId && (!record.accountId ||
				this.accounts.repository.getMembership(actor.tableId, record.accountId)?.status !== 'active')) return false;
			const sheet = record.state.trainerSheet;
			return sheet?.status === 'complete' && sheet.classId === 'criador-pokemon' &&
				sheet.talents.class.includes('criador-pokemon:incubacao-de-emergencia');
		});
	}

	/** O ápice beneficia Eggs incubados portatilmente pelo Criador ou por aliados ativos da mesma mesa. */
	private hasGuardianBreederAlly(actor: RPGStoredCharacter): boolean {
		return this.repository.list().some(record => {
			if (record.tableId !== actor.tableId) return false;
			if (actor.tableId && (!record.accountId ||
				this.accounts.repository.getMembership(actor.tableId, record.accountId)?.status !== 'active')) return false;
			const sheet = record.state.trainerSheet;
			return sheet?.status === 'complete' && sheet.classId === 'criador-pokemon' &&
				sheet.talents.apex === 'criador-pokemon:guardiao-de-geracoes';
		});
	}

	/** O ápice alcança Incubadoras Portáteis dos membros ativos da mesma mesa. */
	private hasNurseryMasterAlly(actor: RPGStoredCharacter): boolean {
		return this.repository.list().some(record => {
			if (record.tableId !== actor.tableId) return false;
			if (actor.tableId && (!record.accountId ||
				this.accounts.repository.getMembership(actor.tableId, record.accountId)?.status !== 'active')) return false;
			const sheet = record.state.trainerSheet;
			return sheet?.status === 'complete' && sheet.classId === 'criador-pokemon' &&
				sheet.talents.apex === 'criador-pokemon:mestre-do-bercario';
		});
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
			metadata: { ot: working.characterName, training: 'none' },
		});
		this.trainerProfile(working).stats.eggsHatched++;
		actor.state = working;
		this.persistNurseryRecord(actor);
		this.appendTableSystemLog('incubation', 'Ovo chocado',
			`${actor.state.characterName}: ${result.pokemon.species} nasceu.`, [actor.state.id]);
		return { hatch: result, nursery: this.nurseryView(actor) };
	}

	getBag(
		token: string, characterId?: string,
		query: { context?: RPGManagedBagContext, category?: RPGManagedBagCategory, search?: string } = {}
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:read', query.context === 'battle');
		const itemUseLockReason = query.context === 'battle' ? undefined :
			this.getWorldBagItemUseLock(token, record.state.id);
		const view = this.managedBagView(record, {
			...query, itemUseLocked: !!itemUseLockReason, itemUseLockReason,
		});
		const session = this.getSession(token);
		if (view.context === 'world') {
			const talentItems: RPGManagedBagItemView[] = this.sharedArchiveOptions(token, record.state.id).map(option => ({
				id: option.key, name: 'Acervo Compartilhado', quantity: 1,
				category: 'talent-items' as const, registryCategory: 'key' as const,
				description: option.condition, favorite: false, mission: false,
				actions: [], equippedIn: [], icon: './assets/item-icons/acervo-compartilhado.png',
				sprite: null, tags: ['trainer-talent'], weightKg: 0, slots: 0,
			}));
			if (session.platformTableId) {
				for (const source of this.repository.list()) {
					const sheet = source.state.trainerSheet;
					if (source.tableId !== session.platformTableId || !source.accountId || !sheet ||
						this.accounts.repository.getMembership(session.platformTableId, source.accountId)?.status !== 'active') continue;
					const formulas = new Map(rpgScientistRecordFormulas(sheet).map(formula => [formula.id, formula]));
					for (const entry of sheet.scientistRecords || []) {
						if (entry.recipientCharacterId !== record.state.id || entry.slot >= rpgScientistRecordLimit(sheet)) continue;
						const formula = entry.custom ? { name: entry.custom.name,
							effect: entry.custom.description, description: entry.custom.description } : formulas.get(entry.formulaId);
						if (!formula) continue;
						const production = rpgScientistRecordProduction(entry.formulaId, sheet,
							source.state.id === record.state.id, entry.custom);
						const pending = record.state.trainerSheet?.activities?.recordCrafts?.find(craft =>
							craft.sourceCharacterId === source.state.id && craft.slot === entry.slot &&
							craft.formulaId === entry.formulaId &&
							craft.completedAt === undefined && craft.cancelledAt === undefined);
						const canProduce = session.mode === 'player' &&
							(session.viewAsCharacterId || session.characterId) === record.state.id && !itemUseLockReason;
						talentItems.push({
							id: `cientista:registro-reprodutivel@${source.state.id}:${entry.slot}`,
							name: 'Registro Reprodutível', quantity: 1,
							category: 'talent-items', registryCategory: 'key',
							description: `${formula.name}: ${formula.effect} ${formula.description} ` +
								`Preparado por ${source.state.characterName}. ` +
								`Uso: ${production.charges} carga(s) científicas; preparo de ${production.minutes} minuto(s).`,
							favorite: false, mission: false,
							// Preparações iniciadas antes da ação direta ainda podem ser concluídas ou canceladas.
							actions: canProduce ? pending ? ['finish-record', 'cancel-record'] : ['use-record'] : [],
							...(pending ? { recordCraftId: pending.id } : {}), equippedIn: [],
							icon: './assets/item-icons/registro-reprodutivel.png', sprite: null,
							tags: ['trainer-talent'], weightKg: 0, slots: 0,
						});
					}
				}
			}
			if (session.platformTableId) {
				for (const source of this.repository.list()) {
					const plan = source.state.trainerSheet?.captainPlan;
					if (source.tableId !== session.platformTableId || !source.accountId || !plan ||
						!plan.recipientCharacterIds.includes(record.state.id) ||
						this.accounts.repository.getMembership(session.platformTableId, source.accountId)?.status !== 'active') continue;
					talentItems.push({
						id: `atleta:capitao-de-time@${source.state.id}`, name: 'Plano do Capitão', quantity: 1,
						category: 'talent-items', registryCategory: 'key',
						description: `Plano preparado por ${source.state.characterName}. ` +
							'+2 em testes de Atletismo ou Acrobacia ligados ao plano, até ser substituído.',
						favorite: false, mission: false, actions: [], equippedIn: [],
						icon: './assets/item-icons/plano-do-capitao.png', sprite: null,
						tags: ['trainer-talent'], weightKg: 0, slots: 0,
					});
				}
			}
			const category = view.categories.find(entry => entry.id === 'talent-items');
			if (category) {
				category.itemTypes = talentItems.length;
				category.quantity = talentItems.length;
			}
			const search = toID(query.search || '');
			if (!query.category || query.category === 'talent-items') {
				view.items.push(...talentItems.filter(item => !search ||
					toID(item.name + ' ' + item.description).includes(search)));
			}
			const food = (record.state.trainerInventory?.items || [])
				.filter(item => item.location === 'bag')
				.map(item => ({ item, definition: rpgEquipment(item.itemId) }));
			const foodCategory = view.categories.find(entry => entry.id === 'food-items');
			if (foodCategory) {
				foodCategory.itemTypes = new Set(food.map(entry => entry.item.itemId)).size;
				foodCategory.quantity = food.reduce((sum, entry) => sum + entry.item.quantity, 0);
			}
			if (!query.category || query.category === 'food-items') {
				for (const itemId of new Set(food.map(entry => entry.item.itemId))) {
					const definition = rpgEquipment(itemId);
					if (search && !toID(definition.name).includes(search)) continue;
					const quantity = food.filter(entry => entry.item.itemId === itemId)
						.reduce((sum, entry) => sum + entry.item.quantity, 0);
					view.items.push({ id: `equipment:${itemId}`, name: definition.name, quantity,
						category: 'food-items', registryCategory: 'key',
						description: itemId === 'alimento' ?
							(record.state.trainerSheet?.talents.apex === 'cozinheiro:mesa-para-todos' ?
								'Uma unidade de Alimento rende 4 porções de refeição. Com Aproveitamento Superior, 4 porções preparadas rendem 6; em preparos comunitários de pelo menos 10 porções, Mesa para Todos dobra o rendimento no lugar dos outros benefícios. O preparo fica no roleplay.' :
								record.state.trainerSheet?.talents.class.includes('cozinheiro:aproveitamento-superior') ?
									'Uma unidade de Alimento rende 4 porções de refeição. Com Aproveitamento Superior, 4 porções preparadas rendem 6 (+50%). Ele substitui Aproveitamento Integral; os bônus não se somam. O preparo fica no roleplay.' :
									record.state.trainerSheet?.classId === 'cozinheiro' ?
										'Uma unidade de Alimento rende 4 porções de refeição. Com Aproveitamento Integral, 4 porções preparadas rendem 5. O preparo fica no roleplay.' :
										'Uma unidade de Alimento rende 4 porções de refeição. O preparo fica no roleplay.') :
							'Item armazenado na Bag do treinador.',
						favorite: false, mission: false, actions: [], equippedIn: [],
						icon: null, sprite: null, tags: ['trainer-equipment'],
						weightKg: definition.weight * quantity, slots: food.filter(entry => entry.item.itemId === itemId)
							.reduce((sum, entry) => sum + definition.spaces, 0) });
				}
			}
		}
		const knowsFossilQuality = session.role === 'master' ||
			record.state.trainerSheet?.talents.class.includes('arqueologo:avaliacao-paleontologica-de-campo');
		if (!knowsFossilQuality && session.role === 'player' && view.context === 'world') {
			const appraiser = this.fossilAppraiser(token, record.state.id);
			if (appraiser) view.fossilAppraiser = appraiser;
		}
		if (knowsFossilQuality && view.context === 'world' &&
			view.items.some(item => RPG_FOSSILS.some(fossil => fossil.itemId === item.id))) {
			const before = JSON.stringify(record.state.fossilLab || null);
			const lab = RPGFossilLab.ensure(record.state, this.random);
			if (JSON.stringify(record.state.fossilLab || null) !== before) {
				record.state.updatedAt = this.now();
				this.repository.set(record);
			}
			for (const item of view.items) {
				const sample = lab.samples[item.id];
				if (sample && !item.mission && item.quantity === sample.trackedQuantity) {
					item.fossilQualities = { ...sample.quantities };
				}
			}
		}
		if (view.context === 'world') {
			const concealment = record.state.trainerSheet?.concealedBagItem;
			const concealedPresent = concealment?.kind === 'equipment' ?
				!!record.state.trainerInventory?.items.some(entry => entry.id === concealment.instanceId &&
					entry.itemId === concealment.itemId && entry.location === 'bag' && entry.quantity > 0) :
				concealment?.kind === 'pokemon' ?
					RPGBagSystem.getRegularQuantity(record.state.inventory.bag, concealment.itemId) > 0 : false;
			const concealedId = concealment?.kind === 'equipment' ? `equipment:${concealment.itemId}` : concealment?.itemId;
			for (const item of view.items) {
				if (concealedPresent && item.id === concealedId && !item.mission) item.concealedStatus = 'hidden';
			}
			view.canConceal = session.mode === 'player' &&
				(session.viewAsCharacterId || session.characterId) === record.state.id &&
				!itemUseLockReason && !!record.state.trainerSheet?.talents.class.includes('ladino:compartimento-clandestino');
		}
		return view;
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
		operation: 'add' | 'remove' | 'set' = 'set', quality?: RPGFossilQuality
	): RPGManagedBagView {
		this.requireMasterRole(token);
		const record = this.requireCharacter(characterId);
		if (quality !== undefined) {
			if (!['fragmented', 'preserved', 'exceptional'].includes(quality) || operation !== 'add' ||
				!RPG_FOSSILS.some(fossil => fossil.itemId === toID(itemId)) ||
				!Number.isSafeInteger(quantity) || quantity < 1) {
				throw new Error('Qualidade de fóssil inválida para esta operação');
			}
			const working = structuredClone(record.state);
			RPGFossilLab.addKnownQualities(working, itemId, {
				fragmented: quality === 'fragmented' ? quantity : 0,
				preserved: quality === 'preserved' ? quantity : 0,
				exceptional: quality === 'exceptional' ? quantity : 0,
			}, this.random);
			RPGBagManagement.updateQuantity(working, itemId, quantity, expectedRevision, operation);
			record.state = working;
			this.persistBoxRecord(record);
			return this.managedBagView(record);
		}
		if (toID(itemId) === 'portableincubator' && operation !== 'add') {
			const current = RPGBagSystem.getQuantity(RPGInventorySystem.migrate(record.state.inventory).bag, itemId);
			const resulting = operation === 'remove' ? current - quantity : quantity;
			if (resulting < this.portableEggProjects(record).length) {
				throw new Error('Remova ou descarte os Eggs das incubadoras carregadas primeiro');
			}
		}
		if (operation === 'add' && RPG_FOSSILS.some(fossil => fossil.itemId === toID(itemId)) &&
			record.state.trainerSheet?.talents.class.includes('arqueologo:achado-excepcional')) {
			const working = structuredClone(record.state);
			RPGFossilLab.addRandomQualities(working, itemId, quantity, this.random, true);
			RPGBagManagement.updateQuantity(working, itemId, quantity, expectedRevision, operation);
			record.state = working;
			this.persistBoxRecord(record);
			return this.managedBagView(record);
		}
		RPGBagManagement.updateQuantity(record.state, itemId, quantity, expectedRevision, operation);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	listBagItemCatalog(token: string, search = ''): (RPGItemDefinition & {
		icon: string | null, sprite: number | null, description: string,
		contest: RPGContestItemClassification,
	})[] {
		this.requireMasterRole(token);
		const query = toID(search);
		return RPGItems.list()
			.filter(item => !query || item.id.includes(query) || toID(item.name).includes(query))
			.map(item => ({
				...item,
				description: RPGBagManagement.description(item),
				contest: classifyRPGContestItem(item),
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
		quantity: number, expectedRevision: number, linkedEggId?: string, quality?: RPGFossilQuality
	): RPGManagedBagView {
		const record = this.requireBagRecord(token, characterId, 'bag:edit');
		const item = this.requireTransferableBagItem(record, itemId);
		this.requireManagedFossilQuality(token, record, item.id, quality);
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
		const removed = RPGBagSystem.remove(record.state.inventory.bag, item.id, quantity, expectedRevision);
		if (quality) RPGFossilLab.takeKnownQuality(record.state, item.id, quality, quantity, this.random);
		record.state.inventory.bag = removed.bag;
		if (loaded) this.removePortableEggProject(record, linkedEggId);
		this.persistBoxRecord(record);
		return this.managedBagView(record);
	}

	transferBagItem(
		token: string, characterId: string | undefined, targetCharacterId: string,
		itemId: string, quantity: number, expectedSenderRevision: number, expectedTargetRevision: number,
		linkedEggId?: string, quality?: RPGFossilQuality
	): { sender: RPGManagedBagView, targetCharacterId: string } {
		const sender = this.requireBagRecord(token, characterId, 'bag:edit');
		const item = this.requireTransferableBagItem(sender, itemId);
		this.requireManagedFossilQuality(token, sender, item.id, quality);
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
		try {
			const removed = RPGBagSystem.remove(senderInventory.bag, item.id, quantity, expectedSenderRevision);
			const added = RPGBagSystem.add(targetInventory.bag, item.id, quantity, expectedTargetRevision);
			const fossilQualities = quality ? RPGFossilLab.takeKnownQuality(sender.state, item.id, quality,
				quantity, this.random) : RPGFossilLab.takeRandomQualities(sender.state, item.id, quantity, this.random);
			if (fossilQualities) RPGFossilLab.addKnownQualities(target.state, item.id, fossilQualities, this.random);
			sender.state.inventory = { ...senderInventory, bag: removed.bag };
			target.state.inventory = { ...targetInventory, bag: added.bag };
			if (sender.state.trainerSheet?.status === 'complete') this.validateTrainerInventory(sender);
			if (target.state.trainerSheet?.status === 'complete') this.validateTrainerInventory(target);
			if (eggProject?.egg) {
				this.removePortableEggProject(sender, eggProject.egg.id);
				eggProject.egg.ownerId = target.state.id;
				eggProject.eggOwnerId = target.state.id;
				eggProject.egg.portableIncubatorId = target.state.id + ':portable:' + eggProject.egg.id;
				delete eggProject.egg.portableIncubatorMission;
				this.ensureNursery(target).projects.push(eggProject);
			}
			this.persistAtomically(() => {
				this.persistBoxRecord(sender);
				this.persistBoxRecord(target);
			});
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
		this.trainerProfile(working).stats.evolutions++;
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
			throw new Error('Confirmação de liberação inválida ou expirada. Tente novamente.');
		}
		this.pokemonReleaseChallenges.delete(challengeId);
		if (confirmed !== true) throw new Error('RPG Pokemon release was not confirmed');
		const record = this.requireBoxRecord(token, challenge.characterId, 'box:edit');
		this.requirePokemonNotBreeding(record, challenge.pokemonId);
		RPGBoxManagement.release(record.state, challenge.pokemonId, challenge.expectedRevision);
		if (record.state.trainerSheet?.investigativePartnerPokemonId === challenge.pokemonId) {
			record.state.trainerSheet.investigativePartnerUnavailable = true;
		}
		this.trainerProfile(record.state).stats.pokemonReleased++;
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
			const allowedMoves = new Set<string>(current.moves.map(toID));
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

	renamePokemonFromTeamBuilder(
		token: string, characterId: string | undefined, pokemonId: string,
		nickname: string, expectedRevision: number
	): RPGTeamBuilderManagementView {
		const record = this.requireTeamBuilderRecord(token, characterId, 'box:edit', pokemonId);
		this.requirePermission(token, 'team:edit', record.state.id);
		if (this.getSession(token).role === 'master') {
			throw new Error('O Mestre n\u00e3o pode alterar o apelido dos Pok\u00e9mon dos Players');
		}
		if (!RPGBoxManagement.isPartyPokemon(record.state, pokemonId)) {
			throw new Error('Pok\u00e9mon armazenado na Box est\u00e1 dispon\u00edvel apenas para consulta');
		}
		RPGBoxManagement.nickname(record.state, pokemonId, nickname, expectedRevision);
		this.persistBoxRecord(record);
		return RPGTeamBuilderManagement.view(record.state, pokemonId, false);
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
		const reducedDuration = rpgCanUseAthleteEVTraining(record.state);
		const training = RPGBoxManagement.trainEVs(
			record.state, pokemonId, fromStat, toStat, amount, expectedRevision, this.now(), reducedDuration
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
		const reducedDuration = rpgCanUseAthleteEVTraining(record.state);
		const training = RPGBoxManagement.trainEVDistribution(
			record.state, pokemonId, evs, expectedRevision, this.now(), reducedDuration
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

	masterCreatePlayerPokemon(token: string, characterId: string, input: {
		species: string, level: number, gender: RPGCharacterGender,
		ability: string, nature: string, shiny?: boolean,
	}): { box: RPGBoxManagementView, pokemon: RPGCharacterState['team'][number], destination: 'party' | 'box' } {
		this.requireMasterMode(token);
		this.requirePlatformTablePermission(token, 'characters.manage');
		const record = this.requireCharacter(characterId);
		const dex = Dex.mod('gen9');
		const species = dex.species.get(input.species);
		if (!species.exists || species.isNonstandard || species.id === 'egg') {
			throw new Error('Escolha uma espécie de Pokémon válida');
		}
		const level = Number(input.level);
		if (!Number.isSafeInteger(level) || level < 1 || level > 100) {
			throw new Error('O nível deve estar entre 1 e 100');
		}
		if (!['M', 'F', 'N'].includes(input.gender) || !getRPGAllowedSexes(species.name).includes(input.gender)) {
			throw new Error('O gênero selecionado não está disponível para essa espécie');
		}
		const abilities = Object.entries(species.abilities)
			.filter(([slot]) => slot !== 'S').map(([, ability]) => ability);
		const ability = abilities.find(value => toID(value) === toID(input.ability));
		if (!ability) throw new Error('A habilidade selecionada não está disponível para essa espécie');
		const nature = dex.natures.get(input.nature);
		if (!nature.exists) throw new Error('Escolha uma natureza válida');
		const evs = this.randomEVs();
		const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
		const moves = this.randomLevelMoves(species.id, level);
		const experienceData = getSpeciesExperience(species.id);
		const set: PokemonSet = {
			name: species.name, species: species.name, level, gender: input.gender,
			ability, nature: nature.name, shiny: input.shiny === true, item: '', moves, evs, ivs,
			happiness: 50,
			rpg: {
				version: RPG_STATE_VERSION, level, evs, friendship: 50, item: '', captureBall: 'pokeball',
				experience: experienceData ? getExperienceForLevel(experienceData.growthRate, level) : undefined,
			},
		};
		const entry: RPGManagedStoredPokemon = {
			pokemonId: `${record.state.id}:master:${this.bytes(12).toString('base64url')}`,
			pokemon: this.toCapturedPokemon(set),
			metadata: { ot: record.state.characterName, training: 'none' },
		};
		const destination = record.state.box.party.length + this.activeEggs(record).length < 6 ? 'party' : 'box';
		const original = structuredClone(record);
		try {
			this.persistAtomically(() => {
				if (destination === 'party') RPGBoxManagement.insertParty(record.state, entry);
				else RPGBoxManagement.insert(record.state, entry);
				this.addPokedexSpecies(this.trainerProfile(record.state), 'seen', species.name);
				this.addPokedexSpecies(this.trainerProfile(record.state), 'caught', species.name);
				this.persistBoxRecord(record);
			});
		} catch (error) {
			this.repository.set(original);
			throw error;
		}
		return { box: this.managedBoxView(record), pokemon: structuredClone(set), destination };
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
		const originalDestination = structuredClone(destination);
		const entry = RPGBoxManagement.extract(source.state, pokemonId, sourceRevision);
		if (source.state.trainerSheet?.investigativePartnerPokemonId === pokemonId) {
			source.state.trainerSheet.investigativePartnerUnavailable = true;
		}
		RPGBoxManagement.insert(destination.state, entry);
		try {
			this.persistAtomically(() => {
				this.persistBoxRecord(source);
				this.persistBoxRecord(destination);
			});
		} catch (error) {
			this.repository.set(originalSource);
			this.repository.set(originalDestination);
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
		const participants = input.participants?.map(participant => {
			if (participant.sourceNpcId) {
				if (participant.kind !== 'npc') throw new Error('Origem de NPC inválida');
				const npc = (Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
					.find(entry => entry && typeof entry === 'object' &&
						(entry as Record<string, unknown>).id === participant.sourceNpcId) as Record<string, unknown> | undefined;
				if (!npc) throw new Error('NPC salvo não encontrado');
				for (const choice of participant.pokemon || []) {
					const member = (Array.isArray(npc.team) ? npc.team : [])[choice.sourcePokemonIndex!];
					if (!Number.isInteger(choice.sourcePokemonIndex) || !member ||
						toID(String((member as Record<string, unknown>).species || '')) !== toID(choice.set?.species || '')) {
						throw new Error('Pokémon salvo do NPC não encontrado');
					}
				}
			}
			if (!participant.gymBadge) return participant;
			if (participant.kind !== 'npc') throw new Error('Somente um líder de ginásio pode oferecer insígnia');
			const npcs = this.masterNPCLibrary?.npcs;
			const source = Array.isArray(npcs) ? npcs.find(npc =>
				npc && typeof npc === 'object' && (npc as Record<string, unknown>).id === participant.gymBadge?.sourceNpcId
			) as Record<string, unknown> | undefined : undefined;
			const regionId = source?.gymRegion;
			const gymIndex = source?.gymIndex;
			if (typeof regionId !== 'string' || !GYM_BADGE_NAMES[regionId] ||
				!Number.isInteger(gymIndex) || Number(gymIndex) < 0 || Number(gymIndex) > 7 ||
				source?.folderId !== `region-${regionId}`) {
				throw new Error('Líder de ginásio inválido para concessão de insígnia');
			}
			return { ...participant, gymBadge: {
				sourceNpcId: participant.gymBadge.sourceNpcId, regionId, gymIndex: Number(gymIndex),
				enabled: participant.gymBadge.enabled === true,
			} };
		});
		return this.battleSessions.update(battleSessionId, { ...input, participants });
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
		if (battleSession.status !== 'started' && (battleSession.status === 'draft' ||
			!battleSession.participants.some(participant => participant.characterId === characterId))) {
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
		return this.persistAtomically(() => {
			const started = this.battleSessions.start(battleSessionId);
			try {
				started.session = this.reserveBattleWager(started.session);
				return started;
			} catch (error) {
				this.battleSessions.rollbackStart(battleSessionId);
				throw error;
			}
		});
	}

	rollbackBattleSessionStart(battleSessionId: string): RPGBattleSession {
		return this.persistAtomically(() => {
			this.refundBattleWager(this.battleSessions.get(battleSessionId));
			return this.battleSessions.rollbackStart(battleSessionId);
		});
	}

	/** Restores safely restartable sessions after the process lost its in-memory battle runtime. */
	recoverInterruptedBattleSessions(persistedRuntimeIds: ReadonlySet<string> = new Set()): RPGBattleSession[] {
		return this.persistAtomically(() => {
			const recovered: RPGBattleSession[] = [];
			for (const session of this.battleSessions.list().filter(entry =>
				entry.status === 'started' && !persistedRuntimeIds.has(entry.id))) {
				this.refundBattleWager(session);
				recovered.push(this.battleSessions.rollbackStart(session.id));
			}
			return recovered;
		});
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
		return this.persistAtomically(() => {
			this.persistBattlePokemon(session, result);
			this.persistBattleTrainerExperience(session, result);
			this.persistCapture(session, result);
			this.persistBattleRewards(session, result);
			this.settleBattleWager(session, result);
			this.persistBattleProfile(session, result);
			const completed = this.battleSessions.complete(battleSessionId, result);
			const playerIds = completed.participants
				.filter(participant => participant.kind === 'player' && participant.characterId)
				.map(participant => participant.characterId!);
			const participants = completed.participants.map(participant => participant.displayName).join(', ');
			const outcome = result.outcome === 'tie' ? 'A batalha terminou empatada.' :
				result.outcome === 'flee' ? 'A batalha terminou após uma fuga.' :
				result.outcome === 'capture' ? 'A batalha terminou com uma captura.' :
				`Vencedor: ${result.winner || 'não informado'}.`;
			this.appendTableSystemLog('battle', 'Batalha encerrada',
				`${completed.name} — ${participants}. ${outcome}`, playerIds, completed.endedAt || this.now());
			const linked = this.tournaments.linked('battle', battleSessionId);
			if (linked && result.winnerSide) {
				const winnerId = result.winnerSide === 'p1' ? linked.match.participant1Id : linked.match.participant2Id;
				this.tournaments.report(linked.tournament.id, linked.match.id, winnerId);
			}
			return completed;
		});
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
		const stored = record.state.box.party[choice.teamIndex] as RPGManagedStoredPokemon | undefined;
		if (!set || toID(set.species) !== toID(candidate.fromSpecies)) {
			throw new Error('O Pokémon já mudou ou não corresponde à evolução pendente');
		}
		if (!stored || toID(stored.pokemon.species) !== toID(candidate.fromSpecies)) {
			throw new Error('O Pokémon armazenado já mudou ou não corresponde à evolução pendente');
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
		stored.pokemon = this.toCapturedPokemon(set);
		stored.metadata = { ...(stored.metadata || {}), lastBattleAt: this.now() };
		record.state.box.revision++;
		const profile = this.trainerProfile(record.state);
		profile.stats.evolutions++;
		this.addPokedexSpecies(profile, 'seen', target.name);
		this.addPokedexSpecies(profile, 'caught', target.name);
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
		if (session.role === 'master') return this.contestSessions.list();
		const characterId = session.characterId || session.viewAsCharacterId;
		if (!characterId) throw new Error('RPG player session requires a character');
		return this.contestSessions.list(characterId);
	}

	getContestSession(token: string, contestSessionId: string): RPGContestSession {
		const account = this.getSession(token);
		const contest = this.contestSessions.get(contestSessionId);
		if (account.role === 'master') return contest;
		const characterId = account.characterId || account.viewAsCharacterId;
		if (contest.status !== 'started' &&
			(contest.status === 'draft' || !contest.participants.some(entry => entry.characterId === characterId))) {
			throw new Error('RPG player session cannot access another contest session');
		}
		return contest;
	}

	selectContestPokemon(token: string, contestSessionId: string, teamIndexes: number | number[]): RPGContestSession {
		const session = this.getSession(token);
		if (session.role !== 'player' || session.mode !== 'player' || !session.characterId) {
			throw new Error('RPG player session required to select a contest Pokemon');
		}
		return this.contestSessions.selectPokemon(contestSessionId, session.characterId, teamIndexes);
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

	rollbackContestSessionStart(contestSessionId: string): RPGContestSession {
		return this.contestSessions.rollbackStart(contestSessionId);
	}

	recoverInterruptedContestSessions(persistedRuntimeIds: ReadonlySet<string> = new Set()): RPGContestSession[] {
		return this.contestSessions.list().filter(session =>
			session.status === 'started' && !persistedRuntimeIds.has(session.id))
			.map(session => this.contestSessions.rollbackStart(session.id));
	}

	completeContestSession(contestSessionId: string): RPGContestSession {
		const current = this.contestSessions.get(contestSessionId);
		if (current.status === 'ended') return current;
		return this.persistAtomically(() => {
			const completed = this.contestSessions.complete(contestSessionId);
			const playerIds = completed.participants
				.filter(participant => participant.kind === 'player' && participant.characterId)
				.map(participant => participant.characterId!);
			this.appendTableSystemLog('contest', 'Concurso encerrado',
				`${completed.name} — participantes: ${completed.participants.map(entry => entry.displayName).join(', ')}.`,
				playerIds, completed.endedAt || this.now());
			return completed;
		});
	}

	consumeContestMovePP(characterId: string, teamIndex: number, moveId: string): boolean {
		const record = this.repository.get(characterId);
		const set = record?.state.team[teamIndex];
		if (!record || !set) return false;
		const moveIndex = (set.moves || []).findIndex(move => toID(move) === toID(moveId));
		if (moveIndex < 0) return false;
		const maximum = Dex.mod('gen9').moves.get(moveId).pp || 1;
		set.rpg ||= {};
		set.rpg.pp ||= (set.moves || []).map(move => Dex.mod('gen9').moves.get(move).pp || 1);
		const current = Math.max(0, Math.min(maximum, Number(set.rpg.pp[moveIndex] ?? maximum)));
		if (current <= 0) return false;
		set.rpg.pp[moveIndex] = current - 1;
		const stored = record.state.box.party[teamIndex];
		if (stored) stored.pokemon.rpg.pp = [...set.rpg.pp];
		record.state.updatedAt = this.now();
		this.repository.set(record);
		return true;
	}

	consumeNPCContestMovePP(npcId: string, pokemonIndex: number, moveId: string): boolean {
		const npc = (Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
			.find(entry => entry && typeof entry === 'object' && (entry as Record<string, unknown>).id === npcId) as
			Record<string, unknown> | undefined;
		const member = (Array.isArray(npc?.team) ? npc.team : [])[pokemonIndex] as Record<string, unknown> | undefined;
		if (!member) return false;
		const moves = Array.isArray(member.moves) ? member.moves : [];
		const moveIndex = moves.findIndex(move => toID(String(move)) === toID(moveId));
		if (moveIndex < 0) return false;
		const maximum = Dex.mod('gen9').moves.get(moveId).pp || 1;
		const rpg = member.rpg && typeof member.rpg === 'object' ? member.rpg as Record<string, unknown> : {};
		const pp = Array.isArray(rpg.pp) ? [...rpg.pp] as number[] : moves.map(move =>
			Dex.mod('gen9').moves.get(String(move)).pp || 1);
		const current = Math.max(0, Math.min(maximum, Number(pp[moveIndex] ?? maximum)));
		if (current <= 0) return false;
		pp[moveIndex] = current - 1;
		member.rpg = { ...rpg, pp };
		this.persistMasterNPCLibrary();
		return true;
	}

	applyContestResults(session: RPGContestSession, results: readonly RPGContestPlacement[]): void {
		this.persistAtomically(() => this.applyContestResultsTransaction(session, results));
	}

	private applyContestResultsTransaction(
		session: RPGContestSession, results: readonly RPGContestPlacement[]
	): void {
		if (session.status === 'cancelled') return;
		const resultById = new Map(results.map(result => [result.participantId, result]));
		for (const participant of session.participants) {
			if (participant.kind !== 'player' || !participant.characterId) continue;
			const result = resultById.get(participant.id);
			if (!result) continue;
			const record = this.repository.get(participant.characterId);
			if (!record) continue;
			const rewarded = record.state.completedContestRewards ||= [];
			if (rewarded.includes(session.id)) continue;
			if (record.state.trainerSheet?.choreography?.instinct) {
				delete record.state.trainerSheet.choreography.instinct;
			}
			const profile = this.trainerProfile(record.state);
			profile.stats.contestsEntered++;
			if (result.place === 1) profile.stats.contestsWon++;
			if (result.disqualified) {
				rewarded.push(session.id);
				record.state.updatedAt = Date.now();
				this.repository.set(record);
				continue;
			}
			const selections = participant.pokemonTeam || (participant.pokemon ? [participant.pokemon] : []);
			for (const selection of selections) {
				if (selection.teamIndex === undefined) continue;
				const pokemon = record.state.team[selection.teamIndex];
				if (pokemon) applyRPGContestPerformance(pokemon, record.state.id, result.performanceGain);
			}
			const podiumXP = rpgContestPodiumXP(session.rank, result.place, result.disqualified);
			if (podiumXP) this.awardTrainerExperience(record, {
				kind: 'contest', sourceId: session.id, amount: podiumXP,
				reason: `${result.place}º lugar no concurso ${session.name} (${session.rank})`, grantedAt: this.now(),
			});
			rewarded.push(session.id);
			record.state.updatedAt = Date.now();
			this.repository.set(record);
		}
		const linked = this.tournaments.linked('contest', session.id);
		const winner = results.find(result => result.place === 1);
		if (linked && winner) this.tournaments.report(linked.tournament.id, linked.match.id, winner.participantId);
	}

	listContestCombos(token: string): RPGContestComboDefinition[] {
		this.getSession(token);
		return this.contestCombos.list();
	}

	createContestCombo(
		token: string,
		input: Omit<RPGContestComboDefinition, 'id' | 'source'> & { id?: string }
	): RPGContestComboDefinition {
		this.requireMasterMode(token);
		return this.contestCombos.create(input);
	}

	deleteContestCombo(token: string, comboId: string): boolean {
		this.requireMasterMode(token);
		return this.contestCombos.delete(comboId);
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
		const createLocalIncubators = () => Array.from({ length: 3 }, (_, groupIndex) =>
			Array.from({ length: 3 }, (_, slotIndex) => ({
				id: record.state.id + ':incubator:' + (groupIndex + 1) + ':' + (slotIndex + 1),
				ownerId: record.state.id, kind: 'local' as const, group: groupIndex + 1, slot: slotIndex + 1,
			}))
		).flat();
		if (!record.state.nursery || record.state.nursery.version !== 1) {
			record.state.nursery = { version: 1, projects: [], incubators: createLocalIncubators(), releasedPokemon: [] };
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
			return { ...target, eggId: source.eggId };
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
		view.bank = { ...this.bankAccount(record.state) };
		view.profile = structuredClone(this.trainerProfile(record.state));
		view.shopAccess = this.characterShopAccess(record.state);
		for (const entry of view.box.party) {
			if (!this.isPokemonBreeding(record.state.id, entry.pokemonId)) continue;
			entry.metadata = { ...entry.metadata, breeding: true };
		}
		view.teamEggs = this.activeEggs(record).map(egg => ({
			...RPGIncubation.view(egg),
			safeRemoval: this.hasEmergencyIncubationAlly(record),
			status: egg.status as RPGTeamEggView['status'],
			name: 'Egg', species: 'Egg', virtual: true as const,
		}));
		view.portableIncubators = this.portableIncubatorSlots(record);
		return view;
	}

	/** Um aliado precisa estar vinculado e ativo na mesma mesa; a identificação não concede seu talento. */
	private fossilAppraiser(token: string, characterId: string) {
		const session = this.getSession(token);
		if (!session.platformTableId) return null;
		const ally = this.repository.list().filter(record => record.state.id !== characterId &&
			record.tableId === session.platformTableId && record.accountId &&
			this.accounts.repository.getMembership(session.platformTableId!, record.accountId)?.status === 'active' &&
			record.state.trainerSheet?.status === 'complete' &&
			record.state.trainerSheet.talents.class.includes('arqueologo:avaliacao-paleontologica-de-campo'))
			.sort((left, right) => left.state.characterName.localeCompare(right.state.characterName))[0];
		return ally ? { characterId: ally.state.id, name: ally.state.characterName } : null;
	}

	/** Revela os graus apenas nesta resposta; não reorganiza nem anota a Bag do solicitante. */
	identifyBagFossil(token: string, characterId: string | undefined, itemId: string) {
		const record = this.requireBagRecord(token, characterId, 'bag:read');
		const session = this.getSession(token);
		if (session.role !== 'player' || record.state.id !== session.characterId) {
			throw new Error('A identificação por aliado está disponível somente na sua própria Bag');
		}
		const appraiser = this.fossilAppraiser(token, record.state.id);
		if (!appraiser) throw new Error('Não há um aliado com Avaliação Paleontológica de Campo nesta mesa');
		const fossil = RPG_FOSSILS.find(entry => entry.itemId === toID(itemId));
		if (!fossil || RPGBagSystem.getQuantity(RPGInventorySystem.migrate(record.state.inventory).bag,
			fossil.itemId) < 1) throw new Error('Este fóssil não está na sua Bag');
		const before = JSON.stringify(record.state.fossilLab || null);
		const sample = RPGFossilLab.ensure(record.state, this.random).samples[fossil.itemId];
		if (JSON.stringify(record.state.fossilLab || null) !== before) {
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
		return { itemId: fossil.itemId, qualities: { ...sample.quantities }, appraiser: appraiser.name };
	}

	private createTrainerProfile(starterSpecies = ''): RPGTrainerProfile {
		const starter = toID(starterSpecies);
		return {
			version: 1, tagline: 'A aventura está apenas começando.',
			stats: {
				wins: 0, losses: 0, fleeAttempts: 0, pokemonCaptured: 0, pokemonReleased: 0,
				itemsUsed: 0, pokeballsThrown: 0, contestsEntered: 0, contestsWon: 0,
				pokemonDefeated: 0, evolutions: 0, eggsHatched: 0, fossilsRestored: 0,
				currentWinStreak: 0, longestWinStreak: 0,
			},
			pokedex: { seen: starter ? [starter] : [], caught: starter ? [starter] : [] }, badges: {},
		};
	}

	giveTeamPokemon(
		token: string, toCharacterId: string, pokemonId: string, sourceRevision: number
	): { source: RPGBoxManagementView, recipient: RPGCharacterSelection } {
		const session = this.getSession(token);
		if (session.role !== 'player' || !session.characterId) {
			throw new Error('Apenas o dono do Pokémon pode presenteá-lo');
		}
		const source = this.requireBoxRecord(token, undefined, 'box:edit', true);
		const destination = this.requireCharacter(toCharacterId);
		if (source.state.id === destination.state.id) throw new Error('Escolha outro jogador para receber o Pokémon');
		if (destination.state.box.party.length + this.activeEggs(destination).length >= 6) {
			throw new Error('A equipe desse jogador está cheia');
		}
		this.requireAvailablePokemon(source, pokemonId);
		const originalSource = structuredClone(source);
		const originalDestination = structuredClone(destination);
		try {
			const entry = RPGBoxManagement.extract(source.state, pokemonId, sourceRevision);
			if (source.state.trainerSheet?.investigativePartnerPokemonId === pokemonId) {
				source.state.trainerSheet.investigativePartnerUnavailable = true;
			}
			RPGBoxManagement.insertParty(destination.state, entry);
			this.persistAtomically(() => {
				this.persistBoxRecord(source);
				this.persistBoxRecord(destination);
			});
		} catch (error) {
			this.repository.set(originalSource);
			this.repository.set(originalDestination);
			throw error;
		}
		return { source: this.managedBoxView(source), recipient: this.selection(destination.state) };
	}

	private trainerProfile(character: RPGCharacterState): RPGTrainerProfile {
		const profile = character.profile;
		if (profile?.version === 1 && profile.stats && profile.pokedex && profile.badges) {
			const defaults = this.createTrainerProfile().stats;
			for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
				if (!Number.isFinite(profile.stats[key])) profile.stats[key] = defaults[key];
			}
			return profile;
		}
		const ownedSpecies = [
			...character.box.party,
			...character.box.boxes.flatMap(box => box.slots.filter(Boolean)),
		].map(entry => toID(entry!.pokemon.species)).filter(Boolean);
		const created = this.createTrainerProfile();
		created.pokedex.seen = [...new Set(ownedSpecies)];
		created.pokedex.caught = [...created.pokedex.seen];
		return character.profile = created;
	}

	private addPokedexSpecies(profile: RPGTrainerProfile, field: 'seen' | 'caught', species: string): void {
		const id = toID(species);
		if (id && !profile.pokedex[field].includes(id)) profile.pokedex[field].push(id);
	}

	private bankAccount(character: RPGCharacterState): RPGBankAccount {
		const bank = character.bank;
		if (bank && bank.version === 1 && Number.isSafeInteger(bank.balance) && bank.balance >= 0 &&
			Number.isSafeInteger(bank.revision) && bank.revision >= 0) return bank;
		return character.bank = { version: 1, balance: 0, revision: 0 };
	}

	private validateBankTransfer(amount: number, expectedRevision: number, bank: RPGBankAccount): void {
		if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('O valor bancário deve ser um inteiro positivo');
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== bank.revision) {
			throw new Error('A conta bancária foi atualizada; recarregue antes de continuar');
		}
	}

	private requireBankRecord(token: string, characterId: string | undefined, permission: 'money:read' | 'money:edit'):
	RPGStoredCharacter {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		this.requirePermission(token, permission, target);
		const record = this.requireCharacter(target);
		if (session.role === 'player' && record.state.pageAccess?.bank === false) {
			throw new Error('O Mestre bloqueou o acesso ao banco');
		}
		return record;
	}

	private playerDocumentCharacterId(token: string): string {
		const session = this.getSession(token);
		const target = toID(session.characterId || session.viewAsCharacterId || '');
		if (!target) throw new Error('Os documentos requerem um personagem');
		this.requirePermission(token, 'character:read', target);
		this.requireCharacter(target);
		return target;
	}

	private persistCampaignSettings(): void {
		if (this.mysqlPersistence) {
			this.mysqlPersistence.upsertSingleton('rpg_campaign', this.campaignSettings, this.legacyTableId);
			return;
		}
		if (!this.campaignSettingsFile) return;
		mkdirSync(dirname(this.campaignSettingsFile), { recursive: true });
		const temporary = this.campaignSettingsFile + '.tmp';
		writeFileSync(temporary, JSON.stringify(this.campaignSettings, null, '\t') + '\n', 'utf8');
		renameSync(temporary, this.campaignSettingsFile);
	}

	private appendTableSystemLog(category: string, title: string, description: string,
		audienceCharacterIds: readonly string[], occurredAt = this.now()): void {
		if (!this.mysqlPersistence || !this.legacyTableId) return;
		this.mysqlPersistence.appendTableSystemLog(
			this.legacyTableId, category, title, description, audienceCharacterIds, occurredAt
		);
	}

	async flushPersistence(): Promise<void> {
		if (!this.mysqlPersistence) return;
		try {
			await this.mysqlPersistence.flush();
		} catch (error) {
			const source = error && typeof error === 'object' ? error as { code?: unknown } : undefined;
			const failure = new Error('Falha ao persistir os dados do RPG');
			Object.assign(failure, {
				code: 'RPG_PERSISTENCE_FAILURE',
				...(typeof source?.code === 'string' ? { databaseCode: source.code } : {}),
			});
			throw failure;
		}
	}

	/** Agrupa todas as gravações produzidas pela operação em um único COMMIT MySQL. */
	private persistAtomically<T>(action: () => T): T {
		return this.mysqlPersistence ? this.mysqlPersistence.transaction(action) : action();
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
				if (emptyQuantity) expanded.push({ ...item, quantity: emptyQuantity });
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
			...(project.egg!.portableIncubatorMission ? { mission: true } : {}),
		}));
		return [...loaded, ...Array.from({ length: Math.max(0, total - loaded.length) }, (_, index) => ({
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
		const safeRemoval = record ? this.hasEmergencyIncubationAlly(record) : false;
		const eggs = nursery ? nursery.projects
			.map(project => project.egg)
			.filter((egg): egg is NonNullable<typeof egg> => !!egg && egg.status !== 'hatched')
			.map(egg => ({ ...RPGIncubation.view(egg), safeRemoval })) : [];
		const breeders = record ? this.repository.list().filter(candidate => candidate.tableId === record.tableId &&
			candidate.accountId && this.accounts.repository.getMembership(record.tableId!, candidate.accountId)?.status === 'active' &&
			candidate.state.trainerSheet?.status === 'complete' && candidate.state.trainerSheet.classId === 'criador-pokemon')
			.map(candidate => ({ id: candidate.state.id, name: candidate.state.characterName })) : [];
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
			...(releasedPokemon ? { releasedPokemon } : {}),
			eggs,
			breeders,
			teamEggs: activeEggs.map(egg => ({
				...RPGIncubation.view(egg), safeRemoval, name: 'Egg', species: 'Egg', virtual: true as const,
			})),
			incubators: nursery ? nursery.incubators.map(incubator => ({
				...incubator, kind: 'local' as const,
				egg: incubator.eggId ? eggs.find(egg => egg.eggId === incubator.eggId) : undefined,
			})) : [],
			breedingItems: RPG_NURSERY_BREEDING_ITEMS.map(item => ({ ...item })),
			...(nurseryShop ? { shop: nurseryShop } : {}),
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
		})) as unknown as RPGCapturedPokemon['ivs'];
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
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs,
			rpg: { version: RPG_STATE_VERSION, level, friendship: 50, item, captureBall: 'pokeball' },
		};
	}

	private consumeCompletedNurseryItems(
		project: RPGNurseryProject, recordsById: Map<string, RPGStoredCharacter>, changedIds: Set<string>
	): void {
		for (const parent of [project.slot1, project.slot2]) {
			if (!parent) continue;
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

	private requireNurseryProject(projectId: string): { record: RPGStoredCharacter, project: RPGNurseryProject } {
		for (const record of this.repository.list()) {
			const project = record.state.nursery?.projects?.find(value => value.id === projectId);
			if (project) return { record, project };
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
		if (record.state.trainerSheet?.status === 'complete') this.ensureTrainerInventory(record);
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

	private requireTeamPresetRecord(token: string, characterId?: string): RPGStoredCharacter {
		const session = this.getSession(token);
		const target = toID(characterId || session.characterId || session.viewAsCharacterId || '');
		if (!target) throw new Error('Uma equipe salva requer um personagem');
		this.requirePermission(token, 'team:edit', target);
		return this.requireCharacter(target);
	}

	private teamPresetSpecies(input: string[]): string[] {
		if (!Array.isArray(input) || input.length < 1 || input.length > 6) {
			throw new Error('A equipe salva deve conter entre 1 e 6 Pok\u00e9mon');
		}
		const dex = Dex.mod('gen9');
		return input.map((value, index) => {
			const species = dex.species.get(String(value || ''));
			if (!species.exists || species.id === 'egg') {
				throw new Error(`Pok\u00e9mon inv\u00e1lido na posi\u00e7\u00e3o ${index + 1}`);
			}
			return species.name;
		});
	}

	private teamPresetPokemonIds(input: (string | null)[] | undefined, size: number): (string | null)[] {
		if (input === undefined) return Array(size).fill(null);
		if (!Array.isArray(input) || input.length > 6) throw new Error('V\u00ednculos inv\u00e1lidos da equipe salva');
		return Array.from({ length: size }, (_, index) => {
			const value = input[index];
			return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null;
		});
	}

	private teamPresetEvolutionRoot(speciesName: string): string {
		const dex = Dex.mod('gen9');
		let species = dex.species.get(speciesName);
		const visited = new Set<string>();
		while (species.exists && species.prevo && !visited.has(species.id)) {
			visited.add(species.id);
			species = dex.species.get(species.prevo);
		}
		return species.id;
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
		const previousBag = this.repository.get(record.state.id)?.state.inventory?.bag;
		if (record.state.trainerSheet?.status === 'complete' && previousBag &&
			(JSON.stringify(previousBag.items) !== JSON.stringify(record.state.inventory.bag.items) ||
				previousBag.maxSlots !== record.state.inventory.bag.maxSlots)) this.validateTrainerInventory(record);
		RPGFossilLab.ensure(record.state, this.random);
		record.state.updatedAt = this.now();
		this.repository.set(record);
	}

	/** Só o dono da Bag com o talento pode escolher o grau em uma transferência ou descarte. */
	private requireManagedFossilQuality(
		token: string, record: RPGStoredCharacter, itemId: string, quality?: RPGFossilQuality
	): void {
		if (quality === undefined) return;
		const session = this.getSession(token);
		if (session.role !== 'player' || session.characterId !== record.state.id ||
			!record.state.trainerSheet?.talents.class.includes('arqueologo:avaliacao-paleontologica-de-campo') ||
			!RPG_FOSSILS.some(fossil => fossil.itemId === itemId) ||
			!['fragmented', 'preserved', 'exceptional'].includes(quality)) {
			throw new Error('Você não pode selecionar o grau deste fóssil');
		}
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

	/**
	 * Aplica as permissões da mesa às sessões globais da versão 2.
	 * Sessões legadas autenticadas pelo código do Mestre continuam compatíveis
	 * enquanto essa entrada existir na primeira versão do RPG.
	 */
	private requirePlatformTablePermission(token: string, permission: RPGTablePermission): void {
		const session = this.getSession(token);
		if (!session.platformAccountId) return;
		const permissions = session.platformTableRole ? getRPGDefaultTablePermissions(session.platformTableRole) : null;
		if (permissions && session.platformTableRole !== 'owner' &&
			typeof session.platformTablePermissions?.[permission] === 'boolean') {
			permissions[permission] = session.platformTablePermissions[permission];
		}
		if (!permissions?.[permission]) {
			throw new Error('Permissão necessária: ' + permission);
		}
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

	private persistBattleTrainerExperience(session: RPGBattleSession, result: RPGBattleResult): void {
		if (!session.rules.grantsExperience || !result.experience?.length) return;
		for (const [team, side] of [['A', 'p1'], ['B', 'p2']] as const) {
			let position = 0;
			for (const participant of session.participants.filter(entry => entry.team === team)) {
				const positions = new Set<number>();
				for (const pokemon of participant.pokemon) {
					if (participant.kind === 'player' && pokemon.teamIndex !== undefined) positions.add(position);
					position++;
				}
				if (participant.kind !== 'player' || !participant.characterId || !positions.size) continue;
				const gained = result.experience.filter(entry => entry.side === side &&
					entry.teamPosition !== undefined && positions.has(entry.teamPosition))
					.reduce((total, entry) => total + entry.gained, 0);
				if (!Number.isSafeInteger(gained) || gained < 0) throw new Error('XP da batalha inválida');
				if (!gained) continue;
				const record = this.requireCharacter(participant.characterId);
				this.awardTrainerExperience(record, {
					kind: 'battle', sourceId: session.id, amount: gained,
					reason: `XP recebida pelos Pokémon na batalha ${session.name}`,
					grantedAt: this.now(),
				});
			}
		}
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

	private persistBattleProfile(session: RPGBattleSession, result: RPGBattleResult): void {
		result.badgeAwards = [];
		const seenSpecies = result.pokemon.map(pokemon => pokemon.species);
		const countsCompetitiveResult = session.opponentType === 'npc' || session.opponentType === 'player';
		for (const participant of session.participants) {
			if (participant.kind !== 'player' || !participant.characterId) continue;
			const record = this.requireCharacter(participant.characterId);
			const profile = this.trainerProfile(record.state);
			const side = participant.team === 'A' ? 'p1' : 'p2';
			const sideOutcome = result.sides?.find(entry => entry.side === side)?.outcome;
			if (sideOutcome === 'winner' && result.outcome === 'win') {
				for (const leader of session.participants.filter(entry => entry.kind === 'npc' &&
					entry.team !== participant.team && entry.gymBadge?.enabled)) {
					const badge = leader.gymBadge!;
					const badgeName = GYM_BADGE_NAMES[badge.regionId]?.[badge.gymIndex];
					if (!badgeName) continue;
					const badgeId = badgeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
						.toLowerCase().replace(/[^a-z0-9]+/g, '-');
					const earned = profile.badges[badge.regionId] ||= [];
					if (earned.includes(badgeId)) continue;
					earned.push(badgeId);
					this.awardTrainerExperience(record, {
						kind: 'badge', sourceId: `${badge.regionId}:${badgeId}`, amount: rpgBadgeXP(badge.gymIndex),
						reason: `Conquista da insígnia ${badgeName}`, grantedAt: this.now(),
					});
					result.badgeAwards.push({ characterId: participant.characterId, regionId: badge.regionId,
						gymIndex: badge.gymIndex, badgeId, badgeName, leaderName: leader.displayName,
						leaderAvatar: leader.avatar || '' });
				}
			}
			if (countsCompetitiveResult && (sideOutcome === 'winner' || sideOutcome === 'captured')) {
				profile.stats.wins++;
				profile.stats.currentWinStreak++;
				profile.stats.longestWinStreak = Math.max(profile.stats.longestWinStreak, profile.stats.currentWinStreak);
			}
			if (countsCompetitiveResult && sideOutcome === 'loser') {
				profile.stats.losses++;
				profile.stats.currentWinStreak = 0;
			}
			if (sideOutcome === 'fled') {
				profile.stats.fleeAttempts++;
				if (countsCompetitiveResult) profile.stats.currentWinStreak = 0;
			}
			profile.stats.pokemonDefeated += (result.defeats || [])
				.filter(defeat => defeat.source?.side === side).length;
			for (const species of seenSpecies) this.addPokedexSpecies(profile, 'seen', species);
			const itemEvents = (result.itemEvents || []).filter(event => event.side === side);
			profile.stats.itemsUsed += itemEvents.reduce((total, event) => total + Math.max(0, event.quantity || 0), 0);
			profile.stats.pokeballsThrown += itemEvents
				.filter(event => toID(event.item).endsWith('ball'))
				.reduce((total, event) => total + Math.max(0, event.quantity || 0), 0);
			record.state.updatedAt = this.now();
			this.repository.set(record);
		}
	}

	private persistBattlePokemon(session: RPGBattleSession, result: RPGBattleResult): void {
		let npcLibraryChanged = false;
		for (const [team, side] of [['A', 'p1'], ['B', 'p2']] as const) {
			const finalPokemon = result.pokemon.filter(pokemon => pokemon.side === side);
			const legacyPokemon = [...finalPokemon].sort((a, b) => a.position - b.position);
			let position = 0;
			for (const participant of session.participants.filter(entry => entry.team === team)) {
				for (const choice of participant.pokemon) {
					const stablePosition = position++;
					const finalState = finalPokemon.find(pokemon => pokemon.teamPosition === stablePosition) ||
						legacyPokemon[stablePosition];
					if (participant.kind === 'npc' && participant.sourceNpcId &&
						Number.isInteger(choice.sourcePokemonIndex) && finalState) {
						const npc = (Array.isArray(this.masterNPCLibrary?.npcs) ? this.masterNPCLibrary.npcs : [])
							.find(entry => entry && typeof entry === 'object' &&
								(entry as Record<string, unknown>).id === participant.sourceNpcId) as Record<string, unknown> | undefined;
						const member = (Array.isArray(npc?.team) ? npc.team : [])[choice.sourcePokemonIndex!] as
							Record<string, unknown> | undefined;
						if (member && toID(String(member.species || member.name || '')) === toID(finalState.species)) {
							member.level = finalState.level;
							member.item = finalState.item;
							member.evs = { ...finalState.evs };
							member.ivs = { ...finalState.ivs };
							member.rpg = structuredClone(finalState.state);
							npcLibraryChanged = true;
						}
					}
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
		if (npcLibraryChanged) this.persistMasterNPCLibrary();
	}

	private persistCapture(session: RPGBattleSession, result: RPGBattleResult): void {
		if (!result.capture?.success || !result.capture.pokemon) return;
		const owner = session.participants.find(participant => participant.team === 'A' && participant.kind === 'player');
		if (!owner?.characterId) return;
		const record = this.requireCharacter(owner.characterId);
		const breeder = record.state.trainerSheet?.status === 'complete' &&
			record.state.trainerSheet.classId === 'criador-pokemon';
		if (breeder) {
			const bonus = record.state.trainerSheet!.talents.apex === 'criador-pokemon:guardiao-de-geracoes' ||
				record.state.trainerSheet!.talents.class.includes('criador-pokemon:afinidade-aprimorada') ? 20 : 10;
			result.capture.pokemon.rpg.friendship = Math.min(255,
				Math.max(0, result.capture.pokemon.rpg.friendship ?? 50) + bonus);
		}
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
		const profile = this.trainerProfile(record.state);
		profile.stats.pokemonCaptured++;
		this.addPokedexSpecies(profile, 'seen', result.capture.pokemon.species);
		this.addPokedexSpecies(profile, 'caught', result.capture.pokemon.species);
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

	private randomLevelMoves(speciesId: ID, level: number): string[] {
		const learned = new Set<string>();
		for (const data of Dex.mod('gen9').species.getFullLearnset(speciesId)) {
			for (const [move, sources] of Object.entries(data.learnset)) {
				if (sources.some(source => {
					const match = /^9L(\d+)$/.exec(source);
					return !!match && Number(match[1]) <= level;
				})) learned.add(move);
			}
		}
		const pool = [...learned];
		if (!pool.length) throw new Error('Esse Pokémon não possui golpes por nível disponíveis nesse nível');
		for (let index = pool.length - 1; index > 0; index--) {
			const other = this.int(index + 1);
			[pool[index], pool[other]] = [pool[other], pool[index]];
		}
		return pool.slice(0, 4);
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
			createdAt, expiresAt: createdAt + this.sessionTtlMs, lastSeenAt: createdAt,
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
	const nursery: RPGNurseryCharacterState = record.state.nursery ||= {
		version: 1, projects: [], releasedPokemon: [],
		incubators: Array.from({ length: TEST_READY_EGG_FIXTURE_COUNT }, (_, index) => ({
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
				ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, moves: ['flamethrower'],
			},
			slot2ParticipantType: 'npc', eggOwnerId: record.state.id, status: 'collected',
			confirmed: {}, createdAt, parentCollected: { [fixtureOwnerId]: true },
			egg: {
				id: eggId, ownerId: record.state.id, status: 'ready_to_hatch', createdAt,
				genetics: {
					species: 'Charmander', sex: index % 2 ? 'F' : 'M', nature: 'Hardy', ability: 'Blaze',
					ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					ivOrigins: { hp: 'random', atk: 'random', def: 'random', spa: 'random', spd: 'random', spe: 'random' },
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
			bank: record.state.pageAccess?.bank !== false,
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
function migrateCharacterBanks(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		const bank = record.state.bank;
		if (bank?.version === 1 && Number.isSafeInteger(bank.balance) && bank.balance >= 0 &&
			Number.isSafeInteger(bank.revision) && bank.revision >= 0) continue;
		record.state.bank = { version: 1, balance: 0, revision: 0 };
		record.state.version = RPG_ACCOUNT_VERSION;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
function migrateCharacterProfiles(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		if (record.state.profile?.version === 1) continue;
		const owned = [
			...record.state.box.party,
			...record.state.box.boxes.flatMap(box => box.slots.filter(Boolean)),
		].map(entry => toID(entry!.pokemon.species)).filter(Boolean);
		record.state.profile = {
			version: 1, tagline: 'A aventura está apenas começando.',
			stats: { wins: 0, losses: 0, fleeAttempts: 0, pokemonCaptured: 0, pokemonReleased: 0,
				itemsUsed: 0, pokeballsThrown: 0, contestsEntered: 0, contestsWon: 0,
				pokemonDefeated: 0, evolutions: 0, eggsHatched: 0, fossilsRestored: 0,
				currentWinStreak: 0, longestWinStreak: 0 },
			pokedex: { seen: [...new Set(owned)], caught: [...new Set(owned)] }, badges: {},
		};
		record.state.version = RPG_ACCOUNT_VERSION;
		record.state.updatedAt = Date.now();
		service.repository.set(record);
	}
}
/** Adiciona somente a ficha ausente; nunca substitui escolhas ou dados já registrados. */
function migrateCharacterTrainerSheets(service: RPGLoginService): void {
	for (const record of service.repository.list()) {
		if (record.state.trainerSheet == null) {
			record.state.trainerSheet = createRPGPendingTrainerSheet();
			service.repository.set(record);
			continue;
		}
		const sheet = record.state.trainerSheet;
		let corrected = false;
		// O talento aposentado não deve consumir uma escolha de classe nas fichas já existentes.
		const retiredTalent = 'criador-pokemon:primeiros-cuidados-rapidos';
		if (sheet.talents.class.includes(retiredTalent)) {
			sheet.talents.class = sheet.talents.class.filter(id => id !== retiredTalent);
			sheet.talentSelections = sheet.talentSelections?.filter(choice => choice.id !== retiredTalent);
			for (const snapshot of sheet.levelSnapshots || []) {
				snapshot.talents.class = snapshot.talents.class.filter(id => id !== retiredTalent);
				snapshot.talentSelections = snapshot.talentSelections?.filter(choice => choice.id !== retiredTalent);
			}
			corrected = true;
		}
		if (sheet.status === 'complete' && sheet.classId === 'atleta' &&
			!sheet.skills.trained.includes('acrobacia')) {
			sheet.skills.trained.push('acrobacia');
			corrected = true;
		}
		if (sheet.status === 'complete' && sheet.classId === 'guarda-pokemon') {
			const tacticalDomains = ['armas-ranged-comuns', 'armas-ranged-exoticas', 'armas-nao-letais', 'escudos'];
			const missing = tacticalDomains.filter(domain => !sheet.proficiencies?.includes(domain));
			if (missing.length) {
				sheet.proficiencies = [...(sheet.proficiencies || []), ...missing];
				corrected = true;
			}
			for (const snapshot of sheet.levelSnapshots || []) {
				const missingSnapshot = tacticalDomains.filter(domain => !snapshot.proficiencies?.includes(domain));
				if (!missingSnapshot.length) continue;
				snapshot.proficiencies = [...(snapshot.proficiencies || []), ...missingSnapshot];
				corrected = true;
			}
		}
		if (!sheet.academicMemoryApplied && sheet.attributes &&
			sheet.talents.class.includes('arqueologo:memoria-academica')) {
			sheet.attributes.intelligence = Math.min(20, sheet.attributes.intelligence + 1);
			sheet.academicMemoryApplied = true;
			corrected = true;
		}
		if (!sheet.relicRescueApplied && sheet.attributes &&
			sheet.talents.class.includes('arqueologo:resgate-de-reliquia')) {
			sheet.attributes.dexterity = Math.min(20, sheet.attributes.dexterity + 1);
			sheet.relicRescueApplied = true;
			corrected = true;
		}
		if (!sheet.emergencyIncubationWisdomApplied && sheet.attributes &&
			sheet.talents.class.includes('criador-pokemon:incubacao-de-emergencia')) {
			sheet.attributes.wisdom = Math.min(20, sheet.attributes.wisdom + 1);
			sheet.emergencyIncubationWisdomApplied = true;
			corrected = true;
		}
		if (!sheet.nurseryMasterWisdomApplied && sheet.attributes &&
			sheet.talents.apex === 'criador-pokemon:mestre-do-bercario') {
			sheet.attributes.wisdom = Math.min(20, sheet.attributes.wisdom + 1);
			sheet.nurseryMasterWisdomApplied = true;
			corrected = true;
		}
		if (corrected) {
			record.state.updatedAt = Date.now();
			service.repository.set(record);
		}
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
				...record.state.box.boxes.flatMap(box => (box.slots || [])
					.flatMap(entry => entry ? [entry.pokemonId] : [])),
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
		rpgcontestcombofile?: string,
		rpgcustomitemfile?: string,
		rpgshopfile?: string,
		rpgmasternpclibraryfile?: string,
		rpgplayerdocumentsfile?: string,
		rpgcampaignsettingsfile?: string,
		rpgtournamentfile?: string,
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
	const contestComboRepository = new RPGFileContestComboRepository(
		config.rpgcontestcombofile || resolve('config/rpg-contest-combos.json')
	);
	const customItemRepository = new RPGFileCustomItemRepository(
		config.rpgcustomitemfile || resolve('config/rpg-custom-items.json')
	);
	const commerceRepository = new RPGFileCommerceRepository(
		config.rpgshopfile || resolve('config/rpg-shops.json')
	);
	const service = new RPGLoginService({
		masterCode, repository, battleSessionRepository, contestSessionRepository, contestComboRepository,
		customItemRepository, commerceRepository,
		masterNPCLibraryFile: config.rpgmasternpclibraryfile || resolve('config/rpg-master-npc-library.json'),
		playerDocumentsFile: config.rpgplayerdocumentsfile || resolve('config/rpg-player-documents.json'),
		campaignSettingsFile: config.rpgcampaignsettingsfile || resolve('config/rpg-campaign-settings.json'),
		tournamentFile: config.rpgtournamentfile || resolve('config/rpg-tournaments.json'),
	});
	migrateCharacterPageAccess(service);
	migrateCharacterBanks(service);
	migrateCharacterProfiles(service);
	migrateCharacterTrainerSheets(service);
	migrateCharacterBags(service);
	migrateCharacterBoxes(service);
	service.recoverInterruptedBattleSessions();
	service.recoverInterruptedContestSessions();
	repairOrphanedBoxPlacements(service);
	if (config.rpgseedtestaccount === true) ensurePermanentTestCharacters(service, masterCode);
	return service;
}

/** Creates the production RPG service from MySQL when local database configuration is present. */
export async function createRPGLoginServiceFromConfigAsync(config: Parameters<typeof createRPGLoginServiceFromConfig>[0] = Config):
Promise<RPGLoginService> {
	const mysqlConfig = rpgMySQLConfig();
	if (!mysqlConfig) return createRPGLoginServiceFromConfig(config);
	const persistence = await RPGMySQLPersistence.connect(mysqlConfig);
	await persistence.linkLegacyData(config.rpgmastercode || '');
	const snapshot = await persistence.snapshot();
	const repository = new RPGMemoryCharacterRepository(snapshot.characters as RPGStoredCharacter[], (record, id) => {
		if (record) persistence.upsertCharacter(record);
		else persistence.deleteCharacter(id);
	});
	const battleSessionRepository = new RPGMemoryBattleSessionRepository(snapshot.battles as RPGBattleSession[], session =>
		persistence.upsertJSON('rpg_battle_sessions', 'id', session.id, 'state', session,
			{ status: session.status, updated_at: session.updatedAt || Date.now() }));
	const contestSessionRepository = new RPGMemoryContestSessionRepository(snapshot.contests as RPGContestSession[], session =>
		persistence.upsertJSON('rpg_contest_sessions', 'id', session.id, 'state', session,
			{ status: session.status, updated_at: session.updatedAt || Date.now() }));
	const contestComboRepository = new RPGMemoryContestComboRepository(snapshot.combos as RPGContestComboDefinition[], (combo, id) => {
		if (combo) persistence.upsertJSON('rpg_contest_combos', 'id', id, 'definition', combo);
		else persistence.delete('rpg_contest_combos', 'id', id);
	});
	const customItemRepository = new RPGMemoryCustomItemRepository(snapshot.customItems as RPGItemDefinition[], item =>
		persistence.upsertJSON('rpg_custom_items', 'id', item.id, 'definition', item));
	const commerceRepository = new RPGMemoryCommerceRepository(snapshot.shops as RPGCommerceShopState[], shop =>
		persistence.upsertJSON('rpg_shops', 'id', shop.id, 'state', shop,
			{ shop_type: shop.type, revision: shop.revision }));
	const accountRepository = new RPGMemoryAccountRepository({
		accounts: snapshot.platformAccounts, tables: snapshot.campaignTables,
		members: snapshot.tableMembers, invites: snapshot.tableInvites, recoveryCodes: snapshot.recoveryCodes,
		loginAttempts: snapshot.loginAttempts, auditEntries: snapshot.auditEntries, accountNotes: snapshot.accountNotes,
		notifications: snapshot.notifications,
	}, {
		account: account => persistence.upsertPlatformAccount(account),
		table: (table, id) => table ? persistence.upsertCampaignTable(table) : persistence.deleteCampaignTable(id),
		member: member => persistence.upsertTableMember(member),
		invite: invite => persistence.upsertTableInvite(invite),
		recoveryCode: code => persistence.upsertRecoveryCode(code),
		loginAttempt: (attempt, key) => attempt ? persistence.upsertLoginAttempt(attempt) : persistence.deleteLoginAttempt(key),
		auditEntry: entry => persistence.insertAuditEntry(entry),
		accountNote: note => persistence.upsertAccountRelationNote(note),
		notification: notification => persistence.upsertAccountNotification(notification),
	});
	const accountSessionRepository = new RPGMemoryPlatformSessionRepository(snapshot.accountSessions, (session, tokenHash) => {
		if (session) persistence.upsertPlatformSession(session);
		else persistence.deletePlatformSession(tokenHash);
	});
	const accountManagement = new RPGAccountManagement(
		accountRepository, Date.now, secureRandomBytes, accountSessionRepository,
		action => persistence.transaction(action)
	);
	const service = new RPGLoginService({
		masterCode: config.rpgmastercode || '', repository, battleSessionRepository, contestSessionRepository,
		contestComboRepository, customItemRepository, commerceRepository, mysqlPersistence: persistence, accountManagement,
		legacyTableId: snapshot.legacyTableId,
		masterNPCLibrary: snapshot.masterNPCLibrary, playerDocuments: snapshot.playerDocuments,
		campaignSettings: snapshot.campaign, tournaments: snapshot.tournaments as RPGTournament[],
		tournamentChanged: tournament => persistence.upsertJSON('rpg_tournaments', 'id', tournament.id, 'state', tournament,
			{ activity: tournament.activity, status: tournament.status, updated_at: tournament.updatedAt }),
	});
	migrateCharacterPageAccess(service);
	migrateCharacterBanks(service);
	migrateCharacterProfiles(service);
	migrateCharacterTrainerSheets(service);
	migrateCharacterBags(service);
	migrateCharacterBoxes(service);
	const persistedBattles = snapshot.legacyTableId ?
		await persistence.listRuntimeSessionIds(snapshot.legacyTableId, 'battle') : new Set<string>();
	const persistedContests = snapshot.legacyTableId ?
		await persistence.listRuntimeSessionIds(snapshot.legacyTableId, 'contest') : new Set<string>();
	service.recoverInterruptedBattleSessions(persistedBattles);
	service.recoverInterruptedContestSessions(persistedContests);
	repairOrphanedBoxPlacements(service);
	if (config.rpgseedtestaccount === true) ensurePermanentTestCharacters(service, config.rpgmastercode || '');
	await service.flushPersistence();
	return service;
}

/** Loads one independent RPG world while reusing the global account/session authority. */
export async function createRPGTableLoginServiceAsync(
	base: RPGLoginService, tableId: string, sessionStore?: Map<string, RPGInternalSession>,
	deletionStore?: RPGCharacterDeletionStore
): Promise<RPGLoginService> {
	const persistence = base.mysqlPersistence;
	if (!persistence) return base;
	const snapshot = await persistence.snapshot(tableId);
	const repository = new RPGMemoryCharacterRepository(snapshot.characters as RPGStoredCharacter[], (record, id) => {
		if (record) persistence.upsertCharacter({ ...record, tableId });
		else persistence.deleteCharacter(id, tableId);
	});
	const battleSessionRepository = new RPGMemoryBattleSessionRepository(snapshot.battles as RPGBattleSession[], session =>
		persistence.upsertJSON('rpg_battle_sessions', 'id', session.id, 'state', session,
			{ status: session.status, updated_at: session.updatedAt || Date.now() }, tableId));
	const contestSessionRepository = new RPGMemoryContestSessionRepository(snapshot.contests as RPGContestSession[], session =>
		persistence.upsertJSON('rpg_contest_sessions', 'id', session.id, 'state', session,
			{ status: session.status, updated_at: session.updatedAt || Date.now() }, tableId));
	const contestComboRepository = new RPGMemoryContestComboRepository(snapshot.combos as RPGContestComboDefinition[], (combo, id) => {
		if (combo) persistence.upsertJSON('rpg_contest_combos', 'id', id, 'definition', combo, {}, tableId);
		else persistence.delete('rpg_contest_combos', 'id', id, tableId);
	});
	const customItemRepository = new RPGMemoryCustomItemRepository(snapshot.customItems as RPGItemDefinition[], item =>
		persistence.upsertJSON('rpg_custom_items', 'id', item.id, 'definition', item, {}, tableId));
	const commerceRepository = new RPGMemoryCommerceRepository(snapshot.shops as RPGCommerceShopState[], shop =>
		persistence.upsertJSON('rpg_shops', 'id', shop.id, 'state', shop,
			{ shop_type: shop.type, revision: shop.revision }, tableId));
	const table = snapshot.campaignTables.find(entry => entry.id === tableId);
	const campaignSettings = snapshot.campaign || {
		name: table?.name || 'Minha campanha',
		currentDateTime: new Date(table?.createdAt || Date.now()).toISOString(),
		quickNotes: '', events: [], playerNotes: {}, sceneNpcIds: [], sceneNpcRevealed: {},
	};
	const service = new RPGLoginService({
		masterCode: secureRandomBytes(32).toString('hex'), repository, battleSessionRepository, contestSessionRepository,
		contestComboRepository, customItemRepository, commerceRepository, mysqlPersistence: persistence,
		accountManagement: base.accounts, legacyTableId: tableId, masterNPCLibrary: snapshot.masterNPCLibrary,
		playerDocuments: snapshot.playerDocuments, campaignSettings,
		tournaments: snapshot.tournaments as RPGTournament[], sessionStore, deletionStore,
		tournamentChanged: tournament => persistence.upsertJSON('rpg_tournaments', 'id', tournament.id, 'state', tournament,
			{ activity: tournament.activity, status: tournament.status, updated_at: tournament.updatedAt }, tableId),
	});
	migrateCharacterPageAccess(service); migrateCharacterBanks(service); migrateCharacterProfiles(service);
	migrateCharacterTrainerSheets(service);
	const persistedBattles = await persistence.listRuntimeSessionIds(tableId, 'battle');
	const persistedContests = await persistence.listRuntimeSessionIds(tableId, 'contest');
	migrateCharacterBags(service); migrateCharacterBoxes(service);
	service.recoverInterruptedBattleSessions(persistedBattles);
	service.recoverInterruptedContestSessions(persistedContests); repairOrphanedBoxPlacements(service);
	await service.flushPersistence();
	return service;
}
