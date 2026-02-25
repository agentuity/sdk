import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createEmailAdapter } from './util';

const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
	project_id: z.string().optional(),
	provider: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});

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
			tui.info(`  ID:        ${address.id}`);
			tui.info(`  Email:     ${address.email}`);
			tui.info(`  Project:   ${address.project_id ?? '-'}`);
			tui.info(`  Provider:  ${address.provider ?? '-'}`);
			tui.info(`  Config:    ${address.config ? JSON.stringify(address.config) : '-'}`);
			tui.info(`  Created:   ${new Date(address.created_at).toLocaleString()}`);
			tui.info(
				`  Updated:   ${address.updated_at ? new Date(address.updated_at).toLocaleString() : '-'}`
			);
		}

		return address;
	},
});

export default getSubcommand;
