/** Projetos explícitos e encomendas: nenhum teste isolado imprime Pokécoins. */
import { rollRPGTrainerSkillCheck } from './trainer-checks';
import { rpgEquipment, rpgKitBonus, type RPGTrainerInventory } from './trainer-equipment';
import type { RPGTrainerSheet } from './trainer-sheet';

export interface RPGCraftRecipe {
	id: string; outputId: string; outputQuantity: number; hours: number;
	skill: string; dc?: number; kitId: string; minimumKitTier: number; kitCharges: number;
	inputs?: Readonly<Record<string, number>>; requiredTalent?: string;
	outputKind: 'equipment' | 'pokemon-item';
}
const BASIC_DRUGS = ['potion', 'antidote', 'awakening', 'burnheal', 'iceheal', 'paralyzeheal'];
export const RPG_CRAFT_RECIPES: Readonly<Record<string, RPGCraftRecipe>> = Object.freeze(Object.fromEntries([
	...BASIC_DRUGS.map(id => [`pharmacy:${id}`, {
		id: `pharmacy:${id}`, outputId: `player${id}`, outputQuantity: 3, hours: 0.5,
		skill: 'conhecimento:quimica', kitId: 'kit-cientifico', minimumKitTier: 1, kitCharges: 1,
		requiredTalent: 'cientista:producao-farmaceutica-pokemon',
		outputKind: 'pokemon-item' as const,
	}]),
	...([['superpotion', 2, 2], ['hyperpotion', 4, 2], ['fullheal', 2, 3]] as const).map(([id, charges, quantity]) =>
		[`pharmacy:${id}`, {
			id: `pharmacy:${id}`, outputId: `player${id}`, outputQuantity: quantity, hours: 1,
			skill: 'conhecimento:quimica', kitId: 'kit-cientifico', minimumKitTier: 2, kitCharges: charges,
			requiredTalent: 'cientista:farmacologia-avancada',
			outputKind: 'pokemon-item' as const,
		}]),
	...([['maxpotion', 6], ['fullrestore', 8]] as const).map(([id, charges]) =>
		[`pharmacy:${id}`, {
			id: `pharmacy:${id}`, outputId: `player${id}`, outputQuantity: 1, hours: 8,
			skill: 'conhecimento:quimica', kitId: 'kit-cientifico', minimumKitTier: 3, kitCharges: charges,
			requiredTalent: 'cientista:mestre-de-formulacao',
			outputKind: 'pokemon-item' as const,
		}]),
	['culinary:pokemon-ration', {
		id: 'culinary:pokemon-ration', outputId: 'racao-pokemon', outputQuantity: 4, hours: 1,
		skill: 'oficio:culinaria', dc: 12, kitId: 'kit-culinaria', minimumKitTier: 1, kitCharges: 0,
		inputs: { alimento: 3 }, requiredTalent: 'cozinheiro:racao-artesanal-pokemon',
		outputKind: 'equipment' as const,
	}],
]));

export function planRPGCraft(sheet: RPGTrainerSheet, inventory: RPGTrainerInventory,
	recipeId: string, options: { startedAt: number,
		campaignTime: number, random?: () => number, }) {
	const recipe = RPG_CRAFT_RECIPES[recipeId];
	if (!recipe) throw new Error('Receita não conhecida');
	if (!recipe.requiredTalent || !(sheet.talents.class.includes(recipe.requiredTalent) ||
		sheet.talents.apex === recipe.requiredTalent)) {
		throw new Error('Talento exigido pela receita não adquirido');
	}
	if (!recipeId.startsWith('pharmacy:') &&
		!sheet.skills.trained.includes(recipe.skill)) throw new Error('Perícia exigida pela receita não treinada');
	if (!Number.isSafeInteger(options.startedAt) || !Number.isSafeInteger(options.campaignTime) ||
		options.startedAt < 0 || (options.campaignTime - options.startedAt) / 3_600_000 < recipe.hours) {
		throw new Error('Tempo de fabricação insuficiente');
	}
	let charges = recipe.kitCharges;
	if (charges >= 2 && recipeId.startsWith('pharmacy:') &&
		recipe.requiredTalent !== 'cientista:mestre-de-formulacao' &&
		sheet.talents.class.includes('cientista:economia-de-reagentes')) charges--;
	const eligibleKits = inventory.items.filter(entry => entry.location === 'bag' &&
		entry.itemId.startsWith(recipe.kitId) && (rpgEquipment(entry.itemId).tier || 1) >= recipe.minimumKitTier);
	if (!eligibleKits.length) throw new Error('Kit apropriado indisponível');
	const kit = eligibleKits.find(entry => (entry.charges || 0) >= charges);
	if (!kit) throw new Error('Cargas do kit insuficientes');
	const kitBonus = rpgKitBonus(sheet, kit.itemId);
	if (kitBonus.disadvantage) throw new Error('Domínio do kit exigido para fabricar');
	for (const [itemId, quantity] of Object.entries(recipe.inputs || {})) {
		if (inventory.items.filter(entry => entry.location === 'bag' && entry.itemId === itemId)
			.reduce((sum, entry) => sum + entry.quantity, 0) < quantity) throw new Error('Ingredientes insuficientes');
	}
	const check = recipe.dc === undefined ? null : rollRPGTrainerSkillCheck(sheet, recipe.skill, undefined,
		{ dc: recipe.dc, bonus: kitBonus.bonus }, options.random || Math.random);
	return { recipe, kitInstanceId: kit.id, chargesConsumed: charges,
		inputsConsumed: recipe.inputs || {}, produced: check && !check.success ? null :
		{ itemId: recipe.outputId, quantity: recipe.outputQuantity, kind: recipe.outputKind },
		check };
}

export interface RPGWorkOrder {
	id: string; characterId: string; client: string; objective: string;
	startedAt: number; dueAt: number; minimumHours: number; payment: number;
	materialCost: number; completedAt?: number; paid?: boolean;
}
/** Contrato aprovado antes do trabalho; a arbitragem do Mestre fixa demanda e pagamento. */
export function createRPGWorkOrder(input: RPGWorkOrder): RPGWorkOrder {
	if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id) || !input.characterId ||
		!input.client?.trim() || !input.objective?.trim() ||
		!Number.isSafeInteger(input.startedAt) || !Number.isSafeInteger(input.dueAt) ||
		input.dueAt <= input.startedAt || !Number.isFinite(input.minimumHours) || input.minimumHours <= 0 ||
		!Number.isSafeInteger(input.payment) || input.payment < 0 || input.payment > 1_000_000 ||
		!Number.isSafeInteger(input.materialCost) || input.materialCost < 0) {
		throw new Error('Encomenda inválida');
	}
	return structuredClone(input);
}
export function completeRPGWorkOrder(order: RPGWorkOrder, now: number,
	workedHours: number, masterApproved: boolean) {
	if (order.paid || order.completedAt) throw new Error('Encomenda já concluída');
	if (!Number.isSafeInteger(now) || now < order.startedAt || now > order.dueAt ||
		!Number.isFinite(workedHours) || workedHours < order.minimumHours ||
		workedHours > (now - order.startedAt) / 3_600_000) {
		throw new Error('Prazo ou tempo de serviço não cumprido');
	}
	if (!masterApproved) throw new Error('Entrega ainda não aprovada pelo Mestre');
	return { order: { ...order, completedAt: now, paid: true },
		payment: order.payment, netIncome: order.payment - order.materialCost };
}
