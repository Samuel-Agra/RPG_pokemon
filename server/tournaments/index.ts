/**
 * The standard Showdown tournament service was removed from the RPG runtime.
 * RPG battle and contest brackets live in server/rpg-showdown.
 */

export interface TournamentRoomSettings {
	allowModjoin?: boolean;
	allowScouting?: boolean;
	announcements?: boolean;
	autoconfirmedOnly?: boolean;
	autodq?: number;
	autostart?: number | boolean;
	forcePublic?: boolean;
	forceTimer?: boolean;
	playerCap?: number;
	recentToursLength?: number;
	recentTours?: { name: string, baseFormat: string, time: number }[];
	blockRecents?: boolean;
}

export type Tournament = any;
export type TournamentPlayer = any;

class DisabledTournament {}

export const Tournaments: any = {
	TournamentGenerators: Object.create(null),
	TournamentPlayer: class DisabledTournamentPlayer {},
	Tournament: DisabledTournament,
	createTournament() {
		throw new Error('Showdown tournaments are not available in Pokémon RPG');
	},
	commands: {},
	roomSettings: [],
};
