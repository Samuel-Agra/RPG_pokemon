'use strict';

const assert = require('assert').strict;
const {
	RPG_TRAINER_CLASSES, RPG_TRAINER_TALENTS, RPG_TRAINER_CLASS_FEATURES,
	RPG_TRAINER_LEVEL_XP, createRPGPendingTrainerSheet, chooseRPGTrainerTalent,
	rpgTrainerTalentCatalog, rpgTrainerClassFeatures, rpgTrainerDerivedStatistics,
	rpgTrainerSkillBonus, rpgTrainerResistanceBonus, rpgTrainerProficiency, rollRPGTrainerInitiative,
	rpgTrainerSkillAttributes,
	awardRPGTrainerXP, completeRPGTrainerSheet, RPGLoginService, RPGMemoryCharacterRepository,
} = require('../../dist/server/rpg-showdown');
const { rpgTrainerRollTalents, rpgResolveTrainerRollTalents } =
	require('../../dist/server/rpg-showdown/trainer-roll-talents');
const { rpgUseTrainerSheetTalent } = require('../../dist/server/rpg-showdown/trainer-active-talents');
const { rpgTrainerAddExhaustion, rpgTrainerApplyCondition, rpgTrainerSurvival } =
	require('../../dist/server/rpg-showdown/trainer-survival');
const { RPGBagSystem } = require('../../dist/sim/rpg-showdown');
const { RPG_ADVANCED_PROTOTYPES, rpgTechnologicalPrototypeChargeCost, rpgTechnologicalPrototypeLimit } =
	require('../../dist/server/rpg-showdown/trainer-technological-prototypes');
const { rpgEquipmentSlots, rpgEquipmentWeight } = require('../../dist/server/rpg-showdown/trainer-equipment');

function ready(classId, level = 1, overrides = {}) {
	return {
		...createRPGPendingTrainerSheet(), status: 'complete', classId, level,
		experience: RPG_TRAINER_LEVEL_XP[level - 1],
		attributes: { strength: 12, dexterity: 14, constitution: 13,
			intelligence: 14, wisdom: 12, charisma: 10 },
		hitPoints: { current: 20, maximum: 20, temporary: 0 },
		skills: { trained: ['atletismo', 'acrobacia', 'investigacao', 'conhecimento:arqueologia-fosseis'], focused: [] },
		proficiencies: ['kit-arqueologia'], ...overrides,
	};
}

