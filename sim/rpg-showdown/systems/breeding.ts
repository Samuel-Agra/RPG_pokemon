import { Dex } from "../../dex";
import { toID } from "../../dex-data";

export type RPGPokemonSex = 'M' | 'F' | 'N';
export type RPGBreedingFamilyId =
	'RALTS' | 'NIDORAN' | 'TAUROS_MILTANK' | 'VOLBEAT_ILLUMISE' | 'RABBIT' | `EVOLUTION_${string}`;

export interface RPGBreedingFamilyDefinition {
	id: RPGBreedingFamilyId;
	maleSpecies: readonly string[];
	femaleSpecies: readonly string[];
	offspringBySex: Readonly<Partial<Record<'M' | 'F', string>>>;
	allowFirstStagePair?: boolean;
}

export interface RPGBreedingProfile {
	species: string;
	evolutionFamily: string;
	breedingFamily: RPGBreedingFamilyId;
	evolutionStage: number;
	allowedSexes: readonly RPGPokemonSex[];
	canEvolveBySex: Readonly<Record<RPGPokemonSex, boolean>>;
}

export interface RPGBreedingCompatibility {
	compatible: boolean;
	reason:
		'compatible' | 'same-sex' | 'genderless' | 'invalid-sex-for-species' |
		'different-family' | 'first-stage-pair';
	family?: RPGBreedingFamilyId;
}

/** RPG overrides take precedence over the official Generation 9 species data. */
export const RPG_SPECIES_SEX_OVERRIDES: Readonly<Record<string, RPGPokemonSex>> = Object.freeze({
	gardevoir: 'F', gallade: 'M',
	glalie: 'M', froslass: 'F',
	mothim: 'M', wormadam: 'F',
	vileplume: 'M', bellossom: 'F',
	huntail: 'M', gorebyss: 'F',
	nidoranm: 'M', nidorino: 'M', nidoking: 'M',
	nidoranf: 'F', nidorina: 'F', nidoqueen: 'F',
	tauros: 'M', miltank: 'F', volbeat: 'M', illumise: 'F',
	buneary: 'F', lopunny: 'F', bunnelby: 'M', diggersby: 'M',
});

export const RPG_SPECIAL_BREEDING_FAMILIES: Readonly<Record<string, RPGBreedingFamilyDefinition>> = Object.freeze({
	RALTS: {
		id: 'RALTS', maleSpecies: ['ralts', 'kirlia', 'gallade'],
		femaleSpecies: ['ralts', 'kirlia', 'gardevoir'],
		offspringBySex: { M: 'Ralts', F: 'Ralts' },
	},
	NIDORAN: {
		id: 'NIDORAN', maleSpecies: ['nidoranm', 'nidorino', 'nidoking'],
		femaleSpecies: ['nidoranf', 'nidorina', 'nidoqueen'],
		offspringBySex: { M: 'Nidoran-M', F: 'Nidoran-F' },
	},
	TAUROS_MILTANK: {
		id: 'TAUROS_MILTANK', maleSpecies: ['tauros'], femaleSpecies: ['miltank'],
		offspringBySex: { M: 'Tauros', F: 'Miltank' }, allowFirstStagePair: true,
	},
	VOLBEAT_ILLUMISE: {
		id: 'VOLBEAT_ILLUMISE', maleSpecies: ['volbeat'], femaleSpecies: ['illumise'],
		offspringBySex: { M: 'Volbeat', F: 'Illumise' }, allowFirstStagePair: true,
	},
	RABBIT: {
		id: 'RABBIT', maleSpecies: ['bunnelby', 'diggersby'], femaleSpecies: ['buneary', 'lopunny'],
		offspringBySex: { M: 'Bunnelby', F: 'Buneary' },
	},
});

const SPECIAL_FAMILY_BY_SPECIES = new Map<string, RPGBreedingFamilyDefinition>();
for (const family of Object.values(RPG_SPECIAL_BREEDING_FAMILIES)) {
	for (const species of [...family.maleSpecies, ...family.femaleSpecies]) {
		SPECIAL_FAMILY_BY_SPECIES.set(toID(species), family);
	}
}

function canonicalSpeciesId(speciesName: string): string {
	const species = Dex.mod('gen9').species.get(speciesName);
	if (!species.exists) throw new Error(`Unknown RPG species: ${speciesName}`);
	if (species.baseSpecies === 'Tauros') return 'tauros';
	return species.id;
}

function evolutionData(speciesName: string): { root: string, stage: number } {
	const dex = Dex.mod('gen9');
	let species = dex.species.get(speciesName);
	if (!species.exists) throw new Error(`Unknown RPG species: ${speciesName}`);
	if (species.baseSpecies === 'Tauros') return { root: 'tauros', stage: 1 };
	let stage = 1;
	const visited = new Set<string>();
	while (species.prevo && !visited.has(species.id)) {
		visited.add(species.id);
		species = dex.species.get(species.prevo);
		stage++;
	}
	return { root: species.id, stage };
}

