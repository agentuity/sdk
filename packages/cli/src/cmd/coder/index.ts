import { createCommand } from '../../types';
import { listSubcommand } from './list';
import { inspectSubcommand } from './inspect';
import { startSubcommand } from './start';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'coder',
	description: 'Coder Hub session management commands',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('coder start'),
			description: 'Start a Pi session connected to the Coder Hub',
		},
		{
			command: getCommand('coder ls'),
			description: 'List all active Coder Hub sessions',
		},
		{
			command: getCommand('coder inspect <session-id>'),
			description: 'Show detailed session information',
		},
	],
	subcommands: [startSubcommand, listSubcommand, inspectSubcommand],
	optional: { auth: true },
});
