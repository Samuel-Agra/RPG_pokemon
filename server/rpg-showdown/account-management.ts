/** Domínio de contas globais e participação em múltiplas mesas da versão 2. */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { toID } from '../../sim/dex-data';

export const RPG_PLATFORM_ACCOUNT_VERSION = 1;
export const RPG_PLATFORM_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export const RPG_LOGIN_WINDOW = 15 * 60 * 1000;
export const RPG_LOGIN_BLOCK = 15 * 60 * 1000;
export const RPG_LOGIN_MAX_FAILURES = 5;
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
	id: string; username: string; displayName: string; credential: RPGAccountCredential;
	status: 'active' | 'disabled'; createdAt: number; updatedAt: number; revision: number;
}
export interface RPGCampaignTable {
	id: string; ownerAccountId: string; name: string; description: string; color: string;
	visibility: 'private' | 'code' | 'public'; status: 'active' | 'archived';
	settings: Record<string, unknown>; createdAt: number; updatedAt: number; revision: number;
}
export interface RPGTableMember {
	tableId: string; accountId: string; role: RPGTableRole;
	status: 'active' | 'left' | 'removed' | 'blocked'; permissions: Record<string, boolean>;
	joinedAt: number; updatedAt: number; revision: number;
}
export interface RPGTableInvite {
	id: string; tableId: string; createdByAccountId: string; targetAccountId?: string;
	codeHash: string; role: Exclude<RPGTableRole, 'owner'>; status: 'active' | 'revoked' | 'expired';
	maxUses: number; usedCount: number; expiresAt?: number; createdAt: number;
}
export interface RPGPlatformSession {
	token: string; accountId: string; activeTableId?: string; createdAt: number; expiresAt: number;
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
}
export interface RPGActiveTableContext {
	session: RPGPlatformSession; account: RPGPublicPlatformAccount;
	table: RPGCampaignTable; membership: RPGTableMember;
}
export type RPGPublicTableInvite = Omit<RPGTableInvite, 'codeHash'>;
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
export interface RPGAccountRepositorySnapshot {
	accounts?: RPGPlatformAccount[]; tables?: RPGCampaignTable[];
	members?: RPGTableMember[]; invites?: RPGTableInvite[];
	recoveryCodes?: RPGRecoveryCode[]; loginAttempts?: RPGLoginAttempt[]; auditEntries?: RPGAdminAuditEntry[];
}

