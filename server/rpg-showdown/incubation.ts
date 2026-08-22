import { Dex } from '../../sim/dex';
import {
	getSpeciesExperience, RPG_STATE_VERSION, type RPGCapturedPokemon,
} from '../../sim/rpg-showdown';
import type { RPGNurseryEgg } from './nursery';

export interface RPGIncubatorState {
	id: string;
	ownerId: string;
	eggId?: string;
}

export interface RPGIncubationCapacity {
	teamPokemon: number;
	carriedEggs: number;
	bagUsedSlots: number;
	bagMaxSlots?: number;
}

export interface RPGIncubationEggView {
	eggId: string;
	status: RPGNurseryEgg['status'];
	message: string;
	progress: number;
	remainingIncubationTimeMs: number;
	incubatorId?: string;
	portableIncubator: boolean;
	portableIncubatorId?: string;
}

export interface RPGHatchResult {
	eggId: string;
	pokemon: RPGCapturedPokemon;
	revealed: {
		species: string;
		sex: string;
		nature: string;
		ability: string;
		ivs: RPGCapturedPokemon['ivs'];
		moves: string[];
		shiny: boolean;
		lineage: string;
		parentIds: [string, string];
	};
}

const HOUR = 60 * 60 * 1000;
const INCUBATION_TIME_MULTIPLIER = 3;

/** Provisional RPG balance. Every species can be overridden without changing saved Eggs. */
export const RPG_SPECIES_INCUBATION_HOURS: Readonly<Record<string, number>> = Object.freeze({
	magikarp: 8,
	caterpie: 10, weedle: 10, wurmple: 10,
	pichu: 12, cleffa: 12, igglybuff: 12,
	bulbasaur: 24, charmander: 24, squirtle: 24,
	treecko: 24, torchic: 24, mudkip: 24,
	ralts: 24, eevee: 28,
	aerodactyl: 40, larvitar: 40, beldum: 40, gible: 40,
	dratini: 48, bagon: 48, deino: 48, dreepy: 48,
});

export class RPGIncubation {
	static requiredTime(speciesName: string): number {
		const species = Dex.mod('gen9').species.get(speciesName);
		if (!species.exists) throw new Error('Esp\\u00e9cie desconhecida para incuba\\u00e7\\u00e3o');
		return (RPG_SPECIES_INCUBATION_HOURS[species.id] || 24) * HOUR * INCUBATION_TIME_MULTIPLIER;
	}

	static ensureEgg(egg: RPGNurseryEgg): RPGNurseryEgg {
		egg.requiredIncubationTimeMs ||= this.requiredTime(egg.genetics.species);
		egg.accumulatedIncubationTimeMs = Math.max(0, Math.min(
			egg.requiredIncubationTimeMs, Number(egg.accumulatedIncubationTimeMs) || 0
		));
		return egg;
	}

	static canCarry(capacity: RPGIncubationCapacity, additionalEggs = 1) {
		const teamFree = Math.max(0, 6 - capacity.teamPokemon - capacity.carriedEggs);
		const bagFree = capacity.bagMaxSlots === undefined ? Number.POSITIVE_INFINITY :
			Math.max(0, capacity.bagMaxSlots - capacity.bagUsedSlots - capacity.carriedEggs * 5);
		const teamRequired = Math.max(0, Math.floor(additionalEggs));
		const bagRequired = teamRequired * 5;
		return {
			allowed: teamFree >= teamRequired && bagFree >= bagRequired,
			teamFree, bagFree, teamRequired, bagRequired,
		};
	}

	static carry(egg: RPGNurseryEgg, capacity: RPGIncubationCapacity): RPGNurseryEgg {
		this.ensureEgg(egg);
		if (egg.status !== 'created') throw new Error('O ovo n\\u00e3o est\\u00e1 aguardando retirada');
		const check = this.canCarry(capacity, 1);
		if (!check.allowed) {
			throw new Error('A retirada exige 1 espa\\u00e7o na equipe e 5 espa\\u00e7os na Bag');
		}
		egg.status = 'carried';
		return egg;
	}

	static insertCreated(egg: RPGNurseryEgg, incubator: RPGIncubatorState, now: number): void {
		this.ensureEgg(egg);
		if (egg.ownerId !== incubator.ownerId) throw new Error('A incubadora pertence a outro treinador');
		if (egg.status !== 'created') throw new Error('Somente um ovo recém-produzido pode ser depositado diretamente');
		if (incubator.eggId) throw new Error('Esta incubadora já possui um ovo');
		incubator.eggId = egg.id;
		egg.incubatorId = incubator.id;
		egg.incubationStartedAt = now;
		egg.status = 'incubating';
	}

	static insert(egg: RPGNurseryEgg, incubator: RPGIncubatorState, now: number): void {
		this.ensureEgg(egg);
		if (egg.ownerId !== incubator.ownerId) throw new Error('A incubadora pertence a outro treinador');
		if (egg.status !== 'carried') throw new Error('Somente um ovo carregado pode entrar na incubadora');
		if (incubator.eggId) throw new Error('Esta incubadora j\\u00e1 possui um ovo');
		incubator.eggId = egg.id;
		egg.incubatorId = incubator.id;
		delete egg.portableIncubator;
		egg.incubationStartedAt = now;
		egg.status = 'incubating';
	}

