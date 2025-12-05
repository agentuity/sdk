import { describe, test, expect } from 'bun:test';
import type { StandardSchemaV1 } from '../src/standard_schema';

describe('StandardSchemaV1', () => {
	test('should define StandardSchemaV1 interface', () => {
		const mockSchema: StandardSchemaV1<string> = {
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

		expect(mockSchema['~standard'].version).toBe(1);
		expect(mockSchema['~standard'].vendor).toBe('test');
		expect(typeof mockSchema['~standard'].validate).toBe('function');
	});

	test('should support successful validation', () => {
		const schema: StandardSchemaV1<number> = {
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

		const result = schema['~standard'].validate(42);
		if ('value' in result) {
			expect(result.value).toBe(42);
		}
	});

	test('should support failed validation with issues', () => {
		const schema: StandardSchemaV1<string> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: (value: unknown) => {
					if (typeof value === 'string') {
						return { value };
					}
					return { issues: [{ message: 'Invalid type' }] };
				},
			},
		};

		const result = schema['~standard'].validate(123);
		if ('issues' in result && result.issues) {
			expect(result.issues).toHaveLength(1);
			expect(result.issues[0].message).toBe('Invalid type');
		} else {
			throw new Error('Expected validation to fail');
		}
	});

	test('should support different vendor names', () => {
		const vendors = ['zod', 'valibot', 'arktype', 'agentuity'];

		vendors.forEach((vendor) => {
			const schema: StandardSchemaV1 = {
				'~standard': {
					version: 1,
					vendor,
					validate: (value: unknown) => ({ value }),
				},
			};

			expect(schema['~standard'].vendor).toBe(vendor);
		});
	});
});
