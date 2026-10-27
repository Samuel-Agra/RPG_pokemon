/**
 * API HTTP privada da interface RPG.
 *
 * Traduz requisições JSON em chamadas da fachada de domínio. Autorização e
 * regras permanecem nos serviços; esta camada cuida somente de rota, formato,
 * códigos de resposta e conversão segura dos valores recebidos do navegador.
 */
import type * as http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

import { Dex } from '../../sim/dex';
import { toID } from '../../sim/dex-data';
import { getRPGMoveMetadata } from './battle-move-analysis';
import { RPGItems } from '../../sim/rpg-showdown';

import {
	createRPGLoginServiceFromConfig,
	createRPGLoginServiceFromConfigAsync,
	createRPGTableLoginServiceAsync,
	type RPGCharacterGender,
	type RPGCreateCharacterRequest,
	type RPGCommerceBulkInput,
	type RPGCommerceOfferInput,
	type RPGCommerceTradeRequest,
	type RPGLoginService,
	type RPGInternalSession,
	type RPGCharacterDeletionStore,
	type RPGUpdateContestSessionRequest,
	type RPGUpdateBattleSessionRequest,
} from './index';
import { getRPGBattlePokemonCatalog, getRPGPokedexMoves } from './pokemon-catalog';
import { RPGBattleRuntimeManager, type RPGBattleRuntimeAction } from './battle-runtime';
import { getRPGBattleSceneCatalog } from './battle-scene';
import { getRPGContestMoveCatalog, getRPGContestPokemonMoveCatalog } from './contest-move-catalog';
import { RPGContestRuntimeManager, type RPGContestRuntimeAction } from './contest-runtime';
import { getRPGItemIconPath } from './item-icons';
import { rollRPGD20, rpgTrainerAttackBonus, rpgTrainerSkillBonus, rollRPGTrainerSkillCheck, rollRPGTrainerInitiative,
	rollRPGTrainerAttributeCheck, rollRPGTrainerResistance, rpgTrainerSkillAttributes,
	type RPGTrainerAttribute, type RPGTrainerResistance } from './trainer-checks';
import { rpgResolveTrainerRollTalents, rpgTrainerRollBonusTerms } from './trainer-roll-talents';

const MAX_BODY_SIZE = 2 * 1024 * 1024;
const MAX_BACKUP_BODY_SIZE = 25 * 1024 * 1024;
const TRAINER_SKILL_NAMES: Record<string, string> = { acrobacia: 'Acrobacia', atletismo: 'Atletismo',
	atuacao: 'Atuação', captura: 'Captura', conhecimento: 'Conhecimento',
	'empatia-pokemon': 'Empatia Pokémon', enganacao: 'Enganação', furtividade: 'Furtividade',
	intimidacao: 'Intimidação', intuicao: 'Intuição', investigacao: 'Investigação',
	ladinagem: 'Ladinagem', medicina: 'Medicina', 'medicina-pokemon': 'Medicina Pokémon',
	'montaria-pokemon': 'Montaria Pokémon', natureza: 'Natureza', oficio: 'Ofício',
	percepcao: 'Percepção', persuasao: 'Persuasão', pilotagem: 'Pilotagem',
	sobrevivencia: 'Sobrevivência', tecnologia: 'Tecnologia',
	'adestramento-pokemon': 'Adestramento Pokémon' };
const TRAINER_SKILL_DOMAINS: Record<string, string> = { regioes: 'Regiões',
	'historia-personagens-historicos': 'História e Personagens Históricos',
	'lendarios-miticos': 'Lendários e Míticos', pokemon: 'Pokémon', organizacoes: 'Organizações',
	'cultura-sociedade': 'Cultura e Sociedade', 'arqueologia-fosseis': 'Arqueologia e Fósseis',
	ciencias: 'Ciências', culinaria: 'Culinária', mecanica: 'Mecânica', costura: 'Costura',
	fotografia: 'Fotografia', carpintaria: 'Carpintaria', ferraria: 'Ferraria',
	jornalismo: 'Jornalismo', artesanato: 'Artesanato', automoveis: 'Automóveis',
	motocicletas: 'Motocicletas', embarcacoes: 'Embarcações', aeronaves: 'Aeronaves',
	'maquinas-pesadas': 'Máquinas pesadas', 'veiculos-especiais': 'Veículos especiais' };
function trainerSkillLabel(skill: string): string {
	const [family, domain] = skill.split(':');
	return `${TRAINER_SKILL_NAMES[family] || family}` +
		(domain ? `: ${TRAINER_SKILL_DOMAINS[domain] || domain.replace(/-/g, ' ')}` : '');
}

export class RPGHttpServer {
	private service?: RPGLoginService;
	private servicePromise?: Promise<RPGLoginService>;
	private readonly scopedService = new AsyncLocalStorage<RPGLoginService>();
	private readonly accountConcurrencyScope = new AsyncLocalStorage<boolean>();
	/** Mantido somente para repositórios locais/dublês; MySQL sempre recarrega a mesa. */
	private readonly localTableServices = new Map<string, Promise<RPGLoginService>>();
	private readonly tableSessionStores = new Map<string, Map<string, RPGInternalSession>>();
	private readonly tableDeletionStores = new Map<string, RPGCharacterDeletionStore>();
	private readonly battleRuntimeManagers = new Map<string, RPGBattleRuntimeManager>();
	private readonly contestRuntimeManagers = new Map<string, RPGContestRuntimeManager>();
	private readonly pendingResponses = new WeakMap<http.ServerResponse, { status: number, data: unknown }>();
	private readonly parsedBodies = new WeakMap<http.IncomingMessage, Promise<Record<string, unknown>>>();

	constructor(service?: RPGLoginService) {
		this.service = service;
	}

	handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
		const url = new URL(req.url || '/', 'http://localhost');
		if (!url.pathname.startsWith('/api/rpg/')) return false;
		void this.route(req, res, url)
			.then(() => this.service?.flushPersistence())
			.then(() => this.commitResponse(res))
			.catch(error => this.error(res, error));
		return true;
	}

	private get login(): RPGLoginService {
		return this.scopedService.getStore() || (this.service ||= createRPGLoginServiceFromConfig());
	}

	private get battleRuntimes(): RPGBattleRuntimeManager {
		const key = this.login.legacyTableId || 'legacy';
		let manager = this.battleRuntimeManagers.get(key);
		if (!manager) { manager = new RPGBattleRuntimeManager(); this.battleRuntimeManagers.set(key, manager); }
		return manager;
	}

	private async initialize(): Promise<void> {
		if (this.service) return;
		this.servicePromise ||= createRPGLoginServiceFromConfigAsync();
		this.service = await this.servicePromise;
	}

	private get contestRuntimeManager(): RPGContestRuntimeManager {
		const key = this.login.legacyTableId || 'legacy';
		let manager = this.contestRuntimeManagers.get(key);
		if (manager) return manager;
		manager = new RPGContestRuntimeManager({
			getCharacterTeam: characterId => this.login.repository.get(characterId)?.state.team,
			getTrainerSheet: characterId => this.login.repository.get(characterId)?.state.trainerSheet,
			getContestHarmonization: (characterId, teamIndexes) =>
				this.login.contestHarmonizationPrepared(characterId, teamIndexes),
			getImpeccablePreparation: (characterId, teamIndexes) =>
				this.login.contestImpeccablePreparationPrepared(characterId, teamIndexes),
			getChoreography: (characterId, teamIndexes) =>
				this.login.trainerContestChoreography(characterId, teamIndexes),
			getCombos: () => this.login.contestCombos.list(),
			onMovePPSpent: (characterId, teamIndex, moveId) =>
				this.login.consumeContestMovePP(characterId, teamIndex, moveId),
			onNPCMovePPSpent: (npcId, pokemonIndex, moveId) =>
				this.login.consumeNPCContestMovePP(npcId, pokemonIndex, moveId),
			onFinished: (session, results) => this.login.applyContestResults(session, results),
		});
		this.contestRuntimeManagers.set(key, manager);
		return manager;
	}

	private async route(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
		await this.initialize();
		if (url.pathname.startsWith('/api/rpg/v2/') && !this.accountConcurrencyScope.getStore()) {
			const authorization = req.headers.authorization || '';
			const token = /^Bearer (.+)$/i.exec(authorization)?.[1];
			const context = {
				origin: req.socket.remoteAddress || 'unknown',
				method: req.method || 'GET', path: url.pathname,
				...(token ? { sessionId: createHash('sha256').update(token).digest('hex').slice(0, 24) } : {}),
			};
			const execute = async () => {
				if (this.service!.mysqlPersistence) {
					const snapshot = await this.service!.mysqlPersistence.snapshot(this.service!.legacyTableId);
					this.service!.accounts.reload({
						accounts: snapshot.platformAccounts, tables: snapshot.campaignTables,
						members: snapshot.tableMembers, invites: snapshot.tableInvites,
						recoveryCodes: snapshot.recoveryCodes, loginAttempts: snapshot.loginAttempts,
						auditEntries: snapshot.auditEntries, accountNotes: snapshot.accountNotes,
						notifications: snapshot.notifications,
					}, snapshot.accountSessions);
				}
				try {
					return await this.service!.accounts.withAuditContext(context,
						() => this.accountConcurrencyScope.run(true, () => this.route(req, res, url)));
				} catch (error) {
					await this.auditFailedAdministrativeRequest(req, url, token, context, error);
					throw error;
				}
			};
			if (!this.service!.mysqlPersistence) return execute();
			const identities = await this.credentialConcurrencyIdentities(req, url);
			const locks = identities?.map(identity => `pokemon-rpg:v2:credential:${identity}`) ||
				['pokemon-rpg:v2:accounts'];
			return this.service!.mysqlPersistence.withAdvisoryLocks(locks, execute);
		}
		if (!this.scopedService.getStore() && !url.pathname.startsWith('/api/rpg/v2/')) {
			const authorization = req.headers.authorization || '';
			const match = /^Bearer (.+)$/i.exec(authorization);
			if (match) {
				try {
					const sharedDatabase = this.service!.mysqlPersistence?.sharedDatabase === true;
					if (!sharedDatabase) {
						const context = this.service!.accounts.getActiveTableContext(match[1]);
						let scoped = this.localTableServices.get(context.table.id);
						if (!scoped) {
							scoped = createRPGTableLoginServiceAsync(this.service!, context.table.id);
							this.localTableServices.set(context.table.id, scoped);
						}
						const tableService = await scoped;
						tableService.authorizePlatformSession(match[1], context);
						return this.scopedService.run(tableService, () => this.route(req, res, url));
					}
					const resolveContext = async () => {
						if (this.service!.mysqlPersistence) {
							const snapshot = await this.service!.mysqlPersistence.snapshot(this.service!.legacyTableId);
							this.service!.accounts.reload({
								accounts: snapshot.platformAccounts, tables: snapshot.campaignTables,
								members: snapshot.tableMembers, invites: snapshot.tableInvites,
								recoveryCodes: snapshot.recoveryCodes, loginAttempts: snapshot.loginAttempts,
								auditEntries: snapshot.auditEntries, accountNotes: snapshot.accountNotes,
								notifications: snapshot.notifications,
							}, snapshot.accountSessions);
						}
						return this.service!.accounts.getActiveTableContext(match[1]);
					};
					const context = this.service!.mysqlPersistence ? await this.service!.mysqlPersistence.withAdvisoryLock(
						'pokemon-rpg:v2:accounts', resolveContext
					) : await resolveContext();
					const tableId = context.table.id;
					if (context.table.status === 'archived' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')) {
						throw new RPGHttpError(409, 'Mesa arquivada: o conteúdo está disponível somente para visualização');
					}
					const execute = async () => {
						let sessionStore = this.tableSessionStores.get(tableId);
						if (!sessionStore) {
							sessionStore = new Map<string, RPGInternalSession>();
							this.tableSessionStores.set(tableId, sessionStore);
						}
						let deletionStore = this.tableDeletionStores.get(tableId);
						if (!deletionStore) {
							deletionStore = { challenges: new Map(), lastWords: new Map(), pokemonReleaseChallenges: new Map() };
							this.tableDeletionStores.set(tableId, deletionStore);
						}
						const tableService = await createRPGTableLoginServiceAsync(
							this.service!, tableId, sessionStore, deletionStore);
						tableService.authorizePlatformSession(match[1], context);
						const auditContext = { origin: req.socket.remoteAddress || 'unknown', method: req.method || 'GET', path: url.pathname };
						const runRequest = () => this.service!.accounts.withAuditContext(auditContext,
							() => this.scopedService.run(tableService, async () => {
								await this.loadSharedRuntime(url, tableId);
								const routed = await this.route(req, res, url);
								if ((context.membership.role === 'owner' || context.membership.role === 'master') &&
									this.isAdministrativeRPGMutation(req.method || 'GET', url.pathname)) {
									this.service!.accounts.recordAdministrativeSuccess(match[1], tableId,
										'rpg.request.succeeded', 'rpg-endpoint', url.pathname);
								}
								this.saveSharedRuntime(url, tableId);
								return routed;
							}));
						try {
							const result = this.service!.mysqlPersistence ?
								await this.service!.mysqlPersistence.transactionAsync(runRequest) : await runRequest();
							await tableService.flushPersistence();
							return result;
						} catch (error) {
							if (context.membership.role === 'owner' || context.membership.role === 'master') {
								await this.auditFailedRPGAdministration(req, match[1], tableId, error);
							}
							throw error;
						}
					};
					return this.service!.mysqlPersistence ? this.service!.mysqlPersistence.withAdvisoryLock(
						'pokemon-rpg:table:' + tableId, execute
					) : execute();
				} catch (error) {
					if (this.service!.accounts.sessionRepository.get(
						createHash('sha256').update(match[1]).digest('hex'))) throw error;
				}
			}
		}
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
			const authorization = req.headers.authorization || '';
			const platformCreation = !!this.scopedService.getStore() && /^Bearer (.+)$/i.test(authorization);
			const character = platformCreation ?
				this.login.createCharacterForPlatformSession(this.token(req), this.characterRequest(body, true)) :
				this.login.createCharacter(this.characterRequest(body));
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
		if (method === 'GET' && url.pathname === '/api/rpg/shops') {
			this.json(res, 200, this.login.listCommerceShops(
				this.token(req), url.searchParams.get('characterId') || undefined
			));
			return;
		}
		const shopMatch = /^\/api\/rpg\/shops\/([^/]+)(?:\/(trade|farm-cart|master-offer|master-bulk))?$/.exec(url.pathname);
		if (shopMatch) {
			const token = this.token(req);
			const shopId = decodeURIComponent(shopMatch[1]);
			const action = shopMatch[2];
			const characterId = url.searchParams.get('characterId') || undefined;
			if (method === 'GET' && !action) {
				this.json(res, 200, this.login.getCommerceShop(token, shopId, characterId));
				return;
			}
			if (method === 'POST' && action === 'trade') {
				const body = await this.body(req);
				const request: RPGCommerceTradeRequest = {
					actionId: this.string(body.actionId),
					type: this.string(body.type) as RPGCommerceTradeRequest['type'],
					lines: Array.isArray(body.lines) ? body.lines.map(line => ({
						itemId: this.string((line as Record<string, unknown>).itemId),
						quantity: Number((line as Record<string, unknown>).quantity),
					})) : [],
					expectedAccountRevision: Number(body.expectedAccountRevision),
					expectedBagRevision: Number(body.expectedBagRevision),
					expectedCatalogRevision: Number(body.expectedCatalogRevision),
				};
				this.json(res, 200, this.login.tradeCommerceShop(token, shopId, request, characterId));
				return;
			}
			if (method === 'POST' && action === 'farm-cart') {
				if (shopId !== 'farm-central') throw new Error('Carrinho misto disponível somente na Fazenda');
				const body = await this.body(req);
				const request: RPGCommerceTradeRequest & { equipmentRevision: number,
					equipmentLines: { itemId: string, quantity: number, instanceId?: string }[], } = {
					actionId: this.string(body.actionId), type: this.string(body.type) as RPGCommerceTradeRequest['type'],
					lines: Array.isArray(body.lines) ? body.lines.map(line => ({
						itemId: this.string((line as Record<string, unknown>).itemId),
						quantity: Number((line as Record<string, unknown>).quantity),
					})) : [],
					equipmentLines: Array.isArray(body.equipmentLines) ? body.equipmentLines.map(line => ({
						itemId: this.string((line as Record<string, unknown>).itemId),
						quantity: Number((line as Record<string, unknown>).quantity),
						instanceId: (line as Record<string, unknown>).instanceId === undefined ? undefined :
						this.string((line as Record<string, unknown>).instanceId),
					})) : [],
					expectedAccountRevision: Number(body.expectedAccountRevision),
					expectedBagRevision: Number(body.expectedBagRevision),
					expectedCatalogRevision: Number(body.expectedCatalogRevision),
					equipmentRevision: Number(body.equipmentRevision),
				};
				this.json(res, 200, this.login.tradeFarmCart(token, request, characterId));
				return;
			}
			if (method === 'POST' && action === 'master-bulk') {
				const body = await this.body(req);
				const input: RPGCommerceBulkInput = {
					action: this.string(body.action) as RPGCommerceBulkInput['action'],
					expectedRevision: Number(body.expectedRevision),
				};
				this.json(res, 200, this.login.configureCommerceBulk(token, shopId, input));
				return;
			}
			if (method === 'POST' && action === 'master-offer') {
				const body = await this.body(req);
				const input: RPGCommerceOfferInput = {
					itemId: this.string(body.itemId), expectedRevision: Number(body.expectedRevision),
					...(body.stock === undefined ? {} : { stock: Number(body.stock) }),
					...(body.buyMode === undefined ? {} : { buyMode: this.string(body.buyMode) as RPGCommerceOfferInput['buyMode'] }),
					...(body.buyPrice === undefined ? {} : { buyPrice: Number(body.buyPrice) }),
					...(body.sellPrice === undefined ? {} : { sellPrice: Number(body.sellPrice) }),
					...(body.buyEnabled === undefined ? {} : { buyEnabled: !!body.buyEnabled }),
					...(body.sellEnabled === undefined ? {} : { sellEnabled: !!body.sellEnabled }),
					...(body.remove === undefined ? {} : { remove: !!body.remove }),
				};
				this.json(res, 200, this.login.configureCommerceOffer(token, shopId, input));
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
		if (method === 'POST' && url.pathname === '/api/rpg/campaign/rest') {
			const body = await this.body(req);
			this.json(res, 200, { rest: this.login.applyCampaignRest(this.token(req),
				this.string(body.kind) as 'short' | 'long', this.string(body.requestId)) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/characters/all') {
			this.json(res, 200, { characters: this.login.listAllCharacters(this.token(req)) });
			return;
		}
		if (url.pathname === '/api/rpg/trainer/creation') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getTrainerCreation(this.token(req)));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, { sheet: this.login.completeTrainerCreation(this.token(req), body as unknown as import('./trainer-creation').RPGTrainerCompletion) });
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/roll') {
			this.json(res, 200, this.login.rollTrainerAttributes(this.token(req)));
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/trainer/creation/method') {
			const body = await this.body(req);
			this.json(res, 200, { method: this.login.chooseTrainerAttributeMethod(this.token(req), body.method) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/progression') {
			this.json(res, 200, this.login.getTrainerProgression(this.token(req),
				url.searchParams.get('characterId') || undefined));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/rules') {
			this.json(res, 200, this.login.getTrainerRules(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/sheet') {
			this.json(res, 200, this.login.getTrainerProgression(this.token(req),
				url.searchParams.get('characterId') || undefined));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/support-caches') {
			this.json(res, 200, this.login.getSupportCaches(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/shared-vehicles') {
			this.json(res, 200, this.login.getSharedVehicles(this.token(req)));
			return;
		}
		if (url.pathname === '/api/rpg/trainer/shared-vehicle') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getSharedVehicle(this.token(req),
					url.searchParams.get('vehicleId') || ''));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, this.login.changeSharedVehicle(this.token(req), body as unknown as
					Parameters<RPGLoginService['changeSharedVehicle']>[1]));
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/hidden-compartment') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerHiddenCompartment(this.token(req), body as unknown as
				Parameters<RPGLoginService['setTrainerHiddenCompartment']>[1]));
			return;
		}
		if (url.pathname === '/api/rpg/trainer/support-cache') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getSupportCache(this.token(req),
					url.searchParams.get('cacheId') || ''));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, body.action === 'create' ?
					this.login.createSupportCache(this.token(req), body.location as string) :
					body.action === 'delete' ?
						this.login.deleteSupportCache(this.token(req), body as unknown as
							Parameters<RPGLoginService['deleteSupportCache']>[1]) :
						this.login.changeSupportCache(this.token(req), body as unknown as
							Parameters<RPGLoginService['changeSupportCache']>[1]));
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/shared-archive') {
			const body = await this.body(req);
			if (!Number.isInteger(body.slot)) throw new Error('Espaço de acervo inválido');
			const slot = Number(body.slot);
			const entry = body.clear === true ? null : {
				topic: this.string(body.topic), knowledge: this.string(body.knowledge),
				recipientCharacterId: this.string(body.recipientCharacterId),
			};
			this.json(res, 200, this.login.setTrainerSharedArchive(this.token(req), slot, entry));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/scientist-record') {
			const body = await this.body(req);
			if (!Number.isInteger(body.slot)) throw new Error('Espaço de registro inválido');
			const entry = body.clear === true ? null : {
				formulaId: this.string(body.formulaId),
				recipientCharacterId: this.string(body.recipientCharacterId),
			};
			this.json(res, 200, this.login.setTrainerScientistRecord(this.token(req), Number(body.slot), entry));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/technological-prototype') {
			const body = await this.body(req);
			this.json(res, 200, this.login.buildTrainerTechnologicalPrototype(this.token(req),
				body.slot as number, this.string(body.itemId), this.string(body.recipientCharacterId),
				body.secondItemId ? this.string(body.secondItemId) : undefined));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/scientist-record/custom') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestCustomScientistRecord(this.token(req), {
				requestId: this.string(body.requestId), slot: body.slot as number,
				recipientCharacterId: this.string(body.recipientCharacterId),
				name: this.string(body.name), description: this.string(body.description),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/scientist-record/custom/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideCustomScientistRecord(this.token(req),
				this.string(body.id), body.accepted as boolean, body.kitTier as number, body.charges as number));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/publications') {
			const body = await this.body(req);
			this.json(res, 200, this.login.createScientificPublication(this.token(req), {
				requestId: this.string(body.requestId), title: this.string(body.title),
				summary: this.string(body.summary),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/confidant') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestTrainerConfidant(this.token(req), {
				requestId: this.string(body.requestId), confidantName: this.string(body.confidantName),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/forage') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestTrainerForage(this.token(req), this.string(body.requestId)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/forage/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideTrainerForage(this.token(req),
				this.string(body.id), body.accepted as boolean));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/confidant/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideTrainerConfidant(this.token(req),
				this.string(body.id), body.accepted as boolean));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/true-bond') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestTrainerTrueBond(this.token(req), {
				requestId: this.string(body.requestId), npcName: this.string(body.npcName),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/true-bond/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideTrainerTrueBond(this.token(req),
				this.string(body.id), body.accepted as boolean));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/true-bond/remove') {
			this.json(res, 200, this.login.removeTrainerTrueBond(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/publications/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideScientificPublication(this.token(req),
				this.string(body.id), body.accepted as boolean, body.payment as number));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/supplier/catalog') {
			this.json(res, 200, this.login.getSupplierCatalog(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/parallel-market/catalog') {
			this.json(res, 200, this.login.getParallelMarketCatalog(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/parallel-market/orders') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestParallelMarketOrder(this.token(req), {
				requestId: this.string(body.requestId), itemId: this.string(body.itemId),
				itemKind: this.string(body.itemKind) as 'pokemon' | 'equipment', quantity: body.quantity as number,
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/supplier/orders') {
			const body = await this.body(req);
			this.json(res, 200, this.login.requestSupplierOrder(this.token(req), {
				requestId: this.string(body.requestId), itemId: this.string(body.itemId),
				itemKind: this.string(body.itemKind) as 'pokemon' | 'equipment',
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/supplier/orders/decide') {
			const body = await this.body(req);
			this.json(res, 200, this.login.decideSupplierOrder(this.token(req),
				this.string(body.id), body.accepted as boolean));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/use') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerSheetTalent(this.token(req), this.string(body.talentId)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/mark-used') {
			const body = await this.body(req);
			this.json(res, 200, this.login.markTrainerManualTalentUsed(this.token(req), this.string(body.talentId)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/social-disguise') {
			this.json(res, 200, this.login.useTrainerSocialDisguise(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/ecological-bait') {
			this.json(res, 200, this.login.useTrainerEcologicalBait(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/prepared-persona') {
			this.json(res, 200, this.login.useTrainerPreparedPersona(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/memory-palace') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerMemoryPalace(this.token(req), body.names as string[]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/capture-attribute') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerCaptureCombatAttribute(this.token(req),
				this.string(body.attribute) as 'dexterity' | 'wisdom'));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/trapmaker') {
			this.json(res, 200, this.login.useTrainerTrapmaker(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/combined-trap') {
			this.json(res, 200, this.login.useTrainerTrapmaker(this.token(req), 'combined'));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/trap-labyrinth') {
			this.json(res, 200, this.login.useTrainerTrapmaker(this.token(req), 'labyrinth'));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/comforting-art') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerComfortingArt(this.token(req),
				this.string(body.recipientCharacterId), this.string(body.effect) as 'will' | 'exhaustion'));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/revigorating-meal') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (!session.platformTableId || !session.platformAccountId || !this.login.mysqlPersistence) {
				throw new Error('Chat da mesa indisponível');
			}
			const body = await this.body(req);
			const outcome = this.login.useTrainerRevigoratingMeal(token, {
				requestId: this.string(body.requestId), dc: Number(body.dc),
				recipientCharacterIds: body.recipientCharacterIds as string[],
			});
			const result = outcome.result;
			if (!outcome.repeated) {
				const people = result.recipients.map(person => `${person.name}: +${person.recovered} PV` +
					(person.exhaustionReduced ? `, -${person.exhaustionReduced} Exaustão (Refeição Reconfortante)` : '')).join('\n');
				const floorLine = (result.effectiveNatural ?? result.natural) > result.natural ?
					`Ápice — Mestre da Cozinha: ${result.natural} no dado vale ${result.effectiveNatural}.\n` : '';
				const message = `Refeição Revigorante — CD ${result.dc}\n${floorLine}` +
					`Ofício — Culinária: 1d20 tirou ${result.effectiveNatural ?? result.natural} + ${result.bonus} = ${result.total}\n` +
					(result.success ? `Cura: ${result.healing} PV por participante\n${people}` : 'Falha: nenhuma cura adicional.') +
					`\nAlimento consumido: ${result.foodConsumed}`;
				await this.login.mysqlPersistence.createTableChatMessage(
					session.platformTableId, session.platformAccountId, message);
			}
			this.json(res, 200, outcome);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/friendship-snack') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerFriendshipSnack(this.token(req), {
				requestId: this.string(body.requestId),
				rationItemId: this.string(body.rationItemId),
				servings: body.servings as { characterId?: string, pokemonId?: string, otherPokemon?: string }[],
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/enrichment-routine') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerEnrichmentRoutine(this.token(req), {
				requestId: this.string(body.requestId), characterId: this.string(body.characterId),
				pokemonId: this.string(body.pokemonId),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/guardian-enrichment') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerGuardianEnrichment(this.token(req), {
				requestId: this.string(body.requestId),
				pokemon: body.pokemon as { characterId: string, pokemonId: string }[],
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/impeccable-preparation') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerImpeccablePreparation(this.token(req), {
				requestId: this.string(body.requestId), characterId: this.string(body.characterId),
				pokemonId: this.string(body.pokemonId),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/training-reward') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerTrainingReward(this.token(req), {
				requestId: this.string(body.requestId), rationItemId: this.string(body.rationItemId),
				characterId: this.string(body.characterId), pokemonId: this.string(body.pokemonId),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/contest-harmonization') {
			const body = await this.body(req);
			this.json(res, 200, this.login.useTrainerContestHarmonization(this.token(req), {
				requestId: this.string(body.requestId), characterId: this.string(body.characterId),
				pokemonIds: body.pokemonIds as string[],
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/choreography') {
			const body = await this.body(req);
			this.json(res, 200, this.login.prepareTrainerChoreography(this.token(req), {
				requestId: this.string(body.requestId),
				kind: this.string(body.kind) as 'rehearsal' | 'formation' | 'guest' | 'theme' | 'instinct' |
				'warmup' | 'evacuation',
				characterId: this.string(body.characterId),
				pokemonIds: body.pokemonIds as string[], tag: this.string(body.tag),
				recipientCharacterIds: body.recipientCharacterIds as string[],
				activity: this.string(body.activity),
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/artisan-ration') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (!session.platformTableId || !session.platformAccountId || !this.login.mysqlPersistence) {
				throw new Error('Chat da mesa indisponível');
			}
			const body = await this.body(req);
			const outcome = this.login.useTrainerArtisanRation(token, {
				requestId: this.string(body.requestId), foodQuantity: Number(body.foodQuantity),
			});
			if (!outcome.repeated) {
				const result = outcome.result;
				const floorLine = (result.effectiveNatural ?? result.natural) > result.natural ?
					`Ápice — Mestre da Cozinha: ${result.natural} no dado vale ${result.effectiveNatural}.\n` : '';
				const message = `Ração Artesanal Pokémon — CD 12\n${floorLine}` +
					`Ofício — Culinária: 1d20 tirou ${result.effectiveNatural ?? result.natural} + ${result.bonus} = ${result.total}\n` +
					(result.success ? `${result.foodQuantity} Alimentos → ${result.produced} Rações Artesanais Pokémon` :
					'Falha: nenhum Alimento consumido e nenhuma ração criada.');
				await this.login.mysqlPersistence.createTableChatMessage(
					session.platformTableId, session.platformAccountId, message);
			}
			this.json(res, 200, outcome);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/team-captain') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerCaptainPlan(this.token(req),
				body.recipientCharacterIds as string[]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/cosmopolitan-etiquette') {
			const body = await this.body(req);
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (!session.platformTableId || !session.platformAccountId || !this.login.mysqlPersistence) {
				throw new Error('Chat da mesa indisponível');
			}
			const result = this.login.setTrainerCosmopolitanEtiquette(token,
				this.string(body.community), Number(body.dc), body.recipientCharacterIds as string[]);
			const roll = result.roll;
			await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId, session.platformAccountId,
				`Etiqueta Cosmopolita — Conhecimento: Regiões: 1d20 tirou ${roll.natural} + ` +
				`${roll.total - roll.natural} = ${roll.total} (CD ${Number(body.dc)}). ` +
				(roll.success ? `Orientação de ${this.string(body.community)} preparada.` : 'Falha: nenhum bônus concedido.'));
			this.json(res, 200, result);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/capture-plan') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerCapturePlan(this.token(req),
				this.string(body.description), body.recipientCharacterIds as string[]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/introduction-letter') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerIntroductionLetter(this.token(req),
				this.string(body.recipientCharacterId), this.string(body.institution), this.string(body.subject)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/diplomat-proxy') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerDiplomatProxy(this.token(req),
				body.recipients as Parameters<RPGLoginService['setTrainerDiplomatProxy']>[1]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/investigative-partner') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerInvestigativePartner(this.token(req),
				body.pokemonId === null ? null : this.string(body.pokemonId)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/trusted-partner') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerTrustedPartnerName(this.token(req),
				this.string(body.name)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/individual-recovery-note') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerIndividualRecoveryNote(this.token(req),
				this.string(body.note)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/reroll') {
			const body = await this.body(req);
			const talentId = this.string(body.talentId);
			if (talentId !== 'sortudo' && talentId !== 'determinado' && talentId !== 'esforco-heroico') {
				throw new Error('Talento inválido');
			}
			this.json(res, 200, await this.login.rerollTrainerChatTalent(this.token(req), talentId));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/ally-roll-talents') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (session.mode !== 'player') throw new Error('Entre como jogador para rolar pela ficha');
			const characterId = session.viewAsCharacterId || session.characterId;
			if (!characterId) throw new Error('Selecione um personagem');
			this.json(res, 200, this.login.getTrainerAllyRollTalents(token, characterId));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/checks') {
			const body = await this.body(req);
			this.json(res, 200, this.login.rollTrainerCheck(this.token(req),
				body as unknown as Parameters<RPGLoginService['rollTrainerCheck']>[1]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/persistent-hypothesis') {
			const body = await this.body(req);
			this.json(res, 200, this.login.updateTrainerPersistentHypothesis(this.token(req),
				body as Parameters<RPGLoginService['updateTrainerPersistentHypothesis']>[1]));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/help-roll') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (session.mode !== 'player') throw new Error('Entre como jogador para ajudar');
			if (!this.login.mysqlPersistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'As rolagens no chat requerem o banco de dados');
			}
			const body = await this.body(req);
			const skill = this.string(body.skill);
			const attribute = body.attribute ? this.string(body.attribute) as RPGTrainerAttribute : undefined;
			const mode = this.string(body.mode) as 'normal' | 'advantage' | 'disadvantage';
			const characterId = session.viewAsCharacterId || session.characterId;
			if (!characterId) throw new Error('Selecione um personagem');
			const character = this.login.getCharacter(token, characterId);
			if (character.trainerSheet?.survival?.lifeState === 'dead') {
				throw new Error('Um treinador morto não pode realizar testes');
			}
			const offered = this.login.offerTrainerHelp(token, skill, attribute, mode,
				body.talents === undefined ? [] : body.talents as string[]);
			const label = trainerSkillLabel(skill);
			const talentLines = offered.talents.map(talent => talent.name).join('\n');
			const rolls = offered.result.dice.length === 1 ? '' :
				`${offered.result.mode === 'advantage' ? 'Vantagem' : 'Desvantagem'}\n` +
				`1ª rolagem: ${offered.result.dice[0]}\n2ª rolagem: ${offered.result.dice[1]}\n`;
			const terms = rpgTrainerRollBonusTerms(offered.result.total - offered.result.effectiveNatural -
				offered.talents.reduce((total, talent) => total + talent.bonus, 0), offered.talents);
			const stageLegend = skill === 'atuacao' &&
				character.trainerSheet?.talents.apex === 'artista:lenda-dos-palcos';
			const eraVoice = offered.talents.some(talent => talent.id === 'arqueologo:voz-das-eras');
			const scientificAuthority = offered.talents.some(talent => talent.id === 'cientista:autoridade-cientifica');
			const kitchenMastery = offered.talents.some(talent => talent.id === 'cozinheiro:mestre-da-cozinha');
			const athleticFundamentals = character.trainerSheet?.classId === 'atleta' &&
				(skill === 'atletismo' || skill === 'acrobacia');
			const completeAthlete = athleticFundamentals &&
				character.trainerSheet?.talents.apex === 'atleta:atleta-completo';
			const naturalFloor = stageLegend || eraVoice || scientificAuthority || kitchenMastery || completeAthlete ? 10 : skill === 'conhecimento:arqueologia-fosseis' &&
				character.trainerSheet?.talents.class.includes('arqueologo:memoria-academica') ? 8 :
				athleticFundamentals ? 5 : 0;
			const floorSource = stageLegend ? 'Ápice — Lenda dos Palcos' : eraVoice ? 'Voz das Eras' :
				scientificAuthority ? 'Ápice — Autoridade Científica' :
				kitchenMastery ? 'Ápice — Mestre da Cozinha' :
				completeAthlete ? 'Ápice — Atleta Completo' :
				athleticFundamentals ? 'Fundamentos Esportivos' : 'Memória Acadêmica';
			const floorLine = offered.result.effectiveNatural > offered.result.natural ?
				`${floorSource}: ` +
				`${offered.result.natural} no dado vale ${offered.result.effectiveNatural}.\n` : '';
			const message = `${character.characterName} ajudou com ${label}.\n` +
				`${talentLines ? `${talentLines}\n` : ''}${floorLine}${rolls}${label}: 1d20 tirou ` +
				`${offered.result.effectiveNatural} ${terms} = ${offered.result.total}.\n` +
				`Bônus de ajuda +${offered.bonus}`;
			const posted = await this.login.mysqlPersistence.createTableChatMessage(
				session.platformTableId, session.platformAccountId, message);
			this.login.recordTrainerChatRoll(token, 'skill', label, terms, posted, { ...offered.result,
				mode: offered.result.mode as 'normal' | 'advantage' | 'disadvantage' },
			naturalFloor, floorSource);
			this.json(res, 201, { result: offered.result, helpBonus: offered.bonus, message: posted });
			return;
		}
		if (method === 'POST' && ['/api/rpg/trainer/attribute-roll', '/api/rpg/trainer/resistance-roll',
			'/api/rpg/trainer/skill-roll', '/api/rpg/trainer/attack-roll', '/api/rpg/trainer/initiative-roll']
			.includes(url.pathname)) {
			const resistanceRoll = url.pathname.endsWith('/resistance-roll');
			const skillRoll = url.pathname.endsWith('/skill-roll');
			const attackRoll = url.pathname.endsWith('/attack-roll');
			const initiativeRoll = url.pathname.endsWith('/initiative-roll');
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (session.mode !== 'player') throw new Error('Entre como jogador para rolar pela ficha');
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'As rolagens no chat requerem o banco de dados');
			}
			const body = await this.body(req);
			const attribute = resistanceRoll || skillRoll || attackRoll || initiativeRoll ? undefined :
				this.string(body.attribute) as RPGTrainerAttribute;
			const resistance = resistanceRoll ? this.string(body.resistance) as RPGTrainerResistance : undefined;
			const skill = skillRoll ? this.string(body.skill) : undefined;
			const attack = attackRoll ? this.string(body.attack) : undefined;
			if (attackRoll && attack !== 'melee' && attack !== 'ranged') throw new Error('Ataque inválido');
			const skillAttribute = skillRoll && body.attribute ? this.string(body.attribute) as RPGTrainerAttribute : undefined;
			const mode = this.string(body.mode);
			if (!['normal', 'advantage', 'disadvantage'].includes(mode)) throw new Error('Modo de rolagem inválido');
			const characterId = body.characterId ? this.string(body.characterId) :
				session.viewAsCharacterId || session.characterId;
			if (session.role === 'master' && (!session.viewAsCharacterId ||
				toID(characterId || '') !== toID(session.viewAsCharacterId))) {
				throw new Error('Entre como esse jogador para rolar seus atributos');
			}
			const character = this.login.getCharacter(token, characterId);
			if (character.trainerSheet?.survival?.lifeState === 'dead') {
				throw new Error('Um treinador morto não pode realizar rolagens');
			}
			const pendingCapture = skillRoll && skill === 'captura' ?
				this.login.trainerPendingCapture(token, characterId!) : null;
			const captureBall = pendingCapture ? this.string(body.captureBall) : '';
			if (pendingCapture && !pendingCapture.balls.some(ball => ball.id === captureBall)) {
				throw new Error('Escolha uma Poké Bola disponível na sua Bag para esta captura');
			}
			if (skillRoll && skillAttribute &&
				!rpgTrainerSkillAttributes(character.trainerSheet!, skill!).includes(skillAttribute)) {
				throw new Error('Atributo incompatível com a perícia');
			}
			const kind = initiativeRoll ? 'initiative' : attackRoll ? 'attack' : skillRoll ? 'skill' :
				resistanceRoll ? 'resistance' : 'attribute';
			const rollId = initiativeRoll ? '' : attackRoll ? attack! : skillRoll ? skill! :
				resistanceRoll ? resistance! : attribute!;
			const selectedTalents = body.talents === undefined ? [] : body.talents;
			const talentEffects = rpgResolveTrainerRollTalents(character.trainerSheet!, kind,
				rollId, selectedTalents as string[],
				resistanceRoll || skillRoll || kind === 'attribute' ?
					this.login.getTrainerAllyRollTalents(token, characterId!, skillAttribute) : [],
				skillAttribute);
			const proxy = talentEffects.chosen.find(talent => talent.id === 'diplomata:acordo-impossivel');
			const proxySourceId = proxy?.key.split('@')[1]?.split(':')[0];
			const observedSkill = skillRoll && talentEffects.chosen.some(talent =>
				talent.id === 'aprendizado-por-observacao');
			if (skillRoll) rpgTrainerSkillBonus(character.trainerSheet!, skill!, skillAttribute, false, observedSkill);
			const help = skillRoll ? this.login.consumeTrainerHelp(token, skill!, proxySourceId) : null;
			const helpBonus = help?.bonus || 0;
			const options = {
				dc: 0, bonus: talentEffects.bonus + helpBonus,
				naturalFloor: skillRoll ? talentEffects.naturalFloor : undefined,
				temporarilyTrained: observedSkill,
				advantages: (mode === 'advantage' ? 1 : 0) + talentEffects.advantages,
				disadvantages: mode === 'disadvantage' ? 1 : 0,
			};
			const result = initiativeRoll ? (() => {
				const roll = rollRPGTrainerInitiative(character.trainerSheet!, Math.random, options);
				return { ...roll, bonus: roll.total - roll.natural + talentEffects.bonus,
					total: roll.total + talentEffects.bonus };
			})() : attackRoll ? (() => {
				const roll = rollRPGD20(Math.random, options);
				const bonus = rpgTrainerAttackBonus(character.trainerSheet!,
					attack === 'melee' ? 'strength' : 'dexterity', false) + talentEffects.bonus;
				return { ...roll, bonus, total: roll.natural + bonus };
			})() : skillRoll ? rollRPGTrainerSkillCheck(character.trainerSheet!, skill!, skillAttribute, options) :
			resistanceRoll ? rollRPGTrainerResistance(character.trainerSheet!, resistance!, options) :
			rollRPGTrainerAttributeCheck(character.trainerSheet!, attribute!, options);
			const names: Record<string, string> = { strength: 'Força', dexterity: 'Destreza',
				constitution: 'Constituição', intelligence: 'Inteligência', wisdom: 'Sabedoria', charisma: 'Carisma',
				fortitude: 'Fortitude', reflexes: 'Reflexos', will: 'Vontade' };
			const effectiveNatural = 'effectiveNatural' in result &&
				typeof result.effectiveNatural === 'number' ? result.effectiveNatural : result.natural;
			const baseBonus = result.total - effectiveNatural - talentEffects.bonus - helpBonus;
			const shownBaseBonus = baseBonus + (proxy?.bonus || 0);
			const shownTalents = talentEffects.chosen.filter(talent => talent !== proxy);
			const bonus = help ? [shownBaseBonus, helpBonus, ...shownTalents
				.filter(talent => talent.bonus !== 0).map(talent => talent.bonus)]
				.map(value => value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`).join(' ') :
				rpgTrainerRollBonusTerms(shownBaseBonus, shownTalents);
			const rolls = result.dice.length === 1 ? '' :
				`${result.mode === 'advantage' ? 'Vantagem' : 'Desvantagem'}\n` +
				`1ª rolagem: ${result.dice[0]}\n2ª rolagem: ${result.dice[1]}\n`;
			const rollName = initiativeRoll ? 'Iniciativa' :
				attackRoll ? attack === 'melee' ? 'Ataque corpo a corpo' : 'Ataque à distância' :
				skillRoll ? trainerSkillLabel(skill!) :
				resistanceRoll ? names[resistance!] : names[attribute!];
			const talentLines = talentEffects.chosen.length ?
				`${talentEffects.chosen.map(talent => talent.name).join('\n')}\n` : '';
			const helpLine = help ? `Ajuda de ${help.helperName}\n` : '';
			const stageLegend = skillRoll && skill === 'atuacao' &&
				character.trainerSheet?.talents.apex === 'artista:lenda-dos-palcos';
			const eraVoice = talentEffects.chosen.some(talent => talent.id === 'arqueologo:voz-das-eras');
			const scientificAuthority = talentEffects.chosen.some(talent => talent.id === 'cientista:autoridade-cientifica');
			const kitchenMastery = talentEffects.chosen.some(talent => talent.id === 'cozinheiro:mestre-da-cozinha');
			const athleticFundamentals = skillRoll && character.trainerSheet?.classId === 'atleta' &&
				(skill === 'atletismo' || skill === 'acrobacia');
			const completeAthlete = athleticFundamentals &&
				character.trainerSheet?.talents.apex === 'atleta:atleta-completo';
			const naturalFloor = stageLegend || eraVoice || scientificAuthority || kitchenMastery || completeAthlete ? 10 : skillRoll && skill === 'conhecimento:arqueologia-fosseis' &&
				character.trainerSheet?.talents.class.includes('arqueologo:memoria-academica') ? 8 :
				athleticFundamentals ? 5 : 0;
			const floorSource = stageLegend ? 'Ápice — Lenda dos Palcos' : eraVoice ? 'Voz das Eras' :
				scientificAuthority ? 'Ápice — Autoridade Científica' :
				kitchenMastery ? 'Ápice — Mestre da Cozinha' :
				completeAthlete ? 'Ápice — Atleta Completo' :
				athleticFundamentals ? 'Fundamentos Esportivos' : 'Memória Acadêmica';
			const floorLine = skillRoll && effectiveNatural > result.natural ?
				`${floorSource}: ` +
				`${result.natural} no dado vale ${effectiveNatural}.\n` : '';
			const message = `${helpLine}${talentLines}${floorLine}${rolls}${rollName}: 1d20 tirou ` +
				`${effectiveNatural} ${bonus} = ${result.total}`;
			const captureOutcome = pendingCapture ? this.login.resolveTrainerPendingCapture(token,
				characterId!, captureBall, { natural: result.natural, total: result.total }) : null;
			const posted = await persistence.createTableChatMessage(
				session.platformTableId, session.platformAccountId, message);
			if (captureOutcome?.capture) {
				const ballName = pendingCapture!.balls.find(ball => ball.id === captureBall)?.name || captureBall;
				const outcomeText = !captureOutcome.capture.throwHit ?
					`O arremesso passou longe de ${pendingCapture!.species}. ${character.characterName} errou o alvo!` :
					captureOutcome.capture.success ?
						`${character.characterName} capturou ${pendingCapture!.species} com ${ballName}!` :
						`${pendingCapture!.species} escapou da ${ballName} de ${character.characterName}!`;
				await persistence.createTableChatMessage(session.platformTableId, session.platformAccountId, outcomeText);
			}
			if (talentEffects.chosen.some(talent => talent.id === 'artista:arte-reconfortante')) {
				this.login.consumeTrainerComfortingArt(token, characterId!);
			}
			if (talentEffects.chosen.some(talent => talent.id === 'cientista:hipotese-persistente')) {
				this.login.consumeTrainerPersistentHypothesis(token, characterId!);
			}
			if (resistanceRoll && resistance === 'fortitude') {
				this.login.consumePreventiveProtocol(token, characterId!, talentEffects.chosen.map(talent => talent.key));
			}
			this.login.consumeTrainerChoreographyRoll(token, characterId!, talentEffects.chosen.map(talent => talent.key));
			this.login.consumeTrainerCapturePlanRoll(token, characterId!, talentEffects.chosen.map(talent => talent.key));
			this.login.consumeTrainerIntroductionLetterRoll(token, characterId!,
				talentEffects.chosen.map(talent => talent.key));
			this.login.consumeTrainerDiplomatProxyRoll(token, characterId!,
				talentEffects.chosen.map(talent => talent.key));
			if (kind === 'attribute' || kind === 'skill' || kind === 'resistance') {
				this.login.recordTrainerChatRoll(token, kind, rollName, bonus, posted, { ...result,
					mode: result.mode as 'normal' | 'advantage' | 'disadvantage' },
				naturalFloor, skillRoll ? floorSource : undefined);
			}
			this.json(res, 201, { result, message: posted });
			return;
		}
		if (url.pathname === '/api/rpg/trainer/activities') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getTrainerActivities(this.token(req),
					url.searchParams.get('characterId') || undefined));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, this.login.applyTrainerActivity(this.token(req),
					body as unknown as Parameters<RPGLoginService['applyTrainerActivity']>[1]));
				return;
			}
		}
		if (url.pathname === '/api/rpg/trainer/equipment') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getTrainerEquipment(this.token(req),
					url.searchParams.get('characterId') || undefined));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, this.login.changeTrainerEquipment(this.token(req),
					body as unknown as Parameters<RPGLoginService['changeTrainerEquipment']>[1]));
				return;
			}
		}
		if (url.pathname === '/api/rpg/trainer/weapon-targets' && method === 'GET') {
			this.json(res, 200, this.login.getTrainerWeaponTargets(this.token(req)));
			return;
		}
		if (url.pathname === '/api/rpg/trainer/weapon-attack' && method === 'POST') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			if (!this.login.mysqlPersistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'O ataque no chat requer o banco de dados');
			}
			const body = await this.body(req);
			const result = this.login.attackWithTrainerWeapon(token, body as unknown as
				Parameters<RPGLoginService['attackWithTrainerWeapon']>[1]);
			await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId,
				session.platformAccountId, result.message);
			this.json(res, 200, result);
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/item-bank') {
			this.json(res, 200, this.login.getTrainerItemBank(this.token(req),
				url.searchParams.get('characterId') || undefined));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/equipment/offers') {
			this.json(res, 200, { offers: this.login.getTrainerEquipmentOffers(this.token(req),
				this.string(url.searchParams.get('shopId')), url.searchParams.get('characterId') || undefined) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/equipment/offer') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerEquipmentOffer(this.token(req),
				this.string(body.shopId), this.string(body.itemId), Number(body.stock),
				body.price === undefined ? undefined : Number(body.price),
				body.buyEnabled as boolean | undefined, body.sellEnabled as boolean | undefined,
				body.sellPrice === undefined ? undefined : Number(body.sellPrice)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/equipment/offer/bulk') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerEquipmentOffersBulk(this.token(req),
				this.string(body.shopId), this.string(body.action) as import('./shop-management').RPGCommerceBulkAction));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/equipment/license') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setTrainerLicense(this.token(req),
				this.string(body.characterId), body.license as import('./trainer-equipment').RPGLicense,
				body.waiveFee === true));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/equipment/domain') {
			const body = await this.body(req);
			this.json(res, 200, this.login.grantTrainerKitDomain(this.token(req),
				this.string(body.characterId), this.string(body.domain)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/survival') {
			const body = await this.body(req);
			this.json(res, 200, this.login.applyTrainerSurvival(this.token(req),
				this.string(body.characterId), body.action as import('./trainer-survival').RPGTrainerSurvivalAction));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/death-save') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'O teste de morte no chat requer o banco de dados');
			}
			const body = await this.body(req);
			const outcome = this.login.rollOwnTrainerDeathSave(token, this.string(body.requestId));
			if (!outcome.repeated) {
				const survival = outcome.sheet.survival!;
				const result = survival.lifeState === 'dead' ? 'morreu' :
					survival.lifeState === 'stable' ? 'estabilizou' :
					survival.lifeState === 'conscious' ? 'recuperou 1 PV' :
					outcome.natural >= 10 ? `sucesso (${survival.deathSaves.successes}/3)` :
					`falha (${survival.deathSaves.failures}/3)`;
				await persistence.createTableChatMessage(session.platformTableId, session.platformAccountId,
					`Teste de morte: 1d20 tirou ${outcome.natural} — ${result}`);
			}
			this.json(res, 200, outcome);
			return;
		}
		if (url.pathname === '/api/rpg/trainer/talents') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getTrainerTalents(this.token(req),
					url.searchParams.get('characterId') || undefined));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, { sheet: this.login.chooseTrainerTalent(this.token(req),
					body as unknown as import('./trainer-talents').RPGTrainerTalentChoice) });
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/talents/approve') {
			const body = await this.body(req);
			this.json(res, 200, { sheet: this.login.approveTrainerTalentPrerequisite(this.token(req),
				this.string(body.characterId), this.string(body.key), this.string(body.reason)) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/rewards/master') {
			const body = await this.body(req);
			this.json(res, 200, this.login.grantMasterTrainerXP(this.token(req),
				this.string(body.characterId), body.amount as number,
				this.string(body.reason), this.string(body.requestId)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/level-up') {
			this.json(res, 200, this.login.previewOwnTrainerLevel(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/level-up') {
			const body = await this.body(req);
			this.json(res, 200, { sheet: this.login.advanceOwnTrainerLevel(this.token(req),
				body.choices as import('./trainer-talents').RPGTrainerTalentChoice[]) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/level/master') {
			const body = await this.body(req);
			this.json(res, 200, { sheet: this.login.adjustMasterTrainerLevel(this.token(req),
				this.string(body.characterId), this.string(body.direction) as 'up' | 'down',
				this.string(body.requestId)) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/table-chat/typing') {
			const session = this.login.getSession(this.token(req));
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'O chat da mesa requer o banco de dados');
			}
			const body = await this.body(req);
			const typing = body.typing === true;
			await persistence.setTableChatTyping(session.platformTableId, session.platformAccountId, typing);
			this.json(res, 200, { typing });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/table-log') {
			const session = this.login.getSession(this.token(req));
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId) {
				throw new RPGHttpError(503, 'O registro da mesa requer o banco de dados');
			}
			const characterId = session.viewAsCharacterId || session.characterId;
			this.json(res, 200, { entries: await persistence.loadTableSystemLog(session.platformTableId, {
				master: session.role === 'master', ...(characterId ? { characterId } : {}),
			}) });
			return;
		}
		if (url.pathname === '/api/rpg/table-chat') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'O chat da mesa requer o banco de dados');
			}
			if (method === 'GET') {
				const [messages, typing] = await Promise.all([
					persistence.loadTableChatMessages(session.platformTableId),
					persistence.loadTableChatTyping(session.platformTableId, session.platformAccountId),
				]);
				this.json(res, 200, { messages, typing });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				const message = await persistence.createTableChatMessage(
					session.platformTableId, session.platformAccountId, this.string(body.message)
				);
				this.json(res, 201, { message });
				return;
			}
		}
		if (method === 'GET' && url.pathname === '/api/rpg/players') {
			this.json(res, 200, { players: this.login.listOtherPlayers(this.token(req)) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/characters/pokemon') {
			const body = await this.body(req);
			const giftSession = this.login.getSession(this.token(req));
			if (body.capture === true && (!this.login.mysqlPersistence ||
				!giftSession.platformTableId || !giftSession.platformAccountId)) {
				throw new RPGHttpError(503, 'A tentativa de captura requer o chat da mesa');
			}
			const result = this.login.masterCreatePlayerPokemon(
				this.token(req), this.string(body.characterId), {
					species: this.string(body.species), level: Number(body.level),
					gender: this.string(body.gender) as RPGCharacterGender,
					ability: this.string(body.ability), nature: this.string(body.nature), shiny: body.shiny === true,
					capture: body.capture === true ? {
						hpPercent: Number(body.hpPercent), status: this.string(body.status),
						encounterId: this.string(body.encounterId),
						conditions: body.conditions as { isNight?: boolean, isCave?: boolean, isInWater?: boolean },
					} : undefined,
				}
			);
			if (result.pending) {
				const character = this.login.getCharacter(this.token(req), this.string(body.characterId));
				await this.login.mysqlPersistence!.createTableChatMessage(giftSession.platformTableId!,
					giftSession.platformAccountId!, `${character.characterName}, ${this.string(body.species)} apareceu! ` +
					'Escolha uma Poké Bola na ficha e faça seu teste de Captura.');
			}
			this.json(res, 201, result);
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/pending-capture') {
			this.json(res, 200, { capture: this.login.trainerPendingCapture(this.token(req),
				this.string(url.searchParams.get('characterId'))) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/characters/pokemon/capture-balls') {
			this.json(res, 200, { balls: this.login.masterCaptureBalls(
				this.token(req), this.string(url.searchParams.get('characterId')),
			) });
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/characters/page-access') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.setCharacterPageAccess(
				this.token(req), this.string(body.characterId),
				this.string(body.page) as 'bank' | 'bag' | 'box' | 'training' | 'center' | 'fossils' | 'nursery' | 'shops',
				body.allowed === true
			) });
			return;
		}
		const characterOwnerMatch = /^\/api\/rpg\/characters\/([^/]+)\/owner$/.exec(url.pathname);
		if (method === 'PUT' && characterOwnerMatch) {
			const body = await this.body(req);
			const character = this.login.transferCharacterOwnership(
				this.token(req), decodeURIComponent(characterOwnerMatch[1]), this.string(body.accountId)
			);
			this.json(res, 200, { character }); return;
		}

		// Version 2 owns global accounts and table membership while version 1 remains available during migration.
		if (method === 'POST' && url.pathname === '/api/rpg/v2/accounts') {
			const body = await this.body(req);
			const username = this.string(body.username);
			const handle = this.optionalString(body.handle) || toID(username);
			const registration = await this.login.accounts.createAccountWithRecoveryCodesAsync(
				username, handle, this.string(body.password), handle
			);
			await this.login.flushPersistence();
			this.json(res, 201, registration);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/session') {
			const body = await this.body(req);
			const session = await this.login.accounts.loginAsync(this.string(body.username), this.string(body.password),
				req.socket.remoteAddress || 'unknown');
			await this.login.flushPersistence();
			this.json(res, 200, { session });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/password/recovery') {
			const body = await this.body(req);
			await this.login.accounts.recoverPasswordAsync(this.string(body.username), this.string(body.recoveryCode),
				this.string(body.newPassword), req.socket.remoteAddress || 'unknown');
			await this.login.flushPersistence(); this.json(res, 200, { ok: true }); return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/recovery-codes') {
			const body = await this.body(req);
			const recoveryCodes = await this.login.accounts.regenerateRecoveryCodesAsync(
				this.token(req), this.string(body.password)
			);
			await this.login.flushPersistence(); this.json(res, 200, { recoveryCodes }); return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/v2/password') {
			const body = await this.body(req);
			await this.login.accounts.changePasswordAsync(
				this.token(req), this.string(body.currentPassword), this.string(body.newPassword)
			);
			await this.login.flushPersistence(); this.json(res, 200, { ok: true }); return;
		}
		if (url.pathname === '/api/rpg/v2/session') {
			const token = this.token(req);
			if (method === 'GET') {
				const view = this.login.accounts.getSession(token);
				await this.login.flushPersistence();
				this.json(res, 200, view);
				return;
			}
			if (method === 'DELETE') {
				this.login.accounts.logout(token);
				await this.login.flushPersistence();
				this.json(res, 200, { ok: true });
				return;
			}
		}
		if (method === 'PATCH' && url.pathname === '/api/rpg/v2/account') {
			const body = await this.body(req);
			const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile) ?
				body.profile as Record<string, unknown> : undefined;
			const account = this.login.accounts.updateAccount(
				this.token(req), this.optionalString(body.handle) || '', this.optionalString(body.handle), profile ? {
					avatarUrl: this.optionalString(profile.avatarUrl), bio: this.optionalString(profile.bio),
					accentColor: this.optionalString(profile.accentColor),
				} : undefined
			);
			await this.login.flushPersistence(); this.json(res, 200, { account }); return;
		}
		if (url.pathname === '/api/rpg/v2/sessions') {
			const token = this.token(req);
			if (method === 'GET') {
				const sessions = this.login.accounts.listSessions(token);
				await this.login.flushPersistence();
				this.json(res, 200, { sessions });
				return;
			}
			if (method === 'DELETE') {
				const revoked = this.login.accounts.terminateAllSessions(token);
				await this.login.flushPersistence();
				this.json(res, 200, { ok: true, revoked });
				return;
			}
		}
		const version2SessionMatch = /^\/api\/rpg\/v2\/sessions\/([^/]+)$/.exec(url.pathname);
		if (method === 'DELETE' && version2SessionMatch) {
			const token = this.token(req); const sessionId = decodeURIComponent(version2SessionMatch[1]);
			const revoked = this.login.accounts.terminateSession(token, sessionId);
			if (!revoked) throw new RPGHttpError(404, 'Sessão não encontrada');
			await this.login.flushPersistence();
			this.json(res, 200, { ok: true });
			return;
		}
		if (url.pathname === '/api/rpg/v2/notifications') {
			const token = this.token(req);
			if (method === 'GET') {
				const notifications = this.login.accounts.listNotifications(token, Number(url.searchParams.get('limit') || 50));
				this.json(res, 200, { notifications, unread: notifications.filter(entry => !entry.readAt).length });
				return;
			}
			if (method === 'PATCH') {
				const updated = this.login.accounts.markAllNotificationsRead(token);
				await this.login.flushPersistence(); this.json(res, 200, { updated }); return;
			}
		}
		const version2NotificationMatch = /^\/api\/rpg\/v2\/notifications\/([^/]+)$/.exec(url.pathname);
		if (method === 'PATCH' && version2NotificationMatch) {
			const notification = this.login.accounts.markNotificationRead(
				this.token(req), decodeURIComponent(version2NotificationMatch[1])
			);
			await this.login.flushPersistence(); this.json(res, 200, { notification }); return;
		}
		if (url.pathname === '/api/rpg/v2/tables') {
			const token = this.token(req);
			if (method === 'GET') {
				const tables = this.login.accounts.listTables(token);
				if (this.login.mysqlPersistence) {
					const session = this.login.accounts.getSession(token).session;
					const characters = await this.login.mysqlPersistence.listAccountTableCharacters(session.accountId);
					for (const entry of tables) entry.character = characters.get(entry.table.id);
				}
				await this.login.flushPersistence();
				this.json(res, 200, { tables });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				const visibility = this.string(body.visibility);
				const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ?
					body.settings as Record<string, unknown> : {};
				const table = this.login.accounts.createTable(token, {
					name: this.string(body.name), description: this.optionalString(body.description),
					color: this.optionalString(body.color),
					visibility: visibility ? visibility as 'private' | 'code' | 'public' : undefined,
					requireJoinApproval: body.requireJoinApproval !== false,
					settings: {
						cardImage: this.optionalString(settings.cardImage),
						tableInformation: this.optionalString(settings.tableInformation),
						fullDescription: this.optionalString(settings.fullDescription),
						sessionDays: Array.isArray(settings.sessionDays) ? settings.sessionDays.map(value => this.string(value)) : [],
						sessionTimes: settings.sessionTimes && typeof settings.sessionTimes === 'object' && !Array.isArray(settings.sessionTimes) ?
							Object.fromEntries(Object.entries(settings.sessionTimes).map(([day, value]) => [day, this.string(value)])) : {},
						inDevelopment: settings.inDevelopment !== false,
					},
				});
				await this.login.flushPersistence();
				this.json(res, 201, { table });
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/tables/deselect') {
			const session = this.login.accounts.deselectTable(this.token(req));
			await this.login.flushPersistence(); this.json(res, 200, { session }); return;
		}
		const version2TableArchiveMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)$/.exec(url.pathname);
		if (method === 'PATCH' && version2TableArchiveMatch) {
			const body = await this.body(req);
			const update: Parameters<typeof this.login.accounts.updateTable>[2] = {};
			if ('name' in body) update.name = this.string(body.name);
			if ('description' in body) update.description = this.optionalString(body.description) || '';
			if ('color' in body) update.color = this.string(body.color);
			if ('visibility' in body) update.visibility = this.string(body.visibility) as 'private' | 'code' | 'public';
			if ('requireJoinApproval' in body) update.requireJoinApproval = body.requireJoinApproval === true;
			if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
				const settings = body.settings as Record<string, unknown>;
				update.settings = {};
				if ('cardImage' in settings) update.settings.cardImage = this.optionalString(settings.cardImage);
				if ('tableInformation' in settings) update.settings.tableInformation = this.optionalString(settings.tableInformation);
				if ('fullDescription' in settings) update.settings.fullDescription = this.optionalString(settings.fullDescription);
				if ('sessionDays' in settings) update.settings.sessionDays = Array.isArray(settings.sessionDays) ?
					settings.sessionDays.map(value => this.string(value)) : [];
				if ('sessionTimes' in settings) update.settings.sessionTimes = settings.sessionTimes &&
					typeof settings.sessionTimes === 'object' && !Array.isArray(settings.sessionTimes) ?
					Object.fromEntries(Object.entries(settings.sessionTimes).map(([day, value]) => [day, this.string(value)])) : {};
				if ('inDevelopment' in settings) update.settings.inDevelopment = settings.inDevelopment === true;
			}
			const table = this.login.accounts.updateTable(
				this.token(req), decodeURIComponent(version2TableArchiveMatch[1]), update
			);
			await this.login.flushPersistence(); this.json(res, 200, { table }); return;
		}
		if (method === 'DELETE' && version2TableArchiveMatch) {
			const table = this.login.accounts.archiveTable(this.token(req), decodeURIComponent(version2TableArchiveMatch[1]),
				await this.optionalAuditReason(req));
			await this.login.flushPersistence(); this.json(res, 200, { table }); return;
		}
		const version2TableReactivateMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/reactivate$/.exec(url.pathname);
		if (method === 'POST' && version2TableReactivateMatch) {
			const table = this.login.accounts.reactivateTable(this.token(req),
				decodeURIComponent(version2TableReactivateMatch[1]));
			await this.login.flushPersistence(); this.json(res, 200, { table }); return;
		}
		const version2TablePermanentDeleteMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/permanent$/.exec(url.pathname);
		if (method === 'DELETE' && version2TablePermanentDeleteMatch) {
			this.login.accounts.deleteArchivedTable(this.token(req), decodeURIComponent(version2TablePermanentDeleteMatch[1]));
			await this.login.flushPersistence(); this.json(res, 200, { ok: true }); return;
		}
		const version2TableBackupMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/backup$/.exec(url.pathname);
		if (version2TableBackupMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2TableBackupMatch[1]);
			const ownedTable = this.login.accounts.requireTableOwner(token, tableId);
			const persistence = this.login.mysqlPersistence;
			if (!persistence) throw new Error('O backup requer a persistência MySQL');
			if (method === 'GET') {
				const scope = url.searchParams.get('scope') || 'complete';
				const world = await persistence.withAdvisoryLock('pokemon-rpg:table:' + tableId,
					() => persistence.exportTableWorld(tableId));
				const table = ownedTable;
				if (scope === 'characters') {
					this.login.accounts.recordAdministrativeSuccess(token, tableId, 'table.characters.exported', 'table', tableId);
					this.json(res, 200, { format: 'pokemon-rpg-characters', version: 1, exportedAt: Date.now(),
						table: { id: table.id, name: table.name }, characters: world.characters }); return;
				}
				if (scope === 'documents') {
					this.login.accounts.recordAdministrativeSuccess(token, tableId, 'table.documents.exported', 'table', tableId);
					this.json(res, 200, { format: 'pokemon-rpg-documents', version: 1, exportedAt: Date.now(),
						table: { id: table.id, name: table.name }, documents: world.playerDocuments }); return;
				}
				const tableBackup = { name: table.name, description: table.description, color: table.color,
					visibility: table.visibility, settings: table.settings };
				const checksum = createHash('sha256').update(JSON.stringify({ table: tableBackup, world })).digest('hex');
				this.login.accounts.recordAdministrativeSuccess(token, tableId, 'table.backup.exported', 'table', tableId);
				this.json(res, 200, {
					format: 'pokemon-rpg-table-backup', version: 1, exportedAt: Date.now(), checksum,
					table: tableBackup, world,
				}); return;
			}
			if (method === 'PUT') {
				const body = await this.body(req); const backup = body.backup as Record<string, unknown> | undefined;
				if (!backup || backup.format !== 'pokemon-rpg-table-backup' || backup.version !== 1) {
					throw new Error('Arquivo de backup inválido ou incompatível');
				}
				const expectedChecksum = createHash('sha256').update(JSON.stringify({
					table: backup.table, world: backup.world,
				})).digest('hex');
				if (typeof backup.checksum !== 'string' || backup.checksum !== expectedChecksum) {
					throw new Error('O backup está corrompido ou foi alterado');
				}
				const world = this.tableBackupWorld(backup.world);
				const table = backup.table && typeof backup.table === 'object' && !Array.isArray(backup.table) ?
					backup.table as Record<string, unknown> : {};
				await persistence.withAdvisoryLock('pokemon-rpg:table:' + tableId, () =>
					persistence.transactionAsync(async () => {
						await persistence.replaceTableWorld(tableId, world);
						this.login.accounts.updateTable(token, tableId, {
							...(typeof table.name === 'string' ? { name: table.name } : {}),
							...(typeof table.description === 'string' ? { description: table.description } : {}),
							...(typeof table.color === 'string' ? { color: table.color } : {}),
							...(['private', 'code', 'public'].includes(String(table.visibility)) ?
								{ visibility: table.visibility as 'private' | 'code' | 'public' } : {}),
							...(table.settings && typeof table.settings === 'object' && !Array.isArray(table.settings) &&
								typeof (table.settings as Record<string, unknown>).requireJoinApproval === 'boolean' ?
								{ requireJoinApproval: (table.settings as Record<string, unknown>).requireJoinApproval as boolean } : {}),
							...(table.settings && typeof table.settings === 'object' && !Array.isArray(table.settings) ?
								{ settings: table.settings as Record<string, unknown> } : {}),
						});
						this.login.accounts.recordAdministrativeSuccess(token, tableId, 'table.backup.restored', 'table', tableId);
					}));
				this.tableSessionStores.delete(tableId); this.tableDeletionStores.delete(tableId);
				this.battleRuntimeManagers.delete(tableId);
				this.contestRuntimeManagers.delete(tableId); this.localTableServices.delete(tableId);
				this.json(res, 200, { ok: true }); return;
			}
		}
		const version2PermissionsMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/permissions$/.exec(url.pathname);
		if (method === 'GET' && version2PermissionsMatch) {
			const permissions = this.login.accounts.getTablePermissions(
				this.token(req), decodeURIComponent(version2PermissionsMatch[1])
			);
			await this.login.flushPersistence();
			this.json(res, 200, { permissions });
			return;
		}
		const version2AuditMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/audit$/.exec(url.pathname);
		if (method === 'GET' && version2AuditMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2AuditMatch[1]);
			const limit = Number(url.searchParams.get('limit') || 100);
			// Autoriza antes da consulta direta, inclusive quando o cache ainda não contém esta mesa.
			this.login.accounts.listAudit(token, tableId, 1);
			if (this.login.mysqlPersistence) {
				this.login.accounts.replaceAuditEntries(tableId,
					await this.login.mysqlPersistence.loadAuditEntries(tableId, limit));
			}
			const entries = this.login.accounts.listAudit(token, tableId, limit);
			await this.login.flushPersistence(); this.json(res, 200, { entries }); return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/invites/join') {
			const token = this.token(req); const body = await this.body(req);
			const membership = this.login.accounts.joinByInvite(token, this.string(body.code));
			await this.login.flushPersistence();
			this.json(res, 200, { membership, pending: membership.status === 'pending' });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/v2/tables/discover') {
			this.json(res, 200, { tables: this.login.accounts.discoverTables(this.token(req)) });
			return;
		}
		const version2PublicJoinMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/join$/.exec(url.pathname);
		if (method === 'POST' && version2PublicJoinMatch) {
			const membership = this.login.accounts.joinPublicTable(
				this.token(req), decodeURIComponent(version2PublicJoinMatch[1])
			);
			await this.login.flushPersistence();
			this.json(res, 200, { membership, pending: membership.status === 'pending' });
			return;
		}
		const version2FavoriteMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/favorite$/.exec(url.pathname);
		if (method === 'PATCH' && version2FavoriteMatch) {
			const body = await this.body(req);
			const membership = this.login.accounts.setTableFavorite(this.token(req),
				decodeURIComponent(version2FavoriteMatch[1]), body.favorite === true);
			await this.login.flushPersistence(); this.json(res, 200, { membership }); return;
		}
		const version2TableDetailsMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/details$/.exec(url.pathname);
		if (method === 'GET' && version2TableDetailsMatch) {
			const details = this.login.accounts.getTableCardDetails(
				this.token(req), decodeURIComponent(version2TableDetailsMatch[1])
			);
			this.json(res, 200, { details }); return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/v2/invites/directed') {
			this.json(res, 200, { invites: this.login.accounts.listDirectedInvites(this.token(req)) });
			return;
		}
		const directedInviteMatch = /^\/api\/rpg\/v2\/invites\/directed\/([^/]+)$/.exec(url.pathname);
		if (directedInviteMatch && method === 'POST') {
			const membership = this.login.accounts.acceptDirectedInvite(this.token(req), decodeURIComponent(directedInviteMatch[1]));
			await this.login.flushPersistence(); this.json(res, 200, { membership }); return;
		}
		if (directedInviteMatch && method === 'DELETE') {
			this.login.accounts.declineDirectedInvite(this.token(req), decodeURIComponent(directedInviteMatch[1]));
			await this.login.flushPersistence(); this.json(res, 200, { ok: true }); return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/v2/invites/preview') {
			const body = await this.body(req);
			const preview = this.login.accounts.previewInvite(this.token(req), this.string(body.code));
			await this.login.flushPersistence(); this.json(res, 200, { preview }); return;
		}
		const version2JoinRequestsMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/join-requests(?:\/([^/]+))?$/.exec(url.pathname);
		if (version2JoinRequestsMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2JoinRequestsMatch[1]);
			if (method === 'GET' && !version2JoinRequestsMatch[2]) {
				const requests = this.login.accounts.listJoinRequests(token, tableId);
				await this.login.flushPersistence(); this.json(res, 200, { requests }); return;
			}
			if (method === 'POST' && version2JoinRequestsMatch[2]) {
				const body = await this.body(req);
				const membership = this.login.accounts.resolveJoinRequest(token, tableId,
					decodeURIComponent(version2JoinRequestsMatch[2]), body.allow === true);
				await this.login.flushPersistence(); this.json(res, 200, { membership }); return;
			}
		}
		const version2TableMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/(invites|select)$/.exec(url.pathname);
		if (version2TableMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2TableMatch[1]);
			if (method === 'POST' && version2TableMatch[2] === 'select') {
				const session = this.login.accounts.selectTable(token, tableId);
				await this.login.flushPersistence();
				this.json(res, 200, { session });
				return;
			}
			if (method === 'GET' && version2TableMatch[2] === 'invites') {
				const invites = this.login.accounts.listInvites(token, tableId);
				await this.login.flushPersistence();
				this.json(res, 200, { invites });
				return;
			}
			if (method !== 'POST' || version2TableMatch[2] !== 'invites') {
				this.json(res, 405, { error: 'Método não permitido' });
				return;
			}
			const body = await this.body(req); const role = this.string(body.role) || 'player';
			const expiresAt = typeof body.expiresAt === 'number' ? body.expiresAt : undefined;
			const maxUses = typeof body.maxUses === 'number' ? body.maxUses : 1;
			const rawTargetHandles = body.targetHandles;
			const multipleTargets = Array.isArray(rawTargetHandles);
			const targetHandles = multipleTargets ? rawTargetHandles.map(value => this.string(value)) :
				(this.optionalString(body.targetUsername) ? [this.string(body.targetUsername)] : []);
			if (targetHandles.length) {
				const invites = this.login.accounts.createDirectedInvites(
					token, tableId, role as 'master' | 'player', expiresAt, targetHandles
				);
				await this.login.flushPersistence();
				const safeInvites = invites.map(({ codeHash: _codeHash, ...invite }) => invite);
				this.json(res, 201, multipleTargets ? { invites: safeInvites } : { invite: safeInvites[0] });
				return;
			}
			const invitation = this.login.accounts.createInvite(
				token, tableId, role as 'master' | 'player', expiresAt, maxUses
			);
			await this.login.flushPersistence();
			const { codeHash: _codeHash, ...safeInvite } = invitation.invite;
			this.json(res, 201, {
				invite: safeInvite,
				...(invitation.invite.targetAccountId ? {} : { code: invitation.code }),
			});
			return;
		}
		const version2InviteMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/invites\/([^/]+)$/.exec(url.pathname);
		if (method === 'DELETE' && version2InviteMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2InviteMatch[1]);
			const invite = this.login.accounts.revokeInvite(token, tableId, decodeURIComponent(version2InviteMatch[2]),
				await this.optionalAuditReason(req));
			await this.login.flushPersistence();
			this.json(res, 200, { invite });
			return;
		}
		const version2MembersMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/members$/.exec(url.pathname);
		if (method === 'GET' && version2MembersMatch) {
			const tableId = decodeURIComponent(version2MembersMatch[1]);
			const members = this.login.accounts.listMembers(this.token(req), tableId);
			if (this.login.mysqlPersistence) {
				const characters = await this.login.mysqlPersistence.listTableMemberCharacters(tableId);
				for (const entry of members) entry.characters = characters.get(entry.account.id) || [];
			}
			await this.login.flushPersistence();
			this.json(res, 200, { members });
			return;
		}
		const version2MemberMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/members\/([^/]+)(?:\/(block|ownership|note|permissions))?$/.exec(url.pathname);
		if (version2MemberMatch) {
			const token = this.token(req); const tableId = decodeURIComponent(version2MemberMatch[1]);
			const accountId = decodeURIComponent(version2MemberMatch[2]);
			if (method === 'PATCH' && !version2MemberMatch[3]) {
				const body = await this.body(req);
				const member = this.login.accounts.changeMemberRole(
					token, tableId, accountId, this.string(body.role) as 'master' | 'player',
					this.optionalString(body.reason)
				);
				await this.login.flushPersistence(); this.json(res, 200, { member }); return;
			}
			if (method === 'POST' && version2MemberMatch[3] === 'ownership') {
				const table = this.login.accounts.transferOwnership(token, tableId, accountId);
				await this.login.flushPersistence(); this.json(res, 200, { table }); return;
			}
			if (method === 'PUT' && version2MemberMatch[3] === 'note') {
				const body = await this.body(req);
				const member = this.login.accounts.updateMemberNote(token, tableId, accountId, this.optionalString(body.note) || '');
				await this.login.flushPersistence(); this.json(res, 200, { member }); return;
			}
			if (method === 'PUT' && version2MemberMatch[3] === 'permissions') {
				const body = await this.body(req);
				const raw = body.permissions && typeof body.permissions === 'object' && !Array.isArray(body.permissions) ?
					body.permissions as Record<string, unknown> : {};
				const permissions = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'boolean'));
				const member = this.login.accounts.updateMasterPermissions(token, tableId, accountId, permissions);
				await this.login.flushPersistence(); this.json(res, 200, { member }); return;
			}
			if ((method === 'DELETE' && !version2MemberMatch[3]) ||
				(method === 'POST' && version2MemberMatch[3] === 'block')) {
				const member = this.login.accounts.removeMember(token, tableId, accountId,
					Boolean(version2MemberMatch[3]), await this.optionalAuditReason(req));
				await this.login.flushPersistence(); this.json(res, 200, { member }); return;
			}
		}
		const version2LeaveMatch = /^\/api\/rpg\/v2\/tables\/([^/]+)\/membership$/.exec(url.pathname);
		if (method === 'DELETE' && version2LeaveMatch) {
			const member = this.login.accounts.leaveTable(this.token(req), decodeURIComponent(version2LeaveMatch[1]),
				await this.optionalAuditReason(req));
			await this.login.flushPersistence(); this.json(res, 200, { member }); return;
		}
		if (url.pathname === '/api/rpg/campaign/settings') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { settings: this.login.getCampaignSettings(token) });
				return;
			}
			if (method === 'PUT') {
				const body = await this.body(req);
				this.json(res, 200, { settings: this.login.setCampaignSettings(token, body) });
				return;
			}
		}
		if (method === 'GET' && url.pathname === '/api/rpg/campaign/clock') {
			this.json(res, 200, this.login.getCampaignClock(this.token(req)));
			return;
		}
		if (url.pathname === '/api/rpg/campaign/map-places') {
			if (method === 'GET') {
				const token = this.token(req);
				this.json(res, 200, { positions: this.login.getCampaignMapPlaces(token),
					customPlaces: this.login.getCampaignCustomMapPlaces(token),
					markerPosition: this.login.getCampaignMapMarker(token),
					travel: this.login.getCampaignMapTravel(token) });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, { place: this.login.createCampaignMapPlace(this.token(req),
					body.id, body.name, body.x, body.y) });
				return;
			}
			if (method === 'PUT') {
				const body = await this.body(req);
				this.json(res, 200, { position: this.login.setCampaignMapPlace(this.token(req),
					body.id, body.x, body.y) });
				return;
			}
			if (method === 'DELETE') {
				const body = await this.body(req);
				this.login.removeCampaignMapPlace(this.token(req), body.id);
				this.json(res, 200, { removed: true });
				return;
			}
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/map-marker') {
			const body = await this.body(req);
			this.json(res, 200, { position: this.login.setCampaignMapMarker(this.token(req), body.x, body.y) });
			return;
		}
		if (url.pathname === '/api/rpg/campaign/map-cursors') {
			if (method === 'GET') {
				this.json(res, 200, { cursors: this.login.getCampaignMapCursors(this.token(req)) });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.login.setCampaignMapCursor(this.token(req), body.active, body.x, body.y);
				this.json(res, 200, { active: body.active === true });
				return;
			}
		}
		if (url.pathname === '/api/rpg/campaign/map-travel') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getCampaignMapTravelOptions(this.token(req)));
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 200, { travel: this.login.startCampaignMapTravel(
					this.token(req), body.route, body.durationHours, body.plan) });
				return;
			}
			if (method === 'DELETE') {
				this.json(res, 200, this.login.stopCampaignMapTravel(this.token(req)));
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/campaign/map-travel/preview') {
			const body = await this.body(req);
			this.json(res, 200, this.login.previewCampaignMapTravel(this.token(req), body.route, body.plan));
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/quick-notes') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setCampaignQuickNotes(this.token(req), body.notes));
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/scene-npcs') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setCampaignSceneNPCs(this.token(req), body.ids));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/campaign/scene-npcs') {
			this.json(res, 200, this.login.getCampaignSceneNPCs(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/campaign/scene-npcs/roll') {
			const token = this.token(req);
			const session = this.login.getSession(token);
			const persistence = this.login.mysqlPersistence;
			if (!persistence || !session.platformTableId || !session.platformAccountId) {
				throw new RPGHttpError(503, 'As rolagens no chat requerem o banco de dados');
			}
			const body = await this.body(req);
			const result = this.login.rollSceneNPCCheck(token, this.string(body.npcId), this.string(body.kind),
				this.string(body.key), this.string(body.mode));
			await persistence.createTableChatMessage(session.platformTableId, session.platformAccountId, result.message);
			this.json(res, 200, result);
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/scene-npcs/combat') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setSceneNPCCombat(this.token(req), this.string(body.npcId),
				body as Parameters<RPGLoginService['setSceneNPCCombat']>[2]));
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/scene-npcs/reveal') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setCampaignScenePokemonReveal(
				this.token(req), body.npcId, body.index, body.revealed));
			return;
		}
		if (method === 'DELETE' && url.pathname === '/api/rpg/campaign/events') {
			const body = await this.body(req);
			this.json(res, 200, this.login.dismissCampaignEvent(this.token(req), body.eventId));
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/campaign/player-note') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setCampaignPlayerNote(this.token(req), body.characterId, body.note));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/presence') {
			const body = await this.body(req);
			this.json(res, 200, this.login.updatePlayerPresence(this.token(req), body.area, body.idle));
			return;
		}
		if (url.pathname === '/api/rpg/master-npc-library') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { library: this.login.getMasterNPCLibrary(token) });
				return;
			}
			if (method === 'PUT') {
				const body = await this.body(req);
				this.json(res, 200, { library: this.login.setMasterNPCLibrary(token, body.library) });
				return;
			}
		}
		if (method === 'POST' && url.pathname === '/api/rpg/master-npc-library/heal') {
			const body = await this.body(req);
			this.json(res, 200, { npc: this.login.healMasterNPC(this.token(req),
				this.string(body.npcId), body.pokemonIndex === undefined ? undefined : Number(body.pokemonIndex)) });
			return;
		}
		if (url.pathname === '/api/rpg/documents') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { library: this.login.getPlayerDocuments(token) });
				return;
			}
			if (method === 'PUT') {
				const body = await this.body(req);
				this.json(res, 200, { library: this.login.setPlayerDocuments(token, body.library) });
				return;
			}
		}
		if (method === 'GET' && url.pathname === '/api/rpg/bank') {
			this.json(res, 200, { bank: this.login.getBank(
				this.token(req), url.searchParams.get('characterId') || undefined
			) });
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/characters/money') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.adjustCharacterMoney(
				this.token(req), this.string(body.characterId),
				this.string(body.operation) as 'add' | 'remove', Number(body.amount)
			) });
			return;
		}
		if (method === 'PATCH' && url.pathname === '/api/rpg/profile/tagline') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.setTrainerTagline(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.tagline)
			) });
			return;
		}
		if (method === 'PATCH' && url.pathname === '/api/rpg/profile/pokedex/seen') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.markPokedexSpeciesSeen(
				this.token(req), this.string(body.characterId), this.string(body.species)
			) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/profile/pokedex/moves') {
			const token = this.token(req);
			const character = this.login.getCharacter(token, url.searchParams.get('characterId') || undefined);
			const species = url.searchParams.get('species') || '';
			const id = Dex.mod('gen9').species.get(species).id;
			const caught = new Set(character.profile?.pokedex?.caught || []).has(id);
			this.json(res, 200, { caught, moves: getRPGPokedexMoves(species, caught) });
			return;
		}
		if (method === 'POST' && (url.pathname === '/api/rpg/bank/deposit' || url.pathname === '/api/rpg/bank/redeem')) {
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			const bank = url.pathname.endsWith('/deposit') ?
				this.login.depositBank(this.token(req), characterId, Number(body.amount), Number(body.expectedRevision)) :
				this.login.redeemBank(this.token(req), characterId, Number(body.amount), Number(body.expectedRevision));
			this.json(res, 200, { bank });
			return;
		}
		if (method === 'PUT' && url.pathname === '/api/rpg/characters/shop-access') {
			const body = await this.body(req);
			this.json(res, 200, { character: this.login.setCharacterShopAccess(
				this.token(req), this.string(body.characterId), this.string(body.shopId), body.allowed === true
			) });
			return;
		}
		if (url.pathname === '/api/rpg/characters/shared-inventories') {
			if (method === 'GET') {
				this.json(res, 200, this.login.getCharacterSharedInventories(this.token(req),
					url.searchParams.get('characterId') || ''));
				return;
			}
			if (method === 'PUT') {
				const body = await this.body(req);
				this.json(res, 200, this.login.setCharacterSharedInventoryAccess(this.token(req),
					this.string(body.characterId), this.string(body.inventoryId), body.allowed === true));
				return;
			}
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
				decodeURIComponent(transferTargetsMatch[1]), url.searchParams.get('linkedEggId') || undefined
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
				typeof body.note === 'string' ? body.note : undefined,
				typeof body.linkedEggId === 'string' ? body.linkedEggId : undefined
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
				this.string(body.itemId), Number(body.quantity), Number(body.expectedRevision),
				typeof body.linkedEggId === 'string' ? body.linkedEggId : undefined,
				typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/bag/transfer') {
			const body = await this.body(req);
			this.json(res, 200, this.login.transferBagItem(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				this.string(body.targetCharacterId), this.string(body.itemId), Number(body.quantity),
				Number(body.expectedSenderRevision), Number(body.expectedTargetRevision),
				typeof body.linkedEggId === 'string' ? body.linkedEggId : undefined,
				typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
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
				(body.operation || 'set') as 'add' | 'remove' | 'set',
				typeof body.quality === 'string' ? body.quality as import('./fossil-lab').RPGFossilQuality : undefined
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
		if (method === 'GET' && url.pathname === '/api/rpg/bag/fossil-identification') {
			this.json(res, 200, this.login.identifyBagFossil(this.token(req),
				url.searchParams.get('characterId') || undefined, url.searchParams.get('itemId') || ''));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/team-presets') {
			const body = await this.body(req);
			this.json(res, 201, { character: this.login.createTeamPreset(
				this.token(req), typeof body.characterId === 'string' ? body.characterId : undefined,
				{ name: this.string(body.name), species: body.species as string[], pokemonIds: body.pokemonIds as (string | null)[] }
			) });
			return;
		}
		const teamPresetMatch = /^\/api\/rpg\/team-presets\/([^/]+)(?:\/(apply))?$/.exec(url.pathname);
		if (teamPresetMatch) {
			const presetId = decodeURIComponent(teamPresetMatch[1]);
			const action = teamPresetMatch[2];
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			if (method === 'PATCH' && !action) {
				this.json(res, 200, { character: this.login.updateTeamPreset(
					this.token(req), characterId, presetId,
					{ name: this.string(body.name), species: body.species as string[], pokemonIds: body.pokemonIds as (string | null)[] }
				) });
				return;
			}
			if (method === 'DELETE' && !action) {
				this.json(res, 200, { character: this.login.deleteTeamPreset(
					this.token(req), characterId, presetId
				) });
				return;
			}
			if (method === 'POST' && action === 'apply') {
				this.json(res, 200, { character: this.login.applyTeamPreset(
					this.token(req), characterId, presetId, Number(body.expectedRevision)
				) });
				return;
			}
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

		const teamBuilderMatch = /^\/api\/rpg\/team-builder\/([^/]+)(?:\/(train-ev|use-vitamin|reorder-moves|nickname))?$/.exec(
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
			if (method === 'POST' && action === 'nickname') {
				this.json(res, 200, { teamBuilder: this.login.renamePokemonFromTeamBuilder(
					this.token(req), characterId, pokemonId, this.string(body.nickname), Number(body.expectedRevision)
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
						(body.metadata || {}),
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
						(body.edit || {}),
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
			this.json(res, 200, { nursery: this.login.getNursery(
				this.token(req), url.searchParams.get('characterId') || undefined
			) });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/nursery/examine') {
			const body = await this.body(req);
			this.json(res, 200, { examination: this.login.examineNurseryEgg(this.token(req),
				this.string(body.eggId), typeof body.breederId === 'string' ? body.breederId : undefined) });
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/first-care') {
			this.json(res, 200, this.login.getFirstCareCandidates(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/emergency-care') {
			this.json(res, 200, this.login.getEmergencyCareCandidates(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/reanimation') {
			this.json(res, 200, this.login.getReanimationCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/reanimation') {
			const token = this.token(req);
			const body = await this.body(req);
			const result = this.login.performReanimation(token, {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
				mode: this.string(body.mode) as 'normal' | 'advantage' | 'disadvantage',
				talents: Array.isArray(body.talents) ? body.talents.map(value => this.string(value)) : [],
			});
			if (!result.repeated) {
				const session = this.login.getSession(token);
				if (session.platformTableId && session.platformAccountId && this.login.mysqlPersistence) {
					await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId,
						session.platformAccountId, result.message);
				}
			}
			this.json(res, 200, result);
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/burn-treatment') {
			this.json(res, 200, this.login.getBurnTreatmentCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/burn-treatment') {
			const body = await this.body(req);
			this.json(res, 200, this.login.treatTrainerBurn(this.token(req), {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
			}));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/neuromuscular-treatment') {
			this.json(res, 200, this.login.getNeuromuscularTreatmentCandidates(this.token(req)));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/controlled-warming') {
			this.json(res, 200, this.login.getControlledWarmingCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/controlled-warming') {
			const body = await this.body(req);
			this.json(res, 200, this.login.treatTrainerCold(this.token(req), {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
			}));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/neurological-response') {
			this.json(res, 200, this.login.getNeurologicalResponseCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/neurological-response') {
			const body = await this.body(req);
			this.json(res, 200, this.login.treatTrainerNeurologicalCondition(this.token(req), {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
				conditionId: this.string(body.conditionId) as 'adormecido' | 'confuso',
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/neuromuscular-treatment') {
			const body = await this.body(req);
			this.json(res, 200, this.login.treatTrainerNeuromuscularCondition(this.token(req), {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
				conditionId: this.string(body.conditionId) as 'paralisado' | 'atordoado',
			}));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/preventive-protocol') {
			this.json(res, 200, this.login.getPreventiveProtocolCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/preventive-protocol') {
			const body = await this.body(req);
			this.json(res, 200, this.login.preparePreventiveProtocol(this.token(req), {
				requestId: this.string(body.requestId),
				recipientIds: Array.isArray(body.recipientIds) ? body.recipientIds.map(id => this.string(id)) : [],
				risk: this.string(body.risk),
			}));
			return;
		}
		if (method === 'GET' && url.pathname === '/api/rpg/trainer/integrated-medicine') {
			this.json(res, 200, this.login.getIntegratedMedicineCandidates(this.token(req)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/integrated-medicine') {
			const body = await this.body(req);
			const token = this.token(req);
			const result = this.login.performIntegratedMedicine(token, {
				requestId: this.string(body.requestId), characterId: this.string(body.characterId),
				pokemonId: this.string(body.pokemonId),
			});
			if (!result.repeated && result.supplyRoll !== null) {
				const session = this.login.getSession(token);
				if (session.platformTableId && session.platformAccountId && this.login.mysqlPersistence) {
					await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId,
						session.platformAccountId, `Gestão de Suprimentos Médicos em ${result.pokemonName}: ` +
						`1d6 tirou ${result.supplyRoll}. ` +
						(result.chargeSaved ? 'Carga preservada.' : 'Carga consumida.')).catch(() => {});
				}
			}
			this.json(res, 200, result);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/emergency-care') {
			const body = await this.body(req);
			const token = this.token(req);
			const result = this.login.performEmergencyCare(token, {
				requestId: this.string(body.requestId), patientId: this.string(body.patientId),
				revitalizing: body.revitalizing === true,
				emergencyMedicine: body.emergencyMedicine === true,
			});
			if (!result.repeated && result.supplyRoll !== null) {
				const session = this.login.getSession(token);
				if (session.platformTableId && session.platformAccountId && this.login.mysqlPersistence) {
					await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId,
						session.platformAccountId, `Gestão de Suprimentos Médicos em ${result.patientName}: ` +
						(result.supplyRolls || [result.supplyRoll]).map(roll => `1d6 tirou ${roll}`).join('; ') +
						`. Cargas restantes: ${result.chargesRemaining}.`).catch(() => {});
				}
			}
			this.json(res, 200, result);
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/extraordinary-recovery') {
			const body = await this.body(req);
			this.json(res, 200, this.login.setExtraordinaryRecoveryPatient(this.token(req),
				body.patientId === null ? null : this.string(body.patientId)));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/assisted-recovery') {
			const body = await this.body(req);
			this.json(res, 200, this.login.scheduleAssistedRecovery(this.token(req), {
				requestId: this.string(body.requestId),
				patientIds: Array.isArray(body.patientIds) ? body.patientIds.map(id => this.string(id)) : [],
				intensive: body.intensive === true,
				exhaustionPatientIds: Array.isArray(body.exhaustionPatientIds) ?
					body.exhaustionPatientIds.map(id => this.string(id)) : [],
			}));
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/trainer/first-care') {
			const body = await this.body(req);
			const token = this.token(req);
			const result = this.login.performFirstCare(token,
				this.string(body.characterId), this.string(body.pokemonId));
			if (result.supplyRoll !== null) {
				const session = this.login.getSession(token);
				if (session.platformTableId && session.platformAccountId && this.login.mysqlPersistence) {
					await this.login.mysqlPersistence.createTableChatMessage(session.platformTableId,
						session.platformAccountId, `${result.breederName} usou Socorro Bem Administrado em ` +
						`${result.pokemonName}.\n1d6 tirou ${result.supplyRoll}: ` +
						(result.chargeSaved ? 'carga do Kit de Medicina Pokémon preservada.' :
						'1 carga do Kit de Medicina Pokémon consumida.'));
				}
			}
			this.json(res, 200, result);
			return;
		}
		const nurseryAction = /^\/api\/rpg\/nursery\/(create|master-slot1|accept|master-slot2|master-cancel|withdraw-slot2|confirm|cancel|collect-parent|collect|collect-local|insert|remove|portable-start|portable-stop|restore-released|delete-released|shop-buy|hatch)$/.exec(url.pathname);
		if (method === 'POST' && nurseryAction) {
			const body = await this.body(req);
			const characterId = typeof body.characterId === 'string' ? body.characterId : undefined;
			let result;
			switch (nurseryAction[1]) {
				case 'create':
					result = { nursery: this.login.createNurseryProject(
						this.token(req), characterId, this.string(body.pokemonId)
					) };
					break;
				case 'master-slot1':
					result = { nursery: this.login.createMasterNurseryProject(this.token(req), {
						npcName: this.string(body.npcName),
						species: this.string(body.species),
						sex: this.string(body.sex) as import('./nursery').RPGNurseryMasterSlot1Input['sex'],
						level: Number(body.level),
						ivs: body.ivs as import('./nursery').RPGNurseryMasterSlot1Input['ivs'],
						item: this.string(body.item) as import('./nursery').RPGNurseryMasterSlot1Input['item'],
					}) };
					break;
				case 'accept':
					result = { nursery: this.login.acceptNurseryInvitation(
						this.token(req), this.string(body.projectId), this.string(body.pokemonId)
					) };
					break;
				case 'master-slot2':
					result = { nursery: this.login.setMasterNurserySlot2(this.token(req), {
						projectId: this.string(body.projectId),
						species: this.string(body.species),
						level: Number(body.level),
						ivs: body.ivs as import('./nursery').RPGNurseryMasterSlot2Input['ivs'],
						item: this.string(body.item) as import('./nursery').RPGNurseryMasterSlot2Input['item'],
					}) };
					break;
				case 'master-cancel':
					result = { nursery: this.login.cancelMasterNurseryProject(
						this.token(req), this.string(body.projectId)
					) };
					break;
				case 'withdraw-slot2':
					result = { nursery: this.login.withdrawNurserySlot2(
						this.token(req), this.string(body.projectId)
					) };
					break;
				case 'confirm':
					result = { nursery: this.login.confirmNurseryProject(
						this.token(req), this.string(body.projectId),
						body.requestedPokecoins === undefined ? undefined : Number(body.requestedPokecoins)
					) };
					break;
				case 'cancel':
					result = { nursery: this.login.cancelNurseryProject(this.token(req), this.string(body.projectId)) };
					break;
				case 'collect-parent':
					result = { nursery: this.login.collectNurseryParent(this.token(req), this.string(body.projectId)) };
					break;
				case 'collect':
					result = { nursery: this.login.collectNurseryEgg(this.token(req), this.string(body.projectId)) };
					break;
				case 'collect-local':
					result = { nursery: this.login.collectNurseryEggToLocal(
						this.token(req), this.string(body.projectId), this.string(body.incubatorId)
					) };
					break;
				case 'insert':
					result = { nursery: this.login.insertNurseryEgg(
						this.token(req), this.string(body.eggId), this.string(body.incubatorId)
					) };
					break;
				case 'portable-start':
					result = { nursery: this.login.startPortableNurseryIncubator(
						this.token(req), this.string(body.eggId)
					) };
					break;
				case 'portable-stop':
					result = this.login.stopPortableNurseryIncubator(
						this.token(req), this.string(body.eggId)
					);
					break;
				case 'remove':
					result = this.login.removeNurseryEgg(this.token(req), this.string(body.eggId));
					break;
				case 'restore-released':
					result = this.login.restoreReleasedNurseryPokemon(
						this.token(req), this.string(body.releasedId)
					);
					break;
				case 'delete-released':
					result = this.login.deleteReleasedNurseryPokemon(
						this.token(req), this.string(body.releasedId)
					);
					break;
				case 'shop-buy':
					result = { nursery: this.login.purchaseNurseryItem(
						this.token(req), characterId, this.string(body.itemId),
						Number(body.quantity), Number(body.expectedBagRevision)
					) };
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
		if (method === 'GET' && url.pathname === '/api/rpg/contest-moves') {
			this.login.getSession(this.token(req));
			this.json(res, 200, { moves: getRPGContestMoveCatalog() });
			return;
		}
		if (method === 'POST' && url.pathname === '/api/rpg/box/give') {
			const body = await this.body(req);
			this.json(res, 200, {
				gift: this.login.giveTeamPokemon(
					this.token(req), this.string(body.toCharacterId), this.string(body.pokemonId),
					Number(body.sourceRevision)
				),
			});
			return;
		}
		if (url.pathname === '/api/rpg/tournaments') {
			const token = this.token(req);
			if (method === 'GET') { this.json(res, 200, { tournaments: this.login.listTournaments(token) }); return; }
			if (method === 'POST') { const body = await this.body(req); this.json(res, 201, { tournament: this.login.createTournament(token, body as never) }); return; }
		}
		const tournamentMatch = /^\/api\/rpg\/tournaments\/([^/]+)(?:\/(start|report|launch|cancel|roster))?$/.exec(url.pathname);
		if (tournamentMatch) {
			const token = this.token(req); const id = decodeURIComponent(tournamentMatch[1]); const action = tournamentMatch[2];
			if (method === 'GET' && !action) { this.json(res, 200, { tournament: this.login.getTournament(token, id) }); return; }
			if (method === 'POST' && action === 'start') { this.json(res, 200, { tournament: this.login.startTournament(token, id) }); return; }
			if (method === 'POST' && action === 'roster') { const body = await this.body(req); this.json(res, 200, { tournament: this.login.setTournamentRoster(token, id, Array.isArray(body.pokemonIds) ? body.pokemonIds.map(value => this.string(value)) : []) }); return; }
			if (method === 'POST' && action === 'report') { const body = await this.body(req); this.json(res, 200, { tournament: this.login.reportTournamentMatch(token, id, this.string(body.matchId), this.string(body.winnerId)) }); return; }
			if (method === 'POST' && action === 'launch') { const body = await this.body(req); this.json(res, 200, this.login.launchTournamentMatch(token, id, this.string(body.matchId), body.npcSelections && typeof body.npcSelections === 'object' ? body.npcSelections as Record<string, number[]> : {})); return; }
			if (method === 'POST' && action === 'cancel') { this.json(res, 200, { tournament: this.login.cancelTournament(token, id) }); return; }
		}
		if (method === 'GET' && url.pathname === '/api/rpg/contest-pokemon-moves') {
			this.login.getSession(this.token(req));
			this.json(res, 200, { moves: getRPGContestPokemonMoveCatalog(
				url.searchParams.get('species') || '', Number(url.searchParams.get('level') || 1)
			) });
			return;
		}
		if (url.pathname === '/api/rpg/contest-combos') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { combos: this.login.listContestCombos(token) });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 201, { combo: this.login.createContestCombo(token, body as never) });
				return;
			}
		}
		const contestComboMatch = /^\/api\/rpg\/contest-combos\/([^/]+)$/.exec(url.pathname);
		if (contestComboMatch && method === 'DELETE') {
			this.json(res, 200, { deleted: this.login.deleteContestCombo(
				this.token(req), decodeURIComponent(contestComboMatch[1])
			) });
			return;
		}
		if (url.pathname === '/api/rpg/contest-sessions') {
			const token = this.token(req);
			if (method === 'GET') {
				this.json(res, 200, { contestSessions: this.login.listContestSessions(token) });
				return;
			}
			if (method === 'POST') {
				const body = await this.body(req);
				this.json(res, 201, { contestSession: this.login.createContestSession(token, {
					name: typeof body.name === 'string' ? body.name : undefined,
				}) });
				return;
			}
		}
		const contestMatch = /^\/api\/rpg\/contest-sessions\/([^/]+)(?:\/(invite|response|selection|start|runtime|action))?$/.exec(url.pathname);
		if (contestMatch) {
			const token = this.token(req);
			const contestSessionId = decodeURIComponent(contestMatch[1]);
			const action = contestMatch[2];
			if (method === 'GET' && !action) {
				this.json(res, 200, { contestSession: this.login.getContestSession(token, contestSessionId) });
				return;
			}
			if (method === 'PATCH' && !action) {
				const body = await this.body(req);
				this.json(res, 200, { contestSession: this.login.updateContestSession(
					token, contestSessionId, body
				) });
				return;
			}
			if (method === 'DELETE' && !action) {
				this.json(res, 200, { contestSession: this.login.cancelContestSession(token, contestSessionId) });
				return;
			}
			if (method === 'POST' && action === 'invite') {
				this.json(res, 200, { contestSession: this.login.inviteContestSession(token, contestSessionId) });
				return;
			}
			if (method === 'POST' && action === 'selection') {
				const body = await this.body(req);
				const teamIndexes = Array.isArray(body.teamIndexes) ? body.teamIndexes.map(Number) : Number(body.teamIndex);
				this.json(res, 200, { contestSession: this.login.selectContestPokemon(
					token, contestSessionId, teamIndexes
				) });
				return;
			}
			if (method === 'POST' && action === 'response') {
				const body = await this.body(req);
				this.json(res, 200, { contestSession: this.login.respondToContestInvitation(
					token, contestSessionId, this.string(body.response) as 'accepted' | 'declined'
				) });
				return;
			}
			if (method === 'POST' && action === 'start') {
				const contestSession = this.login.startContestSession(token, contestSessionId);
				try {
					const contest = this.contestRuntimeManager.start(contestSession);
					this.login.consumeContestHarmonizations(contest.participants);
					this.json(res, 200, { contestSession, contest });
				} catch (error) {
					this.contestRuntimeManager.replaceState(contestSessionId, null);
					this.login.rollbackContestSessionStart(contestSessionId);
					throw error;
				}
				return;
			}
			if (method === 'GET' && action === 'runtime') {
				this.login.getContestSession(token, contestSessionId);
				const account = this.login.getSession(token);
				const contest = this.contestRuntimeManager.snapshot(contestSessionId, {
					master: account.role === 'master',
					characterId: account.mode === 'player' ? (account.characterId || account.viewAsCharacterId) : undefined,
				});
				if (contest.status === 'ended') this.login.completeContestSession(contestSessionId);
				this.json(res, 200, { contest });
				return;
			}
			if (method === 'POST' && action === 'action') {
				this.login.getContestSession(token, contestSessionId);
				const account = this.login.getSession(token);
				const body = await this.body(req);
				const contest = this.contestRuntimeManager.action(
					contestSessionId, body as unknown as RPGContestRuntimeAction, {
						master: account.role === 'master',
						characterId: account.mode === 'player' ? (account.characterId || account.viewAsCharacterId) : undefined,
					}
				);
				if (contest.status === 'ended') this.login.completeContestSession(contestSessionId);
				this.json(res, 200, { contest });
				return;
			}
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
					token, battleSessionId, body
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
					this.battleRuntimes.settleRecoverableBalls(battleSessionId, (characterId, inventory) => {
						this.login.persistBattleInventory(characterId, inventory);
					});
					const completed = this.login.completeBattleSession(battleSessionId, battle.result);
					battle.result.badgeAwards = completed.result?.badgeAwards || [];
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
				if (battle.status === 'ended' && battle.result) {
					const completed = this.login.completeBattleSession(battleSessionId, battle.result);
					battle.result.badgeAwards = completed.result?.badgeAwards || [];
				}
				this.json(res, 200, { battle });
				return;
			}
		}

		this.json(res, 404, { error: 'RPG endpoint not found' });
	}

	private async body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
		const cached = this.parsedBodies.get(req);
		if (cached) return cached;
		const pending = this.readBody(req);
		this.parsedBodies.set(req, pending);
		return pending;
	}

	private async readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
		const contentType = req.headers['content-type'] || '';
		if (!contentType.toLowerCase().startsWith('application/json')) {
			throw new RPGHttpError(415, 'RPG requests require application/json');
		}
		let raw = '';
		const maxBodySize = /\/backup(?:\?|$)/.test(req.url || '') ? MAX_BACKUP_BODY_SIZE : MAX_BODY_SIZE;
		for await (const chunk of req) {
			raw += chunk;
			if (Buffer.byteLength(raw) > maxBodySize) throw new RPGHttpError(413, 'RPG request body is too large');
		}
		try {
			const value = JSON.parse(raw || '{}');
			if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
			return value;
		} catch {
			throw new RPGHttpError(400, 'Invalid RPG JSON body');
		}
	}

	private characterRequest(body: Record<string, unknown>, platformCreation = false): RPGCreateCharacterRequest {
		const starter = body.starter && typeof body.starter === 'object' && !Array.isArray(body.starter) ?
			body.starter as Record<string, unknown> : {};
		const nickname = typeof starter.nickname === 'string' ? starter.nickname : undefined;
		const level = typeof starter.level === 'number' ? starter.level : undefined;
		return {
			characterName: this.string(body.characterName),
			characterGender: body.characterGender === undefined ? undefined :
			this.string(body.characterGender) as RPGCreateCharacterRequest['characterGender'],
			playerName: platformCreation ? '' : this.string(body.playerName),
			avatar: this.string(body.avatar),
			password: platformCreation ? '' : this.string(body.password),
			initialMoney: platformCreation ? 0 : typeof body.initialMoney === 'number' ? body.initialMoney : NaN,
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

	private tableBackupWorld(value: unknown): import('./database/mysql-persistence').RPGTableWorldBackup {
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Conteúdo do backup inválido');
		const world = value as Record<string, unknown>;
		const array = (key: string) => {
			if (!Array.isArray(world[key])) throw new Error(`Conteúdo do backup inválido: ${key}`);
			return world[key] as unknown[];
		};
		const record = (key: string) => {
			const current = world[key];
			if (!current || typeof current !== 'object' || Array.isArray(current)) {
				throw new Error(`Conteúdo do backup inválido: ${key}`);
			}
			return current as Record<string, Record<string, unknown>>;
		};
		return {
			characters: array('characters'), battles: array('battles'), contests: array('contests'),
			tournaments: array('tournaments'), combos: array('combos'), customItems: array('customItems'),
			shops: array('shops'), playerDocuments: record('playerDocuments'),
			masterNPCLibrary: world.masterNPCLibrary && typeof world.masterNPCLibrary === 'object' &&
				!Array.isArray(world.masterNPCLibrary) ? world.masterNPCLibrary as Record<string, unknown> : null,
			campaign: world.campaign && typeof world.campaign === 'object' && !Array.isArray(world.campaign) ?
				world.campaign as Record<string, unknown> : null,
		};
	}

	private runtimeRequest(url: URL): { type: 'battle' | 'contest', sessionId: string } | undefined {
		const match = /^\/api\/rpg\/(battle|contest)-sessions\/([^/]+)\/(start|runtime|runtime-ready|action)$/.exec(url.pathname);
		return match ? { type: match[1] as 'battle' | 'contest', sessionId: decodeURIComponent(match[2]) } : undefined;
	}

	/** Keeps expensive credential checks independent while serializing decisions for the same identity. */
	private async credentialConcurrencyIdentities(req: http.IncomingMessage, url: URL): Promise<string[] | undefined> {
		if (req.method !== 'POST') return undefined;
		const origin = (req.socket.remoteAddress || 'unknown').trim().toLowerCase();
		const sourceIdentity = createHash('sha256').update(`source:${origin}`).digest('hex').slice(0, 32);
		if (['/api/rpg/v2/accounts', '/api/rpg/v2/session', '/api/rpg/v2/password/recovery'].includes(url.pathname)) {
			const username = toID(this.string((await this.body(req)).username)) || 'anonymous';
			return [createHash('sha256').update(`username:${username}`).digest('hex').slice(0, 32), sourceIdentity];
		}
		if (url.pathname === '/api/rpg/v2/recovery-codes' && this.service?.mysqlPersistence) {
			const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1] || '';
			const tokenHash = createHash('sha256').update(token).digest('hex');
			const username = toID(await this.service.mysqlPersistence.accountUsernameForSession(tokenHash)) || 'anonymous';
			return [createHash('sha256').update(`username:${username}`).digest('hex').slice(0, 32), sourceIdentity];
		}
		return undefined;
	}

	private async loadSharedRuntime(url: URL, tableId: string): Promise<void> {
		const request = this.runtimeRequest(url); const persistence = this.login.mysqlPersistence;
		if (!request || !persistence) return;
		const state = await persistence.loadRuntimeState(tableId, request.type, request.sessionId);
		if (request.type === 'battle') this.battleRuntimes.replaceState(request.sessionId, state,
			(characterId, inventory) => this.login.persistBattleInventory(characterId, inventory));
		else this.contestRuntimeManager.replaceState(request.sessionId, state);
	}

	private saveSharedRuntime(url: URL, tableId: string): void {
		const request = this.runtimeRequest(url); const persistence = this.login.mysqlPersistence;
		if (!request || !persistence) return;
		const state = request.type === 'battle' ? this.battleRuntimes.exportState(request.sessionId) :
			this.contestRuntimeManager.exportState(request.sessionId);
		if (state) {
			const finishedAt = typeof state === 'object' && state && 'finishedAt' in state &&
				typeof state.finishedAt === 'number' ? state.finishedAt : undefined;
			persistence.upsertRuntimeState(tableId, request.type, request.sessionId, state, finishedAt);
		}
	}

	private async auditFailedAdministrativeRequest(req: http.IncomingMessage, url: URL, token: string | undefined,
		context: { origin: string, method: string, path: string, sessionId?: string }, error: unknown): Promise<void> {
		if (!token) return;
		const operation = this.administrativeAuditOperation(req.method || 'GET', url.pathname);
		if (!operation) return;
		try {
			if (this.service!.mysqlPersistence) {
				const snapshot = await this.service!.mysqlPersistence.snapshot(this.service!.legacyTableId);
				this.service!.accounts.reload({
					accounts: snapshot.platformAccounts, tables: snapshot.campaignTables,
					members: snapshot.tableMembers, invites: snapshot.tableInvites,
					recoveryCodes: snapshot.recoveryCodes, loginAttempts: snapshot.loginAttempts,
					auditEntries: snapshot.auditEntries, accountNotes: snapshot.accountNotes,
					notifications: snapshot.notifications,
				}, snapshot.accountSessions);
			}
			this.service!.accounts.withAuditContext(context, () => this.service!.accounts.recordAdministrativeFailure(
				token, operation.tableId, operation.action, operation.targetType, operation.targetId, error
			));
			await this.service!.flushPersistence();
		} catch (auditError) {
			const value = auditError && typeof auditError === 'object' ?
				auditError as { name?: unknown, code?: unknown } : undefined;
			console.error('[Pokémon RPG] Falha ao registrar auditoria administrativa', {
				occurredAt: new Date().toISOString(),
				errorType: typeof value?.name === 'string' ? value.name : 'Error',
				...(typeof value?.code === 'string' ? { errorCode: value.code } : {}),
			});
		}
	}

	private async auditFailedRPGAdministration(req: http.IncomingMessage, token: string, tableId: string,
		error: unknown): Promise<void> {
		const path = req.url?.split('?')[0] || '';
		if (!this.isAdministrativeRPGMutation(req.method || 'GET', path)) return;
		try {
			this.service!.accounts.recordAdministrativeFailure(token, tableId, 'rpg.request.failed', 'rpg-endpoint',
				req.url?.split('?')[0], error);
			await this.service!.flushPersistence();
		} catch (auditError) {
			const value = auditError && typeof auditError === 'object' ? auditError as { name?: unknown, code?: unknown } : undefined;
			console.error('[Pokémon RPG] Falha ao registrar auditoria administrativa do mundo', {
				occurredAt: new Date().toISOString(), errorType: typeof value?.name === 'string' ? value.name : 'Error',
				...(typeof value?.code === 'string' ? { errorCode: value.code } : {}),
			});
		}
	}

	private isAdministrativeRPGMutation(method: string, path: string): boolean {
		if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
		// Decisões de turno e confirmações dos participantes são jogo, não administração.
		if (/\/(?:battle|contest)-sessions\/[^/]+\/(?:action|runtime-ready|selection|response|evolution|move-learning)$/.test(path)) {
			return false;
		}
		return true;
	}

	private administrativeAuditOperation(method: string, pathname: string): {
		tableId: string, action: string, targetType: string, targetId?: string,
	} | undefined {
		const table = /^\/api\/rpg\/v2\/tables\/([^/]+)$/.exec(pathname);
		if (method === 'DELETE' && table) return {
			tableId: decodeURIComponent(table[1]), action: 'table.archived', targetType: 'table',
			targetId: decodeURIComponent(table[1]),
		};
		const invite = /^\/api\/rpg\/v2\/tables\/([^/]+)\/invites(?:\/([^/]+))?$/.exec(pathname);
		if (invite && ['GET', 'POST', 'DELETE'].includes(method)) return {
			tableId: decodeURIComponent(invite[1]),
			action: method === 'POST' ? 'invite.created' : method === 'DELETE' ? 'invite.revoked' : 'invite.viewed',
			targetType: 'invite', targetId: invite[2] ? decodeURIComponent(invite[2]) : undefined,
		};
		const administrativeView = /^\/api\/rpg\/v2\/tables\/([^/]+)\/(members|audit)$/.exec(pathname);
		if (method === 'GET' && administrativeView) return {
			tableId: decodeURIComponent(administrativeView[1]), action: `${administrativeView[2]}.viewed`,
			targetType: administrativeView[2],
		};
		const member = /^\/api\/rpg\/v2\/tables\/([^/]+)\/members\/([^/]+)(?:\/(block|ownership|note))?$/.exec(pathname);
		if (member && ['PATCH', 'DELETE', 'POST', 'PUT'].includes(method)) return {
			tableId: decodeURIComponent(member[1]),
			action: member[3] === 'ownership' ? 'table.ownership.transferred' : member[3] === 'note' ? 'member.note.updated' :
			member[3] === 'block' ? 'member.blocked' : method === 'PATCH' ? 'member.role.changed' : 'member.removed',
			targetType: 'member', targetId: decodeURIComponent(member[2]),
		};
		return undefined;
	}

	private async optionalAuditReason(req: http.IncomingMessage): Promise<string | undefined> {
		const contentType = req.headers['content-type'] || '';
		if (!contentType.toLowerCase().startsWith('application/json')) return undefined;
		return this.optionalString((await this.body(req)).reason);
	}

	private optionalString(value: unknown): string | undefined {
		return typeof value === 'string' ? value : undefined;
	}

	private headers(): Record<string, string> {
		return {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		};
	}

	private json(res: http.ServerResponse, status: number, data: unknown): void {
		if (res.headersSent || this.pendingResponses.has(res)) return;
		this.pendingResponses.set(res, { status, data });
	}

	private commitResponse(res: http.ServerResponse): void {
		const response = this.pendingResponses.get(res);
		if (!response || res.headersSent) return;
		this.pendingResponses.delete(res);
		this.writeJson(res, response.status, response.data);
	}

	private writeJson(res: http.ServerResponse, status: number, data: unknown): void {
		if (res.headersSent) return;
		const payload = JSON.stringify(data);
		res.writeHead(status, this.headers());
		res.end(payload);
	}

	private error(res: http.ServerResponse, error: unknown): void {
		this.pendingResponses.delete(res);
		if (error instanceof RPGHttpError) {
			this.writeJson(res, error.status, { error: error.message });
			return;
		}
		const message = error instanceof Error ? error.message : 'Unexpected RPG server error';
		const details = error && typeof error === 'object' ? error as { code?: unknown, sqlState?: unknown } : undefined;
		if (details?.code === 'RPG_AUTH_BUSY' || details?.code === 'RPG_LOCK_BUSY') {
			this.writeJson(res, 503, { error: details.code === 'RPG_AUTH_BUSY' ?
				'Serviço de autenticação temporariamente ocupado.' : 'Serviço temporariamente ocupado. Tente novamente.' });
			return;
		}
		if (details && this.isPersistenceError(details)) {
			console.error('[Pokémon RPG] Falha interna de persistência', {
				occurredAt: new Date().toISOString(),
				...(typeof details.code === 'string' ? { errorCode: details.code } : {}),
				...(typeof details.sqlState === 'string' ? { sqlState: details.sqlState } : {}),
			});
			this.writeJson(res, 503, { error: 'Não foi possível salvar os dados. Tente novamente.' });
			return;
		}
		if (error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError ||
			/Estado persistido .+ inválido|Unexpected RPG server error|serialize|serializa/i.test(message)) {
			console.error('[Pokémon RPG] Falha interna da aplicação', {
				occurredAt: new Date().toISOString(), errorType: error instanceof Error ? error.name : 'Error',
			});
			this.writeJson(res, 500, { error: 'Ocorreu uma falha interna. Tente novamente.' });
			return;
		}
		let status = 400;
		let publicDomainError = false;
		if (message.includes('Muitas tentativas de login') || message.includes('Muitas tentativas de recuperação')) {
			status = 429; publicDomainError = true;
		} else if (['Invalid or expired RPG session', 'Invalid RPG character or password', 'Invalid RPG master code',
			'Sessão inválida ou expirada', 'Usuário ou senha inválidos', 'Conta indisponível']
			.some(part => message.includes(part))) {
			status = 401; publicDomainError = true;
		} else if (['permission', 'cannot access', 'master session required', 'Apenas Mestres', 'Permissão necessária',
			'não participa desta mesa', 'bloqueada nesta mesa', 'pertence a outra conta',
			'proprietário não pode sair', 'não pode ser removido', 'não pode ter sua função alterada']
			.some(part => message.includes(part))) {
			status = 403; publicDomainError = true;
		} else if (message.includes('already exists') || message.includes('já está em uso') ||
			message.includes('Identificador de teste já utilizado') ||
			message.includes('já foi utilizado') || message.includes('já está nesta mesa') ||
			message.includes('já possui um convite ativo')) {
			status = 409; publicDomainError = true;
		} else if (message.includes('Unknown RPG character') || message.includes('Convite inválido') ||
			message.includes('Convite não encontrado') || message.includes('Conta convidada não encontrada') ||
			message.includes('Notificação não encontrada')) {
			status = 404; publicDomainError = true;
		}
		if (!publicDomainError && !this.isPublicValidationError(message)) {
			console.error('[Pokémon RPG] Falha interna não classificada', {
				occurredAt: new Date().toISOString(), errorType: error instanceof Error ? error.name : 'Error',
			});
			this.writeJson(res, 500, { error: 'Ocorreu uma falha interna. Tente novamente.' });
			return;
		}
		this.writeJson(res, status, { error: message });
	}

	/** Only established domain validation messages may cross the HTTP boundary. */
	private isPublicValidationError(message: string): boolean {
		if (/^(?:Posição do local no mapa inválida|Dados do novo local no mapa inválidos|Identificador de local no mapa já utilizado|Limite de locais criados no mapa atingido|Apenas locais criados pelo Mestre podem ser movidos|Apenas locais criados pelo Mestre podem ser removidos|Local criado não encontrado nesta mesa)$/.test(message)) return true;
		if (/^(?:Escolha uma espécie de Pokémon válida|Escolha uma natureza válida|Escolha um status válido para a captura|Escolha uma Poké Bola válida|Escolha uma Poké Bola disponível na sua Bag para esta captura|A habilidade selecionada não está disponível para essa espécie|O gênero selecionado não está disponível para essa espécie|O nível deve estar entre 1 e 100|A vida do Pokémon deve estar entre 1% e 100%|Identificador da tentativa de captura inválido|Condições da captura inválidas|Este treinador já tem uma captura aguardando sua rolagem|Não há uma captura aguardando esta rolagem)$/.test(message)) return true;
		if (/^(?:Tipo de descanso inválido|Identificador de descanso (?:inválido|já utilizado))$/.test(message)) return true;
		if (/^(?:Identificador de recuperação (?:inválido|já utilizado)|Recuperação Assistida já preparada antes do próximo descanso longo|Escolha de um a \d+ participantes diferentes|Escolha inválida de pacientes para Recuperação da Exaustão|Este Médico não possui Recuperação da Exaustão|São necessárias \d+ cargas do Kit Médico para os benefícios escolhidos|Recuperação Intensiva exige uma carga do Kit Médico por paciente|Participante indisponível nesta mesa|Um treinador morto não pode receber Recuperação Assistida|.* (?:já possui Recuperação Assistida preparada|precisa de pelo menos dois níveis de Exaustão|já recebeu Recuperação da Exaustão nas últimas 24 horas))$/.test(message)) return true;
		if (/^(?:Entre como Médico em uma mesa|Atendimento Emergencial exige um Médico nesta mesa|Identificador de atendimento (?:inválido|já utilizado)|Treinador desmaiado não encontrado nesta mesa|Este treinador já recebeu Atendimento Emergencial neste descanso longo|É necessário um Kit Médico com carga na Bag)$/.test(message)) return true;
		if (/^(?:Este treinador não possui (?:Armadilheiro|Armadilha Combinada|Labirinto de Gatilhos)|Você precisa de um Kit de Ladinagem na Bag|O Kit de Ladinagem (?:está sem cargas|precisa de pelo menos (?:duas|quatro) cargas))$/.test(message)) return true;
		if (/^(?:Este treinador não possui Disfarce Social|Domínio do Kit de Disfarce necessário|Você precisa de um Kit de Disfarce na Bag|O Kit de Disfarce está sem cargas)/.test(message)) return true;
		if (/^Este treinador não possui Isca Ecológica$/.test(message)) return true;
		if (/persisted|estado persistido|table scope|random source|repository|repositório/i.test(message)) return false;
		if (/^(?:Amizade deve ser um número inteiro entre 0 e 255|Performance deve ser um número inteiro entre 0 e 100)$/.test(message)) return true;
		if (/^(?:Ovo (?:sem incubadora válida|desconhecido ou pertencente a outro treinador)|O ovo (?:ainda não está pronto para chocar|pronto não está nesta incubadora|pronto está na incubadora portátil)|Não há espaço livre na equipe para resgatar o Pokémon chocado|É necessário ter ao menos uma Poké Ball na Bag para o Pokémon nascer)$/.test(message)) return true;
		if (/^(?:Entre como jogador em uma mesa|Nenhum personagem selecionado|Preparo coreográfico inválido|Este treinador não é Coreógrafo|Escolha Pokémon diferentes|Identificador de ensaio já utilizado|Escolha outro treinador da mesa para Diretor Convidado|Personagem fora da mesa atual|Escolha \d+ Pokémon para este preparo|Escolha Pokémon disponíveis na equipe|Formação não aprendida|Ensaie individualmente com todos os Pokémon primeiro|O convidado precisa ter ficha concluída|Este participante já possui Diretor Convidado|Tema Unificado não aprendido|Escolha um tema presente nos golpes do concurso|Entrosamento Instintivo não aprendido|Pokémon requer 50 de amizade|Preparação coletiva não aprendida|Escolha de um a \d+ participantes da mesa|Descreva a atividade em até 100 caracteres)/.test(message)) return true;
		if (/^(?:Confirmação de liberação inválida ou expirada\.|Refeição Revigorante |Escolha a CD e participantes |Alimento insuficiente na Bag|Identificador de refeição já utilizado|.* já recebeu Refeição Revigorante neste descanso|.* não pode ser curado)/.test(message)) return true;
		if (/^(?:Escolha de um a três Pokémon|Este treinador não possui Petisco de Amizade|Identificador de petiscos já utilizado|É necessária uma Ração Pokémon|Nome do outro Pokémon muito longo|Escolha um treinador e um de seus Pokémon|Cada Pokémon pode receber somente um petisco)/.test(message)) return true;
		if (/^(?:Este treinador não possui Recompensa de Treinamento|Identificador de recompensa já utilizado|Escolha um treinador da mesa|Pokémon já está em treinamento|Este Pokémon já possui uma recompensa de treinamento|Somente Pokémon da equipe ativa podem receber a recompensa|Pokémon indisponível para receber a recompensa)/.test(message)) return true;
		if (/^(?:Este treinador não possui Harmonização de Sabores|Este Pokémon já possui Harmonização de Sabores|Este treinador já possui uma Harmonização de Sabores pendente|Escolha um Pokémon disponível na equipe ativa|Escolha de um a \d Pokémon diferentes|São necessários \d+ Alimentos na Bag|É necessário um Alimento na Bag)/.test(message)) return true;
		if (/^(?:Escolha uma quantidade de Alimentos|Este treinador não possui Ração Artesanal Pokémon|Identificador de preparo já utilizado|Alimentos insuficientes na Bag|Kit de Culinária necessário|Domínio do Kit de Culinária necessário|Escolha uma Ração Pokémon válida)/.test(message)) return true;
		if (/^(?:Você precisa de um Kit Científico na Bag|Este registro exige (?:um Kit Científico de nível|\d+ carga\(s\))|Registro (?:inválido|não pertence a este treinador|científico indisponível)|Cientista indisponível nesta mesa|Esta fórmula já está em preparação|Há preparações demais em andamento|Preparação indisponível|O Registro Reprodutível foi alterado ou retirado|A preparação ainda não atingiu o tempo necessário)/.test(message)) return true;
		if (/^(?:Registro Avançado indisponível|Espaço de registro inválido|Destinatário indisponível|Informe nome \(3–100\)|Identificador inválido|Identificador já utilizado|Já existe um registro aguardando aprovação|Registro não está pendente|Nível do kit ou cargas inválidos|Cientista ou destinatário indisponível|A biblioteca permite até dois Registros Avançados ativos)/.test(message)) return true;
		if (/^(?:Somente um Tecnólogo pode construir protótipos|Espaço de protótipo inválido|Protótipo inicial desconhecido|Você precisa de um Kit Tecnológico na Bag|O Kit Tecnológico precisa de uma carga disponível|Protótipos vinculados devem permanecer com o destinatário original|Protótipos não são consumíveis)/.test(message)) return true;
		if (/^(?:Publicação de Referência não está disponível|Identificador do artigo inválido|Informe título e resumo do artigo|Já existe um artigo aguardando avaliação|Artigo não está pendente|Decisão ou pagamento inválido|Pagamento ultrapassa o limite de Pokécoins|Entre como jogador em uma mesa para criar o artigo|Nenhum personagem selecionado|Personagem fora da mesa atual)/.test(message)) return true;
		if (/^(?:Confidente indisponível|Identificador de confidente (?:inválido|já utilizado)|Informe o nome do confidente|Este treinador já possui um confidente confirmado|Já existe um confidente aguardando avaliação|Pedido de confidente ou decisão inválidos)/.test(message)) return true;
		if (/^(?:Forrageador Eficiente indisponível|Identificador de forrageio (?:inválido|já utilizado)|Já existe um forrageio aguardando avaliação|Pedido de forrageio ou decisão inválidos|Explorador indisponível para receber os alimentos)/.test(message)) return true;
		if (/^(?:Laço Verdadeiro indisponível|Identificador de Laço Verdadeiro (?:inválido|já utilizado)|Informe o nome do NPC|Este treinador já possui um Laço Verdadeiro|Já existe um Laço Verdadeiro aguardando avaliação|Pedido de Laço Verdadeiro ou decisão inválidos|Apenas o Mestre visualizando o jogador pode remover o Laço Verdadeiro|Nenhum Laço Verdadeiro para remover)/.test(message)) return true;
		if (/^(?:Rede de Fornecedores indisponível|Identificador da encomenda |Já existe uma encomenda aguardando avaliação|Item indisponível para encomenda|Encomenda ou decisão inválida|Treinador indisponível para receber a encomenda|Item da encomenda não está mais disponível)/.test(message)) return true;
		if (/^(?:Identificador de nível |Ajuste de nível )/.test(message)) return true;
		if (['Escolha de talento inválida', 'Escolha modalidades artísticas diferentes das já selecionadas',
			'Escolha uma variante nova e válida para este talento'].includes(message)) return true;
		if (/^(?:Benefício de Arte Reconfortante inválido|Este treinador não possui Arte Reconfortante|Participante indisponível nesta mesa|Participante já recebeu Arte Reconfortante neste descanso|Limite de participantes de Arte Reconfortante atingido|O participante não possui Exaustão para reduzir)$/.test(message)) return true;
		return /^(?:Atividade |Exposição |Perigo |Viagem |Hexágono |Condição de viagem |O próximo hexágono |Progresso ou tempo de viagem |Jornada |Rota |Pokémon não foi aprovado |Carga da carroça |Carroça |Sobrecarga |Receita |Talento exigido |Perícia exigida |Tempo de fabricação |Instalação adequada |Kit apropriado |Domínio do kit |Cargas do kit |Ingredientes |Fabricação |Identificador de atividade |RPG (?:request|session|password|character|player|master|battle|contest|tournament|Bag|Box|shop|commerce|nursery|team|held|move|starter|temporary|NPC)|Invalid RPG|Incorrect RPG|Unknown RPG|Apenas |Permissão necessária:|Usuário ou senha |Conta (?:indisponível|convidada)|Mesa (?:indisponível|arquivada)|Convite |Código de recuperação |Muitas tentativas |Pokémon |Item |Golpe |Equipe |Batalha |Concurso |Torneio |NPC |Pasta |Documento |Loja |Banco |Pokécoin |Quantidade |Valor |Nível |XP insuficiente |Aguarde um descanso longo |Escolha os talentos pendentes |Conclua a ficha |Histórico insuficiente |Não há histórico suficiente |Formato |Participante |Treinador |Campanha |nome de exibição inválido|descrição inválido|Texto muito longo|Cor da mesa inválida|Visibilidade da mesa inválida|Função (?:de membro|de convite) inválida|Identificador de sessão inválido|Motivo da auditoria muito longo|A senha deve |O usuário deve |O @ deve |Este (?:nome de usuário|convite|Pokémon|held item|@)|Esta (?:conta|loja|procriação)|O (?:Mestre|acesso|valor|usuário|proprietário|limite|item|Pokémon|reembolso|prêmio)|Os documentos |A (?:conta|equipe|aposta|expiração|incubadora|recompensa|procriação|quantidade|sessão|natureza|habilidade|loja|mensagem)|Informe pelo menos um @|Envie convites |Não repita o mesmo @|@[^ ]+ |Nenhum (?:Pokémon|participante|item)|Não (?:é possível|foi possível|há|existe|pode))/.test(message);
	}

	private isPersistenceError(error: { code?: unknown, sqlState?: unknown }): boolean {
		if (typeof error.sqlState === 'string') return true;
		const code = typeof error.code === 'string' ? error.code : '';
		return code === 'RPG_PERSISTENCE_FAILURE' || /^(?:ER_|PROTOCOL_|ECONN|ETIMEDOUT|EPIPE)/.test(code);
	}
}

class RPGHttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}
