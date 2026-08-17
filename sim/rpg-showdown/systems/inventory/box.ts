import type { RPGCaptureResult, RPGCapturedPokemon } from "../../state";

export const RPG_BOX_VERSION = 3;
export const RPG_BOX_SLOTS = 12;
export const RPG_PARTY_SLOTS = 6;

export type RPGBoxTierId = 'small' | 'initial' | 'standard' | 'expanded' | 'national';

export interface RPGBoxTierDefinition {
	id: RPGBoxTierId;
	boxes: number;
	slotsPerBox: number;
	totalBoxSlots: number;
	/** Preço acumulado para desbloquear este nível a partir da Box inicial. */
	unlockPrice: number;
}

export const RPG_BOX_TIERS: Readonly<Record<RPGBoxTierId, RPGBoxTierDefinition>> = {
	small: { id: 'small', boxes: 1, slotsPerBox: RPG_BOX_SLOTS, totalBoxSlots: 12, unlockPrice: 0 },
	initial: { id: 'initial', boxes: 2, slotsPerBox: 18, totalBoxSlots: 36, unlockPrice: 20000 },
	standard: { id: 'standard', boxes: 4, slotsPerBox: 18, totalBoxSlots: 72, unlockPrice: 60000 },
	expanded: { id: 'expanded', boxes: 4, slotsPerBox: 42, totalBoxSlots: 168, unlockPrice: 150000 },
	national: { id: 'national', boxes: 8, slotsPerBox: 42, totalBoxSlots: 336, unlockPrice: 300000 },
};

export interface RPGStoredPokemon {
	pokemonId: string;
	pokemon: RPGCapturedPokemon;
}

export interface RPGPokemonBox {
	index: number;
	name: string;
	slots: (RPGStoredPokemon | null)[];
}

export type RPGBoxLocation =
	{ destination: 'party', position: number } |
	{ destination: 'box', boxIndex: number, slot: number };

export interface RPGBoxPlacement {
	placementId: string;
	pokemonId: string;
	location: RPGBoxLocation;
	revision: number;
}

export interface RPGBoxState {
	version: number;
	ownerId: string;
	revision: number;
	tier: RPGBoxTierId;
	party: RPGStoredPokemon[];
	boxes: RPGPokemonBox[];
	placements: RPGBoxPlacement[];
}

export interface RPGBoxCapacity {
	partyUsed: number;
	partyCapacity: number;
	boxes: number;
	slotsPerBox: number;
	boxUsed: number;
	boxCapacity: number;
	totalUsed: number;
	totalCapacity: number;
	full: boolean;
}

export interface RPGBoxPlacementRequest {
	placementId: string;
	pokemonId: string;
}

export type RPGBoxPlacementFailureReason = 'not-captured' | 'storage-full';

export interface RPGBoxPlacementResult {
	success: boolean;
	reason?: RPGBoxPlacementFailureReason;
	replayed: boolean;
	storage: RPGBoxState;
	placement?: RPGBoxPlacement;
	pokemon?: RPGCapturedPokemon;
}

export interface RPGBoxCreateOptions {
	tier?: RPGBoxTierId;
	revision?: number;
	party?: readonly RPGStoredPokemon[];
	boxes?: readonly RPGPokemonBox[];
	placements?: readonly RPGBoxPlacement[];
}

export class RPGBoxSystem {
	static create(ownerId: string, options: RPGBoxCreateOptions = {}): RPGBoxState {
		if (typeof ownerId !== 'string' || !ownerId.trim()) throw new Error('RPG Box requires ownerId');
		const tier = options.tier ?? 'standard';
		const definition = this.requireTier(tier);
		const revision = options.revision ?? 0;
		if (!Number.isSafeInteger(revision) || revision < 0) {
			throw new Error('RPG Box revision must be a non-negative integer');
		}
		const storage: RPGBoxState = {
			version: RPG_BOX_VERSION,
			ownerId: ownerId.trim(),
			revision,
			tier,
			party: (options.party || []).map(entry => structuredClone(entry)),
			boxes: options.boxes ? options.boxes.map(box => structuredClone(box)) :
			Array.from({ length: definition.boxes }, (_, index) => ({
				index,
				name: `Box ${index + 1}`,
				slots: Array<RPGStoredPokemon | null>(definition.slotsPerBox).fill(null),
			})),
			placements: (options.placements || []).map(placement => structuredClone(placement)),
		};
		this.validate(storage);
		return storage;
	}

