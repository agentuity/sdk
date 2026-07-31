/**
 * Launch metadata generation for buildpack-compatible output.
 *
 * Generates the metadata that tells the runtime how to start the application.
 * This is analogous to CNB's launch.toml / Docker CMD.
 */

import { join, relative } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { pathExists } from '../../../node-compat/fs.ts';
import { resolveAgentuityCdnBase } from '../adapters/cdn-origin.ts';
import type { BuildResult } from '../adapters/types.ts';
import type { DetectedFramework } from '../detect/types.ts';
import type { MonorepoContext } from '../detect/monorepo.ts';
import { resolveRuntimeFromStartCommand } from '../detect/util.ts';

/**
 * Filename the CLI looks for at the project root when a user wants to
 * override or fully supply the launch metadata. Same name as the file
 * we emit into the build output so users can copy/edit one we generated.
 */
export const USER_LAUNCH_FILENAME = 'launch.json';

/**
 * Structural shape of a user-supplied `launch.json`. `.passthrough()`
 * everywhere so unknown extra keys — including the machine-generated
 * `build` field users copy from an emitted launch.json — pass through
 * unrejected. Wrong *types* on known fields still fail validation.
 *
 * `processes[].default` is optional here even though the internal
 * `ProcessDefinition` requires it: files written before this field
 * existed must keep working. Callers coerce with `default ?? false`.
 *
 * Every optional field is `.nullish()` + a `?? undefined` transform, not
 * plain `.optional()`: the pre-Zod code read these fields with `?.`,
 * which tolerated an explicit JSON `null` as well as absence. Collapsing
 * `null` to `undefined` here (rather than leaving it in the parsed
 * shape) keeps `UserLaunchOverride` — derived via `z.infer` — free of
 * `| null`, so downstream consumers only ever handle "absent".
 */
const UserLaunchProcessSchema = z
	.object({
		type: z.string(),
		command: z.string(),
		default: z
			.boolean()
			.nullish()
			.transform((v) => v ?? undefined),
		workingDirectory: z
			.string()
			.nullish()
			.transform((v) => v ?? undefined),
	})
	.passthrough();

const UserLaunchStaticRootSchema = z
	.object({
		directory: z.string(),
		publicPath: z.string(),
	})
	.passthrough();

const UserLaunchStaticSchema = z
	.object({
		directory: z.string(),
		publicPath: z.string(),
		baseUrl: z
			.string()
			.nullish()
			.transform((v) => v ?? undefined),
		include: z
			.array(UserLaunchStaticRootSchema)
			.nullish()
			.transform((v) => v ?? undefined),
	})
	.passthrough();

const UserLaunchOverrideSchema = z
	.object({
		processes: z
			.array(UserLaunchProcessSchema)
			.nullish()
			.transform((v) => v ?? undefined),
		framework: z
			.object({
				name: z
					.string()
					.nullish()
					.transform((v) => v ?? undefined),
				version: z
					.string()
					.nullish()
					.transform((v) => v ?? undefined),
			})
			.passthrough()
			.nullish()
			.transform((v) => v ?? undefined),
		runtime: z
			.object({
				name: z
					.string()
					.nullish()
					.transform((v) => v ?? undefined),
				port: z
					.number()
					.nullish()
					.transform((v) => v ?? undefined),
			})
			.passthrough()
			.nullish()
			.transform((v) => v ?? undefined),
		static: UserLaunchStaticSchema.nullish().transform((v) => v ?? undefined),
	})
	.passthrough();

/**
 * Partial launch metadata a user can ship at the project root to
 * override what the CLI infers. Every field is optional; provided
 * fields win over the generated ones. `build.{date,duration}` is
 * always machine-generated and ignored here.
 */
export type UserLaunchOverride = z.infer<typeof UserLaunchOverrideSchema>;

/** One field-level validation failure, normalized for error messages. */
export interface LaunchConfigIssue {
	path: string;
	message: string;
}

