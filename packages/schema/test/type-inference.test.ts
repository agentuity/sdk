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
});
