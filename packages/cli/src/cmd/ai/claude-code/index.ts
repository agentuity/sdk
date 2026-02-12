import { createCommand } from '../../../types';
import { installSubcommand } from './install';
import { uninstallSubcommand } from './uninstall';
import { getCommand } from '../../../command-prefix';

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
