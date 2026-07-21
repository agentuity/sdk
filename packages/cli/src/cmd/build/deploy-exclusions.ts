/**
 * Canonical deploy exclusion policy.
 *
 * Staging (monorepo copy) and zip packaging both consume these rules so
 * safety skips cannot drift between layers.
 */

/** Basename for `--pack-only` output; also excluded if nested in staging. */
export const DEPLOY_PACK_ZIP_BASENAME = 'agentuity-deploy.zip';

/**
 * Hardcoded basenames always skipped during monorepo staging, at any
 * depth. Cannot be re-included via negation patterns.
 */
export const ALWAYS_SKIP_BASENAMES = new Set([
	'node_modules',
	'.git',
	'.ssh',
	'.vite',
	'.agentuity',
	'.DS_Store',
]);

/**
 * Built-in gitignore-style patterns always applied during monorepo
 * staging (in addition to {@link ALWAYS_SKIP_BASENAMES}).
 */
export const ALWAYS_IGNORE_PATTERNS: readonly string[] = [
	// Secrets — also guarded by the `.env` basename prefix check.
	'.env',
	'.env.*',
	// Local pack-only artifact from `agentuity deploy --pack-only`.
	DEPLOY_PACK_ZIP_BASENAME,
];

/**
 * True for env files we never ship: `.env` or `.env.<suffix>`
 * (e.g. `.env.local`). Does not match `.envrc` or `.environment`.
 */
export function isEnvBasename(segment: string): boolean {
	return segment === '.env' || segment.startsWith('.env.');
}

/** True when a single path segment must never ship (any depth). */
export function isAlwaysSkippedSegment(segment: string): boolean {
	if (ALWAYS_SKIP_BASENAMES.has(segment)) return true;
	if (isEnvBasename(segment)) return true;
	return false;
}

/**
 * Path-segment filter for every entry going into the deploy zip.
 * `rel` is posix-style, relative to the staging dir.
 *
 * Staging already drops the user's `node_modules`; adapters may
 * intentionally place traced runtime `node_modules` in staging, so we
 * do not drop that name here.
 *
 * Defensively rejects: `.git`, `.ssh`, `.vite`, `.DS_Store`, `.agentuity`,
 * `.env` / `.env.<suffix>`, and pack-only zip artifacts at any depth.
 */
export function deployZipFilter(_filename: string, rel: string): boolean {
	const segments = rel.split('/');
	for (const segment of segments) {
		if (
			segment === '.git' ||
			segment === '.ssh' ||
			segment === '.vite' ||
			segment === '.DS_Store' ||
			segment === '.agentuity'
		) {
			return false;
		}
	}
	const base = segments[segments.length - 1];
	if (!base) return true;
	if (isEnvBasename(base)) return false;
	if (base === DEPLOY_PACK_ZIP_BASENAME) return false;
	return true;
}
