import { z } from 'zod';
import { getCommand } from '../../command-prefix.ts';
import { createCommand } from '../../types.ts';
import { installSubcommand } from './install.ts';
import { listSubcommand } from './list.ts';
import { setupSubcommand } from './setup.ts';
import { syncSubcommand } from './sync.ts';

export const command = createCommand({
	name: 'skills',
	description: 'Install and sync Agentuity agent skills from npm',
	tags: ['fast', 'mutating'],
	examples: [
		{
			command: getCommand('skills install'),
			description: 'Install and sync @agentuity/skills in the current project',
		},
		{
			command: getCommand('skills install --global'),
			description: 'Install Agentuity skills to ~/.agents/skills',
		},
		{
			command: getCommand('skills setup'),
			description: 'Wire skills-npm and @agentuity/skills into the current project',
		},
		{
			command: getCommand('skills sync'),
			description: 'Re-sync npm skills to agent directories',
		},
		{
			command: getCommand('skills list'),
			description: 'List bundled skills from @agentuity/skills',
		},
	],
	schema: {
		options: z.object({}),
	},
	subcommands: [installSubcommand, setupSubcommand, syncSubcommand, listSubcommand],
});
