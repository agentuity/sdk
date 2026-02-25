import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { getSubcommand } from './get';
import { deleteSubcommand } from './delete';
import { destinationCommand } from './destination';
import { sendSubcommand } from './send';
import { inboundCommand } from './inbound';
import { outboundCommand } from './outbound';

export const emailCommand = createCommand({
	name: 'email',
	aliases: ['mail'],
	description: 'Manage email addresses and messages',
	tags: ['requires-auth'],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		destinationCommand,
		sendSubcommand,
		inboundCommand,
		outboundCommand,
	],
	requires: { auth: true },
});

export default emailCommand;
