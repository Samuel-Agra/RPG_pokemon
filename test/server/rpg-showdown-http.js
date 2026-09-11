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

	it('does not acknowledge an HTTP response before persistence succeeds', async () => {
		const login = new RPGLoginService({
			masterCode: '14081998', mysqlPersistence: {
				flush: async () => { throw new Error('SQL secreto e dados internos'); },
			},
		});
		const handler = new RPGHttpServer(login);
		const node = http.createServer((req, res) => handler.handle(req, res));
		await new Promise(resolve => node.listen(0, '127.0.0.1', resolve));
		try {
			const response = await fetch(`http://127.0.0.1:${node.address().port}/api/rpg/characters`);
			assert.equal(response.status, 503);
			assert.deepEqual(await response.json(), { error: 'Não foi possível salvar os dados. Tente novamente.' });
		} finally {
			await new Promise(resolve => node.close(resolve));
		}
	});

	it('hides unexpected implementation errors and audits only administrative mutations', async () => {
		const login = new RPGLoginService({ masterCode: '14081998' });
		login.flushPersistence = async () => { throw new Error('O segredo interno não pode aparecer'); };
		const handler = new RPGHttpServer(login);
		assert.equal(handler.isAdministrativeRPGMutation('POST', '/api/rpg/battle-sessions/id/action'), false);
		assert.equal(handler.isAdministrativeRPGMutation('POST', '/api/rpg/contest-sessions/id/runtime-ready'), false);
		assert.equal(handler.isAdministrativeRPGMutation('PUT', '/api/rpg/campaign/settings'), true);
		assert.equal(handler.isPublicValidationError('nome de exibição inválido'), true);
		assert.equal(handler.isPublicValidationError('Cor da mesa inválida'), true);
		assert.equal(handler.isPublicValidationError('O segredo interno não pode aparecer'), false);
		assert.equal(handler.isPublicValidationError('RPG table scope is not initialized'), false);
		assert.equal(handler.isPersistenceError({ code: 'ERR_INVALID_ARG_TYPE' }), false);
		assert.equal(handler.isPersistenceError({ code: 'ER_LOCK_DEADLOCK' }), true);
		const node = http.createServer((req, res) => handler.handle(req, res));
		await new Promise(resolve => node.listen(0, '127.0.0.1', resolve));
		try {
			const response = await fetch(`http://127.0.0.1:${node.address().port}/api/rpg/characters`);
			assert.equal(response.status, 500);
			assert.deepEqual(await response.json(), { error: 'Ocorreu uma falha interna. Tente novamente.' });
		} finally {
			await new Promise(resolve => node.close(resolve));
		}
	});

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
			method: 'POST', body: { username: 'mestre-v2', displayName: 'Mestre V2', password: 'Senha1!Segura' },
		});
		assert.equal(result.response.status, 201);
		assert.equal(result.data.account.username, 'mestrev2');
		assert.equal(result.data.account.credential, undefined);
		assert.equal(result.data.recoveryCodes.length, 10);

		await request('/v2/accounts', {
			method: 'POST', body: { username: 'player-v2', displayName: 'Player V2', password: 'Senha1!Segura' },
		});
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'mestre-v2', password: 'Senha1!Segura' },
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
		assert.equal(result.data.table.settings.requireJoinApproval, true);
		await request(`/v2/tables/${tableId}`, {
			method: 'PATCH', headers: masterHeaders, body: { requireJoinApproval: false },
		});
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: masterHeaders, body: { role: 'player' },
		});
		assert.equal(result.response.status, 201);
		assert.equal(result.data.invite.codeHash, undefined);
		const inviteCode = result.data.code;

		result = await request('/v2/session', {
			method: 'POST', body: { username: 'player-v2', password: 'Senha1!Segura' },
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
		assert.equal(result.data.session.role, 'player');
		assert.equal(result.data.session.membershipId, `${tableId}:${result.data.account.id}`);
		result = await request('/v2/tables/deselect', { method: 'POST', headers: playerHeaders });
		assert.equal(result.data.session.activeTableId, undefined);
		result = await request(`/v2/tables/${tableId}/select`, { method: 'POST', headers: playerHeaders });
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
			method: 'POST', body: { username: 'multissessao', displayName: 'Multissessão', password: 'Senha1!Segura' },
		});
		let result = await request('/v2/session', {
			method: 'POST', body: { username: 'multissessao', password: 'Senha1!Segura' },
		});
		const firstToken = result.data.session.token;
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'multissessao', password: 'Senha1!Segura' },
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
			method: 'POST', body: { username: 'seguranca-http', displayName: 'Segurança', password: 'Antiga1!Senha' },
		});
		const recoveryCode = result.data.recoveryCodes[0];
		result = await request('/v2/password/recovery', {
			method: 'POST', body: { username: 'seguranca-http', recoveryCode, newPassword: 'Nova1!SenhaSegura' },
		});
		assert.equal(result.response.status, 200);
		result = await request('/v2/session', {
			method: 'POST', body: { username: 'seguranca-http', password: 'Nova1!SenhaSegura' },
		});
		assert.equal(result.response.status, 200);
		const securityHeaders = { Authorization: `Bearer ${result.data.session.token}` };
		result = await request('/v2/password', {
			method: 'PUT', headers: securityHeaders,
			body: { currentPassword: 'Nova1!SenhaSegura', newPassword: 'Final1!SenhaSegura' },
		});
		assert.equal(result.response.status, 200);
		result = await request('/v2/recovery-codes', {
			method: 'POST', headers: securityHeaders, body: { password: 'Final1!SenhaSegura' },
		});
		assert.equal(result.response.status, 200);
		assert.equal(result.data.recoveryCodes.length, 10);
		for (let index = 0; index < 5; index++) {
			result = await request('/v2/password/recovery', {
				method: 'POST', body: {
					username: 'seguranca-http', recoveryCode: '0000-0000-0000', newPassword: 'Outra1!SenhaSegura',
				},
			});
			assert.equal(result.response.status, 400);
		}
		result = await request('/v2/password/recovery', {
			method: 'POST', body: {
				username: 'seguranca-http', recoveryCode: result.data.recoveryCodes?.[0] || '1111-1111-1111',
				newPassword: 'Outra1!SenhaSegura',
			},
		});
		assert.equal(result.response.status, 429);
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
			await request('/v2/accounts', { method: 'POST', body: { username, displayName, password: 'Senha1!Segura' } });
		}
		const login = async username => (await request('/v2/session', {
			method: 'POST', body: { username, password: 'Senha1!Segura' },
		})).data.session;
		const owner = await login('adminv2'); const member = await login('membrov2'); const leaver = await login('saidav2');
		const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
		const memberHeaders = { Authorization: `Bearer ${member.token}` };
		const leaverHeaders = { Authorization: `Bearer ${leaver.token}` };
		let result = await request('/v2/tables', {
			method: 'POST', headers: ownerHeaders, body: { name: 'Membros HTTP' },
		});
		const tableId = result.data.table.id;
		await request(`/v2/tables/${tableId}`, {
			method: 'PATCH', headers: ownerHeaders, body: { requireJoinApproval: false },
		});
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: ownerHeaders,
			body: { role: 'player', targetUsername: 'membrov2', maxUses: 10, expiresAt: Date.now() + 60_000 },
		});
		assert.equal(result.data.invite.maxUses, 1);
		assert.equal(result.data.invite.codeHash, undefined);
		assert.equal(result.data.code, undefined);
		await request(`/v2/invites/directed/${result.data.invite.id}`, { method: 'POST', headers: memberHeaders });
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: memberHeaders, body: { role: 'player' },
		});
		assert.equal(result.response.status, 403);
		result = await request(`/v2/tables/${tableId}/invites`, {
			method: 'POST', headers: ownerHeaders, body: { maxUses: 0 },
		});
		assert.equal(result.response.status, 400);
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
		assert(result.data.entries.some(entry => entry.action === 'audit.viewed' &&
			entry.actorAccountId === member.accountId && entry.metadata.result === 'denied'));
		const deniedAudit = result.data.entries.find(entry =>
			entry.action === 'invite.created' && entry.actorAccountId === member.accountId && entry.metadata.result === 'denied');
		assert(deniedAudit);
		assert.equal(deniedAudit.metadata.failureType, 'authorization');
		const failedAudit = result.data.entries.find(entry =>
			entry.action === 'invite.created' && entry.actorAccountId === owner.accountId && entry.metadata.result === 'failure');
		assert(failedAudit);
		assert.equal(failedAudit.metadata.failureType, 'validation');
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
		accounts.createAccount('dono-multimesa', 'Dono', 'Senha1!Segura');
		accounts.createAccount('player-multimesa', 'Player', 'Senha1!Segura');
		accounts.createAccount('destino-multimesa', 'Destino', 'Senha1!Segura');
		const owner = accounts.login('dono-multimesa', 'Senha1!Segura');
		const player = accounts.login('player-multimesa', 'Senha1!Segura');
		const target = accounts.login('destino-multimesa', 'Senha1!Segura');
		const tableA = accounts.createTable(owner.token, { name: 'Mesa A' });
		const tableB = accounts.createTable(owner.token, { name: 'Mesa B' });
		for (const table of [tableA, tableB]) {
			accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
			accounts.joinByInvite(player.token, accounts.createInvite(owner.token, table.id).code);
		}
		accounts.joinByInvite(target.token, accounts.createInvite(owner.token, tableB.id).code);
		const emptySnapshot = tableId => ({
			characters: [], battles: [], contests: [], tournaments: [], combos: [], customItems: [], shops: [],
			masterNPCLibrary: null, playerDocuments: {}, campaign: null, platformAccounts: [], campaignTables: [],
			tableMembers: [], tableInvites: [], accountSessions: [], recoveryCodes: [], loginAttempts: [],
			auditEntries: [], legacyTableId: tableId,
		});
		const persistence = new Proxy({
			snapshot: async tableId => emptySnapshot(tableId), flush: async () => {}, transaction: action => action(),
		}, {
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
			let sessionResult = await scopedRequest('/session');
			assert.equal(sessionResult.response.status, 200, JSON.stringify(sessionResult.data));
			assert.equal(sessionResult.data.session.characterId, undefined);
			let result = await scopedRequest('/characters', { method: 'POST', body: {
				characterName: 'Personagem B', playerName: 'Player', avatar: 'red',
				initialMoney: 0, starter: { species: 'Squirtle', nickname: '', gender: 'M', level: 5 },
			} });
			assert.equal(result.response.status, 201, JSON.stringify(result.data));
			sessionResult = await scopedRequest('/session');
			assert.equal(sessionResult.data.session.characterId, 'personagemb');
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
			result = await scopedRequest('/characters/personagemb/owner', {
				method: 'PUT', body: { accountId: target.accountId },
			}, owner.token);
			assert.equal(result.response.status, 200, JSON.stringify(result.data));
			result = await scopedRequest('/character');
			assert.notEqual(result.response.status, 200);
			accounts.removeMember(owner.token, tableB.id, player.accountId);
			accounts.selectTable(target.token, tableB.id);
			result = await scopedRequest('/character', {}, target.token);
			assert.equal(result.data.character.id, 'personagemb');
		} finally {
			await new Promise(resolve => scopedServer.close(resolve));
		}
	});

	it('keeps owner-only campaign configuration away from auxiliary masters', async () => {
		const { RPGAccountManagement, RPGMemoryAccountRepository } = require('../../dist/server/rpg-showdown/account-management');
		const accounts = new RPGAccountManagement(new RPGMemoryAccountRepository());
		accounts.createAccount('dono-campanha', 'Dono', 'Senha1!Segura');
		accounts.createAccount('mestre-auxiliar', 'Mestre auxiliar', 'Senha1!Segura');
		const owner = accounts.login('dono-campanha', 'Senha1!Segura');
		const auxiliary = accounts.login('mestre-auxiliar', 'Senha1!Segura');
		const table = accounts.createTable(owner.token, { name: 'Mesa com auxiliares' });
		accounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
		accounts.joinByInvite(auxiliary.token, accounts.createInvite(owner.token, table.id, 'master').code);
		accounts.selectTable(owner.token, table.id);
		accounts.selectTable(auxiliary.token, table.id);
		const emptySnapshot = tableId => ({
			characters: [], battles: [], contests: [], tournaments: [], combos: [], customItems: [], shops: [],
			masterNPCLibrary: null, playerDocuments: {}, campaign: null, platformAccounts: [], campaignTables: [],
			tableMembers: [], tableInvites: [], accountSessions: [], recoveryCodes: [], loginAttempts: [],
			auditEntries: [], legacyTableId: tableId,
		});
		const persistence = new Proxy({
			snapshot: async tableId => emptySnapshot(tableId), flush: async () => {}, transaction: action => action(),
		}, {
			get: (target, property) => property in target ? target[property] : () => {},
		});
		const login = new RPGLoginService({
			masterCode: '14081998', accountManagement: accounts, mysqlPersistence: persistence, legacyTableId: table.id,
		});
		const handler = new RPGHttpServer(login);
		const scopedServer = http.createServer((req, res) => handler.handle(req, res));
		await new Promise(resolve => scopedServer.listen(0, '127.0.0.1', resolve));
		const url = `http://127.0.0.1:${scopedServer.address().port}/api/rpg`;
		const scopedRequest = async (path, token, options = {}) => {
			const response = await fetch(url + path, {
				...options,
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
				body: options.body ? JSON.stringify(options.body) : undefined,
			});
			return { response, data: await response.json() };
		};
		try {
			let result = await scopedRequest('/campaign/settings', owner.token, {
				method: 'PUT', body: { name: 'Campanha configurada', currentDateTime: '2026-09-07T12:00:00.000Z' },
			});
			assert.equal(result.response.status, 200, JSON.stringify(result.data));
			result = await scopedRequest('/campaign/settings', auxiliary.token, {
				method: 'PUT', body: { name: 'Alteração indevida', currentDateTime: '2026-09-08T12:00:00.000Z' },
			});
			assert.equal(result.response.status, 403, JSON.stringify(result.data));
			assert.match(result.data.error, /campaign\.configure/);
			result = await scopedRequest('/campaign/time/advance', auxiliary.token, {
				method: 'POST', body: { hours: 1 },
			});
			assert.equal(result.response.status, 200, JSON.stringify(result.data));
		} finally {
			await new Promise(resolve => scopedServer.close(resolve));
		}
	});

	it('reloads a shared MySQL table world between independent HTTP servers', async () => {
		const {
			RPGAccountManagement, RPGMemoryAccountRepository, RPGMemoryPlatformSessionRepository,
		} = require('../../dist/server/rpg-showdown/account-management');
		const seedAccounts = new RPGAccountManagement(new RPGMemoryAccountRepository());
		const ownerAccount = seedAccounts.createAccount('dono-distribuido', 'Dono', 'Senha1!Segura');
		const playerAccount = seedAccounts.createAccount('player-distribuido', 'Player', 'Senha1!Segura');
		const owner = seedAccounts.login('dono-distribuido', 'Senha1!Segura');
		const player = seedAccounts.login('player-distribuido', 'Senha1!Segura');
		const table = seedAccounts.createTable(owner.token, { name: 'Mesa distribuída' });
		seedAccounts.updateTable(owner.token, table.id, { requireJoinApproval: false });
		seedAccounts.joinByInvite(player.token, seedAccounts.createInvite(owner.token, table.id).code);
		seedAccounts.selectTable(player.token, table.id);
		const accountIds = [ownerAccount.id, playerAccount.id];
		const central = {
			characters: [],
			platformAccounts: accountIds.map(id => seedAccounts.repository.getAccount(id)),
			campaignTables: [seedAccounts.repository.getTable(table.id)],
			tableMembers: accountIds.map(id => seedAccounts.repository.getMembership(table.id, id)).filter(Boolean),
			accountSessions: accountIds.flatMap(id => seedAccounts.sessionRepository.listByAccount(id)),
		};
		const persistence = {
			sharedDatabase: true,
			withAdvisoryLock: async (_name, action) => action(),
			withAdvisoryLocks: async (_names, action) => action(),
			transaction: action => action(), transactionAsync: action => action(), flush: async () => {},
			listRuntimeSessionIds: async () => new Set(),
			snapshot: async tableId => ({
				characters: structuredClone(central.characters), battles: [], contests: [], tournaments: [], combos: [],
				customItems: [], shops: [], masterNPCLibrary: null, playerDocuments: {}, campaign: null,
				platformAccounts: structuredClone(central.platformAccounts),
				campaignTables: structuredClone(central.campaignTables),
				tableMembers: structuredClone(central.tableMembers), tableInvites: [],
				accountSessions: structuredClone(central.accountSessions), recoveryCodes: [], loginAttempts: [],
				auditEntries: [], legacyTableId: tableId,
			}),
			upsertCharacter: record => {
				const index = central.characters.findIndex(value => value.state.id === record.state.id);
				if (index < 0) central.characters.push(structuredClone(record));
				else central.characters[index] = structuredClone(record);
			},
			deleteCharacter: id => {
				central.characters = central.characters.filter(record => record.state.id !== id);
			},
			upsertPlatformSession: session => {
				const index = central.accountSessions.findIndex(value => value.tokenHash === session.tokenHash);
				if (index < 0) central.accountSessions.push(structuredClone(session));
				else central.accountSessions[index] = structuredClone(session);
			},
			upsertJSON() {}, delete() {}, upsertSingleton() {},
		};
		const makeBase = () => {
			const repository = new RPGMemoryAccountRepository({
				accounts: central.platformAccounts, tables: central.campaignTables, members: central.tableMembers,
			});
			const sessions = new RPGMemoryPlatformSessionRepository(central.accountSessions);
			return new RPGLoginService({
				masterCode: '14081998', mysqlPersistence: persistence, legacyTableId: table.id,
				accountManagement: new RPGAccountManagement(repository, Date.now, undefined, sessions),
			});
		};
		const servers = [new RPGHttpServer(makeBase()), new RPGHttpServer(makeBase())];
		const nodes = servers.map(handler => http.createServer((req, res) => handler.handle(req, res)));
		await Promise.all(nodes.map(node => new Promise(resolve => node.listen(0, '127.0.0.1', resolve))));
		const call = async (node, path, options = {}) => {
			const response = await fetch(`http://127.0.0.1:${node.address().port}/api/rpg${path}`, {
				...options, headers: { Authorization: `Bearer ${player.token}`,
					...(options.body ? { 'Content-Type': 'application/json' } : {}) },
				body: options.body ? JSON.stringify(options.body) : undefined,
			});
			return { response, data: await response.json() };
		};
		try {
			assert.deepEqual((await call(nodes[1], '/characters')).data.characters, []);
			const created = await call(nodes[0], '/characters', { method: 'POST', body: {
				characterName: 'Compartilhado', playerName: 'Player', avatar: 'red', password: 'senha-personagem',
				initialMoney: 0, starter: { species: 'Bulbasaur', nickname: '', gender: 'M', level: 5 },
			} });
			assert.equal(created.response.status, 201, JSON.stringify(created.data));
			const reloaded = await call(nodes[1], '/characters');
			assert.deepEqual(reloaded.data.characters.map(character => character.id), ['compartilhado']);
		} finally {
			await Promise.all(nodes.map(node => new Promise(resolve => node.close(resolve))));
		}
	});
});
