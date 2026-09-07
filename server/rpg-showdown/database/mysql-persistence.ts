import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import type {
	RPGCampaignTable, RPGPlatformAccount, RPGStoredPlatformSession, RPGTableInvite, RPGTableMember,
} from '../account-management';

const LEGACY_SCOPED_TABLES = new Set([
	'rpg_battle_sessions', 'rpg_contest_sessions', 'rpg_tournaments', 'rpg_contest_combos',
	'rpg_custom_items', 'rpg_shops', 'rpg_player_documents',
]);

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
	platformAccounts: RPGPlatformAccount[];
	campaignTables: RPGCampaignTable[];
	tableMembers: RPGTableMember[];
	tableInvites: RPGTableInvite[];
	accountSessions: RPGStoredPlatformSession[];
	legacyTableId?: string;
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
	private legacyTableId?: string;

	private constructor(private readonly pool: Pool) {}

	static async connect(config: RPGMySQLConfig): Promise<RPGMySQLPersistence> {
		const pool = mysql.createPool({
			...config, charset: 'utf8mb4', timezone: 'Z', waitForConnections: true,
			connectionLimit: 10, queueLimit: 0, enableKeepAlive: true,
		});
		await pool.query('SELECT 1');
		await runRPGMigrations(pool);
		return new RPGMySQLPersistence(pool);
	}

	/** Imports the single-table version 1 world into deterministic version 2 ownership exactly once. */
	async linkLegacyData(masterCode: string): Promise<string | undefined> {
		const legacyTableId = createHash('sha256').update('pokemon-rpg:legacy-table').digest('hex').slice(0, 36);
		const ownerAccountId = createHash('sha256').update('pokemon-rpg:legacy-owner').digest('hex').slice(0, 36);
		const [legacyRows] = await this.pool.query<RowDataPacket[]>(`SELECT
			(SELECT COUNT(*) FROM rpg_characters WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_campaign WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_battle_sessions WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_contest_sessions WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_tournaments WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_contest_combos WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_custom_items WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_shops WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_master_npc_library WHERE table_id IS NULL) +
			(SELECT COUNT(*) FROM rpg_player_documents WHERE table_id IS NULL) AS total`);
		const [existingTable] = await this.pool.query<RowDataPacket[]>(
			'SELECT id FROM rpg_campaign_tables WHERE id = ?', [legacyTableId]
		);
		if (!Number(legacyRows[0]?.total || 0) && !existingTable.length) return undefined;
		const connection = await this.pool.getConnection();
		try {
			await connection.beginTransaction();
			const now = Date.now(); const salt = randomBytes(16);
			const credential = JSON.stringify({
				algorithm: 'scrypt', salt: salt.toString('base64'),
				hash: scryptSync(masterCode, salt, 32).toString('base64'),
			});
			await connection.execute(`INSERT IGNORE INTO rpg_accounts
				(id, username, display_name, credential, status, created_at, updated_at, revision)
				VALUES (?, 'mestre', 'Mestre', CAST(? AS JSON), 'active', ?, ?, 0)`,
			[ownerAccountId, credential, now, now]);
			const [ownerRows] = await connection.query<RowDataPacket[]>('SELECT id FROM rpg_accounts WHERE username = ?', ['mestre']);
			const resolvedOwnerAccountId = String(ownerRows[0].id);
			const [campaignRows] = await connection.query<RowDataPacket[]>('SELECT state FROM rpg_campaign LIMIT 1');
			const campaign = campaignRows[0] ? decoded(campaignRows[0].state) as Record<string, unknown> : {};
			const campaignName = typeof campaign.name === 'string' && campaign.name.trim() ? campaign.name.trim() : 'Campanha importada';
			await connection.execute(`INSERT IGNORE INTO rpg_campaign_tables
				(id, owner_account_id, name, description, color, visibility, status, settings, created_at, updated_at, revision)
				VALUES (?, ?, ?, 'Campanha migrada da versão 1', '#355487', 'private', 'active',
				CAST('{"legacyV1":true}' AS JSON), ?, ?, 0)`, [legacyTableId, resolvedOwnerAccountId, campaignName, now, now]);
			await connection.execute(`INSERT INTO rpg_table_members
				(table_id, account_id, role, status, permissions, joined_at, updated_at, revision)
				VALUES (?, ?, 'owner', 'active', CAST('{}' AS JSON), ?, ?, 0)
				ON DUPLICATE KEY UPDATE role='owner', status='active', updated_at=VALUES(updated_at)`,
			[legacyTableId, resolvedOwnerAccountId, now, now]);

			const [characters] = await connection.query<RowDataPacket[]>(
				'SELECT id, display_name, credential, state FROM rpg_characters WHERE account_id IS NULL OR table_id IS NULL'
			);
			for (const row of characters) {
				const state = decoded(row.state) as Record<string, unknown>;
				const accountId = createHash('sha256').update(`pokemon-rpg:legacy-account:${row.id}`).digest('hex').slice(0, 36);
				const username = String(row.id).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || accountId.slice(0, 12);
				const displayName = String(state.playerName || row.display_name || row.id).slice(0, 80);
				await connection.execute(`INSERT IGNORE INTO rpg_accounts
					(id, username, display_name, credential, status, created_at, updated_at, revision)
					VALUES (?, ?, ?, CAST(? AS JSON), 'active', ?, ?, 0)`,
				[accountId, username, displayName, JSON.stringify(decoded(row.credential)), now, now]);
				const [accountRows] = await connection.query<RowDataPacket[]>('SELECT id FROM rpg_accounts WHERE username = ?', [username]);
				const resolvedAccountId = String(accountRows[0].id);
				await connection.execute(`INSERT INTO rpg_table_members
					(table_id, account_id, role, status, permissions, joined_at, updated_at, revision)
					VALUES (?, ?, 'player', 'active', CAST('{}' AS JSON), ?, ?, 0)
					ON DUPLICATE KEY UPDATE status='active', updated_at=VALUES(updated_at)`,
				[legacyTableId, resolvedAccountId, now, now]);
				await connection.execute('UPDATE rpg_characters SET account_id = ?, table_id = ? WHERE id = ?',
					[resolvedAccountId, legacyTableId, row.id]);
			}
			for (const table of [
				'rpg_battle_sessions', 'rpg_contest_sessions', 'rpg_tournaments', 'rpg_contest_combos',
				'rpg_custom_items', 'rpg_shops', 'rpg_master_npc_library', 'rpg_player_documents', 'rpg_campaign',
			]) await connection.query(`UPDATE ${table} SET table_id = ? WHERE table_id IS NULL`, [legacyTableId]);
			await connection.commit(); this.legacyTableId = legacyTableId; return legacyTableId;
		} catch (error) {
			await connection.rollback(); throw error;
		} finally {
			connection.release();
		}
	}

	async snapshot(): Promise<RPGMySQLSnapshot> {
		const rows = async (table: string, column: string, scoped = false) => {
			const where = scoped && this.legacyTableId ? ' WHERE table_id = ?' : '';
			const values = where ? [this.legacyTableId] : [];
			const [result] = await this.pool.query<RowDataPacket[]>(`SELECT ${column} AS value FROM ${table}${where}`, values);
			return result.map(row => decoded(row.value));
		};
		const [characters, battles, contests, tournaments, combos, customItems, shops,
			masterNPC, documents, campaign, accountRows, tableRows, memberRows, inviteRows, sessionRows] = await Promise.all([
			rows('rpg_characters', "JSON_OBJECT('credential', credential, 'state', state, 'accountId', account_id, 'tableId', table_id)", true),
			rows('rpg_battle_sessions', 'state', true), rows('rpg_contest_sessions', 'state', true),
			rows('rpg_tournaments', 'state', true), rows('rpg_contest_combos', 'definition', true),
			rows('rpg_custom_items', 'definition', true), rows('rpg_shops', 'state', true),
			rows('rpg_master_npc_library', 'state', true),
			this.pool.query<RowDataPacket[]>(`SELECT character_id, state FROM rpg_player_documents${
				this.legacyTableId ? ' WHERE table_id = ?' : ''}`, this.legacyTableId ? [this.legacyTableId] : []),
			rows('rpg_campaign', 'state', true),
			this.pool.query<RowDataPacket[]>('SELECT * FROM rpg_accounts'),
			this.pool.query<RowDataPacket[]>('SELECT * FROM rpg_campaign_tables'),
			this.pool.query<RowDataPacket[]>('SELECT * FROM rpg_table_members'),
			this.pool.query<RowDataPacket[]>('SELECT * FROM rpg_table_invites'),
			this.pool.query<RowDataPacket[]>('SELECT * FROM rpg_account_sessions'),
		]);
		return {
			characters, battles, contests, tournaments, combos, customItems, shops,
			masterNPCLibrary: masterNPC[0] as Record<string, unknown> | undefined || null,
			playerDocuments: Object.fromEntries(documents[0].map(row =>
				[String(row.character_id), decoded(row.state) as Record<string, unknown>])),
			campaign: campaign[0] as Record<string, unknown> | undefined || null,
			platformAccounts: accountRows[0].map(row => ({
				id: String(row.id), username: String(row.username), displayName: String(row.display_name),
				credential: decoded(row.credential) as RPGPlatformAccount['credential'], status: row.status,
				createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), revision: Number(row.revision),
			})),
			campaignTables: tableRows[0].map(row => ({
				id: String(row.id), ownerAccountId: String(row.owner_account_id), name: String(row.name),
				description: String(row.description), color: String(row.color), visibility: row.visibility, status: row.status,
				settings: decoded(row.settings) as Record<string, unknown>, createdAt: Number(row.created_at),
				updatedAt: Number(row.updated_at), revision: Number(row.revision),
			})),
			tableMembers: memberRows[0].map(row => ({
				tableId: String(row.table_id), accountId: String(row.account_id), role: row.role, status: row.status,
				permissions: decoded(row.permissions) as Record<string, boolean>, joinedAt: Number(row.joined_at),
				updatedAt: Number(row.updated_at), revision: Number(row.revision),
			})),
			tableInvites: inviteRows[0].map(row => ({
				id: String(row.id), tableId: String(row.table_id), createdByAccountId: String(row.created_by_account_id),
				targetAccountId: row.target_account_id ? String(row.target_account_id) : undefined,
				codeHash: String(row.code_hash), role: row.role, status: row.status, maxUses: Number(row.max_uses),
				usedCount: Number(row.used_count), expiresAt: row.expires_at === null ? undefined : Number(row.expires_at),
				createdAt: Number(row.created_at),
			})),
			accountSessions: sessionRows[0].map(row => ({
				tokenHash: String(row.token_hash), accountId: String(row.account_id),
				activeTableId: row.active_table_id ? String(row.active_table_id) : undefined,
				createdAt: Number(row.created_at), lastSeenAt: Number(row.last_seen_at), expiresAt: Number(row.expires_at),
				revokedAt: row.revoked_at === null ? undefined : Number(row.revoked_at),
			})),
			legacyTableId: this.legacyTableId,
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
		this.enqueue(`INSERT INTO rpg_characters (id, account_id, table_id, display_name, credential, state, created_at, updated_at, revision)
			VALUES (?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?)
			ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), credential=VALUES(credential), state=VALUES(state),
			account_id=VALUES(account_id), table_id=VALUES(table_id), created_at=VALUES(created_at),
			updated_at=VALUES(updated_at), revision=VALUES(revision)`, [
			record.state.id, record.accountId, record.tableId || this.legacyTableId,
			record.state.characterName || record.state.playerName || record.state.id,
			JSON.stringify(record.credential), JSON.stringify(record.state), record.state.createdAt || Date.now(),
			record.state.updatedAt || Date.now(), record.state.revision || 0,
		]);
	}
	deleteCharacter(id: string): void { this.enqueue('DELETE FROM rpg_characters WHERE id = ?', [id]); }
	upsertJSON(table: string, idColumn: string, id: string, jsonColumn: string, value: any, extras: Record<string, unknown> = {}): void {
		if (this.legacyTableId && LEGACY_SCOPED_TABLES.has(table) && extras.table_id === undefined) {
			extras = { ...extras, table_id: this.legacyTableId };
		}
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
	upsertPlatformAccount(account: RPGPlatformAccount): void {
		this.enqueue(`INSERT INTO rpg_accounts
			(id, username, display_name, credential, status, created_at, updated_at, revision)
			VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE username=VALUES(username), display_name=VALUES(display_name),
			credential=VALUES(credential), status=VALUES(status), updated_at=VALUES(updated_at), revision=VALUES(revision)`, [
			account.id, account.username, account.displayName, JSON.stringify(account.credential), account.status,
			account.createdAt, account.updatedAt, account.revision,
		]);
	}
	upsertCampaignTable(table: RPGCampaignTable): void {
		this.enqueue(`INSERT INTO rpg_campaign_tables
			(id, owner_account_id, name, description, color, visibility, status, settings, created_at, updated_at, revision)
			VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
			ON DUPLICATE KEY UPDATE owner_account_id=VALUES(owner_account_id), name=VALUES(name),
			description=VALUES(description), color=VALUES(color), visibility=VALUES(visibility), status=VALUES(status),
			settings=VALUES(settings), updated_at=VALUES(updated_at), revision=VALUES(revision)`, [
			table.id, table.ownerAccountId, table.name, table.description, table.color, table.visibility, table.status,
			JSON.stringify(table.settings), table.createdAt, table.updatedAt, table.revision,
		]);
	}
	upsertTableMember(member: RPGTableMember): void {
		this.enqueue(`INSERT INTO rpg_table_members
			(table_id, account_id, role, status, permissions, joined_at, updated_at, revision)
			VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
			ON DUPLICATE KEY UPDATE role=VALUES(role), status=VALUES(status), permissions=VALUES(permissions),
			updated_at=VALUES(updated_at), revision=VALUES(revision)`, [
			member.tableId, member.accountId, member.role, member.status, JSON.stringify(member.permissions),
			member.joinedAt, member.updatedAt, member.revision,
		]);
	}
	upsertTableInvite(invite: RPGTableInvite): void {
		this.enqueue(`INSERT INTO rpg_table_invites
			(id, table_id, created_by_account_id, target_account_id, code_hash, role, status, max_uses, used_count, expires_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE target_account_id=VALUES(target_account_id), role=VALUES(role), status=VALUES(status),
			max_uses=VALUES(max_uses), used_count=VALUES(used_count), expires_at=VALUES(expires_at)`, [
			invite.id, invite.tableId, invite.createdByAccountId, invite.targetAccountId, invite.codeHash, invite.role,
			invite.status, invite.maxUses, invite.usedCount, invite.expiresAt, invite.createdAt,
		]);
	}
	upsertPlatformSession(session: RPGStoredPlatformSession): void {
		this.enqueue(`INSERT INTO rpg_account_sessions
			(token_hash, account_id, active_table_id, created_at, last_seen_at, expires_at, revoked_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE active_table_id=VALUES(active_table_id), last_seen_at=VALUES(last_seen_at),
			expires_at=VALUES(expires_at), revoked_at=VALUES(revoked_at)`, [
			session.tokenHash, session.accountId, session.activeTableId, session.createdAt,
			session.lastSeenAt, session.expiresAt, session.revokedAt,
		]);
	}
	deletePlatformSession(tokenHash: string): void {
		this.enqueue('DELETE FROM rpg_account_sessions WHERE token_hash = ?', [tokenHash]);
	}
	upsertSingleton(table: string, value: unknown): void {
		this.enqueue(`INSERT INTO ${table} (singleton_id, table_id, state) VALUES (1, ?, CAST(? AS JSON))
			ON DUPLICATE KEY UPDATE table_id=VALUES(table_id), state=VALUES(state)`, [this.legacyTableId, JSON.stringify(value)]);
	}
	async flush(): Promise<void> {
		await this.pending;
		if (this.failure) { const failure = this.failure; this.failure = null; throw failure; }
	}
	async close(): Promise<void> { await this.flush(); await this.pool.end(); }
}

