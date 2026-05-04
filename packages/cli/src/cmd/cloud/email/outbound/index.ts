import { createCommand } from '../../../../types.ts';
import { listSubcommand } from './list.ts';
import { getSubcommand } from './get.ts';

export const outboundCommand = createCommand({
	name: 'outbound',
	description: 'Manage outbound (sent) emails',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
});

export default outboundCommand;