export function getRPGAllowedSexes(speciesName: string): readonly RPGPokemonSex[] {
	const species = Dex.mod('gen9').species.get(speciesName);
	if (!species.exists) throw new Error(`Unknown RPG species: ${speciesName}`);
	const canonicalId = canonicalSpeciesId(speciesName);
	const override = RPG_SPECIES_SEX_OVERRIDES[canonicalId] || RPG_SPECIES_SEX_OVERRIDES[species.id];
	if (override) return [override];
	if (species.gender === 'M' || species.gender === 'F' || species.gender === 'N') return [species.gender];
	return ['M', 'F'];
}

/** Uses official ratios unless the RPG has a fixed-sex override. */
export function rollRPGPokemonSex(speciesName: string, random: () => number = Math.random): RPGPokemonSex {
	const allowed = getRPGAllowedSexes(speciesName);
	if (allowed.length === 1) return allowed[0];
	const value = random();
	if (!Number.isFinite(value) || value < 0 || value >= 1) {
		throw new Error('RPG random source must return a value from 0 to below 1');
	}
	const species = Dex.mod('gen9').species.get(speciesName);
	return value < species.genderRatio.F ? 'F' : 'M';
}

export function canRPGPokemonEvolve(speciesName: string, sex: RPGPokemonSex): boolean {
	const dex = Dex.mod('gen9');
	const species = dex.species.get(speciesName);
	if (!species.exists) throw new Error(`Unknown RPG species: ${speciesName}`);
	if (!getRPGAllowedSexes(species.name).includes(sex)) return false;
	return species.evos.some(evolutionName => {
		const evolution = dex.species.get(evolutionName);
		return evolution.exists && getRPGAllowedSexes(evolution.name).includes(sex);
	});
}

export function getRPGBreedingProfile(speciesName: string): RPGBreedingProfile {
	const species = Dex.mod('gen9').species.get(speciesName);
	if (!species.exists) throw new Error(`Unknown RPG species: ${speciesName}`);
	const canonicalId = canonicalSpeciesId(speciesName);
	const evolution = evolutionData(speciesName);
	const special = SPECIAL_FAMILY_BY_SPECIES.get(canonicalId) || SPECIAL_FAMILY_BY_SPECIES.get(species.id);
	return {
		species: species.name,
		evolutionFamily: evolution.root.toUpperCase(),
		breedingFamily: special?.id || `EVOLUTION_${evolution.root.toUpperCase()}`,
		evolutionStage: evolution.stage,
		canEvolveBySex: {
			M: canRPGPokemonEvolve(speciesName, 'M'),
			F: canRPGPokemonEvolve(speciesName, 'F'),
			N: canRPGPokemonEvolve(speciesName, 'N'),
		},
		allowedSexes: getRPGAllowedSexes(speciesName),
	};
}

export function canRPGPokemonBreedAtCurrentStage(speciesName: string, sex: RPGPokemonSex): boolean {
	const profile = getRPGBreedingProfile(speciesName);
	const family = RPG_SPECIAL_BREEDING_FAMILIES[profile.breedingFamily];
	return profile.evolutionStage !== 1 || !profile.canEvolveBySex[sex] || !!family?.allowFirstStagePair;
}

/** Data-level validation only; egg creation and breeding progression are intentionally not implemented yet. */
export function checkRPGBreedingCompatibility(
	first: { species: string, sex: RPGPokemonSex }, second: { species: string, sex: RPGPokemonSex }
): RPGBreedingCompatibility {
	const firstProfile = getRPGBreedingProfile(first.species);
	const secondProfile = getRPGBreedingProfile(second.species);
	if (!firstProfile.allowedSexes.includes(first.sex) || !secondProfile.allowedSexes.includes(second.sex)) {
		return { compatible: false, reason: 'invalid-sex-for-species' };
	}
	const onlyOneIsGenderless = (first.sex === 'N') !== (second.sex === 'N');
	if (onlyOneIsGenderless) return { compatible: false, reason: 'genderless' };
	if (first.sex !== 'N' && first.sex === second.sex) return { compatible: false, reason: 'same-sex' };
	if (firstProfile.breedingFamily !== secondProfile.breedingFamily) {
		return { compatible: false, reason: 'different-family' };
	}
	if (!canRPGPokemonBreedAtCurrentStage(first.species, first.sex) ||
		!canRPGPokemonBreedAtCurrentStage(second.species, second.sex)) {
		return { compatible: false, reason: 'first-stage-pair', family: firstProfile.breedingFamily };
	}
	return { compatible: true, reason: 'compatible', family: firstProfile.breedingFamily };
}

export function getRPGBreedingOffspringSpecies(familyId: RPGBreedingFamilyId, sex: RPGPokemonSex): string {
	const special = RPG_SPECIAL_BREEDING_FAMILIES[familyId];
	if (special) {
		const offspring = sex === 'N' ? undefined : special.offspringBySex[sex];
		if (!offspring) throw new Error(`RPG breeding family ${familyId} has no offspring for sex ${sex}`);
		return offspring;
	}
	const root = familyId.slice('EVOLUTION_'.length).toLowerCase();
	const species = Dex.mod('gen9').species.get(root);
	if (!species.exists) throw new Error(`Unknown RPG breeding family: ${familyId}`);
	return species.name;
}
