'use strict';

const assert = require('assert').strict;
const http = require('node:http');
const { createHash } = require('node:crypto');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const { RPGLoginService } = require('../../dist/server/rpg-showdown');

describe('RPG HTTP frontend API', () => {
	let server;
	let baseUrl;

	before(done => {
		const login = new RPGLoginService({ masterCode: '14081998' });
		const handler = new RPGHttpServer(login);
		server = http.createServer((req, res) => {
			if (!handler.handle(req, res)) {
				res.writeHead(404);
				res.end();
			}
		});
		server.listen(0, '127.0.0.1', () => {
			baseUrl = 'http://127.0.0.1:' + server.address().port;
			done();
		});
	});

	after(done => server.close(done));

	async function request(path, options = {}) {
		const response = await fetch(baseUrl + '/api/rpg' + path, {
			...options,
			headers: {
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				...(options.headers || {}),
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		});
		return { response, data: await response.json() };
	}

	it('connects character creation, player login and session restoration', async () => {
		let result = await request('/characters');
		assert.equal(result.response.status, 200);
		assert.deepEqual(result.data.characters, []);

		result = await request('/characters', {
			method: 'POST',
			body: {
				characterName: 'Samuel',
				playerName: 'Samuel real',
				avatar: 'lucas',
				password: 'senha-rpg',
				initialMoney: 3000,
				starter: { species: 'Squirtle', nickname: 'Tarta', gender: 'M', level: 5 },
			},
		});
		assert.equal(result.response.status, 201);
		assert.equal(result.data.character.id, 'samuel');

		result = await request('/session/player', {
			method: 'POST',
			body: { characterId: 'samuel', password: 'senha-rpg' },
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.session.role, 'player');
		const token = result.data.session.token;

		result = await request('/session', { headers: { Authorization: 'Bearer ' + token } });
		assert.equal(result.response.status, 200);
		assert.equal(result.data.session.characterId, 'samuel');

		result = await request('/character', { headers: { Authorization: 'Bearer ' + token } });
		assert.equal(result.response.status, 200);
		assert.equal(result.data.character.team[0].species, 'Squirtle');
		assert.equal(result.data.character.money, 3000);

		result = await request('/bank', { headers: { Authorization: 'Bearer ' + token } });
		assert.deepEqual(result.data.bank, { version: 1, balance: 0, revision: 0, money: 3000 });
		result = await request('/bank/deposit', {
			method: 'POST', headers: { Authorization: 'Bearer ' + token },
			body: { amount: 500, expectedRevision: 0 },
		});
		assert.deepEqual(result.data.bank, { version: 1, balance: 500, revision: 1, money: 2500 });
		result = await request('/bank/redeem', {
			method: 'POST', headers: { Authorization: 'Bearer ' + token },
			body: { amount: 500, expectedRevision: 1 },
		});
		assert.deepEqual(result.data.bank, { version: 1, balance: 0, revision: 2, money: 3000 });
	});

	it('serves version 2 accounts, persistent sessions, tables, and invitations separately', async () => {
		let result = await request('/v2/accounts', {
			method: 'POST', body: { username: 'mestre-v2', displayName: 'Mestre V2', password: 'senha-segura' },
		});
		assert.equal(result.response.status, 201);
		assert.equal(result.data.account.username, 'mestrev2');
		assert.equal(result.data.account.credential, undefined);
		assert.equal(result.data.recoveryCodes.length, 10);

		await request('/v2/accounts', {
			method: 'POST', body: { username: 'player-v2', displayName: 'Player V2', password: 'senha-segura' },
		});
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'mestre-v2', password: 'senha-segura' },
		});
		assert.equal(result.response.status, 200);
		const masterToken = result.data.session.token;
		const masterHeaders = { Authorization: `Bearer ${masterToken}` };

		result = await request('/v2/tables', {
			method: 'POST', headers: masterHeaders,
			body: { name: 'Mesa V2', description: 'Teste da API', visibility: 'code', color: '#355487' },
		});
		assert.equal(result.response.status, 201);
		const tableId = result.data.table.id;
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: masterHeaders, body: { role: 'player' },
		});
		assert.equal(result.response.status, 201);
		assert.equal(result.data.invite.codeHash, undefined);
		const inviteCode = result.data.code;

		result = await request('/v2/session', {
			method: 'POST', body: { username: 'player-v2', password: 'senha-segura' },
		});
		const playerToken = result.data.session.token;
		const playerHeaders = { Authorization: `Bearer ${playerToken}` };
		result = await request('/v2/invites/join', {
			method: 'POST', headers: playerHeaders, body: { code: inviteCode },
		});
		assert.equal(result.data.membership.role, 'player');
		result = await request(`/v2/tables/${tableId}/select`, { method: 'POST', headers: playerHeaders });
		assert.equal(result.data.session.activeTableId, tableId);
		result = await request('/v2/session', { headers: playerHeaders });
		assert.equal(result.data.account.displayName, 'Player V2');
		assert.equal(result.data.session.activeTableId, tableId);
		result = await request('/v2/tables', { headers: playerHeaders });
		assert.equal(result.data.tables[0].table.name, 'Mesa V2');
		result = await request(`/v2/tables/${tableId}`, { method: 'DELETE', headers: masterHeaders });
		assert.equal(result.response.status, 200);
		assert.equal(result.data.table.status, 'archived');
		result = await request(`/v2/tables/${tableId}/select`, { method: 'POST', headers: playerHeaders });
		assert.equal(result.response.status, 400);
		result = await request('/v2/session', { headers: playerHeaders });
		assert.equal(result.data.session.activeTableId, undefined);

		result = await request('/v2/session', { method: 'DELETE', headers: playerHeaders });
		assert.equal(result.data.ok, true);
		result = await request('/v2/session', { headers: playerHeaders });
		assert.equal(result.response.status, 401);
	});

	it('lists and revokes version 2 sessions without exposing their token hashes', async () => {
		await request('/v2/accounts', {
			method: 'POST', body: { username: 'multissessao', displayName: 'Multissessão', password: 'senha-segura' },
		});
		let result = await request('/v2/session', {
			method: 'POST', body: { username: 'multissessao', password: 'senha-segura' },
		});
		const firstToken = result.data.session.token;
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'multissessao', password: 'senha-segura' },
		});
		const secondToken = result.data.session.token;
		const firstHeaders = { Authorization: `Bearer ${firstToken}` };
		result = await request('/v2/sessions', { headers: firstHeaders });
		assert.equal(result.data.sessions.length, 2);
		assert(result.data.sessions.every(session => session.token === undefined && session.tokenHash === undefined));
		const other = result.data.sessions.find(session => !session.current);
		result = await request(`/v2/sessions/${other.id}`, { method: 'DELETE', headers: firstHeaders });
		assert.equal(result.data.ok, true);
		result = await request('/v2/session', { headers: { Authorization: `Bearer ${secondToken}` } });
		assert.equal(result.response.status, 401);
		result = await request('/v2/sessions', { method: 'DELETE', headers: firstHeaders });
		assert.equal(result.data.revoked, 1);
		result = await request('/v2/session', { headers: firstHeaders });
		assert.equal(result.response.status, 401);
	});

	it('recovers passwords with a one-time code and rate-limits repeated login failures', async () => {
		let result = await request('/v2/accounts', {
			method: 'POST', body: { username: 'seguranca-http', displayName: 'Segurança', password: 'senha-antiga' },
		});
		const recoveryCode = result.data.recoveryCodes[0];
		result = await request('/v2/password/recovery', {
			method: 'POST', body: { username: 'seguranca-http', recoveryCode, newPassword: 'senha-nova-segura' },
		});
		assert.equal(result.response.status, 200);
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'seguranca-http', password: 'senha-nova-segura' },
		});
		assert.equal(result.response.status, 200);
		const securityHeaders = { Authorization: `Bearer ${result.data.session.token}` };
		result = await request('/v2/recovery-codes', {
			method: 'POST', headers: securityHeaders, body: { password: 'senha-nova-segura' },
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.recoveryCodes.length, 10);
		for (let index = 0; index < 5; index++) await request('/v2/session', {
			method: 'POST', body: { username: 'bloqueio-http', password: 'errada-segura' },
		});
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'bloqueio-http', password: 'errada-segura' },
		});
		assert.equal(result.response.status, 429);
	});

	it('administers version 2 members and advanced invitations through protected routes', async () => {
		for (const [username, displayName] of [['adminv2', 'Admin'], ['membrov2', 'Membro'], ['saidav2', 'Saída']]) {
			await request('/v2/accounts', { method: 'POST', body: { username, displayName, password: 'senha-segura' } });
		}
		const login = async username => (await request('/v2/session', {
			method: 'POST', body: { username, password: 'senha-segura' },
		})).data.session;
		const owner = await login('adminv2'); const member = await login('membrov2'); const leaver = await login('saidav2');
		const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
		const memberHeaders = { Authorization: `Bearer ${member.token}` };
		const leaverHeaders = { Authorization: `Bearer ${leaver.token}` };
		let result = await request('/v2/tables', {
			method: 'POST', headers: ownerHeaders, body: { name: 'Membros HTTP' },
		});
		const tableId = result.data.table.id;
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: ownerHeaders,
			body: { role: 'player', targetUsername: 'membrov2', maxUses: 10, expiresAt: Date.now() + 60_000 },
		});
		assert.equal(result.data.invite.maxUses, 1);
		assert.equal(result.data.invite.codeHash, undefined);
		await request('/v2/invites/join', { method: 'POST', headers: memberHeaders, body: { code: result.data.code } });
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: ownerHeaders, body: { maxUses: 2 },
		});
		const reusableCode = result.data.code;
		await request('/v2/invites/join', { method: 'POST', headers: leaverHeaders, body: { code: reusableCode } });
		result = await request(`/v2/tables/${tableId}/members`, { headers: ownerHeaders });
		assert.equal(result.data.members.length, 3);
		assert(result.data.members.every(entry => entry.account.credential === undefined));
		assert.equal(result.data.members.find(entry => entry.account.id === member.accountId)
			.effectivePermissions['battles.participate'], true);
		result = await request(`/v2/tables/${tableId}/permissions`, { headers: memberHeaders });
		assert.equal(result.data.permissions['battles.create'], false);
		assert.equal(result.data.permissions['contests.participate'], true);
		result = await request(`/v2/tables/${tableId}/audit`, { headers: memberHeaders });
		assert.equal(result.response.status, 403);
		result = await request(`/v2/tables/${tableId}/members/${member.accountId}`, {
			method: 'PATCH', headers: ownerHeaders, body: { role: 'master', reason: 'Auxiliar da campanha' },
		});
		assert.equal(result.data.member.role, 'master');
		result = await request(`/v2/tables/${tableId}/membership`, { method: 'DELETE', headers: leaverHeaders });
		assert.equal(result.data.member.status, 'left');
		result = await request(`/v2/tables/${tableId}/invites`, { headers: ownerHeaders });
		const activeInvite = result.data.invites.find(invite => invite.status === 'active');
		result = await request(`/v2/tables/${tableId}/invites/${activeInvite.id}`, {
			method: 'DELETE', headers: ownerHeaders,
		});
		assert.equal(result.data.invite.status, 'revoked');
		result = await request(`/v2/tables/${tableId}/members/${member.accountId}/block`, {
			method: 'POST', headers: ownerHeaders,
		});
		assert.equal(result.data.member.status, 'blocked');
		result = await request(`/v2/tables/${tableId}/audit`, { headers: ownerHeaders });
		assert.equal(result.response.status, 200);
		assert(result.data.entries.some(entry => entry.action === 'member.role.changed'));
		assert(result.data.entries.some(entry => entry.action === 'member.blocked'));
		const roleAudit = result.data.entries.find(entry => entry.action === 'member.role.changed');
		assert.equal(roleAudit.metadata.previousRole, 'player');
		assert.equal(roleAudit.metadata.newRole, 'master');
		assert.equal(roleAudit.metadata.reason, 'Auxiliar da campanha');
		assert.equal(roleAudit.metadata.result, 'success');
		assert.equal(roleAudit.metadata.sessionId,
			createHash('sha256').update(owner.token).digest('hex').slice(0, 24));
		assert.match(roleAudit.metadata.origin, /127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
	});

	it('returns safe HTTP errors and supports the master dashboard', async () => {
		let result = await request('/session/player', {
			method: 'POST',
			body: { characterId: 'samuel', password: 'errada' },
		});
		assert.equal(result.response.status, 401);
		assert.equal(result.data.error, 'Invalid RPG character or password');

		result = await request('/session/master', {
			method: 'POST',
			body: { code: '14081998' },
		});
		assert.equal(result.response.status, 200);
		const token = result.data.session.token;

		result = await request('/characters/all', { headers: { Authorization: 'Bearer ' + token } });
		assert.equal(result.response.status, 200);
		assert.equal(result.data.characters.length, 1);
		assert.equal(result.data.characters[0].credential, undefined);

		result = await request('/battle-reference?moves=tackle,ember,throatchop,solarbeam&items=potion,pokeball', {
			headers: { Authorization: 'Bearer ' + token },
		});
		assert.equal(result.response.status, 200);
		const tackle = result.data.moves.find(move => move.id === 'tackle');
		assert.equal(tackle.category, 'Physical');
		assert.equal(tackle.basePower, 40);
		assert.equal(tackle.accuracy, 100);
		assert.equal(tackle.targetLabel, 'One adjacent Pokémon');
		assert.equal(tackle.description, 'Causa dano ao alvo.');
		assert(tackle.flags.some(flag => flag.id === 'contact'));
		assert(tackle.description.length > 10);
		const ember = result.data.moves.find(move => move.id === 'ember');
		assert.equal(ember.type, 'Fire');
		const burn = ember.effects.find(effect => effect.kind === 'status');
		assert.equal(burn.name, 'Burn');
		assert.equal(burn.chance, 10);
		assert.match(burn.description, /1\/16 do HP máximo/);
		assert.match(burn.description, /golpes físicos/);
		assert.equal(result.data.moves.find(move => move.id === 'throatchop').description,
			'Causa dano e, por 2 turnos, impede o alvo de usar golpes baseados em som.');
		assert.match(result.data.moves.find(move => move.id === 'solarbeam').description, /Carrega energia no primeiro turno/);
		assert.equal(result.data.items.find(item => item.id === 'potion').category, 'healing');
		assert.match(result.data.items.find(item => item.id === 'potion').icon, /^\.\/assets\/item-icons\/potion\.png/);
		assert.equal(result.data.items.find(item => item.id === 'pokeball').category, 'ball');
		assert.equal(result.data.items.find(item => item.id === 'pokeball').icon, null);
	});

	it('configures shared stock through Master routes and lets a Player buy it', async () => {
		let result = await request('/session/master', {
			method: 'POST', body: { code: '14081998' },
		});
		const masterHeaders = { Authorization: 'Bearer ' + result.data.session.token };
		result = await request('/shops/poke-mart-central', { headers: masterHeaders });
		assert.equal(result.response.status, 200);
		result = await request('/shops/poke-mart-central/master-offer', {
			method: 'POST', headers: masterHeaders,
			body: {
				itemId: 'pokeball', stock: 2, buyMode: 'available', buyEnabled: true, buyPrice: 200,
				sellEnabled: true, sellPrice: 50, expectedRevision: result.data.shop.revision,
			},
		});
		assert.equal(result.response.status, 200);
		result = await request('/shops/poke-mart-central/master-bulk', {
			method: 'POST', headers: masterHeaders,
			body: { action: 'reset-prices', expectedRevision: result.data.shop.revision },
		});
		assert.equal(result.response.status, 200);
		assert(result.data.offers.length > 1);
		result = await request('/shops/poke-mart-central/master-bulk', {
			method: 'POST', headers: masterHeaders,
			body: { action: 'increase-stock', expectedRevision: result.data.shop.revision },
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.offers.find(item => item.itemId === 'pokeball').stock, 3);
		result = await request('/shops/poke-mart-central/master-bulk', {
			method: 'POST', headers: masterHeaders,
			body: { action: 'decrease-stock', expectedRevision: result.data.shop.revision },
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.offers.find(item => item.itemId === 'pokeball').stock, 2);
		result = await request('/session/player', {
			method: 'POST', body: { characterId: 'samuel', password: 'senha-rpg' },
		});
		const playerHeaders = { Authorization: 'Bearer ' + result.data.session.token };
		result = await request('/shops/poke-mart-central', { headers: playerHeaders });
		const view = result.data;
		assert.equal(view.offers.find(item => item.itemId === 'pokeball').stock, 2);
		result = await request('/shops/poke-mart-central/trade', {
			method: 'POST', headers: playerHeaders,
			body: {
				actionId: 'http-shop-buy', type: 'buy', lines: [{ itemId: 'pokeball', quantity: 1 }],
				expectedAccountRevision: view.accountRevision, expectedBagRevision: view.bagRevision,
				expectedCatalogRevision: view.shop.revision,
			},
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.view.money, 2800);
		assert.equal(result.data.view.offers.find(item => item.itemId === 'pokeball').stock, 1);
	});

	it('deletes only after the master confirms the server challenge', async () => {
		let result = await request('/session/master', {
			method: 'POST',
			body: { code: '14081998' },
		});
		const token = result.data.session.token;
		const headers = { Authorization: 'Bearer ' + token };

		result = await request('/session/view-as', {
			method: 'POST',
			headers,
			body: { characterId: 'samuel' },
		});
		assert.equal(result.data.session.mode, 'player');

		const first = await request('/character/delete-challenge', { method: 'POST', headers });
		const second = await request('/character/delete-challenge', { method: 'POST', headers });
		assert.equal(first.response.status, 200);
		assert.notEqual(first.data.challenge.word, second.data.challenge.word);

		result = await request('/character', {
			method: 'DELETE',
			headers,
			body: {
				challengeId: second.data.challenge.challengeId,
				confirmation: 'errado',
			},
		});
		assert.equal(result.response.status, 400);

		result = await request('/character', {
			method: 'DELETE',
			headers,
			body: {
				challengeId: second.data.challenge.challengeId,
				confirmation: second.data.challenge.word,
			},
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.result.characterId, 'samuel');
		assert.equal(result.data.result.session.mode, 'master');

		result = await request('/characters');
		assert.deepEqual(result.data.characters, []);
	});

	it('rejects protected requests without a session token', async () => {
		const result = await request('/character');
		assert.equal(result.response.status, 401);
		assert.equal(result.data.error, 'RPG session token required');
	});

	it('uses one global token while keeping each selected table world isolated', async () => {
		const { RPGAccountManagement, RPGMemoryAccountRepository } = require('../../dist/server/rpg-showdown/account-management');
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository());
		accounts.createAccount('dono-multimesa', 'Dono', 'senha-segura');
		accounts.createAccount('player-multimesa', 'Player', 'senha-segura');
		const owner = accounts.login('dono-multimesa', 'senha-segura');
		const player = accounts.login('player-multimesa', 'senha-segura');
		const tableA = accounts.createTable(owner.token, { name: 'Mesa A' });
		const tableB = accounts.createTable(owner.token, { name: 'Mesa B' });
		for (const table of [tableA, tableB]) {
			accounts.joinByInvite(player.token, accounts.createInvite(owner.token, table.id).code);
		}
		const emptySnapshot = tableId => ({
			characters: [], battles: [], contests: [], tournaments: [], combos: [], customItems: [], shops: [],
			masterNPCLibrary: null, playerDocuments: {}, campaign: null, platformAccounts: [], campaignTables: [],
			tableMembers: [], tableInvites: [], accountSessions: [], recoveryCodes: [], loginAttempts: [],
			auditEntries: [], legacyTableId: tableId,
		});
		const persistence = new Proxy({ snapshot: async tableId => emptySnapshot(tableId), flush: async () => {} }, {
			get: (target, property) => property in target ? target[property] : () => {},
		});
		const scopedLogin = new RPGLoginService({
			masterCode: '14081998', accountManagement: accounts, mysqlPersistence: persistence, legacyTableId: tableA.id,
		});
		const scopedHandler = new RPGHttpServer(scopedLogin);
		const scopedServer = http.createServer((req, res) => scopedHandler.handle(req, res));
		await new Promise(resolve => scopedServer.listen(0, '127.0.0.1', resolve));
		const scopedUrl = `http://127.0.0.1:${scopedServer.address().port}/api/rpg`;
		const scopedRequest = async (path, options = {}, token = player.token) => {
			const response = await fetch(scopedUrl + path, {
				...options, headers: { Authorization: `Bearer ${token}`,
					...(options.body ? { 'Content-Type': 'application/json' } : {}) },
				body: options.body ? JSON.stringify(options.body) : undefined,
			});
			return { response, data: await response.json() };
		};
		try {
			accounts.selectTable(player.token, tableB.id);
			let result = await scopedRequest('/characters', { method: 'POST', body: {
				characterName: 'Personagem B', playerName: 'Player', avatar: 'red', password: 'senha-personagem',
				initialMoney: 0, starter: { species: 'Squirtle', nickname: '', gender: 'M', level: 5 },
			} });
			assert.equal(result.response.status, 201, JSON.stringify(result.data));
			accounts.selectTable(player.token, tableA.id);
			result = await scopedRequest('/characters'); assert.deepEqual(result.data.characters, []);
			accounts.selectTable(player.token, tableB.id);
			result = await scopedRequest('/characters');
			assert.deepEqual(result.data.characters.map(character => character.id), ['personagemb']);
			result = await scopedRequest('/characters/all');
			assert.equal(result.response.status, 403);
			accounts.selectTable(owner.token, tableB.id);
			result = await scopedRequest('/characters/all', {}, owner.token);
			assert.equal(result.response.status, 200, JSON.stringify(result.data));
			assert.deepEqual(result.data.characters.map(character => character.id), ['personagemb']);
		} finally {
			await new Promise(resolve => scopedServer.close(resolve));
		}
	});
});
