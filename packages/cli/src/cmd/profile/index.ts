import { createCommand } from '../../types.ts';
import { createCommand as createProfileCmd } from './create.ts';
import { useCommand } from './use.ts';
import { listCommand } from './list.ts';
import { showCommand } from './show.ts';
import { deleteCommand } from './delete.ts';
import { currentCommand } from './current.ts';
import { getCommand } from '../../command-prefix.ts';

export const command = createCommand({
	name: 'profile',
	description: 'Manage configuration profiles for --profile and AGENTUITY_PROFILE',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('profile list'), description: 'List all profiles' },
		{
			command: getCommand('profile use production'),
			description: 'Switch to production profile',
		},
		{
			command: getCommand('--profile staging auth whoami'),
			description: 'Run a command with a specific profile',
		},
	],
	subcommands: [
		createProfileCmd,
		useCommand,
		listCommand,
		showCommand,
		deleteCommand,
		currentCommand,
	],
});
