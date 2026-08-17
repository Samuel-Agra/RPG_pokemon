import type { Battle } from "../../battle";
import { toID } from "../../dex-data";
import type { PokemonSet } from "../../teams";
import type {
	RPGBattleResult,
	RPGBattleState,
	RPGPokemonResult,
	RPGPokemonState,
} from "../state";

import { RPGStateCodec, RPG_STATE_VERSION } from "../systems/state-codec";
import { RPG_BATTLE_FORMAT_ID } from "../systems/battle/rules";

export interface RPGExternalSideInput {
	side: SideID;
	name: string;
	team: PokemonSet[];
}

export interface RPGExternalBattleInput {
	version: number;
	battleId: string;
	requestId?: string;
	formatId: string;
	seed?: readonly number[];
	rpg: RPGBattleState;
	sides: RPGExternalSideInput[];
	metadata?: Record<string, unknown>;
}

export interface RPGPreparedPlayer {
	name: string;
	team: PokemonSet[];
}

export interface RPGPreparedBattleInput {
	version: number;
	battleId: string;
	requestId?: string;
	formatId: string;
	seed?: readonly number[];
	rpg: RPGBattleState;
	players: Partial<Record<SideID, RPGPreparedPlayer>>;
	metadata?: Record<string, unknown>;
}

export interface RPGExternalPokemonState {
	side: SideID;
	position: number;
	species: string;
	rpgEnabled: boolean;
	state: RPGPokemonState;
}

export interface RPGExternalBattleResponse {
	version: number;
	battleId: string;
	requestId?: string;
	result: RPGBattleResult;
	pokemonStates: RPGExternalPokemonState[];
	metadata?: Record<string, unknown>;
}

/** Implementado pelo servidor RPG: HTTP, WebSocket, fila etc. */
export interface RPGExternalTransport {
	publishBattleResult(response: RPGExternalBattleResponse): Promise<void>;
}

/** Implementado pelo servidor RPG como uma gravação atômica/idempotente por battleId. */
export interface RPGExternalRepository {
	persistBattleResult(response: RPGExternalBattleResponse): Promise<void>;
}

export interface RPGExternalAdapters {
	repository: RPGExternalRepository;
	transport: RPGExternalTransport;
}

export class RPGExternalIntegration {
	static parseInput(value: unknown): RPGExternalBattleInput {
		if (!value || typeof value !== 'object') throw new Error('RPG battle input must be an object');
		const input = value as Partial<RPGExternalBattleInput>;
		if (!Number.isInteger(input.version) || input.version! < 1 || input.version! > RPG_STATE_VERSION) {
			throw new Error(`Unsupported RPG battle input version: ${input.version}`);
		}
		if (typeof input.battleId !== 'string' || !input.battleId.trim()) {
			throw new Error('RPG battle input requires battleId');
		}
		if (typeof input.formatId !== 'string' || !input.formatId.trim()) {
			throw new Error('RPG battle input requires formatId');
		}
		if (toID(input.formatId) !== RPG_BATTLE_FORMAT_ID) throw new Error(`RPG battles require ${RPG_BATTLE_FORMAT_ID}`);
		if (!Array.isArray(input.sides) || input.sides.length < 2 || input.sides.length > 4) {
			throw new Error('RPG battle input requires between two and four sides');
		}
		const sides = new Set<SideID>();
		for (const side of input.sides) {
			if (!/^p[1-4]$/.test(side.side) || sides.has(side.side)) {
				throw new Error(`Invalid or duplicated RPG side: ${side.side}`);
			}
			sides.add(side.side);
			if (typeof side.name !== 'string' || !side.name.trim()) throw new Error('Every RPG side requires a name');
			if (!Array.isArray(side.team) || !side.team.length) throw new Error(`RPG side ${side.side} requires a team`);
			for (const set of side.team) {
				if (!(set.species || set.name) || !Array.isArray(set.moves) || !set.moves.length) {
					throw new Error(`Invalid Pokemon set on RPG side ${side.side}`);
				}
			}
		}
		const battleTypes = new Set(['wild', 'trainer', 'npc', 'boss', 'gym', 'no-exp']);
		if (input.rpg?.battleType !== undefined && !battleTypes.has(input.rpg.battleType)) {
			throw new Error(`Invalid RPG battle type: ${input.rpg.battleType}`);
		}
		const sideRoles = new Set(['player', 'trainer', 'npc', 'wild', 'boss', 'gym']);
		for (const [side, role] of Object.entries(input.rpg?.sideRoles || {})) {
			if (!sides.has(side as SideID)) {
				throw new Error(`RPG role references a missing side: ${side}`);
			}
			if (!sideRoles.has(role as string)) {
				throw new Error(`Invalid RPG side role: ${role}`);
			}
		}
		const migrated = structuredClone(input as RPGExternalBattleInput);
		migrated.version = RPG_STATE_VERSION;
		migrated.rpg = RPGStateCodec.migrateBattle(migrated.rpg);
		for (const side of migrated.sides) {
			for (const set of side.team) {
				if (set.rpg !== undefined) set.rpg = RPGStateCodec.migratePokemon(set.rpg);
			}
		}
		return migrated;
	}

	static prepare(value: unknown): RPGPreparedBattleInput {
		const input = this.parseInput(value);
		const players: Partial<Record<SideID, RPGPreparedPlayer>> = {};
		for (const side of input.sides) {
			players[side.side] = { name: side.name, team: structuredClone(side.team) };
		}
		return {
			version: input.version,
			battleId: input.battleId,
			requestId: input.requestId,
			formatId: input.formatId,
			seed: input.seed && [...input.seed],
			rpg: structuredClone(input.rpg),
			players,
			metadata: structuredClone(input.metadata),
		};
	}

	static createResponse(
		battleId: string,
		result: RPGBattleResult,
		options: { requestId?: string, metadata?: Record<string, unknown> } = {}
	): RPGExternalBattleResponse {
		if (!battleId.trim()) throw new Error('RPG battle response requires battleId');
		const finalResult = structuredClone(result);
		return {
			version: RPG_STATE_VERSION,
			battleId,
			requestId: options.requestId,
			result: finalResult,
			pokemonStates: finalResult.pokemon.map((pokemon: RPGPokemonResult) => ({
				side: pokemon.side,
				position: pokemon.position,
				species: pokemon.species,
				rpgEnabled: pokemon.rpgEnabled,
				state: structuredClone(pokemon.state),
			})),
			metadata: structuredClone(options.metadata),
		};
	}

	static async complete(
		battleId: string,
		battle: Battle,
		adapters: RPGExternalAdapters,
		options: { requestId?: string, metadata?: Record<string, unknown> } = {}
	): Promise<RPGExternalBattleResponse> {
		if (!battle.ended || !battle.rpg?.result) throw new Error('RPG battle must be ended before completion');
		const response = this.createResponse(battleId, battle.rpg.result, options);
		await adapters.repository.persistBattleResult(structuredClone(response));
		await adapters.transport.publishBattleResult(structuredClone(response));
		return structuredClone(response);
	}
}
