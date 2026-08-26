'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const ui = fs.readFileSync(path.join(root, 'server/static/rpg/shop-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/shop-ui.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
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
		assert.match(css, /shop-directory-grid/);
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
		assert.match(ui, /master-bulk/);
		assert.match(ui, /watchShop/);
		assert.match(css, /shop-master-bulk/);
		assert.match(css, /shop-stock-row/);
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
});
