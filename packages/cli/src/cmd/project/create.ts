import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { isTTY } from '../../auth.ts';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';
import * as tui from '../../tui.ts';
import { type AuthData, type CommandContext, createSubcommand } from '../../types.ts';
import type { APIClient as APIClientType } from '../../api.ts';
import { detectExistingProject, type ExistingProjectHit } from './detect-existing.ts';
import { runProjectImport } from './reconcile.ts';
import { runCreateFlow } from './template-flow.ts';

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

type ProjectCreateResponse = z.infer<typeof ProjectCreateResponseSchema>;

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
				.describe('Framework to use (e.g., nextjs, astro, sveltekit, remix, nuxt, hono)'),
			install: z
				.boolean()
				.optional()
				.default(true)
				.describe(
					'Run install (using the chosen package manager) after creating the project (use --no-install to skip)'
				),
			build: z
				.boolean()
				.optional()
				.default(true)
				.describe('Run the project build script after installing (use --no-build to skip)'),
			packageManager: z
				.enum(['bun', 'npm', 'pnpm', 'yarn'])
				.optional()
				.describe(
					'Package manager for the new project. Defaults to the host runtime: `bun` when running under Bun, `npm` when running under Node. Interactive runs prompt before scaffolding.'
				),
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
			services: z
				.array(z.string())
				.optional()
				.describe(
					'Service augments to add (comma-separated). Available: db, keyvalue, queue, vector, storage. Pass --no-services or omit for none.'
				),
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

		// ─── Existing-project import detour ─────────────────────────────────
		//
		// If the user runs `agentuity project create` while standing inside
		// (or pointing at) a supported framework project, the right thing
		// is almost always to register THAT project rather than scaffold a
		// brand-new one alongside it.
		//
		// We only short-circuit when:
		//   - registration is requested (`--register`, the default), AND
		//   - no `--name` was given (a name signals "new subdir scaffold"),
		//   - and the resolved target dir matches a framework in our scaffold
		//     catalog (next, nuxt, remix, sveltekit, astro, hono)
		//     OR already has agentuity.json.
		//
		// In TTY: ask once. In non-TTY: refuse with a helpful message
		// unless `--confirm` was passed (which signals "I know what I'm
		// doing, just scaffold here").
		const importDetour = await maybeImportExistingProject(ctx, {
			register: opts.register !== false,
			name: opts.name,
			dir: opts.dir,
			confirm: opts.confirm === true,
			orgId,
			region,
		});
		if (importDetour) {
			return importDetour;
		}

		const result = await runCreateFlow({
			projectName: opts.name,
			dir: opts.dir,
			domains: opts.domains,
			framework: opts.framework,
			noInstall: opts.install === false,
			noBuild: opts.build === false,
			skipPrompts: opts.confirm === true,
			packageManager: opts.packageManager,
			logger,
			auth: opts.register === true ? auth : undefined,
			config: config!,
			apiClient,
			orgId: opts.register === true ? orgId : undefined,
			region,
			database: opts.database,
			storage: opts.storage,
			services: opts.services,
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

/**
 * Detect-and-import detour for `agentuity project create`.
 *
 * Returns the response object the create handler should return when we
 * successfully diverted to the import flow; returns `null` when the
 * caller should continue with the normal create flow.
 *
 * Skipped when registration is disabled (`--no-register`), when a
 * project name was passed (signals "new subdir scaffold"), when no
 * supported framework / agentuity.json is present, or when the user
 * declines the prompt.
 */
async function maybeImportExistingProject(
	ctx: CommandContext,
	opts: {
		register: boolean;
		name?: string;
		dir?: string;
		confirm: boolean;
		orgId?: string;
		region?: string;
	}
): Promise<ProjectCreateResponse | null> {
	if (!opts.register) {
		// `--no-register` is an explicit "just scaffold" signal.
		return null;
	}
	if (opts.name) {
		// `--name foo` means "create a new subdir named foo here". The
		// user already told us they want a brand-new project; don't ask.
		return null;
	}

	// Mirror runCreateFlow's resolution of the target directory so the
	// detection sees the same path the would-be scaffold would target.
	let targetDir = opts.dir;
	if (targetDir?.startsWith('~')) {
		targetDir = targetDir.replace(/^~/, homedir());
	}
	const dir = targetDir ? resolve(targetDir) : process.cwd();

	const hit = await detectExistingProject(dir);
	if (!hit) {
		return null;
	}

	const interactive = isTTY();
	if (!interactive) {
		if (!opts.confirm) {
			tui.fatal(
				`Detected an existing ${hit.detectedName} project in ${dir}.\n` +
					`Run \`${getCommand('project import')}\` to register it, or pass --confirm to scaffold a new project here anyway.`,
				ErrorCode.RESOURCE_ALREADY_EXISTS
			);
		}
		// User explicitly opted out via --confirm; fall through to scaffold.
		return null;
	}

	// Auth is required to run the import flow. If the user isn't signed
	// in we can't divert; leave them to the create flow which can run
	// without auth (with `--no-register` semantics implicit at runtime).
	if (!ctx.auth || !ctx.apiClient) {
		return null;
	}

	const wantImport = await promptImportInsteadOfCreate(hit);
	if (!wantImport) {
		return null;
	}

	const result = await runProjectImport({
		dir,
		auth: ctx.auth,
		apiClient: ctx.apiClient,
		config: ctx.config!,
		logger: ctx.logger,
		interactive: true,
		validateOnly: false,
		confirm: false,
		orgId: opts.orgId,
		region: opts.region,
	});

	if (result.status === 'error') {
		tui.fatal(result.message ?? 'Failed to import project', ErrorCode.PROJECT_NOT_FOUND);
	}

	if (result.status === 'skipped') {
		tui.info(result.message || 'Import cancelled.');
		// The user declined registration mid-flow; don't fall through to
		// scaffold (they already said no by leaving the import prompt).
		return {
			success: false,
			error: result.message ?? 'Import cancelled',
			name: '',
			path: dir,
			framework: hit.scaffoldSlug,
			installed: false,
			built: false,
		};
	}

	// Shape the response to match ProjectCreateResponseSchema so the
	// JSON output stays stable between create-and-scaffold and
	// create-redirected-to-import.
	return {
		success: result.status === 'valid' || result.status === 'imported',
		name: '',
		path: dir,
		projectId: result.project?.projectId,
		orgId: result.project?.orgId,
		framework: hit.scaffoldSlug,
		installed: true,
		built: false,
	};
}

/**
 * Single yes/no prompt that asks the user whether they want to import
 * the existing project instead of scaffolding a new one.
 *
 * Defaults to `true` because the heuristic up-stream already filtered
 * to high-confidence matches.
 */
async function promptImportInsteadOfCreate(hit: ExistingProjectHit): Promise<boolean> {
	const label = hit.version ? `${hit.detectedName} v${hit.version}` : hit.detectedName;
	const message = hit.hasAgentuityJson
		? `Detected ${tui.bold(label)} with an existing agentuity.json. Register/import this project instead of scaffolding a new one?`
		: `Detected an existing ${tui.bold(label)} project. Register/import it instead of scaffolding a new one?`;

	return tui.confirm(message, true);
}
