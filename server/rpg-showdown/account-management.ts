/** Domínio de contas globais e participação em múltiplas mesas da versão 2. */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { toID } from '../../sim/dex-data';

export const RPG_PLATFORM_ACCOUNT_VERSION = 1;
export const RPG_PLATFORM_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
export type RPGTableRole = 'owner' | 'master' | 'player' | 'spectator';

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
export type RPGStoredPlatformSession = Omit<RPGPlatformSession, 'token'> & {
	tokenHash: string, lastSeenAt: number, revokedAt?: number,
};
export interface RPGAccountRepositorySnapshot {
	accounts?: RPGPlatformAccount[]; tables?: RPGCampaignTable[];
	members?: RPGTableMember[]; invites?: RPGTableInvite[];
}

export interface RPGAccountRepository {
	getAccount(id: string): RPGPlatformAccount | undefined;
	getAccountByUsername(username: string): RPGPlatformAccount | undefined;
	setAccount(account: RPGPlatformAccount): void;
	getTable(id: string): RPGCampaignTable | undefined;
	setTable(table: RPGCampaignTable): void;
	listMemberships(accountId: string): RPGTableMember[];
	getMembership(tableId: string, accountId: string): RPGTableMember | undefined;
	setMembership(member: RPGTableMember): void;
	getInviteByCodeHash(codeHash: string): RPGTableInvite | undefined;
	setInvite(invite: RPGTableInvite): void;
}

/** Repositório determinístico usado nos testes e como contrato para o adaptador MySQL. */
export class RPGMemoryAccountRepository implements RPGAccountRepository {
	private accounts = new Map<string, RPGPlatformAccount>();
	private tables = new Map<string, RPGCampaignTable>();
	private members = new Map<string, RPGTableMember>();
	private invites = new Map<string, RPGTableInvite>();
	constructor(
		snapshot: RPGAccountRepositorySnapshot = {},
		private readonly changed: {
			account?: (value: RPGPlatformAccount) => void,
			table?: (value: RPGCampaignTable) => void,
			member?: (value: RPGTableMember) => void,
			invite?: (value: RPGTableInvite) => void,
		} = {}
	) {
		for (const value of snapshot.accounts || []) this.accounts.set(value.id, structuredClone(value));
		for (const value of snapshot.tables || []) this.tables.set(value.id, structuredClone(value));
		for (const value of snapshot.members || []) this.members.set(`${value.tableId}:${value.accountId}`, structuredClone(value));
		for (const value of snapshot.invites || []) this.invites.set(value.id, structuredClone(value));
	}
	getAccount(id: string) { return this.clone(this.accounts.get(toID(id))); }
	getAccountByUsername(username: string) {
		const normalized = toID(username); return this.clone([...this.accounts.values()].find(account => account.username === normalized));
	}
	setAccount(account: RPGPlatformAccount) { this.accounts.set(account.id, structuredClone(account)); this.changed.account?.(account); }
	getTable(id: string) { return this.clone(this.tables.get(toID(id))); }
	setTable(table: RPGCampaignTable) { this.tables.set(table.id, structuredClone(table)); this.changed.table?.(table); }
	listMemberships(accountId: string) {
		return [...this.members.values()].filter(member => member.accountId === toID(accountId)).map(member => structuredClone(member));
	}
	getMembership(tableId: string, accountId: string) { return this.clone(this.members.get(`${toID(tableId)}:${toID(accountId)}`)); }
	setMembership(member: RPGTableMember) { this.members.set(`${member.tableId}:${member.accountId}`, structuredClone(member)); this.changed.member?.(member); }
	getInviteByCodeHash(codeHash: string) { return this.clone([...this.invites.values()].find(invite => invite.codeHash === codeHash)); }
	setInvite(invite: RPGTableInvite) { this.invites.set(invite.id, structuredClone(invite)); this.changed.invite?.(invite); }
	private clone<T>(value: T | undefined): T | undefined { return value && structuredClone(value); }
}

