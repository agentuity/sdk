import { describe, test, expect } from 'bun:test';
import {
	SandboxResponseError,
	SandboxNotFoundError,
	SandboxTerminatedError,
	ExecutionNotFoundError,
	ExecutionTimeoutError,
	ExecutionCancelledError,
	SnapshotNotFoundError,
	throwSandboxError,
} from '../src/api/sandbox/util';

describe('Sandbox Error Types', () => {
	describe('SandboxResponseError', () => {
		test('should have correct _tag', () => {
			const error = new SandboxResponseError({ message: 'test error' });
			expect(error._tag).toBe('SandboxResponseError');
		});

		test('should include context fields', () => {
			const error = new SandboxResponseError({
				message: 'test error',
				sandboxId: 'sandbox-123',
				executionId: 'exec-456',
				sessionId: 'session-789',
				code: 'SANDBOX_NOT_FOUND',
			});
			expect(error.sandboxId).toBe('sandbox-123');
			expect(error.executionId).toBe('exec-456');
			expect(error.sessionId).toBe('session-789');
			expect(error.code).toBe('SANDBOX_NOT_FOUND');
		});
	});

	describe('SandboxNotFoundError', () => {
		test('should have correct _tag', () => {
			const error = new SandboxNotFoundError({
				message: 'Sandbox not found',
				sandboxId: 'sandbox-123',
			});
			expect(error._tag).toBe('SandboxNotFoundError');
		});

		test('should include sandboxId', () => {
			const error = new SandboxNotFoundError({
				message: 'Sandbox not found',
				sandboxId: 'sandbox-123',
			});
			expect(error.sandboxId).toBe('sandbox-123');
		});
	});

	describe('SandboxTerminatedError', () => {
		test('should have correct _tag', () => {
			const error = new SandboxTerminatedError({
				message: 'Sandbox terminated',
				sandboxId: 'sandbox-123',
			});
			expect(error._tag).toBe('SandboxTerminatedError');
		});

		test('should include sandboxId', () => {
			const error = new SandboxTerminatedError({
				message: 'Sandbox terminated',
				sandboxId: 'sandbox-123',
			});
			expect(error.sandboxId).toBe('sandbox-123');
		});
	});

	describe('ExecutionNotFoundError', () => {
		test('should have correct _tag', () => {
			const error = new ExecutionNotFoundError({
				message: 'Execution not found',
				executionId: 'exec-123',
			});
			expect(error._tag).toBe('ExecutionNotFoundError');
		});

		test('should include context fields', () => {
			const error = new ExecutionNotFoundError({
				message: 'Execution not found',
				executionId: 'exec-123',
				sandboxId: 'sandbox-456',
			});
			expect(error.executionId).toBe('exec-123');
			expect(error.sandboxId).toBe('sandbox-456');
		});
	});

	describe('ExecutionTimeoutError', () => {
		test('should have correct _tag', () => {
			const error = new ExecutionTimeoutError({
				message: 'Execution timed out',
			});
			expect(error._tag).toBe('ExecutionTimeoutError');
		});

		test('should include optional context fields', () => {
			const error = new ExecutionTimeoutError({
				message: 'Execution timed out',
				executionId: 'exec-123',
				sandboxId: 'sandbox-456',
			});
			expect(error.executionId).toBe('exec-123');
			expect(error.sandboxId).toBe('sandbox-456');
		});
	});

	describe('ExecutionCancelledError', () => {
		test('should have correct _tag', () => {
			const error = new ExecutionCancelledError({
				message: 'Execution cancelled',
			});
			expect(error._tag).toBe('ExecutionCancelledError');
		});

		test('should include optional sandboxId', () => {
			const error = new ExecutionCancelledError({
				message: 'Execution cancelled',
				sandboxId: 'sandbox-123',
			});
			expect(error.sandboxId).toBe('sandbox-123');
		});
	});

	describe('SnapshotNotFoundError', () => {
		test('should have correct _tag', () => {
			const error = new SnapshotNotFoundError({
				message: 'Snapshot not found',
			});
			expect(error._tag).toBe('SnapshotNotFoundError');
		});

		test('should include optional snapshotId', () => {
			const error = new SnapshotNotFoundError({
				message: 'Snapshot not found',
				snapshotId: 'snap-123',
			});
			expect(error.snapshotId).toBe('snap-123');
		});
	});
});

