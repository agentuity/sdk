import { createCommand } from '../../../types.ts';
import { listSubcommand } from './list.ts';
import { logsSubcommand } from './logs.ts';
import { showSubcommand } from './show.ts';
import { removeSubcommand } from './remove.ts';
import { rollbackSubcommand } from './rollback.ts';
import { undeploySubcommand } from './undeploy.ts';
import { getCommand } from '../../../command-prefix.ts';

export const deploymentCommand = createCommand({
	name: 'deployment',
	description: 'Manage deployments',
	tags: ['read-only', 'fast', 'requires-auth'],
	aliases: ['deployments', 'dep'],
	examples: [
		{ command: getCommand('cloud deployment list'), description: 'List all deployments' },
		{ command: getCommand('cloud deployment logs <id>'), description: 'Show deployment logs' },
	],
	subcommands: [
		listSubcommand,
		logsSubcommand,
		showSubcommand,
		removeSubcommand,
		rollbackSubcommand,
		undeploySubcommand,
	],
});
