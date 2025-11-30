import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { logsSubcommand } from './logs';
import { showSubcommand } from './show';
import { removeSubcommand } from './remove';
import { rollbackSubcommand } from './rollback';
import { undeploySubcommand } from './undeploy';
import { getCommand } from '../../../command-prefix';

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
