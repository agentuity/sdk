/**
 * Shared build pipeline.
 *
 * Both `agentuity build` (the standalone command) and the deploy
 * command's "Build, Verify and Package" step go through this single
 * function. Each caller wraps the result with its own surface
 * (TUI progress, Step state machine, deploy-metadata emission), but
 * the core ordering — detect, typecheck, build, package — lives here
 * so the two paths can't drift apart again.
 *
 * Why ordering matters:
 *   1. Detect framework and detect monorepo *first*, because
 *      `monorepo` determines where staging output goes
 *      (`<monorepoRoot>/.agentuity`, not `<projectDir>/.agentuity`).
 *   2. Typecheck *before* the build, so a broken project fails fast
 *      without spending minutes compiling. The deploy flow has done
 *      this for a while; the standalone command used to typecheck
 *      after the build, which wasted CI time and hid type errors
 *      behind framework build noise.
 *   3. Adapter build receives the monorepo context (so it runs
 *      install at the workspace root, builds the subpackage in
 *      place, and copies the whole tree into the staging dir).
 *   4. Packaging writes launch metadata with `workingDirectory` set
 *      when monorepo is non-null, so pilot starts the process in
 *      the right subdirectory.
 */

import { join, resolve } from 'node:path';
import type { Logger, DeployOptions } from '../../types.ts';
import type { BuildReportCollector } from '../../build-report.ts';
import { getAdapter } from './adapters/index.ts';
import type { BuildResult } from './adapters/types.ts';
import { detectFrameworkWithPackageJson, NO_DEPLOYABLE_PROJECT_MESSAGE } from './detect/index.ts';
import { detectMonorepoContext, type MonorepoContext } from './detect/monorepo.ts';
import type { DetectedFramework, PackageJsonData } from './detect/types.ts';
import { packageBuildOutput, type PackageResult } from './package/index.ts';
import { typecheck } from './typecheck.ts';

/**
 * Inputs the shared pipeline needs. The caller is responsible for
 * passing in a `logger` and `collector`; everything else is optional.
 *
 * `prediscovered` lets the deploy phase reuse the result of the
 * Discover step instead of re-running detection.
 */
export interface BuildPipelineInput {
	/** Absolute path to the user's project root (the subpackage in monorepo mode). */
	projectDir: string;
	logger: Logger;
	collector: BuildReportCollector;

	/** Optional pre-detected framework + package.json from a prior step. */
	prediscovered?: {
		framework: DetectedFramework;
		packageJson: PackageJsonData | null;
	} | null;

	/**
	 * Override the staging output dir. Defaults to
	 * `<monorepoRoot ?? projectDir>/.agentuity`.
	 */
	outputDir?: string;

	/** Skip the type-check phase (used by `--dev` and CI-only builds). */
	skipTypeCheck?: boolean;

	/** Development-mode build (looser, sourcemaps, etc.). */
	dev?: boolean;

	/**
	 * Explicit CDN base URL (`--cdn-base-url`). Used at build time so
	 * frameworks bake absolute asset URLs, and recorded on
	 * `launch.json` as `static.baseUrl`.
	 *
	 * Examples:
	 *   `https://cdn.agentuity.com/`
	 *   `https://cdn.agentuity.com/{ORGID}/assets/`
	 */
	cdnBaseUrl?: string;

	// — Adapter passthrough fields. Only the deploy pipeline supplies these.

	projectId?: string;
	orgId?: string;
	region?: string;
	deploymentId?: string;
	deploymentOptions?: DeployOptions;
	deploymentConfig?: Record<string, unknown>;
}

export interface BuildPipelineOutput {
	framework: DetectedFramework;
	packageJson: PackageJsonData | null;
	monorepo: MonorepoContext | null;
	buildResult: BuildResult;
	packageResult: PackageResult;
	/** Absolute path to the staging output dir. */
	outputDir: string;
	/** Time spent in typecheck (ms). 0 if skipped. */
	typecheckMs: number;
	/** Time spent in the adapter build (ms). */
	buildMs: number;
	/** Human-readable log lines for the caller to render. */
	logs: string[];
	/**
	 * True when monorepo staging applied user `.agentuityignore` patterns.
	 * False/undefined when not a monorepo or no user ignore file was loaded.
	 */
	usedIgnorePatterns?: boolean;
}

/**
 * Error subclasses used to carry phase-specific context back to the
 * caller. Both callers map these onto their own surfaces: `agentuity
 * build` calls `tui.fatal`, the deploy step returns `stepError`.
 */
export class FrameworkDetectionError extends Error {
	readonly code = 'NO_DEPLOYABLE_PROJECT';
	constructor() {
		super(NO_DEPLOYABLE_PROJECT_MESSAGE);
		this.name = 'FrameworkDetectionError';
	}
}