export class RPGMemoryPlatformSessionRepository {
	private sessions = new Map<string, RPGStoredPlatformSession>();
	constructor(
		sessions: RPGStoredPlatformSession[] = [],
		private readonly changed?: (value: RPGStoredPlatformSession | null, tokenHash: string) => void
	) { for (const session of sessions) this.sessions.set(session.tokenHash, structuredClone(session)); }
	get(tokenHash: string) { const value = this.sessions.get(tokenHash); return value && structuredClone(value); }
	listByAccount(accountId: string) {
		return [...this.sessions.values()].filter(session => session.accountId === accountId)
			.map(session => structuredClone(session));
	}
	set(session: RPGStoredPlatformSession) {
		this.sessions.set(session.tokenHash, structuredClone(session)); this.changed?.(session, session.tokenHash);
	}
	delete(tokenHash: string) { this.sessions.delete(tokenHash); this.changed?.(null, tokenHash); }
}

export class RPGAccountManagement {
	constructor(
		readonly repository: RPGAccountRepository = new RPGMemoryAccountRepository(),
		private readonly now = Date.now,
		private readonly bytes: (size: number) => Buffer = randomBytes,
		readonly sessionRepository = new RPGMemoryPlatformSessionRepository()
	) {}

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

	login(username: string, password: string): RPGPlatformSession {
		const account = this.repository.getAccountByUsername(username);
		if (!account || account.status !== 'active' || !this.verifyPassword(password, account.credential)) {
			throw new Error('Usuário ou senha inválidos');
		}
		const token = this.bytes(32).toString('base64url');
		const createdAt = this.now();
		this.sessionRepository.set({
			tokenHash: this.tokenHash(token), accountId: account.id, createdAt, lastSeenAt: createdAt,
			expiresAt: createdAt + RPG_PLATFORM_SESSION_TTL,
		});
		return { token, accountId: account.id, createdAt, expiresAt: createdAt + RPG_PLATFORM_SESSION_TTL };
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
		this.repository.setTable(table);
		this.repository.setMembership({
			tableId: id, accountId: session.accountId, role: 'owner', status: 'active', permissions: {},
			joinedAt: now, updatedAt: now, revision: 0,
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

	createInvite(token: string, tableId: string, role: Exclude<RPGTableRole, 'owner'> = 'player', expiresAt?: number) {
		const session = this.session(token); const member = this.activeMember(tableId, session.accountId);
		if (member.role !== 'owner' && member.role !== 'master') throw new Error('Apenas Mestres podem criar convites');
		if (!['master', 'player', 'spectator'].includes(role)) throw new Error('Função de convite inválida');
		if (expiresAt !== undefined && expiresAt <= this.now()) throw new Error('A expiração deve estar no futuro');
		const code = this.bytes(9).toString('base64url').toUpperCase();
		const invite: RPGTableInvite = {
			id: this.id(), tableId: member.tableId, createdByAccountId: session.accountId,
			codeHash: this.tokenHash(code), role, status: 'active', maxUses: 1, usedCount: 0, expiresAt, createdAt: this.now(),
		};
		this.repository.setInvite(invite);
		return { code, invite: structuredClone(invite) };
	}

	joinByInvite(token: string, code: string): RPGTableMember {
		const session = this.session(token); const invite = this.repository.getInviteByCodeHash(this.tokenHash(code.trim().toUpperCase()));
		if (!invite || invite.status !== 'active') throw new Error('Convite inválido ou revogado');
		if (invite.expiresAt !== undefined && invite.expiresAt <= this.now()) throw new Error('Este convite expirou');
		if (invite.usedCount >= invite.maxUses) throw new Error('Este convite já foi utilizado');
		const previous = this.repository.getMembership(invite.tableId, session.accountId);
		if (previous?.status === 'blocked') throw new Error('Esta conta está bloqueada nesta mesa');
		const now = this.now();
		const member: RPGTableMember = {
			tableId: invite.tableId, accountId: session.accountId, role: invite.role, status: 'active', permissions: {},
			joinedAt: previous?.joinedAt || now, updatedAt: now, revision: (previous?.revision || 0) + 1,
		};
		this.repository.setMembership(member);
		invite.usedCount++; if (invite.usedCount >= invite.maxUses) invite.status = 'revoked';
		this.repository.setInvite(invite);
		return structuredClone(member);
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
		for (const session of this.sessionRepository.listByAccount(current.accountId)) {
			if (session.revokedAt || session.expiresAt <= revokedAt) continue;
			session.revokedAt = revokedAt; this.sessionRepository.set(session); count++;
		}
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
		const member = this.repository.getMembership(tableId, accountId);
		if (!member || member.status !== 'active') throw new Error('A conta não participa desta mesa');
		return member;
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
