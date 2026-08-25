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
		assert.match(ui, /Onde deseja ir/);
		assert.match(ui, /COMPRAR/);
		assert.match(ui, /VENDER/);
		assert.match(ui, /Buscar item/);
		assert.match(ui, /shop-quantity-button/);
		assert.match(ui, /Confirmar compra/);
		assert.match(ui, /Confirmar venda/);
		assert.match(ui, /expectedCatalogRevision/);
		assert.match(css, /shop-directory-grid/);
		assert.match(css, /shop-catalog-layout/);
	});
	it('offers independent Master controls for stock, purchase, sale and lock visibility', () => {
		assert.match(ui, /Estoque compartilhado/);
		assert.match(ui, /Loja vende ao Player/);
		assert.match(ui, /Loja compra do Player/);
		assert.match(ui, /Visível, mas bloqueado/);
		assert.match(ui, /Oculto quando bloqueado/);
		assert.match(ui, /master-offer/);
	});
	it('loads the module and exposes Lojas in both navigation modes', () => {
		assert.match(html, /shop-ui\.css/);
		assert.match(html, /shop-ui\.js/);
		assert.match(app, /\['shops', 'Lojas'\]/);
		assert.match(app, /renderShops/);
		assert.match(app, /state\.dashboardView === 'shops'/);
	});
});
