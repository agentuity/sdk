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
					const cmd = module.default || module.command;
					commands.push(cmd);

					// Auto-create hidden top-level aliases for subcommands with toplevel: true
					if (cmd.subcommands) {
						for (const subcommand of cmd.subcommands) {
							if (subcommand.toplevel) {
								const alias: CommandDefinition = {
									name: subcommand.name,
									description: subcommand.description,
									aliases: subcommand.aliases,
									hidden: true,
									requires: subcommand.requires,
									optional: subcommand.optional,
									schema: subcommand.schema,
									handler: subcommand.handler,
								};
								commands.push(alias);
							}
						}
					}
				}
			} catch (error) {
				console.warn(`Warning: Failed to load command from ${entry.name}:`, error);
			}
		}
	}

	return commands;
}
