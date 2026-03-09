/**
 * Route Migration Utility
 *
 * Detects projects using file-based routing (multiple route files in src/api/)
 * and offers to consolidate them into a single src/api/index.ts root router
 * that explicitly imports and mounts all sub-routers.
 *
 * This is a structural refactor only — it does NOT change app.ts or the runtime.
 * The generated entry file continues to work exactly as before, but instead of
 * scanning N individual route files, it finds a single src/api/index.ts that
 * already has all the mounts.
 *
 * Runs during `dev` and `build` after dependency upgrades.
 */

import { join, basename, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { Logger } from '../types';
import * as tui from '../tui';

// Sentinel file that tracks whether the user has been notified or has opted out
const MIGRATION_SENTINEL = '.agentuity/.route-migration-state';

type MigrationState = 'pending' | 'notified' | 'dismissed' | 'migrated';

interface MigrationStateFile {
	state: MigrationState;
	timestamp: number;
	version?: string;
}

function getMigrationStatePath(rootDir: string): string {
	return join(rootDir, MIGRATION_SENTINEL);
}

function readMigrationState(rootDir: string): MigrationStateFile | null {
	const statePath = getMigrationStatePath(rootDir);
	if (!existsSync(statePath)) return null;
	try {
		return JSON.parse(readFileSync(statePath, 'utf-8'));
	} catch {
		return null;
	}
}

function writeMigrationState(rootDir: string, state: MigrationState): void {
	const statePath = getMigrationStatePath(rootDir);
	const dir = dirname(statePath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(
		statePath,
		JSON.stringify({
			state,
			timestamp: Date.now(),
		} satisfies MigrationStateFile) + '\n'
	);
}

/**
 * Detect if a project uses file-based routing (has route files in src/api/).
 * Returns the list of discovered route files, or empty array if none found.
 */
/**
 * Check if a file exports a router as its default export.
 * Matches patterns like:
 *   export default router;
 *   export default createRouter();
 *   export default new Hono();
 * But NOT files that merely import/reference createRouter or Hono without exporting a router.
 */
function isRouterFile(content: string): boolean {
	// Strip single-line and multi-line comments to avoid false positives
	const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

	// Must have a default export
	if (!stripped.includes('export default')) return false;

	// Must actually create a router (not just import the function)
	return /createRouter\s*\(/.test(stripped) || /new\s+Hono\s*[<(]/.test(stripped);
}

export function detectFileBasedRoutes(rootDir: string): string[] {
	const apiDir = join(rootDir, 'src', 'api');
	if (!existsSync(apiDir)) return [];

	const routeFiles: string[] = [];
	const glob = new Bun.Glob('**/*.ts');
	for (const file of glob.scanSync(apiDir)) {
		const filePath = join(apiDir, file);
		try {
			const content = readFileSync(filePath, 'utf-8');
			if (isRouterFile(content)) {
				routeFiles.push(file);
			}
		} catch {
			// Skip unreadable files
		}
	}
	return routeFiles;
}

/**
 * Check if src/api/index.ts already exists and is a root router that mounts sub-routers.
 * This means the project has already been consolidated (manually or via migration).
 */
function hasConsolidatedRootRouter(rootDir: string): boolean {
	const indexPath = join(rootDir, 'src', 'api', 'index.ts');
	if (!existsSync(indexPath)) return false;
	try {
		const content = readFileSync(indexPath, 'utf-8');
		const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		// A consolidated root router both creates a router AND mounts sub-routers via .route()
		return (
			(/createRouter\s*\(/.test(stripped) || /new\s+Hono\s*[<(]/.test(stripped)) &&
			stripped.includes('.route(') &&
			content.includes('export default')
		);
	} catch {
		return false;
	}
}

export interface MigrationCheckResult {
	/** Whether migration is available for this project */
	available: boolean;
	/** Route files found in src/api/ */
	routeFiles: string[];
	/** Whether the user has already been notified */
	alreadyNotified: boolean;
}

/**
 * Check if a project is eligible for route consolidation.
 * Returns info about the project's routing state without performing any action.
 *
 * A project is eligible when:
 * - It has multiple route files in src/api/
 * - It does NOT already have a consolidated src/api/index.ts root router
 */
export function checkMigrationEligibility(rootDir: string): MigrationCheckResult {
	// Already consolidated — nothing to do
	if (hasConsolidatedRootRouter(rootDir)) {
		return { available: false, routeFiles: [], alreadyNotified: false };
	}

	const routeFiles = detectFileBasedRoutes(rootDir);

	// Need at least 2 route files for consolidation to be useful
	// (a single file means there's nothing to consolidate)
	if (routeFiles.length < 2) {
		return { available: false, routeFiles: [], alreadyNotified: false };
	}

	const state = readMigrationState(rootDir);
	const alreadyNotified = state?.state === 'notified' || state?.state === 'dismissed';

	return { available: true, routeFiles, alreadyNotified };
}

/**
 * Generate the consolidated src/api/index.ts that imports and mounts all existing route files.
 */
function generateRootRouter(routeFiles: string[]): string {
	const imports: string[] = [];
	const mounts: string[] = [];

	// Sort for deterministic output
	const sorted = [...routeFiles].sort();

	for (let i = 0; i < sorted.length; i++) {
		const file = sorted[i];
		if (!file) continue;

		// Convert file path to import path and mount path
		// e.g. "users/route.ts" → import from "./users/route", mount at "/users"
		// e.g. "health.ts" → import from "./health", mount at "/" (filename-as-segment handled by Hono)
		const withoutExt = file.replace(/\.tsx?$/, '');
		const importPath = `./${withoutExt}`;
		const importName = `router_${i}`;

		// Determine mount path from directory structure
		const dir = dirname(file);
		const base = basename(withoutExt);

		let mountPath: string;
		if (dir === '.') {
			// File directly in src/api/ — mount at root or as a named segment
			if (base === 'index' || base === 'route') {
				mountPath = '/';
			} else {
				mountPath = `/${base}`;
			}
		} else if (base === 'index' || base === 'route') {
			// Convention files in subdirectory — mount at directory path
			mountPath = `/${dir}`;
		} else {
			// Named file in subdirectory — preserve filename segment
			mountPath = `/${dir}/${base}`;
		}

		imports.push(`import ${importName} from '${importPath}';`);
		mounts.push(`router.route('${mountPath}', ${importName});`);
	}

	return `import { createRouter } from '@agentuity/runtime';
${imports.join('\n')}

const router = createRouter();

${mounts.join('\n')}

export default router;
`;
}

export interface MigrationResult {
	success: boolean;
	filesCreated: string[];
	filesModified: string[];
	message: string;
}

/**
 * Perform the route consolidation.
 *
 * This generates a new `src/api/index.ts` that imports and mounts all existing
 * route files as sub-routers. The existing route files are NOT modified — they
 * already export routers via `createRouter()`.
 *
 * The user's `app.ts` is also NOT modified — `createApp()` continues to work
 * exactly as before. The generated entry file will discover the new index.ts
 * and mount it as the root.
 */
export function performMigration(rootDir: string, routeFiles: string[]): MigrationResult {
	const filesCreated: string[] = [];

	try {
		const apiIndexPath = join(rootDir, 'src', 'api', 'index.ts');

		// Never overwrite an existing src/api/index.ts — could be user code
		if (existsSync(apiIndexPath)) {
			return {
				success: false,
				filesCreated: [],
				filesModified: [],
				message:
					'src/api/index.ts already exists. Please consolidate routes manually or remove it first.',
			};
		}

		// Filter out index.ts itself from the route files to mount
		const filesToMount = routeFiles.filter((f) => f !== 'index.ts');
		if (filesToMount.length === 0) {
			return {
				success: false,
				filesCreated: [],
				filesModified: [],
				message: 'No route files to consolidate (only index.ts found).',
			};
		}

		// Generate the root router file
		const rootRouterContent = generateRootRouter(filesToMount);
		const apiDir = join(rootDir, 'src', 'api');
		if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });
		writeFileSync(apiIndexPath, rootRouterContent);
		filesCreated.push('src/api/index.ts');

		writeMigrationState(rootDir, 'migrated');

		return {
			success: true,
			filesCreated,
			filesModified: [],
			message: 'Routes consolidated! All sub-routers are now mounted from src/api/index.ts.',
		};
	} catch (error) {
		return {
			success: false,
			filesCreated,
			filesModified: [],
			message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Show the migration notice and optionally perform migration.
 *
 * Called during `dev` and `build` after dependency upgrades.
 * Shows a banner the first time, then a shorter reminder on subsequent runs.
 *
 * @returns true if migration was performed, false otherwise
 */
export async function promptRouteMigration(
	rootDir: string,
	logger: Logger,
	options?: { interactive?: boolean }
): Promise<boolean> {
	const interactive = options?.interactive ?? process.stdin.isTTY;
	const eligibility = checkMigrationEligibility(rootDir);

	if (!eligibility.available) {
		return false;
	}

	const { routeFiles, alreadyNotified } = eligibility;

	// Non-interactive mode (CI, piped, AI agent): just log a notice
	if (!interactive) {
		if (!alreadyNotified) {
			logger.info(
				'[migration] This project has %d route files in src/api/. ' +
					'You can consolidate them into a single src/api/index.ts root router. ' +
					'Run `agentuity dev --migrate-routes` to consolidate.',
				routeFiles.length
			);
			writeMigrationState(rootDir, 'notified');
		}
		return false;
	}

	// First time: show full banner
	if (!alreadyNotified) {
		tui.newline();
		tui.banner(
			'✨ Consolidate Your Routes',
			`Your project has ${routeFiles.length} route files scattered across src/api/.\n` +
				'\n' +
				'You can consolidate them into a single src/api/index.ts that\n' +
				'imports and mounts all sub-routers explicitly — just like a\n' +
				'standard Hono application.\n' +
				'\n' +
				`${tui.muted('Before:')} ${routeFiles.length} files auto-discovered from src/api/**/*.ts\n` +
				`${tui.muted('After:')}  One src/api/index.ts that imports and mounts them\n` +
				'\n' +
				'Your existing route files and app.ts are not modified.\n' +
				'Everything continues to work exactly as before.',
			{ centerTitle: false }
		);
	} else {
		// Subsequent runs: shorter reminder
		tui.newline();
		tui.info(
			`${tui.bold('Route consolidation available')} — run with ${tui.muted('--migrate-routes')} or choose below.`
		);
	}

	tui.newline();

	const action = await tui.confirm('Would you like to consolidate your routes now?', false);

	if (!action) {
		writeMigrationState(rootDir, 'dismissed');
		tui.info(
			`You can consolidate later by running: ${tui.muted('agentuity dev --migrate-routes')}`
		);
		tui.newline();
		return false;
	}

	// Perform migration
	tui.newline();
	const result = performMigration(rootDir, routeFiles);

	if (result.success) {
		tui.success(result.message);
		if (result.filesCreated.length > 0) {
			tui.info(`Created: ${result.filesCreated.map((f) => tui.muted(f)).join(', ')}`);
		}
		tui.newline();
		tui.info('Your existing route files were not changed — they already export routers.');
		tui.info(
			`The new ${tui.muted('src/api/index.ts')} imports and mounts them as a single router tree.`
		);
		tui.newline();
	} else {
		tui.warning(result.message);
		tui.newline();
	}

	return result.success;
}
