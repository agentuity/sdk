import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { createWorkspaceSubcommand } from './create';
import { getWorkspaceSubcommand } from './get';
import { deleteWorkspaceSubcommand } from './delete';
import { getCommand } from '../../../command-prefix';

export const workspaceCommand = createCommand({
	name: 'workspace',
	aliases: ['workspaces', 'ws'],
	description: 'Manage Coder workspaces',
	tags: ['requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace list'),
			description: 'List all workspaces',
		},
		{
			command: getCommand('coder workspace create "My Workspace"'),
			description: 'Create a new workspace',
		},
		{
			command: getCommand('coder workspace get ws_abc123'),
			description: 'Show workspace details',
		},
		{
			command: getCommand('coder workspace delete ws_abc123'),
			description: 'Delete a workspace',
		},
	],
	subcommands: [
		listSubcommand,
		createWorkspaceSubcommand,
		getWorkspaceSubcommand,
		deleteWorkspaceSubcommand,
	],
});
