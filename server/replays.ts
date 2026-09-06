/** Disabled Pokemon Showdown replay-storage compatibility surface. */
export type ReplayRow = {
	id: string; format: string; players: string; log: string; inputlog: string | null;
	uploadtime: number; views: number; formatid: string; rating: number | null;
	private: 0 | 1 | 2 | 3 | 10; password: string | null;
};
export type Replay = Omit<ReplayRow, 'formatid' | 'players' | 'password' | 'views'> & {
	players: string[]; views?: number; password?: string | null;
};
export const replaysDB = null;
export const replays = null;
export const replayPlayers = null;
export const Replays = new class {
	readonly db: object | null = null;
	readonly replaysTable: object | null = null;
	readonly replayPlayersTable: object | null = null;
	generatePassword() { return ''; }
	async add(_replay: Replay): Promise<never> {
		throw new Error('Showdown replay storage is disabled in RPG mode.');
	}
	async get(_id: string): Promise<Replay | null> { return null; }
	async edit(_replay: Replay): Promise<void> {}
	async search(_args: Record<string, unknown>): Promise<Replay[]> { return []; }
	async fullSearch(_term: string, _page = 0): Promise<Replay[]> { return []; }
	async recent(): Promise<Replay[]> { return []; }
};
export default Replays;
