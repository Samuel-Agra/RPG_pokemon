import { Dex } from '../../sim/dex';

export interface RPGBattlePokemonCatalogEntry {
	id: string;
	name: string;
	num: number;
	spriteId: string;
	baseSpriteId: string;
	legendary: boolean;
	pseudoLegendary: boolean;
	regularWildEligible: boolean;
	bossEligible: boolean;
}

const PSEUDO_LEGENDARIES = new Set([
	'dragonite', 'tyranitar', 'salamence', 'metagross', 'garchomp', 'hydreigon',
	'goodra', 'goodrahisui', 'kommoo', 'dragapult', 'baxcalibur', 'archaludon',
]);

const BOSS_EXCLUDED_SPECIES = new Set([
	'goodra', 'goodrahisui', 'garchomp', 'hydreigon', 'dragapult', 'archaludon',
]);

/** Families excluded from the special wild legendary rule because they evolve. */
const EVOLVING_LEGENDARIES = new Set([
	'typenull', 'silvally', 'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'kubfu', 'urshifu',
	'meltan', 'melmetal',
]);

export function getRPGBattlePokemonCatalog(): RPGBattlePokemonCatalogEntry[] {
	const dex = Dex.mod('gen9');
	return dex.species.all()
		.filter(species => species.exists && species.num > 0 &&
			(!species.isNonstandard || species.isNonstandard === 'Past' || species.isNonstandard === 'LGPE') &&
			!species.battleOnly)
		.filter(species => species.id !== 'chromera')
		.filter(species => {
			if (!species.forme) return true;
			const family = species.baseSpecies.toLowerCase().replace(/[^a-z0-9]+/g, '');
			if (species.forme === 'Gmax' || family === 'pikachu' || family === 'vivillon' || family === 'arceus') return false;
			const base = dex.species.get(species.baseSpecies);
			return !base.cosmeticFormes?.includes(species.name);
		})
		.map(species => {
			const family = species.baseSpecies.toLowerCase().replace(/[^a-z0-9]+/g, '');
			const legendary = species.tags.some(tag =>
				tag === 'Restricted Legendary' || tag === 'Sub-Legendary' || tag === 'Mythical'
			);
			const pseudoLegendary = PSEUDO_LEGENDARIES.has(species.id);
			return {
				id: species.id,
				name: species.name,
				num: species.num,
				spriteId: species.spriteid,
				baseSpriteId: dex.species.get(species.baseSpecies).spriteid,
				legendary,
				pseudoLegendary,
				regularWildEligible: !legendary,
				bossEligible: !BOSS_EXCLUDED_SPECIES.has(species.id) &&
					((legendary && !EVOLVING_LEGENDARIES.has(family)) || pseudoLegendary),
			};
		})
		.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
}
