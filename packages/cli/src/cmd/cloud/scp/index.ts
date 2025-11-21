import { createCommand } from '../../../types';
import { downloadCommand } from './download';
import { uploadCommand } from './upload';

export const scpSubcommand = createCommand({
	name: 'scp',
	description: 'Secure Copy commands',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	subcommands: [downloadCommand, uploadCommand],
});
