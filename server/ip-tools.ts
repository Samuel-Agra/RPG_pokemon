/** Proxy databases and DNS blocklists from Showdown are not used by Pokémon RPG. */

export interface AddressRange {
	minIP: number;
	maxIP: number;
	host?: string;
}

const emptyMap = () => new Map<any, any>();
const emptySet = () => new Set<any>();

export const IPTools: any = {
	dnsblCache: emptyMap(),
	connectionTestCache: emptyMap(),
	singleIPOpenProxies: emptySet(),
	proxyHosts: emptySet(),
	residentialHosts: emptySet(),
	mobileHosts: emptySet(),
	ranges: [] as AddressRange[],
	checker: () => () => false,
	checkPattern: () => false,
	loadHostsAndRanges: () => Promise.resolve(),
	lookup: (ip: string) => Promise.resolve({ dnsbl: null, host: ip, hostType: 'unknown' }),
	getHost: (ip: string) => Promise.resolve(ip),
	queryDnsbl: () => Promise.resolve(null),
	updateTorRanges: () => Promise.resolve(),
	saveHostsAndRanges: () => Promise.resolve(),
};
