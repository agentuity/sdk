import { StructuredError } from '../../error.ts';
import type { EventEmitter } from 'node:events';
import { z } from 'zod';

interface WritableWithDrain extends EventEmitter {
	write(chunk: Uint8Array): boolean;
}

/**
 * Machine-readable error codes for sandbox operations.
 * These codes allow programmatic error handling without fragile string matching.
 */
export const SandboxErrorCodeSchema = z.enum([
	'SANDBOX_NOT_FOUND',
	'SANDBOX_TERMINATED',
	'SANDBOX_BUSY',
	'EXECUTION_NOT_FOUND',
	'EXECUTION_TIMEOUT',
	'EXECUTION_CANCELLED',
	'SNAPSHOT_NOT_FOUND',
]);
export type SandboxErrorCode = z.infer<typeof SandboxErrorCodeSchema>;

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
 * Error thrown when a sandbox is currently busy executing another command.
 *
 * This typically occurs when a second execute request is sent before the
 * previous execution has completed. Sandbox executions are serialized -
 * wait for the current execution to complete before sending a new one.
 *
 * @example
 * ```typescript
 * try {
 *   await sandbox.execute({ command: ['ls'] });
 * } catch (error) {
 *   if (error._tag === 'SandboxBusyError') {
 *     console.error('Sandbox is busy, waiting for current execution to finish');
 *     // Wait and retry, or use executionGet with long-polling to wait for completion
 *   }
 * }
 * ```
 */
