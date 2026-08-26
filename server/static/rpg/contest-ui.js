'use strict';

window.RPGContestUI = (() => {
	let refreshTimer = null;
	const labels = {beauty: 'Beleza', cute: 'Fofura', cool: 'Estilo', smart: 'Inteligência', tough: 'Força',
		normal: 'Normal', great: 'Great', super: 'Super', hyper: 'Hyper', master: 'Master'};
	const criteria = [
		['visualComposition', 'Composição visual'], ['sequenceContinuity', 'Continuidade'],
		['stageUse', 'Uso do palco'], ['trainerPokemonSync', 'Sincronia'],
		['interpretationFinale', 'Interpretação e final'],
	];
	const el = (tag, className, text) => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	};
	const actionButton = (text, handler, primary = false) => {
		const node = el('button', `button${primary ? ' primary' : ''}`, text);
		node.type = 'button'; node.addEventListener('click', handler); return node;
	};
	async function refresh(context) { await context.rerender(); }
	function badges(session) {
		const row = el('div', 'contest-badges');
		for (const text of [labels[session.category], labels[session.rank], `${session.participants.length} participantes`]) {
			row.append(el('span', 'contest-badge', text));
		}
		return row;
	}
	async function runtime(context, session) {
		const data = await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/runtime`);
		return renderRuntime(context, session, data.contest);
	}
	function renderRuntime(context, session, contest) {
		const wrap = el('div', 'contest-page');
		const stage = el('section', 'contest-stage');
		const content = el('div', 'contest-stage-content');
		content.append(el('div', 'contest-badges', `Rodada ${contest.round} · ${labels[contest.category]} · ${labels[contest.rank]}`));
		const current = contest.participants.find(item => item.id === contest.currentParticipantId);
		if (current) {
			const performer = el('div', 'contest-performer');
			performer.append(el('strong', '', current.displayName));
			performer.append(el('span', '', `${current.pokemon.name} · Performance ${current.pokemon.performance}`));
			content.append(performer);
			const sequence = el('div', 'contest-sequence');
			for (const move of current.rounds[contest.round - 1]) sequence.append(el('span', '', move));
			content.append(sequence);
			const reaction = current.audienceReactions[contest.round - 1];
			content.append(el('div', 'contest-reaction', reaction ? `${reaction.emoji} ${reaction.label}` : 'O público aguarda a apresentação.'));
			const moves = el('div', 'contest-moves');
			for (const move of current.pokemon.moves) {
				const button = el('button', 'contest-move', move.name);
				button.type = 'button'; button.disabled = !contest.canAct;
				button.addEventListener('click', async () => {
					await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`, {method: 'POST', body: {type: 'select-move', moveId: move.id}});
					await refresh(context);
				});
				moves.append(button);
			}
			content.append(moves);
		}
		stage.append(content); wrap.append(stage);
		if (contest.canJudge) wrap.append(judgePanel(context, session));
		if (contest.status === 'ended' && contest.results) wrap.append(resultsPanel(contest));
		else if (!context.master && current && current.characterId === context.character?.id) {
			const actions = el('div', 'contest-actions');
			actions.append(actionButton('Abandonar concurso', async () => {
				if (!window.confirm('Abandonar desclassifica o participante sem possibilidade de retorno.')) return;
				await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`, {method: 'POST', body: {type: 'abandon'}});
				await refresh(context);
			})); wrap.append(actions);
		}
		return wrap;
	}
	function judgePanel(context, session) {
		const form = el('form', 'panel contest-card');
		form.append(el('h3', '', 'Avaliação do mestre'));
		const grid = el('div', 'contest-judge-grid');
		for (const [id, label] of criteria) {
			const field = el('label', ''); field.append(el('span', '', label));
			const input = el('input'); input.name = id; input.type = 'number'; input.min = '-1'; input.max = '5'; input.value = '3';
			field.append(input); grid.append(field);
		}
		form.append(grid);
		const comment = el('textarea'); comment.name = 'comment'; comment.placeholder = 'Comentário público opcional'; form.append(comment);
		const submit = el('button', 'button primary', 'Confirmar notas'); submit.type = 'submit'; form.append(submit);
		form.addEventListener('submit', async event => {
			event.preventDefault(); const data = new FormData(form); const values = {};
			for (const [id] of criteria) values[id] = Number(data.get(id));
			await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/action`, {method: 'POST', body: {type: 'submit-judging', criteria: values, comment: data.get('comment')}});
			await refresh(context);
		});
		return form;
	}
	function resultsPanel(contest) {
		const panel = el('section', 'panel contest-results'); panel.append(el('h3', '', 'Resultado final'));
		const list = el('ol');
		for (const result of [...contest.results].filter(item => !item.disqualified).sort((a, b) => a.place - b.place)) {
			const participant = contest.participants.find(item => item.id === result.participantId);
			list.append(el('li', '', `${participant?.displayName || result.participantId} — ${result.total} pontos · +${result.performanceGain} Performance`));
		}
		panel.append(list); return panel;
	}
	function sessionCard(context, session) {
		const card = el('article', 'panel contest-card'); const header = el('div', 'contest-card-header');
		const title = el('div'); title.append(el('h3', '', session.name)); title.append(badges(session)); header.append(title);
		const actions = el('div', 'contest-actions');
		if (session.status === 'started' || session.status === 'ended') actions.append(actionButton('Abrir palco', async () => {
			const root = document.getElementById('dashboard-content'); root.replaceChildren(await runtime(context, session));
		}, true));
		if (context.master && session.status === 'ready') actions.append(actionButton('Iniciar', async () => {
			await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/start`, {method: 'POST'}); await refresh(context);
		}, true));
		if (context.master && session.status === 'draft') actions.append(actionButton('Enviar convites', async () => {
			await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/invite`, {method: 'POST'}); await refresh(context);
		}));
		if (context.master && session.status === 'draft') actions.prepend(actionButton('Configurar', async () => {
			const available = context.characters.map(character => `${character.id} (${character.characterName})`).join(', ');
			const selected = window.prompt(`IDs dos jogadores, separados por vírgula. Disponíveis: ${available}`,
				session.participants.filter(item => item.kind === 'player').map(item => item.characterId).join(', '));
			if (selected === null) return;
			const ids = selected.split(',').map(id => id.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')).filter(Boolean);
			const participants = ids.map(id => {
				const character = context.characters.find(item => item.id === id);
				if (!character) throw new Error(`Personagem desconhecido: ${id}`);
				return {id: `${id}-contest`, kind: 'player', characterId: id, displayName: character.characterName, avatar: character.avatar};
			});
			await context.api(`/contest-sessions/${encodeURIComponent(session.id)}`, {method: 'PATCH', body: {participants}});
			await refresh(context);
		}));
		if (!context.master && ['inviting', 'ready'].includes(session.status)) {
			const invitation = session.invitations.find(item => item.characterId === context.character?.id);
			const participant = session.participants.find(item => item.characterId === context.character?.id);
			if (invitation?.response === 'pending' && participant && !participant.pokemon) {
				actions.append(actionButton('Escolher Pokémon', async () => {
					const options = context.character.team.map((pokemon, index) => `${index + 1}: ${pokemon.name || pokemon.species}`).join('\n');
					const choice = Number(window.prompt(`Escolha pelo número:\n${options}`, '1')) - 1;
					if (!Number.isSafeInteger(choice)) return;
					await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/select-pokemon`, {method: 'POST', body: {teamIndex: choice}});
					await refresh(context);
				}));
			} else if (invitation?.response === 'pending') {
				actions.append(actionButton('Aceitar', async () => {
					await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/respond`, {method: 'POST', body: {response: 'accepted'}}); await refresh(context);
				}, true));
				actions.append(actionButton('Recusar', async () => {
					await context.api(`/contest-sessions/${encodeURIComponent(session.id)}/respond`, {method: 'POST', body: {response: 'declined'}}); await refresh(context);
				}));
			}
		}
		header.append(actions); card.append(header); return card;
	}
	async function render(context) {
		if (refreshTimer) window.clearTimeout(refreshTimer);
		context.master = context.master || context.state.session?.role === 'master';
		const data = await context.api('/contest-sessions'); const sessions = data.contestSessions || [];
		const active = sessions.find(session => session.status === 'started');
		if (active) {
			const page = await runtime(context, active);
			refreshTimer = window.setTimeout(() => void context.rerender(), 1200);
			return page;
		}
		const page = el('div', 'contest-page');
		const toolbar = el('div', 'panel contest-toolbar');
		toolbar.append(el('div', '', context.master ? 'Prepare e acompanhe apresentações.' : 'Convites e apresentações disponíveis.'));
		if (context.master) toolbar.append(actionButton('Novo concurso', async () => {
			await context.api('/contest-sessions', {method: 'POST', body: {name: `Concurso ${sessions.length + 1}`}}); await refresh(context);
		}, true));
		page.append(toolbar); const list = el('div', 'contest-list');
		for (const session of sessions) list.append(sessionCard(context, session));
		if (!sessions.length) list.append(el('div', 'panel empty-state', 'Nenhum concurso preparado.'));
		page.append(list); return page;
	}
	return {render};
})();
