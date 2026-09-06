/**
 * Casos de uso da Bag fora e dentro de batalha.
 *
 * Esta camada liga o inventário puro aos personagens e à Box, verificando alvo,
 * permissão, quantidade e contexto antes de persistir qualquer consumo ou troca
 * de item equipado.
 */
import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import {
	RPGBagSystem,
	RPGInventorySystem,
	RPGItems,
	type RPGBoxLocation,
	type RPGInventoryState,
	type RPGItemCategory,
	type RPGItemDefinition,
} from '../../sim/rpg-showdown';
import { RPGBoxManagement, type RPGBoxCharacterData } from './box-management';
import { getRPGItemIconPath } from './item-icons';
import { getRPGHeldItemDescriptionPTBR } from './item-descriptions-pt-br';

export const RPG_BAG_MANAGEMENT_VERSION = 1;
export type RPGManagedBagContext = 'world' | 'battle';
export type RPGManagedBagCategory = 'pokeballs' | 'medicines' | 'held-items' |
	'evolution-items' | 'tms' | 'fossils' | 'treasures' | 'favorites' | 'mission-items' |
	'mega-stones' | 'key-items' | 'battle-items';
export type RPGManagedBagAction = 'use' | 'equip' | 'remove' | 'teach' | 'favorite' | 'unfavorite' |
	'move-to-mission' | 'remove-from-mission' | 'edit-mission-note' | 'discard' | 'give';

export interface RPGManagedBagQuery {
	context?: RPGManagedBagContext;
	category?: RPGManagedBagCategory;
	search?: string;
	/** Bloqueia apenas ações de uso no inventário externo; a Bag do combate permanece independente. */
	itemUseLocked?: boolean;
	itemUseLockReason?: string;
}

export interface RPGManagedBagCategoryView {
	id: RPGManagedBagCategory;
	name: string;
	itemTypes: number;
	quantity: number;
}

export interface RPGManagedBagEquippedPokemon {
	pokemonId: string;
	name: string;
	species: string;
	shiny: boolean;
	location: RPGBoxLocation;
}

export interface RPGManagedBagItemView {
	id: string;
	name: string;
	quantity: number;
	category: RPGManagedBagCategory;
	registryCategory: RPGItemCategory;
	description: string;
	favorite: boolean;
	mission: boolean;
	missionNote?: string;
	loaded?: boolean;
	linkedEggId?: string;
	actions: RPGManagedBagAction[];
	equippedIn: RPGManagedBagEquippedPokemon[];
	icon: string | null;
	sprite: number | null;
	price?: RPGItemDefinition['price'];
	effect?: RPGItemDefinition['effect'];
	tags: string[];
}

export interface RPGManagedBagView {
	version: number;
	ownerId: string;
	money: number;
	context: RPGManagedBagContext;
	revision: number;
	tier?: string;
	capacity: ReturnType<typeof RPGBagSystem.getCapacity>;
	categories: RPGManagedBagCategoryView[];
	items: RPGManagedBagItemView[];
	search: string;
	selectedCategory?: RPGManagedBagCategory;
	itemUseLocked: boolean;
	itemUseLockReason?: string;
}

export interface RPGManagedBagPokemonTarget {
	pokemonId: string;
	name: string;
	species: string;
	shiny: boolean;
	location: RPGBoxLocation;
	hp: number;
	maxHP: number;
	status: string;
	eligible: boolean;
	compatibleMoves: { index: number, id: string, name: string, pp: number, maxPP: number }[];
}

export interface RPGManagedBagTargetsView {
	itemId: string;
	bagRevision: number;
	boxRevision: number;
	targets: RPGManagedBagPokemonTarget[];
}

export interface RPGManagedBagCharacterData extends RPGBoxCharacterData {
	money: number;
	inventory: RPGInventoryState;
}

