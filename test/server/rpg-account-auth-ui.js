'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG version 2 account authentication frontend', () => {
	const root = path.resolve(__dirname, '../../server/static/rpg');
	const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const script = fs.readFileSync(path.join(root, 'rpg.js'), 'utf8');
	const style = fs.readFileSync(path.join(root, 'rpg.css'), 'utf8');

	it('starts with accessible login and account creation tabs instead of character credentials', () => {
		for (const id of ['account-login-tab', 'account-register-tab', 'account-login-form', 'account-register-form']) {
			assert(html.includes(`id="${id}"`), `missing ${id}`);
		}
		assert(html.includes('role="tablist"'));
		assert(html.includes('autocomplete="username"'));
		assert(html.includes('autocomplete="current-password"'));
		assert(html.includes('autocomplete="new-password"'));
		assert(html.includes('minlength="3" maxlength="40" placeholder="Login"'));
		assert(html.includes('name="handle"'));
		assert(!html.includes('name="displayName"'));
		assert(html.includes('Diferente do login; será usado para receber convites.'));
		assert(html.includes('placeholder="Use pelo menos 8 caracteres."'));
		assert(html.includes('rel="icon" type="image/png" href="./assets/pokemon-rpg-logo.png"'));
		assert(style.includes("background: url('./assets/pokemon-rpg-logo.png') center / contain no-repeat"));
		assert(!style.includes('background: linear-gradient(#e95959'));
		assert(!html.includes('Uma &uacute;nica conta para participar de diferentes campanhas e personagens.'));
		assert(style.includes('.account-auth { width: min(520px, 100%); overflow: hidden; }'));
		assert(style.includes('.account-auth-intro { min-height: 132px;'));
	});

	it('uses the version 2 account endpoints and preserves its session separately', () => {
		assert(script.includes("const ACCOUNT_STORAGE_KEY = 'rpg-platform-session-v2'"));
		assert(script.includes("fetch('/api/rpg/v2' + path"));
		assert(script.includes("accountApi('/accounts'"));
		assert(script.includes("accountApi('/session'"));
		assert(script.includes("accountApi('/tables'"));
		assert(script.includes('restoreAccountSession()'));
	});

	it('validates individual fields, toggles password visibility and supports Escape', () => {
		assert(script.includes('accountFieldError(form'));
		assert(script.includes('function accountPasswordError(password)'));
		assert(script.includes('maiúscula, minúscula, número e caractere especial'));
		assert(script.includes("String(values.confirmPassword || '') !== String(values.password || '')"));
		assert(script.includes("dataset.accountAuthMode !== 'login'"));
		assert(script.includes("setAccountAuthMode('login')"));
		assert(html.match(/account-password-toggle/g)?.length >= 3);
		assert(script.includes("toggle.append(createElement('span', 'account-password-eye', ''))"));
		assert(style.includes('.account-password-eye::before'));
		assert(style.includes('border-bottom: 2px solid currentColor'));
		assert(style.includes('.account-password-toggle.revealed .account-password-eye {'));
		assert(style.includes('.account-password-toggle.revealed .account-password-eye::before { opacity: 1; }'));
		assert(style.includes('#account-register-form .account-field:focus-within:not(.invalid) .password-requirements'));
		assert(html.includes('Use uma letra mai&uacute;scula, uma min&uacute;scula, um n&uacute;mero e um caractere especial.'));
	});

	it('renders a responsive Minhas mesas destination after authentication', () => {
		assert(html.includes('id="tables-screen"'));
		assert(html.includes('Minhas mesas'));
		assert(style.includes('.account-table-grid'));
		assert(style.includes('.account-auth {'));
		assert(style.includes('@media (max-width: 760px)'));
		assert(html.includes('Minhas participa&ccedil;&otilde;es'));
		for (const label of ['Configura&ccedil;&otilde;es', 'Minhas mesas', 'Minhas participa&ccedil;&otilde;es', 'Descobrir mesas', 'Convites', 'Logout']) {
			assert(html.includes(label), `missing account navigation option ${label}`);
		}
		assert(html.includes('class="panel account-navigation"'));
		assert(script.includes('function setAccountTablesView(view)'));
		assert(style.includes('position: fixed; z-index: 20; left: 0; top: 58px; bottom: 0'));
		assert(style.includes('margin: 0 auto 0 245px'));
		const navigation = html.slice(html.indexOf('<nav class="account-navigation-options">'), html.indexOf('</nav>', html.indexOf('<nav class="account-navigation-options">')));
		const orderedLabels = ['Minhas mesas', 'Minhas participa&ccedil;&otilde;es', 'Descobrir mesas', 'Convites', 'Configura&ccedil;&otilde;es', 'Logout'];
		for (let index = 1; index < orderedLabels.length; index++) {
			assert(navigation.indexOf(orderedLabels[index - 1]) < navigation.indexOf(orderedLabels[index]));
		}
		assert(script.includes("['owner', 'master'].includes(entry.membership.role)"));
		assert(script.includes("entry.membership.role === 'player'"));
		assert(script.includes("accountApi('/tables/discover')"));
		assert(html.includes('id="account-discover-refresh"'));
		assert(script.includes("accountTablesView === 'discover' && previousView !== 'discover'"));
		assert(!script.includes("loadDiscoveredTables(true)"));
		assert(script.includes("createElement('div', 'account-table-card-reserved')"));
		assert(script.includes("accountApi('/invites/directed')"));
		assert(script.includes("'panel account-table-card account-directed-invite'"));
		assert(script.includes("createElement('span', 'account-table-status', 'Convite')"));
		assert(script.includes("const accept = button('Aceitar', 'button primary')"));
		assert(script.includes("const decline = button('Recusar', 'button danger')"));
		assert(style.includes('grid-template-columns: 190px minmax(0, 1fr)'));
		assert(html.includes('Mesas arquivadas'));
		assert(script.includes('reconcileAccountTableList'));
		assert(script.includes('card.dataset.signature !== signature'));
		assert(script.includes('function startApplicationRealtimeSynchronization()'));
		assert(script.includes("new CustomEvent('rpg:realtime-sync'"));
		assert(script.includes('if (applicationRealtimeBusy || document.hidden || !state.accountSession) return'));
		assert(script.includes('await loadDirectedInvites(true)'));
		assert(html.includes('id="account-notification-trigger"'));
		assert(html.includes('id="account-notification-panel"'));
		assert(script.includes("accountApi('/notifications')"));
		assert(script.includes('function renderAccountNotifications('));
		assert(style.includes('.account-notification-panel'));
		assert(script.includes('await refreshMasterInvitationsPanel()'));
		assert(script.includes("openAccountTableDialog('create')"));
		assert(script.includes("openAccountTableDialog('join')"));
		assert(script.includes('enterAccountTable(entry)'));
		assert(script.includes("addConfirmedAction('Excluir permanentemente'"));
	});

	it('shows the persistent Player drawer to Players and Masters with six team slots', () => {
		assert(!script.includes("['players', 'Players']"));
		assert(script.indexOf("['team-builder', 'Team Builder']") < script.indexOf("['team', 'Equipe']"));
		assert(script.includes("async function renderPlayerRosterDrawer()"));
		assert(script.includes("const showPlayerRoster = state.session.role === 'master' ||"));
		assert(script.includes("api('/players', { cache: 'no-store' })"));
		assert(script.includes('for (let index = 0; index < 6; index++)'));
		assert(script.includes('openRosterDetailsOnContext(card, memberEntry, player.characterName)'));
		assert(script.includes("state.session.role === 'master' ? tableEntry?.membership.role || 'master' : 'player'"));
		assert(script.includes("!['battles', 'contests'].includes(state.dashboardView)"));
		assert(style.includes('.player-roster-drawer-team'));
		assert.match(style, /\.player-roster-drawer-team \{[^}]*grid-template-columns: repeat\(3/);
		assert(style.includes('.player-roster-drawer-pokemon'));
		assert(html.includes('id="player-roster-master-list"'));
		assert(script.includes("master.member.role === 'owner' ? 'PM' : 'M'"));
		assert(script.includes("setAccountAvatar(badge, master.account, master.member.role === 'owner' ? 'PM' : 'M')"));
		assert(script.includes("setAccountAvatar(badge, state.account, 'M')"));
		assert(script.includes("['owner', 'master'].includes(entry.member.role)"));
		assert(script.includes("master.online ? 'is-online' : 'is-offline'"));
		assert(script.includes('openRosterDetailsOnContext(card, master, accountPublicHandle(master.account))'));
		assert(script.includes("card.addEventListener('contextmenu', event => { event.preventDefault(); open(); })"));
		assert(!script.includes("card.addEventListener('click', () => openMemberDetails("));
		assert(style.includes('.player-roster-master-list:has(> :nth-child(3))'));
		assert(style.includes('.player-roster-master-avatar.has-account-avatar img'));
		assert(script.includes('masters.splice(Math.floor(masters.length / 2), 0, owner)'));
		assert(script.includes('const presenceOrder = { online: 0, idle: 1, offline: 2 }'));
		assert(script.includes("localeCompare(String(second.characterName || ''), 'pt-BR'"));
	});

	it('lets the master configure and give a new Pokemon from the expanded player row', () => {
		assert(script.includes('state.expandedMasterPlayerIds.clear();'));
		assert(script.includes('state.expandedMasterPlayerIds.add(character.id);'));
		assert(script.includes("button('Dar novo Pokémon', 'button primary master-player-add-pokemon')"));
		assert(script.includes('openMasterPlayerPokemonGift(character)'));
		assert(script.includes("api('/characters/pokemon'"));
		assert(script.includes('508 EVs aleatórios'));
		assert(script.includes('IVs em 0'));
		assert(script.includes('master-player-gift-nature-panel'));
		assert(script.includes("createElement('div', 'contest-nature-grid')"));
		assert(script.includes("createElement('label', 'master-player-pokemon-gift-shiny')"));
		assert(script.includes("hpPercent.type = 'range'"));
		assert(script.includes("createElement('div', 'team-builder-main-hp master-player-gift-capture-hp')"));
		assert(script.includes("createElement('div', 'team-builder-type-status-row master-player-gift-status-row')"));
		assert(script.includes("createElement('div', 'team-builder-master-status-grid')"));
		assert(script.includes("hpTrack.append(hpPercent, hpInside)"));
		assert(script.includes("hpPercent.addEventListener('input', updateHP)"));
		assert(!script.includes('showHPControls'));
		assert(script.includes("createElement('div', 'master-player-gift-capture-extras')"));
		assert(style.includes('.master-player-gift-inline-hp-track .team-builder-master-hp-slider'));
		assert(style.includes('.master-player-gift-inline-hp-track .team-builder-master-hp-slider { display: block; width: 100%;'));
		assert(style.includes('slider-runnable-track { height: 24px; border-radius: 13px; }'));
		assert(script.includes("event.target === backdrop"));
		assert(style.includes('.master-player-pokemon-gift-dialog'));
		assert(style.includes('height: min(665px, calc(92vh - 60px))'));
		assert(style.includes('scrollbar-gutter: stable'));
		assert(style.includes('.contest-nature-panel.master-player-gift-nature-panel'));
		assert(style.includes('min-width: 650px'));
	});

	it('stores relevant Pokemon inside the fixed Pokemon library folder', () => {
		assert(script.includes("pokemon: Array.isArray(stored.pokemon) ? stored.pokemon : []"));
		assert(script.includes("button('Criar Pokémon', 'primary')"));
		assert(script.includes('function renderMasterRelevantPokemonForm('));
		assert(script.includes("maximum: 1, label: 'Pokémon', confirmLabel: 'Selecionar Pokémon'"));
		assert(script.includes("field.classList.add('master-relevant-pokemon-picker-field')"));
		assert(script.includes("add?.classList.toggle('hidden', selected.length >= maximum)"));
		assert(script.includes('function renderMasterRelevantPokemonRow('));
		assert(script.includes("row.dataset.recordType = 'pokemon'"));
		assert(style.includes('.master-relevant-pokemon-stats'));
		assert.match(style, /\.master-relevant-pokemon-picker-field \.master-npc-pokemon-picker \{[^}]*top: calc\(100% \+ 6px\);[^}]*bottom: auto;/s);
		assert.match(style, /\.master-relevant-pokemon-picker-field \.master-npc-pokemon-results \{[^}]*repeat\(6,/s);
		assert.match(style, /\.master-relevant-pokemon-picker-field \.master-npc-pokemon-manager \{[^}]*top: calc\(100% \+ 6px\);[^}]*bottom: auto;/s);
		assert.match(style, /\.master-relevant-pokemon-picker-field \.master-npc-pokemon-manager \{[^}]*width: calc\(200% \+ 12px\);/s);
		assert(script.includes("createElement('input', 'team-builder-ev-slider')"));
		assert(script.includes("createElement('input', 'team-builder-ev-value')"));
		assert(script.includes("const availableEVMaximum = id =>"));
		assert(script.includes("slider.max = '252'"));
		assert(!script.includes('evInputs[id].slider.max = String(availableEVMaximum(id))'));
		assert(script.includes("'EVs: ' + stats.reduce((sum, id) => sum + evValues[id], 0) + ' / 508'"));
		assert(script.includes("if (stats.reduce((sum, id) => sum + evValues[id], 0) !== 508)"));
		assert(script.includes("const modifier = natureEffects[nature.value]"));
	});

	it('lists campaign Masters below Players and reserves permission editing for the owner', () => {
		assert(script.includes("section('Mestres da campanha')"));
		assert(script.includes("['owner', 'master'].includes(entry.member.role)"));
		assert(script.includes("const isOwner = tableEntry?.membership.role === 'owner'"));
		assert(script.includes('state.expandedCampaignMasterIds.clear();'));
		assert(script.includes("'Salvar permissões'"));
		assert(script.includes("/permissions`,\n\t\t\t\t\t\t\t\t{ method: 'PUT'"));
		assert(style.includes('.campaign-master-permissions-grid'));
	});

	it('offers owner-only table backup, restoration, and focused exports', () => {
		assert(html.includes('id="current-table-backup"'));
		assert(script.includes("$('#current-table-backup').classList.toggle('hidden', role !== 'owner')"));
		assert(script.includes("'Backup completo'"));
		assert(script.includes("'Exportar personagens'"));
		assert(script.includes("'Exportar documentos'"));
		assert(script.includes("restoreButton.dataset.confirm !== 'true'"));
		assert(script.includes("event.target === layer"));
		assert(script.includes("event.key === 'Escape'"));
		assert(style.includes('.table-backup-dialog'));
	});

	it('creates tables through short steps and exposes the post-creation actions', () => {
		assert(html.includes('id="account-table-dialog-back"'));
		assert(script.includes("['Identidade', 'Entrada de jogadores', 'Configurações iniciais']"));
		assert(script.includes('renderAccountTableCreationStep'));
		assert(script.includes('renderAccountTableCreationSuccess(result.table)'));
		assert(script.includes("'Entrar na mesa'"));
		assert(script.includes("'Convidar jogadores'"));
		assert(script.includes("body: { role: 'player', maxUses: 1 }"));
		assert(style.includes('.account-table-stepper'));
		assert(style.includes('.account-visibility-choice'));
	});

	it('edits table properties beside a live small and complete card preview', () => {
		assert(script.includes('account-table-editor-layout'));
		assert(script.includes("stage.dataset.mode = 'small'"));
		assert(script.includes("const toggleMode = () => setMode(stage.dataset.mode === 'large' ? 'small' : 'large')"));
		assert(script.includes("editor.addEventListener('input', update)"));
		assert(style.includes('.account-table-preview-arrow'));
		assert.match(style, /\.account-table-live-preview\.large \{[^}]*width: 1180px;[^}]*height: 740px;[^}]*scale\(\.59\)/);
	});

	it('formats and safely previews the complete table description and information', () => {
		assert(script.includes("accountTableRichTextField('Descrição da mesa'"));
		assert(script.includes("accountTableRichTextField('Informações da mesa'"));
		assert(script.includes("selectCommand('Espessura do contorno'"));
		assert(script.includes('setAccountTableRichContent(descriptionContent'));
		assert(script.includes('setAccountTableRichContent(tableInformationContent'));
		assert(script.includes("editor.addEventListener('focus', () => openAccountTableRichToolbar(toolbar))"));
		assert(script.includes('closeAccountTableRichToolbar(richToolbar)'));
		assert(script.includes("color('Contorno', '', '#597596', 'outline')"));
		assert(script.includes("setProperty('-webkit-text-stroke-color'"));
		assert(script.includes('outline.style.textShadow = offsets.map'));
		assert(script.includes("document.createTextNode('\\u200b')"));
		assert(script.includes("input.dispatchEvent(new Event('input', { bubbles: true }))"));
		assert(script.includes("enabled.type = 'checkbox'"));
		assert(style.includes('.master-note-color-enabled:checked'));
		assert(style.includes('.account-table-rich-toolbar'));
		assert(style.includes('.account-table-rich-toolbar.master-note-toolbar.closing'));
		assert.match(style, /\.account-table-rich-editor \{[^}]*height: 82px;[^}]*max-height: 82px;[^}]*overflow-y: auto;/);
		assert.match(style, /\.account-table-editor-fields textarea \{[^}]*height: 82px;[^}]*resize: none;/);
		assert(style.includes('.account-table-rich-output'));
		assert.match(style, /\.account-table-details \{[^}]*height: 740px;[^}]*max-height: 740px;/);
		assert.match(style, /\.account-table-details-introduction \{[^}]*height: 315px;[^}]*max-height: 315px;/);
		assert.match(style, /\.account-table-details-description \{[^}]*height: 240px;[^}]*overflow: hidden;/);
		assert.match(style, /\.account-table-details-footer \{[^}]*margin-top: auto;/);
		assert.match(style, /\.account-table-rich-toolbar\.master-note-toolbar \{[^}]*right: calc\(100% \+ 28px\); bottom: 0;/);
		assert.match(style, /\.account-table-session-options \{[^}]*right: calc\(100% \+ 28px\); bottom: 0;/);
	});

	it('previews invitation codes and lets the Master administer invitations and requests', () => {
		assert(script.includes("accountApi('/invites/preview'"));
		assert(script.includes("'Aguardando aprova\\u00e7\\u00e3o do Mestre'"));
		assert(script.includes('renderMasterInvitationsPanel'));
		assert(script.includes("'Solicitações pendentes'"));
		assert(script.includes("'Gerar convite'"));
		assert(script.includes("'Revogar'"));
		assert(script.includes("link.searchParams.set('invite', data.code)"));
		assert(script.includes("target.value.split(',')"));
		assert(script.includes('{ targetHandles: handles }'));
		assert(script.includes('Convite enviado diretamente para @${handles[0]}'));
		assert(style.includes('.master-invite-dialog {'));
	});

	it('renders table members and opens their management without moving the page', () => {
		assert(!script.includes("['members', 'Membros']"));
		assert(script.includes('openMasterInvitationsWindow'));
		assert(html.includes('id="master-invitations-button"'));
		assert(!script.includes("const close = button('Fechar', 'button'); close.type = 'button';\n\theading.append(createElement('h2', '', 'Convites e solicitações'), close)"));
		assert(script.includes("const invitationsWindow = document.querySelector('.master-invitations-window-layer')"));
		assert(html.indexOf('id="current-table-settings"') < html.indexOf('id="master-invitations-button"'));
		assert(html.indexOf('id="master-invitations-button"') < html.indexOf('id="current-table-leave"'));
		assert(html.includes('id="current-table-notification"'));
		assert(html.includes('id="master-invitations-count"'));
		assert(script.includes('refreshMasterInvitationNotification'));
		assert(script.includes('renderMasterMembers'));
		assert(script.includes("'Promover a Mestre'"));
		assert(script.includes("'Transferir propriedade'"));
		assert(script.includes("'Remover da mesa'"));
		assert(script.includes('/note`'));
		assert(style.includes('.member-details-layer'));
		assert(style.includes('.master-member-row'));
		assert(script.includes("createElement('span', 'master-member-account', accountPublicHandle(entry.account))"));
		assert(!script.includes("entry.account.displayName + ' (@'"));
		assert(style.includes('.master-invite-approval-switch'));
		assert(script.includes("'Solicitações precisam ser aceitas pelo Mestre'"));
		assert(!script.includes("detail('Personagens', characters)"));
		assert(!script.includes("detail('Permissões especiais', permissions)"));
		assert(!script.includes("button('Salvar anotações'"));
		assert(script.includes("noteTimer = window.setTimeout(() => void saveNote(), 500)"));
		assert(style.includes('.member-note-status'));
		assert(style.includes('.member-action-role'));
	});

	it('switches the active table from the RPG header without leaking transient world state', () => {
		assert(html.includes('id="current-table-toggle"'));
		assert(html.includes('Trocar de mesa'));
		assert(html.includes('Configura&ccedil;&otilde;es da mesa'));
		assert(script.includes('prepareTableTransition()'));
		assert(script.includes('stopTableSynchronization()'));
		assert(script.includes("accountApi('/tables/deselect'"));
		assert(script.includes("new CustomEvent('rpg:table-changing')"));
		assert(style.includes('.current-table-menu'));
		assert(style.includes('.table-switcher-dialog'));
	});

	it('presents archived tables as read-only and requires confirmation before permanent deletion', () => {
		assert(html.includes('id="current-table-archive"'));
		assert(html.includes('id="current-table-reactivate"'));
		assert(html.includes('id="current-table-delete"'));
		assert(html.includes('id="current-table-readonly"'));
		assert(script.includes("'Visualizar mesa arquivada'"));
		assert(script.includes('openArchiveTableConfirmation'));
		assert(script.includes('reactivateAccountTable'));
		assert(script.includes("control.dataset.confirm !== 'true'"));
		assert(script.includes("control.textContent = 'Confirmar exclusão permanente'"));
		assert(script.includes('prependArchivedTableNotice(body)'));
		assert(script.includes("chatInput.disabled = state.tableReadOnly"));
		assert(style.includes('.archived-table-notice'));
		assert(style.includes('.current-table-menu button.confirming'));
	});

	it('keeps the active RPG world open after saving its table settings', () => {
		assert.match(script, /const preserveActiveWorld = accountTableDialogMode === 'edit'/);
		assert.match(script, /if \(preserveActiveWorld\) \{\s*await refreshAccountTables\(\);\s*\} else \{\s*await renderAccountTables\(\);/);
	});

	it('requires a Player without a table character to create one before opening the dashboard', () => {
		assert(script.includes('function platformPlayerNeedsCharacter'));
		assert(script.includes('if (platformPlayerNeedsCharacter(connected.session)) openCharacterCreation()'));
		assert(script.includes("$('#player-name').value = state.account?.handle || ''"));
		assert(html.includes('id="legacy-player-name-field"'));
		assert(html.includes('id="legacy-initial-money-field"'));
		assert(script.includes("$('#legacy-player-name-field').classList.toggle('hidden', required)"));
		assert(script.includes("$('#legacy-initial-money-field').classList.toggle('hidden', required)"));
		assert(script.includes("...(platformCreation ? {} : {"));
		assert(script.includes("const login = platformCreation ? await api('/session')"));
		assert(script.includes("'character-password-field', 'character-password-confirmation-field'"));
		assert(script.includes('input.disabled = required'));
		assert(script.includes("void renderAccountTables()"));
		assert(script.includes("finally {\n\t\t// O cartão é preservado entre renderizações"));
		assert(script.includes("buttonElement.disabled = false; buttonElement.textContent = 'Entrar'"));
	});

	it('pairs trainer and starter choices before the class sheet with only two gender options', () => {
		const creation = html.slice(html.indexOf('<form class="panel form-grid" id="create-form">'),
			html.indexOf('</form>', html.indexOf('<form class="panel form-grid" id="create-form">')));
		assert.equal((creation.match(/class="create-identity-column"/g) || []).length, 2);
		for (const id of ['character-name', 'avatar-picker-toggle', 'character-gender',
			'starter-name', 'starter-picker-toggle', 'starter-gender']) {
			assert(creation.includes(`id="${id}"`), `missing ${id}`);
		}
		assert(creation.indexOf('id="character-name"') < creation.indexOf('id="avatar-picker-toggle"'));
		assert(creation.indexOf('id="avatar-picker-toggle"') < creation.indexOf('id="character-gender"'));
		assert(creation.indexOf('id="starter-name"') < creation.indexOf('id="starter-picker-toggle"'));
		assert(creation.indexOf('id="starter-picker-toggle"') < creation.indexOf('id="starter-gender"'));
		assert(!creation.includes('<option value="N">'));
		assert(style.includes('.create-identity-grid { display: grid; grid-template-columns: repeat(2'));
		assert(script.includes("characterGender: String(data.get('characterGender') || '')"));
	});

	it('confirms leaving and preserves or transfers characters during member removal', () => {
		assert(script.includes('openLeaveTableConfirmation(entry)'));
		assert(script.includes('Seus personagens permanecer\\u00e3o armazenados nela.'));
		assert(script.includes("'Remover e bloquear'"));
		assert(script.includes("'Transferir personagem'"));
		assert(script.includes('/owner`'));
		assert(style.includes('.table-lifecycle-dialog'));
		assert(style.includes('.member-character-transfer'));
	});

	it('recovers accounts and administers profile, password, codes, and connected sessions', () => {
		assert(script.includes("accountSettingsField('Link da imagem do avatar', 'url')"));
		assert(script.includes("accountSettingsField('Cor de destaque', 'color')"));
		assert(script.includes("profile: { avatarUrl: avatarUrl.input.value, bio: bio.value, accentColor: accent.input.value }"));
		assert(script.includes('function setAccountAvatar(element, account, fallbackText)'));
		assert(style.includes('.account-profile-preview'));
		assert(html.includes('id="account-recovery-form"'));
		assert(html.includes('id="account-open-recovery"'));
		assert(script.includes("setAccountAuthMode('recovery')"));
		assert(script.includes("accountApi('/password/recovery'"));
		assert(script.includes('showRecoveryCodes(registration.recoveryCodes'));
		for (const label of ['Perfil', 'Seguran\u00e7a', 'Sess\u00f5es conectadas', 'C\u00f3digo de recupera\u00e7\u00e3o']) {
			assert(script.includes(`'${label}'`));
		}
		assert(script.includes("accountApi('/password'"));
		assert(script.includes("accountApi('/sessions'"));
		assert(script.includes("accountApi('/recovery-codes'"));
		assert(style.includes('.account-settings-dialog'));
		assert(style.includes('.recovery-code-list'));
	});
});
