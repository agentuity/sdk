import { createCommand } from '../../../../types';
import { listSubcommand } from './list';
import { getSubcommand } from './get';

export default createCommand({
	name: 'outbound',
	description: 'Manage outbound (sent) emails',
	tags: ['requires-auth'],
	requires: { auth: true },
	subcommands: [listSubcommand, getSubcommand],
});
