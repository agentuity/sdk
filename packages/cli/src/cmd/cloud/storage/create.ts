import { z } from 'zod';
import { createResources } from '@agentuity/server';
import { createSubcommand as defineSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';
import { isDryRunMode, outputDryRun } from '../../../explain';

export const createSubcommand = defineSubcommand({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new storage resource',
	tags: ['mutating', 'creates-resource', 'slow', 'requires-auth', 'requires-deployment'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		{
			command: getCommand('cloud storage create'),
			description: 'Create a new cloud storage bucket',
		},
		{
			command: getCommand('cloud storage new'),
			description: 'Alias for "cloud storage create" (shorthand "new")',
		},
		{
			command: getCommand('--dry-run cloud storage create'),
			description: 'Dry-run: display what would be created without making changes',
		},
	],
	schema: {
		response: z.object({
			success: z.boolean().describe('Whether creation succeeded'),
			name: z.string().describe('Created storage bucket name'),
		}),
	},

	async handler(ctx) {
		const { logger, orgId, region, auth, options } = ctx;

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			const message = `Would create storage bucket in region: ${region}`;
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Storage creation skipped');
			}
			return {
				success: false,
				name: 'dry-run-bucket',
			};
		}

		const catalystClient = getCatalystAPIClient(logger, auth, region);

		const created = await tui.spinner({
			message: `Creating storage in ${region}`,
			clearOnSuccess: true,
			callback: async () => {
				return createResources(catalystClient, orgId, region!, [{ type: 's3' }]);
			},
		});

		if (created.length > 0) {
			tui.success(`Created storage: ${tui.bold(created[0].name)}`);
			return {
				success: true,
				name: created[0].name,
			};
		} else {
			tui.fatal('Failed to create storage');
		}
	},
});
