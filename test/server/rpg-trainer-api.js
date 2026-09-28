'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

describe('RPG trainer API', () => {
	const attributes = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
	let service;
	let server;
	let baseUrl;
	let master;
	let player;

	before(async () => {
		service = new RPGLoginService({ masterCode: 'segredo', repository: new RPGMemoryCharacterRepository(),
			random: () => 0.45 });
		service.createCharacter({ characterName: 'Treinador', playerName: 'Pessoa', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		service.createCharacter({ characterName: 'Outro', playerName: 'Pessoa 2', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
		master = service.loginMaster('segredo');
		player = service.loginPlayer('treinador', 'senha-rpg');
		service.completeTrainerCreation(player.token, { classId: 'arqueologo', attributes,
			optionalSkills: ['percepcao', 'sobrevivencia', 'pilotagem:automoveis'], gearChoices: { arma: 'faca' } });
		server = http.createServer((req, res) => new RPGHttpServer(service).handle(req, res));
		await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
		baseUrl = `http://127.0.0.1:${server.address().port}`;
	});

	after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

	async function request(path, token, body) {
		const response = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET',
			headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
			...(body ? { body: JSON.stringify(body) } : {}) });
		return { status: response.status, data: await response.json() };
	}

	it('exposes rules and only the authorized trainer sheet', async () => {
		const rules = await request('/api/rpg/trainer/rules', player.token);
		assert.equal(rules.status, 200);
		assert.equal(rules.data.difficulties.moderate, 15);
		assert.equal(rules.data.skills.captura[0], 'dexterity');
		const sheet = await request('/api/rpg/trainer/sheet', player.token);
		assert.equal(sheet.status, 200);
		assert.equal(sheet.data.sheet.classId, 'arqueologo');
		assert.notEqual((await request('/api/rpg/trainer/sheet?characterId=outro', player.token)).status, 200);
		assert.notEqual((await request('/api/rpg/trainer/rules', 'invalido')).status, 200);
	});

	it('arbitrates a check once, persists it, and rejects player rerolls or changed requests', async () => {
		const body = { characterId: 'treinador', requestId: 'teste_unico_001', kind: 'skill',
			skill: 'percepcao', options: { dc: 15 } };
		assert.notEqual((await request('/api/rpg/trainer/checks', player.token, body)).status, 200);
		const first = await request('/api/rpg/trainer/checks', master.token, body);
		assert.equal(first.status, 200);
		assert.equal(first.data.repeated, false);
		const repeat = await request('/api/rpg/trainer/checks', master.token, body);
		assert.equal(repeat.status, 200);
		assert.equal(repeat.data.repeated, true);
		assert.deepEqual(repeat.data.result, first.data.result);
		assert.equal(service.getTrainerProgression(master.token, 'treinador').sheet.checks.length, 1);
		assert.notEqual((await request('/api/rpg/trainer/checks', master.token,
			{ ...body, options: { dc: 20 } })).status, 200);
	});

	it('serializes concurrent retries into one recorded result', async () => {
		const body = { characterId: 'treinador', requestId: 'teste_concorrente_002', kind: 'attribute',
			attribute: 'strength', options: { dc: 10 } };
		const responses = await Promise.all(Array.from({ length: 5 }, () =>
			request('/api/rpg/trainer/checks', master.token, body)));
		assert.ok(responses.every(response => response.status === 200));
		assert.equal(responses.filter(response => !response.data.repeated).length, 1);
		assert.ok(responses.every(response =>
			response.data.result.total === responses[0].data.result.total));
		assert.equal(service.getTrainerProgression(master.token, 'treinador').sheet.checks.length, 2);
	});
});
