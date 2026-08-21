'use strict';

const assert = require('assert').strict;
const { RPGIncubation, RPGNurseryGenetics } = require('../../dist/server/rpg-showdown');

function pokemon(species, gender, level, nature, ability) {
	return {
		name: species, species, gender, level, nature, ability, item: '',
		moves: ['tackle'],
		evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
		ivs: {hp: 10, atk: 11, def: 12, spa: 13, spd: 14, spe: 15},
		rpg: {version: 1, level, friendship: 50, item: '', captureBall: 'pokeball'},
	};
}

function egg() {
	const slot1 = RPGNurseryGenetics.parent(
		'samuel', 'Samuel', 'player', 'gardevoir-1',
		pokemon('Gardevoir', 'F', 50, 'Modest', 'Synchronize')
	);
	const slot2 = RPGNurseryGenetics.parent(
		'marina', 'Marina', 'player', 'gallade-1',
		pokemon('Gallade', 'M', 50, 'Jolly', 'Sharpness')
	);
	return RPGNurseryGenetics.createEgg('project-1', slot1, slot2, 1000, () => 0);
}

describe('RPG Egg incubation backend', () => {
	it('keeps genetics hidden and treats every Egg as an individual entity', () => {
		const first = egg();
		const second = egg();
		second.id = 'project-2:egg';
		assert.notEqual(first.id, second.id);
		const view = RPGIncubation.view(first);
		assert.equal(view.eggId, first.id);
		assert.equal(view.status, 'created');
		assert.equal(view.progress, 0);
		assert.equal(view.message, 'Parece haver algo se movimentando la dentro.'.replace('la', 'l\\u00e1'));
		assert.equal('species' in view, false);
		assert.equal('genetics' in view, false);
		assert.equal('shiny' in view, false);
	});

	it('requires one Team slot and five Bag slots to carry an Egg', () => {
		const value = egg();
		assert.equal(RPGIncubation.canCarry({
			teamPokemon: 5, carriedEggs: 0, bagUsedSlots: 5, bagMaxSlots: 10,
		}).allowed, true);
		RPGIncubation.carry(value, {
			teamPokemon: 5, carriedEggs: 0, bagUsedSlots: 5, bagMaxSlots: 10,
		});
		assert.equal(value.status, 'carried');
		assert.throws(() => RPGIncubation.carry(egg(), {
			teamPokemon: 6, carriedEggs: 0, bagUsedSlots: 0, bagMaxSlots: 10,
		}), /equipe/);
		assert.throws(() => RPGIncubation.carry(egg(), {
			teamPokemon: 0, carriedEggs: 0, bagUsedSlots: 6, bagMaxSlots: 10,
		}), /Bag/);
	});

	it('only progresses inside one Incubator and resumes after a pause', () => {
		const value = egg();
		RPGIncubation.carry(value, {
			teamPokemon: 0, carriedEggs: 0, bagUsedSlots: 0, bagMaxSlots: 10,
		});
		const incubator = {id: 'incubator-1', ownerId: 'samuel'};
		assert.deepEqual(RPGIncubation.advance(value, 5 * 60 * 60 * 1000), {
			advanced: false, completed: false,
		});
		RPGIncubation.insert(value, incubator, 2000);
		assert.equal(value.status, 'incubating');
		assert.equal(incubator.eggId, value.id);
		const second = egg();
		RPGIncubation.carry(second, {teamPokemon: 0, carriedEggs: 1, bagUsedSlots: 0, bagMaxSlots: 10});
		assert.throws(() => RPGIncubation.insert(second, incubator, 2000), /possui um ovo/);
		RPGIncubation.advance(value, 6 * 60 * 60 * 1000);
		const accumulated = value.accumulatedIncubationTimeMs;
		RPGIncubation.remove(value, incubator);
		assert.equal(value.status, 'carried');
		RPGIncubation.advance(value, 8 * 60 * 60 * 1000);
		assert.equal(value.accumulatedIncubationTimeMs, accumulated);
		RPGIncubation.insert(value, incubator, 3000);
		RPGIncubation.advance(value, value.requiredIncubationTimeMs);
		assert.equal(value.status, 'ready_to_hatch');
		assert.equal(RPGIncubation.view(value).progress, 100);
		assert.throws(() => RPGIncubation.remove(value, incubator), /chocar/);
	});

	it('hatches at Level 1, reveals frozen genetics and frees the Incubator', () => {
		const value = egg();
		RPGIncubation.carry(value, {
			teamPokemon: 0, carriedEggs: 0, bagUsedSlots: 0, bagMaxSlots: 10,
		});
		const incubator = {id: 'incubator-1', ownerId: 'samuel'};
		RPGIncubation.insert(value, incubator, 2000);
		RPGIncubation.advance(value, RPGIncubation.requiredTime('Ralts'));
		const result = RPGIncubation.hatch(value, incubator, 9000);
		assert.equal(value.status, 'hatched');
		assert.equal(incubator.eggId, undefined);
		assert.equal(result.pokemon.level, 1);
		assert.equal(result.pokemon.species, value.genetics.species);
		assert.equal(result.revealed.shiny, value.genetics.shiny);
		assert.deepEqual(result.revealed.ivs, value.genetics.ivs);
		assert.deepEqual(result.revealed.parentIds, ['gardevoir-1', 'gallade-1']);
	});

	it('uses configurable species times without Ability acceleration', () => {
		assert(RPGIncubation.requiredTime('Magikarp') < RPGIncubation.requiredTime('Dratini'));
		assert.equal(RPGIncubation.requiredTime('Ralts'), 72 * 60 * 60 * 1000);
		assert.equal(RPGIncubation.advance.length, 2);
	});
});
