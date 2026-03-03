import { createSubcommand, type CommandContext, type AuthData } from '../../types';
import { z } from 'zod';
import { runCreateFlow } from './template-flow';
import { getCommand } from '../../command-prefix';
import type { APIClient as APIClientType } from '../../api';

const ProjectCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	error: z.string().optional().describe('Error message if setup failed'),
	name: z.string().describe('Project name'),
	path: z.string().describe('Project directory path'),
	projectId: z.string().optional().describe('Project ID if registered'),
	orgId: z.string().optional().describe('Organization ID if registered'),
	template: z.string().describe('Template used'),
	installed: z.boolean().describe('Whether dependencies were installed'),
	built: z.boolean().describe('Whether the project was built'),
	domains: z.array(z.string()).optional().describe('Array of custom domains'),
});

export const createProjectSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a new project',
	tags: ['mutating', 'creates-resource', 'slow'],
	aliases: ['new', 'init'],
	banner: true,
	toplevel: true,
	idempotent: false,
	optional: { auth: true, region: true, apiClient: true },
	examples: [
		{ command: getCommand('project create'), description: 'Create new project' },
		{
			command: getCommand('project create --name my-ai-agent'),
			description: 'Create new project',
		},
		{
			command: getCommand('project create --name customer-service-bot --dir ~/projects/agent'),
			description: 'Create new project',
		},
		{
			command: getCommand('project create --template basic --no-install'),
			description: 'Use no install option',
		},
		{ command: getCommand('project new --no-register'), description: 'Use no register option' },
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Project name'),
			dir: z.string().optional().describe('Directory to create the project in'),
			domains: z.array(z.string()).optional().describe('Array of custom domains'),
			template: z.string().optional().describe('Template to use'),
			templateDir: z
				.string()
				.optional()
				.describe('Local template directory for testing (e.g., ./packages/templates)'),
			templateBranch: z
				.string()
				.optional()
				.describe('GitHub branch to use for templates (default: main)'),
			install: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run bun install after creating the project (use --no-install to skip)'),
			build: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run bun run build after installing (use --no-build to skip)'),
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
			register: z
				.boolean()
				.default(true)
				.optional()
				.describe('Register the project, if authenticated (use --no-register to skip)'),
			database: z
				.string()
				.optional()
				.describe('Database action: "skip", "new", or existing database name'),
			storage: z
				.string()
				.optional()
				.describe('Storage action: "skip", "new", or existing bucket name'),
			enableAuth: z.boolean().optional().describe('Enable Agentuity Auth'),
		}),
		response: ProjectCreateResponseSchema,
	},

	async handler(ctx) {
		const { logger, opts, auth, config, apiClient, region, options } = ctx;

		// Only get org if registering
		let orgId: string | undefined;
		if (opts.register === true && auth && apiClient) {
			const { optionalOrg } = await import('../../auth');
			orgId = await optionalOrg(
				ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
			);
		}

		const result = await runCreateFlow({
			projectName: opts.name,
			dir: opts.dir,
			domains: opts.domains,
			template: opts.template,
			templateDir: opts.templateDir,
			templateBranch: opts.templateBranch,
			noInstall: opts.install === false,
			noBuild: opts.build === false,
			skipPrompts: opts.confirm === true,
			logger,
			auth: opts.register === true ? auth : undefined,
			config: config!,
			apiClient,
			orgId: opts.register === true ? orgId : undefined,
			region,
			database: opts.database,
			storage: opts.storage,
			enableAuth: opts.enableAuth,
		});

		// Exit with error code if setup failed and not in JSON mode
		if (!result.success && !options.json) {
			process.exitCode = 1;
		}

		return {
			success: result.success,
			error: result.error,
			name: result.name,
			path: result.path,
			projectId: result.projectId,
			orgId: result.orgId,
			template: result.template,
			installed: result.installed,
			built: result.built,
			domains: result.domains,
		};
	},
});
