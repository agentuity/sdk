import { createCommand } from '../../types';
import { createProjectSubcommand } from './create';
import { importSubcommand } from './import';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { showSubcommand } from './show';
import { addCommand } from './add';
import { hostnameCommand } from './hostname';
import { domainCommand } from './domain';
import { getCommand } from '../../command-prefix';

export const command = createCommand({
	name: 'project',
	description: 'Project related commands',
	tags: ['fast', 'requires-auth'],
	examples: [
		{ command: getCommand('project create my-agent'), description: 'Create a new project' },
		{ command: getCommand('project import'), description: 'Import an existing project' },
		{ command: getCommand('project list'), description: 'List all projects' },
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
		addCommand,
		hostnameCommand,
		domainCommand,
	],
});
