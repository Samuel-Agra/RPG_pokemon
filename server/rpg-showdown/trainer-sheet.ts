/** Dados persistentes da ficha humana; regras e escolhas serão aplicadas em etapas posteriores. */
export interface RPGTrainerAttributes {
	strength: number;
	dexterity: number;
	constitution: number;
	intelligence: number;
	wisdom: number;
	charisma: number;
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
	/** Contadores próprios do treinador, identificados pela regra que os concede. */
	resources: Record<string, { current: number, maximum: number }>;
	/** A primeira série elegível fica vinculada ao personagem antes da distribuição. */
	creation?: { method: 'standard' | 'rolled', rolls: number[] | null };
	/** Equipamento humano inicial; será integrado ao inventário de exploração. */
	equipment?: { itemId: string, quantity: number, equipped: boolean, charges?: number }[];
	proficiencies?: string[];
}

export function createRPGPendingTrainerSheet(): RPGTrainerSheet {
	return {
		version: 1, status: 'pending', attributes: null, classId: null, level: 1, experience: 0,
		hitPoints: { current: null, maximum: null, temporary: 0 },
		skills: { trained: [], focused: [] }, resistances: [],
		talents: { general: [], class: [], apex: null }, resources: {},
	};
}
