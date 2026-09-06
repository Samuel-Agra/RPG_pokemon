'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const extraArgs = process.argv.slice(2);
const port = extraArgs.find(argument => /^\d+$/.test(argument)) || '8000';

process.chdir(root);
process.env.PS_RPG_MODE = '1';
execFileSync(process.execPath, [path.join(root, 'build')], { cwd: root, stdio: 'inherit' });

console.log('');
console.log('Pokémon RPG');
console.log(`Interface: http://127.0.0.1:${port}/rpg/`);
console.log('Use Ctrl+C para encerrar.');
console.log('');

require(path.join(root, 'dist/server/index.js'));
