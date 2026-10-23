import { RPG_TRAINER_TALENTS } from './trainer-talents-catalog';
import { rpgTrainerAttributeBonus, rpgTrainerProficiency, rpgTrainerSkillAttributes,
	type RPGTrainerAttribute } from './trainer-checks';
import type { RPGTrainerSheet } from './trainer-sheet';
import { rpgManualTalentUsed } from './trainer-manual-rest';

export type RPGTrainerRollKind = 'attribute' | 'skill' | 'resistance' | 'attack' | 'initiative';
export interface RPGTrainerRollTalent {
	key: string;
	id: string;
	name: string;
	condition: string;
	bonus: number;
	advantage: boolean;
	naturalFloor?: number;
	replacesBaseWith?: number;
	requiredAttribute?: RPGTrainerAttribute;
	targets: readonly string[];
}
type Rule = { targets: readonly string[], bonus?: number, advantage?: boolean, condition: string,
	perVariant?: boolean, naturalFloor?: number, requiredAttribute?: RPGTrainerAttribute, };

const EXPLORER_TERRAIN_NAMES: Readonly<Record<string, string>> = {
	floresta: 'Floresta', montanha: 'Montanha', deserto: 'Deserto', pantano: 'Pântano',
	'ambiente-gelado': 'Ambiente gelado', litoral: 'Litoral', subterraneo: 'Subterrâneo',
	'urbano-em-ruinas': 'Urbano em ruínas',
};

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
	'tecnologo:genio-tecnologico': { targets: ['skill:tecnologia'], naturalFloor: 10,
		condition: 'Tratar como 10 um resultado natural inferior a 10 em Tecnologia.' },
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
	'medico:retirada-de-emergencia': { targets: ['skill:atletismo'], bonus: 2,
		condition: 'Carregar paciente atendido pelo Médico, evitando queda ou movimento que agrave o ferimento durante o transporte.' },
	'detetive:arquivo-de-casos': { targets: ['skill:investigacao'], bonus: 2,
		condition: 'Investigar o assunto de um dossiê ativo, cruzando evidências já registradas.' },
	'mentalista:maneirismos-copiados': { targets: ['skill:atuacao', 'skill:enganacao'], bonus: 2,
		condition: 'Disfarçado como a pessoa observada por uma hora, diante de quem a conhece apenas superficial ou profissionalmente.' },
	'detetive:vigilancia-discreta': { targets: ['skill:percepcao', 'skill:furtividade'], bonus: 2,
		condition: 'Acompanhar à distância pessoa, veículo ou local sem ser percebido.' },
	'detetive:parceiro-investigativo': { targets: ['skill:investigacao', 'skill:percepcao'], bonus: 2,
		condition: 'Pokémon parceiro presente e auxiliando; uma vez por cena.' },
	'detetive:passo-de-perseguicao': { targets: ['skill:atletismo', 'skill:acrobacia', 'skill:pilotagem:*'], bonus: 2,
		condition: 'Perseguir ou escapar de um alvo.' },
	'detetive:contradicao-explorada': { targets: ['skill:persuasao', 'skill:intimidacao'], bonus: 2,
		condition: 'Próximo teste contra depoente após expor contradição real.' },
	'diplomata:porta-voz-reconhecido': { targets: ['skill:*'], bonus: 2, requiredAttribute: 'charisma',
		condition: 'Próximo teste social após aliado fornecer contribuição relevante.' },
	'encantador:espelhamento-social': { targets: ['skill:persuasao', 'skill:enganacao'], bonus: 2,
		condition: 'Próximo teste após um minuto ajustando sua abordagem.' },
	'encantador:visual-adequado': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao', 'skill:intimidacao'], bonus: 2,
		condition: 'Primeira cena em que apresentação pessoal preparada seja relevante.' },
	'encantador:rosto-memoravel': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao'], bonus: 2,
		condition: 'Primeiro teste social com pessoa que o reconhece.' },
	'encantador:salao-na-palma-da-mao': { targets: ['skill:persuasao', 'skill:enganacao', 'skill:atuacao',
		'skill:intimidacao'], bonus: 2, requiredAttribute: 'charisma',
	condition: 'Teste social compatível com o tom definido para o evento.' },
	'explorador:especialista-de-terreno': { targets: ['skill:sobrevivencia', 'skill:percepcao'], bonus: 2, perVariant: true,
		condition: 'Orientação, perigos ou rotas no terreno escolhido.' },
	'explorador:localizador-de-desaparecidos': { targets: ['skill:sobrevivencia', 'skill:percepcao'], bonus: 2,
		condition: 'Procurar uma pessoa ou Pokémon desaparecido fora de combate.' },
	'explorador:linha-de-vida': { targets: ['skill:atletismo', 'skill:acrobacia'], bonus: 2,
		condition: 'Atravessar obstáculo natural com auxílio preparado pelo Explorador usando Kit de Sobrevivência.' },
	'fotografo:sequencia-de-acao': { targets: ['skill:investigacao'], bonus: 2,
		condition: 'Reconstruir acontecimento visível em uma sequência de imagens produzida com Registro Oportuno.' },
	'fotografo:ampliacao-forense': { targets: ['skill:investigacao', 'skill:percepcao'], bonus: 2,
		condition: 'Examinar por dez minutos fotografia de qualidade adequada para encontrar detalhes visuais registrados.' },
	'fotografo:credencial-de-imprensa': { targets: ['skill:investigacao'], bonus: 2,
		condition: 'Uma vez por evento coberto: comparar material oficial ou resposta do porta-voz com as próprias fotografias para buscar uma discrepância sustentada pelas evidências.' },
	'fotografo:panorama-de-reconhecimento': { targets: ['skill:investigacao', 'skill:percepcao', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Primeiro teste após consultar panorama da área.' },
	'guarda-pokemon:patrulha-atenta': { targets: ['skill:percepcao'], bonus: 2,
		condition: 'Segurança de uma área durante patrulha.' },
	'guarda-pokemon:perimetro-seguro': { targets: ['skill:percepcao'], bonus: 2,
		condition: 'Vigiar um ponto designado de um perímetro preparado e ainda válido.' },
	'guarda-pokemon:perseguicao-oficial': { targets: ['skill:atletismo', 'skill:pilotagem:*'], bonus: 2,
		condition: 'Manter perseguição a pessoa, veículo ou montaria.' },
	'guarda-pokemon:rede-de-cadastros': { targets: ['skill:persuasao', 'skill:investigacao'], bonus: 2,
		condition: 'Obter autorização, localizar o setor responsável ou convencer um contato profissional a consultar um registro compatível.' },
	'guarda-pokemon:busca-por-pokemon-desaparecido': { targets: ['skill:investigacao', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Localizar Pokémon desaparecido após obter descrição confiável ou examinar um vestígio ligado a ele.' },
	'guarda-pokemon:patrulheiro-de-reserva': { targets: ['skill:percepcao', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Encontrar sinais de atividade ilegal, invasão, incêndio, contaminação ou dano ao habitat em área protegida.' },
	'guarda-pokemon:comandante-de-operacao': { targets: ['skill:*', 'resistance:*'], bonus: 2,
		condition: 'Primeiro teste diretamente ligado à função recebida na operação, enquanto puder receber as instruções.' },
	'guarda-pokemon:rastreador-de-infratores': { targets: ['skill:sobrevivencia'], bonus: 2,
		condition: 'Seguir responsáveis por caça, captura clandestina, invasão ou dano ambiental a partir de vestígios reais.' },
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
	'mestre-pokemon:rastreador-de-especies': { targets: ['skill:conhecimento:pokemon', 'skill:sobrevivencia'], bonus: 2,
		condition: 'Seguir a trilha de uma espécie já registrada no Registro de Campo.' },
	'mestre-pokemon:observador-de-formas': { targets: ['skill:percepcao', 'skill:sobrevivencia', 'skill:conhecimento:pokemon'], bonus: 2,
		condition: 'Busca deliberada por espécie existente na região.' },
	'mestre-pokemon:pontaria-paciente': { targets: ['skill:captura'], advantage: true,
		condition: 'Arremesso após observar o alvo; aplique apenas quando a regra de captura permitir.' },
	'fotografo:fotografo-de-lendas': { targets: ['skill:persuasao', 'skill:enganacao',
		'skill:intimidacao', 'skill:atuacao'], bonus: 2,
	condition: 'Conseguir audiência, acesso ou informações diretamente relacionadas à descoberta extraordinária registrada pessoalmente em uma Fotografia Lendária.' },
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
	'psiquico:escudo-mental': { targets: ['resistance:will'], bonus: 2,
		condition: 'Resistir a leitura mental, controle, sugestão, alteração de memória ou detecção psíquica.' },
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
		if (!rule || !definition || rpgManualTalentUsed(sheet, id) || id === 'detetive:parceiro-investigativo' &&
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
			name: variant ? `${definition.name} (${id === 'explorador:especialista-de-terreno' ?
				EXPLORER_TERRAIN_NAMES[variant] || variant : variant.replace(/[-:]/g, ' ')})` : definition.name,
			condition: id === 'explorador:especialista-de-terreno' && variant ?
				`Orientação, perigos ou rotas em ${EXPLORER_TERRAIN_NAMES[variant] || variant}.` : rule.condition,
			bonus: id === 'aprendizado-por-observacao' ?
				rpgTrainerProficiency(sheet.level) : rule.bonus || 0, advantage: !!rule.advantage,
			...(rule.naturalFloor ? { naturalFloor: rule.naturalFloor } : {}),
			...(rule.requiredAttribute ? { requiredAttribute: rule.requiredAttribute } : {}),
			targets: id === 'cientista:autoridade-cientifica' && variant ? [`skill:${variant}`] : rule.targets }));
	});
	if (sheet.status === 'complete' && sheet.classId === 'diplomata') {
		options.push({ key: 'diplomata:mediacao-estruturada', id: 'diplomata:mediacao-estruturada',
			name: 'Mediação Estruturada', bonus: 2, advantage: false,
			condition: 'Concluir acordo após ouvir as partes por dez minutos e apresentar proposta que respeite suas exigências indispensáveis.',
			targets: ['skill:persuasao'] });
	}
	if (sheet.status === 'complete' && sheet.classId === 'mentalista') {
		options.push({ key: 'mentalista:sugestao-plausivel', id: 'mentalista:sugestao-plausivel',
			name: 'Sugestão Plausível', bonus: 0, advantage: true,
			condition: 'Sugerir uma ação possível e razoável, sem causar dano evidente, colocar o alvo em perigo ou contrariar seus princípios, vínculos ou deveres importantes.',
			targets: ['skill:persuasao'] });
	}
	if (sheet.status === 'complete' && sheet.classId === 'explorador') {
		options.push({ key: 'explorador:rastreador-persistente', id: 'explorador:rastreador-persistente',
			name: 'Rastreador Persistente', bonus: 2, advantage: false,
			condition: 'Encontrar, seguir ou retomar rastros e interpretar sinais de passagem em ambiente natural.',
			targets: ['skill:sobrevivencia'] });
	}
	if (sheet.status === 'complete' && sheet.classId === 'fotografo') {
		options.push({ key: 'fotografo:olhar-pela-lente', id: 'fotografo:olhar-pela-lente',
			name: 'Olhar pela Lente', bonus: 2, advantage: false,
			condition: 'Percepção visual através de equipamento fotográfico apropriado; não se aplica a outros sentidos.',
			targets: ['skill:percepcao'] });
	}
	if (sheet.status === 'complete' && sheet.classId === 'guarda-pokemon') {
		options.push({ key: 'guarda-pokemon:mira-de-contencao', id: 'guarda-pokemon:mira-de-contencao',
			name: 'Mira de Contenção', bonus: 2, advantage: false,
			condition: 'Após gastar uma ação mirando sem se mover, no próximo ataque à distância contra pessoa ou objeto; perder a visão do alvo ou a concentração encerra a mira. Nunca contra Pokémon em batalha.',
			targets: ['attack:ranged'] });
		options.push({ key: 'guarda-pokemon:contencao-treinada', id: 'guarda-pokemon:contencao-treinada',
			name: 'Contenção Treinada', bonus: 2, advantage: false,
			condition: 'Atletismo para agarrar, imobilizar, desarmar fisicamente, algemar ou conduzir uma pessoa contida; não se aplica a Pokémon.',
			targets: ['skill:atletismo'] });
	}
	if (sheet.comfortingArt && sheet.comfortingArt.restCycle === (sheet.talentRestCycle || 0)) {
		options.push({ key: `artista:arte-reconfortante@${sheet.comfortingArt.sourceCharacterId}`,
			id: 'artista:arte-reconfortante', name: `Arte Reconfortante de ${sheet.comfortingArt.sourceName}`,
			condition: 'Próximo teste de Vontade contra medo antes do próximo descanso longo.',
			bonus: 2, advantage: false, targets: ['resistance:will'] });
	}
	if (sheet.preventiveProtocol && !sheet.preventiveProtocol.used) {
		options.push({ key: `medico:protocolo-preventivo@${sheet.preventiveProtocol.sourceCharacterId}`,
			id: 'medico:protocolo-preventivo',
			name: `Protocolo Preventivo de ${sheet.preventiveProtocol.sourceName}`,
			condition: `Primeira resistência de Fortitude contra ${sheet.preventiveProtocol.risk}.`,
			bonus: 2, advantage: false, targets: ['resistance:fortitude'] });
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

/** Benefícios sociais dependem da cena; o aliado confirma sua aplicabilidade ao rolar. */
export function rpgEnchanterAllyOptions(sourceId: string, sourceName: string,
	source: RPGTrainerSheet): RPGTrainerRollTalent[] {
	if (source.status !== 'complete' || source.classId !== 'encantador') return [];
	const social = ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao', 'skill:atuacao'];
	const options: RPGTrainerRollTalent[] = ([
		['encantador:apresentacao-perfeita',
			'Primeiro teste social diretamente com a pessoa apresentada pelo Encantador.'],
		['encantador:confianca-compartilhada',
			'Primeiro teste da interação preparada após dez minutos de aconselhamento.'],
	] as const).filter(([id]) => source.talents.class.includes(id)).map(([id, condition]) => ({
		key: `${id}@${sourceId}`, id,
		name: `${RPG_TRAINER_TALENTS.find(talent => talent.id === id)!.name} de ${sourceName}`,
		condition, bonus: 2, advantage: false, targets: social,
	}));
	if (source.talents.apex === 'encantador:salao-na-palma-da-mao') {
		options.push({ key: `encantador:salao-na-palma-da-mao@${sourceId}`,
			id: 'encantador:salao-na-palma-da-mao', name: `Salão na Palma da Mão de ${sourceName}`,
			condition: 'Teste social com Carisma compatível com o tom definido pelo Encantador para o evento.',
			bonus: 2, advantage: false, requiredAttribute: 'charisma', targets: social });
	}
	return options;
}

/** Aparece somente na ação Ajuda, não como bônus da rolagem normal. */
export function rpgEnchanterSocialChemistryOption(sourceId: string, sourceName: string,
	source: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (source.status !== 'complete' || source.classId !== 'encantador' ||
		!source.talents.class.includes('encantador:quimica-social')) return null;
	return { key: `encantador:quimica-social@${sourceId}`, id: 'encantador:quimica-social',
		name: `Química Social de ${sourceName}`, bonus: 0, advantage: false,
		condition: 'Ajuda em perícia social com Carisma, usando a abordagem preparada com o Encantador; bônus mínimo +2.',
		requiredAttribute: 'charisma',
		targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao', 'skill:atuacao'] };
}

export function rpgTrainerRollTalentOptions(sheet: RPGTrainerSheet, kind: RPGTrainerRollKind, id: string,
	attribute?: RPGTrainerAttribute) {
	const usedAttribute = kind === 'skill' ? attribute || rpgTrainerSkillAttributes(sheet, id)[0] : undefined;
	return rpgTrainerRollTalents(sheet).filter(talent => matches(talent.targets, kind, id) &&
		!rpgManualTalentUsed(sheet, talent.id) &&
		(!talent.requiredAttribute || usedAttribute === talent.requiredAttribute) &&
		(talent.id !== 'aprendizado-por-observacao' || kind === 'skill' &&
		id !== 'conhecimento' && id !== 'oficio' && !sheet.skills.trained.includes(id)));
}

/** A posse do talento e a amizade na equipe são verificadas pelo serviço antes de expor esta opção. */
export function rpgPokemonAssistantOption(sheet: RPGTrainerSheet, hasEligiblePartyPokemon: boolean):
	RPGTrainerRollTalent | null {
	if (sheet.status !== 'complete' || sheet.classId !== 'mestre-pokemon' ||
		!sheet.talents.class.includes('mestre-pokemon:auxiliar-pokemon') || !hasEligiblePartyPokemon) return null;
	return { key: 'mestre-pokemon:auxiliar-pokemon', id: 'mestre-pokemon:auxiliar-pokemon',
		name: 'Auxiliar Pokémon', bonus: 2, advantage: false,
		condition: 'Fora de batalha, um Pokémon da equipe com mais de 50 de Amizade ajuda de modo coerente.',
		targets: ['skill:*'] };
}

/** Efeito concedido por outro treinador; a identidade do aliado é validada pela mesa no servidor. */
export function rpgEncouragingPresenceOption(allyId: string, allyName: string, ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.general.includes('presenca-encorajadora')) return null;
	return { key: `presenca-encorajadora@${allyId}`, id: 'presenca-encorajadora',
		name: `Presença Encorajadora de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Primeiro teste de Vontade contra medo na cena, após ouvir o aliado por pelo menos um minuto.',
		targets: ['resistance:will'] };
}

export function rpgEmergencyAntidoteOption(allyId: string, allyName: string, ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.classId !== 'medico' ||
		!ally.talents.class.includes('medico:antidoto-de-emergencia')) return null;
	return { key: `medico:antidoto-de-emergencia@${allyId}`, id: 'medico:antidoto-de-emergencia',
		name: `Antídoto de Emergência de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Resistência de Fortitude adicional contra veneno ou doença após tratamento bem-sucedido do Médico; uma vez por exposição.',
		targets: ['resistance:fortitude'] };
}

export function rpgEmergencyExtractionOption(allyId: string, allyName: string, ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.classId !== 'medico' ||
		!ally.talents.class.includes('medico:retirada-de-emergencia')) return null;
	return { key: `medico:retirada-de-emergencia@${allyId}`, id: 'medico:retirada-de-emergencia',
		name: `Retirada de Emergência de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Carregar paciente atendido por este Médico, evitando queda ou movimento que agrave o ferimento durante o transporte.',
		targets: ['skill:atletismo'] };
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

/** Quem analisa a sequência feita pelo Fotógrafo pode reconstruir o acontecimento. */
export function rpgPhotographicSequenceOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.classId !== 'fotografo' ||
		!ally.talents.class.includes('fotografo:sequencia-de-acao')) return null;
	return { key: `fotografo:sequencia-de-acao@${allyId}`, id: 'fotografo:sequencia-de-acao',
		name: `Sequência de Ação de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Reconstruir acontecimento visível na sequência de imagens produzida pelo Fotógrafo com Registro Oportuno.',
		targets: ['skill:investigacao'] };
}

/** O panorama pode orientar o primeiro teste pertinente de qualquer treinador que o consulte. */
export function rpgPhotographicPanoramaOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.classId !== 'fotografo' ||
		!ally.talents.class.includes('fotografo:panorama-de-reconhecimento')) return null;
	return { key: `fotografo:panorama-de-reconhecimento@${allyId}`,
		id: 'fotografo:panorama-de-reconhecimento',
		name: `Panorama de Reconhecimento de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Primeiro teste de navegação ou análise visual do local após consultar o panorama produzido pelo Fotógrafo; mudanças posteriores podem torná-lo obsoleto.',
		targets: ['skill:investigacao', 'skill:percepcao', 'skill:sobrevivencia'] };
}

/** O perímetro precisa ter sido preparado; o aliado confirma que foi designado para aquele ponto. */
export function rpgGuardPerimeterOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || ally.classId !== 'guarda-pokemon' ||
		!ally.talents.class.includes('guarda-pokemon:perimetro-seguro')) return null;
	return { key: `guarda-pokemon:perimetro-seguro@${allyId}`, id: 'guarda-pokemon:perimetro-seguro',
		name: `Perímetro Seguro de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Vigiar um ponto para o qual foi designado no perímetro preparado pelo Guarda, enquanto ele permanecer válido.',
		targets: ['skill:percepcao'] };
}

