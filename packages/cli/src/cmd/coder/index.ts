import { createCommand } from '../../types.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { startSubcommand } from './start.ts';
import { createCoderSubcommand } from './create.ts';
import { deleteSubcommand } from './delete.ts';
import { archiveSubcommand } from './archive.ts';
import { updateSubcommand } from './update.ts';
import { usersSubcommand } from './users.ts';
import { loopSubcommand } from './loop.ts';
import { replaySubcommand } from './replay.ts';
import { participantsSubcommand } from './participants.ts';
import { eventsSubcommand } from './events.ts';
import { workspaceCommand } from './workspace/index.ts';
import { skillCommand } from './skill/index.ts';
import { getCommand } from '../../command-prefix.ts';

export const command = createCommand({
	name: 'coder',
	description: 'Coder session management commands',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('coder start'),
			description: 'Start a coding session connected to Coder',
		},
		{
			command: getCommand('coder start --dir ~/path/to/my/project'),
			description: 'Start a coding session from a specific local project directory',
		},
		{
			command: getCommand('coder create "Build a REST API"'),
			description: 'Create a new Coder session with a task',
		},
		{
			command: getCommand('coder ls'),
			description: 'List all active Coder sessions',
		},
		{
			command: getCommand('coder get <session-id>'),
			description: 'Show detailed session information',
		},
		{
			command: getCommand('coder users'),
			description: 'List known Coder users',
		},
		{
			command: getCommand('coder loop <session-id>'),
			description: 'Get loop state for a session',
		},
		{
			command: getCommand('coder events <session-id> --limit 100'),
			description: 'Show recent event history for a session',
		},
		{
			command: getCommand('coder workspace list'),
			description: 'List Coder workspaces',
		},
		{
			command: getCommand('coder skill list'),
			description: 'List saved skills',
		},
	],
	subcommands: [
		startSubcommand,
		createCoderSubcommand,
		listSubcommand,
		getSubcommand,
		updateSubcommand,
		deleteSubcommand,
		archiveSubcommand,
		usersSubcommand,
		loopSubcommand,
		replaySubcommand,
		participantsSubcommand,
		eventsSubcommand,
		workspaceCommand,
		skillCommand,
	],
	requires: { auth: true, org: true },
});
