import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import {
	getSpeciesExperience, RPG_STATE_VERSION, RPGBagSystem, RPGItems,
	type RPGCapturedPokemon,
} from '../../sim/rpg-showdown';
import type { RPGCharacterState } from './index';
import { RPGBoxManagement, type RPGManagedStoredPokemon } from './box-management';
import { getRPGItemIconPath } from './item-icons';

export type RPGFossilQuality = 'fragmented' | 'preserved' | 'exceptional';
export type RPGFossilMethod = 'standard' | 'advanced';

export interface RPGFossilSampleState {
	quantities: Record<RPGFossilQuality, number>;
	trackedQuantity: number;
	genome: number;
	found: number;
	donated: number;
	sold: number;
	restored: number;
}

export interface RPGFossilProjectState {
	id: string;
	itemId: string;
	species: string;
	method: RPGFossilMethod;
	startedAt: number;
	completesAt: number;
	integrity: number;
	nature?: string;
	ability?: string;
	gender?: 'M' | 'F' | 'N';
	durationMs?: number;
	remainingMs?: number;
	receivedAt?: number;
	quality?: RPGFossilQuality;
	sampleCount?: number;
	restorationChance?: number;
}

export interface RPGFossilLabState {
	version: 2;
	samples: Record<string, RPGFossilSampleState>;
	projects: RPGFossilProjectState[];
}

interface FossilDefinition {
	itemId: string;
	species?: string;
	era: string;
	habitat: string;
	diet: string;
	experimental?: boolean;
}

export const RPG_FOSSILS: readonly FossilDefinition[] = [
	{ itemId: 'armorfossil', species: 'Shieldon', era: 'Cretáceo', habitat: 'Florestas rochosas', diet: 'Herbívoro' },
	{ itemId: 'clawfossil', species: 'Anorith', era: 'Cambriano', habitat: 'Mares rasos', diet: 'Carnívoro' },
	{ itemId: 'coverfossil', species: 'Tirtouga', era: 'Cretáceo', habitat: 'Oceanos costeiros', diet: 'Onívoro' },
	{ itemId: 'domefossil', species: 'Kabuto', era: 'Paleozoico', habitat: 'Fundos marinhos', diet: 'Carnívoro' },
	{ itemId: 'helixfossil', species: 'Omanyte', era: 'Paleozoico', habitat: 'Mares antigos', diet: 'Carnívoro' },
	{ itemId: 'jawfossil', species: 'Tyrunt', era: 'Cretáceo', habitat: 'Planícies rochosas', diet: 'Carnívoro' },
	{ itemId: 'oldamber', species: 'Aerodactyl', era: 'Jurássico', habitat: 'Penhascos e céus costeiros', diet: 'Carnívoro' },
	{ itemId: 'plumefossil', species: 'Archen', era: 'Cretáceo', habitat: 'Florestas e escarpas', diet: 'Onívoro' },
	{ itemId: 'rootfossil', species: 'Lileep', era: 'Paleozoico', habitat: 'Recifes antigos', diet: 'Filtrador' },
	{ itemId: 'sailfossil', species: 'Amaura', era: 'Cretáceo', habitat: 'Tundras antigas', diet: 'Herbívoro' },
	{ itemId: 'skullfossil', species: 'Cranidos', era: 'Cretáceo', habitat: 'Florestas montanhosas', diet: 'Herbívoro' },
	{ itemId: 'fossilizedbird', era: 'Era de Galar', habitat: 'Desconhecido', diet: 'Desconhecido', experimental: true },
	{ itemId: 'fossilizeddino', era: 'Era de Galar', habitat: 'Desconhecido', diet: 'Desconhecido', experimental: true },
	{ itemId: 'fossilizeddrake', era: 'Era de Galar', habitat: 'Desconhecido', diet: 'Desconhecido', experimental: true },
	{ itemId: 'fossilizedfish', era: 'Era de Galar', habitat: 'Desconhecido', diet: 'Desconhecido', experimental: true },
] as const;

