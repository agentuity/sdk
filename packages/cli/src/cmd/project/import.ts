import { z } from 'zod';
import { resolve } from 'node:path';
import { createSubcommand } from '../../types';
import { getCommand } from '../../command-prefix';
import { runProjectImport } from './reconcile';
import * as tui from '../../tui';
import { ErrorCode } from '../../errors';
import { isTTY } from '../../auth';

const ProjectImportResponseSchema = z.object({
	success: z.boolean().describe('Whether the import succeeded'),
	projectId: z.string().optional().describe('Project ID if imported'),
	orgId: z.string().optional().describe('Organization ID'),
	region: z.string().optional().describe('Region'),
	status: z
		.enum(['valid', 'imported', 'skipped', 'error'])
		.describe('The result status of the import'),
	message: z.string().optional().describe('Status message'),
});

export const importSubcommand = createSubcommand({
	name: 'import',
	description: 'Import or register a local project with Agentuity Cloud',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	examples: [
		{ command: getCommand('project import'), description: 'Import project in current directory' },
		{
			command: getCommand('project import --dir ./my-agent'),
			description: 'Import project from specified directory',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { region: true },
	schema: {
		options: z.object({
			dir: z
				.string()
				.optional()
				.describe('Directory containing the project (default: current directory)'),
			validateOnly: z
				.boolean()
				.optional()
				.describe('Only validate the project structure without prompting'),
		}),
		response: ProjectImportResponseSchema,
	},

	async handler(ctx) {
		const { opts, auth, apiClient, config, logger } = ctx;

		if (!config) {
			tui.fatal('Configuration not loaded. Please try again.', ErrorCode.CONFIG_INVALID);
		}

		const dir = opts.dir ? resolve(opts.dir) : process.cwd();
		const validateOnly = opts.validateOnly ?? false;

		const result = await runProjectImport({
			dir,
			auth,
			apiClient,
			config,
			logger,
			interactive: validateOnly ? false : isTTY(),
			validateOnly,
		});

		if (result.status === 'error') {
			tui.fatal(result.message!, ErrorCode.PROJECT_NOT_FOUND);
		}

		if (result.status === 'skipped') {
			tui.info(result.message || 'Import cancelled.');
			return {
				success: false,
				status: result.status,
				message: result.message,
			};
		}

		// Show success message for validateOnly mode
		if (validateOnly && result.status === 'valid' && !result.project) {
			tui.success(result.message || 'Project structure is valid.');
		}

		return {
			success: result.status === 'valid' || result.status === 'imported',
			projectId: result.project?.projectId,
			orgId: result.project?.orgId,
			region: result.project?.region,
			status: result.status,
			message:
				result.status === 'imported'
					? 'Project imported successfully'
					: result.message || 'Project is already registered',
		};
	},
});
