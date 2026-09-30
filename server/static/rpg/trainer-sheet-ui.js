(function () {
	'use strict';

	const ATTRIBUTES = [
		['strength', 'Força'], ['dexterity', 'Destreza'], ['constitution', 'Constituição'],
		['intelligence', 'Inteligência'], ['wisdom', 'Sabedoria'], ['charisma', 'Carisma'],
	];
	const RESISTANCES = { fortitude: 'Fortitude', reflexes: 'Reflexos', will: 'Vontade' };
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
	function label(id) {
		return String(id || '').replace(/[-_]/g, ' ').replace(/\b\p{L}/gu, letter => letter.toUpperCase());
	}
	function skillLabel(id) {
		const [family, domain] = String(id).split(':');
		if (!domain) return family === 'conhecimento' ? 'Conhecimento (área à escolha)' :
			family === 'oficio' ? 'Ofício (área à escolha)' : SKILLS[family] || label(family);
		return `${SKILLS[family] || label(family)}: ${SKILL_DOMAINS[domain] || label(domain)}`;
	}
	function skillRow(entry, domainOnly = false, roll = null) {
		const clickable = !!roll && entry.bonus != null;
		const row = el(clickable ? 'button' : 'div', 'trainer-sheet-list-row' +
			(entry.focused ? ' focused' : entry.trained ? ' trained' : '') +
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
	function showRollPopover(button, name, kind, id, characterId, api) {
		if (closeAttributePopover) closeAttributePopover();
		if (closeSkillPopover) closeSkillPopover();
		if (closeTalentPopover) closeTalentPopover();
		const panel = el('div', 'trainer-sheet-attribute-popover');
		panel.append(el('strong', '', `Rolar ${name}`));
		let selectedAttribute;
		if (kind === 'skill' && id === 'intimidacao') {
			const attributeChoice = select([['strength', 'Força'], ['charisma', 'Carisma']]);
			attributeChoice.className = 'trainer-sheet-roll-attribute';
			attributeChoice.setAttribute('aria-label', 'Atributo para Intimidação');
			attributeChoice.addEventListener('change', () => { selectedAttribute = attributeChoice.value; });
			panel.append(attributeChoice);
		}
		const error = el('p', 'trainer-sheet-roll-error hidden');
		for (const [mode, caption] of [
			['advantage', 'Vantagem'], ['normal', 'Normal'], ['disadvantage', 'Desvantagem'],
		]) {
			const choice = el('button', 'trainer-sheet-roll-choice', caption);
			choice.type = 'button';
			choice.addEventListener('click', async () => {
				panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
				try {
					await api(`/trainer/${kind}-roll`, { method: 'POST',
						body: { characterId, [kind]: id, mode,
							...(selectedAttribute ? { attribute: selectedAttribute } : {}) } });
					close();
					window.dispatchEvent(new CustomEvent('rpg:realtime-sync', { detail: { tableId: selectedTable } }));
				} catch (failure) {
					error.textContent = failure.message || 'Não foi possível fazer a rolagem.';
					error.classList.remove('hidden');
					panel.querySelectorAll('button').forEach(item => { item.disabled = false; });
				}
			});
			panel.append(choice);
		}
		panel.append(error);
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
			window.removeEventListener('scroll', close, true);
			window.removeEventListener('resize', close);
			if (closeAttributePopover === close) closeAttributePopover = null;
		}
		function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
		function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } }
		closeAttributePopover = close;
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
	}
	function showTalentPopover(button, name, description) {
		if (closeTalentPopover) closeTalentPopover();
		if (closeSkillPopover) closeSkillPopover();
		if (closeAttributePopover) closeAttributePopover();
		const panel = el('div', 'trainer-sheet-talent-popover');
		panel.append(el('strong', 'trainer-sheet-talent-popover-title', name),
			el('div', 'trainer-sheet-talent-description', String(description || 'Descrição indisponível.')
				.replace(/```[^\n]*\n/g, '').replace(/```|\*\*|`/g, '')));
		document.body.append(panel);
		const rect = button.getBoundingClientRect();
		panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12))}px`;
		panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 12))}px`;
		button.setAttribute('aria-expanded', 'true');
		function close() {
			panel.remove(); button.setAttribute('aria-expanded', 'false');
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
			window.removeEventListener('scroll', scroll, true);
			window.removeEventListener('resize', close);
			if (closeTalentPopover === close) closeTalentPopover = null;
		}
		function outside(event) { if (!panel.contains(event.target) && !button.contains(event.target)) close(); }
		function escape(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); } }
		function scroll(event) { if (!panel.contains(event.target)) close(); }
		closeTalentPopover = close;
		document.addEventListener('pointerdown', outside);
		document.addEventListener('keydown', escape);
		window.addEventListener('scroll', scroll, true);
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
				`${xp.format(sheet.experience)} / ${xp.format(sheet.experience + progression.xpToNextLevel)}`],
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
	function renderSheet(root, character, sheet, progression, talents, rules, api, readOnly) {
		if (closeSkillPopover) closeSkillPopover();
		if (closeAttributePopover) closeAttributePopover();
		if (closeTalentPopover) closeTalentPopover();
		root.replaceChildren();
		if (!sheet || sheet.status !== 'complete') {
			root.append(empty(`${character.characterName || 'Este treinador'} ainda não concluiu a criação da ficha.`));
			return;
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
				tile.addEventListener('click', () => showRollPopover(tile, name, 'attribute', id, character.id, api));
			}
			tile.append(el('span', 'trainer-sheet-attribute-name', name),
				el('strong', 'trainer-sheet-attribute-modifier', signed(Math.floor((value - 10) / 2))),
				el('small', 'trainer-sheet-attribute-value', value));
			attributeGrid.append(tile);
		}
		const primaryStats = el('div', 'trainer-sheet-primary-stats');
		const hp = section('PV', 'trainer-sheet-panel trainer-sheet-primary-stat');
		hp.append(el('strong', '', `${sheet.hitPoints.current ?? '—'} / ${sheet.hitPoints.maximum ?? '—'}`));
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
			roll.addEventListener('click', () => showRollPopover(roll, 'Iniciativa', 'initiative', '', character.id, api));
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
					row, RESISTANCES[entry.id], 'resistance', entry.id, character.id, api));
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
				row.addEventListener('click', () => showRollPopover(row, name, 'attack', id, character.id, api));
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
			button, name, 'skill', entry.id, character.id, api);
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

		const talentNames = Object.fromEntries((talents?.talents || []).map(entry => [entry.id, entry.name]));
		const talentDescriptions = new Map([
			...(rules?.classFeatures?.[sheet.classId] || []).map(entry => [entry.name, entry.text]),
			...(talents?.talents || []).map(entry => [entry.name, entry.text]),
		]);
		const talentSection = section('Talentos', 'trainer-sheet-panel trainer-sheet-talents');
		const sortNames = names => [...new Set(names.filter(Boolean))]
			.sort((left, right) => left.localeCompare(right, 'pt-BR', { sensitivity: 'base' }));
		const acquired = ids => (ids || []).map(id => talentNames[id] || id);
		const classTalents = sortNames([
			...(rules?.classFeatures?.[sheet.classId] || []).map(feature => feature.name),
			...acquired(sheet.talents?.class),
		]);
		const apexTalents = acquired(sheet.talents?.apex ? [sheet.talents.apex] : []);
		const generalTalents = sortNames(acquired(sheet.talents?.general));
		const talentList = el('div', 'trainer-sheet-talent-list');
		for (const name of [...classTalents, ...apexTalents, ...generalTalents]) {
			const button = el('button', 'trainer-sheet-talent-row', name);
			button.type = 'button'; button.setAttribute('aria-haspopup', 'dialog');
			button.setAttribute('aria-expanded', 'false');
			button.addEventListener('click', () => showTalentPopover(button, name, talentDescriptions.get(name)));
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
		knowledgeSections.append(talentSection, domainSection);
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
		rightStats.append(conditions);
	}

	async function render({ api, state, master, characters = [], character }) {
		const tableId = state.accountSession?.activeTableId || null;
		if (selectedTable !== tableId) { selectedTable = tableId; selectedCharacter = null; }
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
						updateTrainerHeading(progression.sheet, progression, null, masterSummary);
						if (creation) {
							const refreshCreation = async () => { signature = ''; await update(); };
							renderCreationWizard(content, creation, api, refreshCreation, refreshCreation,
								creationState, true);
						} else renderSheet(content, target, progression.sheet, progression, null, null, api,
							state.tableReadOnly || master);
					}
					return;
				}
				const [rules, talents] = await Promise.all([api('/trainer/rules'), api('/trainer/talents' + query)]);
				if (!root.isConnected || active()?.id !== target.id) return;
				const nextSignature = JSON.stringify([tableId, target.id, progression, talents.sheet]);
				if (nextSignature !== signature) {
					signature = nextSignature;
					updateTrainerHeading(progression.sheet, progression, rules, masterSummary);
					renderSheet(content, target, progression.sheet, progression, talents, rules, api,
						state.tableReadOnly || master);
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
