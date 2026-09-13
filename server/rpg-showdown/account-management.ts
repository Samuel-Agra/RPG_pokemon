/** Domínio de contas globais e participação em múltiplas mesas da versão 2. */
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { toID } from '../../sim/dex-data';

export const RPG_PLATFORM_ACCOUNT_VERSION = 1;
export const RPG_PLATFORM_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export const RPG_LOGIN_WINDOW = 15 * 60 * 1000;
export const RPG_LOGIN_BLOCK = 15 * 60 * 1000;
export const RPG_LOGIN_MAX_FAILURES = 5;
export const RPG_LOGIN_SOURCE_MAX_FAILURES = 20;
export const RPG_RECOVERY_WINDOW = 15 * 60 * 1000;
export const RPG_RECOVERY_BLOCK = 15 * 60 * 1000;
export const RPG_RECOVERY_MAX_FAILURES = 5;
export const RPG_RECOVERY_SOURCE_MAX_FAILURES = 20;
const RPG_DUMMY_LOGIN_CREDENTIAL: RPGAccountCredential = {
	salt: Buffer.alloc(16, 0x52).toString('base64'),
	hash: Buffer.alloc(32, 0xa7).toString('base64'),
	algorithm: 'scrypt',
};
const scryptAsync = promisify(scrypt);
const RPG_KDF_CONCURRENCY = 4;
const RPG_KDF_MAX_QUEUE = 64;
let activeKDFTasks = 0;
const pendingKDFTasks: (() => void)[] = [];

function validCredential(credential: RPGAccountCredential): boolean {
	if (!credential || credential.algorithm !== 'scrypt') return false;
	try {
		const salt = Buffer.from(credential.salt, 'base64');
		const hash = Buffer.from(credential.hash, 'base64');
		return salt.length === 16 && hash.length === 32 &&
			salt.toString('base64') === credential.salt && hash.toString('base64') === credential.hash;
	} catch {
		return false;
	}
}

async function withKDFSlot<T>(action: () => Promise<T>): Promise<T> {
	if (activeKDFTasks >= RPG_KDF_CONCURRENCY) {
		if (pendingKDFTasks.length >= RPG_KDF_MAX_QUEUE) {
			const error = new Error('Serviço de autenticação temporariamente ocupado');
			Object.assign(error, { code: 'RPG_AUTH_BUSY' });
			throw error;
		}
		await new Promise<void>(resolve => { pendingKDFTasks.push(resolve); });
	}
	activeKDFTasks++;
	try {
		return await action();
	} finally {
		activeKDFTasks--;
		pendingKDFTasks.shift()?.();
	}
}
export type RPGTableRole = 'owner' | 'master' | 'player' | 'spectator';
export const RPG_TABLE_PERMISSIONS = [
	'battles.create', 'battles.manage', 'battles.participate', 'battles.watch',
	'contests.create', 'contests.manage', 'contests.participate', 'contests.watch',
	'tournaments.create', 'tournaments.manage', 'tournaments.participate', 'tournaments.watch',
	'npcs.manage', 'shops.manage', 'campaign.configure', 'campaign.advanceTime',
	'characters.manage', 'characters.viewPrivate', 'documents.manage',
	'members.view', 'members.invite', 'members.manage',
] as const;
export type RPGTablePermission = typeof RPG_TABLE_PERMISSIONS[number];

const RPG_ROLE_PERMISSION_LISTS: Record<RPGTableRole, readonly RPGTablePermission[]> = {
	owner: RPG_TABLE_PERMISSIONS,
	master: [
		'battles.create', 'battles.manage', 'battles.participate', 'battles.watch',
		'contests.create', 'contests.manage', 'contests.participate', 'contests.watch',
		'tournaments.create', 'tournaments.manage', 'tournaments.participate', 'tournaments.watch',
		'npcs.manage', 'shops.manage', 'campaign.advanceTime', 'characters.manage', 'characters.viewPrivate',
		'documents.manage', 'members.view', 'members.invite', 'members.manage',
	],
	player: [
		'battles.participate', 'battles.watch', 'contests.participate', 'contests.watch',
		'tournaments.participate', 'tournaments.watch', 'members.view',
	],
	spectator: ['battles.watch', 'contests.watch', 'tournaments.watch', 'members.view'],
};

export function getRPGDefaultTablePermissions(role: RPGTableRole): Record<RPGTablePermission, boolean> {
	const enabled = new Set(RPG_ROLE_PERMISSION_LISTS[role]);
	return Object.fromEntries(RPG_TABLE_PERMISSIONS.map(permission => [permission, enabled.has(permission)])) as
		Record<RPGTablePermission, boolean>;
}

interface RPGAccountCredential { algorithm: 'scrypt'; salt: string; hash: string }
export interface RPGPlatformAccount {
	id: string; username: string; handle: string; displayName: string; credential: RPGAccountCredential;
	status: 'active' | 'disabled'; createdAt: number; updatedAt: number; revision: number;
}
export interface RPGCampaignTable {
	id: string; ownerAccountId: string; name: string; description: string; color: string;
	visibility: 'private' | 'code' | 'public'; status: 'active' | 'archived';
	settings: Record<string, unknown>; createdAt: number; updatedAt: number; revision: number;
}
export interface RPGTablePresentationSettings {
	cardImage: string; tableInformation: string; fullDescription: string;
	sessionDays: string[]; sessionTimes: Record<string, string>;
	inDevelopment: boolean;
}
export interface RPGTableMember {
	tableId: string; accountId: string; role: RPGTableRole;
	status: 'active' | 'pending' | 'left' | 'removed' | 'blocked'; permissions: Record<string, boolean>;
	requestInviteId?: string; note?: string;
	joinedAt: number; updatedAt: number; revision: number;
}
export interface RPGTableInvite {
	id: string; tableId: string; createdByAccountId: string; targetAccountId?: string;
	codeHash: string; role: Exclude<RPGTableRole, 'owner'>; status: 'active' | 'revoked' | 'expired';
	maxUses: number; usedCount: number; expiresAt?: number; createdAt: number;
}
export interface RPGPlatformSession {
	token: string; accountId: string; activeTableId?: string; membershipId?: string; role?: RPGTableRole;
	createdAt: number; expiresAt: number;
}
export type RPGPublicPlatformAccount = Omit<RPGPlatformAccount, 'credential'>;
export interface RPGPlatformSessionView {
	session: RPGPlatformSession; account: RPGPublicPlatformAccount;
}
export interface RPGPublicPlatformSession {
	id: string; activeTableId?: string; createdAt: number; lastSeenAt: number; expiresAt: number; current: boolean;
}
export interface RPGTableMemberView {
	member: RPGTableMember; account: RPGPublicPlatformAccount;
	effectivePermissions: Record<RPGTablePermission, boolean>;
	characters?: { id: string, name: string }[];
}
export interface RPGAccountTableView {
	table: RPGCampaignTable; membership: RPGTableMember; owner: RPGPublicPlatformAccount;
	memberCount: number; lastActivityAt: number; ownerOnline: boolean; character?: { id: string, name: string };
}
export interface RPGTableCardDetails {
	table: RPGCampaignTable; owner: RPGPublicPlatformAccount; membership?: RPGTableMember;
	members: { account: RPGPublicPlatformAccount, role: RPGTableRole, lastSeenAt: number, online: boolean }[];
}
export interface RPGDirectedInviteView {
	invite: RPGPublicTableInvite; table: RPGCampaignTable; owner: RPGPublicPlatformAccount; memberCount: number;
}
export interface RPGActiveTableContext {
	session: RPGPlatformSession; account: RPGPublicPlatformAccount;
	table: RPGCampaignTable; membership: RPGTableMember;
}
export type RPGPublicTableInvite = Omit<RPGTableInvite, 'codeHash'>;
export interface RPGInvitePreview {
	table: Pick<RPGCampaignTable, 'id' | 'name' | 'description' | 'color'>;
	owner: RPGPublicPlatformAccount; memberCount: number; requiresApproval: boolean;
	membershipStatus?: RPGTableMember['status'];
}
export type RPGStoredPlatformSession = Omit<RPGPlatformSession, 'token'> & {
	tokenHash: string, lastSeenAt: number, revokedAt?: number,
};
export interface RPGRecoveryCode {
	id: string; accountId: string; codeHash: string; createdAt: number; usedAt?: number;
}
export interface RPGLoginAttempt {
	key: string; accountKey?: string; failures: number; windowStartedAt: number; blockedUntil?: number; updatedAt: number;
}
export interface RPGAdminAuditEntry {
	id: string; tableId: string; actorAccountId: string; action: string;
	targetType: string; targetId?: string; metadata: Record<string, unknown>; createdAt: number;
}
export interface RPGAccountRelationNote {
	authorAccountId: string; targetAccountId: string; note: string; updatedAt: number;
}
export interface RPGAuditRequestContext {
	origin: string; sessionId?: string; method?: string; path?: string;
}
export interface RPGAccountRepositorySnapshot {
	accounts?: RPGPlatformAccount[]; tables?: RPGCampaignTable[];
	members?: RPGTableMember[]; invites?: RPGTableInvite[];
	recoveryCodes?: RPGRecoveryCode[]; loginAttempts?: RPGLoginAttempt[]; auditEntries?: RPGAdminAuditEntry[];
	accountNotes?: RPGAccountRelationNote[];
}

