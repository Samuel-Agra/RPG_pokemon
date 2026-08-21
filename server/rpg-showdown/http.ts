import type * as http from 'node:http';

import { Dex } from '../../sim/dex';
import { getRPGMoveMetadata } from './battle-move-analysis';
import { RPGItems } from '../../sim/rpg-showdown';

import {
	createRPGLoginServiceFromConfig,
	type RPGCharacterGender,
	type RPGCreateCharacterRequest,
	type RPGLoginService,
	type RPGUpdateBattleSessionRequest,
} from './index';
import { getRPGBattlePokemonCatalog } from './pokemon-catalog';
import { RPGBattleRuntimeManager, type RPGBattleRuntimeAction } from './battle-runtime';
import { getRPGBattleSceneCatalog } from './battle-scene';
import { getRPGItemIconPath } from './item-icons';

const MAX_BODY_SIZE = 64 * 1024;

export class RPGHttpServer {
	private service?: RPGLoginService;
	private readonly battleRuntimes = new RPGBattleRuntimeManager();

	constructor(service?: RPGLoginService) {
		this.service = service;
	}

	handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const url = new URL(req.url || '/', 'http://localhost');
		if (!url.pathname.startsWith('/api/rpg/')) return false;
		void this.route(req, res, url).catch(error => this.error(res, error));
		return true;
	}

	private get login(): RPGLoginService {
		this.service ||= createRPGLoginServiceFromConfig();
		return this.service;
	}

	private async route(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
		const method = req.method || 'GET';
		if (method === 'OPTIONS') {
			res.writeHead(204, this.headers());
			res.end();
			return;
		}

		if (method === 'GET' && url.pathname === '/api/rpg/characters') {
			this.json(res, 200, { characters: this.login.listSelectableCharacters() });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/characters') {
			const body = await this.body(req);
			const character = this.login.createCharacter(this.characterRequest(body));
			this.json(res, 201, { character });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/session/master') {
			const body = await this.body(req);
			this.json(res, 200, { session: this.login.loginMaster(this.string(body.code)) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/session/player') {
			const body = await this.body(req);
			const session = this.login.loginPlayer(this.string(body.characterId), this.string(body.password));
			this.json(res, 200, { session });
			return;
		}
		if (url.pathname === '/api/rpg/session') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { session: this.login.getSession(token) });
				return;
			}
			if (method === 'DELETE') {
				this.login.logout(token);
				this.json(res, 200, { ok: true });
				return;
			}
		}
		if (url.pathname === '/api/rpg/session/view-as') {
			const token = this.token(req);
			if (method === 'POST') {
				const body = await this.body(req);
				const session = this.login.viewAsPlayer(token, this.string(body.characterId));
				this.json(res, 200, { session });
				return;
			}
			if (method === 'DELETE') {
				this.json(res, 200, { session: this.login.exitPlayerView(token) });
				return;
			}
		}
		if (method === 'GET' && url.pathname === '/api/rpg/character') {
			const characterId = url.searchParams.get('id') || undefined;
			this.json(res, 200, { character: this.login.getCharacter(this.token(req), characterId) });
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/character/team') {
			const body = await this.body(req);
			const team = Array.isArray(body.team) ? body.team as unknown as import('../../sim/teams').PokemonSet[] : [];
			const character = this.login.replaceCharacterTeam(
				this.token(req), this.string(body.characterId), team
			);
			this.json(res, 200, { character });
			return;
		} if (method === 'POST' && url.pathname === '/api/rpg/character/delete-challenge') {
			const challenge = this.login.createCharacterDeletionChallenge(this.token(req));
			this.json(res, 200, { challenge });
			return;
		}
		if (method === 'DELETE' && url.pathname === '/api/rpg/character') {
			const body = await this.body(req);
			const result = this.login.deleteViewedCharacter(
				this.token(req), this.string(body.challengeId), this.string(body.confirmation)
			);
			this.json(res, 200, { result });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/campaign/time/advance') {
			const body = await this.body(req);
			this.json(res, 200, { time: this.login.advanceCampaignTime(this.token(req), Number(body.hours)) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/characters/all') {
			this.json(res, 200, { characters: this.login.listAllCharacters(this.token(req)) });
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/characters/page-access') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.setCharacterPageAccess(
				this.token(req), this.string(body.characterId),
				this.string(body.page) as 'bag' | 'box' | 'training' | 'center' | 'fossils' | 'nursery', body.allowed === true
			) });
			return;
		}

		if (method === 'GET' && url.pathname === '/api/rpg/pokemon-center') {
			this.json(res, 200, { center: this.login.getPokemonCenter(
				this.token(req), url.searchParams.get('characterId') || undefined
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/pokemon-center/recover') {
			const body = await this.body(req);
			this.json(res, 200, this.login.usePokemonCenter(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.action) as 'team' | 'heal' | 'revive',
				typeof body.pokemonId === 'string' ? body.pokemonId : undefined,
				Number(body.expectedRevision)
			));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/bag') {
			this.json(res, 200, { bag: this.login.getBag(
				this.token(req), url.searchParams.get('characterId') || undefined, {
					context: (url.searchParams.get('context') || undefined) as import('./bag-management').RPGManagedBagContext,
					category: (url.searchParams.get('category') || undefined) as import('./bag-management').RPGManagedBagCategory,
					search: url.searchParams.get('search') || undefined,
				}
			) });
			return;
		}
		const bagItemMatch = /^\/api\/rpg\/bag\/items\/([^/]+)$/.exec(url.pathname);
		if (method === 'GET' && bagItemMatch) {
			this.json(res, 200, { item: this.login.getBagItem(
				this.token(req), url.searchParams.get('characterId') || undefined,
				decodeURIComponent(bagItemMatch[1]),
				(url.searchParams.get('context') || 'world') as import('./bag-management').RPGManagedBagContext
			) });
			return;
		}
		const transferTargetsMatch = /^\/api\/rpg\/bag\/items\/([^/]+)\/transfer-targets$/.exec(url.pathname);
		if (method === 'GET' && transferTargetsMatch) {
			this.json(res, 200, { transfer: this.login.getBagTransferTargets(
				this.token(req), url.searchParams.get('characterId') || undefined,
				decodeURIComponent(transferTargetsMatch[1])
			) });
			return;
		}
		const bagTargetsMatch = /^\/api\/rpg\/bag\/items\/([^/]+)\/targets$/.exec(url.pathname);
		if (method === 'GET' && bagTargetsMatch) {
			this.json(res, 200, { targets: this.login.getBagItemTargets(
				this.token(req), url.searchParams.get('characterId') || undefined,
				decodeURIComponent(bagTargetsMatch[1])
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/favorite') {
			const body = await this.body(req);
			this.json(res, 200, { bag: this.login.setBagItemFavorite(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId), body.favorite === true, Number(body.expectedRevision)
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/mission') {
			const body = await this.body(req);
			this.json(res, 200, { bag: this.login.setBagItemMission(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId), body.mission === true, Number(body.expectedRevision),
				body.quantity === undefined ? undefined : Number(body.quantity),
				typeof body.note === 'string' ? body.note : undefined
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/mission-note') {
			const body = await this.body(req);
			this.json(res, 200, { bag: this.login.setBagItemMissionNote(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId), this.string(body.note), Number(body.expectedRevision)
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/discard') {
			const body = await this.body(req);
			this.json(res, 200, { bag: this.login.discardBagItem(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId), Number(body.quantity), Number(body.expectedRevision)
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/transfer') {
			const body = await this.body(req);
			this.json(res, 200, this.login.transferBagItem(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.targetCharacterId), this.string(body.itemId), Number(body.quantity),
				Number(body.expectedSenderRevision), Number(body.expectedTargetRevision)
			));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/master/complete-mission') {
			const body = await this.body(req);
			const reward = body.reward && typeof body.reward === 'object' ? body.reward as Record<string, unknown> : {};
			this.json(res, 200, this.login.completeMissionItem(
				this.token(req), this.string(body.characterId), this.string(body.itemId),
				Number(body.expectedRevision),
				reward.type === 'item' ? {
					type: 'item', itemId: this.string(reward.itemId), quantity: Number(reward.quantity),
				} : { type: 'pokecoin', amount: Number(reward.amount) }
			));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/equip') {
			const body = await this.body(req);
			this.json(res, 200, this.login.equipBagHeldItem(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.pokemonId), this.string(body.itemId),
				Number(body.expectedBagRevision), Number(body.expectedBoxRevision)
			));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/remove-held') {
			const body = await this.body(req);
			this.json(res, 200, this.login.removeBagHeldItem(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.pokemonId), Number(body.expectedBagRevision), Number(body.expectedBoxRevision)
			));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/master/quantity') {
			const body = await this.body(req);
			this.json(res, 200, { bag: this.login.masterSetBagItemQuantity(
				this.token(req), this.string(body.characterId), this.string(body.itemId),
				Number(body.quantity), Number(body.expectedRevision),
				(body.operation || 'set') as 'add' | 'remove' | 'set'
			) });
			return;
		}

		if (method === 'GET' && url.pathname === '/api/rpg/bag/master/catalog') {
			this.json(res, 200, { items: this.login.listBagItemCatalog(
				this.token(req), url.searchParams.get('search') || ''
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/master/items') {
			const body = await this.body(req);
			this.json(res, 201, { item: this.login.createCustomBagItem(
				this.token(req), body as unknown as Omit<import('../../sim/rpg-showdown').RPGItemDefinition, 'source'>
			) });
			return;
		}

		if (method === 'GET' && url.pathname === '/api/rpg/box') {
			const boxIndexText = url.searchParams.get('boxIndex');
			const boxIndex = boxIndexText === null ? undefined : Number(boxIndexText);
			this.json(res, 200, {
				box: this.login.getBox(this.token(req), url.searchParams.get('characterId') || undefined, {
					search: url.searchParams.get('search') || undefined,
					type: url.searchParams.get('type') || undefined,
					status: url.searchParams.get('status') || undefined,
					boxIndex,
				}),
			});
			return;
		}
		const boxNameMatch = /^\/api\/rpg\/box\/boxes\/(\d+)$/.exec(url.pathname);
		if (method === 'PATCH' && boxNameMatch) {
			const body = await this.body(req);
			this.json(res, 200, {
				box: this.login.renameCharacterBox(
					this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
					Number(boxNameMatch[1]), this.string(body.name), Number(body.expectedRevision)
				),
			});
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/move') {
			const body = await this.body(req);
			const destination = body.destination as import('../../sim/rpg-showdown').RPGBoxLocation;
			this.json(res, 200, {
				box: this.login.moveBoxPokemon(
					this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined, {
						pokemonId: this.string(body.pokemonId),
						destination,
						expectedRevision: Number(body.expectedRevision),
					}
				),
			});
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/evolution-targets') {
			const body = await this.body(req);
			this.json(res, 200, this.login.getEvolutionItemTargets(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId)
			));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/tm-targets') {
			const body = await this.body(req);
			this.json(res, 200, this.login.getTechnicalMachineTargets(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.itemId)
			));
			return;
		}

		const teamBuilderMatch = /^\/api\/rpg\/team-builder\/([^/]+)(?:\/(train-ev|use-vitamin|reorder-moves))?$/.exec(
			url.pathname
		);
		if (teamBuilderMatch) {
			const pokemonId = decodeURIComponent(teamBuilderMatch[1]);
			const action = teamBuilderMatch[2];
			if (method === 'GET' && !action) {
				this.json(res, 200, { teamBuilder: this.login.getPokemonTeamBuilder(
					this.token(req), url.searchParams.get('characterId') || undefined, pokemonId
				) });
				return;
			}
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			if (method === 'POST' && !action) {
				this.login.editBoxPokemonWithTeamBuilder(
					this.token(req), characterId, pokemonId,
					body.pokemon as import('../../sim/teams').PokemonSet,
					Number(body.expectedRevision)
				);
				this.json(res, 200, { teamBuilder: this.login.getPokemonTeamBuilder(
					this.token(req), characterId, pokemonId
				) });
				return;
			}
			if (method === 'POST' && action === 'train-ev') {
				if (body.evs && typeof body.evs === 'object') {
					this.json(res, 200, this.login.trainPokemonEVDistribution(
						this.token(req), characterId, pokemonId,
						body.evs as Record<import('./box-management').RPGTeamBuilderStat, number>,
						Number(body.expectedRevision)
					));
				} else {
					this.json(res, 200, this.login.trainPokemonEVs(
						this.token(req), characterId, pokemonId,
						this.string(body.fromStat) as import('./box-management').RPGTeamBuilderStat,
						this.string(body.toStat) as import('./box-management').RPGTeamBuilderStat,
						Number(body.amount), Number(body.expectedRevision)
					));
				}
				return;
			}
			if (method === 'POST' && action === 'use-vitamin') {
				this.json(res, 200, this.login.usePokemonIVVitamin(
					this.token(req), characterId, pokemonId, this.string(body.itemId),
					this.string(body.actionId), Number(body.expectedBoxRevision),
					Number(body.expectedBagRevision)
				));
				return;
			}
			if (method === 'POST' && action === 'reorder-moves') {
				this.json(res, 200, { teamBuilder: this.login.reorderPokemonMoves(
					this.token(req), characterId, pokemonId,
					Number(body.fromSlot), Number(body.toSlot), Number(body.expectedRevision)
				) });
				return;
			}
		}

		const boxPokemonMatch = /^\/api\/rpg\/box\/pokemon\/([^/]+)(?:\/(metadata|center|healing-items|use-healing-item|use-evolution-item|use-tm|release-challenge|team-builder))?$/.exec(
			url.pathname
		);
		if (boxPokemonMatch) {
			const pokemonId = decodeURIComponent(boxPokemonMatch[1]);
			const action = boxPokemonMatch[2];
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			if (method === 'POST' && action === 'healing-items') {
				this.json(res, 200, this.login.getBoxHealingItems(
					this.token(req), characterId, pokemonId
				));
				return;
			}
			if (method === 'POST' && action === 'use-healing-item') {
				this.json(res, 200, this.login.useBoxHealingItem(
					this.token(req), characterId, pokemonId, this.string(body.itemId),
					this.string(body.actionId), Number(body.expectedBoxRevision),
					Number(body.expectedBagRevision),
					typeof body.move === 'number' ? body.move : undefined
				));
				return;
			}
			if (method === 'POST' && action === 'use-evolution-item') {
				this.json(res, 200, this.login.useEvolutionItem(
					this.token(req), characterId, pokemonId, this.string(body.itemId),
					this.string(body.toSpecies), this.string(body.actionId),
					Number(body.expectedBoxRevision), Number(body.expectedBagRevision)
				));
				return;
			}
			if (method === 'POST' && action === 'use-tm') {
				this.json(res, 200, this.login.useTechnicalMachine(
					this.token(req), characterId, pokemonId, this.string(body.itemId),
					typeof body.forgottenMoveId === 'string' ? body.forgottenMoveId : undefined,
					this.string(body.actionId), Number(body.expectedBoxRevision),
					Number(body.expectedBagRevision)
				));
				return;
			}
			if (method === 'POST' && action === 'metadata') {
				this.json(res, 200, {
					box: this.login.updateBoxPokemonMetadata(
						this.token(req), characterId, pokemonId,
						(body.metadata || {}) as import('./box-management').RPGBoxPokemonMetadata,
						Number(body.expectedRevision)
					),
				});
				return;
			}
			if (method === 'POST' && action === 'center') {
				this.json(res, 200, {
					box: this.login.healBoxPokemonAtCenter(
						this.token(req), characterId, pokemonId, Number(body.expectedRevision)
					),
				});
				return;
			}
			if (method === 'POST' && action === 'team-builder') {
				this.json(res, 200, {
					box: this.login.editBoxPokemonWithTeamBuilder(
						this.token(req), characterId, pokemonId,
						body.pokemon as import('../../sim/teams').PokemonSet,
						Number(body.expectedRevision)
					),
				});
				return;
			}
			if (method === 'POST' && action === 'release-challenge') {
				this.json(res, 200, {
					challenge: this.login.createPokemonReleaseChallenge(
						this.token(req), characterId, pokemonId, Number(body.expectedRevision)
					),
				});
				return;
			}
			if (method === 'PATCH' && !action) {
				this.json(res, 200, {
					box: this.login.masterEditBoxPokemon(
						this.token(req), this.string(body.characterId), pokemonId,
						(body.edit || {}) as import('./box-management').RPGBoxMasterEdit,
						Number(body.expectedRevision)
					),
				});
				return;
			}
		}
		if (method === 'DELETE' && url.pathname === '/api/rpg/box/pokemon') {
			const body = await this.body(req);
			this.json(res, 200, {
				box: this.login.releaseBoxPokemon(
					this.token(req), this.string(body.challengeId), body.confirmed === true
				),
			});
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/pokemon') {
			const body = await this.body(req);
			this.json(res, 201, {
				box: this.login.masterAddBoxPokemon(
					this.token(req), this.string(body.characterId),
					body.pokemon as import('../../sim/rpg-showdown').RPGCapturedPokemon
				),
			});
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/transfer') {
			const body = await this.body(req);
			this.json(res, 200, {
				transfer: this.login.transferBoxPokemon(
					this.token(req), this.string(body.fromCharacterId), this.string(body.toCharacterId),
					this.string(body.pokemonId), Number(body.sourceRevision), Number(body.destinationRevision)
				),
			});
			return;
		}

		if (method === 'GET' && url.pathname === '/api/rpg/nursery') {
			this.json(res, 200, {nursery: this.login.getNursery(
				this.token(req), url.searchParams.get('characterId') || undefined
			)});
			return;
		}
		const nurseryAction = new RegExp('^/api/rpg/nursery/(create|accept|confirm|cancel|collect|insert|remove|hatch)$').exec(url.pathname);
		if (method === 'POST' && nurseryAction) {
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			let result;
			switch (nurseryAction[1]) {
			case 'create':
				result = {nursery: this.login.createNurseryProject(
					this.token(req), characterId, this.string(body.pokemonId)
				)};
				break;
			case 'accept':
				result = {nursery: this.login.acceptNurseryInvitation(
					this.token(req), this.string(body.projectId), this.string(body.pokemonId)
				)};
				break;
			case 'confirm':
				result = {nursery: this.login.confirmNurseryProject(this.token(req), this.string(body.projectId))};
				break;
			case 'cancel':
				result = {nursery: this.login.cancelNurseryProject(this.token(req), this.string(body.projectId))};
				break;
			case 'collect':
				result = {nursery: this.login.collectNurseryEgg(this.token(req), this.string(body.projectId))};
				break;
			case 'insert':
				result = {nursery: this.login.insertNurseryEgg(
					this.token(req), this.string(body.eggId), this.string(body.incubatorId)
				)};
				break;
			case 'remove':
				result = {nursery: this.login.removeNurseryEgg(this.token(req), this.string(body.eggId))};
				break;
			default:
				result = this.login.hatchNurseryEgg(this.token(req), this.string(body.eggId));
			}
			this.json(res, 200, result);
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/fossil-lab') {
			this.json(res, 200, { fossilLab: this.login.getFossilLab(
				this.token(req), url.searchParams.get('characterId') || undefined
			) });
			return;
		}
		const fossilAction = /^\/api\/rpg\/fossil-lab\/(analyze|start|donate|sell|receive)$/.exec(url.pathname);
		if (method === 'POST' && fossilAction) {
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			if (fossilAction[1] === 'analyze') {
				this.json(res, 200, { fossilLab: this.login.analyzeFossil(
					this.token(req), characterId, this.string(body.itemId),
					typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
				) });
			} else if (fossilAction[1] === 'start') {
				this.json(res, 200, { fossilLab: this.login.startFossilRestoration(
					this.token(req), characterId, {
						itemId: this.string(body.itemId), method: this.string(body.method) as 'standard' | 'advanced',
						quality: typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined,
						sampleCount: Number.isSafeInteger(Number(body.sampleCount)) ? Number(body.sampleCount) : undefined,
						samples: body.samples && typeof body.samples === 'object' ? {
							fragmented: Number((body.samples as Record<string, unknown>).fragmented),
							preserved: Number((body.samples as Record<string, unknown>).preserved),
							exceptional: Number((body.samples as Record<string, unknown>).exceptional),
						} : undefined,
						nature: typeof body.nature === 'string' ? body.nature : undefined,
						ability: typeof body.ability === 'string' ? body.ability : undefined,
						gender: typeof body.gender === 'string' ? body.gender as 'M' | 'F' | 'N' : undefined,
					}
				) });
			} else if (fossilAction[1] === 'donate') {
				this.json(res, 200, { fossilLab: this.login.donateFossil(
					this.token(req), characterId, this.string(body.itemId),
					typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
				) });
			} else if (fossilAction[1] === 'sell') {
				this.json(res, 200, this.login.sellFossil(
					this.token(req), characterId, this.string(body.itemId),
					typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
				));
			} else {
				this.json(res, 200, this.login.receiveRestoredFossil(
					this.token(req), characterId, this.string(body.projectId)
				));
			}
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/battle-reference') {
			this.login.getSession(this.token(req));
			const ids = (key: string) => [...new Set((url.searchParams.get(key) || '').split(',')
				.map(value => value.toLowerCase().replace(/[^a-z0-9]+/g, '')).filter(Boolean))].slice(0, 512);
			const dex = Dex.mod('gen9');
			const moves = ids('moves').map(id => dex.moves.get(id)).filter(move => move.exists).map(move => ({
				id: move.id, name: move.name, type: move.type, category: move.category, pp: move.pp,
				...getRPGMoveMetadata(move),
			}));
			const items = ids('items').map(id => RPGItems.get(id)).filter(item => !!item).map(item => {
				const sprite = Dex.items.get(item.id).spritenum;
				return {
					...item,
					sprite: Number.isInteger(sprite) ? sprite : null,
					icon: getRPGItemIconPath(item.id),
				};
			});
			this.json(res, 200, { moves, items });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/battle-pokemon') {
			this.login.getSession(this.token(req));
			this.json(res, 200, { pokemon: getRPGBattlePokemonCatalog() });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/battle-scenes') {
			this.login.getSession(this.token(req));
			this.json(res, 200, { scenes: getRPGBattleSceneCatalog() });
			return;
		}
		if (url.pathname === '/api/rpg/battle-sessions') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { battleSessions: this.login.listBattleSessions(token) });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				const name = typeof body.name === 'string' ? body.name : undefined;
				this.json(res, 201, { battleSession: this.login.createBattleSession(token, { name }) });
				return;
			}
		}
		const battleMatch = /^\/api\/rpg\/battle-sessions\/([^/]+)(?:\/(invite|response|selection|start|runtime|runtime-ready|action|evolution|move-learning))?$/.exec(url.pathname);
		if (battleMatch) {
			const token = this.token(req);
			const battleSessionId = decodeURIComponent(battleMatch[1]);
			const action = battleMatch[2];
			if (method === 'GET' && !action) {
				this.json(res, 200, { battleSession: this.login.getBattleSession(token, battleSessionId) });
				return;
			}
			if (method === 'PATCH' && !action) {
				const body = await this.body(req);
				const battleSession = this.login.updateBattleSession(
					token, battleSessionId, body as unknown as RPGUpdateBattleSessionRequest
				);
				this.json(res, 200, { battleSession });
				return;
			}
			if (method === 'DELETE' && !action) {
				this.json(res, 200, { battleSession: this.login.cancelBattleSession(token, battleSessionId) });
				return;
			}
			if (method === 'POST' && action === 'invite') {
				this.json(res, 200, { battleSession: this.login.inviteBattleSession(token, battleSessionId) });
				return;
			}
			if (method === 'POST' && action === 'selection') {
				const body = await this.body(req);
				const pokemon = Array.isArray(body.pokemon) ? body.pokemon as { teamIndex?: number }[] : [];
				this.json(res, 200, {
					battleSession: this.login.selectBattleSessionPokemon(token, battleSessionId, pokemon),
				});
				return;
			}
			if (method === 'POST' && action === 'response') {
				const body = await this.body(req);
				const response = this.string(body.response) as 'accepted' | 'declined';
				this.json(res, 200, {
					battleSession: this.login.respondToBattleInvitation(token, battleSessionId, response),
				});
				return;
			}
			if (method === 'POST' && action === 'start') {
				const result = this.login.startBattleSession(token, battleSessionId);
				try {
					this.battleRuntimes.start(
						result.session, result.launch, characterId => this.login.getCharacter(token, characterId)
					);
					const battle = this.battleRuntimes.snapshot(battleSessionId, { master: true });
					this.json(res, 200, { result, battle });
				} catch (error) {
					this.login.rollbackBattleSessionStart(battleSessionId);
					throw error;
				}
				return;
			}
			if (method === 'GET' && action === 'runtime') {
				this.login.getBattleSession(token, battleSessionId);
				const session = this.login.getSession(token);
				const battle = this.battleRuntimes.snapshot(battleSessionId, {
					master: session.role === 'master' && session.mode === 'master',
					characterId: session.mode === 'player' ? (session.characterId || session.viewAsCharacterId) : undefined,
				});
				if (battle.status === 'ended' && battle.result) {
					this.login.completeBattleSession(battleSessionId, battle.result);
				}
				this.json(res, 200, { battle });
				return;
			}
			if (method === 'POST' && action === 'evolution') {
				const body = await this.body(req);
				const teamPosition = typeof body.teamPosition === 'number' ? body.teamPosition : NaN;
				const toSpecies = this.string(body.toSpecies);
				this.json(res, 200, {
					...this.login.evolveBattlePokemon(token, battleSessionId, teamPosition, toSpecies, this.string(body.side)),
				});
				return;
			}
			if (method === 'POST' && action === 'move-learning') {
				const body = await this.body(req);
				const teamPosition = typeof body.teamPosition === 'number' ? body.teamPosition : NaN;
				const replaceIndex = typeof body.replaceIndex === 'number' ? body.replaceIndex : undefined;
				this.json(res, 200, {
					...this.login.learnBattleMove(
						token, battleSessionId, teamPosition, this.string(body.move), replaceIndex, this.string(body.side)
					),
				});
				return;
			}
			if (method === 'POST' && action === 'runtime-ready') {
				this.login.getBattleSession(token, battleSessionId);
				const session = this.login.getSession(token);
				const battle = this.battleRuntimes.ready(battleSessionId, {
					master: session.role === 'master' && session.mode === 'master',
					characterId: session.mode === 'player' ? (session.characterId || session.viewAsCharacterId) : undefined,
				});
				this.json(res, 200, { battle });
				return;
			}
			if (method === 'POST' && action === 'action') {
				this.login.getBattleSession(token, battleSessionId);
				const session = this.login.getSession(token);
				const body = await this.body(req);
				const battle = this.battleRuntimes.action(battleSessionId, {
					master: session.role === 'master' && session.mode === 'master',
					characterId: session.mode === 'player' ? (session.characterId || session.viewAsCharacterId) : undefined,
				}, body as unknown as RPGBattleRuntimeAction, (characterId, inventory) => {
					this.login.persistBattleInventory(characterId, inventory);
				});
				if (battle.status === 'ended' && battle.result) this.login.completeBattleSession(battleSessionId, battle.result);
				this.json(res, 200, { battle });
				return;
			}
		}

		this.json(res, 404, { error: 'RPG endpoint not found' });
	}

	private async body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
		const contentType = req.headers['content-type'] || '';
		if (!contentType.toLowerCase().startsWith('application/json')) {
			throw new RPGHttpError(415, 'RPG requests require application/json');
		}
		let raw = '';
		for await (const chunk of req) {
			raw += chunk;
			if (Buffer.byteLength(raw) > MAX_BODY_SIZE) throw new RPGHttpError(413, 'RPG request body is too large');
		}
		try {
			const value = JSON.parse(raw || '{}');
			if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
			return value;
		} catch {
			throw new RPGHttpError(400, 'Invalid RPG JSON body');
		}
	}

	private characterRequest(body: Record<string, unknown>): RPGCreateCharacterRequest {
		const starter = body.starter && typeof body.starter === 'object' && !Array.isArray(body.starter) ?
			body.starter as Record<string, unknown> : {};
		const nickname = typeof starter.nickname === 'string' ? starter.nickname : undefined;
		const level = typeof starter.level === 'number' ? starter.level : undefined;
		return {
			characterName: this.string(body.characterName),
			playerName: this.string(body.playerName),
			avatar: this.string(body.avatar),
			password: this.string(body.password),
			initialMoney: typeof body.initialMoney === 'number' ? body.initialMoney : NaN,
			starter: {
				species: this.string(starter.species),
				nickname,
				gender: this.string(starter.gender) as RPGCharacterGender,
				level,
			},
		};
	}

	private token(req: http.IncomingMessage): string {
		const authorization = req.headers.authorization || '';
		const match = /^Bearer (.+)$/i.exec(authorization);
		if (!match) throw new RPGHttpError(401, 'RPG session token required');
		return match[1];
	}

	private string(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}

	private headers(): Record<string, string> {
		return {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		};
	}

	private json(res: http.ServerResponse, status: number, data: unknown): void {
		if (res.headersSent) return;
		res.writeHead(status, this.headers());
		res.end(JSON.stringify(data));
	}

	private error(res: http.ServerResponse, error: unknown): void {
		if (error instanceof RPGHttpError) {
			this.json(res, error.status, { error: error.message });
			return;
		}
		const message = error instanceof Error ? error.message : 'Unexpected RPG server error';
		let status = 400;
		if (['Invalid or expired RPG session', 'Invalid RPG character or password', 'Invalid RPG master code']
			.some(part => message.includes(part))) {
			status = 401;
		} else if (['permission', 'cannot access', 'master session required'].some(part => message.includes(part))) {
			status = 403;
		} else if (message.includes('already exists')) {
			status = 409;
		} else if (message.includes('Unknown RPG character')) {
			status = 404;
		}
		this.json(res, status, { error: message });
	}
}

class RPGHttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}
