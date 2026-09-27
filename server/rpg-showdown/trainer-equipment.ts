/** Catálogo e invariantes do equipamento humano. Não modifica os atributos de Pokémon em batalha. */
import type { RPGTrainerSheet } from './trainer-sheet';

export type RPGEquipmentLegality = 'free' | 'controlled' | 'restricted' | 'institutional';
export type RPGEquipmentSlot = 'body-outfit' | 'body-improvement' | 'head-improvement' | 'shield' | 'accessory';
export interface RPGEquipmentDefinition {
	id: string; name: string; category: string; weight: number; spaces: number; stackLimit: number;
	price: number; rarity: 'common' | 'uncommon' | 'rare' | 'very-rare';
	legality: RPGEquipmentLegality; maxCharges?: number; refillFor?: string;
	domain?: string; skill?: string; equipSlot?: RPGEquipmentSlot; tier?: number;
	defenseBonus?: number; movementBonusMeters?: number;
	vehicle?: { passengers: number, cargoSpaces: number, cargoKg: number, energy?: number, registration: boolean };
}
type Row = [string, string, string, number, number, number, number, RPGEquipmentLegality?, Partial<RPGEquipmentDefinition>?];
const rows: Row[] = [
	['kit-culinaria-1', 'Kit de Culinária I', 'kit', 3, 2, 1, 1000, 'free', { domain: 'kit-culinaria', tier: 1 }],
	['kit-culinaria-2', 'Kit de Culinária II', 'kit', 6, 3, 1, 4000, 'free', { domain: 'kit-culinaria', tier: 2 }],
	['kit-culinaria-3', 'Kit de Culinária III', 'kit', 12, 5, 1, 12000, 'free', { domain: 'kit-culinaria', tier: 3 }],
	['kit-medico-1', 'Kit Médico I', 'kit', 2, 2, 1, 1500, 'free', { domain: 'kit-medico', skill: 'medicina', tier: 1, maxCharges: 5 }],
	['kit-medico-2', 'Kit Médico II', 'kit', 5, 3, 1, 6000, 'controlled', { domain: 'kit-medico', skill: 'medicina', tier: 2, maxCharges: 10 }],
	['kit-medico-3', 'Kit Médico III', 'kit', 10, 5, 1, 18000, 'controlled', { domain: 'kit-medico', skill: 'medicina', tier: 3, maxCharges: 15 }],
	['kit-medicina-pokemon', 'Kit de Medicina Pokémon', 'kit', 3, 2, 1, 2000, 'free', { domain: 'kit-medicina-pokemon', skill: 'medicina-pokemon', maxCharges: 5 }],
	['kit-arqueologia', 'Kit de Arqueologia', 'kit', 4, 3, 1, 2500, 'free', { domain: 'kit-arqueologia', skill: 'conhecimento:arqueologia-fosseis' }],
	['kit-fotografia', 'Kit de Fotografia', 'kit', 2, 2, 1, 3500, 'free', { domain: 'kit-fotografia' }],
	['kit-ladinagem-1', 'Kit de Ladinagem I', 'kit', 0.5, 1, 1, 2000, 'controlled', { domain: 'kit-ladinagem', skill: 'ladinagem', tier: 1 }],
	['kit-ladinagem-2', 'Kit de Ladinagem II', 'kit', 1, 1, 1, 7000, 'controlled', { domain: 'kit-ladinagem', skill: 'ladinagem', tier: 2 }],
	['kit-ladinagem-3', 'Kit de Ladinagem III', 'kit', 2, 2, 1, 20000, 'restricted', { domain: 'kit-ladinagem', skill: 'ladinagem', tier: 3 }],
	['kit-cientifico-1', 'Kit Científico I', 'kit', 4, 3, 1, 4000, 'free', { domain: 'kit-cientifico', skill: 'conhecimento', tier: 1, maxCharges: 5 }],
	['kit-cientifico-2', 'Kit Científico II', 'kit', 10, 5, 1, 15000, 'controlled', { domain: 'kit-cientifico', skill: 'conhecimento', tier: 2, maxCharges: 10 }],
	['kit-cientifico-3', 'Kit Científico III', 'kit', 25, 10, 1, 45000, 'restricted', { domain: 'kit-cientifico', skill: 'conhecimento', tier: 3, maxCharges: 20 }],
	['kit-tecnologico-1', 'Kit Tecnológico I', 'kit', 3, 2, 1, 3500, 'free', { domain: 'kit-tecnologico', skill: 'tecnologia', tier: 1, maxCharges: 5 }],
	['kit-tecnologico-2', 'Kit Tecnológico II', 'kit', 7, 4, 1, 12000, 'controlled', { domain: 'kit-tecnologico', skill: 'tecnologia', tier: 2, maxCharges: 10 }],
	['kit-tecnologico-3', 'Kit Tecnológico III', 'kit', 15, 7, 1, 36000, 'restricted', { domain: 'kit-tecnologico', skill: 'tecnologia', tier: 3, maxCharges: 20 }],
	['kit-sobrevivencia', 'Kit de Sobrevivência', 'kit', 5, 3, 1, 2000],
	['kit-disfarce', 'Kit de Disfarce', 'kit', 1, 1, 1, 2500, 'free', { domain: 'kit-disfarce', maxCharges: 5 }],
	['kit-investigacao', 'Kit de Investigação', 'kit', 2, 2, 1, 3000, 'free', { domain: 'kit-investigacao', skill: 'investigacao' }],
	['kit-explorador', 'Kit de Explorador', 'kit', 6, 3, 1, 2500],
	['refil-medico', 'Refil Médico', 'refill', 0.5, 1, 9, 600, 'free', { maxCharges: 5, refillFor: 'kit-medico' }],
	['refil-medicina-pokemon', 'Refil Medicina Pokémon', 'refill', 0.5, 1, 9, 800, 'free', { maxCharges: 5, refillFor: 'kit-medicina-pokemon' }],
	['refil-cientifico', 'Refil Científico', 'refill', 1, 1, 9, 1500, 'controlled', { maxCharges: 5, refillFor: 'kit-cientifico' }],
	['refil-tecnologico', 'Refil Tecnológico', 'refill', 1, 1, 9, 1200, 'controlled', { maxCharges: 5, refillFor: 'kit-tecnologico' }],
	['refil-disfarce', 'Refil de Disfarce', 'refill', 0.5, 1, 9, 500, 'free', { maxCharges: 5, refillFor: 'kit-disfarce' }],
	['faca', 'Faca', 'melee', 0.5, 1, 1, 150], ['machadinha', 'Machadinha', 'melee', 1, 1, 1, 300],
	['martelo-leve', 'Martelo Leve', 'melee', 0.8, 1, 1, 150],
	['espada', 'Espada', 'melee', 1.5, 2, 1, 1200, 'controlled', { domain: 'armas-melee-exoticas' }],
	['nunchaku', 'Nunchaku', 'melee', 0.7, 1, 1, 600, 'controlled', { domain: 'armas-melee-exoticas' }],
	['lanca', 'Lança', 'melee', 2.5, 3, 1, 500, 'controlled', { domain: 'armas-melee-exoticas' }],
	['arco-curto', 'Arco Curto', 'ranged', 1, 2, 1, 600], ['arco-longo', 'Arco Longo', 'ranged', 1.5, 3, 1, 1200],
	['revolver', 'Revólver', 'ranged', 1, 1, 1, 8000, 'restricted', { domain: 'armas-ranged-exoticas', maxCharges: 6 }],
	['espingarda', 'Espingarda', 'ranged', 3.5, 3, 1, 12000, 'restricted', { domain: 'armas-ranged-exoticas', maxCharges: 6 }],
	['rifle', 'Rifle', 'ranged', 4, 4, 1, 16000, 'restricted', { domain: 'armas-ranged-exoticas', maxCharges: 5 }],
	['flecha', 'Pacote de 10 flechas', 'ammunition', 0.5, 1, 9, 100],
	['municao-revolver', 'Munição de revólver', 'ammunition', 0.2, 1, 9, 500, 'restricted'],
	['municao-espingarda', 'Munição de espingarda', 'ammunition', 0.4, 1, 9, 700, 'restricted'],
	['municao-rifle', 'Munição de rifle', 'ammunition', 0.3, 1, 9, 800, 'restricted'],
	['spray-pimenta', 'Spray de Pimenta', 'nonlethal', 0.2, 1, 1, 400, 'free', { maxCharges: 4 }],
	['refil-spray-pimenta', 'Refil de Spray', 'refill', 0.2, 1, 9, 250, 'free', { maxCharges: 4, refillFor: 'spray-pimenta' }],
	['dispositivo-choque', 'Dispositivo de Choque', 'nonlethal', 0.4, 1, 1, 900, 'controlled', { maxCharges: 5 }],
	['bateria-choque', 'Bateria de Choque', 'refill', 0.2, 1, 9, 400, 'controlled', { maxCharges: 5, refillFor: 'dispositivo-choque' }],
	['taser', 'Taser', 'nonlethal', 0.8, 1, 1, 2500, 'controlled', { maxCharges: 1 }],
	['cartucho-taser', 'Cartucho de Taser', 'refill', 0.1, 1, 9, 350, 'controlled', { maxCharges: 1, refillFor: 'taser' }],
	['bastao-contencao', 'Bastão de Contenção', 'nonlethal', 0.8, 1, 1, 700, 'controlled'],
	['roupa-exploracao-leve', 'Roupa de Exploração Leve', 'outfit', 2, 2, 1, 1000, 'free', { equipSlot: 'body-outfit', defenseBonus: 1 }],
	['roupa-exploracao-reforcada', 'Roupa de Exploração Reforçada', 'outfit', 5, 3, 1, 4000, 'free', { equipSlot: 'body-outfit', defenseBonus: 2 }],
	['roupa-exploracao-pesada', 'Roupa de Exploração Pesada', 'outfit', 10, 5, 1, 12000, 'free', { equipSlot: 'body-outfit', defenseBonus: 3, movementBonusMeters: -1.5 }],
	['escudo', 'Escudo', 'shield', 4, 3, 1, 2500, 'controlled', { equipSlot: 'shield', domain: 'escudos' }],
	['forro-termico', 'Forro Térmico', 'improvement', 2, 2, 1, 2000, 'free', { equipSlot: 'body-improvement' }],
	['sistema-resfriamento', 'Sistema de Resfriamento', 'improvement', 2, 2, 1, 2500, 'free', { equipSlot: 'body-improvement' }],
	['camada-impermeavel', 'Camada Impermeável', 'improvement', 1, 1, 1, 1200, 'free', { equipSlot: 'body-improvement' }],
	['colete-flutuacao', 'Colete de Flutuação', 'improvement', 1.5, 2, 1, 1500, 'free', { equipSlot: 'body-improvement' }],
	['arnes-escalada', 'Arnês de Escalada', 'improvement', 1.5, 2, 1, 1500, 'free', { equipSlot: 'body-improvement' }],
	['colete-protecao', 'Colete de Proteção', 'improvement', 4, 3, 1, 6000, 'controlled', { equipSlot: 'body-improvement', defenseBonus: 1 }],
	['suporte-corrida', 'Suporte de Corrida', 'improvement', 1, 1, 1, 2500, 'free', { equipSlot: 'body-improvement', movementBonusMeters: 1.5 }],
	['protecao-esportiva', 'Proteção Esportiva', 'improvement', 1.5, 2, 1, 1800, 'free', { equipSlot: 'body-improvement' }],
	['roupa-mobilidade', 'Roupa de Mobilidade', 'improvement', 1, 1, 1, 2000, 'free', { equipSlot: 'body-improvement' }],
	['cinto-levantamento', 'Cinto de Levantamento', 'improvement', 1.5, 2, 1, 1800, 'free', { equipSlot: 'body-improvement' }],
	['estabilizador-salto', 'Estabilizador de Salto', 'improvement', 1, 1, 1, 2000, 'free', { equipSlot: 'body-improvement' }],
	['capacete', 'Capacete', 'improvement', 1.5, 2, 1, 1500, 'free', { equipSlot: 'head-improvement' }],
	['oculos-protecao', 'Óculos de Proteção', 'improvement', 0.3, 1, 1, 700, 'free', { equipSlot: 'head-improvement' }],
	['mascara-filtrante', 'Máscara Filtrante', 'improvement', 0.5, 1, 1, 2000, 'free', { equipSlot: 'head-improvement', maxCharges: 8 }],
	['refil-filtro', 'Refil de Filtro', 'refill', 0.3, 1, 9, 800, 'free', { maxCharges: 8, refillFor: 'mascara-filtrante' }],
	['lanterna-cabeca', 'Lanterna de Cabeça', 'improvement', 0.3, 1, 1, 600, 'free', { equipSlot: 'head-improvement', maxCharges: 5 }],
	['protetor-auditivo', 'Protetor Auditivo', 'improvement', 0.3, 1, 1, 450, 'free', { equipSlot: 'head-improvement' }],
	['cantil', 'Cantil', 'food', 0.3, 1, 1, 300, 'free', { maxCharges: 4 }],
	['racao', 'Ração de Viagem', 'food', 0.5, 1, 9, 100], ['alimento', 'Alimento', 'food', 0.5, 1, 9, 75],
	['racao-pokemon', 'Ração Pokémon', 'food', 0.5, 1, 9, 100], ['suprimento-fogueira', 'Suprimento para Fogueira', 'camp', 0.5, 1, 9, 100],
	['barraca', 'Barraca', 'camp', 6, 3, 1, 2500], ['saco-dormir', 'Saco de Dormir', 'camp', 1.5, 1, 1, 700],
	['cobertor', 'Cobertor', 'camp', 2, 1, 1, 300], ['rede', 'Rede', 'camp', 1.5, 1, 1, 600], ['lona', 'Lona', 'camp', 2, 2, 1, 400],
	['equipamento-artistico', 'Equipamento Artístico', 'general', 2, 2, 1, 1500],
	['traje-apresentacao', 'Traje de Apresentação', 'outfit', 1, 1, 1, 800, 'free', { equipSlot: 'body-outfit' }],
	['traje-formal', 'Traje Formal', 'outfit', 1, 1, 1, 1200, 'free', { equipSlot: 'body-outfit' }],
	['credencial-apresentacao', 'Credencial de Apresentação', 'general', 0, 0, 1, 0],
	['equipamento-esportivo', 'Equipamento Esportivo', 'general', 2, 2, 1, 1000],
	['conjunto-cenico-pokemon', 'Conjunto Cênico Pokémon', 'general', 3, 2, 1, 1500],
	['conjunto-mentalismo', 'Conjunto de Mentalismo', 'general', 1.5, 1, 1, 1200],
	['objeto-foco', 'Objeto de Foco', 'general', 0, 0, 1, 0],
	['comunicador-pessoal', 'Comunicador Pessoal', 'device', 0.2, 1, 1, 1200, 'free', { maxCharges: 5 }],
	['radio-campo', 'Rádio de Campo', 'device', 0.6, 1, 1, 1800, 'free', { maxCharges: 5 }],
	['lanterna-portatil', 'Lanterna Portátil', 'device', 0.4, 1, 1, 350, 'free', { maxCharges: 5 }],
	['refil-energia', 'Refil Universal de Energia', 'refill', 0.5, 1, 9, 400, 'free', { maxCharges: 5, refillFor: 'device' }],
	['bussola', 'Bússola', 'general', 0.1, 1, 1, 250], ['binoculo', 'Binóculo', 'general', 0.8, 1, 1, 1000],
	['caderno-campo', 'Caderno de Campo', 'general', 0.4, 1, 1, 150],
	['gravador-digital', 'Gravador Digital', 'device', 0.2, 1, 1, 800, 'free', { maxCharges: 5 }],
	['relogio-campo', 'Relógio de Campo', 'device', 0.1, 1, 1, 500, 'free', { maxCharges: 5 }],
	['alarme-pessoal', 'Alarme Pessoal', 'device', 0.1, 1, 1, 300, 'free', { maxCharges: 3 }],
	['apito-emergencia', 'Apito de Emergência', 'general', 0, 0, 1, 80],
	['sinalizador', 'Sinalizador', 'general', 0.2, 1, 9, 150],
	['cadeado-reforcado', 'Cadeado Reforçado', 'general', 0.5, 1, 1, 500],
	['algema', 'Algema', 'general', 0.5, 1, 1, 700, 'controlled'],
	['abracadeira', 'Abraçadeira de Contenção', 'general', 0.2, 1, 9, 100, 'controlled'],
	['preservacao-evidencia', 'Material de Evidência', 'general', 0.5, 1, 9, 250],
	['estojo-impermeavel', 'Estojo Impermeável', 'general', 0.8, 1, 1, 600],
	['maca-dobravel', 'Maca Dobrável', 'general', 4, 3, 1, 1500],
	['cobertor-termico', 'Cobertor Térmico', 'general', 0.3, 1, 9, 120],
	['luvas-trabalho', 'Luvas de Trabalho', 'general', 0.3, 1, 1, 250],
	['carroca-leve', 'Carroça Leve', 'vehicle', 60, 0, 1, 6000, 'free', { vehicle: { passengers: 1, cargoSpaces: 40, cargoKg: 200, registration: false } }],
	['carroca-viagem', 'Carroça de Viagem', 'vehicle', 120, 0, 1, 18000, 'free', { vehicle: { passengers: 2, cargoSpaces: 80, cargoKg: 500, registration: false } }],
	['motocicleta', 'Motocicleta', 'vehicle', 180, 0, 1, 30000, 'controlled', { maxCharges: 10, vehicle: { passengers: 2, cargoSpaces: 10, cargoKg: 30, energy: 10, registration: true } }],
	['carro', 'Carro', 'vehicle', 1200, 0, 1, 75000, 'controlled', { maxCharges: 12, vehicle: { passengers: 5, cargoSpaces: 60, cargoKg: 300, energy: 12, registration: true } }],
	['jipe', 'Jipe', 'vehicle', 1600, 0, 1, 110000, 'controlled', { maxCharges: 10, vehicle: { passengers: 5, cargoSpaces: 100, cargoKg: 600, energy: 10, registration: true } }],
	['reserva-energia-veiculo', 'Reserva de Energia', 'vehicle-supply', 10, 4, 1, 1000, 'controlled', { maxCharges: 2, refillFor: 'vehicle' }],
	['holofote-acompanhante', 'Holofote Acompanhante', 'prototype', 0.5, 1, 1, 0],
	['microdrone-manipulador', 'Microdrone Manipulador', 'prototype', 0.5, 1, 1, 0],
	['projetor-holografico', 'Projetor Holográfico', 'prototype', 0.5, 1, 1, 0],
	['scanner-multiespectral', 'Scanner Multiespectral', 'prototype', 0.5, 1, 1, 0],
	['baliza-sentinela', 'Baliza Sentinela', 'prototype', 0.5, 1, 1, 0],
	['purificador-portatil', 'Purificador Portátil', 'prototype', 0.5, 1, 1, 0],
	['reparador-precisao', 'Reparador de Precisão', 'prototype', 0.5, 1, 1, 0],
	['amortecedor-cinetico', 'Amortecedor Cinético', 'prototype', 0.5, 1, 1, 0],
	['navegador-retorno', 'Navegador de Retorno', 'prototype', 0.5, 1, 1, 0],
];
export const RPG_EQUIPMENT_CATALOG: Readonly<Record<string, RPGEquipmentDefinition>> = Object.freeze(Object.fromEntries(
	rows.map(([id, name, category, weight, spaces, stackLimit, price, legality = 'free', extra]) =>
		[id, Object.freeze({ id, name, category, weight, spaces, stackLimit, price, legality,
			rarity: price >= 20000 ? 'very-rare' : price >= 5000 || legality === 'restricted' ? 'rare' :
			price >= 1000 || legality === 'controlled' ? 'uncommon' : 'common', ...extra })])
));
export function rpgEquipment(id: string): RPGEquipmentDefinition {
	const item = RPG_EQUIPMENT_CATALOG[id];
	if (!item) throw new Error('Equipamento desconhecido: ' + id);
	return item;
}
export interface RPGEquipmentInstance {
	id: string; itemId: string; quantity: number; equipped: boolean; charges?: number;
	location: 'bag' | 'bank' | 'vehicle'; vehicleId?: string;
}
export interface RPGLicense { id: string; status: 'active' | 'temporary' | 'suspended' | 'revoked'; expiresAt?: number; issuedBy: string }
export interface RPGTrainerInventory {
	version: 1; revision: number; items: RPGEquipmentInstance[]; licenses: RPGLicense[];
	pokemonStorage?: { itemId: string, quantity: number, location: 'bank' | 'vehicle', vehicleId?: string }[];
}

