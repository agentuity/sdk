/**
 * Agentuity v2 runtime detector.
 *
 * v3 dropped `@agentuity/runtime` entirely, so the mere presence of
 * `@agentuity/runtime` at a v2 major is an unambiguous signal that a project
 * is a v2 app. v2 apps don't fit the generic buildpack model: they build with
 * the v2 CLI's own `agentuity build` (which bundles a Bun server entry plus a
 * client bundle into `.agentuity/`) and start with `bun .agentuity/app.js`.
 *
 * Without this detector the v3 pipeline mis-classifies a v2 app as a generic
 * `vite` SPA, builds only the client, and ships a deploy that fails at warmup.
 * Detecting it here lets the v3 CLI deploy a v2 app natively by driving the v2
 * build + packaging the v2 server output.
 *
 * `agentuity build` is supplied by the project-local v2 CLI. The global→local
 * delegation (and v2 self-heal) in `local-delegate.ts` ensures that local CLI
 * is present; when deploying with a non-global v3 CLI the project must already
 * have `@agentuity/cli` installed (v2 scaffolds do by default).
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathExists } from '../../../node-compat/fs.ts';
import type { DetectedFramework, PackageJsonData } from './types.ts';

/** The build output directory the v2 CLI writes to. */
const V2_OUTPUT_DIR = '.agentuity';

/**
 * Resolve the project-local v2 CLI's executable from its package.json `bin`
 * field, relative to `node_modules/@agentuity/cli`. Returns null when the
 * local CLI isn't installed. We invoke this entry directly (via `bun`) rather
 * than the bare `agentuity` command so the build adapter's anti-recursion
 * guard — which refuses any literal `agentuity ...` build command — doesn't
 * trip on a legitimate v2 build, and so we never accidentally shell back into
 * the running v3 CLI.
 */
function resolveLocalCliEntry(projectDir: string): string | null {
	const pkgDir = join(projectDir, 'node_modules', '@agentuity', 'cli');
	const pkgJsonPath = join(pkgDir, 'package.json');
	if (!existsSync(pkgJsonPath)) return null;
	try {
		const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
			bin?: string | Record<string, string>;
		};
		const binEntry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.agentuity;
		if (!binEntry) return null;
		const binPath = isAbsolute(binEntry) ? binEntry : join(pkgDir, binEntry);
		return existsSync(binPath) ? binPath : null;
	} catch {
		return null;
	}
}

/**
 * The v2 runtime spec, if `@agentuity/runtime` is a declared dependency.
 * Looks in both dependency maps.
 */
function v2RuntimeSpec(pkg: PackageJsonData): string | null {
	const spec =
		pkg.dependencies?.['@agentuity/runtime'] ?? pkg.devDependencies?.['@agentuity/runtime'];
	if (!spec) return null;
	// Only treat a concrete v2 major as a v2 app. A floating spec (`latest`,
	// `*`, workspace/git refs) is ambiguous and could be anything, so we don't
	// claim it here — let the normal detection path handle those.
	return /^[\^~]?2\./.test(spec) ? spec : null;
}

/**
 * Detect a v2 Agentuity runtime app. Returns a `DetectedFramework` describing
 * how to build (`agentuity build`) and start (`bun .agentuity/app.js`) it, or
 * null when the project isn't a v2 app.
 */
export async function detectAgentuityV2(
	projectDir: string,
	pkg: PackageJsonData
): Promise<DetectedFramework | null> {
	const spec = v2RuntimeSpec(pkg);
	if (!spec) return null;

	const warnings: string[] = [];
	const localCliEntry = resolveLocalCliEntry(projectDir);
	// `agentuity build` is provided by the project-local v2 CLI. Surface a hint
	// when it isn't installed so the failure (if any) is self-explanatory.
	if (!(await pathExists(join(projectDir, 'node_modules', '@agentuity', 'cli')))) {
		warnings.push(
			'v2 project detected but @agentuity/cli is not installed locally; ' +
				'run `bun add -D @agentuity/cli@' +
				spec +
				'` so `agentuity build` is available.'
		);
	}

	// Prefer invoking the resolved local CLI entry directly via bun. Falls
	// back to the bare `agentuity` command (resolved from node_modules/.bin at
	// build time) when the entry can't be resolved — e.g. the local CLI is
	// installed after detection by the self-heal path.
	const buildCommand = localCliEntry ? `bun ${localCliEntry} build` : 'agentuity build';

	return {
		name: 'agentuity-v2',
		version: spec.replace(/^[\^~]/, ''),
		runtime: 'bun',
		packageManager: 'bun',
		buildCommand,
		buildOutput: V2_OUTPUT_DIR,
		// The v2 build emits its client assets under `.agentuity/client`.
		staticDir: join(V2_OUTPUT_DIR, 'client'),
		startCommand: `bun ${join(V2_OUTPUT_DIR, 'app.js')}`,
		serverEntry: 'app.js',
		port: 3000,
		confidence: 'high',
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}
