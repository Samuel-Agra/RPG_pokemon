/** Valida sessões versionadas do Team Builder, campos editáveis, limites e conflitos sem depender de HTTP ou persistência. */
import type { PokemonSet } from "../../teams";

import { getExperienceForLevel, getSpeciesExperience } from "../data/experience";

export const RPG_TEAM_BUILDER_VERSION = 2;
export type RPGEditableTeamField = 'moves' | 'evs' | 'ivs' | 'item' | 'ability' | 'level';

export interface RPGTeamBuilderRules {
	editable?: Partial<Record<RPGEditableTeamField, boolean>>;
	minLevel?: number;
	maxLevel?: number;
	maxMoves?: number;
	maxEVPerStat?: number;
	maxTotalEVs?: number;
	maxIVPerStat?: number;
	allowedMoves?: string[];
	allowedItems?: string[];
	allowedAbilities?: string[];
	perPokemon?: Partial<Record<number, Omit<RPGTeamBuilderRules, 'perPokemon'>>>;
}

export interface RPGTeamBuilderSession {
	version: number;
	teamId: string;
	revision: number;
	team: PokemonSet[];
	rules: RPGTeamBuilderRules;
}

export interface RPGTeamBuilderChange {
	position: number;
	field: RPGEditableTeamField;
	previous: unknown;
	current: unknown;
}

export interface RPGTeamBuilderApplyResult {
	session: RPGTeamBuilderSession;
	changes: RPGTeamBuilderChange[];
}

export class RPGTeamBuilderSystem {
	private static readonly fields: RPGEditableTeamField[] = [
		'moves', 'evs', 'ivs', 'item', 'ability', 'level',
	];

	static open(team: readonly PokemonSet[]): PokemonSet[] {
		return [...structuredClone(team)];
	}

	static openSession(
		teamId: string,
		team: readonly PokemonSet[],
		rules: RPGTeamBuilderRules,
		revision = 0
	): RPGTeamBuilderSession {
		if (!teamId.trim()) throw new Error('RPG Team Builder session requires teamId');
		return {
			version: RPG_TEAM_BUILDER_VERSION,
			teamId,
			revision: Math.max(0, Math.trunc(revision)),
			team: [...structuredClone(team)],
			rules: structuredClone(rules),
		};
	}

	static apply(original: readonly PokemonSet[], edited: readonly PokemonSet[], rules: RPGTeamBuilderRules): PokemonSet[] {
		if (original.length !== edited.length) throw new Error('RPG team size cannot be changed in the Team Builder');
		return original.map((set, index) => this.applySet(set, edited[index], this.getRules(rules, index)));
	}

	static applySession(
		session: RPGTeamBuilderSession,
		edited: readonly PokemonSet[],
		expectedRevision: number
	): RPGTeamBuilderApplyResult {
		if (session.version !== RPG_TEAM_BUILDER_VERSION) throw new Error('Unsupported RPG Team Builder session version');
		if (expectedRevision !== session.revision) throw new Error('RPG Team Builder revision conflict');
		const team = this.apply(session.team, edited, session.rules);
		const changes = this.getChanges(session.team, team);
		return {
			session: {
				...structuredClone(session),
				revision: session.revision + 1,
				team,
			},
			changes,
		};
	}

	private static applySet(set: PokemonSet, candidate: PokemonSet, rules: RPGTeamBuilderRules): PokemonSet {
		if (candidate.species !== set.species) throw new Error('RPG Pokemon species cannot be changed in the Team Builder');
		if (candidate.gender !== set.gender) throw new Error('RPG Pokemon gender cannot be changed in the Team Builder');
		if (!!candidate.shiny !== !!set.shiny) throw new Error('RPG Pokemon shiny cannot be changed in the Team Builder');
		if (candidate.nature !== set.nature) throw new Error('RPG Pokemon nature cannot be changed in the Team Builder');
		for (const field of this.fields) {
			if (!rules.editable?.[field] && !this.equal(set[field], candidate[field])) {
				throw new Error(`RPG Team Builder field is locked: ${field}`);
			}
		}
		this.validate(candidate, rules);
		const result = structuredClone(set);
		for (const field of this.fields) {
			if (rules.editable?.[field]) (result as any)[field] = structuredClone(candidate[field]);
		}
		result.rpg = structuredClone(set.rpg);
		this.synchronizePersistentState(set, result);
		return result;
	}

