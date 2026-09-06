/**
 * Adaptação do Team Builder às restrições persistentes do RPG.
 *
 * Expõe catálogos de escolhas válidas e aplica edições autorizadas sem permitir
 * que a interface altere campos bloqueados, Pokémon em treinamento ou recursos
 * que não pertencem ao personagem.
 */
import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import {
	getExperienceForLevel,
	getSpeciesExperience,
	RPGBagSystem,
	RPGInventorySystem,
	RPGItems,
	type RPGInventoryState,
} from '../../sim/rpg-showdown';
import { getRPGItemIconPath } from './item-icons';
import { getRPGAbilityDescriptionPTBR } from './ability-descriptions-pt-br';
import { RPGBagManagement } from './bag-management';
import { getRPGMoveMetadata, type RPGMoveMetadata } from './battle-move-analysis';
import {
	RPGBoxManagement,
	type RPGBoxCharacterData,
	type RPGBoxPokemonView,
	type RPGTeamBuilderStat,
} from './box-management';

export const RPG_TEAM_BUILDER_MANAGEMENT_VERSION = 2;
export const RPG_EV_TRAINING_COST = 500;
export const RPG_EV_TRAINING_AMOUNT = 4;
export const RPG_EV_TRAINING_DURATION_MS = 30 * 60 * 1000;

export const RPG_IV_VITAMINS: Readonly<Record<string, RPGTeamBuilderStat>> = Object.freeze({
	hpup: 'hp',
	protein: 'atk',
	iron: 'def',
	calcium: 'spa',
	zinc: 'spd',
	carbos: 'spe',
});

export interface RPGTeamBuilderCharacterData extends RPGBoxCharacterData {
	money: number;
	inventory: RPGInventoryState;
	pageAccess?: { bag: boolean, box: boolean, training: boolean };
}

export interface RPGTeamBuilderMoveChoice extends RPGMoveMetadata {
	id: string;
	name: string;
	type: string;
	category: string;
	pp: number;
	source: 'current' | 'level' | 'tm' | 'master';
	current?: boolean;
	learnedAt?: number;
	tmCompatible?: boolean;
	tmItemId?: string;
	tmQuantity?: number;
}

export interface RPGTeamBuilderItemChoice {
	id: string;
	name: string;
	quantity: number;
	icon: string | null;
	sprite: number | null;
	description: string;
	favorite: boolean;
	berry: boolean;
	megaStone: boolean;
}

export interface RPGTeamBuilderVitaminChoice extends RPGTeamBuilderItemChoice {
	stat: RPGTeamBuilderStat;
	amount: 2;
	usable: boolean;
}

export interface RPGTeamBuilderManagementView {
	version: number;
	ownerId: string;
	boxRevision: number;
	bagRevision: number;
	money: number;
	pokemon: RPGBoxPokemonView;
	readOnly: boolean;
	permissions: {
		master: boolean,
		nickname: boolean,
		moves: boolean,
		ability: boolean,
		species: boolean,
		gender: boolean,
		shiny: boolean,
		heldItem: boolean,
		itemFromBag: boolean,
		nature: boolean,
		evsDirect: boolean,
		ivsDirect: boolean,
		level: boolean,
		permanentState: boolean,
		forceEvolution: boolean,
		training: boolean,
	};
	abilities: {
		id: string, name: string, description: string, hidden: boolean, current: boolean,
	}[];
	natures: string[];
	nature: { name: string, plus?: RPGTeamBuilderStat, minus?: RPGTeamBuilderStat, label: string };
	stats: {
		id: RPGTeamBuilderStat, label: string, base: number, ev: number, iv: number, total: number,
		nature: 'raised' | 'lowered' | 'neutral',
	}[];
	moves: {
		current: RPGBoxPokemonView['moves'],
		choices: RPGTeamBuilderMoveChoice[],
		maximum: 4,
	};
	items: {
		current: RPGTeamBuilderItemChoice | null,
		choices: RPGTeamBuilderItemChoice[],
	};
	evs: {
		values: RPGBoxPokemonView['evs'],
		total: number,
		maximumPerStat: 252,
		maximumTotal: 508,
		training: {
			costPerStep: 500,
			evStep: 4,
			roleplayDurationPerStepMs: number,
			timed: boolean,
			cumulative: true,
			partyOnly: true,
			eligible: boolean,
		},
	};
	ivs: {
		values: RPGBoxPokemonView['ivs'],
		maximumPerStat: 31,
		vitamins: RPGTeamBuilderVitaminChoice[],
	};
	experience: {
		current: number,
		currentLevelMinimum?: number,
		nextLevel?: number,
	};
	permanentState: {
		hp: number,
		maxHP: number,
		status: string,
		pp: RPGBoxPokemonView['moves'],
		lastBattleAt?: number,
		training: string,
	};
	appearance: {
		nickname: string,
		favorite: boolean,
		favoriteMarker?: string,
	};
}