export interface RPGAccountRepository {
	transaction<T>(action: () => T): T;
	getAccount(id: string): RPGPlatformAccount | undefined;
	getAccountByUsername(username: string): RPGPlatformAccount | undefined;
	getAccountByHandle(handle: string): RPGPlatformAccount | undefined;
	setAccount(account: RPGPlatformAccount): void;
	getTable(id: string): RPGCampaignTable | undefined;
	listTables(): RPGCampaignTable[];
	setTable(table: RPGCampaignTable): void;
	deleteTable(id: string): void;
	listMemberships(accountId: string): RPGTableMember[];
	listMembershipsForTable(tableId: string): RPGTableMember[];
	getMembership(tableId: string, accountId: string): RPGTableMember | undefined;
	setMembership(member: RPGTableMember): void;
	getInviteByCodeHash(codeHash: string): RPGTableInvite | undefined;
	getInvite(id: string): RPGTableInvite | undefined;
	listInvites(tableId: string): RPGTableInvite[];
	listDirectedInvites(accountId: string): RPGTableInvite[];
	setInvite(invite: RPGTableInvite): void;
	listRecoveryCodes(accountId: string): RPGRecoveryCode[];
	setRecoveryCode(code: RPGRecoveryCode): void;
	getLoginAttempt(key: string): RPGLoginAttempt | undefined;
	listLoginAttempts(accountKey: string): RPGLoginAttempt[];
	setLoginAttempt(attempt: RPGLoginAttempt | null, key: string): void;
	listAuditEntries(tableId: string): RPGAdminAuditEntry[];
	addAuditEntry(entry: RPGAdminAuditEntry): void;
	getAccountNote(authorAccountId: string, targetAccountId: string): RPGAccountRelationNote | undefined;
	setAccountNote(note: RPGAccountRelationNote): void;
}

/** Repositório determinístico usado nos testes e como contrato para o adaptador MySQL. */
export class RPGMemoryAccountRepository implements RPGAccountRepository {
	private accounts = new Map<string, RPGPlatformAccount>();
	private tables = new Map<string, RPGCampaignTable>();
	private members = new Map<string, RPGTableMember>();
	private invites = new Map<string, RPGTableInvite>();
	private recoveryCodes = new Map<string, RPGRecoveryCode>();
	private loginAttempts = new Map<string, RPGLoginAttempt>();
	private auditEntries = new Map<string, RPGAdminAuditEntry>();
	private accountNotes = new Map<string, RPGAccountRelationNote>();
	private transactionEffects: (() => void)[] | null = null;
	constructor(
		snapshot: RPGAccountRepositorySnapshot = {},
		private readonly changed: {
			account?: (value: RPGPlatformAccount) => void,
			table?: (value: RPGCampaignTable | null, id: string) => void,
			member?: (value: RPGTableMember) => void,
			invite?: (value: RPGTableInvite) => void,
			recoveryCode?: (value: RPGRecoveryCode) => void,
			loginAttempt?: (value: RPGLoginAttempt | null, key: string) => void,
			auditEntry?: (value: RPGAdminAuditEntry) => void,
			accountNote?: (value: RPGAccountRelationNote) => void,
		} = {}
	) {
		this.replace(snapshot);
	}
	replace(snapshot: RPGAccountRepositorySnapshot): void {
		this.accounts.clear(); this.tables.clear(); this.members.clear(); this.invites.clear();
		this.recoveryCodes.clear(); this.loginAttempts.clear(); this.auditEntries.clear(); this.accountNotes.clear();
		for (const value of snapshot.accounts || []) {
			const account = structuredClone(value);
			account.handle ||= account.username;
			this.accounts.set(account.id, account);
		}
		for (const value of snapshot.tables || []) this.tables.set(value.id, structuredClone(value));
		for (const value of snapshot.members || []) this.members.set(`${value.tableId}:${value.accountId}`, structuredClone(value));
		for (const value of snapshot.invites || []) this.invites.set(value.id, structuredClone(value));
		for (const value of snapshot.recoveryCodes || []) this.recoveryCodes.set(value.id, structuredClone(value));
		for (const value of snapshot.loginAttempts || []) this.loginAttempts.set(value.key, structuredClone(value));
		for (const value of snapshot.auditEntries || []) this.auditEntries.set(value.id, structuredClone(value));
		for (const value of snapshot.accountNotes || []) {
			this.accountNotes.set(`${value.authorAccountId}:${value.targetAccountId}`, structuredClone(value));
		}
	}
	replaceAuditEntries(tableId: string, entries: RPGAdminAuditEntry[]): void {
		const normalized = toID(tableId);
		for (const [id, entry] of this.auditEntries) if (entry.tableId === normalized) this.auditEntries.delete(id);
		for (const entry of entries) this.auditEntries.set(entry.id, structuredClone(entry));
	}
	getAccount(id: string) { return this.clone(this.accounts.get(toID(id))); }
	getAccountByUsername(username: string) {
		const normalized = toID(username); return this.clone([...this.accounts.values()].find(account => account.username === normalized));
	}
	getAccountByHandle(handle: string) {
		const normalized = RPGAccountManagement.normalizeHandle(handle);
		return this.clone([...this.accounts.values()].find(account => account.handle === normalized));
	}
	transaction<T>(action: () => T): T {
		if (this.transactionEffects) return action();
		const snapshot = {
			accounts: structuredClone(this.accounts), tables: structuredClone(this.tables),
			members: structuredClone(this.members), invites: structuredClone(this.invites),
			recoveryCodes: structuredClone(this.recoveryCodes), loginAttempts: structuredClone(this.loginAttempts),
			auditEntries: structuredClone(this.auditEntries),
			accountNotes: structuredClone(this.accountNotes),
		};
		this.transactionEffects = [];
		try {
			const result = action(); const effects = this.transactionEffects;
			this.transactionEffects = null; for (const effect of effects) effect();
			return result;
		} catch (error) {
			this.accounts = snapshot.accounts; this.tables = snapshot.tables; this.members = snapshot.members;
			this.invites = snapshot.invites; this.recoveryCodes = snapshot.recoveryCodes;
			this.loginAttempts = snapshot.loginAttempts; this.auditEntries = snapshot.auditEntries;
			this.accountNotes = snapshot.accountNotes;
			this.transactionEffects = null; throw error;
		}
	}
	setAccount(account: RPGPlatformAccount) {
		this.accounts.set(account.id, structuredClone(account)); this.effect(() => this.changed.account?.(account));
	}
	getTable(id: string) { return this.clone(this.tables.get(toID(id))); }
	listTables() { return [...this.tables.values()].map(table => structuredClone(table)); }
	setTable(table: RPGCampaignTable) {
		this.tables.set(table.id, structuredClone(table)); this.effect(() => this.changed.table?.(table, table.id));
	}
	deleteTable(id: string) {
		const normalized = toID(id); this.tables.delete(normalized);
		for (const [key, member] of this.members) if (member.tableId === normalized) this.members.delete(key);
		for (const [key, invite] of this.invites) if (invite.tableId === normalized) this.invites.delete(key);
		for (const [key, audit] of this.auditEntries) if (audit.tableId === normalized) this.auditEntries.delete(key);
		this.effect(() => this.changed.table?.(null, normalized));
	}
	listMemberships(accountId: string) {
		return [...this.members.values()].filter(member => member.accountId === toID(accountId)).map(member => structuredClone(member));
	}
	listMembershipsForTable(tableId: string) {
		return [...this.members.values()].filter(member => member.tableId === toID(tableId)).map(member => structuredClone(member));
	}
	getMembership(tableId: string, accountId: string) { return this.clone(this.members.get(`${toID(tableId)}:${toID(accountId)}`)); }
	setMembership(member: RPGTableMember) {
		this.members.set(`${member.tableId}:${member.accountId}`, structuredClone(member));
		this.effect(() => this.changed.member?.(member));
	}
	getAccountNote(authorAccountId: string, targetAccountId: string) {
		return this.clone(this.accountNotes.get(`${toID(authorAccountId)}:${toID(targetAccountId)}`));
	}
	setAccountNote(note: RPGAccountRelationNote) {
		this.accountNotes.set(`${note.authorAccountId}:${note.targetAccountId}`, structuredClone(note));
		this.effect(() => this.changed.accountNote?.(note));
	}
	getInviteByCodeHash(codeHash: string) { return this.clone([...this.invites.values()].find(invite => invite.codeHash === codeHash)); }
	getInvite(id: string) { return this.clone(this.invites.get(toID(id))); }
	listInvites(tableId: string) {
		return [...this.invites.values()].filter(invite => invite.tableId === toID(tableId))
			.map(invite => structuredClone(invite));
	}
	listDirectedInvites(accountId: string) {
		return [...this.invites.values()].filter(invite => invite.targetAccountId === toID(accountId))
			.map(invite => structuredClone(invite));
	}
	setInvite(invite: RPGTableInvite) {
		this.invites.set(invite.id, structuredClone(invite)); this.effect(() => this.changed.invite?.(invite));
	}
	listRecoveryCodes(accountId: string) {
		return [...this.recoveryCodes.values()].filter(code => code.accountId === toID(accountId)).map(code => structuredClone(code));
	}
	setRecoveryCode(code: RPGRecoveryCode) {
		this.recoveryCodes.set(code.id, structuredClone(code)); this.effect(() => this.changed.recoveryCode?.(code));
	}
	getLoginAttempt(key: string) { return this.clone(this.loginAttempts.get(key)); }
	listLoginAttempts(accountKey: string) {
		return [...this.loginAttempts.values()].filter(attempt => attempt.accountKey === accountKey)
			.map(attempt => structuredClone(attempt));
	}
	setLoginAttempt(attempt: RPGLoginAttempt | null, key: string) {
		if (attempt) this.loginAttempts.set(key, structuredClone(attempt)); else this.loginAttempts.delete(key);
		this.effect(() => this.changed.loginAttempt?.(attempt, key));
	}
	listAuditEntries(tableId: string) {
		return [...this.auditEntries.values()].filter(entry => entry.tableId === toID(tableId))
			.sort((a, b) => b.createdAt - a.createdAt).map(entry => structuredClone(entry));
	}
	addAuditEntry(entry: RPGAdminAuditEntry) {
		this.auditEntries.set(entry.id, structuredClone(entry)); this.effect(() => this.changed.auditEntry?.(entry));
	}
	private effect(action: () => void) { if (this.transactionEffects) this.transactionEffects.push(action); else action(); }
	private clone<T>(value: T | undefined): T | undefined { return value && structuredClone(value); }
}

