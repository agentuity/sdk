import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { createWorkspaceSubcommand } from './create.ts';
import { getWorkspaceSubcommand } from './get.ts';
import { deleteWorkspaceSubcommand } from './delete.ts';
import { getCommand } from '../../../command-prefix.ts';

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
			command: getCommand(
				'coder workspace create "My Workspace" --repo https://github.com/org/repo'
			),
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