	private static synchronizePersistentState(previous: PokemonSet, current: PokemonSet): void {
		if (!current.rpg) return;
		if (!this.equal(previous.evs, current.evs)) current.rpg.evs = { ...current.evs };
		if (previous.item !== current.item) current.rpg.item = current.item;
		if (!this.equal(previous.moves, current.moves)) current.rpg.pp = undefined;
		if (previous.level !== current.level) {
			current.rpg.level = current.level;
			const data = getSpeciesExperience(this.normalize(current.species));
			if (data) {
				current.rpg.experience = getExperienceForLevel(data.growthRate, Math.min(current.level, 100));
			}
		}
	}

	private static validate(set: PokemonSet, rules: RPGTeamBuilderRules): void {
		const minLevel = Math.max(1, Math.trunc(rules.minLevel ?? 1));
		const maxLevel = Math.max(minLevel, Math.trunc(rules.maxLevel ?? 999));
		if (!Number.isInteger(set.level) || set.level < minLevel || set.level > maxLevel) {
			throw new Error(`RPG Team Builder level must be between ${minLevel} and ${maxLevel}`);
		}
		const maxMoves = Math.max(1, Math.trunc(rules.maxMoves ?? 4));
		if (!Array.isArray(set.moves) || !set.moves.length || set.moves.length > maxMoves) {
			throw new Error(`RPG Pokemon must have between one and ${maxMoves} moves`);
		}
		const moveIds = set.moves.map(move => this.normalize(move));
		if (new Set(moveIds).size !== moveIds.length) throw new Error('RPG Pokemon cannot have duplicate moves');
		this.validateAllowed('move', set.moves, rules.allowedMoves);
		this.validateAllowed('item', [set.item], rules.allowedItems);
		this.validateAllowed('ability', [set.ability], rules.allowedAbilities);

		const maxEV = Math.max(0, Math.trunc(rules.maxEVPerStat ?? 252));
		const maxTotalEVs = Math.max(0, Math.trunc(rules.maxTotalEVs ?? 510));
		let totalEVs = 0;
		for (const value of Object.values(set.evs || {})) {
			if (!Number.isInteger(value) || value < 0 || value > maxEV) {
				throw new Error(`RPG EVs must be between 0 and ${maxEV}`);
			}
			totalEVs += value;
		}
		if (totalEVs > maxTotalEVs) throw new Error(`RPG total EVs cannot exceed ${maxTotalEVs}`);

		const maxIV = Math.max(0, Math.trunc(rules.maxIVPerStat ?? 31));
		for (const value of Object.values(set.ivs || {})) {
			if (!Number.isInteger(value) || value < 0 || value > maxIV) {
				throw new Error(`RPG IVs must be between 0 and ${maxIV}`);
			}
		}
	}

	private static validateAllowed(label: string, values: string[], allowed: string[] | undefined): void {
		if (!allowed) return;
		const ids = new Set(allowed.map(value => this.normalize(value)));
		for (const value of values) {
			if (!ids.has(this.normalize(value))) throw new Error(`RPG Team Builder ${label} is not allowed: ${value}`);
		}
	}

	private static getRules(rules: RPGTeamBuilderRules, position: number): RPGTeamBuilderRules {
		const specific = rules.perPokemon?.[position];
		if (!specific) return rules;
		return {
			...rules,
			...specific,
			editable: { ...rules.editable, ...specific.editable },
			perPokemon: undefined,
		};
	}

	private static getChanges(original: readonly PokemonSet[], current: readonly PokemonSet[]): RPGTeamBuilderChange[] {
		const changes: RPGTeamBuilderChange[] = [];
		for (let position = 0; position < original.length; position++) {
			for (const field of this.fields) {
				if (this.equal(original[position][field], current[position][field])) continue;
				changes.push({
					position,
					field,
					previous: structuredClone(original[position][field]),
					current: structuredClone(current[position][field]),
				});
			}
		}
		return changes;
	}

	private static normalize(value: string): string {
		return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	}

	private static equal(left: unknown, right: unknown): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}
}
