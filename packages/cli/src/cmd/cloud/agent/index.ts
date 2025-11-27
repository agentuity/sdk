import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';

export const agentCommand = createCommand({
	name: 'agent',
	description: 'Manage agents',
	aliases: ['agents'],
	tags: ['read-only', 'fast', 'requires-auth'],
	subcommands: [listSubcommand, getSubcommand],
});
