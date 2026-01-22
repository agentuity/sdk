import { createCommand } from '../../types';
import cadenceCommand from './cadence';
import capabilitiesCommand from './capabilities';
import promptCommand from './prompt';
import schemaCommand from './schema';
import skillsCommand from './skills';
import opencodeCommand from './opencode';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'ai',
	description: 'AI coding agent related commands',
	skipUpgradeCheck: true,
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai opencode install'),
			description: 'Install Agentuity Open Code plugin',
		},
		{
			command: getCommand('ai capabilities show'),
			description: 'Show CLI capabilities for AI agents',
		},
		{
			command: getCommand('ai schema show'),
			description: 'Output CLI schema for AI consumption',
		},
		{
			command: getCommand('ai skills generate --output ./skills'),
			description: 'Generate Agent Skills from CLI schema',
		},
	],
	subcommands: [
		opencodeCommand,
		cadenceCommand,
		capabilitiesCommand,
		promptCommand,
		schemaCommand,
		skillsCommand,
	],
});
