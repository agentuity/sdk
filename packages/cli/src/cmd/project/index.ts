import { createCommand } from '../../types';
import { createProjectSubcommand } from './create';
import { importSubcommand } from './import';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { showSubcommand } from './show';
import { authCommand } from './auth';
import { addCommand } from './add';
import { getCommand } from '../../command-prefix';

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
	],
	subcommands: [
		createProjectSubcommand,
		importSubcommand,
		listSubcommand,
		deleteSubcommand,
		showSubcommand,
		authCommand,
		addCommand,
	],
});
