import { describe, test, expect } from 'bun:test';
import { s } from '../src/index.js';

describe('Type Inference', () => {
	test('should infer object types', () => {
		const schema = s.object({
			name: s.string(),
			age: s.number(),
		});

		type User = s.infer<typeof schema>;

		const user: User = schema.parse({
			name: 'John',
			age: 30,
		});

		expect(user.name).toBe('John');
		expect(user.age).toBe(30);
	});

	test('should infer array types', () => {
		const schema = s.array(s.string());
		type StringArray = s.infer<typeof schema>;

		const arr: StringArray = schema.parse(['a', 'b', 'c']);
		expect(arr).toEqual(['a', 'b', 'c']);
	});

	test('should infer union types', () => {
		const schema = s.union(s.literal('admin'), s.literal('user'));

		type Role = s.infer<typeof schema>;

		const role: Role = schema.parse('admin');
		expect(role).toBe('admin');
	});

	test('should infer optional types', () => {
		const schema = s.object({
			required: s.string(),
			optional: s.optional(s.number()),
		});

		type Data = s.infer<typeof schema>;

		const data: Data = schema.parse({
			required: 'test',
		});

		expect(data.required).toBe('test');
		expect(data.optional).toBe(undefined);
	});

	test('should infer nullable types', () => {
		const schema = s.object({
			value: s.nullable(s.string()),
		});

		type Data = s.infer<typeof schema>;

		const data: Data = schema.parse({
			value: null,
		});

		expect(data.value).toBe(null);
	});

	test('should infer enum literal types', () => {
		const formatSchema = s.enum(['summary', 'bullet-points']);

		type Format = s.infer<typeof formatSchema>;

		// This test verifies that the type is correctly inferred as "summary" | "bullet-points"
		// and not widened to `any` or `string`
		const format: Format = formatSchema.parse('summary');
		expect(format).toBe('summary');

		// TypeScript should allow assigning literal values
		const validFormat: Format = 'bullet-points';
		expect(validFormat).toBe('bullet-points');
	});

	test('should infer enum with numbers', () => {
		const statusSchema = s.enum([1, 2, 3]);

		type Status = s.infer<typeof statusSchema>;

		const status: Status = statusSchema.parse(2);
		expect(status).toBe(2);
	});

	test('should infer enum with mixed types', () => {
		const mixedSchema = s.enum(['active', 'inactive', 0, 1]);

		type Mixed = s.infer<typeof mixedSchema>;

		const mixed: Mixed = mixedSchema.parse('active');
		expect(mixed).toBe('active');

		const mixedNum: Mixed = mixedSchema.parse(1);
		expect(mixedNum).toBe(1);
	});
});
