'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createPool } = require('./connection');

const root = path.resolve(__dirname, '../../..');
const read = filename => {
	const file = path.join(root, 'config', filename);
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const json = value => JSON.stringify(value);
const LEGACY_JSON_IMPORT_VERSION = 1000;

async function importRows(connection, sql, rows) {
	for (const row of rows) await connection.execute(sql, row);
	return rows.length;
}

async function run() {
	const pool = createPool();
	const connection = await pool.getConnection();
	const counts = {};
	try {
		const [migrationRows] = await connection.execute(
			'SELECT version FROM rpg_schema_migrations WHERE version = ?',
			[LEGACY_JSON_IMPORT_VERSION]
		);
		if (migrationRows.length && !process.argv.includes('--force')) {
			console.log('Importação ignorada: os arquivos JSON já foram migrados para o MySQL.');
			return;
		}
		await connection.beginTransaction();
		const characters = read('rpg-characters.json')?.characters || [];
		counts.characters = await importRows(connection,
			`INSERT INTO rpg_characters
			 (id, display_name, credential, state, created_at, updated_at, revision)
			 VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?)
			 ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), credential=VALUES(credential),
			 state=VALUES(state), created_at=VALUES(created_at), updated_at=VALUES(updated_at), revision=VALUES(revision)`,
			characters.map(record => [record.state.id, record.state.characterName || record.state.playerName || record.state.id,
				json(record.credential), json(record.state),
				record.state.createdAt || Date.now(), record.state.updatedAt || Date.now(), record.state.revision || 0]));

		const battles = read('rpg-battle-sessions.json')?.sessions || [];
		counts.battles = await importRows(connection,
			`INSERT INTO rpg_battle_sessions (id, status, state, updated_at) VALUES (?, ?, CAST(? AS JSON), ?)
			 ON DUPLICATE KEY UPDATE status=VALUES(status), state=VALUES(state), updated_at=VALUES(updated_at)`,
			battles.map(state => [state.id, state.status, json(state), state.updatedAt || Date.now()]));

		const contests = read('rpg-contest-sessions.json')?.sessions || [];
		counts.contests = await importRows(connection,
			`INSERT INTO rpg_contest_sessions (id, status, state, updated_at) VALUES (?, ?, CAST(? AS JSON), ?)
			 ON DUPLICATE KEY UPDATE status=VALUES(status), state=VALUES(state), updated_at=VALUES(updated_at)`,
			contests.map(state => [state.id, state.status, json(state), state.updatedAt || Date.now()]));

		const tournaments = read('rpg-tournaments.json')?.tournaments || [];
		counts.tournaments = await importRows(connection,
			`INSERT INTO rpg_tournaments (id, activity, status, state, updated_at) VALUES (?, ?, ?, CAST(? AS JSON), ?)
			 ON DUPLICATE KEY UPDATE activity=VALUES(activity), status=VALUES(status), state=VALUES(state), updated_at=VALUES(updated_at)`,
			tournaments.map(state => [state.id, state.activity, state.status, json(state), state.updatedAt || Date.now()]));

		const combos = read('rpg-contest-combos.json')?.combos || [];
		counts.combos = await importRows(connection,
			`INSERT INTO rpg_contest_combos (id, definition) VALUES (?, CAST(? AS JSON))
			 ON DUPLICATE KEY UPDATE definition=VALUES(definition)`, combos.map(value => [value.id, json(value)]));

		const items = read('rpg-custom-items.json')?.items || [];
		counts.customItems = await importRows(connection,
			`INSERT INTO rpg_custom_items (id, definition) VALUES (?, CAST(? AS JSON))
			 ON DUPLICATE KEY UPDATE definition=VALUES(definition)`, items.map(value => [value.id, json(value)]));

		const shops = read('rpg-shops.json')?.shops || [];
		counts.shops = await importRows(connection,
			`INSERT INTO rpg_shops (id, shop_type, state, revision) VALUES (?, ?, CAST(? AS JSON), ?)
			 ON DUPLICATE KEY UPDATE shop_type=VALUES(shop_type), state=VALUES(state), revision=VALUES(revision)`,
			shops.map(value => [value.id, value.type, json(value), value.revision || 0]));

		const npcLibrary = read('rpg-master-npc-library.json');
		if (npcLibrary) {
			await connection.execute(`INSERT INTO rpg_master_npc_library (singleton_id, state) VALUES (1, CAST(? AS JSON))
				ON DUPLICATE KEY UPDATE state=VALUES(state)`, [json(npcLibrary)]);
		}
		counts.masterNPCLibrary = npcLibrary ? 1 : 0;

		const documents = read('rpg-player-documents.json') || {};
		counts.playerDocuments = await importRows(connection,
			`INSERT INTO rpg_player_documents (character_id, state) VALUES (?, CAST(? AS JSON))
			 ON DUPLICATE KEY UPDATE state=VALUES(state)`, Object.entries(documents).map(([id, value]) => [id, json(value)]));

		const campaign = read('rpg-campaign-settings.json');
		if (campaign) {
			await connection.execute(`INSERT INTO rpg_campaign (singleton_id, state) VALUES (1, CAST(? AS JSON))
				ON DUPLICATE KEY UPDATE state=VALUES(state)`, [json(campaign)]);
		}
		counts.campaign = campaign ? 1 : 0;
		await connection.execute(
			`INSERT INTO rpg_schema_migrations (version, name) VALUES (?, ?)
			 ON DUPLICATE KEY UPDATE name=VALUES(name)`,
			[LEGACY_JSON_IMPORT_VERSION, 'Importação inicial da persistência JSON']
		);
		await connection.commit();
		console.log('Importação MySQL concluída:', counts);
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
		await pool.end();
	}
}

run().catch(error => {
	console.error('Falha ao importar a persistência do RPG:', error);
	process.exitCode = 1;
});
