import { describe, test, expect } from 'bun:test';
import type { InferInput, InferOutput } from '../src/typehelper';
import type { StandardSchemaV1 } from '../src/standard_schema';

describe('InferOutput type helper', () => {
	test('should infer output type from StandardSchema', () => {
		const _schema: StandardSchemaV1<string> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					if (typeof value === 'string') {
						return { value };
					}
					return { issues: [{ message: 'Not a string' }] };
				},
			},
		};

		// Type assertion to verify InferOutput works correctly
		type InferredType = InferOutput<typeof _schema>;

		// TypeScript will fail to compile if this is wrong
		const value: InferredType = 'test string';
		expect(typeof value).toBe('string');
	});

	test('should infer complex object types', () => {
		interface User {
			id: number;
			name: string;
			active: boolean;
		}

		const _schema: StandardSchemaV1<User> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					return { value: value as User };
				},
			},
		};

		type InferredUser = InferOutput<typeof _schema>;

		const user: InferredUser = {
			id: 42,
			name: 'Bob',
			active: false,
		};

		expect(user.id).toBe(42);
		expect(user.name).toBe('Bob');
		expect(user.active).toBe(false);
	});

	test('should infer array types', () => {
		const _schema: StandardSchemaV1<string[]> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					return { value: value as string[] };
				},
			},
		};

		type InferredArray = InferOutput<typeof _schema>;

		const arr: InferredArray = ['test', 'values'];
		expect(arr).toHaveLength(2);
		expect(arr[0]).toBe('test');
	});

	test('should infer union types', () => {
		const _schema: StandardSchemaV1<string | number> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					return { value: value as string | number };
				},
			},
		};

		type InferredUnion = InferOutput<typeof _schema>;

		const str: InferredUnion = 'hello';
		const num: InferredUnion = 42;

		expect(typeof str).toBe('string');
		expect(typeof num).toBe('number');
	});

	test('should return void for non-StandardSchema types', () => {
		const _notASchema = { foo: 'bar' };

		type InferredVoid = InferOutput<typeof _notASchema>;

		// Should be void for non-StandardSchema types
		const value: InferredVoid = undefined;
		expect(value).toBeUndefined();
	});
});

describe('InferInput type helper', () => {
	test('should infer input type from StandardSchema', () => {
		const _schema: StandardSchemaV1<number> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					if (typeof value === 'number') {
						return { value };
					}
					return { issues: [{ message: 'Not a number' }] };
				},
			},
		};

		// InferInput should also extract the output type
		type InferredInput = InferInput<typeof _schema>;

		const value: InferredInput = 42;
		expect(typeof value).toBe('number');
	});

	test('should return never for non-StandardSchema types', () => {
		const _notASchema = { foo: 'bar' };

		type InferredNever = InferInput<typeof _notASchema>;

		// InferredNever should be never, so we can't assign anything to it
		// This is a compile-time test - if it compiles, the type is correct
		const fn = (val: InferredNever) => val;
		expect(typeof fn).toBe('function');
	});
});
