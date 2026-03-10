/**
 * Route Migration Utility
 *
 * Detects projects using file-based routing (multiple route files in src/api/)
 * and offers to migrate them to explicit routing — a single src/api/index.ts
 * root router that imports and mounts all sub-routers explicitly.
 *
 * Also updates src/app.ts to import the router and pass it to
 * createApp({ router }), completing the migration to explicit routing.
 *
 * Explicit routing will become the default in the next major release.
 *
 * Runs during `dev` and `build` after dependency upgrades.
 */

import { join, basename, dirname, relative } from 'node:path';
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
 * This means the project has already migrated to explicit routing.
 */
function hasExplicitRootRouter(rootDir: string): boolean {
	const indexPath = join(rootDir, 'src', 'api', 'index.ts');
	if (!existsSync(indexPath)) return false;
	try {
		const content = readFileSync(indexPath, 'utf-8');
		const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
		// An explicit root router both creates a router AND mounts sub-routers via .route()
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
 * Check if a project is eligible for migration to explicit routing.
 * Returns info about the project's routing state without performing any action.
 *
 * A project is eligible when:
 * - It has multiple route files in src/api/
 * - It does NOT already have an explicit src/api/index.ts root router
 */
export function checkMigrationEligibility(rootDir: string): MigrationCheckResult {
	const routeFiles = detectFileBasedRoutes(rootDir);

	// Need at least 2 route files for migration to be useful
	// (a single file already acts as an explicit root router)
	if (routeFiles.length < 2) {
		return { available: false, routeFiles: [], alreadyNotified: false };
	}

	// If there's already an explicit root router, check if all route files
	// are already imported. If so, nothing to do.
	if (hasExplicitRootRouter(rootDir)) {
		const indexPath = join(rootDir, 'src', 'api', 'index.ts');
		const indexContent = readFileSync(indexPath, 'utf-8');
		const filesToMount = routeFiles.filter((f) => f !== 'index.ts');
		const allImported = filesToMount.every((f) => {
			const importPath = `./${f.replace(/\.tsx?$/, '')}`;
			return indexContent.includes(importPath);
		});
		if (allImported) {
			return { available: false, routeFiles: [], alreadyNotified: false };
		}
	}

	const state = readMigrationState(rootDir);

	// Already migrated — don't prompt again
	if (state?.state === 'migrated') {
		return { available: false, routeFiles: [], alreadyNotified: true };
	}

	const alreadyNotified = state?.state === 'notified' || state?.state === 'dismissed';

	return { available: true, routeFiles, alreadyNotified };
}

/**
 * Convert a string segment into a valid camelCase identifier part.
 * Splits on non-alphanumeric characters (hyphens, dots, underscores, spaces, etc.)
 * and capitalizes each sub-word.
 *
 * e.g. "user-profile" → "userProfile"
 *      "my_api"       → "myApi"
 *      "foo.bar"      → "fooBar"
 *      "123start"     → "_123start"  (leading digit gets underscore prefix)
 */
function sanitizeSegment(segment: string, capitalize: boolean): string {
	// Split on non-alphanumeric characters
	const parts = segment.split(/[^a-zA-Z0-9]+/).filter(Boolean);
	if (parts.length === 0) return '_';

	const result = parts
		.map((part, i) => {
			if (i === 0 && !capitalize) return part.toLowerCase();
			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join('');

	// Prefix with underscore if starts with a digit
	if (/^\d/.test(result)) return `_${result}`;
	return result;
}

/**
 * Derive a descriptive camelCase import name from a route file path.
 * Handles special characters (hyphens, dots, underscores) in file/directory names
 * by converting them to camelCase boundaries.
 *
 * e.g. "auth/route.ts"        → "authRouter"
 *      "users.ts"             → "usersRouter"
 *      "users/profile.ts"     → "usersProfileRouter"
 *      "health.ts"            → "healthRouter"
 *      "user-profile.ts"      → "userProfileRouter"
 *      "my-api/v2-routes.ts"  → "myApiV2RoutesRouter"
 *      "foo_bar/route.ts"     → "fooBarRouter"
 */
function deriveImportName(file: string): string {
	const withoutExt = file.replace(/\.tsx?$/, '');
	const dir = dirname(withoutExt);
	const base = basename(withoutExt);

	let segments: string[];
	if (dir === '.') {
		// Top-level file: users.ts → ["users"]
		segments = base === 'index' || base === 'route' ? ['root'] : [base];
	} else if (base === 'index' || base === 'route') {
		// Convention file in subdirectory: auth/route.ts → ["auth"]
		segments = dir.split('/');
	} else {
		// Named file in subdirectory: users/profile.ts → ["users", "profile"]
		segments = [...dir.split('/'), base];
	}

	// Convert to camelCase + "Router" suffix, sanitizing each segment
	const camel = segments.map((s, i) => sanitizeSegment(s, i > 0)).join('');
	return `${camel}Router`;
}

/**
 * Compute the mount path and import path for a route file.
 */
function computeRouteMountInfo(file: string): {
	importPath: string;
	importName: string;
	mountPath: string;
} {
	const withoutExt = file.replace(/\.tsx?$/, '');
	const importPath = `./${withoutExt}`;
	const importName = deriveImportName(file);

	const dir = dirname(file);
	const base = basename(withoutExt);

	let mountPath: string;
	if (dir === '.') {
		if (base === 'index' || base === 'route') {
			mountPath = '/';
		} else {
			mountPath = `/${base}`;
		}
	} else if (base === 'index' || base === 'route') {
		mountPath = `/${dir}`;
	} else {
		mountPath = `/${dir}/${base}`;
	}

	return { importPath, importName, mountPath };
}

/**
 * Deduplicate import names by appending a numeric suffix when collisions occur.
 */
function deduplicateImportNames(
	infos: Array<{ importPath: string; importName: string; mountPath: string }>
): Array<{ importPath: string; importName: string; mountPath: string }> {
	const seen = new Map<string, number>();
	return infos.map((info) => {
		const count = seen.get(info.importName) ?? 0;
		seen.set(info.importName, count + 1);
		if (count > 0) {
			return { ...info, importName: `${info.importName}${count}` };
		}
		return info;
	});
}

/**
 * Generate a fresh src/api/index.ts that imports and mounts all route files.
 */
function generateRootRouter(routeFiles: string[]): string {
	const sorted = [...routeFiles].sort();
	const infos = deduplicateImportNames(sorted.map(computeRouteMountInfo));

	const imports = infos.map((i) => `import ${i.importName} from '${i.importPath}';`);
	const mounts = infos.map((i) => `router.route('${i.mountPath}', ${i.importName});`);

	return `import { createRouter } from '@agentuity/runtime';
${imports.join('\n')}

const router = createRouter();

${mounts.join('\n')}

export default router;
`;
}

/**
 * Detect the router variable name used in an existing file.
 * Looks for patterns like:
 * - `const router = createRouter()` / `const api = createRouter()`
 * - `const router = new Hono()` / `const app = new Hono()`
 * - Falls back to checking what identifier is default-exported
 *
 * Returns the variable name (e.g., 'router', 'api', 'app') or 'router' as fallback.
 */
function detectRouterVariableName(content: string): string {
	// Look for variable assigned from createRouter() or new Hono()
	const routerAssignMatch = content.match(
		/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:createRouter\s*\(|new\s+Hono\s*[<(])/
	);
	if (routerAssignMatch?.[1]) {
		return routerAssignMatch[1];
	}

	// Look for existing .route() calls to infer the variable name
	const routeCallMatch = content.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\.route\s*\(/);
	if (routeCallMatch?.[1]) {
		return routeCallMatch[1];
	}

	// Fall back to the default export identifier
	const exportMatch = content.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*;?\s*$/m);
	if (exportMatch?.[1]) {
		return exportMatch[1];
	}

	return 'router';
}

/**
 * Modify an existing src/api/index.ts to add imports and route mounts for
 * route files that are not already imported. Inserts imports at the top
 * (after existing imports) and mounts just before the `export default` line.
 *
 * Detects the router variable name used in the file (e.g., 'router', 'api', 'app')
 * and uses it in the generated `.route()` calls.
 */
function mergeIntoExistingIndex(
	existingContent: string,
	routeFiles: string[]
): { content: string; added: string[] } {
	const sorted = [...routeFiles].sort();
	const allInfos = deduplicateImportNames(sorted.map(computeRouteMountInfo));

	// Filter out files already imported in the existing content
	const newInfos = allInfos.filter((info) => !existingContent.includes(info.importPath));

	if (newInfos.length === 0) {
		return { content: existingContent, added: [] };
	}

	// Detect the router variable name used in this file
	const routerVar = detectRouterVariableName(existingContent);

	const newImports = newInfos.map((i) => `import ${i.importName} from '${i.importPath}';`);
	const newMounts = newInfos.map((i) => `${routerVar}.route('${i.mountPath}', ${i.importName});`);

	const lines = existingContent.split('\n');

	// Find the last import line to insert new imports after it
	let lastImportIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]!.trim();
		if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
			lastImportIndex = i;
		}
	}

	// Find the export default line to insert mounts before it
	let exportDefaultIndex = -1;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i]!.trim().startsWith('export default')) {
			exportDefaultIndex = i;
			break;
		}
	}

	if (exportDefaultIndex === -1) {
		// No export default found — append mounts at the end
		exportDefaultIndex = lines.length;
	}

	// Insert new imports after the last existing import
	const insertImportAt = lastImportIndex === -1 ? 0 : lastImportIndex + 1;
	lines.splice(insertImportAt, 0, ...newImports);

	// Adjust exportDefaultIndex since we inserted lines above it
	const adjustedExportIndex = exportDefaultIndex + newImports.length;

	// Insert mounts before export default, with a blank line separator
	lines.splice(adjustedExportIndex, 0, '', ...newMounts, '');

	return {
		content: lines.join('\n'),
		added: newInfos.map((i) => i.mountPath),
	};
}

