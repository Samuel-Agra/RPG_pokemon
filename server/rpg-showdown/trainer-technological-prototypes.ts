import type { RPGTrainerSheet } from './trainer-sheet';

export const RPG_INITIAL_PROTOTYPES = [
	{ id: 'holofote-acompanhante', effect: 'Drone de luz que acompanha o usuário; ilumina 12 m claramente e mais 12 m fracamente.' },
	{ id: 'microdrone-manipulador', effect: 'Drone com pinça que manipula objetos soltos de até 2 kg a até 9 m.' },
	{ id: 'projetor-holografico', effect: 'Projeta imagem estática ou som curto em até 9 m por até 10 minutos.' },
	{ id: 'scanner-multiespectral', effect: 'Lê propriedades físicas em cone de 6 m; +2 em Investigação ou Tecnologia compatível.' },
	{ id: 'baliza-sentinela', effect: 'Monitora movimento em raio de 6 m por até 8 horas e envia alerta silencioso.' },
	{ id: 'purificador-portatil', effect: 'Purifica um cantil de água naturalmente contaminada em 10 minutos.' },
	{ id: 'reparador-precisao', effect: 'Repara em 10 minutos um pequeno objeto mundano com as peças principais presentes.' },
	{ id: 'amortecedor-cinetico', effect: 'Ao vestir, reduz dano de queda em 1d6 + proficiência do criador; rearma em 10 minutos.' },
	{ id: 'navegador-retorno', effect: 'Registra o trajeto por 24 horas e dá vantagem em Sobrevivência para refazê-lo.' },
] as const;

export const RPG_ADVANCED_PROTOTYPES = [
	{ id: 'drone-reconhecimento', charges: 4, effect: 'Voa até 300 m por uma hora, transmitindo imagem e som com câmera, luz e visão térmica simples.' },
	{ id: 'mapeador-tridimensional', charges: 3, effect: 'Registra em até uma hora o trajeto e os obstáculos observados em mapa tridimensional; vantagem para refazer o percurso.' },
	{ id: 'sonda-resgate', charges: 4, effect: 'Por dez minutos, detecta sinais vitais comuns a até 18 m e indica quantidade e direção aproximada.' },
	{ id: 'repetidor-longo-alcance', charges: 3, effect: 'Amplia para 5 km o alcance de rádios e de uma Rede de Campo conectada, se o sinal não for bloqueado.' },
	{ id: 'camuflagem-optica-estatica', charges: 4, effect: 'Concede +2 em Furtividade visual a usuário imóvel; mover-se encerra a camuflagem até parar novamente.' },
	{ id: 'exoesqueleto-carga', charges: 4, effect: 'Dobra a capacidade de carga e concede +2 em Atletismo para erguer, empurrar ou transportar peso.' },
	{ id: 'decodificador-protocolos', charges: 3, effect: 'Analisa protocolo eletrônico por dez minutos e permite usar Tecnologia para compreender comandos básicos, sem revelar senhas.' },
	{ id: 'respirador-ambiental', charges: 4, effect: 'Fornece ar respirável por até uma hora e filtra fumaça, poeira e gases comuns.' },
	{ id: 'plataforma-extracao', charges: 4, effect: 'Ancora cabo a até 18 m e ergue ou desce até 200 kg com instalação estável.' },
] as const;

export function rpgTechnologicalPrototypeLimit(sheet: RPGTrainerSheet): number {
	if (sheet.classId !== 'tecnologo' || sheet.status !== 'complete') return 0;
	if (sheet.talents.apex === 'tecnologo:central-de-prototipos') return 5;
	return 1 + Math.min(2, sheet.talents.class.filter(id => id === 'tecnologo:prototipos-paralelos').length);
}

export function rpgTechnologicalPrototypeChargeCost(sheet: RPGTrainerSheet, baseCost: number): number {
	if (!Number.isSafeInteger(baseCost) || baseCost < 1) throw new Error('Custo de protótipo inválido');
	return baseCost >= 2 && sheet.talents.class.includes('tecnologo:economia-de-componentes') ?
		baseCost - 1 : baseCost;
}
