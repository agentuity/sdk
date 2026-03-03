import { createCommand } from '../../../types.ts';
import { installSubcommand } from './install.ts';
import { uninstallSubcommand } from './uninstall.ts';
import { runSubcommand } from './run.ts';
import { dashboardSubcommand } from './dashboard.ts';
import { inspectSubcommand } from './inspect.ts';
import { getCommand } from '../../../command-prefix.ts';

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
			command: getCommand('ai opencode inspect ses_abc123'),
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
