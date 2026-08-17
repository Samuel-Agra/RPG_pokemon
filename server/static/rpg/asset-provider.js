'use strict';

(function configureRPGAssets() {
	const supplied = window.RPG_ASSET_CONFIG || {};
	const enabled = supplied.enableExternalShowdownAssets !== false;
	const defaultBase = 'https://play.pokemonshowdown.com/';
	const configuredBase = String(supplied.showdownBaseUrl || defaultBase);
	const externalBaseUrl = configuredBase.endsWith('/') ? configuredBase : configuredBase + '/';
	const disabledBaseUrl = new URL('./assets/external-disabled/', document.baseURI).href;
	const baseUrl = enabled ? externalBaseUrl : disabledBaseUrl;
	const url = path => new URL(String(path || '').replace(/^\/+/, ''), baseUrl).href;

	window.RPGAssets = Object.freeze({
		provider: enabled ? 'pokemon-showdown-external' : 'disabled',
		external: enabled,
		baseUrl,
		host: new URL(baseUrl).host,
		url,
		megaSymbol: enabled ? url('sprites/misc/mega.png') : null,
	});

	const root = document.documentElement.style;
	const cssAssets = {
		'--rpg-asset-weather-sun': 'fx/weather-sunnyday.jpg',
		'--rpg-asset-weather-rain': 'fx/weather-raindance.jpg',
		'--rpg-asset-weather-sand': 'fx/weather-sandstorm.png',
		'--rpg-asset-weather-snow': 'fx/weather-hail.png',
		'--rpg-asset-terrain-electric': 'fx/weather-electricterrain.png',
		'--rpg-asset-terrain-grassy': 'fx/weather-grassyterrain.png',
		'--rpg-asset-terrain-misty': 'fx/weather-mistyterrain.png',
		'--rpg-asset-terrain-psychic': 'fx/weather-psychicterrain.png',
		'--rpg-asset-item-icons': 'sprites/itemicons-sheet.png?v1',
		'--rpg-asset-category-physical': 'sprites/categories/Physical.png',
		'--rpg-asset-category-special': 'sprites/categories/Special.png',
		'--rpg-asset-category-status': 'sprites/categories/Status.png',
	};
	for (const [property, path] of Object.entries(cssAssets)) {
		root.setProperty(property, enabled ? `url("${url(path)}")` : 'none');
	}
})();
