/**
 * npm registry availability checking utilities.
 * Used to verify a version is available on npm before attempting upgrade.
 */

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const PACKAGE_NAME = '@agentuity/cli';

/** Default timeout for quick checks (implicit version check) */
const QUICK_CHECK_TIMEOUT_MS = 1000;

/** Default timeout for explicit upgrade command */
const EXPLICIT_CHECK_TIMEOUT_MS = 5000;

export interface CheckNpmOptions {
	/** Timeout in milliseconds (default: 5000 for explicit, 1000 for quick) */
	timeoutMs?: number;
}

/**
 * Check if a specific version of @agentuity/cli is available on npm registry.
 * Uses the npm registry API directly for faster response than `npm view`.
 *
 * @param version - Version to check (with or without 'v' prefix)
 * @param options - Optional configuration
 * @returns true if version is available, false otherwise
 */
export async function isVersionAvailableOnNpm(
	version: string,
	options: CheckNpmOptions = {}
): Promise<boolean> {
	const { timeoutMs = EXPLICIT_CHECK_TIMEOUT_MS } = options;
	const normalizedVersion = version.replace(/^v/, '');
	const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(PACKAGE_NAME)}/${normalizedVersion}`;

	try {
		const response = await fetch(url, {
			method: 'HEAD', // Only need to check existence, not full metadata
			signal: AbortSignal.timeout(timeoutMs),
			headers: {
				Accept: 'application/json',
			},
		});
		return response.ok;
	} catch {
		// Network error or timeout - assume not available
		return false;
	}
}

/**
 * Quick check if a version is available on npm with a short timeout.
 * Used for implicit version checks (auto-upgrade flow) to avoid blocking the user's command.
 *
 * @param version - Version to check (with or without 'v' prefix)
 * @returns true if version is available, false if unavailable or timeout
 */
export async function isVersionAvailableOnNpmQuick(version: string): Promise<boolean> {
	return isVersionAvailableOnNpm(version, { timeoutMs: QUICK_CHECK_TIMEOUT_MS });
}

export interface WaitForNpmOptions {
	/** Maximum number of attempts (default: 6) */
	maxAttempts?: number;
	/** Initial delay between attempts in ms (default: 2000) */
	initialDelayMs?: number;
	/** Maximum delay between attempts in ms (default: 10000) */
	maxDelayMs?: number;
	/** Callback called before each retry */
	onRetry?: (attempt: number, delayMs: number) => void;
}

/**
 * Wait for a version to become available on npm with exponential backoff.
 *
 * @param version - Version to wait for (with or without 'v' prefix)
 * @param options - Configuration options
 * @returns true if version became available, false if timed out
 */
export async function waitForNpmAvailability(
	version: string,
	options: WaitForNpmOptions = {}
): Promise<boolean> {
	const { maxAttempts = 6, initialDelayMs = 2000, maxDelayMs = 10000, onRetry } = options;

	// First check - no delay
	if (await isVersionAvailableOnNpm(version)) {
		return true;
	}

	// Retry with exponential backoff
	let delay = initialDelayMs;
	for (let attempt = 1; attempt < maxAttempts; attempt++) {
		onRetry?.(attempt, delay);
		await new Promise((resolve) => setTimeout(resolve, delay));

		if (await isVersionAvailableOnNpm(version)) {
			return true;
		}

		delay = Math.min(Math.round(delay * 1.5), maxDelayMs);
	}

	return false;
}
