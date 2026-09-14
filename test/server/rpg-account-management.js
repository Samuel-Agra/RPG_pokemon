'use strict';

const assert = require('assert').strict;
const { createHash } = require('node:crypto');
const fs = require('fs');
const path = require('path');
const {
	RPGAccountManagement, RPGMemoryAccountRepository, RPGMemoryPlatformSessionRepository,
	RPG_PLATFORM_SESSION_TTL, getRPGDefaultTablePermissions,
} = require('../../dist/server/rpg-showdown');
const {
	RPGMySQLPersistence, RPG_SECURITY_RETENTION_MS, reportRPGSecurityCleanupFailure, runRPGMigrationFile,
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

	it('commits nested asynchronous request writes in one transaction', async () => {
		const events = [];
		const connection = {
			beginTransaction: async () => events.push('begin'),
			execute: async sql => events.push(sql), commit: async () => events.push('commit'),
			rollback: async () => events.push('rollback'), release: () => events.push('release'),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await persistence.transactionAsync(async () => {
			persistence.transaction(() => persistence.enqueue('dominio', []));
			await Promise.resolve();
			persistence.enqueue('runtime', []);
		});
		assert.deepEqual(events, ['begin', 'dominio', 'runtime', 'commit', 'release']);
		await persistence.flush();
		assert.deepEqual(events, ['begin', 'dominio', 'runtime', 'commit', 'release']);
	});

	it('returns an asynchronous transaction failure to its own caller', async () => {
		const connection = {
			beginTransaction: async () => {},
			execute: async sql => { if (sql === 'falhar') throw new Error('falha exclusiva'); },
			commit: async () => {}, rollback: async () => {}, release: () => {},
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await assert.rejects(() => persistence.transactionAsync(async () => {
			persistence.enqueue('falhar', []);
		}), /falha exclusiva/);
		await persistence.transactionAsync(async () => persistence.enqueue('funcionar', []));
		await persistence.flush();
	});

	it('holds and always releases the MySQL cross-process account lock', async () => {
		const events = [];
		const connection = {
			query: async (sql, values) => {
				events.push([sql, values]);
				return sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[{ released: 1 }]];
			},
			release: () => events.push(['release']),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await assert.rejects(() => persistence.withAdvisoryLock('contas', async () => {
			events.push(['action']); throw new Error('falha interna');
		}), /falha interna/);
		assert.deepEqual(events.map(event => event[0]), [
			'SELECT GET_LOCK(?, ?) AS acquired', 'action', 'SELECT RELEASE_LOCK(?) AS released', 'release',
		]);
	});

	it('acquires multiple advisory locks in stable order and releases them in reverse', async () => {
		const events = [];
		const connection = {
			query: async (sql, values) => {
				events.push([sql, values]);
				return sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[{ released: 1 }]];
			},
			release: () => events.push(['release']),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await persistence.withAdvisoryLocks(['z', 'a', 'z'], async () => events.push(['action']));
		assert.deepEqual(events.map(event => event[1]?.[0] || event[0]), ['a', 'z', 'action', 'z', 'a', 'release']);
	});

	it('releases locks already acquired when a later advisory lock is unavailable', async () => {
		const events = []; let acquisitions = 0;
		const connection = {
			query: async (sql, values) => {
				events.push([sql, values]);
				if (sql.includes('GET_LOCK')) return [[{ acquired: ++acquisitions === 1 ? 1 : 0 }]];
				return [[{ released: 1 }]];
			},
			release: () => events.push(['release']),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		await assert.rejects(() => persistence.withAdvisoryLocks(['a', 'b'], async () => {}), error =>
			error.code === 'RPG_LOCK_BUSY');
		assert.deepEqual(events.map(event => event[1]?.[0] || event[0]), ['a', 'b', 'a', 'release']);
	});

	it('destroys a connection that may retain an advisory lock without replacing the action result', async () => {
		const events = [];
		const connection = {
			query: async sql => {
				if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
				throw new Error('conexão perdida ao liberar');
			},
			destroy: () => events.push('destroy'), release: () => events.push('release'),
		};
		const persistence = new RPGMySQLPersistence({ getConnection: async () => connection });
		assert.equal(await persistence.withAdvisoryLock('contas', async () => 'resultado'), 'resultado');
		assert.deepEqual(events, ['destroy']);
	});

	it('marks an unavailable advisory lock as a retryable service failure', async () => {
		const persistence = new RPGMySQLPersistence({
			getConnection: async () => ({
				query: async () => [[{ acquired: 0 }]], release: () => {},
			}),
		});
		await assert.rejects(() => persistence.withAdvisoryLock('ocupada', async () => {}), error =>
			error.code === 'RPG_LOCK_BUSY');
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
			sessions: 1, recoveryCodes: 2, loginAttempts: 3, invites: 4, runtimes: 5,
		});
		assert.deepEqual(events.map(event => event[0]), [
			'begin',
			'DELETE FROM rpg_account_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR (expires_at < ? AND (revoked_at IS NULL OR revoked_at < ?))',
			'DELETE FROM rpg_account_recovery_codes WHERE used_at IS NOT NULL AND used_at < ?',
			'DELETE FROM rpg_login_attempts WHERE updated_at < ? AND (blocked_until IS NULL OR blocked_until < ?)',
			'DELETE FROM rpg_table_invites WHERE expires_at IS NOT NULL AND expires_at < ?',
			'DELETE FROM rpg_runtime_states WHERE (finished_at IS NOT NULL AND finished_at < ?) OR (finished_at IS NULL AND updated_at < ?)',
			'commit', 'release',
		]);
		assert.deepEqual(events[1][1], [cutoff, cutoff, cutoff]);
		assert.deepEqual(events[2][1], [cutoff]);
		assert.deepEqual(events[3][1], [cutoff, now]);
		assert.deepEqual(events[4][1], [cutoff]);
		assert.deepEqual(events[5][1], [cutoff, cutoff]);
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

	it('reports scheduled security cleanup failures without exposing database details', () => {
		const reports = []; const original = console.error;
		console.error = (...values) => reports.push(values);
		try {
			const error = new Error('DELETE secreto contendo dados sensíveis');
			error.code = 'ER_LOCK_WAIT_TIMEOUT';
			reportRPGSecurityCleanupFailure(error, Date.UTC(2026, 8, 7, 12));
		} finally {
			console.error = original;
		}
		assert.equal(reports.length, 1);
		assert.match(reports[0][0], /Falha na limpeza programada/);
		assert.deepEqual(reports[0][1], {
			occurredAt: '2026-09-07T12:00:00.000Z', errorType: 'Error', errorCode: 'ER_LOCK_WAIT_TIMEOUT',
		});
		assert(!JSON.stringify(reports).includes('DELETE secreto'));
	});

	it('rolls a compound operation back when one repository write fails', () => {
		let tableWrites = 0;
		const repository = new RPGMemoryAccountRepository({}, {
			table: () => { tableWrites++; },
			auditEntry: () => { throw new Error('falha simulada'); },
		});
		const accounts = new RPGAccountManagement(repository);
		accounts.createAccount('rollback', 'Rollback', 'Senha1!Segura');
		const login = accounts.login('rollback', 'Senha1!Segura');
		assert.throws(() => accounts.createTable(login.token, { name: 'Não pode persistir pela metade' }), /falha simulada/);
		assert.equal(tableWrites, 1);
		assert.deepEqual(accounts.listTables(login.token), []);
		assert.deepEqual(repository.listAuditEntries('qualquer'), []);
	});

	it('creates global accounts without exposing password credentials', () => {
		const accounts = service();
		const account = accounts.createAccount('Samuel.RPG', 'Samuel', 'Senha1!Segura');
		assert.equal(account.username, 'samuelrpg');
		assert.equal(account.displayName, 'Samuel');
		assert.equal(account.credential, undefined);
		assert.throws(() => accounts.createAccount('samuel-rpg', 'Outro', 'Outra1!Senha'), /já está em uso/);
		assert.throws(() => accounts.login('samuelrpg', 'senha-errada'), /inválidos/);
		for (const weakPassword of ['Curta1!', 'semsimbolo1A', 'SEMMINUSCULA1!', 'Semnumero!', 'semmaiuscula1!']) {
			assert.throws(() => accounts.createAccount('fraca-' + weakPassword, 'Senha fraca', weakPassword),
				/maiúscula, minúscula, número e caractere especial/);
		}
	});

	it('uses asynchronous scrypt on the HTTP-facing authentication path', async () => {
		const accounts = service();
		await accounts.createAccountWithRecoveryCodesAsync('assincrona', 'Assíncrona', 'Senha1!Segura');
		let eventLoopAdvanced = false;
		const login = accounts.loginAsync('assincrona', 'Senha1!Segura').then(value => {
			assert.equal(eventLoopAdvanced, true); return value;
		});
		await new Promise(resolve => setImmediate(() => { eventLoopAdvanced = true; resolve(); }));
		assert((await login).token);
	});

	it('changes the password securely, revokes other sessions, and expires only after inactivity', async () => {
		let time = 1_700_000_000_000;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => time);
		accounts.createAccount('Senha1!Segura-v2', 'Senha segura', 'Antiga1!Senha');
		const current = accounts.login('Senha1!Segura-v2', 'Antiga1!Senha');
		const other = accounts.login('Senha1!Segura-v2', 'Antiga1!Senha');
		time += RPG_PLATFORM_SESSION_TTL / 2;
		const renewed = accounts.getSession(current.token).session;
		assert.equal(renewed.expiresAt, time + RPG_PLATFORM_SESSION_TTL);
		time += RPG_PLATFORM_SESSION_TTL / 2 + 1;
		assert(accounts.getSession(current.token).session.token);
		await accounts.changePasswordAsync(current.token, 'Antiga1!Senha', 'Nova1!SenhaSegura');
		assert.throws(() => accounts.getSession(other.token), /inválida ou expirada/);
		assert.throws(() => accounts.login('Senha1!Segura-v2', 'Antiga1!Senha'), /inválidos/);
		assert(accounts.login('Senha1!Segura-v2', 'Nova1!SenhaSegura').token);
		time += RPG_PLATFORM_SESSION_TTL + 1;
		assert.throws(() => accounts.getSession(current.token), /inválida ou expirada/);
	});

	it('issues one-time recovery codes and revokes every session after a password reset', () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('recuperar', 'Recuperar', 'Antiga1!Senha');
		assert.equal(registration.recoveryCodes.length, 10);
		assert(registration.recoveryCodes.every(code => /^(?:[0-9A-F]{4}-){3}[0-9A-F]{4}$/.test(code)));
		const oldSession = accounts.login('recuperar', 'Antiga1!Senha');
		accounts.recoverPassword('recuperar', registration.recoveryCodes[0], 'Nova1!SenhaSegura');
		assert.throws(() => accounts.getSession(oldSession.token), /inválida ou expirada/);
		assert.throws(() => accounts.login('recuperar', 'Antiga1!Senha'), /inválidos/);
		assert(accounts.login('recuperar', 'Nova1!SenhaSegura').token);
		assert.throws(() => accounts.recoverPassword(
			'recuperar', registration.recoveryCodes[0], 'Outra1!SenhaSegura'), /Código de recuperação inválido/);
	});

	it('removes source-specific and account-wide login blocks after password recovery', () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('desbloquear', 'Desbloquear', 'Antiga1!Senha');
		for (let index = 0; index < 5; index++) {
			assert.throws(() => accounts.login('desbloquear', 'senha-incorreta', '10.0.0.1'), /inválidos/);
		}
		assert.throws(() => accounts.login('desbloquear', 'Antiga1!Senha', '10.0.0.1'), /Muitas tentativas/);
		assert.throws(() => accounts.login('desbloquear', 'Antiga1!Senha', '10.0.0.2'), /Muitas tentativas/);
		accounts.recoverPassword('desbloquear', registration.recoveryCodes[0], 'Nova1!SenhaSegura');
		assert(accounts.login('desbloquear', 'Nova1!SenhaSegura', '10.0.0.1').token);
		assert(accounts.login('desbloquear', 'Nova1!SenhaSegura', '10.0.0.2').token);
	});

	it('limits password recovery independently by account and origin', () => {
		let time = 1_700_000_000_000;
		const repository = new RPGMemoryAccountRepository();
		const accounts = new RPGAccountManagement(repository, () => time);
		const registration = accounts.createAccountWithRecoveryCodes('recuperacao-segura', 'Recuperação', 'Antiga1!Senha');
		for (let index = 0; index < 5; index++) {
			assert.throws(() => accounts.recoverPassword(
				'recuperacao-segura', '0000-0000-0000', 'Nova1!SenhaSegura', `origem-${index}`),
			/Código de recuperação inválido/);
		}
		assert.throws(() => accounts.recoverPassword(
			'recuperacao-segura', registration.recoveryCodes[0], 'Nova1!SenhaSegura', 'origem-nova'),
		/Muitas tentativas de recuperação/);
		// O bloqueio de recuperação não impede um login legítimo.
		assert(accounts.login('recuperacao-segura', 'Antiga1!Senha', 'origem-nova').token);
		const recoveryAccountKey = createHash('sha256').update('recovery:recuperacaosegura').digest('hex');
		assert(repository.listLoginAttempts(recoveryAccountKey).some(value => value.failures === 5));
		time += 15 * 60 * 1000 + 1;
		accounts.recoverPassword(
			'recuperacao-segura', registration.recoveryCodes[0], 'Nova1!SenhaSegura', 'origem-nova');
		assert.deepEqual(repository.listLoginAttempts(recoveryAccountKey), []);
		assert(accounts.login('recuperacao-segura', 'Nova1!SenhaSegura', 'origem-nova').token);
	});

	it('temporarily blocks repeated login failures and clears attempts after success', () => {
		let time = 1_700_000_000_000; let seed = 0;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => time,
			size => Buffer.alloc(size, ++seed));
		accounts.createAccount('protegida', 'Protegida', 'Correta1!Senha');
		for (let index = 0; index < 5; index++) {
			assert.throws(() => accounts.login('protegida', 'incorreta', '127.0.0.1'), /inválidos/);
		}
		assert.throws(() => accounts.login('protegida', 'Correta1!Senha', '127.0.0.1'), /Muitas tentativas/);
		time += 15 * 60 * 1000 + 1;
		assert(accounts.login('protegida', 'Correta1!Senha', '127.0.0.1').token);
	});

	it('blocks account-wide attempts spread across different origins', () => {
		let time = 1_700_000_000_000;
		const repository = new RPGMemoryAccountRepository();
		const accounts = new RPGAccountManagement(repository, () => time);
		const account = accounts.createAccount('alvo-global', 'Alvo', 'Correta1!Senha');
		for (let index = 0; index < 5; index++) {
			assert.throws(() => accounts.login('alvo-global', 'incorreta', `origem-${index}`), /inválidos/);
		}
		assert.throws(() => accounts.login('alvo-global', 'Correta1!Senha', 'origem-nova'), /Muitas tentativas/);
		const attempts = repository.listLoginAttempts(createHash('sha256').update('alvoglobal').digest('hex'));
		assert(attempts.some(attempt => attempt.failures === 5 && attempt.blockedUntil > time));
		time += 15 * 60 * 1000 + 1;
		assert.equal(accounts.login('alvo-global', 'Correta1!Senha', 'origem-nova').accountId, account.id);
		assert.deepEqual(repository.listLoginAttempts(createHash('sha256').update('alvoglobal').digest('hex')), []);
	});

	it('blocks login spraying across different usernames from one origin', async () => {
		const accounts = service();
		for (let index = 0; index < 20; index++) {
			await assert.rejects(() => accounts.loginAsync(`desconhecido-${index}`, 'senha-errada', 'mesma-origem'));
		}
		await assert.rejects(() => accounts.loginAsync('mais-um-desconhecido', 'senha-errada', 'mesma-origem'),
			/Muitas tentativas de login/);
	});

	it('blocks password recovery spraying across different usernames from one origin', () => {
		const accounts = service();
		for (let index = 0; index < 20; index++) {
			assert.throws(() => accounts.recoverPassword(
				`desconhecido-${index}`, '0000-0000-0000', 'Nova1!SenhaSegura', 'mesma-origem'
			), /Código de recuperação inválido/);
		}
		assert.throws(() => accounts.recoverPassword(
			'mais-um-desconhecido', '0000-0000-0000', 'Nova1!SenhaSegura', 'mesma-origem'
		), /Muitas tentativas de recuperação/);
	});

	it('runs password hashing and records equivalent limits for unknown usernames', () => {
		const repository = new RPGMemoryAccountRepository();
		const accounts = new RPGAccountManagement(repository);
		assert.throws(() => accounts.login('usuario-inexistente', 'qualquer-senha', 'origem'), /inválidos/);
		const accountKey = createHash('sha256').update('usuarioinexistente').digest('hex');
		const attempts = repository.listLoginAttempts(accountKey);
		assert.equal(attempts.length, 2);
		assert(attempts.every(attempt => attempt.failures === 1));
	});

	it('rejects malformed persisted credentials instead of comparing empty hashes', async () => {
		const accounts = service();
		accounts.createAccount('credencial-quebrada', 'Credencial', 'Senha1!Segura');
		const stored = accounts.repository.getAccountByUsername('credencial-quebrada');
		stored.credential = { algorithm: 'scrypt', salt: '', hash: '' };
		accounts.repository.setAccount(stored);
		assert.throws(() => accounts.login('credencial-quebrada', 'qualquer-senha'), /Usuário ou senha inválidos/);
		await assert.rejects(() => accounts.loginAsync('credencial-quebrada', 'qualquer-senha'), /Usuário ou senha inválidos/);
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
		const registration = first.createAccountWithRecoveryCodes('reinicio', 'Reinício', 'Antiga1!Senha');
		const owner = first.login('reinicio', 'Antiga1!Senha');
		const table = first.createTable(owner.token, { name: 'Mesa persistida' });
		for (let index = 0; index < 5; index++) assert.throws(() => first.login('reinicio', 'errada', 'origem-a'));

		const restored = new RPGAccountManagement(new RPGMemoryAccountRepository({
			accounts: [...stored.accounts.values()], tables: [...stored.tables.values()],
			members: [...stored.members.values()], invites: [...stored.invites.values()],
			recoveryCodes: [...stored.recoveryCodes.values()], loginAttempts: [...stored.loginAttempts.values()],
			auditEntries: [...stored.auditEntries.values()],
		}, changes), now, bytes, new RPGMemoryPlatformSessionRepository([...stored.sessions.values()], sessionChanged));
		assert.throws(() => restored.login('reinicio', 'Antiga1!Senha', 'origem-a'), /Muitas tentativas/);
		assert.equal(restored.listAudit(owner.token, table.id)[0].action, 'table.created');
		restored.recoverPassword('reinicio', registration.recoveryCodes[0], 'Nova1!SenhaSegura');
		assert(restored.login('reinicio', 'Nova1!SenhaSegura', 'origem-b').token);
	});

	it('consumes recovery codes and single-use invitations only once under competing requests', async () => {
		const accounts = service();
		const registration = accounts.createAccountWithRecoveryCodes('corrida', 'Corrida', 'Antiga1!Senha');
		const recovery = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() =>
			accounts.recoverPassword('corrida', registration.recoveryCodes[0], 'Nova1!SenhaSegura'))));
		assert.equal(recovery.filter(result => result.status === 'fulfilled').length, 1);
		assert.equal(recovery.filter(result => result.status === 'rejected').length, 1);

		for (const name of ['dono-corrida', 'convidado-a', 'convidado-b']) {
			accounts.createAccount(name, name, 'Senha1!Segura');
		}
		const owner = accounts.login('dono-corrida', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Convite concorrente' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
		const code = accounts.createInvite(owner.token, table.id, 'player', undefined, 1).code;
		const guests = ['convidado-a', 'convidado-b'].map(name => accounts.login(name, 'Senha1!Segura'));
		const joins = await Promise.allSettled(guests.map(guest => Promise.resolve().then(() =>
			accounts.joinByInvite(guest.token, code))));
		assert.equal(joins.filter(result => result.status === 'fulfilled').length, 1);
		assert.equal(joins.filter(result => result.status === 'rejected').length, 1);
	});

	it('keeps administrative audit records isolated between tables', () => {
		const accounts = service();
		accounts.createAccount('dono-isolado', 'Dono', 'Senha1!Segura');
		const owner = accounts.login('dono-isolado', 'Senha1!Segura');
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

	it('audits a denied administrative attempt from an authenticated non-member', () => {
		const accounts = service();
		accounts.createAccount('dono-auditoria', 'Dono', 'Senha1!Segura');
		accounts.createAccount('intruso-auditoria', 'Intruso', 'Senha1!Segura');
		const owner = accounts.login('dono-auditoria', 'Senha1!Segura');
		const outsider = accounts.login('intruso-auditoria', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Mesa auditada' });
		accounts.recordAdministrativeFailure(
			outsider.token, table.id, 'member.role.changed', 'member', 'alvo',
			new Error('A conta não participa desta mesa')
		);
		const denied = accounts.listAudit(owner.token, table.id)
			.find(entry => entry.action === 'member.role.changed');
		assert(denied);
		assert.equal(denied.actorAccountId, accounts.getSession(outsider.token).account.id);
		assert.equal(denied.metadata.result, 'denied');
		assert.equal(denied.metadata.error, 'Ação recusada por permissão');
		accounts.recordAdministrativeFailure(
			outsider.token, table.id, 'campaign.configure', 'campaign', undefined,
			new Error('RPG session does not have permission: campaign.configure')
		);
		const englishDenied = accounts.listAudit(owner.token, table.id)
			.find(entry => entry.action === 'campaign.configure');
		assert.equal(englishDenied.metadata.result, 'denied');
	});

	it('resolves only the selected active table and rejects archived table contexts', () => {
		const accounts = service();
		accounts.createAccount('contexto', 'Contexto', 'Senha1!Segura');
		const login = accounts.login('contexto', 'Senha1!Segura');
		const first = accounts.createTable(login.token, { name: 'Primeira' });
		const second = accounts.createTable(login.token, { name: 'Segunda' });
		accounts.selectTable(login.token, second.id);
		assert.equal(accounts.getSession(login.token).session.role, 'owner');
		assert.equal(accounts.getSession(login.token).session.membershipId, `${second.id}:${login.accountId}`);
		assert.equal(accounts.getActiveTableContext(login.token).table.id, second.id);
		const archived = accounts.repository.getTable(second.id);
		archived.status = 'archived'; accounts.repository.setTable(archived);
		assert.throws(() => accounts.getActiveTableContext(login.token), /Mesa indisponível/);
		accounts.selectTable(login.token, first.id);
		assert.equal(accounts.getActiveTableContext(login.token).table.id, first.id);
		assert.equal(accounts.deselectTable(login.token).activeTableId, undefined);
		assert.throws(() => accounts.getActiveTableContext(login.token), /Selecione uma mesa/);
	});

	it('archives only as owner and invalidates selections, invitations, and table operations', () => {
		const accounts = service();
		accounts.createAccount('dono-arquivo', 'Dono', 'Senha1!Segura');
		accounts.createAccount('membro-arquivo', 'Membro', 'Senha1!Segura');
		accounts.createAccount('visitante-arquivo', 'Visitante', 'Senha1!Segura');
		const owner = accounts.login('dono-arquivo', 'Senha1!Segura');
		const member = accounts.login('membro-arquivo', 'Senha1!Segura');
		const visitor = accounts.login('visitante-arquivo', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Mesa arquivada' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
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
		assert.throws(() => accounts.deleteArchivedTable(member.token, table.id), /Apenas o proprietário/);
		accounts.deleteArchivedTable(owner.token, table.id);
		assert.equal(accounts.repository.getTable(table.id), undefined);
		assert.deepEqual(accounts.listTables(owner.token), []);
	});

	it('creates a table and its owner membership atomically at domain level', () => {
		const accounts = service();
		accounts.createAccount('samuel', 'Samuel', 'Senha1!Segura');
		const session = accounts.login('samuel', 'Senha1!Segura');
		const table = accounts.createTable(session.token, {
			name: 'Jornada de Kanto', description: 'Campanha principal', visibility: 'code', color: '#a52a2a',
			settings: { cardImage: 'https://example.test/kanto.png', tableInformation: 'Informações completas',
				fullDescription: 'Descrição completa',
				sessionDays: ['sat'], sessionTimes: { sat: '19:00' }, inDevelopment: false },
		});
		const listed = accounts.listTables(session.token);
		assert.equal(listed[0].table.id, table.id);
		assert.equal(listed[0].membership.role, 'owner');
		assert.equal(listed[0].owner.displayName, 'Samuel');
		assert.equal(listed[0].memberCount, 1);
		assert.deepEqual(table.settings.sessionDays, ['sat']);
		assert.deepEqual(table.settings.sessionTimes, { sat: '19:00' });
		assert.equal(table.settings.inDevelopment, false);
		assert(listed[0].lastActivityAt >= table.updatedAt);
		assert.equal(accounts.updateAccount(session.token, 'Samuel Atualizado').displayName, 'Samuel Atualizado');
		const updated = accounts.updateTable(session.token, table.id, {
			name: 'Kanto Atualizada', description: 'Nova descrição', color: '#335577', visibility: 'private',
			settings: { fullDescription: 'Uma nova descrição completa' },
		});
		assert.equal(updated.name, 'Kanto Atualizada');
		assert.equal(updated.color, '#335577');
		assert.equal(updated.settings.fullDescription, 'Uma nova descrição completa');
		assert.equal(updated.settings.cardImage, 'https://example.test/kanto.png');
		assert.equal(accounts.listAudit(session.token, table.id)[0].action, 'table.updated');
		assert.equal(accounts.selectTable(session.token, table.id).activeTableId, table.id);
	});

	it('joins another account through a single-use hashed invite', () => {
		const accounts = service();
		accounts.createAccount('mestre', 'Mestre', 'Mestre1!Senha');
		accounts.createAccount('player', 'Player', 'Player1!Senha');
		const master = accounts.login('mestre', 'Mestre1!Senha');
		const player = accounts.login('player', 'Player1!Senha');
		const table = accounts.createTable(master.token, { name: 'Mesa teste' });
		accounts.updateTable(master.token, table.id, { requireJoinApproval: false });
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
		first.createAccount('persistente', 'Conta persistente', 'Senha1!Segura');
		const login = first.login('persistente', 'Senha1!Segura');
		const table = first.createTable(login.token, { name: 'Mesa persistente' });
		first.createInvite(login.token, table.id);
		first.selectTable(login.token, table.id);

		const restored = new RPGAccountManagement(new RPGMemoryAccountRepository({
			accounts: [...stored.accounts.values()], tables: [...stored.tables.values()],
			members: [...stored.members.values()], invites: [...stored.invites.values()],
		}, callbacks), now, bytes, new RPGMemoryPlatformSessionRepository([...stored.sessions.values()], sessionsChanged));
		assert.equal(restored.login('persistente', 'Senha1!Segura').accountId, login.accountId);
		assert.equal(restored.listTables(login.token)[0].table.name, 'Mesa persistente');
		assert.equal(stored.sessions.size, 2, 'the restored token and the new login are persisted');
		restored.logout(login.token);
		assert.throws(() => restored.listTables(login.token), /inválida ou expirada/);
	});

	it('lists safe session identifiers and revokes one or every login without deleting its audit record', () => {
		const accounts = service();
		accounts.createAccount('sessoes', 'Sessões', 'Senha1!Segura');
		const first = accounts.login('sessoes', 'Senha1!Segura');
		const second = accounts.login('sessoes', 'Senha1!Segura');
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
		const ownerAccount = accounts.createAccount('proprietario', 'Proprietário', 'Senha1!Segura');
		const masterAccount = accounts.createAccount('assistente', 'Assistente', 'Senha1!Segura');
		const playerAccount = accounts.createAccount('membro', 'Membro', 'Senha1!Segura');
		const owner = accounts.login('proprietario', 'Senha1!Segura');
		const master = accounts.login('assistente', 'Senha1!Segura');
		const player = accounts.login('membro', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Administração' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
		accounts.joinByInvite(master.token, accounts.createInvite(owner.token, table.id, 'master').code);
		accounts.joinByInvite(player.token, accounts.createInvite(master.token, table.id, 'player').code);
		assert.equal(accounts.listMembers(owner.token, table.id).length, 3);
		assert.equal(accounts.listMembers(owner.token, table.id)
			.find(entry => entry.account.id === playerAccount.id).online, false);
		accounts.selectTable(player.token, table.id);
		assert.equal(accounts.listMembers(owner.token, table.id)
			.find(entry => entry.account.id === playerAccount.id).online, true);
		accounts.deselectTable(player.token);
		assert.equal(accounts.listMembers(owner.token, table.id)
			.find(entry => entry.account.id === playerAccount.id).online, false);
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

	it('stores private member notes and transfers table ownership atomically', () => {
		const accounts = service();
		const firstAccount = accounts.createAccount('primeiro-dono', 'Primeiro', 'Senha1!Segura');
		const nextAccount = accounts.createAccount('proximo-dono', 'Próximo', 'Senha1!Segura');
		const first = accounts.login('primeiro-dono', 'Senha1!Segura');
		const next = accounts.login('proximo-dono', 'Senha1!Segura');
		const table = accounts.createTable(first.token, { name: 'Transferível' });
		accounts.updateTable(first.token, table.id, { requireJoinApproval: false });
		accounts.joinByInvite(next.token, accounts.createInvite(first.token, table.id).code);
		assert.equal(accounts.updateMemberNote(first.token, table.id, nextAccount.id, 'Anotação privada').note,
			'Anotação privada');
		assert.equal(accounts.listMembers(next.token, table.id).find(entry => entry.account.id === nextAccount.id).member.note,
			undefined);
		assert.equal(accounts.updateMemberNote(next.token, table.id, firstAccount.id, 'Anotação do segundo jogador').note,
			'Anotação do segundo jogador');
		assert.equal(accounts.listMembers(next.token, table.id)
			.find(entry => entry.account.id === firstAccount.id).member.note, 'Anotação do segundo jogador');
		assert.equal(accounts.listMembers(first.token, table.id)
			.find(entry => entry.account.id === nextAccount.id).member.note, 'Anotação privada');
		const otherTable = accounts.createTable(first.token, { name: 'Outra campanha' });
		accounts.updateTable(first.token, otherTable.id, { requireJoinApproval: false });
		accounts.joinByInvite(next.token, accounts.createInvite(first.token, otherTable.id).code);
		assert.equal(accounts.listMembers(first.token, otherTable.id)
			.find(entry => entry.account.id === nextAccount.id).member.note, 'Anotação privada');
		const transferred = accounts.transferOwnership(first.token, table.id, nextAccount.id);
		assert.equal(transferred.ownerAccountId, nextAccount.id);
		assert.equal(accounts.listMembers(next.token, table.id).find(entry => entry.account.id === nextAccount.id).member.role, 'owner');
		assert.equal(accounts.leaveTable(first.token, table.id).accountId, firstAccount.id);
	});

	it('supports directed, expiring, revocable, and configurable multi-use invites', () => {
		let time = 1_700_000_000_000; let seed = 0;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => time,
			size => Buffer.alloc(size, ++seed));
		accounts.createAccount('dono', 'Dono', 'Senha1!Segura');
		accounts.createAccount('destino', 'Destino', 'Senha1!Segura');
		accounts.createAccount('outro', 'Outro', 'Senha1!Segura');
		accounts.createAccount('terceiro', 'Terceiro', 'Senha1!Segura');
		const owner = accounts.login('dono', 'Senha1!Segura');
		const target = accounts.login('destino', 'Senha1!Segura');
		const other = accounts.login('outro', 'Senha1!Segura');
		const third = accounts.login('terceiro', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Convites' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
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

	it('keeps public handles unique and creates directed invitations atomically for several accounts', () => {
		const accounts = service();
		accounts.createAccount('login-dono', 'Dono', 'Senha1!Segura', 'mestre_publico');
		accounts.createAccount('login-um', 'Um', 'Senha1!Segura', 'teste1');
		accounts.createAccount('login-dois', 'Dois', 'Senha1!Segura', 'teste2');
		accounts.createAccount('login-tres', 'Três', 'Senha1!Segura', 'teste3');
		assert.throws(() => accounts.createAccount('outro-login', 'Outro', 'Senha1!Segura', 'TESTE1'), /já está em uso/);
		assert.throws(() => accounts.createAccount('login-virgula', 'Vírgula', 'Senha1!Segura', 'teste,quatro'), /O @/);
		const owner = accounts.login('login-dono', 'Senha1!Segura');
		const first = accounts.login('login-um', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Convites em lote' });
		accounts.joinByInvite(first.token, accounts.createInvite(owner.token, table.id).code);
		assert.throws(() => accounts.createDirectedInvites(owner.token, table.id, 'player', undefined,
			['teste2', 'teste1']), /já está nesta mesa/);
		assert.equal(accounts.listDirectedInvites(accounts.login('login-dois', 'Senha1!Segura').token).length, 0);
		const created = accounts.createDirectedInvites(owner.token, table.id, 'player', undefined, ['teste2', '@teste3']);
		assert.equal(created.length, 2);
		assert.deepEqual(created.map(invite => invite.maxUses), [1, 1]);
	});

	it('discovers public tables and lets recipients manage directed invites without their codes', () => {
		let seed = 0;
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository(), () => 1_700_000_000_000,
			size => Buffer.alloc(size, ++seed));
		accounts.createAccount('dono-publico', 'Dono', 'Senha1!Segura');
		accounts.createAccount('convidado-direto', 'Convidado', 'Senha1!Segura');
		const owner = accounts.login('dono-publico', 'Senha1!Segura');
		const guest = accounts.login('convidado-direto', 'Senha1!Segura');
		const publicTable = accounts.createTable(owner.token, { name: 'Mesa pública', visibility: 'public' });
		accounts.createTable(owner.token, { name: 'Mesa privada', visibility: 'private' });
		assert.equal(publicTable.settings.requireJoinApproval, true, 'aprovação deve ser o padrão de novas mesas');
		assert.deepEqual(accounts.discoverTables(owner.token), [], 'a própria mesa não deve aparecer na descoberta');
		assert.deepEqual(accounts.discoverTables(guest.token).map(entry => entry.table.id), [publicTable.id]);
		accounts.selectTable(owner.token, publicTable.id);
		assert.equal(accounts.discoverTables(guest.token)[0].ownerOnline, true);
		accounts.deselectTable(owner.token);
		assert.equal(accounts.discoverTables(guest.token)[0].ownerOnline, false);
		const publicRequest = accounts.joinPublicTable(guest.token, publicTable.id);
		assert.equal(publicRequest.status, 'pending');
		assert.equal(accounts.listNotifications(owner.token)[0].type, 'join_request');
		assert.deepEqual(accounts.discoverTables(guest.token), []);
		assert.equal(accounts.resolveJoinRequest(owner.token, publicTable.id, publicRequest.accountId, true).status, 'active');
		assert.equal(accounts.listNotifications(guest.token)[0].type, 'join_approved');
		const read = accounts.markNotificationRead(guest.token, accounts.listNotifications(guest.token)[0].id);
		assert.equal(typeof read.readAt, 'number');
		assert.throws(() => accounts.markNotificationRead(owner.token, read.id), /não encontrada/);
		accounts.leaveTable(guest.token, publicTable.id);
		accounts.updateTable(owner.token, publicTable.id, { requireJoinApproval: false });
		const accepted = accounts.createInvite(owner.token, publicTable.id, 'player', undefined, 1, 'convidado-direto');
		assert.equal(accounts.listDirectedInvites(guest.token)[0].invite.id, accepted.invite.id);
		assert(accounts.listNotifications(guest.token).some(notification => notification.type === 'table_invite'));
		assert.equal(accounts.acceptDirectedInvite(guest.token, accepted.invite.id).status, 'active');
		assert.deepEqual(accounts.discoverTables(guest.token), [], 'mesas das quais a conta participa não devem aparecer');
		assert.deepEqual(accounts.listDirectedInvites(guest.token), []);
		accounts.leaveTable(guest.token, publicTable.id);
		const declined = accounts.createInvite(owner.token, publicTable.id, 'spectator', undefined, 1, 'convidado-direto');
		accounts.declineDirectedInvite(guest.token, declined.invite.id);
		assert.deepEqual(accounts.listDirectedInvites(guest.token), []);
		assert(accounts.markAllNotificationsRead(guest.token) >= 1);
		assert(accounts.listNotifications(guest.token).every(notification => notification.readAt));
	});

	it('previews invitations and approves one idempotent join request', () => {
		const accounts = service();
		accounts.createAccount('dono-pedido', 'Samuel', 'Senha1!Segura');
		accounts.createAccount('convidado-pedido', 'Lucas', 'Senha1!Segura');
		const owner = accounts.login('dono-pedido', 'Senha1!Segura');
		const guest = accounts.login('convidado-pedido', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Jornada de Kanto' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: true });
		const invitation = accounts.createInvite(owner.token, table.id, 'player', undefined, 1);
		assert.match(invitation.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		const preview = accounts.previewInvite(guest.token, invitation.code);
		assert.equal(preview.table.name, 'Jornada de Kanto');
		assert.equal(preview.owner.displayName, 'Samuel');
		assert.equal(preview.requiresApproval, true);
		const request = accounts.joinByInvite(guest.token, invitation.code);
		assert.equal(request.status, 'pending');
		assert.equal(accounts.joinByInvite(guest.token, invitation.code).revision, request.revision);
		assert.equal(accounts.listInvites(owner.token, table.id)[0].usedCount, 0);
		assert.equal(accounts.listJoinRequests(owner.token, table.id)[0].account.displayName, 'Lucas');
		const accepted = accounts.resolveJoinRequest(owner.token, table.id, guest.accountId, true);
		assert.equal(accepted.status, 'active');
		assert.equal(accounts.listInvites(owner.token, table.id)[0].usedCount, 1);
	});

	it('applies role defaults and lets only the owner customize Master permissions', () => {
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
		accounts.createAccount('dono-perm', 'Dono', 'Senha1!Segura');
		accounts.createAccount('player-perm', 'Player', 'Senha1!Segura');
		const ownerSession = accounts.login('dono-perm', 'Senha1!Segura');
		const playerSession = accounts.login('player-perm', 'Senha1!Segura');
		const table = accounts.createTable(ownerSession.token, { name: 'Permissões' });
		accounts.updateTable(ownerSession.token, table.id, { requireJoinApproval: false });
		accounts.joinByInvite(playerSession.token, accounts.createInvite(ownerSession.token, table.id).code);
		assert.equal(accounts.getTablePermissions(playerSession.token, table.id)['contests.participate'], true);
		assert.throws(() => accounts.createInvite(playerSession.token, table.id), /Permissão necessária/);
		accounts.changeMemberRole(ownerSession.token, table.id, playerSession.accountId, 'master');
		accounts.updateMasterPermissions(ownerSession.token, table.id, playerSession.accountId, {
			'battles.create': false, 'campaign.configure': true,
		});
		assert.equal(accounts.getTablePermissions(playerSession.token, table.id)['battles.create'], false);
		assert.equal(accounts.getTablePermissions(playerSession.token, table.id)['campaign.configure'], true);
		assert.throws(() => accounts.updateMasterPermissions(playerSession.token, table.id, playerSession.accountId, {}),
			/Apenas o proprietário/);
	});

	it('links a legacy character credential to one global account and table membership idempotently', () => {
		const accounts = service();
		accounts.createAccount('owner-link', 'Owner', 'Senha1!Segura');
		const owner = accounts.login('owner-link', 'Senha1!Segura');
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
		const runtimeMigration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/007-runtime-state.sql'
		), 'utf8');
		assert.match(runtimeMigration, /CREATE TABLE IF NOT EXISTS rpg_runtime_states/);
		assert.match(runtimeMigration, /PRIMARY KEY \(table_id, runtime_type, session_id\)/);
		const retentionMigration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/008-runtime-retention.sql'
		), 'utf8');
		assert.match(retentionMigration, /ADD COLUMN finished_at/);
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
			'upsertTableInvite', 'upsertPlatformSession', 'deletePlatformSession', 'upsertAccountRelationNote',
			'upsertAccountNotification',
		]) assert(source.includes(`${method}(`), method);
		assert(source.includes('SELECT * FROM rpg_account_sessions'));
		assert(!source.includes('token VARCHAR'), 'plain session tokens must never be persisted');
	});

	it('migrates persistent join requests without overloading active memberships', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/010-table-join-requests.sql'
		), 'utf8');
		assert.match(migration, /'active', 'pending', 'left', 'removed', 'blocked'/);
		assert.match(migration, /request_invite_id VARCHAR\(100\)/);
		assert.match(migration, /ON DELETE SET NULL/);
	});

	it('persists private account relation notes independently from tables and permissions', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/013-account-relation-notes.sql'
		), 'utf8');
		assert.match(migration, /PRIMARY KEY \(author_account_id, target_account_id\)/);
		assert.match(migration, /FOREIGN KEY \(target_account_id\)/);
	});

	it('persists account notifications with read state and optional table context', () => {
		const migration = fs.readFileSync(path.resolve(
			__dirname, '../../server/rpg-showdown/database/migrations/015-account-notifications.sql'
		), 'utf8');
		assert.match(migration, /CREATE TABLE IF NOT EXISTS rpg_account_notifications/);
		assert.match(migration, /read_at BIGINT NULL/);
		assert.match(migration, /ON DELETE SET NULL/);
	});
});
