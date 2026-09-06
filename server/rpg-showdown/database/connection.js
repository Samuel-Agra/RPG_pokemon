'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function loadEnvironment(file = path.resolve('.env.mysql')) {
	const values = {};
	if (!fs.existsSync(file)) return values;
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
		if (match) values[match[1]] = match[2];
	}
	return values;
}

function databaseConfig() {
	const environment = { ...loadEnvironment(), ...process.env };
	return {
		host: environment.RPG_MYSQL_HOST || '127.0.0.1',
		port: Number(environment.RPG_MYSQL_PORT || 3306),
		user: environment.RPG_MYSQL_USER || environment.MYSQL_USER,
		password: environment.RPG_MYSQL_PASSWORD || environment.MYSQL_PASSWORD,
		database: environment.RPG_MYSQL_DATABASE || environment.MYSQL_DATABASE,
		charset: 'utf8mb4',
		timezone: 'Z',
	};
}

function createPool() {
	return mysql.createPool({
		...databaseConfig(), waitForConnections: true, connectionLimit: 10,
		queueLimit: 0, enableKeepAlive: true, keepAliveInitialDelay: 0,
	});
}

module.exports = { createPool, databaseConfig, loadEnvironment };
