import { z } from 'zod';
import enquirer from 'enquirer';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { setResourceInfo } from '../../../cache';
import { createEmailAdapter, resolveEmailOrgId, resolveEmailRegion } from './util';

const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
	project_id: z.string().optional(),
	provider: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['add'],
	description: 'Create an email address',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	schema: {
		options: z.object({
			localPart: z
				.string()
				.optional()
				.describe('Local part for the email address (before @)'),
		}),
		response: EmailAddressSchema,
	},

	async handler(ctx) {
		const { opts, options, config } = ctx;
		let localPart = opts.localPart;

		if (!localPart) {
			const answer = await enquirer.prompt<{ local_part: string }>({
				type: 'input',
				name: 'local_part',
				message: 'Local part (username):',
			});
			localPart = answer.local_part?.trim();
		}

		if (!localPart) {
			tui.fatal('Local part is required');
		}

		const email = createEmailAdapter(ctx);
		const address = await email.createAddress(localPart);

		const profileName = config?.name ?? 'production';
		const orgId = resolveEmailOrgId(ctx);
		const region = resolveEmailRegion(ctx);
		await setResourceInfo('email', profileName, address.id, region, orgId);

		if (!options.json) {
			tui.success(`Email Address: ${tui.bold(address.email)}`);
			tui.info(`  ID:        ${address.id}`);
			tui.info(`  Email:     ${address.email}`);
			tui.info(`  Project:   ${address.project_id ?? '-'}`);
			tui.info(`  Provider:  ${address.provider ?? '-'}`);
			tui.info(`  Created:   ${new Date(address.created_at).toLocaleString()}`);
		}

		return address;
	},
});

export default createSubcommand;