const WORLD_CATEGORIES: readonly { id: RPGManagedBagCategory, name: string }[] = [
	{ id: 'favorites', name: 'Favoritos' },
	{ id: 'pokeballs', name: 'Poké Balls' },
	{ id: 'medicines', name: 'Medicamentos' },
	{ id: 'held-items', name: 'Held Items' },
	{ id: 'evolution-items', name: 'Itens de Evolução' },
	{ id: 'tms', name: 'TMs' },
	{ id: 'fossils', name: 'Fósseis' },
	{ id: 'treasures', name: 'Tesouros' },
	{ id: 'mega-stones', name: 'Mega Pedras' },
	{ id: 'key-items', name: 'Itens-chave' },
	{ id: 'mission-items', name: 'Itens de Missão' },
];
const BATTLE_CATEGORIES: readonly { id: RPGManagedBagCategory, name: string }[] = [
	{ id: 'pokeballs', name: 'Poké Balls' },
	{ id: 'medicines', name: 'Medicamentos' },
	{ id: 'battle-items', name: 'Battle Items' },
];

function isEquippableHeldItem(item: RPGItemDefinition): boolean {
	return item.category === 'held' || item.tags?.includes('held') === true;
}

export class RPGBagManagement {
	static view(character: RPGManagedBagCharacterData, query: RPGManagedBagQuery = {}): RPGManagedBagView {
		const inventory = RPGInventorySystem.migrate(character.inventory);
		const context = query.context || 'world';
		if (context !== 'world' && context !== 'battle') throw new Error('Invalid RPG Bag context');
		const definitions = context === 'battle' ? BATTLE_CATEGORIES : WORLD_CATEGORIES;
		const itemUseLocked = context === 'world' && query.itemUseLocked === true;
		const allowedCategories = new Set(definitions.map(entry => entry.id));
		if (query.category && !allowedCategories.has(query.category)) throw new Error('Invalid RPG Bag category');
		const box = RPGBoxManagement.view(character);
		const items = inventory.bag.items.flatMap(entry => {
			const definition = RPGItems.get(entry.itemId);
			const available = definition ? RPGInventorySystem.getAvailableQuantity(inventory, definition.id) : 0;
			if (!definition || available < 1) return [];
			const taggedMission = definition.tags?.includes('mission') === true;
			const missionQuantity = context === 'world' ?
				(taggedMission ? available : Math.min(available, RPGBagSystem.getMissionQuantity(inventory.bag, definition.id))) :
				0;
			const regularQuantity = taggedMission ? 0 : available - missionQuantity;
			const equippedIn = isEquippableHeldItem(definition) ? box.results.flatMap(pokemon =>
				toID(pokemon.item) === definition.id ? [{
					pokemonId: pokemon.pokemonId, name: pokemon.name, species: pokemon.species,
					shiny: pokemon.shiny,
					location: structuredClone(pokemon.location),
				}] : []
			) : [];
			const makeView = (quantity: number, mission: boolean): RPGManagedBagItemView => {
				const category = mission ? 'mission-items' : this.category(definition, context)!;
				const favorite = !mission && inventory.bag.favorites.includes(definition.id);
				return {
					id: definition.id, name: definition.name, quantity,
					category, registryCategory: definition.category,
					description: this.description(definition), favorite, mission,
					...(mission && inventory.bag.missionNotes[definition.id] ? {
						missionNote: inventory.bag.missionNotes[definition.id],
					} : {}),
					actions: this.actions(definition, context, favorite, mission, equippedIn.length > 0, itemUseLocked),
					equippedIn, icon: definition.source === 'custom' ? null : getRPGItemIconPath(definition.id),
					sprite: definition.source === 'custom' ? null : this.sprite(definition.id),
					...(definition.price ? { price: structuredClone(definition.price) } : {}),
					...(definition.effect ? { effect: structuredClone(definition.effect) } : {}),
					tags: [...(definition.tags || [])],
				};
			};
			if (context === 'battle') {
				const category = this.category(definition, context);
				if (!category || !allowedCategories.has(category) || !definition.usableInBattle || regularQuantity < 1) return [];
				return [makeView(regularQuantity, false)];
			}
			const result: RPGManagedBagItemView[] = [];
			const regularCategory = this.category(definition, context);
			if (regularQuantity > 0 && regularCategory && allowedCategories.has(regularCategory)) {
				result.push(makeView(regularQuantity, false));
			}
			if (missionQuantity > 0 && allowedCategories.has('mission-items')) {
				result.push(makeView(missionQuantity, true));
			}
			return result;
		});
		const search = typeof query.search === 'string' ? query.search.trim() : '';
		const searchId = toID(search);
		const visible = items.filter(item => {
			if (searchId && !toID(item.name).includes(searchId) && !item.id.includes(searchId)) return false;
			if (query.category === 'favorites') return item.favorite;
			return !query.category || item.category === query.category;
		}).sort((left, right) => left.name.localeCompare(right.name));
		const categories = definitions.map(category => {
			const categoryItems = category.id === 'favorites' ? items.filter(item => item.favorite) :
				items.filter(item => item.category === category.id);
			return {
				...category, itemTypes: categoryItems.length,
				quantity: categoryItems.reduce((total, item) => total + item.quantity, 0),
			};
		});
		return {
			version: RPG_BAG_MANAGEMENT_VERSION, ownerId: character.id, money: character.money,
			context, revision: inventory.bag.revision, tier: RPGBagSystem.getTier(inventory.bag),
			capacity: RPGBagSystem.getCapacity(inventory.bag), categories,
			items: visible, search, itemUseLocked,
			...(query.itemUseLockReason ? { itemUseLockReason: query.itemUseLockReason } : {}),
			...(query.category ? { selectedCategory: query.category } : {}),
		};
	}

