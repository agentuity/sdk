import { createCommand } from '../../../types';
import { deleteSubcommand } from './delete';
import { deleteBucketSubcommand } from './delete-bucket';
import { getSubcommand } from './get';
import { listBucketsSubcommand } from './list-buckets';
import { listKeysSubcommand } from './list-keys';
import { putSubcommand } from './put';
import { replSubcommand } from './repl';
import { urlSubcommand } from './url';
import { getCommand } from '../../../command-prefix';

export const command = createCommand({
	name: 'objectstore',
	aliases: ['object', 'obj'],
	description: 'Manage object storage for your projects',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud objectstore repl'),
			description: 'Start interactive object store REPL',
		},
		{ command: getCommand('cloud objectstore list-buckets'), description: 'List all buckets' },
	],
	subcommands: [
		replSubcommand,
		getSubcommand,
		putSubcommand,
		deleteSubcommand,
		urlSubcommand,
		listBucketsSubcommand,
		listKeysSubcommand,
		deleteBucketSubcommand,
	],
	requires: { auth: true, project: true },
});
export default command;
