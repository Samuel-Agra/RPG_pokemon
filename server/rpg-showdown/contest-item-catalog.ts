import {
	RPGItemRegistry, RPGItems, type RPGItemDefinition,
} from '../../sim/rpg-showdown/systems/inventory/item-registry';
import type { RPGContestCategory } from './contest-session';

export type RPGContestItemExclusionReason =
	'berry' | 'breeding' | 'not-equippable' | 'not-useful' | 'unclassified';
export type RPGContestItemScoringMode = 'none' | 'passive' | 'mega-activation';

export interface RPGContestItemClassification {
	canScore: boolean;
	exclusionReason: RPGContestItemExclusionReason | null;
	category: RPGContestCategory | null;
	points: 0 | 1 | 2 | 3;
	scoringMode: RPGContestItemScoringMode;
	balanceGroup: 'mega-stones' | null;
}

const CATEGORIES: readonly RPGContestCategory[] = ['beauty', 'cute', 'cool', 'smart', 'tough'];
const VISUAL_HINTS: Readonly<Record<RPGContestCategory, readonly RegExp[]>> = Object.freeze({
	beauty: [/gem|pearl|diamond|crystal|prism|mirror|flower|rose|incense|perfume|powder|scale|feather|wing|orb|dew|light|bright|glow|star|moon|sun|rainbow|sea|shell|lotus|petal|ribbon/],
	cute: [/doll|toy|balloon|bell|bow|sweet|candy|cookie|cake|cream|clover|heart|love|pink|fluffy|soft|plush|pouch|scarf|cap|mask|button|egg|apple|teapot|cup|spoon/],
	cool: [/glasses|lens|scope|cloak|coat|vest|band|belt|boots|helmet|razor|claw|fang|beak|horn|fin|wing|chain|card|dice|coin|badge|crown|mask|punk|room|drive|disc|spray/],
	smart: [/book|manual|policy|specs|lens|scope|computer|memory|drive|disc|data|code|key|map|compass|clock|watch|calculator|battery|magnet|antenna|gear|machine|device|case|notebook|herb|root|seed|moss|fossil/],
	tough: [/shield|armor|plate|rock|stone|metal|steel|iron|weight|brace|band|vest|helmet|bone|club|hammer|anchor|chain|spike|claw|fang|jaw|muscle|power|protector|guard|knuckle|punch|grip|ground|mountain/],
});
const THREE_POINT_VISUALS = /crown|diamond|pearl|crystal|prism|rainbow|star|moon|sun|gold|silver|scepter|sword|shield|armor|cloak|wing|flower|rose|gem|orb|relic|mask/;
const ONE_POINT_VISUALS = /mud|sludge|sticky|lagging|ringtarget|ironball|rockyhelmet|leftovers|blacksludge|toxicorb|flameorb|smoke|damp|shedshell|eject|roomservice|utilityumbrella/;
const VISUALLY_INELIGIBLE = new Set(['cellbattery', 'berryjuice']);

const excluded = (reason: RPGContestItemExclusionReason): RPGContestItemClassification => ({
	canScore: false, exclusionReason: reason, category: null, points: 0, scoringMode: 'none', balanceGroup: null,
});

function exclusionReason(item: RPGItemDefinition): RPGContestItemExclusionReason | null {
	const tags = new Set(item.tags || []);
	if (tags.has('berry')) return 'berry';
	if (tags.has('breeding')) return 'breeding';
	if (item.category !== 'held' && !tags.has('held')) return 'not-equippable';
	if (VISUALLY_INELIGIBLE.has(item.id)) return 'not-useful';
	return null;
}

function visualScore(item: RPGItemDefinition, category: RPGContestCategory): number {
	const text = `${item.id} ${item.name}`.toLowerCase();
	return VISUAL_HINTS[category].reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function visualPoints(item: RPGItemDefinition): 1 | 2 | 3 {
	const id = RPGItemRegistry.normalizeId(item.id);
	if (ONE_POINT_VISUALS.test(id)) return 1;
	if (THREE_POINT_VISUALS.test(id)) return 3;
	return 2;
}

function buildCatalog(): Map<string, RPGContestItemClassification> {
	const result = new Map<string, RPGContestItemClassification>();
	const regular: RPGItemDefinition[] = [];
	let hasMegaStones = false;
	for (const item of RPGItems.list()) {
		const reason = exclusionReason(item);
		if (reason) {
			result.set(item.id, excluded(reason));
		} else if (item.tags?.includes('megastone')) {
			hasMegaStones = true;
			result.set(item.id, {
				canScore: true, exclusionReason: null, category: 'tough', points: 2,
				scoringMode: 'mega-activation', balanceGroup: 'mega-stones',
			});
		} else {
			regular.push(item);
		}
	}
	// As Mega Stones contam como uma única unidade de Força no balanceamento.
	const weightedTotal = regular.length + (hasMegaStones ? 1 : 0);
	const targets = new Map<RPGContestCategory, number>();
	for (const [index, category] of CATEGORIES.entries()) {
		targets.set(category, Math.floor(weightedTotal / CATEGORIES.length) +
		(index < weightedTotal % CATEGORIES.length ? 1 : 0));
	}
	const used = new Map<RPGContestCategory, number>(CATEGORIES.map(category =>
		[category, category === 'tough' && hasMegaStones ? 1 : 0]
	));
	regular.sort((left, right) => {
		const confidence = (item: RPGItemDefinition) => {
			const scores = CATEGORIES.map(category => visualScore(item, category)).sort((a, b) => b - a);
			return scores[0] - scores[1];
		};
		return confidence(right) - confidence(left) || left.id.localeCompare(right.id);
	});
	for (const item of regular) {
		const available = CATEGORIES.filter(category => used.get(category)! < targets.get(category)!);
		const category = available.sort((left, right) =>
			visualScore(item, right) - visualScore(item, left) ||
			(used.get(left)! / targets.get(left)!) - (used.get(right)! / targets.get(right)!) ||
			CATEGORIES.indexOf(left) - CATEGORIES.indexOf(right)
		)[0];
		used.set(category, used.get(category)! + 1);
		result.set(item.id, {
			canScore: true, exclusionReason: null, category, points: visualPoints(item),
			scoringMode: 'passive', balanceGroup: null,
		});
	}
	return result;
}

const CONTEST_ITEM_CATALOG = buildCatalog();

/** Classifica o item por seu uso visual no palco, independentemente do efeito em batalha. */
export function classifyRPGContestItem(item: RPGItemDefinition): RPGContestItemClassification {
	const reason = exclusionReason(item);
	if (reason) return excluded(reason);
	return structuredClone(CONTEST_ITEM_CATALOG.get(item.id) || excluded('unclassified'));
}

export function getRPGContestItemClassification(itemName: string): RPGContestItemClassification {
	const item = RPGItems.get(itemName);
	return item ? classifyRPGContestItem(item) : excluded('unclassified');
}
