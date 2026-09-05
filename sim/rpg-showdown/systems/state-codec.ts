import type { RPGBattleState, RPGPokemonState } from "../state";

export const RPG_STATE_VERSION = 2;
export const RPG_MIN_READABLE_STATE_VERSION = 1;
export const RPG_UNVERSIONED_STATE_VERSION = 1;

export const RPG_STATE_COMPATIBILITY = Object.freeze({
	current: RPG_STATE_VERSION,
	minimumReadable: RPG_MIN_READABLE_STATE_VERSION,
	unversionedAs: RPG_UNVERSIONED_STATE_VERSION,
});

type RPGSerializableState = RPGPokemonState | RPGBattleState;

export class RPGStateCodec {
	static migratePokemon(input: RPGPokemonState | undefined): RPGPokemonState {
		return this.migrate(input, 'Pokemon');
	}

	static migrateBattle(input: RPGBattleState | undefined): RPGBattleState {
		return this.migrate(input, 'battle');
	}

	/** Mantido para consumidores antigos; estados Pokemon e batalha compartilham o mesmo envelope de versao. */
	static serialize<T extends RPGSerializableState>(state: T): string {
		return JSON.stringify(this.migrate(state, 'state'));
	}

	static serializePokemon(state: RPGPokemonState): string {
		return JSON.stringify(this.migratePokemon(state));
	}

	static serializeBattle(state: RPGBattleState): string {
		return JSON.stringify(this.migrateBattle(state));
	}

	static deserializePokemon(serialized: string): RPGPokemonState {
		return this.migratePokemon(this.parse(serialized, 'Pokemon'));
	}

	static deserializeBattle(serialized: string): RPGBattleState {
		return this.migrateBattle(this.parse(serialized, 'battle'));
	}

	static canReadVersion(version: number | undefined): boolean {
		const normalized = version === undefined ? RPG_UNVERSIONED_STATE_VERSION : version;
		return Number.isInteger(normalized) &&
			normalized >= RPG_MIN_READABLE_STATE_VERSION && normalized <= RPG_STATE_VERSION;
	}

	private static migrate<T extends RPGSerializableState>(input: T | undefined, label: string): T {
		const state = structuredClone(input || {}) as T;
		let version = this.readVersion(state.version, label);
		let migrated = { ...state, version } as T;

		while (version < RPG_STATE_VERSION) {
			switch (version) {
				case 1:
					migrated = this.migrateVersion1To2(migrated);
					version = 2;
					break;
				default:
					throw new Error(`No RPG ${label} state migration from version ${version}`);
			}
		}
		return structuredClone(migrated);
	}

	private static migrateVersion1To2<T extends RPGSerializableState>(state: T): T {
		// Version 2 added optional result/integration fields; the persisted values remain valid.
		return { ...structuredClone(state), version: 2 } as T;
	}

	private static readVersion(version: number | undefined, label: string): number {
		const normalized = version === undefined ? RPG_UNVERSIONED_STATE_VERSION : version;
		if (!this.canReadVersion(normalized)) {
			throw new Error(`Unsupported RPG ${label} state version: ${version}`);
		}
		return normalized;
	}

	private static parse(serialized: string, label: string): Record<string, unknown> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(serialized);
		} catch {
			throw new Error(`Invalid serialized RPG ${label} state`);
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`Serialized RPG ${label} state must be an object`);
		}
		return parsed as Record<string, unknown>;
	}
}