export function rpgInitialTrainerInventory(sheet: RPGTrainerSheet): RPGTrainerInventory {
	const items: RPGEquipmentInstance[] = [];
	const occupiedSlots = new Set<RPGEquipmentSlot>();
	for (const [index, entry] of (sheet.equipment || []).entries()) {
		const definition = RPG_EQUIPMENT_CATALOG[entry.itemId];
		if (!definition) continue; // Itens Pokémon iniciais continuam na Bag legada.
		if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) throw new Error('Quantidade inicial inválida');
		const split = definition.stackLimit === 1 ? entry.quantity : Math.ceil(entry.quantity / definition.stackLimit);
		const equipped = !!entry.equipped && !!definition.equipSlot && !occupiedSlots.has(definition.equipSlot);
		if (equipped) occupiedSlots.add(definition.equipSlot!);
		for (let part = 0; part < split; part++) items.push({
			id: `initial-${index}-${part}`, itemId: definition.id,
			quantity: Math.min(definition.stackLimit, entry.quantity - part * definition.stackLimit),
			equipped: equipped && part === 0,
			...(definition.maxCharges !== undefined ? { charges: entry.charges ?? definition.maxCharges } : {}),
			location: 'bag',
		});
	}
	return { version: 1, revision: 0, items, licenses: [], pokemonStorage: [] };
}

