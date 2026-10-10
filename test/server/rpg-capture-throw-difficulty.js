'use strict';

const assert = require('assert').strict;
const { rpgCaptureThrowDifficulty } = require('../../dist/server/rpg-showdown/capture-throw-difficulty');
const { getRPGBattlePokemonCatalog } = require('../../dist/server/rpg-showdown/pokemon-catalog');

describe('RPG Pokemon capture throw difficulty', () => {
	it('assigns a deterministic difficulty from species rarity, power, size and weight', () => {
		const caterpie = rpgCaptureThrowDifficulty('Caterpie');
		const pikachu = rpgCaptureThrowDifficulty('Pikachu');
		const garchomp = rpgCaptureThrowDifficulty('Garchomp');
		assert.equal(caterpie.dc, 16);
		assert.equal(pikachu.dc, 17);
		assert.ok(garchomp.dc > caterpie.dc);
		assert.equal(rpgCaptureThrowDifficulty('Garchomp').dc, garchomp.dc);
		assert.equal(rpgCaptureThrowDifficulty('Iron Crown').rarity, 'rare');
		assert.ok(caterpie.heightM < garchomp.heightM);
	});
	it('applies +5 rarity to whole pseudo-legendary lines and +3 to other rare species', () => {
		for (const name of ['Dratini', 'Dragonair', 'Dragonite', 'Beldum', 'Metang', 'Metagross',
			'Gible', 'Gabite', 'Garchomp', 'Duraludon', 'Archaludon']) {
			assert.equal(rpgCaptureThrowDifficulty(name).rarity, 'pseudo-legendary', name);
		}
		for (const name of ['Aerodactyl', 'Snorlax', 'Iron Crown']) {
			assert.equal(rpgCaptureThrowDifficulty(name).rarity, 'rare', name);
		}
		assert.equal(rpgCaptureThrowDifficulty('Dratini').dc, 19);
		assert.equal(rpgCaptureThrowDifficulty('Snorlax').dc, 16);
		assert.equal(rpgCaptureThrowDifficulty('Garchomp').dc, 26);
	});
	it('never allows a throw to hit legendary or mythical Pokemon, including forms', () => {
		for (const name of ['Mewtwo', 'Mew', 'Zacian', 'Meltan', 'Urshifu']) {
			assert.equal(rpgCaptureThrowDifficulty(name).dc, null, name);
		}
		assert.notEqual(rpgCaptureThrowDifficulty('Dragonite').dc, null);
	});
	it('rejects unknown species', () => {
		assert.throws(() => rpgCaptureThrowDifficulty('NotAPokemon'), /Espécie inválida/);
	});
	it('covers every battle catalog species and form without assigning a numeric CD to legendary Pokemon', () => {
		const catalog = getRPGBattlePokemonCatalog();
		assert.equal(catalog.length, 1184);
		for (const entry of catalog) {
			const difficulty = rpgCaptureThrowDifficulty(entry.name);
			assert.equal(difficulty.num, entry.num);
			if (entry.legendary) assert.equal(difficulty.dc, null, entry.name);
			if (difficulty.dc !== null) assert.ok(difficulty.dc >= 9 && difficulty.dc <= 27);
		}
	});
});
