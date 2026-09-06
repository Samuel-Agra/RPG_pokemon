/** Signed Showdown login assertions are not used by Pokémon RPG. */

export function verify(_data: string, _signature: string): Promise<boolean> {
	return Promise.resolve(false);
}

export function start(_processCount: unknown) {}
export function destroy() {}
