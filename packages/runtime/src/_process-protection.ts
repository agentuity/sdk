/**
 * Process protection utilities
 *
 * Prevents user code from calling process.exit() which would crash the server.
 * The runtime can still exit gracefully using the internal exit function.
 */

import { StructuredError } from '@agentuity/core';

// Store the original process.exit ONLY if not already stored.
// This is critical for hot reload scenarios where this module may be re-imported
// multiple times. We must capture the truly original process.exit, not a previously
// wrapped version.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const existingOriginalExit = (globalThis as any).__AGENTUITY_ORIGINAL_PROCESS_EXIT__;
const originalExit: (code?: number) => never = existingOriginalExit ?? process.exit.bind(process);
// Store it globally so subsequent imports get the same original
if (!existingOriginalExit) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__AGENTUITY_ORIGINAL_PROCESS_EXIT__ = originalExit;
}

// Flag to track if protection is enabled
let protectionEnabled = false;

const ProcessExitAttemptError = StructuredError(
	'ProcessExitAttemptError',
	'Calling process.exit() is not allowed in agent code. The server must remain running to handle requests.'
)<{
	code?: number | string | null | undefined;
}>();

/**
 * Enable protection against process.exit calls.
 * After calling this, user code calling process.exit() will throw an error.
 */
export function enableProcessExitProtection(): void {
	if (protectionEnabled) {
		return;
	}

	protectionEnabled = true;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).AGENTUITY_PROCESS_EXIT = originalExit;

	// Replace process.exit with a function that throws
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(process as any).exit = function (code?: number | string | null | undefined): never {
		throw new ProcessExitAttemptError({ code });
	};
}

/**
 * Disable protection (mainly for testing)
 */
export function disableProcessExitProtection(): void {
	if (!protectionEnabled) {
		return;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).AGENTUITY_PROCESS_EXIT = undefined;

	protectionEnabled = false;
	process.exit = originalExit;
}

/**
 * Internal function for the runtime to call when it needs to exit.
 * This bypasses the protection and calls the original process.exit.
 */
export function internalExit(code?: number): never {
	return originalExit(code);
}

/**
 * Check if protection is currently enabled
 */
export function isProtectionEnabled(): boolean {
	return protectionEnabled;
}
