import type { CommandDefinition } from '../types';
import { isRunningFromExecutable } from './upgrade';

// Use dynamic imports for bundler compatibility while maintaining lazy loading
export async function discoverCommands(): Promise<CommandDefinition[]> {
	const commandModules = await Promise.all([
		import('./ai').then((m) => m.command),
		import('./auth').then((m) => m.command),
		import('./build').then((m) => m.command),
		import('./cloud').then((m) => m.command),
		import('./dev').then((m) => m.command),
		import('./help').then((m) => m.command),
		import('./integration').then((m) => m.command),
		import('./profile').then((m) => m.command),
		import('./project').then((m) => m.command),
		import('./repl').then((m) => m.command),
		import('./setup').then((m) => m.command),
		import('./upgrade').then((m) => m.command),
		import('./version').then((m) => m.command),
	]);

	const commands: CommandDefinition[] = [];
	const isExecutable = isRunningFromExecutable();

	for (const cmd of commandModules) {
		// Skip commands that require running from an executable when not in one
		if (cmd.executable && !isExecutable) {
			continue;
		}

		commands.push(cmd);

		// Auto-create hidden top-level aliases for subcommands with toplevel: true
		if (cmd.subcommands) {
			for (const subcommand of cmd.subcommands) {
				if (subcommand.toplevel) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const alias: any = {
						name: subcommand.name,
						description: subcommand.description,
						aliases: subcommand.aliases,
						hidden: true,
						skipSkill: true,
						requires: subcommand.requires,
						optional: subcommand.optional,
						schema: subcommand.schema,
						handler: subcommand.handler,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						idempotent: (subcommand as any).idempotent,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						prerequisites: (subcommand as any).prerequisites,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						tags: (subcommand as any).tags,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						examples: (subcommand as any).examples,
					};
					commands.push(alias as CommandDefinition);
				}
			}
		}
	}

	return commands;
}
