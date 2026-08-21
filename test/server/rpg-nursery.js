'use strict';

const assert = require('assert').strict;
const { RPGNurseryGenetics } = require('../../dist/server/rpg-showdown');

function pokemon(species, gender, level, nature, ability, item = '') {
	return {
		name: species, species, gender, level, nature, ability, item,
		moves: ['tackle'],
		evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
		ivs: {hp: 1, atk: 2, def: 3, spa: 28, spd: 29, spe: 30},
		rpg: {version: 1, level, friendship: 50, item, captureBall: 'pokeball'},
	};
}

describe('RPG Pokemon Nursery genetics backend', () => {
	it('previews compatibility, ownership, penalties and item effects', () => {
		const slot1 = RPGNurseryGenetics.parent(
			'samuel', 'Samuel', 'player', 'gardevoir-1',
			pokemon('Gardevoir', 'F', 50, 'Modest', 'Synchronize', 'everstone')
		);
		const slot2 = RPGNurseryGenetics.parent(
			'marina', 'Marina', 'player', 'gallade-1',
			pokemon('Gallade', 'M', 80, 'Jolly', 'Sharpness', 'destinyknot')
		);
		const preview = RPGNurseryGenetics.preview(slot1, slot2);
		assert.equal(preview.compatibility.compatible, true);
		assert.equal(preview.family, 'RALTS');
		assert.equal(preview.eggOwnerId, 'samuel');
		assert.deepEqual(preview.possibleSpecies, ['Ralts']);
		assert.equal(preview.levelDifference, 30);
		assert.equal(preview.evolutionStageDifference, 0);
		assert.equal(preview.requiredBreedingTimeMs, 30 * 60 * 60 * 1000);
		assert(preview.itemEffects.some(effect => effect.includes('Everstone')));
		assert(preview.itemEffects.some(effect => effect.includes('Destiny Knot')));
		assert(preview.possibleEggMoves.length > 0);
	});

	it('freezes egg genetics and guarantees an Egg Move when available', () => {
		const slot1 = RPGNurseryGenetics.parent(
			'samuel', 'Samuel', 'player', 'gardevoir-1',
			pokemon('Gardevoir', 'F', 50, 'Modest', 'Synchronize', 'everstone')
		);
		const slot2 = RPGNurseryGenetics.parent(
			'marina', 'Marina', 'player', 'gallade-1',
			pokemon('Gallade', 'M', 50, 'Jolly', 'Sharpness', 'destinyknot')
		);
		const egg = RPGNurseryGenetics.createEgg('breeding-1', slot1, slot2, 1234, () => 0);
		assert.equal(egg.ownerId, 'samuel');
		assert.equal(egg.status, 'created');
		assert.equal(egg.genetics.species, 'Ralts');
		assert.equal(egg.genetics.nature, 'Modest');
		assert.equal(egg.genetics.shiny, true);
		assert(egg.genetics.eggMoves.length >= 1);
		assert(egg.genetics.moves.includes(egg.genetics.eggMoves[0]));
		assert.deepEqual(egg.genetics.parentIds, ['gardevoir-1', 'gallade-1']);
		assert.deepEqual(egg.genetics.parentOwnerIds, ['samuel', 'marina']);
		assert.equal(Object.keys(egg.genetics.ivs).length, 6);
		assert.equal(Object.keys(egg.genetics.ivOrigins).length, 6);
	});

	it('rejects first-stage pairs and supports two neutral compatible Pokemon', () => {
		const raltsF = RPGNurseryGenetics.parent(
			'a', 'A', 'player', 'ralts-f', pokemon('Ralts', 'F', 10, 'Hardy', 'Synchronize')
		);
		const raltsM = RPGNurseryGenetics.parent(
			'b', 'B', 'player', 'ralts-m', pokemon('Ralts', 'M', 10, 'Hardy', 'Trace')
		);
		assert.equal(RPGNurseryGenetics.preview(raltsF, raltsM).compatibility.reason, 'first-stage-pair');
		const magneton = RPGNurseryGenetics.parent(
			'a', 'A', 'player', 'magneton', pokemon('Magneton', 'N', 30, 'Hardy', 'Magnet Pull')
		);
		const magnezone = RPGNurseryGenetics.parent(
			'b', 'B', 'player', 'magnezone', pokemon('Magnezone', 'N', 40, 'Hardy', 'Sturdy')
		);
		assert.equal(RPGNurseryGenetics.preview(magneton, magnezone).compatibility.compatible, true);
	});
});
