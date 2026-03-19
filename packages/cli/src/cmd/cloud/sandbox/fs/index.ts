import { createCommand } from '../../../../types';
import { getCommand } from '../../../../command-prefix';
import { rmSubcommand } from './rm';
import { mkdirSubcommand } from './mkdir';
import { rmdirSubcommand } from './rmdir';
import { lsSubcommand } from './ls';
import { cpSubcommand } from './cp';
import { downloadSubcommand } from './download';
import { uploadSubcommand } from './upload';

export const command = createCommand({
	name: 'fs',
	aliases: ['files', 'file'],
	description: 'Filesystem operations for sandboxes',
	tags: ['slow', 'requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox fs ls sbx_abc123'),
			description: 'List files in a sandbox',
		},
		{
			command: getCommand('cloud sandbox fs cp ./file.txt sbx_abc123:/path/to/file.txt'),
			description: 'Copy a file to a sandbox',
		},
	],
	subcommands: [
		lsSubcommand,
		cpSubcommand,
		rmSubcommand,
		mkdirSubcommand,
		rmdirSubcommand,
		downloadSubcommand,
		uploadSubcommand,
	],
	requires: { auth: true, org: true },
});
