import { RPG_TRAINER_TALENTS } from './trainer-talents-catalog';
import { rpgTrainerProficiency, rpgTrainerSkillAttributes, type RPGTrainerAttribute } from './trainer-checks';
import type { RPGTrainerSheet } from './trainer-sheet';

export type RPGTrainerRollKind = 'attribute' | 'skill' | 'resistance' | 'attack' | 'initiative';
export interface RPGTrainerRollTalent {
	key: string;
	id: string;
	name: string;
	condition: string;
	bonus: number;
	advantage: boolean;
	naturalFloor?: number;
	requiredAttribute?: RPGTrainerAttribute;
	targets: readonly string[];
}
type Rule = { targets: readonly string[], bonus?: number, advantage?: boolean, condition: string,
	perVariant?: boolean, naturalFloor?: number, requiredAttribute?: RPGTrainerAttribute, };

/** Só efeitos que alteram diretamente uma rolagem do próprio treinador entram neste catálogo.
 * Requisitos narrativos são confirmados pelo jogador; posse, alvo e magnitude são validados no servidor. */
const RULES: Readonly<Record<string, Rule>> = {
	'arqueologo:cartografo-de-ruinas': { targets: ['skill:sobrevivencia', 'skill:percepcao', 'skill:investigacao'], bonus: 2,
		condition: 'Consultar mapa feito após percorrer a construção.' },
	'arqueologo:especialista-em-fosseis': { targets: ['skill:conhecimento:*', 'skill:investigacao', 'skill:oficio:*'], bonus: 2,
		condition: 'Identificar, localizar, extrair ou preservar fósseis.' },
	'arqueologo:expedicionario-de-catacumbas': { targets: ['skill:percepcao', 'skill:investigacao', 'skill:sobrevivencia', 'resistance:*'], bonus: 2,
		condition: 'Reconhecer ou evitar perigos estruturais em ruínas.' },
	'arqueologo:leitura-estratigrafica': { targets: ['skill:conhecimento:*', 'skill:investigacao', 'skill:oficio:*'], bonus: 2,
		condition: 'Primeira busca ou escavação no ponto previamente examinado.' },
	'arqueologo:mestre-da-escavacao': { targets: ['skill:conhecimento:*', 'skill:investigacao', 'skill:oficio:*'], bonus: 4,
		condition: 'Escavação coordenada pelo Arqueólogo presente; substitui o +2 de Leitura Estratigráfica.' },
	'arqueologo:voz-das-eras': { targets: ['skill:conhecimento:*'], naturalFloor: 10,
		condition: 'Interpretar detalhes de uma inscrição histórica estudada por dez minutos.' },
	'cientista:autoridade-cientifica': { targets: ['skill:conhecimento:*'], naturalFloor: 10,
		condition: 'Ter tempo e meios adequados para examinar o problema em uma das três áreas escolhidas.' },
	'cozinheiro:mestre-da-cozinha': { targets: ['skill:oficio:culinaria'], naturalFloor: 10,
		condition: 'Possuir ingredientes e tempo minimamente adequados para o preparo.' },
	'arqueologo:olho-para-falsificacoes': { targets: ['skill:conhecimento:*', 'skill:investigacao', 'skill:percepcao'], bonus: 2,
		condition: 'Reconhecer falsificações ou alterações em objeto histórico.' },
	'arqueologo:resgate-de-reliquia': { targets: ['attribute:*', 'skill:*', 'resistance:*'], bonus: 2,
		condition: 'Proteger ou recuperar objeto histórico, documento, fóssil ou artefato ameaçado por dano, perda ou roubo.' },
	'artista:presenca-magnetica': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Primeiro teste contra quem ouviu sua apresentação na cena.' },
	'artista:tecnica-assinatura': { targets: ['skill:atuacao'], bonus: 2, perVariant: true,
		condition: 'Modalidade artística escolhida é o elemento principal.' },
	'artista:artista-versatil': { targets: ['skill:atuacao'], bonus: 2, perVariant: true,
		condition: 'Modalidade artística escolhida é o elemento principal.' },
	'artista:composicao-marcante': { targets: ['skill:atuacao'], bonus: 2,
		condition: 'Um teste da apresentação com composição preparada.' },
	'artista:inspiracao-artistica': { targets: ['skill:*'], bonus: 2,
		condition: 'Primeiro teste após receber Inspiração Artística válida; só marque se você foi o beneficiado.' },
	'artista:mil-faces': { targets: ['skill:*'], bonus: 2, requiredAttribute: 'charisma',
		condition: 'Sustentar imitação com aparência e voz.' },
	'artista-marcial:chave-de-contencao': { targets: ['skill:atletismo'], bonus: 2,
		condition: 'Agarrar ou manter uma criatura agarrada.' },
	'artista-marcial:reflexos-treinados': { targets: ['resistance:reflexes'], bonus: 2,
		condition: 'Somente se Reflexos já era treinado antes deste talento.' },
	'artista-marcial:disciplina-de-ferro': { targets: ['resistance:will'], bonus: 2,
		condition: 'Resistir a medo, coerção ou provocação.' },
	'artista-marcial:quebra-precisa': { targets: ['skill:atletismo'], bonus: 2,
		condition: 'Quebrar, arrombar ou deslocar objetos.' },
	'artista-marcial:respiracao-controlada': { targets: ['resistance:fortitude'], bonus: 2,
		condition: 'Resistir a fumaça, gases, sufocamento ou esforço prolongado.' },
	'atleta:especialidade-esportiva': { targets: ['skill:atletismo', 'skill:acrobacia'], bonus: 2, perVariant: true,
		condition: 'Teste diretamente ligado à modalidade escolhida.' },
	'atleta:atleta-polivalente': { targets: ['skill:atletismo', 'skill:acrobacia'], bonus: 2, perVariant: true,
		condition: 'Teste diretamente ligado a uma das três modalidades escolhidas.' },
	'atleta:nadador-de-travessia': { targets: ['skill:atletismo'], bonus: 2,
		condition: 'Nadar, rebocar alguém ou permanecer na superfície em águas turbulentas.' },
	'atleta:escalador-tecnico': { targets: ['skill:atletismo'], bonus: 2,
		condition: 'Escalada que realmente exija teste.' },
	'atleta:montaria-esportiva': { targets: ['skill:montaria-pokemon'], bonus: 2,
		condition: 'Corrida, salto, prova de obstáculos ou viagem prolongada com sua montaria.' },
	'atleta:olho-para-as-regras': { targets: ['skill:atletismo'],
		condition: 'Usar Atletismo para perceber infração, equipamento irregular, pontuação inconsistente ou estratégia de uma prova observada.' },
	'atleta:adaptacao-climatica': { targets: ['resistance:fortitude'], bonus: 2,
		condition: 'Contra calor, frio, chuva, vento ou altitude, após preparação.' },
	'atleta:lider-de-expedicao': { targets: ['skill:atletismo', 'skill:acrobacia', 'resistance:fortitude'], bonus: 2,
		condition: 'Teste físico de deslocamento sob liderança de expedição.' },
	'cientista:diagnostico-comparativo': { targets: ['skill:conhecimento:*'], bonus: 2,
		condition: 'Comparar duas ou mais amostras analisadas.' },
	'cientista:arquivo-de-amostras': { targets: ['skill:conhecimento:*'], bonus: 2,
		condition: 'Consultar amostra identificada do arquivo.' },
	'cientista:publicacao-de-referencia': { targets: ['skill:conhecimento:*'], bonus: 2,
		condition: 'Consultar obra publicada por dez minutos para um teste sobre o assunto.' },
	'cozinheiro:forrageio-gastronomico': { targets: ['skill:sobrevivencia'], bonus: 2,
		condition: 'Localizar, reconhecer ou coletar ingredientes comestíveis em ambiente selvagem.' },
	'cozinheiro:paladar-resistente': { targets: ['resistance:fortitude'], bonus: 2,
		condition: 'Contra alimentos, bebidas ou odores nocivos.' },
	'coreografo:movimento-espelhado': { targets: ['skill:atuacao', 'skill:acrobacia'], bonus: 2,
		condition: 'Movimentos conjuntos com Pokémon disposto.' },
	'coreografo:leitura-do-espaco': { targets: ['skill:percepcao'], bonus: 2,
		condition: 'Identificar circulação, posicionamento ou riscos evidentes após observar a área por um minuto.' },
	'coreografo:mestre-de-cerimonias': { targets: ['skill:atuacao', 'skill:persuasao'], bonus: 2,
		condition: 'Conduzir um evento depois de conhecer espaço, participantes e programação.' },
	'criador-pokemon:manejo-sem-estresse': { targets: ['skill:empatia-pokemon', 'skill:adestramento-pokemon',
		'skill:medicina-pokemon', 'skill:atletismo', 'skill:montaria-pokemon'], bonus: 2,
	condition: 'Conduzir, transportar, examinar ou conter sem violência Pokémon assustado, ferido ou agitado fora de combate.' },
	'criador-pokemon:ninho-intacto': { targets: ['skill:percepcao', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Localizar ninhos, filhotes ou sinais de reprodução Pokémon.' },
	'detetive:arquivo-de-casos': { targets: ['skill:investigacao'], bonus: 2,
		condition: 'Investigar o assunto de um dossiê ativo, cruzando evidências já registradas.' },
	'detetive:vigilancia-discreta': { targets: ['skill:percepcao', 'skill:furtividade'], bonus: 2,
		condition: 'Acompanhar à distância pessoa, veículo ou local sem ser percebido.' },
	'detetive:parceiro-investigativo': { targets: ['skill:investigacao', 'skill:percepcao'], bonus: 2,
		condition: 'Pokémon parceiro presente e auxiliando; uma vez por cena.' },
	'detetive:passo-de-perseguicao': { targets: ['skill:atletismo', 'skill:acrobacia', 'skill:pilotagem:*'], bonus: 2,
		condition: 'Perseguir ou escapar de um alvo.' },
	'detetive:contradicao-explorada': { targets: ['skill:persuasao', 'skill:intimidacao'], bonus: 2,
		condition: 'Próximo teste contra depoente após expor contradição real.' },
	'diplomata:porta-voz-reconhecido': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Próximo teste social após aliado fornecer contribuição relevante.' },
	'encantador:espelhamento-social': { targets: ['skill:persuasao', 'skill:enganacao'], bonus: 2,
		condition: 'Próximo teste após um minuto ajustando sua abordagem.' },
	'encantador:visual-adequado': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao'], bonus: 2,
		condition: 'Primeira cena em que apresentação pessoal preparada seja relevante.' },
	'encantador:apresentacao-perfeita': { targets: ['skill:persuasao', 'skill:enganacao'], bonus: 2,
		condition: 'Primeiro teste social após apresentação entre duas pessoas.' },
	'encantador:rosto-memoravel': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao'], bonus: 2,
		condition: 'Primeiro teste social com pessoa que o reconhece.' },
	'encantador:salao-na-palma-da-mao': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao'], bonus: 2,
		condition: 'Teste social compatível com o tom definido para o evento.' },
	'explorador:especialista-de-terreno': { targets: ['skill:sobrevivencia', 'skill:percepcao'], bonus: 2, perVariant: true,
		condition: 'Orientação, perigos ou rotas no terreno escolhido.' },
	'fotografo:panorama-de-reconhecimento': { targets: ['skill:investigacao', 'skill:percepcao', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Primeiro teste após consultar panorama da área.' },
	'guarda-pokemon:patrulha-atenta': { targets: ['skill:percepcao'], bonus: 2,
		condition: 'Segurança de uma área durante patrulha.' },
	'guarda-pokemon:perseguicao-oficial': { targets: ['skill:atletismo', 'skill:pilotagem:*'], bonus: 2,
		condition: 'Manter perseguição a pessoa, veículo ou montaria.' },
	'guarda-pokemon:rede-de-cadastros': { targets: ['skill:persuasao', 'skill:investigacao'], bonus: 2,
		condition: 'Solicitar consulta por meio da rede profissional.' },
	'guarda-pokemon:comandante-de-operacao': { targets: ['skill:*'], bonus: 2,
		condition: 'Primeiro teste ligado à função recebida na operação coordenada.' },
	'guarda-pokemon:procedimento-de-abordagem': { targets: ['skill:persuasao', 'skill:intimidacao'], bonus: 2,
		condition: 'Pedir parada ou afastamento após observar a pessoa.' },
	'guarda-pokemon:rastreador-de-infratores': { targets: ['skill:sobrevivencia'], bonus: 2,
		condition: 'Seguir vestígios de infratores.' },
	'ladino:rota-de-fuga': { targets: ['skill:atletismo', 'skill:acrobacia', 'skill:furtividade'], bonus: 2,
		condition: 'Escapar de perseguidores em rota previamente memorizada.' },
	'ladino:entrada-alternativa': { targets: ['skill:acrobacia', 'skill:atletismo'], bonus: 2,
		condition: 'Primeiro teste para alcançar entrada alternativa.' },
	'mentalista:mapa-de-relacoes': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Usar relação observada como argumento.' },
	'mentalista:arquiteto-social': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Primeira tentativa por caminho planejado na organização estudada.' },
	'mentalista:reacao-antecipada': { targets: ['initiative', 'skill:persuasao', 'skill:enganacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Ação imediata segue reação corretamente prevista.' },
	'mestre-pokemon:registro-de-campo': { targets: ['skill:conhecimento:pokemon', 'skill:natureza', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Primeira busca da espécie registrada na região.' },
	'mestre-pokemon:observador-de-formas': { targets: ['skill:percepcao', 'skill:sobrevivencia', 'skill:conhecimento:pokemon'], bonus: 2,
		condition: 'Busca deliberada por espécie existente na região.' },
	'mestre-pokemon:auxiliar-pokemon': { targets: ['skill:*'], bonus: 2,
		condition: 'Pokémon com amizade necessária ajuda fora de combate de modo coerente.' },
	'mestre-pokemon:pontaria-paciente': { targets: ['skill:captura'], advantage: true,
		condition: 'Arremesso após observar o alvo; aplique apenas quando a regra de captura permitir.' },
	'fotografo:fotografo-de-lendas': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao'], bonus: 2,
		condition: 'Conseguir acesso ou informação sobre descoberta extraordinária documentada.' },
	'tecnologo:especializacao-tecnica': { targets: ['skill:tecnologia'], bonus: 2, perVariant: true,
		condition: 'Tarefa diretamente relacionada à área técnica escolhida.' },
	'reflexo-de-sobrevivencia': { targets: ['resistance:reflexes'], bonus: 2,
		condition: 'Armadilha, queda de objeto, desabamento ou perigo ambiental.' },
	'orientacao-natural': { targets: ['skill:sobrevivencia', 'skill:percepcao'], bonus: 2,
		condition: 'Evitar se perder, refazer caminho ou interpretar mapa.' },
	'aprendizado-por-observacao': { targets: ['skill:*'],
		condition: 'Após observar por dez minutos alguém treinado executar a tarefa, repita a abordagem antes do próximo descanso longo.' },
	'arremesso-treinado': { targets: ['skill:captura'], bonus: 1,
		condition: 'Teste de arremesso de Poké Bola; não se aplica à chance percentual.' },
	'vigia-experiente': { targets: ['skill:percepcao'], bonus: 2,
		condition: 'Notar aproximação, ruído ou alteração durante vigília.' },
	'apaziguador': { targets: ['skill:persuasao'], bonus: 2,
		condition: 'Pedir pausa ou impedir escalada antes do conflito começar.' },
	'afinidade-pokemon': { targets: ['skill:empatia-pokemon'], bonus: 2,
		condition: 'Acalmar ou compreender Pokémon não hostil.' },
	'retirada-planejada': { targets: ['skill:atletismo', 'skill:acrobacia', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Ação própria para organizar ou executar fuga; não em torneios.' },
	'etiqueta': { targets: ['skill:persuasao', 'skill:atuacao'], bonus: 2,
		condition: 'Primeiro teste após observar protocolo formal por dez minutos.' },
	'cuidados-de-campo': { targets: ['skill:medicina-pokemon'], bonus: 2,
		condition: 'Diagnosticar, estabilizar ou cuidar de Pokémon fora de combate.' },
	'observador-de-especies': { targets: ['skill:conhecimento:*'], bonus: 2,
		condition: 'Identificar espécie ou hábitos após dez minutos de observação.' },
	'documentacao-em-ordem': { targets: ['skill:enganacao', 'skill:persuasao'], bonus: 2,
		condition: 'Solicitar, renovar ou comprovar licença disponível.' },
	'mente-firme': { targets: ['resistance:will'], advantage: true,
		condition: 'Resistir ou encerrar medo, fascínio, controle ou compulsão mental.' },
	'corpo-resistente': { targets: ['resistance:fortitude'], advantage: true,
		condition: 'Resistir a doença, veneno, alimento, água ou náusea ambiental.' },
	'aclimatacao': { targets: ['resistance:fortitude', 'attribute:constitution'], advantage: true, perVariant: true,
		condition: 'Exaustão ou desconforto natural do ambiente escolhido.' },
	'marcha-resistente': { targets: ['resistance:fortitude', 'attribute:constitution'], advantage: true,
		condition: 'Primeiro teste da jornada contra exaustão por marcha ou esforço.' },
	'psiquico:concentracao-inabalavel': { targets: ['resistance:will', 'attribute:constitution'], advantage: true,
		condition: 'Manter concentração psíquica após interrupção.' },
};

function matches(targets: readonly string[], kind: RPGTrainerRollKind, id: string): boolean {
	const actual = kind === 'initiative' ? 'initiative' : `${kind}:${id}`;
	return targets.some(target => target === actual || target.endsWith('*') && actual.startsWith(target.slice(0, -1)));
}

export function rpgTrainerRollTalents(sheet: RPGTrainerSheet): RPGTrainerRollTalent[] {
	const owned = [...new Set([...sheet.talents.general, ...sheet.talents.class,
		...(sheet.talents.apex ? [sheet.talents.apex] : [])])];
	const options = owned.flatMap(id => {
		const rule = RULES[id];
		const definition = RPG_TRAINER_TALENTS.find(talent => talent.id === id);
		if (!rule || !definition || id === 'detetive:parceiro-investigativo' &&
			(!sheet.investigativePartnerPokemonId || sheet.investigativePartnerUnavailable) ||
			id === 'artista-marcial:reflexos-treinados' &&
			!sheet.talentSelections?.some(selection => selection.id === id && selection.variant === 'already-trained')) {
			return [];
		}
		const variants = id === 'cientista:autoridade-cientifica' ? (sheet.talentSelections || [])
			.filter(selection => selection.id === id)
			.flatMap(selection => [selection.variant, selection.secondVariant, selection.thirdVariant]
				.filter((value): value is string => !!value)) : rule.perVariant ? (sheet.talentSelections || [])
			.filter(selection => selection.id === id)
			.flatMap(selection => id === 'atleta:atleta-polivalente' ?
				[selection.variant, selection.secondVariant, selection.thirdVariant]
					.filter((value): value is string => !!value) : id === 'artista:artista-versatil' ?
					[selection.variant, selection.secondVariant].filter((value): value is string => !!value) :
					selection.variant ? [selection.variant] : []) : [null];
		return variants.map(variant => ({ key: variant ? `${id}@${variant}` : id, id,
			name: variant ? `${definition.name} (${variant.replace(/[-:]/g, ' ')})` : definition.name,
			condition: rule.condition, bonus: id === 'aprendizado-por-observacao' ?
				rpgTrainerProficiency(sheet.level) : rule.bonus || 0, advantage: !!rule.advantage,
			...(rule.naturalFloor ? { naturalFloor: rule.naturalFloor } : {}),
			...(rule.requiredAttribute ? { requiredAttribute: rule.requiredAttribute } : {}),
			targets: id === 'cientista:autoridade-cientifica' && variant ? [`skill:${variant}`] : rule.targets }));
	});
	if (sheet.comfortingArt && sheet.comfortingArt.restCycle === (sheet.talentRestCycle || 0)) {
		options.push({ key: `artista:arte-reconfortante@${sheet.comfortingArt.sourceCharacterId}`,
			id: 'artista:arte-reconfortante', name: `Arte Reconfortante de ${sheet.comfortingArt.sourceName}`,
			condition: 'Próximo teste de Vontade contra medo antes do próximo descanso longo.',
			bonus: 2, advantage: false, targets: ['resistance:will'] });
	}
	const hypothesis = sheet.persistentHypothesis;
	if (sheet.talents.class.includes('cientista:hipotese-persistente') && hypothesis &&
		!hypothesis.awaitingOutcome && hypothesis.failures > 0) {
		options.push({ key: 'cientista:hipotese-persistente', id: 'cientista:hipotese-persistente',
			name: 'Hipótese Persistente', bonus: Math.min(2, hypothesis.failures), advantage: false,
			condition: 'Nova tentativa após uma falha registrada.',
			targets: ['skill:conhecimento:*'] });
	}
	return options;
}

/** Uma falha registrada prepara o bônus; outra só pode ser registrada após a tentativa seguinte. */
export function rpgUpdatePersistentHypothesis(sheet: RPGTrainerSheet,
	input: { action: 'failure' | 'reset' }): RPGTrainerSheet {
	if (sheet.status !== 'complete' || !sheet.talents.class.includes('cientista:hipotese-persistente')) {
		throw new Error('Este treinador não possui Hipótese Persistente');
	}
	if (!input || typeof input !== 'object' ||
		!['failure', 'reset'].includes(input.action)) {
		throw new Error('Ação de pesquisa inválida');
	}
	const next = structuredClone(sheet);
	if (input.action === 'reset') {
		next.persistentHypothesis = undefined;
		return next;
	}
	const current = next.persistentHypothesis;
	if (current && !current.awaitingOutcome) {
		throw new Error('Realize a tentativa preparada ou encerre esta hipótese');
	}
	next.persistentHypothesis = { failures: Math.min(2, (current?.failures || 0) + 1) };
	return next;
}

export function rpgTrainerRollTalentOptions(sheet: RPGTrainerSheet, kind: RPGTrainerRollKind, id: string,
	attribute?: RPGTrainerAttribute) {
	const usedAttribute = kind === 'skill' ? attribute || rpgTrainerSkillAttributes(sheet, id)[0] : undefined;
	return rpgTrainerRollTalents(sheet).filter(talent => matches(talent.targets, kind, id) &&
		(!talent.requiredAttribute || usedAttribute === talent.requiredAttribute) &&
		(talent.id !== 'aprendizado-por-observacao' || kind === 'skill' &&
		id !== 'conhecimento' && id !== 'oficio' && !sheet.skills.trained.includes(id)));
}

/** Efeito concedido por outro treinador; a identidade do aliado é validada pela mesa no servidor. */
export function rpgEncouragingPresenceOption(allyId: string, allyName: string, ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.general.includes('presenca-encorajadora')) return null;
	return { key: `presenca-encorajadora@${allyId}`, id: 'presenca-encorajadora',
		name: `Presença Encorajadora de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Primeiro teste de Vontade contra medo na cena, após ouvir o aliado por pelo menos um minuto.',
		targets: ['resistance:will'] };
}

/** A inspiração de outro Artista pode ser marcada pelo beneficiado no primeiro teste da perícia combinada. */
export function rpgArtisticInspirationOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.class.includes('artista:inspiracao-artistica')) return null;
	return { key: `artista:inspiracao-artistica@${allyId}`, id: 'artista:inspiracao-artistica',
		name: `Inspiração Artística de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Primeiro teste da perícia escolhida após um minuto de encorajamento artístico do aliado; ' +
			'a inspiração deve ser compreendida e relacionada ao desafio.',
		targets: ['skill:*'] };
}

/** A orientação do Cientista beneficia um teste prático do aliado após uma análise concluída. */
export function rpgTechnicalOpinionOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.class.includes('cientista:parecer-tecnico')) return null;
	return { key: `cientista:parecer-tecnico@${allyId}`, id: 'cientista:parecer-tecnico',
		name: `Parecer Técnico de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Um único teste diretamente relacionado a uma análise concluída com Método Científico; ' +
			'você deve seguir a orientação específica do Cientista antes que as condições mudem.',
		targets: ['skill:*'] };
}

export function rpgTeamCaptainOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet, recipientId: string): RPGTrainerRollTalent | null {
	const plan = ally.captainPlan;
	if (ally.status !== 'complete' || !ally.talents.class.includes('atleta:capitao-de-time') ||
		!plan?.recipientCharacterIds.includes(recipientId)) return null;
	return { key: `atleta:capitao-de-time@${allyId}`, id: 'atleta:capitao-de-time',
		name: `Capitão de Time de ${allyName}`, bonus: 2, advantage: false,
		condition: `Teste físico diretamente ligado ao plano: ${plan.description}.`,
		targets: ['skill:atletismo', 'skill:acrobacia'] };
}

/** O ápice usa apenas o Ataque Especial base da espécie do parceiro já vinculado. */
export function rpgDetectiveDuoOption(sheet: RPGTrainerSheet, partnerName: string,
	baseSpecialAttack: number): RPGTrainerRollTalent | null {
	if (sheet.status !== 'complete' || sheet.talents.apex !== 'detetive:dupla-indissociavel' ||
		!sheet.talents.class.includes('detetive:parceiro-investigativo') ||
		!sheet.talents.class.includes('detetive:voz-do-parceiro') ||
		!sheet.investigativePartnerPokemonId || sheet.investigativePartnerUnavailable ||
		!Number.isFinite(baseSpecialAttack) || baseSpecialAttack < 0) return null;
	return { key: 'detetive:dupla-indissociavel', id: 'detetive:dupla-indissociavel',
		name: 'Ápice — Dupla Indissociável', bonus: Math.floor(baseSpecialAttack / 20), advantage: false,
		condition: `Investigação conduzida junto de ${partnerName}; ambos devem poder contribuir para a análise.`,
		targets: ['skill:intuicao'] };
}

/** O plano beneficia apenas os participantes designados que ainda não usaram seu primeiro teste. */
export function rpgDetectiveCapturePlanOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet, recipientId: string, campaignTime: string): RPGTrainerRollTalent | null {
	const plan = ally.capturePlan;
	if (ally.status !== 'complete' || !ally.talents.class.includes('detetive:plano-de-captura') ||
		!plan?.recipientCharacterIds.includes(recipientId) || plan.usedRecipientIds.includes(recipientId) ||
		!Number.isFinite(Date.parse(plan.readyAt)) || Date.parse(plan.readyAt) > Date.parse(campaignTime)) return null;
	return { key: `detetive:plano-de-captura@${allyId}`, id: 'detetive:plano-de-captura',
		name: `Plano de Captura de ${allyName}`, bonus: 2, advantage: false,
		condition: `Primeiro teste para ocupar posição, bloquear rota, seguir o alvo ou iniciar perseguição: ${plan.description}.`,
		targets: ['skill:atletismo', 'skill:acrobacia', 'skill:furtividade', 'skill:percepcao',
			'skill:sobrevivencia', 'skill:pilotagem:*'] };
}

export function rpgChoreographyGroupOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet, recipientId: string, campaignTime: string): RPGTrainerRollTalent[] {
	if (ally.status !== 'complete') return [];
	return (ally.choreographyGroups || []).filter(group =>
		group.recipientCharacterIds.includes(recipientId) &&
		Date.parse(group.expiresAt) > Date.parse(campaignTime) &&
		(group.kind !== 'warmup' || !group.usedRecipientIds.includes(recipientId)))
		.map(group => ({ key: `coreografo:${group.kind}@${allyId}`,
			id: group.kind === 'warmup' ? 'coreografo:preparacao-corporal-conjunta' :
			'coreografo:conducao-de-evacuacao',
			name: `${group.kind === 'warmup' ? 'Preparação Corporal Conjunta' : 'Condução de Evacuação'} de ${allyName}`,
			bonus: group.kind === 'warmup' ? 1 : 2, advantage: false,
			condition: `Atividade preparada: ${group.activity}. ` +
				(group.kind === 'warmup' ? 'Primeiro teste físico fora de combate.' :
				'Travessia de obstáculo durante a evacuação, sem afetar batalha.'),
			targets: group.kind === 'warmup' ?
				['attribute:strength', 'attribute:dexterity', 'attribute:constitution',
					'skill:atletismo', 'skill:acrobacia'] :
				['skill:atletismo', 'skill:acrobacia', 'skill:sobrevivencia'],
		}));
}

/** O líder presente pode orientar os deslocamentos físicos dos demais participantes da expedição. */
export function rpgExpeditionLeaderOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.talents.apex !== 'atleta:lider-de-expedicao') return null;
	return { key: `atleta:lider-de-expedicao@${allyId}`, id: 'atleta:lider-de-expedicao',
		name: `Líder de Expedição de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Teste físico de deslocamento durante travessia, prova coletiva ou fuga prolongada ' +
			'sob instruções do líder presente.',
		targets: ['skill:atletismo', 'skill:acrobacia', 'resistance:fortitude'] };
}

/** Até dois aliados designados podem aproveitar a distração nas perícias indicadas. */
export function rpgCaptivatingDistractionOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.class.includes('artista:distracao-cativante')) return null;
	return { key: `artista:distracao-cativante@${allyId}`, id: 'artista:distracao-cativante',
		name: `Distração Cativante de ${allyName}`, bonus: 2, advantage: false,
		condition: 'O Artista passou no teste de Atuação e mantém os observadores distraídos; ' +
			'você deve ser um dos dois aliados escolhidos e agir contra esses observadores.',
		targets: ['skill:furtividade', 'skill:ladinagem'] };
}