/** Applies every pending numbered migration before repositories read their snapshots. */
async function runRPGMigrations(pool: Pool): Promise<void> {
	const directory = resolve('server/rpg-showdown/database/migrations');
	if (!existsSync(directory)) return;
	await pool.query(`CREATE TABLE IF NOT EXISTS rpg_schema_migrations (
		version INT UNSIGNED NOT NULL, name VARCHAR(160) NOT NULL,
		applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (version)
	) ENGINE=InnoDB`);
	const files = readdirSync(directory).filter(file => /^\d+[-_].+\.sql$/i.test(file)).sort();
	for (const file of files) {
		const version = Number(/^\d+/.exec(file)![0]);
		const [existing] = await pool.query<RowDataPacket[]>(
			'SELECT version FROM rpg_schema_migrations WHERE version = ?', [version]
		);
		if (existing.length) continue;
		const statements = readFileSync(resolve(directory, file), 'utf8')
			.split(';').map(statement => statement.trim()).filter(Boolean);
		const connection = await pool.getConnection();
		try {
			await connection.beginTransaction();
			for (const statement of statements) await connection.query(statement);
			await connection.execute(
				'INSERT INTO rpg_schema_migrations (version, name) VALUES (?, ?)',
				[version, file.replace(/^\d+[-_]|\.sql$/gi, '').replace(/[-_]+/g, ' ')]
			);
			await connection.commit();
		} catch (error) {
			await connection.rollback();
			throw error;
		} finally {
			connection.release();
		}
	}
}
