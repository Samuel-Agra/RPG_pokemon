import type { RPGPokemonSizeClass } from "../state";

/** Four visual categories shared by the battle field and post-battle progression. */
export function getRPGPokemonSizeClass(heightM: number): RPGPokemonSizeClass {
	if (heightM <= 0.6) return 'small';
	if (heightM <= 1.4) return 'medium';
	if (heightM <= 2.4) return 'large';
	return 'giant';
}
