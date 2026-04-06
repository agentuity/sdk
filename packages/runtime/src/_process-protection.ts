/**
 * Process protection utilities
 *
 * Prevents user code from calling process.exit() which would crash the server.
 * The runtime can still exit gracefully using the internal exit function.
 *
 * Uses _globals.ts Symbol.for() accessors to store state across hot reloads.
 */

import { StructuredError } from '@agentuity/core';
import {
	originalProcessExit as exitGlobal,
	processExitProtected as protectedGlobal,
} from './_globals';

// Capture the original process.exit ONLY if not already stored.
// Critical for hot reload: we must capture the truly original, not a wrapped version.
const existingExit = exitGlobal.get();
const originalExit: (code?: number) => never = existingExit ?? process.exit.bind(process);
if (!existingExit) {
	exitGlobal.set(originalExit);
}

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
	if (protectedGlobal.get()) {
		return;
	}
	protectedGlobal.set(true);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(process as any).exit = (code?: number | string | null | undefined): never => {
		throw new ProcessExitAttemptError({ code });
	};
}

/**
 * Disable protection (mainly for testing)
 */
export function disableProcessExitProtection(): void {
	if (!protectedGlobal.get()) {
		return;
	}
	protectedGlobal.set(false);
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
	return protectedGlobal.get();
}
