import { createCommand } from '../../../../types';
import { getSubcommand } from './get';
import { listSubcommand } from './list';
import { createSubcommand } from './create';
import { destroySubcommand } from './destroy';
import { getCommand } from '../../../../command-prefix';

export const command = createCommand({
	name: 'job',
	aliases: ['jobs'],
	description: 'Manage background jobs in a sandbox',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox job create snbx_abc123 -- bun run build'),
			description: 'Create a background job',
		},
		{
			command: getCommand('cloud sandbox job list snbx_abc123'),
			description: 'List jobs for a sandbox',
		},
		{
			command: getCommand('cloud sandbox job destroy snbx_abc123 job_xyz789'),
			description: 'Terminate a running job',
		},
	],
	subcommands: [createSubcommand, getSubcommand, listSubcommand, destroySubcommand],
	requires: { auth: true, org: true },
});

export default command;
