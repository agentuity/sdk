import { createCommand } from '../../../../types';
import { urlSubcommand } from './url';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';

export const destinationCommand = createCommand({
	name: 'destination',
	aliases: ['destinations', 'dest'],
	description: 'Manage email destinations for an address',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [urlSubcommand, listSubcommand, deleteSubcommand],
});

export default destinationCommand;
