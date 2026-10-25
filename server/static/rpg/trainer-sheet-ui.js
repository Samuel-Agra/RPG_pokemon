(function () {
	'use strict';

	const ATTRIBUTES = [
		['strength', 'Força'], ['dexterity', 'Destreza'], ['constitution', 'Constituição'],
		['intelligence', 'Inteligência'], ['wisdom', 'Sabedoria'], ['charisma', 'Carisma'],
	];
	const RESISTANCES = { fortitude: 'Fortitude', reflexes: 'Reflexos', will: 'Vontade' };
	const POKEMON_STATUS = { brn: 'Queimado', par: 'Paralisado', psn: 'Envenenado',
		tox: 'Gravemente envenenado', slp: 'Dormindo', frz: 'Congelado' };
	const SKILLS = {
		acrobacia: 'Acrobacia', atletismo: 'Atletismo', atuacao: 'Atuação', captura: 'Captura',
		conhecimento: 'Conhecimento', 'empatia-pokemon': 'Empatia Pokémon', enganacao: 'Enganação',
		furtividade: 'Furtividade', intimidacao: 'Intimidação', intuicao: 'Intuição',
		investigacao: 'Investigação', ladinagem: 'Ladinagem', medicina: 'Medicina',
		'medicina-pokemon': 'Medicina Pokémon', 'montaria-pokemon': 'Montaria Pokémon',
		natureza: 'Natureza', oficio: 'Ofício', percepcao: 'Percepção', persuasao: 'Persuasão',
		pilotagem: 'Pilotagem', sobrevivencia: 'Sobrevivência', tecnologia: 'Tecnologia',
		'adestramento-pokemon': 'Adestramento Pokémon',
	};
	const PILOTING = [
		['automoveis', 'Automóveis'], ['motocicletas', 'Motocicletas'], ['embarcacoes', 'Embarcações'],
		['aeronaves', 'Aeronaves'], ['maquinas-pesadas', 'Máquinas pesadas'],
		['veiculos-especiais', 'Veículos especiais'],
	];
	const SKILL_DOMAINS = {
		regioes: 'Regiões', 'historia-personagens-historicos': 'História e Personagens Históricos',
		'lendarios-miticos': 'Lendários e Míticos', pokemon: 'Pokémon', organizacoes: 'Organizações',
		'cultura-sociedade': 'Cultura e Sociedade', 'arqueologia-fosseis': 'Arqueologia e Fósseis',
		ciencias: 'Ciências', culinaria: 'Culinária', mecanica: 'Mecânica', costura: 'Costura',
		fotografia: 'Fotografia', carpintaria: 'Carpintaria', ferraria: 'Ferraria',
		jornalismo: 'Jornalismo', artesanato: 'Artesanato',
		...Object.fromEntries(PILOTING),
	};
	const PROFICIENCY_DOMAINS = {
		'kit-culinaria': ['Kit de Culinária', 'Permite usar Kits de Culinária sem a desvantagem por falta de domínio. Kits de nível II e III concedem, respectivamente, +1 e +2 nos testes apropriados.'],
		'kit-medico': ['Kit Médico', 'Permite usar Kits Médicos sem a desvantagem por falta de domínio. Kits de nível II e III concedem, respectivamente, +1 e +2 nos testes apropriados.'],
		'kit-medicina-pokemon': ['Kit de Medicina Pokémon', 'Permite usar o Kit de Medicina Pokémon sem a desvantagem por falta de domínio.'],
		'kit-arqueologia': ['Kit de Arqueologia', 'Permite usar o Kit de Arqueologia sem a desvantagem por falta de domínio.'],
		'kit-fotografia': ['Kit de Fotografia', 'Permite usar o Kit de Fotografia sem a desvantagem por falta de domínio.'],
		'kit-mecanica': ['Kit de Mecânica', 'Permite usar o Kit de Mecânica sem a desvantagem por falta de domínio. Exige treinamento em Ofício: Mecânica.'],
		'kit-costura': ['Kit de Costura', 'Permite usar o Kit de Costura sem a desvantagem por falta de domínio. Exige treinamento em Ofício: Costura.'],
		'kit-carpintaria': ['Kit de Carpintaria', 'Permite usar o Kit de Carpintaria sem a desvantagem por falta de domínio. Exige treinamento em Ofício: Carpintaria.'],
		'kit-ferraria': ['Kit de Ferraria', 'Permite usar o Kit de Ferraria sem a desvantagem por falta de domínio. Exige treinamento em Ofício: Ferraria.'],
		'kit-artesanato': ['Kit de Artesanato', 'Permite usar o Kit de Artesanato sem a desvantagem por falta de domínio. Exige treinamento em Ofício: Artesanato.'],
		'kit-ladinagem': ['Kit de Ladinagem', 'Permite usar Kits de Ladinagem sem a desvantagem por falta de domínio. Kits de nível II e III concedem, respectivamente, +1 e +2 nos testes apropriados.'],
		'kit-cientifico': ['Kit Científico', 'Permite usar Kits Científicos sem a desvantagem por falta de domínio. Kits de nível II e III concedem, respectivamente, +1 e +2 nos testes apropriados.'],
		'kit-tecnologico': ['Kit Tecnológico', 'Permite usar Kits Tecnológicos sem a desvantagem por falta de domínio. Kits de nível II e III concedem, respectivamente, +1 e +2 nos testes apropriados.'],
		'kit-disfarce': ['Kit de Disfarce', 'Permite usar o Kit de Disfarce sem a desvantagem por falta de domínio.'],
		'kit-investigacao': ['Kit de Investigação', 'Permite usar o Kit de Investigação sem a desvantagem por falta de domínio.'],
		'armas-melee-comuns': ['Armas Melee Comuns', 'Você domina as armas corpo a corpo comuns e pode aplicar a proficiência nos ataques humanos com elas.'],
		'armas-melee-exoticas': ['Armas Melee Exóticas', 'Você domina as armas corpo a corpo exóticas e pode aplicar a proficiência nos ataques humanos com elas.'],
		'armas-ranged-comuns': ['Armas Ranged Antigas', 'Você domina as armas à distância antigas e pode aplicar a proficiência nos ataques humanos com elas.'],
		'armas-ranged-exoticas': ['Armas Ranged Exóticas', 'Você domina as armas à distância exóticas e pode aplicar a proficiência nos ataques humanos com elas. O domínio não substitui licenças exigidas pela campanha.'],
		'armas-nao-letais': ['Armas Não Letais', 'Você domina as armas não letais e pode aplicar a proficiência nos ataques humanos com elas.'],
		escudos: ['Escudos', 'Você domina escudos e pode usá-los sem a penalidade de falta de domínio. Um escudo precisa estar equipado para conceder seu benefício.'],
	};
	const CLASS_OVERVIEWS = {
		arqueologo: ['Investiga ruínas, civilizações antigas e fósseis. Sua jornada combina pesquisa cuidadosa com trabalho de campo, transformando vestígios em respostas sobre o passado.', ['Interpretar achados e inscrições', 'Preservar fósseis e artefatos', 'Explorar locais históricos']],
		artista: ['Transforma música, dança, teatro ou outras formas de expressão em presença marcante. Consegue envolver plateias e improvisar apresentações mesmo com poucos recursos.', ['Cativar o público', 'Expressar ideias sem um idioma comum', 'Adaptar uma apresentação ao ambiente']],
		'artista-marcial': ['Treina o próprio corpo para enfrentar desafios físicos com técnica e disciplina. É um especialista em combate humano, controle corporal e resistência, sem depender do desempenho dos Pokémon.', ['Combate desarmado e defesa pessoal', 'Disciplina e autocontrole', 'Superar desafios físicos']],
		atleta: ['Dedica-se a velocidade, força e resistência em esportes e expedições. Destaca-se quando o desafio exige movimento, esforço prolongado ou precisão física.', ['Corridas e competições', 'Proezas atléticas', 'Suportar esforço prolongado']],
		cientista: ['Pesquisa fenômenos do mundo Pokémon por meio de observação e experimentos. Usa conhecimento, ferramentas e registros reproduzíveis para criar soluções fundamentadas.', ['Investigar problemas científicos', 'Produzir registros e fórmulas', 'Aplicar conhecimento em campo']],
		cozinheiro: ['Cuida da alimentação em viagens e encontros, transformando ingredientes comuns em refeições úteis. Sabe improvisar uma cozinha e aproveitar melhor os recursos disponíveis.', ['Preparar refeições em campo', 'Aproveitar ingredientes', 'Ajudar na recuperação durante descansos']],
		coreografo: ['Planeja apresentações conjuntas entre treinador e Pokémon. Trabalha ritmo, gestos e ensaios para criar cenas coordenadas em concursos e espetáculos.', ['Sincronizar movimentos', 'Criar apresentações em dupla', 'Comunicar-se por sinais ensaiados']],
		'criador-pokemon': ['Entende os cuidados, o comportamento e o desenvolvimento dos Pokémon fora das batalhas. Acompanha ovos, aproxima-se de espécies selvagens e presta os primeiros cuidados quando necessário.', ['Cuidar de ovos e filhotes', 'Construir vínculos de confiança', 'Acompanhar a reprodução']],
		detetive: ['Reúne pistas, compara depoimentos e reconstrói acontecimentos. Seu olhar investigativo ajuda a encontrar conexões onde outras pessoas veriam fatos isolados.', ['Investigar cenas e evidências', 'Analisar depoimentos', 'Resolver desaparecimentos e mistérios']],
		diplomata: ['Representa interesses e procura acordos entre pessoas ou grupos. Prefere negociação e mediação à imposição, especialmente em ambientes formais ou politicamente delicados.', ['Negociar acordos', 'Mediar conflitos', 'Circular em ambientes formais']],
		encantador: ['Usa presença social, charme e sensibilidade para criar vínculos rapidamente. Sua força está em compreender desejos e conquistar confiança em interações pessoais.', ['Criar conexões sociais', 'Persuadir com delicadeza', 'Lidar com situações afetivas']],
		explorador: ['Viaja por ambientes desconhecidos, lê sinais do terreno e mantém o grupo preparado. É especialmente útil em expedições, trilhas e busca por locais ou espécies difíceis de encontrar.', ['Orientação e sobrevivência', 'Rastrear caminhos e criaturas', 'Descobrir lugares ocultos']],
		fotografo: ['Observa o mundo através de imagens e detalhes que poderiam passar despercebidos. Documenta descobertas, reúne provas visuais e se aproxima com cuidado de pessoas e Pokémon.', ['Registrar momentos e evidências', 'Observar detalhes', 'Aproximar-se sem perturbar']],
		'guarda-pokemon': ['Protege pessoas, patrulha áreas e responde a ocorrências. Conhece procedimentos de contenção humana e pode atuar tanto em cidades quanto em reservas e ambientes naturais.', ['Proteção e patrulha', 'Contenção não letal', 'Reconhecimento de ocorrências']],
		ladino: ['É habilidoso em agir sem chamar atenção, atravessar obstáculos e lidar com mecanismos delicados. Pode ser um ladrão, agente infiltrado ou especialista em segurança.', ['Furtividade e infiltração', 'Lidar com mecanismos e armadilhas', 'Obter informações discretamente']],
		medico: ['Atende feridos, reconhece problemas de saúde e conduz tratamentos humanos. Seu preparo faz diferença em emergências e na recuperação ao longo da viagem.', ['Primeiros socorros', 'Diagnóstico e tratamento', 'Acompanhar a recuperação']],
		mentalista: ['Estuda comportamento, atenção e memória para compreender e influenciar pessoas. Seus métodos são humanos: observação, sugestão e leitura social, não poderes psíquicos.', ['Ler comportamentos', 'Conduzir conversas e distrações', 'Usar disfarces e sugestão']],
		'mestre-pokemon': ['Conhece espécies, hábitos e formas de captura, valorizando a convivência com sua equipe. Sua experiência aparece na preparação da jornada e nas próprias ações de treinador.', ['Identificar Pokémon', 'Planejar capturas', 'Cuidar da organização da equipe']],
		psiquico: ['Possui capacidades mentais reais, como telepatia e telecinese limitada. Aprende a concentrar-se para perceber presenças e interagir com o ambiente de maneiras incomuns.', ['Comunicação telepática', 'Manipulação leve à distância', 'Percepção extrassensorial']],
		tecnologo: ['Trabalha com computadores, dispositivos e máquinas do mundo Pokémon. Cria protótipos úteis, adapta equipamentos e encontra soluções por meio da tecnologia.', ['Programar e analisar sistemas', 'Criar protótipos funcionais', 'Operar e adaptar dispositivos']],
	};
	let selectedTable = null;
	let selectedCharacter = null;
	let closeSkillPopover = null;
	let closeAttributePopover = null;
	let closeTalentPopover = null;
	let closeCreationAttributePicker = null;

	function el(tag, className, value) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (value !== undefined) node.textContent = String(value);
		return node;
	}
	function signed(value) { return value >= 0 ? '+' + value : String(value); }
	function talentModalityError(sheet, choice) {
		const artist = ['artista:tecnica-assinatura', 'artista:artista-versatil'];
		const athlete = ['atleta:especialidade-esportiva', 'atleta:atleta-polivalente'];
		const ids = artist.includes(choice.id) ? artist : athlete.includes(choice.id) ? athlete : null;
		if (!ids) return '';
		const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
		const selected = [choice.variant,
			...(['artista:artista-versatil', 'atleta:atleta-polivalente'].includes(choice.id) ? [choice.secondVariant] : []),
			...(choice.id === 'atleta:atleta-polivalente' ? [choice.thirdVariant] : [])]
			.map(normalize);
		const existing = (sheet.talentSelections || [])
			.filter(entry => ids.includes(entry.id))
			.flatMap(entry => [entry.variant, entry.secondVariant, entry.thirdVariant].map(normalize));
		return selected.some(value => !value || existing.includes(value)) || new Set(selected).size !== selected.length ?
			`Escolha modalidades ${ids === artist ? 'artísticas' : 'esportivas'} diferentes das já selecionadas.` : '';
	}
	function label(id) {
		return String(id || '').replace(/[-_]/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
	}
	const EXPLORER_TERRAIN_NAMES = {
		floresta: 'Floresta', montanha: 'Montanha', deserto: 'Deserto', pantano: 'Pântano',
		'ambiente-gelado': 'Ambiente gelado', litoral: 'Litoral', subterraneo: 'Subterrâneo',
		'urbano-em-ruinas': 'Urbano em ruínas',
	};
	function variantLabel(talentId, variant) {
		return talentId === 'explorador:especialista-de-terreno' ?
			EXPLORER_TERRAIN_NAMES[variant] || label(variant) :
			variant.includes(':') ? skillLabel(variant) :
			ATTRIBUTES.find(entry => entry[0] === variant)?.[1] || label(variant);
	}
	function skillLabel(id) {
		const [family, domain] = String(id).split(':');
		if (!domain) return family === 'conhecimento' ? 'Conhecimento (área à escolha)' :
			family === 'oficio' ? 'Ofício (área à escolha)' : SKILLS[family] || label(family);
		return `${SKILLS[family] || label(family)}: ${SKILL_DOMAINS[domain] || label(domain)}`;
	}
	function skillRow(entry, domainOnly = false, roll = null) {
		const clickable = !!roll && (entry.bonus != null || entry.observationEligible);
		const row = el(clickable ? 'button' : 'div', 'trainer-sheet-list-row' +
			(entry.focused ? ' focused' : entry.trained ? ' trained' : entry.halfProficiency ? ' half-proficiency' : '') +
			(clickable ? ' trainer-sheet-roll-row' : ''));
		const domain = String(entry.id).split(':')[1];
		const name = domainOnly ? SKILL_DOMAINS[domain] || label(domain) : skillLabel(entry.id);
		if (clickable) {
			row.type = 'button'; row.setAttribute('aria-haspopup', 'menu');
			row.setAttribute('aria-expanded', 'false');
			row.addEventListener('click', () => roll(row, name, entry));
		}
		row.append(el('span', '', name),
			el('strong', 'trainer-sheet-bonus', entry.bonus == null ? '—' : signed(entry.bonus)));
		return row;
	}
	function showSkillPopover(button, name, entries, roll) {
		if (closeSkillPopover) closeSkillPopover();
		const panel = el('div', 'trainer-sheet-skill-popover');
		panel.append(el('strong', 'trainer-sheet-skill-popover-title', name));
		for (const entry of entries) panel.append(skillRow(entry, true, roll ?
			(_row, domainName, chosen) => roll(button, `${name}: ${domainName}`, chosen) : null));
		document.body.append(panel);
		const rect = button.getBoundingClientRect();
		const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
		panel.style.width = `${width}px`;
		panel.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
		panel.style.top = `${Math.max(12, rect.top - panel.offsetHeight - 6)}px`;
		button.setAttribute('aria-expanded', 'true');
		function close() {
			panel.remove(); button.setAttribute('aria-expanded', 'false');
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
			window.removeEventListener('scroll', scroll, true);
			window.removeEventListener('resize', close);
			if (closeSkillPopover === close) closeSkillPopover = null;
		}
		function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
		function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } }
		function scroll(event) { if (!panel.contains(event.target)) close(); }
		closeSkillPopover = close;
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		window.addEventListener('scroll', scroll, true);
		window.addEventListener('resize', close);
	}
	function showRollPopover(button, name, kind, id, characterId, api, rollTalents = [], trained = false,
		attributeOptions = [], helpTalents = []) {
		if (closeAttributePopover) closeAttributePopover();
		if (closeSkillPopover) closeSkillPopover();
		if (closeTalentPopover) closeTalentPopover();
		const panel = el('div', 'trainer-sheet-attribute-popover');
		panel.append(el('strong', '', `Rolar ${name}`));
		let selectedAttribute = kind === 'skill' ? attributeOptions[0] : undefined;
		const availableTalents = rollTalents.filter(talent =>
			(talent.id !== 'aprendizado-por-observacao' || kind === 'skill' && !trained) &&
			(!talent.requiredAttribute || kind === 'skill' &&
			attributeOptions.includes(talent.requiredAttribute)) &&
			(talent.targets || []).some(target => {
				const actual = kind === 'initiative' ? 'initiative' : `${kind}:${id}`;
				return target === actual || target.endsWith('*') && actual.startsWith(target.slice(0, -1));
			}));
		// O talento pertence a outro membro e pode surgir após a ficha ser carregada.
		if (kind === 'skill' || kind === 'resistance' && (id === 'will' || id === 'fortitude')) {
			api('/trainer/ally-roll-talents').then(allies => {
				if (!panel.isConnected) return;
				for (const talent of allies) {
					const actual = `${kind}:${id}`;
					if (!(talent.targets || []).some(target => target === actual ||
						target.endsWith('*') && actual.startsWith(target.slice(0, -1)))) continue;
					if (availableTalents.some(entry => entry.key === talent.key)) continue;
					availableTalents.push(talent);
					addTalentButton(talent);
				}
				if (availableTalents.length) content.append(talentChoices);
			}).catch(failure => {
				if (!panel.isConnected) return;
				error.textContent = failure.message || 'Não foi possível consultar os talentos dos aliados.';
				error.classList.remove('hidden');
			});
		}
		const choices = el('div', 'trainer-sheet-roll-modes');
		let pendingCapture = null;
		let selectedCaptureBall = '';
		const captureChoices = el('div', 'trainer-sheet-roll-balls hidden');
		if (kind === 'skill' && id === 'captura') {
			api('/trainer/pending-capture?characterId=' + encodeURIComponent(characterId)).then(data => {
				if (!panel.isConnected || !data.capture) return;
				pendingCapture = data.capture;
				captureChoices.classList.remove('hidden');
				captureChoices.append(el('strong', '', `Poké Bola para ${pendingCapture.species}`));
				if (!pendingCapture.balls.length) captureChoices.append(el('span', '', 'Você não possui Poké Bolas na Bag.'));
				for (const ball of pendingCapture.balls) {
					const option = el('button', 'trainer-sheet-roll-talent', `${ball.name} ×${ball.quantity}`);
					option.type = 'button'; option.setAttribute('aria-pressed', 'false');
					option.addEventListener('click', () => {
						selectedCaptureBall = ball.id;
						for (const item of captureChoices.querySelectorAll('button'))
							item.setAttribute('aria-pressed', String(item === option));
					});
					captureChoices.append(option);
				}
			}).catch(failure => {
				if (!panel.isConnected) return;
				error.textContent = failure.message || 'Não foi possível consultar a captura pendente.';
				error.classList.remove('hidden');
			});
		}
		if (kind === 'skill' && attributeOptions.length > 1) {
			const attributeChoice = select(attributeOptions.map(attribute => [attribute,
				ATTRIBUTES.find(entry => entry[0] === attribute)?.[1] || label(attribute)]));
			attributeChoice.className = 'trainer-sheet-roll-attribute';
			attributeChoice.setAttribute('aria-label', `Atributo para ${name}`);
			attributeChoice.addEventListener('change', () => {
				selectedAttribute = attributeChoice.value;
				updateTalentVisibility();
			});
			choices.append(attributeChoice);
		}
		const selectedTalents = new Set();
		const selectedHelpTalents = new Set();
		const helpTalentChoices = el('div', 'trainer-sheet-roll-talents');
		const helpTalentButtons = new Map();
		if (kind === 'skill') {
			for (const talent of helpTalents.filter(entry => (entry.targets || []).includes(`skill:${id}`))) {
				if (!helpTalentChoices.childElementCount) helpTalentChoices.append(el('strong', '', 'Talentos para ajudar'));
				const item = el('button', 'trainer-sheet-roll-talent');
				item.type = 'button'; item.setAttribute('aria-pressed', 'false');
				item.append(el('b', '', talent.name), el('small', '', talent.condition));
				item.addEventListener('click', () => {
					const chosen = !selectedHelpTalents.has(talent.key);
					if (chosen) selectedHelpTalents.add(talent.key); else selectedHelpTalents.delete(talent.key);
					item.setAttribute('aria-pressed', String(chosen));
				});
				helpTalentChoices.append(item); helpTalentButtons.set(talent.key, item);
			}
		}
		const talentChoices = el('div', 'trainer-sheet-roll-talents');
		const talentButtons = new Map();
		function updateTalentVisibility() {
			let visible = 0;
			for (const talent of availableTalents) {
				const button = talentButtons.get(talent.key);
				if (!button) continue;
				const applicable = !talent.requiredAttribute || talent.requiredAttribute === selectedAttribute;
				button.classList.toggle('hidden', !applicable);
				if (applicable) visible++;
				else {
					selectedTalents.delete(talent.key);
					button.setAttribute('aria-pressed', 'false');
				}
			}
			talentChoices.classList.toggle('hidden', visible === 0);
			for (const talent of helpTalents) {
				const item = helpTalentButtons.get(talent.key);
				if (!item) continue;
				const applicable = !talent.requiredAttribute || talent.requiredAttribute === selectedAttribute;
				item.classList.toggle('hidden', !applicable);
				if (!applicable) { selectedHelpTalents.delete(talent.key); item.setAttribute('aria-pressed', 'false'); }
			}
			helpTalentChoices.classList.toggle('hidden', ![...helpTalentButtons.values()].some(item => !item.classList.contains('hidden')));
		}
		function addTalentButton(talent) {
			if (!talentChoices.childElementCount) talentChoices.append(el('strong', '', 'Talentos situacionais'));
			const item = el('button', 'trainer-sheet-roll-talent');
			item.type = 'button'; item.setAttribute('aria-pressed', 'false');
			item.addEventListener('click', () => {
				if (!selectedTalents.has(talent.key)) {
					const stratigraphy = ['arqueologo:leitura-estratigrafica', 'arqueologo:mestre-da-escavacao'];
					const artistModes = ['artista:tecnica-assinatura', 'artista:artista-versatil'];
					for (const other of availableTalents.filter(entry => entry.key !== talent.key &&
						(entry.id === talent.id || stratigraphy.includes(entry.id) && stratigraphy.includes(talent.id) ||
							artistModes.includes(entry.id) && artistModes.includes(talent.id)))) {
						selectedTalents.delete(other.key);
						const otherButton = talentButtons.get(other.key);
						if (otherButton) otherButton.setAttribute('aria-pressed', 'false');
					}
					selectedTalents.add(talent.key);
					item.setAttribute('aria-pressed', 'true');
				} else {
					selectedTalents.delete(talent.key);
					item.setAttribute('aria-pressed', 'false');
				}
			});
			const detail = el('span');
			detail.append(el('b', '', `${talent.name} · ${talent.replacesBaseWith !== undefined ?
				`usa bônus ${talent.replacesBaseWith >= 0 ? '+' : ''}${talent.replacesBaseWith}` : talent.naturalFloor ?
					`mín. ${talent.naturalFloor} no d20` : talent.advantage ? 'vantagem' :
					`+${talent.bonus}`}`), el('small', '', talent.condition));
			item.append(detail); talentChoices.append(item); talentButtons.set(talent.key, item);
			updateTalentVisibility();
		}
		for (const talent of availableTalents) addTalentButton(talent);
		const error = el('p', 'trainer-sheet-roll-error hidden');
		for (const [mode, caption] of [
			['advantage', 'Vantagem'], ['normal', 'Normal'], ['disadvantage', 'Desvantagem'],
		]) {
			const choice = el('button', 'trainer-sheet-roll-choice', caption);
			choice.type = 'button';
			choice.addEventListener('click', async () => {
				if (pendingCapture && !selectedCaptureBall) {
					error.textContent = 'Escolha uma Poké Bola da sua Bag antes de rolar Captura.';
					error.classList.remove('hidden'); return;
				}
				panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
				try {
					await api(`/trainer/${kind}-roll`, { method: 'POST',
						body: { characterId, [kind]: id, mode, talents: [...selectedTalents],
							...(pendingCapture ? { captureBall: selectedCaptureBall } : {}),
							...(selectedAttribute ? { attribute: selectedAttribute } : {}) } });
					close();
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (failure) {
					error.textContent = failure.message || 'Não foi possível fazer a rolagem.';
					error.classList.remove('hidden');
					panel.querySelectorAll('button').forEach(item => { item.disabled = false; });
				}
			});
			choices.append(choice);
		}
		const content = el('div', 'trainer-sheet-roll-content');
		if (kind === 'skill') {
			const helpButton = el('button', 'trainer-sheet-roll-choice', 'Ajuda');
			helpButton.type = 'button';
			helpButton.addEventListener('click', () => {
				panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
				api('/trainer/help-roll', { method: 'POST', body: {
					characterId, skill: id, mode: 'normal', talents: [...selectedTalents, ...selectedHelpTalents],
					...(selectedAttribute ? { attribute: selectedAttribute } : {}),
				} }).then(() => {
					close();
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				}).catch(failure => {
					error.textContent = failure.message || 'Não foi possível oferecer ajuda.';
					error.classList.remove('hidden');
					panel.querySelectorAll('button').forEach(item => { item.disabled = false; });
				});
			});
			choices.append(helpButton);
		}
		content.append(captureChoices, choices);
		if (availableTalents.length) content.append(talentChoices);
		if (helpTalentButtons.size) { content.append(helpTalentChoices); updateTalentVisibility(); }
		panel.append(content, error);
		document.body.append(panel);
		const rect = button.getBoundingClientRect();
		const width = panel.offsetWidth;
		panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
		panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 12))}px`;
		button.setAttribute('aria-expanded', 'true');
		function close() {
			panel.remove(); button.setAttribute('aria-expanded', 'false');
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
			window.removeEventListener('scroll', scroll, true);
			window.removeEventListener('resize', close);
			if (closeAttributePopover === close) closeAttributePopover = null;
		}
		function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
		function scroll(event) { if (!panel.contains(event.target)) close(); }
		function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } }
		closeAttributePopover = close;
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		window.addEventListener('scroll', scroll, true);
		window.addEventListener('resize', close);
	}
	/** Renderiza apenas os formatos usados nas regras; nunca insere HTML do catálogo diretamente. */
	function renderTrainerDescription(description, className = '') {
		const root = el('div', className);
		const source = String(description || 'Descrição indisponível.').replace(/<empty-block\s*\/>/gi, '');
		const inline = (parent, line) => {
			for (const piece of line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|<page\b[^>]*>[^<]*<\/page>)/gi)) {
				if (!piece) continue;
				if (piece.startsWith('**') && piece.endsWith('**')) parent.append(el('strong', '', piece.slice(2, -2)));
				else if (piece.startsWith('`') && piece.endsWith('`')) parent.append(el('code', '', piece.slice(1, -1)));
				else if (/^<page\b/i.test(piece)) {
					const page = new DOMParser().parseFromString(piece, 'text/html').querySelector('page');
					const url = page?.getAttribute('url') || '';
					if (/^https:\/\/app\.notion\.com\/p\//.test(url)) {
						const link = el('a', '', page.textContent);
						link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; parent.append(link);
					} else parent.append(document.createTextNode(page?.textContent || piece));
				} else parent.append(document.createTextNode(piece));
			}
		};
		const textBlocks = source.split(/(<table\b[^>]*>[\s\S]*?<\/table>)/gi);
		for (const block of textBlocks) {
			if (!block.trim()) continue;
			if (/^<table\b/i.test(block)) {
				const parsed = new DOMParser().parseFromString(block, 'text/html').querySelector('table');
				if (!parsed) continue;
				const wrapper = el('div', 'trainer-sheet-description-table-wrap');
				const table = el('table', 'trainer-sheet-description-table');
				const headerRow = parsed.getAttribute('header-row') === 'true';
				for (const [index, row] of [...parsed.querySelectorAll('tr')].entries()) {
					const renderedRow = el('tr');
					for (const cell of row.querySelectorAll('td, th')) {
						const renderedCell = el(headerRow && index === 0 ? 'th' : 'td');
						inline(renderedCell, cell.textContent.trim());
						renderedRow.append(renderedCell);
					}
					table.append(renderedRow);
				}
				wrapper.append(table); root.append(wrapper);
				continue;
			}
			let codeLines = null;
			let list = null;
			let listType = null;
			for (const rawLine of block.split(/\r?\n/)) {
				const line = rawLine.trim();
				if (line.startsWith('```')) {
					if (codeLines) {
						const pre = el('pre'); pre.append(el('code', '', codeLines.join('\n')));
						root.append(pre); codeLines = null;
					} else codeLines = [];
					list = null; listType = null;
					continue;
				}
				if (codeLines) { codeLines.push(rawLine); continue; }
				if (!line) { list = null; listType = null; continue; }
				const heading = /^(#{1,6})\s+(.+)$/.exec(line);
				if (heading) {
					const title = el(heading[1].length <= 2 ? 'h3' : 'h4');
					inline(title, heading[2]); root.append(title);
					list = null; listType = null; continue;
				}
				const bullet = /^[-*]\s+(.+)$/.exec(line);
				const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
				if (bullet || numbered) {
					const type = bullet ? 'ul' : 'ol';
					if (!list || listType !== type) { list = el(type); root.append(list); listType = type; }
					const item = el('li'); inline(item, (bullet || numbered)[1]); list.append(item);
					continue;
				}
				list = null; listType = null;
				const paragraph = el('p'); inline(paragraph, line); root.append(paragraph);
			}
			if (codeLines?.length) { const pre = el('pre'); pre.append(el('code', '', codeLines.join('\n'))); root.append(pre); }
		}
		return root;
	}
	function showTalentPopover(button, name, description, action = null) {
		if (closeTalentPopover) closeTalentPopover();
		if (closeSkillPopover) closeSkillPopover();
		if (closeAttributePopover) closeAttributePopover();
		const panel = el('div', 'trainer-sheet-talent-popover');
		if (action?.diplomatProxy) panel.classList.add('trainer-sheet-talent-popover--archive');
		if (action?.socialDisguise || action?.ecologicalBait || action?.trapmaker || action?.combinedTrap || action?.trapLabyrinth || action?.pokemonPharmacy || action?.advancedPharmacy || action?.masterPharmacy ||
			action?.choreography ||
			action?.persistentHypothesis !== undefined) {
			panel.dataset.preserveOnRefresh = 'true';
		}
		let recordPicker = null;
		panel.append(el('strong', 'trainer-sheet-talent-popover-title', name),
			renderTrainerDescription(description, 'trainer-sheet-talent-description'));
		if (action?.captureCombatAttribute) {
			panel.append(el('p', '', 'Atributo usado nos arremessos durante batalhas:'));
			const choices = el('div', 'trainer-sheet-roll-modes');
			const feedback = el('small', 'trainer-sheet-trusted-partner-feedback');
			for (const [attribute, title] of [['dexterity', 'Destreza'], ['wisdom', 'Sabedoria']]) {
				const choice = el('button', 'trainer-sheet-talent-use', title);
				choice.type = 'button';
				choice.setAttribute('aria-pressed', String(action.captureCombatAttribute === attribute));
				choice.addEventListener('click', async () => {
					if (action.captureCombatAttribute === attribute) return;
					choice.disabled = true;
					try {
						await action.api('/trainer/talents/capture-attribute', { method: 'POST', body: { attribute } });
						action.captureCombatAttribute = attribute;
						for (const button of choices.children) button.setAttribute('aria-pressed', String(button === choice));
						feedback.textContent = `${title} selecionada para os arremessos em batalha.`;
					} catch (error) { feedback.textContent = error.message || 'Não foi possível salvar a escolha.'; } finally { choice.disabled = false; }
				});
				choices.append(choice);
			}
			panel.append(choices, feedback);
		} else if (action?.manualRest) {
			const status = el('p', 'trainer-sheet-manual-rest-status', action.manualRest.used ?
				'Usado neste descanso.' : 'Disponível para uso.');
			const use = el('button', 'trainer-sheet-talent-use', action.manualRest.used ? 'Usado' : 'Marcar como usado');
			use.type = 'button'; use.disabled = action.manualRest.used;
			const feedback = el('small', 'trainer-sheet-trusted-partner-feedback');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					await action.api('/trainer/talents/mark-used', { method: 'POST', body: { talentId: action.id } });
					status.textContent = 'Usado neste descanso.';
					use.textContent = 'Usado';
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível marcar o talento.';
					use.disabled = false;
				}
			});
			panel.append(status, use, feedback);
		} else if (action?.restStatus) {
			panel.append(el('p', 'trainer-sheet-manual-rest-status', action.restStatus));
		} else if (action?.individualRecoveryNote !== undefined) {
			const editor = el('div', 'trainer-sheet-trusted-partner');
			const note = el('textarea');
			note.value = action.individualRecoveryNote;
			note.maxLength = 2000;
			note.placeholder = 'Paciente e dificuldade escolhida para o plano de recuperação';
			note.setAttribute('aria-label', 'Anotação do Plano Individual de Recuperação');
			const resize = () => { note.style.height = 'auto'; note.style.height = `${note.scrollHeight}px`; };
			resize();
			const feedback = el('small', 'trainer-sheet-trusted-partner-feedback');
			let timer;
			let saving = Promise.resolve();
			const save = () => {
				clearTimeout(timer);
				if (note.value === action.individualRecoveryNote) return;
				const value = note.value;
				feedback.textContent = 'Salvando...';
				saving = saving.catch(() => {}).then(async () => {
					try {
						const result = await action.api('/trainer/talents/individual-recovery-note',
							{ method: 'POST', body: { note: value } });
						action.individualRecoveryNote = result.note;
						feedback.textContent = 'Salvo.';
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível salvar a anotação.';
					}
				});
			};
			note.addEventListener('input', () => { resize(); clearTimeout(timer); timer = setTimeout(save, 500); });
			note.addEventListener('blur', save);
			editor.append(note, feedback); panel.append(editor);
		} else if (action?.memoryPalace) {
			const editor = el('div', 'trainer-sheet-trusted-partner');
			const limit = Math.max(1, action.memoryPalace.limit);
			editor.append(el('p', '', `Nomes das memórias: até ${limit}. O Mestre recorda o conteúdo quando necessário.`));
			const list = el('div', 'trainer-sheet-memory-palace-list');
			const feedback = el('small', 'trainer-sheet-trusted-partner-feedback');
			let names = [...action.memoryPalace.names];
			let saving = Promise.resolve();
			const render = () => {
				list.replaceChildren();
				for (let index = 0; index < limit; index++) {
					const input = el('input');
					input.type = 'text'; input.maxLength = 100;
					input.value = names[index] || '';
					input.placeholder = `Memória ${index + 1}`;
					input.setAttribute('aria-label', `Nome da memória ${index + 1}`);
					let timer;
					const save = () => {
						clearTimeout(timer);
						const next = [...list.querySelectorAll('input')].map(field => field.value.trim()).filter(Boolean);
						if (JSON.stringify(next) === JSON.stringify(names)) return;
						feedback.textContent = 'Salvando...';
						saving = saving.catch(() => {}).then(async () => {
							try {
								const result = await action.api('/trainer/talents/memory-palace',
									{ method: 'POST', body: { names: next } });
								names = result.names; feedback.textContent = 'Salvo.';
							} catch (error) { feedback.textContent = error.message || 'Não foi possível salvar as memórias.'; }
						});
					};
					input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 500); });
					input.addEventListener('blur', save);
					list.append(input);
				}
			};
			render(); editor.append(list, feedback); panel.append(editor);
		} else if (action?.trustedPartner) {
			const editor = el('div', 'trainer-sheet-trusted-partner');
			const nameInput = el('input');
			nameInput.type = 'text'; nameInput.maxLength = 80;
			nameInput.value = action.trustedPartner.name || '';
			nameInput.placeholder = 'Nome do parceiro';
			nameInput.setAttribute('aria-label', 'Nome do Parceiro de Confiança');
			const feedback = el('small', 'trainer-sheet-trusted-partner-feedback');
			let timer = null;
			let saving = Promise.resolve();
			const save = () => {
				clearTimeout(timer);
				const name = nameInput.value;
				if (name === action.trustedPartner.name) return;
				feedback.textContent = 'Salvando...';
				saving = saving.catch(() => {}).then(async () => {
					try {
						const result = await action.api('/trainer/talents/trusted-partner',
							{ method: 'POST', body: { name } });
						action.trustedPartner.name = result.name;
						action.trustedPartner.onSaved(result.name);
						feedback.textContent = 'Salvo.';
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível salvar o nome.';
					}
				});
			};
			nameInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(save, 500); });
			nameInput.addEventListener('blur', save);
			nameInput.addEventListener('keydown', event => {
				if (event.key === 'Enter') { event.preventDefault(); nameInput.blur(); }
			});
			editor.append(nameInput, feedback); panel.append(editor);
		} else if (action?.investigativePartner) {
			const data = action.investigativePartner;
			const linked = data.pokemon.find(pokemon => pokemon.id === data.pokemonId);
			const status = el('p', 'trainer-sheet-partner-status', data.unavailable ?
				'Parceiro fora de sua posse. O vínculo permanece, mas o bônus não pode ser usado.' : linked ?
					`Parceiro vinculado: ${linked.name}.` : data.pokemonId ?
						'O parceiro vinculado não está mais em sua posse.' : 'Nenhum parceiro vinculado.');
			panel.append(status);
			if (!data.pokemonId) {
				const choose = el('button', 'trainer-sheet-talent-use', 'Escolher parceiro');
				choose.type = 'button';
				choose.addEventListener('click', () => {
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog trainer-sheet-partner-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', 'Escolher Parceiro Investigativo'),
						el('p', '', 'A escolha é permanente. Apenas o Mestre poderá desfazer o vínculo.'));
					const grid = el('div', 'trainer-sheet-partner-grid');
					const feedback = el('p', 'trainer-sheet-roll-error hidden');
					const closeDialog = () => { overlay.remove(); recordPicker = null; };
					for (const pokemon of data.pokemon) {
						const row = el('button', 'trainer-sheet-partner-pokemon');
						row.type = 'button'; row.disabled = pokemon.friendship < 50;
						const sprite = el('img', 'trainer-first-care-sprite');
						sprite.src = action.spriteUrl(pokemon); sprite.alt = pokemon.species;
						const details = el('span', 'trainer-first-care-details');
						const heading = el('span', 'trainer-first-care-heading');
						heading.append(el('strong', '', pokemon.name), el('span', '', 'Nv. ' + pokemon.level));
						const types = el('span', 'trainer-first-care-types');
						for (const type of pokemon.types) types.append(el('span', '', type));
						details.append(heading, types, el('span', '', 'Amizade: ' + pokemon.friendship));
						row.append(sprite, details);
						row.addEventListener('click', async () => {
							row.disabled = true;
							try {
								await action.api('/trainer/talents/investigative-partner',
									{ method: 'POST', body: { pokemonId: pokemon.id } });
								closeDialog(); close(); await action.refresh();
							} catch (error) {
								feedback.textContent = error.message || 'Não foi possível vincular o Pokémon.';
								feedback.classList.remove('hidden'); row.disabled = false;
							}
						});
						grid.append(row);
					}
					dialog.append(grid, feedback);
					overlay.append(dialog);
					overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
					document.body.append(overlay); recordPicker = { overlay, close: closeDialog };
				});
				panel.append(choose);
			} else if (data.canUnlink) {
				const unlink = el('button', 'trainer-sheet-talent-use', 'Desvincular parceiro');
				unlink.type = 'button';
				unlink.addEventListener('click', async () => {
					unlink.disabled = true;
					try {
						await action.api('/trainer/talents/investigative-partner',
							{ method: 'POST', body: { pokemonId: null } });
						close(); await action.refresh();
					} catch (error) {
						unlink.textContent = error.message || 'Não foi possível desvincular.';
						unlink.disabled = false;
					}
				});
				panel.append(unlink);
			}
		} else if (action?.assistedRecovery) {
			const data = action.assistedRecovery;
			const editor = el('div', 'trainer-sheet-archive-editor');
			const selected = new Set();
			const exhaustionSelected = new Set();
			const people = el('div', 'trainer-sheet-captain-players');
			for (const person of data.recipients) {
				const patient = el('div', 'trainer-sheet-recovery-patient');
				const button = el('button', 'trainer-sheet-captain-player', person.name);
				button.type = 'button'; button.setAttribute('aria-pressed', 'false');
				let exhaustionChoice;
				button.addEventListener('click', () => {
					if (selected.has(person.id)) {
						selected.delete(person.id); exhaustionSelected.delete(person.id);
					} else if (selected.size < data.limit) selected.add(person.id);
					button.setAttribute('aria-pressed', String(selected.has(person.id)));
					if (exhaustionChoice) {
						exhaustionChoice.disabled = !selected.has(person.id) ||
							person.exhaustion < 2 || !person.exhaustionRecoveryReady;
						exhaustionChoice.setAttribute('aria-pressed', String(exhaustionSelected.has(person.id)));
					}
				});
				patient.append(button);
				if (data.exhaustionRecoveryAvailable) {
					exhaustionChoice = el('button', 'trainer-sheet-captain-player trainer-sheet-recovery-exhaustion',
						person.exhaustion < 2 ? 'Exaustão insuficiente' :
						!person.exhaustionRecoveryReady ? 'Já tratado nas últimas 24h' :
						`Recuperar Exaustão (${person.exhaustion})`);
					exhaustionChoice.type = 'button'; exhaustionChoice.disabled = true;
					exhaustionChoice.setAttribute('aria-pressed', 'false');
					exhaustionChoice.addEventListener('click', () => {
						if (exhaustionSelected.has(person.id)) exhaustionSelected.delete(person.id);
						else exhaustionSelected.add(person.id);
						exhaustionChoice.setAttribute('aria-pressed', String(exhaustionSelected.has(person.id)));
					});
					patient.append(exhaustionChoice);
				}
				people.append(patient);
			}
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar recuperação');
			use.type = 'button'; use.disabled = !data.available || !data.recipients.length;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			let intensive = false;
			if (data.intensiveAvailable) {
				const choice = el('button', 'trainer-sheet-talent-use', 'Usar Recuperação Intensiva');
				choice.type = 'button'; choice.setAttribute('aria-pressed', 'false');
				choice.addEventListener('click', () => {
					intensive = !intensive;
					choice.classList.toggle('selected', intensive);
					choice.setAttribute('aria-pressed', String(intensive));
				});
				editor.append(choice, el('p', 'trainer-sheet-manual-rest-status',
					'Consome uma carga do Kit Médico por participante; a cura adicional será 2 × proficiência + Sabedoria.'));
			}
			if (data.exhaustionRecoveryAvailable) editor.append(el('p', 'trainer-sheet-manual-rest-status',
				'Para cada paciente com Exaustão, selecione Recuperar Exaustão. Consome duas cargas adicionais ' +
				'do Kit Médico e remove um nível extra no próximo descanso longo.'));
			if (!data.available) editor.append(el('p', 'trainer-sheet-talent-unavailable',
				'Esta recuperação já foi preparada antes do próximo descanso longo.'));
			use.addEventListener('click', async () => {
				if (!selected.size) {
					feedback.textContent = 'Escolha ao menos um participante.';
					feedback.classList.remove('hidden'); return;
				}
				const requiredCharges = (intensive ? selected.size : 0) + 2 * exhaustionSelected.size;
				if (requiredCharges > data.intensiveCharges) {
					feedback.textContent = `São necessárias ${requiredCharges} cargas do Kit Médico para os benefícios escolhidos.`;
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const result = await action.api('/trainer/assisted-recovery', { method: 'POST', body: {
						requestId: crypto.randomUUID(), patientIds: [...selected], intensive,
						exhaustionPatientIds: [...exhaustionSelected],
					} });
					feedback.textContent = `${result.patients.length} participante(s) receberão até ` +
						`${result.healing} PV adicionais no próximo descanso longo.` +
						(result.stagedHealing ? ` Depois, Recuperação em Etapas concederá até ` +
						`${result.stagedHealing} PV no primeiro descanso curto dentro de 24 horas.` : '') +
						(result.exhaustionPatients?.length ? ` ${result.exhaustionPatients.length} participante(s) ` +
						'removerão um nível adicional de Exaustão nesse descanso.' : '');
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a recuperação.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(el('strong', '', `Escolha até ${data.limit} participante(s)`), people, use, feedback);
			panel.append(editor);
		} else if (action?.extraordinaryRecovery) {
			const data = action.extraordinaryRecovery;
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('strong', '', 'Paciente acompanhado nos descansos longos'));
			let patientId = data.patientId;
			const people = el('div', 'trainer-sheet-captain-players');
			for (const person of data.recipients) {
				const choice = el('button', 'trainer-sheet-captain-player', person.name);
				choice.type = 'button'; choice.setAttribute('aria-pressed', String(person.id === patientId));
				choice.addEventListener('click', () => {
					patientId = person.id;
					for (const item of people.children) item.setAttribute('aria-pressed', String(item === choice));
				});
				people.append(choice);
			}
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const save = el('button', 'trainer-sheet-talent-use', 'Confirmar paciente');
			save.type = 'button';
			save.addEventListener('click', async () => {
				if (!patientId) {
					feedback.textContent = 'Selecione um participante.';
					feedback.classList.remove('hidden'); return;
				}
				save.disabled = true;
				try {
					const result = await action.api('/trainer/extraordinary-recovery', {
						method: 'POST', body: { patientId } });
					feedback.textContent = `${result.patientName} receberá Recuperação Extraordinária em cada descanso longo válido.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível escolher o paciente.';
					feedback.classList.remove('hidden');
				} finally { save.disabled = false; }
			});
			editor.append(people, save);
			if (data.patientId) {
				const clear = el('button', 'trainer-sheet-talent-use', 'Remover escolha');
				clear.type = 'button';
				clear.addEventListener('click', async () => {
					clear.disabled = true;
					try {
						await action.api('/trainer/extraordinary-recovery', {
							method: 'POST', body: { patientId: null } });
						feedback.textContent = 'Nenhum paciente selecionado para os próximos descansos longos.';
						feedback.classList.remove('hidden');
						for (const item of people.children) item.setAttribute('aria-pressed', 'false');
						patientId = null;
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
						await action.refresh();
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível remover a escolha.';
						feedback.classList.remove('hidden'); clear.disabled = false;
					}
				});
				editor.append(clear);
			}
			editor.append(feedback); panel.append(editor);
		} else if (action?.preventiveProtocol) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const load = async () => {
				const data = await action.api('/trainer/preventive-protocol');
				editor.replaceChildren();
				if (!data.available) {
					editor.append(el('p', '', 'Disponível após o próximo descanso curto ou longo.'));
					return;
				}
				editor.append(el('p', '', `Escolha até ${data.limit} participantes e um risco previsto.`));
				const risk = el('input', 'trainer-sheet-support-cache-location');
				risk.maxLength = 80; risk.placeholder = 'Risco previsto (ex.: contaminação)';
				const chosen = new Set();
				const people = el('div', 'trainer-sheet-captain-players');
				for (const person of data.recipients) {
					const button = el('button', 'trainer-sheet-captain-player', person.name);
					button.type = 'button'; button.setAttribute('aria-pressed', 'false');
					button.addEventListener('click', () => {
						if (chosen.has(person.id)) chosen.delete(person.id);
						else if (chosen.size < data.limit) chosen.add(person.id);
						button.setAttribute('aria-pressed', String(chosen.has(person.id)));
					});
					people.append(button);
				}
				const confirm = el('button', 'trainer-sheet-talent-use', 'Confirmar protocolo');
				confirm.type = 'button';
				confirm.addEventListener('click', async () => {
					confirm.disabled = true;
					try {
						await action.api('/trainer/preventive-protocol', { method: 'POST', body: {
							requestId: crypto.randomUUID(), recipientIds: [...chosen], risk: risk.value,
						} });
						feedback.textContent = 'Protocolo preparado. O bônus aparecerá em Fortitude dos participantes.';
						feedback.classList.remove('hidden');
						await action.refresh();
						await load();
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível preparar o protocolo.';
						feedback.classList.remove('hidden'); confirm.disabled = false;
					}
				});
				editor.append(risk, people, confirm);
			};
			load().catch(error => { feedback.textContent = error.message; feedback.classList.remove('hidden'); });
			panel.append(editor, feedback);
		} else if (action?.integratedMedicine) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Medicina Integrada');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const data = await action.api('/trainer/integrated-medicine');
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', 'Medicina Integrada'));
					if (!data.kitAvailable) dialog.append(el('p', '', 'É necessário um Kit de Medicina Pokémon com carga na Bag.'));
					if (!data.players.length) dialog.append(el('p', '', 'Nenhum Pokémon na equipe dos participantes.'));
					for (const player of data.players) {
						const group = el('div', 'trainer-first-care-group');
						group.append(el('h3', '', player.name));
						const grid = el('div', 'trainer-first-care-pokemon-grid');
						for (const pokemon of player.pokemon) {
							const row = el('button', 'trainer-first-care-pokemon');
							row.type = 'button'; row.disabled = !pokemon.status || !data.kitAvailable;
							const sprite = el('img', 'trainer-first-care-sprite');
							sprite.src = action.spriteUrl(pokemon); sprite.alt = pokemon.species;
							const details = el('span', 'trainer-first-care-details');
							const heading = el('span', 'trainer-first-care-heading');
							heading.append(el('strong', '', pokemon.name), el('span', '', 'Nv. ' + pokemon.level));
							const types = el('span', 'trainer-first-care-types');
							for (const type of pokemon.types) types.append(el('span', '', type));
							const hp = el('span', 'trainer-first-care-hp');
							const percent = pokemon.maxHP > 0 ? Math.max(0, Math.min(100, pokemon.hp / pokemon.maxHP * 100)) : 0;
							const track = el('span', 'trainer-medical-hp-track');
							const bar = el('span', 'trainer-medical-hp-fill');
							bar.style.width = percent + '%';
							bar.style.background = percent > 50 ? '#43a768' : percent > 20 ? '#e7b438' : '#d35757';
							track.append(bar);
							hp.append(el('span', '', `HP ${pokemon.hp} / ${pokemon.maxHP} · ` +
							(POKEMON_STATUS[pokemon.status] || pokemon.status || 'Sem condição')), track);
							details.append(heading, types, hp);
							row.append(sprite, details);
							row.addEventListener('click', async () => {
								row.disabled = true;
								try {
									const result = await action.api('/trainer/integrated-medicine', { method: 'POST',
										body: { requestId: crypto.randomUUID(), characterId: player.characterId, pokemonId: pokemon.id } });
									pokemon.status = '';
									hp.firstChild.textContent = `HP ${pokemon.hp} / ${pokemon.maxHP} · Sem condição`;
									group.append(el('p', 'trainer-first-care-feedback', `${result.pokemonName} foi tratado. ` +
									(result.supplyRoll === null ? '' : `Suprimentos: 1d6 = ${result.supplyRoll}; ` +
										(result.chargeSaved ? 'carga preservada. ' : 'carga consumida. ')) +
										`Cargas restantes: ${result.chargesRemaining}.`));
									await action.refresh();
								} catch (error) {
									group.append(el('p', 'trainer-first-care-feedback', error.message || 'Não foi possível tratar.'));
									row.disabled = false;
								}
							});
							grid.append(row);
						}
						group.append(grid); dialog.append(group);
					}
					const closeDialog = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
					const onKey = event => { if (event.key === 'Escape') closeDialog(); };
					overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
					document.addEventListener('keydown', onKey);
					overlay.append(dialog); document.body.append(overlay); close();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível consultar os Pokémon.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.burnTreatment || action?.neuromuscularTreatment ||
			action?.controlledWarming || action?.neurologicalResponse) {
			const neuromuscular = !!action.neuromuscularTreatment;
			const warming = !!action.controlledWarming;
			const neurological = !!action.neurologicalResponse;
			const endpoint = neuromuscular ? '/trainer/neuromuscular-treatment' :
				warming ? '/trainer/controlled-warming' :
				neurological ? '/trainer/neurological-response' : '/trainer/burn-treatment';
			const title = neuromuscular ? 'Estímulo Neuromuscular' :
				warming ? 'Aquecimento Controlado' :
				neurological ? 'Resposta Neurológica' : 'Tratamento de Queimaduras';
			const conditionNames = { paralisado: 'Paralisado', atordoado: 'Atordoado',
				queimado: 'Queimado', congelado: 'Congelado', adormecido: 'Adormecido', confuso: 'Confuso' };
			const use = el('button', 'trainer-sheet-talent-use', `Usar ${title}`);
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const data = await action.api(endpoint);
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', title));
					if (neuromuscular) dialog.append(el('p', '',
						'Selecione apenas condições de origem neuromuscular ou fisiológica reversível.'));
					if (neurological) dialog.append(el('p', '',
						'Selecione apenas condições de origem física, química, tecnológica ou Pokémon.'));
					if (!data.kitAvailable) dialog.append(el('p', '', 'É necessário um Kit Médico com carga na Bag.'));
					if (!data.patients.length) dialog.append(el('p', '', neuromuscular || neurological ?
						'Nenhum treinador com condição tratável nesta mesa.' : warming ?
							'Nenhum treinador congelado nesta mesa.' : 'Nenhum treinador queimado nesta mesa.'));
					const grid = el('div', 'trainer-first-care-pokemon-grid');
					for (const patient of data.patients) {
						for (const conditionId of (neuromuscular || neurological ? patient.conditions :
							[warming ? 'congelado' : 'queimado'])) {
							const row = el('button', 'trainer-first-care-pokemon');
							row.type = 'button'; row.disabled = !data.kitAvailable;
							const sprite = el('img', 'trainer-first-care-sprite');
							sprite.src = action.trainerSpriteUrl(patient.avatar); sprite.alt = patient.name;
							const details = el('span', 'trainer-first-care-details');
							details.append(el('strong', '', patient.name),
								el('span', 'trainer-first-care-hp', `PV ${patient.currentHP} / ${patient.maxHP} · ` +
								conditionNames[conditionId]));
							row.append(sprite, details);
							row.addEventListener('click', async () => {
								row.disabled = true;
								try {
									const result = await action.api(endpoint, { method: 'POST',
										body: { requestId: crypto.randomUUID(), patientId: patient.id,
											...(neuromuscular || neurological ? { conditionId } : {}) } });
									row.remove();
									dialog.append(el('p', 'trainer-first-care-feedback',
										`${result.patientName} não está mais ${conditionNames[conditionId]}. ` +
										`Cargas restantes: ${result.chargesRemaining}.`));
									await action.refresh();
								} catch (error) {
									dialog.append(el('p', 'trainer-sheet-roll-error',
										error.message || 'Não foi possível concluir o atendimento.'));
									row.disabled = false;
								}
							});
							grid.append(row);
						}
					}
					dialog.append(grid);
					const closeDialog = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
					const onKey = event => { if (event.key === 'Escape') closeDialog(); };
					overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
					document.addEventListener('keydown', onKey);
					overlay.append(dialog); document.body.append(overlay); close();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível consultar os pacientes.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.reanimation) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const data = await action.api('/trainer/reanimation');
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog trainer-reanimation-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', 'Entre a Vida e a Morte'));
					if (!data.kitAvailable) dialog.append(el('p', '', 'É necessário um Kit Médico III com três cargas na Bag.'));
					if (!data.patients.length) dialog.append(el('p', '', 'Nenhum treinador atende aos critérios de reanimação.'));
					let patientId = null;
					const grid = el('div', 'trainer-first-care-pokemon-grid');
					for (const patient of data.patients) {
						const row = el('button', 'trainer-first-care-pokemon'); row.type = 'button';
						const sprite = el('img', 'trainer-first-care-sprite');
						sprite.src = action.trainerSpriteUrl(patient.avatar); sprite.alt = patient.name;
						const details = el('span', 'trainer-first-care-details');
						details.append(el('strong', '', patient.name),
							el('span', 'trainer-first-care-hp', `PV ${patient.currentHP} / ${patient.maxHP}`));
						row.append(sprite, details);
						row.addEventListener('click', () => {
							patientId = patient.id;
							for (const item of grid.children) item.setAttribute('aria-pressed', String(item === row));
						});
						grid.append(row);
					}
					dialog.append(grid);
					let mode = 'normal';
					const modes = el('div', 'trainer-sheet-roll-modes');
					for (const [value, title] of [['advantage', 'Vantagem'], ['normal', 'Normal'],
						['disadvantage', 'Desvantagem']]) {
						const choice = el('button', 'trainer-sheet-roll-choice', title); choice.type = 'button';
						choice.setAttribute('aria-pressed', String(value === mode));
						choice.addEventListener('click', () => {
							mode = value;
							for (const item of modes.children) item.setAttribute('aria-pressed', String(item === choice));
						});
						modes.append(choice);
					}
					dialog.append(modes);
					const selectedTalents = new Set();
					const talentChoices = el('div', 'trainer-sheet-roll-talents');
					const availableTalents = (action.rollTalents || []).filter(talent =>
						(talent.targets || []).some(target => target === 'skill:medicina' || target === 'skill:*') &&
						(!talent.requiredAttribute || talent.requiredAttribute === 'wisdom') &&
						(talent.id !== 'aprendizado-por-observacao' || !action.medicalTrained));
					const addTalent = talent => {
						if ([...talentChoices.children].some(item => item.dataset.talentKey === talent.key)) return;
						const item = el('button', 'trainer-sheet-roll-talent'); item.type = 'button';
						item.dataset.talentKey = talent.key; item.setAttribute('aria-pressed', 'false');
						item.append(el('b', '', talent.name), el('small', '', talent.condition || ''));
						item.addEventListener('click', () => {
							const chosen = !selectedTalents.has(talent.key);
							if (chosen) selectedTalents.add(talent.key); else selectedTalents.delete(talent.key);
							item.setAttribute('aria-pressed', String(chosen));
						});
						talentChoices.append(item);
					};
					availableTalents.forEach(addTalent);
					if (talentChoices.childElementCount) dialog.append(talentChoices);
					action.api('/trainer/ally-roll-talents').then(allies => {
						if (!overlay.isConnected) return;
						for (const talent of allies) {
							if ((talent.targets || []).some(target => target === 'skill:medicina' || target === 'skill:*') &&
								(!talent.requiredAttribute || talent.requiredAttribute === 'wisdom')) addTalent(talent);
						}
						if (talentChoices.childElementCount && !talentChoices.isConnected) dialog.append(talentChoices);
					}).catch(() => {});
					const error = el('p', 'trainer-sheet-roll-error hidden');
					const roll = el('button', 'trainer-sheet-talent-use', 'Rolar Medicina (CD 25)');
					let kitAvailable = data.kitAvailable;
					roll.type = 'button'; roll.disabled = !data.kitAvailable || !data.patients.length;
					roll.addEventListener('click', async () => {
						if (!patientId) {
							error.textContent = 'Selecione um treinador para reanimar.';
							error.classList.remove('hidden'); return;
						}
						roll.disabled = true;
						try {
							const result = await action.api('/trainer/reanimation', { method: 'POST', body: {
								requestId: crypto.randomUUID(), patientId, mode, talents: [...selectedTalents] } });
							error.textContent = result.success ? `${result.patientName} está estável com 0 PV.` :
								`O teste de Medicina resultou em ${result.total}. A reanimação não teve sucesso.`;
							error.classList.remove('hidden');
							if (result.success) grid.querySelector('[aria-pressed="true"]')?.remove();
							patientId = null;
							kitAvailable = result.chargesRemaining >= 3;
							await action.refresh();
						} catch (failure) {
							error.textContent = failure.message || 'Não foi possível reanimar o treinador.';
							error.classList.remove('hidden');
						} finally { roll.disabled = !kitAvailable || !grid.childElementCount; }
					});
					dialog.append(roll, error);
					const closeDialog = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
					const onKey = event => { if (event.key === 'Escape') closeDialog(); };
					overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
					document.addEventListener('keydown', onKey);
					overlay.append(dialog); document.body.append(overlay);
					close();
				} catch (failure) {
					feedback.textContent = failure.message || 'Não foi possível consultar os treinadores.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.emergencyCare) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Atendimento Emergencial');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const data = await action.api('/trainer/emergency-care');
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', 'Atendimento Emergencial'));
					if (!data.kitAvailable) dialog.append(el('p', '', 'É necessário um Kit Médico com carga na Bag.'));
					if (!data.patients.length) dialog.append(el('p', '', 'Nenhum treinador desmaiado nesta mesa.'));
					let revitalizing = false;
					let emergencyMedicine = false;
					let revitalizingChoice = null;
					let emergencyChoice = null;
					if (data.revitalizingAvailable) {
						const choice = el('button', 'trainer-sheet-talent-use', 'Usar Atendimento Revitalizante (3 cargas)');
						revitalizingChoice = choice;
						choice.type = 'button'; choice.disabled = !data.revitalizingKitAvailable;
						choice.setAttribute('aria-pressed', 'false');
						choice.addEventListener('click', () => {
							revitalizing = !revitalizing;
							if (revitalizing) {
								emergencyMedicine = false;
								emergencyChoice?.setAttribute('aria-pressed', 'false');
								emergencyChoice?.classList.remove('selected');
							}
							choice.classList.toggle('selected', revitalizing);
							choice.setAttribute('aria-pressed', String(revitalizing));
						});
						dialog.append(choice);
						if (!data.revitalizingKitAvailable) dialog.append(el('p', '',
							'Atendimento Revitalizante exige três cargas no mesmo Kit Médico.'));
					}
					if (data.emergencyMedicineAvailable) {
						const choice = el('button', 'trainer-sheet-talent-use', 'Usar Medicina de Emergência (2 cargas)');
						emergencyChoice = choice;
						choice.type = 'button'; choice.disabled = !data.emergencyMedicineKitAvailable;
						choice.setAttribute('aria-pressed', 'false');
						choice.addEventListener('click', () => {
							emergencyMedicine = !emergencyMedicine;
							if (emergencyMedicine) {
								revitalizing = false;
								revitalizingChoice?.setAttribute('aria-pressed', 'false');
								revitalizingChoice?.classList.remove('selected');
							}
							choice.classList.toggle('selected', emergencyMedicine);
							choice.setAttribute('aria-pressed', String(emergencyMedicine));
						});
						dialog.append(choice);
						if (!data.emergencyMedicineKitAvailable) dialog.append(el('p', '',
							'Medicina de Emergência exige duas cargas no mesmo Kit Médico.'));
					}
					const grid = el('div', 'trainer-first-care-pokemon-grid');
					for (const patient of data.patients) {
						const row = el('button', 'trainer-first-care-pokemon'); row.type = 'button';
						row.disabled = !patient.available || !data.kitAvailable;
						const sprite = el('img', 'trainer-first-care-sprite');
						sprite.src = action.trainerSpriteUrl(patient.avatar); sprite.alt = patient.name;
						const details = el('span', 'trainer-first-care-details');
						details.append(el('strong', '', patient.name),
							el('span', 'trainer-first-care-hp', `PV ${patient.currentHP} / ${patient.maxHP}`));
						if (!patient.available) details.append(el('small', 'trainer-first-care-remaining',
							'Já atendido antes do próximo descanso longo'));
						row.append(sprite, details);
						row.addEventListener('click', async () => {
							row.disabled = true;
							try {
								const result = await action.api('/trainer/emergency-care', { method: 'POST',
									body: { requestId: crypto.randomUUID(), patientId: patient.id,
										revitalizing, emergencyMedicine } });
								row.remove();
								dialog.append(el('p', 'trainer-first-care-feedback',
									`${result.patientName} recuperou ${result.hp} PV` +
									(result.revitalizing ? ` com Atendimento Revitalizante (1d6 = ${result.healingRoll}). ` :
									result.emergencyMedicine ? ` com Medicina de Emergência (1d6 = ${result.healingRoll}). ` : '. ') +
									(result.conditionsRemoved?.length ? `Condições removidas: ${result.conditionsRemoved.join(', ')}. ` : '') +
									(result.supplyRoll == null ? '' : `Suprimentos: ${(result.supplyRolls || [result.supplyRoll])
										.map(roll => `1d6 = ${roll}`).join(', ')}. `) +
										`Cargas restantes: ${result.chargesRemaining}.`));
								await action.refresh();
							} catch (error) {
								dialog.append(el('p', 'trainer-first-care-feedback',
									error.message || 'Não foi possível realizar o atendimento.'));
								row.disabled = false;
							}
						});
						grid.append(row);
					}
					dialog.append(grid);
					const closeDialog = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
					const onKey = event => { if (event.key === 'Escape') closeDialog(); };
					overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
					document.addEventListener('keydown', onKey);
					overlay.append(dialog); document.body.append(overlay);
					close();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível consultar os treinadores.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.firstCare) {
			const care = el('button', 'trainer-sheet-talent-use', 'Cuidar');
			care.type = 'button';
			care.addEventListener('click', async () => {
				try {
					const data = await action.api('/trainer/first-care');
					const overlay = el('div', 'trainer-first-care-overlay');
					const dialog = el('section', 'trainer-first-care-dialog');
					dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
					dialog.append(el('h2', '', 'Primeiros Cuidados'));
					if (!data.kitAvailable) dialog.append(el('p', '', 'É necessário um Kit de Medicina Pokémon com carga na Bag.'));
					if (!data.players.length) dialog.append(el('p', '', 'Nenhum Pokémon desmaiado nesta mesa.'));
					for (const player of data.players) {
						const group = el('div', 'trainer-first-care-group');
						group.append(el('h3', '', player.name));
						const pokemonGrid = el('div', 'trainer-first-care-pokemon-grid');
						for (const pokemon of player.pokemon) {
							const row = el('button', 'trainer-first-care-pokemon');
							row.type = 'button'; row.disabled = !!pokemon.remainingMs || !data.kitAvailable;
							const sprite = el('img', 'trainer-first-care-sprite');
							sprite.src = action.spriteUrl(pokemon);
							sprite.alt = pokemon.species;
							const details = el('span', 'trainer-first-care-details');
							const heading = el('span', 'trainer-first-care-heading');
							heading.append(el('strong', '', pokemon.name), el('span', '', 'Nv. ' + pokemon.level));
							const types = el('span', 'trainer-first-care-types');
							for (const type of pokemon.types) types.append(el('span', '', type));
							const hp = el('span', 'trainer-first-care-hp');
							hp.append(el('span', '', 'HP ' + pokemon.hp + ' / ' + pokemon.maxHP),
								el('span', 'trainer-first-care-hp-bar'));
							details.append(heading, types, hp);
							row.append(sprite, details);
							if (pokemon.remainingMs) row.append(el('small', 'trainer-first-care-remaining',
								'Disponível em ' + Math.ceil(pokemon.remainingMs / 3_600_000) + 'h'));
							row.addEventListener('click', async () => {
								try {
									const result = await action.api('/trainer/first-care', { method: 'POST',
										body: { characterId: player.characterId, pokemonId: pokemon.id } });
									row.remove();
									group.append(el('p', 'trainer-first-care-feedback',
										result.pokemonName + ' recuperou ' + result.hp + ' PV.'));
									await action.refresh();
								} catch (error) {
									group.append(el('p', 'trainer-first-care-feedback',
										error.message || 'Não foi possível cuidar.'));
								}
							});
							pokemonGrid.append(row);
						}
						group.append(pokemonGrid);
						dialog.append(group);
					}
					const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
					const onKey = event => { if (event.key === 'Escape') close(); };
					overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
					document.addEventListener('keydown', onKey);
					overlay.append(dialog); document.body.append(overlay);
				} catch (error) { care.textContent = error.message || 'Não foi possível consultar os Pokémon.'; }
			});
			panel.append(care);
		} else if (action?.persistentHypothesis !== undefined) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const status = el('p');
			const controls = el('div', 'trainer-sheet-archive-actions');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			let hypothesis = action.persistentHypothesis;
			const draw = () => {
				status.textContent = !hypothesis ? 'Nenhuma hipótese registrada.' : hypothesis.awaitingOutcome ?
					'Se a tentativa falhou, registre a falha; se teve sucesso, encerre a hipótese.' :
					`Próximo teste de Conhecimento: +${Math.min(2, hypothesis.failures)}.`;
				controls.replaceChildren();
				const actions = !hypothesis || hypothesis.awaitingOutcome ? [['failure', 'Registrar']] : [];
				if (hypothesis) actions.push(['reset', 'Encerrar']);
				for (const [operation, caption] of actions) {
					const control = el('button', 'trainer-sheet-talent-use', caption);
					control.type = 'button';
					control.addEventListener('click', async () => {
						control.disabled = true;
						try {
							const response = await action.api('/trainer/persistent-hypothesis',
								{ method: 'POST', body: { action: operation } });
							hypothesis = response.hypothesis;
							feedback.classList.add('hidden');
							draw();
							window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
								{ detail: { tableId: selectedTable } }));
						} catch (failure) {
							feedback.textContent = failure.message || 'Não foi possível registrar a pesquisa.';
							feedback.classList.remove('hidden'); control.disabled = false;
						}
					});
					controls.append(control);
				}
			};
			draw(); editor.append(status, controls, feedback); panel.append(editor);
		} else if (action?.supplierOrder || action?.parallelMarket) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const parallel = !!action.parallelMarket;
			const activeOrder = parallel ? action.parallelMarket : action.supplierOrder;
			if (activeOrder.pending) {
				const order = activeOrder.pending;
				editor.append(el('p', '', `${order.quantity || 1} × ${order.itemName} · ${order.price.toLocaleString('pt-BR')} Pokécoins`),
					el('p', '', 'Encomenda aguardando avaliação do Mestre.'));
			} else {
				let selected = null;
				const choose = el('button', 'trainer-sheet-scientist-choose', 'Escolher item');
				choose.type = 'button'; choose.setAttribute('aria-haspopup', 'dialog');
				const quantity = el('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '99';
				quantity.value = '1'; quantity.setAttribute('aria-label', 'Quantidade');
				const order = el('button', 'trainer-sheet-talent-use', 'Encomendar');
				order.type = 'button'; order.disabled = true;
				choose.addEventListener('click', async () => {
					choose.disabled = true;
					try {
						const data = await action.api(parallel ? '/trainer/parallel-market/catalog' : '/trainer/supplier/catalog');
						const items = data.items || [];
						const categories = window.rpgBagCatalogCategories;
						const overlay = el('div', 'trainer-sheet-record-overlay');
						const dialog = el('div', 'trainer-sheet-record-dialog trainer-sheet-supplier-dialog');
						dialog.setAttribute('role', 'dialog');
						dialog.setAttribute('aria-label', 'Escolher item para encomendar');
						const heading = el('h2', '', 'Escolher item');
						const stage = el('div', 'trainer-sheet-supplier-stage');
						const closePicker = () => { overlay.remove(); recordPicker = null; choose.focus(); };
						const showCategories = () => {
							stage.replaceChildren();
							for (const [id, name] of categories.list) {
								const count = items.filter(item => categories.id(item) === id).length;
								if (!count) continue;
								const button = el('button', 'bag-ui-catalog-category'); button.type = 'button';
								button.append(el('strong', '', name), el('small', '', `${count} item(ns)`));
								button.addEventListener('click', () => showItems(id)); stage.append(button);
							}
							if (!stage.children.length) stage.append(el('p', '', 'Nenhum item disponível para encomenda.'));
						};
						const showItems = categoryId => {
							const back = el('button', 'bag-ui-catalog-back', '‹ Categorias'); back.type = 'button';
							back.addEventListener('click', showCategories);
							const search = el('input'); search.type = 'search'; search.placeholder = 'Pesquisar item';
							const list = el('div', 'bag-ui-master-catalog');
							const fill = () => {
								const query = search.value.trim().toLocaleLowerCase('pt-BR');
								list.replaceChildren();
								for (const item of items.filter(entry => categories.id(entry) === categoryId &&
									(!query || entry.name.toLocaleLowerCase('pt-BR').includes(query))).slice(0, 300)) {
									const choice = el('button', 'bag-ui-master-catalog-item'); choice.type = 'button';
									const icon = window.rpgRuntimeItemIcon?.(item);
									if (icon) { const frame = el('span', 'bag-ui-item-icon'); frame.append(icon); choice.append(frame); }
									choice.append(el('span', '', item.name),
										el('small', '', `${(parallel ? item.price : item.orderPrice).toLocaleString('pt-BR')} Pokécoins`));
									choice.addEventListener('click', () => {
										selected = item;
										choose.textContent = `${item.name} · ${(parallel ? item.price : item.orderPrice).toLocaleString('pt-BR')} Pokécoins`;
										order.disabled = false; closePicker();
									});
									list.append(choice);
								}
								if (!list.children.length) list.append(el('p', 'empty-state', 'Nenhum item encontrado.'));
							};
							search.addEventListener('input', fill);
							stage.replaceChildren(back, el('h3', '', categories.name(categoryId)), search, list);
							fill();
						};
						showCategories(); dialog.append(heading, stage); overlay.append(dialog);
						overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closePicker(); });
						document.body.append(overlay); recordPicker = { overlay, close: closePicker };
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível carregar os itens.';
						feedback.classList.remove('hidden');
					} finally { choose.disabled = false; }
				});
				order.addEventListener('click', async () => {
					if (!selected) return;
					const count = Number(quantity.value);
					if (parallel && (!Number.isSafeInteger(count) || count < 1 || count > 99)) {
						feedback.textContent = 'Escolha uma quantidade entre 1 e 99.';
						feedback.classList.remove('hidden'); return;
					}
					order.disabled = true;
					try {
						await action.api(parallel ? '/trainer/parallel-market/orders' : '/trainer/supplier/orders', { method: 'POST', body: {
							requestId: crypto.randomUUID(), itemId: selected.id, itemKind: selected.kind,
							...(parallel ? { quantity: count } : {}),
						} });
						feedback.textContent = 'Encomenda enviada para avaliação do Mestre.';
						feedback.classList.remove('hidden'); choose.remove(); order.remove(); quantity.remove();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível enviar a encomenda.';
						feedback.classList.remove('hidden'); order.disabled = false;
					}
				});
				editor.append(choose);
				if (parallel) editor.append(quantity);
				editor.append(order);
			}
			editor.append(feedback); panel.append(editor);
		} else if (action?.forage) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (action.forage.pending) {
				editor.append(el('p', '', 'Forrageio aguardando a avaliação do Mestre.'));
			} else {
				const submit = el('button', 'trainer-sheet-talent-use', 'Solicitar forrageio');
				submit.type = 'button';
				submit.addEventListener('click', async () => {
					submit.disabled = true;
					try {
						await action.api('/trainer/talents/forage', { method: 'POST', body: {
							requestId: crypto.randomUUID(),
						} });
						feedback.textContent = `Pedido enviado ao Mestre: ${action.forage.foodQuantity} Alimentos.`;
						feedback.classList.remove('hidden'); submit.remove();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível solicitar o forrageio.';
						feedback.classList.remove('hidden'); submit.disabled = false;
					}
				});
				editor.append(submit);
			}
			editor.append(feedback); panel.append(editor);
		} else if (action?.confidant) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const { name, pending } = action.confidant;
			if (name) {
				editor.append(el('strong', '', `Confidente: ${name}`));
			} else if (pending) {
				editor.append(el('strong', '', `Confidente proposto: ${pending.confidantName}`),
					el('p', '', `Persuasão: 1d20 tirou ${pending.roll.natural} ` +
					`${pending.roll.bonus < 0 ? '-' : '+'} ${Math.abs(pending.roll.bonus)} = ${pending.roll.total}`),
					el('p', '', 'Aguardando a avaliação do Mestre.'));
			} else {
				const input = document.createElement('input');
				input.type = 'text'; input.maxLength = 80; input.placeholder = 'Nome do confidente';
				input.setAttribute('aria-label', 'Nome do confidente');
				const submit = el('button', 'trainer-sheet-talent-use', 'Propor confidente');
				submit.type = 'button';
				const feedback = el('p', 'trainer-sheet-roll-error hidden');
				submit.addEventListener('click', async () => {
					submit.disabled = true;
					try {
						const result = await action.api('/trainer/talents/confidant', { method: 'POST', body: {
							requestId: crypto.randomUUID(), confidantName: input.value,
						} });
						const roll = result.request.roll;
						feedback.textContent = `Persuasão: 1d20 tirou ${roll.natural} ${roll.bonus < 0 ? '-' : '+'} ` +
							`${Math.abs(roll.bonus)} = ${roll.total}. Pedido enviado ao Mestre.`;
						feedback.classList.remove('hidden'); input.remove(); submit.remove();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível propor o confidente.';
						feedback.classList.remove('hidden'); submit.disabled = false;
					}
				});
				editor.append(input, submit, feedback);
			}
			panel.append(editor);
		} else if (action?.trueBond) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const { name, pending } = action.trueBond;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (name) {
				editor.append(el('strong', '', `NPC vinculado: ${name}`));
				if (action.canRemove) {
					const remove = el('button', 'trainer-sheet-talent-use', 'Remover vínculo');
					remove.type = 'button';
					let confirming = false;
					remove.addEventListener('click', async () => {
						if (!confirming) { confirming = true; remove.textContent = 'Confirmar remoção'; return; }
						remove.disabled = true;
						try {
							await action.api('/trainer/talents/true-bond/remove', { method: 'POST' });
							feedback.textContent = 'Laço Verdadeiro removido.';
							feedback.classList.remove('hidden'); remove.remove();
							window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
								{ detail: { tableId: selectedTable } }));
						} catch (error) {
							feedback.textContent = error.message || 'Não foi possível remover o vínculo.';
							feedback.classList.remove('hidden'); remove.disabled = false;
						}
					});
					editor.append(remove);
				}
			} else if (pending) {
				editor.append(el('strong', '', `NPC proposto: ${pending.npcName}`),
					el('p', '', 'Aguardando a avaliação do Mestre.'));
			} else {
				const input = document.createElement('input');
				input.type = 'text'; input.maxLength = 80; input.placeholder = 'Nome do NPC';
				input.setAttribute('aria-label', 'Nome do NPC para Laço Verdadeiro');
				const submit = el('button', 'trainer-sheet-talent-use', 'Propor Laço Verdadeiro');
				submit.type = 'button';
				submit.addEventListener('click', async () => {
					submit.disabled = true;
					try {
						await action.api('/trainer/talents/true-bond', { method: 'POST', body: {
							requestId: crypto.randomUUID(), npcName: input.value,
						} });
						feedback.textContent = 'Pedido enviado ao Mestre.';
						feedback.classList.remove('hidden'); input.remove(); submit.remove();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível propor o Laço Verdadeiro.';
						feedback.classList.remove('hidden'); submit.disabled = false;
					}
				});
				editor.append(input, submit);
			}
			editor.append(feedback); panel.append(editor);
		} else if (action?.publication) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('strong', '', `Publicações aceitas: ${action.publication.accepted}`));
			if (action.publication.pending) editor.append(el('p', '', 'Artigo aguardando avaliação do Mestre.'));
			else {
				const title = document.createElement('input');
				title.type = 'text'; title.maxLength = 120; title.placeholder = 'Título do artigo';
				title.setAttribute('aria-label', 'Título do artigo');
				const summary = document.createElement('textarea');
				summary.maxLength = 3000; summary.placeholder = 'Resumo da pesquisa';
				summary.setAttribute('aria-label', 'Resumo da pesquisa');
				const create = el('button', 'trainer-sheet-talent-use', 'Criar artigo');
				create.type = 'button';
				const feedback = el('p', 'trainer-sheet-roll-error hidden');
				create.addEventListener('click', async () => {
					create.disabled = true;
					try {
						await action.api('/trainer/publications', { method: 'POST', body: {
							requestId: crypto.randomUUID(), title: title.value, summary: summary.value,
						} });
						feedback.textContent = 'Artigo enviado para avaliação do Mestre.';
						feedback.classList.remove('hidden');
						create.remove(); title.remove(); summary.remove();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível criar o artigo.';
						feedback.classList.remove('hidden'); create.disabled = false;
					}
				});
				editor.append(title, summary, create, feedback);
			}
			panel.append(editor);
		} else if (action?.technologicalPrototype) {
			panel.classList.add('trainer-sheet-talent-popover--archive');
			const data = action.technologicalPrototype;
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('strong', '', `Protótipos ativos (${data.slots.length}/${data.limit})`));
			for (let slot = 0; slot < data.limit; slot++) {
				const current = data.slots.find(entry => entry.slot === slot);
				let selectedId = current?.prototypeComponents?.[0] || current?.itemId || '';
				let secondSelectedId = current?.prototypeComponents?.[1] || '';
				const row = el('div', 'trainer-sheet-scientist-row');
				const choose = el('button', 'trainer-sheet-scientist-choose', 'Escolher protótipo');
				choose.type = 'button'; choose.setAttribute('aria-haspopup', 'dialog');
				const modular = data.canBuildMasterpiece ? el('button', 'trainer-sheet-scientist-choose',
					'Adicionar segunda função') : null;
				if (modular) { modular.type = 'button'; modular.setAttribute('aria-haspopup', 'dialog'); }
				const recipient = select([['', 'Destinatário'], ...data.recipients.map(person => [person.id, person.name])]);
				recipient.value = current?.recipientCharacterId || '';
				const selected = el('p', 'trainer-sheet-scientist-effect');
				const showSelection = () => {
					const option = data.options.find(entry => entry.id === selectedId);
					choose.textContent = option?.name || 'Escolher protótipo';
					const second = data.options.find(entry => entry.id === secondSelectedId);
					if (modular) modular.textContent = second?.name || 'Adicionar segunda função';
					selected.textContent = option ? `${option.effect} · ${option.charges} carga(s)${second ?
						`\n${second.effect} · ${second.charges} carga(s) · Obra-Prima Modular: +2 cargas` : ''}` :
						'Escolha um dispositivo para construir.';
				};
				showSelection();
				const openPrototypePicker = secondFunction => {
					const overlay = el('div', 'trainer-sheet-record-overlay');
					const dialog = el('div', 'trainer-sheet-record-dialog');
					dialog.setAttribute('role', 'dialog');
					dialog.setAttribute('aria-label', 'Escolher Protótipo Tecnológico');
					dialog.append(el('h2', '', 'Escolher protótipo'));
					const list = el('div', 'trainer-sheet-record-list');
					const closePicker = () => { overlay.remove(); recordPicker = null; choose.focus(); };
					if (secondFunction) {
						const clear = el('button', 'trainer-sheet-record-choice', 'Criar protótipo simples');
						clear.type = 'button'; clear.addEventListener('click', () => {
							secondSelectedId = ''; showSelection(); closePicker();
						}); list.append(clear);
					}
					for (const option of data.options.filter(entry => !secondFunction || entry.id !== selectedId)) {
						const choice = el('button', 'trainer-sheet-record-choice'); choice.type = 'button';
						choice.append(el('strong', '', option.name),
							el('span', '', `${option.effect} · ${option.charges} carga(s)${option.advanced ?
								' · Kit Tecnológico II ou III' : ''}`));
						choice.addEventListener('click', () => {
							if (secondFunction) secondSelectedId = option.id;
							else { selectedId = option.id; if (secondSelectedId === selectedId) secondSelectedId = ''; }
							showSelection(); closePicker();
						});
						list.append(choice);
					}
					dialog.append(list); overlay.append(dialog);
					overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closePicker(); });
					document.body.append(overlay); recordPicker = { overlay, close: closePicker };
				};
				choose.addEventListener('click', () => openPrototypePicker(false));
				modular?.addEventListener('click', () => openPrototypePicker(true));
				const build = el('button', 'trainer-sheet-talent-use', current ? 'Substituir' : 'Construir');
				build.type = 'button';
				const feedback = el('p', 'trainer-sheet-roll-error hidden');
				const construct = async replacementSlot => {
					if (!selectedId || !recipient.value) {
						feedback.textContent = 'Escolha um protótipo e um destinatário.';
						feedback.classList.remove('hidden'); return;
					}
					build.disabled = true;
					try {
						await action.api('/trainer/talents/technological-prototype', { method: 'POST', body: {
							slot: replacementSlot, itemId: selectedId, secondItemId: secondSelectedId || undefined,
							recipientCharacterId: recipient.value,
						} });
						close();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
						await action.refresh();
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível construir o protótipo.';
						feedback.classList.remove('hidden'); build.disabled = false;
					}
				};
				build.addEventListener('click', () => {
					if (!selectedId || !recipient.value || data.slots.length < data.limit) {
						void construct(slot); return;
					}
					const overlay = el('div', 'trainer-sheet-record-overlay');
					const dialog = el('div', 'trainer-sheet-record-dialog');
					dialog.setAttribute('role', 'dialog');
					dialog.setAttribute('aria-label', 'Escolher protótipo a substituir');
					dialog.append(el('h2', '', 'Qual protótipo será desativado?'),
						el('p', '', 'A programação do escolhido falhará e ele se tornará um item comum.'));
					const list = el('div', 'trainer-sheet-record-list');
					const closePicker = () => { overlay.remove(); recordPicker = null; build.focus(); };
					for (const active of data.slots) {
						const option = data.options.find(entry => entry.id === (active.prototypeComponents?.[0] || active.itemId));
						const owner = data.recipients.find(person => person.id === active.recipientCharacterId);
						const choice = el('button', 'trainer-sheet-record-choice'); choice.type = 'button';
						choice.append(el('strong', '', active.prototypeComponents ?
							`Obra-Prima Modular: ${active.prototypeComponents.map(id => data.options.find(entry => entry.id === id)?.name || id).join(' + ')}` :
							(option?.name || active.itemId)),
						el('span', '', `Com ${owner?.name || 'destinatário desconhecido'}`));
						choice.addEventListener('click', () => { closePicker(); void construct(active.slot); });
						list.append(choice);
					}
					dialog.append(list); overlay.append(dialog);
					overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closePicker(); });
					document.body.append(overlay); recordPicker = { overlay, close: closePicker };
				});
				row.append(choose);
				if (modular) row.append(modular);
				row.append(recipient, selected, build, feedback);
				editor.append(row);
			}
			panel.append(editor);
		} else if (action?.scientistRecord) {
			panel.classList.add('trainer-sheet-talent-popover--archive');
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('strong', '', `Registros ativos (${action.scientistRecord.slots.length}/${action.scientistRecord.limit})`));
			for (let slot = 0; slot < action.scientistRecord.limit; slot++) {
				const prepared = action.scientistRecord.slots.find(entry => entry.slot === slot);
				let selectedFormula = prepared?.custom ? 'custom' : prepared?.formulaId || '';
				const row = el('div', 'trainer-sheet-scientist-row');
				const formula = el('button', 'trainer-sheet-scientist-choose',
					action.scientistRecord.formulas.find(entry => entry.id === selectedFormula)?.name || 'Escolher registro');
				formula.type = 'button'; formula.setAttribute('aria-haspopup', 'dialog');
				const recipient = select([['', 'Destinatário'], ...action.scientistRecord.recipients.map(person =>
					[person.id, person.name])]);
				recipient.value = prepared?.recipientCharacterId || '';
				recipient.setAttribute('aria-label', `Destinatário do registro ${slot + 1}`);
				const selected = el('p', 'trainer-sheet-scientist-effect');
				let showSelection = () => {
					const entry = action.scientistRecord.formulas.find(option => option.id === selectedFormula);
					formula.textContent = entry?.name || (selectedFormula === 'custom' ? 'Registro livre' :
						prepared?.custom?.name || 'Escolher registro');
					selected.textContent = entry ? `${entry.effect} · ${entry.charges} carga(s)` :
						prepared?.custom?.description || 'Escolha uma fórmula para preparar.';
				};
				showSelection();
				formula.addEventListener('click', () => {
					const overlay = el('div', 'trainer-sheet-record-overlay');
					const dialog = el('div', 'trainer-sheet-record-dialog');
					dialog.setAttribute('role', 'dialog');
					dialog.setAttribute('aria-label', 'Escolher Registro Reprodutível');
					dialog.append(el('h2', '', 'Escolher registro'));
					const list = el('div', 'trainer-sheet-record-list');
					const closePicker = () => { overlay.remove(); recordPicker = null; formula.focus(); };
					if (action.scientistRecord.allowCustom) {
						const choice = el('button', 'trainer-sheet-record-choice'); choice.type = 'button';
						choice.append(el('strong', '', 'Registro livre'),
							el('span', '', 'Defina nome e descrição; o Mestre aprova o nível do kit e o custo em cargas.'));
						choice.addEventListener('click', () => { selectedFormula = 'custom'; showSelection(); closePicker(); });
						list.append(choice);
					}
					for (const entry of action.scientistRecord.formulas) {
						const choice = el('button', 'trainer-sheet-record-choice'); choice.type = 'button';
						choice.append(el('strong', '', entry.name), el('span', '', entry.effect),
							el('span', '', `${entry.charges} carga(s) científicas`));
						choice.addEventListener('click', () => {
							selectedFormula = entry.id; showSelection(); closePicker();
						});
						list.append(choice);
					}
					dialog.append(list);
					overlay.append(dialog);
					overlay.addEventListener('pointerdown', event => {
						if (event.target === overlay) closePicker();
					});
					document.body.append(overlay);
					recordPicker = { overlay, close: closePicker };
				});
				const customName = el('input', 'trainer-sheet-scientist-custom-name');
				customName.placeholder = 'Nome do registro livre'; customName.maxLength = 100;
				customName.value = prepared?.custom?.name || '';
				const customDescription = el('textarea', 'trainer-sheet-scientist-custom-description');
				customDescription.placeholder = 'Descrição do efeito e suas limitações'; customDescription.maxLength = 2000;
				customDescription.value = prepared?.custom?.description || '';
				const customFields = el('div', 'trainer-sheet-scientist-custom-fields');
				customFields.append(customName, customDescription);
				const originalShowSelection = showSelection;
				showSelection = () => { originalShowSelection(); customFields.classList.toggle('hidden', selectedFormula !== 'custom'); };
				showSelection();
				const save = el('button', 'trainer-sheet-talent-use', prepared ? 'Atualizar' : 'Preparar');
				save.type = 'button';
				const remove = el('button', 'trainer-sheet-archive-remove', 'Remover');
				remove.type = 'button'; remove.classList.toggle('hidden', !prepared);
				const feedback = el('p', 'trainer-sheet-roll-error hidden');
				if (action.scientistRecord.pending?.some(entry => entry.slot === slot)) {
					feedback.textContent = 'Registro livre aguardando aprovação do Mestre.';
					feedback.classList.remove('hidden'); save.disabled = true;
				}
				async function submit(clear) {
					if (!clear && (!selectedFormula || !recipient.value)) {
						feedback.textContent = 'Escolha uma fórmula e um destinatário.';
						feedback.classList.remove('hidden'); return;
					}
					save.disabled = true; remove.disabled = true;
					try {
						if (selectedFormula === 'custom' && !clear) {
							await action.api('/trainer/talents/scientist-record/custom', { method: 'POST', body: {
								requestId: crypto.randomUUID(), slot, recipientCharacterId: recipient.value,
								name: customName.value, description: customDescription.value,
							} });
						} else {
							await action.api('/trainer/talents/scientist-record', { method: 'POST', body: {
								slot, ...(clear ? { clear: true } : { formulaId: selectedFormula,
									recipientCharacterId: recipient.value }),
							} });
						}
						close();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
						await action.refresh();
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível preparar o registro.';
						feedback.classList.remove('hidden'); save.disabled = false; remove.disabled = false;
					}
				}
				save.addEventListener('click', () => submit(false));
				remove.addEventListener('click', () => submit(true));
				row.append(formula, recipient, selected, customFields, save, remove, feedback);
				editor.append(row);
			}
			panel.insertBefore(editor, panel.children[1]);
		} else if (action?.pokemonPharmacy || action?.advancedPharmacy || action?.masterPharmacy) {
			const advanced = !!action.advancedPharmacy;
			const master = !!action.masterPharmacy;
			const characterId = action.pokemonPharmacy || action.advancedPharmacy || action.masterPharmacy;
			const editor = el('div', 'trainer-sheet-archive-editor');
			const recipes = master ? {
				maxpotion: ['Max Potion', 1], fullrestore: ['Full Restore', 1],
			} : advanced ? {
				superpotion: ['Super Potion', 2], hyperpotion: ['Hyper Potion', 2], fullheal: ['Full Heal', 3],
			} : { potion: ['Potion', 3], antidote: ['Antidote', 3], awakening: ['Awakening', 3],
				burnheal: ['Burn Heal', 3], iceheal: ['Ice Heal', 3], paralyzeheal: ['Paralyze Heal', 3] };
			const item = select([['', 'Escolha o item'],
				...Object.entries(recipes).map(([id, [name]]) => [id, name])]);
			item.setAttribute('aria-label', master ? 'Item de Mestre de Formulação' : advanced ? 'Item da Farmacologia Avançada' :
				'Item da Produção Farmacêutica Pokémon');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const create = el('button', 'trainer-sheet-talent-use', 'Iniciar produção');
			create.type = 'button';
			const pending = el('div', 'trainer-sheet-pharmacy-pending');
			const message = value => { feedback.textContent = value; feedback.classList.remove('hidden'); };
			async function showPending() {
				const data = await action.api('/trainer/activities');
				pending.replaceChildren();
				for (const craft of data.activities?.crafts || []) {
					const id = craft.recipeId?.split(':')[1];
					if (craft.completedAt !== undefined || !recipes[id]) continue;
					const row = el('div', 'trainer-sheet-pharmacy-row');
					row.append(el('span', '', `${recipes[id][0]} · ${recipes[id][1]} unidades`));
					const finish = el('button', 'trainer-sheet-talent-use', 'Concluir produção');
					finish.type = 'button';
					finish.addEventListener('click', async () => {
						finish.disabled = true;
						try {
							await action.api('/trainer/activities', { method: 'POST', body: {
								characterId, requestId: crypto.randomUUID(),
								action: { type: 'craft-complete', craftId: craft.id },
							} });
							message(`Produção concluída: ${recipes[id][1]} ${recipes[id][0]}.`);
							await showPending();
							window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
								{ detail: { tableId: selectedTable } }));
						} catch (error) {
							message(error.message || 'Não foi possível concluir a produção.');
						} finally { finish.disabled = false; }
					});
					row.append(finish); pending.append(row);
				}
			}
			create.addEventListener('click', async () => {
				if (!item.value) { message('Escolha o item para produzir.'); return; }
				create.disabled = true;
				try {
					await action.api('/trainer/activities', { method: 'POST', body: {
						characterId, requestId: crypto.randomUUID(),
						action: { type: 'craft-start', recipeId: `pharmacy:${item.value}` },
					} });
					message(`Produção iniciada. Após ${master ? '8 horas' : advanced ? '1 hora' : '30 minutos'} no relógio da campanha, conclua o lote abaixo.`);
					await showPending();
				} catch (error) {
					message(error.message || 'Não foi possível iniciar a produção.');
				} finally { create.disabled = false; }
			});
			editor.append(item, create, pending, feedback);
			panel.append(editor);
			void showPending().catch(error => message(error.message || 'Não foi possível carregar as produções.'));
		} else if (action?.capturePlan) {
			const plan = action.capturePlan;
			const controls = el('div', 'trainer-sheet-archive-editor trainer-sheet-captain-editor');
			const description = el('input', 'trainer-sheet-progression-input');
			description.type = 'text'; description.maxLength = 160;
			description.placeholder = 'Alvo e abordagem planejada';
			description.value = plan.plan?.description || '';
			controls.append(el('strong', '', 'Plano de abordagem'), description,
				el('strong', '', `Participantes, incluindo você (até ${plan.proficiency})`));
			const selected = new Set(plan.plan?.recipientCharacterIds || []);
			const playerGrid = el('div', 'trainer-sheet-captain-players');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			for (const person of plan.recipients || []) {
				const player = el('button', 'trainer-sheet-captain-player', person.name);
				player.type = 'button'; player.setAttribute('aria-pressed', String(selected.has(person.id)));
				player.addEventListener('click', () => {
					if (selected.has(person.id)) selected.delete(person.id);
					else if (selected.size < plan.proficiency) selected.add(person.id);
					else {
						feedback.textContent = `Escolha até ${plan.proficiency} participantes.`;
						feedback.classList.remove('hidden'); return;
					}
					player.setAttribute('aria-pressed', String(selected.has(person.id)));
					feedback.classList.add('hidden');
				});
				playerGrid.append(player);
			}
			controls.append(playerGrid);
			if (plan.plan) {
				controls.append(el('small', '', `Preparação concluída em ${new Date(plan.plan.readyAt).toLocaleString('pt-BR')}.`));
				const used = (plan.plan.usedRecipientIds || []).map(id =>
					plan.recipients.find(person => person.id === id)?.name).filter(Boolean);
				if (used.length) controls.append(el('small', '', `Bônus já utilizado: ${used.join(', ')}.`));
			}
			const save = el('button', 'trainer-sheet-talent-use', 'Preparar plano'); save.type = 'button';
			const cancel = el('button', 'trainer-sheet-talent-use', 'Encerrar plano'); cancel.type = 'button';
			cancel.classList.toggle('hidden', !plan.plan);
			async function submit(clear = false) {
				const ids = clear ? [] : [...selected];
				if (!clear && (!description.value.trim() || !ids.length || ids.length > plan.proficiency)) {
					feedback.textContent = 'Descreva a abordagem e escolha quem participará.';
					feedback.classList.remove('hidden'); return;
				}
				save.disabled = true; cancel.disabled = true;
				try {
					await action.api('/trainer/talents/capture-plan', { method: 'POST', body: {
						description: clear ? '' : description.value.trim(), recipientCharacterIds: ids,
					} });
					feedback.textContent = clear ? 'Plano encerrado.' : 'Plano preparado para os participantes.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível alterar o plano.';
					feedback.classList.remove('hidden');
				} finally { save.disabled = false; cancel.disabled = false; }
			}
			save.addEventListener('click', () => submit());
			cancel.addEventListener('click', () => submit(true));
			controls.append(save, cancel, feedback); panel.append(controls);
		} else if (action?.diplomatProxy) {
			const data = action.diplomatProxy;
			const controls = el('div', 'trainer-sheet-archive-editor');
			const prepared = new Map((data.preparation?.recipients || []).map(entry => [entry.characterId, entry]));
			const chosen = new Set(prepared.keys());
			const entries = new Map();
			const grid = el('div', 'trainer-sheet-proxy-grid');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			controls.append(el('strong', '', `Aliados preparados (até ${data.proficiency})`));
			for (const person of data.recipients) {
				const card = el('div', 'trainer-sheet-proxy-card');
				const toggle = el('button', 'trainer-sheet-captain-player', person.name);
				toggle.type = 'button'; toggle.setAttribute('aria-pressed', String(chosen.has(person.id)));
				const proposal = el('input', 'trainer-sheet-progression-input');
				proposal.type = 'text'; proposal.maxLength = 160; proposal.placeholder = 'Proposta concreta';
				proposal.setAttribute('aria-label', `Proposta de ${person.name}`);
				proposal.value = prepared.get(person.id)?.proposal || '';
				const audience = el('input', 'trainer-sheet-progression-input');
				audience.type = 'text'; audience.maxLength = 100; audience.placeholder = 'Público ou interlocutor';
				audience.setAttribute('aria-label', `Interlocutor de ${person.name}`);
				audience.value = prepared.get(person.id)?.audience || '';
				const details = el('div', 'trainer-sheet-proxy-details');
				details.append(proposal, audience);
				details.classList.toggle('hidden', !chosen.has(person.id));
				if (prepared.get(person.id)?.used) details.append(el('small', '', 'Uso já realizado nesta preparação.'));
				toggle.addEventListener('click', () => {
					if (chosen.has(person.id)) chosen.delete(person.id);
					else if (chosen.size < data.proficiency) chosen.add(person.id);
					else {
						feedback.textContent = `Escolha até ${data.proficiency} aliados.`;
						feedback.classList.remove('hidden'); return;
					}
					toggle.setAttribute('aria-pressed', String(chosen.has(person.id)));
					details.classList.toggle('hidden', !chosen.has(person.id));
					feedback.classList.add('hidden');
				});
				card.append(toggle, details); grid.append(card);
				entries.set(person.id, { proposal, audience });
			}
			controls.append(grid);
			if (data.preparation) controls.append(el('small', '',
				`Pronto em ${new Date(data.preparation.readyAt).toLocaleString('pt-BR')} · ` +
				`expira em ${new Date(data.preparation.expiresAt).toLocaleString('pt-BR')}.`));
			const save = el('button', 'trainer-sheet-talent-use', 'Preparar aliados'); save.type = 'button';
			const cancel = el('button', 'trainer-sheet-talent-use', 'Encerrar preparação'); cancel.type = 'button';
			cancel.classList.toggle('hidden', !data.preparation);
			async function submit(clear = false) {
				const recipients = clear ? [] : [...chosen].map(characterId => ({ characterId,
					proposal: entries.get(characterId).proposal.value.trim(),
					audience: entries.get(characterId).audience.value.trim() }));
				if (!clear && (!recipients.length || recipients.some(entry => !entry.proposal || !entry.audience))) {
					feedback.textContent = 'Escolha aliados e informe a proposta e o interlocutor de cada um.';
					feedback.classList.remove('hidden'); return;
				}
				save.disabled = true; cancel.disabled = true;
				try {
					await action.api('/trainer/talents/diplomat-proxy', { method: 'POST', body: { recipients } });
					feedback.textContent = clear ? 'Preparação encerrada.' : 'Aliados preparados para a proposta.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar os aliados.';
					feedback.classList.remove('hidden');
				} finally { save.disabled = false; cancel.disabled = false; }
			}
			save.addEventListener('click', () => submit()); cancel.addEventListener('click', () => submit(true));
			controls.append(save, cancel, feedback); panel.append(controls);
		} else if (action?.introductionLetter) {
			const letter = action.introductionLetter;
			const controls = el('div', 'trainer-sheet-archive-editor');
			const recipient = el('select', 'trainer-sheet-progression-input');
			recipient.append(new Option('Escolha o aliado', ''));
			for (const person of letter.recipients || []) recipient.append(new Option(person.name, person.id));
			recipient.value = letter.letter?.recipientCharacterId || '';
			const institution = el('input', 'trainer-sheet-progression-input');
			institution.type = 'text'; institution.maxLength = 80;
			institution.placeholder = 'Instituição ou organização';
			institution.value = letter.letter?.institution || '';
			const subject = el('input', 'trainer-sheet-progression-input');
			subject.type = 'text'; subject.maxLength = 160;
			subject.placeholder = 'Assunto da recomendação';
			subject.value = letter.letter?.subject || '';
			controls.append(el('strong', '', 'Destinatário da carta'), recipient,
				el('strong', '', 'Instituição'), institution, el('strong', '', 'Assunto'), subject);
			if (letter.letter) controls.append(el('small', '', letter.letter.used ?
				'Esta carta já foi utilizada.' : 'Carta ativa. Uma nova carta substituirá esta.'));
			const save = el('button', 'trainer-sheet-talent-use', 'Escrever carta'); save.type = 'button';
			const cancel = el('button', 'trainer-sheet-talent-use', 'Encerrar carta'); cancel.type = 'button';
			cancel.classList.toggle('hidden', !letter.letter);
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			async function submit(clear = false) {
				if (!clear && (!recipient.value || !institution.value.trim() || !subject.value.trim())) {
					feedback.textContent = 'Escolha o aliado e preencha a instituição e o assunto.';
					feedback.classList.remove('hidden'); return;
				}
				save.disabled = true; cancel.disabled = true;
				try {
					await action.api('/trainer/talents/introduction-letter', { method: 'POST', body: {
						recipientCharacterId: clear ? '' : recipient.value,
						institution: clear ? '' : institution.value.trim(), subject: clear ? '' : subject.value.trim(),
					} });
					feedback.textContent = clear ? 'Carta encerrada.' : 'Carta entregue ao aliado.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível alterar a carta.';
					feedback.classList.remove('hidden');
				} finally { save.disabled = false; cancel.disabled = false; }
			}
			save.addEventListener('click', () => submit());
			cancel.addEventListener('click', () => submit(true));
			controls.append(save, cancel, feedback); panel.append(controls);
		} else if (action?.cosmopolitanEtiquette) {
			const data = action.cosmopolitanEtiquette;
			const controls = el('div', 'trainer-sheet-archive-editor trainer-sheet-captain-editor');
			const community = el('input'); community.type = 'text'; community.maxLength = 80;
			community.placeholder = 'Nome da comunidade'; community.setAttribute('aria-label', 'Comunidade');
			community.value = data.orientation?.community || '';
			const difficulty = select([
				['10', 'Conhecida · CD 10'], ['15', 'Pouco conhecida · CD 15'],
				['20', 'Remota · CD 20'],
			]);
			difficulty.setAttribute('aria-label', 'CD definida pelo Mestre');
			const selected = new Set((data.orientation?.recipientCharacterIds || []).filter(id =>
				data.recipients.some(person => person.id === id)));
			const grid = el('div', 'trainer-sheet-captain-players');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			for (const person of data.recipients) {
				const button = el('button', 'trainer-sheet-captain-player', person.name);
				button.type = 'button'; button.setAttribute('aria-pressed', String(selected.has(person.id)));
				button.addEventListener('click', () => {
					if (selected.has(person.id)) selected.delete(person.id);
					else if (selected.size < action.proficiency) selected.add(person.id);
					else {
						feedback.textContent = `Escolha até ${action.proficiency} aliados.`;
						feedback.classList.remove('hidden'); return;
					}
					button.setAttribute('aria-pressed', String(selected.has(person.id)));
					feedback.classList.add('hidden');
				});
				grid.append(button);
			}
			const save = el('button', 'trainer-sheet-talent-use', 'Orientar comunidade'); save.type = 'button';
			save.addEventListener('click', async () => {
				save.disabled = true;
				try {
					const result = await action.api('/trainer/talents/cosmopolitan-etiquette', { method: 'POST', body: {
						community: community.value.trim(), dc: Number(difficulty.value),
						recipientCharacterIds: [...selected],
					} });
					feedback.textContent = result.roll.success ?
						`Sucesso: +2 nas interações sociais pertinentes em ${community.value.trim()}.` :
						`Falha no teste (resultado ${result.roll.total}, CD ${difficulty.value}). Nenhum bônus concedido.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível orientar o grupo.';
					feedback.classList.remove('hidden');
				} finally { save.disabled = false; }
			});
			controls.append(community, difficulty, el('strong', '',
				`Aliados, além de você (até ${action.proficiency})`), grid, save, feedback);
			panel.append(controls);
		} else if (action?.captainPlan) {
			const controls = el('div', 'trainer-sheet-archive-editor trainer-sheet-captain-editor');
			controls.append(el('strong', '', `Participantes, incluindo você (até ${action.captainPlan.proficiency})`));
			const selected = new Set(action.captainPlan.plan?.recipientCharacterIds || []);
			const playerGrid = el('div', 'trainer-sheet-captain-players');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			for (const person of action.captainPlan.recipients) {
				const player = el('button', 'trainer-sheet-captain-player', person.name);
				player.type = 'button'; player.setAttribute('aria-pressed', String(selected.has(person.id)));
				player.addEventListener('click', () => {
					if (selected.has(person.id)) selected.delete(person.id);
					else if (selected.size < action.captainPlan.proficiency) selected.add(person.id);
					else {
						feedback.textContent = `Escolha até ${action.captainPlan.proficiency} aliados.`;
						feedback.classList.remove('hidden'); return;
					}
					player.setAttribute('aria-pressed', String(selected.has(person.id)));
					feedback.classList.add('hidden');
				});
				playerGrid.append(player);
			}
			controls.append(playerGrid);
			const save = el('button', 'trainer-sheet-talent-use', 'Confirmar bônus'); save.type = 'button';
			async function submit() {
				const ids = [...selected];
				if (!ids.length || ids.length > action.captainPlan.proficiency) {
					feedback.textContent = 'Escolha quem receberá o plano.';
					feedback.classList.remove('hidden'); return;
				}
				save.disabled = true;
				try {
					await action.api('/trainer/talents/team-captain', { method: 'POST', body: {
						recipientCharacterIds: ids,
					} });
					feedback.textContent = 'Plano preparado. Ele permanece até você preparar outro.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar o plano.';
					feedback.classList.remove('hidden'); save.disabled = false;
				}
			}
			save.addEventListener('click', submit);
			controls.append(save, feedback); panel.append(controls);
		} else if (action?.choreography) {
			const data = action.choreography;
			const kind = action.id === 'coreografo:ensaio-conjunto' ? 'rehearsal' :
				action.id === 'coreografo:formacao-em-dupla' || action.id === 'coreografo:formacao-em-trio' ?
					'formation' : action.id === 'coreografo:diretor-convidado' ? 'guest' :
					action.id === 'coreografo:tema-unificado' ? 'theme' :
					action.id === 'coreografo:preparacao-corporal-conjunta' ? 'warmup' :
					action.id === 'coreografo:conducao-de-evacuacao' ? 'evacuation' : 'instinct';
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const recipient = kind === 'guest' ? select([['', 'Escolha o treinador'],
				...data.recipients.map(person => [person.id, person.name])]) : null;
			const group = kind === 'warmup' || kind === 'evacuation';
			const count = kind === 'formation' ? (action.id.endsWith('trio') ? 3 : 2) :
				kind === 'guest' ? 3 : kind === 'theme' || group ? 0 : 1;
			const pokemonChoices = Array.from({ length: count }, () => select([['', 'Escolha o Pokémon']]));
			const fill = () => {
				const available = recipient ? data.recipients.find(person => person.id === recipient.value)?.pokemon || [] :
					data.pokemon.filter(pokemon => kind !== 'instinct' || pokemon.friendship >= 50);
				for (const choice of pokemonChoices) {
					choice.replaceChildren(...[['', 'Escolha o Pokémon'], ...available.map(pokemon => [pokemon.id, pokemon.name])]
						.map(([value, caption]) => {
							const option = document.createElement('option');
							option.value = value; option.textContent = caption; return option;
						}));
				}
			};
			if (recipient) { recipient.addEventListener('change', fill); editor.append(recipient); }
			fill();
			for (const choice of pokemonChoices) editor.append(choice);
			const tag = kind === 'theme' ? select([['', 'Escolha o tema'],
				...data.tags.map(value => [value, value])]) : null;
			if (tag) editor.append(tag);
			const selectedPeople = new Set();
			const activity = group ? el('input', 'trainer-sheet-progression-input') : null;
			if (activity) {
				activity.maxLength = 100; activity.placeholder = 'Atividade preparada';
				editor.append(activity);
				const people = el('div', 'trainer-sheet-captain-players');
				const limit = data.proficiency * (kind === 'evacuation' ? 2 : 1);
				for (const person of data.groupRecipients) {
					const choice = el('button', 'trainer-sheet-captain-player', person.name);
					choice.type = 'button'; choice.setAttribute('aria-pressed', 'false');
					choice.addEventListener('click', () => {
						if (selectedPeople.has(person.id)) selectedPeople.delete(person.id);
						else if (selectedPeople.size < limit) selectedPeople.add(person.id);
						choice.setAttribute('aria-pressed', String(selectedPeople.has(person.id)));
					});
					people.append(choice);
				}
				editor.append(el('p', '', `Escolha até ${limit} participantes`), people);
			}
			const status = data.prepared;
			if (kind === 'rehearsal' && status.rehearsals.length) editor.append(el('p', '',
				`${status.rehearsals.length} Pokémon com ensaio registrado; cada ensaio exige 1 hora.`));
			if (kind === 'formation' && status.formations.length) editor.append(el('p', '',
				`${status.formations.length} formação(ões) registrada(s).`));
			const use = el('button', 'trainer-sheet-talent-use', kind === 'rehearsal' ? 'Iniciar ensaio' :
				kind === 'formation' ? 'Ensaiar formação' : kind === 'guest' ? 'Dirigir participante' :
				kind === 'theme' ? 'Declarar tema' : kind === 'warmup' ? 'Preparar grupo' :
				kind === 'evacuation' ? 'Organizar evacuação' : 'Preparar entrosamento');
			use.type = 'button';
			use.addEventListener('click', async () => {
				const pokemonIds = pokemonChoices.map(choice => choice.value).filter(Boolean);
				if ((!group && kind !== 'theme' && (!pokemonIds.length || new Set(pokemonIds).size !== pokemonIds.length ||
					(kind !== 'guest' && pokemonIds.length !== count))) ||
					(kind === 'guest' && !recipient.value) || (kind === 'theme' && !tag.value) ||
					(group && (!selectedPeople.size || !activity.value.trim()))) {
					feedback.textContent = 'Complete as escolhas sem repetir Pokémon.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/choreography', { method: 'POST', body: {
						requestId: crypto.randomUUID(), kind, pokemonIds,
						characterId: recipient?.value || '', tag: tag?.value || '',
						recipientCharacterIds: [...selectedPeople], activity: activity?.value || '',
					} });
					feedback.textContent = `${outcome.result.names.join(', ') || 'Preparação'}: preparo registrado.` +
						(kind === 'rehearsal' || kind === 'formation' || kind === 'guest' ?
							' Aguarde o tempo de ensaio no relógio da campanha.' :
							' Utilize antes do próximo avanço de uma hora.');
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a coreografia.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			editor.append(use, feedback); panel.append(editor);
		} else if (action?.revigoratingMeal) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const difficulty = select([['10', 'CD 10 — cozinha equipada'],
				['15', 'CD 15 — cozinha improvisada'], ['20', 'CD 20 — ambiente desfavorável']]);
			difficulty.setAttribute('aria-label', 'Dificuldade da Refeição Revigorante');
			const selected = new Set();
			const people = el('div', 'trainer-sheet-captain-players');
			for (const person of action.revigoratingMeal.recipients) {
				const button = el('button', 'trainer-sheet-captain-player', person.name);
				button.type = 'button'; button.setAttribute('aria-pressed', 'false');
				button.addEventListener('click', () => {
					if (selected.has(person.id)) selected.delete(person.id); else selected.add(person.id);
					button.setAttribute('aria-pressed', String(selected.has(person.id)));
				});
				people.append(button);
			}
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar refeição'); use.type = 'button';
			use.disabled = !action.revigoratingMeal.available;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (!action.revigoratingMeal.available) editor.append(el('p', 'trainer-sheet-talent-unavailable',
				action.revigoratingMeal.usedThisRest ? 'Usado neste descanso longo.' :
				'Disponível após o próximo descanso longo.'));
			use.addEventListener('click', async () => {
				if (!selected.size) {
					feedback.textContent = 'Escolha ao menos um participante.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/revigorating-meal', { method: 'POST', body: {
						requestId: crypto.randomUUID(), dc: Number(difficulty.value),
						recipientCharacterIds: [...selected],
					} });
					feedback.textContent = outcome.result.success ?
						`Refeição preparada. A cura dos participantes foi registrada no chat.` :
						'O teste falhou; o resultado e o Alimento consumido foram registrados no chat.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a refeição.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(el('label', '', 'Condições do preparo'), difficulty,
				el('strong', '', 'Participantes'), people, use, feedback);
			panel.append(editor);
		} else if (action?.artisanRation) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const amount = select(Array.from({ length: Math.floor(action.artisanRation.availableFood / 3) }, (_, index) => {
				const foods = (index + 1) * 3;
				return [String(foods), `${foods} Alimentos → ${foods / 3 * 4} rações artesanais`];
			}));
			amount.setAttribute('aria-label', 'Quantidade de Alimentos para transformar');
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar ração artesanal');
			use.type = 'button'; use.disabled = !amount.options.length;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (!amount.options.length) editor.append(el('p', 'trainer-sheet-talent-unavailable',
				'São necessários pelo menos três Alimentos na Bag.'));
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/artisan-ration', { method: 'POST', body: {
						requestId: crypto.randomUUID(), foodQuantity: Number(amount.value),
					} });
					feedback.textContent = outcome.result.success ?
						`${outcome.result.produced} Rações Artesanais Pokémon criadas. A rolagem foi enviada ao chat.` :
						'A rolagem falhou. Nenhum Alimento foi consumido; o resultado foi enviado ao chat.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a ração.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(el('label', '', 'Quantidade de Alimentos'), amount, use, feedback);
			panel.append(editor);
		} else if (action?.contestHarmonization) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const trainer = select([['', 'Escolha o treinador'],
				...action.contestHarmonization.recipients.map(person => [person.id, person.name])]);
			const pokemonChoices = Array.from({ length: action.contestHarmonization.chef ? 3 : 1 },
				() => select([['', 'Escolha o Pokémon']]));
			trainer.addEventListener('change', () => {
				for (const pokemon of pokemonChoices) {
					pokemon.replaceChildren(...[['', 'Escolha o Pokémon'],
						...(action.contestHarmonization.recipients.find(person => person.id === trainer.value)?.pokemon || [])
							.filter(entry => !entry.prepared).map(entry => [entry.id, entry.name])]
						.map(([value, label]) => {
							const option = document.createElement('option');
							option.value = value; option.textContent = label; return option;
						}));
				}
			});
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar harmonização');
			use.type = 'button'; use.disabled = !action.contestHarmonization.availableFood;
			if (!action.contestHarmonization.availableFood) editor.append(el('p',
				'trainer-sheet-talent-unavailable', 'É necessário um Alimento na Bag.'));
			use.addEventListener('click', async () => {
				const pokemonIds = pokemonChoices.map(choice => choice.value).filter(Boolean);
				if (!trainer.value || !pokemonIds.length || new Set(pokemonIds).size !== pokemonIds.length) {
					feedback.textContent = 'Escolha um treinador e Pokémon diferentes da sua equipe.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/contest-harmonization', { method: 'POST', body: {
						requestId: crypto.randomUUID(), characterId: trainer.value, pokemonIds,
					} });
					feedback.textContent = `${outcome.result.names.join(', ')}: +3 pontos uma única vez ` +
						'quando todos participarem do próximo concurso. ' +
						'O efeito expira se o relógio da mesa avançar antes.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a harmonização.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(el('label', '', 'Treinador'), trainer);
			pokemonChoices.forEach((pokemon, index) => editor.append(el('label', '',
				index ? `Pokémon ${index + 1} (opcional)` : 'Pokémon'), pokemon));
			editor.append(use, feedback);
			panel.append(editor);
		} else if (action?.trainingReward) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const ration = select(action.trainingReward.rations.filter(entry => entry.quantity > 0)
				.map(entry => [entry.itemId, `${entry.itemId === 'racao-pokemon' ? 'Ração Pokémon' :
				'Ração Artesanal Pokémon'} (${entry.quantity})`]));
			const trainer = select([['', 'Escolha o treinador'],
				...action.trainingReward.recipients.map(person => [person.id, person.name])]);
			const pokemon = select([['', 'Escolha o Pokémon']]);
			trainer.addEventListener('change', () => {
				pokemon.replaceChildren(...[['', 'Escolha o Pokémon'],
					...(action.trainingReward.recipients.find(person => person.id === trainer.value)?.pokemon || [])
						.filter(entry => !entry.prepared).map(entry => [entry.id, entry.name])]
					.map(([value, label]) => {
						const option = document.createElement('option');
						option.value = value; option.textContent = label; return option;
					}));
			});
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar recompensa');
			use.type = 'button'; use.disabled = !ration.options.length;
			use.addEventListener('click', async () => {
				if (!trainer.value || !pokemon.value) {
					feedback.textContent = 'Escolha um treinador e seu Pokémon.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/training-reward', { method: 'POST', body: {
						requestId: crypto.randomUUID(), rationItemId: ration.value,
						characterId: trainer.value, pokemonId: pokemon.value,
					} });
					feedback.textContent = `${outcome.result.name} receberá 10% de redução no próximo treinamento. ` +
						'O benefício expira após o próximo descanso curto se não for usado.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a recompensa.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(el('label', '', 'Ração utilizada'), ration,
				el('label', '', 'Treinador'), trainer, el('label', '', 'Pokémon'), pokemon, use, feedback);
			panel.append(editor);
		} else if (action?.guardianEnrichment) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const chosen = new Map();
			const options = el('div', 'trainer-sheet-talent-choice-grid');
			for (const person of action.guardianEnrichment.recipients) {
				if (!person.pokemon.length) continue;
				options.append(el('strong', '', person.name));
				for (const entry of person.pokemon) {
					const key = `${person.id}:${entry.id}`;
					const choice = el('button', 'trainer-sheet-talent-use', entry.remainingMs > 0 ?
						`${entry.name} · disponível em ${Math.ceil(entry.remainingMs / 3_600_000)}h` : entry.name);
					choice.type = 'button'; choice.disabled = entry.remainingMs > 0;
					choice.addEventListener('click', () => {
						if (chosen.has(key)) { chosen.delete(key); choice.classList.remove('selected'); } else if (chosen.size < 6) {
							chosen.set(key, { characterId: person.id, pokemonId: entry.id });
							choice.classList.add('selected');
						}
						feedback.classList.add('hidden');
					});
					options.append(choice);
				}
			}
			const use = el('button', 'trainer-sheet-talent-use', 'Concluir rotina');
			use.type = 'button';
			use.disabled = action.guardianEnrichment.guardianRemainingMs > 0;
			if (use.disabled) feedback.textContent = `Disponível em ${Math.ceil(
				action.guardianEnrichment.guardianRemainingMs / 3_600_000)}h de campanha.`;
			if (use.disabled) feedback.classList.remove('hidden');
			use.addEventListener('click', async () => {
				if (!chosen.size) {
					feedback.textContent = 'Escolha de um a seis Pokémon.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/guardian-enrichment', { method: 'POST', body: {
						requestId: crypto.randomUUID(), pokemon: [...chosen.values()],
					} });
					feedback.textContent = `${outcome.result.pokemon.length} Pokémon receberam a Rotina de Enriquecimento.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível concluir a rotina.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.append(options, use, feedback); panel.append(editor);
		} else if (action?.enrichmentRoutine) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const trainer = select([['', 'Escolha o treinador'],
				...action.enrichmentRoutine.recipients.map(person => [person.id, person.name])]);
			const pokemon = select([['', 'Escolha o Pokémon']], 'trainer-sheet-enrichment-pokemon');
			const populatePokemon = () => {
				pokemon.replaceChildren();
				const placeholder = document.createElement('option');
				placeholder.value = ''; placeholder.textContent = 'Escolha o Pokémon';
				pokemon.append(placeholder);
				const entries = action.enrichmentRoutine.recipients.find(person => person.id === trainer.value)?.pokemon || [];
				for (const entry of entries) {
					const option = document.createElement('option');
					option.value = entry.id;
					option.disabled = entry.remainingMs > 0;
					option.textContent = entry.remainingMs > 0 ?
						`${entry.name} · disponível em ${Math.ceil(entry.remainingMs / 3_600_000)}h` : entry.name;
					pokemon.append(option);
				}
			};
			trainer.addEventListener('change', populatePokemon);
			const use = el('button', 'trainer-sheet-talent-use', 'Usar rotina');
			use.type = 'button';
			use.addEventListener('click', async () => {
				if (!trainer.value || !pokemon.value) {
					feedback.textContent = 'Escolha um treinador e um Pokémon disponível.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/enrichment-routine', { method: 'POST', body: {
						requestId: crypto.randomUUID(), characterId: trainer.value, pokemonId: pokemon.value,
					} });
					const selected = action.enrichmentRoutine.recipients.find(person => person.id === trainer.value)
						?.pokemon.find(entry => entry.id === pokemon.value);
					if (selected) selected.remainingMs = 2 * 86_400_000;
					populatePokemon();
					feedback.textContent = `${outcome.result.name} recebeu +${outcome.result.friendshipGained} de Amizade.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível realizar a rotina.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			editor.append(el('label', '', 'Treinador'), trainer, el('label', '', 'Pokémon'), pokemon, use, feedback);
			panel.append(editor);
		} else if (action?.impeccablePreparation) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const trainer = select([['', 'Escolha o treinador'],
				...action.impeccablePreparation.recipients.map(person => [person.id, person.name])]);
			const pokemon = select([['', 'Escolha o Pokémon']]);
			trainer.addEventListener('change', () => {
				pokemon.replaceChildren();
				const placeholder = document.createElement('option');
				placeholder.value = ''; placeholder.textContent = 'Escolha o Pokémon';
				pokemon.append(placeholder);
				const entries = action.impeccablePreparation.recipients
					.find(person => person.id === trainer.value)?.pokemon || [];
				for (const entry of entries) {
					const option = document.createElement('option');
					option.value = entry.id;
					option.textContent = entry.name + (entry.prepared ? ' · já preparado' : '');
					option.disabled = !!entry.prepared;
					pokemon.append(option);
				}
			});
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar Pokémon');
			use.type = 'button';
			use.addEventListener('click', async () => {
				if (!trainer.value || !pokemon.value) {
					feedback.textContent = 'Escolha um treinador e um Pokémon.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/impeccable-preparation', { method: 'POST', body: {
						requestId: crypto.randomUUID(), characterId: trainer.value, pokemonId: pokemon.value,
					} });
					feedback.textContent = `${outcome.result.name} receberá +2 pontos no primeiro concurso em que participar, ` +
						'desde que o relógio da mesa não avance antes.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar o Pokémon.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			editor.append(el('label', '', 'Treinador'), trainer, el('label', '', 'Pokémon'), pokemon, use, feedback);
			panel.append(editor);
		} else if (action?.friendshipSnacks) {
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('p', '', 'Uma Ração Pokémon rende até três petiscos oferecidos agora; porções não escolhidas não ficam guardadas.'));
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			const ration = select(action.friendshipSnacks.rations.filter(entry => entry.quantity > 0)
				.map(entry => [entry.itemId, `${entry.itemId === 'racao-pokemon' ? 'Ração Pokémon' :
				'Ração Artesanal Pokémon'} (${entry.quantity})`]));
			ration.setAttribute('aria-label', 'Ração utilizada nos petiscos');
			const rows = [];
			for (let index = 0; index < 3; index++) {
				const row = el('div', 'trainer-sheet-archive-row');
				const trainer = select([['', 'Escolha o treinador'],
					...action.friendshipSnacks.recipients.map(person => [person.id, person.name]),
					['other', 'Outro Pokémon (NPC ou selvagem)']]);
				const pokemon = select([['', 'Escolha o Pokémon']]);
				const other = el('input'); other.type = 'text'; other.placeholder = 'Nome do outro Pokémon';
				other.maxLength = 80; other.classList.add('hidden');
				trainer.addEventListener('change', () => {
					pokemon.replaceChildren(...(trainer.value && trainer.value !== 'other' ?
						[['', 'Escolha o Pokémon'], ...(action.friendshipSnacks.recipients.find(person =>
							person.id === trainer.value)?.pokemon || []).map(entry => [entry.id, entry.name])] :
						[['', 'Escolha o Pokémon']]).map(([value, label]) => {
						const option = document.createElement('option'); option.value = value;
						option.textContent = label; return option;
					}));
					pokemon.classList.toggle('hidden', trainer.value === 'other');
					other.classList.toggle('hidden', trainer.value !== 'other');
				});
				row.append(el('strong', '', `${index + 1}º petisco`), trainer, pokemon, other);
				editor.append(row); rows.push({ trainer, pokemon, other });
			}
			const use = el('button', 'trainer-sheet-talent-use', 'Preparar e oferecer petiscos');
			use.type = 'button'; use.disabled = !ration.options.length;
			if (!ration.options.length) editor.append(el('p', 'trainer-sheet-talent-unavailable',
				'É necessária uma Ração Pokémon na Bag.'));
			use.addEventListener('click', async () => {
				const servings = rows.filter(row => row.trainer.value).map(row => row.trainer.value === 'other' ?
					{ otherPokemon: row.other.value.trim() } :
					{ characterId: row.trainer.value, pokemonId: row.pokemon.value });
				if (!servings.length || servings.some(entry => !entry.otherPokemon && !entry.pokemonId)) {
					feedback.textContent = 'Escolha de um a três Pokémon para receber os petiscos.';
					feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/friendship-snack', { method: 'POST', body: {
						requestId: crypto.randomUUID(), rationItemId: ration.value, servings,
					} });
					feedback.textContent = outcome.result.served.map(entry => `${entry.name}: ` +
						(entry.friendshipGained === null ? 'oferecido; efeito narrado pelo Mestre' :
						`+${entry.friendshipGained} de amizade`)).join(' · ');
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar os petiscos.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			editor.prepend(el('label', '', 'Ração utilizada'), ration);
			editor.append(use, feedback); panel.append(editor);
		} else if (action?.comfortingArt) {
			const controls = el('div', 'trainer-sheet-archive-editor');
			const artUses = action.comfortingArtUses || { limit: 0, recipientIds: [] };
			controls.append(el('p', 'trainer-sheet-manual-rest-status',
				`${artUses.recipientIds.length} / ${artUses.limit} participantes atendidos neste descanso.`));
			const recipient = select([['', 'Participante'], ...action.comfortingArt.map(person =>
				[person.id, artUses.recipientIds.includes(person.id) ? `${person.name} (já recebeu)` : person.name])]);
			recipient.setAttribute('aria-label', 'Participante da Arte Reconfortante');
			const effect = select([['will', '+2 no próximo teste de Vontade contra medo'],
				['exhaustion', 'Reduzir 1 de Exaustão']]);
			effect.setAttribute('aria-label', 'Benefício da Arte Reconfortante');
			const use = el('button', 'trainer-sheet-talent-use', 'Aplicar benefício');
			use.type = 'button'; use.disabled = artUses.recipientIds.length >= artUses.limit;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				if (!recipient.value) {
					feedback.textContent = 'Escolha um participante.'; feedback.classList.remove('hidden'); return;
				}
				use.disabled = true;
				try {
					await action.api('/trainer/talents/comforting-art', { method: 'POST', body: {
						recipientCharacterId: recipient.value, effect: effect.value,
					} });
					feedback.textContent = 'Benefício aplicado ao participante.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível aplicar Arte Reconfortante.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			controls.append(recipient, effect, use, feedback); panel.append(controls);
		} else if (action?.archive) {
			panel.classList.add('trainer-sheet-talent-popover--archive');
			const archives = action.archive.slots || [];
			const editor = el('div', 'trainer-sheet-archive-editor');
			editor.append(el('strong', '', `Referências preparadas (${archives.length}/${action.archive.proficiency})`));
			for (let slot = 0; slot < action.archive.proficiency; slot++) {
				const prepared = archives.find(entry => entry.slot === slot);
				const row = el('div', 'trainer-sheet-archive-row');
				const topic = el('input'); topic.type = 'text'; topic.maxLength = 120;
				topic.placeholder = 'Tema da referência'; topic.value = prepared?.topic || '';
				topic.setAttribute('aria-label', `Tema do acervo ${slot + 1}`);
				const knowledge = select([['', 'Conhecimento'], ...action.archive.knowledge.map(id =>
					[id, skillLabel(id)])]);
				knowledge.value = prepared?.knowledge || '';
				knowledge.setAttribute('aria-label', `Conhecimento do acervo ${slot + 1}`);
				const recipient = select([['', 'Destinatário'], ...action.archive.recipients.map(person =>
					[person.id, person.name])]);
				recipient.value = prepared?.recipientCharacterId || '';
				recipient.setAttribute('aria-label', `Destinatário do acervo ${slot + 1}`);
				const controls = el('div', 'trainer-sheet-archive-controls');
				const save = el('button', 'trainer-sheet-talent-use', prepared ? 'Atualizar' : 'Preparar');
				save.type = 'button';
				const remove = el('button', 'trainer-sheet-archive-remove', 'Remover');
				remove.type = 'button'; remove.classList.toggle('hidden', !prepared);
				const feedback = el('p', 'trainer-sheet-roll-error hidden');
				async function submit(clear) {
					save.disabled = true; remove.disabled = true;
					try {
						await action.api('/trainer/talents/shared-archive', { method: 'POST', body: {
							slot, ...(clear ? { clear: true } : { topic: topic.value,
								knowledge: knowledge.value, recipientCharacterId: recipient.value }),
						} });
						close();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
						await action.refresh();
					} catch (error) {
						feedback.textContent = error.message || 'Não foi possível preparar o acervo.';
						feedback.classList.remove('hidden'); save.disabled = false; remove.disabled = false;
					}
				}
				save.addEventListener('click', () => submit(false));
				remove.addEventListener('click', () => submit(true));
				row.append(topic, knowledge, recipient);
				controls.append(save, remove); row.append(controls, feedback); editor.append(row);
			}
			panel.append(editor);
		} else if (action?.trapmaker || action?.combinedTrap || action?.trapLabyrinth) {
			const combined = !!action.combinedTrap;
			const labyrinth = !!action.trapLabyrinth;
			const talentName = labyrinth ? 'Labirinto de Gatilhos' : combined ? 'Armadilha Combinada' : 'Armadilheiro';
			const use = el('button', 'trainer-sheet-talent-use', `Usar ${talentName}`);
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const result = await action.api(labyrinth ? '/trainer/talents/trap-labyrinth' :
						combined ? '/trainer/talents/combined-trap' :
						'/trainer/talents/trapmaker', { method: 'POST' });
					feedback.textContent = `Carga consumida. Restam ${result.chargesRemaining} carga(s) no kit.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || `Não foi possível usar ${talentName}.`;
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.ecologicalBait) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Isca Ecológica');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					await action.api('/trainer/talents/ecological-bait', { method: 'POST' });
					feedback.textContent = 'Isca preparada. Uma Ração Pokémon foi consumida.';
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível preparar a isca.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.socialDisguise) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Disfarce Social');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const result = await action.api('/trainer/talents/social-disguise', { method: 'POST' });
					feedback.textContent = `Disfarce preparado. Cargas restantes no kit: ${result.chargesRemaining}.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível usar Disfarce Social.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.preparedPersona) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Persona Preparada');
			use.type = 'button';
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const result = await action.api('/trainer/talents/prepared-persona', { method: 'POST' });
					feedback.textContent = `Persona preparada. Cargas restantes no kit: ${result.chargesRemaining}.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível usar Persona Preparada.';
					feedback.classList.remove('hidden');
				} finally { use.disabled = false; }
			});
			panel.append(use, feedback);
		} else if (action?.thirdEye) {
			const use = el('button', 'trainer-sheet-talent-use', 'Usar Terceiro Olho');
			use.type = 'button';
			use.disabled = action.thirdEye.exhaustion > 0 || !action.thirdEye.conscious;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (action.thirdEye.exhaustion > 0) panel.append(el('p', 'trainer-sheet-talent-unavailable',
				'Terceiro Olho fica indisponível enquanto houver Exaustão.'));
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const outcome = await action.api('/trainer/talents/use', { method: 'POST',
						body: { talentId: action.id } });
					feedback.textContent = `Transe iniciado. Exaustão: ${outcome.exhaustion}.`;
					feedback.classList.remove('hidden');
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível usar Terceiro Olho.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			panel.append(use, feedback);
		} else if (action && !action.supportCacheCreate) {
			const unavailable = action.reroll && !action.available;
			const use = el('button', 'trainer-sheet-talent-use', action.used ? 'Usado neste descanso' : 'Usar');
			use.type = 'button'; use.disabled = action.used || unavailable;
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			if (unavailable && !action.used) {
				panel.append(el('p', 'trainer-sheet-talent-unavailable',
					'Nenhuma rolagem elegível desde o último avanço do relógio da campanha.'));
			}
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					const outcome = await action.api(action.reroll ? '/trainer/talents/reroll' :
						'/trainer/talents/use', { method: 'POST',
						body: { talentId: action.id } });
					feedback.textContent = action.reroll ? action.id === 'esforco-heroico' ?
						`A falha virou sucesso no chat. Exaustão: ${outcome.exhaustion}.` :
						'A rolagem original foi atualizada no chat.' :
						`Recuperou ${outcome.recovered} PV (d6: ${outcome.die}).`;
					feedback.classList.remove('hidden');
					use.textContent = 'Usado neste descanso';
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
					await action.refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível usar o talento.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			panel.append(use, feedback);
		}
		if (action?.supportCacheCreate) {
			const location = el('input', 'trainer-sheet-support-cache-location');
			location.type = 'text'; location.maxLength = 160;
			location.placeholder = 'Onde fica o Ponto de Apoio?';
			location.setAttribute('aria-label', 'Local do Ponto de Apoio');
			const use = el('button', 'trainer-sheet-talent-use', 'Usar');
			use.type = 'button'; use.disabled = action.supportCacheCount >= action.supportCacheLimit;
			const remove = el('button', 'trainer-sheet-talent-use trainer-sheet-support-cache-delete', 'Excluir');
			remove.type = 'button'; remove.disabled = action.supportCacheCount === 0;
			const choices = el('div', 'trainer-sheet-support-cache-delete-list');
			const feedback = el('p', 'trainer-sheet-roll-error hidden');
			panel.append(el('p', '', `Pontos de Apoio: ${action.supportCacheCount} / ${action.supportCacheLimit}`),
				location, use, remove, choices, feedback);
			use.addEventListener('click', async () => {
				use.disabled = true;
				try {
					await action.api('/trainer/support-cache', {
						method: 'POST', body: { action: 'create', location: location.value },
					});
					close();
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível criar o Ponto de Apoio.';
					feedback.classList.remove('hidden'); use.disabled = false;
				}
			});
			remove.addEventListener('click', async () => {
				choices.replaceChildren();
				feedback.classList.add('hidden');
				remove.disabled = true;
				try {
					const caches = (await action.api('/trainer/support-caches')).filter(cache =>
						cache.ownerCharacterId === action.supportCacheOwnerId);
					if (!panel.isConnected) return;
					if (!caches.length) {
						choices.append(el('p', '', 'Nenhum Ponto de Apoio para excluir.'));
						return;
					}
					choices.append(el('strong', '', 'Escolha o Ponto de Apoio:'));
					for (const cache of caches) {
						const option = el('button', 'trainer-sheet-support-cache-choice', cache.location);
						option.type = 'button';
						option.addEventListener('click', async () => {
							option.disabled = true;
							feedback.classList.add('hidden');
							try {
								const detail = await action.api('/trainer/support-cache?cacheId=' +
									encodeURIComponent(cache.cacheId));
								if (!panel.isConnected) return;
								const deleteSelected = async confirmContents => {
									await action.api('/trainer/support-cache', { method: 'POST', body: {
										action: 'delete', cacheId: cache.cacheId,
										expectedRevision: detail.revision, confirmContents,
									} });
									close();
									window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
										{ detail: { tableId: selectedTable } }));
								};
								if (!detail.items.length) {
									await deleteSelected(false);
									return;
								}
								choices.replaceChildren(el('p', '',
									`Este Ponto de Apoio contém itens. Excluir ${cache.location} descartará permanentemente todo o conteúdo.`));
								const cancel = el('button', 'trainer-sheet-support-cache-choice', 'Cancelar');
								cancel.type = 'button';
								cancel.addEventListener('click', () => { choices.replaceChildren(); remove.disabled = false; });
								const confirm = el('button', 'trainer-sheet-support-cache-choice danger', 'Excluir Ponto de Apoio e itens');
								confirm.type = 'button';
								confirm.addEventListener('click', async () => {
									confirm.disabled = true;
									try { await deleteSelected(true); } catch (error) {
										feedback.textContent = error.message || 'Não foi possível excluir o Ponto de Apoio.';
										feedback.classList.remove('hidden'); confirm.disabled = false;
									}
								});
								choices.append(cancel, confirm);
							} catch (error) {
								feedback.textContent = error.message || 'Não foi possível excluir o Ponto de Apoio.';
								feedback.classList.remove('hidden'); option.disabled = false;
							}
						});
						choices.append(option);
					}
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível listar os Pontos de Apoio.';
					feedback.classList.remove('hidden');
				} finally { if (panel.isConnected) remove.disabled = false; }
			});
		}
		document.body.append(panel);
		const rect = button.getBoundingClientRect();
		panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12))}px`;
		panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 12))}px`;
		button.setAttribute('aria-expanded', 'true');
		function close() {
			if (recordPicker) recordPicker.close();
			panel.remove(); button.setAttribute('aria-expanded', 'false');
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
			window.removeEventListener('resize', close);
			if (closeTalentPopover === close) closeTalentPopover = null;
		}
		close.preserveOnRefresh = !!(action?.pokemonPharmacy || action?.advancedPharmacy || action?.masterPharmacy ||
			action?.persistentHypothesis !== undefined);
		close.preserveCharacterId = action?.pokemonPharmacy || action?.advancedPharmacy || action?.masterPharmacy ||
			action?.persistentHypothesisCharacterId || null;
		function outside(event) {
			if (recordPicker?.overlay.contains(event.target)) return;
			if (!panel.contains(event.target) && !button.contains(event.target)) close();
		}
		function escape(event) {
			if (event.key !== 'Escape') return;
			event.stopPropagation();
			if (recordPicker) recordPicker.close();
			else { close(); button.focus(); }
		}
		closeTalentPopover = close;
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		window.addEventListener('resize', close);
	}

	function section(title, className = '') {
		const node = el('section', 'trainer-sheet-section ' + className);
		node.append(el('h2', '', title));
		return node;
	}
	function empty(text) { return el('p', 'trainer-sheet-empty', text); }
	function select(options, className = '') {
		const control = el('select', className);
		for (const [value, name] of options) {
			const option = el('option', '', name); option.value = String(value); control.append(option);
		}
		return control;
	}
	function showMasterSurvivalEditor(character, sheet, rules, api, refresh) {
		if (closeSkillPopover) closeSkillPopover();
		if (closeAttributePopover) closeAttributePopover();
		if (closeTalentPopover) closeTalentPopover();
		const overlay = el('div', 'trainer-sheet-master-vitals-overlay');
		const dialog = el('section', 'trainer-sheet-panel trainer-sheet-master-vitals-dialog');
		dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', 'Alterar condições do treinador');
		const heading = el('h2', '', 'Condições e exaustão');
		const closeButton = el('button', 'trainer-sheet-master-vitals-close', '×');
		closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Fechar');
		const header = el('div', 'trainer-sheet-master-vitals-header');
		header.append(heading, closeButton); dialog.append(header);
		const feedback = el('p', 'trainer-sheet-progression-feedback');
		const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
		const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
		closeButton.addEventListener('click', close);
		overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
		let busy = false;
		const apply = async action => {
			if (busy) return;
			busy = true; feedback.textContent = '';
			try {
				await api('/trainer/survival', { method: 'POST', body: { characterId: character.id, action } });
				close();
				await refresh();
				window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
					{ detail: { tableId: selectedTable } }));
			} catch (error) {
				feedback.textContent = error.message || 'Não foi possível alterar a ficha.';
				busy = false;
			}
		};
		if (sheet.survival?.lifeState === 'dead') {
			const restore = el('button', 'button trainer-sheet-danger', 'Retirar estado Morto');
			restore.type = 'button';
			let confirmed = false;
			restore.addEventListener('click', () => {
				if (!confirmed) {
					confirmed = true;
					restore.textContent = 'Confirmar: restaurar com 1 PV';
					return;
				}
				void apply({ type: 'restore-life' });
			});
			dialog.append(el('p', '', 'O Mestre pode restaurar este treinador com 1 PV.'), restore);
		}
		{
			const state = sheet.survival || {};
			dialog.append(el('p', '', `Exaustão atual: ${state.exhaustion || 0} / 6`));
			const levels = el('input', 'trainer-sheet-progression-input');
			levels.type = 'number'; levels.min = '1'; levels.max = '6'; levels.step = '1';
			levels.value = '1'; levels.setAttribute('aria-label', 'Níveis de exaustão');
			const add = el('button', 'button', 'Dar Exaustão'); add.type = 'button';
			const reduce = el('button', 'button', 'Reduzir Exaustão'); reduce.type = 'button';
			let confirmFatalExhaustion = false;
			levels.addEventListener('input', () => {
				confirmFatalExhaustion = false;
				add.textContent = 'Dar Exaustão'; add.classList.remove('trainer-sheet-danger');
			});
			const change = type => {
				const value = Number(levels.value);
				if (!Number.isSafeInteger(value) || value < 1 || value > 6) {
					feedback.textContent = 'Informe de 1 a 6 níveis de Exaustão.'; return;
				}
				if (type === 'exhaustion' && (state.exhaustion || 0) + value >= 6 && !confirmFatalExhaustion) {
					confirmFatalExhaustion = true;
					add.textContent = 'Confirmar Exaustão fatal'; add.classList.add('trainer-sheet-danger');
					return;
				}
				void apply({ type, levels: value });
			};
			add.addEventListener('click', () => change('exhaustion'));
			reduce.addEventListener('click', () => change('exhaustion-reduce'));
			const exhaustion = el('div', 'trainer-sheet-master-vitals-actions');
			exhaustion.append(levels, add, reduce);
			dialog.append(exhaustion, el('small', 'trainer-sheet-master-vitals-note',
				'No 6º nível de Exaustão, o treinador morre.'));
			const active = state.conditions || [];
			const available = (rules?.conditions || []).filter(id => !active.some(entry => entry.id === id));
			const condition = select([['', 'Escolha uma condição negativa'],
				...available.map(id => [id, label(id)])]);
			condition.setAttribute('aria-label', 'Condição negativa');
			const source = el('input', 'trainer-sheet-progression-input');
			source.maxLength = 200; source.placeholder = 'Origem da condição (opcional)';
			const addCondition = el('button', 'button', 'Aplicar condição');
			addCondition.type = 'button'; addCondition.disabled = !available.length;
			addCondition.addEventListener('click', () => {
				if (!condition.value) { feedback.textContent = 'Escolha uma condição negativa.'; return; }
				void apply({ type: 'condition-add', condition: {
					id: condition.value, source: source.value.trim() || 'Mestre',
				} });
			});
			const conditionRow = el('div', 'trainer-sheet-master-vitals-actions');
			conditionRow.append(condition, source, addCondition);
			dialog.append(el('h3', '', 'Aplicar condição'), conditionRow);
			if (active.length) {
				const current = el('div', 'trainer-sheet-master-vitals-conditions');
				for (const entry of active) {
					const remove = el('button', 'button', `Remover ${label(entry.id)}`);
					remove.type = 'button';
					remove.addEventListener('click', () => void apply({ type: 'condition-remove', conditionId: entry.id }));
					current.append(remove);
				}
				dialog.append(el('h3', '', 'Condições ativas'), current);
			}
		}
		dialog.append(feedback); overlay.append(dialog); document.body.append(overlay);
		document.addEventListener('keydown', onKey); closeButton.focus();
	}
	function skillDomainOptions(domains, family) {
		return (domains?.[family] || []).map(id => [id, SKILL_DOMAINS[id] || label(id)]);
	}
	function skillPicker(available, domains, selected = '', onChange = () => {}) {
		const box = el('div', 'trainer-sheet-skill-picker');
		const family = selected.split(':')[0];
		const choices = [['', 'Selecione uma perícia'], ...Object.entries(SKILLS)
			.filter(([id]) => !available.includes(id))
			.map(([id, name]) => [id, name])];
		const category = select(choices);
		category.value = family;
		const domain = select([['', 'Escolha uma área']], 'trainer-sheet-skill-domain');
		const vehicle = select([['', 'Categoria de veículo'],
			...skillDomainOptions(domains, 'pilotagem')], 'trainer-sheet-skill-domain');
		function update(preferred = '') {
			const special = ['conhecimento', 'oficio'].includes(category.value);
			domain.classList.toggle('hidden', !special);
			vehicle.classList.toggle('hidden', category.value !== 'pilotagem');
			if (special) {
				const current = preferred || domain.value;
				const options = skillDomainOptions(domains, category.value);
				domain.replaceChildren();
				for (const [id, name] of [['', 'Escolha uma área'], ...options]) {
					const option = el('option', '', name); option.value = id; domain.append(option);
				}
				domain.value = options.some(([id]) => id === current) ? current : '';
			}
		}
		category.addEventListener('change', () => { update(); onChange(); });
		domain.addEventListener('change', onChange);
		vehicle.addEventListener('change', onChange);
		if (selected.includes(':')) {
			if (family === 'pilotagem') vehicle.value = selected.split(':')[1];
		}
		update(selected.includes(':') ? selected.split(':')[1] : '');
		box.append(category, domain, vehicle);
		function value() {
			if (!category.value) return '';
			if (category.value === 'pilotagem') return vehicle.value ? 'pilotagem:' + vehicle.value : '';
			if (['conhecimento', 'oficio'].includes(category.value)) {
				return domain.value ? category.value + ':' + domain.value : '';
			}
			return category.value;
		}
		return { box, value, updateAvailability(taken) {
			for (const option of category.options) {
				if (!option.value) continue;
				const branches = domains?.[option.value];
				option.disabled = branches ? branches.every(id => taken.has(option.value + ':' + id)) :
					taken.has(option.value);
			}
			if (category.selectedOptions[0]?.disabled) { category.value = ''; update(); }
			for (const option of domain.options) {
				if (option.value) option.disabled = taken.has(category.value + ':' + option.value);
			}
			if (domain.selectedOptions[0]?.disabled) domain.value = '';
			for (const option of vehicle.options) {
				if (option.value) option.disabled = taken.has('pilotagem:' + option.value);
			}
			if (vehicle.selectedOptions[0]?.disabled) vehicle.value = '';
		} };
	}
	function syncSkillAvailability(fixed, controls) {
		for (const [index, picker] of controls.entries()) {
			const taken = new Set([...fixed, ...controls.filter((_, other) => other !== index)
				.map(control => control.value()).filter(Boolean)]);
			picker.updateAvailability(taken);
		}
	}
	function trainerAttributeRollView(initialProgress) {
		const box = el('div', 'trainer-sheet-roll-view hidden');
		const diceRow = el('div', 'trainer-sheet-roll-dice');
		const dice = Array.from({ length: 4 }, () => el('span', 'trainer-sheet-roll-die', '–'));
		diceRow.append(...dice);
		const scores = el('div', 'trainer-sheet-roll-scores');
		const slots = Array.from({ length: 6 }, (_, index) => {
			const slot = el('span', 'trainer-sheet-roll-score', '--');
			scores.append(slot);
			if (index < 5) scores.append(el('b', 'trainer-sheet-roll-separator', '·'));
			return slot;
		});
		const status = el('p', 'trainer-sheet-roll-status');
		status.setAttribute('role', 'status');
		box.append(diceRow, scores, status);
		const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
		let currentValues = [...(initialProgress?.values || [])];
		let pendingTimer = null;
		function showProgress(values) {
			currentValues = [...values];
			box.classList.remove('hidden');
			slots.forEach((slot, index) => {
				slot.textContent = values[index] === undefined ? '--' : String(values[index]);
				slot.classList.toggle('complete', values[index] !== undefined);
			});
		}
		if (initialProgress?.values?.length) {
			showProgress(initialProgress.values);
			status.textContent = initialProgress.values.length === 6 ?
				'A série ficou abaixo do mínimo. Role uma nova série.' :
				`Role o ${initialProgress.values.length + 1}º valor.`;
		}
		return { box,
			prepare() {
				if (pendingTimer) clearInterval(pendingTimer);
				showProgress(currentValues.length === 6 ? [] : currentValues);
				dice.forEach(die => { die.textContent = '–'; die.classList.remove('discarded'); });
				status.textContent = 'Rolando os quatro dados...';
				pendingTimer = setInterval(() => {
					for (const die of dice) die.textContent = String(1 + Math.floor(Math.random() * 6));
				}, 55);
			},
			cancel() { if (pendingTimer) clearInterval(pendingTimer); pendingTimer = null; },
			async animate(result) {
				if (pendingTimer) clearInterval(pendingTimer);
				pendingTimer = null;
				if (!Array.isArray(result.dice) || result.dice.length !== 4 ||
					!Array.isArray(result.values) || result.index < 1 || result.index > 6) {
					throw new Error('Resultado da rolagem inválido');
				}
				if (result.index === 1) showProgress([]);
				const running = new Set([0, 1, 2, 3]);
				const timer = setInterval(() => {
					for (const position of running) dice[position].textContent = String(1 + Math.floor(Math.random() * 6));
				}, 55);
				try {
					for (let position = 0; position < 4; position++) {
						await wait(210);
						running.delete(position);
						dice[position].textContent = String(result.dice[position]);
					}
				} finally { clearInterval(timer); }
				dice[result.dice.indexOf(Math.min(...result.dice))].classList.add('discarded');
				await wait(180);
				showProgress(result.values);
				status.textContent = result.valid === true ? 'Série válida! Distribua os valores entre os atributos.' :
					result.valid === false ? 'A série ficou abaixo do mínimo. Role uma nova série.' :
					`Valor ${result.index} de 6. Clique para rolar o próximo.`;
			},
		};
	}
	function trainerAttributeAssignment(values, onChange) {
		const grid = el('div', 'trainer-sheet-creation-attributes');
		const pool = el('div', 'trainer-sheet-attribute-pool');
		const controls = new Map();
		const assignments = new Map();
		const buttons = new Map();
		const chips = (values || []).map((value, index) => {
			const chip = el('span', 'trainer-sheet-attribute-pool-value', value);
			pool.append(chip);
			if (index < values.length - 1) pool.append(el('b', '', '·'));
			return chip;
		});
		function update() {
			const used = new Set(assignments.values());
			chips.forEach((chip, index) => chip.classList.toggle('used', used.has(index)));
			for (const [id, button] of buttons) {
				const slot = assignments.get(id);
				button.textContent = slot === undefined ? '' : String(values[slot]);
				button.classList.toggle('chosen', slot !== undefined);
			}
		}
		function open(button, id, name) {
			if (closeCreationAttributePicker) closeCreationAttributePicker();
			const panel = el('div', 'trainer-sheet-attribute-options');
			panel.append(el('strong', '', `Valor para ${name}`));
			for (const [slot, value] of values.entries()) {
				const option = el('button', 'trainer-sheet-attribute-option', value);
				option.type = 'button';
				option.disabled = [...assignments].some(([other, selected]) => other !== id && selected === slot);
				option.setAttribute('aria-label', `Valor ${value}, opção ${slot + 1}`);
				option.addEventListener('click', () => {
					assignments.set(id, slot); update(); close(); onChange();
				});
				panel.append(option);
			}
			if (assignments.has(id)) {
				const clear = el('button', 'trainer-sheet-attribute-option clear', 'Limpar'); clear.type = 'button';
				clear.addEventListener('click', () => { assignments.delete(id); update(); close(); onChange(); });
				panel.append(clear);
			}
			document.body.append(panel);
			const rect = button.getBoundingClientRect();
			const width = Math.min(210, window.innerWidth - 24);
			panel.style.width = `${width}px`;
			panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
			panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 12))}px`;
			button.setAttribute('aria-expanded', 'true');
			function close() {
				panel.remove(); button.setAttribute('aria-expanded', 'false');
				document.removeEventListener('pointerdown', outside);
				document.removeEventListener('keydown', escape);
				window.removeEventListener('scroll', close, true);
				window.removeEventListener('resize', close);
				if (closeCreationAttributePicker === close) closeCreationAttributePicker = null;
			}
			function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
			function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } }
			closeCreationAttributePicker = close;
			document.addEventListener('pointerdown', outside);
			document.addEventListener('keydown', escape);
			window.addEventListener('scroll', close, true);
			window.addEventListener('resize', close);
		}
		for (const [id, name] of ATTRIBUTES) {
			const field = el('div', 'trainer-sheet-creation-field trainer-sheet-attribute-field');
			const button = el('button', 'trainer-sheet-attribute-choice'); button.type = 'button';
			button.disabled = !values;
			button.setAttribute('aria-label', `Escolher valor de ${name}`);
			button.setAttribute('aria-expanded', 'false');
			button.addEventListener('click', () => open(button, id, name));
			field.append(el('span', '', name), button); grid.append(field); buttons.set(id, button);
			controls.set(id, { get value() { const slot = assignments.get(id); return slot === undefined ? '' : String(slot); } });
		}
		return { grid, pool, controls };
	}
	let creationWizardBack = null;
	async function mountCreationWizard(root, api, onComplete) {
		creationWizardBack = null;
		const state = { step: 0 };
		async function load() {
			try {
				const creation = await api('/trainer/creation');
				renderCreationWizard(root, creation, api, load, onComplete, state);
			} catch (error) {
				root.replaceChildren(empty(error.message || 'Não foi possível carregar a criação da ficha.'));
				const retry = el('button', 'button', 'Tentar novamente');
				retry.type = 'button'; retry.addEventListener('click', () => void load()); root.append(retry);
			}
		}
		await load();
	}
	function backCreationWizard() { return creationWizardBack?.() || false; }
	function renderCreationWizard(root, creation, api, refresh, onComplete, state, inPage = false) {
		if (closeCreationAttributePicker) closeCreationAttributePicker();
		root.replaceChildren();
		const method = creation.method;
		const values = creation.sheet.creation?.rolls || (method === 'standard' ? creation.standardValues : null);
		const form = el('form', 'trainer-sheet-creation trainer-sheet-creation-wizard' +
			(inPage ? ' trainer-sheet-inpage-wizard' : ''));
		form.noValidate = true;
		const progress = el('ol', 'trainer-sheet-wizard-progress');
		const titles = ['Método', 'Atributos', 'Classe', 'Perícias', 'Equipamento', 'Revisão'];
		for (const title of titles) progress.append(el('li', '', title));
		form.append(progress);
		const blocks = titles.map((title, index) => {
			const block = el('section', 'trainer-sheet-creation-block trainer-sheet-wizard-step');
			block.append(el('h2', '', `${index + 1}. ${title}`));
			form.append(block); return block;
		});
		const errors = blocks.map(block => {
			const error = el('p', 'trainer-sheet-error hidden'); error.setAttribute('role', 'alert');
			block.append(error); return error;
		});
		blocks[2].classList.add('trainer-sheet-class-step');
		function showError(index, message) {
			errors[index].textContent = message;
			errors[index].classList.toggle('hidden', !message);
		}
		const methodSelect = select([['', 'Escolha o método'], ['standard', 'Valores base'], ['rolled', 'Valores rolados']]);
		methodSelect.value = method || '';
		methodSelect.disabled = !!(creation.sheet.creation?.rolls?.length || creation.sheet.creation?.rollProgress?.dice.length);
		blocks[0].insertBefore(methodSelect, errors[0]);
		const methodHint = el('p', 'trainer-sheet-method-hint');
		function updateMethodHint() {
			methodHint.textContent = methodSelect.value === 'standard' ?
				`Seus valores são ${creation.standardValues.join(' · ')}. Distribua-os livremente entre os seis atributos.` :
				methodSelect.value === 'rolled' ?
					(creation.sheet.creation?.rolls?.length ?
						`Seus valores rolados são ${creation.sheet.creation.rolls.join(' · ')}. Distribua-os livremente entre os seis atributos.` :
						'Role 4d6 seis vezes, descartando o menor dado de cada rolagem. Distribua os resultados livremente. A primeira série válida será definitiva.') : '';
		}
		methodSelect.addEventListener('change', updateMethodHint);
		updateMethodHint();
		blocks[0].insertBefore(methodHint, errors[0]);
		blocks[1].insertBefore(el('p', '', method === 'rolled' ?
			'Distribua os valores da primeira rolagem. Eles não poderão ser rolados novamente.' :
			'Distribua os seis valores base, usando cada um uma vez.'), errors[1]);
		if (method === 'rolled' && !values) {
			const rollProgress = creation.sheet.creation?.rollProgress;
			const roll = el('button', 'button', rollProgress?.values.length === 6 ? 'Rolar nova série' :
				`Rolar ${rollProgress?.values.length ? `${rollProgress.values.length + 1}º valor` : '1º valor'}`);
			roll.type = 'button';
			const rollView = trainerAttributeRollView(rollProgress);
			roll.addEventListener('click', async () => {
				roll.disabled = true; showError(1, '');
				rollView.prepare();
				try {
					const result = await api('/trainer/roll', { method: 'POST' });
					await rollView.animate(result);
					if (result.valid === true) { await new Promise(resolve => setTimeout(resolve, 750)); await refresh(); } else {
						roll.textContent = result.valid === false ? 'Rolar nova série' : `Rolar ${result.index + 1}º valor`;
						roll.disabled = false;
					}
				} catch (cause) {
					rollView.cancel();
					showError(1, cause.message || 'Não foi possível rolar os atributos.'); roll.disabled = false;
				}
			});
			blocks[1].insertBefore(roll, errors[1]);
			blocks[1].insertBefore(rollView.box, errors[1]);
		}
		const assignment = trainerAttributeAssignment(values, () => { showError(1, ''); updateChoices(); });
		const attrInputs = assignment.controls;
		if (values) blocks[1].insertBefore(assignment.pool, errors[1]);
		blocks[1].insertBefore(assignment.grid, errors[1]);
		const classSelect = el('input');
		classSelect.type = 'hidden';
		classSelect.name = 'trainerClass';
		const classGrid = el('div', 'trainer-sheet-class-grid');
		classGrid.setAttribute('aria-label', 'Escolha uma classe do treinador');
		for (const rule of Object.values(creation.classes)) {
			const card = el('button', 'trainer-sheet-class-card');
			card.type = 'button';
			card.setAttribute('aria-pressed', 'false');
			const sprite = el('img', 'trainer-sheet-class-card-sprite');
			sprite.src = './assets/trainer-classes/' + encodeURIComponent(rule.id) + '.png';
			sprite.alt = '';
			sprite.width = 112;
			sprite.height = 112;
			sprite.loading = 'lazy';
			card.append(sprite, el('span', '', rule.name));
			card.addEventListener('click', () => {
				classSelect.value = rule.id;
				for (const choice of classGrid.children) {
					const selected = choice === card;
					choice.classList.toggle('selected', selected);
					choice.setAttribute('aria-pressed', String(selected));
				}
				classGrid.removeAttribute('aria-invalid');
				updateChoices();
				updateClassInfo(rule);
			});
			classGrid.append(card);
		}
		blocks[2].insertBefore(classSelect, errors[2]);
		blocks[2].insertBefore(classGrid, errors[2]);
		const classInfo = el('aside', 'trainer-sheet-class-info hidden');
		const classInfoTitle = el('h3');
		const classInfoDescription = el('p');
		const classInfoStrengths = el('ul');
		classInfo.append(classInfoTitle, classInfoDescription,
			el('h4', '', 'Pontos fortes'), classInfoStrengths);
		blocks[2].append(classInfo);
		function updateClassInfo(rule) {
			const overview = rule && CLASS_OVERVIEWS[rule.id];
			classInfo.classList.toggle('hidden', !overview || state.step !== 2);
			if (!overview) return;
			classInfoTitle.textContent = rule.name;
			classInfoDescription.textContent = overview[0];
			classInfoStrengths.replaceChildren(...overview[1].map(strength => el('li', '', strength)));
		}
		const dismissClassInfo = event => {
			if (!form.isConnected) { document.removeEventListener('pointerdown', dismissClassInfo); return; }
			if (state.step === 2 && !classInfo.contains(event.target) && !classGrid.contains(event.target)) {
				classInfo.classList.add('hidden');
			}
		};
		document.addEventListener('pointerdown', dismissClassInfo);
		const fixedList = el('p', 'trainer-sheet-fixed-skills');
		const scientist = el('label', 'trainer-sheet-creation-field hidden', 'Área científica inicial');
		const fixedKnowledge = select([['', 'Escolha uma área'],
			...skillDomainOptions(creation.skillDomains, 'conhecimento')]);
		scientist.append(fixedKnowledge);
		const skillHint = el('p'); const skillRows = el('div', 'trainer-sheet-creation-skills');
		blocks[3].insertBefore(fixedList, errors[3]);
		blocks[3].insertBefore(scientist, errors[3]);
		blocks[3].insertBefore(skillHint, errors[3]);
		blocks[3].insertBefore(skillRows, errors[3]);
		const gearRows = el('div', 'trainer-sheet-creation-gear');
		blocks[4].insertBefore(gearRows, errors[4]);
		const review = el('div', 'trainer-sheet-wizard-review');
		blocks[5].insertBefore(review, errors[5]);
		let skillControls = [];
		function refreshSkillAvailability() {
			const rule = creation.classes[classSelect.value];
			const fixed = [...(rule?.fixed || [])];
			if (rule?.id === 'cientista' && fixedKnowledge.value) {
				fixed.push('conhecimento:' + fixedKnowledge.value);
			}
			syncSkillAvailability(fixed, skillControls);
		}
		function updateChoices() {
			const rule = creation.classes[classSelect.value];
			const previous = skillControls.map(entry => entry.value());
			const intelligenceSlot = attrInputs.get('intelligence').value;
			const score = intelligenceSlot ? values?.[Number(intelligenceSlot)] ?? 10 : 10;
			const count = rule ? Math.max(1, rule.choices + Math.floor((score - 10) / 2)) : 0;
			fixedList.textContent = rule?.fixed.length ? 'Perícias fixas: ' + rule.fixed.map(skillLabel).join(', ') : '';
			scientist.classList.toggle('hidden', rule?.id !== 'cientista');
			skillHint.textContent = rule ? `Escolha ${count} perícia${count === 1 ? '' : 's'} adicional${count === 1 ? '' : 'is'}.` : '';
			skillRows.replaceChildren(); skillControls = [];
			for (let index = 0; index < count; index++) {
				const field = el('label', 'trainer-sheet-creation-field', `Perícia ${index + 1}`);
				const picker = skillPicker(rule.excluded, creation.skillDomains, previous[index],
					refreshSkillAvailability);
				field.append(picker.box); skillRows.append(field); skillControls.push(picker);
			}
			refreshSkillAvailability();
			gearRows.replaceChildren();
			for (const [group, options] of Object.entries(rule?.gearChoices || {})) {
				const field = el('label', 'trainer-sheet-creation-field', label(group));
				const control = select(options.map(id => [id, label(id)]));
				control.name = group; field.append(control); gearRows.append(field);
			}
			showError(2, ''); showError(3, ''); showError(4, '');
		}
		fixedKnowledge.addEventListener('change', refreshSkillAvailability);
		updateChoices();
		function attributes() {
			return Object.fromEntries([...attrInputs].map(([id, control]) =>
				[id, values?.[Number(control.value)]]));
		}
		function validate(index) {
			showError(index, '');
			if (index === 0 && !methodSelect.value) {
				showError(index, 'Escolha o método dos atributos.'); return false;
			}
			if (index === 1) {
				if (!values) { showError(index, 'Faça a primeira rolagem para continuar.'); return false; }
				const slots = [...attrInputs.values()].map(control => control.value);
				if (slots.includes('') || new Set(slots).size !== ATTRIBUTES.length) {
					showError(index, 'Use cada valor de atributo exatamente uma vez.'); return false;
				}
			}
			if (index === 2 && !classSelect.value) {
				showError(index, 'Escolha uma classe.'); classGrid.setAttribute('aria-invalid', 'true'); return false;
			}
			if (index === 3) {
				const optional = skillControls.map(control => control.value());
				const fixed = [...(creation.classes[classSelect.value]?.fixed || []),
					...(classSelect.value === 'cientista' ? ['conhecimento:' + normalizeDomain(fixedKnowledge.value)] : [])];
				if (classSelect.value === 'cientista' && !/^[a-z0-9-]{2,40}$/.test(normalizeDomain(fixedKnowledge.value))) {
					showError(index, 'Informe a área científica inicial.'); return false;
				}
				if (optional.includes('') || new Set([...fixed, ...optional]).size !== fixed.length + optional.length) {
					showError(index, 'Escolha perícias distintas e preencha as áreas necessárias.'); return false;
				}
			}
			if (index === 4 && [...gearRows.querySelectorAll('select')].some(control => !control.value)) {
				showError(index, 'Escolha todos os equipamentos iniciais.'); return false;
			}
			return true;
		}
		function normalizeDomain(value) {
			return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
				.replace(/\s+/g, '-');
		}
		function updateReview() {
			review.replaceChildren();
			const rule = creation.classes[classSelect.value];
			const details = [
				['Método', method === 'rolled' ? 'Primeira rolagem' : 'Valores base'],
				['Atributos', ATTRIBUTES.map(([id, name]) => `${name} ${attributes()[id]}`).join(' · ')],
				['Classe', rule?.name || '—'],
				['Perícias', [...(rule?.fixed || []),
					...(classSelect.value === 'cientista' ? ['conhecimento:' + normalizeDomain(fixedKnowledge.value)] : []),
					...skillControls.map(control => control.value())]
					.map(skillLabel).join(', ') || '—'],
				['Equipamento', [...(rule?.gear || []), ...[...gearRows.querySelectorAll('select')]
					.map(control => control.value)].map(label).join(', ') || 'Nenhum equipamento inicial'],
			];
			for (const [name, value] of details) {
				const row = el('p'); row.append(el('strong', '', `${name}: `), document.createTextNode(value)); review.append(row);
			}
		}
		const actions = el('div', 'trainer-sheet-wizard-actions');
		const back = el('button', 'button', 'Voltar'); back.type = 'button';
		const next = el('button', 'button primary', 'Continuar'); next.type = 'submit';
		actions.append(back, next); form.append(actions);
		function showStep() {
			blocks.forEach((block, index) => {
				block.classList.toggle('hidden', index > state.step);
				block.classList.toggle('active', index === state.step);
				block.classList.toggle('done', index < state.step);
			});
			const classConfirmed = state.step > 2;
			classGrid.classList.toggle('confirmed', classConfirmed);
			for (const card of classGrid.children) card.disabled = classConfirmed;
			updateClassInfo(state.step === 2 ? creation.classes[classSelect.value] : null);
			[...progress.children].forEach((item, index) => {
				item.classList.toggle('active', index === state.step);
				item.classList.toggle('done', index < state.step);
				if (index === state.step) item.setAttribute('aria-current', 'step');
				else item.removeAttribute('aria-current');
			});
			methodSelect.disabled = state.step > 0 ||
				!!(creation.sheet.creation?.rolls?.length || creation.sheet.creation?.rollProgress?.dice.length);
			back.classList.toggle('hidden', state.step === 0);
			next.textContent = state.step === 5 ? 'Confirmar ficha' :
				state.step === 2 ? 'Confirmar classe' : 'Continuar';
			if (state.step === 5) updateReview();
		}
		const stepBack = () => {
			if (state.step === 2 && !classInfo.classList.contains('hidden')) {
				classInfo.classList.add('hidden'); return true;
			}
			if (state.step === 0) return false;
			state.step--; showStep(); return true;
		};
		if (!inPage) creationWizardBack = stepBack;
		back.addEventListener('click', () => { if (state.step > 0) { state.step--; showStep(); } });
		if (inPage) form.addEventListener('keydown', event => {
			if (event.key !== 'Escape' || event.defaultPrevented || closeCreationAttributePicker) return;
			if (stepBack()) { event.preventDefault(); event.stopPropagation(); }
		});
		form.addEventListener('submit', async event => {
			event.preventDefault();
			if (!validate(state.step)) return;
			if (state.step === 0) {
				next.disabled = true;
				try {
					await api('/trainer/creation/method', { method: 'PUT', body: { method: methodSelect.value } });
					state.step = 1; await refresh();
				} catch (cause) {
					showError(0, cause.message || 'Não foi possível salvar o método.'); next.disabled = false;
				}
				return;
			}
			if (state.step < 5) { state.step++; showStep(); return; }
			for (let index = 1; index <= 4; index++) {
				if (!validate(index)) { state.step = index; showStep(); return; }
			}
			const knowledge = normalizeDomain(fixedKnowledge.value);
			const payload = { classId: classSelect.value, attributes: attributes(),
				optionalSkills: skillControls.map(control => control.value()),
				gearChoices: Object.fromEntries([...gearRows.querySelectorAll('select')]
					.map(control => [control.name, control.value])),
				...(classSelect.value === 'cientista' ? { fixedKnowledge: 'conhecimento:' + knowledge } : {}) };
			next.disabled = true;
			try { await api('/trainer/creation', { method: 'POST', body: payload }); await onComplete(); } catch (cause) {
				const message = cause.message || 'Não foi possível concluir a ficha.';
				const target = /rolagem|atribut|valores base/i.test(message) ? 1 :
					/classe/i.test(message) ? 2 : /perícia|científica|conhecimento/i.test(message) ? 3 :
					/equipamento|Bag/i.test(message) ? 4 : 5;
				showError(target, message); state.step = target; showStep(); next.disabled = false;
			}
		});
		showStep(); root.append(form);
	}
	function chips(values, names) {
		const row = el('div', 'trainer-sheet-chips');
		for (const id of values) row.append(el('span', 'trainer-sheet-chip', names?.[id] || label(id)));
		if (!values.length) row.append(empty('Nenhum registro.'));
		return row;
	}
	function updateTrainerHeading(sheet, progression, rules, target) {
		const title = target || document.getElementById('dashboard-title');
		if (!title) return;
		const backgroundHost = target || title.closest('.dashboard-heading');
		if (target) title.classList.remove('hidden');
		if (sheet.status !== 'complete') {
			title.classList.remove('trainer-sheet-heading-summary');
			backgroundHost?.style.removeProperty('--trainer-class-art');
			title.textContent = target ? 'Ficha ainda não concluída' : 'Criação da ficha';
			return;
		}
		const className = rules?.classes?.[sheet.classId]?.name || label(sheet.classId);
		const xp = new Intl.NumberFormat('pt-BR');
		backgroundHost?.style.setProperty('--trainer-class-art',
			`url("./assets/trainer-class-backgrounds/${encodeURIComponent(sheet.classId)}.png")`);
		title.classList.add('trainer-sheet-heading-summary');
		title.replaceChildren();
		const details = el('span', 'trainer-sheet-heading-details');
		for (const [name, value] of [
			['Classe', className], ['Nível', sheet.level],
			['XP / próximo nível', progression.xpToNextLevel == null ?
				`${xp.format(sheet.experience)} / nível máximo` :
				`${xp.format(sheet.experience)} / ${xp.format(progression.nextLevelXP ??
					sheet.experience + progression.xpToNextLevel)}`],
		]) {
			const item = el('span', 'trainer-sheet-heading-item');
			item.append(el('small', '', name), el('strong', '', value)); details.append(item);
		}
		title.append(details);
		const spriteFrame = el('span', 'trainer-sheet-heading-sprite-frame');
		const sprite = el('img', 'trainer-sheet-heading-sprite');
		sprite.src = './assets/trainer-classes/' + encodeURIComponent(sheet.classId) + '.png';
		sprite.alt = 'Símbolo da classe ' + className;
		sprite.width = 106;
		sprite.height = 106;
		sprite.decoding = 'async';
		spriteFrame.append(sprite);
		title.append(spriteFrame);
	}
	function renderEquippedItems(root, character, sheet, progression, equipment, api, readOnly, refresh) {
		const panel = section('Itens equipados', 'trainer-sheet-panel trainer-sheet-equipped');
		const grid = el('div', 'trainer-sheet-equipped-grid');
		const items = equipment?.inventory?.items || [];
		const catalog = equipment?.catalog || {};
		const worn = items.filter(item => item.equipped && item.location === 'bag');
		const bySlot = new Map();
		const hands = { left: null, right: null };
		for (const item of worn) {
			const definition = catalog[item.itemId];
			if (!definition) continue;
			if (definition.equipSlot !== 'hand') { bySlot.set(definition.equipSlot, item); continue; }
			if (definition.handCount === 2) { hands.left = hands.right = item; continue; }
			const hand = item.equippedHand || (hands.left ? 'right' : 'left');
			hands[hand] = item;
		}
		const labels = [
			['body-outfit', 'Traje'], ['body-improvement', 'Melhoria de corpo'],
			['head-improvement', 'Melhoria de cabeça'], ['left', 'Mão esquerda'],
			['right', 'Mão direita'], ['accessory', 'Acessório'],
		];
		async function attackWith(item) {
			const overlay = el('div', 'trainer-sheet-equipment-overlay');
			const dialog = section('Atacar com ' + catalog[item.itemId].name,
				'trainer-sheet-panel trainer-sheet-equipment-dialog');
			const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
			const onKey = event => { if (event.key === 'Escape') close(); };
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
			const dismiss = el('button', 'trainer-sheet-equipment-close', '×');
			dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Fechar');
			dismiss.addEventListener('click', close); dialog.append(dismiss);
			const feedback = el('p', 'trainer-sheet-progression-feedback');
			feedback.textContent = 'Carregando alvos...';
			dialog.append(feedback); overlay.append(dialog); document.body.append(overlay);
			document.addEventListener('keydown', onKey); dismiss.focus();
			let targets;
			try { targets = await api('/trainer/weapon-targets'); } catch (error) {
				feedback.textContent = error.message || 'Não foi possível carregar os alvos.'; return;
			}
			if (!overlay.isConnected) return;
			feedback.textContent = '';
			let attackAttribute = catalog[item.itemId].rangedAttack || item.itemId === 'spray-pimenta' ?
				'dexterity' : 'strength';
			if (catalog[item.itemId].agile && !catalog[item.itemId].rangedAttack) {
				const attribute = el('select', 'trainer-sheet-equipment-target-name');
				for (const [value, label] of [['strength', 'Força'], ['dexterity', 'Destreza']]) {
					const option = el('option', '', label); option.value = value; attribute.append(option);
				}
				attribute.addEventListener('change', () => { attackAttribute = attribute.value; });
				dialog.append(el('strong', '', 'Atributo do ataque'), attribute);
			}
			let closeRange = false;
			if (item.itemId === 'espingarda') {
				const near = el('button', 'trainer-sheet-equipment-option', 'Alvo a até 6 m (+3 de dano)');
				near.type = 'button'; near.setAttribute('aria-pressed', 'false');
				near.addEventListener('click', () => {
					closeRange = !closeRange; near.setAttribute('aria-pressed', String(closeRange));
				}); dialog.append(near);
			}
			async function perform(targetType, targetId, targetName, button) {
				button.disabled = true; feedback.textContent = '';
				try {
					const result = await api('/trainer/weapon-attack', { method: 'POST', body: {
						characterId: character.id, instanceId: item.id, targetType, targetId, targetName,
						attackAttribute, closeRange,
					} });
					feedback.textContent = result.hit === null ? 'Rolagens enviadas ao chat. O Mestre decide o efeito.' :
						result.hit ? 'Ataque acertou. O resultado foi aplicado.' : 'Ataque errou.';
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
					await refresh();
				} catch (error) { feedback.textContent = error.message || 'Não foi possível realizar o ataque.'; } finally { button.disabled = false; }
			}
			for (const [title, list, type] of [
				['Players', targets.players, 'player'], ['NPCs em cena', targets.npcs, 'scene-npc'],
			]) {
				dialog.append(el('strong', '', title));
				if (!list.length) dialog.append(el('small', '', 'Nenhum alvo disponível.'));
				for (const target of list) {
					const choice = el('button', 'trainer-sheet-equipment-option', target.name);
					choice.type = 'button'; choice.addEventListener('click', () => perform(type, target.id, '', choice));
					dialog.append(choice);
				}
			}
			dialog.append(el('strong', '', 'Outro NPC'));
			const other = el('input', 'trainer-sheet-equipment-target-name');
			other.type = 'text'; other.maxLength = 80; other.placeholder = 'Nome do NPC';
			const manual = el('button', 'trainer-sheet-equipment-option', 'Rolar ataque e dano');
			manual.type = 'button'; manual.addEventListener('click', () => perform('other-npc', '', other.value, manual));
			dialog.append(other, manual);
		}
		function picker(slot, current) {
			const overlay = el('div', 'trainer-sheet-equipment-overlay');
			const dialog = section(current ? 'Item equipado' : `Equipar: ${labels.find(entry => entry[0] === slot)[1]}`,
				'trainer-sheet-panel trainer-sheet-equipment-dialog');
			dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
			const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
			const onKey = event => { if (event.key === 'Escape') close(); };
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
			const dismiss = el('button', 'trainer-sheet-equipment-close', '×');
			dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Fechar');
			dismiss.addEventListener('click', close); dialog.append(dismiss);
			const feedback = el('p', 'trainer-sheet-progression-feedback');
			if (current) {
				const definition = catalog[current.itemId];
				const info = el('div', 'trainer-sheet-equipment-info');
				const heading = el('div', 'trainer-sheet-equipment-info-heading');
				const icon = el('img'); icon.src = definition.icon; icon.alt = '';
				heading.append(icon, el('strong', '', definition.name)); info.append(heading);
				const format = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
				const rangedAttack = definition.rangedAttack || current.itemId === 'spray-pimenta';
				const proficient = !definition.domain || (sheet.proficiencies || []).includes(definition.domain);
				const attackBase = rangedAttack ? progression.attacks?.ranged : progression.attacks?.melee;
				const attackBonus = attackBase == null ? null : attackBase + (proficient ? progression.proficiency || 0 : 0);
				const agileAttackBonus = definition.agile && progression.attacks?.ranged != null ?
					progression.attacks.ranged + (proficient ? progression.proficiency || 0 : 0) : null;
				const strengthBonus = Math.floor(((sheet.attributes?.strength || 10) - 10) / 2);
				const dexterityBonus = Math.floor(((sheet.attributes?.dexterity || 10) - 10) / 2);
				const details = [
					definition.category === 'shield' ?
						`Defesa: +${(sheet.proficiencies || []).includes('escudos') ? 2 : 1}` :
						definition.defenseBonus ? `Defesa: +${definition.defenseBonus}` : '',
					['roupa-exploracao-leve', 'roupa-exploracao-reforcada', 'roupa-exploracao-pesada'].includes(current.itemId) ?
						`Redução de dano acidental de exploração: ${definition.defenseBonus}` : '',
					current.itemId === 'capacete' ? 'Redução de dano acidental de exploração: 1' : '',
					definition.movementBonusMeters ?
						`Deslocamento: ${definition.movementBonusMeters > 0 ? '+' : ''}${format(definition.movementBonusMeters)} m` : '',
					current.itemId === 'roupa-exploracao-pesada' ? 'Desvantagem em Furtividade.' : '',
					definition.equipSlot === 'hand' && definition.category !== 'shield' ?
						`Jogada de ataque: 1d20 ${attackBonus == null ? '' : signed(attackBonus)}`.trim() : '',
					definition.agile ? `Com Destreza: 1d20 ${agileAttackBonus == null ? '' : signed(agileAttackBonus)}`.trim() : '',
					definition.weaponDamage ? `Dano: ${definition.weaponDamage.replace('+ Força',
						`${strengthBonus < 0 ? '−' : '+'} ${Math.abs(strengthBonus)}`).replace('+ Destreza',
						`${dexterityBonus < 0 ? '−' : '+'} ${Math.abs(dexterityBonus)}`)}` : '',
					definition.weaponEffect ? `Efeito: ${definition.weaponEffect}` : '',
					current.itemId === 'espingarda' ? 'A até 6 m: +3 de dano.' : '',
					({ 'colete-flutuacao': '+2 em Atletismo para nadar ou flutuar.',
						'arnes-escalada': '+2 em Atletismo para escalar com corda ou ancoragem.',
						'forro-termico': 'Protege contra frio; vantagem contra frio extremo.',
						'sistema-resfriamento': 'Protege contra calor; vantagem contra calor extremo.',
						'camada-impermeavel': 'Protege da chuva e umidade; vantagem contra exposição prolongada.',
						'oculos-protecao': 'Protege os olhos de partículas; vantagem contra Cego ambiental.',
						'mascara-filtrante': 'Filtra fumaça e partículas; vantagem contra gases concentrados.',
						'lanterna-cabeca': 'Ilumina 12 m claramente e mais 12 m com luz fraca.',
						'protetor-auditivo': 'Vantagem contra Surdo por ruído; desvantagem para ouvir.',
					}[current.itemId]) || '',
					definition.maxCharges === undefined ? '' :
					`Cargas disponíveis: ${current.charges ?? definition.maxCharges}/${definition.maxCharges}`,
				].filter(Boolean);
				if (!details.length) details.push('Sem bônus mecânico definido.');
				for (const detail of details) info.append(el('p', '', detail));
				dialog.append(info);
				if (!readOnly && definition.equipSlot === 'hand' && definition.category !== 'shield' &&
					(definition.weaponDamage || definition.weaponEffect)) {
					const ammunition = ({ revolver: 'municao-revolver', espingarda: 'municao-espingarda',
						rifle: 'municao-rifle', taser: 'cartucho-taser',
						'spray-pimenta': 'refil-spray-pimenta', 'dispositivo-choque': 'bateria-choque' })[current.itemId];
					if (ammunition && definition.maxCharges !== undefined) {
						const reload = el('button', 'trainer-sheet-equipment-option',
							`Recarregar (${current.charges ?? definition.maxCharges}/${definition.maxCharges})`);
						reload.type = 'button';
						reload.addEventListener('click', async () => {
							reload.disabled = true; feedback.textContent = '';
							const refill = items.find(entry => entry.itemId === ammunition && entry.location === 'bag' &&
								entry.quantity > 0 && (entry.charges === undefined || entry.charges > 0));
							if (!refill) {
								feedback.textContent = 'Sem munição compatível na Bag.'; reload.disabled = false; return;
							}
							try {
								await api('/trainer/equipment', { method: 'POST', body: {
									characterId: character.id, action: ['revolver', 'espingarda', 'rifle'].includes(current.itemId) ?
										'reloadWeapon' : 'refill', instanceId: current.id, refillInstanceId: refill.id,
									expectedRevision: equipment.inventory.revision,
								} });
								close(); await refresh();
								window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
							} catch (error) {
								feedback.textContent = error.message || 'Não foi possível recarregar a arma.';
								reload.disabled = false;
							}
						}); dialog.append(reload);
					}
					const attack = el('button', 'trainer-sheet-equipment-option', 'Atacar');
					attack.type = 'button'; attack.addEventListener('click', async () => {
						attack.disabled = true;
						close();
						try { await attackWith(current); } catch (error) {
							feedback.textContent = error.message || 'Não foi possível abrir os alvos.'; attack.disabled = false;
						}
					}); dialog.append(attack);
				}
			}
			const candidates = current ? readOnly ? [] : [current] : items.filter(item => {
				const definition = catalog[item.itemId];
				return item.location === 'bag' && !item.equipped && definition &&
					(slot === 'left' || slot === 'right' ? definition.equipSlot === 'hand' &&
					(definition.handCount !== 2 || !hands.left && !hands.right) :
					definition.equipSlot === slot) &&
					(slot !== 'body-improvement' && slot !== 'head-improvement' || bySlot.has('body-outfit'));
			});
			if (!current && !candidates.length) dialog.append(el('p', '', 'Nenhum item disponível para este espaço.'));
			for (const item of candidates) {
				const definition = catalog[item.itemId];
				const choice = el('button', 'trainer-sheet-equipment-option'); choice.type = 'button';
				if (current) choice.append(el('span', '', 'Retirar equipamento'));
				else {
					const icon = el('img'); icon.src = definition.icon; icon.alt = '';
					choice.append(icon, el('span', '', definition.name),
						el('small', '', definition.handCount === 2 ? 'Ocupa as duas mãos' : 'Equipar'));
				}
				choice.addEventListener('click', async () => {
					choice.disabled = true; feedback.textContent = '';
					try {
						await api('/trainer/equipment', { method: 'POST', body: {
							characterId: character.id, action: 'equip', instanceId: item.id,
							equipped: !current, expectedRevision: equipment.inventory.revision,
							...(!current && (slot === 'left' || slot === 'right') ? { hand: slot } : {}),
						} });
						close(); await refresh();
						window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
							{ detail: { tableId: selectedTable } }));
					} catch (error) { feedback.textContent = error.message || 'Não foi possível alterar o equipamento.'; choice.disabled = false; }
				});
				dialog.append(choice);
			}
			dialog.append(feedback); overlay.append(dialog); document.body.append(overlay);
			document.addEventListener('keydown', onKey); dismiss.focus();
		}
		for (const [slot, name] of labels) {
			const item = slot === 'left' || slot === 'right' ? hands[slot] : bySlot.get(slot);
			const definition = item && catalog[item.itemId];
			const card = el(slot === 'accessory' || readOnly && !item ? 'div' : 'button',
				'trainer-sheet-equipment-slot' + (item ? ' occupied' : ''));
			if (card.tagName === 'BUTTON') { card.type = 'button'; card.addEventListener('click', () => picker(slot, item)); }
			card.append(el('small', '', name));
			if (definition) {
				const icon = el('img'); icon.src = definition.icon; icon.alt = '';
				card.append(icon, el('strong', '', definition.name));
			} else card.append(el('span', '', slot === 'accessory' ? 'Sem uso por enquanto' : 'Vazio'));
			grid.append(card);
		}
		panel.append(grid);
		if (!equipment) panel.append(el('small', '', 'Não foi possível consultar os equipamentos.'));
		root.append(panel);
	}

	function renderSheet(root, character, sheet, progression, talents, rules, api, readOnly, refresh,
		masterControls = false, spriteUrl = null, canRemoveTrueBond = false, trainerSpriteUrl = null,
		masterVitalControls = false, equipment = null) {
		if (closeSkillPopover) closeSkillPopover();
		if (closeAttributePopover) closeAttributePopover();
		if (closeTalentPopover && (!closeTalentPopover.preserveOnRefresh ||
			closeTalentPopover.preserveCharacterId !== character.id || readOnly)) closeTalentPopover();
		root.replaceChildren();
		if (!sheet || sheet.status !== 'complete') {
			root.append(empty(`${character.characterName || 'Este treinador'} ainda não concluiu a criação da ficha.`));
			return;
		}
		if (masterControls) {
			const controls = section('Progressão do treinador', 'trainer-sheet-panel trainer-sheet-progression-controls');
			const line = el('div', 'trainer-sheet-progression-line');
			const amount = el('input', 'trainer-sheet-progression-input');
			amount.type = 'number'; amount.min = '1'; amount.step = '1'; amount.placeholder = 'Quantidade de XP';
			const reason = el('input', 'trainer-sheet-progression-input');
			reason.type = 'text'; reason.maxLength = 500; reason.placeholder = 'Motivo da XP';
			const grant = el('button', 'button', 'Conceder XP'); grant.type = 'button';
			const up = el('button', 'button', 'Preparar próximo nível'); up.type = 'button';
			up.disabled = sheet.level >= 10 || progression.eligibleLevel > sheet.level;
			const down = el('button', 'button', 'Diminuir 1 nível'); down.type = 'button'; down.disabled = sheet.level <= 1;
			const feedback = el('p', 'trainer-sheet-progression-feedback');
			const requestId = () => `trainer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			let grantRequestId = requestId();
			for (const input of [amount, reason]) input.addEventListener('input', () => { grantRequestId = requestId(); });
			const act = async (button, endpoint, body) => {
				button.disabled = true; feedback.textContent = '';
				try { await api(endpoint, { method: 'POST', body }); await refresh(); } catch (error) { feedback.textContent = error.message || 'Não foi possível atualizar a progressão.'; button.disabled = false; }
			};
			grant.addEventListener('click', () => {
				const value = Number(amount.value);
				if (!Number.isSafeInteger(value) || value < 1 || !reason.value.trim()) {
					feedback.textContent = 'Informe a XP e o motivo.'; return;
				}
				void act(grant, '/trainer/rewards/master', { characterId: character.id, amount: value,
					reason: reason.value.trim(), requestId: grantRequestId });
			});
			const upRequestId = requestId();
			up.addEventListener('click', () => void act(up, '/trainer/level/master',
				{ characterId: character.id, direction: 'up', requestId: upRequestId }));
			let confirmDown = false;
			const downRequestId = requestId();
			down.addEventListener('click', () => {
				if (!confirmDown) { confirmDown = true; down.textContent = 'Confirmar redução'; down.classList.add('trainer-sheet-danger'); return; }
				void act(down, '/trainer/level/master', { characterId: character.id, direction: 'down', requestId: downRequestId });
			});
			line.append(amount, reason, grant, up, down); controls.append(line, feedback); root.append(controls);
		}
		if (!readOnly) {
			const pending = sheet.pendingChoices || { general: 0, class: 0, apex: 0 };
			const availableKinds = ['general', 'class', 'apex'].filter(kind => pending[kind] > 0);
			if (availableKinds.length) {
				const captions = { general: 'geral', class: 'específico da classe', apex: 'ápice' };
				let choices = (talents?.talents || []).filter(entry => entry.kind === availableKinds[0] && entry.available);
				const panel = section('Pode escolher agora', 'trainer-sheet-panel trainer-sheet-choice-panel');
				panel.append(el('p', '', 'Escolha um talento disponível. Os talentos já adquiridos permanecem na seção Talentos.'));
				const kindPicker = select(availableKinds.map(kind => [kind,
					`${pending[kind]} escolha(s): ${captions[kind]}`]));
				const picker = select([['', 'Selecione um talento'], ...choices.map(entry => [entry.id, entry.name])]);
				const description = el('p', 'trainer-sheet-choice-description');
				const fields = el('div', 'trainer-sheet-progression-line');
				const feedback = el('p', 'trainer-sheet-progression-feedback');
				const confirm = el('button', 'button', 'Aprender talento'); confirm.type = 'button'; confirm.disabled = true;
				const values = {};
				let talentRequestId = `talent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
				const resetTalentRequest = () => { talentRequestId = `talent-${Date.now()}-${Math.random().toString(36).slice(2)}`; };
				const field = (name, options) => {
					const control = select([['', `Escolha ${name}`], ...options]);
					control.addEventListener('change', () => { values[name] = control.value; resetTalentRequest(); }); fields.append(control);
					return control;
				};
				kindPicker.addEventListener('change', () => {
					choices = (talents?.talents || []).filter(entry => entry.kind === kindPicker.value && entry.available);
					picker.replaceChildren(...select([['', 'Selecione um talento'],
						...choices.map(entry => [entry.id, entry.name])]).children);
					picker.value = ''; picker.dispatchEvent(new Event('change'));
				});
				picker.addEventListener('change', () => {
					fields.replaceChildren(); Object.keys(values).forEach(key => delete values[key]); feedback.textContent = '';
					resetTalentRequest();
					const chosen = choices.find(entry => entry.id === picker.value); confirm.disabled = !chosen;
					description.replaceChildren(...renderTrainerDescription(chosen?.text || '').childNodes);
					if (!chosen) return;
					if (chosen.attributeChoices?.length) field('attribute', chosen.attributeChoices.map(id => [id,
						ATTRIBUTES.find(entry => entry[0] === id)?.[1] || label(id)]));
					if (chosen.choiceFields?.skill) {
						field('skill', chosen.id === 'conhecimento-diversificado' ?
							(chosen.variantChoices || []).map(id => [id, skillLabel(id)]) :
							(progression.skills || []).filter(entry =>
								!['conhecimento', 'oficio'].includes(entry.id) &&
								(chosen.id === 'treinamento-adicional' ? !entry.trained :
								entry.trained && (chosen.id !== 'foco-em-pericia' || !entry.focused) &&
								(chosen.id !== 'competencia-pratica' || !(sheet.talentSelections || []).some(selection =>
									selection.id === chosen.id && selection.skill === entry.id))))
								.map(entry => [entry.id, skillLabel(entry.id)]));
					}
					if (chosen.choiceFields?.resistance) field('resistance', (progression.resistances || [])
						.filter(entry => !entry.trained).map(entry => [entry.id, RESISTANCES[entry.id] || entry.id]));
					if (chosen.choiceFields?.proficiency) {
						const category = chosen.id === 'dominio-de-kit' ? 'kit-' : 'armas-';
						field('proficiency', Object.entries(PROFICIENCY_DOMAINS).filter(([id]) =>
							id.startsWith(category) && !(sheet.proficiencies || []).includes(id))
							.map(([id, info]) => [id, info[0]]));
					}
					if (chosen.choiceFields?.variant) {
						if (chosen.variantChoices) {
							const second = field('variant', chosen.variantChoices.map(id =>
								[id, variantLabel(chosen.id, id)]));
							if (['conhecimento-diversificado', 'competencia-pratica'].includes(chosen.id)) {
								const first = fields.querySelector('select');
								const update = () => {
									const unavailable = chosen.id === 'conhecimento-diversificado' ? [first.value] :
										(progression.skills || []).find(entry => entry.id === first.value)?.attributes || [];
									for (const option of second.options) option.disabled = !!first.value && unavailable.includes(option.value);
									if (first.value && unavailable.includes(second.value)) { second.value = ''; delete values.variant; }
								};
								first.addEventListener('change', update); update();
							}
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = chosen.id === 'artista:artista-versatil' ? 'Modalidade artística 1' :
								chosen.id.startsWith('atleta:') ? 'Modalidade esportiva 1' : 'Área ou variante';
							input.maxLength = 80; input.addEventListener('input', () => {
								values.variant = input.value.trim(); resetTalentRequest();
							}); fields.append(input);
						}
					}
					if (chosen.choiceFields?.secondVariant) {
						if (chosen.id === 'cientista:autoridade-cientifica') {
							field('secondVariant', chosen.variantChoices.map(id => [id, skillLabel(id)]));
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = chosen.id === 'atleta:atleta-polivalente' ?
								'Modalidade esportiva 2' : 'Modalidade artística 2'; input.maxLength = 80;
							input.addEventListener('input', () => { values.secondVariant = input.value.trim(); resetTalentRequest(); });
							fields.append(input);
						}
					}
					if (chosen.choiceFields?.thirdVariant) {
						if (chosen.id === 'cientista:autoridade-cientifica') {
							field('thirdVariant', chosen.variantChoices.map(id => [id, skillLabel(id)]));
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = 'Modalidade esportiva 3'; input.maxLength = 80;
							input.addEventListener('input', () => { values.thirdVariant = input.value.trim(); resetTalentRequest(); });
							fields.append(input);
						}
					}
				});
				confirm.addEventListener('click', async () => {
					const chosen = choices.find(entry => entry.id === picker.value); if (!chosen) return;
					if ((chosen.attributeChoices?.length && !values.attribute) ||
						Object.entries(chosen.choiceFields || {}).some(([key, needed]) => needed && !values[key])) {
						feedback.textContent = 'Complete as escolhas adicionais deste talento.'; return;
					}
					const modalityError = talentModalityError(sheet, { id: chosen.id, ...values });
					if (modalityError) { feedback.textContent = modalityError; return; }
					confirm.disabled = true;
					try {
						await api('/trainer/talents', { method: 'POST', body: { id: chosen.id, ...values,
							requestId: talentRequestId } }); await refresh();
					} catch (error) { feedback.textContent = error.message || 'Não foi possível aprender o talento.'; confirm.disabled = false; }
				});
				panel.append(kindPicker, picker, description, fields, confirm, feedback); root.append(panel);
			}
		}
		const attributeLayout = el('div', 'trainer-sheet-top-grid');
		const attributes = section('Atributos', 'trainer-sheet-panel trainer-sheet-attribute-section');
		const attributeGrid = el('div', 'trainer-sheet-attributes');
		for (const [id, name] of ATTRIBUTES) {
			const value = sheet.attributes[id];
			const tile = el(readOnly ? 'div' : 'button', 'trainer-sheet-attribute');
			if (!readOnly) {
				tile.type = 'button'; tile.setAttribute('aria-haspopup', 'menu');
				tile.setAttribute('aria-expanded', 'false');
				tile.addEventListener('click', () => showRollPopover(tile, name, 'attribute', id, character.id, api,
					progression.rollTalents));
			}
			tile.append(el('span', 'trainer-sheet-attribute-name', name),
				el('strong', 'trainer-sheet-attribute-modifier', signed(Math.floor((value - 10) / 2))),
				el('small', 'trainer-sheet-attribute-value', value));
			attributeGrid.append(tile);
		}
		const primaryStats = el('div', 'trainer-sheet-primary-stats');
		const hp = section('PV', 'trainer-sheet-panel trainer-sheet-primary-stat');
		if (masterVitalControls) {
			const current = sheet.hitPoints.current ?? 0;
			const maximum = sheet.hitPoints.maximum ?? 0;
			const value = el('div', 'trainer-sheet-hp-value');
			const currentColumn = el('div', 'trainer-sheet-hp-current');
			const arrows = el('div', 'trainer-sheet-hp-arrows');
			const increase = el('button', 'trainer-sheet-hp-arrow', '▲');
			const decrease = el('button', 'trainer-sheet-hp-arrow', '▼');
			increase.type = decrease.type = 'button';
			increase.setAttribute('aria-label', 'Aumentar PV atual em 1');
			decrease.setAttribute('aria-label', 'Reduzir PV atual em 1');
			increase.disabled = current >= maximum;
			decrease.disabled = current <= 0;
			const feedback = el('small', 'trainer-sheet-hp-feedback');
			let busy = false;
			const adjust = async type => {
				if (busy) return;
				busy = true; increase.disabled = decrease.disabled = true;
				feedback.textContent = '';
				try {
					await api('/trainer/survival', { method: 'POST', body: {
						characterId: character.id, action: { type, amount: 1 },
					} });
					await refresh();
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync',
						{ detail: { tableId: selectedTable } }));
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível alterar o PV.';
					busy = false;
					increase.disabled = current >= maximum;
					decrease.disabled = current <= 0;
				}
			};
			increase.addEventListener('click', () => void adjust('heal'));
			decrease.addEventListener('click', () => void adjust('damage'));
			arrows.append(increase, decrease);
			currentColumn.append(el('strong', '', current), arrows);
			value.append(currentColumn, el('strong', '', `/ ${maximum}`));
			hp.append(value, feedback);
		} else {
			hp.append(el('strong', '', `${sheet.hitPoints.current ?? '—'} / ${sheet.hitPoints.maximum ?? '—'}`));
		}
		if (sheet.hitPoints.temporary) hp.append(el('small', '', `${sheet.hitPoints.temporary} temporários`));
		const defense = section('Defesa', 'trainer-sheet-panel trainer-sheet-primary-stat');
		defense.append(el('strong', '', progression.derived?.defense ?? '—'));
		const initiative = section('Iniciativa', 'trainer-sheet-panel trainer-sheet-primary-stat trainer-sheet-initiative');
		initiative.append(el('strong', '', progression.derived?.initiativeBonus == null ? '—' :
			signed(progression.derived.initiativeBonus)));
		if (!readOnly) {
			const roll = el('button', 'trainer-sheet-initiative-roll');
			roll.type = 'button'; roll.setAttribute('aria-label', 'Rolar Iniciativa');
			roll.setAttribute('aria-haspopup', 'menu'); roll.setAttribute('aria-expanded', 'false');
			roll.addEventListener('click', () => showRollPopover(roll, 'Iniciativa', 'initiative', '', character.id, api,
				progression.rollTalents));
			initiative.append(roll);
		}
		const movement = section('Deslocamento', 'trainer-sheet-panel trainer-sheet-primary-stat');
		movement.append(el('strong', '', progression.derived?.movementMeters == null ? '—' :
			`${progression.derived.movementMeters} m`));
		const primaryValues = el('div', 'trainer-sheet-primary-values');
		primaryValues.append(hp, defense, initiative, movement);
		primaryStats.append(primaryValues);
		const leftStats = el('div', 'trainer-sheet-left-stats');
		const rightStats = el('div', 'trainer-sheet-right-stats');
		primaryStats.append(leftStats, rightStats);
		const secondaryVitals = el('div', 'trainer-sheet-secondary-vitals');
		const hitDie = section('Dados de Vida', 'trainer-sheet-panel trainer-sheet-primary-stat');
		hitDie.append(el('strong', '', rules?.classes?.[sheet.classId]?.hitDie ?
			`d${rules.classes[sheet.classId].hitDie}` : '—'));
		const deathSaves = section('Teste de morte', 'trainer-sheet-panel trainer-sheet-death-saves');
		const deathSaveValues = sheet.survival?.deathSaves || { successes: 0, failures: 0 };
		for (const [name, value] of [['Sucess', deathSaveValues.successes], ['Falhas', deathSaveValues.failures]]) {
			const row = el('div', 'trainer-sheet-list-row');
			row.append(el('span', '', name), el('strong', 'trainer-sheet-bonus', `${value}/3`));
			deathSaves.append(row);
		}
		const canRollDeathSave = !readOnly && sheet.hitPoints.current === 0 &&
			(sheet.survival?.lifeState || 'dying') === 'dying';
		if (canRollDeathSave) {
			const roll = el('button', 'trainer-sheet-death-roll', 'Rolar d20');
			roll.type = 'button';
			const error = el('small', 'trainer-sheet-roll-error hidden');
			const requestId = crypto.randomUUID();
			roll.addEventListener('click', async () => {
				roll.disabled = true;
				try {
					await api('/trainer/death-save', { method: 'POST', body: { requestId } });
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (failure) {
					error.textContent = failure.message || 'Não foi possível rolar o teste de morte.';
					error.classList.remove('hidden');
					roll.disabled = false;
				}
			});
			deathSaves.append(roll, error);
		}
		secondaryVitals.append(hitDie, deathSaves); rightStats.append(secondaryVitals);
		const proficiency = section('Proficiência', 'trainer-sheet-panel trainer-sheet-primary-stat trainer-sheet-proficiency');
		// Compatibilidade com servidores ainda em execução sem o campo de proficiência na resposta.
		const proficiencyValue = progression.proficiency ?? (sheet.level <= 4 ? 2 : sheet.level <= 8 ? 3 : 4);
		proficiency.append(el('strong', '', signed(proficiencyValue)));
		leftStats.append(proficiency);
		const resistances = section('Resistências', 'trainer-sheet-panel trainer-sheet-resistance-panel');
		const resistanceList = el('div', 'trainer-sheet-list trainer-sheet-resistances');
		for (const entry of progression.resistances || []) {
			const row = el(readOnly ? 'div' : 'button', 'trainer-sheet-list-row' +
				(entry.trained ? ' trained' : '') + (readOnly ? '' : ' trainer-sheet-roll-row'));
			if (!readOnly) {
				row.type = 'button'; row.setAttribute('aria-haspopup', 'menu');
				row.setAttribute('aria-expanded', 'false');
				row.addEventListener('click', () => showRollPopover(
					row, RESISTANCES[entry.id], 'resistance', entry.id, character.id, api,
					progression.rollTalents));
			}
			row.append(el('span', '', RESISTANCES[entry.id]),
				el('strong', 'trainer-sheet-bonus', signed(entry.bonus)));
			resistanceList.append(row);
		}
		resistances.append(resistanceList); leftStats.append(resistances);
		const attacks = section('Ataques', 'trainer-sheet-panel trainer-sheet-attacks');
		const attackValues = el('div', 'trainer-sheet-vitals');
		const attackRow = (id, name, bonus) => {
			const row = el(readOnly ? 'div' : 'button', readOnly ? '' : 'trainer-sheet-roll-row');
			if (!readOnly) {
				row.type = 'button'; row.setAttribute('aria-haspopup', 'menu');
				row.setAttribute('aria-expanded', 'false');
				row.addEventListener('click', () => showRollPopover(row, name, 'attack', id, character.id, api,
					progression.rollTalents));
			}
			row.append(el('small', '', name), el('strong', '', bonus == null ? '—' : signed(bonus)));
			return row;
		};
		const melee = attackRow('melee', 'Ataque corpo a corpo', progression.attacks?.melee);
		const ranged = attackRow('ranged', 'Ataque à distância', progression.attacks?.ranged);
		attackValues.append(melee, ranged); attacks.append(attackValues); leftStats.append(attacks);
		const skills = section('Perícias', 'trainer-sheet-panel trainer-sheet-skills-panel');
		const skillList = el('div', 'trainer-sheet-list trainer-sheet-skills');
		const divided = new Set(['conhecimento', 'pilotagem', 'oficio']);
		const divisions = new Map([...divided].map(family => [family,
			(progression.skills || []).filter(entry => entry.id.startsWith(family + ':'))]));
		const shownFamilies = new Set();
		const rollSkill = (button, name, entry) => showRollPopover(
			button, name, 'skill', entry.id, character.id, api, progression.rollTalents,
			entry.trained, entry.attributes || [], progression.helpTalents || []);
		for (const entry of progression.skills || []) {
			const family = entry.id.split(':')[0];
			if (!divided.has(family)) { skillList.append(skillRow(entry, false, readOnly ? null : rollSkill)); continue; }
			if (shownFamilies.has(family)) continue;
			shownFamilies.add(family);
			const entries = divisions.get(family);
			const button = el('button', 'trainer-sheet-list-row trainer-sheet-skill-group', SKILLS[family]);
			button.type = 'button'; button.setAttribute('aria-expanded', 'false');
			button.append(el('span', 'trainer-sheet-skill-chevron', '▴'));
			button.addEventListener('click', () => {
				if (closeSkillPopover && button.getAttribute('aria-expanded') === 'true') closeSkillPopover();
				else showSkillPopover(button, SKILLS[family], entries, readOnly ? null : rollSkill);
			});
			skillList.append(button);
		}
		const passivePerception = el('div', 'trainer-sheet-list-row');
		passivePerception.append(el('span', '', 'Percepção passiva'),
			el('strong', 'trainer-sheet-bonus', progression.derived?.passivePerception ?? '—'));
		skillList.append(passivePerception);
		skills.append(skillList);
		attributes.append(attributeGrid);

		const talentDefinitions = Object.fromEntries((talents?.talents || []).map(entry => [entry.id, entry]));
		const talentSection = section('Talentos', 'trainer-sheet-panel trainer-sheet-talents');
		const manualRestTalents = new Map((progression.manualRestTalents || []).map(entry => [entry.id, entry]));
		if (sheet.manualTalentLastRenewal?.talents?.length) {
			const notice = el('div', 'trainer-sheet-manual-rest-notice');
			notice.append(el('strong', '', `Descanso ${sheet.manualTalentLastRenewal.source === 'short' ? 'curto' : 'longo'} foi feito. Talentos que voltaram a estar disponíveis:`));
			const list = el('ul');
			for (const renewed of sheet.manualTalentLastRenewal.talents) list.append(el('li', '', renewed));
			notice.append(list); talentSection.append(notice);
		}
		const chosenByTalent = new Map();
		for (const selection of sheet.talentSelections || []) {
			if (!chosenByTalent.has(selection.id)) chosenByTalent.set(selection.id, []);
			chosenByTalent.get(selection.id).push(selection);
		}
		const chosenLabel = selection => {
			if (!selection) return '';
			if (selection.id === 'competencia-pratica' && selection.skill && selection.variant) {
				const attribute = ATTRIBUTES.find(entry => entry[0] === selection.variant)?.[1] || label(selection.variant);
				return `${skillLabel(selection.skill)} com ${attribute}`;
			}
			if (selection.id === 'conhecimento-diversificado' && selection.skill && selection.variant) {
				return `${skillLabel(selection.skill)} e ${skillLabel(selection.variant)}`;
			}
			if (selection.id === 'artista:artista-versatil' && selection.variant && selection.secondVariant) {
				return `${selection.variant} e ${selection.secondVariant}`;
			}
			if (selection.id === 'atleta:atleta-polivalente' && selection.variant &&
				selection.secondVariant && selection.thirdVariant) {
				return `${selection.variant}, ${selection.secondVariant} e ${selection.thirdVariant}`;
			}
			if (selection.id === 'artista-marcial:reflexos-treinados' && selection.variant === 'already-trained') {
				return 'Bônus +2';
			}
			if (selection.skill) return skillLabel(selection.skill);
			if (selection.attribute) return ATTRIBUTES.find(entry => entry[0] === selection.attribute)?.[1] || label(selection.attribute);
			if (selection.resistance) return RESISTANCES[selection.resistance] || label(selection.resistance);
			if (selection.proficiency) return PROFICIENCY_DOMAINS[selection.proficiency]?.[0] || label(selection.proficiency);
			if (selection.variant) return variantLabel(selection.id, selection.variant);
			return '';
		};
		const acquired = ids => (ids || []).map(id => {
			const definition = talentDefinitions[id];
			const choice = chosenByTalent.get(id)?.shift();
			const baseName = definition?.name || id;
			const detail = chosenLabel(choice);
			return { id, name: detail ? `${baseName} (${detail})` : baseName, description: definition?.text };
		});
		const sortTalents = entries => entries.sort((left, right) =>
			left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
		const classTalents = sortTalents([
			...(rules?.classFeatures?.[sheet.classId] || []).map(feature =>
				({ id: sheet.classId === 'mestre-pokemon' && feature.name === 'Captura Calculada' ?
					'mestre-pokemon:captura-calculada' : sheet.classId === 'cientista' && feature.name === 'Registro Reprodutível' ?
						'cientista:registro-reprodutivel' : sheet.classId === 'tecnologo' &&
							feature.name === 'Protótipo Tecnológico' ? 'tecnologo:prototipo-tecnologico' : sheet.classId === 'coreografo' &&
								feature.name === 'Ensaio Conjunto' ? 'coreografo:ensaio-conjunto' :
						feature.name === 'Refeição Revigorante' ? 'cozinheiro:refeicao-revigorante' :
						feature.name === 'Primeiros Cuidados' ? 'criador-pokemon:primeiros-cuidados' :
						feature.name === 'Atendimento Emergencial' ? 'medico:atendimento-emergencial' : undefined,
				name: feature.name, description: feature.text })),
			...acquired(sheet.talents?.class),
		]);
		const apexTalents = acquired(sheet.talents?.apex ? [sheet.talents.apex] : []);
		const generalTalents = sortTalents(acquired(sheet.talents?.general));
		const talentList = el('div', 'trainer-sheet-talent-list');
		for (const { id, name, description } of [...classTalents, ...apexTalents, ...generalTalents]) {
			const button = el('button', 'trainer-sheet-talent-row', name);
			const manualRest = manualRestTalents.get(id);
			const automaticRestUsed = ['segundo-folego', 'sortudo', 'determinado', 'esforco-heroico'].includes(id) &&
				progression.activeTalentUses?.used?.[id] === progression.activeTalentUses?.restCycle;
			const comfortingArtUsed = id === 'artista:arte-reconfortante' &&
				!!progression.comfortingArtUses?.recipientIds?.length;
			const mealUsed = !!progression.revigoratingMeal?.usedThisRest &&
				['cozinheiro:refeicao-revigorante', 'cozinheiro:refeicao-reconfortante',
					'cozinheiro:nutricao-de-recuperacao'].includes(id);
			if (manualRest?.used || automaticRestUsed || comfortingArtUsed || mealUsed) {
				button.classList.add('trainer-sheet-talent-row--used');
			}
			const compartmentDC = id === 'ladino:compartimento-clandestino' && sheet.attributes ?
				8 + progression.proficiency + Math.floor((sheet.attributes.intelligence - 10) / 2) : null;
			const emptyHandsDC = id === 'ladino:maos-vazias' && sheet.attributes ?
				8 + progression.proficiency + Math.floor((sheet.attributes.dexterity - 10) / 2) : null;
			let shownDescription = compartmentDC !== null ? `${description}\n\nSua CD atual: ${compartmentDC}.` :
				emptyHandsDC !== null ? `${description}\n\nSua CD atual: ${emptyHandsDC}.` :
				id === 'detetive:voz-do-parceiro' ?
					`${description}\n\nPokémon vinculado: ${progression.investigativePartner?.pokemonName || 'nenhum'}.` :
					id === 'encantador:confidente' && progression.confidant?.name ?
						`${description}\n\nConfidente: ${progression.confidant.name}.` :
						id === 'encantador:laco-verdadeiro' && progression.trueBond?.name ?
							`${description}\n\nNPC vinculado: ${progression.trueBond.name}.` :
							id === 'detetive:parceiro-de-confianca' && (sheet.trustedPartnerName || readOnly) ?
								`${description}\n\nParceiro: ${sheet.trustedPartnerName || 'não informado'}.` :
								description;
			if (id === 'medico:atendimento-emergencial') shownDescription = shownDescription.replace(
				'até completar um descanso longo ou receber tratamento adequado em uma instalação médica',
				'até o próximo descanso longo da campanha');
			if (id === 'cientista:publicacao-de-referencia' && progression.publication?.accepted) {
				button.append(el('span', 'trainer-sheet-publication-count',
					`${progression.publication.accepted} publicação(ões)`));
			}
			button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
			button.setAttribute('aria-expanded', 'false');
			button.addEventListener('click', () => showTalentPopover(button, name, shownDescription,
				!readOnly && id === 'explorador:ponto-de-apoio' ?
					{ id, api, supportCacheCreate: true,
						supportCacheOwnerId: character.id,
						supportCacheCount: (progression.supportCaches || []).filter(cache =>
							cache.ownerCharacterId === character.id).length,
						supportCacheLimit: Math.max(1, Math.floor(((sheet.attributes?.wisdom || 10) - 10) / 2)) } :
					!readOnly && id === 'explorador:forrageador-eficiente' ?
						{ id, api, forage: progression.forage } :
						!readOnly && id === 'diplomata:canal-oficial' ?
							{ id, api, supplierOrder: progression.supplierOrder } :
							!readOnly && id === 'ladino:mercado-paralelo' ?
								{ id, api, parallelMarket: progression.parallelMarket } :
								!readOnly && id === 'encantador:confidente' ?
									{ id, api, confidant: progression.confidant } :
									!readOnly && id === 'encantador:laco-verdadeiro' ?
										{ id, api, trueBond: progression.trueBond, canRemove: canRemoveTrueBond } :
										!readOnly && id === 'detetive:parceiro-de-confianca' ?
											{ id, api, trustedPartner: { name: sheet.trustedPartnerName || '', onSaved: saved => {
												sheet.trustedPartnerName = saved;
												shownDescription = `${description}\n\nParceiro: ${saved || 'não informado'}.`;
											} } } :
											!readOnly && id === 'detetive:parceiro-investigativo' ?
												{ id, api, refresh, spriteUrl, investigativePartner: progression.investigativePartner } :
												!readOnly && ['criador-pokemon:primeiros-cuidados',
													'criador-pokemon:restaurador-pokemon'].includes(id) ?
													{ id, api, refresh, spriteUrl, firstCare: true } :
													!readOnly && progression.choreography && ['coreografo:ensaio-conjunto',
														'coreografo:formacao-em-dupla', 'coreografo:formacao-em-trio', 'coreografo:diretor-convidado',
														'coreografo:tema-unificado', 'coreografo:entrosamento-instintivo',
														'coreografo:preparacao-corporal-conjunta', 'coreografo:conducao-de-evacuacao'].includes(id) ?
														{ id, api, choreography: progression.choreography } :
														!readOnly && id === 'cientista:registro-reprodutivel' ? { id, api, refresh,
															scientistRecord: progression.scientistRecord } :
														!readOnly && ['tecnologo:prototipo-tecnologico',
															'tecnologo:central-de-prototipos', 'tecnologo:obra-prima-modular'].includes(id) ? { id, api, refresh,
															technologicalPrototype: progression.technologicalPrototype } :
														!readOnly && id === 'cientista:hipotese-persistente' ?
															{ id, api, refresh, persistentHypothesis: progression.persistentHypothesis,
																persistentHypothesisCharacterId: character.id } :
															!readOnly && id === 'cientista:publicacao-de-referencia' ?
																{ id, api, refresh, publication: progression.publication } :
																!readOnly && id === 'cientista:producao-farmaceutica-pokemon' ?
																	{ id, api, refresh, pokemonPharmacy: character.id } :
																	!readOnly && id === 'cientista:farmacologia-avancada' ?
																		{ id, api, refresh, advancedPharmacy: character.id } :
																		!readOnly && id === 'cientista:mestre-de-formulacao' ?
																			{ id, api, refresh, masterPharmacy: character.id } :
																			!readOnly && id === 'diplomata:carta-de-apresentacao' ?
																				{ id, api, refresh, introductionLetter: progression.introductionLetter } :
																				!readOnly && id === 'diplomata:acordo-impossivel' ?
																					{ id, api, refresh, diplomatProxy: progression.diplomatProxy } :
																					!readOnly && id === 'diplomata:etiqueta-cosmopolita' ?
																						{ id, api, refresh, cosmopolitanEtiquette: progression.cosmopolitanEtiquette,
																							proficiency: progression.proficiency } :
																						!readOnly && id === 'arqueologo:acervo-compartilhado' ? { id, api, refresh, archive: {
																							slots: sheet.sharedArchives || [], proficiency: progression.proficiency,
																							knowledge: (sheet.skills?.trained || []).filter(skill => skill.startsWith('conhecimento:')),
																							recipients: progression.archiveRecipients || [],
																						} } : !readOnly && ['atleta:capitao-de-time', 'detetive:plano-de-captura'].includes(id) ?
																							{ id, api, refresh, ...(id === 'atleta:capitao-de-time' ?
																								{ captainPlan: { ...(progression.captainPlan || {}), proficiency: progression.proficiency } } :
																								{ capturePlan: { ...(progression.capturePlan || {}), proficiency: progression.proficiency } }) } :
																							!readOnly && sheet.classId === 'cozinheiro' && name === 'Refeição Revigorante' ?
																								{ id, api, refresh, revigoratingMeal: progression.revigoratingMeal } :
																								!readOnly && id === 'cozinheiro:petisco-de-amizade' ?
																									{ id, api, friendshipSnacks: progression.friendshipSnacks } :
																									!readOnly && id === 'criador-pokemon:rotina-de-enriquecimento' ?
																										{ id, api, enrichmentRoutine: progression.enrichmentRoutine } :
																										!readOnly && id === 'criador-pokemon:guardiao-de-geracoes' ?
																											{ id, api, guardianEnrichment: progression.enrichmentRoutine } :
																											!readOnly && id === 'criador-pokemon:preparacao-impecavel' ?
																												{ id, api, impeccablePreparation: progression.impeccablePreparation } :
																												!readOnly && id === 'cozinheiro:recompensa-de-treinamento' ?
																													{ id, api, trainingReward: progression.trainingReward } :
																													!readOnly && id === 'cozinheiro:harmonizacao-de-sabores' ?
																														{ id, api, contestHarmonization: progression.contestHarmonization } :
																														!readOnly && id === 'cozinheiro:racao-artesanal-pokemon' ?
																															{ id, api, artisanRation: progression.artisanRation } :
																															!readOnly && id === 'artista:arte-reconfortante' ? { id, api, refresh,
																																comfortingArt: progression.comfortingArtRecipients || [],
																																comfortingArtUses: progression.comfortingArtUses } :
																															!readOnly && id === 'ladino:armadilheiro' ?
																																{ id, api, trapmaker: true } :
																																!readOnly && id === 'ladino:armadilha-combinada' ?
																																	{ id, api, combinedTrap: true } :
																																	!readOnly && id === 'ladino:labirinto-de-gatilhos' ?
																																		{ id, api, trapLabyrinth: true } :
																																		!readOnly && id === 'encantador:disfarce-social' ?
																																			{ id, api, socialDisguise: true } :
																																			!readOnly && id === 'mentalista:palacio-da-memoria' ?
																																				{ id, api, memoryPalace: { names: sheet.memoryPalaceNames || [],
																																					limit: Math.max(1, progression.proficiency + Math.floor((sheet.attributes.intelligence - 10) / 2)) } } :
																																				!readOnly && id === 'mentalista:persona-preparada' ?
																																					{ id, api, preparedPersona: true } :
																																					!readOnly && id === 'psiquico:terceiro-olho' ?
																																						{ id, api, refresh, thirdEye: { exhaustion: sheet.survival?.exhaustion || 0,
																																							conscious: (sheet.survival?.lifeState || 'conscious') === 'conscious' } } :
																																						!readOnly && ['segundo-folego', 'sortudo', 'determinado', 'esforco-heroico'].includes(id) ?
																																							{ id, api, refresh, reroll: id !== 'segundo-folego',
																																								available: progression.rerollAvailability?.[id],
																																								used: progression.activeTalentUses?.used?.[id] === progression.activeTalentUses?.restCycle } :
																																							!readOnly && id === 'medico:protocolo-preventivo' ?
																																								{ id, api, refresh, preventiveProtocol: true } :
																																								!readOnly && id === 'medico:medicina-integrada' ?
																																									{ id, api, refresh, spriteUrl, integratedMedicine: true } :
																																									!readOnly && id === 'medico:plano-individual-de-recuperacao' ?
																																										{ id, api, individualRecoveryNote: sheet.individualRecoveryNote || '' } :
																																										!readOnly && id === 'medico:tratamento-de-queimaduras' ?
																																											{ id, api, refresh, trainerSpriteUrl, burnTreatment: true } :
																																											!readOnly && id === 'medico:estimulo-neuromuscular' ?
																																												{ id, api, refresh, trainerSpriteUrl, neuromuscularTreatment: true } :
																																												!readOnly && id === 'medico:aquecimento-controlado' ?
																																													{ id, api, refresh, trainerSpriteUrl, controlledWarming: true } :
																																													!readOnly && id === 'medico:resposta-neurologica' ?
																																														{ id, api, refresh, trainerSpriteUrl, neurologicalResponse: true } :
																																														!readOnly && id === 'medico:atendimento-emergencial' ?
																																															{ id, api, refresh, trainerSpriteUrl, emergencyCare: true } :
																																															!readOnly && id === 'medico:entre-a-vida-e-a-morte' ?
																																																{ id, api, refresh, trainerSpriteUrl, reanimation: true, rollTalents: progression.rollTalents,
																																																	medicalTrained: sheet.skills.trained.includes('medicina') } :
																																																!readOnly && id === 'medico:recuperacao-extraordinaria' ?
																																																	{ id, api, refresh, extraordinaryRecovery: progression.extraordinaryRecovery } :
																																																	!readOnly && sheet.classId === 'medico' && name === 'Recuperação Assistida' ?
																																																		{ id, api, assistedRecovery: progression.assistedRecovery } :
																																																		!readOnly && id === 'mestre-pokemon:captura-calculada' ?
																																																			{ id, api, captureCombatAttribute: sheet.captureCombatAttribute || 'dexterity' } :
																																																			!readOnly && id === 'mestre-pokemon:isca-ecologica' ?
																																																				{ id, api, ecologicalBait: true } :
																																																				!readOnly && manualRest ? { id, api, refresh, manualRest } :
																																																				!readOnly && ['cozinheiro:refeicao-reconfortante', 'cozinheiro:nutricao-de-recuperacao'].includes(id) ?
																																																					{ restStatus: mealUsed ? 'Usado neste descanso longo junto com Refeição Revigorante.' :
																																																					'Será ativado junto com Refeição Revigorante.' } : null));
			talentList.append(button);
		}
		talentSection.append(talentList);
		const domainSection = section('Domínios', 'trainer-sheet-panel trainer-sheet-domains');
		const domainList = el('div', 'trainer-sheet-domain-list');
		const ownedDomains = [...new Set(sheet.proficiencies || [])].sort((left, right) =>
			(PROFICIENCY_DOMAINS[left]?.[0] || label(left)).localeCompare(
				PROFICIENCY_DOMAINS[right]?.[0] || label(right), 'pt-BR', { sensitivity: 'base' }));
		for (const id of ownedDomains) {
			const [name, description] = PROFICIENCY_DOMAINS[id] || [label(id), 'Descrição indisponível.'];
			const button = el('button', 'trainer-sheet-talent-row', name);
			button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
			button.setAttribute('aria-expanded', 'false');
			button.addEventListener('click', () => showTalentPopover(button, name, description));
			domainList.append(button);
		}
		if (!ownedDomains.length) domainList.append(empty('Nenhum domínio adquirido.'));
		domainSection.append(domainList);
		const knowledgeSections = el('div', 'trainer-sheet-knowledge-sections');
		const talentColumn = el('div', 'trainer-sheet-talent-column');
		talentColumn.append(talentSection);
		knowledgeSections.append(talentColumn, domainSection);
		const mainStats = el('div', 'trainer-sheet-main-stats');
		mainStats.append(attributes, primaryStats, knowledgeSections);
		attributeLayout.append(mainStats, skills);
		root.append(attributeLayout);

		const survival = sheet.survival || {};
		const conditions = section('Condições e ferimentos', 'trainer-sheet-panel trainer-sheet-conditions');
		const life = { conscious: 'Consciente', dying: 'Morrendo', stable: 'Estável', dead: 'Morto' };
		conditions.append(el('p', 'trainer-sheet-status', `Estado: ${life[survival.lifeState] || 'Consciente'} · Exaustão: ${survival.exhaustion || 0}`),
			chips((survival.conditions || []).map(entry => entry.id)));
		for (const wound of survival.wounds || []) {
			conditions.append(el('p', 'trainer-sheet-wound', wound.description + (wound.treated ? ' · tratado' : ' · não tratado')));
		}
		if (masterVitalControls) {
			const edit = el('button', 'trainer-sheet-master-vitals-trigger');
			edit.type = 'button'; edit.setAttribute('aria-label', 'Alterar condições e exaustão do treinador');
			edit.addEventListener('click', () => showMasterSurvivalEditor(character, sheet, rules, api, refresh));
			conditions.append(edit);
		}
		rightStats.append(conditions);
		renderEquippedItems(root, character, sheet, progression, equipment, api, readOnly, refresh);
	}

	async function render({ api, state, master, characters = [], character, spriteUrl, trainerSpriteUrl }) {
		const tableId = state.accountSession?.activeTableId || null;
		if (selectedTable !== tableId) {
			if (closeTalentPopover) closeTalentPopover();
			selectedTable = tableId; selectedCharacter = null;
		}
		const root = el('div', 'trainer-sheet-page');
		const allowed = master ? characters : [character];
		let masterSummary = null;
		if (master) {
			const chooser = el('div', 'trainer-sheet-chooser');
			chooser.append(el('h2', '', 'Escolha um treinador'));
			for (const entry of allowed) {
				const control = el('button', 'button trainer-sheet-choice', entry.characterName || entry.id);
				control.type = 'button'; control.dataset.characterId = entry.id;
				control.addEventListener('click', () => { selectedCharacter = entry.id; void update(); });
				chooser.append(control);
			}
			root.append(chooser);
			masterSummary = el('div', 'trainer-sheet-master-summary hidden');
			root.append(masterSummary);
		}
		const content = el('div', 'trainer-sheet-content'); root.append(content);
		const active = () => master ? allowed.find(entry => entry.id === selectedCharacter) || allowed[0] : character;
		let signature = '';
		let loading = false;
		const creationState = { step: 0 };
		const refresh = async () => { signature = ''; await update(); };
		async function chooseLevelTalents() {
			const preview = await api('/trainer/level-up');
			const kinds = ['general', 'class', 'apex'].flatMap(kind =>
				Array(preview.pendingChoices?.[kind] || 0).fill(kind));
			const overlay = el('div', 'trainer-sheet-level-overlay');
			const panel = section('Escolhas do próximo nível', 'trainer-sheet-panel trainer-sheet-level-dialog');
			const caption = { general: 'Talento geral', class: 'Talento específico', apex: 'Ápice' };
			const feedback = el('p', 'trainer-sheet-progression-feedback');
			const picks = kinds.map(kind => {
				const group = el('div', 'trainer-sheet-level-choice');
				group.append(el('strong', '', caption[kind]));
				const available = preview.talents.filter(entry => entry.kind === kind && entry.available);
				const picker = select([['', 'Selecione um talento'], ...available.map(entry => [entry.id, entry.name])]);
				const description = el('p', 'trainer-sheet-choice-description');
				const fields = el('div', 'trainer-sheet-progression-line');
				const values = {};
				picker.addEventListener('change', () => {
					fields.replaceChildren(); Object.keys(values).forEach(key => delete values[key]);
					const chosen = available.find(entry => entry.id === picker.value);
					description.replaceChildren(...renderTrainerDescription(chosen?.text || '').childNodes);
					if (!chosen) return;
					const field = (key, options) => {
						const control = select([['', `Escolha ${key}`], ...options]);
						control.addEventListener('change', () => { values[key] = control.value; });
						fields.append(control);
						return control;
					};
					if (chosen.attributeChoices?.length) field('attribute', chosen.attributeChoices.map(id =>
						[id, ATTRIBUTES.find(entry => entry[0] === id)?.[1] || label(id)]));
					if (chosen.choiceFields?.skill) field('skill',
						chosen.id === 'conhecimento-diversificado' ?
							(chosen.variantChoices || []).map(id => [id, skillLabel(id)]) :
							(progressionForChoice.skills || []).filter(entry =>
								!['conhecimento', 'oficio'].includes(entry.id) &&
								(chosen.id === 'treinamento-adicional' ? !entry.trained :
								entry.trained && (chosen.id !== 'foco-em-pericia' || !entry.focused) &&
								(chosen.id !== 'competencia-pratica' || !(progressionForChoice.sheet.talentSelections || [])
									.some(selection => selection.id === chosen.id && selection.skill === entry.id))))
								.map(entry => [entry.id, skillLabel(entry.id)]));
					if (chosen.choiceFields?.resistance) field('resistance',
						(progressionForChoice.resistances || []).filter(entry => !entry.trained)
							.map(entry => [entry.id, RESISTANCES[entry.id] || entry.id]));
					if (chosen.choiceFields?.proficiency) field('proficiency',
						Object.entries(PROFICIENCY_DOMAINS).filter(([id]) =>
							id.startsWith(chosen.id === 'dominio-de-kit' ? 'kit-' : 'armas-') &&
							!(progressionForChoice.sheet.proficiencies || []).includes(id))
							.map(([id, info]) => [id, info[0]]));
					if (chosen.choiceFields?.variant) {
						if (chosen.variantChoices) {
							const second = field('variant', chosen.variantChoices.map(id =>
								[id, variantLabel(chosen.id, id)]));
							if (['conhecimento-diversificado', 'competencia-pratica'].includes(chosen.id)) {
								const first = fields.querySelector('select');
								const update = () => {
									const unavailable = chosen.id === 'conhecimento-diversificado' ? [first.value] :
										(progressionForChoice.skills || []).find(entry => entry.id === first.value)?.attributes || [];
									for (const option of second.options) option.disabled = !!first.value && unavailable.includes(option.value);
									if (first.value && unavailable.includes(second.value)) { second.value = ''; delete values.variant; }
								};
								first.addEventListener('change', update); update();
							}
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = chosen.id === 'artista:artista-versatil' ? 'Modalidade artística 1' :
								chosen.id.startsWith('atleta:') ? 'Modalidade esportiva 1' : 'Área ou variante';
							input.maxLength = 80;
							input.addEventListener('input', () => { values.variant = input.value.trim(); });
							fields.append(input);
						}
					}
					if (chosen.choiceFields?.secondVariant) {
						if (chosen.id === 'cientista:autoridade-cientifica') {
							field('secondVariant', chosen.variantChoices.map(id => [id, skillLabel(id)]));
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = chosen.id === 'atleta:atleta-polivalente' ?
								'Modalidade esportiva 2' : 'Modalidade artística 2'; input.maxLength = 80;
							input.addEventListener('input', () => { values.secondVariant = input.value.trim(); });
							fields.append(input);
						}
					}
					if (chosen.choiceFields?.thirdVariant) {
						if (chosen.id === 'cientista:autoridade-cientifica') {
							field('thirdVariant', chosen.variantChoices.map(id => [id, skillLabel(id)]));
						} else {
							const input = el('input', 'trainer-sheet-progression-input');
							input.placeholder = 'Modalidade esportiva 3'; input.maxLength = 80;
							input.addEventListener('input', () => { values.thirdVariant = input.value.trim(); });
							fields.append(input);
						}
					}
				});
				group.append(picker, description, fields); panel.append(group);
				return () => {
					const chosen = available.find(entry => entry.id === picker.value);
					if (!chosen || (chosen.attributeChoices?.length && !values.attribute) ||
						Object.entries(chosen.choiceFields || {}).some(([key, needed]) => needed && !values[key])) {
						throw new Error(`Complete a escolha: ${caption[kind]}.`);
					}
					const modalityError = talentModalityError(progressionForChoice.sheet, { id: chosen.id, ...values });
					if (modalityError) throw new Error(modalityError);
					return { id: chosen.id, ...values };
				};
			});
			const actions = el('div', 'trainer-sheet-progression-line');
			const cancel = el('button', 'button', 'Cancelar'); cancel.type = 'button';
			const confirm = el('button', 'button', 'Confirmar atualização'); confirm.type = 'button';
			const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
			const onKey = event => { if (event.key === 'Escape') close(); };
			cancel.addEventListener('click', close);
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
			confirm.addEventListener('click', async () => {
				try {
					const choices = picks.map(pick => pick());
					confirm.disabled = true;
					await api('/trainer/level-up', { method: 'POST', body: { choices } });
					close(); await refresh();
				} catch (error) {
					feedback.textContent = error.message || 'Não foi possível atualizar a ficha.';
					confirm.disabled = false;
				}
			});
			actions.append(cancel, confirm); panel.append(actions, feedback); overlay.append(panel);
			document.body.append(overlay); document.addEventListener('keydown', onKey);
		}
		let progressionForChoice = null;
		function updateLevelButton(progression) {
			progressionForChoice = progression;
			const host = master ? masterSummary : document.getElementById('dashboard-title')?.closest('.dashboard-heading');
			host?.querySelector('.trainer-sheet-level-button')?.remove();
			if (master || state.session?.role === 'master' || state.tableReadOnly ||
				progression?.sheet?.survival?.lifeState === 'dead' ||
				!progression?.canLevelUp || !host) return;
			const button = el('button', 'trainer-sheet-level-button', 'Atualizar');
			button.type = 'button';
			button.addEventListener('click', async () => {
				button.disabled = true;
				try { await chooseLevelTalents(); button.disabled = false; } catch (error) {
					button.textContent = error.message || 'Não foi possível preparar as escolhas.';
					button.disabled = false;
				}
			});
			host.append(button);
		}
		async function update() {
			if (!root.isConnected || loading) return;
			const target = active();
			if (!target) { content.replaceChildren(empty('Nenhum treinador nesta mesa.')); return; }
			loading = true;
			try {
				const query = master ? `?characterId=${encodeURIComponent(target.id)}` : '';
				const progression = await api('/trainer/sheet' + query);
				if (progression.sheet?.status !== 'complete') {
					const creation = !master && state.session?.role === 'player' && !state.tableReadOnly ?
						await api('/trainer/creation') : null;
					if (!root.isConnected || active()?.id !== target.id) return;
					const nextSignature = JSON.stringify([tableId, target.id, progression.sheet, creation]);
					if (nextSignature !== signature) {
						signature = nextSignature;
						root.querySelector('.trainer-sheet-progression-controls')?.remove();
						updateTrainerHeading(progression.sheet, progression, null, masterSummary);
						updateLevelButton(progression);
						if (creation) {
							const refreshCreation = async () => { signature = ''; await update(); };
							renderCreationWizard(content, creation, api, refreshCreation, refreshCreation,
								creationState, true);
						} else renderSheet(content, target, progression.sheet, progression, null, null, api,
							state.tableReadOnly || master, null, false, spriteUrl, false, trainerSpriteUrl);
					}
					return;
				}
				const [rules, talents, equipmentResult] = await Promise.all([
					api('/trainer/rules'), api('/trainer/talents' + query),
					api('/trainer/equipment' + query).then(value => ({ value }), error => ({ error })),
				]);
				if (!root.isConnected || active()?.id !== target.id) return;
				const equipment = equipmentResult.value || null;
				const nextSignature = JSON.stringify([tableId, target.id, progression, talents.sheet,
					equipment?.inventory?.revision, !!equipmentResult.error]);
				if (nextSignature !== signature) {
					signature = nextSignature;
					updateTrainerHeading(progression.sheet, progression, rules, masterSummary);
					updateLevelButton(progression);
					root.querySelector('.trainer-sheet-progression-controls')?.remove();
					renderSheet(content, target, progression.sheet, progression, talents, rules, api,
						state.tableReadOnly || master, refresh, master && !state.tableReadOnly, spriteUrl,
						!master && state.session?.role === 'master', trainerSpriteUrl,
						state.session?.role === 'master' &&
						(master || state.session?.mode === 'player') && !state.tableReadOnly, equipment);
					const controls = content.querySelector('.trainer-sheet-progression-controls');
					if (controls && masterSummary) root.insertBefore(controls, masterSummary);
				}
				root.querySelectorAll('.trainer-sheet-choice').forEach(node =>
					node.classList.toggle('active', node.dataset.characterId === target.id));
			} catch (error) {
				if (!signature) content.replaceChildren(empty(error.message || 'Não foi possível carregar a ficha.'));
			} finally { loading = false; }
		}
		function sync(event) {
			if (!root.isConnected) { window.removeEventListener('rpg:realtime-sync', sync); return; }
			if (event.detail?.tableId === tableId) void update();
		}
		window.addEventListener('rpg:realtime-sync', sync);
		setTimeout(() => void update(), 0);
		return root;
	}
	window.RPGTrainerSheetUI = { render, mountCreationWizard, backCreationWizard };
})();
