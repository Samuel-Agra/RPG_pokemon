'use strict';

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { getRPGAbilityDescriptionPTBR } =
	require('../../dist/server/rpg-showdown/ability-descriptions-pt-br');

describe('RPG ability descriptions in Portuguese', () => {
	it('covers every standard Generation 9 ability without the untranslated fallback', () => {
		const abilities = Dex.mod('gen9').abilities.all().filter(ability =>
			ability.exists && !ability.isNonstandard
		);
		assert.equal(abilities.length, 310);
		for (const ability of abilities) {
			const description = getRPGAbilityDescriptionPTBR(ability.id);
			assert(description.length > 12, ability.name + ' has an empty description');
			assert(!description.includes('ainda não está disponível'), ability.name + ' uses the fallback');
			assert(!/This Pokemon|On switch-in|No competitive use/.test(description),
				ability.name + ' remains in English');
		}
	});

	it('keeps manually reviewed descriptions ahead of the generated catalog', () => {
		assert.match(getRPGAbilityDescriptionPTBR('blaze'), /1\/3.*Fire.*1,5/);
		assert.match(getRPGAbilityDescriptionPTBR('solarpower'), /Sp\. Attack.*1,5/);
		assert.match(getRPGAbilityDescriptionPTBR('levitate'), /Ground/);
	});
});
