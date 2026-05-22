import type { CommandDefinition } from '../types.ts';

// Use dynamic imports for bundler compatibility while maintaining lazy loading
export async function discoverCommands(): Promise<CommandDefinition[]> {
	const commandModules = await Promise.all([
		import('./ai/index.ts').then((m) => m.command),
		import('./auth/index.ts').then((m) => m.command),
		import('./build/index.ts').then((m) => m.command),
		import('./canary/index.ts').then((m) => m.command),
		import('./cloud/index.ts').then((m) => m.command),
		import('./coder/index.ts').then((m) => m.command),
		import('./dev/index.ts').then((m) => m.command),
		import('./git/index.ts').then((m) => m.gitCommand),
		import('./help/index.ts').then((m) => m.command),
		import('./profile/index.ts').then((m) => m.command),
		import('./project/index.ts').then((m) => m.command),
		import('./repl/index.ts').then((m) => m.command),
		import('./setup/index.ts').then((m) => m.command),
		import('./support/index.ts').then((m) => m.command),
		import('./upgrade/index.ts').then((m) => m.command),
		import('./version/index.ts').then((m) => m.command),
	]);

	const commands: CommandDefinition[] = [];

	for (const cmd of commandModules) {
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