export class RPGMemoryPlatformSessionRepository {
	private sessions = new Map<string, RPGStoredPlatformSession>();
	private transactionEffects: (() => void)[] | null = null;
	constructor(
		sessions: RPGStoredPlatformSession[] = [],
		private readonly changed?: (value: RPGStoredPlatformSession | null, tokenHash: string) => void
	) { this.replace(sessions); }
	replace(sessions: RPGStoredPlatformSession[]): void {
		this.sessions.clear();
		for (const session of sessions) this.sessions.set(session.tokenHash, structuredClone(session));
	}
	transaction<T>(action: () => T): T {
		if (this.transactionEffects) return action();
		const snapshot = structuredClone(this.sessions); this.transactionEffects = [];
		try {
			const result = action(); const effects = this.transactionEffects;
			this.transactionEffects = null; for (const effect of effects) effect();
			return result;
		} catch (error) {
			this.sessions = snapshot; this.transactionEffects = null; throw error;
		}
	}
	get(tokenHash: string) { const value = this.sessions.get(tokenHash); return value && structuredClone(value); }
	listByAccount(accountId: string) {
		return [...this.sessions.values()].filter(session => session.accountId === accountId)
			.map(session => structuredClone(session));
	}
	set(session: RPGStoredPlatformSession) {
		this.sessions.set(session.tokenHash, structuredClone(session));
		this.effect(() => this.changed?.(session, session.tokenHash));
	}
	delete(tokenHash: string) { this.sessions.delete(tokenHash); this.effect(() => this.changed?.(null, tokenHash)); }
	private effect(action: () => void) { if (this.transactionEffects) this.transactionEffects.push(action); else action(); }
}

export class RPGAccountManagement {
	private readonly auditRequest = new AsyncLocalStorage<RPGAuditRequestContext>();
	constructor(
		readonly repository: RPGAccountRepository = new RPGMemoryAccountRepository(),
		private readonly now = Date.now,
		private readonly bytes: (size: number) => Buffer = randomBytes,
		readonly sessionRepository = new RPGMemoryPlatformSessionRepository(),
		private readonly transaction: <T>(action: () => T) => T = action => action()
	) {}

	static normalizeHandle(value: string): string {
		return String(value || '').trim().replace(/^@/, '').toLowerCase();
	}

	withAuditContext<T>(context: RPGAuditRequestContext, action: () => T): T {
		return this.auditRequest.run(context, action);
	}

	replaceAuditEntries(tableId: string, entries: RPGAdminAuditEntry[]): void {
		if (!(this.repository instanceof RPGMemoryAccountRepository)) {
			throw new Error('O repositório de contas não permite atualizar a auditoria');
		}
		this.repository.replaceAuditEntries(tableId, entries);
	}

	reload(snapshot: RPGAccountRepositorySnapshot, sessions: RPGStoredPlatformSession[]): void {
		if (!(this.repository instanceof RPGMemoryAccountRepository)) {
			throw new Error('O repositório de contas não permite atualização de concorrência');
		}
		this.repository.replace(snapshot); this.sessionRepository.replace(sessions);
	}

	createAccount(username: string, displayName: string, password: string, handle?: string): RPGPublicPlatformAccount {
		const normalized = toID(username);
		const normalizedHandle = this.handle(handle || normalized);
		if (normalized.length < 3 || normalized.length > 40) throw new Error('O usuário deve ter entre 3 e 40 caracteres');
		if (this.repository.getAccountByUsername(normalized)) throw new Error('Este nome de usuário já está em uso');
		if (this.repository.getAccountByHandle(normalizedHandle)) throw new Error('Este @ já está em uso');
		this.validatePassword(password);
		const now = this.now();
		const account: RPGPlatformAccount = {
			id: this.id(), username: normalized, handle: normalizedHandle,
			displayName: this.text(displayName, 80, 'nome de exibição'),
			credential: this.hashPassword(password), status: 'active', createdAt: now, updatedAt: now, revision: 0,
		};
		this.repository.setAccount(account);
		return this.publicAccount(account);
	}

	createAccountWithRecoveryCodes(username: string, displayName: string, password: string, handle?: string) {
		return this.atomic(() => {
			const account = this.createAccount(username, displayName, password, handle);
			return { account, recoveryCodes: this.replaceRecoveryCodes(account.id) };
		});
	}

	async createAccountWithRecoveryCodesAsync(username: string, displayName: string, password: string, handle?: string) {
		const normalized = toID(username);
		const normalizedHandle = this.handle(handle || normalized);
		if (normalized.length < 3 || normalized.length > 40) throw new Error('O usuário deve ter entre 3 e 40 caracteres');
		if (this.repository.getAccountByUsername(normalized)) throw new Error('Este nome de usuário já está em uso');
		if (this.repository.getAccountByHandle(normalizedHandle)) throw new Error('Este @ já está em uso');
		this.validatePassword(password);
		const display = this.text(displayName, 80, 'nome de exibição');
		const credential = await this.hashPasswordAsync(password);
		return this.atomic(() => {
			if (this.repository.getAccountByUsername(normalized)) throw new Error('Este nome de usuário já está em uso');
			if (this.repository.getAccountByHandle(normalizedHandle)) throw new Error('Este @ já está em uso');
			const now = this.now();
			const account: RPGPlatformAccount = {
				id: this.id(), username: normalized, handle: normalizedHandle, displayName: display, credential,
				status: 'active', createdAt: now, updatedAt: now, revision: 0,
			};
			this.repository.setAccount(account);
			return { account: this.publicAccount(account), recoveryCodes: this.replaceRecoveryCodes(account.id) };
		});
	}

	/** Reuses a version 1 scrypt credential while assigning its character to the imported table. */
	linkLegacyCharacter(input: {
		characterId: string, displayName: string, credential: RPGAccountCredential,
		tableId: string, createdAt: number,
	}): { account: RPGPublicPlatformAccount, membership: RPGTableMember } {
		return this.atomic(() => {
			const username = toID(input.characterId);
			let account = this.repository.getAccountByUsername(username);
			if (!account) {
				const accountId = createHash('sha256').update(`pokemon-rpg:legacy-account:${username}`).digest('hex').slice(0, 36);
				account = {
					id: accountId, username, handle: username,
					displayName: this.text(input.displayName, 80, 'nome de exibição'),
					credential: structuredClone(input.credential), status: 'active', createdAt: input.createdAt,
					updatedAt: input.createdAt, revision: 0,
				};
				this.repository.setAccount(account);
			}
			const previous = this.repository.getMembership(input.tableId, account.id); const now = this.now();
			const membership: RPGTableMember = previous || {
				tableId: toID(input.tableId), accountId: account.id, role: 'player', status: 'active', permissions: {},
				joinedAt: input.createdAt, updatedAt: now, revision: 0,
			};
			if (!previous) this.repository.setMembership(membership);
			return { account: this.publicAccount(account), membership: structuredClone(membership) };
		});
	}

	login(username: string, password: string, source = ''): RPGPlatformSession {
		const context = this.loginContext(username, source);
		const passwordMatches = this.verifyPassword(password, context.account?.credential || RPG_DUMMY_LOGIN_CREDENTIAL);
		return this.finishLogin(context, passwordMatches);
	}

	async loginAsync(username: string, password: string, source = ''): Promise<RPGPlatformSession> {
		const context = this.loginContext(username, source);
		this.assertLoginAvailable(context);
		const passwordMatches = await this.verifyPasswordAsync(
			password, context.account?.credential || RPG_DUMMY_LOGIN_CREDENTIAL
		);
		return this.finishLogin(context, passwordMatches);
	}

	private assertLoginAvailable(context: ReturnType<RPGAccountManagement['loginContext']>): void {
		if ([context.attempt, context.globalAttempt, context.sourceAttempt]
			.some(value => value?.blockedUntil && value.blockedUntil > context.now)) {
			throw new Error('Muitas tentativas de login. Tente novamente mais tarde');
		}
	}

	private loginContext(username: string, source: string) {
		const normalizedUsername = toID(username); const accountKey = this.tokenHash(normalizedUsername);
		const attemptKey = this.tokenHash(`${normalizedUsername}:${source.trim().toLowerCase()}`);
		const globalAttemptKey = this.tokenHash(`${accountKey}:global`);
		const sourceAccountKey = this.tokenHash(`login-source:${source.trim().toLowerCase() || 'unknown'}`);
		const sourceAttemptKey = this.tokenHash(`${sourceAccountKey}:global`);
		return {
			accountKey, attemptKey, globalAttemptKey, sourceAccountKey, sourceAttemptKey,
			attempt: this.repository.getLoginAttempt(attemptKey),
			globalAttempt: this.repository.getLoginAttempt(globalAttemptKey),
			sourceAttempt: this.repository.getLoginAttempt(sourceAttemptKey),
			now: this.now(), account: this.repository.getAccountByUsername(username),
		};
	}

