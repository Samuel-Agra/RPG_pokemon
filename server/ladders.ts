/**
 * Competitive Showdown services are intentionally unavailable in the RPG.
 * Battles and invitations are owned by server/rpg-showdown.
 */

const DISABLED_MESSAGE = 'Showdown matchmaking is not available in Pokémon RPG';
const unavailable = () => {
	throw new Error(DISABLED_MESSAGE);
};

const challenges = {
	add: unavailable,
	accept: unavailable,
	resolveAcceptCommand: unavailable,
	remove: () => false,
	send: () => {},
	search: () => null,
	searchByRoom: () => null,
	get: () => [],
	clearFor: () => false,
	updateFor: () => {},
};

class DisabledBattleReady {
	constructor(..._args: unknown[]) {
		unavailable();
	}
}

class DisabledBattleChallenge extends DisabledBattleReady {}
class DisabledGameChallenge extends DisabledBattleReady {}
class DisabledBattleInvite extends DisabledBattleReady {}

const getDisabledLadder = () => ({
	getRating: unavailable,
	updateRating: unavailable,
	getTop: unavailable,
});

export const Ladders: any = Object.assign(getDisabledLadder, {
	BattleReady: DisabledBattleReady,
	BattleChallenge: DisabledBattleChallenge,
	GameChallenge: DisabledGameChallenge,
	BattleInvite: DisabledBattleInvite,
	cancelSearches: () => false,
	updateSearch: () => {},
	acceptChallenge: unavailable,
	visualizeAll: () => Promise.resolve([]),
	getSearches: () => [],
	match: unavailable,
	searches: new Map(),
	challenges,
	periodicMatchInterval: null,
	formatsListPrefix: '',
	disabled: true,
});
