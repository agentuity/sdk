import type { SubcommandDefinition } from '../../../types';
import { listSubcommand } from './list';
import { addSubcommand } from './add';
import { deleteSubcommand } from './delete';

export const resourceSubcommand: SubcommandDefinition = {
	name: 'resource',
	aliases: ['resources'],
	description: 'Manage cloud resources',
	subcommands: [listSubcommand, addSubcommand, deleteSubcommand],
};
