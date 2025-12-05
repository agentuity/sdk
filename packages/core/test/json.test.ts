import { describe, test, expect } from 'bun:test';
import { safeStringify } from '../src/json';

describe('safeStringify', () => {
	describe('basic types', () => {
		test('should stringify a simple object', () => {
			const obj = { name: 'test', value: 42 };
			const result = safeStringify(obj);
			expect(result).toBe('{"name":"test","value":42}');
		});

		test('should stringify an array', () => {
			const arr = [1, 2, 3, 'test'];
			const result = safeStringify(arr);
			expect(result).toBe('[1,2,3,"test"]');
		});

		test('should stringify null', () => {
			const result = safeStringify(null);
			expect(result).toBe('null');
		});

		test('should return undefined for undefined input', () => {
			const result = safeStringify(undefined);
			// JSON.stringify(undefined) returns the value undefined (not a string 'undefined')
			expect(result).toBeUndefined();
			expect(typeof result).toBe('undefined');
		});

		test('should stringify strings', () => {
			const result = safeStringify('hello world');
			expect(result).toBe('"hello world"');
		});

		test('should stringify numbers', () => {
			expect(safeStringify(42)).toBe('42');
			expect(safeStringify(3.14)).toBe('3.14');
			expect(safeStringify(0)).toBe('0');
			expect(safeStringify(-1)).toBe('-1');
		});

		test('should stringify booleans', () => {
			expect(safeStringify(true)).toBe('true');
			expect(safeStringify(false)).toBe('false');
		});
	});

	describe('bigint handling', () => {
		test('should convert bigint to string', () => {
			const obj = { id: BigInt(9007199254740991) };
			const result = safeStringify(obj);
			expect(result).toBe('{"id":"9007199254740991"}');
		});

		test('should handle multiple bigints', () => {
			const obj = {
				small: BigInt(123),
				large: BigInt('999999999999999999'),
			};
			const result = safeStringify(obj);
			expect(result).toBe('{"small":"123","large":"999999999999999999"}');
		});

		test('should handle bigint in arrays', () => {
			const arr = [1, BigInt(42), 'test'];
			const result = safeStringify(arr);
			expect(result).toBe('[1,"42","test"]');
		});
	});

	describe('circular reference handling', () => {
		test('should handle simple circular reference', () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const obj: any = { name: 'test' };
			obj.self = obj;
			const result = safeStringify(obj);
			expect(result).toBe('{"name":"test","self":"[Circular]"}');
		});

		test('should handle nested circular reference', () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const obj: any = { level1: { level2: {} } };
			obj.level1.level2.back = obj;
			const result = safeStringify(obj);
			expect(result).toBe('{"level1":{"level2":{"back":"[Circular]"}}}');
		});

		test('should handle multiple circular references', () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const obj: any = { a: {}, b: {} };
			obj.a.root = obj;
			obj.b.root = obj;
			const result = safeStringify(obj);
			expect(result).toBe('{"a":{"root":"[Circular]"},"b":{"root":"[Circular]"}}');
		});

		test('should handle array with circular reference', () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const arr: any = [1, 2];
			arr.push(arr);
			const result = safeStringify(arr);
			expect(result).toBe('[1,2,"[Circular]"]');
		});

		test('should handle object referencing same child twice', () => {
			const child = { value: 42 };
			const parent = { a: child, b: child };
			const result = safeStringify(parent);
			// First reference should be stringified, second should be [Circular]
			expect(result).toBe('{"a":{"value":42},"b":"[Circular]"}');
		});
	});

	describe('nested objects', () => {
		test('should stringify deeply nested objects', () => {
			const obj = {
				level1: {
					level2: {
						level3: {
							value: 'deep',
						},
					},
				},
			};
			const result = safeStringify(obj);
			expect(result).toBe('{"level1":{"level2":{"level3":{"value":"deep"}}}}');
		});

		test('should handle mixed nested structures', () => {
			const obj = {
				users: [
					{ id: 1, name: 'Alice' },
					{ id: 2, name: 'Bob' },
				],
				meta: {
					count: 2,
					tags: ['test', 'example'],
				},
			};
			const result = safeStringify(obj);
			expect(result).toBe(
				'{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"meta":{"count":2,"tags":["test","example"]}}'
			);
		});
	});

	describe('formatting with space parameter', () => {
		test('should format with numeric space', () => {
			const obj = { a: 1, b: 2 };
			const result = safeStringify(obj, 2);
			expect(result).toBe('{\n  "a": 1,\n  "b": 2\n}');
		});

		test('should format with string space', () => {
			const obj = { a: 1, b: 2 };
			const result = safeStringify(obj, '\t');
			expect(result).toBe('{\n\t"a": 1,\n\t"b": 2\n}');
		});

		test('should format nested objects with space', () => {
			const obj = { outer: { inner: 42 } };
			const result = safeStringify(obj, 2);
			expect(result).toBe('{\n  "outer": {\n    "inner": 42\n  }\n}');
		});
	});

	describe('edge cases', () => {
		test('should handle empty object', () => {
			const result = safeStringify({});
			expect(result).toBe('{}');
		});

		test('should handle empty array', () => {
			const result = safeStringify([]);
			expect(result).toBe('[]');
		});

		test('should handle Date objects', () => {
			const date = new Date('2024-01-01T00:00:00.000Z');
			const result = safeStringify(date);
			expect(result).toBe('"2024-01-01T00:00:00.000Z"');
		});

		test('should handle special number values', () => {
			expect(safeStringify(Infinity)).toBe('null');
			expect(safeStringify(-Infinity)).toBe('null');
			expect(safeStringify(NaN)).toBe('null');
		});

		test('should handle objects with null prototype', () => {
			const obj = Object.create(null);
			obj.key = 'value';
			const result = safeStringify(obj);
			expect(result).toBe('{"key":"value"}');
		});

		test('should handle symbol keys (should be ignored)', () => {
			const sym = Symbol('test');
			const obj = { [sym]: 'value', normal: 'key' };
			const result = safeStringify(obj);
			expect(result).toBe('{"normal":"key"}');
		});

		test('should handle functions (should be ignored in objects)', () => {
			const obj = {
				fn: () => 'test',
				value: 42,
			};
			const result = safeStringify(obj);
			expect(result).toBe('{"value":42}');
		});
	});
});
