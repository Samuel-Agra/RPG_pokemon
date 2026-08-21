'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

function setup() {
	let clock = 1_800_000_000_000;
	let byte = 0;
	let roll = 0.7;
	const service = new RPGLoginService({
		masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
		random: () => roll, randomBytes: size => Buffer.alloc(size, ++byte), now: () => clock,
		sessionTtlMs: 10 * 86_400_000,
	});
	service.createCharacter({
		characterName: 'Samuel', playerName: 'Samuel', avatar: 'lucas', password: 'senha-rpg',
		initialMoney: 100_000, starter: { species: 'Squirtle', gender: 'M' },
	});
	const master = service.loginMaster('14081998');
	let bag = service.getBag(master.token, 'samuel');
	bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 12, bag.revision, 'add');
	service.masterSetBagItemQuantity(master.token, 'samuel', 'domefossil', 3, bag.revision, 'add');
	return { service, master, player: service.loginPlayer('samuel', 'senha-rpg'),
		setRoll: value => { roll = value; }, advance: ms => { clock += ms; } };
}

describe('RPG fossil restoration laboratory', () => {
	it('analyzes a fossil and persists a standard restoration project', () => {
		const { service, player } = setup();
		let lab = service.getFossilLab(player.token);
		const helix = lab.fossils.find(fossil => fossil.itemId === 'helixfossil');
		assert.equal(helix.quantity, 12);
		assert.equal(helix.id, 'helixfossil');
		assert.equal(helix.quality, 'preserved');
		assert(Number.isInteger(helix.sprite));
		assert.equal(helix.displaySpecies, '???');

		for (let sample = 0; sample < 5; sample++) {
			lab = service.analyzeFossil(player.token, undefined, 'helixfossil', 'preserved');
		}
		assert.equal(lab.archive.find(entry => entry.itemId === 'helixfossil').genome, 100);
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'helixfossil').displaySpecies, 'Omanyte');
		const knownHelix = lab.fossils.find(fossil => fossil.itemId === 'helixfossil');
		assert.equal(knownHelix.natureDetails.find(nature => nature.name === 'Modest').plus, 'Sp. Attack');
		assert.equal(knownHelix.natureDetails.find(nature => nature.name === 'Modest').minus, 'Attack');
		assert(knownHelix.abilityDetails.find(ability => ability.name === 'Shell Armor').description.length > 10);
		lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', quality: 'preserved', sampleCount: 2, method: 'standard',
		});
		assert.equal(lab.money, 88_000);
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'helixfossil').quantity, 5);
		assert.equal(lab.projects[0].restorationChance, 40);
		assert.equal(lab.projects[0].species, 'Omanyte');
		assert.equal(lab.projects[0].complete, false);
	});

	it('advances restoration only through the Master campaign clock and receives it in the Box', () => {
		const { service, master, player, advance } = setup();
		for (let sample = 0; sample < 5; sample++) {
			service.analyzeFossil(player.token, undefined, 'helixfossil', 'preserved');
		}
		let lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', quality: 'preserved', sampleCount: 5,
			method: 'advanced', nature: 'Modest', ability: 'Shell Armor', gender: 'M',
		});
		const projectId = lab.projects[0].id;
		const remainingBefore = lab.projects[0].remainingMs;
		advance(24 * 60 * 60 * 1000);
		lab = service.getFossilLab(player.token);
		assert.equal(lab.projects[0].complete, false, 'real time must not advance campaign work');
		assert.equal(lab.projects[0].remainingMs, remainingBefore);
		assert.throws(() => service.advanceCampaignTime(player.token, 8), /master session required/);
		for (let step = 0; step < 12; step++) service.advanceCampaignTime(master.token, 8);
		lab = service.getFossilLab(player.token);
		assert.equal(lab.projects[0].complete, true);
		const result = service.receiveRestoredFossil(player.token, undefined, projectId);
		assert.equal(result.pokemon.species, 'Omanyte');
		assert.equal(result.pokemon.level, 1);
		assert.equal(result.pokemon.nature, 'Modest');
		assert.equal(result.pokemon.ability, 'Shell Armor');
		assert.equal(service.getBox(player.token).results.some(pokemon => pokemon.species === 'Omanyte'), true);
		assert.equal(result.fossilLab.projects.length, 0);
	});

	it('donates and sells fossils while updating research and money', () => {
		const { service, player } = setup();
		let lab = service.analyzeFossil(player.token, undefined, 'domefossil', 'preserved');
		assert.equal(lab.archive.find(entry => entry.itemId === 'domefossil').genome, 20);
		lab = service.donateFossil(player.token, undefined, 'domefossil', 'preserved');
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'domefossil').quantity, 1);
		const sold = service.sellFossil(player.token, undefined, 'helixfossil', 'preserved');
		assert.equal(sold.value, 500);
		assert.equal(sold.fossilLab.money, 100_500);
	});
	it('tracks three grades and removes an unknown grade proportionally', () => {
		const { service, master, player, setRoll } = setup();
		let bag = service.getBag(master.token, 'samuel');
		setRoll(0.2);
		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 2, bag.revision, 'add');
		setRoll(0.99);
		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 1, bag.revision, 'add');
		let lab = service.getFossilLab(player.token);
		assert.equal(lab.fossils.find(fossil => fossil.sampleKey === 'helixfossil:fragmented').quantity, 2);
		assert.equal(lab.fossils.find(fossil => fossil.sampleKey === 'helixfossil:preserved').quantity, 12);
		assert.equal(lab.fossils.find(fossil => fossil.sampleKey === 'helixfossil:exceptional').quantity, 1);

		setRoll(0.99);
		service.discardBagItem(player.token, undefined, 'helixfossil', 1, bag.revision);
		lab = service.getFossilLab(player.token);
		assert.equal(lab.fossils.some(fossil => fossil.sampleKey === 'helixfossil:exceptional'), false);
	});

	it('applies restoration chance and only reveals failure after completion', () => {
		const { service, master, player, setRoll } = setup();
		let bag = service.getBag(master.token, 'samuel');
		setRoll(0.2);
		service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 11, bag.revision, 'add');
		for (let sample = 0; sample < 10; sample++) {
			service.analyzeFossil(player.token, undefined, 'helixfossil', 'fragmented');
		}
		let lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', quality: 'fragmented', sampleCount: 1, method: 'standard',
		});
		assert.equal(lab.projects[0].restorationChance, 10);
		assert.equal(lab.projects[0].outcome, 'pending');
		for (let step = 0; step < 6; step++) service.advanceCampaignTime(master.token, 8);
		lab = service.getFossilLab(player.token);
		assert.equal(lab.projects[0].outcome, 'failed');
		const result = service.receiveRestoredFossil(player.token, undefined, lab.projects[0].id);
		assert.equal(result.pokemon, null);
		assert.equal(result.fossilLab.projects.length, 0);
	});

	it('combines fossil grades in one restoration project', () => {
		const { service, master, player, setRoll } = setup();
		for (let sample = 0; sample < 5; sample++) {
			service.analyzeFossil(player.token, undefined, 'helixfossil', 'preserved');
		}
		let bag = service.getBag(master.token, 'samuel');
		setRoll(0.2);
		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 2, bag.revision, 'add');
		setRoll(0.99);
		service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 1, bag.revision, 'add');
		const lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', method: 'standard',
			samples: {fragmented: 2, preserved: 1, exceptional: 1},
		});
		assert.equal(lab.projects[0].sampleCount, 4);
		assert.deepEqual(lab.projects[0].samples, {fragmented: 2, preserved: 1, exceptional: 1});
		assert.equal(lab.projects[0].restorationChance, 90);
		const preserved = lab.fossils.find(fossil => fossil.sampleKey === 'helixfossil:preserved');
		assert.equal(preserved.quantity, 6);
		assert.deepEqual(preserved.qualityQuantities, {fragmented: 0, preserved: 6, exceptional: 0});
	});

	it('preserves the randomly selected grade when transferring a fossil', () => {
		const { service, master, setRoll } = setup();
		service.createCharacter({
			characterName: 'Marina', playerName: 'Marina', avatar: 'rosa', password: 'senha-rpg',
			initialMoney: 0, starter: { species: 'Bulbasaur', gender: 'F' },
		});
		let senderBag = service.getBag(master.token, 'samuel');
		setRoll(0.99);
		senderBag = service.masterSetBagItemQuantity(
			master.token, 'samuel', 'helixfossil', 1, senderBag.revision, 'add'
		);
		const targetBag = service.getBag(master.token, 'marina');
		service.transferBagItem(
			master.token, 'samuel', 'marina', 'helixfossil', 1, senderBag.revision, targetBag.revision
		);
		const targetLab = service.getFossilLab(master.token, 'marina');
		assert.equal(targetLab.fossils.find(
			fossil => fossil.sampleKey === 'helixfossil:exceptional'
		).quantity, 1);
	});


	it('limits DNA to 100% and applies fossil Shiny odds and IV bonuses', () => {
		const { service, master, player, setRoll } = setup();
		for (let sample = 0; sample < 5; sample++) {
			service.analyzeFossil(player.token, undefined, 'helixfossil', 'preserved');
		}
		let bag = service.getBag(master.token, 'samuel');
		setRoll(0.2);
		bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 4, bag.revision, 'add');
		setRoll(0.99);
		service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 1, bag.revision, 'add');
		assert.throws(() => service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', method: 'standard',
			samples: {fragmented: 4, preserved: 4, exceptional: 0},
		}), /100%/);
		setRoll(0);
		let lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', method: 'standard',
			samples: {fragmented: 1, preserved: 2, exceptional: 1},
		});
		assert.equal(lab.projects[0].restorationChance, 100);
		assert.equal(lab.projects[0].shinyDenominator, 2896);
		assert.equal(lab.projects[0].ivBonus, 7);
		for (let step = 0; step < 6; step++) service.advanceCampaignTime(master.token, 8);
		lab = service.getFossilLab(player.token);
		const result = service.receiveRestoredFossil(player.token, undefined, lab.projects[0].id);
		assert.equal(result.pokemon.shiny, true);
		assert.deepEqual(result.pokemon.ivs, {hp: 7, atk: 7, def: 7, spa: 7, spd: 7, spe: 7});
	});


	it('lets the Master enable or disable Player access to Paleontology', () => {
		const { service, master, player } = setup();
		let character = service.setCharacterPageAccess(master.token, 'samuel', 'fossils', false);
		assert.equal(character.pageAccess.fossils, false);
		assert.throws(() => service.getFossilLab(player.token), /Paleontologia/);
		assert.equal(service.getFossilLab(master.token, 'samuel').fossils.length > 0, true);
		character = service.setCharacterPageAccess(master.token, 'samuel', 'fossils', true);
		assert.equal(character.pageAccess.fossils, true);
		assert.equal(service.getFossilLab(player.token).fossils.length > 0, true);
	});

});
