import { createSubcommand } from '../../types';
import { z } from 'zod';
import { runCreateFlow } from './template-flow';

export const createProjectSubcommand = createSubcommand({
	name: 'create',
	description: 'Create a new project',
	aliases: ['new'],
	toplevel: true,
	optionalAuth: true,
	requiresAPIClient: true,
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
	},

	async handler(ctx) {
		const { logger, opts, auth, config, options, apiClient } = ctx;

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
			orgId: options.orgId,
			apiClient,
		});
	},
});
