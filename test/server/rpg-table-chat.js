'use strict';

const assert = require('assert').strict;
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const http = fs.readFileSync(path.join(root, 'server/rpg-showdown/http.ts'), 'utf8');
const persistence = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/mysql-persistence.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'server/rpg-showdown/database/migrations/014-table-chat.sql'), 'utf8');
const html = fs.readFileSync(path.join(root, 'server/static/rpg/index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'server/static/rpg/rpg.css'), 'utf8');

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
	});

	it('switches the persistent Players drawer to the table chat', () => {
		assert.match(html, /id="player-chat-toggle"/);
		assert.match(html, /id="table-chat-messages"/);
		assert.match(ui, /setTableChatOpen\(!state\.tableChatOpen\)/);
		assert.match(ui, /state\.session\.role === 'player'.*\|\| isMasterMode/);
		assert.match(ui, /entry\.authorCharacterName \|\| entry\.authorDisplayName/);
		assert.match(ui, /entry\.authorRole === 'owner' \? 'Mestre proprietário'/);
		assert.match(ui, /entry\.authorRole === 'master' \? 'Mestre'/);
		assert.match(ui, /createElement\('p', '', entry\.message\)/);
		assert.match(ui, /form\.requestSubmit\(form\.querySelector\('button\[type="submit"\]'\)\)/);
		assert.match(css, /\.player-roster-drawer\.chat-open \.table-chat-view/);
		assert.match(css, /\.table-chat-messages \{[^}]*overflow-x: hidden/);
		assert.match(css, /\.sidebar \{[^}]*position: sticky;[^}]*max-height: calc\(100vh - 90px\)/);
		assert.match(css, /\.player-roster-drawer \{[^}]*position: sticky;[^}]*align-self: start/);
		assert.match(css, /\.player-roster-drawer-view \{[^}]*width: 100%;[^}]*grid-template-rows:/);
		assert.match(css, /#player-roster-drawer-list \{[^}]*overflow-y: auto;[^}]*scrollbar-width: none/);
		assert.match(css, /\.player-roster-drawer-player \{[^}]*grid-template-columns: 138px minmax\(0, 1fr\)/);
		assert.match(css, /\.player-roster-drawer-player > \* \{ grid-column: 1; \}/);
		assert.match(css, /\.player-roster-drawer-view > strong \{[^}]*background: #fff;[^}]*border:/);
		assert.doesNotMatch(html, /class="panel player-roster-drawer/);
	});
});
