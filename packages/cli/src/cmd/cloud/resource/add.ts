import { z } from 'zod';
import { createResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';

export const addSubcommand = createSubcommand({
	name: 'add',
	aliases: ['create'],
	description: 'Add a cloud resource for an organization',
	requires: { auth: true, org: true, region: true },
	schema: {
		options: z.object({
			type: z.enum(['database', 'storage']).optional().describe('Resource type'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, orgId, region, config, auth } = ctx;

		// Determine resource type
		let resourceType = opts.type;
		if (!resourceType) {
			const response = await enquirer.prompt<{ type: 'database' | 'storage' }>({
				type: 'select',
				name: 'type',
				message: 'Select resource type:',
				choices: [
					{ name: 'database', message: 'Database (PostgreSQL)' },
					{ name: 'storage', message: 'Storage (S3)' },
				],
			});
			resourceType = response.type;
		}

		// Map user-friendly type to API type
		const apiType = resourceType === 'database' ? 'db' : 's3';

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		const created = await tui.spinner({
			message: `Creating ${resourceType} in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return createResources(catalystClient, orgId, region!, [{ type: apiType }]);
			},
		});

		if (created.length > 0) {
			tui.success(`Created ${resourceType}: ${tui.bold(created[0].name)}`);
		} else {
			tui.fatal('Failed to create resource');
		}
	},
});
