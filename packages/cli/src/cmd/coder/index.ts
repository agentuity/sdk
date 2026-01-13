import { createCommand } from '../../types';
import { installSubcommand } from './install';
import { uninstallSubcommand } from './uninstall';
import { runSubcommand } from './run';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'coder',
	description: 'Agentuity Coder - AI coding agent team for Open Code',
	tags: ['fast'],
	examples: [
		{
			command: getCommand('coder install'),
			description: 'Install Agentuity Coder plugin into Open Code',
		},
		{
			command: getCommand('coder uninstall'),
			description: 'Uninstall Agentuity Coder plugin from Open Code',
		},
		{
			command: getCommand('coder run "implement dark mode"'),
			description: 'Run a task with the Agentuity Coder agent team',
		},
	],
	subcommands: [installSubcommand, uninstallSubcommand, runSubcommand],
});

export default command;
