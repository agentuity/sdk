import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { uploadSubcommand } from './upload';
import { downloadSubcommand } from './download';

export const storageCommand = createCommand({
	name: 'storage',
	aliases: ['s3'],
	description: 'Manage storage resources',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		uploadSubcommand,
		downloadSubcommand,
		deleteSubcommand,
	],
});
