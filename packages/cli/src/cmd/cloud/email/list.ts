import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createEmailAdapter, EmailAddressSchema } from './util.ts';

export const listSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List email addresses',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		response: z.array(EmailAddressSchema),
	},

	async handler(ctx) {
		const { options } = ctx;
		const email = await createEmailAdapter(ctx);
		const addresses = await email.listAddresses();

		if (!options.json) {
			tui.table(
				addresses.map((item) => ({
					ID: item.id,
					Email: item.email,
					Created: new Date(item.created_at).toLocaleString(),
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'Email', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]
			);
		}

		return addresses.map((item) => ({
			id: item.id,
			email: item.email,
			created_at: item.created_at,
			updated_at: item.updated_at,
		}));
	},
});

export default listSubcommand;
