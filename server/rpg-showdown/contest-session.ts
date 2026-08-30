import {toID} from '../../sim/dex-data';
import type {PokemonSet} from '../../sim/teams';

export const RPG_CONTEST_SESSION_VERSION = 1;
export const RPG_CONTEST_MIN_PARTICIPANTS = 2;
export const RPG_CONTEST_MAX_PARTICIPANTS = 10;

export type RPGContestSessionStatus =
	'draft' | 'inviting' | 'ready' | 'declined' | 'started' | 'ended' | 'cancelled';
export type RPGContestMode = 'solo' | 'duo' | 'trio';
export type RPGContestCategory = 'beauty' | 'cute' | 'cool' | 'smart' | 'tough';
export type RPGContestRank = 'normal' | 'great' | 'super' | 'hyper' | 'master';
export type RPGContestInvitationResponse = 'pending' | 'accepted' | 'declined';

export interface RPGContestPokemonSelection {
	/** Position in the persistent character team; required for Players. */
	teamIndex?: number;
	/** Configuration for a temporary or registered NPC. */
	set?: PokemonSet;
}

export interface RPGContestParticipant {
	id: string;
	kind: 'player' | 'npc';
	displayName: string;
	characterId?: string;
	avatar?: string;
	pokemon?: RPGContestPokemonSelection;
	pokemonTeam?: RPGContestPokemonSelection[];
}

export interface RPGContestInvitation {
	characterId: string;
	response: RPGContestInvitationResponse;
	respondedAt?: number;
}

export interface RPGContestScenario {
	id: string;
	name: string;
	tags: string[];
	backgroundId?: string;
	weather?: '' | 'sun' | 'rain' | 'sand' | 'snow';
	terrain?: '' | 'electric' | 'grassy' | 'psychic' | 'misty';
}

export interface RPGContestSession {
	version: number;
	id: string;
	name: string;
	status: RPGContestSessionStatus;
	mode: RPGContestMode;
	category: RPGContestCategory;
	rank: RPGContestRank;
	scenario: RPGContestScenario;
	participants: RPGContestParticipant[];
	invitations: RPGContestInvitation[];
	presentationOrder: string[];
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	endedAt?: number;
	cancelledAt?: number;
}

export interface RPGCreateContestSessionRequest {
	name?: string;
}

export interface RPGUpdateContestSessionRequest {
	name?: string;
	mode?: RPGContestMode;
	category?: RPGContestCategory;
	rank?: RPGContestRank;
	scenario?: Partial<RPGContestScenario>;
	participants?: RPGContestParticipant[];
}

export interface RPGContestSessionRepository {
	create(session: RPGContestSession): void;
	get(id: string): RPGContestSession | undefined;
	set(session: RPGContestSession): void;
	list(): RPGContestSession[];
}

export class RPGMemoryContestSessionRepository implements RPGContestSessionRepository {
	private readonly sessions = new Map<string, RPGContestSession>();

	create(session: RPGContestSession): void {
		if (this.sessions.has(session.id)) throw new Error('RPG contest session already exists');
		this.sessions.set(session.id, structuredClone(session));
	}
	get(id: string): RPGContestSession | undefined {
		const session = this.sessions.get(toID(id));
		return session && structuredClone(session);
	}
	set(session: RPGContestSession): void {
		if (!this.sessions.has(session.id)) throw new Error('Unknown RPG contest session');
		this.sessions.set(session.id, structuredClone(session));
	}
	list(): RPGContestSession[] {
		return [...this.sessions.values()].map(session => structuredClone(session));
	}
}

export interface RPGContestSessionServiceOptions {
	repository?: RPGContestSessionRepository;
	now?: () => number;
	createId?: () => string;
	random?: () => number;
	getCharacterTeam?: (characterId: string) => PokemonSet[] | undefined;
	isCharacterPokemonAvailable?: (characterId: string, teamIndex: number) => boolean;
}

export class RPGContestSessionService {
	readonly repository: RPGContestSessionRepository;
	private readonly now: () => number;
	private readonly createId: () => string;
	private readonly random: () => number;
	private readonly getCharacterTeam: (characterId: string) => PokemonSet[] | undefined;
	private readonly isCharacterPokemonAvailable: (characterId: string, teamIndex: number) => boolean;

