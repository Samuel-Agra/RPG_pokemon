'use strict';

const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(__dirname, '../../chat-commands/avatars.tsx');
const targetPath = path.resolve(__dirname, '../../static/rpg/avatars.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('const OFFICIAL_AVATARS =');
const end = source.indexOf('for (const avatar of OFFICIAL_AVATARS_BELIOT419)');

if (start < 0 || end < 0 || end <= start) {
	throw new Error('Official Showdown avatar catalog markers were not found');
}

const section = source.slice(start, end);
const ids = [...section.matchAll(/'([a-z0-9-]+)'/g)].map(match => match[1]);
const roots = new Set(ids.map(id => id.split('-')[0].replace(/\d+$/, '')));
const legacySection = section.slice(0, section.indexOf('const OFFICIAL_AVATARS_BELIOT419'));
const legacyIds = new Set(
	[...legacySection.matchAll(/'([a-z0-9-]+)'/g)].map(match => match[1])
);
const MULTI_TRAINER_PATTERNS = [
	/^acetrainercouple/, /^backers/, /^crushkin/, /^doubleteam/,
	/^hooligans/, /^interviewers/, /^jessiejames/, /^oldcouple/,
	/^preschoolers$/, /^shadowtriad/, /^sisandbro/, /^srandjr/,
	/^tateandliza/, /^teammates/, /^teamrocket$/, /^twins/,
	/^youngcouple/, /^yukito-hideko$/, /darach-caitlin/, /sordward-shielbert/,
];

function isMultiTrainer(id) {
	return MULTI_TRAINER_PATTERNS.some(pattern => pattern.test(id));
}

function canonicalKey(id) {
	let key = id.split('-')[0].replace(/\d+$/, '');
	if (/[fm]$/.test(key) && roots.has(key.slice(0, -1))) key = key.slice(0, -1);
	if (id.startsWith('miku-')) return id;
	return key.replace(/jp$/, '');
}

function avatarName(key) {
	if (key === 'n') return 'N';
	return key.split('-').map(part =>
		part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

const groups = new Map();
for (const id of ids) {
	const key = canonicalKey(id);
	const variants = groups.get(key) || [];
	variants.push(id);
	groups.set(key, variants);
}

const avatars = [...groups].map(([key, variants]) => {
	const individual = variants.filter(id => !isMultiTrainer(id));
	if (!individual.length) return null;
	if (variants.length === 1 && legacyIds.has(variants[0])) return null;
	const id = individual[individual.length - 1];
	return { id, name: avatarName(key) };
}).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

const catalog = {
	version: 2,
	sourceCount: ids.length,
	avatarCount: avatars.length,
	defaultAvatarId: avatars.find(avatar => avatar.name === 'Lucas')?.id || avatars[0].id,
	deduplication: 'Latest individual sprite per trainer or class; unique legacy sprites excluded',
	avatars,
};

fs.writeFileSync(targetPath, JSON.stringify(catalog, null, '\t') + '\n');
console.log(`Generated ${avatars.length} RPG avatars from ${ids.length} official sprites.`);