	static migrate(value: unknown): RPGBoxState {
		if (!value || typeof value !== 'object') throw new Error('RPG Box must be an object');
		const input = value as Partial<RPGBoxState>;
		const sourceVersion = input.version ?? 1;
		if (![1, 2, RPG_BOX_VERSION].includes(sourceVersion)) {
			throw new Error('Unsupported RPG Box version: ' + String(input.version));
		}
		if (!Array.isArray(input.party) || !Array.isArray(input.boxes)) {
			throw new Error('RPG Box requires party and boxes arrays');
		}
		const tier = input.tier ?? 'standard';
		const definition = this.requireTier(tier);
		const layoutMatches = input.boxes.length === definition.boxes &&
			input.boxes.every(box => Array.isArray(box.slots) && box.slots.length === definition.slotsPerBox);
		if (sourceVersion === RPG_BOX_VERSION && !layoutMatches) {
			throw new Error(`Every RPG Box in tier ${tier} must have exactly ${definition.slotsPerBox} slots`);
		}
		let boxes: RPGPokemonBox[];
		if (layoutMatches) {
			boxes = input.boxes.map(box => structuredClone(box));
		} else {
			const entries = input.boxes.flatMap(box => Array.isArray(box.slots) ?
				box.slots.filter((entry): entry is RPGStoredPokemon => entry !== null) : []);
			if (entries.length > definition.totalBoxSlots) {
				throw new Error('RPG Box migration cannot fit every stored Pokemon');
			}
			boxes = Array.from({ length: definition.boxes }, (_, index) => ({
				index,
				name: input.boxes?.[index]?.name?.trim() || `Box ${index + 1}`,
				slots: Array<RPGStoredPokemon | null>(definition.slotsPerBox).fill(null),
			}));
			entries.forEach((entry, index) => {
				const boxIndex = Math.floor(index / definition.slotsPerBox);
				const slot = index % definition.slotsPerBox;
				boxes[boxIndex].slots[slot] = structuredClone(entry);
			});
		}
		const locations = new Map<string, RPGBoxLocation>();
		input.party.forEach((entry, position) => locations.set(entry.pokemonId, {
			destination: 'party', position,
		}));
		for (const box of boxes) box.slots.forEach((entry, slot) => {
			if (entry) locations.set(entry.pokemonId, { destination: 'box', boxIndex: box.index, slot });
		});
		const migrated = sourceVersion !== RPG_BOX_VERSION || !layoutMatches;
		return this.create(input.ownerId || '', {
			tier,
			revision: (input.revision ?? 0) + (migrated ? 1 : 0),
			party: input.party,
			boxes,
			placements: (input.placements || []).map(placement => ({
				...structuredClone(placement),
				location: structuredClone(locations.get(placement.pokemonId) || placement.location),
			})),
		});
	}

	static getTier(tier: RPGBoxTierId): RPGBoxTierDefinition {
		return structuredClone(this.requireTier(tier));
	}

	static getCapacity(storage: RPGBoxState): RPGBoxCapacity {
		this.validate(storage);
		const boxUsed = storage.boxes.reduce(
			(total, box) => total + box.slots.filter(slot => slot !== null).length,
			0
		);
		const definition = this.requireTier(storage.tier);
		const boxCapacity = definition.totalBoxSlots;
		const partyUsed = storage.party.length;
		return {
			partyUsed,
			partyCapacity: RPG_PARTY_SLOTS,
			boxes: storage.boxes.length,
			slotsPerBox: definition.slotsPerBox,
			boxUsed,
			boxCapacity,
			totalUsed: partyUsed + boxUsed,
			totalCapacity: RPG_PARTY_SLOTS + boxCapacity,
			full: partyUsed >= RPG_PARTY_SLOTS && boxUsed >= boxCapacity,
		};
	}

	static hasSpace(storage: RPGBoxState): boolean {
		return !this.getCapacity(storage).full;
	}

