'use strict';

const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '../..');
const extraArgs = process.argv.slice(2);
const port = extraArgs.find(argument => /^\d+$/.test(argument)) || '8000';
const server = spawn(
	process.execPath,
	[path.join(root, 'pokemon-showdown'), 'start', ...extraArgs],
	{
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, PS_RPG_MODE: '1' },
	}
);

console.log('');
console.log('Pokemon Showdown RPG');
console.log(`Interface: http://127.0.0.1:${port}/rpg/`);
console.log('Use Ctrl+C para encerrar.');
console.log('');

server.on('error', error => {
	console.error('Nao foi possivel iniciar o servidor RPG:', error.message);
	process.exitCode = 1;
});

server.on('exit', (code, signal) => {
	if (signal === 'SIGINT') return;
	process.exitCode = code ?? 1;
});
