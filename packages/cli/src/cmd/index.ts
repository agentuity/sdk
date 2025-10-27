import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandDefinition } from '../types';

export async function discoverCommands(): Promise<CommandDefinition[]> {
	const cmdDir = join(import.meta.dir);
	const entries = await readdir(cmdDir, { withFileTypes: true });

	const commands: CommandDefinition[] = [];

	for (const entry of entries) {
		if (entry.isDirectory()) {
			try {
				const modulePath = join(cmdDir, entry.name, 'index.ts');
				const module = await import(modulePath);

				if (module.default || module.command) {
					commands.push(module.default || module.command);
				}
			} catch (error) {
				console.warn(`Warning: Failed to load command from ${entry.name}:`, error);
			}
		}
	}

	return commands;
}
