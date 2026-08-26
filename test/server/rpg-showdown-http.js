'use strict';

const assert = require('assert').strict;
const http = require('node:http');
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
			body: {action: 'reset-prices', expectedRevision: result.data.shop.revision},
		});
		assert.equal(result.response.status, 200);
		assert(result.data.offers.length > 1);
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
				actionId: 'http-shop-buy', type: 'buy', lines: [{itemId: 'pokeball', quantity: 1}],
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
});
