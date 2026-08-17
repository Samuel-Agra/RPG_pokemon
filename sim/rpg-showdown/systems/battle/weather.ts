import type { Battle } from "../../../battle";
import type { Pokemon } from "../../../pokemon";

export class WeatherSystem {
	static apply(battle: Battle, source: Pokemon): void {
		const configuredWeather = battle.rpg?.weather;
		const weatherID = configuredWeather === 'snow' ? 'snowscape' : configuredWeather;
		if (!weatherID) return;

		const weather = battle.dex.conditions.get(weatherID);
		if (!weather.id || !battle.field.setWeather(weather, source)) return;

		const duration = battle.rpg?.weatherDuration;
		// A preparação omite a duração para representar clima permanente; zero não é decrementado pelo residual nativo.
		battle.field.weatherState.duration = duration === undefined ? 0 : battle.clampIntRange(duration, 0);
	}

	static save(battle: Battle): void {
		if (!battle.rpg) return;

		battle.rpg.weather = battle.field.weather;
		battle.rpg.weatherDuration = typeof battle.field.weatherState.duration === 'number' ?
			battle.field.weatherState.duration : undefined;
	}
}
