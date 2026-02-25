import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter } from '../util';

const DeleteDestinationResponseSchema = z.object({
	success: z.boolean(),
	address_id: z.string(),
	destination_id: z.string(),
});

export const deleteSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'del'],
	description: 'Delete a destination from an email address',
	tags: ['destructive', 'deletes-resource', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			address_id: z.string().min(1).describe('Email address ID (eaddr_*)'),
			destination_id: z.string().min(1).describe('Destination ID (edest_*)'),
		}),
		options: z.object({
			confirm: z.boolean().optional().default(false).describe('Skip confirmation prompt'),
		}),
		response: DeleteDestinationResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;

		if (!args.address_id.startsWith('eaddr_')) {
			tui.fatal('Invalid email address ID — must start with eaddr_');
		}
		if (!args.destination_id.startsWith('edest_')) {
			tui.fatal('Invalid destination ID — must start with edest_');
		}

		if (!opts.confirm && !options.json) {
			const ok = await tui.confirm(
				`Delete destination ${tui.bold(args.destination_id)} from address ${tui.bold(args.address_id)}?`,
				false
			);
			if (!ok) {
				tui.info('Cancelled');
				return { success: false, address_id: args.address_id, destination_id: args.destination_id };
			}
		}

		const email = createEmailAdapter(ctx);
		await email.deleteDestination(args.address_id, args.destination_id);

		if (!options.json) {
			tui.success(`Deleted destination ${args.destination_id}`);
		}

		return {
			success: true,
			address_id: args.address_id,
			destination_id: args.destination_id,
		};
	},
});

export default deleteSubcommand;
