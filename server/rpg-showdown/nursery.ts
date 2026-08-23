import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import type { RPGCapturedPokemon } from '../../sim/rpg-showdown';
import {
	checkRPGBreedingCompatibility,
	getRPGBreedingOffspringSpecies,
	getRPGBreedingProfile,
	getRPGAllowedSexes,
	rollRPGPokemonSex,
	type RPGBreedingCompatibility,
	type RPGBreedingFamilyId,
	type RPGPokemonSex,
} from '../../sim/rpg-showdown/systems/breeding';

export type RPGNurseryParticipantType = 'player' | 'npc';
export type RPGNurseryStatus =
	'inviting' | 'configuring' | 'awaiting_confirmation' | 'breeding' | 'egg_ready' | 'collected' | 'cancelled';
export type RPGEggStatus = 'created' | 'carried' | 'incubating' | 'ready_to_hatch' | 'hatched';
export type RPGGeneticOrigin = 'slot1' | 'slot2' | 'random';
export type RPGGeneticStat = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface RPGNurseryParent {
	ownerId: string;
	ownerName: string;
	participantType: RPGNurseryParticipantType;
	pokemonId: string;
	species: string;
	name: string;
	sex: RPGPokemonSex;
	level: number;
	evolutionStage: number;
	nature: string;
	ability: string;
	item: string;
	ivs: Record<RPGGeneticStat, number>;
	moves: string[];
}

export interface RPGNurseryGeneticPreview {
	compatibility: RPGBreedingCompatibility;
	family?: RPGBreedingFamilyId;
	eggOwnerId: string;
	possibleSpecies: string[];
	possibleNatures: string[];
	possibleAbilities: string[];
	possibleEggMoves: string[];
	ivOrigins: RPGGeneticOrigin[];
	requiredBreedingTimeMs?: number;
	levelDifference?: number;
	evolutionStageDifference?: number;
	itemEffects: string[];
}

export interface RPGNurseryEggGenetics {
	species: string;
	sex: RPGPokemonSex;
	nature: string;
	ability: string;
	ivs: Record<RPGGeneticStat, number>;
	ivOrigins: Record<RPGGeneticStat, RPGGeneticOrigin>;
	moves: string[];
	eggMoves: string[];
	shiny: boolean;
	family: RPGBreedingFamilyId;
	lineage: string;
	parentIds: [string, string];
	parentOwnerIds: [string, string];
}

export interface RPGNurseryEgg {
	id: string;
	ownerId: string;
	status: RPGEggStatus;
	createdAt: number;
	genetics: RPGNurseryEggGenetics;
	requiredIncubationTimeMs?: number;
	accumulatedIncubationTimeMs?: number;
	incubationStartedAt?: number;
	incubatorId?: string;
	portableIncubator?: boolean;
	portableIncubatorId?: string;
	portableIncubatorMission?: boolean;
	hatchedAt?: number;
}

export interface RPGNurseryProject {
	id: string;
	slot1: RPGNurseryParent;
	slot2?: RPGNurseryParent;
	slot2OwnerId?: string;
	slot2OwnerName?: string;
	slot2ParticipantType: RPGNurseryParticipantType;
	eggOwnerId: string;
	status: RPGNurseryStatus;
	confirmed: Record<string, boolean>;
	createdAt: number;
	breedingStartedAt?: number;
	requiredBreedingTimeMs?: number;
	remainingBreedingTimeMs?: number;
	parentCollected?: Record<string, boolean>;
	egg?: RPGNurseryEgg;
}

export interface RPGNurseryCharacterState {
	version: 1;
	projects: RPGNurseryProject[];
	incubators: { id: string, ownerId: string, eggId?: string, kind?: 'local', group?: number, slot?: number }[];
}

export interface RPGNurseryMasterPartnerOption {
	species: string;
	sex: RPGPokemonSex;
}

export interface RPGNurseryMasterSlot2Input {
	projectId: string;
	species: string;
	sex: RPGPokemonSex;
	level: number;
	ivs: Record<RPGGeneticStat, number>;
	item: '' | 'everstone' | 'destinyknot';
}

export const RPG_NURSERY_BREEDING_ITEMS = Object.freeze([
	{id: '', name: 'Nenhum', description: 'Sem efeito adicional na procria\u00e7\u00e3o.'},
	{id: 'everstone', name: 'Everstone', description: 'Permite que a Nature deste progenitor seja herdada.'},
	{id: 'destinyknot', name: 'Destiny Knot', description: 'Faz cinco IVs serem herdados dos progenitores.'},
] as const);

const STATS: readonly RPGGeneticStat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const BASE_BREEDING_TIME_MS = 24 * 60 * 60 * 1000;
const LEVEL_PENALTY_STEP_MS = 2 * 60 * 60 * 1000;
const STAGE_PENALTY_MS = 6 * 60 * 60 * 1000;

