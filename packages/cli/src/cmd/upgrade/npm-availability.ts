/**
 * npm registry availability checking utilities.
 * Used to verify a version is available on npm before attempting upgrade.
 */

const PACKAGE_SPEC = '@agentuity/cli';

/** Default timeout for install (`bun add -g`) subprocess calls (30 seconds) */
const INSTALL_TIMEOUT_MS = 30_000;

/**
 * Run a command via Bun.spawn with a timeout that kills the process.
 * Returns { exitCode, stdout, stderr } similar to Bun's $ shell result.
 */
export async function spawnWithTimeout(
	cmd: string[],
	options: { cwd?: string; timeout: number }
): Promise<{ exitCode: number; stdout: Buffer; stderr: Buffer }> {
	const proc = Bun.spawn(cmd, {
		cwd: options.cwd,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		proc.kill();
	}, options.timeout);

	try {
		const [exitCode, stdoutBytes, stderrBytes] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).arrayBuffer(),
			new Response(proc.stderr).arrayBuffer(),
		]);

		if (timedOut) {
			throw new Error(`Command timed out after ${options.timeout}ms: ${cmd.join(' ')}`);
		}

		return {
			exitCode,
			stdout: Buffer.from(stdoutBytes),
			stderr: Buffer.from(stderrBytes),
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Sentinel error thrown exclusively by withTimeout so the retry loop can
 * distinguish a genuine timeout from other failures (e.g. permission errors).
 */
class TimeoutError extends Error {
	constructor(description: string, timeoutMs: number) {
		super(`${description} timed out after ${timeoutMs}ms`);
		this.name = 'TimeoutError';
	}
}

/**
 * Race a promise against a timeout. Unlike spawnWithTimeout (which kills a process),
 * this is a generic wrapper for any async operation (e.g. the installFn callback).
 *
 * Throws a {@link TimeoutError} (not a plain Error) so callers can tell
 * timeouts apart from other exceptions.
 */
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	description: string
): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new TimeoutError(description, timeoutMs)), timeoutMs);
	});
	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timer!);
	}
}

/**
 * Check if a specific version of @agentuity/cli is available on the npm registry.
 *
 * @param version - Version to check (with or without 'v' prefix)
 * @returns true if version is available, false otherwise
 */
export async function isVersionAvailableOnNpm(
	version: string,
	options?: { timeoutMs?: number }
): Promise<boolean> {
	const normalizedVersion = version.replace(/^v/, '');
	const timeoutMs = options?.timeoutMs ?? 10_000;
	try {
		const response = await fetch(
			`https://registry.npmjs.org/${PACKAGE_SPEC}/${normalizedVersion}`,
			{ signal: AbortSignal.timeout(timeoutMs) }
		);
		if (!response.ok) return false;
		const info = (await response.json()) as { version?: string };
		return info.version === normalizedVersion;
	} catch {
		return false;
	}
}

/**
 * Quick check if a version is available on npm.
 * Used for implicit version checks (auto-upgrade flow).
 *
 * @param version - Version to check (with or without 'v' prefix)
 * @returns true if version is available, false if unavailable or error
 */
export async function isVersionAvailableOnNpmQuick(version: string): Promise<boolean> {
	return isVersionAvailableOnNpm(version, { timeoutMs: 1_000 });
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

/**
 * Patterns in bun's stderr that indicate a resolution/CDN propagation failure
 * (as opposed to a permanent install error like permissions or disk space).
 */
const RESOLUTION_ERROR_PATTERNS = [/failed to resolve/i, /no version matching/i];

/**
 * Check whether a bun install failure is a transient resolution error
 * caused by npm CDN propagation delays.
 */
export function isResolutionError(stderr: string): boolean {
	return RESOLUTION_ERROR_PATTERNS.some((pattern) => pattern.test(stderr));
}

export interface InstallWithRetryOptions {
	/** Maximum number of attempts including the first (default: 7 → 1 initial + 6 retries) */
	maxAttempts?: number;
	/** Initial delay in ms before the first retry (default: 5000) */
	initialDelayMs?: number;
	/** Maximum delay cap in ms (default: 30000) */
	maxDelayMs?: number;
	/** Multiplier applied to the delay after each retry (default: 2) */
	multiplier?: number;
	/** Callback invoked before each retry with the attempt number and upcoming delay */
	onRetry?: (attempt: number, delayMs: number) => void;
}

/**
 * Run an install function and retry on transient resolution errors with
 * exponential backoff. This covers the window (~2 min) where npm CDN nodes
 * have not yet propagated a newly-published version.
 *
 * Total wait with defaults: 5 + 10 + 20 + 30 + 30 + 30 = 125 s ≈ 2 min
 *
 * @param installFn - Async function that performs the install and returns exitCode + stderr
 * @param options - Retry configuration
 * @returns The successful result (exitCode 0)
 * @throws Error if all retries are exhausted or a non-resolution error occurs
 */
export async function installWithRetry(
	installFn: () => Promise<{ exitCode: number; stderr: Buffer }>,
	options: InstallWithRetryOptions = {}
): Promise<{ exitCode: number; stderr: Buffer }> {
	const {
		maxAttempts = 7,
		initialDelayMs = 5000,
		maxDelayMs = 30000,
		multiplier = 2,
		onRetry,
	} = options;

	let delay = initialDelayMs;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		let result: { exitCode: number; stderr: Buffer };
		try {
			result = await withTimeout(installFn(), INSTALL_TIMEOUT_MS, 'Install command');
		} catch (error) {
			// Only retry on timeouts — non-timeout errors (permissions, disk, etc.) are fatal
			if (!(error instanceof TimeoutError)) {
				throw error;
			}
			if (attempt === maxAttempts) {
				throw error;
			}
			onRetry?.(attempt, delay);
			await new Promise((resolve) => setTimeout(resolve, delay));
			delay = Math.min(Math.round(delay * multiplier), maxDelayMs);
			continue;
		}

		if (result.exitCode === 0) {
			return result;
		}

		const stderr = result.stderr.toString();

		// Only retry on resolution/propagation errors — bail immediately for anything else
		if (!isResolutionError(stderr)) {
			throw new Error(stderr);
		}

		// Last attempt exhausted — throw
		if (attempt === maxAttempts) {
			throw new Error(stderr);
		}

		onRetry?.(attempt, delay);
		await new Promise((resolve) => setTimeout(resolve, delay));
		delay = Math.min(Math.round(delay * multiplier), maxDelayMs);
	}

	// Unreachable, but satisfies TypeScript
	throw new Error('Install failed after retries');
}