/**
 * Thrown by `readUserLaunchOverride` for both invalid JSON and
 * schema-invalid `launch.json` files. Callers that own a `CommandContext`
 * (inspect, build) catch this and translate it into a `CONFIG_INVALID`
 * structured error instead of letting a raw crash reach the user.
 */
export class LaunchConfigError extends Error {
	readonly filePath: string;
	readonly issues: LaunchConfigIssue[];

	constructor(filePath: string, issues: LaunchConfigIssue[], message: string) {
		super(message);
		this.name = 'LaunchConfigError';
		this.filePath = filePath;
		this.issues = issues;
	}
}

/**
 * Read a user-supplied `launch.json` from the project root, if any.
 *
 * Returns `null` when the file is missing. Throws `LaunchConfigError` on
 * invalid JSON or a structurally invalid shape — a malformed override is
 * a user error worth surfacing rather than silently falling back to
 * inference (or, worse, crashing deep inside a consumer that assumed the
 * shape was already validated).
 */
export async function readUserLaunchOverride(
	projectDir: string
): Promise<UserLaunchOverride | null> {
	const path = join(projectDir, USER_LAUNCH_FILENAME);
	if (!(await pathExists(path))) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(path, 'utf-8'));
	} catch (ex) {
		const message = (ex as Error).message;
		throw new LaunchConfigError(
			path,
			[{ path: 'root', message }],
			`Invalid ${USER_LAUNCH_FILENAME} at ${path}: ${message}`
		);
	}

	const result = UserLaunchOverrideSchema.safeParse(parsed);
	if (!result.success) {
		const issues = result.error.issues.map((issue) => ({
			path: issue.path.join('.') || 'root',
			message: issue.message,
		}));
		const summary = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
		throw new LaunchConfigError(
			path,
			issues,
			`Invalid ${USER_LAUNCH_FILENAME} at ${path}: ${summary}`
		);
	}

	return result.data;
}

/**
 * Process definition for the launch metadata.
 */
export interface ProcessDefinition {
	/** Process type (e.g., 'web', 'worker') */
	type: string;
	/** Command to execute */
	command: string;
	/** Whether this is the default process */
	default: boolean;
	/** Working directory (relative to app root) */
	workingDirectory?: string;
}

/**
 * Static/CDN asset locations recorded in launch.json.
 *
 * Consumers (CDN upload, pilot) compose public URLs as:
 *   `{baseUrl}{publicPath}/{pathWithinDirectory}`
 *
 * `baseUrl` is optional: when set (from `--cdn-base-url` or the platform
 * default), frameworks that bake asset URLs at build time should have
 * used the same prefix. When omitted, the platform may still upload
 * files under `publicPath` using its own CDN root.
 */
/**
 * One CDN upload root. Consumers compose:
 *   `{baseUrl}{publicPath}/{pathWithinDirectory}`
 * with empty publicPath meaning files live at the CDN base root.
 */
export interface LaunchStaticRoot {
	/**
	 * Directory relative to the process working directory (or deploy root).
	 * Posix separators. Example: `.next/static`, `public`, `dist`.
	 */
	directory: string;
	/**
	 * URL path prefix for files inside `directory` (no leading slash).
	 * e.g. `_next/static` for Next built assets, `''` for Next `public/`.
	 */
	publicPath: string;
}

/**
 * Static/CDN asset locations recorded in launch.json.
 *
 * Consumers (CDN upload, pilot) compose public URLs as:
 *   `{baseUrl}{publicPath}/{pathWithinDirectory}`
 *
 * The primary `directory`/`publicPath` is the framework build tree.
 * Optional `include` lists extra roots (Next `public/`) that must also
 * be uploaded when CDN base is set — `assetPrefix` alone does not cover them.
 *
 * `baseUrl` is optional: when set (from `--cdn-base-url` or the platform
 * default), frameworks that bake asset URLs at build time should have
 * used the same prefix. When omitted, the platform may still upload
 * files under `publicPath` using its own CDN root.
 */
