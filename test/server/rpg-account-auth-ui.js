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
		assert(script.includes("String(values.confirmPassword || '') !== String(values.password || '')"));
		assert(script.includes("dataset.accountAuthMode === 'register'"));
		assert(script.includes("setAccountAuthMode('login')"));
		assert(html.match(/account-password-toggle/g)?.length >= 3);
	});

	it('renders a responsive Minhas mesas destination after authentication', () => {
		assert(html.includes('id="tables-screen"'));
		assert(html.includes('Minhas mesas'));
		assert(style.includes('.account-table-grid'));
		assert(style.includes('.account-auth {'));
		assert(style.includes('@media (max-width: 760px)'));
		assert(html.includes('Mesas em que participo'));
		assert(html.includes('Mesas arquivadas'));
		assert(script.includes('reconcileAccountTableList'));
		assert(script.includes('card.dataset.signature !== signature'));
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

	it('previews invitation codes and lets the Master administer invitations and requests', () => {
		assert(script.includes("accountApi('/invites/preview'"));
		assert(script.includes("'Aguardando aprova\\u00e7\\u00e3o do Mestre'"));
		assert(script.includes('renderMasterInvitationsPanel'));
		assert(script.includes("'Solicitações pendentes'"));
		assert(script.includes("'Gerar convite'"));
		assert(script.includes("'Revogar'"));
		assert(script.includes("link.searchParams.set('invite', data.code)"));
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
});
