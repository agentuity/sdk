import { createCommand } from '../../../types.ts';
import { configSubcommand } from './config.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { deleteSubcommand } from './delete.ts';
import { getSubcommand } from './get.ts';
import { uploadSubcommand } from './upload.ts';
import { downloadSubcommand } from './download.ts';
import { getCommand } from '../../../command-prefix.ts';

export const storageCommand = createCommand({
	name: 'storage',
	aliases: ['s3'],
	description: 'Manage S3 compatible managed storage resources',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{ command: getCommand('cloud storage list'), description: 'List all storage resources' },
		{
			command: getCommand('cloud storage upload ./file.txt'),
			description: 'Upload file to storage',
		},
	],
	subcommands: [
		configSubcommand,
		createSubcommand,
		listSubcommand,
		getSubcommand,
		uploadSubcommand,
		downloadSubcommand,
		deleteSubcommand,
	],
});
