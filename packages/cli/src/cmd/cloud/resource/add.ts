import { z } from 'zod';
import { createResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

export const addSubcommand = createSubcommand({
	name: 'add',
	aliases: ['create'],
	description: 'Add a cloud resource for an organization',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		getCommand('cloud resource add'),
		getCommand('cloud resource add --type database'),
		getCommand('cloud resource add --type storage'),
		getCommand('cloud resource create --type database'),
	],
	schema: {
		options: z.object({
			type: z.enum(['database', 'storage']).optional().describe('Resource type'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether creation succeeded'),
			type: z.string().describe('Resource type (database or storage)'),
			name: z.string().describe('Created resource name'),
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
			return {
				success: true,
				type: resourceType,
				name: created[0].name,
			};
		} else {
			tui.fatal('Failed to create resource');
		}
	},
});
