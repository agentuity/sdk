import { createCommand } from '../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { startSubcommand } from './start';
import { createCoderSubcommand } from './create';
import { deleteSubcommand } from './delete';
import { archiveSubcommand } from './archive';
import { updateSubcommand } from './update';
import { usersSubcommand } from './users';
import { loopSubcommand } from './loop';
import { replaySubcommand } from './replay';
import { participantsSubcommand } from './participants';
import { eventsSubcommand } from './events';
import { workspaceCommand } from './workspace';
import { skillCommand } from './skill';
import { getCommand } from '../../command-prefix';

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
			command: getCommand('coder start ~/path/to/my/project'),
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
