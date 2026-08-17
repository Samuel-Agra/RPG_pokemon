import type { Battle } from "../../../battle";
import type {
	RPGBattleModeRules,
	RPGBattleOutcome,
	RPGBattleType,
	RPGResolvedBattleModeRules,
	RPGReward,
	RPGSideRole,
} from "../../state";

/** Gen 9 Custom Game keeps competitive bans out and permits legacy mechanics and moves. */
export const RPG_BATTLE_FORMAT_ID = 'gen9customgame';

const DEFAULT_RULES: Record<RPGBattleType, RPGResolvedBattleModeRules> = {
	wild: {
		allowCapture: true, allowFlee: true, allowBattleItems: true,
		requireFullDefeat: false, experienceMultiplier: 1, rewards: [], rewardsByOutcome: {},
	},
	trainer: {
		allowCapture: false, allowFlee: true, allowBattleItems: true,
		requireFullDefeat: true, experienceMultiplier: 1.5, rewards: [], rewardsByOutcome: {},
	},
	npc: {
		allowCapture: false, allowFlee: true, allowBattleItems: true,
		requireFullDefeat: true, experienceMultiplier: 1.5, rewards: [], rewardsByOutcome: {},
	},
	boss: {
		allowCapture: false, allowFlee: false, allowBattleItems: true,
		requireFullDefeat: true, experienceMultiplier: 2, rewards: [], rewardsByOutcome: {},
	},
	gym: {
		allowCapture: false, allowFlee: false, allowBattleItems: true,
		requireFullDefeat: true, experienceMultiplier: 2, rewards: [], rewardsByOutcome: {},
	},
	'no-exp': {
		allowCapture: false, allowFlee: true, allowBattleItems: true,
		requireFullDefeat: false, experienceMultiplier: 0, rewards: [], rewardsByOutcome: {},
	},
};

export class RPGBattleRulesSystem {
	static get(battle: Battle): RPGResolvedBattleModeRules {
		const type = battle.rpg?.battleType || 'wild';
		const defaults = DEFAULT_RULES[type];
		const custom: RPGBattleModeRules = battle.rpg?.modeRules?.[type] || {};
		const multiplier = custom.experienceMultiplier;
		return {
			allowCapture: custom.allowCapture ?? defaults.allowCapture,
			allowFlee: custom.allowFlee ?? defaults.allowFlee,
			allowBattleItems: custom.allowBattleItems ?? defaults.allowBattleItems,
			requireFullDefeat: custom.requireFullDefeat ?? defaults.requireFullDefeat,
			experienceMultiplier: multiplier === undefined || !Number.isFinite(multiplier) ?
				defaults.experienceMultiplier : Math.max(0, multiplier),
			rewards: structuredClone(custom.rewards || defaults.rewards),
			rewardsByOutcome: structuredClone(custom.rewardsByOutcome || defaults.rewardsByOutcome),
		};
	}

	static canCapture(battle: Battle): boolean {
		return this.get(battle).allowCapture;
	}

	static canFlee(battle: Battle): boolean {
		return this.get(battle).allowFlee;
	}

	static canUseBattleItems(battle: Battle): boolean {
		return this.get(battle).allowBattleItems;
	}

	static requiresFullDefeat(battle: Battle): boolean {
		return this.get(battle).requireFullDefeat;
	}

	static getRewards(battle: Battle, outcome: RPGBattleOutcome): RPGReward[] {
		const rules = this.get(battle);
		return structuredClone([
			...(outcome === 'win' ? rules.rewards : []),
			...(rules.rewardsByOutcome[outcome] || []),
		]);
	}

	static getSideRoles(battle: Battle): Partial<Record<SideID, RPGSideRole>> {
		const type = battle.rpg?.battleType || 'wild';
		const roles: Partial<Record<SideID, RPGSideRole>> = {};
		for (const side of battle.sides) {
			roles[side.id] = this.inferSideRole(type, side.id, battle.rpg?.wildSide);
		}
		return { ...roles, ...structuredClone(battle.rpg?.sideRoles || {}) };
	}

	private static inferSideRole(type: RPGBattleType, side: SideID, wildSide?: SideID): RPGSideRole {
		if (side === 'p1') return 'player';
		switch (type) {
		case 'wild': return side === (wildSide || 'p2') ? 'wild' : 'player';
		case 'npc': return 'npc';
		case 'boss': return 'boss';
		case 'gym': return 'gym';
		default: return 'trainer';
		}
	}
}