	constructor(options: RPGContestSessionServiceOptions = {}) {
		this.repository = options.repository || new RPGMemoryContestSessionRepository();
		this.now = options.now || Date.now;
		this.createId = options.createId || (() => Math.random().toString(36).slice(2));
		this.random = options.random || Math.random;
		this.getCharacterTeam = options.getCharacterTeam || (() => undefined);
		this.isCharacterPokemonAvailable = options.isCharacterPokemonAvailable || (() => true);
	}

	create(input: RPGCreateContestSessionRequest = {}): RPGContestSession {
		const now = this.now();
		const session: RPGContestSession = {
			version: RPG_CONTEST_SESSION_VERSION,
			id: this.requireId(this.createId()),
			name: this.name(input.name),
			status: 'draft',
			mode: 'solo',
			category: 'beauty',
			rank: 'normal',
			scenario: {id: 'classic-stage', name: 'Palco clássico', tags: [], backgroundId: 'classic-hall', weather: '', terrain: ''},
			participants: [],
			invitations: [],
			presentationOrder: [],
			createdAt: now,
			updatedAt: now,
		};
		this.repository.create(session);
		return structuredClone(session);
	}

	get(id: string): RPGContestSession {
		const session = this.repository.get(this.requireId(id));
		if (!session) throw new Error('Unknown RPG contest session');
		return session;
	}

	list(characterId?: string): RPGContestSession[] {
		const id = characterId && toID(characterId);
		return this.repository.list().filter(session => !id || (
			session.status !== 'draft' && session.participants.some(participant => participant.characterId === id)
		)).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
	}

