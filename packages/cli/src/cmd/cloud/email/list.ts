import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createEmailAdapter } from './util';

const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
	project_id: z.string().optional(),
	provider: z.string().optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});

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
		const email = createEmailAdapter(ctx);
		const addresses = await email.listAddresses();

		if (!options.json) {
			tui.table(
				addresses.map((item) => ({
					ID: item.id,
					Email: item.email,
					Project: item.project_id ?? '-',
					Provider: item.provider ?? '-',
					Created: new Date(item.created_at).toLocaleString(),
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'Email', alignment: 'left' },
					{ name: 'Project', alignment: 'left' },
					{ name: 'Provider', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]
			);
		}

		return addresses;
	},
});

export default listSubcommand;
