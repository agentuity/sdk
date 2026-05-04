import { createCommand } from '../../../../types.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';

export const inboundCommand = createCommand({
	name: 'inbound',
	description: 'Manage inbound (received) emails',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
});

export default inboundCommand;
