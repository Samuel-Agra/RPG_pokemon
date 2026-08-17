'use strict';

/**
 * Provedor visual temporario da V1.
 *
 * `true` preserva a compatibilidade visual carregando recursos diretamente do
 * host publico configurado. `false` impede essas requisicoes; o RPG usa os
 * fallbacks locais disponiveis.
 *
 * Este arquivo configura URLs, nao concede licenca sobre recursos externos.
 */
window.RPG_ASSET_CONFIG = Object.freeze({
	enableExternalShowdownAssets: true,
	showdownBaseUrl: 'https://play.pokemonshowdown.com/',
});
