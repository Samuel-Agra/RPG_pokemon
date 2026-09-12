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
		assert(script.includes('await refreshMasterInvitationsPanel()'));
		assert(script.includes("openAccountTableDialog('create')"));
		assert(script.includes("openAccountTableDialog('join')"));
		assert(script.includes('enterAccountTable(entry)'));
		assert(script.includes("addConfirmedAction('Excluir mesa'"));
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
		assert(script.includes("['members', 'Membros']"));
		assert(script.includes('renderMasterMembers'));
		assert(script.includes("'Promover a Mestre'"));
		assert(script.includes("'Transferir propriedade'"));
		assert(script.includes("'Remover da mesa'"));
		assert(script.includes('/note`'));
		assert(style.includes('.member-details-layer'));
		assert(style.includes('.master-member-row'));
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

	it('keeps the active RPG world open after saving its table settings', () => {
		assert.match(script, /const preserveActiveWorld = accountTableDialogMode === 'edit'/);
		assert.match(script, /if \(preserveActiveWorld\) \{\s*await refreshAccountTables\(\);\s*\} else \{\s*await renderAccountTables\(\);/);
	});

	it('requires a Player without a table character to create one before opening the dashboard', () => {
		assert(script.includes('function platformPlayerNeedsCharacter'));
		assert(script.includes('if (platformPlayerNeedsCharacter(connected.session)) openCharacterCreation()'));
		assert(script.includes("$('#player-name').value = state.account?.displayName || ''"));
		assert(script.includes("const login = platformCreation ? await api('/session')"));
		assert(script.includes("'character-password-field', 'character-password-confirmation-field'"));
		assert(script.includes('input.disabled = required'));
		assert(script.includes("void renderAccountTables()"));
		assert(script.includes("finally {\n\t\t// O cartão é preservado entre renderizações"));
		assert(script.includes("buttonElement.disabled = false; buttonElement.textContent = 'Entrar'"));
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
