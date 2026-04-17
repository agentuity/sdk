/**
 * Vite plugin that enforces the Vite asset convention for `src/web/` code.
 *
 * ## What the convention is
 *
 * Vite has two ways to reference static assets:
 *
 *   1. **Import the asset**: `import fooUrl from './foo.svg'`.
 *      Vite emits a content-hashed file and replaces the import with the
 *      final URL (CDN URL when `--base` is set). This is the correct form
 *      for any asset referenced from JS/TSX.
 *
 *   2. **`publicDir` files referenced from HTML/CSS**: files in
 *      `src/web/public/foo.svg` are served at the root URL `/foo.svg`.
 *      Vite rewrites root paths inside HTML attributes and CSS `url(...)`
 *      to the configured `--base`, so `<img src="/foo.svg">` in
 *      `index.html` becomes `https://cdn.../client/foo.svg` in production.
 *      Vite does **not** rewrite string literals in JS with this prefix.
 *
 * ## Anti-patterns this plugin errors on
 *
 * Neither of the legacy Agentuity conventions below are valid Vite input
 * and they silently break in production (strings are never base-rewritten
 * and the origin does not serve `/public/*`):
 *
 *   - `'/public/foo.svg'`  — the `/public/` prefix is an Agentuity v1
 *     convention. In v2 Vite serves the publicDir at the root, so the
 *     correct path is `/foo.svg` (or better, `import fooUrl from …`).
 *   - `'./public/foo.svg'` — same issue.
 *   - `'src/web/public/foo.svg'` (and `'/src/web/public/...'`) — always
 *     wrong. Source tree paths are not URLs.
 *
 * The plugin raises a build error for these patterns in any file under
 * `src/web/`, in both dev (`vite serve`) and build (`vite build`). It
 * does not transform code; the user is expected to update the source.
 *
 * ## Remediation printed to the user
 *
 * Every error includes the recommended fix:
 *
 *   - For assets in `src/web/public/`: use the root path (`/foo.svg`) in
 *     HTML / CSS, or import the file directly in JS.
 *   - For assets elsewhere in `src/web/`: import them with a relative or
 *     aliased path (`import fooUrl from '@/assets/foo.svg'`).
 */

import type { Plugin } from 'vite';

export interface PublicAssetPathPluginOptions {
	/**
	 * When `true`, lint violations are reported as Vite build errors (fail the
	 * build). When `false`, they are reported as warnings. Defaults to `true`
	 * in `vite build` and `false` in `vite serve` so developers see a loud
	 * warning as they type without blocking HMR.
	 */
	errorOnViolation?: boolean;
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
			regex: /url\(\/public\//g,
			description: 'url(/public/…)',
			fix: "drop the '/public/' prefix — Vite serves src/web/public/ at root, so 'url(/foo.svg)' is correct",
		},
		{
			regex: /url\(\.\/public\//g,
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
	const header = `Incorrect Vite public-asset path(s) in ${id}:`;
	const body = hits.map((h) => `  - ${h.description} — ${h.fix}`).join('\n');
	const trailer =
		'\nSee https://vitejs.dev/guide/assets for the recommended Vite asset conventions.';
	return `${header}\n${body}${trailer}`;
}

export function publicAssetPathPlugin(options: PublicAssetPathPluginOptions = {}): Plugin {
	// Track per-file diagnostics so we do not re-report the same violations on
	// every HMR update in dev mode.
	const reportedFiles = new Map<string, Set<string>>();

	// Resolved at configResolved time so the behaviour can differ between
	// `vite serve` and `vite build` without the caller having to pass a flag.
	let errorOnViolation = options.errorOnViolation ?? true;

	return {
		name: 'agentuity:public-asset-path-lint',

		configResolved(config) {
			if (options.errorOnViolation === undefined) {
				errorOnViolation = config.command === 'build';
			}
		},

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

			if (hits.length === 0) return null;

			// Deduplicate reports per file: only report a pattern the first time
			// we see it in this file. This matters in dev (HMR reloads call
			// transform() repeatedly) and is harmless in build mode.
			const previously = reportedFiles.get(id) ?? new Set<string>();
			const fresh = hits.filter((h) => !previously.has(h.description));
			if (fresh.length === 0) return null;
			for (const h of fresh) previously.add(h.description);
			reportedFiles.set(id, previously);

			const message = formatDiagnostic(id, fresh);
			if (errorOnViolation) {
				// `this.error` aborts the build with a pointer to the offending
				// file. In dev this surfaces as an overlay in the browser.
				this.error(message);
			} else {
				this.warn(message);
			}
			return null;
		},
	};
}
