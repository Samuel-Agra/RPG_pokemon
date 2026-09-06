"use strict";

const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const esbuild = require('esbuild');

const copyOverDataJSON = (file = 'data') => {
	const files = fs.readdirSync(file);
	for (const f of files) {
		if (fs.statSync(`${file}/${f}`).isDirectory()) {
			copyOverDataJSON(`${file}/${f}`);
		} else if (f.endsWith('.json')) {
			const destination = path.resolve('dist', file, f);
			fs.mkdirSync(path.dirname(destination), {recursive: true});
			fs.copyFileSync(`${file}/${f}`, destination);
		}
	}
};

const shouldBeCompiled = file => {
	if (file.includes('node_modules/')) return false;
	if (file.endsWith('.tsx')) return true;
	if (file.endsWith('.ts')) return !(file.endsWith('.d.ts') || file.includes('global'));
	return false;
};

const ignoredDirectories = new Set(['.git', '.idea', '.vscode', 'databases', 'dist', 'logs', 'node_modules']);

const findFilesForPath = directory => {
	const out = [];
	const files = fs.readdirSync(directory, {withFileTypes: true});
	for (const file of files) {
		if (file.isDirectory() && ignoredDirectories.has(file.name)) continue;
		const cur = path.join(directory, file.name);
		if (file.isDirectory()) {
			out.push(...findFilesForPath(cur));
		} else if (shouldBeCompiled(cur)) {
			out.push(`./${cur.replaceAll('\\', '/')}`);
		}
	}
	return out;
};

exports.transpile = decl => {
	for (const file of findFilesForPath('.')) {
		const relativeFile = file.slice(2);
		const outputFile = path.resolve('dist', relativeFile.replace(/\.tsx?$/, '.js'));
		const result = esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
			loader: file.endsWith('.tsx') ? 'tsx' : 'ts',
			format: 'cjs',
			target: 'es2020',
			jsxFactory: 'Chat.h',
			jsxFragment: 'Chat.Fragment',
			sourcemap: 'external',
			sourcefile: relativeFile.replaceAll('\\', '/'),
		});
		fs.mkdirSync(path.dirname(outputFile), {recursive: true});
		fs.writeFileSync(outputFile, `${result.code}//# sourceMappingURL=${path.basename(outputFile)}.map\n`);
		fs.writeFileSync(`${outputFile}.map`, result.map);
	}
	fs.copyFileSync('./config/config-example.js', './dist/config/config-example.js');
	copyOverDataJSON();

	// NOTE: replace is asynchronous - add additional replacements for the same path in one call instead of making multiple calls.
	if (decl) {
		exports.buildDecls();
	}
};

exports.buildDecls = () => {
	try {
		child_process.execSync(`node ./node_modules/typescript/bin/tsc -p sim`, { stdio: 'inherit' });
	} catch {}
};
