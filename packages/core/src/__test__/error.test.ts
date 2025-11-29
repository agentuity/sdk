import { describe, test, expect } from 'bun:test';
import { StructuredError, isStructuredError } from '../error';

describe('StructuredError', () => {
	describe('basic creation', () => {
		test('should create error with tag', () => {
			const NotFound = StructuredError('NotFound');
			const error = new NotFound();

			expect(error).toBeInstanceOf(Error);
			expect(error._tag).toBe('NotFound');
			expect(error.name).toBe('NotFound');
		});

		test('should create error with message', () => {
			const NotFound = StructuredError('NotFound');
			const error = new NotFound({ message: 'Resource not found' });

			expect(error.message).toBe('Resource not found');
			expect(error._tag).toBe('NotFound');
		});

		test('should create error with custom properties', () => {
			const ValidationError = StructuredError('ValidationError')<{
				field: string;
				code: string;
			}>();
			const error = new ValidationError({ field: 'email', code: 'INVALID_FORMAT' });

			expect(error.field).toBe('email');
			expect(error.code).toBe('INVALID_FORMAT');
		});

		test('should create error with message and custom properties', () => {
			const ValidationError = StructuredError('ValidationError')<{
				field: string;
				value: string;
			}>();
			const error = new ValidationError({
				message: 'Validation failed',
				field: 'email',
				value: 'invalid-email',
			});

			expect(error.message).toBe('Validation failed');
			expect(error.field).toBe('email');
			expect(error.value).toBe('invalid-email');
		});
	});

	describe('stack trace', () => {
		test('should capture stack trace', () => {
			const TestError = StructuredError('TestError');
			const error = new TestError({ message: 'test' });

			expect(error.stack).toBeDefined();
			expect(error.stack).toContain('TestError');
		});
	});

	describe('cause chaining', () => {
		test('should store cause error', () => {
			const RootError = StructuredError('RootError');
			const WrapperError = StructuredError('WrapperError');

			const root = new RootError({ message: 'Root cause' });
			const wrapper = new WrapperError({ message: 'Wrapped', cause: root });

			expect(wrapper.cause).toBe(root);
		});

		test('should store non-Error cause', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'Failed', cause: 'string cause' });

			expect(error.cause).toBe('string cause');
		});

		test('should handle object cause', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({
				message: 'Failed',
				cause: { code: 500, reason: 'Server error' },
			});

			expect(error.cause).toEqual({ code: 500, reason: 'Server error' });
		});
	});

	describe('plainArgs', () => {
		test('should return plain args without message and cause', () => {
			const AppError = StructuredError('AppError')<{ id: number; status: string }>();
			const error = new AppError({
				message: 'Error message',
				cause: new Error('cause'),
				id: 123,
				status: 'failed',
			});

			expect(error.plainArgs).toEqual({ id: 123, status: 'failed' });
		});

		test('should return undefined when no args provided', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError();

			expect(error.plainArgs).toBeUndefined();
		});

		test('should return undefined when only message provided', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'test' });

			expect(error.plainArgs).toBeUndefined();
		});
	});

	describe('_tag protection', () => {
		test('should not allow _tag override from args', () => {
			const AppError = StructuredError('AppError');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const error = new AppError({ _tag: 'DifferentTag' } as any);

			expect(error._tag).toBe('AppError');
		});
	});

	describe('toJSON', () => {
		test('should serialize basic error', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'test' });
			const json = error.toJSON();

			expect(json.name).toBe('AppError');
			expect(json.message).toBe('test');
			expect(json.stack).toBeDefined();
		});

		test('should include custom properties', () => {
			const AppError = StructuredError('AppError')<{ id: number; status: string }>();
			const error = new AppError({ message: 'test', id: 123, status: 'failed' });
			const json = error.toJSON();

			expect(json.id).toBe(123);
			expect(json.status).toBe('failed');
		});

		test('should serialize cause as Error', () => {
			const RootError = StructuredError('RootError');
			const WrapperError = StructuredError('WrapperError');

			const root = new RootError({ message: 'Root' });
			const wrapper = new WrapperError({ message: 'Wrapper', cause: root });
			const json = wrapper.toJSON();

			expect(json.cause).toBeDefined();
			expect(json.cause.name).toBe('RootError');
			expect(json.cause.message).toBe('Root');
			expect(json.cause.stack).toBeDefined();
		});

		test('should serialize non-Error cause as-is', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'test', cause: { code: 500 } });
			const json = error.toJSON();

			expect(json.cause).toEqual({ code: 500 });
		});
	});

	describe('prettyPrint', () => {
		test('should print basic error', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'Something went wrong' });
			const output = error.prettyPrint();

			expect(output).toContain('AppError');
			expect(output).toContain('Something went wrong');
		});

		test('should print error with custom args', () => {
			const ValidationError = StructuredError('ValidationError')<{
				field: string;
				code: string;
			}>();
			const error = new ValidationError({
				message: 'Invalid input',
				field: 'email',
				code: 'INVALID',
			});
			const output = error.prettyPrint();

			expect(output).toContain('ValidationError');
			expect(output).toContain('Invalid input');
			expect(output).toContain('field');
			expect(output).toContain('email');
			expect(output).toContain('code');
			expect(output).toContain('INVALID');
		});

		test('should print cause chain', () => {
			const RootError = StructuredError('RootError');
			const MiddleError = StructuredError('MiddleError');
			const TopError = StructuredError('TopError');

			const root = new RootError({ message: 'Root cause' });
			const middle = new MiddleError({ message: 'Middle error', cause: root });
			const top = new TopError({ message: 'Top error', cause: middle });

			const output = top.prettyPrint();

			expect(output).toContain('TopError');
			expect(output).toContain('Top error');
			expect(output).toContain('MiddleError');
			expect(output).toContain('Middle error');
			expect(output).toContain('RootError');
			expect(output).toContain('Root cause');
			expect(output).toContain('-- caused by --');
		});

		test('should handle non-Error cause', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({
				message: 'Failed',
				cause: { code: 500, reason: 'Internal' },
			});
			const output = error.prettyPrint();

			expect(output).toContain('AppError');
			expect(output).toContain('Failed');
			expect(output).toContain('cause:');
			expect(output).toContain('500');
			expect(output).toContain('Internal');
		});

		test('should prevent infinite loops with circular causes', () => {
			const AppError = StructuredError('AppError');
			const error1 = new AppError({ message: 'Error 1' });
			const error2 = new AppError({ message: 'Error 2', cause: error1 });

			// Create circular reference by modifying the internal symbol
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(error1 as any)[Symbol.for('@@RichError:cause')] = error2;

			const output = error1.prettyPrint();

			// Should complete without hanging due to visited Set
			expect(output).toBeDefined();
			expect(output).toContain('AppError');
		});
	});

	describe('toString', () => {
		test('should call prettyPrint', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'test' });
			const str = error.toString();

			expect(str).toContain('AppError');
			expect(str).toContain('test');
		});
	});

	describe('JSON.stringify with circular references', () => {
		test('should handle circular object references in custom properties', () => {
			const AppError = StructuredError('AppError')<{ data: unknown }>();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const circular: any = { name: 'test' };
			circular.self = circular;

			const error = new AppError({ message: 'test', data: circular });
			const json = error.toJSON();

			// Should complete without throwing
			expect(json).toBeDefined();
			expect(json.data).toBeDefined();
		});
	});

	describe('error inheritance', () => {
		test('should be instanceof Error', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError();

			expect(error instanceof Error).toBe(true);
		});

		test('should work with try-catch', () => {
			const AppError = StructuredError('AppError');

			try {
				throw new AppError({ message: 'test' });
			} catch (e) {
				expect(e).toBeInstanceOf(Error);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect((e as any)._tag).toBe('AppError');
			}
		});
	});

	describe('multiple tagged error types', () => {
		test('should distinguish between different tagged errors', () => {
			const NotFoundError = StructuredError('NotFoundError');
			const ValidationError = StructuredError('ValidationError');

			const notFound = new NotFoundError({ message: 'Not found' });
			const validation = new ValidationError({ message: 'Invalid' });

			expect(notFound._tag).toBe('NotFoundError');
			expect(validation._tag).toBe('ValidationError');
			expect(notFound._tag).not.toBe(validation._tag);
		});
	});

	describe('typed shape', () => {
		test('should enforce typed shape with generic (tag auto-inferred)', () => {
			const ValidationError = StructuredError('ValidationError')<{
				field: string;
				code: string;
			}>();

			const error = new ValidationError({
				field: 'email',
				code: 'INVALID_FORMAT',
				message: 'Invalid email format',
			});

			expect(error._tag).toBe('ValidationError');
			expect(error.field).toBe('email');
			expect(error.code).toBe('INVALID_FORMAT');
			expect(error.message).toBe('Invalid email format');
		});

		test('should make shape properties readonly on instance', () => {
			const ApiError = StructuredError('ApiError')<{ status: number; endpoint: string }>();

			const error = new ApiError({ status: 404, endpoint: '/api/users' });

			expect(error.status).toBe(404);
			expect(error.endpoint).toBe('/api/users');
		});

		test('should allow message and cause with typed shape', () => {
			const DbError = StructuredError('DbError')<{ query: string; table: string }>();
			const rootCause = new Error('Connection timeout');

			const error = new DbError({
				query: 'SELECT * FROM users',
				table: 'users',
				message: 'Database query failed',
				cause: rootCause,
			});

			expect(error.query).toBe('SELECT * FROM users');
			expect(error.table).toBe('users');
			expect(error.message).toBe('Database query failed');
			expect(error.cause).toBe(rootCause);
		});
	});

	describe('isStructuredError', () => {
		test('should return true for StructuredError instances', () => {
			const AppError = StructuredError('AppError');
			const error = new AppError({ message: 'test' });

			expect(isStructuredError(error)).toBe(true);
		});

		test('should return true for StructuredError with typed shape', () => {
			const ValidationError = StructuredError('ValidationError')<{
				field: string;
				code: string;
			}>();
			const error = new ValidationError({ field: 'email', code: 'INVALID' });

			expect(isStructuredError(error)).toBe(true);
		});

		test('should return false for regular Error', () => {
			const error = new Error('test');

			expect(isStructuredError(error)).toBe(false);
		});

		test('should return false for plain object with _tag', () => {
			const obj = { _tag: 'FakeError', message: 'test' };

			expect(isStructuredError(obj)).toBe(false);
		});

		test('should return false for null', () => {
			expect(isStructuredError(null)).toBe(false);
		});

		test('should return false for undefined', () => {
			expect(isStructuredError(undefined)).toBe(false);
		});

		test('should return false for non-object values', () => {
			expect(isStructuredError('error')).toBe(false);
			expect(isStructuredError(123)).toBe(false);
			expect(isStructuredError(true)).toBe(false);
		});

		test('should work as type guard', () => {
			const AppError = StructuredError('AppError')<{ id: number }>();
			const error: unknown = new AppError({ id: 123 });

			if (isStructuredError(error)) {
				// TypeScript should know error has _tag
				expect(error._tag).toBe('AppError');
				// Should be able to access RichError methods
				expect(error.prettyPrint).toBeDefined();
			}
		});

		test('should identify multiple different StructuredError types', () => {
			const NotFoundError = StructuredError('NotFoundError');
			const ValidationError = StructuredError('ValidationError');
			const DbError = StructuredError('DbError');

			const notFound = new NotFoundError();
			const validation = new ValidationError();
			const dbError = new DbError();

			expect(isStructuredError(notFound)).toBe(true);
			expect(isStructuredError(validation)).toBe(true);
			expect(isStructuredError(dbError)).toBe(true);
		});
	});
});
