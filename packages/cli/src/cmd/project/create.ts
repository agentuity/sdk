import { createSubcommand } from '../../types';
import { z } from 'zod';
import { runCreateFlow } from './template-flow';
import { getCommand } from '../../command-prefix';

const ProjectCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	name: z.string().describe('Project name'),
	path: z.string().describe('Project directory path'),
	projectId: z.string().optional().describe('Project ID if registered'),
	template: z.string().describe('Template used'),
	installed: z.boolean().describe('Whether dependencies were installed'),
	built: z.boolean().describe('Whether the project was built'),
});

export const createProjectSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a new project',
	tags: ['mutating', 'creates-resource', 'slow', 'api-intensive', 'requires-auth'],
	aliases: ['new', 'init'],
	banner: true,
	toplevel: true,
	idempotent: false,
	optional: { auth: true, org: true, region: true },
	requires: { apiClient: true },
	examples: [
		{ command: getCommand('project create'), description: 'Create new item' },
		{ command: getCommand('project create --name my-ai-agent'), description: 'Create new item' },
		{
			command: getCommand('project create --name customer-service-bot --dir ~/projects/agent'),
			description: 'Create new item',
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
		}),
		response: ProjectCreateResponseSchema,
	},

	async handler(ctx) {
		const { logger, opts, auth, config, apiClient, orgId, region } = ctx;

		await runCreateFlow({
			projectName: opts.name,
			dir: opts.dir,
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
		});

		// Return best-effort response (runCreateFlow doesn't return values)
		return {
			success: true,
			name: opts.name || 'project',
			path: opts.dir || process.cwd(),
			template: opts.template || 'default',
			installed: opts.install !== false,
			built: opts.build !== false,
		};
	},
});