	static placeCapture(
		storage: RPGBoxState,
		capture: RPGCaptureResult,
		request: RPGBoxPlacementRequest,
		expectedRevision = storage.revision
	): RPGBoxPlacementResult {
		this.validate(storage);
		const normalized = this.normalizeRequest(request);
		const previous = storage.placements.find(placement => placement.placementId === normalized.placementId);
		if (previous) {
			if (previous.pokemonId !== normalized.pokemonId) {
				throw new Error('RPG Box placementId conflict: ' + normalized.placementId);
			}
			const stored = this.findStored(storage, previous.pokemonId);
			if (!stored) throw new Error('RPG Box replay references a missing Pokemon: ' + previous.pokemonId);
			return {
				success: true,
				replayed: true,
				storage: structuredClone(storage),
				placement: structuredClone(previous),
				pokemon: structuredClone(stored.pokemon),
			};
		}
		if (expectedRevision !== storage.revision) throw new Error('RPG Box revision conflict');
		if (!capture.success || !capture.pokemon) {
			return {
				success: false,
				reason: 'not-captured',
				replayed: false,
				storage: structuredClone(storage),
			};
		}
		if (this.findStored(storage, normalized.pokemonId)) {
			throw new Error('RPG Box Pokemon is already stored: ' + normalized.pokemonId);
		}

		const next = structuredClone(storage);
		const entry: RPGStoredPokemon = {
			pokemonId: normalized.pokemonId,
			pokemon: structuredClone(capture.pokemon),
		};
		let location: RPGBoxLocation | undefined;
		if (next.party.length < RPG_PARTY_SLOTS) {
			location = { destination: 'party', position: next.party.length };
			next.party.push(entry);
		} else {
			for (const box of next.boxes) {
				const slot = box.slots.findIndex(value => value === null);
				if (slot < 0) continue;
				location = { destination: 'box', boxIndex: box.index, slot };
				box.slots[slot] = entry;
				break;
			}
		}
		if (!location) {
			return {
				success: false,
				reason: 'storage-full',
				replayed: false,
				storage: structuredClone(storage),
				pokemon: structuredClone(capture.pokemon),
			};
		}

		next.revision++;
		const placement: RPGBoxPlacement = {
			placementId: normalized.placementId,
			pokemonId: normalized.pokemonId,
			location,
			revision: next.revision,
		};
		next.placements.push(placement);
		this.validate(next);
		return {
			success: true,
			replayed: false,
			storage: next,
			placement: structuredClone(placement),
			pokemon: structuredClone(entry.pokemon),
		};
	}

	static findPokemon(storage: RPGBoxState, pokemonId: string): RPGStoredPokemon | undefined {
		this.validate(storage);
		const entry = this.findStored(storage, this.normalizeRequiredId(pokemonId, 'pokemonId'));
		return entry && structuredClone(entry);
	}

	private static normalizeRequest(request: RPGBoxPlacementRequest): RPGBoxPlacementRequest {
		if (!request || typeof request !== 'object') throw new Error('RPG Box placement requires a request');
		return {
			placementId: this.normalizeRequiredId(request.placementId, 'placementId'),
			pokemonId: this.normalizeRequiredId(request.pokemonId, 'pokemonId'),
		};
	}

	private static normalizeRequiredId(value: string, field: string): string {
		if (typeof value !== 'string' || !value.trim()) throw new Error('RPG Box requires ' + field);
		return value.trim();
	}

	private static requireTier(tier: RPGBoxTierId): RPGBoxTierDefinition {
		const definition = RPG_BOX_TIERS[tier];
		if (!definition) throw new Error('Unknown RPG Box tier: ' + String(tier));
		return definition;
	}

	private static findStored(storage: RPGBoxState, pokemonId: string): RPGStoredPokemon | undefined {
		const party = storage.party.find(entry => entry.pokemonId === pokemonId);
		if (party) return party;
		for (const box of storage.boxes) {
			const entry = box.slots.find(slot => slot?.pokemonId === pokemonId);
			if (entry) return entry;
		}
		return undefined;
	}