describe('throwSandboxError', () => {
	test('should throw SandboxNotFoundError when code is SANDBOX_NOT_FOUND', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Sandbox not found', code: 'SANDBOX_NOT_FOUND' },
				{ sandboxId: 'sandbox-123' }
			)
		).toThrow(SandboxNotFoundError);

		try {
			throwSandboxError(
				{ message: 'Sandbox not found', code: 'SANDBOX_NOT_FOUND' },
				{ sandboxId: 'sandbox-123' }
			);
		} catch (error) {
			expect((error as SandboxNotFoundError)._tag).toBe('SandboxNotFoundError');
			expect((error as SandboxNotFoundError).sandboxId).toBe('sandbox-123');
		}
	});

	test('should throw SandboxTerminatedError when code is SANDBOX_TERMINATED', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Sandbox terminated', code: 'SANDBOX_TERMINATED' },
				{ sandboxId: 'sandbox-123' }
			)
		).toThrow(SandboxTerminatedError);
	});

	test('should throw ExecutionNotFoundError when code is EXECUTION_NOT_FOUND', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Execution not found', code: 'EXECUTION_NOT_FOUND' },
				{ executionId: 'exec-123', sandboxId: 'sandbox-456' }
			)
		).toThrow(ExecutionNotFoundError);

		try {
			throwSandboxError(
				{ message: 'Execution not found', code: 'EXECUTION_NOT_FOUND' },
				{ executionId: 'exec-123', sandboxId: 'sandbox-456' }
			);
		} catch (error) {
			expect((error as ExecutionNotFoundError).executionId).toBe('exec-123');
			expect((error as ExecutionNotFoundError).sandboxId).toBe('sandbox-456');
		}
	});

	test('should throw ExecutionTimeoutError when code is EXECUTION_TIMEOUT', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Execution timed out', code: 'EXECUTION_TIMEOUT' },
				{ sandboxId: 'sandbox-123' }
			)
		).toThrow(ExecutionTimeoutError);
	});

	test('should throw ExecutionCancelledError when code is EXECUTION_CANCELLED', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Execution cancelled', code: 'EXECUTION_CANCELLED' },
				{ sandboxId: 'sandbox-123' }
			)
		).toThrow(ExecutionCancelledError);
	});

	test('should throw SnapshotNotFoundError when code is SNAPSHOT_NOT_FOUND', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Snapshot not found', code: 'SNAPSHOT_NOT_FOUND' },
				{ snapshotId: 'snap-123' }
			)
		).toThrow(SnapshotNotFoundError);
	});

	test('should throw SandboxResponseError for unknown codes', () => {
		expect(() =>
			throwSandboxError(
				{ message: 'Unknown error', code: 'UNKNOWN_CODE' },
				{ sandboxId: 'sandbox-123' }
			)
		).toThrow(SandboxResponseError);

		try {
			throwSandboxError(
				{ message: 'Unknown error', code: 'UNKNOWN_CODE' },
				{ sandboxId: 'sandbox-123' }
			);
		} catch (error) {
			expect((error as SandboxResponseError)._tag).toBe('SandboxResponseError');
			expect((error as SandboxResponseError).code).toBe('UNKNOWN_CODE');
		}
	});

	test('should throw SandboxResponseError when no code is provided', () => {
		expect(() =>
			throwSandboxError({ message: 'Generic error' }, { sandboxId: 'sandbox-123' })
		).toThrow(SandboxResponseError);

		try {
			throwSandboxError({ message: 'Generic error' }, { sandboxId: 'sandbox-123' });
		} catch (error) {
			expect((error as SandboxResponseError)._tag).toBe('SandboxResponseError');
			expect((error as SandboxResponseError).sandboxId).toBe('sandbox-123');
		}
	});

	test('should preserve message in thrown errors', () => {
		try {
			throwSandboxError(
				{ message: 'Custom error message', code: 'SANDBOX_NOT_FOUND' },
				{ sandboxId: 'sandbox-123' }
			);
		} catch (error) {
			expect((error as Error).message).toBe('Custom error message');
		}
	});

	test('should preserve sessionId in SandboxResponseError fallback', () => {
		try {
			throwSandboxError(
				{ message: 'Error with session' },
				{ sandboxId: 'sandbox-123', sessionId: 'session-456' }
			);
		} catch (error) {
			expect((error as SandboxResponseError).sessionId).toBe('session-456');
		}
	});
});

describe('Error discrimination patterns', () => {
	test('should allow discrimination by _tag property', () => {
		const errors = [
			new SandboxNotFoundError({ message: 'not found', sandboxId: 'sb-1' }),
			new SandboxTerminatedError({ message: 'terminated', sandboxId: 'sb-2' }),
			new ExecutionNotFoundError({ message: 'exec not found', executionId: 'ex-1' }),
			new SandboxResponseError({ message: 'generic' }),
		];

		for (const error of errors) {
			switch (error._tag) {
				case 'SandboxNotFoundError':
					expect(error.sandboxId).toBe('sb-1');
					break;
				case 'SandboxTerminatedError':
					expect(error.sandboxId).toBe('sb-2');
					break;
				case 'ExecutionNotFoundError':
					expect(error.executionId).toBe('ex-1');
					break;
				case 'SandboxResponseError':
					expect(error.message).toBe('generic');
					break;
			}
		}
	});

	test('should work with instanceof checks', () => {
		const error = new SandboxNotFoundError({ message: 'not found', sandboxId: 'sb-1' });

		expect(error instanceof Error).toBe(true);
		expect(error instanceof SandboxNotFoundError).toBe(true);
	});
});