export interface LaunchStaticAssets extends LaunchStaticRoot {
	/**
	 * Absolute CDN base URL with trailing slash when known at package time.
	 * Example: `https://cdn.agentuity.com/org_123/assets/`.
	 */
	baseUrl?: string;
	/**
	 * Extra CDN roots (e.g. Next `public/` with publicPath `""`).
	 * Deploy clients should upload each root the same way as the primary.
	 */
	include?: LaunchStaticRoot[];
}

/**
 * Complete launch metadata written to the output directory.
 */
export interface LaunchMetadata {
	/** Application processes */
	processes: ProcessDefinition[];
	/** Framework that was detected */
	framework: {
		name: string;
		version?: string;
	};
	/** Runtime information */
	runtime: {
		name: string;
		port?: number;
	};
	/** Build information */
	build: {
		date: string;
		duration: number;
	};
	/**
	 * Static assets eligible for CDN upload. Omitted when the framework
	 * has no known static output (e.g. Nest API with no client assets).
	 */
	static?: LaunchStaticAssets;
}

/** Options that influence launch metadata generation beyond detect/build. */
export interface GenerateLaunchMetadataOptions {
	override?: UserLaunchOverride | null;
	monorepo?: MonorepoContext;
	/**
	 * Explicit CDN base URL (`--cdn-base-url`). Written into
	 * `static.baseUrl` when static assets are present.
	 */
	cdnBaseUrl?: string;
}

function toPosixPath(p: string): string {
	return p.split('\\').join('/');
}

/**
 * Resolve the static asset block for launch.json from the staged build
 * result (preferred) or framework detection fallback.
 */
export function resolveLaunchStatic(
	framework: DetectedFramework,
	buildResult: BuildResult,
	monorepo?: MonorepoContext,
	cdnBaseUrl?: string
): LaunchStaticAssets | undefined {
	const publicPath = buildResult.staticAssetPublicPath ?? framework.staticAssetPublicPath ?? '';

	let directory: string | undefined;

	if (buildResult.staticDir) {
		// Paths are relative to the process working directory when set
		// (adapter packaging layout wins; monorepo.subpath is the fallback
		// for adapters that do not set workingDirectory); otherwise to the
		// deploy/output root.
		const workRel = buildResult.workingDirectory ?? monorepo?.subpath;
		const processRoot = workRel ? join(buildResult.outputDir, workRel) : buildResult.outputDir;
		let rel = toPosixPath(relative(processRoot, buildResult.staticDir));
		if (!rel || rel === '') {
			directory = '.';
		} else if (!rel.startsWith('..')) {
			directory = rel;
		} else {
			// Fallback: relative to output root (e.g. static staged outside subpath).
			rel = toPosixPath(relative(buildResult.outputDir, buildResult.staticDir));
			if (!rel.startsWith('..')) {
				directory = rel || '.';
			}
		}
	} else if (framework.staticDir) {
		// Build did not resolve an absolute staged path, but detection knew
		// where assets should live relative to the project/working dir.
		directory = toPosixPath(framework.staticDir);
	}

	if (!directory) return undefined;

	// Same resolution chain as config-cdn-wrap / adapters: explicit flag,
	// then AGENTUITY_CDN_BASE_URL / AGENTUITY_CDN_ORIGIN / deployment id.
	const baseUrl = resolveAgentuityCdnBase({ cdnBaseUrl });

	// Extra roots (Next public/): only when packaging staged them and the
	// primary publicPath is a non-empty build prefix (split CDN layout).
	const include: LaunchStaticRoot[] = [];
	if (buildResult.publicStaticDir && publicPath !== '') {
		const workRel = buildResult.workingDirectory ?? monorepo?.subpath;
		const processRoot = workRel ? join(buildResult.outputDir, workRel) : buildResult.outputDir;
		let pubRel = toPosixPath(relative(processRoot, buildResult.publicStaticDir));
		if (!pubRel || pubRel === '') {
			pubRel = '.';
		}
		if (!pubRel.startsWith('..') && pubRel !== directory) {
			include.push({ directory: pubRel, publicPath: '' });
		}
	}

	return {
		directory,
		publicPath,
		...(baseUrl ? { baseUrl } : {}),
		...(include.length > 0 ? { include } : {}),
	};
}

