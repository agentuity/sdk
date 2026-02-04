import { createCommand } from '../../../types';
import { databaseSubcommand } from './database';
import { storageSubcommand } from './storage';
import { getCommand } from '../../../command-prefix';

export const addCommand = createCommand({
	name: 'add',
	description: 'Link existing cloud resources to the current project',
	tags: ['fast', 'requires-auth', 'requires-project'],
	examples: [
		{
			command: getCommand('project add database'),
			description: 'Link an existing database to the project',
		},
		{
			command: getCommand('project add storage'),
			description: 'Link an existing storage bucket to the project',
		},
		{
			command: getCommand('project add database my-db'),
			description: 'Link a specific database by name',
		},
		{
			command: getCommand('project add storage my-bucket'),
			description: 'Link a specific storage bucket by name',
		},
	],
	subcommands: [databaseSubcommand, storageSubcommand],
});
