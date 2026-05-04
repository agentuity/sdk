import { createCommand } from '../../../types.ts';
import { downloadCommand } from './download.ts';
import { uploadCommand } from './upload.ts';
import { getCommand } from '../../../command-prefix.ts';

export const scpSubcommand = createCommand({
	name: 'scp',
	description: 'Secure Copy commands',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{
			command: getCommand('cloud scp upload ./local-file.txt /remote-path/'),
			description: 'Upload file to deployment',
		},
		{
			command: getCommand('cloud scp download /remote-file.txt ./local-path/'),
			description: 'Download file from deployment',
		},
	],
	subcommands: [downloadCommand, uploadCommand],
});
