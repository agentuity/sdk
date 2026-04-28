import { createCommand } from '../../../../types.ts';
import { getSubcommand } from './get.ts';
import { listSubcommand } from './list.ts';
import { createSubcommand } from './create.ts';
import { destroySubcommand } from './destroy.ts';
import { logsSubcommand } from './logs.ts';
import { getCommand } from '../../../../command-prefix.ts';

export const command = createCommand({
	name: 'job',
	aliases: ['jobs'],
	description: 'Manage background jobs in a sandbox',
	tags: ['requires-auth'],
	examples: [
		{
			command: getCommand('cloud sandbox job create sbx_abc123 -- bun run build'),
			description: 'Create a background job',
		},
		{
			command: getCommand('cloud sandbox job list sbx_abc123'),
			description: 'List jobs for a sandbox',
		},
		{
			command: getCommand('cloud sandbox job destroy sbx_abc123 job_xyz789'),
			description: 'Terminate a running job',
		},
		{
			command: getCommand('cloud sandbox job logs sbx_abc123 job_xyz789'),
			description: 'View logs from a job',
		},
	],
	subcommands: [
		createSubcommand,
		getSubcommand,
		listSubcommand,
		destroySubcommand,
		logsSubcommand,
	],
	requires: { auth: true, org: true },
});

export default command;
