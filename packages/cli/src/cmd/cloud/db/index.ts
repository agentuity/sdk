import { createCommand } from '../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { deleteSubcommand } from './delete.ts';
import { getSubcommand } from './get.ts';
import { logsSubcommand } from './logs.ts';
import { sqlSubcommand } from './sql.ts';
import { statsSubcommand } from './stats.ts';
import { getCommand } from '../../../command-prefix.ts';

export const dbCommand = createCommand({
	name: 'db',
	aliases: ['database'],
	description: 'Manage Postgres managed database resources',
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
		statsSubcommand,
	],
});