	update(id: string, input: RPGUpdateContestSessionRequest): RPGContestSession {
		const session = this.mutableDraft(id);
		if (input.name !== undefined) session.name = this.name(input.name);
		if (input.mode !== undefined) session.mode = this.enumValue(input.mode, ['solo', 'duo', 'trio'] as const, 'contest mode');
		if (input.category !== undefined) session.category = this.enumValue(input.category,
			['beauty', 'cute', 'cool', 'smart', 'tough'] as const, 'contest category');
		if (input.rank !== undefined) session.rank = this.enumValue(input.rank,
			['normal', 'great', 'super', 'hyper', 'master'] as const, 'contest rank');
		if (input.scenario !== undefined) session.scenario = this.scenario(session.scenario, input.scenario);
		if (input.participants !== undefined) session.participants = this.participants(input.participants);
		session.status = 'draft';
		session.invitations = [];
		session.presentationOrder = [];
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	invite(id: string): RPGContestSession {
		const session = this.mutableDraft(id);
		this.validateConfiguration(session, false);
		const characterIds = session.participants.filter(participant => participant.kind === 'player')
			.map(participant => participant.characterId!);
		session.invitations = characterIds.map(characterId => ({characterId, response: 'pending'}));
		session.status = session.invitations.length ? 'inviting' : 'ready';
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	selectPokemon(id: string, characterId: string, teamIndexes: number | number[]): RPGContestSession {
		const session = this.get(id);
		if (session.status !== 'inviting') throw new Error('RPG contest is not accepting selections');
		const normalized = toID(characterId);
		const participant = session.participants.find(entry => entry.kind === 'player' && entry.characterId === normalized);
		if (!participant) throw new Error('RPG character was not invited to this contest');
		const invitation = session.invitations.find(entry => entry.characterId === normalized);
		if (!invitation || invitation.response !== 'pending') {
			throw new Error('RPG contest Pokemon selection must happen before answering the invitation');
		}
		const indexes = Array.isArray(teamIndexes) ? teamIndexes : [teamIndexes];
		const required = this.pokemonCount(session.mode);
		if (indexes.length !== required || new Set(indexes).size !== indexes.length) {
			throw new Error(`RPG ${session.mode} contest requires exactly ${required} Pokemon`);
		}
		const team = this.getCharacterTeam(normalized);
		for (const teamIndex of indexes) {
			if (!team || !Number.isSafeInteger(teamIndex) || teamIndex < 0 || teamIndex >= team.length) {
				throw new Error('Invalid RPG contest Pokemon selection');
			}
			if (!this.isCharacterPokemonAvailable(normalized, teamIndex)) {
				throw new Error('This Pokemon is unavailable for the RPG contest');
			}
			if ((team[teamIndex].rpg?.hp ?? 1) <= 0) throw new Error('A fainted Pokemon cannot enter an RPG contest');
		}
		participant.pokemonTeam = indexes.map(teamIndex => ({teamIndex}));
		participant.pokemon = participant.pokemonTeam[0];
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	respond(id: string, characterId: string, response: Exclude<RPGContestInvitationResponse, 'pending'>): RPGContestSession {
		const session = this.get(id);
		if (session.status !== 'inviting') throw new Error('RPG contest is not accepting responses');
		const invitation = session.invitations.find(entry => entry.characterId === toID(characterId));
		if (!invitation) throw new Error('RPG character was not invited to this contest');
		if (invitation.response !== 'pending') throw new Error('RPG contest invitation was already answered');
		if (response === 'accepted') {
			const participant = session.participants.find(entry => entry.characterId === invitation.characterId);
			if ((participant?.pokemonTeam?.length || (participant?.pokemon ? 1 : 0)) !== this.pokemonCount(session.mode)) {
				throw new Error(`RPG player must select ${this.pokemonCount(session.mode)} Pokemon before accepting`);
			}
		}
		invitation.response = this.enumValue(response, ['accepted', 'declined'] as const, 'contest response');
		invitation.respondedAt = this.now();
		session.status = response === 'declined' ? 'declined' :
			session.invitations.every(entry => entry.response === 'accepted') ? 'ready' : 'inviting';
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	start(id: string): RPGContestSession {
		const session = this.get(id);
		if (session.status !== 'ready') throw new Error('RPG contest is not ready to start');
		const active = this.repository.list().find(entry => entry.id !== session.id && entry.status === 'started');
		if (active) throw new Error('Another RPG contest is already active');
		this.validateConfiguration(session, true);
		const order = session.participants.map(participant => participant.id);
		for (let index = order.length - 1; index > 0; index--) {
			const swap = Math.floor(this.random() * (index + 1));
			[order[index], order[swap]] = [order[swap], order[index]];
		}
		const now = this.now();
		session.presentationOrder = order;
		session.status = 'started';
		session.startedAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return structuredClone(session);
	}

	rollbackStart(id: string): RPGContestSession {
		const session = this.get(id);
		if (session.status !== 'started') throw new Error('RPG contest is not awaiting runtime rollback');
		session.status = 'ready';
		delete session.startedAt;
		session.presentationOrder = [];
		session.updatedAt = this.now();
		this.repository.set(session);
		return structuredClone(session);
	}

	complete(id: string): RPGContestSession {
		const session = this.get(id);
		if (session.status === 'ended') return session;
		if (session.status !== 'started') throw new Error('RPG contest is not active');
		const now = this.now();
		session.status = 'ended';
		session.endedAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return structuredClone(session);
	}

	cancel(id: string): RPGContestSession {
		const session = this.get(id);
		if (['started', 'ended', 'cancelled'].includes(session.status)) {
			throw new Error('RPG contest can no longer be cancelled');
		}
		const now = this.now();
		session.status = 'cancelled';
		session.cancelledAt = now;
		session.updatedAt = now;
		this.repository.set(session);
		return structuredClone(session);
	}

	private mutableDraft(id: string): RPGContestSession {
		const session = this.get(id);
		if (!['draft', 'declined'].includes(session.status)) throw new Error('RPG contest draft can no longer be edited');
		return session;
	}

	private validateConfiguration(session: RPGContestSession, requirePlayerPokemon: boolean): void {
		const requiredPokemon = this.pokemonCount(session.mode);
		if (session.participants.length < RPG_CONTEST_MIN_PARTICIPANTS ||
			session.participants.length > RPG_CONTEST_MAX_PARTICIPANTS) {
			throw new Error('RPG contest requires between 2 and 10 participants');
		}
		for (const participant of session.participants) {
			if (participant.kind === 'player' && requirePlayerPokemon) {
				const selections = participant.pokemonTeam || (participant.pokemon ? [participant.pokemon] : []);
				if (selections.length !== requiredPokemon || new Set(selections.map(selection => selection.teamIndex)).size !== requiredPokemon) {
					throw new Error(`Every RPG contest Player must select ${requiredPokemon} Pokemon`);
				}
				const team = this.getCharacterTeam(participant.characterId!);
				for (const selection of selections) {
					const teamIndex = selection.teamIndex!;
					if (!Number.isSafeInteger(teamIndex) || !team?.[teamIndex] || !this.isCharacterPokemonAvailable(participant.characterId!, teamIndex)) {
						throw new Error('A selected Pokemon became unavailable for the RPG contest');
					}
					if ((team[teamIndex].rpg?.hp ?? 1) <= 0) throw new Error('A fainted Pokemon cannot enter an RPG contest');
				}
			}
			if (participant.kind === 'npc') {
				const selections = participant.pokemonTeam || (participant.pokemon ? [participant.pokemon] : []);
				if (selections.length !== requiredPokemon || selections.some(selection => !selection.set)) {
					throw new Error(`Every RPG contest NPC requires ${requiredPokemon} Pokemon`);
				}
			}
		}
	}

	private participants(input: RPGContestParticipant[]): RPGContestParticipant[] {
		if (!Array.isArray(input) || input.length > RPG_CONTEST_MAX_PARTICIPANTS) {
			throw new Error('Invalid RPG contest participants');
		}
		const participants = input.map((entry, index): RPGContestParticipant => {
			if (!entry || typeof entry !== 'object') throw new Error('Invalid RPG contest participant');
			const kind = this.enumValue(entry.kind, ['player', 'npc'] as const, 'contest participant kind');
			const id = this.requireId(entry.id || `${kind}-${index + 1}`);
			const displayName = String(entry.displayName || '').trim();
			if (!displayName || displayName.length > 60) throw new Error('Invalid RPG contest participant name');
			if (kind === 'player') {
				const characterId = toID(entry.characterId || '');
				if (!characterId || !this.getCharacterTeam(characterId)) throw new Error('Unknown RPG contest Player');
				return {id, kind, displayName, characterId, avatar: entry.avatar};
			}
			const selections = entry.pokemonTeam || (entry.pokemon ? [entry.pokemon] : []);
			if (!selections.length) throw new Error('RPG contest NPC requires Pokemon');
			const pokemonTeam = selections.map(selection => {
				const set = structuredClone(selection.set!);
				if (!set?.species || !Array.isArray(set.moves) || !set.moves.length || set.moves.length > 4) {
					throw new Error('Invalid RPG contest NPC Pokemon');
				}
				return {set};
			});
			return {id, kind, displayName, avatar: entry.avatar, pokemon: pokemonTeam[0], pokemonTeam};
		});
		if (new Set(participants.map(entry => entry.id)).size !== participants.length) {
			throw new Error('RPG contest participant ids must be unique');
		}
		const playerIds = participants.filter(entry => entry.kind === 'player').map(entry => entry.characterId);
		if (new Set(playerIds).size !== playerIds.length) throw new Error('A Player can enter an RPG contest only once');
		return participants;
	}

	private scenario(current: RPGContestScenario, input: Partial<RPGContestScenario>): RPGContestScenario {
		const id = input.id === undefined ? current.id : this.requireId(input.id);
		const name = input.name === undefined ? current.name : String(input.name).trim();
		if (!name || name.length > 80) throw new Error('Invalid RPG contest scenario name');
		if (input.tags !== undefined && !Array.isArray(input.tags)) throw new Error('Invalid RPG contest scenario tags');
		const tags = input.tags === undefined ? current.tags : [...new Set(input.tags.map(tag => toID(tag)).filter(Boolean))];
		if (tags.length > 30) throw new Error('RPG contest scenario has too many tags');
		const contestBackgrounds = ['classic-hall', 'sunset-harbor', 'neon-arena', 'enchanted-clearing', 'festival-plaza', 'snowy-overlook'];
		const backgroundId = input.backgroundId === undefined ? current.backgroundId || 'classic-hall' :
			this.enumValue(input.backgroundId, contestBackgrounds, 'contest background');
		const weather = input.weather === undefined ? current.weather || '' :
			this.enumValue(input.weather, ['', 'sun', 'rain', 'sand', 'snow'] as const, 'contest scenario weather');
		const terrain = input.terrain === undefined ? current.terrain || '' :
			this.enumValue(input.terrain, ['', 'electric', 'grassy', 'psychic', 'misty'] as const, 'contest scenario terrain');
		return {id, name, tags, backgroundId, weather, terrain};
	}

	private name(value?: string): string {
		const name = String(value || 'Novo Concurso Pokémon').trim();
		if (!name || name.length > 80) throw new Error('Invalid RPG contest name');
		return name;
	}

	private pokemonCount(mode: RPGContestMode): number {
		return mode === 'trio' ? 3 : mode === 'duo' ? 2 : 1;
	}

	private requireId(value: string): string {
		const id = toID(value);
		if (!id) throw new Error('Invalid RPG contest id');
		return id;
	}

	private enumValue<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
		if (!values.includes(value as T[number])) throw new Error(`Invalid RPG ${label}`);
		return value as T[number];
	}
}
