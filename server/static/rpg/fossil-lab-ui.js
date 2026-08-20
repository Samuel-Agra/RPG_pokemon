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
			for (const [id, label] of [['fragmented', 'Fragm.'], ['preserved', 'Pres.'], ['exceptional', 'Excep.']]) {
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
			const fossilSprite = fossilIcon(fossil);
			const pokemon = el('img', 'fossil-species-sprite');
			pokemon.src = options.spriteUrl({species: fossil.displaySpecies}); pokemon.alt = '';
			const names = el('div');
			names.append(el('small', '', fossil.name), el('h3', '', fossil.displaySpecies),
				el('span', 'fossil-quality ' + fossil.quality, fossil.qualityLabel));
			identity.append(pokemon, fossilSprite, names); hero.append(identity); panel.append(hero);
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
			const qualities = [
				['fragmented', 'Fragm.', 10],
				['preserved', 'Pres.', 20],
				['exceptional', 'Excep.', 50],
			];
			const quantities = fossil.qualityQuantities || {[fossil.quality]: fossil.quantity};
			const sampleInputs = {};
			const sampleGrid = el('div', 'fossil-sample-grid');
			for (const [quality, label, contribution] of qualities) {
				const card = el('label', 'fossil-sample-box ' + quality);
				card.append(el('span', '', label));
				const input = el('input');
				const available = Number(quantities[quality]) || 0;
				input.type = 'number'; input.min = '0'; input.max = String(available);
				input.value = fossil.quality === quality && available ? '1' : '0';
				input.dataset.contribution = String(contribution);
				sampleInputs[quality] = input;
				card.append(input, el('small', '', '×' + available));
				sampleGrid.append(card);
			}
			const chanceValue = el('strong', '', '0%');
			const chanceRow = el('p', 'fossil-restoration-chance');
			chanceRow.append('Chance de resta\u00e7\u00e3o ', chanceValue);
			const updateChance = changedQuality => {
				if (changedQuality) {
					const input = sampleInputs[changedQuality];
					const contribution = Number(input.dataset.contribution);
					const usedByOthers = qualities.reduce((total, [quality]) =>
						quality === changedQuality ? total :
							total + Math.max(0, Math.floor(Number(sampleInputs[quality].value) || 0)) *
							Number(sampleInputs[quality].dataset.contribution), 0);
					const available = Number(quantities[changedQuality]) || 0;
					const allowed = Math.max(0, Math.min(available, Math.floor((100 - usedByOthers) / contribution)));
					input.value = String(Math.max(0, Math.min(allowed, Math.floor(Number(input.value) || 0))));
				} else {
					let remaining = 100;
					for (const [quality, , contribution] of qualities) {
						const input = sampleInputs[quality];
						const available = Number(quantities[quality]) || 0;
						const allowed = Math.max(0, Math.min(available, Math.floor(remaining / contribution)));
						const count = Math.max(0, Math.min(allowed, Math.floor(Number(input.value) || 0)));
						input.value = String(count);
						remaining -= count * contribution;
					}
				}
				let chance = 0;
				for (const [quality] of qualities) {
					const count = Math.max(0, Math.floor(Number(sampleInputs[quality].value) || 0));
					chance += count * Number(sampleInputs[quality].dataset.contribution);
				}
				for (const [quality] of qualities) {
					const input = sampleInputs[quality];
					const contribution = Number(input.dataset.contribution);
					const own = Math.max(0, Math.floor(Number(input.value) || 0));
					const otherChance = chance - own * contribution;
					input.max = String(Math.max(0, Math.min(Number(quantities[quality]) || 0,
						Math.floor((100 - otherChance) / contribution))));
				}
				chanceValue.textContent = chance + '%';
			};
			for (const [quality] of qualities) {
				sampleInputs[quality].addEventListener('input', () => updateChance(quality));
			}
			updateChance();
			panel.append(sampleGrid, chanceRow);
			const choices = el('div', 'fossil-method-choices');
			const advancedFields = el('div', 'fossil-advanced locked');
			const standard = methodCard('standard', 'Padrão', 'Características naturais aleatórias; respeita a chance genética.', 12000, '2 dias');
			const advanced = methodCard('advanced', 'Avançado', 'Escolha natureza, habilidade disponível e sexo.', 30000, '4 dias');
			standard.classList.add('selected');
			choices.append(standard, advanced); panel.append(choices);

			const randomChoice = {value: '', label: 'Aleatório'};
			const natureChoices = [randomChoice, ...(fossil.natureDetails || fossil.natures.map(name => ({name})))
				.map(nature => ({value: nature.name, label: nature.name, plus: nature.plus, minus: nature.minus}))];
			const abilityChoices = [randomChoice, ...(fossil.abilityDetails || fossil.abilities.map(name => ({name})))
				.map(ability => ({value: ability.name, label: ability.name, description: ability.description || ''}))];
			const genderChoices = [randomChoice, ...fossil.genders.map(value => ({
				value, label: value === 'M' ? 'Macho' : value === 'F' ? 'Fêmea' : 'Sem sexo',
			}))];
			const nature = richSelectField('Natureza', natureChoices, option => {
				if (!option.value) return null;
				const modifiers = el('span', 'fossil-rich-nature');
				if (option.plus) modifiers.append(el('strong', 'raised', '+' + option.plus));
				if (option.minus) modifiers.append(el('strong', 'lowered', '-' + option.minus));
				if (!option.plus && !option.minus) modifiers.append(el('span', 'neutral', 'Sem alteração'));
				return modifiers;
			});
			const ability = richSelectField('Habilidade', abilityChoices, option =>
				option.value ? el('span', 'fossil-rich-ability-description', option.description) : null);
			const gender = selectField('Sexo', genderChoices);
			advancedFields.append(nature.wrap, ability.wrap, gender.wrap);
			panel.append(advancedFields);

			const updateMethodFields = () => {
				const editable = method === 'advanced';
				advancedFields.classList.toggle('locked', !editable);
				nature.setDisabled(!editable); ability.setDisabled(!editable);
				gender.select.disabled = !editable;
				if (!editable) {
					nature.setValue(''); ability.setValue(''); gender.select.value = '';
				} else {
					if (!nature.value) nature.setValue(nature.firstValue);
					if (!ability.value) ability.setValue(ability.firstValue);
					if (!gender.select.value && gender.select.options.length > 1) gender.select.selectedIndex = 1;
				}
			};
			for (const card of [standard, advanced]) card.addEventListener('click', () => {
				method = card.dataset.method;
				standard.classList.toggle('selected', method === 'standard');
				advanced.classList.toggle('selected', method === 'advanced');
				updateMethodFields();
				summaryCost.textContent = money(method === 'advanced' ? 30000 : 12000);
				summaryTime.textContent = method === 'advanced' ? '4 dias' : '2 dias';
			});
			updateMethodFields();
			const summary = el('div', 'fossil-project-summary');
			summary.append(el('h3', '', 'Resumo do projeto'));
			const row1 = el('p'); row1.append('Custo ', summaryCost = el('strong', '', money(12000)));
			const row2 = el('p'); row2.append('Prazo ', summaryTime = el('strong', '', '2 dias'));
			const start = el('button', 'button fossil-primary', 'Iniciar restauração');
			start.addEventListener('click', () => action('start', {
				itemId: fossil.itemId,
				samples: {
					fragmented: Number(sampleInputs.fragmented.value),
					preserved: Number(sampleInputs.preserved.value),
					exceptional: Number(sampleInputs.exceptional.value),
				},
				method, nature: nature.value, ability: ability.value, gender: gender.select.value,
			}));
			summary.append(row1, row2, start); panel.append(summary);
			return panel;
			var summaryCost, summaryTime;
		}

		function methodCard(id, title, description, cost, time) {
			const card = el('button', 'fossil-method'); card.dataset.method = id;
			card.append(el('strong', '', title), el('span', '', description), el('small', '', money(cost) + ' · ' + time));
			return card;
		}
		function richSelectField(label, values, decorate) {
			const wrap = el('div', 'fossil-rich-field');
			wrap.append(el('span', '', label));
			const details = el('details', 'fossil-rich-select');
			const summary = el('summary', '', 'Aleatório');
			const list = el('div', 'fossil-rich-options');
			let value = '';
			const buttons = new Map();
			for (const option of values) {
				const button = el('button', 'fossil-rich-option');
				button.type = 'button';
				button.append(el('strong', '', option.label));
				const decoration = decorate ? decorate(option) : null;
				if (decoration) button.append(decoration);
				button.addEventListener('click', event => {
					event.preventDefault();
					control.setValue(option.value);
					details.open = false;
				});
				buttons.set(option.value, button);
				list.append(button);
			}
			details.append(summary, list); wrap.append(details);
			const control = {
				wrap,
				get value() { return value; },
				firstValue: values.find(option => option.value)?.value || '',
				setValue(next) {
					value = buttons.has(next) ? next : '';
					const option = values.find(entry => entry.value === value);
					summary.textContent = option?.label || 'Aleatório';
					for (const [id, button] of buttons) button.classList.toggle('selected', id === value);
				},
				setDisabled(disabled) {
					details.classList.toggle('disabled', disabled);
					details.dataset.disabled = disabled ? 'true' : 'false';
					if (disabled) details.open = false;
				},
			};
			summary.addEventListener('click', event => {
				if (details.dataset.disabled === 'true') event.preventDefault();
			});
			const restoreOptions = () => {
				if (list.parentNode !== details) details.append(list);
				list.classList.remove('portaled');
				list.style.left = '';
				list.style.right = '';
				list.style.top = '';
				list.style.width = '';
			};
			const portalOptions = () => {
				const rect = summary.getBoundingClientRect();
				const margin = 8;
				const width = Math.max(240, rect.width);
				document.body.append(list);
				list.classList.add('portaled');
				const height = Math.min(205, list.scrollHeight);
				const maxLeft = Math.max(margin, window.innerWidth - width - margin);
				const left = Math.min(Math.max(margin, rect.left), maxLeft);
				let top = rect.bottom + 3;
				if (top + height > window.innerHeight - margin && rect.top > height + margin) {
					top = rect.top - height - 3;
				}
				list.style.left = left + 'px';
				list.style.right = 'auto';
				list.style.top = Math.max(margin, top) + 'px';
				list.style.width = width + 'px';
			};
			details.addEventListener('toggle', () => {
				if (details.dataset.disabled === 'true') { details.open = false; restoreOptions(); return; }
				if (details.open) {
					for (const other of root.querySelectorAll('.fossil-rich-select[open]')) {
						if (other !== details) other.open = false;
					}
					portalOptions();
				} else {
					restoreOptions();
				}
			});
			control.setValue('');
			return control;
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
				const title = el('div'); title.append(el('strong', '', project.species + ' · Nv. 1'),
					el('small', '', project.outcome === 'failed' ? 'Restauração sem sucesso' : project.phase));
				const remaining = el('span', 'fossil-remaining', duration(project.remainingMs));
				top.append(sprite, title, remaining); card.append(top);
				const progress = el('div', 'fossil-progress'); progress.append(el('i'));
				progress.firstChild.style.width = Math.round(project.progress * 100) + '%'; card.append(progress);
				const phases = el('div', 'fossil-phases');
				['Análise', 'Extração', 'DNA', 'Regeneração', 'Estabilização', 'Completo'].forEach((phase, index) =>
					phases.append(el('span', project.progress * 5 >= index ? 'done' : '', phase)));
				card.append(phases);
				if (project.complete) {
					const receive = el('button', 'button fossil-primary', project.outcome === 'failed' ? 'Finalizar projeto' : 'Receber na Box');
					receive.addEventListener('click', async () => {
						const result = await action('receive', {projectId: project.id});
						if (result?.pokemon) options.toast(result.pokemon.species + ' foi enviado para a Box.');
						else if (result) options.toast('A restauração não obteve DNA viável.', true);
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
