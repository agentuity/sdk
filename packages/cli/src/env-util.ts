/**
 * Utility functions for handling .env files
 */

import { join } from 'node:path';

export interface EnvVars {
	[key: string]: string;
}

/**
 * Find the appropriate .env file to use for user environment variables.
 * Always returns .env.production path (will be created if needed).
 * .env should only contain AGENTUITY_SDK_KEY.
 */
export async function findEnvFile(dir: string): Promise<string> {
	return join(dir, '.env.production');
}

/**
 * Find an existing env file for reading.
 * Preference: .env.production > .env
 */
export async function findExistingEnvFile(dir: string): Promise<string> {
	const productionEnv = join(dir, '.env.production');
	const defaultEnv = join(dir, '.env');

	if (await Bun.file(productionEnv).exists()) {
		return productionEnv;
	}

	return defaultEnv;
}

/**
 * Parse a single line from an .env file
 * Handles comments, empty lines, and quoted values
 */
export function parseEnvLine(line: string): { key: string; value: string } | null {
	const trimmed = line.trim();

	// Skip empty lines and comments
	if (!trimmed || trimmed.startsWith('#')) {
		return null;
	}

	const equalIndex = trimmed.indexOf('=');
	if (equalIndex === -1) {
		return null;
	}

	const key = trimmed.slice(0, equalIndex).trim();
	let value = trimmed.slice(equalIndex + 1).trim();

	// Remove surrounding quotes if present
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return { key, value };
}

/**
 * Read and parse an .env file
 */
export async function readEnvFile(path: string): Promise<EnvVars> {
	const file = Bun.file(path);

	if (!(await file.exists())) {
		return {};
	}

	const content = await file.text();
	const lines = content.split('\n');
	const env: EnvVars = {};

	for (const line of lines) {
		const parsed = parseEnvLine(line);
		if (parsed) {
			env[parsed.key] = parsed.value;
		}
	}

	return env;
}

/**
 * Write environment variables to an .env file
 * Optionally skip certain keys (like AGENTUITY_SDK_KEY)
 */
export async function writeEnvFile(
	path: string,
	vars: EnvVars,
	options?: {
		skipKeys?: string[];
		addComment?: (key: string) => string | null;
	}
): Promise<void> {
	const skipKeys = options?.skipKeys || [];
	const lines: string[] = [];

	// Sort keys for consistent output
	const sortedKeys = Object.keys(vars).sort();

	for (const key of sortedKeys) {
		if (skipKeys.includes(key)) {
			continue;
		}

		const value = vars[key];

		// Add comment if provided
		if (options?.addComment) {
			const comment = options.addComment(key);
			if (comment) {
				lines.push(`# ${comment}`);
			}
		}

		// Write key=value
		lines.push(`${key}=${value}`);
	}

	const content = lines.join('\n') + '\n';
	await Bun.write(path, content);
}

/**
 * Merge environment variables with special handling
 * - Later values override earlier values
 * - Can filter out keys (like AGENTUITY_* keys)
 */
export function mergeEnvVars(
	base: EnvVars,
	updates: EnvVars,
	options?: {
		filterPrefix?: string;
	}
): EnvVars {
	const merged = { ...base };
	const filterPrefix = options?.filterPrefix;

	for (const [key, value] of Object.entries(updates)) {
		// Skip keys with filter prefix if specified
		if (filterPrefix && key.startsWith(filterPrefix)) {
			continue;
		}

		merged[key] = value;
	}

	return merged;
}

/**
 * Filter out AGENTUITY_ prefixed keys from env vars
 * This is used when pushing to the cloud to avoid sending SDK keys
 */
export function filterAgentuitySdkKeys(vars: EnvVars): EnvVars {
	const filtered: EnvVars = {};

	for (const [key, value] of Object.entries(vars)) {
		if (!key.startsWith('AGENTUITY_')) {
			filtered[key] = value;
		}
	}

	return filtered;
}

/**
 * Split env vars into env and secrets based on key names
 * Convention: Keys ending with _SECRET, _KEY, _TOKEN, _PASSWORD are secrets
 */
export function splitEnvAndSecrets(vars: EnvVars): {
	env: EnvVars;
	secrets: EnvVars;
} {
	const env: EnvVars = {};
	const secrets: EnvVars = {};

	const secretSuffixes = ['_SECRET', '_KEY', '_TOKEN', '_PASSWORD', '_PRIVATE'];

	for (const [key, value] of Object.entries(vars)) {
		// Skip AGENTUITY_ prefixed keys
		if (key.startsWith('AGENTUITY_')) {
			continue;
		}

		const isSecret = secretSuffixes.some((suffix) => key.endsWith(suffix));

		if (isSecret) {
			secrets[key] = value;
		} else {
			env[key] = value;
		}
	}

	return { env, secrets };
}

/**
 * Mask a secret value for display
 */
export function maskSecret(value: string): string {
	if (!value) {
		return '';
	}

	if (value.length <= 8) {
		return '***';
	}

	// Show first 4 and last 4 characters
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Detect if a key or value looks like it should be a secret
 */
export function looksLikeSecret(key: string, value: string): boolean {
	// Check key name for secret-like patterns
	const secretKeyPatterns = [
		/_SECRET$/i,
		/_KEY$/i,
		/_TOKEN$/i,
		/_PASSWORD$/i,
		/_PRIVATE$/i,
		/_CERT$/i,
		/_CERTIFICATE$/i,
		/^SECRET_/i,
		/^API_?KEY/i,
		/^JWT/i,
		/PASSWORD/i,
		/CREDENTIAL/i,
		/AUTH.*KEY/i,
	];

	const keyLooksSecret = secretKeyPatterns.some((pattern) => pattern.test(key));
	if (keyLooksSecret) {
		return true;
	}

	// Check value for secret-like patterns
	if (!value || value.length < 8) {
		return false;
	}

	// JWT pattern (header.payload.signature)
	if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
		return true;
	}

	// Bearer token pattern
	if (/^Bearer\s+[A-Za-z0-9_-]{20,}$/i.test(value)) {
		return true;
	}

	// AWS/Cloud provider key patterns
	if (/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(value)) {
		// AWS access key
		return true;
	}

	// GitHub token patterns
	if (/^gh[ps]_[A-Za-z0-9_]{36,}$/.test(value)) {
		return true;
	}

	// Generic long alphanumeric strings (likely API keys)
	// Exclude UUIDs (8-4-4-4-12 format) and simple alphanumeric IDs
	const isUUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
	if (!isUUID && /^[A-Za-z0-9_-]{32,}$/.test(value) && !/^[0-9]+$/.test(value)) {
		return true;
	}

	// PEM-encoded certificates or private keys
	if (
		value.includes('BEGIN CERTIFICATE') ||
		value.includes('BEGIN PRIVATE KEY') ||
		value.includes('BEGIN RSA PRIVATE KEY')
	) {
		return true;
	}

	return false;
}