	private finishLogin(context: ReturnType<RPGAccountManagement['loginContext']>, passwordMatches: boolean) {
		const { accountKey, attemptKey, globalAttemptKey, sourceAccountKey, sourceAttemptKey,
			attempt, globalAttempt, sourceAttempt, now, account } = context;
		if ([attempt, globalAttempt, sourceAttempt].some(value => value?.blockedUntil && value.blockedUntil > now)) {
			throw new Error('Muitas tentativas de login. Tente novamente mais tarde');
		}
		if (!account || account.status !== 'active' || !passwordMatches) {
			const increment = (current: RPGLoginAttempt | undefined, key: string, ownerKey = accountKey,
				maximum = RPG_LOGIN_MAX_FAILURES): RPGLoginAttempt => {
				const active = current && now - current.windowStartedAt < RPG_LOGIN_WINDOW ? current :
					{ key, accountKey: ownerKey, failures: 0, windowStartedAt: now, updatedAt: now };
				active.accountKey = ownerKey;
				active.failures++; active.updatedAt = now;
				if (active.failures >= maximum) active.blockedUntil = now + RPG_LOGIN_BLOCK;
				return active;
			};
			this.atomic(() => {
				this.repository.setLoginAttempt(increment(attempt, attemptKey), attemptKey);
				this.repository.setLoginAttempt(increment(globalAttempt, globalAttemptKey), globalAttemptKey);
				this.repository.setLoginAttempt(increment(sourceAttempt, sourceAttemptKey,
					sourceAccountKey, RPG_LOGIN_SOURCE_MAX_FAILURES), sourceAttemptKey);
			});
			throw new Error('Usuário ou senha inválidos');
		}
		return this.atomic(() => {
			for (const value of this.repository.listLoginAttempts(accountKey)) {
				this.repository.setLoginAttempt(null, value.key);
			}
			const token = this.bytes(32).toString('base64url');
			const createdAt = this.now();
			this.sessionRepository.set({
				tokenHash: this.tokenHash(token), accountId: account.id, createdAt, lastSeenAt: createdAt,
				expiresAt: createdAt + RPG_PLATFORM_SESSION_TTL,
			});
			return { token, accountId: account.id, createdAt, expiresAt: createdAt + RPG_PLATFORM_SESSION_TTL };
		});
	}

	regenerateRecoveryCodes(token: string, password: string): string[] {
		const session = this.session(token); const account = this.repository.getAccount(session.accountId)!;
		if (!this.verifyPassword(password, account.credential)) throw new Error('Usuário ou senha inválidos');
		return this.atomic(() => this.replaceRecoveryCodes(account.id));
	}

	async regenerateRecoveryCodesAsync(token: string, password: string): Promise<string[]> {
		const session = this.session(token); const account = this.repository.getAccount(session.accountId)!;
		if (!await this.verifyPasswordAsync(password, account.credential)) throw new Error('Usuário ou senha inválidos');
		return this.atomic(() => this.replaceRecoveryCodes(account.id));
	}

	async changePasswordAsync(token: string, currentPassword: string, newPassword: string): Promise<void> {
		const currentHash = this.tokenHash(token); const session = this.session(token);
		const account = this.repository.getAccount(session.accountId)!;
		this.validatePassword(newPassword);
		if (!await this.verifyPasswordAsync(currentPassword, account.credential)) {
			throw new Error('Usuário ou senha inválidos');
		}
		const credential = await this.hashPasswordAsync(newPassword); const now = this.now();
		this.atomic(() => {
			account.credential = credential; account.updatedAt = now; account.revision++;
			this.repository.setAccount(account);
			for (const connected of this.sessionRepository.listByAccount(account.id)) {
				if (connected.tokenHash === currentHash || connected.revokedAt) continue;
				connected.revokedAt = now; this.sessionRepository.set(connected);
			}
		});
	}

	recoverPassword(username: string, recoveryCode: string, newPassword: string, source = ''): void {
		const recovery = this.preparePasswordRecovery(username, recoveryCode, newPassword, source);
		this.completePasswordRecovery(recovery, this.hashPassword(newPassword));
	}

	async recoverPasswordAsync(username: string, recoveryCode: string, newPassword: string, source = ''): Promise<void> {
		const recovery = this.preparePasswordRecovery(username, recoveryCode, newPassword, source);
		this.completePasswordRecovery(recovery, await this.hashPasswordAsync(newPassword));
	}

	private preparePasswordRecovery(username: string, recoveryCode: string, newPassword: string, source: string) {
		const normalizedUsername = toID(username);
		const loginAccountKey = this.tokenHash(normalizedUsername);
		const recoveryAccountKey = this.tokenHash(`recovery:${normalizedUsername}`);
		const attemptKey = this.tokenHash(`recovery:${normalizedUsername}:${source.trim().toLowerCase()}`);
		const globalAttemptKey = this.tokenHash(`${recoveryAccountKey}:global`);
		const sourceAccountKey = this.tokenHash(`recovery-source:${source.trim().toLowerCase() || 'unknown'}`);
		const sourceAttemptKey = this.tokenHash(`${sourceAccountKey}:global`);
		const attempt = this.repository.getLoginAttempt(attemptKey);
		const globalAttempt = this.repository.getLoginAttempt(globalAttemptKey);
		const sourceAttempt = this.repository.getLoginAttempt(sourceAttemptKey);
		const now = this.now();
		const account = this.repository.getAccountByUsername(username); this.validatePassword(newPassword);
		const hash = this.tokenHash(recoveryCode.trim().toUpperCase());
		const code = account && this.repository.listRecoveryCodes(account.id)
			.find(value => !value.usedAt && value.codeHash === hash);
		if ([attempt, globalAttempt, sourceAttempt].some(value => value?.blockedUntil && value.blockedUntil > now)) {
			throw new Error('Muitas tentativas de recuperação. Tente novamente mais tarde');
		}
		if (!account || !code) {
			const increment = (current: RPGLoginAttempt | undefined, key: string, ownerKey = recoveryAccountKey,
				maximum = RPG_RECOVERY_MAX_FAILURES): RPGLoginAttempt => {
				const active = current && now - current.windowStartedAt < RPG_RECOVERY_WINDOW ? current :
					{ key, accountKey: ownerKey, failures: 0, windowStartedAt: now, updatedAt: now };
				active.accountKey = ownerKey;
				active.failures++; active.updatedAt = now;
				if (active.failures >= maximum) active.blockedUntil = now + RPG_RECOVERY_BLOCK;
				return active;
			};
			this.atomic(() => {
				this.repository.setLoginAttempt(increment(attempt, attemptKey), attemptKey);
				this.repository.setLoginAttempt(increment(globalAttempt, globalAttemptKey), globalAttemptKey);
				this.repository.setLoginAttempt(increment(sourceAttempt, sourceAttemptKey,
					sourceAccountKey, RPG_RECOVERY_SOURCE_MAX_FAILURES), sourceAttemptKey);
			});
			throw new Error('Código de recuperação inválido');
		}
		return { account, code, now, loginAccountKey, recoveryAccountKey };
	}

	private completePasswordRecovery(recovery: ReturnType<RPGAccountManagement['preparePasswordRecovery']>,
		credential: RPGAccountCredential): void {
		const { account, code, now, loginAccountKey, recoveryAccountKey } = recovery;
		this.atomic(() => {
			code.usedAt = now; this.repository.setRecoveryCode(code);
			account.credential = credential; account.updatedAt = now; account.revision++;
			this.repository.setAccount(account);
			for (const session of this.sessionRepository.listByAccount(account.id)) {
				if (!session.revokedAt) { session.revokedAt = now; this.sessionRepository.set(session); }
			}
			for (const attempt of [
				...this.repository.listLoginAttempts(loginAccountKey),
				...this.repository.listLoginAttempts(recoveryAccountKey),
			]) {
				this.repository.setLoginAttempt(null, attempt.key);
			}
		});
	}

	listAudit(token: string, tableId: string, limit = 100): RPGAdminAuditEntry[] {
		const session = this.session(token); const table = this.repository.getTable(tableId);
		if (!table) throw new Error('Mesa indisponível');
		const member = this.repository.getMembership(table.id, session.accountId);
		if (!member || member.status !== 'active') throw new Error('A conta não participa desta mesa');
		this.requirePermission(member, 'members.manage');
		return this.repository.listAuditEntries(tableId).slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
	}

	/** Records a rejected administrative request without requiring the denied permission itself. */
	recordAdministrativeFailure(token: string, tableId: string, action: string, targetType: string,
		targetId: string | undefined, error: unknown): void {
		const session = this.session(token);
		const table = this.repository.getTable(tableId);
		const actor = this.repository.getMembership(toID(tableId), session.accountId);
		if (!table) return;
		const message = error instanceof Error ? error.message : 'Falha administrativa';
		const authorization = /permissão|permission|proprietário|participa desta mesa|administrar mestres/i.test(message);
		const errorDetails = error && typeof error === 'object' ? error as { code?: unknown, sqlState?: unknown } : undefined;
		const errorCode = typeof errorDetails?.code === 'string' ? errorDetails.code : '';
		const persistence = typeof errorDetails?.sqlState === 'string' ||
			errorCode === 'RPG_PERSISTENCE_FAILURE' || /^(?:ER_|PROTOCOL_|ECONN|ETIMEDOUT|EPIPE)/.test(errorCode) ||
			/mysql|persist|banco de dados|transaction/i.test(message);
		const safeError = authorization ? 'Ação recusada por permissão' :
			persistence ? 'Falha ao persistir a ação administrativa' : 'Ação recusada por validação';
		this.repository.addAuditEntry({
			id: this.id(), tableId: table.id, actorAccountId: actor?.accountId || session.accountId,
			action, targetType, targetId, metadata: {
				...this.auditMetadata(), result: authorization ? 'denied' : 'failure',
				failureType: authorization ? 'authorization' : persistence ? 'persistence' : 'validation',
				error: safeError,
			}, createdAt: this.now(),
		});
	}

	recordAdministrativeSuccess(token: string, tableId: string, action: string, targetType: string,
		targetId?: string): void {
		const session = this.session(token); const table = this.repository.getTable(tableId);
		const actor = this.repository.getMembership(toID(tableId), session.accountId);
		if (!table || !actor) return;
		this.repository.addAuditEntry({
			id: this.id(), tableId: table.id, actorAccountId: actor.accountId, action, targetType, targetId,
			metadata: { ...this.auditMetadata(), result: 'success' }, createdAt: this.now(),
		});
	}

