'use strict';

const assert = require('node:assert/strict');
const { RPG_TRAINER_TALENTS } = require('../../dist/server/rpg-showdown/trainer-talents-catalog');
const { RPG_TRAINER_CLASS_FEATURES } = require('../../dist/server/rpg-showdown/trainer-class-features');

describe('RPG trainer talent descriptions', () => {
	it('audits every talent and innate feature for supported, balanced rich text', () => {
		const descriptions = [...RPG_TRAINER_TALENTS,
			...Object.values(RPG_TRAINER_CLASS_FEATURES).flat()];
		assert(descriptions.length > 500);
		for (const entry of descriptions) {
			const text = entry.text;
			const name = entry.name;
			assert.equal(typeof text, 'string', name);
			assert(text.trim(), name);
			assert.equal((text.match(/```/g) || []).length % 2, 0, name);
			assert.equal((text.match(/<table\b/gi) || []).length,
				(text.match(/<\/table>/gi) || []).length, name);
			assert.equal((text.match(/<tr>/gi) || []).length,
				(text.match(/<\/tr>/gi) || []).length, name);
			assert.equal((text.match(/<td>/gi) || []).length,
				(text.match(/<\/td>/gi) || []).length, name);
			assert.equal((text.match(/<page\b/gi) || []).length,
				(text.match(/<\/page>/gi) || []).length, name);
			for (const tag of text.match(/<\/?[a-z][^>]*>/gi) || []) {
				assert.match(tag, /^<(?:\/)?(?:table|tr|td|page)\b[^>]*>|^<empty-block\s*\/>/i, `${name}: ${tag}`);
			}
		}
	});
});
