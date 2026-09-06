/** Showdown moderation storage is not part of the private Pokémon RPG runtime. */

export interface Punishment {
	type: string;
	id: ID | string;
	expireTime: number;
	reason: string;
	rest?: any[];
}

const emptyMap = () => new Map<any, any>();
interface NestedPunishmentMap extends Map<string, Punishment[]> {
	nestedGet(scope: string, id: string): Punishment[] | undefined;
	nestedHas(scope: string, id: string): boolean;
	nestedSet(scope: string, id: string, punishments: Punishment[]): void;
	nestedDelete(scope: string, id: string): boolean;
}
const nestedEmptyMap: NestedPunishmentMap = Object.assign(new Map<string, Punishment[]>(), {
	nestedGet: (_scope: string, _id: string) => undefined,
	nestedHas: (_scope: string, _id: string) => false,
	nestedSet: (_scope: string, _id: string, _punishments: Punishment[]) => {},
	nestedDelete: (_scope: string, _id: string) => false,
});

const userids = Object.assign(new Map<ID, Punishment[]>(), {
	getByType: (_id: string, _type: string): Punishment | undefined => undefined,
});

interface DisabledPunishments {
	[key: string]: any;
	userids: typeof userids;
	ips: Map<string, Punishment[]>;
	punishmentTypes: Map<string, { desc: string }>;
	roomPunishmentTypes: Map<string, { desc: string }>;
	roomUserids: typeof nestedEmptyMap;
	roomIps: typeof nestedEmptyMap;
	search(userid: string): [string, RoomID | null, Punishment][];
	getRoomPunishments(user: User | { id: ID }, options?: AnyObject): [RoomID, Punishment][];
}

export const Punishments: DisabledPunishments = {
	userids,
	ips: new Map<string, Punishment[]>(),
	sharedIps: emptyMap(),
	roomUserids: nestedEmptyMap,
	roomIps: nestedEmptyMap,
	punishmentTypes: new Map(),
	roomPunishmentTypes: new Map(),
	addRoomPunishmentType: () => {},
	load: async () => {},
	renameRoom: () => {},
	isBattleBanned: () => false,
	isRoomBanned: () => false,
	isGroupchatBanned: () => false,
	isSharedIp: () => false,
	hasPunishType: () => false,
	checkNameInRoom: () => false,
	checkIpBanned: () => false,
	checkIp: async () => {},
	checkName: () => {},
	checkPunishmentExpiration: () => '',
	monitorRoomPunishments: async () => {},
	monitorGroupchatJoin: () => {},
	search: () => [],
	getRoomPunishments: () => [],
	punish: () => false,
	lock: () => false,
};
