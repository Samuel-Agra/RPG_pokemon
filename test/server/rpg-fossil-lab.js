'use strict';

const assert = require('assert').strict;
const { RPGLoginService, RPGMemoryCharacterRepository } = require('../../dist/server/rpg-showdown');

function setup() {
	let clock = 1_800_000_000_000;
	let byte = 0;
	const service = new RPGLoginService({
		masterCode: '14081998', repository: new RPGMemoryCharacterRepository(),
		random: () => 0.7, randomBytes: size => Buffer.alloc(size, ++byte), now: () => clock,
		sessionTtlMs: 10 * 86_400_000,
	});
	service.createCharacter({
		characterName: 'Samuel', playerName: 'Samuel', avatar: 'lucas', password: 'senha-rpg',
		initialMoney: 100_000, starter: { species: 'Squirtle', gender: 'M' },
	});
	const master = service.loginMaster('14081998');
	let bag = service.getBag(master.token, 'samuel');
	bag = service.masterSetBagItemQuantity(master.token, 'samuel', 'helixfossil', 3, bag.revision, 'add');
	service.masterSetBagItemQuantity(master.token, 'samuel', 'domefossil', 1, bag.revision, 'add');
	return { service, master, player: service.loginPlayer('samuel', 'senha-rpg'), advance: ms => { clock += ms; } };
}

describe('RPG fossil restoration laboratory', () => {
	it('analyzes a fossil and persists a standard restoration project', () => {
		const { service, player } = setup();
		let lab = service.getFossilLab(player.token);
		const helix = lab.fossils.find(fossil => fossil.itemId === 'helixfossil');
		assert.equal(helix.quantity, 3);
		assert(Number.isInteger(helix.sprite));
		assert.equal(helix.displaySpecies, '???');

		lab = service.analyzeFossil(player.token, undefined, 'helixfossil');
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'helixfossil').displaySpecies, 'Omanyte');
		lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', method: 'standard',
		});
		assert.equal(lab.money, 88_000);
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'helixfossil').quantity, 2);
		assert.equal(lab.projects[0].species, 'Omanyte');
		assert.equal(lab.projects[0].complete, false);
	});

	it('advances restoration only through the Master campaign clock and receives it in the Box', () => {
		const { service, master, player, advance } = setup();
		service.analyzeFossil(player.token, undefined, 'helixfossil');
		let lab = service.startFossilRestoration(player.token, undefined, {
			itemId: 'helixfossil', method: 'advanced', nature: 'Modest', ability: 'Shell Armor', gender: 'M',
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
		service.analyzeFossil(player.token, undefined, 'domefossil');
		const lab = service.donateFossil(player.token, undefined, 'domefossil');
		assert.equal(lab.fossils.find(fossil => fossil.itemId === 'domefossil').quantity, 0);
		assert(lab.archive.find(entry => entry.species === 'Kabuto').genome > 0);
		const sold = service.sellFossil(player.token, undefined, 'helixfossil');
		assert.equal(sold.value, 500);
		assert.equal(sold.fossilLab.money, 100_500);
	});
});