export class RPGTeamBuilderManagement {
	static view(
		character: RPGTeamBuilderCharacterData, pokemonId: string, master = false
	): RPGTeamBuilderManagementView {
		character.inventory = RPGInventorySystem.migrate(character.inventory);
		const pokemon = RPGBoxManagement.view(character).results.find(entry => entry.pokemonId === pokemonId);
		if (!pokemon) throw new Error('Unknown RPG Box Pokemon');
		const inParty = pokemon.location.destination === 'party';
		const set = RPGBoxManagement.pokemonSet(character, pokemonId);
		const dex = Dex.mod('gen9');
		const species = dex.species.get(set.species);
		const available = (itemId: string) => Math.max(
			0,
			RPGBagSystem.getRegularQuantity(character.inventory.bag, itemId) -
			RPGInventorySystem.getReservedQuantity(character.inventory, itemId)
		);
		const heldDefinitions = RPGItems.list().filter(item =>
			(item.category === 'held' || item.tags?.includes('held') === true) && available(item.id) > 0
		);
		const itemView = (item: ReturnType<typeof RPGItems.require>, quantity: number): RPGTeamBuilderItemChoice => ({
			id: item.id, name: item.name, quantity, icon: getRPGItemIconPath(item.id),
			sprite: Number.isInteger(dex.items.get(item.id).spritenum) ? dex.items.get(item.id).spritenum! : null,
			description: RPGBagManagement.description(item),
			favorite: character.inventory.bag.favorites.includes(item.id),
			berry: item.tags?.includes('berry') === true,
			megaStone: item.tags?.includes('megastone') === true,
		});
		const itemChoices = heldDefinitions.map(item => itemView(item, available(item.id)))
			.sort((left, right) => left.name.localeCompare(right.name));
		const currentItemDefinition = RPGItems.get(toID(pokemon.item || ''));
		const currentItem = currentItemDefinition &&
			(currentItemDefinition.category === 'held' || currentItemDefinition.tags?.includes('held') === true) ?
			itemView(currentItemDefinition, 0) : null;
		const moveChoices = this.moves(character, pokemon, master);
		const vitamins = Object.entries(RPG_IV_VITAMINS).map(([itemId, stat]) => {
			const item = RPGItems.require(itemId);
			const quantity = available(item.id);
			return {
				...itemView(item, quantity), stat, amount: 2 as const,
				usable: inParty && (pokemon.ivs[stat] ?? 0) < 31 && quantity > 0,
			};
		});
		const data = getSpeciesExperience(species.id);
		const levelForExperience = Math.min(100, pokemon.level);
		const currentLevelMinimum = data ?
			getExperienceForLevel(data.growthRate, levelForExperience) : undefined;
		const nextLevel = data && pokemon.level < 100 ?
			getExperienceForLevel(data.growthRate, pokemon.level + 1) : undefined;
		const evTotal = Object.values(pokemon.evs).reduce((sum, value) => sum + (value || 0), 0);
		const unavailable = !!pokemon.metadata.evTraining;
		const trainingAllowed = inParty && !unavailable && (master || character.pageAccess?.training !== false);
		const nature = dex.natures.get(pokemon.nature);
		const naturePlus = nature.plus as RPGTeamBuilderStat | undefined;
		const natureMinus = nature.minus as RPGTeamBuilderStat | undefined;
		const statLabels: Record<RPGTeamBuilderStat, string> = {
			hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Attack', spd: 'Sp. Defense', spe: 'Speed',
		};
		const stats = (Object.keys(statLabels) as RPGTeamBuilderStat[]).map(id => {
			const base = species.baseStats[id];
			const ev = pokemon.evs[id] ?? 0;
			const iv = pokemon.ivs[id] ?? 31;
			let total: number;
			if (id === 'hp') {
				total = species.id === 'shedinja' ? 1 :
					Math.floor((2 * base + iv + Math.floor(ev / 4)) * pokemon.level / 100) + pokemon.level + 10;
			} else {
				const neutral = Math.floor((2 * base + iv + Math.floor(ev / 4)) * pokemon.level / 100) + 5;
				total = Math.floor(neutral * (naturePlus === id ? 1.1 : natureMinus === id ? 0.9 : 1));
			}
			return {
				id, label: statLabels[id], base, ev, iv, total,
				nature: naturePlus === id ? 'raised' as const : natureMinus === id ? 'lowered' as const : 'neutral' as const,
			};
		});
		const natureLabel = nature.name + (naturePlus || natureMinus ?
			` (+${naturePlus ? statLabels[naturePlus] : '—'}, -${natureMinus ? statLabels[natureMinus] : '—'})` : ' (neutra)');
		const abilities = Object.entries(species.abilities).filter((entry): entry is [string, string] => !!entry[1])
			.map(([slot, name]) => {
				const ability = dex.abilities.get(name);
				return {
					id: ability.id, name: ability.name, description: getRPGAbilityDescriptionPTBR(ability.id),
					hidden: slot === 'H', current: ability.id === toID(pokemon.ability),
				};
			}).sort((left, right) => Number(right.current) - Number(left.current) || left.name.localeCompare(right.name));
		return {
			version: RPG_TEAM_BUILDER_MANAGEMENT_VERSION,
			ownerId: character.id,
			boxRevision: character.box.revision,
			bagRevision: character.inventory.bag.revision,
			money: character.money,
			pokemon,
			readOnly: !inParty || (unavailable && !master),
			permissions: {
				master,
				nickname: inParty && !master && !unavailable,
				moves: inParty && master,
				ability: inParty && master,
				species: false,
				gender: false,
				shiny: false,
				heldItem: false,
				itemFromBag: inParty && !unavailable,
				nature: false,
				evsDirect: inParty && master,
				ivsDirect: inParty && master,
				level: inParty && master,
				permanentState: inParty && master,
				forceEvolution: inParty && master,
				training: trainingAllowed,
			},
			abilities,
			natures: [pokemon.nature],
			nature: {
				name: nature.name,
				...(naturePlus ? { plus: naturePlus } : {}),
				...(natureMinus ? { minus: natureMinus } : {}),
				label: natureLabel,
			},
			stats,
			moves: { current: structuredClone(pokemon.moves), choices: moveChoices, maximum: 4 },
			items: { current: currentItem, choices: itemChoices },
			evs: {
				values: structuredClone(pokemon.evs), total: evTotal,
				maximumPerStat: 252, maximumTotal: 508,
				training: {
					costPerStep: RPG_EV_TRAINING_COST,
					evStep: RPG_EV_TRAINING_AMOUNT,
					roleplayDurationPerStepMs: RPG_EV_TRAINING_DURATION_MS,
					timed: true, cumulative: true, partyOnly: true,
					eligible: trainingAllowed && pokemon.location.destination === 'party' && !pokemon.fainted,
				},
			},
			ivs: { values: structuredClone(pokemon.ivs), maximumPerStat: 31, vitamins },
			experience: {
				current: pokemon.experience,
				...(currentLevelMinimum === undefined ? {} : { currentLevelMinimum }),
				...(nextLevel === undefined ? {} : { nextLevel }),
			},
			permanentState: {
				hp: pokemon.hp, maxHP: pokemon.maxHP, status: pokemon.status,
				pp: structuredClone(pokemon.moves),
				...(pokemon.metadata.lastBattleAt === undefined ? {} : {
					lastBattleAt: pokemon.metadata.lastBattleAt,
				}),
				training: pokemon.metadata.training,
			},
			appearance: {
				nickname: pokemon.name,
				favorite: pokemon.metadata.favorite,
				...(pokemon.metadata.favoriteMarker ? { favoriteMarker: pokemon.metadata.favoriteMarker } : {}),
			},
		};
	}

