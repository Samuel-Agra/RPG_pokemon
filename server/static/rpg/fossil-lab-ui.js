(function () {
	'use strict';
	let currentTab = 'restore';
	let selectedId = null;
	let filter = 'fragmented';
	let timer = null;

	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const money = value => new Intl.NumberFormat('pt-BR').format(value || 0) + ' ₽';
	const duration = milliseconds => {
		if (milliseconds <= 0) return 'Concluído';
		const hours = Math.ceil(milliseconds / 3_600_000);
		const days = Math.floor(hours / 24);
		return days ? `${days}d ${hours % 24}h` : `${hours}h`;
	};
	function fossilIcon(fossil, large = false) {
		const frame = el('span', 'fossil-item-sprite' + (large ? ' large' : ''));
		const icon = typeof rpgRuntimeItemIcon === 'function' ? rpgRuntimeItemIcon(fossil) : null;
		if (icon) frame.append(icon);
		else frame.append(el('span', 'fossil-sprite-fallback', '?'));
		return frame;
	}

	async function render(options) {
		if (timer) window.clearInterval(timer);
		const root = el('div', 'fossil-lab');
		root.append(el('div', 'fossil-loading', 'Preparando o laboratório...'));
		const query = options.characterId ? '?characterId=' + encodeURIComponent(options.characterId) : '';
		let view = (await options.api('/fossil-lab' + query)).fossilLab;

		async function action(name, body) {
			try {
				const result = await options.api('/fossil-lab/' + name, {
					method: 'POST', body: {characterId: options.characterId, ...body},
				});
				view = result.fossilLab;
				paint();
				return result;
			} catch (error) {
				options.toast(error.message, true);
			}
		}

		function tabs() {
			const bar = el('nav', 'fossil-tabs');
			for (const [id, label, locked] of [
				['restore', 'Restauração', false],
				['archive', 'Arquivo Paleontológico', false],
				['experimental', 'Pesquisa Experimental', true],
			]) {
				const button = el('button', 'fossil-tab' + (currentTab === id ? ' active' : '') + (locked ? ' locked' : ''), label);
				if (locked) button.append(el('span', 'fossil-lock', 'Bloqueada'));
				button.addEventListener('click', () => { currentTab = id; paint(); });
				bar.append(button);
			}
			return bar;
		}

		function header() {
			const head = el('header', 'fossil-header');
			const title = el('div');
			title.append(el('span', 'fossil-eyebrow', 'LABORATÓRIO PALEONTOLÓGICO'));
			title.append(el('h1', '', 'Restauração de Fósseis'));
			title.append(el('p', '', 'Analise fósseis e restaure Pokémon extintos.'));
			const stats = el('div', 'fossil-header-stats');
			stats.append(stat('Pokécoins', money(view.money)), stat('Fósseis', String(view.totalFossils)));
			head.append(title, stats);
			return head;
		}

		function stat(label, value) {
			const box = el('div', 'fossil-head-stat');
			box.append(el('small', '', label), el('strong', '', value));
			return box;
		}

		function inventory() {
			const panel = el('section', 'fossil-panel fossil-inventory');
			panel.append(el('h2', '', 'Inventário de fósseis'));
			const filters = el('div', 'fossil-filters');
			for (const [id, label] of [['fragmented', 'Fragmentados'], ['preserved', 'Preservados'], ['exceptional', 'Excepcionais']]) {
				const button = el('button', filter === id ? 'active' : '', label);
				button.addEventListener('click', () => { filter = id; paint(); });
				filters.append(button);
			}
			panel.append(filters);
			const list = el('div', 'fossil-list');
			const entries = view.fossils.filter(fossil => fossil.quantity > 0 && fossil.quality === filter);
			if (!entries.length) list.append(el('p', 'fossil-empty', 'Nenhum fóssil nesta categoria.'));
			for (const fossil of entries) {
				const card = el('button', 'fossil-card' + (selectedId === fossil.sampleKey ? ' selected' : ''));
				const info = el('span', 'fossil-card-info');
				info.append(el('strong', '', fossil.name), el('small', '', '×' + fossil.quantity));
				if (fossil.qualityLabel) info.append(el('span', 'fossil-quality ' + fossil.quality, fossil.qualityLabel));
				card.append(fossilIcon(fossil), info);
				card.addEventListener('click', () => { selectedId = fossil.sampleKey; paint(); });
				list.append(card);
			}
			panel.append(list);
			return panel;
		}

		function analysis(fossil) {
			const panel = el('section', 'fossil-panel fossil-analysis');
			panel.append(el('h2', '', 'Análise paleogenética'));
			if (!fossil) { panel.append(el('p', 'fossil-empty', 'Selecione um fóssil para iniciar a análise.')); return panel; }
			const hero = el('div', 'fossil-analysis-hero' + (fossil.genomeKnown ? ' identified' : ''));
			if (!fossil.genomeKnown) {
				const info = el('div');
				info.append(el('h3', '', fossil.name), el('span', 'fossil-quality ' + fossil.quality, fossil.qualityLabel));
				hero.append(fossilIcon(fossil, true), info); panel.append(hero);
				panel.append(el('strong', 'fossil-genome', 'Genoma conhecido: ' + fossil.genome + '%'));
				const genome = el('div', 'fossil-progress'); genome.append(el('i'));
				genome.firstChild.style.width = fossil.genome + '%'; panel.append(genome);
				const actions = el('div', 'fossil-analysis-actions');
				const analyze = el('button', 'button fossil-primary', 'Analisar');
				analyze.addEventListener('click', () => action('analyze', {itemId: fossil.itemId, quality: fossil.quality}));
				const donate = el('button', '', 'Doar');
				donate.addEventListener('click', () => window.confirm('Doar esta amostra?') &&
					action('donate', {itemId: fossil.itemId, quality: fossil.quality}));
				const sell = el('button', '', 'Vender por ' + money(fossil.sellPrice));
				sell.addEventListener('click', () => window.confirm('Vender esta amostra?') &&
					action('sell', {itemId: fossil.itemId, quality: fossil.quality}));
				actions.append(analyze, donate, sell); panel.append(actions);
				return panel;
			}
			const identity = el('div', 'fossil-identity');
			const fossilSprite = fossilIcon(fossil, true);
			const pokemon = el('img', 'fossil-species-sprite');
			pokemon.src = options.spriteUrl({species: fossil.displaySpecies}); pokemon.alt = '';
			const names = el('div');
			names.append(el('small', '', fossil.name), el('h3', '', fossil.displaySpecies),
				el('span', 'fossil-quality ' + fossil.quality, fossil.qualityLabel));
			identity.append(fossilSprite, pokemon, names); hero.append(identity); panel.append(hero);
			const data = el('dl', 'fossil-data');
			data.append(el('dt', '', 'Era'), el('dd', '', fossil.era),
				el('dt', '', 'DNA necessário'), el('dd', '', fossil.dnaNeeded + ' amostras'),
				el('dt', '', 'Valor genético por amostra'), el('dd', '', fossil.contribution + '%'));
			panel.append(data);
			return panel;
		}

		function methods(fossil) {
			const panel = el('section', 'fossil-panel fossil-methods');
			panel.append(el('h2', '', 'Método de restauração'));
			if (!fossil?.genomeKnown || fossil.experimental) {
				panel.append(el('p', 'fossil-empty', fossil?.experimental ? 'Pesquisa Experimental necessária.' : 'Conclua a análise para escolher um método.'));
				return panel;
			}
			let method = 'standard';
			const sampleRow = el('label', 'fossil-sample-count');
			sampleRow.append(el('span', '', 'Amostras'));
			const sampleCount = el('input'); sampleCount.type = 'number'; sampleCount.min = '1';
			sampleCount.max = String(fossil.quantity); sampleCount.value = '1';
			const chanceValue = el('strong', '', fossil.contribution + '%');
			const chanceRow = el('p', 'fossil-restoration-chance');
			chanceRow.append('Chance de restauração ', chanceValue);
			sampleCount.addEventListener('input', () => {
				const count = Math.max(1, Math.min(fossil.quantity, Number(sampleCount.value) || 1));
				sampleCount.value = String(count); chanceValue.textContent = Math.min(100, count * fossil.contribution) + '%';
			});
			sampleRow.append(sampleCount, el('small', '', 'de ' + fossil.quantity + ' disponíveis'));
			panel.append(sampleRow, chanceRow);
			const choices = el('div', 'fossil-method-choices');
			const advancedFields = el('div', 'fossil-advanced hidden');
			const standard = methodCard('standard', 'Padrão', 'Espécie garantida; características naturais aleatórias.', 12000, '2 dias');
			const advanced = methodCard('advanced', 'Avançado', 'Escolha natureza, habilidade disponível e sexo.', 30000, '4 dias');
			standard.classList.add('selected');
			for (const card of [standard, advanced]) card.addEventListener('click', () => {
				method = card.dataset.method; standard.classList.toggle('selected', method === 'standard');
				advanced.classList.toggle('selected', method === 'advanced');
				advancedFields.classList.toggle('hidden', method !== 'advanced');
				summaryCost.textContent = money(method === 'advanced' ? 30000 : 12000);
				summaryTime.textContent = method === 'advanced' ? '4 dias' : '2 dias';
			});
			choices.append(standard, advanced); panel.append(choices);
			const nature = selectField('Natureza', fossil.natures);
			const ability = selectField('Habilidade', fossil.abilities);
			const genders = fossil.genders.map(value => ({value, label: value === 'M' ? 'Macho' : value === 'F' ? 'Fêmea' : 'Sem sexo'}));
			const gender = selectField('Sexo', genders);
			advancedFields.append(nature.wrap, ability.wrap, gender.wrap); panel.append(advancedFields);
			const summary = el('div', 'fossil-project-summary');
			summary.append(el('h3', '', 'Resumo do projeto'));
			const row1 = el('p'); row1.append('Custo ', summaryCost = el('strong', '', money(12000)));
			const row2 = el('p'); row2.append('Prazo ', summaryTime = el('strong', '', '2 dias'));
			const start = el('button', 'button fossil-primary', 'Iniciar restauração');
			start.addEventListener('click', () => action('start', {itemId: fossil.itemId, quality: fossil.quality,
				sampleCount: Number(sampleCount.value), method, nature: nature.select.value,
				ability: ability.select.value, gender: gender.select.value}));
			summary.append(row1, row2, start); panel.append(summary);
			return panel;
			var summaryCost, summaryTime;
		}

		function methodCard(id, title, description, cost, time) {
			const card = el('button', 'fossil-method'); card.dataset.method = id;
			card.append(el('strong', '', title), el('span', '', description), el('small', '', money(cost) + ' · ' + time));
			return card;
		}
		function selectField(label, values) {
			const wrap = el('label'); wrap.append(el('span', '', label));
			const select = el('select');
			for (const item of values) {
				const option = el('option', '', typeof item === 'string' ? item : item.label);
				option.value = typeof item === 'string' ? item : item.value; select.append(option);
			}
			wrap.append(select); return {wrap, select};
		}

		function projects() {
			const section = el('section', 'fossil-projects'); section.append(el('h2', '', 'Restaurações em andamento'));
			const list = el('div', 'fossil-project-list');
			if (!view.projects.length) list.append(el('p', 'fossil-empty', 'Nenhum projeto ativo.'));
			for (const project of view.projects) {
				const card = el('article', 'fossil-project' + (project.complete ? ' complete' : ''));
				const top = el('div', 'fossil-project-top');
				const sprite = el('img'); sprite.src = options.spriteUrl({species: project.species}); sprite.alt = '';
				const title = el('div'); title.append(el('strong', '', project.species + ' · Nv. 1'), el('small', '', project.phase));
				const remaining = el('span', 'fossil-remaining', duration(project.remainingMs));
				top.append(sprite, title, remaining); card.append(top);
				const progress = el('div', 'fossil-progress'); progress.append(el('i'));
				progress.firstChild.style.width = Math.round(project.progress * 100) + '%'; card.append(progress);
				const phases = el('div', 'fossil-phases');
				['Análise', 'Extração', 'DNA', 'Regeneração', 'Estabilização', 'Completo'].forEach((phase, index) =>
					phases.append(el('span', project.progress * 5 >= index ? 'done' : '', phase)));
				card.append(phases);
				if (project.complete) {
					const receive = el('button', 'button fossil-primary', 'Receber na Box');
					receive.addEventListener('click', async () => {
						const result = await action('receive', {projectId: project.id});
						if (result) options.toast(result.pokemon.species + ' foi enviado para a Box.');
					});
					card.append(receive);
				}
				list.append(card);
			}
			section.append(list); return section;
		}

		function archive() {
			const wrap = el('section', 'fossil-archive');
			const intro = el('div', 'fossil-panel fossil-archive-intro');
			intro.append(el('h2', '', 'Arquivo Paleontológico'), el('p', '', 'Cada nova amostra amplia o conhecimento genético registrado pelo laboratório.'));
			wrap.append(intro);
			const grid = el('div', 'fossil-archive-grid');
			for (const entry of view.archive) {
				const card = el('article', 'fossil-archive-card' + (entry.discovered ? '' : ' unknown'));
				const sprite = el('div', 'fossil-archive-sprite');
				if (entry.discovered) { const img = el('img'); img.src = options.spriteUrl({species: entry.species}); img.alt = ''; sprite.append(img); }
				else sprite.textContent = '?';
				card.append(sprite, el('h3', '', entry.species));
				if (entry.discovered) {
					card.append(el('p', '', entry.era + ' · ' + entry.habitat), el('p', '', 'Dieta: ' + entry.diet));
					card.append(el('small', '', `Fósseis encontrados: ${entry.fossilsFound} · Restaurações: ${entry.restorations}`));
				}
				const progress = el('div', 'fossil-progress'); progress.append(el('i')); progress.firstChild.style.width = entry.genome + '%';
				card.append(el('strong', 'fossil-genome', 'Genoma conhecido: ' + entry.genome + '%'), progress); grid.append(card);
			}
			wrap.append(grid); return wrap;
		}

		function experimental() {
			const panel = el('section', 'fossil-panel fossil-experimental');
			panel.append(el('div', 'fossil-experimental-icon', '🔒'), el('h2', '', 'Pesquisa Experimental'),
				el('p', '', 'Módulo preparado para reconstruções híbridas de Galar.'),
				el('span', 'fossil-quality fragmented', 'Ainda bloqueado'));
			return panel;
		}

		function paint() {
			const currentList = root.querySelector('.fossil-list');
			const scroll = {
				pageX: window.scrollX,
				pageY: window.scrollY,
				listTop: currentList?.scrollTop || 0,
				listLeft: currentList?.scrollLeft || 0,
			};
			root.replaceChildren(header(), tabs());
			if (currentTab === 'archive') root.append(archive());
			else if (currentTab === 'experimental') root.append(experimental());
			else {
				const available = view.fossils.filter(fossil => fossil.quantity > 0);
				if (!available.some(fossil => fossil.sampleKey === selectedId)) {
					selectedId = available.find(fossil => fossil.quality === filter)?.sampleKey || available[0]?.sampleKey || null;
				}
				const selected = view.fossils.find(fossil => fossil.sampleKey === selectedId);
				const workspace = el('div', 'fossil-workspace'); workspace.append(inventory(), analysis(selected), methods(selected));
				root.append(workspace, projects());
			}
			const restoreScroll = () => {
				const nextList = root.querySelector('.fossil-list');
				if (nextList) {
					nextList.scrollTop = scroll.listTop;
					nextList.scrollLeft = scroll.listLeft;
				}
				window.scrollTo(scroll.pageX, scroll.pageY);
			};
			restoreScroll();
			window.requestAnimationFrame(restoreScroll);
		}

		paint();
		timer = window.setInterval(() => {
			root.querySelectorAll('.fossil-remaining').forEach((node, index) => {
				const project = view.projects[index]; if (project) node.textContent = duration(Math.max(0, project.completesAt - Date.now()));
			});
		}, 60_000);
		return root;
	}

	window.RPGFossilLabUI = {render};
})();