export function rpgEquipmentSlots(items: readonly RPGEquipmentInstance[], location: RPGEquipmentInstance['location'] = 'bag'): number {
	return items.reduce((total, entry) => total + (entry.location === location && !entry.equipped ? rpgEquipment(entry.itemId).spaces : 0), 0);
}
export function rpgEquipmentWeight(items: readonly RPGEquipmentInstance[], location?: RPGEquipmentInstance['location']): number {
	return items.reduce((total, entry) => total + (!location || entry.location === location ?
		rpgEquipment(entry.itemId).weight * entry.quantity + (entry.itemId === 'cantil' ? (entry.charges || 0) * 0.5 : 0) : 0), 0);
}
export function rpgHasLicense(inventory: RPGTrainerInventory, id: string, now: number): boolean {
	return inventory.licenses.some(license => license.id === id &&
		(license.status === 'active' || license.status === 'temporary') &&
		(license.expiresAt === undefined || license.expiresAt > now));
}
export function rpgEquipmentLicenseId(item: RPGEquipmentDefinition): string | null {
	if (item.legality === 'free') return null;
	if (item.legality === 'restricted') return item.category === 'ranged' || item.category === 'ammunition' ? 'arma-fogo' : 'restrito';
	if (item.legality === 'institutional') return 'institucional';
	if (item.category === 'vehicle' || item.category === 'vehicle-supply') return 'veiculo';
	if (item.category === 'kit' || item.category === 'refill') {
		if (item.id.includes('medic')) return 'medica';
		if (item.id.includes('cientifico')) return 'cientifica';
		if (item.id.includes('tecnologico')) return 'tecnologica';
	}
	if (item.category === 'ranged' || item.category === 'melee' || item.category === 'nonlethal' ||
		item.category === 'ammunition' || item.category === 'shield' || item.id === 'colete-protecao') return 'defensiva';
	return 'contencao';
}
export function rpgAssertEquipmentLicense(inventory: RPGTrainerInventory, item: RPGEquipmentDefinition, now: number): void {
	const license = rpgEquipmentLicenseId(item);
	if (license && !rpgHasLicense(inventory, license, now)) throw new Error(`Licença ${license} necessária para ${item.name}`);
}

