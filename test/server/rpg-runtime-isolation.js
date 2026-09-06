'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');

describe('RPG standalone runtime isolation', () => {
	const serverIndex = fs.readFileSync(path.resolve(__dirname, '../../server/index.ts'), 'utf8');
	const sockets = fs.readFileSync(path.resolve(__dirname, '../../server/sockets.ts'), 'utf8');
	const rooms = fs.readFileSync(path.resolve(__dirname, '../../server/rooms.ts'), 'utf8');
	const ladders = fs.readFileSync(path.resolve(__dirname, '../../server/ladders.ts'), 'utf8');
	const tournaments = fs.readFileSync(path.resolve(__dirname, '../../server/tournaments/index.ts'), 'utf8');

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
});