/** O ápice pode beneficiar outro participante da mesma escavação, sem conceder o talento ao aliado. */
export function rpgExcavationMasterOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.talents.apex !== 'arqueologo:mestre-da-escavacao') return null;
	return { key: `arqueologo:mestre-da-escavacao@${allyId}`, id: 'arqueologo:mestre-da-escavacao',
		name: `Mestre da Escavação de ${allyName}`, bonus: 4, advantage: false,
		condition: 'Escavação coordenada pelo aliado presente; substitui o +2 de Leitura Estratigráfica.',
		targets: ['skill:conhecimento:*', 'skill:investigacao', 'skill:oficio:*'] };
}

/** A referência beneficia o destinatário, nunca automaticamente o autor do talento. */
export function rpgSharedArchiveOptions(authorId: string, authorName: string, author: RPGTrainerSheet,
	recipientId: string): RPGTrainerRollTalent[] {
	if (author.status !== 'complete' || !author.talents.class.includes('arqueologo:acervo-compartilhado')) return [];
	return (author.sharedArchives || []).filter(entry => entry.slot < rpgTrainerProficiency(author.level) &&
		entry.recipientCharacterId === recipientId &&
		author.skills.trained.includes(entry.knowledge) && entry.knowledge.startsWith('conhecimento:'))
		.map(entry => ({ key: `acervo-compartilhado@${authorId}:${entry.slot}`,
			id: 'arqueologo:acervo-compartilhado', name: 'Acervo Compartilhado',
			condition: `Referência de ${authorName}: ${entry.topic}.`, bonus: 2,
			advantage: false, targets: [`skill:${entry.knowledge}`] }));
}