describe('RPG trainer classes and talents', () => {
	it('Escudo Mental aparece apenas como bônus situacional de Vontade', () => {
		const psychic = ready('psiquico', 5);
		psychic.talents.class.push('psiquico:escudo-mental');
		const option = rpgTrainerRollTalents(psychic).find(entry => entry.id === 'psiquico:escudo-mental');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['resistance:will']);
		assert.equal(rpgResolveTrainerRollTalents(psychic, 'resistance', 'will', [option.key]).bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(psychic, 'resistance', 'will', []).bonus, 0);
		assert.throws(() => rpgResolveTrainerRollTalents(psychic, 'resistance', 'fortitude',
			[option.key]), /Talento indisponível/);
	});
	it('Terceiro Olho aplica Exaustão e só volta após sua remoção', () => {
		const psychic = ready('psiquico', 10);
		psychic.talents.apex = 'psiquico:terceiro-olho';
		const used = rpgUseTrainerSheetTalent(psychic, 'psiquico:terceiro-olho');
		assert.equal(used.exhaustion, 1);
		assert.equal(used.sheet.survival.exhaustion, 1);
		assert.throws(() => rpgUseTrainerSheetTalent(used.sheet, 'psiquico:terceiro-olho'),
			/indisponível enquanto houver Exaustão/);
		const rested = structuredClone(used.sheet);
		rested.survival.exhaustion = 0;
		assert.equal(rpgUseTrainerSheetTalent(rested, 'psiquico:terceiro-olho').exhaustion, 1);
		assert.throws(() => rpgUseTrainerSheetTalent(ready('psiquico', 10),
			'psiquico:terceiro-olho'), /não possui/);
	});
	it('Obra-Prima Modular combina duas funções, soma carga e volume e substitui a anterior', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const [id, accountId] of [['Tecnologo', 'ana'], ['Aliado', 'bia']]) {
			service.createCharacter({ characterName: id, playerName: accountId, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(id.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = accountId;
			record.state.trainerSheet = ready(id === 'Tecnologo' ? 'tecnologo' : 'atleta', 10);
			if (id === 'Tecnologo') record.state.trainerInventory = { version: 1, revision: 0,
				licenses: [], pokemonStorage: [], items: [{ id: 'kit-3', itemId: 'kit-tecnologico-3',
					quantity: 1, equipped: false, charges: 20, location: 'bag' }] };
			repository.set(record);
		}
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const creator = repository.get('tecnologo');
		creator.state.trainerSheet.talents.class.push('tecnologo:projeto-avancado');
		creator.state.trainerSheet.talents.apex = 'tecnologo:obra-prima-modular';
		repository.set(creator);
		assert.equal(service.getTrainerProgression('jogador').technologicalPrototype.canBuildMasterpiece, true);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'holofote-acompanhante', 'aliado', 'holofote-acompanhante'), /duas funções diferentes/);
		const wrongKit = repository.get('tecnologo');
		wrongKit.state.trainerInventory.items[0].itemId = 'kit-tecnologico-2';
		repository.set(wrongKit);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'holofote-acompanhante', 'aliado', 'microdrone-manipulador'), /nível 3/);
		wrongKit.state.trainerInventory.items[0].itemId = 'kit-tecnologico-3';
		repository.set(wrongKit);
		service.buildTrainerTechnologicalPrototype('jogador', 0,
			'holofote-acompanhante', 'aliado', 'microdrone-manipulador');
		const first = repository.get('aliado').state.trainerInventory.items.find(item =>
			item.itemId === 'obra-prima-modular');
		assert.deepEqual(first.prototypeComponents, ['holofote-acompanhante', 'microdrone-manipulador']);
		assert.equal(rpgEquipmentSlots([first]), 2);
		assert.equal(rpgEquipmentWeight([first]), 1.2);
		assert.equal(repository.get('tecnologo').state.trainerInventory.items[0].charges, 16);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'aliado' });
		const bag = service.getBag('jogador');
		const modularItem = bag.items.find(item =>
			item.id === `tecnologo:prototipo@${first.id}`);
		assert(modularItem?.description.includes('Holofote Acompanhante'));
		assert(modularItem?.description.includes('Microdrone Manipulador'));
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		service.buildTrainerTechnologicalPrototype('jogador', 0,
			'projetor-holografico', 'aliado', 'purificador-portatil');
		const after = repository.get('aliado').state.trainerInventory.items;
		assert.equal(after.find(item => item.id === first.id).prototypeActive, false);
		assert.equal(after.filter(item => item.itemId === 'obra-prima-modular' && item.prototypeActive).length, 1);
		assert.equal(repository.get('tecnologo').state.trainerSheet.technologicalPrototypes.length, 1);
	});
	it('Gênio Tecnológico oferece mínimo natural de 10 apenas em Tecnologia', () => {
		const technologist = ready('tecnologo', 10);
		technologist.talents.apex = 'tecnologo:genio-tecnologico';
		const option = rpgTrainerRollTalents(technologist).find(entry =>
			entry.id === 'tecnologo:genio-tecnologico');
		assert.equal(option.naturalFloor, 10);
		assert.deepEqual(option.targets, ['skill:tecnologia']);
		assert.equal(rpgResolveTrainerRollTalents(technologist, 'skill', 'tecnologia', [option.key]).naturalFloor, 10);
		assert.throws(() => rpgResolveTrainerRollTalents(technologist, 'skill', 'investigacao',
			[option.key]), /Talento indisponível/);
		assert.equal(rpgResolveTrainerRollTalents(technologist, 'skill', 'tecnologia', []).naturalFloor,
			undefined);
	});
	it('Firewall Pessoal exige Bloqueio Remoto', () => {
		const technologist = ready('tecnologo', 5);
		const option = () => rpgTrainerTalentCatalog(technologist)
			.find(entry => entry.id === 'tecnologo:firewall-pessoal');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(technologist,
			{ id: option().id }), /Falta um talento exigido/);
		technologist.talents.class.push('tecnologo:bloqueio-remoto');
		assert.equal(option().available, true);
	});
	it('Projeto Avançado libera nove dispositivos com kit II/III e custo reduzido', () => {
		assert.equal(RPG_ADVANCED_PROTOTYPES.length, 9);
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const [id, accountId] of [['Tecnologo', 'ana'], ['Aliado', 'bia']]) {
			service.createCharacter({ characterName: id, playerName: accountId, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(id.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = accountId;
			record.state.trainerSheet = ready(id === 'Tecnologo' ? 'tecnologo' : 'atleta', 5);
			if (id === 'Tecnologo') record.state.trainerInventory = { version: 1, revision: 0,
				licenses: [], pokemonStorage: [], items: [
					{ id: 'kit-1', itemId: 'kit-tecnologico-1', quantity: 1, equipped: false,
						charges: 5, location: 'bag' },
					{ id: 'kit-2', itemId: 'kit-tecnologico-2', quantity: 1, equipped: false,
						charges: 5, location: 'bag' },
				] };
			repository.set(record);
		}
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'drone-reconhecimento', 'aliado'), /ainda não aprendido/);
		const creator = repository.get('tecnologo');
		creator.state.trainerSheet.talents.class.push('tecnologo:projeto-avancado',
			'tecnologo:economia-de-componentes');
		repository.set(creator);
		const choices = service.getTrainerProgression('jogador').technologicalPrototype.options;
		assert.equal(choices.filter(entry => entry.advanced).length, 9);
		creator.state.trainerInventory.items.pop(); repository.set(creator);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'drone-reconhecimento', 'aliado'), /nível 2 ou 3/);
		creator.state.trainerInventory.items.push({ id: 'kit-2', itemId: 'kit-tecnologico-2',
			quantity: 1, equipped: false, charges: 2, location: 'bag' }); repository.set(creator);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'drone-reconhecimento', 'aliado'), /3 cargas disponíveis/);
		creator.state.trainerInventory.items[1].charges = 5; repository.set(creator);
		service.buildTrainerTechnologicalPrototype('jogador', 0, 'drone-reconhecimento', 'aliado');
		const stored = repository.get('tecnologo').state.trainerInventory.items;
		assert.equal(stored.find(item => item.id === 'kit-1').charges, 5);
		assert.equal(stored.find(item => item.id === 'kit-2').charges, 2);
		assert.equal(repository.get('aliado').state.trainerInventory.items.find(item =>
			item.itemId === 'drone-reconhecimento').prototypeActive, true);
		const apex = repository.get('tecnologo');
		apex.state.trainerSheet.talents.class.push('tecnologo:prototipos-paralelos',
			'tecnologo:prototipos-paralelos');
		apex.state.trainerSheet.talents.apex = 'tecnologo:central-de-prototipos';
		apex.state.trainerInventory.items.find(item => item.id === 'kit-2').charges = 10;
		repository.set(apex);
		assert.equal(rpgTechnologicalPrototypeLimit(apex.state.trainerSheet), 5);
		service.buildTrainerTechnologicalPrototype('jogador', 1, 'mapeador-tridimensional', 'aliado');
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 2,
			'sonda-resgate', 'aliado'), /até dois Projetos Avançados/);
		service.buildTrainerTechnologicalPrototype('jogador', 2, 'holofote-acompanhante', 'aliado');
		service.buildTrainerTechnologicalPrototype('jogador', 0, 'sonda-resgate', 'aliado');
		const after = repository.get('tecnologo');
		assert.equal(after.state.trainerSheet.technologicalPrototypes.length, 3);
		assert.equal(after.state.trainerSheet.technologicalPrototypes.filter(entry =>
			RPG_ADVANCED_PROTOTYPES.some(project => project.id === entry.itemId)).length, 2);
	});
	it('Protótipos Paralelos amplia até três vagas e substitui só a vaga escolhida', () => {
		const sheet = ready('tecnologo', 5);
		assert.equal(rpgTechnologicalPrototypeLimit(sheet), 1);
		sheet.talents.class.push('tecnologo:prototipos-paralelos');
		assert.equal(rpgTechnologicalPrototypeLimit(sheet), 2);
		sheet.talents.class.push('tecnologo:prototipos-paralelos');
		assert.equal(rpgTechnologicalPrototypeLimit(sheet), 3);
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const [id, accountId] of [['Tecnologo', 'ana'], ['Aliado', 'bia']]) {
			service.createCharacter({ characterName: id, playerName: accountId, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(id.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = accountId;
			record.state.trainerSheet = id === 'Tecnologo' ? sheet : ready('atleta');
			if (id === 'Tecnologo') record.state.trainerInventory = { version: 1, revision: 0,
				licenses: [], pokemonStorage: [], items: [{ id: 'kit-1', itemId: 'kit-tecnologico-1',
					quantity: 1, equipped: false, charges: 4, location: 'bag' }] };
			repository.set(record);
		}
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		for (const [slot, id] of ['holofote-acompanhante', 'navegador-retorno',
			'purificador-portatil'].entries()) {
			service.buildTrainerTechnologicalPrototype('jogador', slot, id, 'aliado');
		}
		const before = repository.get('aliado').state.trainerInventory.items.filter(item => item.prototypeCreatorId);
		assert.equal(before.length, 3);
		assert(before.every(item => item.prototypeActive));
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 3,
			'projetor-holografico', 'aliado'), /Espaço de protótipo inválido/);
		service.buildTrainerTechnologicalPrototype('jogador', 1, 'projetor-holografico', 'aliado');
		const after = repository.get('aliado').state.trainerInventory.items;
		assert.equal(after.find(item => item.id === before[0].id).prototypeActive, true);
		assert.equal(after.find(item => item.id === before[1].id).prototypeActive, false);
		assert.equal(after.find(item => item.id === before[2].id).prototypeActive, true);
		assert.equal(after.find(item => item.itemId === 'projetor-holografico').prototypeActive, true);
		assert.equal(repository.get('tecnologo').state.trainerSheet.technologicalPrototypes.length, 3);
	});
	it('Economia de Componentes reduz somente protótipos de duas ou mais cargas', () => {
		const technologist = ready('tecnologo', 5);
		assert.equal(rpgTechnologicalPrototypeChargeCost(technologist, 1), 1);
		assert.equal(rpgTechnologicalPrototypeChargeCost(technologist, 3), 3);
		technologist.talents.class.push('tecnologo:economia-de-componentes');
		assert.equal(rpgTechnologicalPrototypeChargeCost(technologist, 1), 1);
		assert.equal(rpgTechnologicalPrototypeChargeCost(technologist, 2), 1);
		assert.equal(rpgTechnologicalPrototypeChargeCost(technologist, 4), 3);
		assert.throws(() => rpgTechnologicalPrototypeChargeCost(technologist, 0), /Custo de protótipo inválido/);
		assert(!rpgTrainerTalentCatalog(technologist)
			.some(entry => entry.id === 'tecnologo:compatibilidade-universal'));
	});
	it('Tecnólogo escolhe área técnica, ativa seu bônus e recebe Inteligência de Engenharia Reversa', () => {
		const technologist = ready('tecnologo', 5);
		const option = rpgTrainerTalentCatalog(technologist)
			.find(entry => entry.id === 'tecnologo:especializacao-tecnica');
		assert.equal(option.choiceFields.variant, true);
		assert.deepEqual(option.variantChoices, ['hardware', 'programacao', 'redes', 'robotica',
			'seguranca-digital', 'telecomunicacoes', 'eletronica']);
		const specialized = chooseRPGTrainerTalent(technologist,
			{ id: option.id, variant: 'hardware' });
		const bonus = rpgTrainerRollTalents(specialized)
			.find(entry => entry.key === 'tecnologo:especializacao-tecnica@hardware');
		assert.equal(bonus.bonus, 2);
		assert.deepEqual(bonus.targets, ['skill:tecnologia']);
		assert.deepEqual(rpgTrainerTalentCatalog(specialized)
			.find(entry => entry.id === option.id).variantChoices,
		option.variantChoices.filter(area => area !== 'hardware'));
		const reverseEngineering = rpgTrainerTalentCatalog(specialized)
			.find(entry => entry.id === 'tecnologo:engenharia-reversa');
		assert.deepEqual(reverseEngineering.attributeChoices, []);
		const improved = chooseRPGTrainerTalent(specialized, { id: reverseEngineering.id });
		assert.equal(improved.attributes.intelligence, technologist.attributes.intelligence + 1);
	});
	it('constrói Protótipo Tecnológico como item pronto, entrega ao aliado e desativa o anterior', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const [id, accountId] of [['Tecnologo', 'ana'], ['Aliado', 'bia']]) {
			service.createCharacter({ characterName: id, playerName: accountId, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(id.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = accountId;
			record.state.trainerSheet = ready(id === 'Tecnologo' ? 'tecnologo' : 'atleta', 1);
			if (id === 'Tecnologo') record.state.trainerInventory = { version: 1, revision: 0,
				licenses: [], pokemonStorage: [], items: [{ id: 'kit-1', itemId: 'kit-tecnologico-1',
					quantity: 1, equipped: false, charges: 2, location: 'bag' }] };
			repository.set(record);
		}
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.buildTrainerTechnologicalPrototype('jogador', 0, 'holofote-acompanhante', 'aliado');
		assert.equal(repository.get('tecnologo').state.trainerInventory.items[0].charges, 1);
		const first = repository.get('aliado').state.trainerInventory.items.find(item =>
			item.itemId === 'holofote-acompanhante');
		assert.equal(first.prototypeActive, true);
		assert.equal(first.prototypeCreatorId, 'tecnologo');
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'aliado' });
		const bagItem = service.getBag('aliado', undefined, { category: 'talent-items' }).items.find(item =>
			item.id === `tecnologo:prototipo@${first.id}`);
		assert.equal(bagItem.icon, './assets/item-icons/prototipo-tecnologico.png');
		assert.equal(bagItem.weightKg, 0.5);
		assert.equal(bagItem.slots, 1);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'tecnologo' });
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 1,
			'navegador-retorno', 'aliado'), /Espaço de protótipo inválido/);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'navegador-retorno', 'fora-da-mesa'), /Destinatário indisponível/);
		service.buildTrainerTechnologicalPrototype('jogador', 0, 'navegador-retorno', 'aliado');
		const ally = repository.get('aliado');
		assert.equal(ally.state.trainerInventory.items.find(item => item.id === first.id).prototypeActive, false);
		assert.equal(ally.state.trainerInventory.items.find(item =>
			item.itemId === 'navegador-retorno').prototypeActive, true);
		assert.equal(repository.get('tecnologo').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.buildTrainerTechnologicalPrototype('jogador', 0,
			'projetor-holografico', 'aliado'), /carga disponível/);
	});
	it('oferece Registro de Campo e Rastreador de Espécies nas perícias adequadas', () => {
		const master = ready('mestre-pokemon', 5);
		master.talents.class.push('mestre-pokemon:registro-de-campo',
			'mestre-pokemon:rastreador-de-especies');
		const options = rpgTrainerRollTalents(master);
		const fieldRecord = options.find(option => option.id === 'mestre-pokemon:registro-de-campo');
		const tracker = options.find(option => option.id === 'mestre-pokemon:rastreador-de-especies');
		assert.deepEqual(fieldRecord.targets,
			['skill:conhecimento:pokemon', 'skill:natureza', 'skill:sobrevivencia']);
		assert.equal(fieldRecord.bonus, 2);
		assert.deepEqual(tracker.targets, ['skill:conhecimento:pokemon', 'skill:sobrevivencia']);
		assert.equal(tracker.bonus, 2);
	});
	it('Observador de Formas oferece bônus opcional nas perícias de busca', () => {
		const master = ready('mestre-pokemon', 5);
		master.talents.class.push('mestre-pokemon:observador-de-formas');
		const option = rpgTrainerRollTalents(master)
			.find(entry => entry.id === 'mestre-pokemon:observador-de-formas');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets,
			['skill:percepcao', 'skill:sobrevivencia', 'skill:conhecimento:pokemon']);
	});
	it('Auxiliar Pokémon só aparece com Pokémon da equipe acima de 50 de Amizade', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'MestrePokemon', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('mestrepokemon');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('mestre-pokemon', 5, {
			talents: { general: [], class: ['mestre-pokemon:auxiliar-pokemon'], apex: null },
		});
		record.state.box.party[0].pokemon.rpg.friendship = 50;
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'mestrepokemon' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const options = () => service.getTrainerAllyRollTalents('jogador', 'mestrepokemon');
		assert.equal(options().some(entry => entry.id === 'mestre-pokemon:auxiliar-pokemon'), false);
		assert.throws(() => rpgResolveTrainerRollTalents(record.state.trainerSheet, 'skill',
			'percepcao', ['mestre-pokemon:auxiliar-pokemon'], options()), /indisponível/);
		const friendlier = repository.get('mestrepokemon');
		friendlier.state.box.party[0].pokemon.rpg.friendship = 51;
		repository.set(friendlier);
		const assistant = options().find(entry => entry.id === 'mestre-pokemon:auxiliar-pokemon');
		assert.equal(assistant.bonus, 2);
		assert.deepEqual(assistant.targets, ['skill:*']);
		assert.equal(rpgResolveTrainerRollTalents(friendlier.state.trainerSheet, 'skill',
			'percepcao', [assistant.key], options()).bonus, 2);
		assert.equal(rpgResolveTrainerRollTalents(friendlier.state.trainerSheet, 'skill',
			'captura', [assistant.key], options()).bonus, 2);
		friendlier.state.box.party[0].pokemon.rpg.friendship = 50;
		repository.set(friendlier);
		assert.equal(options().some(entry => entry.id === assistant.id), false);
	});
	it('Rotina Confortável aumenta a Amizade da equipe só no primeiro descanso longo em 24 horas', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0 });
		service.createCharacter({ characterName: 'MestrePokemon', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('mestrepokemon');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('mestre-pokemon', 5, {
			talents: { general: [], class: ['mestre-pokemon:rotina-confortavel'], apex: null },
		});
		record.state.box.party[0].pokemon.rpg.friendship = 252;
		repository.set(record);
		service.getSession = () => ({ role: 'master', mode: 'master', platformTableId: 'mesa-teste' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		service.applyCampaignRest('teste', 'long', 'comfort-rest-1');
		assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 254);
		service.applyCampaignRest('teste', 'long', 'comfort-rest-2');
		assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 254);
		service.campaignSettings.currentDateTime = '2026-10-19T12:00:00.000Z';
		service.applyCampaignRest('teste', 'long', 'comfort-rest-3');
		assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 255);
		assert.equal(service.applyCampaignRest('teste', 'long', 'comfort-rest-3').repeated, true);
		assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 255);
	});
	it('Companheiros de Jornada concede +5 de Amizade no descanso longo e acumula com Rotina Confortável', () => {
		for (const [hasRoutine, expected] of [[false, 252], [true, 254]]) {
			const repository = new RPGMemoryCharacterRepository();
			const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0 });
			service.createCharacter({ characterName: 'MestrePokemon', playerName: 'Ana', avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get('mestrepokemon');
			record.tableId = 'mesa-teste'; record.accountId = 'ana';
			record.state.trainerSheet = ready('mestre-pokemon', 10, {
				talents: { general: [], class: hasRoutine ? ['mestre-pokemon:rotina-confortavel'] : [],
					apex: 'mestre-pokemon:companheiros-de-jornada' },
			});
			record.state.box.party[0].pokemon.rpg.friendship = 247;
			repository.set(record);
			service.getSession = () => ({ role: 'master', mode: 'master', platformTableId: 'mesa-teste' });
			service.requireMasterRole = () => {};
			service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
			service.applyCampaignRest('teste', 'short', 'journey-short-rest');
			assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 247);
			service.applyCampaignRest('teste', 'long', 'journey-rest-1');
			assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, expected);
			assert.equal(service.applyCampaignRest('teste', 'long', 'journey-rest-1').repeated, true);
			service.applyCampaignRest('teste', 'long', 'journey-rest-2');
			assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, expected);
			service.campaignSettings.currentDateTime = '2026-10-19T12:00:00.000Z';
			service.applyCampaignRest('teste', 'long', 'journey-rest-3');
			assert.equal(repository.get('mestrepokemon').state.box.party[0].pokemon.rpg.friendship, 255);
		}
	});
	it('Capturador Especialista oferece apenas a escolha de Destreza ou Sabedoria na ficha', () => {
		const master = ready('mestre-pokemon', 5);
		const option = rpgTrainerTalentCatalog(master)
			.find(entry => entry.id === 'mestre-pokemon:capturador-especialista');
		assert.deepEqual(option.attributeChoices, ['dexterity', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(master, { id: option.id }), /Escolha um atributo/);
		for (const attribute of option.attributeChoices) {
			const chosen = chooseRPGTrainerTalent(master, { id: option.id, attribute });
			assert.equal(chosen.attributes[attribute], master.attributes[attribute] + 1);
		}
	});
	it('exige nível 7 para Indução Hipnótica do Mentalista', () => {
		const before = ready('mentalista', 5);
		const after = ready('mentalista', 7);
		assert.equal(rpgTrainerTalentCatalog(before).find(entry =>
			entry.id === 'mentalista:inducao-hipnotica').available, false);
		assert.throws(() => chooseRPGTrainerTalent(before,
			{ id: 'mentalista:inducao-hipnotica' }), /Nível insuficiente/);
		assert.equal(rpgTrainerTalentCatalog(after).find(entry =>
			entry.id === 'mentalista:inducao-hipnotica').available, true);
	});
	it('Recuperação Extraordinária acompanha o paciente escolhido a cada descanso longo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0 });
		for (const name of ['Medico', 'Paciente', 'Outro']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', name === 'Medico' ? 10 : 1,
				{ hitPoints: { current: 1, maximum: 40, temporary: 0 } });
			if (name === 'Medico') record.state.trainerSheet.talents.apex = 'medico:recuperacao-extraordinaria';
			if (name === 'Paciente') {
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'queimado', source: 'teste' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'paralisado', source: 'teste' });
			}
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		assert.deepEqual(service.setExtraordinaryRecoveryPatient('teste', 'paciente'),
			{ patientId: 'paciente', patientName: 'Paciente' });
		service.applyCampaignRest('teste', 'long', 'extraordinary-rest-1');
		const treated = repository.get('paciente').state.trainerSheet;
		const untreated = repository.get('outro').state.trainerSheet;
		assert(treated.hitPoints.current > untreated.hitPoints.current + 8);
		assert.deepEqual(rpgTrainerSurvival(treated).conditions.map(condition => condition.id), ['paralisado']);
		assert.equal(repository.get('medico').state.trainerSheet.extraordinaryRecoveryPatientId, 'paciente');
		service.campaignSettings.currentDateTime = '2026-10-19T12:00:00.000Z';
		const patient = repository.get('paciente');
		patient.state.trainerSheet.hitPoints.current = 1;
		repository.set(patient);
		service.applyCampaignRest('teste', 'long', 'extraordinary-rest-2');
		assert(repository.get('paciente').state.trainerSheet.hitPoints.current > untreated.hitPoints.current + 8);
		assert.deepEqual(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet).conditions, []);
		assert.deepEqual(service.setExtraordinaryRecoveryPatient('teste', null),
			{ patientId: null, patientName: null });
	});
	it('Descansos não movem o relógio e a Recuperação Assistida cura no descanso longo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Outro']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 1,
				{ hitPoints: { current: 5, maximum: 20, temporary: 0 } });
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		service.random = () => 0;
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		const rewardOwner = repository.get('paciente');
		rewardOwner.state.box.party[0].metadata = {
			...rewardOwner.state.box.party[0].metadata, trainingReward: true,
		};
		repository.set(rewardOwner);
		const result = service.scheduleAssistedRecovery('teste', {
			requestId: 'recovery-test-1', patientIds: ['paciente', 'outro'],
		});
		assert.equal(result.healing, 3);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 5);
		assert.throws(() => service.scheduleAssistedRecovery('teste',
			{ requestId: 'recovery-test-2', patientIds: ['paciente'] }), /já preparada/);
		assert.equal(service.scheduleAssistedRecovery('teste',
			{ requestId: 'recovery-test-1', patientIds: ['paciente', 'outro'] }).repeated, true);
		service.advanceCampaignTime('teste', 1);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 5);
		assert.equal(repository.get('paciente').state.box.party[0].metadata.trainingReward, true);
		service.advanceCampaignTime('teste', 8);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 5);
		const beforeRest = service.campaignSettings.currentDateTime;
		service.applyCampaignRest('teste', 'short', 'rest-test-short-1');
		assert.equal(service.campaignSettings.currentDateTime, beforeRest);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 5);
		assert.equal(repository.get('paciente').state.trainerSheet.shortRestCycle, 1);
		assert.equal(repository.get('paciente').state.box.party[0].metadata.trainingReward, undefined);
		assert.equal(service.applyCampaignRest('teste', 'short', 'rest-test-short-2').rested, 0);
		service.applyCampaignRest('teste', 'long', 'rest-test-long-1');
		assert.equal(service.campaignSettings.currentDateTime, beforeRest);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 10);
		assert.equal(repository.get('outro').state.trainerSheet.hitPoints.current, 10);
		assert.equal(repository.get('paciente').state.trainerSheet.assistedRecoveryPending, undefined);
		assert.equal(repository.get('paciente').state.trainerSheet.talentRestCycle, 1);
		assert.equal(service.applyCampaignRest('teste', 'long', 'rest-test-long-1').repeated, true);
		assert.equal(service.applyCampaignRest('teste', 'long', 'rest-test-long-2').rested, 0);
		service.advanceCampaignTime('teste', 8);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 10);
		assert.equal(repository.get('paciente').state.trainerSheet.talentRestCycle, 1);
	});
	it('Recuperação Intensiva consome uma carga por paciente e agenda a cura maior', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Outro']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:recuperacao-intensiva'] : [], apex: null } });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'intensive-1',
			patientIds: ['paciente', 'outro'], intensive: true }), /uma carga/);
		const stocked = repository.get('medico');
		stocked.state.trainerInventory.items[0].charges = 2;
		repository.set(stocked);
		const result = service.scheduleAssistedRecovery('teste', { requestId: 'intensive-1',
			patientIds: ['paciente', 'outro'], intensive: true });
		assert.equal(result.healing, 7);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.equal(repository.get('paciente').state.trainerSheet.assistedRecoveryPending.healing, 7);
		assert.equal(service.scheduleAssistedRecovery('teste', { requestId: 'intensive-1',
			patientIds: ['paciente', 'outro'], intensive: true }).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'intensive-1',
			patientIds: ['paciente', 'outro'] }), /já utilizado/);
	});
	it('Recuperação da Exaustão integra a Assistida e reduz mais um nível no descanso longo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Outro']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:recuperacao-da-exaustao'] : [], apex: null } });
			if (name !== 'Medico') record.state.trainerSheet =
				rpgTrainerAddExhaustion(record.state.trainerSheet, 3);
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		service.requireMasterRole = () => {};
		service.random = () => 0;
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-0',
			patientIds: ['paciente'], exhaustionPatientIds: ['outro'] }), /Escolha inválida/);
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-1',
			patientIds: ['paciente', 'outro'], exhaustionPatientIds: ['paciente'] }), /2 cargas/);
		assert.equal(repository.get('paciente').state.trainerSheet.assistedRecoveryPending, undefined);
		const stocked = repository.get('medico');
		stocked.state.trainerInventory.items[0].charges = 2;
		repository.set(stocked);
		const prepared = service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-1',
			patientIds: ['paciente', 'outro'], exhaustionPatientIds: ['paciente'] });
		assert.deepEqual(prepared.exhaustionPatients, ['paciente']);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.equal(repository.get('paciente').state.trainerSheet.assistedRecoveryPending.exhaustionRecovery, true);
		assert.equal(repository.get('outro').state.trainerSheet.assistedRecoveryPending.exhaustionRecovery, undefined);
		assert.equal(service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-1',
			patientIds: ['paciente', 'outro'], exhaustionPatientIds: ['paciente'] }).repeated, true);
		service.applyCampaignRest('teste', 'long', 'exhaustion-rest-1');
		assert.equal(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet).exhaustion, 1);
		assert.equal(rpgTrainerSurvival(repository.get('outro').state.trainerSheet).exhaustion, 2);
		assert.equal(repository.get('paciente').state.trainerSheet.lastExhaustionRecoveryAt,
			Date.parse(service.campaignSettings.currentDateTime));
		assert.equal(service.applyCampaignRest('teste', 'long', 'exhaustion-rest-1').repeated, true);
		assert.equal(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet).exhaustion, 1);
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-2',
			patientIds: ['paciente'], exhaustionPatientIds: ['paciente'] }), /dois níveis de Exaustão/);
		const patient = repository.get('paciente');
		patient.state.trainerSheet = rpgTrainerAddExhaustion(patient.state.trainerSheet, 1);
		repository.set(patient);
		assert.throws(() => service.scheduleAssistedRecovery('teste', { requestId: 'exhaustion-3',
			patientIds: ['paciente'], exhaustionPatientIds: ['paciente'] }), /últimas 24 horas/);
	});
	it('Recuperação em Etapas cura uma vez no primeiro descanso curto em até 24 horas', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Outro']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ hitPoints: { current: 1, maximum: 30, temporary: 0 },
					talents: { general: [], class: name === 'Medico' ?
						['medico:recuperacao-em-etapas'] : [], apex: null } });
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		service.random = () => 0;
		service.campaignSettings.currentDateTime = '2026-10-18T12:00:00.000Z';
		const prepared = service.scheduleAssistedRecovery('teste', {
			requestId: 'stages-test-1', patientIds: ['paciente', 'outro'],
		});
		assert.equal(prepared.stagedHealing, 3);
		service.applyCampaignRest('teste', 'long', 'stages-long-1');
		assert.equal(repository.get('paciente').state.trainerSheet.stagedRecoveryPending.healing, 3);
		const longHP = repository.get('paciente').state.trainerSheet.hitPoints.current;
		service.advanceCampaignTime('teste', 1);
		const delayed = repository.get('outro');
		delayed.state.trainerSheet.survival.lastShortRest = {
			startedAt: Date.parse(service.campaignSettings.currentDateTime),
			completedAt: Date.parse(service.campaignSettings.currentDateTime),
		};
		repository.set(delayed);
		service.applyCampaignRest('teste', 'short', 'stages-short-1');
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, longHP + 3);
		assert.equal(repository.get('paciente').state.trainerSheet.stagedRecoveryPending, undefined);
		const other = repository.get('outro');
		const otherHP = other.state.trainerSheet.hitPoints.current;
		service.advanceCampaignTime('teste', 8);
		service.advanceCampaignTime('teste', 8);
		service.advanceCampaignTime('teste', 8);
		service.advanceCampaignTime('teste', 8);
		service.applyCampaignRest('teste', 'short', 'stages-short-2');
		assert.equal(repository.get('outro').state.trainerSheet.hitPoints.current, otherHP);
		assert.equal(repository.get('outro').state.trainerSheet.stagedRecoveryPending, undefined);
	});
	it('Plano Individual salva a anotação e Tratamento de Queimaduras consome kit uma vez', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Saudavel']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:plano-individual-de-recuperacao', 'medico:tratamento-de-queimaduras'] : [], apex: null } });
			if (name === 'Paciente') record.state.trainerSheet = rpgTrainerApplyCondition(
				record.state.trainerSheet, { id: 'queimado', source: 'teste' });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		assert.equal(service.setTrainerIndividualRecoveryNote('teste', 'Paciente: mobilidade reduzida').note,
			'Paciente: mobilidade reduzida');
		assert.equal(repository.get('medico').state.trainerSheet.individualRecoveryNote,
			'Paciente: mobilidade reduzida');
		assert.deepEqual(service.getBurnTreatmentCandidates('teste').patients.map(patient => patient.id), ['paciente']);
		const result = service.treatTrainerBurn('teste', { requestId: 'burn-test-1', patientId: 'paciente' });
		assert.equal(result.chargesRemaining, 0);
		assert.equal(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet).conditions.length, 0);
		assert.equal(service.treatTrainerBurn('teste',
			{ requestId: 'burn-test-1', patientId: 'paciente' }).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.treatTrainerBurn('teste',
			{ requestId: 'burn-test-2', patientId: 'paciente' }), /não encontrado/);
	});
	it('Estímulo Neuromuscular remove só condições elegíveis de treinadores e consome uma carga', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Saudavel']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:estimulo-neuromuscular'] : [], apex: null } });
			if (name === 'Paciente') {
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'paralisado', source: 'teste' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'imobilizado', source: 'teste' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'atordoado', source: 'teste' });
			}
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		assert.deepEqual(service.getNeuromuscularTreatmentCandidates('teste').patients[0].conditions,
			['paralisado', 'atordoado']);
		assert.throws(() => service.treatTrainerNeuromuscularCondition('teste',
			{ requestId: 'neuro-test-0', patientId: 'paciente', conditionId: 'queimado' }), /incompatível/);
		assert.throws(() => service.treatTrainerNeuromuscularCondition('teste',
			{ requestId: 'neuro-test-0b', patientId: 'paciente', conditionId: 'imobilizado' }), /incompatível/);
		const result = service.treatTrainerNeuromuscularCondition('teste',
			{ requestId: 'neuro-test-1', patientId: 'paciente', conditionId: 'paralisado' });
		assert.equal(result.chargesRemaining, 0);
		assert.deepEqual(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet)
			.conditions.map(condition => condition.id), ['imobilizado', 'atordoado']);
		assert.equal(service.treatTrainerNeuromuscularCondition('teste',
			{ requestId: 'neuro-test-1', patientId: 'paciente', conditionId: 'paralisado' }).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.treatTrainerNeuromuscularCondition('teste',
			{ requestId: 'neuro-test-1', patientId: 'paciente', conditionId: 'atordoado' }), /já utilizado/);
	});
	it('Aquecimento Controlado remove Congelado imediatamente e preserva outras condições', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Saudavel']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:aquecimento-controlado'] : [], apex: null } });
			if (name === 'Paciente') {
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'congelado', source: 'frio' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'imobilizado', source: 'teste' });
			}
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		assert.deepEqual(service.getControlledWarmingCandidates('teste').patients.map(patient => patient.id),
			['paciente']);
		const result = service.treatTrainerCold('teste',
			{ requestId: 'warming-test-1', patientId: 'paciente' });
		assert.equal(result.chargesRemaining, 0);
		assert.deepEqual(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet)
			.conditions.map(condition => condition.id), ['imobilizado']);
		assert.equal(service.treatTrainerCold('teste',
			{ requestId: 'warming-test-1', patientId: 'paciente' }).repeated, true);
		assert.throws(() => service.treatTrainerCold('teste',
			{ requestId: 'warming-test-2', patientId: 'saudavel' }), /não encontrado/);
	});
	it('Resposta Neurológica remove Adormecido ou Confuso e consome uma carga', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Saudavel']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 5,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:resposta-neurologica'] : [], apex: null } });
			if (name === 'Paciente') {
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'adormecido', source: 'químico' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'confuso', source: 'químico' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'congelado', source: 'frio' });
			}
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireWorldBagItemUse = () => {};
		assert.deepEqual(service.getNeurologicalResponseCandidates('teste').patients[0].conditions,
			['adormecido', 'confuso']);
		assert.throws(() => service.treatTrainerNeurologicalCondition('teste',
			{ requestId: 'neuro-response-0', patientId: 'paciente', conditionId: 'congelado' }), /incompatível/);
		const result = service.treatTrainerNeurologicalCondition('teste',
			{ requestId: 'neuro-response-1', patientId: 'paciente', conditionId: 'adormecido' });
		assert.equal(result.chargesRemaining, 0);
		assert.deepEqual(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet)
			.conditions.map(condition => condition.id), ['confuso', 'congelado']);
		assert.equal(service.treatTrainerNeurologicalCondition('teste',
			{ requestId: 'neuro-response-1', patientId: 'paciente', conditionId: 'adormecido' }).repeated, true);
		assert.throws(() => service.treatTrainerNeurologicalCondition('teste',
			{ requestId: 'neuro-response-2', patientId: 'saudavel', conditionId: 'confuso' }), /não encontrado/);
	});
	it('Atendimento Emergencial cura até 1 PV e limita cada paciente por descanso longo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente', 'Saudavel']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste';
			record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 1,
				{ hitPoints: { current: name === 'Paciente' ? 0 : 20, maximum: 20, temporary: 0 } });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 2, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.deepEqual(service.getEmergencyCareCandidates('teste').patients.map(patient => patient.id), ['paciente']);
		const first = service.performEmergencyCare('teste', { requestId: 'care-test-1', patientId: 'paciente' });
		assert.equal(first.hp, 1);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 1);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
		assert.equal(service.performEmergencyCare('teste', { requestId: 'care-test-1', patientId: 'paciente' }).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
		const patient = repository.get('paciente');
		patient.state.trainerSheet.hitPoints.current = 0;
		repository.set(patient);
		assert.throws(() => service.performEmergencyCare('teste',
			{ requestId: 'care-test-2', patientId: 'paciente' }), /já recebeu Atendimento Emergencial/);
		patient.state.trainerSheet.talentRestCycle = 1;
		repository.set(patient);
		service.performEmergencyCare('teste', { requestId: 'care-test-3', patientId: 'paciente' });
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
	});
	it('Entre a Vida e a Morte exige déficit grave, consome três cargas e é idempotente', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0.99 });
		for (const name of ['Medico', 'Paciente', 'Leve']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', name === 'Medico' ? 10 : 1,
				{ hitPoints: { current: name === 'Medico' ? 20 : 0, maximum: 20, temporary: 0 },
					survival: { lifeState: name === 'Medico' ? 'conscious' : 'dying',
						negativeHP: name === 'Paciente' ? -12 : -5, exhaustion: 0, conditions: [],
						deathSaves: { successes: 0, failures: 0 }, wounds: [], shortCareUsed: false } });
			if (name === 'Medico') {
				record.state.trainerSheet.talents.apex = 'medico:entre-a-vida-e-a-morte';
				record.state.trainerSheet.skills.trained.push('medicina');
				record.state.trainerInventory = { version: 1, revision: 0, licenses: [],
					items: [{ id: 'kit-medico-iii', itemId: 'kit-medico-3', quantity: 1,
						equipped: false, charges: 4, location: 'bag' }] };
			}
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.deepEqual(service.getReanimationCandidates('teste').patients.map(entry => entry.id), ['paciente']);
		const input = { requestId: 'reanimate-test-1', patientId: 'paciente', mode: 'normal', talents: [] };
		const result = service.performReanimation('teste', input);
		assert.equal(result.success, true);
		assert.equal(repository.get('paciente').state.trainerSheet.survival.lifeState, 'stable');
		assert.equal(repository.get('paciente').state.trainerSheet.survival.negativeHP, 0);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
		assert.equal(service.performReanimation('teste', input).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
	});
	it('Atendimento Revitalizante cura 1d6 + Sabedoria e exige três cargas antes de começar', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 3,
				{ hitPoints: { current: name === 'Paciente' ? 0 : 20, maximum: 20, temporary: 0 },
					talents: { general: [], class: name === 'Medico' ?
						['medico:atendimento-revitalizante'] : [], apex: null } });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 2, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.equal(service.getEmergencyCareCandidates('teste').revitalizingAvailable, true);
		assert.equal(service.getEmergencyCareCandidates('teste').revitalizingKitAvailable, false);
		assert.throws(() => service.performEmergencyCare('teste',
			{ requestId: 'revital-test-1', patientId: 'paciente', revitalizing: true }), /três cargas/);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 2);
		const stocked = repository.get('medico');
		stocked.state.trainerInventory.items[0].charges = 3;
		repository.set(stocked);
		service.int = () => 3;
		const result = service.performEmergencyCare('teste',
			{ requestId: 'revital-test-1', patientId: 'paciente', revitalizing: true });
		assert.equal(result.healingRoll, 4);
		assert.equal(result.hp, 5);
		assert.equal(repository.get('paciente').state.trainerSheet.hitPoints.current, 5);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.equal(service.performEmergencyCare('teste',
			{ requestId: 'revital-test-1', patientId: 'paciente', revitalizing: true }).repeated, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.performEmergencyCare('teste',
			{ requestId: 'revital-test-1', patientId: 'paciente' }), /já utilizado/);
	});
	it('Medicina de Emergência cura, remove condições e bloqueia novo atendimento até o descanso longo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', name === 'Medico' ? 10 : 1,
				{ hitPoints: { current: name === 'Paciente' ? 0 : 20, maximum: 20, temporary: 0 } });
			if (name === 'Medico') {
				record.state.trainerSheet.talents.apex = 'medico:medicina-de-emergencia';
				record.state.trainerInventory = { version: 1, revision: 0, licenses: [],
					items: [{ id: 'kit-medico-apice', itemId: 'kit-medico-1', quantity: 1,
						equipped: false, charges: 3, location: 'bag' }] };
			} else {
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'queimado', source: 'teste' });
				record.state.trainerSheet = rpgTrainerApplyCondition(record.state.trainerSheet,
					{ id: 'paralisado', source: 'teste' });
			}
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.int = () => 3;
		assert.equal(service.getEmergencyCareCandidates('teste').emergencyMedicineAvailable, true);
		const input = { requestId: 'medicine-apex-1', patientId: 'paciente', emergencyMedicine: true };
		const result = service.performEmergencyCare('teste', input);
		assert.equal(result.hp, 5);
		assert.deepEqual(result.conditionsRemoved, ['queimado', 'paralisado']);
		assert.deepEqual(rpgTrainerSurvival(repository.get('paciente').state.trainerSheet).conditions, []);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
		assert.equal(service.performEmergencyCare('teste', input).repeated, true);
		const patient = repository.get('paciente');
		patient.state.trainerSheet.hitPoints.current = 0;
		repository.set(patient);
		assert.throws(() => service.performEmergencyCare('teste',
			{ requestId: 'medicine-apex-2', patientId: 'paciente' }), /já recebeu Atendimento Emergencial/);
		patient.state.trainerSheet.talentRestCycle = 1;
		patient.state.trainerSheet.survival.lifeState = 'dying';
		repository.set(patient);
		assert.equal(service.getEmergencyCareCandidates('teste').patients[0].available, true);
		const afterRest = service.performEmergencyCare('teste',
			{ requestId: 'medicine-apex-3', patientId: 'paciente' });
		assert.equal(afterRest.hp, 1);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 0);
	});
	it('Cirurgião só aplica o aumento de atributo escolhido', () => {
		const doctor = ready('medico', 5);
		const choice = rpgTrainerTalentCatalog(doctor).find(entry => entry.id === 'medico:cirurgiao');
		assert.deepEqual(choice.attributeChoices, ['intelligence', 'wisdom']);
		const improved = chooseRPGTrainerTalent(doctor, { id: choice.id, attribute: 'wisdom' });
		assert.equal(improved.attributes.wisdom, doctor.attributes.wisdom + 1);
		assert.equal(improved.attributes.intelligence, doctor.attributes.intelligence);
	});
	it('Protocolo Preventivo atende apenas membros e libera +2 uma vez em Fortitude', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 3,
				{ shortRestCycle: 1, talents: { general: [], class: name === 'Medico' ?
					['medico:protocolo-preventivo', 'medico:antidoto-de-emergencia'] : [], apex: null } });
			repository.set(record);
		}
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		const result = service.preparePreventiveProtocol('teste', { requestId: 'protocol-test-1',
			recipientIds: ['paciente'], risk: 'contaminação' });
		assert.deepEqual(result.recipients, ['paciente']);
		assert.equal(repository.get('paciente').state.trainerSheet.preventiveProtocol.risk, 'contaminação');
		assert.equal(service.preparePreventiveProtocol('teste', { requestId: 'protocol-test-1',
			recipientIds: ['paciente'], risk: 'contaminação' }).repeated, true);
		assert.throws(() => service.preparePreventiveProtocol('teste', { requestId: 'protocol-test-2',
			recipientIds: ['paciente'], risk: 'frio' }), /novo descanso/);
		service.consumePreventiveProtocol('teste', 'paciente', ['medico:protocolo-preventivo@medico']);
		assert.equal(repository.get('paciente').state.trainerSheet.preventiveProtocol.used, true);
	});
	it('Gestão de Suprimentos preserva carga do Kit Médico com 5 ou 6 no d6', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 3,
				{ hitPoints: { current: name === 'Paciente' ? 0 : 20, maximum: 20, temporary: 0 },
					talents: { general: [], class: name === 'Medico' ?
						['medico:gestao-de-suprimentos-medicos'] : [], apex: null } });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [], items: [
			{ id: 'kit-medico-teste', itemId: 'kit-medico-1', quantity: 1,
				equipped: false, charges: 2, location: 'bag' }] };
		repository.set(doctor);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.random = () => 0.8;
		const result = service.performEmergencyCare('teste', { requestId: 'supplies-test-1', patientId: 'paciente' });
		assert.equal(result.supplyRoll, 5);
		assert.equal(result.chargeSaved, true);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 2);
	});
	it('Medicina Integrada trata status da equipe aliada e valida kit, mesa e idempotência', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Medico', 'Paciente']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Medico' ? 'medico' : 'atleta', 3,
				{ talents: { general: [], class: name === 'Medico' ?
					['medico:medicina-integrada', 'medico:gestao-de-suprimentos-medicos'] : [], apex: null } });
			repository.set(record);
		}
		const doctor = repository.get('medico');
		doctor.state.trainerInventory = { version: 1, revision: 0, licenses: [], items: [
			{ id: 'kit-pokemon-teste', itemId: 'kit-medicina-pokemon', quantity: 1,
				equipped: false, charges: 2, location: 'bag' }] };
		repository.set(doctor);
		const patient = repository.get('paciente');
		patient.state.box.party[0].pokemon.rpg.status = 'par';
		repository.set(patient);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'medico' });
		service.requireWorldBagItemUse = () => {};
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.random = () => 0;
		const pokemonId = patient.state.box.party[0].pokemonId;
		const candidate = service.getIntegratedMedicineCandidates('teste').players
			.find(player => player.characterId === 'paciente').pokemon[0];
		assert.equal(candidate.status, 'par');
		const input = { requestId: 'medicine-test-1', characterId: 'paciente', pokemonId };
		const result = service.performIntegratedMedicine('teste', input);
		assert.equal(result.status, 'par');
		assert.equal(result.supplyRoll, 1);
		assert.equal(repository.get('medico').state.trainerInventory.items[0].charges, 1);
		assert.equal(repository.get('paciente').state.box.party[0].pokemon.rpg.status, '');
		assert.equal(service.performIntegratedMedicine('teste', input).repeated, true);
		assert.throws(() => service.performIntegratedMedicine('teste',
			{ ...input, requestId: 'medicine-test-2' }), /não possui condição negativa/);
	});
	it('prepara Compartimento Clandestino somente na própria Bag ou em armazenamento compartilhado', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Lia', playerName: 'Lia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('lia');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('ladino', 5, { talents: { general: [],
			class: ['ladino:compartimento-clandestino'], apex: null },
		proficiencies: ['kit-ladinagem'], skills: { trained: ['ladinagem'], focused: [] } });
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [],
			items: [{ id: 'kit1', itemId: 'kit-ladinagem-1', quantity: 1, equipped: false,
				charges: 5, location: 'bag' }] };
		record.state.inventory.bag = RPGBagSystem.add(record.state.inventory.bag, 'pokeball', 2).bag;
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'lia' });
		service.requireBagRecord = (_token, id) => repository.get(id);
		service.requireWorldBagItemUse = () => {};
		service.campaignSettings.currentDateTime = '2026-10-17T12:00:00.000Z';
		service.campaignSettings.supportCaches['cache-1'] = { revision: 0,
			ownerCharacterId: 'lia', location: 'Abrigo', equipment: [],
			bag: RPGBagSystem.add(RPGBagSystem.create('cache-1', [], { maxSlots: 20 }), 'potion', 1).bag };
		service.getSupportCaches = () => [{ cacheId: 'cache-1', ownerCharacterId: 'lia',
			ownerName: 'Lia', location: 'Abrigo' }];
		assert.throws(() => service.setTrainerHiddenCompartment('teste', { container: 'bag',
			action: 'conceal', kind: 'pokemon', itemId: 'potion' }), /não está disponível/);
		const first = service.setTrainerHiddenCompartment('teste', { container: 'bag',
			action: 'conceal', kind: 'pokemon', itemId: 'pokeball' });
		assert.equal(first.hidden, true);
		assert.equal(repository.get('lia').state.trainerInventory.items[0].charges, 4);
		assert.equal(service.getBag('teste', 'lia').items.find(item => item.id === 'pokeball').concealedStatus,
			'hidden');
		assert.throws(() => service.setTrainerHiddenCompartment('teste', { container: 'bag',
			action: 'conceal', kind: 'pokemon', itemId: 'pokeball' }), /já possui/);
		service.setTrainerHiddenCompartment('teste', { container: 'support-cache', cacheId: 'cache-1',
			action: 'conceal', kind: 'pokemon', itemId: 'potion' });
		assert.equal(repository.get('lia').state.trainerInventory.items[0].charges, 3);
		assert.equal(service.getSupportCache('teste', 'cache-1').items[0].concealedStatus, 'hidden');
		assert.equal(service.getBag('teste', 'lia').items.find(item => item.id === 'pokeball').concealedStatus,
			'hidden');
		assert.equal(service.getSupportCache('teste', 'cache-1').items[0].concealedStatus, 'hidden');
		service.setTrainerHiddenCompartment('teste', { container: 'support-cache', cacheId: 'cache-1',
			action: 'reveal' });
		assert.equal(service.getSupportCache('teste', 'cache-1').items[0].concealedStatus, undefined);
	});
	it('Interposição Protetora oferece a escolha de Constituição e a aplica na ficha', () => {
		const guard = ready('guarda-pokemon', 3);
		const option = rpgTrainerTalentCatalog(guard)
			.find(entry => entry.id === 'guarda-pokemon:interposicao-protetora');
		assert.deepEqual(option.attributeChoices, ['constitution']);
		const learned = chooseRPGTrainerTalent(guard,
			{ id: 'guarda-pokemon:interposicao-protetora', attribute: 'constitution' });
		assert.equal(learned.attributes.constitution, guard.attributes.constitution + 1);
	});
	it('Ampliação Forense permite escolher Inteligência ou Sabedoria e aplica o aumento', () => {
		const photographer = ready('fotografo', 3);
		const option = rpgTrainerTalentCatalog(photographer)
			.find(entry => entry.id === 'fotografo:ampliacao-forense');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(photographer, { id: option.id }), /Escolha um atributo/);
		for (const attribute of option.attributeChoices) {
			const chosen = chooseRPGTrainerTalent(photographer, { id: option.id, attribute });
			assert.equal(chosen.attributes[attribute], photographer.attributes[attribute] + 1);
		}
	});
	it('exibe Mestre dos Biomas no antigo identificador sem perder escolhas salvas', () => {
		const apex = RPG_TRAINER_TALENTS.find(entry => entry.id === 'explorador:instinto-de-descoberta');
		assert.equal(apex.name, 'Ápice — Mestre dos Biomas');
		assert.equal(apex.prerequisite, 'Explorador nível 10.');
		assert.match(apex.text, /Acampamento adaptado/);
		assert.doesNotMatch(apex.text, /pista conclusiva/);
	});
	it('Leitura do Horizonte oferece somente Constituição ou Sabedoria', () => {
		const explorer = ready('explorador', 5);
		const option = rpgTrainerTalentCatalog(explorer)
			.find(entry => entry.id === 'explorador:leitura-do-horizonte');
		assert.deepEqual(option.attributeChoices, ['constitution', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(explorer,
			{ id: option.id, attribute: 'strength' }), /atributo permitido/);
		const chosen = chooseRPGTrainerTalent(explorer, { id: option.id, attribute: 'constitution' });
		assert.equal(chosen.attributes.constitution, explorer.attributes.constitution + 1);
		assert.equal(chosen.attributes.wisdom, explorer.attributes.wisdom);
	});
	it('Vigília Perimetral usa a CD definida pelo teste de Sobrevivência', () => {
		const talent = RPG_TRAINER_TALENTS.find(entry => entry.id === 'explorador:vigilia-perimetral');
		assert.match(talent.text, /CD igual ao resultado de um teste de Sobrevivência/);
		assert.doesNotMatch(talent.text, /Percepção passiva/);
	});
	it('Especialista de Terreno oferece oito terrenos e registra escolhas distintas', () => {
		const explorer = ready('explorador', 5);
		const option = rpgTrainerTalentCatalog(explorer)
			.find(entry => entry.id === 'explorador:especialista-de-terreno');
		assert.deepEqual(option.variantChoices, ['floresta', 'montanha', 'deserto', 'pantano',
			'ambiente-gelado', 'litoral', 'subterraneo', 'urbano-em-ruinas']);
		assert.throws(() => chooseRPGTrainerTalent(explorer,
			{ id: option.id, variant: 'oceano' }), /Terreno inválido/);
		const first = chooseRPGTrainerTalent(explorer, { id: option.id, variant: 'pantano' });
		assert.deepEqual(rpgTrainerTalentCatalog(first).find(entry => entry.id === option.id).variantChoices,
			option.variantChoices.filter(terrain => terrain !== 'pantano'));
		assert.throws(() => chooseRPGTrainerTalent(first,
			{ id: option.id, variant: 'pantano' }), /variante nova/);
		const second = chooseRPGTrainerTalent(first, { id: option.id, variant: 'urbano-em-ruinas' });
		assert.deepEqual(second.talentSelections.filter(entry => entry.id === option.id)
			.map(entry => entry.variant), ['pantano', 'urbano-em-ruinas']);
	});
	it('forrageio exige aprovação do Mestre e entrega Alimentos uma única vez', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Explorador', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('explorador');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('explorador', 5, { talents: { general: [],
			class: ['explorador:forrageador-eficiente'], apex: null } });
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [], items: [] };
		repository.set(record);
		let master = false;
		service.getSession = () => master ? { role: 'master', mode: 'master', platformTableId: 'mesa-teste' } :
			{ role: 'player', mode: 'player', platformTableId: 'mesa-teste', characterId: 'explorador' };
		const request = service.requestTrainerForage('jogador', 'forage-test-1').request;
		assert.equal(request.status, 'pending');
		assert.equal(repository.get('explorador').state.trainerInventory.items.length, 0);
		assert.throws(() => service.requestTrainerForage('jogador', 'forage-test-2'), /aguardando avaliação/);
		master = true;
		assert.equal(service.decideTrainerForage('mestre', request.id, true).request.status, 'accepted');
		assert.equal(repository.get('explorador').state.trainerInventory.items
			.filter(item => item.itemId === 'alimento').reduce((sum, item) => sum + item.quantity, 0),
		rpgTrainerProficiency(5));
		assert.equal(service.decideTrainerForage('mestre', request.id, true).repeated, true);
	});
	it('Localizador de Desaparecidos acrescenta Sabedoria ao ser aprendido', () => {
		const explorer = ready('explorador', 3);
		const learned = chooseRPGTrainerTalent(explorer, { id: 'explorador:localizador-de-desaparecidos' });
		assert.equal(learned.attributes.wisdom, explorer.attributes.wisdom + 1);
	});
	it('move Cartografia de Campo do nível 1 para talento específico do Explorador', () => {
		assert.deepEqual(RPG_TRAINER_CLASS_FEATURES.explorador.map(feature => feature.name),
			['Desbravador', 'Rastreador Persistente', 'Acampamento Seguro']);
		const explorer = ready('explorador', 3);
		const options = rpgTrainerTalentCatalog(explorer);
		assert.equal(options.find(entry => entry.id === 'explorador:cartografia-de-campo').available, true);
		assert.equal(options.find(entry => entry.id === 'explorador:rota-de-retorno').available, false);
		const learned = chooseRPGTrainerTalent(explorer, { id: 'explorador:cartografia-de-campo' });
		assert(learned.talents.class.includes('explorador:cartografia-de-campo'));
		assert.equal(rpgTrainerTalentCatalog(ready('explorador', 5, {
			talents: { ...learned.talents, class: ['explorador:cartografia-de-campo'] },
		})).find(entry => entry.id === 'explorador:rota-de-retorno').available, true);
	});
	it('consome uma carga real do Kit de Disfarce e explica quando o kit acaba', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Encantador', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('encantador');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 5, {
			talents: { general: [], class: ['encantador:disfarce-social'], apex: null },
			proficiencies: ['kit-disfarce'],
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-disfarce', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'encantador' });
		assert.equal(service.useTrainerSocialDisguise('jogador').chargesRemaining, 0);
		assert.equal(repository.get('encantador').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.useTrainerSocialDisguise('jogador'), /sem cargas/);
	});
	it('Isca Ecológica consome uma ração da Bag e exige o talento', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Iscador', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('iscador');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('mestre-pokemon', 5, {
			talents: { general: [], class: ['mestre-pokemon:isca-ecologica'], apex: null },
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'racao-1', itemId: 'racao-pokemon', quantity: 2,
				equipped: false, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'iscador' });
		assert.equal(service.useTrainerEcologicalBait('jogador').remaining, 1);
		assert.equal(repository.get('iscador').state.trainerInventory.items[0].quantity, 1);
		service.useTrainerEcologicalBait('jogador');
		assert.throws(() => service.useTrainerEcologicalBait('jogador'), /Ração Pokémon na Bag/);
		const withoutTalent = repository.get('iscador');
		withoutTalent.state.trainerSheet.talents.class = [];
		repository.set(withoutTalent);
		assert.throws(() => service.useTrainerEcologicalBait('jogador'), /não possui Isca Ecológica/);
	});
	it('registra nomes limitados do Palácio da Memória e gasta uma carga em Persona Preparada', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Mentalista', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('mentalista');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('mentalista', 3, {
			talents: { general: [], class: ['mentalista:palacio-da-memoria',
				'mentalista:persona-preparada'], apex: null },
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-disfarce', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'mentalista' });
		assert.deepEqual(service.setTrainerMemoryPalace('jogador', ['Rota', 'Conversa']).names,
			['Rota', 'Conversa']);
		assert.deepEqual(repository.get('mentalista').state.trainerSheet.memoryPalaceNames,
			['Rota', 'Conversa']);
		assert.throws(() => service.setTrainerMemoryPalace('jogador', ['a', 'b', 'c', 'd', 'e']), /até 4 nomes/);
		assert.equal(service.useTrainerPreparedPersona('jogador').chargesRemaining, 0);
		assert.throws(() => service.useTrainerPreparedPersona('jogador'), /sem cargas/);
	});
	it('Armadilheiro consome uma carga do Kit de Ladinagem e preserva o saldo em falhas', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ladino', playerName: 'Lia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ladino');
		record.tableId = 'mesa-teste'; record.accountId = 'lia';
		record.state.trainerSheet = ready('ladino', 3, {
			talents: { general: [], class: ['ladino:armadilheiro'], apex: null },
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-ladinagem-1', quantity: 1,
				equipped: false, charges: 1, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'ladino' });
		assert.equal(service.useTrainerTrapmaker('jogador').chargesRemaining, 0);
		assert.equal(repository.get('ladino').state.trainerInventory.items[0].charges, 0);
		assert.throws(() => service.useTrainerTrapmaker('jogador'), /sem cargas/);
		assert.equal(repository.get('ladino').state.trainerInventory.items[0].charges, 0);
	});
	it('Armadilha Combinada consome duas cargas somente se o talento e o kit estiverem disponíveis', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ladino', playerName: 'Lia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ladino');
		record.tableId = 'mesa-teste'; record.accountId = 'lia';
		record.state.trainerSheet = ready('ladino', 7, {
			talents: { general: [], class: ['ladino:armadilheiro', 'ladino:armadilha-combinada'], apex: null },
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-ladinagem-1', quantity: 1,
				equipped: false, charges: 3, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'ladino' });
		assert.equal(service.useTrainerTrapmaker('jogador', 'combined').chargesRemaining, 1);
		assert.throws(() => service.useTrainerTrapmaker('jogador', 'combined'), /pelo menos duas cargas/);
		assert.equal(repository.get('ladino').state.trainerInventory.items[0].charges, 1);
		const withoutTalent = repository.get('ladino');
		withoutTalent.state.trainerSheet.talents.class = ['ladino:armadilheiro'];
		repository.set(withoutTalent);
		assert.throws(() => service.useTrainerTrapmaker('jogador', 'combined'), /não possui Armadilha Combinada/);
	});
	it('Labirinto de Gatilhos exige o ápice e consome quatro cargas do Kit de Ladinagem', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ladino', playerName: 'Lia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100,
			starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ladino');
		record.tableId = 'mesa-teste'; record.accountId = 'lia';
		record.state.trainerSheet = ready('ladino', 10, {
			talents: { general: [], class: ['ladino:armadilheiro', 'ladino:armadilha-combinada'],
				apex: 'ladino:labirinto-de-gatilhos' },
		});
		record.state.trainerInventory = { version: 1, revision: 0, licenses: [], pokemonStorage: [],
			items: [{ id: 'kit-1', itemId: 'kit-ladinagem-1', quantity: 1,
				equipped: false, charges: 5, location: 'bag' }] };
		repository.set(record);
		service.getSession = () => ({ role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'ladino' });
		assert.equal(service.useTrainerTrapmaker('jogador', 'labyrinth').chargesRemaining, 1);
		assert.throws(() => service.useTrainerTrapmaker('jogador', 'labyrinth'), /pelo menos quatro cargas/);
		assert.equal(repository.get('ladino').state.trainerInventory.items[0].charges, 1);
		const withoutApex = repository.get('ladino');
		withoutApex.state.trainerSheet.talents.apex = null;
		repository.set(withoutApex);
		assert.throws(() => service.useTrainerTrapmaker('jogador', 'labyrinth'), /não possui Labirinto de Gatilhos/);
	});
	it('aplica apenas o aumento fixo de Carisma de Presença Desarmante', () => {
		const before = ready('encantador', 7, { talents: { general: [],
			class: ['encantador:sem-ressentimentos'], apex: null } });
		const option = rpgTrainerTalentCatalog(before).find(talent => talent.id === 'encantador:presenca-desarmante');
		assert.deepEqual(option.attributeChoices, []);
		const after = chooseRPGTrainerTalent(before, { id: option.id });
		assert.equal(after.attributes.charisma, before.attributes.charisma + 1);
	});
	it('submete Confidente com Persuasão normal e trava o nome somente após aprovação', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository, random: () => 0.45 });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 3, { attributes: {
			strength: 12, dexterity: 14, constitution: 13, intelligence: 14, wisdom: 12, charisma: 14,
		}, skills: { trained: ['persuasao'], focused: [] } });
		record.state.trainerSheet.talents.class.push('encantador:confidente', 'encantador:visual-adequado');
		repository.set(record);
		service.getSession = token => ['mestre', 'outra-mesa'].includes(token) ? { role: 'master', mode: 'master',
			platformTableId: token === 'mestre' ? 'mesa-teste' : 'outra-mesa' } : { role: 'player', mode: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' };
		const first = service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-1', confidantName: 'Marina',
		});
		assert.equal(first.request.roll.bonus, 4);
		assert.equal(first.request.roll.total, first.request.roll.natural + 4);
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, undefined);
		assert.equal(service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-1', confidantName: 'Marina',
		}).request.roll.total, first.request.roll.total);
		assert.throws(() => service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-2', confidantName: 'Outra',
		}), /aguardando avaliação/);
		assert.throws(() => service.decideTrainerConfidant('jogador', first.request.id, true), /master session/);
		assert.throws(() => service.decideTrainerConfidant('outra-mesa', first.request.id, true), /fora da mesa/);
		assert.equal(service.decideTrainerConfidant('mestre', first.request.id, false).request.status, 'rejected');
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, undefined);
		const second = service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-2', confidantName: 'Marina',
		});
		assert.equal(service.decideTrainerConfidant('mestre', second.request.id, true).confidantName, 'Marina');
		assert.equal(repository.get('ana').state.trainerSheet.confidantName, 'Marina');
		const restored = new RPGLoginService({ masterCode: 'teste', repository,
			campaignSettings: service.getCampaignSettings('mestre') });
		assert.equal(restored.repository.get('ana').state.trainerSheet.confidantName, 'Marina');
		assert.throws(() => service.requestTrainerConfidant('jogador', {
			requestId: 'pedido-confidente-3', confidantName: 'Outra',
		}), /já possui um confidente/);
	});
	it('aprova Laço Verdadeiro por evento e reserva a remoção ao Mestre como jogador', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('encantador', 10, {
			talents: { general: [], class: ['encantador:confidente',
				'encantador:confianca-compartilhada'], apex: 'encantador:laco-verdadeiro' },
		});
		repository.set(record);
		service.getSession = token => token === 'mestre' ? { role: 'master', mode: 'master',
			platformTableId: 'mesa-teste' } : token === 'mestre-jogador' ? { role: 'master', mode: 'player',
			platformTableId: 'mesa-teste', viewAsCharacterId: 'ana' } : token === 'outra-mesa' ? {
			role: 'master', mode: 'master', platformTableId: 'mesa-outra',
		} : { role: 'player', mode: 'player', platformTableId: 'mesa-teste', characterId: 'ana' };
		const first = service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-1', npcName: 'Marina',
		});
		assert.equal(first.request.status, 'pending');
		assert.equal(service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-1', npcName: 'Marina',
		}).repeated, true);
		assert.throws(() => service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-2', npcName: 'Outra',
		}), /aguardando avaliação/);
		assert.throws(() => service.decideTrainerTrueBond('outra-mesa', first.request.id, true), /fora da mesa/);
		assert.equal(service.decideTrainerTrueBond('mestre', first.request.id, false).request.status, 'rejected');
		const second = service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-2', npcName: 'Marina',
		});
		assert.equal(service.decideTrainerTrueBond('mestre', second.request.id, true).npcName, 'Marina');
		assert.equal(repository.get('ana').state.trainerSheet.trueBondNpcName, 'Marina');
		assert.throws(() => service.requestTrainerTrueBond('jogador', {
			requestId: 'pedido-laco-3', npcName: 'Outra',
		}), /já possui um Laço Verdadeiro/);
		assert.throws(() => service.removeTrainerTrueBond('jogador'), /Apenas o Mestre/);
		assert.throws(() => service.removeTrainerTrueBond('mestre'), /Apenas o Mestre/);
		assert.equal(service.removeTrainerTrueBond('mestre-jogador').removed, true);
		assert.equal(repository.get('ana').state.trainerSheet.trueBondNpcName, undefined);
		const restored = new RPGLoginService({ masterCode: 'teste', repository,
			campaignSettings: service.getCampaignSettings('mestre') });
		restored.getSession = service.getSession;
		assert.equal(restored.getCampaignSettings('mestre').trueBondRequests.length, 2);
	});
	it('preserva o identificador do ápice do Diplomata como Voz por Procuração', () => {
		const option = rpgTrainerTalentCatalog(ready('diplomata', 10)).find(entry =>
			entry.id === 'diplomata:acordo-impossivel');
		assert.equal(option.name, 'Ápice — Voz por Procuração');
		assert.equal(option.available, true);
		assert.match(option.text, /bônus base de Persuasão do Diplomata/);
	});
	it('mantém o talento antigo do Diplomata sob o nome Exceção Negociada e exige salvo-conduto', () => {
		const diplomat = ready('diplomata', 5);
		const option = () => rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:licenca-facilitada');
		assert.equal(option().name, 'Exceção Negociada');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(diplomat, { id: option().id }), /pré-requisito/);
		diplomat.talents.class.push('diplomata:conhecimento-de-jurisdicao');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(diplomat, { id: option().id }).talents.class.includes(option().id));
		assert.match(option().text, /cláusula especial/);
	});
	it('concede automaticamente Carisma ao adquirir Porta-Voz Reconhecido', () => {
		const diplomat = ready('diplomata', 3);
		const option = rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:porta-voz-reconhecido');
		assert.deepEqual(option.attributeChoices, []);
		const chosen = chooseRPGTrainerTalent(diplomat, { id: option.id });
		assert.equal(chosen.attributes.charisma, diplomat.attributes.charisma + 1);
		assert.throws(() => chooseRPGTrainerTalent(diplomat,
			{ id: option.id, attribute: 'charisma' }), /não concede aumento de atributo/);
	});
	it('exige Conhecimento: Regiões treinado para Etiqueta Cosmopolita', () => {
		const diplomat = ready('diplomata', 3);
		const option = () => rpgTrainerTalentCatalog(diplomat).find(entry =>
			entry.id === 'diplomata:etiqueta-cosmopolita');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(diplomat, { id: option().id }),
			/treinamento na perícia/);
		diplomat.skills.trained.push('conhecimento:regioes');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(diplomat, { id: option().id }).talents.class.includes(option().id));
		assert.match(option().text, /CD 10:[\s\S]*CD 15:[\s\S]*CD 20:/);
	});
	it('orienta apenas aliados escolhidos após sucesso em Conhecimento: Regiões', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready('diplomata', 3, { skills: {
				trained: ['conhecimento:regioes'], focused: [],
			} });
			repository.set(record);
		}
		const owner = repository.get('ana');
		owner.state.trainerSheet.talents.class.push('diplomata:etiqueta-cosmopolita');
		repository.set(owner);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.random = () => 0.99;
		assert.throws(() => service.setTrainerCosmopolitanEtiquette('teste', 'Vila', 10,
			['bia', 'caio', 'outro']), /bônus de proficiência/);
		const result = service.setTrainerCosmopolitanEtiquette('teste', 'Vila', 10, ['bia']);
		assert.equal(result.roll.success, true);
		assert.deepEqual(result.orientation.recipientCharacterIds, ['ana', 'bia']);
		const own = service.getTrainerAllyRollTalents('teste', 'ana');
		const ally = service.getTrainerAllyRollTalents('teste', 'bia');
		const other = service.getTrainerAllyRollTalents('teste', 'caio');
		assert.equal(own.find(entry => entry.id === 'diplomata:etiqueta-cosmopolita').bonus, 2);
		assert.deepEqual(ally.find(entry => entry.id === 'diplomata:etiqueta-cosmopolita').targets,
			['skill:persuasao', 'skill:enganacao', 'skill:intimidacao']);
		assert.equal(other.some(entry => entry.id === 'diplomata:etiqueta-cosmopolita'), false);
		service.random = () => 0;
		const failed = service.setTrainerCosmopolitanEtiquette('teste', 'Outra Vila', 20, ['caio']);
		assert.equal(failed.roll.success, false);
		assert.deepEqual(failed.orientation, result.orientation);
	});
	it('permite ao Detetive escolher Inteligência ou Sabedoria em Perfil Investigativo', () => {
		const original = ready('detetive', 3);
		const option = rpgTrainerTalentCatalog(original).find(entry => entry.id === 'detetive:perfil-investigativo');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(original, { id: option.id }), /Escolha um atributo/);
		for (const attribute of option.attributeChoices) {
			const chosen = chooseRPGTrainerTalent(original, { id: option.id, attribute });
			assert.equal(chosen.attributes[attribute], original.attributes[attribute] + 1);
		}
	});
	it('oferece Arquivo de Casos e Vigilância Discreta apenas nas perícias apropriadas', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:arquivo-de-casos', 'detetive:vigilancia-discreta');
		const options = rpgTrainerRollTalents(detective);
		const archive = options.find(option => option.id === 'detetive:arquivo-de-casos');
		const surveillance = options.find(option => option.id === 'detetive:vigilancia-discreta');
		assert.deepEqual(archive.targets, ['skill:investigacao']);
		assert.equal(archive.bonus, 2);
		assert.deepEqual(surveillance.targets, ['skill:percepcao', 'skill:furtividade']);
		assert.equal(surveillance.bonus, 2);
	});
	it('só oferece o bônus do Parceiro Investigativo após vínculo válido e enquanto ele está disponível', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:parceiro-investigativo');
		const partner = () => rpgTrainerRollTalents(detective).find(option =>
			option.id === 'detetive:parceiro-investigativo');
		assert.equal(partner(), undefined);
		detective.investigativePartnerPokemonId = 'pokemon-1';
		assert.deepEqual(partner().targets, ['skill:investigacao', 'skill:percepcao']);
		detective.investigativePartnerUnavailable = true;
		assert.equal(partner(), undefined);
	});
	it('vincula o Parceiro Investigativo uma vez e reserva a desvinculação ao Mestre', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 5);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-investigativo');
		repository.set(record);
		const playerSession = { mode: 'player', role: 'player', platformTableId: 'mesa-teste', characterId: 'ana' };
		const masterSession = { ...playerSession, role: 'master', viewAsCharacterId: 'ana' };
		service.getSession = () => playerSession;
		assert.throws(() => service.setTrainerInvestigativePartner('teste', 'outro'), /Pokémon seu/);
		const pokemonId = record.state.box.party[0].pokemonId;
		const unfriendly = repository.get('ana');
		unfriendly.state.box.party[0].pokemon.rpg.friendship = 49;
		repository.set(unfriendly);
		assert.throws(() => service.setTrainerInvestigativePartner('teste', pokemonId), /50 de Amizade/);
		unfriendly.state.box.party[0].pokemon.rpg.friendship = 50;
		repository.set(unfriendly);
		assert.equal(service.setTrainerInvestigativePartner('teste', pokemonId).pokemonId, pokemonId);
		assert.equal(repository.get('ana').state.trainerSheet.investigativePartnerName, 'Squirtle');
		assert.throws(() => service.setTrainerInvestigativePartner('teste', pokemonId), /já foi escolhido/);
		assert.throws(() => service.setTrainerInvestigativePartner('teste', null), /Somente o Mestre/);
		service.getSession = () => masterSession;
		assert.equal(service.setTrainerInvestigativePartner('teste', null).pokemonId, null);
		assert.equal(repository.get('ana').state.trainerSheet.investigativePartnerName, undefined);
	});
	it('Voz do Parceiro usa o Pokémon já vinculado como Parceiro Investigativo', () => {
		const voice = RPG_TRAINER_TALENTS.find(talent => talent.id === 'detetive:voz-do-parceiro');
		assert.match(voice.text, /Pokémon já vinculado como Parceiro Investigativo/);
		assert.doesNotMatch(voice.text, /escolhe definitivamente o Pokémon/);
	});
	it('Dupla Indissociável usa somente o parceiro vinculado e presente na equipe', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 10);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-investigativo', 'detetive:voz-do-parceiro');
		record.state.trainerSheet.talents.apex = 'detetive:dupla-indissociavel';
		record.state.trainerSheet.investigativePartnerPokemonId = record.state.box.party[0].pokemonId;
		// EV e IV não podem entrar no bônus, que usa o Ataque Especial base da espécie.
		record.state.box.party[0].pokemon.evs.spa = 252;
		record.state.box.party[0].pokemon.ivs.spa = 31;
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		const duo = () => service.getTrainerAllyRollTalents('teste', 'ana').find(option =>
			option.id === 'detetive:dupla-indissociavel');
		assert.equal(duo().bonus, 2);
		assert.match(duo().condition, /Squirtle/);
		record.state.trainerSheet.investigativePartnerPokemonId = 'outro';
		repository.set(record);
		assert.equal(duo(), undefined);
		record.state.trainerSheet.investigativePartnerPokemonId = record.state.box.party[0].pokemonId;
		record.state.box.party[0].pokemon.rpg.hp = 0;
		repository.set(record);
		assert.equal(duo(), undefined);
		record.state.box.party[0].pokemon.rpg.hp = 10;
		record.state.box.party[0].metadata.evTraining = { readyAt: '2026-10-15T12:00:00.000Z' };
		repository.set(record);
		assert.equal(duo(), undefined);
	});
	it('mostra Passo de Perseguição e Contradição Explorada somente nas perícias indicadas', () => {
		const detective = ready('detetive', 5);
		detective.talents.class.push('detetive:passo-de-perseguicao', 'detetive:contradicao-explorada');
		const options = rpgTrainerRollTalents(detective);
		assert.deepEqual(options.find(option => option.id === 'detetive:passo-de-perseguicao').targets,
			['skill:atletismo', 'skill:acrobacia', 'skill:pilotagem:*']);
		assert.deepEqual(options.find(option => option.id === 'detetive:contradicao-explorada').targets,
			['skill:persuasao', 'skill:intimidacao']);
	});
	it('salva o nome de Parceiro de Confiança apenas para quem possui o talento', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste';
		record.state.trainerSheet = ready('detetive', 7);
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		assert.throws(() => service.setTrainerTrustedPartnerName('teste', 'Lia'), /não possui/);
		record.state.trainerSheet.talents.class.push('detetive:parceiro-de-confianca');
		repository.set(record);
		assert.equal(service.setTrainerTrustedPartnerName('teste', '  Lia  ').name, 'Lia');
		assert.equal(repository.get('ana').state.trainerSheet.trustedPartnerName, 'Lia');
		assert.throws(() => service.setTrainerTrustedPartnerName('teste', 'x'.repeat(81)), /80 caracteres/);
	});
	it('prepara o Plano de Captura após 30 minutos e consome o bônus por participante', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'detetive' : 'atleta', 7);
			repository.set(record);
		}
		const detective = repository.get('ana');
		detective.state.trainerSheet.talents.class.push('detetive:plano-de-captura');
		repository.set(detective);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.campaignSettings.currentDateTime = '2026-10-15T12:00:00.000Z';
		assert.throws(() => service.setTrainerCapturePlan('teste', 'Alvo no cais', ['ana', 'ana']),
			/participantes diferentes/);
		assert.throws(() => service.setTrainerCapturePlan('teste', 'Alvo no cais', ['intruso']),
			/indisponível/);
		const { plan } = service.setTrainerCapturePlan('teste', 'Alvo no cais', ['ana', 'bia']);
		assert.equal(plan.readyAt, '2026-10-15T12:30:00.000Z');
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(option =>
			option.id === 'detetive:plano-de-captura'), false);
		service.campaignSettings.currentDateTime = plan.readyAt;
		const option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'detetive:plano-de-captura');
		assert(option);
		service.consumeTrainerCapturePlanRoll('teste', 'bia', [option.key]);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		assert(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key));
		assert.deepEqual(repository.get('ana').state.trainerSheet.capturePlan.usedRecipientIds, ['bia']);
		assert.equal(service.setTrainerCapturePlan('teste', '', []).plan, null);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key), false);
	});
	it('entrega uma Carta de Apresentação a um aliado, substitui a anterior e consome o primeiro bônus', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'diplomata' : 'atleta', 5);
			repository.set(record);
		}
		const diplomat = repository.get('ana');
		diplomat.state.trainerSheet.talents.class.push('diplomata:carta-de-apresentacao');
		repository.set(diplomat);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		assert.throws(() => service.setTrainerIntroductionLetter('teste', 'ana', 'Museu', 'Acesso'), /aliado/);
		assert.throws(() => service.setTrainerIntroductionLetter('teste', 'intruso', 'Museu', 'Acesso'), /aliado/);
		service.setTrainerIntroductionLetter('teste', 'bia', 'Museu', 'Pesquisa');
		let option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:carta-de-apresentacao');
		assert.equal(option.bonus, 2);
		assert.deepEqual(option.targets, ['skill:persuasao']);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'ana').some(entry => entry.key === option.key), false);
		const oldKey = option.key;
		service.setTrainerIntroductionLetter('teste', 'bia', 'Biblioteca', 'Pesquisa histórica');
		option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:carta-de-apresentacao');
		assert.notEqual(option.key, oldKey);
		service.consumeTrainerIntroductionLetterRoll('teste', 'bia', [oldKey]);
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter.used, false);
		assert.match(option.condition, /Biblioteca/);
		assert.doesNotMatch(option.condition, /Museu/);
		service.consumeTrainerIntroductionLetterRoll('teste', 'bia', [option.key]);
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter.used, true);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		service.setTrainerIntroductionLetter('teste', '', '', '');
		assert.equal(repository.get('ana').state.trainerSheet.introductionLetter, undefined);
	});
	it('prepara Voz por Procuração para aliados distintos, respeita o relógio e consome cada uso', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		for (const name of ['Ana', 'Bia', 'Caio']) {
			service.createCharacter({ characterName: name, playerName: name, avatar: 'lucas',
				password: 'senha-rpg', initialMoney: 100,
				starter: { species: 'Squirtle', gender: 'M' } });
			const record = repository.get(name.toLowerCase());
			record.tableId = 'mesa-teste'; record.accountId = name.toLowerCase();
			record.state.trainerSheet = ready(name === 'Ana' ? 'diplomata' : 'atleta', 10);
			repository.set(record);
		}
		const diplomat = repository.get('ana');
		diplomat.state.trainerSheet.talents.apex = 'diplomata:acordo-impossivel';
		diplomat.state.trainerSheet.attributes.charisma = 18;
		diplomat.state.trainerSheet.skills.trained.push('persuasao');
		diplomat.state.trainerSheet.skills.focused.push('persuasao');
		repository.set(diplomat);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.trainerArchiveRecipients = () => [
			{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }, { id: 'caio', name: 'Caio' }];
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.campaignSettings.currentDateTime = '2026-10-15T12:00:00.000Z';
		assert.throws(() => service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'ana', proposal: 'Abrir a rota', audience: 'Guarda' }]), /Aliado indisponível/);
		assert.throws(() => service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda' },
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda' }]), /repetido/);
		const { preparation } = service.setTrainerDiplomatProxy('teste', [
			{ characterId: 'bia', proposal: 'Abrir a rota', audience: 'Guarda local' },
			{ characterId: 'caio', proposal: 'Acesso ao arquivo', audience: 'Bibliotecária' }]);
		assert.equal(preparation.readyAt, '2026-10-15T12:10:00.000Z');
		assert.equal(preparation.expiresAt, '2026-10-16T12:10:00.000Z');
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry =>
			entry.id === 'diplomata:acordo-impossivel'), false);
		service.campaignSettings.currentDateTime = preparation.readyAt;
		const option = service.getTrainerAllyRollTalents('teste', 'bia').find(entry =>
			entry.id === 'diplomata:acordo-impossivel');
		assert.equal(option.replacesBaseWith, 12);
		assert.equal(option.bonus, 12);
		assert.deepEqual(option.targets, ['skill:persuasao']);
		service.consumeTrainerDiplomatProxyRoll('teste', 'bia', [option.key]);
		assert.equal(service.getTrainerAllyRollTalents('teste', 'bia').some(entry => entry.key === option.key), false);
		assert(service.getTrainerAllyRollTalents('teste', 'caio').some(entry => entry.id === option.id));
		service.campaignSettings.currentDateTime = preparation.expiresAt;
		assert.equal(service.getTrainerAllyRollTalents('teste', 'caio').some(entry => entry.id === option.id), false);
		assert.equal(service.setTrainerDiplomatProxy('teste', []).preparation, null);
	});
	it('encomenda item pela Rede de Fornecedores com aprovação atômica e cancela sem saldo', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Ana', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 1000, starter: { species: 'Squirtle', gender: 'M' } });
		const record = repository.get('ana');
		record.tableId = 'mesa-teste'; record.accountId = 'ana';
		record.state.trainerSheet = ready('diplomata', 3);
		record.state.trainerSheet.talents.class.push('diplomata:canal-oficial');
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'ana' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		const item = service.getSupplierCatalog('teste').items.find(entry => entry.id === 'potion');
		assert.equal(item.orderPrice, 240);
		assert(service.getSupplierCatalog('teste').items.some(entry => entry.id === 'faca' &&
			entry.kind === 'equipment'));
		assert.equal(service.getSupplierCatalog('teste').items.some(entry => entry.id === 'masterball'), false);
		const input = { requestId: 'order-test-1', itemId: 'potion', itemKind: 'pokemon' };
		const created = service.requestSupplierOrder('teste', input);
		assert.equal(created.order.status, 'pending');
		assert.equal(service.requestSupplierOrder('teste', input).repeated, true);
		assert.throws(() => service.requestSupplierOrder('teste', { ...input, requestId: 'order-test-2' }),
			/aguardando avaliação/);
		assert.equal(repository.get('ana').state.money, 1000);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 0);
		const approved = service.decideSupplierOrder('teste', input.requestId, true);
		assert.equal(approved.order.status, 'accepted');
		assert.equal(repository.get('ana').state.money, 760);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 1);
		assert.equal(service.decideSupplierOrder('teste', input.requestId, true).repeated, true);
		assert.equal(repository.get('ana').state.money, 760);
		const broke = repository.get('ana'); broke.state.money = 0; repository.set(broke);
		service.requestSupplierOrder('teste', { ...input, requestId: 'order-test-3' });
		const cancelled = service.decideSupplierOrder('teste', 'order-test-3', true);
		assert.equal(cancelled.order.status, 'rejected');
		assert.match(cancelled.order.reason, /Pokécoins insuficientes/);
		assert.equal(RPGBagSystem.getQuantity(repository.get('ana').state.inventory.bag, 'potion'), 1);
		const funded = repository.get('ana'); funded.state.money = 500; repository.set(funded);
		const equipment = service.requestSupplierOrder('teste',
			{ requestId: 'order-test-4', itemId: 'faca', itemKind: 'equipment' });
		assert.equal(equipment.order.price, 180);
		assert.equal(service.decideSupplierOrder('teste', 'order-test-4', true).order.status, 'accepted');
		assert.equal(repository.get('ana').state.money, 320);
		assert(repository.get('ana').state.trainerInventory.items.some(entry => entry.itemId === 'faca'));
	});
	it('Mercado Paralelo valida saldo e quantidade e entrega somente após aprovação do Mestre', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Lia', playerName: 'Lia', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 1000, starter: { species: 'Squirtle', gender: 'F' } });
		const record = repository.get('lia');
		record.tableId = 'mesa-teste'; record.accountId = 'lia';
		record.state.trainerSheet = ready('ladino', 3);
		record.state.trainerSheet.talents.class.push('ladino:mercado-paralelo');
		repository.set(record);
		service.getSession = () => ({ mode: 'player', role: 'player',
			platformTableId: 'mesa-teste', characterId: 'lia' });
		service.accounts.repository.getMembership = () => ({ status: 'active' });
		service.requireMasterRole = () => {};
		const item = service.getParallelMarketCatalog('teste').items.find(entry => entry.id === 'potion');
		assert.equal(item.price, 200);
		assert.throws(() => service.requestParallelMarketOrder('teste',
			{ requestId: 'market-too-many', itemId: 'potion', itemKind: 'pokemon', quantity: 6 }),
		/insuficientes/);
		const input = { requestId: 'market-order-1', itemId: 'potion', itemKind: 'pokemon', quantity: 3 };
		const request = service.requestParallelMarketOrder('teste', input);
		assert.equal(request.order.price, 600);
		assert.equal(repository.get('lia').state.money, 1000);
		assert.equal(service.requestParallelMarketOrder('teste', input).repeated, true);
		assert.equal(service.decideSupplierOrder('teste', input.requestId, true).order.status, 'accepted');
		assert.equal(repository.get('lia').state.money, 400);
		assert.equal(RPGBagSystem.getQuantity(repository.get('lia').state.inventory.bag, 'potion'), 3);
		assert.equal(service.decideSupplierOrder('teste', input.requestId, true).repeated, true);
		assert.equal(repository.get('lia').state.money, 400);
		const next = service.requestParallelMarketOrder('teste',
			{ requestId: 'market-order-2', itemId: 'potion', itemKind: 'pokemon', quantity: 2 });
		assert.equal(next.order.status, 'pending');
		const spent = repository.get('lia'); spent.state.money = 0; repository.set(spent);
		const cancelled = service.decideSupplierOrder('teste', 'market-order-2', true);
		assert.equal(cancelled.order.status, 'rejected');
		assert.match(cancelled.order.reason, /insuficientes/);
		assert.equal(RPGBagSystem.getQuantity(repository.get('lia').state.inventory.bag, 'potion'), 3);
	});
	it('requires trained Pokémon Knowledge for Petisco de Amizade', () => {
		const cook = ready('cozinheiro', 3);
		const option = () => rpgTrainerTalentCatalog(cook).find(entry =>
			entry.id === 'cozinheiro:petisco-de-amizade');
		assert.equal(option().available, false);
		assert.throws(() => chooseRPGTrainerTalent(cook,
			{ id: 'cozinheiro:petisco-de-amizade' }), /treinamento na perícia/);
		cook.skills.trained.push('conhecimento:pokemon');
		assert.equal(option().available, true);
		assert(chooseRPGTrainerTalent(cook,
			{ id: 'cozinheiro:petisco-de-amizade' }).talents.class.includes('cozinheiro:petisco-de-amizade'));
	});
	it('offers Intelligence or Wisdom for Paladar Analítico and applies only the selected increase', () => {
		const cook = ready('cozinheiro', 3);
		const option = rpgTrainerTalentCatalog(cook).find(entry => entry.id === 'cozinheiro:paladar-analitico');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(cook, { id: option.id }), /Escolha um atributo/);
		const chosen = chooseRPGTrainerTalent(cook, { id: option.id, attribute: 'wisdom' });
		assert.equal(chosen.attributes.wisdom, cook.attributes.wisdom + 1);
		assert.equal(chosen.attributes.intelligence, cook.attributes.intelligence);
	});
	it('oferece Inteligência ou Sabedoria em Assinatura Comportamental', () => {
		const mentalist = ready('mentalista', 3);
		const option = rpgTrainerTalentCatalog(mentalist).find(entry =>
			entry.id === 'mentalista:assinatura-comportamental');
		assert.deepEqual(option.attributeChoices, ['intelligence', 'wisdom']);
		assert.throws(() => chooseRPGTrainerTalent(mentalist, { id: option.id }), /Escolha um atributo/);
		const chosen = chooseRPGTrainerTalent(mentalist, { id: option.id, attribute: 'intelligence' });
		assert.equal(chosen.attributes.intelligence, mentalist.attributes.intelligence + 1);
		assert.equal(chosen.attributes.wisdom, mentalist.attributes.wisdom);
	});
	it('requires three distinct trained Knowledge areas for Scientific Authority', () => {
		const scientist = ready('cientista', 10, { skills: { trained: [
			'conhecimento:ciencias', 'conhecimento:pokemon', 'conhecimento:regioes',
		], focused: [] } });
		const choice = { id: 'cientista:autoridade-cientifica', variant: 'conhecimento:ciencias',
			secondVariant: 'conhecimento:pokemon', thirdVariant: 'conhecimento:regioes' };
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ ...choice, thirdVariant: choice.variant }), /três áreas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ ...choice, thirdVariant: 'conhecimento:arqueologia-fosseis' }), /três áreas diferentes/);
		const chosen = chooseRPGTrainerTalent(scientist, choice);
		assert.equal(chosen.talents.apex, choice.id);
		assert.equal(chosen.talentSelections.at(-1).thirdVariant, choice.thirdVariant);
	});
	it('applies the fixed Intelligence increase from Persistent Hypothesis without an attribute choice', () => {
		const scientist = ready('cientista', 3);
		const chosen = chooseRPGTrainerTalent(scientist, { id: 'cientista:hipotese-persistente' });
		assert.equal(chosen.attributes.intelligence, 15);
		assert(chosen.talents.class.includes('cientista:hipotese-persistente'));
		assert.equal(rpgTrainerTalentCatalog(scientist).find(entry =>
			entry.id === 'cientista:hipotese-persistente').attributeChoices.length, 0);
	});
	it('registers all twenty class bases, innate features and all published talents', () => {
		assert.equal(Object.keys(RPG_TRAINER_CLASSES).length, 20);
		assert.equal(Object.keys(RPG_TRAINER_CLASS_FEATURES).length, 20);
		assert.equal(RPG_TRAINER_TALENTS.length, 453);
		assert.equal(RPG_TRAINER_TALENTS.filter(talent => talent.kind === 'general').length, 54);
		assert.equal(new Set(RPG_TRAINER_TALENTS.map(talent => talent.id)).size, 453);
		assert(!RPG_TRAINER_TALENTS.some(talent => talent.id === 'artista:memoria-de-repertorio'));
		assert(!RPG_TRAINER_TALENTS.some(talent => talent.id === 'criador-pokemon:primeiros-cuidados-rapidos'));
		for (const classId of Object.keys(RPG_TRAINER_CLASSES)) {
			assert.ok(rpgTrainerClassFeatures(ready(classId)).length >= 2, classId);
			assert.ok(RPG_TRAINER_TALENTS.some(talent => talent.classId === classId && talent.kind === 'apex'));
		}
	});

	it('creates a complete level-one sheet for every class with its own base rules', () => {
		const candidates = [
			'acrobacia', 'atletismo', 'atuacao', 'captura', 'conhecimento:regioes',
			'empatia-pokemon', 'enganacao', 'furtividade', 'intimidacao', 'intuicao',
			'investigacao', 'ladinagem', 'medicina', 'medicina-pokemon',
			'montaria-pokemon', 'natureza', 'oficio:escrita', 'percepcao',
			'persuasao', 'pilotagem:automoveis', 'sobrevivencia', 'tecnologia',
			'adestramento-pokemon',
		];
		for (const [classId, rule] of Object.entries(RPG_TRAINER_CLASSES)) {
			const attributes = { strength: 15, dexterity: 14, constitution: 13,
				intelligence: 12, wisdom: 10, charisma: 8 };
			const fixedKnowledge = classId === 'cientista' ? 'conhecimento:biologia' : undefined;
			const count = rule.choices + 1;
			const optionalSkills = candidates.filter(skill => !rule.fixed.includes(skill) &&
				skill !== fixedKnowledge && !rule.excluded.includes(skill.split(':')[0])).slice(0, count);
			const gearChoices = Object.fromEntries(Object.entries(rule.gearChoices || {})
				.map(([key, choices]) => [key, choices[0]]));
			const sheet = completeRPGTrainerSheet(createRPGPendingTrainerSheet(), {
				classId, attributes, fixedKnowledge, optionalSkills, gearChoices,
			}, 'standard');
			assert.equal(sheet.classId, classId);
			assert.equal(sheet.skills.trained.length, rule.fixed.length + Number(!!fixedKnowledge) + count);
			assert.ok(sheet.resistances.includes(rule.resistance));
			assert.equal(sheet.hitPoints.maximum, 10 + rule.hitDie + 1);
			assert.equal(sheet.equipment.length, rule.gear.length + Object.keys(gearChoices).length);
			assert.ok(rpgTrainerClassFeatures(sheet).length >= 2);
		}
	});

	it('enforces level, class, talent-chain and apex requirements', () => {
		let sheet = ready('arqueologo', 7);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'arqueologo:achado-excepcional' }), /pré-requisito/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura' }), /outra classe/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:especialista-em-fosseis' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:leitura-estratigrafica' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'arqueologo:achado-excepcional' });
		assert.equal(sheet.talents.class.length, 3);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'arqueologo:epigrafista' }), /Não há escolha/);
		assert.throws(() => chooseRPGTrainerTalent(ready('arqueologo', 9),
			{ id: 'arqueologo:grande-descobridor' }), /Ápices|escolha|Nível insuficiente/);
		const apex = chooseRPGTrainerTalent(ready('arqueologo', 10), { id: 'arqueologo:grande-descobridor' });
		assert.equal(apex.talents.apex, 'arqueologo:grande-descobridor');
	});
	it('allows Master of Excavation without Conservador de Campo', () => {
		const sheet = ready('arqueologo', 10, { talents: { general: [],
			class: ['arqueologo:especialista-em-fosseis', 'arqueologo:leitura-estratigrafica'], apex: null } });
		const option = rpgTrainerTalentCatalog(sheet).find(entry => entry.id === 'arqueologo:mestre-da-escavacao');
		assert.equal(option.available, true);
		assert.equal(chooseRPGTrainerTalent(sheet,
			{ id: 'arqueologo:mestre-da-escavacao' }).talents.apex, 'arqueologo:mestre-da-escavacao');
	});
	it('grants Academic Memory intelligence automatically up to 20', () => {
		const base = ready('arqueologo', 5, { attributes: {
			...ready('arqueologo', 5).attributes, intelligence: 13,
		} });
		const chosen = chooseRPGTrainerTalent(base, { id: 'arqueologo:memoria-academica' });
		assert.equal(chosen.attributes.intelligence, 14);
		assert.equal(rpgTrainerSkillBonus(chosen, 'conhecimento:arqueologia-fosseis'),
			rpgTrainerSkillBonus(base, 'conhecimento:arqueologia-fosseis') + 1);
		const capped = chooseRPGTrainerTalent(ready('arqueologo', 5, { attributes: {
			...base.attributes, intelligence: 20,
		} }), { id: 'arqueologo:memoria-academica' });
		assert.equal(capped.attributes.intelligence, 20);
	});
	it('grants Relic Rescue dexterity automatically up to 20', () => {
		const original = ready('arqueologo', 3);
		const chosen = chooseRPGTrainerTalent(original, { id: 'arqueologo:resgate-de-reliquia' });
		assert.equal(chosen.attributes.dexterity, 15);
		assert.equal(chosen.relicRescueApplied, true);
		const capped = chooseRPGTrainerTalent(ready('arqueologo', 3, { attributes: {
			...original.attributes, dexterity: 20,
		} }), { id: 'arqueologo:resgate-de-reliquia' });
		assert.equal(capped.attributes.dexterity, 20);
	});
	it('grants Emergency Incubation wisdom automatically up to 20', () => {
		const original = ready('criador-pokemon', 5);
		original.talents.class.push('criador-pokemon:incubacao-assistida');
		const chosen = chooseRPGTrainerTalent(original, { id: 'criador-pokemon:incubacao-de-emergencia' });
		assert.equal(chosen.attributes.wisdom, Math.min(20, original.attributes.wisdom + 1));
		assert.equal(chosen.emergencyIncubationWisdomApplied, true);
	});
	it('grants Nursery Master wisdom automatically without asking for an attribute', () => {
		const original = ready('criador-pokemon', 10);
		original.talents.class.push('criador-pokemon:incubacao-assistida',
			'criador-pokemon:reproducao-assistida', 'criador-pokemon:incubacao-de-emergencia');
		const chosen = chooseRPGTrainerTalent(original, { id: 'criador-pokemon:mestre-do-bercario' });
		assert.equal(chosen.attributes.wisdom, original.attributes.wisdom + 1);
		assert.equal(chosen.nurseryMasterWisdomApplied, true);
		assert.equal(rpgTrainerTalentCatalog(original).find(entry =>
			entry.id === 'criador-pokemon:mestre-do-bercario').attributeChoices.length, 0);
	});

	it('applies general training, focus, resistance and domain without duplicate benefits', () => {
		let sheet = ready('arqueologo', 10);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'treinamento-adicional', skill: 'medicina' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'foco-em-pericia', skill: 'medicina' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'resiliente', resistance: 'reflexes' });
		sheet = chooseRPGTrainerTalent(sheet, { id: 'dominio-de-kit', proficiency: 'kit-medico' });
		assert.ok(sheet.skills.trained.includes('medicina'));
		assert.ok(sheet.skills.focused.includes('medicina'));
		assert.ok(sheet.resistances.includes('reflexes'));
		assert.ok(sheet.proficiencies.includes('kit-medico'));
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'treinamento-adicional', skill: 'medicina' }), /já é treinada|Não há escolha/);
		assert.throws(() => chooseRPGTrainerTalent(ready('arqueologo', 2),
			{ id: 'dominio-de-kit', proficiency: 'kit-medico' }), /perícia correspondente/);
	});
	it('grants Mount Pokemon training with Sports Riding without duplicating existing training', () => {
		const athlete = ready('atleta', 3);
		assert(!athlete.skills.trained.includes('montaria-pokemon'));
		assert(rpgTrainerTalentCatalog(athlete).find(talent => talent.id === 'atleta:montaria-esportiva').available);
		const learned = chooseRPGTrainerTalent(athlete, { id: 'atleta:montaria-esportiva' });
		assert(learned.skills.trained.includes('montaria-pokemon'));
		assert.equal(learned.talentSelections.at(-1).grantedSkill, 'montaria-pokemon');
		assert.equal(rpgTrainerSkillBonus(learned, 'montaria-pokemon'),
			rpgTrainerSkillBonus(athlete, 'montaria-pokemon', undefined, false, true) + rpgTrainerProficiency(learned.level));
		const alreadyTrained = ready('atleta', 3, { skills: {
			trained: [...athlete.skills.trained, 'montaria-pokemon'], focused: [],
		} });
		const retained = chooseRPGTrainerTalent(alreadyTrained, { id: 'atleta:montaria-esportiva' });
		assert.equal(retained.skills.trained.filter(skill => skill === 'montaria-pokemon').length, 1);
		assert.equal(retained.talentSelections.at(-1).grantedSkill, undefined);
	});

	it('chooses two distinct untrained Knowledge areas and applies half proficiency without training', () => {
		const base = ready('arqueologo', 10);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'conhecimento-diversificado');
		assert(catalog.available);
		assert(catalog.choiceFields.skill && catalog.choiceFields.variant);
		assert(!catalog.variantChoices.includes('conhecimento:arqueologia-fosseis'));
		assert(!catalog.variantChoices.includes('conhecimento:organizacoes'));
		const choice = { id: 'conhecimento-diversificado', skill: 'conhecimento:regioes',
			variant: 'conhecimento:pokemon' };
		assert.throws(() => chooseRPGTrainerTalent(base, { id: choice.id }), /duas áreas/);
		assert.throws(() => chooseRPGTrainerTalent(base, { ...choice, variant: choice.skill }), /duas áreas/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ ...choice, skill: 'conhecimento:arqueologia-fosseis' }), /não treinadas/);
		const chosen = chooseRPGTrainerTalent(base, choice);
		assert(!chosen.skills.trained.includes(choice.skill));
		assert(!chosen.skills.trained.includes(choice.variant));
		assert.equal(rpgTrainerSkillBonus(chosen, choice.skill) - rpgTrainerSkillBonus(base, choice.skill), 2);
		assert.equal(rpgTrainerSkillBonus(chosen, choice.variant) - rpgTrainerSkillBonus(base, choice.variant), 2);
		assert.equal(rpgTrainerSkillBonus(chosen, 'conhecimento:ciencias'),
			rpgTrainerSkillBonus(base, 'conhecimento:ciencias'));
		assert.throws(() => rpgTrainerSkillBonus(chosen, choice.skill, undefined, true), /treinamento/);
		const mid = chooseRPGTrainerTalent(ready('arqueologo', 6), choice);
		assert.equal(rpgTrainerSkillBonus(mid, choice.skill) -
			rpgTrainerSkillBonus(ready('arqueologo', 6), choice.skill), 1);
	});

	it('acquires Specialized Help without restricting it to one trained skill', () => {
		const base = ready('arqueologo', 2);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'ajuda-especializada');
		assert.equal(catalog.choiceFields.skill, false);
		const chosen = chooseRPGTrainerTalent(base, { id: 'ajuda-especializada' });
		assert(chosen.talents.general.includes('ajuda-especializada'));
		assert.equal(chosen.talentSelections.at(-1).skill, undefined);
	});

	it('fixes a trained skill and an alternate attribute for Practical Competence', () => {
		const base = ready('arqueologo', 10);
		const catalog = rpgTrainerTalentCatalog(base).find(talent => talent.id === 'competencia-pratica');
		assert.equal(catalog.available, true);
		assert.equal(catalog.needsChoice, true);
		assert.equal(rpgTrainerTalentCatalog(ready('arqueologo', 2))
			.find(talent => talent.id === 'competencia-pratica').available, true);
		assert(catalog.choiceFields.skill && catalog.choiceFields.variant);
		assert(catalog.variantChoices.includes('wisdom'));
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao' }), /atributo alternativo/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'intelligence' }), /atributo alternativo/);
		assert.throws(() => chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'percepcao', variant: 'intelligence' }), /perícia treinada/);
		const chosen = chooseRPGTrainerTalent(base,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'wisdom' });
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'investigacao'), ['intelligence', 'wisdom']);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'atletismo'), ['strength']);
		assert.equal(rpgTrainerSkillBonus(chosen, 'investigacao', 'wisdom'),
			rpgTrainerSkillBonus(base, 'investigacao') - 1);
		assert.throws(() => rpgTrainerSkillBonus(chosen, 'investigacao', 'charisma'), /Atributo não permitido/);
		assert.throws(() => chooseRPGTrainerTalent(chosen,
			{ id: 'competencia-pratica', skill: 'investigacao', variant: 'strength' }), /já foi escolhida/);
		assert.equal(rpgTrainerTalentCatalog(ready('arqueologo', 1))
			.find(talent => talent.id === 'competencia-pratica').available, false);
	});

	it('lets Additional Training teach a skill outside the class list while Focus still requires training', () => {
		const original = ready('arqueologo', 10);
		assert(!original.skills.trained.includes('atuacao'));
		assert.throws(() => chooseRPGTrainerTalent(original,
			{ id: 'foco-em-pericia', skill: 'atuacao' }), /Foco exige treinamento/);
		const trained = chooseRPGTrainerTalent(original, { id: 'treinamento-adicional', skill: 'atuacao' });
		const focused = chooseRPGTrainerTalent(trained, { id: 'foco-em-pericia', skill: 'atuacao' });
		assert(focused.skills.trained.includes('atuacao'));
		assert(focused.skills.focused.includes('atuacao'));
		assert.throws(() => chooseRPGTrainerTalent(focused,
			{ id: 'foco-em-pericia', skill: 'atuacao' }), /já possui foco/);
	});

	it('applies attribute growth, Constitution PV and Robust retroactively without healing', () => {
		let sheet = ready('artista', 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:presenca-magnetica' });
		assert.equal(sheet.attributes.charisma, 11);
		assert.deepEqual(rpgTrainerTalentCatalog(ready('artista', 3))
			.find(talent => talent.id === 'artista:presenca-magnetica').attributeChoices, []);
		assert.throws(() => chooseRPGTrainerTalent(ready('artista', 3),
			{ id: 'artista:presenca-magnetica', attribute: 'strength' }), /não concede aumento/);
		let robust = chooseRPGTrainerTalent(ready('artista', 2), { id: 'robusto' });
		assert.equal(robust.hitPoints.maximum, 22);
		assert.equal(robust.hitPoints.current, 20);
		robust = awardRPGTrainerXP(robust, { kind: 'master', sourceId: 'test-level-3',
			amount: RPG_TRAINER_LEVEL_XP[2] - robust.experience, reason: 'Teste', grantedAt: 1 }).sheet;
		assert.equal(robust.hitPoints.maximum, 22);
		assert.equal(robust.hitPoints.current, 20);
		let con = ready('artista', 6, { attributes: { strength: 12, dexterity: 14,
			constitution: 13, intelligence: 14, wisdom: 12, charisma: 10 } });
		con = chooseRPGTrainerTalent(con, { id: 'aprimoramento-de-atributo', attribute: 'constitution' });
		assert.equal(con.hitPoints.maximum, 26);
		assert.equal(con.hitPoints.current, 20);
		assert.throws(() => chooseRPGTrainerTalent(con,
			{ id: 'aprimoramento-de-atributo', attribute: 'constitution' }), /já recebeu/);
	});

	it('automatically grants Body of Scene dexterity and permits it only for Performance checks', () => {
		const original = ready('artista', 3, { skills: { trained: ['atuacao'], focused: [] } });
		const catalog = rpgTrainerTalentCatalog(original).find(talent => talent.id === 'artista:corpo-de-cena');
		assert.deepEqual(catalog.attributeChoices, []);
		assert.deepEqual(rpgTrainerSkillAttributes(original, 'atuacao'), ['charisma']);
		assert.throws(() => chooseRPGTrainerTalent(original,
			{ id: 'artista:corpo-de-cena', attribute: 'dexterity' }), /não concede aumento/);
		const chosen = chooseRPGTrainerTalent(original, { id: 'artista:corpo-de-cena' });
		assert.equal(chosen.attributes.dexterity, 15);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'atuacao'), ['charisma', 'dexterity']);
		assert.equal(rpgTrainerSkillBonus(chosen, 'atuacao', 'dexterity'),
			rpgTrainerSkillBonus(chosen, 'atuacao', 'charisma') + 2);
		assert.deepEqual(rpgTrainerSkillAttributes(chosen, 'persuasao'), ['charisma']);
		assert.equal(chooseRPGTrainerTalent(ready('artista', 3, {
			attributes: { strength: 12, dexterity: 20, constitution: 13,
				intelligence: 14, wisdom: 12, charisma: 10 },
		}), { id: 'artista:corpo-de-cena' }).attributes.dexterity, 20);
	});

	it('records both Artist Versatile modalities and prevents repeating Signature Technique modalities', () => {
		let sheet = ready('artista', 7);
		const versatile = rpgTrainerTalentCatalog(sheet).find(talent => talent.id === 'artista:artista-versatil');
		assert.equal(versatile.choiceFields.variant, true);
		assert.equal(versatile.choiceFields.secondVariant, true);
		assert.deepEqual(versatile.attributeChoices.sort(), ['charisma', 'dexterity']);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura', variant: 'Canto' });
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'canto', secondVariant: 'Dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', secondVariant: 'dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', attribute: 'charisma' }), /modalidades artísticas diferentes/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'artista:artista-versatil',
			variant: 'Dança', secondVariant: 'Poesia', attribute: 'charisma' });
		const selection = sheet.talentSelections.find(entry => entry.id === 'artista:artista-versatil');
		assert.equal(selection.variant, 'Dança');
		assert.equal(selection.secondVariant, 'Poesia');
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'artista:tecnica-assinatura', variant: 'poesia' }),
			/modalidades artísticas diferentes/);
	});
	it('records three Athlete Versatile modalities without repeating Sports Specialties', () => {
		let sheet = ready('atleta', 7);
		const versatile = rpgTrainerTalentCatalog(sheet).find(talent => talent.id === 'atleta:atleta-polivalente');
		assert.equal(versatile.choiceFields.variant, true);
		assert.equal(versatile.choiceFields.secondVariant, true);
		assert.equal(versatile.choiceFields.thirdVariant, true);
		assert.deepEqual(versatile.attributeChoices.sort(), ['constitution', 'dexterity', 'strength']);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'atleta:especialidade-esportiva', variant: 'Corrida' });
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'corrida', secondVariant: 'Natação', thirdVariant: 'Escalada', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'natação', thirdVariant: 'Escalada', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		assert.throws(() => chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'Ginástica', attribute: 'strength' }),
		/modalidades esportivas diferentes/);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'atleta:atleta-polivalente',
			variant: 'Natação', secondVariant: 'Ginástica', thirdVariant: 'Escalada', attribute: 'strength' });
		const selection = sheet.talentSelections.find(entry => entry.id === 'atleta:atleta-polivalente');
		assert.deepEqual([selection.variant, selection.secondVariant, selection.thirdVariant],
			['Natação', 'Ginástica', 'Escalada']);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'atleta:especialidade-esportiva', variant: 'escalada' }), /modalidades esportivas diferentes/);
	});

	it('uses stable request IDs when a class talent may be acquired twice', () => {
		let sheet = ready('cientista', 7);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', injected: { money: 99999 } }), /Escolha de talento inválida/);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos' }), /identificador estável/);
		const first = { id: 'cientista:registros-paralelos', requestId: 'register-1' };
		sheet = chooseRPGTrainerTalent(sheet, first);
		assert.strictEqual(chooseRPGTrainerTalent(sheet, first), sheet);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:especializacao-cientifica', requestId: 'register-1', variant: 'conhecimento:biologia' }),
		/Identificador de escolha/);
		sheet = chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', requestId: 'register-2' });
		assert.equal(sheet.talents.class.length, 2);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'cientista:registros-paralelos', requestId: 'register-3' }), /já foi escolhido/);
	});

	it('accepts alternative prerequisites and verifies an area-specific chain', () => {
		let athlete = ready('atleta', 10);
		athlete = chooseRPGTrainerTalent(athlete,
			{ id: 'atleta:especialidade-esportiva', variant: 'corrida' });
		athlete = chooseRPGTrainerTalent(athlete, { id: 'atleta:recordista' });
		assert.equal(athlete.talents.apex, 'atleta:recordista');
		let scientist = ready('cientista', 7);
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:especializacao-cientifica', variant: 'conhecimento:quimica' }), /área de Conhecimento treinada/);
		scientist = chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:especializacao-cientifica', variant: 'conhecimento:arqueologia-fosseis' });
		assert.throws(() => chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:publicacao-de-referencia', variant: 'conhecimento:quimica' }), /Foco em Perícia/);
		scientist.skills.focused.push('conhecimento:arqueologia-fosseis');
		scientist.talents.general.push('foco-em-pericia');
		scientist = chooseRPGTrainerTalent(scientist,
			{ id: 'cientista:publicacao-de-referencia', variant: 'conhecimento:arqueologia-fosseis' });
		assert.equal(scientist.talents.class.length, 2);
	});

	it('offers only valid finite variants and trained Pilotagem categories', () => {
		const sheet = ready('arqueologo', 10, { skills: {
			trained: ['pilotagem:automoveis', 'conhecimento:arqueologia-fosseis'], focused: [],
		} });
		const catalog = rpgTrainerTalentCatalog(sheet);
		const variants = id => catalog.find(talent => talent.id === id).variantChoices;
		assert.deepEqual(variants('condutor-versatil'), ['pilotagem:automoveis']);
		assert(variants('aclimatacao').includes('floresta-umida'));
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'condutor-versatil', variant: 'pilotagem:motocicletas' }), /Pilotagem treinada/);
		assert.throws(() => chooseRPGTrainerTalent(sheet,
			{ id: 'aclimatacao', variant: 'qualquer ambiente' }), /variante disponível/);
		const chosen = chooseRPGTrainerTalent(sheet,
			{ id: 'condutor-versatil', variant: 'pilotagem:automoveis' });
		assert(chosen.talents.general.includes('condutor-versatil'));
		assert.equal(rpgTrainerSkillBonus(chosen, 'pilotagem:automoveis'),
			rpgTrainerSkillBonus(sheet, 'pilotagem:automoveis') + 2);
	});

	it('reflects trained resistance and passive talent bonuses in the sheet calculations', () => {
		const base = ready('arqueologo', 10);
		const resilient = chooseRPGTrainerTalent(base, { id: 'resiliente', resistance: 'reflexes' });
		assert(resilient.resistances.includes('reflexes'));
		assert.equal(rpgTrainerResistanceBonus(resilient, 'reflexes'),
			rpgTrainerResistanceBonus(base, 'reflexes') + rpgTrainerProficiency(10));
		let sheet = chooseRPGTrainerTalent(base, { id: 'iniciativa-aprimorada' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).initiativeBonus,
			rpgTrainerDerivedStatistics(base).initiativeBonus + 3);
		assert.equal(rollRPGTrainerInitiative(sheet, () => 0).total,
			rollRPGTrainerInitiative(base, () => 0).total + 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'corredor' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).movementMeters,
			rpgTrainerDerivedStatistics(base).movementMeters + 3);
		sheet = chooseRPGTrainerTalent(sheet, { id: 'carregador' });
		assert.equal(rpgTrainerDerivedStatistics(sheet).carrying.maximumKg,
			rpgTrainerDerivedStatistics(base).carrying.maximumKg * 1.5);
	});

	it('trains Reflexos through the martial talent or keeps its alternative situational bonus', () => {
		const base = ready('artista-marcial', 3, { resistances: ['fortitude'] });
		const trained = chooseRPGTrainerTalent(base, { id: 'artista-marcial:reflexos-treinados' });
		assert(trained.resistances.includes('reflexes'));
		const alreadyTrained = chooseRPGTrainerTalent(
			{ ...base, resistances: ['fortitude', 'reflexes'] },
			{ id: 'artista-marcial:reflexos-treinados' });
		assert.equal(alreadyTrained.talentSelections[0].variant, 'already-trained');
	});

	it('makes fixed class movement and unarmored defense effective', () => {
		assert.equal(rpgTrainerDerivedStatistics(ready('atleta')).movementMeters, 10.5);
		assert.equal(rpgTrainerDerivedStatistics(ready('artista-marcial')).defense, 13);
		assert.equal(rpgTrainerDerivedStatistics(ready('artista-marcial'), { shield: true }).defense, 14);
	});

	it('exposes only general and own-class talents with their acquisition state', () => {
		const sheet = ready('psiquico', 3);
		const catalog = rpgTrainerTalentCatalog(sheet);
		assert.equal(catalog.filter(talent => talent.kind === 'general').length, 54);
		assert.ok(catalog.some(talent => talent.id === 'psiquico:elo-telepatico'));
		assert.ok(!catalog.some(talent => talent.id === 'tecnologo:interface-remota'));
		assert.ok(catalog.some(talent => talent.id === 'psiquico:telecinese-ampliada' &&
			!talent.available));
	});

	it('checks Favor Institucional for Reputação Precedente and Master approval for controlled weapons', () => {
		const repository = new RPGMemoryCharacterRepository();
		const service = new RPGLoginService({ masterCode: 'teste', repository });
		service.createCharacter({ characterName: 'Ana', playerName: 'Conta', avatar: 'lucas',
			password: 'senha-rpg', initialMoney: 100, starter: { species: 'Squirtle', gender: 'M' } });
		const master = service.loginMaster('teste');
		const player = service.loginPlayer('ana', 'senha-rpg');
		const record = repository.get('ana');
		record.state.trainerSheet = ready('diplomata', 10);
		repository.set(record);
		assert.throws(() => service.chooseTrainerTalent(player.token,
			{ id: 'diplomata:reputacao-precedente' }), /Falta um talento exigido/);
		assert.throws(() => service.approveTrainerTalentPrerequisite(player.token, 'ana',
			'dominio-de-arma:armas-ranged-exoticas', 'Licença válida'), /master session required/);
		record.state.trainerSheet.talents.class.push('diplomata:favor-institucional');
		repository.set(record);
		const chosen = service.chooseTrainerTalent(player.token,
			{ id: 'diplomata:reputacao-precedente' });
		assert.ok(chosen.talents.class.includes('diplomata:reputacao-precedente'));
		assert.equal(chosen.talentApprovals?.length || 0, 0);
		assert.throws(() => service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' }), /licença verificada/);
		service.approveTrainerTalentPrerequisite(master.token, 'ana',
			'dominio-de-arma:armas-ranged-exoticas', 'Licença regional válida');
		const licensed = service.chooseTrainerTalent(player.token,
			{ id: 'dominio-de-arma', proficiency: 'armas-ranged-exoticas' });
		assert.ok(licensed.proficiencies.includes('armas-ranged-exoticas'));
		assert.equal(licensed.talentApprovals.length, 1);
	});
});
