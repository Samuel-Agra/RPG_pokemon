import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import { RPGItems } from '../../sim/rpg-showdown';

/**
 * Sprites originais do RPG. Itens que já existem no Showdown continuam usando
 * a folha externa; esta lista cobre somente as artes locais necessárias.
 */
const ORIGINAL_RPG_ITEM_ICONS = new Set([
	'potion', 'superpotion', 'hyperpotion', 'maxpotion', 'fullrestore',
	'antidote', 'burnheal', 'iceheal', 'awakening', 'paralyzeheal',
	'fullheal', 'ether', 'maxether', 'elixir', 'maxelixir',
	'revive', 'maxrevive', 'revivalherb', 'sacredash', 'blackaugurite',
	'hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos',
	'tinymushroom', 'bigmushroom', 'balmmushroom',
	'pearl', 'bigpearl', 'pearlstring',
	'stardust', 'starpiece', 'cometshard', 'nugget',
	'tinybambooshoot', 'bigbambooshoot', 'abilitycapsule', 'abilitypatch',
	'portableincubator', 'everstone',
]);

const RPG_ITEM_ICON_VERSION = '20260828-1';

const RPG_TM_ICON_TYPES = new Set([
	'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
	'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]);

export function getRPGItemIconPath(item: string): string | null {
	const id = toID(item);
	if (ORIGINAL_RPG_ITEM_ICONS.has(id)) return `./assets/item-icons/${id}.png?v=${RPG_ITEM_ICON_VERSION}`;
	const definition = RPGItems.get(id);
	if (definition?.tags?.includes('contestterastalization')) {
		const teraType = toID(String(definition.effect?.teraType || ''));
		if (RPG_TM_ICON_TYPES.has(teraType)) {
			return `./assets/item-icons/tera-${teraType}.png?v=${RPG_ITEM_ICON_VERSION}`;
		}
	}
	if (/^tm\d{3}$/.test(id)) {
		const moveId = typeof definition?.effect?.move === 'string' ? toID(definition.effect.move) : '';
		const type = moveId ? toID(Dex.mod('gen9').moves.get(moveId).type) : '';
		if (RPG_TM_ICON_TYPES.has(type)) return `./assets/item-icons/tm-${type}.png?v=${RPG_ITEM_ICON_VERSION}`;
	}
	return null;
}