/** O domínio exige treinamento correspondente, mas ter a perícia não concede domínio automaticamente. */
export function rpgCanAcquireKitDomain(sheet: RPGTrainerSheet, domain: string): boolean {
	const item = Object.values(RPG_EQUIPMENT_CATALOG).find(candidate => candidate.domain === domain && candidate.category === 'kit');
	if (!item) throw new Error('Domínio de kit desconhecido');
	return !item.skill || sheet.skills.trained.some(skill => skill === item.skill ||
		(item.skill === 'conhecimento' && skill.startsWith('conhecimento:')));
}
export function rpgKitBonus(sheet: RPGTrainerSheet, itemId: string | null): { bonus: number, disadvantage: boolean } {
	if (!itemId) return { bonus: 0, disadvantage: true };
	const item = rpgEquipment(itemId);
	if (item.category !== 'kit') throw new Error('O item não é um kit');
	if (!item.domain) return { bonus: 0, disadvantage: false };
	const proficient = (sheet.proficiencies || []).includes(item.domain);
	return { bonus: proficient ? Math.max(0, (item.tier || 1) - 1) : 0, disadvantage: !proficient };
}

/** Opções para as estatísticas humanas derivadas, calculadas apenas do equipamento vestido. */
export function rpgEquipmentDerivedOptions(sheet: RPGTrainerSheet, inventory: RPGTrainerInventory,
	pokemonItemQuantity = 0, bagWeight = 1) {
	const worn = inventory.items.filter(entry => entry.equipped && entry.location === 'bag').map(entry => rpgEquipment(entry.itemId));
	const shield = worn.find(item => item.equipSlot === 'shield');
	return {
		carriedKg: rpgEquipmentWeight(inventory.items, 'bag') + pokemonItemQuantity * 0.1 + bagWeight,
		shield: !!shield && (sheet.proficiencies || []).includes('escudos'),
		defenseBonus: worn.reduce((sum, item) => sum + (item.defenseBonus || 0), 0) +
			(shield && !(sheet.proficiencies || []).includes('escudos') ? 1 : 0),
		movementBonusMeters: worn.reduce((sum, item) => sum + (item.movementBonusMeters || 0), 0),
	};
}

