'use strict';

const fs = require('fs');
const path = require('path');

const moves = require('../dist/server/rpg-showdown/contest-move-catalog');
const scoring = require('../dist/server/rpg-showdown/contest-scoring');
const items = require('../dist/server/rpg-showdown/contest-item-catalog');
const {RPGItems} = require('../dist/sim/rpg-showdown/systems/inventory/item-registry');

const customPath = path.resolve('config/rpg-contest-combos.json');
let customCombos = [];
if (fs.existsSync(customPath)) {
	const raw = JSON.parse(fs.readFileSync(customPath, 'utf8'));
	customCombos = Array.isArray(raw.combos) ? raw.combos : [];
}

const itemCatalog = RPGItems.list().map(item => ({
	id: item.id,
	name: item.name,
	...items.classifyRPGContestItem(item),
}));

const output = {
	generatedAt: new Date().toISOString(),
	moves: moves.getRPGContestMoveCatalog(),
	combos: [...scoring.RPG_DEFAULT_CONTEST_COMBOS, ...customCombos]
		.sort((a, b) => a.name.localeCompare(b.name)),
	items: itemCatalog,
};

fs.mkdirSync(path.resolve('docs/.contest-reference-work'), {recursive: true});
fs.writeFileSync(
	path.resolve('docs/.contest-reference-work/catalog.json'),
	JSON.stringify(output, null, 2),
	'utf8'
);
