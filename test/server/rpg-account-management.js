'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {
	RPGAccountManagement, RPGMemoryAccountRepository, RPGMemoryPlatformSessionRepository,
	getRPGDefaultTablePermissions,
} = require('../../dist/server/rpg-showdown');
const {
	RPGMySQLPersistence, RPG_SECURITY_RETENTION_MS, runRPGMigrationFile,
} = require('../../dist/server/rpg-showdown/database/mysql-persistence');

function service() {
	let seed = 0;
	return new RPGAccountManagement(new RPGMemoryAccountRepository(), () => 1_700_000_000_000 + seed, size => {
		seed++; return Buffer.alloc(size, seed);
	});
}

describe('RPG version 2 accounts and tables backend', () => {
	it('commits queued MySQL writes together and rolls the whole batch back on failure', async () => {
		const events = [];
		const connection = {
			beginTransaction: async () => events.push('begin'),
			execute: async sql => { events.push(sql); if (sql === 'falhar') throw new Error('banco indisponível'); },
			commit: async () => events.push('commit'), rollback: async () => events.push('rollback'),
			release: () => events.push('release'),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		persistence.transaction(() => {
			persistence.enqueue('primeira', []); persistence.enqueue('segunda', []);
		});
		await persistence.flush();
		assert.deepEqual(events, ['begin', 'primeira', 'segunda', 'commit', 'release']);
		events.length = 0;
		persistence.transaction(() => {
			persistence.enqueue('antes', []); persistence.enqueue('falhar', []); persistence.enqueue('depois', []);
		});
		await assert.rejects(() => persistence.flush(), /banco indisponível/);
		assert.deepEqual(events, ['begin', 'antes', 'falhar', 'rollback', 'release']);
	});

	it('holds and always releases the MySQL cross-process account lock', async () => {
		const events = [];
		const connection = {
			query: async (sql, values) => {
				events.push([sql, values]);
				return sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]];
			},
			release: () => events.push(['release']),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await assert.rejects(() => persistence.withAdvisoryLock('contas', async () => {
			events.push(['action']); throw new Error('falha interna');
		}), /falha interna/);
		assert.deepEqual(events.map(event => event[0]), [
			'SELECT GET_LOCK(?, ?) AS acquired', 'action', 'SELECT RELEASE_LOCK(?)', 'release',
		]);
	});

	it('checkpoints every migration statement instead of relying on non-atomic MySQL DDL transactions', async () => {
		const events = []; const steps = new Map();
		const connection = {
			query: async (sql, values) => {
				events.push(['query', sql, values]);
				if (sql.includes('FROM rpg_schema_migration_steps')) {
					const step = steps.get(values[1]); return [step ? [step] : []];
				}
				return [[]];
			},
			execute: async (sql, values) => {
				events.push(['execute', sql, values]);
				if (sql.includes('INSERT INTO rpg_schema_migration_steps')) {
					steps.set(values[1], { checksum: values[2], status: 'started' });
				} else if (sql.includes('UPDATE rpg_schema_migration_steps')) {
					steps.set(values[1], { checksum: values[2], status: 'applied' });
				}
				return [{ affectedRows: 1 }];
			},
		};
		await runRPGMigrationFile(connection, 7, 'teste retomável', [
			'ALTER TABLE exemplo ADD COLUMN novo INT', 'UPDATE exemplo SET novo = 0',
		]);
		assert.deepEqual([...steps.values()].map(step => step.status), ['applied', 'applied']);
		assert.equal(events.filter(event => event[1] === 'ALTER TABLE exemplo ADD COLUMN novo INT').length, 1);
		assert.equal(events.filter(event => event[1] === 'UPDATE exemplo SET novo = 0').length, 1);
		assert(events.some(event => event[1].includes('INSERT INTO rpg_schema_migrations')));
		assert(!events.some(event => event[1] === 'beginTransaction' || event[1] === 'commit'));
	});

	it('resumes an interrupted atomic DDL step and rejects changed migration contents', async () => {
		const statement = 'ALTER TABLE exemplo ADD COLUMN novo INT';
		const checksum = require('node:crypto').createHash('sha256').update(statement).digest('hex');
		const connection = {
			query: async sql => {
				if (sql.includes('FROM rpg_schema_migration_steps')) return [[{ checksum, status: 'started' }]];
				const error = new Error('coluna já existe'); error.code = 'ER_DUP_FIELDNAME'; throw error;
			},
			execute: async () => [{ affectedRows: 1 }],
		};
		await runRPGMigrationFile(connection, 7, 'retomada', [statement]);
		await assert.rejects(() => runRPGMigrationFile(connection, 7, 'alterada', [
			'ALTER TABLE exemplo ADD COLUMN diferente INT',
		]), /foi alterada depois de iniciada/);
	});

	it('cleans obsolete security data transactionally while preserving active records', async () => {
		const events = []; let count = 0;
		const connection = {
			beginTransaction: async () => events.push(['begin']),
			execute: async (sql, values) => {
				events.push([sql.replace(/\s+/g, ' ').trim(), values]);
				return [{ affectedRows: ++count }];
			},
			commit: async () => events.push(['commit']), rollback: async () => events.push(['rollback']),
			release: () => events.push(['release']),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		const now = 1_800_000_000_000; const cutoff = now - RPG_SECURITY_RETENTION_MS;
		assert.deepEqual(await persistence.cleanupSecurityData(now), {
			sessions: 1, recoveryCodes: 2, loginAttempts: 3, invites: 4,
		});
		assert.deepEqual(events.map(event => event[0]), [
			'begin',
			'DELETE FROM rpg_account_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (expires_at < ? AND (revoked_at IS NULL OR revoked_at < ?))',
			'DELETE FROM rpg_account_recovery_codes WHERE used_at IS NOT NULL AND used_at < ?',
			'DELETE FROM rpg_login_attempts WHERE updated_at < ? AND (blocked_until IS NULL OR blocked_until < ?)',
			'DELETE FROM rpg_table_invites WHERE expires_at IS NOT NULL AND expires_at < ?',
			'commit', 'release',
		]);
		assert.deepEqual(events[1][1], [cutoff, cutoff, cutoff]);
		assert.deepEqual(events[2][1], [cutoff]);
		assert.deepEqual(events[3][1], [cutoff, now]);
		assert.deepEqual(events[4][1], [cutoff]);
	});

	it('rolls security cleanup back when any deletion fails', async () => {
		const events = [];
		const connection = {
			beginTransaction: async () => events.push('begin'),
			execute: async sql => {
				events.push(sql); if (sql.includes('recovery_codes')) throw new Error('falha de limpeza');
				return [{ affectedRows: 1 }];
			},
			commit: async () => events.push('commit'), rollback: async () => events.push('rollback'),
			release: () => events.push('release'),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await assert.rejects(() => persistence.cleanupSecurityData(), /falha de limpeza/);
		assert.deepEqual(events.slice(-2), ['rollback', 'release']);
		assert(!events.includes('commit'));
	});

	it('rolls a compound operation back when one repository write fails', () => {
		let tableWrites = 0;
		const repository = new RPGMemoryAccountRepository({}, {
			table: () => { tableWrites++; },
			auditEntry: () => { throw new Error('falha simulada'); },
		});
		const accounts = new RPGAccountManagement(repository);
		accounts.createAccount('rollback', 'Rollback', 'senha-segura');
		const login = accounts.login('rollback', 'senha-segura');
		assert.throws(() => accounts.createTable(login.token, { name: 'Não pode persistir pela metade' }), /falha simulada/);
		assert.equal(tableWrites, 1);
		assert.deepEqual(accounts.listTables(login.token), []);
		assert.deepEqual(repository.listAuditEntries('qualquer'), []);
	});

	it('creates global accounts without exposing password credentials', () => {
		const accounts = service();
		const account = accounts.createAccount('Samuel.RPG', 'Samuel', 'senha-segura');
		assert.equal(account.username, 'samuelrpg');
		assert.equal(account.displayName, 'Samuel');
		assert.equal(account.credential, undefined);
		assert.throws(() => accounts.createAccount('samuel-rpg', 'Outro', 'outra-senha'), /já está em uso/);
		assert.throws(() => accounts.login('samuelrpg', 'senha-errada'), /inválidos/);
	});

	it('issues one-time recovery codes and revokes every session after a password reset', () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('recuperar', 'Recuperar', 'senha-antiga');
		assert.equal(registration.recoveryCodes.length, 10);
		assert(registration.recoveryCodes.every(code => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code)));
		const oldSession = accounts.login('recuperar', 'senha-antiga');
		accounts.recoverPassword('recuperar', registration.recoveryCodes[0], 'senha-nova-segura');
		assert.throws(() => accounts.getSession(oldSession.token), /inválida ou expirada/);
		assert.throws(() => accounts.login('recuperar', 'senha-antiga'), /inválidos/);
		assert(accounts.login('recuperar', 'senha-nova-segura').token);
		assert.throws(() => accounts.recoverPassword(
			'recuperar', registration.recoveryCodes[0], 'outra-senha-segura'), /Código de recuperação inválido/);
	});

	it('removes every source-specific login block after password recovery', () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('desbloquear', 'Desbloquear', 'senha-antiga');
		for (const source of ['10.0.0.1', '10.0.0.2']) {
			for (let index = 0; index < 5; index++) {
				assert.throws(() => accounts.login('desbloquear', 'senha-incorreta', source), /inválidos/);
			}
			assert.throws(() => accounts.login('desbloquear', 'senha-antiga', source), /Muitas tentativas/);
		}
		accounts.recoverPassword('desbloquear', registration.recoveryCodes[0], 'senha-nova-segura');
		assert(accounts.login('desbloquear', 'senha-nova-segura', '10.0.0.1').token);
		assert(accounts.login('desbloquear', 'senha-nova-segura', '10.0.0.2').token);
	});

	it('temporarily blocks repeated login failures and clears attempts after success', () => {
		let time = 1_700_000_000_000; let seed = 0;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => time,
			size => Buffer.alloc(size, ++seed));
		accounts.createAccount('protegida', 'Protegida', 'senha-correta');
		for (let index = 0; index < 5; index++) {
			assert.throws(() => accounts.login('protegida', 'incorreta', '127.0.0.1'), /inválidos/);
		}
		assert.throws(() => accounts.login('protegida', 'senha-correta', '127.0.0.1'), /Muitas tentativas/);
		time += 15 * 60 * 1000 + 1;
		assert(accounts.login('protegida', 'senha-correta', '127.0.0.1').token);
	});

	it('persists recovery, throttling, audit, and sessions across a complete repository restart', () => {
		const stored = {
			accounts: new Map(), tables: new Map(), members: new Map(), invites: new Map(), sessions: new Map(),
			recoveryCodes: new Map(), loginAttempts: new Map(), auditEntries: new Map(),
		};
		const changes = {
			account: value => stored.accounts.set(value.id, structuredClone(value)),
			table: value => stored.tables.set(value.id, structuredClone(value)),
			member: value => stored.members.set(`${value.tableId}:${value.accountId}`, structuredClone(value)),
			invite: value => stored.invites.set(value.id, structuredClone(value)),
			recoveryCode: value => stored.recoveryCodes.set(value.id, structuredClone(value)),
			loginAttempt: (value, key) => value ? stored.loginAttempts.set(key, structuredClone(value)) : stored.loginAttempts.delete(key),
			auditEntry: value => stored.auditEntries.set(value.id, structuredClone(value)),
		};
		const sessionChanged = (value, key) => value ? stored.sessions.set(key, structuredClone(value)) : stored.sessions.delete(key);
		let seed = 0; const bytes = size => Buffer.alloc(size, ++seed); const now = () => 1_700_000_000_000;
		const first = new RPGAccountManagement(new RPGMemoryAccountRepository({}, changes), now, bytes,
			new RPGMemoryPlatformSessionRepository([], sessionChanged));
		const registration = first.createAccountWithRecoveryCodes('reinicio', 'Reinício', 'senha-antiga');
		const owner = first.login('reinicio', 'senha-antiga');
		const table = first.createTable(owner.token, { name: 'Mesa persistida' });
		for (let index = 0; index < 5; index++) assert.throws(() => first.login('reinicio', 'errada', 'origem-a'));

		const restored = new RPGAccountManagement(new RPGMemoryAccountRepository({
			accounts: [...stored.accounts.values()], tables: [...stored.tables.values()],
			members: [...stored.members.values()], invites: [...stored.invites.values()],
			recoveryCodes: [...stored.recoveryCodes.values()], loginAttempts: [...stored.loginAttempts.values()],
			auditEntries: [...stored.auditEntries.values()],
		}, changes), now, bytes, new RPGMemoryPlatformSessionRepository([...stored.sessions.values()], sessionChanged));
		assert.throws(() => restored.login('reinicio', 'senha-antiga', 'origem-a'), /Muitas tentativas/);
		assert.equal(restored.listAudit(owner.token, table.id)[0].action, 'table.created');
		restored.recoverPassword('reinicio', registration.recoveryCodes[0], 'senha-nova-segura');
		assert(restored.login('reinicio', 'senha-nova-segura', 'origem-b').token);
	});

	it('consumes recovery codes and single-use invitations only once under competing requests', async () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('corrida', 'Corrida', 'senha-antiga');
		const recovery = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() =>
			accounts.recoverPassword('corrida', registration.recoveryCodes[0], 'senha-nova-segura'))));
		assert.equal(recovery.filter(result => result.status === 'fulfilled').length, 1);
		assert.equal(recovery.filter(result => result.status === 'rejected').length, 1);

		for (const name of ['dono-corrida', 'convidado-a', 'convidado-b']) {
			accounts.createAccount(name, name, 'senha-segura');
		}
		const owner = accounts.login('dono-corrida', 'senha-segura');
		const table = accounts.createTable(owner.token, { name: 'Convite concorrente' });
		const code = accounts.createInvite(owner.token, table.id, 'player', undefined, 1).code;
		const guests = ['convidado-a', 'convidado-b'].map(name => accounts.login(name, 'senha-segura'));
		const joins = await Promise.allSettled(guests.map(guest => Promise.resolve().then(() =>
			accounts.joinByInvite(guest.token, code))));
		assert.equal(joins.filter(result => result.status === 'fulfilled').length, 1);
		assert.equal(joins.filter(result => result.status === 'rejected').length, 1);
	});

	it('keeps administrative audit records isolated between tables', () => {
		const accounts = service();
		accounts.createAccount('dono-isolado', 'Dono', 'senha-segura');
		const owner = accounts.login('dono-isolado', 'senha-segura');
		const alpha = accounts.createTable(owner.token, { name: 'Alpha' });
		const beta = accounts.createTable(owner.token, { name: 'Beta' });
		accounts.createInvite(owner.token, alpha.id);
		const alphaAudit = accounts.listAudit(owner.token, alpha.id);
		const betaAudit = accounts.listAudit(owner.token, beta.id);
		assert(alphaAudit.some(entry => entry.action === 'invite.created'));
		assert(!betaAudit.some(entry => entry.action === 'invite.created'));
		assert(alphaAudit.every(entry => entry.tableId === alpha.id));
		assert(betaAudit.every(entry => entry.tableId === beta.id));
	});

	it('resolves only the selected active table and rejects archived table contexts', () => {
		const accounts = service();
		accounts.createAccount('contexto', 'Contexto', 'senha-segura');
		const login = accounts.login('contexto', 'senha-segura');
		const first = accounts.createTable(login.token, { name: 'Primeira' });
		const second = accounts.createTable(login.token, { name: 'Segunda' });
		accounts.selectTable(login.token, second.id);
		assert.equal(accounts.getActiveTableContext(login.token).table.id, second.id);
		const archived = accounts.repository.getTable(second.id);
		archived.status = 'archived'; accounts.repository.setTable(archived);
		assert.throws(() => accounts.getActiveTableContext(login.token), /Mesa indisponível/);
		accounts.selectTable(login.token, first.id);
		assert.equal(accounts.getActiveTableContext(login.token).table.id, first.id);
	});

	it('archives only as owner and invalidates selections, invitations, and table operations', () => {
		const accounts = service();
		accounts.createAccount('dono-arquivo', 'Dono', 'senha-segura');
		accounts.createAccount('membro-arquivo', 'Membro', 'senha-segura');
		accounts.createAccount('visitante-arquivo', 'Visitante', 'senha-segura');
		const owner = accounts.login('dono-arquivo', 'senha-segura');
		const member = accounts.login('membro-arquivo', 'senha-segura');
		const visitor = accounts.login('visitante-arquivo', 'senha-segura');
		const table = accounts.createTable(owner.token, { name: 'Mesa arquivada' });
		const memberInvite = accounts.createInvite(owner.token, table.id);
		accounts.joinByInvite(member.token, memberInvite.code);
		const pendingInvite = accounts.createInvite(owner.token, table.id);
		accounts.selectTable(owner.token, table.id); accounts.selectTable(member.token, table.id);
		assert.throws(() => accounts.archiveTable(member.token, table.id), /Apenas o proprietário/);
		assert.equal(accounts.archiveTable(owner.token, table.id).status, 'archived');
		assert.equal(accounts.getSession(owner.token).session.activeTableId, undefined);
		assert.equal(accounts.getSession(member.token).session.activeTableId, undefined);
		assert.throws(() => accounts.selectTable(owner.token, table.id), /Mesa indisponível/);
		assert.throws(() => accounts.createInvite(owner.token, table.id), /Mesa indisponível/);
		assert.throws(() => accounts.joinByInvite(visitor.token, pendingInvite.code), /inválido ou revogado/);
		assert.equal(accounts.repository.getInvite(pendingInvite.invite.id).status, 'revoked');
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
		accounts.withAuditContext({ origin: 'unit-test', sessionId: 'session-test' }, () =>
			assert.equal(accounts.changeMemberRole(owner.token, table.id, playerAccount.id, 'spectator',
				'Reorganização da mesa').role, 'spectator'));
		assert.throws(() => accounts.changeMemberRole(master.token, table.id, playerAccount.id, 'master'), /proprietário/);
		assert.equal(accounts.removeMember(master.token, table.id, playerAccount.id, true).status, 'blocked');
		assert.throws(() => accounts.joinByInvite(player.token,
			accounts.createInvite(owner.token, table.id, 'player').code), /bloqueada/);
		assert.equal(accounts.leaveTable(master.token, table.id).status, 'left');
		assert.throws(() => accounts.leaveTable(owner.token, table.id), /proprietário não pode sair/);
		assert(ownerAccount.id && masterAccount.id);
		const audit = accounts.listAudit(owner.token, table.id);
		const roleAudit = audit.find(entry => entry.action === 'member.role.changed' && entry.targetId === playerAccount.id);
		assert(roleAudit);
		assert.deepEqual(roleAudit.metadata, {
			origin: 'unit-test', sessionId: 'session-test', result: 'success', previousRole: 'player',
			newRole: 'spectator', previousStatus: 'active', newStatus: 'active', reason: 'Reorganização da mesa',
		});
		assert(audit.some(entry => entry.action === 'member.blocked' && entry.targetId === playerAccount.id));
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

	it('applies fixed default permissions for every table role without member overrides', () => {
		const owner = getRPGDefaultTablePermissions('owner');
		const master = getRPGDefaultTablePermissions('master');
		const player = getRPGDefaultTablePermissions('player');
		const spectator = getRPGDefaultTablePermissions('spectator');
		assert(Object.values(owner).every(Boolean));
		assert.equal(master['battles.create'], true);
		assert.equal(master['campaign.configure'], false);
		assert.equal(master['members.manage'], true);
		assert.equal(player['battles.participate'], true);
		assert.equal(player['battles.create'], false);
		assert.equal(spectator['battles.watch'], true);
		assert.equal(spectator['battles.participate'], false);

		const accounts = service();
		accounts.createAccount('dono-perm', 'Dono', 'senha-segura');
		accounts.createAccount('player-perm', 'Player', 'senha-segura');
		const ownerSession = accounts.login('dono-perm', 'senha-segura');
		const playerSession = accounts.login('player-perm', 'senha-segura');
		const table = accounts.createTable(ownerSession.token, { name: 'Permissões' });
		accounts.joinByInvite(playerSession.token, accounts.createInvite(ownerSession.token, table.id).code);
		assert.equal(accounts.getTablePermissions(playerSession.token, table.id)['contests.participate'], true);
		assert.throws(() => accounts.createInvite(playerSession.token, table.id), /Permissão necessária/);
	});

	it('links a legacy character credential to one global account and table membership idempotently', () => {
		const accounts = service();
		accounts.createAccount('owner-link', 'Owner', 'senha-segura');
		const owner = accounts.login('owner-link', 'senha-segura');
		const table = accounts.createTable(owner.token, { name: 'Legado' });
		const credential = { algorithm: 'scrypt', salt: Buffer.alloc(16, 8).toString('base64'), hash: 'hash-legado' };
		const first = accounts.linkLegacyCharacter({
			characterId: 'Personagem Antigo', displayName: 'Jogador Antigo', credential,
			tableId: table.id, createdAt: 1_600_000_000_000,
		});
		const second = accounts.linkLegacyCharacter({
			characterId: 'Personagem Antigo', displayName: 'Jogador Antigo', credential,
			tableId: table.id, createdAt: 1_600_000_000_000,
		});
		assert.equal(first.account.id, second.account.id);
		assert.equal(first.membership.tableId, table.id);
		assert.equal(accounts.listMembers(owner.token, table.id).length, 2);
	});

	it('ships an idempotent MySQL migration for every version 2 entity', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/002-accounts-and-tables.sql'
		), 'utf8');
		for (const table of ['rpg_accounts', 'rpg_campaign_tables', 'rpg_table_members', 'rpg_table_invites', 'rpg_account_sessions']) {
			assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table);
		}
	});

	it('persists recovery hashes, login throttling, and immutable administrative audit records', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/005-account-security-and-audit.sql'
		), 'utf8');
		for (const table of ['rpg_account_recovery_codes', 'rpg_login_attempts', 'rpg_admin_audit']) {
			assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table);
		}
		assert.match(migration, /UNIQUE KEY uq_rpg_recovery_code_hash \(code_hash\)/);
		assert.match(migration, /idx_rpg_audit_table_time \(table_id, created_at\)/);
		const unblockMigration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/006-login-attempt-account-key.sql'
		), 'utf8');
		assert.match(unblockMigration, /ADD COLUMN account_key CHAR\(64\)/);
		assert.match(unblockMigration, /idx_rpg_login_attempt_account \(account_key\)/);
		assert.match(unblockMigration, /DELETE FROM rpg_login_attempts WHERE account_key IS NULL/);
	});

	it('scopes every version 1 persistence table and character ownership to a version 2 table', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/003-link-legacy-data-to-tables.sql'
		), 'utf8');
		for (const table of [
			'rpg_characters', 'rpg_battle_sessions', 'rpg_contest_sessions', 'rpg_tournaments',
			'rpg_contest_combos', 'rpg_custom_items', 'rpg_shops', 'rpg_master_npc_library',
			'rpg_player_documents', 'rpg_campaign',
		]) assert.match(migration, new RegExp(`ALTER TABLE ${table}[^;]+table_id`, 's'), table);
		assert.match(migration, /rpg_characters[\s\S]+account_id/);
	});

	it('enforces physical table isolation and assigns legacy data to Mesa principal', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/004-enforce-table-isolation.sql'
		), 'utf8');
		assert.match(migration, /'Mesa principal'/);
		for (const [table, identity] of [
			['rpg_characters', 'id'], ['rpg_battle_sessions', 'id'], ['rpg_contest_sessions', 'id'],
			['rpg_tournaments', 'id'], ['rpg_contest_combos', 'id'], ['rpg_custom_items', 'id'],
			['rpg_shops', 'id'], ['rpg_master_npc_library', 'singleton_id'],
			['rpg_player_documents', 'character_id'], ['rpg_campaign', 'singleton_id'],
		]) {
			assert.match(migration, new RegExp(
				`ALTER TABLE ${table}[^;]+MODIFY table_id VARCHAR\\(100\\) NOT NULL[^;]+` +
				`ADD PRIMARY KEY \\(table_id, ${identity}\\)`, 's'
			), table);
		}
		const importer = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/import-json.js'
		), 'utf8');
		assert.match(importer, /const MAIN_TABLE_ID = '[0-9a-f]{36}'/);
		assert.equal((importer.match(/MAIN_TABLE_ID/g) || []).length, 11);
	});

	it('requires a table scope in every version 1 MySQL read and destructive write', () => {
		const source = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/mysql-persistence.ts'
		), 'utf8');
		assert.match(source, /async snapshot\(tableId = this\.requireTableScope\(\)\)/);
		assert.match(source, /DELETE FROM rpg_characters WHERE id = \? AND table_id = \?/);
		assert.match(source, /LEGACY_SCOPED_TABLES\.has\(table\)[\s\S]+requireTableScope\(tableId\)/);
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
