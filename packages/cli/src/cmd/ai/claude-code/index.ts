import { createCommand } from '../../../types.ts';
import { installSubcommand } from './install.ts';
import { uninstallSubcommand } from './uninstall.ts';
import { getCommand } from '../../../command-prefix.ts';

export const command = createCommand({
	name: 'claude-code',
	description: 'Agentuity Coder plugin for Claude Code',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai claude-code install'),
			description: 'Install Agentuity Coder plugin for Claude Code',
		},
		{
			command: getCommand('ai claude-code uninstall'),
			description: 'Uninstall Agentuity Coder plugin for Claude Code',
		},
	],
	subcommands: [installSubcommand, uninstallSubcommand],
});

export default command;
