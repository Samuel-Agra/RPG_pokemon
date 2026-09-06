/**
 * RPG-only battle formats.
 *
 * The application owns matchmaking, teams, progression, tournaments, contests,
 * and initial field conditions. Showdown is retained only as the deterministic
 * Gen 9 battle engine, so competitive ladders and random-battle formats do not
 * belong in this catalog.
 */
const RPG_CUSTOM_RULES = [
	'Team Preview',
	'Cancel Mod',
	'Max Team Size = 24',
	'Max Move Count = 24',
	'Max Level = 9999',
	'Default Level = 100',
];

export const Formats: import('../sim/dex-formats').FormatList = [
	{
		section: 'Pokémon RPG',
	},
	{
		name: '[Gen 9] Custom Game',
		mod: 'gen9',
		searchShow: false,
		challengeShow: false,
		tournamentShow: false,
		rated: false,
		debug: true,
		battle: { trunc: Math.trunc },
		ruleset: RPG_CUSTOM_RULES,
	},
	{
		name: '[Gen 9] Doubles Custom Game',
		mod: 'gen9',
		gameType: 'doubles',
		searchShow: false,
		challengeShow: false,
		tournamentShow: false,
		rated: false,
		debug: true,
		battle: { trunc: Math.trunc },
		ruleset: RPG_CUSTOM_RULES,
	},
	// Internal harnesses used to verify RPG persistence and four-side outcomes.
	// They remain hidden and are never exposed as application game modes.
	{
		name: '[Gen 9] Anything Goes',
		mod: 'gen9',
		searchShow: false,
		challengeShow: false,
		tournamentShow: false,
		rated: false,
		ruleset: ['Standard AG'],
	},
	{
		name: '[Gen 9] Free-For-All',
		mod: 'gen9',
		gameType: 'freeforall',
		searchShow: false,
		challengeShow: false,
		tournamentShow: false,
		rated: false,
		ruleset: ['Standard'],
	},
	{
		name: '[Gen 8] Multi Random Battle',
		mod: 'gen8',
		gameType: 'multi',
		searchShow: false,
		challengeShow: false,
		tournamentShow: false,
		rated: false,
		ruleset: [
			'Max Team Size = 3',
			'Obtainable',
			'Species Clause',
			'HP Percentage Mod',
			'Cancel Mod',
			'Sleep Clause Mod',
			'Illusion Level Mod',
		],
	},
];