export function rpgSetSharedArchive(sheet: RPGTrainerSheet, slot: number,
	entry: { topic: string, knowledge: string, recipientCharacterId: string } | null): RPGTrainerSheet {
	if (sheet.status !== 'complete' || !sheet.talents.class.includes('arqueologo:acervo-compartilhado')) {
		throw new Error('Este treinador não possui Acervo Compartilhado');
	}
	if (!Number.isInteger(slot) || slot < 0 || slot >= rpgTrainerProficiency(sheet.level)) {
		throw new Error('Espaço de acervo inválido');
	}
	const archives = (sheet.sharedArchives || []).filter(archive => archive.slot !== slot);
	if (entry) {
		const topic = entry.topic?.trim();
		if (!topic || topic.length > 120) throw new Error('Escreva um tema de até 120 caracteres');
		if (!entry.knowledge?.startsWith('conhecimento:') ||
			!sheet.skills.trained.includes(entry.knowledge)) {
			throw new Error('Escolha uma área de Conhecimento treinada pelo Arqueólogo');
		}
		if (!entry.recipientCharacterId) throw new Error('Escolha quem receberá o acervo');
		archives.push({ slot, topic, knowledge: entry.knowledge,
			recipientCharacterId: entry.recipientCharacterId });
	}
	return { ...sheet, sharedArchives: archives.sort((left, right) => left.slot - right.slot) };
}

