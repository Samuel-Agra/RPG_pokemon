import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";
import type {
	RPGFriendshipChangeResult,
	RPGFriendshipRules,
} from "../../state";

import { ExperienceDistributionSystem } from "./experience-distribution";
import { ParticipationSystem } from "./participation";

export type StandardFriendshipEvent = 'level-up' | 'walking' | 'berry' | 'vitamin' | 'battle-item';

export class FriendshipSystem {
	static readonly EVOLUTION_THRESHOLD = 160;
	private static readonly results = new WeakMap<Battle, RPGFriendshipChangeResult[]>();

	static applyStandardEvent(pokemon: Pokemon, event: StandardFriendshipEvent): number {
		const friendship = pokemon.rpg.friendship ?? 50;
		let change = 0;
		switch (event) {
		case 'level-up':
			change = friendship < 100 ? 3 : friendship < 160 ? 2 : 0;
			break;
		case 'walking':
			change = friendship < 160 ? 1 : 0;
			break;
		case 'berry':
			change = friendship < 100 ? 10 : friendship < 160 ? 5 : 1;
			break;
		case 'vitamin':
			change = friendship < 100 ? 4 : friendship < 160 ? 2 : 0;
			break;
		case 'battle-item':
			change = friendship < 160 ? 1 : 0;
			break;
		}
		return this.change(pokemon, change);
	}

	static change(pokemon: Pokemon, amount: number): number {
		const previous = pokemon.rpg.friendship ?? 50;
		const total = pokemon.battle.clampIntRange(previous + Math.trunc(amount), 0, 255);
		pokemon.rpg.friendship = total;
		return total - previous;
	}

	static applyBattle(battle: Battle): void {
		this.results.set(battle, []);
		if (!battle.rpg || battle.rpg.friendshipRules?.mode === 'disabled') return;

		const rules = battle.rpg.friendshipRules;
		const mode: 'standard' | 'roleplay' = rules?.mode === 'roleplay' ? 'roleplay' : 'standard';
		const defeats = ParticipationSystem.getDefeats(battle);
		const changes: RPGFriendshipChangeResult[] = [];
		this.applyLevelUpChanges(battle, rules, mode, changes);

		for (const defeat of defeats) {
			const pokemon = battle.sides[Number(defeat.side.slice(1)) - 1]?.pokemon[defeat.position];
			if (pokemon?.set.rpg === undefined) continue;
			const source = defeat.source ?
				battle.sides[Number(defeat.source.side.slice(1)) - 1]?.pokemon[defeat.source.position] : null;
			const loss = mode === 'roleplay' ? this.safeLoss(rules?.faintLoss, 1) :
				this.getStandardFaintLoss(pokemon, source || null);
			this.recordChange(changes, pokemon, -loss, 'faint');
		}

		if (mode === 'roleplay' && battle.winner) {
			this.applyRoleplayBattleChanges(battle, rules, defeats, changes);
		}

		changes.sort((a, b) => a.side.localeCompare(b.side) || a.position - b.position);
		this.results.set(battle, changes);
	}

	private static applyLevelUpChanges(
		battle: Battle,
		rules: RPGFriendshipRules | undefined,
		mode: 'standard' | 'roleplay',
		changes: RPGFriendshipChangeResult[]
	): void {
		for (const gain of ExperienceDistributionSystem.getResults(battle)) {
			const pokemon = battle.sides[Number(gain.side.slice(1)) - 1]?.pokemon[gain.position];
			if (!pokemon || gain.level <= gain.previousLevel) continue;
			for (let level = gain.previousLevel + 1; level <= gain.level; level++) {
				if (mode === 'roleplay') {
					this.recordChange(changes, pokemon, Math.trunc(rules?.levelUpGain ?? 0), 'level-up');
				} else {
					const friendship = pokemon.rpg.friendship ?? 50;
					const amount = friendship < 100 ? 3 : friendship < 160 ? 2 : 0;
					this.recordChange(changes, pokemon, amount, 'level-up');
				}
			}
		}
	}

	static getResults(battle: Battle): RPGFriendshipChangeResult[] {
		return structuredClone(this.results.get(battle) || []);
	}

	static clear(battle: Battle): void {
		this.results.delete(battle);
	}

	private static getStandardFaintLoss(pokemon: Pokemon, source: Pokemon | null): number {
		if (!source || source.level < pokemon.level + 30) return 1;
		return (pokemon.rpg.friendship ?? 50) < 100 ? 5 : 10;
	}

	private static applyRoleplayBattleChanges(
		battle: Battle,
		rules: RPGFriendshipRules | undefined,
		defeats: ReturnType<typeof ParticipationSystem.getDefeats>,
		changes: RPGFriendshipChangeResult[]
	): void {
		const winner = battle.sides.find(side => side.name === battle.winner);
		if (!winner) return;
		const winnerSides = new Set([winner, winner.allySide].filter(Boolean));
		const participants = new Set(defeats.flatMap(defeat => defeat.participants.map(
			participant => `${participant.side}:${participant.position}`
		)));

		for (const side of battle.sides) {
			for (const pokemon of side.pokemon) {
				if (pokemon.set.rpg === undefined || pokemon.fainted) continue;
				if (winnerSides.has(side)) {
					const participated = participants.has(`${side.id}:${pokemon.position}`);
					const gain = participated ?
						Math.trunc(rules?.participantVictoryGain ?? 1) :
						Math.trunc(rules?.partyVictoryGain ?? 0);
					this.recordChange(changes, pokemon, gain, participated ? 'victory' : 'party-victory');
				} else {
					this.recordChange(changes, pokemon, -this.safeLoss(rules?.defeatLoss, 0), 'defeat');
				}
			}
		}
	}

	private static recordChange(
		results: RPGFriendshipChangeResult[],
		pokemon: Pokemon,
		amount: number,
		reason: RPGFriendshipChangeResult['reason']
	): void {
		if (!amount) return;
		const previousFriendship = pokemon.rpg.friendship ?? 50;
		const change = this.change(pokemon, amount);
		if (!change) return;
		results.push({
			side: pokemon.side.id,
			position: pokemon.position,
			reason,
			previousFriendship,
			change,
			totalFriendship: pokemon.rpg.friendship!,
		});
	}

	private static safeLoss(value: number | undefined, fallback: number): number {
		return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.trunc(value));
	}
}
