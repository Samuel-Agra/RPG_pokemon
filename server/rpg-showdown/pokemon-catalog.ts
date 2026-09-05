import { Dex } from '../../sim/dex';
import { getRPGAllowedSexes } from '../../sim/rpg-showdown';
import { getRPGAbilityDescriptionPTBR } from './ability-descriptions-pt-br';

export interface RPGBattlePokemonCatalogEntry {
	id: string;
	name: string;
	num: number;
	spriteId: string;
	baseSpriteId: string;
	prevo: string | null;
	types: string[];
	abilities: string[];
	abilityDetails: { id: string, name: string, description: string, hidden: boolean }[];
	genders: string[];
	baseStats: { hp: number, atk: number, def: number, spa: number, spd: number, spe: number };
	legendary: boolean;
	mythical: boolean;
	pseudoLegendary: boolean;
	regularWildEligible: boolean;
	bossEligible: boolean;
}

export interface RPGPokedexMoveEntry {
	id: string;
	name: string;
	type: string;
	category: string;
	level?: number;
}

export interface RPGPokedexMoves {
	level: RPGPokedexMoveEntry[];
	tm: RPGPokedexMoveEntry[];
	egg: RPGPokedexMoveEntry[];
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
			const mythical = species.tags.includes('Mythical');
			const legendary = species.tags.some(tag =>
				tag === 'Restricted Legendary' || tag === 'Sub-Legendary' || tag === 'Mythical'
			);
			const pseudoLegendary = PSEUDO_LEGENDARIES.has(species.id);
			const abilityDetails = Object.entries(species.abilities).filter((entry): entry is [string, string] => !!entry[1])
				.map(([slot, name]) => {
					const ability = dex.abilities.get(name);
					return { id: ability.id, name: ability.name, description: getRPGAbilityDescriptionPTBR(ability.id), hidden: slot === 'H' };
				});
			return {
				id: species.id,
				name: species.name,
				types: [...species.types],
				abilities: [...new Set(abilityDetails.map(ability => ability.name))],
				abilityDetails,
				genders: [...getRPGAllowedSexes(species.name)],
				baseStats: { ...species.baseStats },
				num: species.num,
				spriteId: species.spriteid,
				baseSpriteId: dex.species.get(species.baseSpecies).spriteid,
				prevo: species.prevo || null,
				legendary,
				mythical,
				pseudoLegendary,
				regularWildEligible: !legendary,
				bossEligible: !BOSS_EXCLUDED_SPECIES.has(species.id) &&
					((legendary && !EVOLVING_LEGENDARIES.has(family)) || pseudoLegendary),
			};
		})
		.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
}

export function getRPGPokedexMoves(speciesName: string, includeCapturedMoves: boolean): RPGPokedexMoves {
	const dex = Dex.mod('gen9');
	const species = dex.species.get(speciesName);
	if (!species.exists) throw new Error('Pokémon inválido');
	const level = new Map<string, RPGPokedexMoveEntry>();
	const tm = new Map<string, RPGPokedexMoveEntry>();
	const egg = new Map<string, RPGPokedexMoveEntry>();
	const typeOrder: Record<string, number> = {
		Normal: 0, Grass: 1, Fire: 2, Water: 3, Electric: 4, Bug: 5,
		Flying: 6, Poison: 7, Rock: 8, Ground: 9, Ice: 10, Fighting: 11,
		Psychic: 12, Ghost: 13, Dragon: 14, Dark: 15, Steel: 16, Fairy: 17,
	};
	const categoryOrder: Record<string, number> = { Physical: 0, Special: 1, Status: 2 };
	const order = (a: RPGPokedexMoveEntry, b: RPGPokedexMoveEntry) =>
		(typeOrder[a.type] ?? 18) - (typeOrder[b.type] ?? 18) ||
		(categoryOrder[a.category] ?? 3) - (categoryOrder[b.category] ?? 3) ||
		a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
	const entry = (moveId: string): RPGPokedexMoveEntry | null => {
		const move = dex.moves.get(moveId);
		if (!move.exists || move.isNonstandard === 'CAP' || move.isNonstandard === 'Future') return null;
		return { id: move.id, name: move.name, type: move.type, category: move.category };
	};
	for (const learnsetData of dex.species.getFullLearnset(species.id)) {
		for (const [moveId, sources] of Object.entries(learnsetData.learnset)) {
			const move = entry(moveId);
			if (!move) continue;
			const levels = sources.flatMap(source => {
				const match = /^9L(\d+)/.exec(source);
				return match ? [Number(match[1])] : [];
			});
			if (levels.length) {
				const learnedAt = Math.min(...levels);
				const current = level.get(move.id);
				if (!current || learnedAt < (current.level ?? Infinity)) level.set(move.id, { ...move, level: learnedAt });
			}
			if (!includeCapturedMoves) continue;
			if (sources.some(source => source.startsWith('9M'))) tm.set(move.id, move);
			if (sources.some(source => source.startsWith('9E'))) egg.set(move.id, move);
		}
	}
	return {
		level: [...level.values()].sort(order),
		tm: [...tm.values()].sort(order),
		egg: [...egg.values()].sort(order),
	};
}