/** O aliado escolhe o bônus quando a rolagem corresponde à função recebida na operação. */
export function rpgCommanderOperationOption(sourceId: string, sourceName: string,
	source: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (source.status !== 'complete' || source.classId !== 'guarda-pokemon' ||
		source.talents.apex !== 'guarda-pokemon:comandante-de-operacao') return null;
	return { key: `guarda-pokemon:comandante-de-operacao@${sourceId}`,
		id: 'guarda-pokemon:comandante-de-operacao',
		name: `Ápice — Comandante de Operação de ${sourceName}`,
		bonus: 2, advantage: false,
		condition: 'Primeiro teste diretamente ligado à função recebida na operação, enquanto puder receber as instruções.',
		targets: ['skill:*', 'resistance:*'] };
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

/** A carta só pertence ao destinatário indicado e perde seu efeito após o primeiro uso. */
export function rpgDiplomatIntroductionOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet, recipientId: string): RPGTrainerRollTalent | null {
	const letter = ally.introductionLetter;
	if (ally.status !== 'complete' || ally.classId !== 'diplomata' ||
		!ally.talents.class.includes('diplomata:carta-de-apresentacao') ||
		!letter || letter.used || letter.recipientCharacterId !== recipientId || allyId === recipientId) return null;
	return { key: `diplomata:carta-de-apresentacao@${allyId}:${letter.id}`,
		id: 'diplomata:carta-de-apresentacao', name: `Carta de Apresentação de ${allyName}`,
		bonus: 2, advantage: false,
		condition: `Primeiro teste para obter audiência, cooperação ou acesso em ${letter.institution}, ` +
			`relacionado a ${letter.subject}; apresente a carta e confirme com o Mestre que a recomendação é pertinente.`,
		targets: ['skill:persuasao'] };
}

