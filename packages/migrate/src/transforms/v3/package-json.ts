/**
 * Transform: package.json for v2 → v3 migration.
 *
 * - Removes @agentuity/runtime
 * - Adds hono and @agentuity/hono
 * - Adds individual service packages based on detected usage
 * - Bumps all @agentuity/* packages to ^3.0.0
 * - Updates start script if it references old entry point
 */

import { SERVICE_PACKAGE_MAP, type V3OutdatedPackage } from '../../detect-v3';

/**
 * Packages that existed in v2 but are removed in v3.
 *
 * v3 is a deliberate "eject" — agent framework magic (evals, workbench) and
 * helper facades (frontend, react) are replaced by user-visible primitives.
 * These packages have no v3 counterpart and must be deleted from package.json,
 * not bumped to a non-existent ^3.0.0.
 *
 * Note: @agentuity/react is handled separately via options.removeReact.
 */
const PACKAGES_REMOVED_IN_V3 = [
	'@agentuity/evals',
	'@agentuity/frontend',
	'@agentuity/workbench',
] as const;

export interface V3PackageJsonResult {
	/** Transformed package.json content, or null if no changes */
	content: string | null;
	/** Description of each change */
	changes: string[];
}

/**
 * Transform package.json for v3 migration.
 */
export function transformPackageJsonV3(
	source: string,
	outdatedPackages: V3OutdatedPackage[],
	servicesUsed: string[],
	options?: {
		/** Whether the project had @agentuity/runtime */
		removeRuntime?: boolean;
		/** Whether to remove @agentuity/react */
		removeReact?: boolean;
		/** Whether any source file was ported from @agentuity/schema to zod */
		addZod?: boolean;
		/** Dev scripts to add (from dev-setup transform) */
		devScripts?: Record<string, string>;
	}
): V3PackageJsonResult {
	const changes: string[] = [];
	let pkg: Record<string, unknown>;

	try {
		pkg = JSON.parse(source);
	} catch {
		return { content: null, changes: ['Failed to parse package.json'] };
	}

	const deps = (pkg.dependencies ?? {}) as Record<string, string>;
	const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;

	// ── 1. Remove @agentuity/runtime ──────────────────────────────────────
	if (options?.removeRuntime && deps['@agentuity/runtime']) {
		delete deps['@agentuity/runtime'];
		changes.push('Removed @agentuity/runtime from dependencies');
	}
	if (options?.removeRuntime && devDeps['@agentuity/runtime']) {
		delete devDeps['@agentuity/runtime'];
		changes.push('Removed @agentuity/runtime from devDependencies');
	}

	// ── 2. Add hono ───────────────────────────────────────────────────────
	if (!deps['hono']) {
		deps['hono'] = '^4.0.0';
		changes.push('Added hono@^4.0.0 to dependencies');
	}

	// ── 3. Add @agentuity/hono ────────────────────────────────────────────
	if (!deps['@agentuity/hono']) {
		deps['@agentuity/hono'] = '^3.0.0';
		changes.push('Added @agentuity/hono@^3.0.0 to dependencies');
	}

	// ── 4. Add individual service packages based on usage ─────────────────
	for (const service of servicesUsed) {
		if (service === 'logger') {
			// Logger comes from telemetry
			if (!deps['@agentuity/telemetry']) {
				deps['@agentuity/telemetry'] = '^3.0.0';
				changes.push('Added @agentuity/telemetry@^3.0.0 (for logger)');
			}
			continue;
		}

		const mapping = SERVICE_PACKAGE_MAP[service];
		if (!mapping) continue;

		if (!deps[mapping.pkg]) {
			deps[mapping.pkg] = '^3.0.0';
			changes.push(`Added ${mapping.pkg}@^3.0.0 (${service} service detected in use)`);
		}
	}

	// ── 5a. Remove v2-only packages that have no v3 counterpart ────────────
	// (These would otherwise be bumped to ^3.0.0 in step 5b, which fails to
	// resolve because the packages were deleted entirely in v3.)
	for (const removed of PACKAGES_REMOVED_IN_V3) {
		if (deps[removed]) {
			delete deps[removed];
			changes.push(`Removed ${removed} from dependencies (no longer exists in v3)`);
		}
		if (devDeps[removed]) {
			delete devDeps[removed];
			changes.push(`Removed ${removed} from devDependencies (no longer exists in v3)`);
		}
	}

	// ── 5b. Bump existing @agentuity/* packages to ^3.0.0 ─────────────────
	// Skip packages we just removed — they'd otherwise come back.
	for (const outdated of outdatedPackages) {
		if ((PACKAGES_REMOVED_IN_V3 as readonly string[]).includes(outdated.name)) continue;
		const section = outdated.section === 'dependencies' ? deps : devDeps;
		if (section[outdated.name]) {
			section[outdated.name] = '^3.0.0';
			changes.push(`Updated ${outdated.name} ${outdated.currentVersion} → ^3.0.0`);
		}
	}

	// ── 6. Add zod + remove @agentuity/schema when the schema→zod port fired ──
	if (options?.addZod) {
		if (!deps['zod']) {
			deps['zod'] = '^4.0.0';
			changes.push('Added zod@^4.0.0 to dependencies');
		}
		if (deps['@agentuity/schema']) {
			delete deps['@agentuity/schema'];
			changes.push('Removed @agentuity/schema (usage ported to zod)');
		}
		if (devDeps['@agentuity/schema']) {
			delete devDeps['@agentuity/schema'];
			changes.push('Removed @agentuity/schema from devDependencies (usage ported to zod)');
		}
	}

	// ── 7. Remove @agentuity/react if requested ───────────────────────────
	if (options?.removeReact) {
		if (deps['@agentuity/react']) {
			delete deps['@agentuity/react'];
			changes.push('Removed @agentuity/react from dependencies (deprecated in v3)');
		}
		if (devDeps['@agentuity/react']) {
			delete devDeps['@agentuity/react'];
			changes.push('Removed @agentuity/react from devDependencies (deprecated in v3)');
		}
	}

	// ── 7. Update scripts for new entry point ─────────────────────────
	const scripts = (pkg.scripts ?? {}) as Record<string, string>;

	// Replace app.ts references in existing scripts
	if (scripts.start && scripts.start.includes('app.ts')) {
		const oldStart = scripts.start;
		scripts.start = scripts.start.replace('app.ts', 'src/index.ts');
		changes.push(`Updated start script: "${oldStart}" → "${scripts.start}"`);
	}
	if (scripts.dev && scripts.dev.includes('app.ts')) {
		const oldDev = scripts.dev;
		scripts.dev = scripts.dev.replace('app.ts', 'src/index.ts');
		changes.push(`Updated dev script: "${oldDev}" → "${scripts.dev}"`);
	}

	// Ensure a start script exists that points to the new entry point.
	// The buildpack's generic detector uses this to determine how to run the app.
	if (
		!scripts.start ||
		scripts.start.includes('.agentuity') ||
		scripts.start.includes('agentuity')
	) {
		const oldStart = scripts.start;
		scripts.start = 'bun src/index.ts';
		if (oldStart) {
			changes.push(`Replaced start script: "${oldStart}" → "${scripts.start}"`);
		} else {
			changes.push(`Added start script: "${scripts.start}"`);
		}
	}

	// Apply dev scripts from dev-setup transform
	if (options?.devScripts) {
		for (const [name, value] of Object.entries(options.devScripts)) {
			const old = scripts[name];
			scripts[name] = value;
			if (old) {
				changes.push(`Updated ${name} script: "${old}" → "${value}"`);
			} else {
				changes.push(`Added ${name} script: "${value}"`);
			}
		}
	}

	// Write back
	if (Object.keys(deps).length > 0) pkg.dependencies = deps;
	if (Object.keys(devDeps).length > 0) pkg.devDependencies = devDeps;
	if (Object.keys(scripts).length > 0) pkg.scripts = scripts;

	if (changes.length === 0) {
		return { content: null, changes: [] };
	}

	// Preserve the original indentation style
	const indent = detectIndent(source);
	return {
		content: JSON.stringify(pkg, null, indent) + '\n',
		changes,
	};
}

/**
 * Detect indentation (tab vs spaces) from package.json source.
 */
function detectIndent(source: string): string | number {
	const match = source.match(/^(\s+)"/m);
	if (match) {
		const whitespace = match[1] ?? '\t';
		if (whitespace.includes('\t')) return '\t';
		return whitespace.length;
	}
	return '\t'; // default to tabs (project convention)
}
