import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { getCommand } from '../../../command-prefix';

export const agentCommand = createCommand({
	name: 'agent',
	description: 'Manage agents',
	aliases: ['agents'],
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{ command: getCommand('cloud agent list'), description: 'List all agents' },
		{ command: getCommand('cloud agent get <id>'), description: 'Get agent details' },
	],
	subcommands: [listSubcommand, getSubcommand],
});
