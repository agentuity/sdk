import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { parseOptionsSchema } from '../src/schema-parser';

describe('parseOptionsSchema', () => {
	describe('optionalString type detection', () => {
		test('detects z.union([z.boolean(), z.string()]) as optionalString', () => {
			const schema = z.object({
				org: z.union([z.boolean(), z.string()]).optional().describe('organization flag'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('org');
			expect(parsed[0].type).toBe('optionalString');
			expect(parsed[0].description).toBe('organization flag');
		});

		test('detects z.union([z.string(), z.boolean()]) as optionalString (order independent)', () => {
			const schema = z.object({
				flag: z.union([z.string(), z.boolean()]).describe('a flag'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('flag');
			expect(parsed[0].type).toBe('optionalString');
		});

		test('does not detect z.union with other types as optionalString', () => {
			const schema = z.object({
				value: z.union([z.string(), z.number()]).describe('string or number'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('value');
			// Should fall back to string type, not optionalString
			expect(parsed[0].type).not.toBe('optionalString');
		});

		test('detects boolean type correctly', () => {
			const schema = z.object({
				verbose: z.boolean().default(false).describe('verbose output'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('verbose');
			expect(parsed[0].type).toBe('boolean');
		});

		test('detects string type correctly', () => {
			const schema = z.object({
				name: z.string().describe('the name'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(1);
			expect(parsed[0].name).toBe('name');
			expect(parsed[0].type).toBe('string');
		});

		test('handles mixed option types', () => {
			const schema = z.object({
				org: z.union([z.boolean(), z.string()]).optional().describe('org flag'),
				verbose: z.boolean().default(false).describe('verbose'),
				name: z.string().describe('name'),
				count: z.number().default(10).describe('count'),
			});

			const parsed = parseOptionsSchema(schema);

			expect(parsed).toHaveLength(4);

			const orgOpt = parsed.find((o) => o.name === 'org');
			expect(orgOpt?.type).toBe('optionalString');

			const verboseOpt = parsed.find((o) => o.name === 'verbose');
			expect(verboseOpt?.type).toBe('boolean');

			const nameOpt = parsed.find((o) => o.name === 'name');
			expect(nameOpt?.type).toBe('string');

			const countOpt = parsed.find((o) => o.name === 'count');
			expect(countOpt?.type).toBe('number');
		});
	});
});
