/**
 * Build adapter types.
 *
 * Adapters know how to build a specific framework and package the result.
 * They receive a DetectedFramework and produce a BuildResult.
 */

import type { DetectedFramework, PackageJsonData } from '../detect/types.ts';
import type { MonorepoContext } from '../detect/monorepo.ts';
import type { Logger, DeployOptions } from '../../../types.ts';
import type { BuildReportCollector } from '../../../build-report.ts';

/**
 * Result of a successful build.
 */
export interface BuildResult {
	/** Absolute path to the build output directory */
	outputDir: string;

	/** The start command to run the application */
	startCommand?: string;

	/**
	 * Server entrypoint file relative to the process working directory
	 * (or to outputDir when {@link workingDirectory} is unset).
	 */
	serverEntry?: string;

	/**
	 * Process cwd relative to the deploy/output root.
	 * Set by adapters when packaging discovers a nested layout (e.g. Next
	 * standalone under monorepo subpath or `outputFileTracingRoot` nest).
	 * Takes precedence over `monorepo.subpath` in launch metadata so the
	 * adapter remains source of truth for packaging layout.
	 * Written to `launch.json` as `processes[].workingDirectory`.
	 */
	workingDirectory?: string;

	/** Static/CDN assets directory (absolute path), for CDN upload enumeration */
	staticDir?: string;

	/** Public URL path prefix for files inside staticDir */
	staticAssetPublicPath?: string;

	/**
	 * Absolute path to packaged root-public assets (e.g. Next `public/`).
	 * Used when {@link staticAssetPublicPath} is a non-empty built prefix
	 * (`_next/static`) so CDN upload + HTML rewrite can also ship `/logo.svg`.
	 */
	publicStaticDir?: string;

	/** Port the app listens on */
	port?: number;

	/** Build duration in milliseconds */
	duration: number;

	/** Human-readable build log lines */
	logs: string[];

	/**
	 * True when monorepo staging loaded one or more user `.agentuityignore`
	 * patterns. Undefined for non-monorepo builds.
	 */
	usedIgnorePatterns?: boolean;
}

/**
 * Options passed to a build adapter.
 */
export interface BuildAdapterOptions {
	/** Absolute path to the project root */
	projectDir: string;

	/** Detected framework info */
	framework: DetectedFramework;

	/** Parsed package.json */
	packageJson: PackageJsonData;

	/** Absolute path to write build output */
	outputDir: string;

	/** Logger instance */
	logger: Logger;

	/** Build report collector for structured error reporting */
	collector?: BuildReportCollector;

	/** Development mode (less minification, inline sourcemaps) */
	dev?: boolean;

	/** Project ID (for Agentuity metadata) */
	projectId?: string;

	/** Org ID (for Agentuity metadata) */
	orgId?: string;

	/** Region (for Agentuity metadata) */
	region?: string;

	/** Deployment ID (for Agentuity metadata) */
	deploymentId?: string;

	/**
	 * Explicit CDN base URL (`--cdn-base-url`). When set, adapters wire
	 * framework asset URL generation (Vite `--base`, Next `assetPrefix`,
	 * TanStack `transformAssets`) against this origin + optional path.
	 */
	cdnBaseUrl?: string;

	/** Deployment options from CLI (git info, trigger, etc.) */
	deploymentOptions?: DeployOptions;

	/** Deployment config from agentuity.json (resources, mode, dependencies, domains) */
	deploymentConfig?: Record<string, unknown>;

	/**
	 * Monorepo context, when `projectDir` is a subpackage inside a
	 * workspace. Adapters use this to:
	 *   - run install/build at the workspace root
	 *   - target the right subpackage via the pm's workspace filter
	 *   - source root `package.json` + lockfile for runtime install
	 *   - emit `processes[].workingDirectory = monorepo.subpath` so the
	 *     deployed process starts inside the subpackage tree
	 * `undefined` means single-package mode (today's behavior).
	 */
	monorepo?: MonorepoContext;
}

/**
 * A build adapter that knows how to build a specific framework.
 */
export interface BuildAdapter {
	/** Framework this adapter handles */
	name: string;

	/**
	 * Run the build for this framework.
	 */
	build(options: BuildAdapterOptions): Promise<BuildResult>;
}
