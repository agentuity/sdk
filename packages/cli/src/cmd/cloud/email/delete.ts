import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createEmailAdapter } from './util';

const DeleteResponseSchema = z.object({
	success: z.boolean(),
	id: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'del'],
	description: 'Delete an email address',
	tags: ['destructive', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Email address ID (eaddr_*)'),
		}),
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: DeleteResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		if (!opts.confirm) {
			const ok = await tui.confirm(`Delete email address ${tui.bold(args.id)}?`, false);
			if (!ok) {
				if (!options.json) {
					tui.info('Cancelled');
				}
				return { success: false, id: args.id };
			}
		}

		const email = await createEmailAdapter(ctx);
		await email.deleteAddress(args.id);

		if (!options.json) {
			tui.success(`Deleted email address ${args.id}`);
		}

		return {
			success: true,
			id: args.id,
		};
	},
});

export default deleteSubcommand;
