import { createSubcommand, type CommandContext, type AuthData } from '../../types.ts';
import { z } from 'zod';
import { runCreateFlow } from './template-flow.ts';
import { getCommand } from '../../command-prefix.ts';
import type { APIClient as APIClientType } from '../../api.ts';

const ProjectCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	error: z.string().optional().describe('Error message if setup failed'),
	name: z.string().describe('Project name'),
	path: z.string().describe('Project directory path'),
	projectId: z.string().optional().describe('Project ID if registered'),
	orgId: z.string().optional().describe('Organization ID if registered'),
	framework: z.string().describe('Framework used'),
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
			command: getCommand('project create --name my-ai-app'),
			description: 'Create named project',
		},
		{
			command: getCommand('project create --name my-app --framework nextjs'),
			description: 'Create with Next.js',
		},
		{
			command: getCommand('project create --framework hono --no-install'),
			description: 'Scaffold without installing',
		},
		{ command: getCommand('project new --no-register'), description: 'Skip cloud registration' },
	],
	schema: {
		options: z.object({
			name: z.string().optional().describe('Project name'),
			dir: z.string().optional().describe('Directory to create the project in'),
			domains: z.array(z.string()).optional().describe('Array of custom domains'),
			framework: z
				.string()
				.optional()
				.describe(
					'Framework to use (e.g., nextjs, astro, sveltekit, remix, nuxt, hono, vite-react)'
				),
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
		}),
		response: ProjectCreateResponseSchema,
	},

	async handler(ctx) {
		const { logger, opts, auth, config, apiClient, region, options } = ctx;

		// Only get org if registering
		let orgId: string | undefined;
		if (opts.register === true && auth && apiClient) {
			const { optionalOrg } = await import('../../auth.ts');
			orgId = await optionalOrg(
				ctx as CommandContext & { apiClient?: APIClientType; auth?: AuthData }
			);
		}

		const result = await runCreateFlow({
			projectName: opts.name,
			dir: opts.dir,
			domains: opts.domains,
			framework: opts.framework,
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
			framework: result.framework,
			installed: result.installed,
			built: result.built,
			domains: result.domains,
		};
	},
});