/**
 * Detect the default export name from a router file.
 * Returns the identifier name if found (e.g., 'router', 'api', 'app'),
 * or 'router' as a fallback for anonymous/expression default exports.
 */
function detectDefaultExportName(filePath: string): string {
	if (!existsSync(filePath)) return 'router';

	try {
		const content = readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();

			// export default router;
			const identifierMatch = trimmed.match(
				/^export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*;?\s*$/
			);
			if (identifierMatch && identifierMatch[1]) {
				return identifierMatch[1];
			}
		}

		// Check for `const X = createRouter(); ... export default X;` pattern
		// by finding the variable assigned from createRouter() or new Hono()
		const routerVarMatch = content.match(
			/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:createRouter\s*\(|new\s+Hono\s*[<(])/
		);
		if (routerVarMatch && routerVarMatch[1]) {
			// Verify this variable is actually the default export
			const exportPattern = new RegExp(`export\\s+default\\s+${routerVarMatch[1]}\\s*;?`);
			if (exportPattern.test(content)) {
				return routerVarMatch[1];
			}
		}
	} catch {
		// Fall through to default
	}

	return 'router';
}

/**
 * Update src/app.ts to import the explicit router and pass it to createApp().
 *
 * Handles these createApp patterns:
 * - `createApp()`          → `createApp({ router })`
 * - `createApp({})`        → `createApp({ router })`
 * - `createApp({ ... })`   → `createApp({ router, ... })`
 * - `createApp({ router: x })` → already has router, skip
 *
 * The import name is derived from the default export of src/api/index.ts
 * (e.g., if it exports `api`, the import is `import api from './api/index'`
 * and the property is `router: api`).
 *
 * Returns null if app.ts doesn't exist or doesn't need changes.
 */
