import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';

export interface RPGMySQLConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
}

export interface RPGMySQLSnapshot {
	characters: unknown[];
	battles: unknown[];
	contests: unknown[];
	tournaments: unknown[];
	combos: unknown[];
	customItems: unknown[];
	shops: unknown[];
	masterNPCLibrary: Record<string, unknown> | null;
	playerDocuments: Record<string, Record<string, unknown>>;
	campaign: Record<string, unknown> | null;
}

function environmentFile(file = resolve('.env.mysql')): Record<string, string> {
	if (!existsSync(file)) return {};
	return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
		const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
		return match ? [[match[1], match[2]]] : [];
	}));
}

export function rpgMySQLConfig(): RPGMySQLConfig | null {
	const file = environmentFile();
	const value = (name: string) => process.env[`RPG_MYSQL_${name}`] || file[`MYSQL_${name}`];
	if (!value('USER') || !value('PASSWORD') || !value('DATABASE')) return null;
	return {
		host: value('HOST') || '127.0.0.1', port: Number(value('PORT') || 3306),
		user: value('USER')!, password: value('PASSWORD')!, database: value('DATABASE')!,
	};
}

function decoded(value: unknown): unknown {
	if (typeof value === 'string') return JSON.parse(value);
	return structuredClone(value);
}

export class RPGMySQLPersistence {
	private pending: Promise<void> = Promise.resolve();
	private failure: Error | null = null;

	private constructor(private readonly pool: Pool) {}

	static async connect(config: RPGMySQLConfig): Promise<RPGMySQLPersistence> {
		const pool = mysql.createPool({
			...config, charset: 'utf8mb4', timezone: 'Z', waitForConnections: true,
			connectionLimit: 10, queueLimit: 0, enableKeepAlive: true,
		});
		await pool.query('SELECT 1');
		return new RPGMySQLPersistence(pool);
	}

	async snapshot(): Promise<RPGMySQLSnapshot> {
		const rows = async (table: string, column: string) => {
			const [result] = await this.pool.query<RowDataPacket[]>(`SELECT ${column} AS value FROM ${table}`);
			return result.map(row => decoded(row.value));
		};
		const [characters, battles, contests, tournaments, combos, customItems, shops,
			masterNPC, documents, campaign] = await Promise.all([
			rows('rpg_characters', "JSON_OBJECT('credential', credential, 'state', state)"),
			rows('rpg_battle_sessions', 'state'), rows('rpg_contest_sessions', 'state'),
			rows('rpg_tournaments', 'state'), rows('rpg_contest_combos', 'definition'),
			rows('rpg_custom_items', 'definition'), rows('rpg_shops', 'state'),
			rows('rpg_master_npc_library', 'state'),
			this.pool.query<RowDataPacket[]>('SELECT character_id, state FROM rpg_player_documents'),
			rows('rpg_campaign', 'state'),
		]);
		return {
			characters, battles, contests, tournaments, combos, customItems, shops,
			masterNPCLibrary: masterNPC[0] as Record<string, unknown> | undefined || null,
			playerDocuments: Object.fromEntries(documents[0].map(row =>
				[String(row.character_id), decoded(row.state) as Record<string, unknown>])),
			campaign: campaign[0] as Record<string, unknown> | undefined || null,
		};
	}

	enqueue(sql: string, values: unknown[]): void {
		this.pending = this.pending.then(async () => {
			await this.pool.execute(sql, values.map(value => value === undefined ? null : value) as any[]);
		}).catch(error => {
			this.failure = error instanceof Error ? error : new Error(String(error));
		});
	}

	upsertCharacter(record: any): void {
		this.enqueue(`INSERT INTO rpg_characters (id, display_name, credential, state, created_at, updated_at, revision)
			VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?)
			ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), credential=VALUES(credential), state=VALUES(state),
			created_at=VALUES(created_at), updated_at=VALUES(updated_at), revision=VALUES(revision)`, [
			record.state.id, record.state.characterName || record.state.playerName || record.state.id,
			JSON.stringify(record.credential), JSON.stringify(record.state), record.state.createdAt || Date.now(),
			record.state.updatedAt || Date.now(), record.state.revision || 0,
		]);
	}
	deleteCharacter(id: string): void { this.enqueue('DELETE FROM rpg_characters WHERE id = ?', [id]); }
	upsertJSON(table: string, idColumn: string, id: string, jsonColumn: string, value: any, extras: Record<string, unknown> = {}): void {
		const columns = [idColumn, ...Object.keys(extras), jsonColumn];
		const values = [id, ...Object.values(extras), JSON.stringify(value)];
		const placeholders = columns.map((column, index) => index === columns.length - 1 ? 'CAST(? AS JSON)' : '?');
		const updates = columns.slice(1).map(column => `${column}=VALUES(${column})`);
		this.enqueue(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
			ON DUPLICATE KEY UPDATE ${updates.join(', ')}`, values);
	}
	delete(table: string, idColumn: string, id: string): void {
		this.enqueue(`DELETE FROM ${table} WHERE ${idColumn} = ?`, [id]);
	}
	upsertSingleton(table: string, value: unknown): void {
		this.enqueue(`INSERT INTO ${table} (singleton_id, state) VALUES (1, CAST(? AS JSON))
			ON DUPLICATE KEY UPDATE state=VALUES(state)`, [JSON.stringify(value)]);
	}
	async flush(): Promise<void> {
		await this.pending;
		if (this.failure) { const failure = this.failure; this.failure = null; throw failure; }
	}
	async close(): Promise<void> { await this.flush(); await this.pool.end(); }
}