	private static validate(storage: RPGBoxState): void {
		if (storage.version !== RPG_BOX_VERSION) {
			throw new Error('Unsupported RPG Box version: ' + String(storage.version));
		}
		if (typeof storage.ownerId !== 'string' || !storage.ownerId.trim()) throw new Error('RPG Box requires ownerId');
		if (!Number.isSafeInteger(storage.revision) || storage.revision < 0) {
			throw new Error('Invalid RPG Box revision');
		}
		const tier = this.requireTier(storage.tier);
		if (!Array.isArray(storage.party) || storage.party.length > RPG_PARTY_SLOTS) {
			throw new Error(`RPG Box party cannot exceed ${RPG_PARTY_SLOTS} Pokemon`);
		}
		if (!Array.isArray(storage.boxes) || storage.boxes.length !== tier.boxes) {
			throw new Error(`RPG Box tier requires exactly ${tier.boxes} boxes`);
		}
		const pokemonIds = new Set<string>();
		for (const entry of storage.party) this.validateEntry(entry, pokemonIds);
		for (let index = 0; index < storage.boxes.length; index++) {
			const box = storage.boxes[index];
			if (box.index !== index || typeof box.name !== 'string' || !box.name.trim()) {
				throw new Error(`Invalid RPG Box at index ${index}`);
			}
			if (!Array.isArray(box.slots) || box.slots.length !== tier.slotsPerBox) {
				throw new Error(`Every RPG Box in tier ${tier.id} must have exactly ${tier.slotsPerBox} slots`);
			}
			for (const entry of box.slots) {
				if (entry !== null) this.validateEntry(entry, pokemonIds);
			}
		}
		if (!Array.isArray(storage.placements)) throw new Error('RPG Box requires placements');
		const placementIds = new Set<string>();
		const placedPokemon = new Set<string>();
		for (const placement of storage.placements) {
			if (typeof placement.placementId !== 'string' || !placement.placementId.trim() ||
				placementIds.has(placement.placementId)) {
				throw new Error('Invalid or duplicated RPG Box placementId');
			}
			if (typeof placement.pokemonId !== 'string' || !placement.pokemonId.trim() ||
				placedPokemon.has(placement.pokemonId)) {
				throw new Error('Invalid or duplicated RPG Box placement Pokemon');
			}
			if (!pokemonIds.has(placement.pokemonId)) {
				throw new Error('RPG Box placement references a missing Pokemon: ' + placement.pokemonId);
			}
			if (!Number.isSafeInteger(placement.revision) || placement.revision < 1 ||
				placement.revision > storage.revision) {
				throw new Error('Invalid RPG Box placement revision');
			}
			this.validateLocation(placement.location, tier.boxes, tier.slotsPerBox);
			placementIds.add(placement.placementId);
			placedPokemon.add(placement.pokemonId);
		}
	}

	private static validateEntry(entry: RPGStoredPokemon, ids: Set<string>): void {
		if (!entry || typeof entry !== 'object' || typeof entry.pokemonId !== 'string' ||
			!entry.pokemonId.trim() || ids.has(entry.pokemonId)) {
			throw new Error('Invalid or duplicated RPG Box Pokemon id');
		}
		const pokemon = entry.pokemon;
		if (!pokemon || typeof pokemon !== 'object' || typeof pokemon.species !== 'string' ||
			!pokemon.species.trim()) {
			throw new Error('Invalid RPG Box Pokemon: ' + entry.pokemonId);
		}
		if (!Number.isSafeInteger(pokemon.level) || pokemon.level < 1 || pokemon.level > 999) {
			throw new Error('RPG Box Pokemon level must be between 1 and 999');
		}
		if (!Array.isArray(pokemon.moves) || !pokemon.moves.length) {
			throw new Error('RPG Box Pokemon requires moves: ' + entry.pokemonId);
		}
		ids.add(entry.pokemonId);
	}

	private static validateLocation(location: RPGBoxLocation, boxCount: number, slotsPerBox: number): void {
		if (!location || typeof location !== 'object') throw new Error('Invalid RPG Box placement location');
		if (location.destination === 'party') {
			if (!Number.isSafeInteger(location.position) || location.position < 0 ||
				location.position >= RPG_PARTY_SLOTS) {
				throw new Error('Invalid RPG Box party position');
			}
			return;
		}
		if (location.destination !== 'box' || !Number.isSafeInteger(location.boxIndex) ||
			location.boxIndex < 0 || location.boxIndex >= boxCount ||
			!Number.isSafeInteger(location.slot) || location.slot < 0 || location.slot >= slotsPerBox) {
			throw new Error('Invalid RPG Box slot location');
		}
	}
}
