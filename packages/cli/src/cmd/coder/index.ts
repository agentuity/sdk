import { createCommand } from '../../types';
import { installSubcommand } from './install';
import { uninstallSubcommand } from './uninstall';
import { organizationSubcommand } from './org';
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
			command: getCommand('coder organization'),
			description: 'View or change the organization for Agentuity Coder',
		},
		{
			command: getCommand('coder run "implement dark mode"'),
			description: 'Run a task with the Agentuity Coder agent team',
		},
	],
	subcommands: [installSubcommand, uninstallSubcommand, organizationSubcommand, runSubcommand],
});

export default command;
