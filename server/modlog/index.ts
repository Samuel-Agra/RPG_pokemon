/** Disabled Pokemon Showdown staff-audit compatibility surface. */
export type ModlogID = RoomID | 'global' | 'all' | 'public';
export interface ModlogSearch {
	note: { search: string, isExact?: boolean, isExclusion?: boolean }[];
	user: { search: string, isExact?: boolean, isExclusion?: boolean }[];
	ip: { search: string, isExclusion?: boolean }[];
	action: { search: string, isExclusion?: boolean }[];
	actionTaker: { search: string, isExclusion?: boolean }[];
}
export interface ModlogEntry {
	action: string; roomID: string; visualRoomID: string; userid: ID | null;
	autoconfirmedID: ID | null; alts: ID[]; ip: string | null; isGlobal: boolean;
	loggedBy: ID | null; note: string; time: number;
}
export interface ModlogResults {
	results: (ModlogEntry & { entryID: number })[];
	duration: number;
}
export type PartialModlogEntry = Partial<ModlogEntry> & { action: string };
export class Modlog {
	readonly database: any = null;
	readonly readyPromise: Promise<void> | null = null;
	readonly databaseReady: boolean = false;
	setup() {}
	async restart() {}
	initialize(_roomid: ModlogID) {}
	async write(_roomid: string, _entry: PartialModlogEntry, _overrideID?: string) {}
	async rename(_oldID: ModlogID, _newID: ModlogID) {}
	async destroy(_roomid: ModlogID) {}
	destroyAllSQLite() {}
	destroyAll() {}
	getSharedID(_roomid: ModlogID): false { return false; }
	async getGlobalPunishments(_user: User | string, _days = 30): Promise<null> { return null; }
	async search(
		_roomid: ModlogID = 'global', _search?: ModlogSearch, _maxLines = 20, _onlyPunishments = false
	): Promise<ModlogResults | null> {
		return null;
	}
}
export const mainModlog = new Modlog();
