import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createEmailAdapter, EmailAddressSchema } from './util';

export const getSubcommand = createCommand({
	name: 'get',
	description: 'Get an email address by ID',
	tags: ['read-only', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			id: z.string().min(1).describe('Email address ID (eaddr_*)'),
		}),
		response: EmailAddressSchema,
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const email = createEmailAdapter(ctx);
		const address = await email.getAddress(args.id);

		if (!options.json) {
			tui.success(`Email Address: ${tui.bold(address.email)}`);
			tui.table(
				[
					{
						ID: address.id,
						Email: address.email,
						Project: address.project_id ?? '-',
						Provider: address.provider ?? '-',
						Config: address.config ? JSON.stringify(address.config) : '-',
						Created: new Date(address.created_at).toLocaleString(),
						Updated: address.updated_at
							? new Date(address.updated_at).toLocaleString()
							: '-',
					},
				],
				['ID', 'Email', 'Project', 'Provider', 'Config', 'Created', 'Updated'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return address;
	},
});

export default getSubcommand;
