'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {getRPGContestMove, getRPGContestMoveCatalog} = require('../../dist/server/rpg-showdown');
const {Dex} = require('../../dist/sim/dex');

describe('RPG contest move catalog', () => {
	it('assigns independent contest data to every official move', () => {
		const catalog = getRPGContestMoveCatalog();
		assert.ok(catalog.length > 900);
		assert.equal(new Set(catalog.map(move => move.moveId)).size, catalog.length);
		for (const move of catalog) {
			assert.ok(move.baseScore >= -4 && move.baseScore <= 8, move.moveId);
			assert.ok(move.tags.length, move.moveId);
			assert.ok(['beauty', 'cute', 'cool', 'smart', 'tough'].includes(move.category), move.moveId);
		}
		assert.equal(Dex.mod('gen9').moves.get('surf').contestBaseScore, undefined);
	});

	it('keeps explicit values and stage semantics for representative moves', () => {
		assert.equal(getRPGContestMove('Quiver Dance').baseScore, 8);
		assert.equal(getRPGContestMove('Petal Dance').baseScore, 8);
		assert.equal(getRPGContestMove('Surf').baseScore, 6);
		assert.equal(getRPGContestMove('Explosion').baseScore, -3);
		assert.equal(getRPGContestMove('Self-Destruct').baseScore, -4);
		assert.ok(getRPGContestMove('Surf').tags.includes('fieldchange'));
		assert.equal(getRPGContestMove('Rain Dance').changesField, true);
		assert.ok(getRPGContestMove('Explosion').penalties.includes('selfko'));
	});

	it('exposes the catalog through an authenticated contest endpoint', () => {
		const source = fs.readFileSync(path.resolve(__dirname, '../../server/rpg-showdown/http.ts'), 'utf8');
		assert.match(source, /GET[^\n]+\/api\/rpg\/contest-moves/);
		assert.match(source, /getRPGContestMoveCatalog\(\)/);
	});
});