	static targets(character: RPGManagedBagCharacterData, itemId: string): RPGManagedBagTargetsView {
		const item = RPGItems.require(itemId);
		const effect = item.effect;
		const box = RPGBoxManagement.view(character);
		const targets = box.results.filter(pokemon =>
			pokemon.location.destination === 'party' && !pokemon.metadata.evTraining
		).map(pokemon => {
			const compatibleMoves = pokemon.moves.flatMap((move, index) =>
				move.pp < move.maxPP ? [{ index, id: move.id, name: move.name, pp: move.pp, maxPP: move.maxPP }] : []
			);
			let eligible = false;
			if (isEquippableHeldItem(item)) eligible = true;
			else if (item.category === 'tm' && typeof effect?.move === 'string') {
				eligible = !!RPGBoxManagement.technicalMachineTarget(character, pokemon.pokemonId, effect.move);
			} else if (item.category === 'evolution') {
				eligible = RPGBoxManagement.itemEvolutionOptions(character, pokemon.pokemonId, item.id).length > 0;
			} else if (effect?.type === 'revive') eligible = pokemon.fainted;
			else if (!pokemon.fainted && effect?.type === 'heal-hp') {
				eligible = pokemon.hp < pokemon.maxHP || (!!pokemon.status && effect.cureStatus === true);
			} else if (!pokemon.fainted && effect?.type === 'cure-status') {
				const statuses = Array.isArray(effect.statuses) ? effect.statuses : [];
				eligible = !!pokemon.status && (!statuses.length || statuses.includes(pokemon.status));
			} else if (!pokemon.fainted && effect?.type === 'restore-pp') {
				eligible = compatibleMoves.length > 0;
			}
			return {
				pokemonId: pokemon.pokemonId, name: pokemon.name, species: pokemon.species, shiny: !!pokemon.shiny,
				location: structuredClone(pokemon.location), hp: pokemon.hp, maxHP: pokemon.maxHP,
				status: pokemon.status, eligible, compatibleMoves,
			};
		});
		return { itemId: item.id, bagRevision: character.inventory.bag.revision, boxRevision: box.revision, targets };
	}

	static setFavorite(
		character: RPGManagedBagCharacterData, itemId: string, favorite: boolean, expectedRevision: number
	): void {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		const item = RPGItems.require(itemId);
		if (favorite && (item.tags?.includes('mission') ||
			RPGBagSystem.getMissionQuantity(character.inventory.bag, item.id) > 0)) {
			throw new Error('Itens de Missão não podem ser favoritados');
		}
		character.inventory.bag = RPGBagSystem.setFavorite(
			character.inventory.bag, itemId, favorite, expectedRevision
		);
	}

