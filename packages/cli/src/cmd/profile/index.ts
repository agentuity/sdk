import { createCommand } from '../../types';
import { createCommand as createProfileCmd } from './create';
import { useCommand } from './use';
import { listCommand } from './list';
import { showCommand } from './show';
import { deleteCommand } from './delete';

export const command = createCommand({
	name: 'profile',
	description: 'Manage configuration profiles',
	subcommands: [createProfileCmd, useCommand, listCommand, showCommand, deleteCommand],
});
