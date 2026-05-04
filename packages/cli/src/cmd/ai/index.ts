import { createCommand } from '../../types.ts';
import capabilitiesCommand from './capabilities/index.ts';
import promptCommand from './prompt/index.ts';
import schemaCommand from './schema/index.ts';
import opencodeCommand from './opencode/index.ts';
import claudeCodeCommand from './claude-code/index.ts';
import introSubcommand from './intro.ts';
import detectSubcommand from './detect.ts';
import { getCommand } from '../../command-prefix.ts';

export const command = createCommand({
	name: 'ai',
	description: 'AI coding agent related commands',
	skipUpgradeCheck: true,
	tags: ['fast'],
	examples: [
		{
			command: getCommand('ai detect'),
			description: 'Detect if running from an AI coding agent',
		},
		{
			command: getCommand('ai intro'),
			description: 'Introduce the Agentuity CLI to your AI agent',
		},
		{
			command: getCommand('ai opencode install'),
			description: 'Install Agentuity Open Code plugin',
		},
		{
			command: getCommand('ai claude-code install'),
			description: 'Install Agentuity Coder plugin for Claude Code',
		},
		{
			command: getCommand('ai capabilities show'),
			description: 'Show CLI capabilities for AI agents',
		},
		{
			command: getCommand('ai schema show'),
			description: 'Output CLI schema for AI consumption',
		},
	],
	subcommands: [
		detectSubcommand,
		introSubcommand,
		opencodeCommand,
		claudeCodeCommand,
		capabilitiesCommand,
		promptCommand,
		schemaCommand,
	],
});
