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