	getSession(token: string): RPGPlatformSessionView {
		const stored = this.session(token);
		const account = this.repository.getAccount(stored.accountId);
		if (!account || account.status !== 'active') throw new Error('Conta indisponível');
		const member = stored.activeTableId ? this.repository.getMembership(stored.activeTableId, stored.accountId) : undefined;
		return {
			session: { token, accountId: stored.accountId, activeTableId: stored.activeTableId,
				...(member?.status === 'active' ? { membershipId: `${member.tableId}:${member.accountId}`, role: member.role } : {}),
				createdAt: stored.createdAt, expiresAt: stored.expiresAt },
			account: this.publicAccount(account),
		};
	}

	updateAccount(token: string, displayName: string, handle?: string): RPGPublicPlatformAccount {
		const session = this.session(token); const account = this.repository.getAccount(session.accountId);
		if (!account || account.status !== 'active') throw new Error('Conta indisponível');
		account.displayName = this.text(displayName, 80, 'nome de exibição');
		if (handle !== undefined) {
			const normalizedHandle = this.handle(handle);
			const owner = this.repository.getAccountByHandle(normalizedHandle);
			if (owner && owner.id !== account.id) throw new Error('Este @ já está em uso');
			account.handle = normalizedHandle;
		}
		account.updatedAt = this.now(); account.revision++;
		this.repository.setAccount(account);
		return this.publicAccount(account);
	}

	createTable(token: string, input: Pick<RPGCampaignTable, 'name'> &
		Partial<Pick<RPGCampaignTable, 'description' | 'color' | 'visibility'>> &
		{ requireJoinApproval?: boolean, settings?: Partial<RPGTablePresentationSettings> }): RPGCampaignTable {
		const session = this.session(token); const now = this.now(); const id = this.id();
		if (input.visibility && !['private', 'code', 'public'].includes(input.visibility)) {
			throw new Error('Visibilidade da mesa inválida');
		}
		const table: RPGCampaignTable = {
			id, ownerAccountId: session.accountId, name: this.text(input.name, 120, 'nome da mesa'),
			description: this.optionalText(input.description, 500), color: this.color(input.color),
			visibility: input.visibility || 'private', status: 'active',
			settings: { requireJoinApproval: input.requireJoinApproval !== false, ...this.presentationSettings(input.settings) },
			createdAt: now, updatedAt: now, revision: 0,
		};
		const owner: RPGTableMember = {
			tableId: id, accountId: session.accountId, role: 'owner', status: 'active', permissions: {},
			joinedAt: now, updatedAt: now, revision: 0,
		};
		this.atomic(() => {
			this.repository.setTable(table); this.repository.setMembership(owner);
			this.audit(owner, 'table.created', 'table', id, { name: table.name, visibility: table.visibility });
		});
		return structuredClone(table);
	}

	updateTable(token: string, tableId: string, input: Partial<Pick<RPGCampaignTable,
		'name' | 'description' | 'color' | 'visibility'>> & {
			requireJoinApproval?: boolean,
			settings?: Partial<RPGTablePresentationSettings>,
		}): RPGCampaignTable {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		if (member.role !== 'owner') throw new Error('Apenas o proprietário pode editar a mesa');
		const table = this.repository.getTable(member.tableId)!;
		if (table.status !== 'active') throw new Error('Mesa arquivada não pode ser editada');
		if (input.visibility !== undefined && !['private', 'code', 'public'].includes(input.visibility)) {
			throw new Error('Visibilidade da mesa inválida');
		}
		const previous = { name: table.name, description: table.description, color: table.color, visibility: table.visibility };
		if (input.name !== undefined) table.name = this.text(input.name, 120, 'nome da mesa');
		if (input.description !== undefined) table.description = this.optionalText(input.description, 500);
		if (input.color !== undefined) table.color = this.color(input.color);
		if (input.visibility !== undefined) table.visibility = input.visibility;
		if (input.requireJoinApproval !== undefined) table.settings.requireJoinApproval = input.requireJoinApproval;
		if (input.settings !== undefined) Object.assign(table.settings, this.presentationSettings(input.settings, table.settings));
		table.updatedAt = this.now(); table.revision++;
		this.atomic(() => {
			this.repository.setTable(table);
			this.audit(member, 'table.updated', 'table', table.id, { previous,
				current: { name: table.name, description: table.description, color: table.color, visibility: table.visibility } });
		});
		return structuredClone(table);
	}

	listTables(token: string): RPGAccountTableView[] {
		const session = this.session(token); const onlineSince = this.now() - 15_000;
		return this.repository.listMemberships(session.accountId).filter(member => member.status === 'active').flatMap(member => {
			const table = this.repository.getTable(member.tableId);
			const owner = table && this.repository.getAccount(table.ownerAccountId);
			if (!table || !owner) return [];
			const members = this.repository.listMembershipsForTable(table.id).filter(value => value.status === 'active');
			const lastActivityAt = Math.max(table.updatedAt, ...members.map(value => value.updatedAt),
				...this.repository.listAuditEntries(table.id).map(value => value.createdAt));
			const ownerOnline = this.sessionRepository.listByAccount(owner.id).some(value => !value.revokedAt &&
				value.expiresAt > this.now() && value.lastSeenAt >= onlineSince && value.activeTableId === table.id);
			return [{ table, membership: member, owner: this.publicAccount(owner), ownerOnline,
				memberCount: members.length, lastActivityAt }];
		}).sort((a, b) => Number(b.membership.permissions['ui.favoriteTable'] === true) -
			Number(a.membership.permissions['ui.favoriteTable'] === true) || b.lastActivityAt - a.lastActivityAt);
	}

	discoverTables(token: string): RPGAccountTableView[] {
		const session = this.session(token); const onlineSince = this.now() - 15_000;
		return this.repository.listTables().filter(table => {
			if (table.status !== 'active' || table.visibility !== 'public' || table.ownerAccountId === session.accountId) {
				return false;
			}
			const membership = this.repository.getMembership(table.id, session.accountId);
			return !membership || !['active', 'pending', 'blocked'].includes(membership.status);
		})
			.map(table => {
				const owner = this.repository.getAccount(table.ownerAccountId);
				if (!owner) return undefined;
				const members = this.repository.listMembershipsForTable(table.id).filter(member => member.status === 'active');
				const membership = this.repository.getMembership(table.id, session.accountId) || {
					tableId: table.id, accountId: session.accountId, role: 'player' as const, status: 'left' as const,
					permissions: {}, joinedAt: 0, updatedAt: 0, revision: 0,
				};
				const ownerOnline = this.sessionRepository.listByAccount(owner.id).some(value => !value.revokedAt &&
					value.expiresAt > this.now() && value.lastSeenAt >= onlineSince && value.activeTableId === table.id);
				return { table, membership, owner: this.publicAccount(owner), ownerOnline, memberCount: members.length,
					lastActivityAt: Math.max(table.updatedAt, ...members.map(member => member.updatedAt)) };
			})
			.filter((entry): entry is RPGAccountTableView => !!entry)
			.sort(() => this.bytes(4).readUInt32BE() - 0x80000000);
	}

	joinPublicTable(token: string, tableId: string): RPGTableMember {
		const session = this.session(token); const table = this.repository.getTable(tableId);
		if (!table || table.status !== 'active' || table.visibility !== 'public') throw new Error('Mesa pública indisponível');
		if (table.ownerAccountId === session.accountId) throw new Error('Você já administra esta mesa');
		const previous = this.repository.getMembership(table.id, session.accountId);
		if (previous?.status === 'blocked') throw new Error('Esta conta está bloqueada nesta mesa');
		if (previous?.status === 'active') throw new Error('A conta já participa desta mesa');
		if (previous?.status === 'pending') return structuredClone(previous);
		const now = this.now(); const requiresApproval = table.settings.requireJoinApproval !== false;
		const member: RPGTableMember = {
			tableId: table.id, accountId: session.accountId, role: 'player',
			status: requiresApproval ? 'pending' : 'active', permissions: {},
			joinedAt: previous?.joinedAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1,
		};
		this.atomic(() => {
			this.repository.setMembership(member);
			this.audit(member, requiresApproval ? 'member.requested' : 'member.joined', 'member', member.accountId, {
				previousRole: previous?.role, newRole: member.role, previousStatus: previous?.status, newStatus: member.status,
				source: 'public-discovery',
			});
		});
		return structuredClone(member);
	}

	setTableFavorite(token: string, tableId: string, favorite: boolean): RPGTableMember {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		member.permissions['ui.favoriteTable'] = favorite; member.updatedAt = this.now(); member.revision++;
		this.repository.setMembership(member);
		return structuredClone(member);
	}

	getTableCardDetails(token: string, tableId: string): RPGTableCardDetails {
		const session = this.session(token); const table = this.repository.getTable(tableId);
		if (!table) throw new Error('Mesa indisponível');
		const membership = this.repository.getMembership(table.id, session.accountId);
		if (table.visibility !== 'public' && membership?.status !== 'active') throw new Error('Você não pode visualizar esta mesa');
		const owner = this.repository.getAccount(table.ownerAccountId);
		if (!owner) throw new Error('Proprietário da mesa indisponível');
		const onlineSince = this.now() - 15_000;
		const members = this.repository.listMembershipsForTable(table.id).filter(value => value.status === 'active').flatMap(value => {
			const account = this.repository.getAccount(value.accountId);
			if (!account) return [];
			const sessions = this.sessionRepository.listByAccount(account.id);
			const visits = sessions.filter(active => active.activeTableId === table.id);
			const lastSeenAt = Math.max(value.updatedAt, ...visits.map(active => active.lastSeenAt));
			const online = visits.some(active => !active.revokedAt && active.expiresAt > this.now() && active.lastSeenAt >= onlineSince);
			return [{ account: this.publicAccount(account), role: value.role, lastSeenAt, online }];
		});
		return { table: structuredClone(table), owner: this.publicAccount(owner),
			...(membership ? { membership: structuredClone(membership) } : {}), members };
	}

