/**
 * Framework detection types.
 *
 * These types define the contract between detection, adapters, and packaging.
 * The detection system identifies what JS framework a project uses,
 * and adapters know how to build and launch each framework.
 */

/**
 * Framework identifier.
 *
 * This is a string rather than a union type because the framework database
 * (derived from @vercel/frameworks) contains 25+ slugs and may grow.
 * Special values:
 * - 'agentuity' — Native Agentuity app (app.ts + @agentuity/runtime)
 * - 'generic'   — Fallback: has package.json with build/start scripts
 */
export type FrameworkName = string;

/**
 * Runtime that executes the built application.
 */
export type RuntimeName = 'node' | 'bun';

/**
 * Package manager detected or preferred.
 */
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

/**
 * Result of framework detection.
 *
 * This is the output of the detect phase and input to the adapter/build phase.
 */
export interface DetectedFramework {
	/** Framework identifier */
	name: FrameworkName;

	/** Human-readable framework version (e.g., "15.3.0" for Next.js) */
	version?: string;

	/** Runtime that runs the production server */
	runtime: RuntimeName;

	/** Detected package manager */
	packageManager: PackageManager;

	/** The build command to execute (e.g., "next build", "vite build") */
	buildCommand: string;

	/** Directory where build output is written (relative to project root) */
	buildOutput: string;

	/** Command to start the production server (only for mode='server') */
	startCommand?: string;

	/** Server entrypoint file (relative to buildOutput) */
	serverEntry?: string;

	/**
	 * Static/CDN asset directory (relative to project root).
	 * After the build runs, this directory contains files suitable for CDN upload.
	 * For pure SSGs/SPAs this equals buildOutput (entire output is static).
	 * For SSR frameworks this is a subdirectory (e.g., `.next/static`, `.output/public`).
	 */
	staticDir?: string;

	/** Environment variables needed at build time */
	buildEnv?: Record<string, string>;

	/** Port the app listens on (default: 3000) */
	port?: number;

	/** Detection confidence: 'high' if config file found, 'low' if inferred */
	confidence: 'high' | 'medium' | 'low';
}

/**
 * A single framework detector.
 *
 * Each detector examines the project directory and returns a DetectedFramework
 * if it recognizes the project, or null if it doesn't apply.
 */
export interface FrameworkDetector {
	/** Framework this detector handles */
	name: FrameworkName;

	/** Priority (lower = checked first). Specific frameworks before generic. */
	priority: number;

	/**
	 * Examine the project and return detection result, or null if not applicable.
	 */
	detect(projectDir: string, packageJson: PackageJsonData): Promise<DetectedFramework | null>;
}

/**
 * Parsed package.json data relevant to detection.
 */
export interface PackageJsonData {
	name?: string;
	version?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	main?: string;
	module?: string;
	type?: string;
	engines?: Record<string, string>;
}
