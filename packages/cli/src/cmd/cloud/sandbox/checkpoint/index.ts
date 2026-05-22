import { createCommand } from '../../../../types.ts';
import { createSubcommand } from './create.ts';
import { listSubcommand } from './list.ts';
import { restoreSubcommand } from './restore.ts';
import { deleteSubcommand } from './delete.ts';
import { getCommand } from '../../../../command-prefix.ts';

export const checkpointCommand = createCommand({
	name: 'checkpoint',
	aliases: ['ckpt', 'checkpoints'],
	description: 'Manage disk checkpoints for sandbox filesystem',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox checkpoint create sbx_abc123 my-checkpoint'),
			description: 'Create a disk checkpoint',
		},
		{
			command: getCommand('cloud sandbox checkpoint list sbx_abc123'),
			description: 'List disk checkpoints',
		},
		{
			command: getCommand('cloud sandbox checkpoint restore sbx_abc123 ckpt_def456'),
			description: 'Restore a disk checkpoint',
		},
		{
			command: getCommand('cloud sandbox checkpoint delete sbx_abc123 ckpt_def456'),
			description: 'Delete a disk checkpoint',
		},
	],
	subcommands: [createSubcommand, listSubcommand, restoreSubcommand, deleteSubcommand],
});
