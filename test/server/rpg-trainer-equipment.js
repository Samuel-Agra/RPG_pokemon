'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { RPGLoginService, RPGMemoryCharacterRepository, RPG_TRAINER_CLASSES,
	RPG_EQUIPMENT_CATALOG, rpgEquipmentAttackProfile, rpgInitialTrainerInventory, rpgEquipmentSlots,
	rpgEquipmentWeight,
	rpgCanAcquireKitDomain, rpgKitBonus,
	rpgHasLicense, RPG_TRAINER_LICENSE_FEES,
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
	it('shares only current-table trainer combat summaries in the Player roster', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Alice', 'Bob', 'Carol']) character(service, name);
		for (const id of ['alice', 'bob', 'carol']) {
			const record = repository.get(id);
			record.tableId = id === 'carol' ? 'outra-mesa' : 'mesa-teste'; record.accountId = id;
			record.state.trainerSheet = completeRPGTrainerSheet(createRPGPendingTrainerSheet(),
				{ classId: 'arqueologo', attributes,
					optionalSkills: ['atletismo', 'captura', 'furtividade'], gearChoices: { arma: 'faca' } }, 'standard');
			repository.set(record);
		}
		const bob = repository.get('bob');
		bob.state.trainerSheet.hitPoints.current = 8;
		bob.state.trainerSheet.survival = { lifeState: 'conscious', exhaustion: 2,
			conditions: [{ id: 'cego', source: 'Teste' }], deathSaves: { successes: 0, failures: 0 },
			wounds: [], shortCareUsed: false };
		repository.set(bob);
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: 'alice' });
		const roster = service.listOtherPlayers('player');
		assert.deepEqual(roster.map(entry => entry.id), ['bob']);
		assert.equal(roster[0].combat.classId, 'arqueologo');
		assert.equal(roster[0].combat.className, 'Arqueólogo');
		assert.equal(roster[0].combat.level, 1);
		assert.equal(roster[0].combat.experience, 0);
		assert.equal(roster[0].combat.nextLevelXP, 937500);
		assert.equal(roster[0].combat.hp.current, 8);
		assert.equal(roster[0].combat.exhaustion, 2);
		assert.deepEqual(roster[0].combat.conditions, ['cego']);
		assert.equal(typeof roster[0].combat.defense, 'number');
		assert.equal(typeof roster[0].combat.initiative, 'number');
		assert.equal(typeof roster[0].combat.attacks.melee, 'number');
		assert.deepEqual(roster[0].combat.deathSaves, { successes: 0, failures: 0 });
		bob.state.trainerSheet.hitPoints.current = 0;
		bob.state.trainerSheet.survival.lifeState = 'dying';
		bob.state.trainerSheet.survival.deathSaves = { successes: 2, failures: 1 };
		repository.set(bob);
		assert.deepEqual(service.listOtherPlayers('player')[0].combat.deathSaves,
			{ successes: 2, failures: 1 });
		assert.equal('trainerSheet' in roster[0], false);
	});
	it('resolves equipped weapon attacks against table players and scene NPCs', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0.95 });
		character(service, 'Alice'); character(service, 'Bob');
		for (const id of ['alice', 'bob']) {
			const record = repository.get(id);
			record.tableId = 'mesa-teste'; record.accountId = id;
			record.state.trainerSheet = completeRPGTrainerSheet(createRPGPendingTrainerSheet(),
				{ classId: 'arqueologo', attributes,
					optionalSkills: ['atletismo', 'captura', 'furtividade'], gearChoices: { arma: 'faca' } }, 'standard');
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: 'alice' });
		service.requirePermission = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const weapon = service.changeTrainerEquipment('player', { action: 'equip',
			expectedRevision: service.getTrainerEquipment('player').inventory.revision,
			instanceId: service.getTrainerEquipment('player').inventory.items.find(item => item.itemId === 'faca').id,
			equipped: true, hand: 'left' }).inventory.items.find(item => item.itemId === 'faca');
		const before = repository.get('bob').state.trainerSheet.hitPoints.current;
		const hit = service.attackWithTrainerWeapon('player', { characterId: 'alice', instanceId: weapon.id,
			targetType: 'player', targetId: 'bob' });
		assert.equal(hit.hit, true);
		assert(repository.get('bob').state.trainerSheet.hitPoints.current < before);
		assert.throws(() => service.attackWithTrainerWeapon('player', { characterId: 'alice',
			instanceId: weapon.id, targetType: 'player', targetId: 'outsider' }), /fora da mesa|indisponível/);
		service.masterNPCLibrary = { npcs: [{ id: 'npc-1', name: 'Guarda', team: [] }] };
		service.campaignSettings.sceneNpcIds = ['npc-1'];
		const npcHit = service.attackWithTrainerWeapon('player', { characterId: 'alice',
			instanceId: weapon.id, targetType: 'scene-npc', targetId: 'npc-1' });
		assert.equal(npcHit.hit, true);
		assert(service.masterNPCLibrary.npcs[0].humanCombat.hp < 20);
		const manual = service.attackWithTrainerWeapon('player', { characterId: 'alice',
			instanceId: weapon.id, targetType: 'other-npc', targetName: 'Viajante' });
		assert.equal(manual.hit, null);
		assert(manual.damage.total > 0);
		const inventory = service.getTrainerEquipment('player').inventory;
		service.changeTrainerEquipment('player', { action: 'equip', instanceId: weapon.id,
			equipped: false, expectedRevision: inventory.revision });
		const loaded = repository.get('alice');
		loaded.state.trainerInventory.items.push(
			{ id: 'gun', itemId: 'revolver', quantity: 1, location: 'bag', equipped: true,
				equippedHand: 'left', charges: 2 },
			{ id: 'bullets', itemId: 'municao-revolver', quantity: 4, location: 'bag', equipped: false });
		repository.set(loaded);
		for (const expected of [1, 0]) {
			service.attackWithTrainerWeapon('player', { characterId: 'alice', instanceId: 'gun',
				targetType: 'other-npc', targetName: 'Alvo' });
			assert.equal(repository.get('alice').state.trainerInventory.items.find(item => item.id === 'gun').charges, expected);
		}
		assert.throws(() => service.attackWithTrainerWeapon('player', { characterId: 'alice',
			instanceId: 'gun', targetType: 'other-npc', targetName: 'Alvo' }), /recarregue/i);
		const refilled = service.changeTrainerEquipment('player', { action: 'reloadWeapon', instanceId: 'gun',
			expectedRevision: service.getTrainerEquipment('player').inventory.revision }).inventory;
		assert.equal(refilled.items.find(item => item.id === 'gun').charges, 4);
		assert.equal(refilled.items.some(item => item.id === 'bullets'), false);
		assert.throws(() => service.changeTrainerEquipment('player', { action: 'reloadWeapon', instanceId: 'gun',
			expectedRevision: refilled.revision }), /Sem munição/);
		const archer = repository.get('alice');
		archer.state.trainerInventory.items.find(item => item.id === 'gun').equipped = false;
		archer.state.trainerInventory.items.push(
			{ id: 'bow', itemId: 'arco-curto', quantity: 1, location: 'bag', equipped: true },
			{ id: 'arrows', itemId: 'flecha', quantity: 2, location: 'bag', equipped: false, charges: 1 });
		repository.set(archer);
		service.attackWithTrainerWeapon('player', { characterId: 'alice', instanceId: 'bow',
			targetType: 'other-npc', targetName: 'Alvo' });
		const remainingArrows = repository.get('alice').state.trainerInventory.items.find(item => item.id === 'arrows');
		assert.equal(remainingArrows.quantity, 1);
		assert.equal(remainingArrows.charges, 10);
		const sprayRecord = repository.get('alice');
		sprayRecord.state.trainerInventory.items.find(item => item.id === 'bow').equipped = false;
		sprayRecord.state.trainerInventory.items.push(
			{ id: 'spray', itemId: 'spray-pimenta', quantity: 1, location: 'bag', equipped: true,
				equippedHand: 'left', charges: 0 },
			{ id: 'spray-refill', itemId: 'refil-spray-pimenta', quantity: 1, location: 'bag',
				equipped: false, charges: 4 });
		repository.set(sprayRecord);
		assert.throws(() => service.attackWithTrainerWeapon('player', { characterId: 'alice',
			instanceId: 'spray', targetType: 'other-npc', targetName: 'Alvo' }), /recarregue/i);
		service.changeTrainerEquipment('player', { action: 'refill', instanceId: 'spray',
			refillInstanceId: 'spray-refill', expectedRevision: service.getTrainerEquipment('player').inventory.revision });
		service.attackWithTrainerWeapon('player', { characterId: 'alice', instanceId: 'spray',
			targetType: 'other-npc', targetName: 'Alvo' });
		assert.equal(repository.get('alice').state.trainerInventory.items.find(item => item.id === 'spray').charges, 3);
	});
	it('defines damage for firearms and effects for weapons without damage', () => {
		for (const [id, damage, dice, sides] of [
			['revolver', '2d10 + Destreza', 2, 10],
			['espingarda', '3d8 + Destreza', 3, 8],
			['rifle', '3d10 + Destreza', 3, 10],
		]) {
			assert.equal(RPG_EQUIPMENT_CATALOG[id].weaponDamage, damage);
			assert.equal(rpgEquipmentAttackProfile(id).dice, dice);
			assert.equal(rpgEquipmentAttackProfile(id).sides, sides);
		}
		for (const item of Object.values(RPG_EQUIPMENT_CATALOG).filter(entry =>
			entry.equipSlot === 'hand' && entry.category !== 'shield')) {
			assert(item.weaponDamage || item.weaponEffect, `Arma sem dano ou efeito: ${item.id}`);
		}
		assert.match(RPG_EQUIPMENT_CATALOG['spray-pimenta'].weaponEffect, /Cego/);
	});
	it('equips two one-handed items or one two-handed item without removing their weight', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		const player = character(service, 'Armada');
		for (const itemId of ['faca', 'escudo', 'arco-curto']) {
			const { inventory } = service.getTrainerEquipment(player.token);
			service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'armada',
				expectedRevision: inventory.revision, itemId, quantity: 1 });
		}
		const change = (itemId, equipped, hand) => {
			const { inventory } = service.getTrainerEquipment(player.token);
			const item = inventory.items.find(entry => entry.itemId === itemId);
			return service.changeTrainerEquipment(player.token, { action: 'equip',
				expectedRevision: inventory.revision, instanceId: item.id, equipped, hand });
		};
		const before = service.getTrainerEquipment(player.token).inventory;
		const weight = rpgEquipmentWeight(before.items, 'bag');
		const spaces = rpgEquipmentSlots(before.items);
		change('faca', true, 'left');
		change('escudo', true, 'right');
		assert.throws(() => change('arco-curto', true), /duas mãos/i);
		assert.equal(service.getBag(player.token).items.some(item => item.equipmentItemId === 'faca'), false);
		assert.equal(service.getBag(player.token).items.some(item => item.equipmentItemId === 'escudo'), false);
		assert.equal(rpgEquipmentWeight(service.getTrainerEquipment(player.token).inventory.items, 'bag'), weight);
		assert.equal(rpgEquipmentSlots(service.getTrainerEquipment(player.token).inventory.items), spaces - 4);
		change('faca', false);
		change('escudo', false);
		change('arco-curto', true);
		assert.throws(() => change('faca', true, 'left'), /mãos devem estar livres|Mão ocupada/);
		assert.equal(service.getTrainerEquipment(player.token).inventory.items.find(item =>
			item.itemId === 'arco-curto').equipped, true);
	});
	it('provides a local sprite for every trainer equipment entry', () => {
		const icons = new Set();
		const images = new Set();
		for (const item of Object.values(RPG_EQUIPMENT_CATALOG)) {
			assert.match(item.icon, /^\.\/assets\/item-icons\/equipment-[a-z0-9-]+\.png\?v=/);
			assert(!icons.has(item.icon), `Sprite repetido: ${item.name}`);
			icons.add(item.icon);
			const file = path.join(__dirname, '../../server/static/rpg', item.icon.slice(2).split('?')[0]);
			assert(fs.existsSync(file), `${item.name}: ${file}`);
			const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
			assert(!images.has(hash), `Arte repetida: ${item.name}`);
			images.add(hash);
		}
	});
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
	it('grants the controlled-equipment license with a completed sheet and restores it on older sheets', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		const player = character(service, 'Licenciada');
		service.chooseTrainerAttributeMethod(player.token, 'standard');
		service.completeTrainerCreation(player.token, { classId: 'arqueologo', attributes,
			optionalSkills: ['percepcao', 'sobrevivencia', 'pilotagem:automoveis'], gearChoices: { arma: 'faca' } });
		assert(rpgHasLicense(service.getTrainerEquipment(player.token).inventory, 'contencao', Date.now()));
		const oldRecord = repository.get('licenciada');
		oldRecord.state.trainerInventory.licenses = [];
		repository.set(oldRecord);
		assert(service.getBag(master.token, 'licenciada').licenses.some(license =>
			license.id === 'contencao' && license.valid));
		assert(rpgHasLicense(repository.get('licenciada').state.trainerInventory, 'contencao', Date.now()));
		service.setTrainerLicense(master.token, 'licenciada',
			{ id: 'contencao', status: 'revoked', issuedBy: '' });
		assert.equal(rpgHasLicense(service.getTrainerEquipment(player.token).inventory, 'contencao', Date.now()), false);
		assert.equal(service.getBag(master.token, 'licenciada').licenses.find(license =>
			license.id === 'contencao').valid, false);
		service.setTrainerLicense(master.token, 'licenciada',
			{ id: 'contencao', status: 'active', issuedBy: '' }, true);
		assert(rpgHasLicense(service.getTrainerEquipment(player.token).inventory, 'contencao', Date.now()));
		assert.throws(() => service.setTrainerLicense(master.token, 'licenciada',
			{ id: 'institucional', status: 'active', issuedBy: '' }), /Licença inválida/);
	});
	it('exposes the same license fees that the Master charges', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Taxada');
		const view = service.getBag(master.token, 'taxada');
		assert.equal(view.licenseFees.veiculo, 2500);
		assert.equal(view.licenseFees.veiculo, RPG_TRAINER_LICENSE_FEES.veiculo);
		assert.equal(view.licenseFees['arma-fogo'], 5000);
		assert.equal(view.licenseFees.restrito, 5000);
		assert.equal(view.licenseFees.institucional, undefined);
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
		const bag = service.getBag(master.token, 'cozinheira', { category: 'trainer-exploration' });
		assert.equal(bag.items.find(item => item.name === 'Alimento').quantity, 2);
		assert.match(bag.items.find(item => item.name === 'Alimento').description,
			/4 porções de refeição.*roleplay/);
		assert.equal(bag.items.some(item => /Refeição Preparada/.test(item.name)), false);
	});
	it('separates trainer equipment and reports carried weight in the Bag', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Exploradora');
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'exploradora',
			expectedRevision: 0, itemId: 'kit-explorador', quantity: 1 });
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'exploradora',
			expectedRevision: 1, itemId: 'faca', quantity: 1 });
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'exploradora',
			expectedRevision: 2, itemId: 'alimento', quantity: 2 });
		const bag = service.getBag(master.token, 'exploradora');
		assert.equal(bag.categories.find(category => category.id === 'trainer-exploration').name, 'Exploração e acampamento');
		assert(bag.items.some(item => item.equipmentItemId === 'kit-explorador' && item.category === 'trainer-kits'));
		assert(bag.items.some(item => item.equipmentItemId === 'faca' && item.category === 'trainer-weapons'));
		assert(bag.items.some(item => item.equipmentItemId === 'alimento' && item.category === 'trainer-exploration' && item.quantity === 2));
		assert(bag.weight.currentKg > 0);
		assert(bag.weight.comfortableKg < bag.weight.heavyKg);
		assert(bag.items.every(item => item.icon === RPG_EQUIPMENT_CATALOG[item.equipmentItemId].icon && item.sprite === null));
		const knife = bag.items.find(item => item.equipmentItemId === 'faca');
		const moved = service.changeTrainerEquipment(master.token, { action: 'move', characterId: 'exploradora',
			expectedRevision: 3, instanceId: knife.equipmentInstanceId, location: 'bank' });
		assert.equal(moved.inventory.items.find(item => item.id === knife.equipmentInstanceId).location, 'bank');
		const bank = service.getTrainerItemBank(master.token, 'exploradora');
		assert(bank.items.some(item => item.id === knife.equipmentInstanceId && item.category === 'trainer-weapons'));
		assert.equal(bank.itemTypes, 1);
		assert.equal(bank.balance, 0);
		assert.equal(service.getBag(master.token, 'exploradora').categories.some(category =>
			category.id === 'stored-items'), false);
		assert(service.getBag(master.token, 'exploradora').weight.currentKg < bag.weight.currentKg);
		const food = bag.items.find(item => item.equipmentItemId === 'alimento');
		const discarded = service.changeTrainerEquipment(master.token, { action: 'discard', characterId: 'exploradora',
			expectedRevision: moved.inventory.revision, instanceId: food.equipmentInstanceId, quantity: 1 });
		assert.equal(discarded.inventory.items.find(item => item.id === food.equipmentInstanceId).quantity, 1);
	});
	it('places ammunition with weapons and kit refills with kits', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Organizador');
		let revision = 0;
		for (const itemId of ['municao-revolver', 'refil-medico', 'refil-spray-pimenta',
			'refil-filtro', 'refil-energia', 'reserva-energia-veiculo']) {
			revision = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'organizador',
				expectedRevision: revision, itemId }).inventory.revision;
		}
		const bag = service.getBag(master.token, 'organizador');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'municao-revolver').category, 'trainer-weapons');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'refil-medico').category, 'trainer-kits');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'refil-spray-pimenta').category, 'trainer-weapons');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'refil-filtro').category, 'trainer-kits');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'refil-energia').category, 'trainer-kits');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'reserva-energia-veiculo').category, 'trainer-vehicles');
	});
	it('groups all food and parked vehicles in their requested sections without carrying vehicle weight', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Viajante');
		let revision = 0;
		for (const itemId of ['racao', 'alimento', 'racao-pokemon', 'racao-artesanal-pokemon', 'carroca-leve']) {
			revision = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'viajante',
				expectedRevision: revision, itemId }).inventory.revision;
		}
		const bag = service.getBag(master.token, 'viajante');
		for (const itemId of ['racao', 'alimento', 'racao-pokemon', 'racao-artesanal-pokemon']) {
			assert.equal(bag.items.find(item => item.equipmentItemId === itemId).category, 'trainer-exploration');
		}
		const vehicle = bag.items.find(item => item.equipmentItemId === 'carroca-leve');
		assert.equal(vehicle.category, 'trainer-vehicles');
		assert.equal(vehicle.equipmentLocation, 'vehicle');
		assert.equal(bag.categories.some(category => category.id === 'food-items' || category.id === 'trainer-supplies'), false);
		assert(bag.weight.currentKg < 60);
	});
	it('places outfits and outfit improvements with weapons and protection', () => {
		const service = new RPGLoginService({ masterCode: 'teste', repository: new RPGMemoryCharacterRepository() });
		const master = service.loginMaster('teste');
		character(service, 'Protegida');
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'protegida',
			expectedRevision: 0, itemId: 'roupa-exploracao-leve' });
		service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'protegida',
			expectedRevision: 1, itemId: 'colete-flutuacao' });
		const bag = service.getBag(master.token, 'protegida');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'roupa-exploracao-leve').category, 'trainer-weapons');
		assert.equal(bag.items.find(item => item.equipmentItemId === 'colete-flutuacao').category, 'trainer-weapons');
		assert.equal(bag.categories.some(category => category.id === 'trainer-outfits'), false);
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
	it('shares vehicle cargo between active players with atomic Bag and owner revisions', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		character(service, 'Alice');
		character(service, 'Bob');
		character(service, 'Caio');
		const vehicleGrant = service.changeTrainerEquipment(master.token, { action: 'grant',
			characterId: 'alice', expectedRevision: 0, itemId: 'carro' });
		const vehicle = vehicleGrant.inventory.items.find(item => item.itemId === 'carro');
		const food = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'bob',
			expectedRevision: 0, itemId: 'alimento' }).inventory.items.find(item => item.itemId === 'alimento');
		for (const id of ['alice', 'bob', 'caio']) {
			const record = repository.get(id);
			record.tableId = id === 'caio' ? 'outra-mesa' : 'mesa-teste'; record.accountId = id;
			repository.set(record);
		}
		let activeId = 'bob';
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: activeId });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const bobRecord = repository.get('bob');
		bobRecord.state.inventory.bag = RPGBagSystem.add(bobRecord.state.inventory.bag, 'potion', 2).bag;
		repository.set(bobRecord);
		const listed = service.getSharedVehicles('player');
		assert(listed.some(entry => entry.vehicleId === vehicle.id && entry.ownerName === 'Alice'));
		assert(listed.every(entry => entry.ownerName !== 'Caio'));
		let view = service.getSharedVehicle('player', vehicle.id);
		assert.equal(view.maxSlots > 0, true);
		view = service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 2, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision });
		assert.equal(view.items.find(item => item.itemId === 'potion').quantity, 2);
		assert.equal(repository.get('bob').state.inventory.bag.items.length, 0);
		assert.throws(() => service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedOwnerRevision: 0,
			expectedActorRevision: 0, expectedBagRevision: 1 }), /mudou/);
		activeId = 'alice';
		assert.equal(service.getSharedVehicle('player', vehicle.id).items.find(item => item.itemId === 'potion').quantity, 2);
		view = service.getSharedVehicle('player', vehicle.id);
		service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'withdraw',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision });
		assert.equal(RPGBagSystem.getQuantity(repository.get('alice').state.inventory.bag, 'potion'), 1);
		activeId = 'bob';
		view = service.getSharedVehicle('player', vehicle.id);
		view = service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'deposit',
			kind: 'equipment', instanceId: food.id, quantity: 1, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision });
		const cargo = view.items.find(item => item.itemId === 'alimento');
		assert.equal(cargo.kind, 'equipment');
		activeId = 'alice';
		view = service.getSharedVehicle('player', vehicle.id);
		service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'withdraw',
			kind: 'equipment', instanceId: cargo.id, quantity: 1, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision });
		assert(service.getTrainerEquipment('player').inventory.items.some(item =>
			item.itemId === 'alimento' && item.location === 'bag'));
		activeId = 'bob';
		view = service.getSharedVehicle('player', vehicle.id);
		const beforeBob = structuredClone(repository.get('bob').state.inventory.bag);
		const beforeAlice = structuredClone(repository.get('alice').state.trainerInventory);
		service.mysqlPersistence = { transaction: action => { action(); throw new Error('db failed'); } };
		assert.throws(() => service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'withdraw',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision }), /db failed/);
		assert.deepEqual(repository.get('bob').state.inventory.bag, beforeBob);
		assert.deepEqual(repository.get('alice').state.trainerInventory, beforeAlice);
	});
	it('retira a própria munição restrita da carga sem exigir uma nova licença', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		character(service, 'Alice');
		let inventory = service.changeTrainerEquipment(master.token, { action: 'grant',
			characterId: 'alice', expectedRevision: 0, itemId: 'carro' }).inventory;
		inventory = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'alice',
			expectedRevision: inventory.revision, itemId: 'municao-espingarda', quantity: 2 }).inventory;
		const vehicle = inventory.items.find(item => item.itemId === 'carro');
		const ammo = inventory.items.find(item => item.itemId === 'municao-espingarda');
		const record = repository.get('alice');
		record.tableId = 'mesa-teste'; record.accountId = 'alice'; repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'alice' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		let view = service.getSharedVehicle('player', vehicle.id);
		view = service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'deposit',
			kind: 'equipment', instanceId: ammo.id, quantity: 2,
			expectedOwnerRevision: view.ownerRevision, expectedActorRevision: view.actorRevision,
			expectedBagRevision: view.bagRevision });
		const cargo = view.items.find(item => item.itemId === 'municao-espingarda');
		service.changeSharedVehicle('player', { vehicleId: vehicle.id, action: 'withdraw',
			kind: 'equipment', instanceId: cargo.id, quantity: 2,
			expectedOwnerRevision: view.ownerRevision, expectedActorRevision: view.actorRevision,
			expectedBagRevision: view.bagRevision });
		assert.equal(service.getTrainerEquipment('player').inventory.items.find(item =>
			item.itemId === 'municao-espingarda').quantity, 2);
		assert.throws(() => service.changeTrainerEquipment('player', { action: 'move',
			expectedRevision: service.getTrainerEquipment('player').inventory.revision,
			instanceId: vehicle.id, location: 'bank' }), /não podem ser guardados no banco/);
	});
	it('lets the Master block one vehicle cargo without hiding other shared vehicles', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		character(service, 'Alice'); character(service, 'Bob');
		const first = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'alice',
			expectedRevision: 0, itemId: 'carro' });
		const second = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'alice',
			expectedRevision: first.inventory.revision, itemId: 'carro' });
		const [blockedVehicle, openVehicle] = second.inventory.items.filter(item => item.itemId === 'carro');
		for (const id of ['alice', 'bob']) {
			const record = repository.get(id);
			record.tableId = 'mesa-teste'; record.accountId = id; repository.set(record);
		}
		const originalGetSession = service.getSession.bind(service);
		let activeId = 'bob';
		service.getSession = token => token === 'master-token' ?
			{ mode: 'master', role: 'master', platformTableId: 'mesa-teste' } :
			{ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: activeId };
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const bob = repository.get('bob');
		bob.state.inventory.bag = RPGBagSystem.add(bob.state.inventory.bag, 'potion', 1).bag;
		repository.set(bob);
		const view = service.getSharedVehicle('player', blockedVehicle.id);
		service.changeSharedVehicle('player', { vehicleId: blockedVehicle.id, action: 'deposit',
			kind: 'pokemon', itemId: 'potion', quantity: 1, expectedOwnerRevision: view.ownerRevision,
			expectedActorRevision: view.actorRevision, expectedBagRevision: view.bagRevision });
		const inventories = service.getCharacterSharedInventories('master-token', 'alice');
		assert.equal(inventories.vehicles.length, 2);
		assert.throws(() => service.setCharacterSharedInventoryAccess('master-token', 'bob',
			`vehicle:${blockedVehicle.id}`, false), /não pertence/);
		assert.throws(() => service.setCharacterSharedInventoryAccess('player', 'alice',
			`vehicle:${blockedVehicle.id}`, false), /master/);
		service.setCharacterSharedInventoryAccess('master-token', 'alice', `vehicle:${blockedVehicle.id}`, false);
		assert.equal(service.getSharedVehicles('player').length, 1);
		assert.equal(service.getSharedVehicles('player')[0].vehicleId, openVehicle.id);
		assert.throws(() => service.getSharedVehicle('player', blockedVehicle.id), /indisponível/);
		assert.throws(() => service.changeSharedVehicle('player', { vehicleId: blockedVehicle.id,
			action: 'withdraw', kind: 'pokemon', itemId: 'potion', quantity: 1 }), /indisponível/);
		activeId = 'alice';
		assert.equal(service.getSharedVehicles('player').length, 1);
		assert.throws(() => service.getSharedVehicle('player', blockedVehicle.id), /indisponível/);
		service.getSession = token => token === 'master-token' ?
			{ mode: 'player', role: 'master', platformTableId: 'mesa-teste', viewAsCharacterId: 'bob' } :
			{ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: activeId };
		assert.equal(service.getSharedVehicles('master-token').length, 1);
		service.getSession = token => token === 'master-token' ?
			{ mode: 'master', role: 'master', platformTableId: 'mesa-teste' } :
			{ mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: activeId };
		assert.equal(service.getTrainerEquipment('player').inventory.pokemonStorage.length, 0);
		assert.throws(() => service.changeTrainerEquipment('player', { action: 'movePokemon',
			expectedRevision: service.getTrainerEquipment('player').inventory.revision,
			expectedBagRevision: service.getBag('player').revision, itemId: 'potion', quantity: 1,
			sourceLocation: 'vehicle', location: 'bag', vehicleId: blockedVehicle.id }), /bloqueou/);
		service.setCharacterSharedInventoryAccess('master-token', 'alice', `vehicle:${blockedVehicle.id}`, true);
		assert.equal(service.getSharedVehicles('player').length, 2);
		service.getSession = originalGetSession;
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
		const bank = service.getTrainerItemBank(player.token);
		assert.equal(bank.itemTypes, 1);
		assert.equal(bank.items.find(item => item.itemId === 'potion').category, 'medicines');
		assert.equal(bank.items.find(item => item.itemId === 'potion').quantity, 3);
		assert.match(bank.items.find(item => item.itemId === 'potion').icon, /item-icons\/potion\.png/);
		assert.equal(bank.categories.find(category => category.id === 'medicines').quantity, 3);
		assert.equal(bank.balance, service.getBank(player.token).balance);
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
	it('reuses the existing item-sheet sprite for bank items without a local icon', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const player = character(service, 'Viajante');
		const record = repository.get('viajante');
		record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, 'pokeball', 1).bag;
		repository.set(record);
		service.changeTrainerEquipment(player.token, { action: 'movePokemon',
			expectedRevision: 0, expectedBagRevision: 1, itemId: 'pokeball', quantity: 1,
			sourceLocation: 'bag', location: 'bank' });
		const item = service.getTrainerItemBank(player.token).items.find(entry => entry.itemId === 'pokeball');
		assert.equal(item.icon, null);
		assert.equal(Number.isInteger(item.sprite), true);
	});
	it('collapses the bank for blocked players and rejects both item-transfer types', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		const master = service.loginMaster('teste');
		const player = character(service, 'Viajante');
		const record = repository.get('viajante');
		record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, 'potion', 1).bag;
		repository.set(record);
		const granted = service.changeTrainerEquipment(master.token, { action: 'grant', characterId: 'viajante',
			expectedRevision: 0, itemId: 'faca' });
		const knife = granted.inventory.items.find(item => item.itemId === 'faca');
		service.setCharacterPageAccess(master.token, 'viajante', 'bank', false);
		assert.equal(service.getBag(player.token).bankAvailable, false);
		assert.equal(service.getBag(master.token, 'viajante').bankAvailable, true);
		assert.throws(() => service.getTrainerItemBank(player.token), /bloqueou o acesso ao banco/);
		assert.throws(() => service.changeTrainerEquipment(player.token, { action: 'movePokemon',
			expectedRevision: granted.inventory.revision, expectedBagRevision: 1,
			itemId: 'potion', quantity: 1, sourceLocation: 'bag', location: 'bank' }),
		/bloqueou o acesso ao banco/);
		assert.throws(() => service.changeTrainerEquipment(player.token, { action: 'move',
			expectedRevision: granted.inventory.revision, instanceId: knife.id, location: 'bank' }),
		/bloqueou o acesso ao banco/);
		assert.equal(service.getTrainerEquipment(master.token, 'viajante').inventory.items.find(item => item.id === knife.id).location, 'bag');
	});
});