/** Cede apenas o bônus base de Persuasão; condições e efeitos pessoais permanecem com quem rola. */
export function rpgDiplomatProxyOption(sourceId: string, sourceName: string, source: RPGTrainerSheet,
	recipientId: string, recipient: RPGTrainerSheet, campaignTime: string,
	attribute: RPGTrainerAttribute = 'charisma'): RPGTrainerRollTalent | null {
	const preparation = source.diplomatProxy;
	if (source.status !== 'complete' || source.classId !== 'diplomata' ||
		source.talents.apex !== 'diplomata:acordo-impossivel' || recipient.status !== 'complete' ||
		!preparation || Date.parse(preparation.readyAt) > Date.parse(campaignTime) ||
		Date.parse(preparation.expiresAt) <= Date.parse(campaignTime) ||
		!rpgTrainerSkillAttributes(recipient, 'persuasao').includes(attribute)) return null;
	const target = preparation.recipients.find(entry => entry.characterId === recipientId && !entry.used);
	if (!target) return null;
	const sourceBase = rpgTrainerAttributeBonus(source, 'charisma') + rpgTrainerProficiency(source.level) *
		(source.skills.focused.includes('persuasao') ? 2 : source.skills.trained.includes('persuasao') ? 1 : 0);
	const recipientBase = rpgTrainerAttributeBonus(recipient, attribute) + rpgTrainerProficiency(recipient.level) *
		(recipient.skills.focused.includes('persuasao') ? 2 : recipient.skills.trained.includes('persuasao') ? 1 : 0);
	return { key: `diplomata:acordo-impossivel@${sourceId}:${preparation.id}`,
		id: 'diplomata:acordo-impossivel', name: `Voz por Procuração de ${sourceName}`,
		bonus: sourceBase - recipientBase, replacesBaseWith: sourceBase, advantage: false,
		condition: `Defender a proposta “${target.proposal}” diante de ${target.audience}; ` +
			'uma utilização, declarada antes da rolagem.', targets: ['skill:persuasao'] };
}

