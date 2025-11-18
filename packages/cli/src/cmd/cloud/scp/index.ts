import type { SubcommandDefinition } from '../../../types';
import { downloadCommand } from './download';
import { uploadCommand } from './upload';

export const scpSubcommand: SubcommandDefinition = {
	name: 'scp',
	description: 'Secure Copy commands',
	subcommands: [downloadCommand, uploadCommand],
};