/** A anatomia é arbitrada pelo Mestre; este cálculo não concede bônus ao Pokémon em combate. */
export function rpgTractionCapacity(baseAttack: number, size: 'tiny' | 'small' | 'medium' | 'large' | 'huge',
	anatomyApproved: boolean): number {
	if (!anatomyApproved) return 0;
	if (!Number.isSafeInteger(baseAttack) || baseAttack < 1 || baseAttack > 255) throw new Error('Ataque base inválido');
	const multiplier = { tiny: 0.25, small: 0.5, medium: 1, large: 2, huge: 4 }[size];
	if (!multiplier) throw new Error('Porte inválido');
	return baseAttack * 5 * multiplier;
}

export function rpgTractionLoad(vehicleId: 'carroca-leve' | 'carroca-viagem', cargoKg: number,
	passengerKg: readonly number[], pokemon: readonly { baseAttack: number, size: 'tiny' | 'small' | 'medium' | 'large' | 'huge', anatomyApproved: boolean }[],
	humanStrength?: number) {
	if (!['carroca-leve', 'carroca-viagem'].includes(vehicleId)) throw new Error('Veículo de tração inválido');
	const item = rpgEquipment(vehicleId);
	const vehicle = item.vehicle!;
	if (!Number.isFinite(cargoKg) || cargoKg < 0 || cargoKg > vehicle.cargoKg ||
		!Array.isArray(passengerKg) || passengerKg.length > vehicle.passengers ||
		passengerKg.some(weight => !Number.isFinite(weight) || weight < 0) ||
		pokemon.length > (vehicleId === 'carroca-leve' ? 1 : 2) ||
		(pokemon.length > 0 && humanStrength !== undefined)) throw new Error('Carga ou tração inválida');
	const capacityKg = pokemon.length ? pokemon.reduce((sum, candidate) =>
		sum + rpgTractionCapacity(candidate.baseAttack, candidate.size, candidate.anatomyApproved), 0) :
		Number.isSafeInteger(humanStrength) && humanStrength! > 0 ? humanStrength! * 25 : 0;
	const totalKg = item.weight + cargoKg + passengerKg.reduce((sum, weight) => sum + weight, 0);
	return { capacityKg, totalKg, allowed: totalKg <= capacityKg,
		maximumMovementMeters: totalKg > capacityKg ? 0 : totalKg > capacityKg / 2 ? 6 : 9 };
}
