'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository, RPG_TRAINER_CLASSES,
	RPG_EQUIPMENT_CATALOG, rpgInitialTrainerInventory, rpgEquipmentSlots,
	rpgCanAcquireKitDomain, rpgKitBonus,
	rpgTractionCapacity, rpgTractionLoad,
	completeRPGTrainerSheet, createRPGPendingTrainerSheet } = require('../../dist/server/rpg-showdown');
const { RPGItems, RPGBagSystem } = require('../../dist/sim/rpg-showdown');

const attributes = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };

function character(service, name) {
	service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
		password: 'senha-rpg', initialMoney: 10000, starter: { species: 'Squirtle', gender: 'M' } });
	return service.loginPlayer(name.toLowerCase(), 'senha-rpg');
}

describe('RPG trainer equipment and item bank', () => {
	it('catalogs profession kits without a journalism kit and requires the matching trade for mastery', () => {
		const trades = ['mecanica', 'costura', 'carpintaria', 'ferraria', 'artesanato'];
		for (const trade of trades) {
			const kit = RPG_EQUIPMENT_CATALOG[`kit-${trade}`];
			assert.equal(kit.category, 'kit');
			assert.equal(kit.skill, `oficio:${trade}`);
			assert.equal(kit.stackLimit, 1);
			assert.equal(rpgCanAcquireKitDomain({ skills: { trained: [`oficio:${trade}`] } }, kit.domain), true);
			assert.equal(rpgCanAcquireKitDomain({ skills: { trained: ['oficio:culinaria'] } }, kit.domain), false);
			assert.deepEqual(rpgKitBonus({ proficiencies: [kit.domain] }, kit.id), { bonus: 0, disadvantage: false });
		}
		assert.equal(RPG_EQUIPMENT_CATALOG['kit-jornalismo'], undefined);
	});
	it('catalogs every class starting item and puts its equipment into real Bag slots', () => {
		const candidates = ['acrobacia', 'atletismo', 'atuacao', 'captura', 'conhecimento:regioes',
			'empatia-pokemon', 'enganacao', 'furtividade', 'intimidacao', 'intuicao', 'investigacao',
			'ladinagem', 'medicina', 'medicina-pokemon', 'montaria-pokemon', 'natureza',
			'oficio:escrita', 'percepcao', 'persuasao', 'pilotagem:automoveis', 'sobrevivencia',
			'tecnologia', 'adestramento-pokemon'];
		for (const [classId, rule] of Object.entries(RPG_TRAINER_CLASSES)) {
			const fixedKnowledge = classId === 'cientista' ? 'conhecimento:biologia' : undefined;
			const optionalSkills = candidates.filter(skill => !rule.fixed.includes(skill) &&
				skill !== fixedKnowledge && !rule.excluded.includes(skill.split(':')[0])).slice(0, rule.choices + 1);
			const gearChoices = Object.fromEntries(Object.entries(rule.gearChoices || {})
				.map(([key, choices]) => [key, choices[0]]));
			const sheet = completeRPGTrainerSheet(createRPGPendingTrainerSheet(),
				{ classId, attributes, fixedKnowledge, optionalSkills, gearChoices }, 'standard');
			const inventory = rpgInitialTrainerInventory(sheet);
			assert(sheet.equipment.every(item => RPG_EQUIPMENT_CATALOG[item.itemId] || RPGItems.get(item.itemId)),
				`Item inicial desconhecido: ${classId}`);
			assert(inventory.items.every(item => RPG_EQUIPMENT_CATALOG[item.itemId]), classId);
			assert(rpgEquipmentSlots(inventory.items) <= 15, classId);
		}
	});

	it('uses Pokemon anatomy and base Attack only to determine cart traction', () => {
		assert.equal(rpgTractionCapacity(60, 'medium', true), 300);
		assert.equal(rpgTractionCapacity(60, 'medium', false), 0);
		assert.equal(rpgTractionLoad('carroca-leve', 80, [60],
			[{ baseAttack: 60, size: 'medium', anatomyApproved: true }]).maximumMovementMeters, 6);
		assert.equal(rpgTractionLoad('carroca-leve', 200, [60],
			[{ baseAttack: 60, size: 'medium', anatomyApproved: true }]).allowed, false);
	});
	it('shows Alimento in the Bag without creating a meal item', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Cozinheira');
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'cozinheira',
			expectedRevision: 0, itemId: 'alimento', quantity: 2 });
		const bag = service.getBag(master.token, 'cozinheira', { category: 'food-items' });
		assert.equal(bag.items.find(item => item.name === 'Alimento').quantity, 2);
		assert.match(bag.items.find(item => item.name === 'Alimento').description,
			/4 porções de refeição.*roleplay/);
		assert.equal(bag.items.some(item => /Refeição Preparada/.test(item.name)), false);
	});
	it('allocates class gear in the shared Bag and keeps purchases, transfers and consumption consistent', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		const alice = character(service, 'Alice');
		const bob = character(service, 'Bob');
		service.chooseTrainerAttributeMethod(alice.token, 'standard');
		service.completeTrainerCreation(alice.token, { classId: 'arqueologo', attributes,
			optionalSkills: ['percepcao', 'sobrevivencia', 'pilotagem:automoveis'], gearChoices: { arma: 'faca' } });
		const initial = service.getTrainerEquipment(alice.token);
		assert(initial.inventory.items.some(item => item.itemId === 'kit-arqueologia'));
		assert(initial.capacity.usedSlots > repository.get('alice').state.inventory.bag.items.length);
		const shopId = service.listCommerceShops(master.token).shops[0].id;
		service.setTrainerEquipmentOffer(master.token, shopId, 'taser', 2);
		assert.throws(() => service.changeTrainerEquipment(alice.token, { action: 'buy', expectedRevision: 0,
			itemId: 'taser', shopId }), /Licença/);
		assert.equal(service.getTrainerEquipment(alice.token).inventory.revision, 0);
		service.setTrainerLicense(master.token, 'alice', { id: 'defensiva', status: 'active', issuedBy: '' });
		const licensed = service.getTrainerEquipment(alice.token);
		const bought = service.changeTrainerEquipment(alice.token, { action: 'buy',
			expectedRevision: licensed.inventory.revision, itemId: 'taser', shopId });
		const taser = bought.inventory.items.find(item => item.itemId === 'taser');
		assert.equal(taser.charges, 1);
		assert.equal(bought.money, 6500);
		assert.throws(() => service.changeTrainerEquipment(alice.token, { action: 'transfer',
			expectedRevision: bought.inventory.revision, instanceId: taser.id,
			targetCharacterId: 'bob', expectedTargetRevision: 0 }), /Licença/);
		assert.equal(service.getTrainerEquipment(alice.token).inventory.revision, bought.inventory.revision);
		const used = service.changeTrainerEquipment(alice.token, { action: 'consume',
			expectedRevision: bought.inventory.revision, instanceId: taser.id });
		assert.equal(used.inventory.items.find(item => item.id === taser.id).charges, 0);
		const stored = service.changeTrainerEquipment(alice.token, { action: 'move',
			expectedRevision: used.inventory.revision, instanceId: taser.id, location: 'bank' });
		assert.equal(stored.inventory.items.find(item => item.id === taser.id).location, 'bank');
		assert.throws(() => service.changeTrainerEquipment(alice.token, { action: 'consume',
			expectedRevision: stored.inventory.revision, instanceId: taser.id }), /disponível/);
		assert(bob.token);
	});

	it('persists vehicle energy, refills and bounded cargo without counting a parked vehicle as carried weight', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		const player = character(service, 'Condutor');
		let revision = service.getTrainerEquipment(player.token).inventory.revision;
		let result = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'condutor',
			expectedRevision: revision, itemId: 'carro' });
		const vehicle = result.inventory.items.find(item => item.itemId === 'carro');
		assert.equal(vehicle.location, 'vehicle');
		assert.equal(vehicle.charges, 12);
		revision = result.inventory.revision;
		result = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'condutor',
			expectedRevision: revision, itemId: 'reserva-energia-veiculo' });
		const reserve = result.inventory.items.find(item => item.itemId === 'reserva-energia-veiculo');
		revision = result.inventory.revision;
		result = service.changeTrainerEquipment(player.token, { action: 'consume',
			expectedRevision: revision, instanceId: vehicle.id, quantity: 1 });
		assert.equal(result.inventory.items.find(item => item.id === vehicle.id).charges, 11);
		revision = result.inventory.revision;
		result = service.changeTrainerEquipment(player.token, { action: 'refill',
			expectedRevision: revision, instanceId: vehicle.id, refillInstanceId: reserve.id });
		assert.equal(result.inventory.items.find(item => item.id === vehicle.id).charges, 12);
		assert.equal(result.inventory.items.find(item => item.id === reserve.id).charges, 1);
		revision = result.inventory.revision;
		result = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'condutor',
			expectedRevision: revision, itemId: 'alimento' });
		const food = result.inventory.items.find(item => item.itemId === 'alimento');
		service.setTrainerLicense(master.token, 'condutor', { id: 'veiculo', status: 'active', issuedBy: '' });
		revision = service.getTrainerEquipment(player.token).inventory.revision;
		result = service.changeTrainerEquipment(player.token, { action: 'move',
			expectedRevision: revision, instanceId: food.id, location: 'vehicle', vehicleId: vehicle.id });
		assert.equal(result.inventory.items.find(item => item.id === food.id).vehicleId, vehicle.id);
	});

	it('restores both characters if a two-owner transfer cannot commit', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		const alice = character(service, 'Alice');
		character(service, 'Bob');
		const given = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'alice',
			expectedRevision: 0, itemId: 'alimento', quantity: 2 });
		const item = given.inventory.items.find(entry => entry.itemId === 'alimento');
		const beforeAlice = service.getTrainerEquipment(alice.token).inventory;
		const beforeBob = repository.get('bob').state.trainerInventory;
		service.mysqlPersistence = { transaction: action => { action(); throw new Error('db failed'); } };
		assert.throws(() => service.changeTrainerEquipment(alice.token, { action: 'transfer',
			expectedRevision: beforeAlice.revision, instanceId: item.id, quantity: 1,
			targetCharacterId: 'bob', expectedTargetRevision: 0 }), /db failed/);
		assert.deepEqual(repository.get('alice').state.trainerInventory, beforeAlice);
		assert.deepEqual(repository.get('bob').state.trainerInventory, beforeBob);
	});

	it('stores Pokemon items in the bank and a cart without occupying personal Bag slots', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		const player = character(service, 'Viajante');
		const record = repository.get('viajante');
		record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, 'potion', 6).bag;
		repository.set(record);
		let result = service.changeTrainerEquipment(player.token, { action: 'movePokemon',
			expectedRevision: 0, expectedBagRevision: 1, itemId: 'potion', quantity: 3,
			sourceLocation: 'bag', location: 'bank' });
		assert.equal(result.inventory.pokemonStorage[0].quantity, 3);
		assert.equal(repository.get('viajante').state.inventory.bag.items[0].quantity, 3);
		result = service.changeTrainerEquipment(player.token, { action: 'movePokemon',
			expectedRevision: result.inventory.revision, expectedBagRevision: 2, itemId: 'potion', quantity: 2,
			sourceLocation: 'bank', location: 'bag' });
		assert.equal(result.inventory.pokemonStorage[0].quantity, 1);
		assert.equal(repository.get('viajante').state.inventory.bag.items[0].quantity, 5);
		result = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'viajante',
			expectedRevision: result.inventory.revision, itemId: 'carroca-leve' });
		const cart = result.inventory.items.find(item => item.itemId === 'carroca-leve');
		result = service.changeTrainerEquipment(player.token, { action: 'movePokemon',
			expectedRevision: result.inventory.revision, expectedBagRevision: 3, itemId: 'potion', quantity: 5,
			sourceLocation: 'bag', location: 'vehicle', vehicleId: cart.id });
		assert.equal(result.inventory.pokemonStorage.find(item => item.vehicleId === cart.id).quantity, 5);
		assert.equal(repository.get('viajante').state.inventory.bag.items.length, 0);
	});
});
