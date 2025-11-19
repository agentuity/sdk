import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { showSubcommand } from './show';
import { removeSubcommand } from './remove';
import { rollbackSubcommand } from './rollback';
import { undeploySubcommand } from './undeploy';

export const deploymentCommand = createCommand({
	name: 'deployment',
	description: 'Manage deployments',
	aliases: ['deployments', 'dep'],
	subcommands: [
		listSubcommand,
		showSubcommand,
		removeSubcommand,
		rollbackSubcommand,
		undeploySubcommand,
	],
});