export class TypecheckError extends Error {
	readonly code = 'TYPECHECK_FAILED';
	/** Raw tsc output for the caller to render. */
	readonly output: string;
	constructor(output: string) {
		super('Typecheck failed');
		this.name = 'TypecheckError';
		this.output = output;
	}
}

/**
 * Run the shared build pipeline. Throws `FrameworkDetectionError` or
 * `TypecheckError` on the structured failure cases; any other error
 * propagates as-is so the caller can decide how to surface it.
 */
export async function runBuildPipeline(input: BuildPipelineInput): Promise<BuildPipelineOutput> {
	const { projectDir, logger, collector } = input;
	const absoluteProjectDir = resolve(projectDir);
	const logs: string[] = [];

	// 1. Detect framework (reuse prediscovered if the caller already ran
	//    detection in an earlier step — Discover phase in the deploy
	//    pipeline does this).
	const detection =
		input.prediscovered ?? (await detectFrameworkWithPackageJson(absoluteProjectDir));
	if (!detection || !detection.framework) {
		throw new FrameworkDetectionError();
	}
	const { framework, packageJson } = detection;

	// 2. Detect monorepo so we can stage the build at the workspace
	//    root rather than inside the subpackage. The detector returns
	//    `null` when projectDir is not part of a workspace, or when it
	//    *is* the workspace root itself (single-package mode covers
	//    that case).
	const monorepo = await detectMonorepoContext(absoluteProjectDir);

	// In monorepo mode, the *workspace root's* package manager is the
	// one that owns install/build. A subpackage typically has no
	// lockfile of its own, so `detectPackageManager(projectDir)`
	// defaults to bun — which is wrong for npm/pnpm/yarn workspaces
	// and silently produces a rogue `bun.lock` at the root when the
	// build runs. Override here so every downstream step (install,
	// build, runtime manifests) sees the right pm.
	if (monorepo) {
		framework.packageManager = monorepo.packageManager;
	}

	const outputDir = input.outputDir
		? resolve(input.outputDir)
		: join(monorepo?.root ?? absoluteProjectDir, '.agentuity');

	// 3. Typecheck before build (skip in dev mode or when explicitly
	//    disabled). Failing fast saves CI time when types are broken.
	let typecheckMs = 0;
	if (!input.dev && !input.skipTypeCheck) {
		const endTypecheck = collector.startDiagnostic('typecheck');
		const started = Date.now();
		const typeResult = await typecheck(absoluteProjectDir, {
			collector,
			typegenCommand: framework.typegenCommand,
		});
		endTypecheck();
		typecheckMs = Date.now() - started;
		if (!typeResult.success) {
			throw new TypecheckError(typeResult.output);
		}
		logs.push(`✓ Typechecked in ${typecheckMs}ms`);
	}

	// 4. Run the framework adapter's build. The adapter is responsible
	//    for staging artifacts into `outputDir`; in monorepo mode it
	//    mirrors the whole workspace tree, in single-package mode it
	//    copies the build output and runtime manifests directly.
	const endBuild = collector.startDiagnostic('build');
	const buildStarted = Date.now();
	// Explicit pipeline field, or the same flag on deploy options (deploy CLI).
	const cdnBaseUrl = input.cdnBaseUrl ?? input.deploymentOptions?.cdnBaseUrl;

	const adapter = getAdapter(framework.name);
	const buildResult: BuildResult = await adapter.build({
		projectDir: absoluteProjectDir,
		framework,
		packageJson: packageJson ?? {},
		outputDir,
		logger,
		collector,
		dev: input.dev,
		projectId: input.projectId,
		orgId: input.orgId,
		region: input.region,
		deploymentId: input.deploymentId,
		deploymentOptions: input.deploymentOptions,
		deploymentConfig: input.deploymentConfig,
		monorepo: monorepo ?? undefined,
		cdnBaseUrl,
	});
	endBuild();
	const buildMs = Date.now() - buildStarted;
	logs.push(...buildResult.logs);

	// 5. Package the output — writes launch.json with `workingDirectory`
	//    set from monorepo.subpath when in monorepo mode, and
	//    `static.{directory,publicPath,baseUrl}` for CDN consumers.
	const packageResult = await packageBuildOutput(
		framework,
		buildResult,
		buildResult.outputDir,
		absoluteProjectDir,
		monorepo ?? undefined,
		{ cdnBaseUrl }
	);

	return {
		framework,
		packageJson,
		monorepo,
		buildResult,
		packageResult,
		outputDir: buildResult.outputDir,
		typecheckMs,
		buildMs,
		logs,
		usedIgnorePatterns: buildResult.usedIgnorePatterns,
	};
}
