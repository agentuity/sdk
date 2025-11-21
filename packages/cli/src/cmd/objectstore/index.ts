import { createCommand } from '../../types';
import { deleteSubcommand } from './delete';
import { deleteBucketSubcommand } from './delete-bucket';
import { getSubcommand } from './get';
import { listBucketsSubcommand } from './list-buckets';
import { listKeysSubcommand } from './list-keys';
import { putSubcommand } from './put';
import { replSubcommand } from './repl';
import { urlSubcommand } from './url';

export const command = createCommand({
	name: 'objectstore',
	aliases: ['object', 'obj'],
	description: 'Manage object storage for your projects',
	tags: ['read-only', 'fast', 'requires-auth'],
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
