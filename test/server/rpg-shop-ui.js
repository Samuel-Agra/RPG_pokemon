'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const ui = fs.readFileSync(path.join(root, 'server/static/rpg/shop-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/shop-ui.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const appCss = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');

describe('RPG commerce frontend', () => {
	it('provides the central establishment selector and Player buy/sell cart', () => {
		assert.doesNotMatch(ui, /Onde deseja ir/);
		assert.doesNotMatch(ui, /COMÉRCIO DA CAMPANHA/);
		assert.match(ui, /COMPRAR/);
		assert.match(ui, /VENDER/);
		assert.match(ui, /Buscar item/);
		assert.match(ui, /shop-quantity-button/);
		assert.match(ui, /pointerdown/);
		assert.match(ui, /setInterval/);
		assert.match(ui, /bindRepeater\(minus, -1\)/);
		assert.match(ui, /bindRepeater\(plus, 1\)/);
		assert.match(ui, /Confirmar compra/);
		assert.match(ui, /Confirmar venda/);
		assert.match(ui, /expectedCatalogRevision/);
		assert.match(ui, /offer\.buyEnabled && offer\.stock > 0/);
		assert.match(ui, /api\('\/shops' \+ characterQuery\(options\)\)/);
		assert.match(ui, /card\.disabled = blocked/);
		assert.match(ui, /'Indisponível'/);
		assert.doesNotMatch(ui, /Indisponível nesta cidade/);
		assert.match(css, /shop-directory-grid/);
		assert.match(css, /shop-directory-card\.blocked/);
		assert.match(css, /shop-directory-card\.blocked[^}]*cursor:default/);
		assert.doesNotMatch(css, /shop-directory-card\.blocked[^}]*cursor:not-allowed/);
		assert.doesNotMatch(ui, /produtos? disponíveis/);
		assert.doesNotMatch(css, /shop-directory-stock/);
		assert.match(ui, /sprite: item\.sprite/);
		assert.match(css, /shop-cart-grid/);
		assert.match(ui, /effectGroup/);
		assert.match(ui, /effectType/);
		assert.doesNotMatch(ui, /detailsPanel/);
	});
	it('offers inline Master stock controls, bulk actions and automatic synchronization', () => {
		assert.match(ui, /Estoque compartilhado/);
		assert.match(ui, /Quantidade disponível/);
		assert.match(ui, /Resetar preços/);
		assert.match(ui, /enable-buy/);
		assert.match(ui, /disable-buy/);
		assert.match(ui, /increase-prices/);
		assert.match(ui, /increase-stock/);
		assert.match(ui, /decrease-stock/);
		assert.match(ui, /master-bulk/);
		assert.match(ui, /watchShop/);
		assert.match(css, /shop-master-bulk/);
		assert.match(css, /shop-stock-row/);
		assert.match(ui, /\['\+', 'increase-stock'/);
		assert.match(ui, /\['−', 'decrease-stock'/);
		assert.doesNotMatch(css, /shop-stock-quantity-heading/);
		assert.match(css, /shop-toggle-name\.enabled/);
		assert.match(css, /shop-toggle-name\.disabled/);
		assert.doesNotMatch(css, /shop-master-stock\{[^}]*overflow-y:auto/);
	});
	it('loads the module and exposes Lojas in both navigation modes', () => {
		assert.match(html, /shop-ui\.css/);
		assert.match(html, /shop-ui\.js/);
		assert.match(app, /\['shops', 'Lojas'\]/);
		assert.match(app, /renderShops/);
		assert.match(app, /state\.dashboardView === 'shops'/);
	});
	it('shows the Master a main shop lock with expandable per-shop controls', () => {
		assert.match(app, /pageAccess\?\.shops === false/);
		assert.match(app, /pageToggle\('shops', 'Lojas'\)/);
		assert.match(app, /master-shop-access-expand/);
		assert.match(app, /Lojas disponíveis nesta cidade/);
		assert.match(app, /character\.shopAccess\?\.\[shop\.id\] !== false/);
		assert.match(app, /api\('\/characters\/shop-access'/);
		assert.match(appCss, /master-shop-access-panel/);
		assert.match(appCss, /master-shop-access-row/);
		assert.match(app, /master-players-panel/);
		assert.match(appCss, /\.master-players-panel\s*\{\s*overflow:\s*visible;/);
		assert.match(appCss, /\.nav-button\.locked,[\s\S]*?cursor:\s*default;/);
	});
});
