import { describe, test, expect } from 'bun:test';
import {
	PostgresError,
	ConnectionClosedError,
	ReconnectFailedError,
	QueryTimeoutError,
	TransactionError,
	isRetryableError,
} from '../src/errors';

describe('error classes', () => {
	describe('PostgresError', () => {
		test('should have correct _tag', () => {
			const error = new PostgresError({ message: 'test error' });
			expect(error._tag).toBe('PostgresError');
		});

		test('should have correct message', () => {
			const error = new PostgresError({ message: 'Database error occurred' });
			expect(error.message).toBe('Database error occurred');
		});

		test('should store code property', () => {
			const error = new PostgresError({ message: 'test', code: '42P01' });
			expect(error.code).toBe('42P01');
		});

		test('should store query property', () => {
			const error = new PostgresError({
				message: 'test',
				query: 'SELECT * FROM users',
			});
			expect(error.query).toBe('SELECT * FROM users');
		});

		test('should be instanceof Error', () => {
			const error = new PostgresError({ message: 'test' });
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('ConnectionClosedError', () => {
		test('should have correct _tag', () => {
			const error = new ConnectionClosedError({ message: 'Connection closed' });
			expect(error._tag).toBe('ConnectionClosedError');
		});

		test('should store wasReconnecting property', () => {
			const error = new ConnectionClosedError({
				message: 'Connection closed',
				wasReconnecting: true,
			});
			expect(error.wasReconnecting).toBe(true);
		});

		test('should default wasReconnecting to undefined', () => {
			const error = new ConnectionClosedError({ message: 'Connection closed' });
			expect(error.wasReconnecting).toBeUndefined();
		});
	});

	describe('ReconnectFailedError', () => {
		test('should have correct _tag', () => {
			const error = new ReconnectFailedError({ attempts: 5 });
			expect(error._tag).toBe('ReconnectFailedError');
		});

		test('should have default message', () => {
			const error = new ReconnectFailedError({ attempts: 5 });
			expect(error.message).toBe('Failed to reconnect after maximum attempts');
		});

		test('should store attempts property', () => {
			const error = new ReconnectFailedError({ attempts: 10 });
			expect(error.attempts).toBe(10);
		});

		test('should store lastError property', () => {
			const lastError = new Error('Connection refused');
			const error = new ReconnectFailedError({
				attempts: 5,
				lastError,
			});
			expect(error.lastError).toBe(lastError);
		});

		test('should use default message even when not explicitly provided', () => {
			const error = new ReconnectFailedError({ attempts: 3 });
			// Default message is set by StructuredError factory
			expect(error.message).toBe('Failed to reconnect after maximum attempts');
		});
	});

	describe('QueryTimeoutError', () => {
		test('should have correct _tag', () => {
			const error = new QueryTimeoutError({ timeoutMs: 5000 });
			expect(error._tag).toBe('QueryTimeoutError');
		});

		test('should have default message', () => {
			const error = new QueryTimeoutError({ timeoutMs: 5000 });
			expect(error.message).toBe('Query timed out');
		});

		test('should store timeoutMs property', () => {
			const error = new QueryTimeoutError({ timeoutMs: 30000 });
			expect(error.timeoutMs).toBe(30000);
		});

		test('should store query property', () => {
			const error = new QueryTimeoutError({
				timeoutMs: 5000,
				query: 'SELECT * FROM large_table',
			});
			expect(error.query).toBe('SELECT * FROM large_table');
		});
	});

	describe('TransactionError', () => {
		test('should have correct _tag', () => {
			const error = new TransactionError({ message: 'Transaction failed' });
			expect(error._tag).toBe('TransactionError');
		});

		test('should store phase property', () => {
			const beginError = new TransactionError({
				message: 'Failed to begin',
				phase: 'begin',
			});
			expect(beginError.phase).toBe('begin');

			const commitError = new TransactionError({
				message: 'Failed to commit',
				phase: 'commit',
			});
			expect(commitError.phase).toBe('commit');

			const rollbackError = new TransactionError({
				message: 'Failed to rollback',
				phase: 'rollback',
			});
			expect(rollbackError.phase).toBe('rollback');

			const savepointError = new TransactionError({
				message: 'Failed to create savepoint',
				phase: 'savepoint',
			});
			expect(savepointError.phase).toBe('savepoint');
		});
	});
});

describe('isRetryableError', () => {
	describe('Bun SQL specific error codes', () => {
		test('should return true for ERR_POSTGRES_CONNECTION_CLOSED', () => {
			const error = { code: 'ERR_POSTGRES_CONNECTION_CLOSED' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for ERR_POSTGRES_CONNECTION_TIMEOUT', () => {
			const error = { code: 'ERR_POSTGRES_CONNECTION_TIMEOUT' };
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('Node.js / system error codes', () => {
		test('should return true for ECONNRESET', () => {
			const error = { code: 'ECONNRESET' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for ECONNREFUSED', () => {
			const error = { code: 'ECONNREFUSED' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for ETIMEDOUT', () => {
			const error = { code: 'ETIMEDOUT' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for EPIPE', () => {
			const error = { code: 'EPIPE' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for ENOTFOUND', () => {
			const error = { code: 'ENOTFOUND' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for ENETUNREACH', () => {
			const error = { code: 'ENETUNREACH' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for EHOSTUNREACH', () => {
			const error = { code: 'EHOSTUNREACH' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for EAI_AGAIN', () => {
			const error = { code: 'EAI_AGAIN' };
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('PostgreSQL error codes', () => {
		test('should return true for 57P01 (admin_shutdown)', () => {
			const error = { code: '57P01' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 57P02 (crash_shutdown)', () => {
			const error = { code: '57P02' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 57P03 (cannot_connect_now)', () => {
			const error = { code: '57P03' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 08000 (connection_exception)', () => {
			const error = { code: '08000' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 08003 (connection_does_not_exist)', () => {
			const error = { code: '08003' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 08006 (connection_failure)', () => {
			const error = { code: '08006' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 08001 (sqlclient_unable_to_establish_sqlconnection)', () => {
			const error = { code: '08001' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for 08004 (sqlserver_rejected_establishment_of_sqlconnection)', () => {
			const error = { code: '08004' };
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('errno property', () => {
		test('should return true for errno ECONNRESET', () => {
			const error = { errno: 'ECONNRESET' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for errno ETIMEDOUT', () => {
			const error = { errno: 'ETIMEDOUT' };
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('error messages', () => {
		test('should return true for "connection closed" message', () => {
			const error = new Error('The connection closed unexpectedly');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "connection terminated" message', () => {
			const error = new Error('Connection terminated by server');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "connection reset" message', () => {
			const error = new Error('Connection reset by peer');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "connection refused" message', () => {
			const error = new Error('Connection refused');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "connection timed out" message', () => {
			const error = new Error('Connection timed out');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "socket hang up" message', () => {
			const error = new Error('socket hang up');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "read ECONNRESET" message', () => {
			const error = new Error('read ECONNRESET');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "write EPIPE" message', () => {
			const error = new Error('write EPIPE');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "getaddrinfo" message', () => {
			const error = new Error('getaddrinfo ENOTFOUND localhost');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "ENOTFOUND" message', () => {
			const error = new Error('ENOTFOUND: hostname not found');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "network is unreachable" message', () => {
			const error = new Error('Network is unreachable');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "no route to host" message', () => {
			const error = new Error('No route to host');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "server closed the connection unexpectedly" message', () => {
			const error = new Error('server closed the connection unexpectedly');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "terminating connection due to administrator command" message', () => {
			const error = new Error('terminating connection due to administrator command');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "the database system is shutting down" message', () => {
			const error = new Error('the database system is shutting down');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "the database system is starting up" message', () => {
			const error = new Error('the database system is starting up');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true for "the database system is in recovery mode" message', () => {
			const error = new Error('the database system is in recovery mode');
			expect(isRetryableError(error)).toBe(true);
		});

		test('should be case-insensitive for message matching', () => {
			const error = new Error('CONNECTION CLOSED');
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('nested cause', () => {
		test('should return true when cause has retryable code', () => {
			const cause = { code: 'ECONNRESET' };
			const error = { message: 'Query failed', cause };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should return true when deeply nested cause has retryable code', () => {
			const innerCause = { code: 'ETIMEDOUT' };
			const middleCause = { message: 'Connection error', cause: innerCause };
			const error = { message: 'Query failed', cause: middleCause };
			expect(isRetryableError(error)).toBe(true);
		});
	});

	describe('non-retryable errors', () => {
		test('should return false for null', () => {
			expect(isRetryableError(null)).toBe(false);
		});

		test('should return false for undefined', () => {
			expect(isRetryableError(undefined)).toBe(false);
		});

		test('should return false for syntax error', () => {
			const error = { code: '42601', message: 'syntax error at or near "SELEC"' };
			expect(isRetryableError(error)).toBe(false);
		});

		test('should return false for unique violation', () => {
			const error = { code: '23505', message: 'duplicate key value violates unique constraint' };
			expect(isRetryableError(error)).toBe(false);
		});

		test('should return false for foreign key violation', () => {
			const error = {
				code: '23503',
				message: 'insert or update on table violates foreign key constraint',
			};
			expect(isRetryableError(error)).toBe(false);
		});

		test('should return false for permission denied', () => {
			const error = { code: '42501', message: 'permission denied for table users' };
			expect(isRetryableError(error)).toBe(false);
		});

		test('should return false for generic error message', () => {
			const error = new Error('Something went wrong');
			expect(isRetryableError(error)).toBe(false);
		});

		test('should return false for empty object', () => {
			expect(isRetryableError({})).toBe(false);
		});

		test('should return false for string', () => {
			expect(isRetryableError('error')).toBe(false);
		});

		test('should return false for number', () => {
			expect(isRetryableError(123)).toBe(false);
		});
	});

	describe('edge cases', () => {
		test('should handle error with both code and message', () => {
			// Code takes precedence
			const error = { code: 'ECONNRESET', message: 'Some other message' };
			expect(isRetryableError(error)).toBe(true);
		});

		test('should handle Error instance with code property', () => {
			const error = new Error('Connection failed');
			(error as Error & { code: string }).code = 'ECONNREFUSED';
			expect(isRetryableError(error)).toBe(true);
		});

		test('should handle non-string code gracefully', () => {
			const error = { code: 123 };
			expect(isRetryableError(error)).toBe(false);
		});

		test('should handle non-string errno gracefully', () => {
			const error = { errno: 123 };
			expect(isRetryableError(error)).toBe(false);
		});
	});
});