export class RPGNurseryGenetics {
	static parent(ownerId: string, ownerName: string, participantType: RPGNurseryParticipantType,
		pokemonId: string, pokemon: RPGCapturedPokemon): RPGNurseryParent {
		const profile = getRPGBreedingProfile(pokemon.species);
		return {
			ownerId: toID(ownerId), ownerName, participantType, pokemonId,
			species: pokemon.species, name: pokemon.name || pokemon.species,
			sex: pokemon.gender as RPGPokemonSex, level: pokemon.level,
			evolutionStage: profile.evolutionStage, nature: pokemon.nature,
			ability: pokemon.ability, item: toID(pokemon.item || pokemon.rpg?.item || ''),
			ivs: this.ivs(pokemon.ivs), moves: [...pokemon.moves],
		};
	}

	static compatiblePartners(slot1: RPGNurseryParent): RPGNurseryMasterPartnerOption[] {
		const dex = Dex.mod('gen9');
		const options: RPGNurseryMasterPartnerOption[] = [];
		for (const species of dex.species.all()) {
			if (!species.exists || species.isNonstandard || species.battleOnly) continue;
			if (toID(species.name) !== toID(species.baseSpecies || species.name)) continue;
			for (const sex of getRPGAllowedSexes(species.name)) {
				const compatibility = checkRPGBreedingCompatibility(
					{species: slot1.species, sex: slot1.sex}, {species: species.name, sex}
				);
				if (compatibility.compatible) options.push({species: species.name, sex});
			}
		}
		return options.sort((a, b) => a.species.localeCompare(b.species) || a.sex.localeCompare(b.sex));
	}

	static preview(slot1: RPGNurseryParent, slot2: RPGNurseryParent): RPGNurseryGeneticPreview {
		const compatibility = checkRPGBreedingCompatibility(
			{species: slot1.species, sex: slot1.sex}, {species: slot2.species, sex: slot2.sex}
		);
		const result: RPGNurseryGeneticPreview = {
			compatibility, family: compatibility.family, eggOwnerId: slot1.ownerId,
			possibleSpecies: [], possibleNatures: [...new Set([slot1.nature, slot2.nature])],
			possibleAbilities: [], possibleEggMoves: [], ivOrigins: ['slot1', 'slot2', 'random'],
			itemEffects: this.itemEffects(slot1, slot2),
		};
		if (!compatibility.compatible || !compatibility.family) return result;
		result.possibleSpecies = this.possibleOffspring(compatibility.family);
		result.possibleAbilities = [...new Set(result.possibleSpecies.flatMap(name =>
			Object.values(Dex.mod('gen9').species.get(name).abilities).filter(Boolean)))];
		result.possibleEggMoves = [...new Set(result.possibleSpecies.flatMap(name => this.eggMoves(name)))];
		result.levelDifference = Math.abs(slot1.level - slot2.level);
		result.evolutionStageDifference = Math.abs(slot1.evolutionStage - slot2.evolutionStage);
		result.requiredBreedingTimeMs = this.requiredTime(slot1, slot2);
		return result;
	}

	static requiredTime(slot1: RPGNurseryParent, slot2: RPGNurseryParent): number {
		const levelDifference = Math.abs(slot1.level - slot2.level);
		const stageDifference = Math.abs(slot1.evolutionStage - slot2.evolutionStage);
		return BASE_BREEDING_TIME_MS + Math.floor(levelDifference / 10) * LEVEL_PENALTY_STEP_MS +
			stageDifference * STAGE_PENALTY_MS;
	}

	static createEgg(projectId: string, slot1: RPGNurseryParent, slot2: RPGNurseryParent,
		now: number, random: () => number): RPGNurseryEgg {
		const preview = this.preview(slot1, slot2);
		if (!preview.compatibility.compatible || !preview.family) {
			throw new Error('Os Pok\\u00e9mon selecionados n\\u00e3o s\\u00e3o compat\\u00edveis');
		}
		const sexAndSpecies = this.offspring(preview.family, random);
		const species = Dex.mod('gen9').species.get(sexAndSpecies.species);
		const abilities = [...new Set(Object.values(species.abilities).filter(Boolean))];
		const nature = this.inheritNature(slot1, slot2, random);
		const ability = abilities[this.randomIndex(abilities.length, random)] || species.abilities[0];
		const inherited = this.inheritIVs(slot1, slot2, random);
		const eggMoves = this.selectEggMoves(species.name, random);
		const levelMoves = this.levelOneMoves(species.name);
		const moves = [...eggMoves, ...levelMoves.filter(move => !eggMoves.includes(move))].slice(0, 4);
		if (!moves.length) moves.push('tackle');
		return {
			id: projectId + ':egg', ownerId: slot1.ownerId, status: 'created', createdAt: now,
			genetics: {
				species: species.name, sex: sexAndSpecies.sex, nature, ability,
				ivs: inherited.ivs, ivOrigins: inherited.origins, moves, eggMoves,
				shiny: random() < 1 / 4096, family: preview.family,
				lineage: getRPGBreedingProfile(species.name).evolutionFamily,
				parentIds: [slot1.pokemonId, slot2.pokemonId],
				parentOwnerIds: [slot1.ownerId, slot2.ownerId],
			},
		};
	}

