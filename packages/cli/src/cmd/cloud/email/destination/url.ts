import { z } from 'zod';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { setResourceInfo } from '../../../../cache';
import { createEmailAdapter, resolveEmailOrgId, resolveEmailRegion } from '../util';
import { DestinationSchema } from './schemas';

export const urlSubcommand = createCommand({
	name: 'url',
	description: 'Add a URL destination to an email address',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	requires: { auth: true },
	schema: {
		args: z.object({
			address_id: z.string().min(1).describe('Email address ID (eaddr_*)'),
			url: z
				.string()
				.url()
				.refine((u) => /^https?:\/\//i.test(u), {
					message: 'URL must use http or https protocol',
				})
				.describe('Destination webhook URL'),
		}),
		options: z.object({
			method: z
				.enum(['POST', 'PUT', 'PATCH'])
				.optional()
				.default('POST')
				.describe('HTTP method (default: POST)'),
		}),
		response: DestinationSchema,
	},

	async handler(ctx) {
		const { args, opts, options, config } = ctx;

		const destinationConfig: Record<string, unknown> = {
			url: args.url,
		};
		if (opts.method && opts.method !== 'POST') {
			destinationConfig.method = opts.method;
		}

		const email = createEmailAdapter(ctx);
		const destination = await email.createDestination(args.address_id, 'url', destinationConfig);

		const profileName = config?.name ?? 'production';
		const orgId = resolveEmailOrgId(ctx);
		const region = resolveEmailRegion(ctx);
		setResourceInfo('email', profileName, destination.id, region, orgId).catch(() => {
			// Non-blocking: destination was already created successfully
		});

		if (!options.json) {
			tui.success(`Destination created: ${tui.bold(destination.id)}`);
			tui.table(
				[
					{
						ID: destination.id,
						Type: 'url',
						URL: args.url,
						Method: opts.method ?? 'POST',
						Created: new Date(destination.created_at).toLocaleString(),
					},
				],
				['ID', 'Type', 'URL', 'Method', 'Created'],
				{ layout: 'vertical', padStart: '  ' }
			);
		}

		return destination;
	},
});

export default urlSubcommand;
