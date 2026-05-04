/**
 * Generates project-derived suggestions for resource names (DB / S3 bucket).
 *
 * The CLI shows these as a dim "press Enter to use ..." default in the create flow.
 * If the user presses Enter, the suggestion is sent to the server. Otherwise the
 * server is responsible for assigning a name when none is provided.
 *
 * Both suggestions are validated against the same rules the server enforces
 * (`validateBucketName` / `validateDatabaseName` from `@agentuity/server`) so the
 * happy path can never produce an invalid suggestion.
 */
import { validateBucketName, validateDatabaseName } from '@agentuity/server';

const BUCKET_MAX = 63;
const BUCKET_MIN = 3;
const DB_MAX = 63;

/** 3 lowercase alphanumeric chars, e.g. "k7p". */
function shortSuffix(): string {
	// toString(36) yields [0-9a-z]; slice 3 chars after the "0." prefix.
	const s = Math.random().toString(36).slice(2, 5);
	// Pad in the (extremely unlikely) case the slice is shorter than 3 chars.
	return s.length === 3 ? s : (s + '000').slice(0, 3);
}

/**
 * Sanitize a project name into the bucket-name alphabet:
 * - lowercase
 * - spaces / underscores / dots → hyphens
 * - drop anything else
 * - collapse and trim hyphens
 * - strip reserved prefixes (`agentuity*`, `ag-*`, `ago-*`, `xn--`)
 */
function sanitizeForBucket(name: string): string {
	let out = name
		.toLowerCase()
		.trim()
		.replace(/[\s_.]+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');

	// Strip reserved prefixes (rules from validateBucketName).
	while (
		out.startsWith('agentuity') ||
		out.startsWith('ag-') ||
		out.startsWith('ago-') ||
		out.startsWith('xn--')
	) {
		if (out.startsWith('agentuity')) out = out.slice('agentuity'.length);
		else if (out.startsWith('ago-')) out = out.slice('ago-'.length);
		else if (out.startsWith('ag-')) out = out.slice('ag-'.length);
		else if (out.startsWith('xn--')) out = out.slice('xn--'.length);
		out = out.replace(/^-+/, '');
	}
	return out;
}

/**
 * Sanitize a project name into the database-name alphabet:
 * - lowercase
 * - non `[a-z0-9_]` → `_`
 * - collapse and trim underscores
 * - ensure it starts with a letter or underscore (prepend `p_` otherwise)
 * - strip reserved `pg_` prefix
 */
function sanitizeForDatabase(name: string): string {
	let out = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');

	if (!/^[a-z_]/.test(out)) {
		out = out.length > 0 ? `p_${out}` : '';
	}
	while (out.startsWith('pg_')) {
		out = out.slice(3).replace(/^_+/, '');
		if (!/^[a-z_]/.test(out) && out.length > 0) out = `p_${out}`;
	}
	return out;
}

/**
 * Truncate so the final string (`<base>-<suffixWithDash>`) fits within `max` chars
 * while keeping the suffix intact and not ending on a hyphen.
 */
function truncateBaseHyphen(base: string, suffixWithDash: string, max: number): string {
	const room = max - suffixWithDash.length;
	if (room <= 0) return '';
	let out = base.slice(0, room);
	out = out.replace(/-+$/, '');
	return out;
}

/** Same as `truncateBaseHyphen` but for underscore-joined names (database). */
function truncateBaseUnderscore(base: string, suffixWithUnderscore: string, max: number): string {
	const room = max - suffixWithUnderscore.length;
	if (room <= 0) return '';
	let out = base.slice(0, room);
	out = out.replace(/_+$/, '');
	return out;
}

/**
 * Generate a suggested S3 bucket name derived from the project name.
 * Format: `<sanitized-project>-storage-<3char>` (≤ 63 chars).
 *
 * Falls back to `bucket-<3char><3char>` if the project name produces nothing usable.
 * Always returns a value that passes `validateBucketName`.
 */
export function suggestBucketName(projectName: string): string {
	const sanitized = sanitizeForBucket(projectName);

	// Try a few times in case sanitization + suffix happens to land on something invalid.
	for (let attempt = 0; attempt < 5; attempt++) {
		const suffix = `-storage-${shortSuffix()}`;
		const base = truncateBaseHyphen(sanitized, suffix, BUCKET_MAX);
		const candidate = base.length > 0 ? `${base}${suffix}` : `bucket${suffix}`;
		if (candidate.length >= BUCKET_MIN && validateBucketName(candidate).valid) {
			return candidate;
		}
	}

	// Pure fallback: short, always-valid generic name.
	const fallback = `bucket-${shortSuffix()}${shortSuffix()}`;
	return validateBucketName(fallback).valid ? fallback : `bucket-${shortSuffix()}aaa`;
}

/**
 * Generate a suggested PostgreSQL database name derived from the project name.
 * Format: `<sanitized-project>_db_<3char>` (≤ 63 chars).
 *
 * Falls back to `db_<3char><3char>` if the project name produces nothing usable.
 * Always returns a value that passes `validateDatabaseName`.
 */
export function suggestDatabaseName(projectName: string): string {
	const sanitized = sanitizeForDatabase(projectName);

	for (let attempt = 0; attempt < 5; attempt++) {
		const suffix = `_db_${shortSuffix()}`;
		const base = truncateBaseUnderscore(sanitized, suffix, DB_MAX);
		const candidate = base.length > 0 ? `${base}${suffix}` : `db${suffix}`;
		if (validateDatabaseName(candidate).valid) {
			return candidate;
		}
	}

	const fallback = `db_${shortSuffix()}${shortSuffix()}`;
	return validateDatabaseName(fallback).valid ? fallback : `db_${shortSuffix()}aaa`;
}