	private static moves(
		character: RPGTeamBuilderCharacterData, pokemon: RPGBoxPokemonView, master: boolean
	): RPGTeamBuilderMoveChoice[] {
		const dex = Dex.mod('gen9');
		const choices = new Map<string, RPGTeamBuilderMoveChoice>();
		const available = (itemId: string) => Math.max(
			0,
			RPGBagSystem.getRegularQuantity(character.inventory.bag, itemId) -
			RPGInventorySystem.getReservedQuantity(character.inventory, itemId)
		);
		const tmByMove = new Map<string, { id: string, quantity: number }>();
		for (const item of RPGItems.list('tm')) {
			const moveId = typeof item.effect?.move === 'string' ? toID(item.effect.move) : '';
			if (moveId) tmByMove.set(moveId, { id: item.id, quantity: available(item.id) });
		}
		const ensure = (moveId: string, source: RPGTeamBuilderMoveChoice['source']) => {
			const move = dex.moves.get(moveId);
			if (!move.exists || move.isNonstandard === 'CAP' || move.isNonstandard === 'Future') return;
			let choice = choices.get(move.id);
			if (!choice) {
				choice = {
					id: move.id, name: move.name, type: move.type, category: move.category,
					pp: move.pp || 1, source, ...getRPGMoveMetadata(move),
				};
				choices.set(move.id, choice);
			}
			return choice;
		};
		for (const move of pokemon.moves) {
			const choice = ensure(move.id, 'current');
			if (choice) choice.current = true;
		}
		const species = dex.species.get(pokemon.species);
		for (const learnsetData of dex.species.getFullLearnset(species.id)) {
			for (const [moveId, sources] of Object.entries(learnsetData.learnset)) {
				const levelSources = sources.flatMap(source => {
					const match = /^9L(\d+)/.exec(source);
					return match ? [Number(match[1])] : [];
				});
				if (levelSources.length) {
					const choice = ensure(moveId, 'level');
					if (choice) {
						choice.learnedAt = Math.min(choice.learnedAt ?? Number.MAX_SAFE_INTEGER, ...levelSources);
						if (!choice.current) choice.source = 'level';
					}
				}
				if (sources.some(source => source.startsWith('9M'))) {
					const choice = ensure(moveId, 'tm');
					if (choice) {
						choice.tmCompatible = true;
						const tm = tmByMove.get(choice.id);
						if (tm) {
							choice.tmItemId = tm.id;
							choice.tmQuantity = tm.quantity;
						}
						if (!choice.current && choice.learnedAt === undefined) choice.source = 'tm';
					}
				}
				if (master && sources.some(source => source.startsWith("9"))) ensure(moveId, 'master');
			}
		}
		return [...choices.values()].sort((left, right) =>
			Number(!!right.current) - Number(!!left.current) ||
			(left.learnedAt ?? Number.MAX_SAFE_INTEGER) - (right.learnedAt ?? Number.MAX_SAFE_INTEGER) ||
			left.name.localeCompare(right.name)
		);
	}
}
