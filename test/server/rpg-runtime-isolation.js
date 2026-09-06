'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG standalone runtime isolation', () => {
	const hasFiles = directory => fs.existsSync(directory) && fs.readdirSync(directory, { withFileTypes: true }).some(
		entry => entry.isFile() || (entry.isDirectory() && hasFiles(path.join(directory, entry.name)))
	);
	const serverIndex = fs.readFileSync(path.resolve(__dirname, '../../server/index.ts'), 'utf8');
	const sockets = fs.readFileSync(path.resolve(__dirname, '../../server/sockets.ts'), 'utf8');
	const rooms = fs.readFileSync(path.resolve(__dirname, '../../server/rooms.ts'), 'utf8');
	const ladders = fs.readFileSync(path.resolve(__dirname, '../../server/ladders.ts'), 'utf8');
	const tournaments = fs.readFileSync(path.resolve(__dirname, '../../server/tournaments/index.ts'), 'utf8');
	const loginserver = fs.readFileSync(path.resolve(__dirname, '../../server/loginserver.ts'), 'utf8');
	const verifier = fs.readFileSync(path.resolve(__dirname, '../../server/verifier.ts'), 'utf8');
	const ipTools = fs.readFileSync(path.resolve(__dirname, '../../server/ip-tools.ts'), 'utf8');
	const punishments = fs.readFileSync(path.resolve(__dirname, '../../server/punishments.ts'), 'utf8');
	const replays = fs.readFileSync(path.resolve(__dirname, '../../server/replays.ts'), 'utf8');
	const modlog = fs.readFileSync(path.resolve(__dirname, '../../server/modlog/index.ts'), 'utf8');
	const roomlogs = fs.readFileSync(path.resolve(__dirname, '../../server/roomlogs.ts'), 'utf8');

	it('does not start chat, rooms, moderation storage, or social workers in RPG mode', () => {
		assert.match(serverIndex, /const RPG_ONLY = process\.env\.PS_RPG_MODE === '1'/);
		assert.match(serverIndex, /if \(!RPG_ONLY\) Rooms\.global\.start/);
		assert.match(serverIndex, /if \(!RPG_ONLY\) Chat\.start/);
		assert.match(serverIndex, /if \(!RPG_ONLY && Config\.usesqlite\)/);
		assert.match(rooms, /if \(process\.env\.PS_RPG_MODE === '1'\) this\.settingsList = \[\]/);
	});

	it('serves RPG HTTP without installing the Showdown SockJS transport', () => {
		const guard = sockets.indexOf("if (process.env.PS_RPG_MODE === '1')");
		const sockjs = sockets.indexOf("require as any)('sockjs')");
		assert(guard >= 0);
		assert(sockjs > guard);
		assert.match(sockets.slice(guard, sockjs), /this\.server\.listen/);
		assert.match(sockets.slice(guard, sockjs), /return;/);
	});

	it('keeps Showdown matchmaking and tournaments disabled in the RPG runtime', () => {
		assert.match(ladders, /Showdown matchmaking is not available in Pokémon RPG/);
		assert.match(ladders, /disabled: true/);
		assert.doesNotMatch(ladders, /ladders-(?:local|remote)/);
		assert.match(tournaments, /Showdown tournaments are not available in Pokémon RPG/);
		assert.doesNotMatch(tournaments, /generator-(?:elimination|round-robin)/);
	});

	it('does not connect Showdown accounts, verification, proxy lists, or moderation storage', () => {
		assert.match(serverIndex, /if \(!RPG_ONLY\) Verifier\.start/);
		assert.match(loginserver, /Showdown login server is not available in Pokémon RPG/);
		assert.doesNotMatch(loginserver, /action\.php|invalidatecss/);
		assert.match(verifier, /return Promise\.resolve\(false\)/);
		assert.doesNotMatch(verifier, /createVerify|QueryProcessManager/);
		assert.match(ipTools, /Proxy databases and DNS blocklists from Showdown are not used/);
		assert.doesNotMatch(ipTools, /spamhaus|proxies\.csv|hosts\.csv/);
		assert.match(punishments, /Showdown moderation storage is not part/);
		assert.doesNotMatch(punishments, /punishments\.tsv|room-punishments\.tsv/);
	});

	it('does not persist Showdown replays, staff audits, or chat logs', () => {
		assert.match(replays, /Showdown replay storage is disabled in RPG mode/);
		assert.doesNotMatch(replays, /PGDatabase|replayplayers/);
		assert.match(modlog, /Disabled Pokemon Showdown staff-audit compatibility surface/);
		assert.doesNotMatch(modlog, /modlog\.db|databases\/schemas\/modlog/);
		assert.match(roomlogs, /export const roomlogDB: PGDatabase \| null = null/);
		assert.match(roomlogs, /roomlog\(_message: string, _date = new Date\(\)\) \{\}/);
	});

	it('does not ship Showdown chat commands, public-room plugins, or chat translations', () => {
		assert.equal(hasFiles(path.resolve(__dirname, '../../server/chat-commands')), false);
		assert.equal(hasFiles(path.resolve(__dirname, '../../server/chat-plugins')), false);
		assert.equal(hasFiles(path.resolve(__dirname, '../../translations')), false);
	});

	it('does not ship Showdown social, offline-message, or Artemis services', () => {
		assert.equal(hasFiles(path.resolve(__dirname, '../../server/artemis')), false);
		assert.equal(hasFiles(path.resolve(__dirname, '../../server/private-messages')), false);
		assert.equal(fs.existsSync(path.resolve(__dirname, '../../server/friends.ts')), false);
		assert.equal(require('../../package.json').name, 'pokemon-rpg');
		assert.equal(require('../../package.json').scripts.start, 'node server/rpg-showdown/start.js');
	});

	it('keeps the default test runner scoped to the RPG suite', () => {
		const mochaConfig = require('../../.mocharc.json');
		assert.deepEqual(mochaConfig.spec, ['test/server/rpg-*.js', 'test/sim/rpg-*.js']);
		assert.equal(fs.existsSync(path.resolve(__dirname, '../main.js')), false);
		assert.equal(fs.existsSync(path.resolve(__dirname, '../random-battles')), false);
	});
});
