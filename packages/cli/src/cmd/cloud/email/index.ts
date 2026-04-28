import { createCommand } from '../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';
import { deleteSubcommand } from './delete.ts';
import { destinationCommand } from './destination/index.ts';
import { sendSubcommand } from './send.ts';
import { inboundCommand } from './inbound/index.ts';
import { outboundCommand } from './outbound/index.ts';
import { statsSubcommand } from './stats.ts';

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
		statsSubcommand,
	],
	requires: { auth: true },
});

export default emailCommand;
