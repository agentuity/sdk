import { z } from 'zod';
import enquirer from 'enquirer';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { setResourceInfo } from '../../../cache/index.ts';
import { createEmailAdapter, resolveEmailOrgId, EmailAddressSchema } from './util.ts';
import { defaultProfileName, getDefaultRegion } from '../../../config.ts';

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['add'],
	description: 'Create an email address',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	schema: {
		options: z.object({
			localPart: z.string().optional().describe('Local part for the email address (before @)'),
		}),
		response: EmailAddressSchema,
	},

	async handler(ctx) {
		const { opts, options, config } = ctx;
		let localPart = opts.localPart?.trim();

		if (!localPart) {
			const answer = await enquirer.prompt<{ local_part: string }>({
				type: 'input',
				name: 'local_part',
				message: 'Email address or username (e.g. "support" or "support@agentuity.email"):',
			});
			localPart = answer.local_part?.trim();
		}

		if (!localPart) {
			tui.fatal('Email address or username is required');
		}

		// If user entered a full email, extract just the local part
		if (localPart.includes('@')) {
			localPart = localPart.split('@')[0]?.trim() ?? '';
		}

		if (!localPart) {
			tui.fatal('Email address or username is required');
		}

		const profileName = config?.name ?? defaultProfileName;
		const region = await getDefaultRegion(profileName, ctx.config);
		const email = await createEmailAdapter(ctx, region);
		const address = await email.createAddress(localPart);

		const orgId = resolveEmailOrgId(ctx);
		await setResourceInfo('email', profileName, address.id, region, orgId);

		if (!options.json) {
			tui.success(`Email Address: ${tui.bold(address.email)}`);
			tui.table(
				[
					{
						ID: address.id,
						Email: address.email,
						Created: new Date(address.created_at).toLocaleString(),
					},
				],
				['ID', 'Email', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return address;
	},
});

export default createSubcommand;
