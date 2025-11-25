import { z } from 'zod';
import { listResources } from '@agentuity/server';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

const ResourceListResponseSchema = z.object({
	db: z
		.array(
			z.object({
				name: z.string().describe('Database name'),
				url: z.string().optional().describe('Database connection URL'),
			})
		)
		.describe('List of database resources'),
	s3: z
		.array(
			z.object({
				bucket_name: z.string().describe('Storage bucket name'),
				access_key: z.string().optional().describe('S3 access key'),
				secret_key: z.string().optional().describe('S3 secret key'),
				region: z.string().optional().describe('S3 region'),
				endpoint: z.string().optional().describe('S3 endpoint URL'),
			})
		)
		.describe('List of storage resources'),
});

export const listSubcommand = createSubcommand({
	name: 'list',
	description: 'List cloud resources for an organization',
	tags: ['read-only', 'fast', 'requires-auth'],
	aliases: ['ls'],
	requires: { auth: true, org: true, region: true },
	idempotent: true,
	examples: [
		getCommand('cloud resource list'),
		getCommand('--json cloud resource list'),
		getCommand('cloud resource ls'),
	],
	schema: {
		response: ResourceListResponseSchema,
	},

	async handler(ctx) {
		const { logger, options, orgId, region, config, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const resources = await tui.spinner({
			message: `Fetching resources for ${orgId} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return listResources(catalystClient, orgId, region);
			},
		});

		// Output based on format
		if (!options.json) {
			// Text table format
			if (resources.db.length === 0 && resources.s3.length === 0) {
				tui.info('No resources found');
			} else {
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
		}

		// Convert null to undefined for schema compliance
		return {
			db: resources.db.map((db) => ({
				name: db.name,
				url: db.url ?? undefined,
			})),
			s3: resources.s3.map((s3) => ({
				bucket_name: s3.bucket_name,
				access_key: s3.access_key ?? undefined,
				secret_key: s3.secret_key ?? undefined,
				region: s3.region ?? undefined,
				endpoint: s3.endpoint ?? undefined,
			})),
		};
	},
});
