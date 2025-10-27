import { Command } from 'commander';
import type { CommandDefinition, CommandContext } from './types';
import { showBanner } from './banner';

export async function createCLI(version: string): Promise<Command> {
	const program = new Command();

	program
		.name('agentuity')
		.description('Agentuity CLI')
		.version(version, '-V, --version', 'Display version')
		.helpOption('-h, --help', 'Display help');

	program
		.option('--config <path>', 'Config file path', '~/.config/agentuity/config.yaml')
		.option('--log-level <level>', 'Log level', 'info')
		.option('--log-timestamp', 'Show timestamps in log output', false)
		.option('--color-scheme <scheme>', 'Color scheme: light or dark');

	program.action(() => {
		showBanner(version);
		program.help();
	});

	return program;
}

export async function registerCommands(
	program: Command,
	commands: CommandDefinition[],
	ctx: CommandContext
): Promise<void> {
	for (const cmd of commands) {
		cmd.register(program, ctx);
	}
}
