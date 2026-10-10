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
	/** Marca a correção do bônus de Inteligência para fichas que já possuíam Memória Acadêmica. */
	academicMemoryApplied?: boolean;
	/** Marca a correção do bônus de Destreza para fichas que já possuíam Resgate de Relíquia. */
	relicRescueApplied?: boolean;
	/** Escolhas parametrizadas preservam a variante e o nível de aquisição. */
	talentSelections?: (import('./trainer-talents').RPGTrainerTalentChoice &
		{ acquiredAtLevel: number, grantedSkill?: string })[];
	/** Condições narrativas ou licenças verificadas pelo Mestre, sem confiar em sinalização do cliente. */
	talentApprovals?: { key: string, reason: string, approvedBy: string, approvedAt: number }[];
	/** Contadores próprios do treinador, identificados pela regra que os concede. */
	resources: Record<string, { current: number, maximum: number }>;
	/** Avanços de 8 horas liberam novamente talentos de uso limitado. */
	talentRestCycle?: number;
	/** Ciclo em que cada talento ativo foi utilizado; persistido com a ficha. */
	talentUses?: Record<string, number>;
	lastChatRolls?: { any?: RPGTrainerChatRoll, resistance?: RPGTrainerChatRoll, skill?: RPGTrainerChatRoll };
	/** Cada espaço preparado pertence a um destinatário e a uma área treinada de Conhecimento. */
	sharedArchives?: { slot: number, topic: string, knowledge: string, recipientCharacterId: string }[];
	/** Cada fórmula escrita ocupa um espaço ativo e acompanha somente seu destinatário. */
	scientistRecords?: { slot: number, formulaId: string, recipientCharacterId: string,
		custom?: { name: string, description: string, kitTier: number, charges: number }, }[];
	/** Uma falha prepara o bônus; a rolagem aguarda seu resultado antes de outra falha. Campos antigos são opcionais para compatibilidade. */
	persistentHypothesis?: { failures: number, awaitingOutcome?: boolean, topic?: string,
		lastEvidence?: string, preparedEvidence?: string, };
	/** Benefício de Arte Reconfortante aguardando o primeiro teste de Vontade contra medo. */
	comfortingArt?: { sourceCharacterId: string, sourceName: string, restCycle: number };
	/** Destinatários já atendidos durante o descanso curto atual do Artista. */
	comfortingArtSession?: { restStartedAt: number, recipientCharacterIds: string[] };
	/** Plano físico preparado pelo Atleta; permanece ativo até ser substituído. */
	captainPlan?: { description: string, recipientCharacterIds: string[], usedRecipientIds?: string[] };
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
