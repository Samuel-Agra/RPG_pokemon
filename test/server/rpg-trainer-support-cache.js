'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository, createRPGPendingTrainerSheet,
	RPG_TRAINER_TALENTS, rpgTrainerTalentCatalog } = require('../../dist/server/rpg-showdown');
const { RPGBagSystem } = require('../../dist/sim/rpg-showdown');

describe('RPG Ponto de Apoio do Explorador', () => {
	it('lets the Master block an individual Ponto de Apoio without freeing its creation limit', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		service.createCharacter({ characterName: 'Bia', playerName: 'Bia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'F' } });
		const ally = repository.get('bia');
		ally.tableId = 'mesa-teste'; ally.accountId = 'bia'; repository.set(ally);
		record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
			classId: 'explorador', level: 7,
			attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
			talents: { general: [], class: ['explorador:ponto-de-apoio'], apex: null } };
		repository.set(record);
		let activeId = 'ana';
		service.getSession = token => token === 'master' ?
			{ mode: 'master', role: 'master', platformTableId: 'mesa-teste' } :
			{ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: activeId };
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const cache = service.createSupportCache('player', 'Bosque');
		assert.equal(service.getCharacterSharedInventories('master', 'ana').caches.length, 1);
		service.setCharacterSharedInventoryAccess('master', 'ana', `cache:${cache.cacheId}`, false);
		assert.equal(service.getSupportCaches('player').length, 0);
		assert.throws(() => service.getSupportCache('player', cache.cacheId), /indisponível/);
		activeId = 'bia';
		assert.equal(service.getSupportCaches('player').length, 0);
		assert.throws(() => service.getSupportCache('player', cache.cacheId), /indisponível/);
		activeId = 'ana';
		assert.throws(() => service.createSupportCache('player', 'Outra trilha'), /Limite de 1/);
		service.setCharacterSharedInventoryAccess('master', 'ana', `cache:${cache.cacheId}`, true);
		assert.equal(service.getSupportCaches('player').length, 1);
	});
	it('remove Caminho Alternativo e libera Ponto de Apoio sem o talento extinto', () => {
		assert.equal(RPG_TRAINER_TALENTS.some(talent => talent.id === 'explorador:caminho-alternativo'), false);
		const sheet = { ...createRPGPendingTrainerSheet(), status: 'complete', classId: 'explorador', level: 7,
			attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
			talents: { general: [], class: [], apex: null } };
		assert.equal(rpgTrainerTalentCatalog(sheet).find(talent => talent.id === 'explorador:ponto-de-apoio').available, true);
	});
	it('guarda e retira itens com aliados sem duplicar, respeitando revisões e mesas', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = name === 'Caio' ? 'outra-mesa' : 'mesa-teste';
			record.accountId = name.toLowerCase();
			record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
				classId: 'explorador', level: 7,
				attributes: { strength: 15, dexterity: 14, constitution: 13,
					intelligence: 12, wisdom: 10, charisma: 8 },
				talents: { general: [], class: name === 'Ana' ? ['explorador:ponto-de-apoio'] : [], apex: null } };
			repository.set(record);
		}
		let activeId = 'ana';
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: activeId === 'caio' ? 'outra-mesa' : 'mesa-teste', characterId: activeId });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const ana = repository.get('ana');
		ana.state.inventory.bag = RPGBagSystem.add(ana.state.inventory.bag, 'potion', 2).bag;
		repository.set(ana);
		const first = service.createSupportCache('player', 'Bosque ao norte');
		assert.equal(first.usedSlots, 0);
		assert.equal(first.location, 'Bosque ao norte');
		assert.equal(first.bagItems, undefined);
		assert.equal(first.categories, undefined);
		assert.throws(() => service.createSupportCache('player', 'Outra trilha'), /Limite de 1/);
		const deposited = service.changeSupportCache('player', { cacheId: first.cacheId, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 2, expectedRevision: first.revision,
			expectedBagRevision: first.bagRevision, expectedEquipmentRevision: first.equipmentRevision });
		assert.equal(deposited.items.find(item => item.itemId === 'potion').quantity, 2);
		assert.equal(repository.get('ana').state.inventory.bag.items.some(item => item.itemId === 'potion'), false);
		assert.throws(() => service.changeSupportCache('player', { cacheId: first.cacheId, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 2, expectedRevision: first.revision,
			expectedBagRevision: first.bagRevision, expectedEquipmentRevision: first.equipmentRevision }), /mudaram/);
		activeId = 'bia';
		const ally = service.getSupportCache('player', first.cacheId);
		assert.equal(ally.ownerName, 'Ana');
		service.changeSupportCache('player', { cacheId: first.cacheId, action: 'withdraw',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedRevision: ally.revision,
			expectedBagRevision: ally.bagRevision, expectedEquipmentRevision: ally.equipmentRevision });
		assert.equal(RPGBagSystem.getQuantity(repository.get('bia').state.inventory.bag, 'potion'), 1);
		const ownerWithoutTalent = repository.get('ana');
		ownerWithoutTalent.state.trainerSheet.talents.class = [];
		repository.set(ownerWithoutTalent);
		assert(service.getSupportCaches('player').some(cache => cache.ownerCharacterId === 'ana'));
		const recoverable = service.getSupportCache('player', first.cacheId);
		assert.equal(recoverable.canDeposit, false);
		assert.throws(() => service.changeSupportCache('player', { cacheId: first.cacheId, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedRevision: recoverable.revision,
			expectedBagRevision: recoverable.bagRevision,
			expectedEquipmentRevision: recoverable.equipmentRevision }), /só permite retirar/);
		service.changeSupportCache('player', { cacheId: first.cacheId, action: 'withdraw',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedRevision: recoverable.revision,
			expectedBagRevision: recoverable.bagRevision,
			expectedEquipmentRevision: recoverable.equipmentRevision });
		activeId = 'caio';
		assert.throws(() => service.getSupportCache('player', first.cacheId), /indisponível/);
	});
	it('preserva equipamentos e limita o esconderijo a 20 espaços', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
			classId: 'explorador', level: 7,
			attributes: { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 8 },
			talents: { general: [], class: ['explorador:ponto-de-apoio'], apex: null } };
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'tent-0', itemId: 'barraca', quantity: 1, equipped: false, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const cacheId = service.createSupportCache('player', 'Caverna').cacheId;
		for (let index = 0; index < 6; index++) {
			const before = service.getSupportCache('player', cacheId);
			service.changeSupportCache('player', { cacheId, action: 'deposit',
				kind: 'equipment', instanceId: `tent-${index}`, quantity: 1,
				expectedRevision: before.revision, expectedBagRevision: before.bagRevision,
				expectedEquipmentRevision: before.equipmentRevision });
			if (index < 5) {
				const next = repository.get('ana');
				next.state.trainerInventory.items.push({ id: `tent-${index + 1}`, itemId: 'barraca',
					quantity: 1, equipped: false, location: 'bag' });
				next.state.trainerInventory.revision++;
				repository.set(next);
			}
		}
		const full = service.getSupportCache('player', cacheId);
		assert.equal(full.usedSlots, 18);
		const extra = repository.get('ana');
		extra.state.trainerInventory.items.push({ id: 'tent-extra', itemId: 'barraca',
			quantity: 1, equipped: false, location: 'bag' });
		extra.state.trainerInventory.revision++;
		repository.set(extra);
		const beforeError = service.getSupportCache('player', cacheId);
		assert.throws(() => service.changeSupportCache('player', { cacheId, action: 'deposit',
			kind: 'equipment', instanceId: 'tent-extra', quantity: 1,
			expectedRevision: beforeError.revision, expectedBagRevision: beforeError.bagRevision,
			expectedEquipmentRevision: beforeError.equipmentRevision }), /20 espaços/);
		assert.equal(service.getSupportCache('player', cacheId).usedSlots, 18);
		assert(repository.get('ana').state.trainerInventory.items.some(item => item.id === 'tent-extra'));
	});
	it('cria pontos independentes até o modificador de Sabedoria e preserva o esconderijo antigo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
			classId: 'explorador', level: 7,
			attributes: { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 16, charisma: 8 },
			talents: { general: [], class: ['explorador:ponto-de-apoio'], apex: null } };
		record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, 'potion', 1).bag;
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.campaignSettings.supportCaches.ana = {
			revision: 0, bag: RPGBagSystem.create('support-ana', [], { maxSlots: 20 }), equipment: [],
		};
		assert.equal(service.getSupportCache('player', 'ana').location, 'Local não informado');
		const first = service.createSupportCache('player', 'Bosque');
		const second = service.createSupportCache('player', 'Caverna');
		assert.notEqual(first.cacheId, second.cacheId);
		assert.equal(service.getSupportCaches('player').length, 3);
		assert.throws(() => service.createSupportCache('player', 'Praia'), /Limite de 3/);
		const moved = service.changeSupportCache('player', { cacheId: first.cacheId, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedRevision: first.revision,
			expectedBagRevision: first.bagRevision, expectedEquipmentRevision: first.equipmentRevision });
		assert.equal(moved.items.find(item => item.itemId === 'potion').quantity, 1);
		assert.equal(service.getSupportCache('player', second.cacheId).items.length, 0);
		assert.equal(service.getSupportCache('player', 'ana').items.length, 0);
	});
	it('exige o proprietário, revisão atual e confirmação antes de destruir itens guardados', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = name === 'Caio' ? 'outra-mesa' : 'mesa-teste';
			record.accountId = name.toLowerCase();
			record.state.trainerSheet = { ...createRPGPendingTrainerSheet(), status: 'complete',
				classId: 'explorador', level: 7, attributes: { strength: 15, dexterity: 14,
					constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
				talents: { general: [], class: name === 'Ana' ? ['explorador:ponto-de-apoio'] : [], apex: null } };
			repository.set(record);
		}
		let activeId = 'ana';
		service.getSession = token => token === 'master' ?
			{ mode: 'player', role: 'master', platformTableId: 'mesa-teste', viewAsCharacterId: 'bia' } :
			{ mode: 'player', role: 'player',
				platformTableId: activeId === 'caio' ? 'outra-mesa' : 'mesa-teste', characterId: activeId };
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const owner = repository.get('ana');
		owner.state.inventory.bag = RPGBagSystem.add(owner.state.inventory.bag, 'potion', 1).bag;
		repository.set(owner);
		const empty = service.createSupportCache('player', 'Vazio');
		assert.deepEqual(service.deleteSupportCache('player', { cacheId: empty.cacheId,
			expectedRevision: empty.revision }), { cacheId: empty.cacheId, deleted: true });
		const cache = service.createSupportCache('player', 'Bosque');
		const filled = service.changeSupportCache('player', { cacheId: cache.cacheId, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedRevision: cache.revision,
			expectedBagRevision: cache.bagRevision, expectedEquipmentRevision: cache.equipmentRevision });
		assert.throws(() => service.deleteSupportCache('player', { cacheId: cache.cacheId,
			expectedRevision: cache.revision, confirmContents: true }), /mudou/);
		assert.throws(() => service.deleteSupportCache('player', { cacheId: cache.cacheId,
			expectedRevision: filled.revision }), /contém itens/);
		activeId = 'bia';
		assert.throws(() => service.deleteSupportCache('player', { cacheId: cache.cacheId,
			expectedRevision: filled.revision, confirmContents: true }), /proprietário/);
		activeId = 'caio';
		assert.throws(() => service.deleteSupportCache('player', { cacheId: cache.cacheId,
			expectedRevision: filled.revision, confirmContents: true }), /indisponível/);
		activeId = 'ana';
		service.deleteSupportCache('player', { cacheId: cache.cacheId,
			expectedRevision: filled.revision, confirmContents: true });
		assert.equal(service.getSupportCaches('player').length, 0);
		assert.throws(() => service.getSupportCache('player', cache.cacheId), /indisponível/);
		const masterTarget = service.createSupportCache('player', 'Trilha');
		assert.deepEqual(service.deleteSupportCache('master', { cacheId: masterTarget.cacheId,
			expectedRevision: masterTarget.revision }), { cacheId: masterTarget.cacheId, deleted: true });
		assert.equal(service.getSupportCaches('player').length, 0);
	});
});
