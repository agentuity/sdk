/**
 * Vite plugin that warns about legacy Agentuity-v1 `/public/` asset paths
 * in `src/web/` source code.
 *
 * ## Vite asset conventions (the correct forms)
 *
 * 1. **Import the asset**: `import fooUrl from './foo.svg'`. Vite emits a
 *    content-hashed file and replaces the import with the final URL (CDN
 *    URL when `--base` is set). This is the correct form for any asset
 *    referenced from JS/TSX.
 *
 * 2. **`publicDir` root-served files**: files under `src/web/public/` are
 *    served at the URL root (`/foo.svg`, not `/public/foo.svg`). Vite
 *    rewrites root paths inside HTML attributes and CSS `url(...)` to the
 *    configured `--base`, so HTML/CSS references become CDN URLs in
 *    production. Root paths inside JS string literals are NOT rewritten by
 *    Vite — they resolve to the origin at runtime, which serves the
 *    publicDir as a fallback.
 *
 * ## Anti-patterns this plugin warns on
 *
 * The following don't work in production and indicate the author is still
 * thinking in the Agentuity v1 model:
 *
 *   - `'/public/foo.svg'` and `'./public/foo.svg'`
 *   - `'src/web/public/foo.svg'` (and `'/src/web/public/...'`)
 *   - CSS `url(/public/foo.svg)` and `url(./public/foo.svg)` (quoted,
 *     unquoted, and with optional whitespace inside the parentheses)
 *
 * The plugin emits a **warning** for each unique pattern encountered
 * (deduped per file) in both `vite serve` and `vite build`. It does not
 * transform code or fail the build — we rely on the warning being visible
 * in build output and the integration test in apps/testing/cloud-deployment
 * to catch cases where an unrewritten `/public/` reference slips through.
 */

import type { Plugin } from 'vite';

export interface PublicAssetPathPluginOptions {
	// Reserved for future use. Currently there are no options; the plugin
	// always emits warnings.
}

interface PathPattern {
	regex: RegExp;
	description: string;
	/** Human-readable fix suggestion rendered next to the pattern. */
	fix: string;
}

/**
 * Ordered so more specific patterns are reported first. The `src/web/public/`
 * variants are tested before the bare `/public/` forms to avoid reporting a
 * redundant hit for the trailing `/public/` substring.
 */
function createLintPatterns(): PathPattern[] {
	return [
		{
			regex: /(['"`])(?:\.?\/)?src\/web\/public\//g,
			description: 'src/web/public/',
			fix: "reference the file at its served root path ('/foo.svg') or import it ('import fooUrl from \"./foo.svg\"')",
		},
		{
			regex: /(['"`])\.\/public\//g,
			description: './public/',
			fix: "the '/public/' prefix is not served in production; use the root path ('/foo.svg') or an import",
		},
		{
			regex: /(['"`])\/public\//g,
			description: '/public/',
			fix: "the '/public/' prefix is not served in production; use the root path ('/foo.svg') or an import",
		},
		{
			// Also catch quoted/whitespace variants: url('/public/…'), url( "/public/…" ), etc.
			regex: /url\(\s*['"]?\/public\//g,
			description: 'url(/public/…)',
			fix: "drop the '/public/' prefix — Vite serves src/web/public/ at root, so 'url(/foo.svg)' is correct",
		},
		{
			// Also catch quoted/whitespace variants: url('./public/…'), url( "./public/…" ), etc.
			regex: /url\(\s*['"]?\.\/public\//g,
			description: 'url(./public/…)',
			fix: "drop the '/public/' prefix — Vite serves src/web/public/ at root, so 'url(/foo.svg)' is correct",
		},
	];
}

/**
 * Build a single diagnostic message for a file containing one or more
 * violations. The message lists each violation once; the user fixes the
 * file and re-runs.
 */
function formatDiagnostic(id: string, hits: { description: string; fix: string }[]): string {
	const header = `Legacy Agentuity public-asset path(s) in ${id}:`;
	const body = hits.map((h) => `  - ${h.description} — ${h.fix}`).join('\n');
	const trailer =
		'\nSee https://vitejs.dev/guide/assets for the recommended Vite asset conventions.';
	return `${header}\n${body}${trailer}`;
}

export function publicAssetPathPlugin(_options: PublicAssetPathPluginOptions = {}): Plugin {
	// Track per-file diagnostics so we do not re-report the same violations on
	// every HMR update in dev mode.
	const reportedFiles = new Map<string, Set<string>>();

	return {
		name: 'agentuity:public-asset-path-lint',

		transform(code, id) {
			// Only lint source files under src/web/. Node_modules, virtual
			// modules, and non-web source are out of scope.
			if (!id.includes('/src/web/') && !id.includes('\\src\\web\\')) {
				return null;
			}

			// Cheap substring precheck to avoid running the full pattern set on
			// every file (most files contain no public-dir references at all).
			if (
				!code.includes('src/web/public/') &&
				!code.includes('/public/') &&
				!code.includes('./public/')
			) {
				return null;
			}

			const patterns = createLintPatterns();
			const hits: { description: string; fix: string }[] = [];
			const seen = new Set<string>();

			for (const { regex, description, fix } of patterns) {
				// Fresh regex per file — global regex state leaks across exec()
				// calls otherwise.
				const re = new RegExp(regex.source, regex.flags);
				if (re.test(code) && !seen.has(description)) {
					hits.push({ description, fix });
					seen.add(description);
				}
			}

			// Deduplicate reports per file: only report a pattern the first time
			// we see it in this file. This matters in dev (HMR reloads call
			// transform() repeatedly) and is harmless in build mode.
			// Track only currently-present patterns so a file that becomes clean
			// and later regresses will warn again in the same dev session.
			if (hits.length === 0) {
				reportedFiles.delete(id);
				return null;
			}

			const previous = reportedFiles.get(id) ?? new Set<string>();
			const current = new Set(hits.map((h) => h.description));
			const fresh = hits.filter((h) => !previous.has(h.description));
			reportedFiles.set(id, current);
			if (fresh.length > 0) {
				this.warn(formatDiagnostic(id, fresh));
			}
			return null;
		},
	};
}
