/**
 * Runtime detection for @agentuity/local
 *
 * Detects the current JavaScript runtime and provides
 * appropriate local storage implementations.
 */

export type Runtime = 'bun' | 'node' | 'deno' | 'workers' | 'unknown';

/**
 * Detect the current runtime environment.
 */
export function detectRuntime(): Runtime {
	// Bun has a global Bun object
	if (typeof (globalThis as any).Bun !== 'undefined') {
		return 'bun';
	}

	// Deno has a global Deno object
	if (typeof (globalThis as any).Deno !== 'undefined') {
		return 'deno';
	}

	// Cloudflare Workers have caches.default
	if (
		typeof (globalThis as any).caches !== 'undefined' &&
		'default' in (globalThis as any).caches
	) {
		return 'workers';
	}

	// Node.js has process.versions.node
	if (
		typeof (globalThis as any).process !== 'undefined' &&
		(globalThis as any).process?.versions?.node
	) {
		return 'node';
	}

	return 'unknown';
}

/**
 * Check if local services are available for the current runtime.
 */
export function isLocalAvailable(): boolean {
	const runtime = detectRuntime();
	return runtime === 'bun'; // Only Bun is supported for now
}

/**
 * Get the current runtime name for logging.
 */
export function getRuntimeName(): string {
	return detectRuntime();
}
