import { createCommand } from '../../../types';
import { createSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { logsSubcommand } from './logs';
import { sqlSubcommand } from './sql';
import { getCommand } from '../../../command-prefix';

export const dbCommand = createCommand({
	name: 'db',
	aliases: ['database'],
	description: 'Manage database resources',
	tags: ['slow', 'requires-auth', 'requires-deployment'],
	examples: [
		{ command: getCommand('cloud db list'), description: 'List all databases' },
		{ command: getCommand('cloud db sql "SELECT * FROM users"'), description: 'Run SQL query' },
	],
	subcommands: [
		createSubcommand,
		listSubcommand,
		getSubcommand,
		deleteSubcommand,
		logsSubcommand,
		sqlSubcommand,
	],
});
