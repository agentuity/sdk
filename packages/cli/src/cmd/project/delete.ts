import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectDelete } from '@agentuity/server';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete a project',
	aliases: ['rm', 'del'],
	requires: { auth: true, apiClient: true },
	schema: {
		args: z.object({
			id: z.string().describe('the project id'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
	},

	async handler(ctx) {
		const { args, opts, apiClient } = ctx;

		const skipConfirm = opts?.confirm === true;

		if (!process.stdout.isTTY && !skipConfirm) {
			tui.fatal('no TTY and --confirm is false');
		}

		if (!skipConfirm) {
			const ok = await tui.confirm('Are you sure you want to delete', false);
			if (!ok) {
				return;
			}
		}

		const deleted = await tui.spinner('Deleting project', async () => {
			const val = await projectDelete(apiClient, args.id);
			if (val.length === 1 && val[0] === args.id) {
				return true;
			}
			return false;
		});

		if (deleted) {
			tui.success(`Project ${args.id} deleted`);
		} else {
			tui.warning(`${args.id} not found`);
		}
	},
});
