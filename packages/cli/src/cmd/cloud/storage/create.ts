import { APIError, createResources, validateBucketName } from '@agentuity/server';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { getCatalystAPIClient } from '../../../config.ts';
import { addResourceEnvVars } from '../../../env-util.ts';
import { ErrorCode } from '../../../errors.ts';
import { isDryRunMode, outputDryRun } from '../../../explain.ts';
import * as tui from '../../../tui.ts';
import { createSubcommand as defineSubcommand } from '../../../types.ts';

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
			command: getCommand('cloud storage create --name my-bucket'),
			description: 'Create a new cloud storage bucket with a custom name',
		},
		{
			command: getCommand('--dry-run cloud storage create'),
			description: 'Dry-run: display what would be created without making changes',
		},
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Custom bucket name'),
			description: z.string().optional().describe('Optional description for the bucket'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether creation succeeded'),
			name: z.string().describe('Created storage bucket name'),
		}),
	},

	async handler(ctx) {
		const { logger, orgId, region, auth, options, opts } = ctx;

		// Validate bucket name if provided
		if (opts.name) {
			const validation = validateBucketName(opts.name);
			if (!validation.valid) {
				tui.fatal(validation.error!, ErrorCode.INVALID_ARGUMENT);
			}
		}

		// Handle dry-run mode
		if (isDryRunMode(options)) {
			let message = opts.name
				? `Would create storage bucket with name: ${opts.name} in region: ${region}`
				: `Would create storage bucket in region: ${region}`;
			if (opts.description) {
				message += ` with description: "${opts.description}"`;
			}
			outputDryRun(message, options);
			if (!options.json) {
				tui.newline();
				tui.info('[DRY RUN] Storage creation skipped');
			}
			return {
				success: false,
				name: opts.name || 'dry-run-bucket',
			};
		}

		const catalystClient = getCatalystAPIClient(logger, auth, region, undefined, ctx.config);

		try {
			const created = await tui.spinner({
				message: `Creating storage in ${region}`,
				clearOnSuccess: true,
				callback: async () => {
					return createResources(catalystClient, orgId, region!, [
						{ type: 's3', name: opts.name, description: opts.description },
					]);
				},
			});

			const resource = created[0];
			if (resource) {
				// Write environment variables to .env if running inside a project
				if (ctx.projectDir && resource.env && Object.keys(resource.env).length > 0) {
					await addResourceEnvVars(ctx.projectDir, resource.env);
					if (!options.json) {
						tui.info('Environment variables written to .env');
					}
				}

				if (!options.json) {
					tui.success(`Created storage: ${tui.bold(resource.name)}`);
				}
				return {
					success: true,
					name: resource.name,
				};
			}
			tui.fatal('Failed to create storage');
		} catch (ex) {
			if (ex instanceof APIError) {
				if (ex.status === 409) {
					const bucketName = opts.name || 'auto-generated';
					tui.fatal(
						`bucket with the name "${bucketName}" already exists. Use another name or don't specify --name for a unique name to be generated automatically.`,
						ErrorCode.INVALID_ARGUMENT
					);
				}
				if (ex.status === 400) {
					tui.fatal(ex.message || 'invalid bucket name', ErrorCode.INVALID_ARGUMENT);
				}
			}
			throw ex;
		}
	},
});
