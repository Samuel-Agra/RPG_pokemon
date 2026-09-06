import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
	RPGItemRegistry,
	type RPGItemDefinition,
} from '../../sim/rpg-showdown';

export interface RPGCustomItemRepository {
	list(): RPGItemDefinition[];
	create(definition: RPGItemDefinition): void;
}

export class RPGMemoryCustomItemRepository implements RPGCustomItemRepository {
	private readonly items = new Map<string, RPGItemDefinition>();
	constructor(items: RPGItemDefinition[] = [], private readonly changed?: (item: RPGItemDefinition) => void) {
		for (const definition of items) {
			const item = validateCustomItem(definition);
			this.items.set(item.id, item);
		}
	}

	list(): RPGItemDefinition[] {
		return [...this.items.values()].map(item => structuredClone(item));
	}

	create(definition: RPGItemDefinition): void {
		const item = validateCustomItem(definition);
		if (this.items.has(item.id)) throw new Error('RPG custom item already exists: ' + item.id);
		this.items.set(item.id, item);
		this.changed?.(item);
	}
}

interface RPGCustomItemFileData {
	version: 1;
	items: RPGItemDefinition[];
}

export class RPGFileCustomItemRepository implements RPGCustomItemRepository {
	private readonly items = new Map<string, RPGItemDefinition>();
	private readonly filePath: string;

	constructor(filePath = resolve('config/rpg-custom-items.json')) {
		this.filePath = filePath;
		if (!existsSync(filePath)) return;
		const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<RPGCustomItemFileData>;
		if (parsed.version !== 1 || !Array.isArray(parsed.items)) {
			throw new Error('Invalid RPG custom item file');
		}
		for (const definition of parsed.items) {
			const item = validateCustomItem(definition);
			if (this.items.has(item.id)) throw new Error('Duplicated RPG custom item: ' + item.id);
			this.items.set(item.id, item);
		}
	}

	list(): RPGItemDefinition[] {
		return [...this.items.values()].map(item => structuredClone(item));
	}

	create(definition: RPGItemDefinition): void {
		const item = validateCustomItem(definition);
		if (this.items.has(item.id)) throw new Error('RPG custom item already exists: ' + item.id);
		this.items.set(item.id, item);
		try {
			this.persist();
		} catch (error) {
			this.items.delete(item.id);
			throw error;
		}
	}

	private persist(): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temporary = this.filePath + '.tmp';
		const data: RPGCustomItemFileData = { version: 1, items: [...this.items.values()] };
		writeFileSync(temporary, JSON.stringify(data, null, '\t') + '\n', 'utf8');
		renameSync(temporary, this.filePath);
	}
}

function validateCustomItem(definition: RPGItemDefinition): RPGItemDefinition {
	if (!definition || typeof definition !== 'object' || definition.source !== 'custom') {
		throw new Error('RPG custom item requires source custom');
	}
	const registry = new RPGItemRegistry([definition]);
	return registry.require(definition.id);
}
