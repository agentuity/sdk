import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
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

/**
 * Decision returned by `decideNoFrameworkHit` for the
 * "non-empty dir, no supported framework detected" branch of the
 * existing-project gate. Kept as a pure helper so it can be unit-
 * tested without driving the CLI through a child process.
 *
 *   - `scaffold-subdir`: fall through to `runCreateFlow`, which will
 *     prompt for a project name and scaffold into `<dir>/<name>`.
 *   - `fatal`: refuse to proceed; the caller should surface the
 *     usual "not empty / not a known framework" error.
 */
export type NoFrameworkHitDecision = 'scaffold-subdir' | 'fatal';

/**
 * Decide what to do when the target directory has files but doesn't
 * look like any supported framework. Interactive runs fall through to
 * the normal create flow (which will scaffold into a new subdirectory
 * via the project-name prompt); non-interactive runs hard-fail because
 * there's no way to ask the user for a subdir name.
 */
export function decideNoFrameworkHit(opts: { isInteractive: boolean }): NoFrameworkHitDecision {
	return opts.isInteractive ? 'scaffold-subdir' : 'fatal';
}

/**
 * Names ignored when deciding whether a directory "has files" for the
 * purposes of the existing-project gate. A freshly `git init`'d folder
 * or one with editor metadata should still be considered empty enough
 * to scaffold into.
 */
const SCAFFOLD_EMPTY_IGNORED = new Set([
	'.git',
	'.gitignore',
	'.gitattributes',
	'.gitkeep',
	'.DS_Store',
	'Thumbs.db',
	'.idea',
	'.vscode',
	'node_modules',
]);

/**
 * True when `dir` contains no user-visible content. Dotfiles in
 * `SCAFFOLD_EMPTY_IGNORED` (e.g. `.git`) do not count; anything else
 * does. Missing directory counts as empty.
 */
export function isDirEmptyForScaffold(dir: string): boolean {
	if (!existsSync(dir)) return true;
	try {
		if (!statSync(dir).isDirectory()) return false;
		const entries = readdirSync(dir);
		return entries.every((name) => SCAFFOLD_EMPTY_IGNORED.has(name));
	} catch {
		return false;
	}
}

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
				.describe('Framework to use (e.g., nextjs, astro, sveltekit, nuxt, hono)'),
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
			skills: z
				.boolean()
				.optional()
				.default(true)
				.describe(
					'Wire @agentuity/skills and skills-npm into the project (use --no-skills to skip)'
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
		//     catalog (next, nuxt, sveltekit, astro, hono)
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
			includeSkills: opts.skills !== false,
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
 * Existing-project gate for `agentuity project create`.
 *
 * Rules (the `--name <subdir>` flag bypasses this entirely — a name
 * means "scaffold a brand new subdirectory", which is always allowed):
 *
 *   1. Target dir is effectively empty       → return null, scaffold.
 *   2. Has files + matches a supported FW    → prompt "import?";
 *                                              yes → import,
 *                                              no  → fatal (don't
 *                                              silently overwrite).
 *   3. Has files + no supported FW           → fatal.
 *
 * Returns the response object the create handler should return when
 * we successfully diverted to the import flow; returns `null` when
 * the caller should continue with the normal create flow.
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
	if (opts.name) {
		// `--name foo` means "create a new subdir named foo here". The
		// scaffold target is a new dir, so the existing-files gate doesn't
		// apply to the cwd.
		return null;
	}

	// Mirror runCreateFlow's resolution of the target directory so the
	// detection sees the same path the would-be scaffold would target.
	let targetDir = opts.dir;
	if (targetDir?.startsWith('~')) {
		targetDir = targetDir.replace(/^~/, homedir());
	}
	const dir = targetDir ? resolve(targetDir) : process.cwd();

	// Empty (or only-dotfiles) target: scaffold as normal.
	if (isDirEmptyForScaffold(dir)) {
		return null;
	}

	const hit = await detectExistingProject(dir);

	// Has files but nothing we know how to deploy. We can't scaffold
	// directly on top of unknown content, but we can still fall through
	// to the normal create flow which will prompt for a project name and
	// scaffold into a fresh `<dir>/<name>` subdirectory.
	if (!hit) {
		const decision = decideNoFrameworkHit({ isInteractive: isTTY() });
		if (decision === 'scaffold-subdir') {
			return null;
		}
		tui.fatal(
			`${dir} is not empty and does not match a supported framework.\n` +
				`Run \`${getCommand('project create')}\` from an empty directory, or pass --name <subdir> to scaffold into a new subdirectory.`,
			ErrorCode.RESOURCE_ALREADY_EXISTS
		);
	}

	// Matched a supported framework. We can only import — we can't
	// scaffold a fresh project on top of the existing files.
	if (!opts.register) {
		tui.fatal(
			`Detected an existing ${hit.detectedName} project in ${dir}, but --no-register was passed.\n` +
				`Drop --no-register to import it, or pass --name <subdir> to scaffold into a new subdirectory.`,
			ErrorCode.RESOURCE_ALREADY_EXISTS
		);
	}

	if (!ctx.auth || !ctx.apiClient) {
		tui.fatal(
			`Detected an existing ${hit.detectedName} project in ${dir}, but you're not signed in.\n` +
				`Run \`${getCommand('auth login')}\` and try again, or pass --name <subdir> to scaffold into a new subdirectory.`,
			ErrorCode.AUTH_REQUIRED
		);
	}

	const interactive = isTTY();
	if (!interactive) {
		if (!opts.confirm) {
			tui.fatal(
				`Detected an existing ${hit.detectedName} project in ${dir}.\n` +
					`Run \`${getCommand('project import')}\` to register it, or re-run with --confirm to import non-interactively.`,
				ErrorCode.RESOURCE_ALREADY_EXISTS
			);
		}
		// `--confirm` in non-TTY = "yes, import."
	} else {
		const wantImport = await promptImportInsteadOfCreate(hit);
		if (!wantImport) {
			tui.fatal(
				`Aborted. Pass --name <subdir> to scaffold a new project in a subdirectory instead.`,
				ErrorCode.USER_CANCELLED
			);
		}
	}

	tui.info(`Importing existing ${hit.detectedName} project from ${dir}...`);
	tui.newline();

	const result = await runProjectImport({
		dir,
		auth: ctx.auth,
		apiClient: ctx.apiClient,
		config: ctx.config!,
		logger: ctx.logger,
		interactive,
		validateOnly: false,
		confirm: opts.confirm,
		orgId: opts.orgId,
		region: opts.region,
	});

	if (result.status === 'error') {
		tui.fatal(result.message ?? 'Failed to import project', ErrorCode.PROJECT_NOT_FOUND);
	}

	if (result.status === 'skipped') {
		tui.info(result.message || 'Import cancelled.');
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