export const SandboxBusyError = StructuredError('SandboxBusyError')<{
	sandboxId?: string;
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
export const SandboxErrorContextSchema = z.object({
	sandboxId: z.string().optional().describe('sandbox id'),
	executionId: z.string().optional().describe('execution id'),
	jobId: z.string().optional().describe('job id'),
	sessionId: z.string().nullish().describe('session id'),
	snapshotId: z.string().optional().describe('snapshot id'),
});
export type SandboxErrorContext = z.infer<typeof SandboxErrorContextSchema>;

/**
 * Throws the appropriate sandbox error based on the response code.
 *
 * This helper centralizes error mapping logic, throwing specific error types
 * when the backend returns a known error code, and falling back to
 * SandboxResponseError for unknown codes.
 *
 * Note: Pause and resume operations use standard error codes. The backend
 * returns SANDBOX_NOT_FOUND when the sandbox doesn't exist, and HTTP 409
 * Conflict (handled by APIClient retries) for invalid state transitions
 * (e.g. pausing a non-running sandbox, resuming a non-suspended sandbox).
 * No additional error codes are needed for pause/resume.
 *
 * @param resp - The API response containing message and optional code
 * @param context - Context about the operation (sandbox ID, execution ID, etc.)
 * @throws {SandboxNotFoundError} When code is 'SANDBOX_NOT_FOUND'
 * @throws {SandboxTerminatedError} When code is 'SANDBOX_TERMINATED'
 * @throws {SandboxBusyError} When code is 'SANDBOX_BUSY'
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
		case 'SANDBOX_BUSY':
			throw new SandboxBusyError({ message: resp.message, sandboxId });
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
			throw new SandboxResponseError({
				message: resp.message,
				sandboxId,
				executionId,
				sessionId,
				code,
			});
	}
}

/** Current sandbox API version */

/** Maximum server-side wait for sandbox status long-polls (Catalyst caps at 60s). */
export const SANDBOX_STATUS_WAIT_MS = 60_000;

/** Default sandbox execution timeout when none is specified (matches Catalyst). */
export const DEFAULT_SANDBOX_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;

/** Extra client wait after execution timeout for stream drain and exit-code propagation. */
export const SANDBOX_RUN_TEARDOWN_GRACE_MS = 15_000;

/** Sandbox lifecycle statuses that mean the run will not produce more output. */
export const TERMINAL_SANDBOX_STATUSES = ['idle', 'terminated', 'failed'] as const;

/** Execution statuses that mean the command will not run again. */
export const TERMINAL_EXECUTION_STATUSES = new Set(['completed', 'failed', 'timeout', 'cancelled']);

const DURATION_UNITS_MS: Record<string, number> = {
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
	w: 7 * 24 * 60 * 60 * 1000,
};

/** Parse a duration string such as `30s` or `5m` into milliseconds. */
export function parseDurationMs(duration: string): number {
	const match = duration.match(/^(\d+)([smhdw])$/);
	if (!match) {
		throw new Error(
			`Invalid duration format: "${duration}". Use a number followed by s, m, h, d, or w.`
		);
	}
	const value = parseInt(match[1]!, 10);
	const unit = match[2]!;
	const ms = DURATION_UNITS_MS[unit];
	if (!ms) {
		throw new Error(`Unknown duration unit: "${unit}"`);
	}
	return value * ms;
}

export function isTerminalSandboxStatus(status: string): boolean {
	return (TERMINAL_SANDBOX_STATUSES as readonly string[]).includes(status);
}

export function isTerminalExecutionStatus(status: string): boolean {
	return TERMINAL_EXECUTION_STATUSES.has(status);
}

export function sandboxStatusToRunResult(result: {
	status: string;
	exitCode?: number | null;
}): { exitCode?: number; status: string } | null {
	if (result.exitCode != null) {
		return { exitCode: result.exitCode, status: 'completed' };
	}
	if (result.status === 'failed') {
		return { exitCode: 1, status: 'failed' };
	}
	if (isTerminalSandboxStatus(result.status)) {
		return { status: 'completed' };
	}
	return null;
}

export function executionStatusToExitCode(
	status: string,
	exitCode?: number | null
): number | undefined {
	if (exitCode != null) {
		return exitCode;
	}
	switch (status) {
		case 'completed':
			return 0;
		case 'timeout':
			return 124;
		case 'failed':
		case 'cancelled':
			return 1;
		default:
			return undefined;
	}
}

/** Format remaining milliseconds as a Catalyst-compatible wait duration. */
export function formatWaitDuration(remainingMs: number): string {
	if (remainingMs <= 0) {
		return '0s';
	}
	const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
	return `${seconds}s`;
}

export function createRunAbortSignal(options: { userSignal?: AbortSignal; deadlineAt: number }): {
	signal: AbortSignal;
	cleanup: () => void;
	isRunTimeout: (reason: unknown) => boolean;
} {
	const controller = new AbortController();
	const cleanups: (() => void)[] = [];

	const scheduleTimeout = () => {
		const remainingMs = options.deadlineAt - Date.now();
		if (remainingMs <= 0) {
			controller.abort(new DOMException('Sandbox run timeout exceeded', 'TimeoutError'));
			return;
		}
		const timer = setTimeout(() => {
			controller.abort(new DOMException('Sandbox run timeout exceeded', 'TimeoutError'));
		}, remainingMs);
		cleanups.push(() => clearTimeout(timer));
	};

	scheduleTimeout();

	if (options.userSignal) {
		if (options.userSignal.aborted) {
			controller.abort(options.userSignal.reason);
		} else {
			const onAbort = () => controller.abort(options.userSignal!.reason);
			options.userSignal.addEventListener('abort', onAbort, { once: true });
			cleanups.push(() => options.userSignal!.removeEventListener('abort', onAbort));
		}
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		},
		isRunTimeout: (reason: unknown) =>
			reason instanceof DOMException && reason.name === 'TimeoutError',
	};
}

/**
 * Append Pulse v2 stream query params so readers use the sequenced download path
 * instead of falling back to legacy blob polling after complete/v2.
 */
export function pulseV2StreamUrl(url: string, options?: { follow?: boolean }): string {
	const fetchUrl = new URL(url);
	fetchUrl.searchParams.set('v', '2');
	if (options?.follow) {
		fetchUrl.searchParams.set('follow', 'true');
	}
	return fetchUrl.href;
}

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
