import { createCommand } from '../../../../types.ts';
import { urlSubcommand } from './url.ts';
import { listSubcommand } from './list.ts';
import { deleteSubcommand } from './delete.ts';

export const destinationCommand = createCommand({
	name: 'destination',
	aliases: ['destinations', 'dest'],
	description: 'Manage email destinations for an address',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [urlSubcommand, listSubcommand, deleteSubcommand],
});

export default destinationCommand;
