import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { uploadSubcommand } from './upload';
import { downloadSubcommand } from './download';
import { getCommand } from '../../../command-prefix';

export const storageCommand = createCommand({
	name: 'storage',
	aliases: ['s3'],
	description: 'Manage storage resources',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{ command: getCommand('cloud storage list'), description: 'List all storage resources' },
		{
			command: getCommand('cloud storage upload ./file.txt'),
			description: 'Upload file to storage',
		},
	],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		uploadSubcommand,
		downloadSubcommand,
		deleteSubcommand,
	],
});
