import type { Pokemon } from "../../../pokemon";

export class EVSystem {
	static readonly WILD_TOTAL = 508;
	static readonly STAT_LIMIT = 252;
	static readonly EV_STEP = 4;

	static distributeWild(pokemon: Pokemon): void {
		const state = pokemon.battle.rpg;
		if (state?.battleType !== 'wild') return;
		if (pokemon.side.id !== (state.wildSide || 'p2')) return;

		const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
		const evs: StatsTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
		for (let distributed = 0; distributed < this.WILD_TOTAL; distributed += this.EV_STEP) {
			const available = stats.filter(stat => evs[stat] <= this.STAT_LIMIT - this.EV_STEP);
			const stat = available[pokemon.battle.random(available.length)];
			evs[stat] += this.EV_STEP;
		}
		pokemon.set.evs = evs;
		pokemon.rpg.evs = { ...evs };
	}

	static save(pokemon: Pokemon): void {
		const { hp, atk, def, spa, spd, spe } = pokemon.set.evs;
		pokemon.rpg.evs = { hp, atk, def, spa, spd, spe };
	}
}
