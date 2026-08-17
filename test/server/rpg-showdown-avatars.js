'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG avatar catalog', () => {
	const catalogPath = path.resolve(__dirname, '../../server/static/rpg/avatars.json');
	const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

	it('contains a broad deduplicated selection of official avatars', () => {
		assert.equal(catalog.version, 2);
		assert(catalog.sourceCount > catalog.avatarCount);
		assert(catalog.avatarCount >= 500);
		assert.equal(catalog.avatars.length, catalog.avatarCount);

		const ids = catalog.avatars.map(avatar => avatar.id);
		const names = catalog.avatars.map(avatar => avatar.name);
		assert.equal(new Set(ids).size, ids.length);
		assert.equal(new Set(names).size, names.length);
		assert(ids.every(id => /^[a-z0-9-]+$/.test(id)));
	});

	it('keeps the latest version of each repeated avatar', () => {
		const expected = {
			Swimmer: 'swimmer-masters',
			Lucas: 'lucas-contest',
			Dawn: 'dawn-masters3',
			Hilbert: 'hilbert-masters2',
			Hilda: 'hilda-masters3',
			Nate: 'nate-pokestar3',
			Rosa: 'rosa-masters3',
			Cynthia: 'cynthia-masters4',
			Youngster: 'youngster-gen9',
		};
		for (const [name, id] of Object.entries(expected)) {
			assert.equal(catalog.avatars.find(avatar => avatar.name === name)?.id, id);
		}
		assert.equal(catalog.defaultAvatarId, expected.Lucas);
	});

	it('excludes group sprites and unique legacy-only sprites', () => {
		const ids = catalog.avatars.map(avatar => avatar.id);
		const groupPattern =
			/couple|twins|doubleteam|interviewers|jessiejames|tateandliza|sisandbro|srandjr|teammates/;
		assert(!ids.some(id => groupPattern.test(id)));
		assert(!ids.includes('aaron'));
	});

	it('preserves every official Miku type as a separate avatar', () => {
		const mikus = catalog.avatars
			.filter(avatar => avatar.id.startsWith('miku-'))
			.map(avatar => avatar.id);
		assert.deepEqual(mikus, [
			'miku-fairy', 'miku-fire', 'miku-flying', 'miku-ghost', 'miku-grass',
			'miku-ground', 'miku-ice', 'miku-psychic', 'miku-water',
		]);
	});
});
