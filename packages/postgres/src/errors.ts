import { StructuredError } from '@agentuity/core';

/**
 * Base error for PostgreSQL-related errors.
 */
export const PostgresError = StructuredError('PostgresError')<{
	code?: string;
	query?: string;
}>();

/**
 * Error thrown when attempting to use a closed connection.
 */
export const ConnectionClosedError = StructuredError('ConnectionClosedError')<{
	wasReconnecting?: boolean;
}>();

/**
 * Error thrown when reconnection fails after all attempts.
 */
export const ReconnectFailedError = StructuredError(
	'ReconnectFailedError',
	'Failed to reconnect after maximum attempts'
)<{
	attempts: number;
	lastError?: Error;
}>();

/**
 * Error thrown when a query times out.
 */
export const QueryTimeoutError = StructuredError('QueryTimeoutError', 'Query timed out')<{
	timeoutMs: number;
	query?: string;
}>();

/**
 * Error thrown when a transaction fails.
 */
export const TransactionError = StructuredError('TransactionError')<{
	phase?: 'begin' | 'commit' | 'rollback' | 'savepoint' | 'query';
}>();

/**
 * Error thrown when an operation is not supported.
 */
export const UnsupportedOperationError = StructuredError(
	'UnsupportedOperationError',
	'This operation is not supported'
)<{
	operation: string;
	reason?: string;
}>();

/**
 * Error codes that indicate a retryable connection error.
 */
const RETRYABLE_ERROR_CODES = new Set([
	// Bun SQL specific
	'ERR_POSTGRES_CONNECTION_CLOSED',
	'ERR_POSTGRES_CONNECTION_TIMEOUT',

	// Node.js / system errors
	'ECONNRESET',
	'ECONNREFUSED',
	'ETIMEDOUT',
	'EPIPE',
	'ENOTFOUND',
	'ENETUNREACH',
	'EHOSTUNREACH',
	'EAI_AGAIN',

	// PostgreSQL error codes
	'57P01', // admin_shutdown
	'57P02', // crash_shutdown
	'57P03', // cannot_connect_now
	'08000', // connection_exception
	'08003', // connection_does_not_exist
	'08006', // connection_failure
	'08001', // sqlclient_unable_to_establish_sqlconnection
	'08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

/**
 * Error messages that indicate a retryable connection error.
 */
const RETRYABLE_ERROR_MESSAGES = [
	'connection closed',
	'connection terminated',
	'connection reset',
	'connection refused',
	'connection timed out',
	'socket hang up',
	'read ECONNRESET',
	'write EPIPE',
	'getaddrinfo',
	'ENOTFOUND',
	'network is unreachable',
	'no route to host',
	'server closed the connection unexpectedly',
	'terminating connection due to administrator command',
	'the database system is shutting down',
	'the database system is starting up',
	'the database system is in recovery mode',
	'failed to read',
	'failed to write',
	'broken pipe',
	'end of file',
	'eof',
];

/**
 * Determines if an error is retryable (i.e., a reconnection should be attempted).
 *
 * @param error - The error to check
 * @returns `true` if the error indicates a connection issue that may be resolved by reconnecting
 */
export function isRetryableError(error: unknown): boolean {
	if (!error) {
		return false;
	}

	// Check error code
	if (typeof error === 'object' && error !== null) {
		const err = error as Record<string, unknown>;

		// Check 'code' property
		if (typeof err.code === 'string' && RETRYABLE_ERROR_CODES.has(err.code)) {
			return true;
		}

		// Check 'errno' property (Node.js style)
		if (typeof err.errno === 'string' && RETRYABLE_ERROR_CODES.has(err.errno)) {
			return true;
		}

		// Check nested cause
		if (err.cause && isRetryableError(err.cause)) {
			return true;
		}
	}

	// Check error message
	const message = error instanceof Error ? error.message : String(error);
	const lowerMessage = message.toLowerCase();

	for (const pattern of RETRYABLE_ERROR_MESSAGES) {
		if (lowerMessage.includes(pattern.toLowerCase())) {
			return true;
		}
	}

	return false;
}
