import { createCommand } from '../../../../types.ts';
import { getCommand } from '../../../../command-prefix.ts';
import { rmSubcommand } from './rm.ts';
import { mkdirSubcommand } from './mkdir.ts';
import { rmdirSubcommand } from './rmdir.ts';
import { lsSubcommand } from './ls.ts';
import { cpSubcommand } from './cp.ts';
import { downloadSubcommand } from './download.ts';
import { uploadSubcommand } from './upload.ts';

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