	static setMissionItem(
		character: RPGManagedBagCharacterData, itemId: string, mission: boolean,
		expectedRevision: number, quantity?: number, note?: string
	): void {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		character.inventory.bag = RPGBagSystem.setMissionItem(
			character.inventory.bag, itemId, mission, expectedRevision, RPGItems, quantity, note
		);
	}

	static setMissionNote(
		character: RPGManagedBagCharacterData, itemId: string, note: string, expectedRevision: number
	): void {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		character.inventory.bag = RPGBagSystem.setMissionNote(
			character.inventory.bag, itemId, note, expectedRevision
		);
	}

	static updateQuantity(
		character: RPGManagedBagCharacterData, itemId: string, quantity: number, expectedRevision: number,
		operation: 'add' | 'remove' | 'set' = 'set'
	): void {
		if (!['add', 'remove', 'set'].includes(operation)) throw new Error('Invalid RPG Bag quantity operation');
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		character.inventory.bag = RPGBagSystem.apply(character.inventory.bag, [{
			type: operation, itemId, quantity,
		}], expectedRevision).bag;
	}

	static equipHeldItem(
		character: RPGManagedBagCharacterData, pokemonId: string, itemId: string,
		expectedBagRevision: number, expectedBoxRevision: number
	): { pokemonId: string, pokemonName: string, itemId: string, previousItemId: string } {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		const item = RPGItems.require(itemId);
		if (!isEquippableHeldItem(item)) throw new Error('Only a held item can be equipped');
		const target = RPGBoxManagement.heldItem(character, pokemonId);
		if (target.itemId === item.id) throw new Error('This Pokémon is already holding this item');
		const operations: ({ type: 'remove' | 'add', itemId: string, quantity: number })[] = [
			{ type: 'remove', itemId: item.id, quantity: 1 },
		];
		if (target.itemId) {
			const previous = RPGItems.require(target.itemId);
			if (!isEquippableHeldItem(previous)) throw new Error('The previous Pokémon item is not a registered held item');
			operations.push({ type: 'add', itemId: previous.id, quantity: 1 });
		}
		character.inventory.bag = RPGBagSystem.apply(
			character.inventory.bag, operations, expectedBagRevision
		).bag;
		return RPGBoxManagement.setHeldItem(character, pokemonId, item.id, expectedBoxRevision);
	}

	static removeHeldItem(
		character: RPGManagedBagCharacterData, pokemonId: string,
		expectedBagRevision: number, expectedBoxRevision: number
	): { pokemonId: string, pokemonName: string, itemId: string, previousItemId: string } {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		const target = RPGBoxManagement.heldItem(character, pokemonId);
		if (!target.itemId) throw new Error('This Pokémon is not holding an item');
		const item = RPGItems.require(target.itemId);
		if (!isEquippableHeldItem(item)) throw new Error('The Pokémon item is not a registered held item');
		character.inventory.bag = RPGBagSystem.add(
			character.inventory.bag, item.id, 1, expectedBagRevision
		).bag;
		return RPGBoxManagement.setHeldItem(character, pokemonId, undefined, expectedBoxRevision);
	}

	private static category(
		item: RPGItemDefinition, context: RPGManagedBagContext
	): RPGManagedBagCategory | undefined {
		if (item.category === 'ball') return 'pokeballs';
		if (['healing', 'status', 'pp', 'revive'].includes(item.category)) return 'medicines';
		if (item.category === 'battle') return context === 'battle' ? 'battle-items' : 'treasures';
		if (context === 'battle') return;
		if (item.category === 'tm') return 'tms';
		if (item.category === 'evolution') return 'evolution-items';
		if (item.category === 'held') return item.tags?.includes('megastone') ? 'mega-stones' : 'held-items';
		if (item.category === 'key') return 'key-items';
		if (item.tags?.includes('fossil') || item.effect?.type === 'revive-fossil') return 'fossils';
		return 'treasures';
	}

