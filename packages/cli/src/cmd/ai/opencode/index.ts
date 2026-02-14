import { createCommand } from '../../../types';
import { installSubcommand } from './install';
import { uninstallSubcommand } from './uninstall';
import { runSubcommand } from './run';
import { dashboardSubcommand } from './dashboard';
import { inspectSubcommand } from './inspect';
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
		{
			command: getCommand('ai opencode dashboard'),
			description: 'View Coder session dashboard',
		},
		{
			command: getCommand('ai opencode inspect --session ses_abc123'),
			description: 'Inspect a specific session in detail',
		},
	],
	subcommands: [
		installSubcommand,
		uninstallSubcommand,
		runSubcommand,
		dashboardSubcommand,
		inspectSubcommand,
	],
});

export default command;