	static remove(egg: RPGNurseryEgg, incubator: RPGIncubatorState): void {
		this.ensureEgg(egg);
		if (incubator.eggId !== egg.id || egg.incubatorId !== incubator.id) {
			throw new Error('Este ovo n\\u00e3o est\\u00e1 nesta incubadora');
		}
		if (egg.status === 'ready_to_hatch') throw new Error('O ovo pronto deve chocar antes de liberar a incubadora');
		if (egg.status !== 'incubating') throw new Error('O ovo n\\u00e3o est\\u00e1 incubando');
		delete incubator.eggId;
		delete egg.incubatorId;
		delete egg.incubationStartedAt;
		egg.status = 'carried';
	}

	static usePortable(egg: RPGNurseryEgg, now: number, portableIncubatorId: string): void {
		this.ensureEgg(egg);
		if (egg.status !== 'carried') throw new Error('Somente um ovo carregado pode usar a incubadora portátil');
		if (egg.incubatorId) throw new Error('O ovo já está em uma incubadora local');
		if (!portableIncubatorId) throw new Error('Incubadora Portátil inválida');
		egg.portableIncubator = true;
		egg.portableIncubatorId = portableIncubatorId;
		delete egg.portableIncubatorMission;
		egg.incubationStartedAt = now;
		egg.status = 'incubating';
	}

	static stopPortable(egg: RPGNurseryEgg): void {
		this.ensureEgg(egg);
		if (!egg.portableIncubator) throw new Error('Este ovo não está usando uma incubadora portátil');
		if (egg.status === 'ready_to_hatch') throw new Error('O ovo pronto deve chocar antes de guardar a incubadora');
		if (egg.status !== 'incubating') throw new Error('O ovo não está incubando');
		delete egg.portableIncubator;
		delete egg.portableIncubatorId;
		delete egg.portableIncubatorMission;
		delete egg.incubationStartedAt;
		egg.status = 'carried';
	}

	static advance(egg: RPGNurseryEgg, milliseconds: number): {advanced: boolean, completed: boolean} {
		this.ensureEgg(egg);
		if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Tempo de incuba\\u00e7\\u00e3o inv\\u00e1lido');
		if (egg.status !== 'incubating' || (!egg.incubatorId && !egg.portableIncubator)) {
			return {advanced: false, completed: false};
		}
		const before = egg.accumulatedIncubationTimeMs || 0;
		egg.accumulatedIncubationTimeMs = Math.min(egg.requiredIncubationTimeMs!, before + milliseconds);
		const completed = egg.accumulatedIncubationTimeMs >= egg.requiredIncubationTimeMs!;
		if (completed) {
			egg.status = 'ready_to_hatch';
			delete egg.incubationStartedAt;
		}
		return {advanced: egg.accumulatedIncubationTimeMs > before, completed};
	}

	static view(egg: RPGNurseryEgg): RPGIncubationEggView {
		this.ensureEgg(egg);
		const accumulated = egg.accumulatedIncubationTimeMs || 0;
		const required = egg.requiredIncubationTimeMs!;
		return {
			eggId: egg.id, status: egg.status,
			message: egg.status === 'ready_to_hatch' ?
				'O ovo est\\u00e1 prestes a chocar!' : 'Parece haver algo se movimentando l\\u00e1 dentro.',
			progress: Math.max(0, Math.min(100, Math.floor(accumulated / required * 100))),
			remainingIncubationTimeMs: Math.max(0, required - accumulated),
			...(egg.incubatorId ? {incubatorId: egg.incubatorId} : {}),
			portableIncubator: egg.portableIncubator === true,
			...(egg.portableIncubatorId ? {portableIncubatorId: egg.portableIncubatorId} : {}),
		};
	}

	static hatch(
		egg: RPGNurseryEgg, incubator: RPGIncubatorState | undefined, now: number
	): RPGHatchResult {
		this.ensureEgg(egg);
		if (egg.status !== 'ready_to_hatch') throw new Error('O ovo ainda não está pronto para chocar');
		if (egg.portableIncubator) {
			if (incubator) throw new Error('O ovo pronto está na incubadora portátil');
		} else if (!incubator || incubator.eggId !== egg.id || egg.incubatorId !== incubator.id) {
			throw new Error('O ovo pronto não está nesta incubadora');
		}
		const genetics = egg.genetics;
		const species = Dex.mod('gen9').species.get(genetics.species);
		const pokemon: RPGCapturedPokemon = {
			name: species.name, species: species.name, level: 1, gender: genetics.sex,
			shiny: genetics.shiny, item: '', ability: genetics.ability, nature: genetics.nature,
			moves: [...genetics.moves], ivs: {...genetics.ivs},
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
			rpg: {
				version: RPG_STATE_VERSION, level: 1, friendship: 50, item: '',
				captureBall: 'pokeball',
				experience: getSpeciesExperience(species.id) ? 0 : undefined,
			},
		};
		egg.status = 'hatched';
		egg.hatchedAt = now;
		if (incubator) delete incubator.eggId;
		delete egg.incubatorId;
		delete egg.portableIncubator;
		delete egg.portableIncubatorId;
		delete egg.portableIncubatorMission;
		return {
			eggId: egg.id, pokemon,
			revealed: {
				species: genetics.species, sex: genetics.sex, nature: genetics.nature,
				ability: genetics.ability, ivs: {...genetics.ivs}, moves: [...genetics.moves],
				shiny: genetics.shiny, lineage: genetics.lineage, parentIds: [...genetics.parentIds],
			},
		};
	}

}
