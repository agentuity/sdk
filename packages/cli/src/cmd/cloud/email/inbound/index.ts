import { createCommand } from '../../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';

export default createCommand({
	name: 'inbound',
	description: 'Manage inbound (received) emails',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
});
