import { createCommand } from '../../types';
import { deleteSubcommand } from './delete';
import { getSubcommand } from './get';
import { putSubcommand } from './put';
import { replSubcommand } from './repl';
import { urlSubcommand } from './url';

export const command = createCommand({
	name: 'objectstore',
	aliases: ['object', 'obj'],
	description: 'Manage object storage for your projects',
	subcommands: [replSubcommand, getSubcommand, putSubcommand, deleteSubcommand, urlSubcommand],
	requires: { auth: true, project: true },
});
