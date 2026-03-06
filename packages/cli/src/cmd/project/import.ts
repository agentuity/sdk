import { resolve } from 'node:path';
import { z } from 'zod';
import { isTTY } from '../../auth';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import * as tui from '../../tui';
import { createSubcommand } from '../../types';
import { runProjectImport } from './reconcile';
import { runRemoteImport } from './remote-import';

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
	description: 'Import or register a local or remote project with Agentuity Cloud',
	tags: ['mutating', 'creates-resource', 'requires-auth'],
	examples: [
		{
			command: getCommand('project import'),
			description: 'Import project in current directory',
		},
		{
			command: getCommand('project import --dir ./my-agent'),
			description: 'Import project from specified directory',
		},
		{
			command: getCommand('project import --source owner/repo'),
			description: 'Import a remote project from GitHub',
		},
		{
			command: getCommand('project import --source owner/repo --deploy --name my-agent'),
			description: 'Import remote project, name it, and deploy',
		},
		{
			command: getCommand(
				'project import --source owner/repo --remote owner/new-repo --env DATABASE_URL:my_db --env TASK_QUEUE:my_queue'
			),
			description: 'Import with resource provisioning and push to new repo',
		},
	],
	requires: { auth: true, apiClient: true },
	optional: { region: true, org: true },
	schema: {
		options: z.object({
			source: z.string().optional().describe('GitHub URL or owner/repo to import from'),
			dir: z
				.string()
				.optional()
				.describe('Directory containing the project (default: current directory)'),
			validateOnly: z
				.boolean()
				.optional()
				.describe('Only validate the project structure without prompting'),
			deploy: z
				.boolean()
				.optional()
				.default(false)
				.describe('Deploy the project after importing'),
			projectId: z.string().optional().describe('Use a pre-created project ID (skip creation)'),
			remote: z
				.string()
				.optional()
				.describe('Target GitHub repo (owner/repo) to push imported code to'),
			name: z.string().optional().describe('Project name (for non-interactive mode)'),
			env: z
				.array(z.string())
				.optional()
				.describe('Set env vars or name resources (KEY:VALUE format, repeatable)'),
		}),
		response: ProjectImportResponseSchema,
	},

	async handler(ctx) {
		const { opts, auth, apiClient, config, logger, orgId, region } = ctx;

		if (!config) {
			tui.fatal('Configuration not loaded. Please try again.', ErrorCode.CONFIG_INVALID);
		}

		// If --source is provided, run remote import flow
		const source = opts.source;
		if (source) {
			// Normalize owner/repo shorthand to full GitHub URL
			const url = source.includes('://') ? source : `https://github.com/${source}`;
			await runRemoteImport({
				url,
				deploy: opts.deploy ?? false,
				projectId: opts.projectId,
				repo: opts.remote,
				name: opts.name,
				env: opts.env,
				org: orgId,
				region,
				apiClient,
				auth,
				config,
				logger,
			});

			return {
				success: true,
				status: 'imported' as const,
				message: 'Remote project imported successfully',
			};
		}

		// No URL — fall through to existing local import behavior
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
			tui.fatal(result.message ?? 'Failed to import project', ErrorCode.PROJECT_NOT_FOUND);
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
