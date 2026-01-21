import { StructuredError } from '@agentuity/core';
import type { EventEmitter } from 'node:events';

interface WritableWithDrain extends EventEmitter {
	write(chunk: Uint8Array): boolean;
}

/**
 * Machine-readable error codes for sandbox operations.
 * These codes allow programmatic error handling without fragile string matching.
 */
export type SandboxErrorCode =
	| 'SANDBOX_NOT_FOUND'
	| 'SANDBOX_TERMINATED'
	| 'EXECUTION_NOT_FOUND'
	| 'EXECUTION_TIMEOUT'
	| 'EXECUTION_CANCELLED'
	| 'SNAPSHOT_NOT_FOUND';

/**
 * Error thrown when a sandbox API request fails.
 *
 * Includes optional context about which sandbox or execution caused the error.
 */
export const SandboxResponseError = StructuredError('SandboxResponseError')<{
	/** The sandbox ID associated with the error, if applicable */
	sandboxId?: string;
	/** The execution ID associated with the error, if applicable */
	executionId?: string;
	/** The session ID (trace ID) from the x-session-id response header for OTel correlation */
	sessionId?: string | null;
	/** Machine-readable error code for programmatic error handling */
	code?: SandboxErrorCode;
}>();

/**
 * Error thrown when a sandbox is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await sandboxGet(client, { sandboxId: 'non-existent' });
 * } catch (error) {
 *   if (error._tag === 'SandboxNotFoundError') {
 *     console.error(`Sandbox not found: ${error.sandboxId}`);
 *   }
 * }
 * ```
 */
export const SandboxNotFoundError = StructuredError('SandboxNotFoundError')<{
	sandboxId: string;
}>();

/**
 * Error thrown when a sandbox has already terminated.
 *
 * @example
 * ```typescript
 * try {
 *   await sandboxExecute(client, { sandboxId: 'terminated-sandbox', command: ['ls'] });
 * } catch (error) {
 *   if (error._tag === 'SandboxTerminatedError') {
 *     console.error(`Sandbox terminated: ${error.sandboxId}`);
 *   }
 * }
 * ```
 */
export const SandboxTerminatedError = StructuredError('SandboxTerminatedError')<{
	sandboxId: string;
}>();

/**
 * Error thrown when an execution is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await executionGet(client, { executionId: 'non-existent' });
 * } catch (error) {
 *   if (error._tag === 'ExecutionNotFoundError') {
 *     console.error(`Execution not found: ${error.executionId}`);
 *   }
 * }
 * ```
 */
export const ExecutionNotFoundError = StructuredError('ExecutionNotFoundError')<{
	executionId: string;
	sandboxId?: string;
}>();

/**
 * Error thrown when an execution times out.
 *
 * @example
 * ```typescript
 * try {
 *   await sandboxExecute(client, { sandboxId, command: ['long-running'], timeout: '30s' });
 * } catch (error) {
 *   if (error._tag === 'ExecutionTimeoutError') {
 *     console.error('Execution timed out');
 *   }
 * }
 * ```
 */
export const ExecutionTimeoutError = StructuredError('ExecutionTimeoutError')<{
	executionId?: string;
	sandboxId?: string;
}>();

/**
 * Error thrown when an execution is cancelled.
 *
 * @example
 * ```typescript
 * try {
 *   await sandboxRun(client, params, { signal: controller.signal });
 * } catch (error) {
 *   if (error._tag === 'ExecutionCancelledError') {
 *     console.error('Execution was cancelled');
 *   }
 * }
 * ```
 */
export const ExecutionCancelledError = StructuredError('ExecutionCancelledError')<{
	sandboxId?: string;
}>();

/**
 * Error thrown when a snapshot is not found.
 *
 * @example
 * ```typescript
 * try {
 *   await snapshotGet(client, { snapshotId: 'non-existent' });
 * } catch (error) {
 *   if (error._tag === 'SnapshotNotFoundError') {
 *     console.error(`Snapshot not found: ${error.snapshotId}`);
 *   }
 * }
 * ```
 */
export const SnapshotNotFoundError = StructuredError('SnapshotNotFoundError')<{
	snapshotId?: string;
}>();

/**
 * Context for throwing sandbox errors.
 */
export interface SandboxErrorContext {
	sandboxId?: string;
	executionId?: string;
	sessionId?: string | null;
	snapshotId?: string;
}

/**
 * Throws the appropriate sandbox error based on the response code.
 *
 * This helper centralizes error mapping logic, throwing specific error types
 * when the backend returns a known error code, and falling back to
 * SandboxResponseError for unknown codes.
 *
 * @param resp - The API response containing message and optional code
 * @param context - Context about the operation (sandbox ID, execution ID, etc.)
 * @throws {SandboxNotFoundError} When code is 'SANDBOX_NOT_FOUND'
 * @throws {SandboxTerminatedError} When code is 'SANDBOX_TERMINATED'
 * @throws {ExecutionNotFoundError} When code is 'EXECUTION_NOT_FOUND'
 * @throws {ExecutionTimeoutError} When code is 'EXECUTION_TIMEOUT'
 * @throws {ExecutionCancelledError} When code is 'EXECUTION_CANCELLED'
 * @throws {SnapshotNotFoundError} When code is 'SNAPSHOT_NOT_FOUND'
 * @throws {SandboxResponseError} For unknown codes or when no code is provided
 */
export function throwSandboxError(
	resp: { message?: string; code?: string },
	context: SandboxErrorContext
): never {
	const { sandboxId, executionId, sessionId, snapshotId } = context;
	const code = resp.code as SandboxErrorCode | undefined;

	switch (code) {
		case 'SANDBOX_NOT_FOUND':
			throw new SandboxNotFoundError({ message: resp.message, sandboxId: sandboxId ?? '' });
		case 'SANDBOX_TERMINATED':
			throw new SandboxTerminatedError({ message: resp.message, sandboxId: sandboxId ?? '' });
		case 'EXECUTION_NOT_FOUND':
			throw new ExecutionNotFoundError({
				message: resp.message,
				executionId: executionId ?? '',
				sandboxId,
			});
		case 'EXECUTION_TIMEOUT':
			throw new ExecutionTimeoutError({ message: resp.message, executionId, sandboxId });
		case 'EXECUTION_CANCELLED':
			throw new ExecutionCancelledError({ message: resp.message, sandboxId });
		case 'SNAPSHOT_NOT_FOUND':
			throw new SnapshotNotFoundError({ message: resp.message, snapshotId });
		default:
			throw new SandboxResponseError({ message: resp.message, sandboxId, executionId, sessionId, code });
	}
}

/** Current sandbox API version */
export const API_VERSION = '2025-03-17';

/**
 * Write a chunk to a writable stream and wait for it to drain if necessary.
 * Properly cleans up event listeners to avoid memory leaks.
 */
export function writeAndDrain(writable: WritableWithDrain, chunk: Uint8Array): Promise<void> {
	return new Promise((resolve, reject) => {
		let needsDrain: boolean;
		try {
			needsDrain = !writable.write(chunk);
		} catch (err) {
			reject(err);
			return;
		}
		if (needsDrain) {
			const cleanup = () => {
				writable.removeListener('drain', onDrain);
				writable.removeListener('error', onError);
			};
			const onDrain = () => {
				cleanup();
				resolve();
			};
			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};
			writable.once('drain', onDrain);
			writable.once('error', onError);
		} else {
			resolve();
		}
	});
}
