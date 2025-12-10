import { createCommand } from '../../types';
import capabilitiesCommand from './capabilities';
import promptCommand from './prompt';
import schemaCommand from './schema';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'ai',
	description: 'AI coding agent related commands',
	skipUpgradeCheck: true,
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai capabilities show'),
			description: 'Show CLI capabilities for AI agents',
		},
		{
			command: getCommand('ai schema show'),
			description: 'Output CLI schema for AI consumption',
		},
	],
	subcommands: [capabilitiesCommand, promptCommand, schemaCommand],
});
