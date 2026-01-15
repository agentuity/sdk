import { createCommand } from '../../../types';
import { installSubcommand } from './install';
import { uninstallSubcommand } from './uninstall';
import { runSubcommand } from './run';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'opencode',
	description: 'Agentuity Open Code plugin - AI coding agent team',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai opencode install'),
			description: 'Install Agentuity Open Code plugin',
		},
		{
			command: getCommand('ai opencode uninstall'),
			description: 'Uninstall Agentuity Open Code plugin',
		},
		{
			command: getCommand('ai opencode run "implement dark mode"'),
			description: 'Run a task with the Agentuity Coder agent team',
		},
	],
	subcommands: [installSubcommand, uninstallSubcommand, runSubcommand],
});

export default command;
