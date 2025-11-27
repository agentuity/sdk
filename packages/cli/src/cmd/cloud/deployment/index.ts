import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { logsSubcommand } from './logs';
import { showSubcommand } from './show';
import { removeSubcommand } from './remove';
import { rollbackSubcommand } from './rollback';
import { undeploySubcommand } from './undeploy';

export const deploymentCommand = createCommand({
	name: 'deployment',
	description: 'Manage deployments',
	tags: ['read-only', 'fast', 'requires-auth'],
	aliases: ['deployments', 'dep'],
	subcommands: [
		listSubcommand,
		logsSubcommand,
		showSubcommand,
		removeSubcommand,
		rollbackSubcommand,
		undeploySubcommand,
	],
});
