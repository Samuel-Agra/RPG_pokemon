'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const http = fs.readFileSync(path.join(root, 'server/rpg-showdown/http.ts'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/mysql-persistence.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/migrations/014-table-chat.sql'), 'utf8');
const typingMigration = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/migrations/016-table-chat-typing.sql'), 'utf8');
const logMigration = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/migrations/017-table-system-log.sql'), 'utf8');
const service = fs.readFileSync(path.join(root, 'server/rpg-showdown/index.ts'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');
const battleUi = fs.readFileSync(path.join(root, 'server/static/rpg/battle-room.js'), 'utf8');
const contestUi = fs.readFileSync(path.join(root, 'server/static/rpg/contest-ui.js'), 'utf8');
const sockets = fs.readFileSync(path.join(root, 'server/sockets.ts'), 'utf8');

describe('RPG table text chat', () => {
	it('isolates messages by table and expires each message after 48 hours', () => {
		assert.match(migration, /table_id VARCHAR\(100\) NOT NULL/);
		assert.match(migration, /expires_at BIGINT UNSIGNED NOT NULL/);
		assert.match(persistence, /DELETE FROM rpg_table_chat_messages WHERE table_id = \? AND expires_at <= \?/);
		assert.match(persistence, /now \+ 48 \* 60 \* 60 \* 1000/);
	});

	it('exposes authenticated plain-text reading and sending', () => {
		assert.match(http, /url\.pathname === '\/api\/rpg\/table-chat'/);
		assert.match(http, /session\.platformTableId, session\.platformAccountId/);
		assert.match(persistence, /if \(!text\) throw new Error\('A mensagem não pode ficar vazia'\)/);
		assert.match(persistence, /FROM rpg_characters owned_character/);
	});

	it('shares short-lived typing presence only inside the current table', () => {
		assert.match(typingMigration, /PRIMARY KEY \(table_id, account_id\)/);
		assert.match(typingMigration, /FOREIGN KEY \(table_id\).*ON DELETE CASCADE/);
		assert.match(http, /url\.pathname === '\/api\/rpg\/table-chat\/typing'/);
		assert.match(http, /persistence\.setTableChatTyping\(session\.platformTableId, session\.platformAccountId, typing\)/);
		assert.match(http, /persistence\.loadTableChatTyping\(session\.platformTableId, session\.platformAccountId\)/);
		assert.match(persistence, /typing\.account_id <> \?/);
		assert.match(persistence, /now - RPG_TABLE_CHAT_TYPING_TTL_MS/);
		assert.match(persistence, /RPG_TABLE_CHAT_TYPING_TTL_MS = 10 \* 60 \* 1000/);
		assert.doesNotMatch(persistence, /FROM rpg_characters character\b/);
	});

	it('retains table activity for three days and limits Player reads to their own character', () => {
		assert.match(logMigration, /audience_character_ids JSON NOT NULL/);
		assert.match(logMigration, /KEY idx_rpg_table_system_log_expiration \(expires_at\)/);
		assert.match(persistence, /RPG_TABLE_SYSTEM_LOG_RETENTION_MS = 3 \* 24 \* 60 \* 60 \* 1000/);
		assert.match(persistence, /JSON_CONTAINS\(audience_character_ids, JSON_QUOTE\(\?\)\)/);
		assert.match(http, /master: session\.role === 'master'/);
		assert.match(service, /appendTableSystemLog\('battle', 'Batalha encerrada'/);
		assert.match(service, /appendTableSystemLog\('contest', 'Concurso encerrado'/);
		assert.match(service, /appendTableSystemLog\('incubation', 'Ovo chocado'/);
	});

	it('switches the persistent Players drawer to the table chat', () => {
		assert.match(html, /id="player-chat-toggle"/);
		assert.match(html, /id="table-chat-messages"/);
		assert.match(html, /id="table-chat-typing"/);
		assert.match(html, /data-table-communication-view="log">Registro da mesa/);
		assert.match(html, /data-table-communication-view="chat">Chat da mesa/);
		assert.match(html, /Área reservada para implementação futura/);
		assert.match(ui, /setTableChatOpen\(!state\.tableChatOpen\)/);
		assert.match(ui, /state\.session\.role === 'player'.*\|\| isMasterMode/);
		assert.match(ui, /entry\.authorCharacterName \|\| entry\.authorDisplayName/);
		assert.match(ui, /entry\.authorRole === 'owner' \? 'Mestre proprietário'/);
		assert.match(ui, /entry\.authorRole === 'master' \? 'Mestre'/);
		assert.match(ui, /createElement\('p', '', entry\.message\)/);
		assert.match(ui, /form\.requestSubmit\(form\.querySelector\('button\[type="submit"\]'\)\)/);
		assert.match(ui, /membersByAccount\.get\(player\.accountId\)\?\.online \?\? player\.online/);
		assert.match(ui, /typing\.length === 1 \? ' está digitando' : ' estão digitando'/);
		assert.match(ui, /table-chat-typing-dots/);
		assert.match(css, /@keyframes table-chat-typing-dots/);
		assert.match(ui, /tableChatRefreshTimer = window\.setInterval/);
		assert.match(ui, /state\.tableChatOpen && state\.tableCommunicationView === 'chat'/);
		assert.doesNotMatch(ui, /if \(!state\.session \|\| !state\.accountSession\?\.activeTableId\) return;/);
		assert.doesNotMatch(ui, /table-chat-input'\)\.addEventListener\('blur'/);
		assert.match(ui, /!input\.value\.length/);
		assert.match(sockets, /cacheTime: process\.env\.PS_RPG_MODE === '1' \? 0 : undefined/);
		assert.match(ui, /async function renderTableSystemLog\(\)/);
		assert.match(ui, /Nenhum registro dos últimos três dias/);
		assert.match(css, /\.table-communication-tabs > button \{ width: 100%/);
		assert.match(css, /\.player-roster-drawer-avatar\.is-online \{[^}]*border-color: #38a85c/);
		assert.match(css, /\.player-roster-drawer-avatar\.is-idle \{[^}]*border-color: #e1ae32/);
		assert.match(css, /\.player-roster-drawer-avatar\.is-offline \{[^}]*border-color: #d65252/);
		assert.match(ui, /Date\.now\(\) - playerPresenceLastInteractionAt >= 60_000/);
		assert.match(ui, /body: \{ area: state\.dashboardView, idle \}/);
		assert.match(ui, /avatar\.classList\.add\('is-' \+ presence\)/);
		assert.match(service, /presence: presenceByCharacter\.get\(record\.state\.id\) \|\| 'offline'/);
		assert.match(css, /\.player-roster-drawer\.chat-open \.table-chat-view/);
		assert.match(css, /\.table-chat-messages \{[^}]*overflow-x: hidden/);
		assert.match(css, /\.sidebar \{[^}]*position: sticky;[^}]*max-height: calc\(100vh - 90px\)/);
		assert.match(css, /\.player-roster-drawer \{[^}]*position: sticky;[^}]*align-self: start/);
		assert.match(css, /\.player-roster-drawer-view \{[^}]*width: 100%;[^}]*grid-template-rows:/);
		assert.match(css, /#player-roster-drawer-list \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none/);
		assert.match(css, /\.player-roster-drawer-player \{[^}]*grid-template-columns: 138px minmax\(0, 1fr\)/);
		assert.match(css, /\.player-roster-drawer-player > \* \{ grid-column: 1; \}/);
		assert.match(css, /\.player-roster-drawer-view > strong,[\s\S]*?\.player-roster-master-section > strong \{[^}]*background: #fff;[^}]*border:/);
		assert.doesNotMatch(html, /class="panel player-roster-drawer/);
		assert.doesNotMatch(ui, /master-online-players-drawer/);
	});

	it('overlays battle and contest screens with their ordered activity log', () => {
		assert.match(ui, /function setTableActivity\(kind, activityId, entries = \[\]\)/);
		assert.match(ui, /document\.addEventListener\('pointerdown'.*state\.tableActivity/s);
		assert.match(ui, /state\.tableActivity && state\.tableChatOpen/);
		assert.match(css, /\.player-roster-drawer\.activity-overlay \{[^}]*position: fixed/);
		assert.match(css, /\.player-roster-drawer\.activity-overlay \.player-roster-drawer-view \{ display: none; \}/);
		assert.match(battleUi, /setActivity\?\.\('battle', session\.id/);
		assert.match(battleUi, /Array\.isArray\(snapshot\.log\)/);
		assert.match(contestUi, /setActivity\?\.\('contest', session\.id, contestActivityEntries\(contest\)\)/);
		assert.match(contestUi, /seenSequences\.has\(event\.sequence\)/);
		assert.match(contestUi, /event\.type === 'move-selected'/);
		assert.match(contestUi, /perdeu a ação/);
	});
});
