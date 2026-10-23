/** Dados persistentes da ficha humana; regras e escolhas serão aplicadas em etapas posteriores. */
export interface RPGTrainerAttributes {
	strength: number;
	dexterity: number;
	constitution: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
}

/** Referência confiável à última mensagem de teste que pode ser repetida. */
export interface RPGTrainerChatRoll {
	messageId: string;
	authorAccountId: string;
	message: string;
	label: string;
	bonusTerms: string;
	kind: 'attribute' | 'skill' | 'resistance';
	mode: 'normal' | 'advantage' | 'disadvantage';
	diceCount: number;
	bonus: number;
	/** Piso do d20 em novos lançamentos desta mesma perícia (ex.: Sortudo). */
	naturalFloor?: number;
	/** Identifica o talento que alterou o d20 em uma repetição posterior. */
	naturalFloorSource?: string;
	campaignTime: string;
	createdAt: number;
	rerolled?: boolean;
}

export interface RPGTrainerSheet {
	version: 1;
	/** Fichas antigas permanecem pendentes até o treinador fazer suas escolhas. */
	status: 'pending' | 'complete';
	attributes: RPGTrainerAttributes | null;
	classId: string | null;
	level: number;
	experience: number;
	hitPoints: { current: number | null, maximum: number | null, temporary: number };
	skills: { trained: string[], focused: string[] };
	resistances: string[];
	talents: { general: string[], class: string[], apex: string | null };
	/** Atributo padrão dos arremessos de captura durante batalhas. */
	captureCombatAttribute?: 'dexterity' | 'wisdom';
	/** Confidente confirmado pelo Mestre; um vínculo ativo por Encantador. */
	confidantName?: string;
	/** NPC do Laço Verdadeiro confirmado pelo Mestre; somente o Mestre pode desfazer o vínculo. */
	trueBondNpcName?: string;
	/** Marca a correção do bônus de Inteligência para fichas que já possuíam Memória Acadêmica. */
	academicMemoryApplied?: boolean;
	/** Marca a correção do bônus de Destreza para fichas que já possuíam Resgate de Relíquia. */
	relicRescueApplied?: boolean;
	/** Marca a aplicação única da Sabedoria de Incubação de Emergência. */
	emergencyIncubationWisdomApplied?: boolean;
	nurseryMasterWisdomApplied?: boolean;
	/** Escolhas parametrizadas preservam a variante e o nível de aquisição. */
	talentSelections?: (import('./trainer-talents').RPGTrainerTalentChoice &
		{ acquiredAtLevel: number, grantedSkill?: string })[];
	/** Condições narrativas ou licenças verificadas pelo Mestre, sem confiar em sinalização do cliente. */
	talentApprovals?: { key: string, reason: string, approvedBy: string, approvedAt: number }[];
	/** Contadores próprios do treinador, identificados pela regra que os concede. */
	resources: Record<string, { current: number, maximum: number }>;
	/** Descansos longos liberam novamente talentos de uso limitado. */
	talentRestCycle?: number;
	/** Descansos curtos renovam os efeitos que dependem deles. */
	shortRestCycle?: number;
	/** Marcação manual de talentos narrativos, independente dos usos automatizados. */
	manualTalentShortCycle?: number;
	manualTalentLongCycle?: number;
	manualTalentUses?: Record<string, string>;
	manualTalentLastRenewal?: { source: 'short' | 'long', talents: string[] };
	/** Ciclo em que cada talento ativo foi utilizado; persistido com a ficha. */
	talentUses?: Record<string, number>;
	/** Evita repetir Refeição Revigorante no mesmo avanço de descanso longo. */
	revigoratingMealCycle?: number;
	/** Atendimento Emergencial recebido neste ciclo de descanso longo. */
	emergencyCareCycle?: number;
	emergencyCareReceipts?: { requestId: string, targetId: string, result: {
		patientName: string, hp: number, chargesRemaining: number,
		supplyRoll?: number | null, chargeSaved?: boolean,
		revitalizing?: boolean, emergencyMedicine?: boolean, healingRoll?: number | null,
		supplyRolls?: (number | null)[], conditionsRemoved?: string[],
	}, }[];
	reanimationReceipts?: { requestId: string, patientId: string, mode: string, talents: string[], result: {
		patientName: string, success: boolean, total: number, natural: number, dice: number[],
		message: string, chargesRemaining: number,
	}, }[];
	/** Cura adicional preparada pelo Médico para o próximo descanso longo. */
	assistedRecoveryPending?: { doctorId: string, healing: number, preparedCycle: number, staged?: boolean,
		stagedHealing?: number, exhaustionRecovery?: boolean, };
	/** Paciente acompanhado continuamente por Ápice — Recuperação Extraordinária. */
	extraordinaryRecoveryPatientId?: string;
	/** Última redução adicional de Exaustão recebida por Recuperação Assistida. */
	lastExhaustionRecoveryAt?: number;
	/** Segunda etapa de Recuperação Assistida: primeiro descanso curto em até 24 h da etapa longa. */
	stagedRecoveryPending?: { doctorId: string, healing: number, expiresAt: number };
	assistedRecoveryReceipts?: { requestId: string, targetIds: string[], healing: number, intensive?: boolean,
		exhaustionPatientIds?: string[], }[];
	/** Orientação do Médico: apenas a primeira Fortitude pertinente, até o próximo descanso. */
	preventiveProtocol?: { sourceCharacterId: string, sourceName: string, risk: string, used: boolean };
	preventiveProtocolPreparedRest?: string;
	preventiveProtocolReceipts?: { requestId: string, fingerprint: string, recipients: string[], risk: string }[];
	integratedMedicineReceipts?: { requestId: string, targetId: string, pokemonId: string,
		result: { pokemonName: string, status: string, chargesRemaining: number,
			supplyRoll: number | null, chargeSaved: boolean, }, }[];
	/** Chaves idempotentes das ações de Petisco de Amizade. */
	friendshipSnackReceipts?: { requestId: string, fingerprint: string, result: {
		served: { name: string, friendshipGained: number | null }[], }, }[];
	/** Identificadores de uso evitam duplicar Amizade em tentativas repetidas. */
	enrichmentRoutineReceipts?: { requestId: string, fingerprint: string,
		result: { name: string, friendshipGained: number, availableAt: number }, }[];
	guardianEnrichmentUsedAt?: number;
	guardianEnrichmentReceipts?: { requestId: string, fingerprint: string,
		result: { pokemon: { name: string, friendshipGained: number }[], availableAt: number }, }[];
	impeccablePreparationReceipts?: { requestId: string, fingerprint: string, result: { name: string } }[];
	trainingRewardReceipts?: { requestId: string, fingerprint: string, result: { name: string } }[];
	contestHarmonizationReceipts?: { requestId: string, fingerprint: string, result: { names: string[] } }[];
	/** Ensaios permanentes e preparos breves do Coreógrafo, sempre vinculados aos Pokémon da mesa. */
	choreography?: {
		rehearsals: { pokemonId: string, readyAt: string }[],
		formations: { pokemonIds: string[], readyAt: string }[],
		theme?: { tag: string, expiresAt: string },
		instinct?: { pokemonId: string, expiresAt: string },
		guestDirection?: { directorId: string, pokemonIds: string[], readyAt: string, expiresAt: string },
		receipts?: { requestId: string, fingerprint: string, result: { kind: string, names: string[], readyAt: string } }[],
	};
	/** Orientações coletivas têm um destinatário, não acumulam e expiram após uma hora de campanha. */
	choreographyGroups?: { kind: 'warmup' | 'evacuation', activity: string,
		recipientCharacterIds: string[], usedRecipientIds: string[], expiresAt: string, }[];
	/** Repetições da fabricação não rolam novamente nem duplicam rações. */
	artisanRationReceipts?: { requestId: string, foodQuantity: number, result: {
		foodQuantity: number, produced: number, natural: number, effectiveNatural?: number,
		bonus: number, total: number, success: boolean,
	}, }[];
	/** Próximo dado de recuperação natural recebe a repetição de Nutrição de Recuperação. */
	nutritionRecoveryPending?: boolean;
	/** Confirma retries sem consumir Alimento ou curar novamente. */
	revigoratingMealReceipts?: { requestId: string, fingerprint: string, cycle: number, result: {
		dc: number, natural: number, effectiveNatural?: number, total: number, bonus: number, success: boolean,
		foodConsumed: number, healing: number,
		recipients: { id: string, name: string, recovered: number, exhaustionReduced: number }[],
	}, }[];
	lastChatRolls?: { any?: RPGTrainerChatRoll, resistance?: RPGTrainerChatRoll, skill?: RPGTrainerChatRoll };
	/** Cada espaço preparado pertence a um destinatário e a uma área treinada de Conhecimento. */
	sharedArchives?: { slot: number, topic: string, knowledge: string, recipientCharacterId: string }[];
	/** Escolha permanente do Parceiro Investigativo; apenas o Mestre pode desfazê-la. */
	investigativePartnerPokemonId?: string;
	investigativePartnerName?: string;
	investigativePartnerUnavailable?: boolean;
	/** Nome livre do contato recorrente de Parceiro de Confiança. */
	trustedPartnerName?: string;
	individualRecoveryNote?: string;
	/** Apenas os nomes das memórias; o conteúdo é lembrado pelo Mestre. */
	memoryPalaceNames?: string[];
	burnTreatmentReceipts?: { requestId: string, targetId: string, result: {
		patientName: string, chargesRemaining: number, supplyRoll: number | null, chargeSaved: boolean, }, }[];
	neuromuscularTreatmentReceipts?: { requestId: string, targetId: string, conditionId: string, result: {
		patientName: string, conditionId: string, chargesRemaining: number,
		supplyRoll: number | null, chargeSaved: boolean, }, }[];
	controlledWarmingReceipts?: { requestId: string, targetId: string, result: {
		patientName: string, chargesRemaining: number,
		supplyRoll: number | null, chargeSaved: boolean, }, }[];
	neurologicalResponseReceipts?: { requestId: string, targetId: string, conditionId: string, result: {
		patientName: string, conditionId: string, chargesRemaining: number,
		supplyRoll: number | null, chargeSaved: boolean, }, }[];
	/** Cada fórmula escrita ocupa um espaço ativo e acompanha somente seu destinatário. */
	scientistRecords?: { slot: number, formulaId: string, recipientCharacterId: string,
		custom?: { name: string, description: string, kitTier: number, charges: number }, }[];
	/** Protótipos físicos ativos, vinculados à programação do criador. */
	technologicalPrototypes?: { slot: number, itemId: string, recipientCharacterId: string, instanceId: string,
		prototypeComponents?: [string, string] }[];
	/** Uma falha prepara o bônus; a rolagem aguarda seu resultado antes de outra falha. Campos antigos são opcionais para compatibilidade. */
	persistentHypothesis?: { failures: number, awaitingOutcome?: boolean, topic?: string,
		lastEvidence?: string, preparedEvidence?: string, };
	/** Benefício de Arte Reconfortante aguardando o primeiro teste de Vontade contra medo. */
	comfortingArt?: { sourceCharacterId: string, sourceName: string, restCycle: number };
	/** Destinatários já atendidos durante o descanso curto atual do Artista. */
	comfortingArtSession?: { restStartedAt: number, recipientCharacterIds: string[] };
	/** Plano físico preparado pelo Atleta; permanece ativo até ser substituído. */
	captainPlan?: { description: string, recipientCharacterIds: string[], usedRecipientIds?: string[] };
	/** Cada participante usa o bônus do plano de abordagem somente no primeiro teste pertinente. */
	capturePlan?: { description: string, recipientCharacterIds: string[], usedRecipientIds: string[], readyAt: string };
	/** Um espaço da Bag preparado com Compartimento Clandestino. */
	concealedBagItem?: { kind: 'pokemon' | 'equipment', itemId: string, instanceId?: string };
	/** A recomendação ativa do Diplomata substitui a anterior e atende uma única rolagem do aliado. */
	introductionLetter?: { id: string, recipientCharacterId: string, institution: string, subject: string, used: boolean };
	/** Orientações do ápice do Diplomata; cada aliado tem uma única utilização durante o prazo. */
	diplomatProxy?: { id: string, readyAt: string, expiresAt: string, recipients: {
		characterId: string, proposal: string, audience: string, used: boolean,
	}[], };
	/** Orientação cultural ativa, concedida após o teste de Conhecimento: Regiões. */
	cosmopolitanEtiquette?: { community: string, recipientCharacterIds: string[] };
	/** A primeira série elegível fica vinculada ao personagem antes da distribuição. */
	creation?: { method: 'standard' | 'rolled', rolls: number[] | null, dice?: number[][],
		rollProgress?: { dice: number[][], values: number[] }, };
	/** Escolhas do equipamento inicial; instâncias, cargas e armazenamento ficam em trainerInventory. */
	equipment?: { itemId: string, quantity: number, equipped: boolean, charges?: number }[];
	proficiencies?: string[];
	/** Registro da origem impede repetição por atualização, reinício ou nova requisição. */
	rewards?: import('./trainer-progression').RPGTrainerXPReward[];
	pendingChoices?: { general: number, class: number, apex: number };
	/** Um avanço de oito horas habilita, mas não aplica, níveis cobertos pela XP. */
	levelUpReady?: number;
	/** Início da espera para descanso, no relógio da campanha. */
	levelUpWaitingSince?: number;
	/** Ajustes diretos do Mestre guardam a origem para impedir duplo clique ou retry duplicado. */
	levelAdjustments?: { requestId: string, direction: 'up' | 'down', from: number,
		to: number, at: number, by: string, }[];
	/** Retratos apenas da progressão, usados para desfazer exatamente um nível sem reverter ferimentos. */
	levelSnapshots?: {
		level: number, attributes: RPGTrainerAttributes, hitPointsMaximum: number,
		skills: RPGTrainerSheet['skills'], resistances: string[], talents: RPGTrainerSheet['talents'],
		talentSelections?: RPGTrainerSheet['talentSelections'], proficiencies?: string[],
		resources: RPGTrainerSheet['resources'], pendingChoices?: RPGTrainerSheet['pendingChoices'],
	}[];
	/** Estado exclusivamente humano; nunca é usado pelo simulador de Pokémon. */
	survival?: import('./trainer-survival').RPGTrainerSurvival;
	/** Rolagens arbitradas: a chave impede repetir dados após retry ou concorrência. */
	checks?: { requestId: string, fingerprint: string, result: Record<string, unknown> }[];
	/** Atividades humanas são mantidas na ficha da mesa e jamais no estado de combate Pokémon. */
	activities?: {
		recordCrafts?: { id: string, sourceCharacterId: string, slot: number, formulaId: string,
			startedAt: number, completedAt?: number, cancelledAt?: number, }[],
		travel?: import('./trainer-travel').RPGTravelState,
		exposureTests?: Record<string, number>,
		crafts?: { id: string, recipeId: string, startedAt: number, facility?: string, completedAt?: number,
			result?: Record<string, unknown>, }[],
		receipts?: { id: string, fingerprint: string, result: Record<string, unknown> }[],
	};
}

export function createRPGPendingTrainerSheet(): RPGTrainerSheet {
	return {
		version: 1, status: 'pending', attributes: null, classId: null, level: 1, experience: 0,
		hitPoints: { current: null, maximum: null, temporary: 0 },
		skills: { trained: [], focused: [] }, resistances: [],
		talents: { general: [], class: [], apex: null }, resources: {},
	};
}