	listDirectedInvites(token: string): RPGDirectedInviteView[] {
		const session = this.session(token); const now = this.now(); const result: RPGDirectedInviteView[] = [];
		for (const invite of this.repository.listDirectedInvites(session.accountId)) {
			if (invite.status === 'active' && invite.expiresAt !== undefined && invite.expiresAt <= now) {
				invite.status = 'expired'; this.repository.setInvite(invite);
			}
			if (invite.status !== 'active' || invite.usedCount >= invite.maxUses) continue;
			if (['active', 'pending'].includes(this.repository.getMembership(invite.tableId, session.accountId)?.status || '')) continue;
			const table = this.repository.getTable(invite.tableId); const owner = table && this.repository.getAccount(table.ownerAccountId);
			if (!table || table.status !== 'active' || !owner) continue;
			result.push({ invite: this.publicInvite(invite), table, owner: this.publicAccount(owner),
				memberCount: this.repository.listMembershipsForTable(table.id).filter(member => member.status === 'active').length });
		}
		return result.sort((a, b) => b.invite.createdAt - a.invite.createdAt);
	}

	acceptDirectedInvite(token: string, inviteId: string): RPGTableMember {
		const session = this.session(token); const invite = this.repository.getInvite(inviteId);
		if (!invite || invite.targetAccountId !== session.accountId) throw new Error('Convite direcionado não encontrado');
		return this.joinWithInvite(session.accountId, invite);
	}

	declineDirectedInvite(token: string, inviteId: string): void {
		const session = this.session(token); const invite = this.repository.getInvite(inviteId);
		if (!invite || invite.targetAccountId !== session.accountId || invite.status !== 'active') {
			throw new Error('Convite direcionado não encontrado');
		}
		invite.status = 'revoked'; this.repository.setInvite(invite);
	}

	archiveTable(token: string, tableId: string, reason?: string): RPGCampaignTable {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		if (member.role !== 'owner') throw new Error('Apenas o proprietário pode arquivar a mesa');
		const table = this.repository.getTable(member.tableId)!; const now = this.now();
		this.atomic(() => {
			table.status = 'archived'; table.updatedAt = now; table.revision++;
			this.repository.setTable(table);
			for (const invite of this.repository.listInvites(table.id)) {
				if (invite.status !== 'active') continue;
				invite.status = 'revoked'; this.repository.setInvite(invite);
			}
			for (const tableMember of this.repository.listMembershipsForTable(table.id)) {
				this.clearActiveTable(tableMember.accountId, table.id);
			}
			this.audit(member, 'table.archived', 'table', table.id, {
				previousStatus: 'active', newStatus: 'archived', reason: this.auditReason(reason),
			});
		});
		return structuredClone(table);
	}

	deleteArchivedTable(token: string, tableId: string): void {
		const session = this.session(token); const normalizedTableId = toID(tableId);
		const member = this.repository.getMembership(normalizedTableId, session.accountId);
		if (!member || member.status !== 'active') throw new Error('A conta não participa desta mesa');
		if (member.role !== 'owner') throw new Error('Apenas o proprietário pode excluir a mesa');
		const table = this.repository.getTable(member.tableId);
		if (!table || table.status !== 'archived') throw new Error('Arquive a mesa antes de excluí-la');
		this.atomic(() => {
			for (const tableMember of this.repository.listMembershipsForTable(table.id)) {
				for (const stored of this.sessionRepository.listByAccount(tableMember.accountId)) {
					if (stored.activeTableId !== table.id) continue;
					stored.activeTableId = undefined; this.sessionRepository.set(stored);
				}
			}
			this.repository.deleteTable(table.id);
		});
	}

	listMembers(token: string, tableId: string): RPGTableMemberView[] {
		const session = this.session(token); const viewer = this.activeMember(tableId, session.accountId);
		this.requirePermission(viewer, 'members.view');
		const canManage = getRPGDefaultTablePermissions(viewer.role)['members.manage'];
		return this.repository.listMembershipsForTable(tableId).flatMap(member => {
			if (!canManage && member.status !== 'active') return [];
			const account = this.repository.getAccount(member.accountId);
			if (!canManage) member.note = undefined;
			member.note = this.repository.getAccountNote(session.accountId, member.accountId)?.note;
			return account ? [{ member, account: this.publicAccount(account),
				effectivePermissions: getRPGDefaultTablePermissions(member.role) }] : [];
		});
	}

	getTablePermissions(token: string, tableId: string): Record<RPGTablePermission, boolean> {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		return getRPGDefaultTablePermissions(member.role);
	}

	getActiveTableContext(token: string): RPGActiveTableContext {
		const stored = this.session(token);
		if (!stored.activeTableId) throw new Error('Selecione uma mesa antes de acessar o RPG');
		const account = this.repository.getAccount(stored.accountId);
		const table = this.repository.getTable(stored.activeTableId);
		if (!account || account.status !== 'active') throw new Error('Conta indisponível');
		if (!table || table.status !== 'active') throw new Error('Mesa indisponível');
		const membership = this.activeMember(table.id, account.id);
		return {
			session: { token, accountId: stored.accountId, activeTableId: table.id,
				createdAt: stored.createdAt, expiresAt: stored.expiresAt },
			account: this.publicAccount(account), table, membership,
		};
	}