	private static offspring(family: RPGBreedingFamilyId, random: () => number) {
		let male: string | undefined, female: string | undefined, neutral: string | undefined;
		try { male = getRPGBreedingOffspringSpecies(family, 'M'); } catch {}
		try { female = getRPGBreedingOffspringSpecies(family, 'F'); } catch {}
		try { neutral = getRPGBreedingOffspringSpecies(family, 'N'); } catch {}
		if (neutral && !male && !female) return {species: neutral, sex: 'N' as RPGPokemonSex};
		const provisional = male || female;
		if (!provisional) throw new Error('Fam\\u00edlia reprodutiva sem filhote v\\u00e1lido');
		if (male && female && toID(male) !== toID(female)) {
			const sex: RPGPokemonSex = random() < .5 ? 'F' : 'M';
			return {species: sex === 'F' ? female : male, sex};
		}
		const species = male || female!;
		return {species, sex: rollRPGPokemonSex(species, random)};
	}

	private static possibleOffspring(family: RPGBreedingFamilyId): string[] {
		const values: string[] = [];
		for (const sex of ['M', 'F', 'N'] as const) {
			try { values.push(getRPGBreedingOffspringSpecies(family, sex)); } catch {}
		}
		return [...new Set(values)];
	}

	private static inheritNature(a: RPGNurseryParent, b: RPGNurseryParent, random: () => number): string {
		const holders = [a, b].filter(parent => parent.item === 'everstone');
		if (holders.length) return holders[this.randomIndex(holders.length, random)].nature;
		const natures = Dex.mod('gen9').natures.all();
		return natures[this.randomIndex(natures.length, random)].name;
	}

	private static inheritIVs(a: RPGNurseryParent, b: RPGNurseryParent, random: () => number) {
		const ivs = {} as Record<RPGGeneticStat, number>;
		const origins = {} as Record<RPGGeneticStat, RPGGeneticOrigin>;
		const destinyKnot = a.item === 'destinyknot' || b.item === 'destinyknot';
		const forced = new Set<RPGGeneticStat>();
		if (destinyKnot) {
			const pool = [...STATS];
			while (forced.size < 5) forced.add(pool.splice(this.randomIndex(pool.length, random), 1)[0]);
		}
		for (const stat of STATS) {
			let origin: RPGGeneticOrigin;
			if (destinyKnot && !forced.has(stat)) {
				origin = 'random';
			} else {
				origin = (['slot1', 'slot2', 'random'] as const)[this.randomIndex(3, random)];
				if (destinyKnot && forced.has(stat) && origin === 'random') origin = random() < .5 ? 'slot1' : 'slot2';
			}
			origins[stat] = origin;
			ivs[stat] = origin === 'slot1' ? a.ivs[stat] : origin === 'slot2' ? b.ivs[stat] :
				Math.floor(random() * 32);
		}
		return {ivs, origins};
	}

	private static selectEggMoves(species: string, random: () => number): string[] {
		const pool = this.eggMoves(species);
		if (!pool.length) return [];
		const count = 1 + this.randomIndex(Math.min(4, pool.length), random);
		const available = [...pool], selected: string[] = [];
		while (selected.length < count && available.length) {
			selected.push(available.splice(this.randomIndex(available.length, random), 1)[0]);
		}
		return selected;
	}

	private static eggMoves(species: string): string[] {
		const learned = new Set<string>();
		for (const data of Dex.mod('gen9').species.getFullLearnset(species)) {
			for (const [move, sources] of Object.entries(data.learnset)) {
				if (sources.some(source => /^9E/.test(source))) learned.add(move);
			}
		}
		return [...learned].sort();
	}

	private static levelOneMoves(species: string): string[] {
		const learned = new Set<string>();
		for (const data of Dex.mod('gen9').species.getFullLearnset(species)) {
			for (const [move, sources] of Object.entries(data.learnset)) {
				if (sources.some(source => /^9L(?:0|1)$/.test(source))) learned.add(move);
			}
		}
		return [...learned].sort();
	}

	private static itemEffects(a: RPGNurseryParent, b: RPGNurseryParent): string[] {
		const effects: string[] = [];
		if (a.item === 'destinyknot' || b.item === 'destinyknot') {
			effects.push('Destiny Knot: cinco IVs ser\\u00e3o herdados dos progenitores.');
		}
		if (a.item === 'everstone') effects.push('Everstone no Slot 1: Nature de ' + a.name + ' pode ser herdada.');
		if (b.item === 'everstone') effects.push('Everstone no Slot 2: Nature de ' + b.name + ' pode ser herdada.');
		return effects;
	}

	private static ivs(value: Partial<Record<RPGGeneticStat, number>> | undefined) {
		const result = {} as Record<RPGGeneticStat, number>;
		for (const stat of STATS) result[stat] = Math.max(0, Math.min(31, Math.floor(value?.[stat] ?? 0)));
		return result;
	}

	private static randomIndex(length: number, random: () => number): number {
		if (length <= 1) return 0;
		return Math.max(0, Math.min(length - 1, Math.floor(random() * length)));
	}
}
