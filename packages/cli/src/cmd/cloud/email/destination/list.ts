import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createEmailAdapter } from '../util';
import { DestinationSchema } from './schemas';

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List destinations for an email address',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			address_id: z.string().min(1).describe('Email address ID (eaddr_*)'),
		}),
		response: z.array(DestinationSchema),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const email = createEmailAdapter(ctx);
		const destinations = await email.listDestinations(args.address_id);

		if (!options.json) {
			tui.table(
				destinations.map((item) => ({
					ID: item.id,
					Type: item.type,
					'Config URL': (item.config?.url as string | undefined) ?? '-',
					Created: new Date(item.created_at).toLocaleString(),
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'Type', alignment: 'left' },
					{ name: 'Config URL', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]
			);
		}

		return destinations;
	},
});

export default listSubcommand;
