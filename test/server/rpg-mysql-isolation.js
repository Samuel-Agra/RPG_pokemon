'use strict';

const assert = require('assert').strict;
const mysql = require('mysql2/promise');
const { databaseConfig } = require('../../server/rpg-showdown/database/connection');

describe('RPG MySQL persistence and table isolation', () => {
	it('serializes account mutations between independent database connections', async function () {
		const config = databaseConfig();
		if (!config.user || !config.password || !config.database) this.skip();
		const first = await mysql.createConnection(config); const second = await mysql.createConnection(config);
		const lock = `pokemon-rpg-test-${process.pid}-${Date.now()}`;
		try {
			let [rows] = await first.query('SELECT GET_LOCK(?, 1) AS acquired', [lock]);
			assert.equal(Number(rows[0].acquired), 1);
			[rows] = await second.query('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
			assert.equal(Number(rows[0].acquired), 0);
			await first.query('SELECT RELEASE_LOCK(?)', [lock]);
			[rows] = await second.query('SELECT GET_LOCK(?, 1) AS acquired', [lock]);
			assert.equal(Number(rows[0].acquired), 1);
		} finally {
			await first.query('SELECT RELEASE_LOCK(?)', [lock]);
			await second.query('SELECT RELEASE_LOCK(?)', [lock]);
			await first.end(); await second.end();
		}
	});

	it('keeps equal entity ids in separate tables and rolls the integration fixture back', async function () {
		const config = databaseConfig();
		if (!config.user || !config.password || !config.database) this.skip();
		const connection = await mysql.createConnection(config);
		const suffix = `${process.pid}${Date.now()}`;
		const accountId = `test-account-${suffix}`;
		const tableA = `test-table-a-${suffix}`;
		const tableB = `test-table-b-${suffix}`;
		const battleId = `shared-battle-${suffix}`;
		await connection.beginTransaction();
		try {
			await connection.execute(`INSERT INTO rpg_accounts
				(id, username, display_name, credential, status, created_at, updated_at, revision)
				VALUES (?, ?, 'Teste de isolamento', CAST(? AS JSON), 'active', 0, 0, 0)`,
			[accountId, `test${suffix}`.slice(0, 40), JSON.stringify({ algorithm: 'scrypt', salt: '', hash: '' })]);
			for (const [id, name] of [[tableA, 'Mesa A'], [tableB, 'Mesa B']]) {
				await connection.execute(`INSERT INTO rpg_campaign_tables
					(id, owner_account_id, name, description, color, visibility, status, settings, created_at, updated_at, revision)
					VALUES (?, ?, ?, '', '#355487', 'private', 'active', CAST('{}' AS JSON), 0, 0, 0)`,
				[id, accountId, name]);
				await connection.execute(`INSERT INTO rpg_battle_sessions
					(id, table_id, status, state, updated_at) VALUES (?, ?, 'open', CAST(? AS JSON), 0)`,
				[battleId, id, JSON.stringify({ id: battleId, tableId: id })]);
			}

			const [all] = await connection.execute(
				'SELECT table_id, state FROM rpg_battle_sessions WHERE id = ? ORDER BY table_id', [battleId]);
			assert.equal(all.length, 2);
			assert.equal(new Set(all.map(row => row.table_id)).size, 2);
			for (const tableId of [tableA, tableB]) {
				const [scoped] = await connection.execute(
					'SELECT state FROM rpg_battle_sessions WHERE id = ? AND table_id = ?', [battleId, tableId]);
				assert.equal(scoped.length, 1);
				const state = typeof scoped[0].state === 'string' ? JSON.parse(scoped[0].state) : scoped[0].state;
				assert.equal(state.tableId, tableId);
			}

			const [primaryKey] = await connection.execute(`SELECT COLUMN_NAME
				FROM information_schema.KEY_COLUMN_USAGE
				WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rpg_battle_sessions'
				AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`);
			assert.deepEqual(primaryKey.map(row => row.COLUMN_NAME), ['table_id', 'id']);
		} finally {
			await connection.rollback();
			await connection.end();
		}
	});
});
