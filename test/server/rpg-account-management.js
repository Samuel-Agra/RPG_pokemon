'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {
	RPGAccountManagement, RPGMemoryAccountRepository, RPGMemoryPlatformSessionRepository,
} = require('../../dist/server/rpg-showdown');

function service() {
	let seed = 0;
	return new RPGAccountManagement(new RPGMemoryAccountRepository(), () => 1_700_000_000_000 + seed, size => {
		seed++; return Buffer.alloc(size, seed);
	});
}

describe('RPG version 2 accounts and tables backend', () => {
	it('creates global accounts without exposing password credentials', () => {
		const accounts = service();
		const account = accounts.createAccount('Samuel.RPG', 'Samuel', 'senha-segura');
		assert.equal(account.username, 'samuelrpg');
		assert.equal(account.displayName, 'Samuel');
		assert.equal(account.credential, undefined);
		assert.throws(() => accounts.createAccount('samuel-rpg', 'Outro', 'outra-senha'), /já está em uso/);
		assert.throws(() => accounts.login('samuelrpg', 'senha-errada'), /inválidos/);
	});

	it('creates a table and its owner membership atomically at domain level', () => {
		const accounts = service();
		accounts.createAccount('samuel', 'Samuel', 'senha-segura');
		const session = accounts.login('samuel', 'senha-segura');
		const table = accounts.createTable(session.token, {
			name: 'Jornada de Kanto', description: 'Campanha principal', visibility: 'code', color: '#a52a2a',
		});
		const listed = accounts.listTables(session.token);
		assert.equal(listed[0].table.id, table.id);
		assert.equal(listed[0].membership.role, 'owner');
		assert.equal(accounts.selectTable(session.token, table.id).activeTableId, table.id);
	});

	it('joins another account through a single-use hashed invite', () => {
		const accounts = service();
		accounts.createAccount('mestre', 'Mestre', 'senha-mestre');
		accounts.createAccount('player', 'Player', 'senha-player');
		const master = accounts.login('mestre', 'senha-mestre');
		const player = accounts.login('player', 'senha-player');
		const table = accounts.createTable(master.token, { name: 'Mesa teste' });
		const invitation = accounts.createInvite(master.token, table.id, 'player');
		assert.notEqual(invitation.invite.codeHash, invitation.code);
		assert.equal(accounts.joinByInvite(player.token, invitation.code).role, 'player');
		assert.throws(() => accounts.joinByInvite(player.token, invitation.code), /já foi utilizado|revogado/);
	});

	it('restores accounts, tables, memberships, invites, and sessions after a restart', () => {
		const stored = { accounts: new Map(), tables: new Map(), members: new Map(), invites: new Map(), sessions: new Map() };
		const callbacks = {
			account: value => stored.accounts.set(value.id, structuredClone(value)),
			table: value => stored.tables.set(value.id, structuredClone(value)),
			member: value => stored.members.set(`${value.tableId}:${value.accountId}`, structuredClone(value)),
			invite: value => stored.invites.set(value.id, structuredClone(value)),
		};
		let seed = 0;
		const now = () => 1_700_000_000_000;
		const bytes = size => Buffer.alloc(size, ++seed);
		const sessionsChanged = (value, tokenHash) => {
			if (value) stored.sessions.set(tokenHash, structuredClone(value));
			else stored.sessions.delete(tokenHash);
		};
		const first = new RPGAccountManagement(
			new RPGMemoryAccountRepository({}, callbacks), now, bytes,
			new RPGMemoryPlatformSessionRepository([], sessionsChanged)
		);
		first.createAccount('persistente', 'Conta persistente', 'senha-segura');
		const login = first.login('persistente', 'senha-segura');
		const table = first.createTable(login.token, { name: 'Mesa persistente' });
		first.createInvite(login.token, table.id);
		first.selectTable(login.token, table.id);

		const restored = new RPGAccountManagement(new RPGMemoryAccountRepository({
			accounts: [...stored.accounts.values()], tables: [...stored.tables.values()],
			members: [...stored.members.values()], invites: [...stored.invites.values()],
		}, callbacks), now, bytes, new RPGMemoryPlatformSessionRepository([...stored.sessions.values()], sessionsChanged));
		assert.equal(restored.login('persistente', 'senha-segura').accountId, login.accountId);
		assert.equal(restored.listTables(login.token)[0].table.name, 'Mesa persistente');
		assert.equal(stored.sessions.size, 2, 'the restored token and the new login are persisted');
		restored.logout(login.token);
		assert.throws(() => restored.listTables(login.token), /inválida ou expirada/);
	});

	it('lists safe session identifiers and revokes one or every login without deleting its audit record', () => {
		const accounts = service();
		accounts.createAccount('sessoes', 'Sessões', 'senha-segura');
		const first = accounts.login('sessoes', 'senha-segura');
		const second = accounts.login('sessoes', 'senha-segura');
		const sessions = accounts.listSessions(first.token);
		assert.equal(sessions.length, 2);
		assert(sessions.every(session => /^[0-9a-f]{24}$/.test(session.id)));
		assert(sessions.every(session => session.token === undefined && session.tokenHash === undefined));
		const other = sessions.find(session => !session.current);
		assert.equal(accounts.terminateSession(first.token, other.id), true);
		assert.throws(() => accounts.getSession(second.token), /inválida ou expirada/);
		assert.equal(accounts.terminateAllSessions(first.token), 1);
		assert.throws(() => accounts.getSession(first.token), /inválida ou expirada/);
	});

	it('administers member roles, removal, blocking, and voluntary departure with owner safeguards', () => {
		const accounts = service();
		const ownerAccount = accounts.createAccount('proprietario', 'Proprietário', 'senha-segura');
		const masterAccount = accounts.createAccount('assistente', 'Assistente', 'senha-segura');
		const playerAccount = accounts.createAccount('membro', 'Membro', 'senha-segura');
		const owner = accounts.login('proprietario', 'senha-segura');
		const master = accounts.login('assistente', 'senha-segura');
		const player = accounts.login('membro', 'senha-segura');
		const table = accounts.createTable(owner.token, { name: 'Administração' });
		accounts.joinByInvite(master.token, accounts.createInvite(owner.token, table.id, 'master').code);
		accounts.joinByInvite(player.token, accounts.createInvite(master.token, table.id, 'player').code);
		assert.equal(accounts.listMembers(owner.token, table.id).length, 3);
		assert.equal(accounts.changeMemberRole(owner.token, table.id, playerAccount.id, 'spectator').role, 'spectator');
		assert.throws(() => accounts.changeMemberRole(master.token, table.id, playerAccount.id, 'master'), /proprietário/);
		assert.equal(accounts.removeMember(master.token, table.id, playerAccount.id, true).status, 'blocked');
		assert.throws(() => accounts.joinByInvite(player.token,
			accounts.createInvite(owner.token, table.id, 'player').code), /bloqueada/);
		assert.equal(accounts.leaveTable(master.token, table.id).status, 'left');
		assert.throws(() => accounts.leaveTable(owner.token, table.id), /proprietário não pode sair/);
		assert(ownerAccount.id && masterAccount.id);
	});

	it('supports directed, expiring, revocable, and configurable multi-use invites', () => {
		let time = 1_700_000_000_000; let seed = 0;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => time,
			size => Buffer.alloc(size, ++seed));
		accounts.createAccount('dono', 'Dono', 'senha-segura');
		accounts.createAccount('destino', 'Destino', 'senha-segura');
		accounts.createAccount('outro', 'Outro', 'senha-segura');
		accounts.createAccount('terceiro', 'Terceiro', 'senha-segura');
		const owner = accounts.login('dono', 'senha-segura');
		const target = accounts.login('destino', 'senha-segura');
		const other = accounts.login('outro', 'senha-segura');
		const third = accounts.login('terceiro', 'senha-segura');
		const table = accounts.createTable(owner.token, { name: 'Convites' });
		const directed = accounts.createInvite(owner.token, table.id, 'player', time + 1000, 9, 'destino');
		assert.equal(directed.invite.maxUses, 1);
		assert.throws(() => accounts.joinByInvite(other.token, directed.code), /outra conta/);
		assert.equal(accounts.joinByInvite(target.token, directed.code).status, 'active');
		const reusable = accounts.createInvite(owner.token, table.id, 'player', undefined, 2);
		accounts.joinByInvite(other.token, reusable.code);
		accounts.joinByInvite(third.token, reusable.code);
		assert.throws(() => accounts.joinByInvite(target.token, reusable.code), /revogado|utilizado/);
		const revoked = accounts.createInvite(owner.token, table.id);
		assert.equal(accounts.revokeInvite(owner.token, table.id, revoked.invite.id).status, 'revoked');
		assert.throws(() => accounts.joinByInvite(target.token, revoked.code), /revogado/);
		const expiring = accounts.createInvite(owner.token, table.id, 'spectator', time + 1);
		time += 2;
		assert.throws(() => accounts.joinByInvite(target.token, expiring.code), /expirou/);
		assert.equal(accounts.listInvites(owner.token, table.id).find(invite => invite.id === expiring.invite.id).status, 'expired');
	});

	it('ships an idempotent MySQL migration for every version 2 entity', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/002-accounts-and-tables.sql'
		), 'utf8');
		for (const table of ['rpg_accounts', 'rpg_campaign_tables', 'rpg_table_members', 'rpg_table_invites', 'rpg_account_sessions']) {
			assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table);
		}
	});

	it('wires every version 2 entity and hashed session into MySQL persistence', () => {
		const source = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/mysql-persistence.ts'
		), 'utf8');
		for (const method of [
			'upsertPlatformAccount', 'upsertCampaignTable', 'upsertTableMember',
			'upsertTableInvite', 'upsertPlatformSession', 'deletePlatformSession',
		]) assert(source.includes(`${method}(`), method);
		assert(source.includes('SELECT * FROM rpg_account_sessions'));
		assert(!source.includes('token VARCHAR'), 'plain session tokens must never be persisted');
	});
});