export interface RPGAccountRepository {
	transaction<T>(action: () => T): T;
	getAccount(id: string): RPGPlatformAccount | undefined;
	getAccountByUsername(username: string): RPGPlatformAccount | undefined;
	setAccount(account: RPGPlatformAccount): void;
	getTable(id: string): RPGCampaignTable | undefined;
	setTable(table: RPGCampaignTable): void;
	listMemberships(accountId: string): RPGTableMember[];
	listMembershipsForTable(tableId: string): RPGTableMember[];
	getMembership(tableId: string, accountId: string): RPGTableMember | undefined;
	setMembership(member: RPGTableMember): void;
	getInviteByCodeHash(codeHash: string): RPGTableInvite | undefined;
	getInvite(id: string): RPGTableInvite | undefined;
	listInvites(tableId: string): RPGTableInvite[];
	setInvite(invite: RPGTableInvite): void;
	listRecoveryCodes(accountId: string): RPGRecoveryCode[];
	setRecoveryCode(code: RPGRecoveryCode): void;
	getLoginAttempt(key: string): RPGLoginAttempt | undefined;
	listLoginAttempts(accountKey: string): RPGLoginAttempt[];
	setLoginAttempt(attempt: RPGLoginAttempt | null, key: string): void;
	listAuditEntries(tableId: string): RPGAdminAuditEntry[];
	addAuditEntry(entry: RPGAdminAuditEntry): void;
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
	private transactionEffects: (() => void)[] | null = null;
	constructor(
		snapshot: RPGAccountRepositorySnapshot = {},
		private readonly changed: {
			account?: (value: RPGPlatformAccount) => void,
			table?: (value: RPGCampaignTable) => void,
			member?: (value: RPGTableMember) => void,
			invite?: (value: RPGTableInvite) => void,
			recoveryCode?: (value: RPGRecoveryCode) => void,
			loginAttempt?: (value: RPGLoginAttempt | null, key: string) => void,
			auditEntry?: (value: RPGAdminAuditEntry) => void,
		} = {}
	) {
		this.replace(snapshot);
	}
	replace(snapshot: RPGAccountRepositorySnapshot): void {
		this.accounts.clear(); this.tables.clear(); this.members.clear(); this.invites.clear();
		this.recoveryCodes.clear(); this.loginAttempts.clear(); this.auditEntries.clear();
		for (const value of snapshot.accounts || []) this.accounts.set(value.id, structuredClone(value));
		for (const value of snapshot.tables || []) this.tables.set(value.id, structuredClone(value));
		for (const value of snapshot.members || []) this.members.set(`${value.tableId}:${value.accountId}`, structuredClone(value));
		for (const value of snapshot.invites || []) this.invites.set(value.id, structuredClone(value));
		for (const value of snapshot.recoveryCodes || []) this.recoveryCodes.set(value.id, structuredClone(value));
		for (const value of snapshot.loginAttempts || []) this.loginAttempts.set(value.key, structuredClone(value));
		for (const value of snapshot.auditEntries || []) this.auditEntries.set(value.id, structuredClone(value));
	}
	getAccount(id: string) { return this.clone(this.accounts.get(toID(id))); }
	getAccountByUsername(username: string) {
		const normalized = toID(username); return this.clone([...this.accounts.values()].find(account => account.username === normalized));
	}
	transaction<T>(action: () => T): T {
		if (this.transactionEffects) return action();
		const snapshot = {
			accounts: structuredClone(this.accounts), tables: structuredClone(this.tables),
			members: structuredClone(this.members), invites: structuredClone(this.invites),
			recoveryCodes: structuredClone(this.recoveryCodes), loginAttempts: structuredClone(this.loginAttempts),
			auditEntries: structuredClone(this.auditEntries),
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
			this.transactionEffects = null; throw error;
		}
	}
	setAccount(account: RPGPlatformAccount) {
		this.accounts.set(account.id, structuredClone(account)); this.effect(() => this.changed.account?.(account));
	}
	getTable(id: string) { return this.clone(this.tables.get(toID(id))); }
	setTable(table: RPGCampaignTable) {
		this.tables.set(table.id, structuredClone(table)); this.effect(() => this.changed.table?.(table));
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
	getInviteByCodeHash(codeHash: string) { return this.clone([...this.invites.values()].find(invite => invite.codeHash === codeHash)); }
	getInvite(id: string) { return this.clone(this.invites.get(toID(id))); }
	listInvites(tableId: string) {
		return [...this.invites.values()].filter(invite => invite.tableId === toID(tableId))
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
	constructor(
		readonly repository: RPGAccountRepository = new RPGMemoryAccountRepository(),
		private readonly now = Date.now,
		private readonly bytes: (size: number) => Buffer = randomBytes,
		readonly sessionRepository = new RPGMemoryPlatformSessionRepository(),
		private readonly transaction: <T>(action: () => T) => T = action => action()
	) {}

	reload(snapshot: RPGAccountRepositorySnapshot, sessions: RPGStoredPlatformSession[]): void {
		if (!(this.repository instanceof RPGMemoryAccountRepository)) {
			throw new Error('O repositório de contas não permite atualização de concorrência');
		}
		this.repository.replace(snapshot); this.sessionRepository.replace(sessions);
	}

	createAccount(username: string, displayName: string, password: string): RPGPublicPlatformAccount {
		const normalized = toID(username);
		if (normalized.length < 3 || normalized.length > 40) throw new Error('O usuário deve ter entre 3 e 40 caracteres');
		if (this.repository.getAccountByUsername(normalized)) throw new Error('Este nome de usuário já está em uso');
		this.validatePassword(password);
		const now = this.now();
		const account: RPGPlatformAccount = {
			id: this.id(), username: normalized, displayName: this.text(displayName, 80, 'nome de exibição'),
			credential: this.hashPassword(password), status: 'active', createdAt: now, updatedAt: now, revision: 0,
		};
		this.repository.setAccount(account);
		return this.publicAccount(account);
	}

	createAccountWithRecoveryCodes(username: string, displayName: string, password: string) {
		return this.atomic(() => {
			const account = this.createAccount(username, displayName, password);
			return { account, recoveryCodes: this.replaceRecoveryCodes(account.id) };
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
					id: accountId, username, displayName: this.text(input.displayName, 80, 'nome de exibição'),
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
		const normalizedUsername = toID(username); const accountKey = this.tokenHash(normalizedUsername);
		const attemptKey = this.tokenHash(`${normalizedUsername}:${source.trim().toLowerCase()}`);
		const attempt = this.repository.getLoginAttempt(attemptKey); const now = this.now();
		if (attempt?.blockedUntil && attempt.blockedUntil > now) throw new Error('Muitas tentativas de login. Tente novamente mais tarde');
		const account = this.repository.getAccountByUsername(username);
		if (!account || account.status !== 'active' || !this.verifyPassword(password, account.credential)) {
			const active = attempt && now - attempt.windowStartedAt < RPG_LOGIN_WINDOW ? attempt :
				{ key: attemptKey, accountKey, failures: 0, windowStartedAt: now, updatedAt: now };
			active.accountKey = accountKey;
			active.failures++; active.updatedAt = now;
			if (active.failures >= RPG_LOGIN_MAX_FAILURES) active.blockedUntil = now + RPG_LOGIN_BLOCK;
			this.repository.setLoginAttempt(active, attemptKey);
			throw new Error('Usuário ou senha inválidos');
		}
		return this.atomic(() => {
			this.repository.setLoginAttempt(null, attemptKey);
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

	recoverPassword(username: string, recoveryCode: string, newPassword: string): void {
		const account = this.repository.getAccountByUsername(username); this.validatePassword(newPassword);
		const hash = this.tokenHash(recoveryCode.trim().toUpperCase());
		const code = account && this.repository.listRecoveryCodes(account.id)
			.find(value => !value.usedAt && value.codeHash === hash);
		if (!account || !code) throw new Error('Código de recuperação inválido');
		this.atomic(() => {
			const now = this.now(); code.usedAt = now; this.repository.setRecoveryCode(code);
			account.credential = this.hashPassword(newPassword); account.updatedAt = now; account.revision++;
			this.repository.setAccount(account);
			for (const session of this.sessionRepository.listByAccount(account.id)) {
				if (!session.revokedAt) { session.revokedAt = now; this.sessionRepository.set(session); }
			}
			for (const attempt of this.repository.listLoginAttempts(this.tokenHash(account.username))) {
				this.repository.setLoginAttempt(null, attempt.key);
			}
		});
	}

	listAudit(token: string, tableId: string, limit = 100): RPGAdminAuditEntry[] {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.manage');
		return this.repository.listAuditEntries(tableId).slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
	}

	getSession(token: string): RPGPlatformSessionView {
		const stored = this.session(token);
		const account = this.repository.getAccount(stored.accountId);
		if (!account || account.status !== 'active') throw new Error('Conta indisponível');
		return {
			session: { token, accountId: stored.accountId, activeTableId: stored.activeTableId,
				createdAt: stored.createdAt, expiresAt: stored.expiresAt },
			account: this.publicAccount(account),
		};
	}

	createTable(token: string, input: Pick<RPGCampaignTable, 'name'> & Partial<Pick<RPGCampaignTable, 'description' | 'color' | 'visibility'>>): RPGCampaignTable {
		const session = this.session(token); const now = this.now(); const id = this.id();
		if (input.visibility && !['private', 'code', 'public'].includes(input.visibility)) {
			throw new Error('Visibilidade da mesa inválida');
		}
		const table: RPGCampaignTable = {
			id, ownerAccountId: session.accountId, name: this.text(input.name, 120, 'nome da mesa'),
			description: this.optionalText(input.description, 500), color: this.color(input.color),
			visibility: input.visibility || 'private', status: 'active', settings: {}, createdAt: now, updatedAt: now, revision: 0,
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

	listTables(token: string): { table: RPGCampaignTable, membership: RPGTableMember }[] {
		const session = this.session(token);
		return this.repository.listMemberships(session.accountId).filter(member => member.status === 'active').flatMap(member => {
			const table = this.repository.getTable(member.tableId);
			return table ? [{ table, membership: member }] : [];
		});
	}

	archiveTable(token: string, tableId: string): RPGCampaignTable {
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
			this.audit(member, 'table.archived', 'table', table.id);
		});
		return structuredClone(table);
	}

	listMembers(token: string, tableId: string): RPGTableMemberView[] {
		const session = this.session(token); const viewer = this.activeMember(tableId, session.accountId);
		this.requirePermission(viewer, 'members.view');
		return this.repository.listMembershipsForTable(tableId).flatMap(member => {
			const account = this.repository.getAccount(member.accountId);
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

	changeMemberRole(token: string, tableId: string, accountId: string, role: Exclude<RPGTableRole, 'owner'>): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId); const target = this.activeMember(tableId, accountId);
		if (target.role === 'owner' || target.accountId === actor.accountId) throw new Error('Esse membro não pode ter sua função alterada');
		if (!['master', 'player', 'spectator'].includes(role)) throw new Error('Função de membro inválida');
		if (actor.role !== 'owner' && (target.role === 'master' || role === 'master')) {
			throw new Error('Apenas o proprietário pode administrar Mestres');
		}
		target.role = role; target.updatedAt = this.now(); target.revision++;
		this.atomic(() => {
			this.repository.setMembership(target);
			this.audit(actor, 'member.role.changed', 'member', target.accountId, { role });
		});
		return structuredClone(target);
	}

	removeMember(token: string, tableId: string, accountId: string, block = false): RPGTableMember {
		const actor = this.tableAdministrator(token, tableId); const target = this.activeMember(tableId, accountId);
		if (target.role === 'owner' || target.accountId === actor.accountId) throw new Error('Esse membro não pode ser removido');
		if (actor.role !== 'owner' && target.role === 'master') throw new Error('Apenas o proprietário pode administrar Mestres');
		target.status = block ? 'blocked' : 'removed'; target.updatedAt = this.now(); target.revision++;
		this.atomic(() => {
			this.repository.setMembership(target); this.clearActiveTable(target.accountId, target.tableId);
			this.audit(actor, block ? 'member.blocked' : 'member.removed', 'member', target.accountId);
		});
		return structuredClone(target);
	}

	leaveTable(token: string, tableId: string): RPGTableMember {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		if (member.role === 'owner') throw new Error('O proprietário não pode sair da própria mesa');
		member.status = 'left'; member.updatedAt = this.now(); member.revision++;
		this.atomic(() => {
			this.repository.setMembership(member); this.clearActiveTable(member.accountId, member.tableId);
		});
		return structuredClone(member);
	}

	createInvite(token: string, tableId: string, role: Exclude<RPGTableRole, 'owner'> = 'player', expiresAt?: number,
		maxUses = 1, targetUsername?: string) {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.invite');
		if (!['master', 'player', 'spectator'].includes(role)) throw new Error('Função de convite inválida');
		if (member.role !== 'owner' && role === 'master') throw new Error('Apenas o proprietário pode convidar Mestres');
		if (expiresAt !== undefined && expiresAt <= this.now()) throw new Error('A expiração deve estar no futuro');
		if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new Error('O limite de usos deve estar entre 1 e 100');
		const target = targetUsername ? this.repository.getAccountByUsername(targetUsername) : undefined;
		if (targetUsername && (!target || target.status !== 'active')) throw new Error('Conta convidada não encontrada');
		if (target && this.repository.getMembership(tableId, target.id)?.status === 'blocked') {
			throw new Error('Esta conta está bloqueada nesta mesa');
		}
		const code = this.bytes(9).toString('base64url').toUpperCase();
		const invite: RPGTableInvite = {
			id: this.id(), tableId: member.tableId, createdByAccountId: session.accountId, targetAccountId: target?.id,
			codeHash: this.tokenHash(code), role, status: 'active', maxUses: target ? 1 : maxUses,
			usedCount: 0, expiresAt, createdAt: this.now(),
		};
		this.atomic(() => {
			this.repository.setInvite(invite);
			this.audit(member, 'invite.created', 'invite', invite.id, { role, maxUses: invite.maxUses });
		});
		return { code, invite: structuredClone(invite) };
	}

	joinByInvite(token: string, code: string): RPGTableMember {
		const session = this.session(token); const invite = this.repository.getInviteByCodeHash(this.tokenHash(code.trim().toUpperCase()));
		if (!invite || invite.status !== 'active') throw new Error('Convite inválido ou revogado');
		const table = this.repository.getTable(invite.tableId);
		if (!table || table.status !== 'active') throw new Error('Mesa indisponível');
		if (invite.expiresAt !== undefined && invite.expiresAt <= this.now()) {
			invite.status = 'expired'; this.repository.setInvite(invite); throw new Error('Este convite expirou');
		}
		if (invite.usedCount >= invite.maxUses) throw new Error('Este convite já foi utilizado');
		if (invite.targetAccountId && invite.targetAccountId !== session.accountId) throw new Error('Este convite pertence a outra conta');
		const previous = this.repository.getMembership(invite.tableId, session.accountId);
		if (previous?.status === 'blocked') throw new Error('Esta conta está bloqueada nesta mesa');
		if (previous?.status === 'active') throw new Error('A conta já participa desta mesa');
		const now = this.now();
		const member: RPGTableMember = {
			tableId: invite.tableId, accountId: session.accountId, role: invite.role, status: 'active', permissions: {},
			joinedAt: previous?.joinedAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1,
		};
		this.atomic(() => {
			this.repository.setMembership(member);
			invite.usedCount++; if (invite.usedCount >= invite.maxUses) invite.status = 'revoked';
			this.repository.setInvite(invite);
		});
		return structuredClone(member);
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

	revokeInvite(token: string, tableId: string, inviteId: string): RPGPublicTableInvite {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		this.requirePermission(member, 'members.invite'); const invite = this.repository.getInvite(inviteId);
		if (!invite || invite.tableId !== toID(tableId)) throw new Error('Convite não encontrado');
		this.atomic(() => {
			if (invite.status === 'active') { invite.status = 'revoked'; this.repository.setInvite(invite); }
			this.audit(member, 'invite.revoked', 'invite', invite.id);
		});
		return this.publicInvite(invite);
	}

	selectTable(token: string, tableId: string): RPGPlatformSession {
		const key = this.tokenHash(token); const session = this.session(token);
		this.activeMember(tableId, session.accountId); session.activeTableId = toID(tableId); this.sessionRepository.set(session);
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
		session.lastSeenAt = this.now(); this.sessionRepository.set(session);
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
		const codes = Array.from({ length: 10 }, () => this.bytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'));
		for (const code of codes) this.repository.setRecoveryCode({
			id: this.id(), accountId, codeHash: this.tokenHash(code), createdAt: now,
		});
		return codes;
	}
	private audit(actor: RPGTableMember, action: string, targetType: string, targetId?: string,
		metadata: Record<string, unknown> = {}): void {
		this.repository.addAuditEntry({ id: this.id(), tableId: actor.tableId, actorAccountId: actor.accountId,
			action, targetType, targetId, metadata, createdAt: this.now() });
	}
	private publicInvite(invite: RPGTableInvite): RPGPublicTableInvite {
		const { codeHash: _codeHash, ...view } = invite; return structuredClone(view);
	}
	private hashPassword(password: string): RPGAccountCredential {
		const salt = this.bytes(16); return { algorithm: 'scrypt', salt: salt.toString('base64'), hash: scryptSync(password, salt, 32).toString('base64') };
	}
	private verifyPassword(password: string, credential: RPGAccountCredential) {
		const expected = Buffer.from(credential.hash, 'base64');
		const actual = scryptSync(password, Buffer.from(credential.salt, 'base64'), expected.length);
		return timingSafeEqual(expected, actual);
	}
	private validatePassword(password: string) { if (password.length < 8 || password.length > 200) throw new Error('A senha deve ter entre 8 e 200 caracteres'); }
	private publicAccount(account: RPGPlatformAccount) { const { credential: _credential, ...view } = account; return structuredClone(view); }
	private tokenHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
	/** Hexadecimal keeps generated keys stable when they pass through Showdown's ID normalizer. */
	private id() { return this.bytes(18).toString('hex'); }
	private text(value: string, maximum: number, label: string) { const result = String(value || '').trim(); if (!result || result.length > maximum) throw new Error(`${label} inválido`); return result; }
	private optionalText(value: string | undefined, maximum: number) { const result = String(value || '').trim(); if (result.length > maximum) throw new Error('Texto muito longo'); return result; }
	private color(value?: string) { const result = value || '#355487'; if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error('Cor da mesa inválida'); return result.toLowerCase(); }
}