const QUALITY_LABELS: Record<RPGFossilQuality, string> = {
	fragmented: 'Fragmentado', preserved: 'Preservado', exceptional: 'Excepcional',
};
const QUALITY_GENOME: Record<RPGFossilQuality, number> = {
	fragmented: 10, preserved: 20, exceptional: 50,
};
const QUALITY_PRICE: Record<RPGFossilQuality, number> = {
	fragmented: 0.8, preserved: 1, exceptional: 1.2,
};
const FOSSIL_QUALITIES: readonly RPGFossilQuality[] = ['fragmented', 'preserved', 'exceptional'];
const PHASES = ['Análise', 'Extração genética', 'Reconstrução do DNA', 'Regeneração', 'Estabilização', 'Concluído'];

export class RPGFossilLab {
	static ensure(character: RPGCharacterState, random: () => number): RPGFossilLabState {
		const old = character.fossilLab as any;
		if (!old || old.version !== 2) {
			const lab: RPGFossilLabState = {version: 2, samples: {}, projects: old?.projects || []};
			for (const fossil of RPG_FOSSILS) {
				const quantity = this.quantity(character, fossil.itemId);
				const previous = old?.samples?.[fossil.itemId];
				const quantities = this.emptyQuantities();
				if (previous?.quality) quantities[previous.quality as RPGFossilQuality] = quantity;
				else for (let i = 0; i < quantity; i++) quantities[this.rollQuality(random)]++;
				lab.samples[fossil.itemId] = {
					quantities, trackedQuantity: quantity,
					genome: previous?.genome ?? (previous?.analyzed ? 100 : 0),
					found: Math.max(previous?.found || 0, quantity), donated: previous?.donated || 0,
					sold: previous?.sold || 0, restored: previous?.restored || 0,
				};
			}
			character.fossilLab = lab;
		}
		const lab = character.fossilLab;
		for (const fossil of RPG_FOSSILS) {
			const quantity = this.quantity(character, fossil.itemId);
			const sample = lab.samples[fossil.itemId] ||= {
				quantities: this.emptyQuantities(), trackedQuantity: 0, genome: 0,
				found: 0, donated: 0, sold: 0, restored: 0,
			};
			sample.quantities = {...this.emptyQuantities(), ...sample.quantities};
			sample.genome = Math.max(0, Math.min(100, Number(sample.genome) || 0));
			const tracked = FOSSIL_QUALITIES.reduce((sum, q) => sum + sample.quantities[q], 0);
			sample.trackedQuantity = tracked;
			if (quantity > tracked) {
				for (let i = tracked; i < quantity; i++) sample.quantities[this.rollQuality(random)]++;
				sample.found += quantity - tracked; sample.trackedQuantity = quantity;
			} else if (quantity < tracked) this.takeRandomFromSample(sample, tracked - quantity, random);
		}
		return lab;
	}
	static takeRandomQualities(character: RPGCharacterState, itemId: string, quantity: number, random: () => number) {
		const fossil = RPG_FOSSILS.find(entry => entry.itemId === toID(itemId));
		if (!fossil) return null;
		return this.takeRandomFromSample(this.ensure(character, random).samples[fossil.itemId], quantity, random);
	}
	static addKnownQualities(character: RPGCharacterState, itemId: string,
		quantities: Record<RPGFossilQuality, number>, random: () => number): void {
		const fossil = RPG_FOSSILS.find(entry => entry.itemId === toID(itemId));
		if (!fossil) return;
		const sample = this.ensure(character, random).samples[fossil.itemId];
		let added = 0;
		for (const q of FOSSIL_QUALITIES) { const n = Math.max(0, Math.floor(quantities[q] || 0)); sample.quantities[q] += n; added += n; }
		sample.trackedQuantity += added; sample.found += added;
	}
	static view(character: RPGCharacterState, now: number, random: () => number) {
		const lab = this.ensure(character, random);
		const natures = Dex.mod('gen9').natures.all().map(n => n.name).sort();
		const fossils = RPG_FOSSILS.flatMap(def => {
			const item = RPGItems.require(def.itemId);
			const sprite = Dex.items.get(item.id).spritenum;
			const sample = lab.samples[def.itemId];
			const species = def.species ? Dex.mod('gen9').species.get(def.species) : undefined;
			const known = sample.genome >= 100;
			return FOSSIL_QUALITIES.flatMap(quality => sample.quantities[quality] ? [{
				...def, id: item.id, itemId: item.id, sampleKey: item.id + ':' + quality, name: item.name,
				icon: getRPGItemIconPath(item.id), sprite: Number.isInteger(sprite) ? sprite : null,
				quantity: sample.quantities[quality], totalQuantity: sample.trackedQuantity,
				quality, qualityLabel: QUALITY_LABELS[quality], genome: sample.genome, genomeKnown: known,
				analyzed: known, displaySpecies: known && species ? species.name : '???',
				speciesId: known && species ? species.id : undefined, dnaNeeded: 10,
				contribution: QUALITY_GENOME[quality], chance: QUALITY_GENOME[quality],
				abilities: species ? [...new Set(Object.values(species.abilities).filter(Boolean))] : [],
				genders: species ? this.genders(species) : [], natures,
				sellPrice: Math.round((item.price?.sell || 0) * QUALITY_PRICE[quality]),
			}] : []);
		});
		const projects = lab.projects.filter(p => !p.receivedAt).map(project => {
			const duration = project.durationMs ?? Math.max(1, project.completesAt - project.startedAt);
			project.durationMs = duration; project.remainingMs ??= Math.max(0, project.completesAt - now);
			const progress = Math.max(0, Math.min(1, 1 - project.remainingMs / duration));
			return {...project, progress, phase: PHASES[progress >= 1 ? 5 : Math.min(4, Math.floor(progress * 5))],
				complete: progress >= 1, remainingMs: project.remainingMs};
		});
		const archive = RPG_FOSSILS.filter(f => f.species).map(def => {
			const sample = lab.samples[def.itemId], known = sample.genome >= 100;
			const species = Dex.mod('gen9').species.get(def.species!);
			const item = RPGItems.require(def.itemId), sprite = Dex.items.get(item.id).spritenum;
			return {...def, id: item.id, itemId: item.id, name: item.name, icon: getRPGItemIconPath(item.id),
				sprite: Number.isInteger(sprite) ? sprite : null, discovered: known,
				species: known ? species.name : '???', speciesId: known ? species.id : undefined,
				fossilsFound: sample.found, restorations: sample.restored, genome: sample.genome};
		});
		return {money: character.money, totalFossils: fossils.reduce((n, f) => n + f.quantity, 0),
			bagRevision: character.inventory.bag.revision, boxRevision: character.box.revision,
			fossils, projects, archive, experimentalUnlocked: false};
	}
	static analyze(character: RPGCharacterState, itemId: string, quality: RPGFossilQuality | undefined,
		random: () => number): void {
		const fossil = this.requireFossil(itemId), lab = this.ensure(character, random);
		const q = this.resolveQuality(lab.samples[fossil.itemId], quality);
		this.consume(character, fossil.itemId, q, 1, random);
		lab.samples[fossil.itemId].genome = Math.min(100, lab.samples[fossil.itemId].genome + QUALITY_GENOME[q]);
	}
	static start(character: RPGCharacterState, input: {
		itemId: string, method: RPGFossilMethod, quality?: RPGFossilQuality, sampleCount?: number,
		nature?: string, ability?: string, gender?: 'M' | 'F' | 'N',
	}, now: number, random: () => number, id: string): void {
		const fossil = this.requireFossil(input.itemId);
		if (fossil.experimental || !fossil.species) throw new Error('Este fóssil exige Pesquisa Experimental');
		const lab = this.ensure(character, random), sample = lab.samples[fossil.itemId];
		if (sample.genome < 100) throw new Error('Conclua 100% do genoma antes de iniciar a restauração');
		if (!['standard', 'advanced'].includes(input.method)) throw new Error('Método de restauração inválido');
		const quality = this.resolveQuality(sample, input.quality);
		const sampleCount = Math.max(1, Math.floor(input.sampleCount || 1));
		if (sampleCount > sample.quantities[quality]) throw new Error('Amostras insuficientes deste grau');
		const restorationChance = Math.min(100, sampleCount * QUALITY_GENOME[quality]);
		const cost = input.method === 'advanced' ? 30_000 : 12_000;
		if (character.money < cost) throw new Error('Pokécoins insuficientes');
		const species = Dex.mod('gen9').species.get(fossil.species);
		let nature: string | undefined, ability: string | undefined, gender: 'M' | 'F' | 'N' | undefined;
		if (input.method === 'advanced') {
			nature = Dex.mod('gen9').natures.get(input.nature || '').name;
			if (!nature) throw new Error('Natureza inválida');
			const abilities = [...new Set(Object.values(species.abilities).filter(Boolean))];
			ability = abilities.find(value => toID(value) === toID(input.ability || ''));
			if (!ability) throw new Error('Habilidade indisponível para esta espécie');
			gender = input.gender;
			if (!gender || !this.genders(species).includes(gender)) throw new Error('Sexo inválido para esta espécie');
		}
		this.consume(character, fossil.itemId, quality, sampleCount, random);
		character.money -= cost; sample.restored++;
		const durationMs = (input.method === 'advanced' ? 4 : 2) * 86_400_000;
		lab.projects.push({id, itemId: fossil.itemId, species: species.name, method: input.method,
			startedAt: now, completesAt: now + durationMs, durationMs, remainingMs: durationMs,
			integrity: restorationChance, quality, sampleCount, restorationChance, nature, ability, gender});
	}
	static donate(character: RPGCharacterState, itemId: string, quality: RPGFossilQuality | undefined,
		random: () => number): void {
		const fossil = this.requireFossil(itemId), lab = this.ensure(character, random);
		const q = this.resolveQuality(lab.samples[fossil.itemId], quality);
		this.consume(character, fossil.itemId, q, 1, random); lab.samples[fossil.itemId].donated++;
	}
	static sell(character: RPGCharacterState, itemId: string, quality: RPGFossilQuality | undefined,
		random: () => number): number {
		const fossil = this.requireFossil(itemId), item = RPGItems.require(fossil.itemId);
		const lab = this.ensure(character, random), q = this.resolveQuality(lab.samples[fossil.itemId], quality);
		this.consume(character, fossil.itemId, q, 1, random);
		const value = Math.round((item.price?.sell || 0) * QUALITY_PRICE[q]);
		character.money += value; lab.samples[fossil.itemId].sold++; return value;
	}
	static receive(character: RPGCharacterState, projectId: string, now: number, random: () => number): RPGCapturedPokemon {
		const lab = this.ensure(character, random), project = lab.projects.find(p => p.id === projectId);
		if (!project || project.receivedAt) throw new Error('Projeto de restauração indisponível');
		if ((project.remainingMs ?? Math.max(0, project.completesAt - now)) > 0) throw new Error('A restauração ainda não foi concluída');
		const pokemon = this.createPokemon(project, random);
		RPGBoxManagement.insert(character, {pokemonId: character.id + ':fossil:' + project.id, pokemon,
			metadata: {ot: character.characterName, training: 'none'}});
		project.receivedAt = now; return pokemon;
	}
	static advanceTime(character: RPGCharacterState, milliseconds: number, now: number, random: () => number) {
		const lab = this.ensure(character, random); let advanced = 0, completed = 0;
		for (const project of lab.projects) {
			if (project.receivedAt) continue;
			const before = project.remainingMs ?? Math.max(0, project.completesAt - now);
			if (before <= 0) continue;
			project.durationMs ??= Math.max(1, project.completesAt - project.startedAt);
			project.remainingMs = Math.max(0, before - milliseconds); advanced++;
			if (!project.remainingMs) completed++;
		}
		return {advanced, completed};
	}
	private static consume(character: RPGCharacterState, itemId: string, quality: RPGFossilQuality,
		quantity: number, random: () => number): void {
		const sample = this.ensure(character, random).samples[itemId];
		if (sample.quantities[quality] < quantity) throw new Error('Amostras insuficientes deste grau');
		character.inventory = {...character.inventory, bag: RPGBagSystem.remove(
			character.inventory.bag, itemId, quantity, character.inventory.bag.revision).bag};
		sample.quantities[quality] -= quantity; sample.trackedQuantity -= quantity;
	}
	private static takeRandomFromSample(sample: RPGFossilSampleState, quantity: number, random: () => number) {
		if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > sample.trackedQuantity) throw new Error('Quantidade de fósseis inválida');
		const removed = this.emptyQuantities();
		for (let i = 0; i < quantity; i++) {
			const total = FOSSIL_QUALITIES.reduce((sum, q) => sum + sample.quantities[q], 0);
			let roll = random() * total, selected: RPGFossilQuality = 'exceptional';
			for (const q of FOSSIL_QUALITIES) { roll -= sample.quantities[q]; if (roll < 0) { selected = q; break; } }
			sample.quantities[selected]--; removed[selected]++; sample.trackedQuantity--;
		}
		return removed;
	}
	private static rollQuality(random: () => number): RPGFossilQuality {
		const roll = random(); return roll < .6 ? 'fragmented' : roll < .95 ? 'preserved' : 'exceptional';
	}
	private static resolveQuality(sample: RPGFossilSampleState, requested?: RPGFossilQuality): RPGFossilQuality {
		if (requested && FOSSIL_QUALITIES.includes(requested) && sample.quantities[requested] > 0) return requested;
		const q = FOSSIL_QUALITIES.find(value => sample.quantities[value] > 0);
		if (!q) throw new Error('Este fóssil não está na Bag'); return q;
	}
	private static emptyQuantities(): Record<RPGFossilQuality, number> {
		return {fragmented: 0, preserved: 0, exceptional: 0};
	}
	private static createPokemon(project: RPGFossilProjectState, random: () => number): RPGCapturedPokemon {
		const dex = Dex.mod('gen9'), species = dex.species.get(project.species);
		const abilities = [...new Set(Object.values(species.abilities).filter(Boolean))];
		const genders = this.genders(species), natures = dex.natures.all(), learned = new Set<string>();
		for (const data of dex.species.getFullLearnset(species.id)) for (const [move, sources] of Object.entries(data.learnset)) {
			if (sources.some(source => /^9L(?:0|1)$/.test(source))) learned.add(move);
		}
		const moves = [...learned].slice(0, 4); if (!moves.length) moves.push('tackle');
		const values = [0, 0, 0, 0, 0, 0], available = [0, 1, 2, 3, 4, 5];
		for (let units = 0; units < 127; units++) {
			const index = Math.floor(random() * available.length); values[available[index]]++;
			if (values[available[index]] === 63) available.splice(index, 1);
		}
		const nature = project.nature || natures[Math.floor(random() * natures.length)].name;
		const ability = project.ability || abilities[Math.floor(random() * abilities.length)];
		const gender = project.gender || genders[Math.floor(random() * genders.length)];
		return {name: species.name, species: species.name, level: 1, gender, shiny: false, item: '', ability, nature,
			moves, evs: {hp: values[0] * 4, atk: values[1] * 4, def: values[2] * 4,
				spa: values[3] * 4, spd: values[4] * 4, spe: values[5] * 4},
			ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
			rpg: {version: RPG_STATE_VERSION, level: 1, friendship: 50, item: '', captureBall: 'pokeball',
				experience: getSpeciesExperience(species.id) ? 0 : undefined}};
	}
	private static genders(species: {gender?: string, genderRatio?: {M: number, F: number}}): ('M' | 'F' | 'N')[] {
		if (species.gender === 'N') return ['N']; if (species.gender === 'M') return ['M']; if (species.gender === 'F') return ['F'];
		const result: ('M' | 'F')[] = [];
		if ((species.genderRatio?.M ?? .5) > 0) result.push('M');
		if ((species.genderRatio?.F ?? .5) > 0) result.push('F');
		return result.length ? result : ['M', 'F'];
	}
	private static requireFossil(itemId: string): FossilDefinition {
		const fossil = RPG_FOSSILS.find(entry => entry.itemId === toID(itemId));
		if (!fossil) throw new Error('Fóssil desconhecido'); return fossil;
	}
	private static quantity(character: RPGCharacterState, itemId: string): number {
		return character.inventory.bag.items.find(entry => entry.itemId === itemId)?.quantity || 0;
	}
}
