import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List cloud resources for an organization',
	aliases: ['ls'],
	requires: { auth: true, org: true, region: true },
	schema: {
		options: z.object({
			format: z
				.enum(['text', 'json'])
				.optional()
				.default('text')
				.describe('Output format (text or json)'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources = await tui.spinner({
			message: `Fetching resources for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		// Output based on format
		if (opts.format === 'json') {
			console.log(JSON.stringify(resources, null, 2));
		} else {
			// Text table format
			if (resources.db.length === 0 && resources.s3.length === 0) {
				tui.info('No resources found');
				return;
			}

			if (resources.db.length > 0) {
				tui.info(tui.bold('Databases'));
				tui.newline();
				for (const db of resources.db) {
					console.log(tui.bold(db.name));
					if (db.url) console.log(` URL:        ${tui.muted(db.url)}`);
					tui.newline();
				}
			}

			if (resources.s3.length > 0) {
				tui.info(tui.bold('Storage'));
				tui.newline();
				for (const s3 of resources.s3) {
					console.log(tui.bold(s3.bucket_name));
					if (s3.access_key) console.log(` Access Key: ${tui.muted(s3.access_key)}`);
					if (s3.secret_key) console.log(` Secret Key: ${tui.muted(s3.secret_key)}`);
					if (s3.region) console.log(` Region:     ${tui.muted(s3.region)}`);
					if (s3.endpoint) console.log(` Endpoint:   ${tui.muted(s3.endpoint)}`);
					tui.newline();
				}
			}
		}
	},
});
