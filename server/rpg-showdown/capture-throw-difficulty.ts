import { Dex } from '../../sim/dex';

export interface RPGCaptureThrowDifficulty {
	id: string;
	name: string;
	num: number;
	heightM: number;
	weightKg: number;
	baseStatTotal: number;
	rarity: 'common' | 'uncommon' | 'rare' | 'pseudo-legendary';
	dc: number | null;
}

const STARTERS = new Set(('bulbasaur charmander squirtle chikorita cyndaquil totodile treecko torchic mudkip ' +
	'turtwig chimchar piplup snivy tepig oshawott chespin fennekin froakie rowlet litten popplio ' +
	'grookey scorbunny sobble sprigatito fuecoco quaxly').split(' '));
const FOSSILS = new Set(('omanyte kabuto aerodactyl lileep anorith cranidos shieldon tirtouga archen ' +
	'tyrunt amaura dracozolt arctozolt dracovish arctovish').split(' '));
const PSEUDO_LEGENDARIES = new Set(('dragonite tyranitar salamence metagross garchomp hydreigon ' +
	'goodra kommoo dragapult baxcalibur archaludon').split(' '));
const RARE_SPECIES = new Set(('snorlax lapras chansey kangaskhan rotom spiritomb zorua zoroark ' +
	'ditto absol feebas milotic larvesta volcarona').split(' '));
const PARADOX_SPECIES = new Set(('greattusk screamtail brutebonnet fluttermane slitherwing sandyshocks ' +
	'irontreads ironbundle ironhands ironjugulis ironmoth ironthorns roaringmoon ironvaliant ' +
	'walkingwake ironleaves gougingfire ragingbolt ironboulder ironcrown').split(' '));

/** A Pokédex fornece os dados; a CD é uma adaptação própria para o arremesso do RPG. */
export function rpgCaptureThrowDifficulty(speciesName: string): RPGCaptureThrowDifficulty {
	const dex = Dex.mod('gen9');
	const species = dex.species.get(speciesName);
	if (!species.exists || species.num <= 0) throw new Error('Espécie inválida para captura');
	const base = dex.species.get(species.baseSpecies);
	const tags = new Set<string>([...species.tags, ...base.tags]);
	const legendary = ['Restricted Legendary', 'Sub-Legendary', 'Mythical'].some(tag => tags.has(tag));
	const baseStatTotal = Object.values(species.baseStats).reduce((sum, stat) => sum + stat, 0);
	let first = base;
	while (first.prevo) first = dex.species.get(first.prevo);
	let last = base;
	while (last.evos?.length) last = dex.species.get(last.evos[0]);
	const pseudoLegendary = PSEUDO_LEGENDARIES.has(last.id);
	const rare = FOSSILS.has(first.id) ||
		RARE_SPECIES.has(base.id) || PARADOX_SPECIES.has(base.id) || tags.has('Ultra Beast');
	const rarity = legendary ? 'rare' : pseudoLegendary ? 'pseudo-legendary' : rare ? 'rare' :
		STARTERS.has(first.id) ? 'uncommon' : 'common';
	const rarityBonus = rarity === 'pseudo-legendary' ? 5 : rarity === 'rare' ? 3 :
		rarity === 'uncommon' ? 1 : 0;
	const power = baseStatTotal < 300 ? 2 : baseStatTotal < 450 ? 3 :
		baseStatTotal < 550 ? 5 : baseStatTotal < 600 ? 6 : 8;
	const size = species.heightm <= 0.3 ? 3 : species.heightm <= 0.6 ? 2 :
		species.heightm <= 1 ? 1 : species.heightm >= 3 ? -2 : species.heightm >= 2 ? -1 : 0;
	const weight = species.weightkg > 0 && species.weightkg <= 2 ? 1 :
		species.weightkg >= 300 ? -2 : species.weightkg >= 100 ? -1 : 0;
	const agility = species.baseStats.spe >= 100 ? 2 : species.baseStats.spe >= 70 ? 1 : 0;
	return { id: species.id, name: species.name, num: species.num, heightM: species.heightm,
		weightKg: species.weightkg, baseStatTotal, rarity,
		dc: legendary ? null : Math.max(9, Math.min(27, 11 + rarityBonus + power + size + weight + agility)) };
}
