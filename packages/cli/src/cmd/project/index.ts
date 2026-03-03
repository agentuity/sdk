import { createCommand } from '../../types.ts';
import { createProjectSubcommand } from './create.ts';
import { importSubcommand } from './import.ts';
import { listSubcommand } from './list.ts';
import { deleteSubcommand } from './delete.ts';
import { showSubcommand } from './show.ts';
import { authCommand } from './auth/index.ts';
import { addCommand } from './add/index.ts';
import { hostnameCommand } from './hostname/index.ts';
import { domainCommand } from './domain/index.ts';
import { getCommand } from '../../command-prefix.ts';

export const command = createCommand({
	name: 'project',
	description: 'Project related commands',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('project create my-agent'), description: 'Create a new project' },
		{ command: getCommand('project import'), description: 'Import an existing project' },
		{ command: getCommand('project list'), description: 'List all projects' },
		{ command: getCommand('project auth init'), description: 'Set up Agentuity Auth' },
		{ command: getCommand('project add database'), description: 'Link an existing database' },
		{
			command: getCommand('project add storage'),
			description: 'Link an existing storage bucket',
		},
		{
			command: getCommand('project hostname get'),
			description: 'Show current vanity hostname',
		},
		{
			command: getCommand('project domain check'),
			description: 'Check DNS for custom domains',
		},
	],
	subcommands: [
		createProjectSubcommand,
		importSubcommand,
		listSubcommand,
		deleteSubcommand,
		showSubcommand,
		authCommand,
		addCommand,
		hostnameCommand,
		domainCommand,
	],
});