	changeMemberRole(token: string, tableId: string, accountId: string, role: Exclude<RPGTableRole, 'owner'>,
		reason?: string): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId); const target = this.activeMember(tableId, accountId);
		if (target.role === 'owner' || target.accountId === actor.accountId) throw new Error('Esse membro não pode ter sua função alterada');
		if (!['master', 'player', 'spectator'].includes(role)) throw new Error('Função de membro inválida');
		if (actor.role !== 'owner' && (target.role === 'master' || role === 'master')) {
			throw new Error('Apenas o proprietário pode administrar Mestres');
		}
		const previousRole = target.role; const previousStatus = target.status;
		target.role = role; target.updatedAt = this.now(); target.revision++;
		this.atomic(() => {
			this.repository.setMembership(target);
			this.audit(actor, 'member.role.changed', 'member', target.accountId, {
				previousRole, newRole: role, previousStatus, newStatus: target.status, reason: this.auditReason(reason),
			});
		});
		return structuredClone(target);
	}

	transferOwnership(token: string, tableId: string, accountId: string): RPGCampaignTable {
		const session = this.session(token); const owner = this.activeMember(tableId, session.accountId);
		if (owner.role !== 'owner') throw new Error('Apenas o proprietário pode transferir a mesa');
		const target = this.activeMember(tableId, accountId);
		if (target.accountId === owner.accountId) throw new Error('Esta conta já é proprietária da mesa');
		const table = this.repository.getTable(owner.tableId)!; const now = this.now();
		this.atomic(() => {
			owner.role = 'master'; owner.updatedAt = now; owner.revision++;
			target.role = 'owner'; target.updatedAt = now; target.revision++;
			table.ownerAccountId = target.accountId; table.updatedAt = now; table.revision++;
			this.repository.setMembership(owner); this.repository.setMembership(target); this.repository.setTable(table);
			this.audit(owner, 'table.ownership.transferred', 'member', target.accountId,
				{ previousOwnerAccountId: owner.accountId, newOwnerAccountId: target.accountId });
		});
		return structuredClone(table);
	}

	updateMemberNote(token: string, tableId: string, accountId: string, note: string): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId);
		const target = this.repository.getMembership(tableId, accountId);
		if (!target) throw new Error('Membro não encontrado');
		const relationNote: RPGAccountRelationNote = {
			authorAccountId: actor.accountId, targetAccountId: target.accountId,
			note: this.optionalText(note, 10_000) || '', updatedAt: this.now(),
		};
		target.note = relationNote.note;
		this.atomic(() => {
			this.repository.setAccountNote(relationNote);
			this.audit(actor, 'member.note.updated', 'member', target.accountId);
		});
		return structuredClone(target);
	}

	removeMember(token: string, tableId: string, accountId: string, block = false, reason?: string): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId); const target = this.activeMember(tableId, accountId);
		if (target.role === 'owner' || target.accountId === actor.accountId) throw new Error('Esse membro não pode ser removido');
		if (actor.role !== 'owner' && target.role === 'master') throw new Error('Apenas o proprietário pode administrar Mestres');
		const previousStatus = target.status; target.status = block ? 'blocked' : 'removed';
		target.updatedAt = this.now(); target.revision++;
		this.atomic(() => {
			this.repository.setMembership(target); this.clearActiveTable(target.accountId, target.tableId);
			this.audit(actor, block ? 'member.blocked' : 'member.removed', 'member', target.accountId, {
				previousRole: target.role, newRole: target.role, previousStatus, newStatus: target.status,
				reason: this.auditReason(reason),
			});
		});
		return structuredClone(target);
	}

	leaveTable(token: string, tableId: string, reason?: string): RPGTableMember {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		if (member.role === 'owner') throw new Error('O proprietário não pode sair da própria mesa');
		const previousStatus = member.status; member.status = 'left'; member.updatedAt = this.now(); member.revision++;
		this.atomic(() => {
			this.repository.setMembership(member); this.clearActiveTable(member.accountId, member.tableId);
			this.audit(member, 'member.left', 'member', member.accountId, {
				previousRole: member.role, newRole: member.role, previousStatus, newStatus: member.status,
				reason: this.auditReason(reason),
			});
		});
		return structuredClone(member);
	}

	createInvite(token: string, tableId: string, role: Exclude<RPGTableRole, 'owner'> = 'player', expiresAt?: number,
		maxUses = 1, targetHandle?: string) {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.validateInvite(member, role, expiresAt, maxUses);
		const target = targetHandle ? this.inviteTarget(member.tableId, targetHandle, true) : undefined;
		const { code, invite } = this.buildInvite(session.accountId, member.tableId, role, expiresAt, target, maxUses);
		this.atomic(() => {
			this.repository.setInvite(invite);
			this.audit(member, 'invite.created', 'invite', invite.id, { role, maxUses: invite.maxUses });
		});
		return { code, invite: structuredClone(invite) };
	}

	createDirectedInvites(token: string, tableId: string, role: Exclude<RPGTableRole, 'owner'>,
		expiresAt: number | undefined, targetHandles: string[]) {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.validateInvite(member, role, expiresAt, 1);
		const handles = targetHandles.map(value => this.handle(value));
		if (!handles.length) throw new Error('Informe pelo menos um @');
		if (handles.length > 50) throw new Error('Envie convites para no máximo 50 contas por vez');
		if (new Set(handles).size !== handles.length) throw new Error('Não repita o mesmo @ no convite');
		const targets = handles.map(handle => this.inviteTarget(member.tableId, handle));
		const invitations = targets.map(target =>
			this.buildInvite(session.accountId, member.tableId, role, expiresAt, target, 1));
		this.atomic(() => {
			for (const invitation of invitations) {
				this.repository.setInvite(invitation.invite);
				this.audit(member, 'invite.created', 'invite', invitation.invite.id,
					{ role, maxUses: 1, targetAccountId: invitation.invite.targetAccountId });
			}
		});
		return invitations.map(({ invite }) => structuredClone(invite));
	}

	private validateInvite(member: RPGTableMember, role: Exclude<RPGTableRole, 'owner'>,
		expiresAt: number | undefined, maxUses: number): void {
		this.requirePermission(member, 'members.invite');
		if (!['master', 'player', 'spectator'].includes(role)) throw new Error('Função de convite inválida');
		if (member.role !== 'owner' && role === 'master') throw new Error('Apenas o proprietário pode convidar Mestres');
		if (expiresAt !== undefined && expiresAt <= this.now()) throw new Error('A expiração deve estar no futuro');
		if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 100) {
			throw new Error('O limite de usos deve estar entre 1 e 100');
		}
	}

	private inviteTarget(tableId: string, handle: string, legacyUsername = false): RPGPlatformAccount {
		const normalized = RPGAccountManagement.normalizeHandle(handle);
		const target = (/^[a-z0-9_]{3,30}$/.test(normalized) ? this.repository.getAccountByHandle(normalized) : undefined) ||
			(legacyUsername ? this.repository.getAccountByUsername(handle) : undefined);
		if (!target || target.status !== 'active') throw new Error(`A conta @${handle.replace(/^@/, '')} não foi encontrada`);
		const membership = this.repository.getMembership(tableId, target.id);
		if (membership?.status === 'active' || membership?.status === 'pending') {
			throw new Error(`@${target.handle} já está nesta mesa`);
		}
		if (membership?.status === 'blocked') throw new Error(`@${target.handle} está bloqueado nesta mesa`);
		const duplicate = this.repository.listInvites(tableId).some(invite => invite.status === 'active' &&
			invite.targetAccountId === target.id && (!invite.expiresAt || invite.expiresAt > this.now()));
		if (duplicate) throw new Error(`@${target.handle} já possui um convite ativo para esta mesa`);
		return target;
	}

	private buildInvite(createdByAccountId: string, tableId: string, role: Exclude<RPGTableRole, 'owner'>,
		expiresAt: number | undefined, target: RPGPlatformAccount | undefined, maxUses: number) {
		const compactCode = this.bytes(8).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(8, 'X').slice(0, 8);
		const code = compactCode.slice(0, 4) + '-' + compactCode.slice(4);
		return { code, invite: {
			id: this.id(), tableId, createdByAccountId, targetAccountId: target?.id,
			codeHash: this.tokenHash(code), role, status: 'active' as const, maxUses: target ? 1 : maxUses,
			usedCount: 0, expiresAt, createdAt: this.now(),
		} };
	}

	joinByInvite(token: string, code: string): RPGTableMember {
		const session = this.session(token); const invite = this.repository.getInviteByCodeHash(this.tokenHash(code.trim().toUpperCase()));
		if (!invite) throw new Error('Convite inválido ou revogado');
		return this.joinWithInvite(session.accountId, invite);
	}

	private joinWithInvite(accountId: string, invite: RPGTableInvite): RPGTableMember {
		if (!invite || invite.status !== 'active') throw new Error('Convite inválido ou revogado');
		const table = this.repository.getTable(invite.tableId);
		if (!table || table.status !== 'active') throw new Error('Mesa indisponível');
		if (invite.expiresAt !== undefined && invite.expiresAt <= this.now()) {
			invite.status = 'expired'; this.repository.setInvite(invite); throw new Error('Este convite expirou');
		}
		if (invite.usedCount >= invite.maxUses) throw new Error('Este convite já foi utilizado');
		if (invite.targetAccountId && invite.targetAccountId !== accountId) throw new Error('Este convite pertence a outra conta');
		const previous = this.repository.getMembership(invite.tableId, accountId);
		if (previous?.status === 'blocked') throw new Error('Esta conta está bloqueada nesta mesa');
		if (previous?.status === 'active') throw new Error('A conta já participa desta mesa');
		const now = this.now();
		const requiresApproval = table.settings.requireJoinApproval !== false;
		if (previous?.status === 'pending') return previous;
		const member: RPGTableMember = {
			tableId: invite.tableId, accountId, role: invite.role,
			status: requiresApproval ? 'pending' : 'active', permissions: {},
			requestInviteId: requiresApproval ? invite.id : undefined,
			joinedAt: previous?.joinedAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1,
		};
		this.atomic(() => {
			this.repository.setMembership(member);
			if (!requiresApproval) {
				invite.usedCount++; if (invite.usedCount >= invite.maxUses) invite.status = 'revoked';
				this.repository.setInvite(invite);
			}
			this.audit(member, requiresApproval ? 'member.requested' : 'member.joined', 'member', member.accountId, {
				previousRole: previous?.role, newRole: member.role, previousStatus: previous?.status,
				newStatus: member.status,
			});
		});
		return structuredClone(member);
	}

	previewInvite(token: string, code: string): RPGInvitePreview {
		const session = this.session(token); const invite = this.validInvite(code, session.accountId);
		const table = this.repository.getTable(invite.tableId)!;
		const owner = this.repository.getAccount(table.ownerAccountId);
		if (!owner) throw new Error('Proprietário da mesa indisponível');
		return {
			table: { id: table.id, name: table.name, description: table.description, color: table.color },
			owner: this.publicAccount(owner),
			memberCount: this.repository.listMembershipsForTable(table.id).filter(member => member.status === 'active').length,
			requiresApproval: table.settings.requireJoinApproval !== false,
			membershipStatus: this.repository.getMembership(table.id, session.accountId)?.status,
		};
	}

	listJoinRequests(token: string, tableId: string): RPGTableMemberView[] {
		return this.listMembers(token, tableId).filter(entry => entry.member.status === 'pending');
	}

	resolveJoinRequest(token: string, tableId: string, accountId: string, allow: boolean): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId);
		const request = this.repository.getMembership(tableId, accountId);
		if (!request || request.status !== 'pending') throw new Error('Solicitação não encontrada');
		const invite = request.requestInviteId ? this.repository.getInvite(request.requestInviteId) : undefined;
		if (allow && invite && (invite.status !== 'active' || (invite.expiresAt !== undefined && invite.expiresAt <= this.now()) ||
			invite.usedCount >= invite.maxUses)) throw new Error('O convite desta solicitação não está mais disponível');
		const previousStatus = request.status;
		request.status = allow ? 'active' : 'removed'; request.requestInviteId = undefined;
		request.updatedAt = this.now(); request.revision++;
		this.atomic(() => {
			this.repository.setMembership(request);
			if (allow && invite) {
				invite.usedCount++; if (invite.usedCount >= invite.maxUses) invite.status = 'revoked';
				this.repository.setInvite(invite);
			}
			this.audit(actor, allow ? 'member.request.approved' : 'member.request.denied', 'member', request.accountId,
				{ previousStatus, newStatus: request.status });
		});
		return structuredClone(request);
	}

	listInvites(token: string, tableId: string): RPGPublicTableInvite[] {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.invite'); const now = this.now();
		return this.repository.listInvites(tableId).map(invite => {
			if (invite.status === 'active' && invite.expiresAt !== undefined && invite.expiresAt <= now) {
				invite.status = 'expired'; this.repository.setInvite(invite);
			}
			return this.publicInvite(invite);
		});
	}

	revokeInvite(token: string, tableId: string, inviteId: string, reason?: string): RPGPublicTableInvite {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.invite'); const invite = this.repository.getInvite(inviteId);
		if (!invite || invite.tableId !== toID(tableId)) throw new Error('Convite não encontrado');
		const previousStatus = invite.status;
		this.atomic(() => {
			if (invite.status === 'active') { invite.status = 'revoked'; this.repository.setInvite(invite); }
			this.audit(member, 'invite.revoked', 'invite', invite.id, {
				previousStatus, newStatus: invite.status, reason: this.auditReason(reason),
			});
		});
		return this.publicInvite(invite);
	}

	selectTable(token: string, tableId: string): RPGPlatformSession {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		session.activeTableId = toID(tableId); this.sessionRepository.set(session);
		return { ...structuredClone(session), token, membershipId: `${member.tableId}:${member.accountId}`, role: member.role };
	}

	deselectTable(token: string): RPGPlatformSession {
		const session = this.session(token);
		delete session.activeTableId; this.sessionRepository.set(session);
		return { ...structuredClone(session), token };
	}

	listSessions(token: string): RPGPublicPlatformSession[] {
		const currentHash = this.tokenHash(token); const current = this.session(token); const now = this.now();
		return this.sessionRepository.listByAccount(current.accountId)
			.filter(session => !session.revokedAt && session.expiresAt > now)
			.sort((left, right) => right.lastSeenAt - left.lastSeenAt)
			.map(session => this.publicSession(session, session.tokenHash === currentHash));
	}

	terminateSession(token: string, sessionId: string): boolean {
		const current = this.session(token);
		const target = this.findOwnedSession(current.accountId, sessionId);
		if (!target || target.revokedAt) return false;
		target.revokedAt = this.now(); this.sessionRepository.set(target);
		return true;
	}

	terminateAllSessions(token: string): number {
		const current = this.session(token); const revokedAt = this.now(); let count = 0;
		this.atomic(() => {
			for (const session of this.sessionRepository.listByAccount(current.accountId)) {
				if (session.revokedAt || session.expiresAt <= revokedAt) continue;
				session.revokedAt = revokedAt; this.sessionRepository.set(session); count++;
			}
		});
		return count;
	}

	logout(token: string): void {
		const key = this.tokenHash(token); const session = this.sessionRepository.get(key);
		if (!session || session.revokedAt) return;
		session.revokedAt = this.now(); this.sessionRepository.set(session);
	}

	private session(token: string) {
		const key = this.tokenHash(token); const session = this.sessionRepository.get(key);
		if (!session || session.revokedAt) throw new Error('Sessão inválida ou expirada');
		if (session.expiresAt <= this.now()) {
			session.revokedAt = this.now(); this.sessionRepository.set(session);
			throw new Error('Sessão inválida ou expirada');
		}
		session.lastSeenAt = this.now();
		session.expiresAt = session.lastSeenAt + RPG_PLATFORM_SESSION_TTL;
		this.sessionRepository.set(session);
		return structuredClone(session);
	}
	private atomic<T>(action: () => T): T {
		return this.transaction(() => this.repository.transaction(() => this.sessionRepository.transaction(action)));
	}
	private findOwnedSession(accountId: string, sessionId: string) {
		if (!/^[0-9a-f]{24}$/.test(sessionId)) throw new Error('Identificador de sessão inválido');
		return this.sessionRepository.listByAccount(accountId).find(session => this.sessionId(session.tokenHash) === sessionId);
	}
	private publicSession(session: RPGStoredPlatformSession, current: boolean): RPGPublicPlatformSession {
		return { id: this.sessionId(session.tokenHash), activeTableId: session.activeTableId,
			createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, current };
	}
	private sessionId(tokenHash: string) { return tokenHash.slice(0, 24); }
	private activeMember(tableId: string, accountId: string) {
		const table = this.repository.getTable(tableId);
		if (!table || table.status !== 'active') throw new Error('Mesa indisponível');
		const member = this.repository.getMembership(tableId, accountId);
		if (!member || member.status !== 'active') throw new Error('A conta não participa desta mesa');
		return member;
	}
	private tableAdministrator(token: string, tableId: string) {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.manage');
		return member;
	}
	private requirePermission(member: RPGTableMember, permission: RPGTablePermission) {
		if (!getRPGDefaultTablePermissions(member.role)[permission]) {
			throw new Error(`Permissão necessária: ${permission}`);
		}
	}
	private clearActiveTable(accountId: string, tableId: string) {
		for (const session of this.sessionRepository.listByAccount(accountId)) {
			if (session.activeTableId !== toID(tableId) || session.revokedAt) continue;
			delete session.activeTableId; this.sessionRepository.set(session);
		}
	}
	private replaceRecoveryCodes(accountId: string): string[] {
		const now = this.now();
		for (const previous of this.repository.listRecoveryCodes(accountId)) {
			if (!previous.usedAt) { previous.usedAt = now; this.repository.setRecoveryCode(previous); }
		}
		const codes = Array.from({ length: 10 }, () => this.bytes(8).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'));
		for (const code of codes) this.repository.setRecoveryCode({
			id: this.id(), accountId, codeHash: this.tokenHash(code), createdAt: now,
		});
		return codes;
	}
	private audit(actor: RPGTableMember, action: string, targetType: string, targetId?: string,
		metadata: Record<string, unknown> = {}): void {
		this.repository.addAuditEntry({ id: this.id(), tableId: actor.tableId, actorAccountId: actor.accountId,
			action, targetType, targetId, metadata: {
				...metadata, ...this.auditMetadata(), result: 'success',
			}, createdAt: this.now() });
	}
	private auditMetadata(): Record<string, unknown> {
		const context = this.auditRequest.getStore();
		return {
			origin: context?.origin || 'internal',
			...(context?.sessionId ? { sessionId: context.sessionId } : {}),
			...(context?.method ? { requestMethod: context.method } : {}),
			...(context?.path ? { requestPath: context.path } : {}),
		};
	}
	private auditReason(reason?: string) {
		const normalized = String(reason || '').trim();
		if (normalized.length > 500) throw new Error('Motivo da auditoria muito longo');
		return normalized || undefined;
	}
	private publicInvite(invite: RPGTableInvite): RPGPublicTableInvite {
		const { codeHash: _codeHash, ...view } = invite; return structuredClone(view);
	}
	private validInvite(code: string, accountId: string): RPGTableInvite {
		const invite = this.repository.getInviteByCodeHash(this.tokenHash(code.trim().toUpperCase()));
		if (!invite || invite.status !== 'active') throw new Error('Convite inválido ou revogado');
		const table = this.repository.getTable(invite.tableId);
		if (!table || table.status !== 'active') throw new Error('Mesa indisponível');
		if (invite.expiresAt !== undefined && invite.expiresAt <= this.now()) {
			invite.status = 'expired'; this.repository.setInvite(invite); throw new Error('Este convite expirou');
		}
		if (invite.usedCount >= invite.maxUses) throw new Error('Este convite já foi utilizado');
		if (invite.targetAccountId && invite.targetAccountId !== accountId) throw new Error('Este convite pertence a outra conta');
		return invite;
	}
	private hashPassword(password: string): RPGAccountCredential {
		const salt = this.bytes(16); return { algorithm: 'scrypt', salt: salt.toString('base64'), hash: scryptSync(password, salt, 32).toString('base64') };
	}
	private async hashPasswordAsync(password: string): Promise<RPGAccountCredential> {
		const salt = this.bytes(16);
		const hash = await withKDFSlot(() => scryptAsync(password, salt, 32) as Promise<Buffer>);
		return { algorithm: 'scrypt', salt: salt.toString('base64'), hash: hash.toString('base64') };
	}
	private verifyPassword(password: string, credential: RPGAccountCredential) {
		if (!validCredential(credential)) return false;
		const expected = Buffer.from(credential.hash, 'base64');
		const actual = scryptSync(password, Buffer.from(credential.salt, 'base64'), expected.length);
		return timingSafeEqual(expected, actual);
	}
	private async verifyPasswordAsync(password: string, credential: RPGAccountCredential): Promise<boolean> {
		if (!validCredential(credential)) return false;
		const expected = Buffer.from(credential.hash, 'base64');
		const actual = await withKDFSlot(() =>
			scryptAsync(password, Buffer.from(credential.salt, 'base64'), expected.length) as Promise<Buffer>);
		return timingSafeEqual(expected, actual);
	}
	private validatePassword(password: string) {
		if (password.length < 8 || password.length > 200 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) ||
			!/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
			throw new Error('A senha deve ter entre 8 e 200 caracteres, com maiúscula, minúscula, número e caractere especial');
		}
	}
	private handle(value: string): string {
		const normalized = RPGAccountManagement.normalizeHandle(value);
		if (normalized.includes(',') || !/^[a-z0-9_]{3,30}$/.test(normalized)) {
			throw new Error('O @ deve ter de 3 a 30 caracteres e usar apenas letras, números ou _');
		}
		return normalized;
	}
	private publicAccount(account: RPGPlatformAccount) { const { credential: _credential, ...view } = account; return structuredClone(view); }
	private tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
	/** Hexadecimal keeps generated keys stable when they pass through Showdown's ID normalizer. */
	private id() { return this.bytes(18).toString('hex'); }
	private text(value: string, maximum: number, label: string) { const result = String(value || '').trim(); if (!result || result.length > maximum) throw new Error(`${label} inválido`); return result; }
	private optionalText(value: string | undefined, maximum: number) { const result = String(value || '').trim(); if (result.length > maximum) throw new Error('Texto muito longo'); return result; }
	private presentationSettings(input: Partial<RPGTablePresentationSettings> | undefined,
		current: Record<string, unknown> = {}): RPGTablePresentationSettings {
		const validDays = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
		const sourceDays = input?.sessionDays === undefined && Array.isArray(current.sessionDays) ? current.sessionDays : input?.sessionDays || [];
		const sessionDays = [...new Set(sourceDays.map(day => String(day)).filter(day => validDays.has(day)))];
		const currentTimes = current.sessionTimes && typeof current.sessionTimes === 'object' && !Array.isArray(current.sessionTimes) ?
			current.sessionTimes as Record<string, unknown> : {};
		const sourceTimes = input?.sessionTimes === undefined ? currentTimes : input.sessionTimes || {};
		const sessionTimes: Record<string, string> = {};
		for (const day of sessionDays) {
			const time = String(sourceTimes[day] || '').trim();
			if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Horário de sessão inválido');
			sessionTimes[day] = time;
		}
		return {
			cardImage: this.optionalText(input?.cardImage === undefined ? String(current.cardImage || '') : input.cardImage, 2_000),
			tableInformation: this.optionalText(input?.tableInformation === undefined ?
				String(current.tableInformation || '') : input.tableInformation, 5_000),
			fullDescription: this.optionalText(input?.fullDescription === undefined ?
				String(current.fullDescription || '') : input.fullDescription, 20_000),
			sessionDays, sessionTimes,
			inDevelopment: input?.inDevelopment === undefined ? current.inDevelopment !== false : input.inDevelopment === true,
		};
	}
	private color(value?: string) { const result = value || '#355487'; if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error('Cor da mesa inválida'); return result.toLowerCase(); }
}
