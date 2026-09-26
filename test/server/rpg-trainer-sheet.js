'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const { databaseConfig } = require('../../server/rpg-showdown/database/connection');
const {
	createRPGLoginServiceFromConfig, createRPGPendingTrainerSheet,
	RPGLoginService, RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');

describe('RPG version 3 trainer sheet persistence', () => {
	it('creates a pending sheet without inventing attributes, class or hit points', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({
			characterName: 'Treinador', playerName: 'Conta', avatar: 'lucas', password: 'senha-rpg',
			initialMoney: 3000, starter: { species: 'Squirtle', gender: 'M' },
		});
		const state = repository.get('treinador').state;
		assert.deepEqual(state.trainerSheet, createRPGPendingTrainerSheet());
		assert.equal(state.trainerSheet.attributes, null);
		assert.equal(state.trainerSheet.hitPoints.maximum, null);
		assert.equal(state.team[0].species, 'Squirtle');
	});

	it('backfills an older character once and preserves the rest of its state', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-trainer-sheet-'));
		const file = path.join(directory, 'characters.json');
		const config = { rpgmastercode: 'teste', rpgcharacterfile: file, rpgseedtestaccount: false };
		try {
			const first = createRPGLoginServiceFromConfig(config);
			first.createCharacter({
				characterName: 'Legado', playerName: 'Conta', avatar: 'lucas', password: 'senha-rpg',
				initialMoney: 4321, starter: { species: 'Bulbasaur', gender: 'M' },
			});
			const data = JSON.parse(fs.readFileSync(file, 'utf8'));
			const previous = structuredClone(data.characters[0].state);
			delete data.characters[0].state.trainerSheet;
			fs.writeFileSync(file, JSON.stringify(data));

			const second = createRPGLoginServiceFromConfig(config);
			const migrated = second.repository.get('legado').state;
			assert.deepEqual(migrated.trainerSheet, createRPGPendingTrainerSheet());
			assert.equal(migrated.money, previous.money);
			assert.deepEqual(migrated.team, previous.team);
			assert.deepEqual(migrated.profile, previous.profile);
			assert.deepEqual(migrated.box, previous.box);

			const customized = second.repository.get('legado');
			customized.state.trainerSheet.resources.focus = { current: 2, maximum: 3 };
			second.repository.set(customized);
			const third = createRPGLoginServiceFromConfig(config);
			assert.deepEqual(third.repository.get('legado').state.trainerSheet.resources.focus,
				{ current: 2, maximum: 3 });
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	it('backfills MySQL JSON without touching existing sheets or other character fields', async function () {
		const config = databaseConfig();
		if (!config.user || !config.password || !config.database) this.skip();
		const connection = await mysql.createConnection(config);
		try {
			await connection.beginTransaction();
			const [characters] = await connection.query('SELECT table_id, id, state FROM rpg_characters LIMIT 1');
			if (!characters.length) this.skip();
			const { table_id: tableId, id } = characters[0];
			const original = typeof characters[0].state === 'string' ?
				JSON.parse(characters[0].state) : characters[0].state;
			const legacy = structuredClone(original);
			delete legacy.trainerSheet;
			await connection.execute('UPDATE rpg_characters SET state = CAST(? AS JSON) WHERE table_id = ? AND id = ?',
				[JSON.stringify(legacy), tableId, id]);
			const sql = fs.readFileSync(path.resolve('server/rpg-showdown/database/migrations/020-trainer-sheet.sql'), 'utf8');
			await connection.query(sql);
			const [rows] = await connection.execute('SELECT state FROM rpg_characters WHERE table_id = ? AND id = ?',
				[tableId, id]);
			const migrated = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
			assert.deepEqual(migrated.trainerSheet, createRPGPendingTrainerSheet());
			delete migrated.trainerSheet;
			assert.deepEqual(migrated, legacy);
			await connection.query(sql);
			const [rerun] = await connection.execute('SELECT state FROM rpg_characters WHERE table_id = ? AND id = ?',
				[tableId, id]);
			const unchanged = typeof rerun[0].state === 'string' ? JSON.parse(rerun[0].state) : rerun[0].state;
			assert.deepEqual(unchanged.trainerSheet, createRPGPendingTrainerSheet());
		} finally {
			await connection.rollback();
			await connection.end();
		}
	});
});
