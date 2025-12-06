/**
 * Process protection utilities
 *
 * Prevents user code from calling process.exit() which would crash the server.
 * The runtime can still exit gracefully using the internal exit function.
 */

import { StructuredError } from '@agentuity/core';

// Store the original process.exit
const originalExit = process.exit.bind(process);

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