export function rpgCosmopolitanEtiquetteOption(sourceId: string, sourceName: string,
	source: RPGTrainerSheet, recipientId: string): RPGTrainerRollTalent | null {
	const orientation = source.cosmopolitanEtiquette;
	if (source.status !== 'complete' || source.classId !== 'diplomata' ||
		!source.talents.class.includes('diplomata:etiqueta-cosmopolita') || !orientation ||
		!orientation.recipientCharacterIds.includes(recipientId)) return null;
	return { key: `diplomata:etiqueta-cosmopolita@${sourceId}`,
		id: 'diplomata:etiqueta-cosmopolita', name: `Etiqueta Cosmopolita de ${sourceName}`,
		bonus: 2, advantage: false,
		condition: `Interação com membros de ${orientation.community} em que os costumes locais ajudem; ` +
			'a orientação termina ao sair dessa comunidade.',
		targets: ['skill:persuasao', 'skill:enganacao', 'skill:intimidacao'] };
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

/** Aliados podem aproveitar a estrutura preparada pelo Explorador na travessia. */
export function rpgExplorerLifelineOption(allyId: string, allyName: string,
	ally: RPGTrainerSheet): RPGTrainerRollTalent | null {
	if (ally.status !== 'complete' || !ally.talents.class.includes('explorador:linha-de-vida')) return null;
	return { key: `explorador:linha-de-vida@${allyId}`, id: 'explorador:linha-de-vida',
		name: `Linha de Vida de ${allyName}`, bonus: 2, advantage: false,
		condition: 'Atravessar obstáculo natural usando auxílio preparado pelo Explorador com Kit de Sobrevivência.',
		targets: ['skill:atletismo', 'skill:acrobacia'] };
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
		...allies.filter(talent => matches(talent.targets, kind, id) &&
			(!talent.requiredAttribute || talent.requiredAttribute ===
			(attribute || (kind === 'skill' ? rpgTrainerSkillAttributes(sheet, id)[0] : undefined))))];
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