export function rpgResolveTrainerRollTalents(sheet: RPGTrainerSheet, kind: RPGTrainerRollKind,
	id: string, selected: readonly string[], allies: readonly RPGTrainerRollTalent[] = [],
	attribute?: RPGTrainerAttribute) {
	if (!Array.isArray(selected) || selected.length > 20 ||
		selected.some(key => typeof key !== 'string') || new Set(selected).size !== selected.length) {
		throw new Error('Talentos da rolagem inválidos');
	}
	const available = [...rpgTrainerRollTalentOptions(sheet, kind, id, attribute),
		...allies.filter(talent => matches(talent.targets, kind, id))];
	const chosen = selected.map(key => {
		const talent = available.find(option => option.key === key);
		if (!talent) throw new Error('Talento indisponível para esta rolagem');
		return talent;
	});
	if (new Set(chosen.map(talent => talent.id)).size !== chosen.length) {
		if (chosen.filter(talent => talent.id === 'arqueologo:acervo-compartilhado').length > 1) {
			throw new Error('Apenas um Acervo Compartilhado pode beneficiar a mesma rolagem');
		}
		throw new Error('Variantes do mesmo talento não se acumulam na rolagem');
	}
	if (chosen.some(talent => talent.id === 'arqueologo:mestre-da-escavacao') &&
		chosen.some(talent => talent.id === 'arqueologo:leitura-estratigrafica')) {
		throw new Error('Mestre da Escavação substitui o bônus de Leitura Estratigráfica');
	}
	if (chosen.some(talent => talent.id === 'artista:tecnica-assinatura') &&
		chosen.some(talent => talent.id === 'artista:artista-versatil')) {
		throw new Error('Técnica Assinatura e Artista Versátil não se acumulam na mesma apresentação');
	}
	if (chosen.some(talent => talent.id === 'atleta:especialidade-esportiva') &&
		chosen.some(talent => talent.id === 'atleta:atleta-polivalente')) {
		throw new Error('Especialidade Esportiva e Atleta Polivalente não se acumulam na mesma modalidade');
	}
	const naturalFloor = Math.max(0, ...chosen.map(talent => talent.naturalFloor || 0));
	return { chosen, bonus: chosen.reduce((total, talent) => total + talent.bonus, 0),
		advantages: chosen.filter(talent => talent.advantage).length,
		...(naturalFloor ? { naturalFloor } : {}) };
}

/** Mantém cada parcela visível no chat, sem somar talentos novamente ao resultado já calculado. */
export function rpgTrainerRollBonusTerms(baseBonus: number, talents: readonly RPGTrainerRollTalent[]): string {
	const term = (value: number) => value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
	return [term(baseBonus), ...talents.filter(talent => talent.bonus !== 0)
		.map(talent => term(talent.bonus))].join(' ');
}