/**
 * Generate launch metadata from a build result and detected framework.
 *
 * If a user-supplied override is provided, its fields take precedence:
 * `processes` (whole array replaces ours), `framework.{name,version}`,
 * `runtime.{name,port}`, and `static` (whole object replaces ours).
 * `build.{date,duration}` is always emitted from the actual build and
 * cannot be overridden.
 */
export function generateLaunchMetadata(
	framework: DetectedFramework,
	buildResult: BuildResult,
	override?: UserLaunchOverride | null,
	monorepo?: MonorepoContext,
	cdnBaseUrl?: string
): LaunchMetadata {
	const processes: ProcessDefinition[] = [];

	// Primary web process
	const startCommand = buildResult.startCommand ?? framework.startCommand;
	// Packaging layout is source of truth when the adapter set it (e.g. Next
	// nested standalone). Otherwise monorepo.subpath places the process in
	// the workspace subpackage for adapters that leave workingDirectory unset.
	const workingDirectory = buildResult.workingDirectory ?? monorepo?.subpath;
	if (startCommand) {
		processes.push({
			type: 'web',
			command: startCommand,
			default: true,
			// Pilot interprets a relative `workingDirectory` against the
			// container's deploy root (`/home/agentuity/app`). Nested layout
			// places the process so paths in the start command (`server.js`,
			// `dist/index.js`, ...) resolve unchanged.
			...(workingDirectory ? { workingDirectory } : {}),
		});
	}

	// Reconcile runtime against the actual launch command.
	// `framework.runtime` reflects what the detector inferred from the
	// project (lockfile, engines, the start script before adapters had
	// a chance to rewrite it). But adapters can override the start
	// command — e.g. the Next.js adapter writes `node server.js`
	// because Next.js standalone is Node-only, even if the user's
	// project uses Bun for everything else. The runtime in launch.json
	// must match what gets executed; pilot's memory tuning depends on
	// it.
	//
	// Strip leading `HOST=…` / env assignments so defaults like
	// `HOST=0.0.0.0 node .output/server/index.mjs` resolve to node.
	const runtimeName = resolveRuntimeFromStartCommand(startCommand, framework.runtime);

	// The user schema keeps `default` optional for backward compat with
	// files written before this field existed; the emitted metadata's
	// `ProcessDefinition` requires it, so coerce here at the boundary.
	const finalProcesses: ProcessDefinition[] =
		override?.processes && override.processes.length > 0
			? override.processes.map((p) => ({ ...p, default: p.default ?? false }))
			: processes;

	const resolvedStatic =
		override?.static ?? resolveLaunchStatic(framework, buildResult, monorepo, cdnBaseUrl);

	// When the user supplies static without baseUrl, fill from the same
	// CDN resolution chain adapters use (flag / env / deployment id).
	const staticBlock = (() => {
		if (!resolvedStatic) return undefined;
		if (resolvedStatic.baseUrl) return resolvedStatic;
		const baseUrl = resolveAgentuityCdnBase({ cdnBaseUrl });
		return baseUrl ? { ...resolvedStatic, baseUrl } : resolvedStatic;
	})();

	return {
		processes: finalProcesses,
		framework: {
			name: override?.framework?.name ?? framework.name,
			version: override?.framework?.version ?? framework.version,
		},
		runtime: {
			name: override?.runtime?.name ?? runtimeName,
			port: override?.runtime?.port ?? buildResult.port ?? framework.port,
		},
		build: {
			date: new Date().toISOString(),
			duration: buildResult.duration,
		},
		...(staticBlock ? { static: staticBlock } : {}),
	};
}

/**
 * Write launch metadata to the output directory.
 *
 * Writes launch.json — machine-readable launch metadata.
 */
export function writeLaunchMetadata(outputDir: string, metadata: LaunchMetadata): void {
	mkdirSync(outputDir, { recursive: true });

	const jsonPath = join(outputDir, 'launch.json');
	writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf-8');
}
