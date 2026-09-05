'use strict';

const assert = require('assert').strict;
const {
	checkRPGBreedingCompatibility,
	canRPGPokemonEvolve,
	getRPGAllowedSexes,
	getRPGBreedingOffspringSpecies,
	getRPGBreedingProfile,
	rollRPGPokemonSex,
} = require('../../dist/sim/rpg-showdown');

describe('RPG breeding foundation', () => {
	it('uses official sex data with intentional RPG overrides', () => {
		assert.deepEqual(getRPGAllowedSexes('Pikachu'), ['M', 'F']);
		assert.deepEqual(getRPGAllowedSexes('Magnemite'), ['N']);
		assert.deepEqual(getRPGAllowedSexes('Gardevoir'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Gallade'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Glalie'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Froslass'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Mothim'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Wormadam'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Vileplume'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Bellossom'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Huntail'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Gorebyss'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Lopunny'), ['F']);
		assert.deepEqual(getRPGAllowedSexes('Diggersby'), ['M']);
		assert.deepEqual(getRPGAllowedSexes('Tauros-Paldea-Combat'), ['M']);
	});

	it('rolls mixed species by their Generation 9 ratio and preserves fixed sexes', () => {
		assert.equal(rollRPGPokemonSex('Salandit', () => 0.1), 'F');
		assert.equal(rollRPGPokemonSex('Salandit', () => 0.2), 'M');
		assert.equal(rollRPGPokemonSex('Gardevoir', () => 0.99), 'F');
		assert.equal(rollRPGPokemonSex('Magnemite', () => 0), 'N');
	});

	it('separates evolutionary lineage from special breeding family', () => {
		const tauros = getRPGBreedingProfile('Tauros-Paldea-Blaze');
		const miltank = getRPGBreedingProfile('Miltank');
		assert.equal(tauros.evolutionFamily, 'TAUROS');
		assert.equal(miltank.evolutionFamily, 'MILTANK');
		assert.equal(tauros.breedingFamily, 'TAUROS_MILTANK');
		assert.equal(miltank.breedingFamily, 'TAUROS_MILTANK');

		assert.equal(getRPGBreedingProfile('Ralts').breedingFamily, 'RALTS');
		assert.equal(getRPGBreedingProfile('Kirlia').breedingFamily, 'RALTS');
		assert.equal(getRPGBreedingProfile('Gallade').evolutionStage, 3);
	});
	it('keeps female-only evolutions while allowing the blocked male first stage to breed', () => {
		assert.equal(canRPGPokemonEvolve('Combee', 'M'), false);
		assert.equal(canRPGPokemonEvolve('Combee', 'F'), true);
		assert.equal(canRPGPokemonEvolve('Salandit', 'M'), false);
		assert.equal(canRPGPokemonEvolve('Salandit', 'F'), true);
		assert.equal(canRPGPokemonEvolve('Snorunt', 'M'), true);
		assert.equal(canRPGPokemonEvolve('Snorunt', 'F'), true);
	});

	it('validates sex, family and first-stage restrictions', () => {
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Gardevoir', sex: 'F' }, { species: 'Gallade', sex: 'M' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Ralts', sex: 'F' }, { species: 'Ralts', sex: 'M' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Gardevoir', sex: 'F' }, { species: 'Ralts', sex: 'M' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Gardevoir', sex: 'F' }, { species: 'Kirlia', sex: 'M' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Nidorina', sex: 'F' }, { species: 'Nidoking', sex: 'M' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Tauros', sex: 'M' }, { species: 'Miltank', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Volbeat', sex: 'M' }, { species: 'Illumise', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Buneary', sex: 'F' }, { species: 'Bunnelby', sex: 'M' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Lopunny', sex: 'F' }, { species: 'Diggersby', sex: 'M' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Glalie', sex: 'M' }, { species: 'Froslass', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Snorunt', sex: 'M' }, { species: 'Snorunt', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Mothim', sex: 'M' }, { species: 'Wormadam', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Burmy', sex: 'M' }, { species: 'Burmy', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Combee', sex: 'M' }, { species: 'Combee', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Combee', sex: 'M' }, { species: 'Vespiquen', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Salandit', sex: 'M' }, { species: 'Salandit', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Salandit', sex: 'M' }, { species: 'Salazzle', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Vileplume', sex: 'M' }, { species: 'Bellossom', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Oddish', sex: 'M' }, { species: 'Oddish', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Huntail', sex: 'M' }, { species: 'Gorebyss', sex: 'F' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Clamperl', sex: 'M' }, { species: 'Clamperl', sex: 'F' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Gardevoir', sex: 'M' }, { species: 'Gallade', sex: 'M' }
		).reason, 'invalid-sex-for-species');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Magneton', sex: 'N' }, { species: 'Magnezone', sex: 'N' }
		).compatible, true);
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Magnemite', sex: 'N' }, { species: 'Magnemite', sex: 'N' }
		).reason, 'first-stage-pair');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Magnemite', sex: 'N' }, { species: 'Ditto', sex: 'N' }
		).reason, 'different-family');
		assert.equal(checkRPGBreedingCompatibility(
			{ species: 'Magnemite', sex: 'N' }, { species: 'Pikachu', sex: 'M' }
		).reason, 'genderless');
	});

	it('resolves sex-dependent offspring for special families', () => {
		assert.equal(getRPGBreedingOffspringSpecies('RALTS', 'M'), 'Ralts');
		assert.equal(getRPGBreedingOffspringSpecies('NIDORAN', 'M'), 'Nidoran-M');
		assert.equal(getRPGBreedingOffspringSpecies('NIDORAN', 'F'), 'Nidoran-F');
		assert.equal(getRPGBreedingOffspringSpecies('TAUROS_MILTANK', 'F'), 'Miltank');
		assert.equal(getRPGBreedingOffspringSpecies('VOLBEAT_ILLUMISE', 'M'), 'Volbeat');
		assert.equal(getRPGBreedingOffspringSpecies('RABBIT', 'F'), 'Buneary');
		assert.equal(getRPGBreedingOffspringSpecies('EVOLUTION_MAGNEMITE', 'N'), 'Magnemite');
	});
});
