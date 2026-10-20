'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { RPGHttpServer } = require('../../dist/server/rpg-showdown/http');
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

describe('RPG trainer API', () => {
	const attributes = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
	let service;
	let repository;
	let server;
	let baseUrl;
	let master;
	let player;

	before(async () => {
		repository = new RPGMemoryCharacterRepository();
		service = new RPGLoginService({ masterCode: 'segredo', repository,
			random: () => 0.45 });
		service.createCharacter({ characterName: 'Treinador', playerName: 'Pessoa', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		service.createCharacter({ characterName: 'Outro', playerName: 'Pessoa 2', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Bulbasaur', gender: 'M' } });
		master = service.loginMaster('segredo');
		player = service.loginPlayer('treinador', 'senha-rpg');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
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

	it('projects every human skill, resistance, Defense and base attack from the rules engine', async () => {
		const view = await request('/api/rpg/trainer/sheet', player.token);
		assert.equal(view.status, 200);
		assert.equal(view.data.resistances.length, 3);
		assert.equal(view.data.proficiency, 2);
		assert.equal(view.data.resistances.find(entry => entry.id === 'will').trained, true);
		assert.equal(view.data.resistances.find(entry => entry.id === 'reflexes').trained, false);
		assert.equal(view.data.skills.find(entry => entry.id === 'investigacao').trained, true);
		assert.equal(view.data.skills.find(entry => entry.id === 'acrobacia').trained, false);
		assert.equal(view.data.skills.find(entry => entry.id === 'ladinagem').requiresTraining, true);
		assert.equal(view.data.skills.filter(entry => entry.id.startsWith('pilotagem:')).length, 6);
		assert.equal(view.data.skills.filter(entry => entry.id.startsWith('conhecimento:')).length, 8);
		assert.equal(view.data.skills.filter(entry => entry.id.startsWith('oficio:')).length, 8);
		assert.equal(view.data.skills.find(entry => entry.id === 'conhecimento:arqueologia-fosseis').trained, true);
		assert.equal(view.data.skills.find(entry => entry.id === 'conhecimento:regioes').trained, false);
		assert.equal(view.data.skills.find(entry => entry.id === 'oficio:mecanica').bonus, null);
		assert.equal(view.data.derived.defense,
			service.getTrainerEquipment(player.token).derived.defense);
		assert.deepEqual(view.data.attacks, { melee: 2, ranged: 2 });
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

	it('arbitrates campaign activities once and keeps their state on the character', async () => {
		const start = { characterId: 'treinador', requestId: 'viagem_inicio_001',
			action: { type: 'travel-start', hex: { q: 0, r: 0 } } };
		assert.notEqual((await request('/api/rpg/trainer/activities', player.token, start)).status, 200);
		assert.equal((await request('/api/rpg/trainer/activities', master.token, start)).status, 200);
		const repeat = await request('/api/rpg/trainer/activities', master.token, start);
		assert.equal(repeat.data.repeated, true);
		const leg = { characterId: 'treinador', requestId: 'viagem_trecho_001',
			action: { type: 'travel-advance', leg: { destination: { q: 1, r: 0 },
				mode: 'foot', route: 'road', weather: 'normal', pace: 'normal', carriedKg: 99999 },
			hoursBudget: 2 } };
		const advanced = await request('/api/rpg/trainer/activities', master.token, leg);
		assert.equal(advanced.status, 200);
		assert.equal(advanced.data.result.arrived, true);
		const visible = await request('/api/rpg/trainer/activities', player.token);
		assert.equal(visible.status, 200);
		assert.deepEqual(visible.data.activities.travel.hex, { q: 1, r: 0 });
		assert.notEqual((await request('/api/rpg/trainer/activities?characterId=outro', player.token)).status, 200);
		assert.notEqual((await request('/api/rpg/trainer/activities', master.token,
			{ ...leg, action: start.action })).status, 200);
	});

	it('does not consume a craft project before its campaign time or prerequisites', async () => {
		const begin = { characterId: 'treinador', requestId: 'fabricacao_inicio_01',
			action: { type: 'craft-start', recipeId: 'culinary:pokemon-ration' } };
		assert.equal((await request('/api/rpg/trainer/activities', master.token, begin)).status, 200);
		const complete = { characterId: 'treinador', requestId: 'fabricacao_final_01',
			action: { type: 'craft-complete', craftId: begin.requestId } };
		assert.notEqual((await request('/api/rpg/trainer/activities', master.token, complete)).status, 200);
		const state = (await request('/api/rpg/trainer/activities?characterId=treinador', master.token)).data.activities;
		assert.equal(state.crafts[0].completedAt, undefined);
		assert.equal(state.receipts.filter(entry => entry.id === complete.requestId).length, 0);
	});

	it('commits craft charges and produced items together and returns the same receipt on retry', async () => {
		const record = repository.get('treinador');
		record.state.trainerSheet.talents.class.push('cientista:producao-farmaceutica-pokemon');
		record.state.trainerSheet.skills.trained.push('conhecimento:quimica');
		record.state.trainerSheet.proficiencies.push('kit-cientifico');
		record.state.trainerInventory.items.push({ id: 'kit_teste_01', itemId: 'kit-cientifico-1',
			quantity: 1, equipped: false, charges: 5, location: 'bag' });
		repository.set(record);
		const begin = { characterId: 'treinador', requestId: 'fabricacao_inicio_02',
			action: { type: 'craft-start', recipeId: 'pharmacy:potion' } };
		assert.equal((await request('/api/rpg/trainer/activities', master.token, begin)).status, 200);
		service.advanceCampaignTime(master.token, 1);
		const complete = { characterId: 'treinador', requestId: 'fabricacao_final_02',
			action: { type: 'craft-complete', craftId: begin.requestId, facility: 'higienica' } };
		const result = await request('/api/rpg/trainer/activities', master.token, complete);
		assert.equal(result.status, 200);
		assert.equal(result.data.result.produced.quantity, 3);
		const finished = repository.get('treinador');
		assert.equal(finished.state.trainerInventory.items.find(item => item.id === 'kit_teste_01').charges, 4);
		const bag = finished.state.inventory.bag;
		const craftedItemId = result.data.result.produced.itemId;
		assert.equal(bag.items.find(item => item.itemId === craftedItemId).quantity, 3);
		assert.equal((await request('/api/rpg/trainer/activities', master.token, complete)).data.repeated, true);
		assert.equal(repository.get('treinador').state.inventory.bag.items
			.find(item => item.itemId === craftedItemId).quantity, 3);
	});

	it('reloads activity receipts from character persistence without leaking to another character', () => {
		const restarted = new RPGLoginService({ masterCode: 'segredo', repository,
			random: () => 0.45 });
		const token = restarted.loginMaster('segredo').token;
		const activities = restarted.getTrainerActivities(token, 'treinador').activities;
		assert.equal(activities.travel.hex.q, 1);
		assert.equal(activities.receipts.filter(entry => entry.id === 'viagem_inicio_001').length, 1);
		assert.deepEqual(restarted.getTrainerActivities(token, 'outro').activities, {});
	});

	it('authorizes XP and level adjustments while withholding player advancement until eight campaign hours', async () => {
		assert.notEqual((await request('/api/rpg/trainer/level/master', player.token,
			{ characterId: 'treinador', direction: 'up', requestId: 'api-level-denied' })).status, 200);
		const premature = await request('/api/rpg/trainer/level-up', player.token,
			{ choices: [{ id: 'treinamento-adicional', skill: 'medicina' }] });
		assert.equal(premature.status, 400);
		assert.match(premature.data.error, /XP insuficiente/);
		const reward = await request('/api/rpg/trainer/rewards/master', master.token,
			{ characterId: 'treinador', amount: 1_000_000, reason: 'Missão', requestId: 'api-level-reward' });
		assert.equal(reward.status, 200);
		assert.equal((await request('/api/rpg/trainer/sheet', player.token)).data.sheet.level, 1);
		const earlyPreview = await request('/api/rpg/trainer/level-up', player.token);
		assert.equal(earlyPreview.status, 400);
		assert.match(earlyPreview.data.error, /descanso longo/);
		service.advanceCampaignTime(master.token, 8);
		assert.equal((await request('/api/rpg/trainer/sheet', player.token)).data.canLevelUp, true);
		const preview = await request('/api/rpg/trainer/level-up', player.token);
		assert.equal(preview.status, 200);
		assert.equal(preview.data.pendingChoices.general, 1);
		assert.equal((await request('/api/rpg/trainer/level-up', player.token,
			{ choices: [{ id: 'treinamento-adicional', skill: 'medicina' }] })).data.sheet.level, 2);
		assert.equal((await request('/api/rpg/trainer/level/master', master.token,
			{ characterId: 'treinador', direction: 'down', requestId: 'api-level-down' })).data.sheet.level, 1);
	});

	it('reserva os botões de descanso ao Mestre sem avançar o relógio', async () => {
		const before = service.campaignSettings.currentDateTime;
		assert.notEqual((await request('/api/rpg/campaign/rest', player.token,
			{ kind: 'short', requestId: 'api-rest-denied' })).status, 200);
		const short = await request('/api/rpg/campaign/rest', master.token,
			{ kind: 'short', requestId: 'api-rest-short-1' });
		assert.equal(short.status, 200);
		assert.equal(short.data.rest.kind, 'short');
		assert.equal(service.campaignSettings.currentDateTime, before);
		const long = await request('/api/rpg/campaign/rest', master.token,
			{ kind: 'long', requestId: 'api-rest-long-1' });
		assert.equal(long.status, 200);
		assert.equal(long.data.rest.kind, 'long');
		assert.equal(service.campaignSettings.currentDateTime, before);
	});
});
