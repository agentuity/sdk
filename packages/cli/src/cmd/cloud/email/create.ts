import { z } from 'zod';
import enquirer from 'enquirer';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { setResourceInfo } from '../../../cache';
import { createEmailAdapter, resolveEmailOrgId, resolveEmailRegion, EmailAddressSchema } from './util';

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
		let localPart = opts.localPart?.trim();

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
			tui.table(
				[
					{
						ID: address.id,
						Email: address.email,
						Project: address.project_id ?? '-',
						Provider: address.provider ?? '-',
						Created: new Date(address.created_at).toLocaleString(),
					},
				],
				['ID', 'Email', 'Project', 'Provider', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return address;
	},
});

export default createSubcommand;