function updateAppTs(
	rootDir: string,
	routerExportName: string
): { content: string; changed: boolean; appPath: string } | null {
	// Try root app.ts first (standard convention), then src/app.ts
	const rootAppPath = join(rootDir, 'app.ts');
	const srcAppPath = join(rootDir, 'src', 'app.ts');
	const appPath = existsSync(rootAppPath)
		? rootAppPath
		: existsSync(srcAppPath)
			? srcAppPath
			: null;

	if (!appPath) return null;

	const content = readFileSync(appPath, 'utf-8');

	// Skip if already has a router property in createApp
	if (/createApp\s*\(\s*\{[^}]*\brouter\b/.test(content)) {
		return { content, changed: false, appPath };
	}

	// Skip if createApp is not used
	if (!content.includes('createApp')) {
		return { content, changed: false, appPath };
	}

	const lines = content.split('\n');

	// Step 1: Add import for the router after the last import
	// Import path depends on where app.ts lives:
	//   root app.ts   → './src/api/index'
	//   src/app.ts    → './api/index'
	const isRootAppTs = appPath === rootAppPath;
	const importName = routerExportName;
	const importPath = isRootAppTs ? './src/api/index' : './api/index';
	const importStatement = `import ${importName} from '${importPath}';`;

	// Check if this import already exists
	const alreadyImported = lines.some(
		(line) =>
			line.includes("from './api/index'") ||
			line.includes("from './api'") ||
			line.includes("from './src/api/index'") ||
			line.includes("from './src/api'")
	);

	if (!alreadyImported) {
		let lastImportIndex = -1;
		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i]!.trim();
			if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
				lastImportIndex = i;
			}
		}
		const insertAt = lastImportIndex === -1 ? 0 : lastImportIndex + 1;
		lines.splice(insertAt, 0, importStatement);
	}

	// Step 2: Add router property to createApp() call
	// Determine the property value: if export name is 'router', use shorthand
	// Otherwise use `router: exportName`
	const routerProp = importName === 'router' ? 'router' : `router: ${importName}`;
	let modified = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Match createApp() with no arguments
		if (/createApp\s*\(\s*\)/.test(line)) {
			lines[i] = line.replace(/createApp\s*\(\s*\)/, `createApp({ ${routerProp} })`);
			modified = true;
			break;
		}

		// Match createApp({}) with empty object
		if (/createApp\s*\(\s*\{\s*\}\s*\)/.test(line)) {
			lines[i] = line.replace(/createApp\s*\(\s*\{\s*\}\s*\)/, `createApp({ ${routerProp} })`);
			modified = true;
			break;
		}

		// Match createApp({ ...existing }) with existing properties
		// Insert router as the first property after the opening brace
		if (/createApp\s*\(\s*\{/.test(line)) {
			lines[i] = line.replace(/createApp\s*\(\s*\{/, `createApp({ ${routerProp},`);
			modified = true;
			break;
		}
	}

	if (!modified && !alreadyImported) {
		// createApp pattern not recognized — don't write partial changes
		return null;
	}

	return { content: lines.join('\n'), changed: !alreadyImported || modified, appPath };
}

export interface MigrationResult {
	success: boolean;
	filesCreated: string[];
	filesModified: string[];
	message: string;
}

/**
 * Perform the migration to explicit routing.
 *
 * 1. Generates/updates `src/api/index.ts` to import and mount all route files
 * 2. Updates `src/app.ts` to import the router and pass it to `createApp({ router })`
 *
 * Existing route files are NOT modified — they already export routers.
 */
export function performMigration(rootDir: string, routeFiles: string[]): MigrationResult {
	const filesCreated: string[] = [];
	const filesModified: string[] = [];

	try {
		const apiIndexPath = join(rootDir, 'src', 'api', 'index.ts');

		// Filter out index.ts itself from the route files to mount
		const filesToMount = routeFiles.filter((f) => f !== 'index.ts');
		if (filesToMount.length === 0) {
			return {
				success: false,
				filesCreated: [],
				filesModified: [],
				message: 'No route files to migrate (only index.ts found).',
			};
		}

		let indexMessage: string;

		if (existsSync(apiIndexPath)) {
			// Existing index.ts — merge new imports and mounts into it
			const existingContent = readFileSync(apiIndexPath, 'utf-8');
			const { content: merged, added } = mergeIntoExistingIndex(existingContent, filesToMount);

			if (added.length === 0) {
				// All routes already imported — still try to update app.ts
				const routerExportName = detectDefaultExportName(apiIndexPath);
				const appResult = updateAppTs(rootDir, routerExportName);
				if (appResult?.changed) {
					writeFileSync(appResult.appPath, appResult.content);
					const relAppPath = relative(rootDir, appResult.appPath);
					filesModified.push(relAppPath);
					return {
						success: true,
						filesCreated: [],
						filesModified,
						message: `All route files are already imported in src/api/index.ts. Updated ${relAppPath} with explicit router.`,
					};
				}
				return {
					success: true,
					filesCreated: [],
					filesModified: [],
					message: 'All route files are already imported in src/api/index.ts.',
				};
			}

			writeFileSync(apiIndexPath, merged);
			filesModified.push('src/api/index.ts');
			indexMessage = `Added ${added.length} route mount(s) to existing src/api/index.ts.`;
		} else {
			// No existing index.ts — generate a fresh one
			const rootRouterContent = generateRootRouter(filesToMount);
			const apiDir = join(rootDir, 'src', 'api');
			if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });
			writeFileSync(apiIndexPath, rootRouterContent);
			filesCreated.push('src/api/index.ts');
			indexMessage = 'Migrated to explicit routing in src/api/index.ts.';
		}

		// Update app.ts to import and use the explicit router
		const routerExportName = detectDefaultExportName(apiIndexPath);
		const appResult = updateAppTs(rootDir, routerExportName);
		if (appResult?.changed) {
			writeFileSync(appResult.appPath, appResult.content);
			const relAppPath = relative(rootDir, appResult.appPath);
			filesModified.push(relAppPath);
		}

		writeMigrationState(rootDir, 'migrated');

		return {
			success: true,
			filesCreated,
			filesModified,
			message: indexMessage,
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
				'[migration] This project uses file-based routing with %d route files in src/api/. ' +
					'Agentuity is moving to explicit routing, which will become the default in the next major release. ' +
					'Run `agentuity dev --migrate-routes` to migrate.',
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
			'✨ Migrate to Explicit Routing',
			'Agentuity is moving to explicit routing, which will become the\n' +
				'default in the next major release. File-based route discovery\n' +
				'will be deprecated.\n' +
				'\n' +
				`Your project has ${routeFiles.length} route files in src/api/ that are\n` +
				'auto-discovered at build time. Explicit routing gives you a single\n' +
				'src/api/index.ts that imports and mounts all sub-routers — just\n' +
				'like a standard Hono application.\n' +
				'\n' +
				`${tui.muted('Before:')} ${routeFiles.length} files auto-discovered from src/api/**/*.ts\n` +
				`${tui.muted('After:')}  One src/api/index.ts that imports and mounts them\n` +
				'\n' +
				'Your existing route files are not modified. Your app.ts will be\n' +
				'updated to import the router and pass it to createApp({ router }).',
			{ centerTitle: false }
		);
	} else {
		// Subsequent runs: shorter reminder
		tui.newline();
		tui.info(
			`${tui.bold('Explicit routing migration available')} — run with ${tui.muted('--migrate-routes')} or choose below.`
		);
	}

	tui.newline();

	const action = await tui.confirm('Would you like to migrate to explicit routing now?', false);

	if (!action) {
		writeMigrationState(rootDir, 'dismissed');
		tui.info(`You can migrate later by running: ${tui.muted('agentuity dev --migrate-routes')}`);
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
		if (result.filesModified.length > 0) {
			tui.info(`Modified: ${result.filesModified.map((f) => tui.muted(f)).join(', ')}`);
		}
		tui.newline();
		tui.info('Your existing route files were not changed — they already export routers.');
		tui.newline();
	} else {
		tui.warning(result.message);
		tui.newline();
	}

	return result.success;
}
