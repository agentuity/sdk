import { createCommand } from '../../../types';
import { downloadCommand } from './download';
import { uploadCommand } from './upload';
import { getCommand } from '../../../command-prefix';

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
