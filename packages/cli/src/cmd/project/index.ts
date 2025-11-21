import { createCommand } from '../../types';
import { createProjectSubcommand } from './create';
import { listSubcommand } from './list';
import { deleteSubcommand } from './delete';
import { showSubcommand } from './show';

export const command = createCommand({
	name: 'project',
	description: 'Project related commands',
	tags: ['fast', 'requires-auth'],
	subcommands: [createProjectSubcommand, listSubcommand, deleteSubcommand, showSubcommand],
});