	private static actions(
		item: RPGItemDefinition, context: RPGManagedBagContext, favorite: boolean, mission: boolean,
		equipped: boolean, itemUseLocked: boolean
	): RPGManagedBagAction[] {
		if (context === 'battle') return item.usableInBattle ? ['use'] : [];
		const actions: RPGManagedBagAction[] = [];
		if (!itemUseLocked) {
			const effectType = typeof item.effect?.type === 'string' ? item.effect.type : '';
			if (['heal-hp', 'revive', 'cure-status', 'restore-pp'].includes(effectType)) actions.push('use');
			else if (isEquippableHeldItem(item)) {
				actions.push('equip');
				if (equipped) actions.push('remove');
			} else if (item.category === 'tm' && effectType === 'teach-move') actions.push('teach');
			else if (item.category === 'evolution' && effectType === 'evolve') actions.push('use');
		}
		const missionItem = mission || item.tags?.includes('mission');
		if (missionItem) actions.push('edit-mission-note');
		if (!missionItem) {
			actions.push(favorite ? 'unfavorite' : 'favorite');
			actions.push('discard', 'give', 'move-to-mission');
		} else if (!item.tags?.includes('mission')) {
			actions.push('remove-from-mission');
		}
		return actions;
	}

	static description(item: RPGItemDefinition): string {
		if (isEquippableHeldItem(item)) {
			const heldDescription = getRPGHeldItemDescriptionPTBR(item.id);
			if (heldDescription) return heldDescription;
		}
		const translated: Readonly<Record<string, string>> = {
			leftovers: 'Ao final de cada turno, recupera 1/16 do HP máximo do Pokémon.',
			sitrusberry: 'Quando o HP cai para metade ou menos, é consumida e recupera 1/4 do HP máximo.',
			charizarditex: 'Permite que Charizard Mega Evolua para Mega Charizard X durante a batalha.',
			charizarditey: 'Permite que Charizard Mega Evolua para Mega Charizard Y durante a batalha.',
			venusaurite: 'Permite que Venusaur Mega Evolua durante a batalha.',
		};
		if (translated[item.id]) return translated[item.id];
		const effect = item.effect;
		if (typeof effect?.description === 'string' && effect.description.trim()) return effect.description.trim();
		if (effect?.type === 'heal-hp') return effect.full ? 'Recupera todo o HP de um Pokémon.' :
			`Recupera ${String(effect.amount)} HP de um Pokémon.`;
		if (effect?.type === 'revive') return effect.full ? 'Revive um Pokémon com todo o HP.' :
			'Revive um Pokémon desmaiado e recupera parte do HP.';
		if (effect?.type === 'cure-status') return 'Cura uma condição de status compatível.';
		if (effect?.type === 'restore-pp') return 'Recupera PP de movimentos compatíveis.';
		if (effect?.type === 'raise-iv') {
			const stats: Readonly<Record<string, string>> = {
				hp: 'HP', atk: 'Attack', def: 'Defense',
				spa: 'Special Attack', spd: 'Special Defense', spe: 'Speed',
			};
			return 'Aumenta em ' + String(effect.amount) + ' o IV de ' +
				(stats[String(effect.stat)] || String(effect.stat)) + ', at\u00e9 31.';
		}
		if (effect?.type === 'capture') return 'Usada para tentar capturar um Pokémon selvagem.';
		if (effect?.type === 'evolve') return 'Evolui um Pokémon compatível quando usada fora de combate.';
		if (effect?.type === 'teach-move' && typeof effect.move === 'string') {
			return `Ensina ${Dex.mod('gen9').moves.get(effect.move).name} a um Pokémon compatível.`;
		}
		if (item.tags?.includes('fossil')) return 'Fóssil que pode ser restaurado ou vendido.';
		const showdown = Dex.mod('gen9').items.get(item.id);
		return showdown.desc || showdown.shortDesc || 'Item do RPG.';
	}

	private static sprite(itemId: string): number | null {
		const sprite = Dex.items.get(itemId).spritenum;
		return Number.isInteger(sprite) ? sprite! : null;
	}
}
