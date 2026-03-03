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

		// Compile-time assertions to prevent type inference regressions
		// These will cause TypeScript compilation to fail if the type widens to `any` or `string`
		type _AssertFormat = Format extends 'summary' | 'bullet-points' ? true : false;
		type _AssertNotAny = 0 extends 1 & Format ? false : true;
		type _AssertNotString = string extends Format ? false : true;
		const _typeChecks: _AssertFormat & _AssertNotAny & _AssertNotString = true;
		void _typeChecks;

		// Runtime tests
		const format: Format = formatSchema.parse('summary');
		expect(format).toBe('summary');

		const validFormat: Format = 'bullet-points';
		expect(validFormat).toBe('bullet-points');
	});

	test('should infer enum with numbers', () => {
		const statusSchema = s.enum([1, 2, 3]);

		type Status = s.infer<typeof statusSchema>;

		// Compile-time assertions
		type _AssertStatus = Status extends 1 | 2 | 3 ? true : false;
		type _AssertNotAny = 0 extends 1 & Status ? false : true;
		type _AssertNotNumber = number extends Status ? false : true;
		const _typeChecks: _AssertStatus & _AssertNotAny & _AssertNotNumber = true;
		void _typeChecks;

		const status: Status = statusSchema.parse(2);
		expect(status).toBe(2);
	});

	test('should infer enum with mixed types', () => {
		const mixedSchema = s.enum(['active', 'inactive', 0, 1]);

		type Mixed = s.infer<typeof mixedSchema>;

		// Compile-time assertions
		type _AssertMixed = Mixed extends 'active' | 'inactive' | 0 | 1 ? true : false;
		type _AssertNotAny = 0 extends 1 & Mixed ? false : true;
		const _typeChecks: _AssertMixed & _AssertNotAny = true;
		void _typeChecks;

		const mixed: Mixed = mixedSchema.parse('active');
		expect(mixed).toBe('active');

		const mixedNum: Mixed = mixedSchema.parse(1);
		expect(mixedNum).toBe(1);
	});
});
