import { describe, test, expect } from 'bun:test';

// The function is private to workbench.ts, so we test it via a re-export helper.
// For now, we duplicate the function here for unit testing. Once the workbench
// refactor is complete, this can be tested end-to-end through the workbench API.

import type { JSONSchema } from '@agentuity/schema';

// Copy of the function from workbench.ts for isolated testing
function escapeString(s: string): string {
	return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function isValidIdentifier(key: string): boolean {
	return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

function jsonSchemaToTypeScript(schema: JSONSchema, indent = 0): string {
	const pad = '  '.repeat(indent);
	const inner = '  '.repeat(indent + 1);

	if (schema.const !== undefined) {
		return typeof schema.const === 'string'
			? `"${escapeString(schema.const)}"`
			: String(schema.const);
	}

	if (schema.enum) {
		return schema.enum
			.map((v) => (typeof v === 'string' ? `"${escapeString(String(v))}"` : String(v)))
			.join(' | ');
	}

	const unionSchemas = schema.anyOf ?? schema.oneOf;
	if (unionSchemas) {
		if (unionSchemas.length === 2) {
			const nullIdx = unionSchemas.findIndex((s) => s.type === 'null');
			if (nullIdx !== -1) {
				const other = unionSchemas[nullIdx === 0 ? 1 : 0];
				if (other) {
					return `${jsonSchemaToTypeScript(other, indent)} | null`;
				}
			}
		}
		return unionSchemas.map((s) => jsonSchemaToTypeScript(s, indent)).join(' | ');
	}

	if (schema.allOf) {
		return schema.allOf.map((s) => jsonSchemaToTypeScript(s, indent)).join(' & ');
	}

	switch (schema.type) {
		case 'string':
			return 'string';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
		case 'array': {
			if (!schema.items) return 'unknown[]';
			const itemType = jsonSchemaToTypeScript(schema.items, indent);
			return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`;
		}
		case 'object': {
			if (!schema.properties || Object.keys(schema.properties).length === 0) {
				if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
					return `Record<string, ${jsonSchemaToTypeScript(schema.additionalProperties, indent)}>`;
				}
				return 'Record<string, unknown>';
			}
			const required = new Set(schema.required ?? []);
			const lines: string[] = ['{'];
			for (const [key, propSchema] of Object.entries(schema.properties)) {
				const optional = !required.has(key);
				const propType = jsonSchemaToTypeScript(propSchema, indent + 1);
				const desc = propSchema.description ? ` // ${propSchema.description}` : '';
				const quotedKey = isValidIdentifier(key) ? key : `"${escapeString(key)}"`;
				lines.push(`${inner}${quotedKey}${optional ? '?' : ''}: ${propType};${desc}`);
			}
			lines.push(`${pad}}`);
			return lines.join('\n');
		}
		default:
			if (schema.properties) {
				return jsonSchemaToTypeScript({ ...schema, type: 'object' }, indent);
			}
			if (schema.items) {
				return jsonSchemaToTypeScript({ ...schema, type: 'array' }, indent);
			}
			return 'unknown';
	}
}

describe('jsonSchemaToTypeScript', () => {
	test('primitive types', () => {
		expect(jsonSchemaToTypeScript({ type: 'string' })).toBe('string');
		expect(jsonSchemaToTypeScript({ type: 'number' })).toBe('number');
		expect(jsonSchemaToTypeScript({ type: 'integer' })).toBe('number');
		expect(jsonSchemaToTypeScript({ type: 'boolean' })).toBe('boolean');
		expect(jsonSchemaToTypeScript({ type: 'null' })).toBe('null');
	});

	test('simple object', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number' },
			},
			required: ['name', 'age'],
		});
		expect(result).toBe('{\n  name: string;\n  age: number;\n}');
	});

	test('object with optional fields', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				name: { type: 'string' },
				nickname: { type: 'string' },
			},
			required: ['name'],
		});
		expect(result).toBe('{\n  name: string;\n  nickname?: string;\n}');
	});

	test('object with descriptions', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				name: { type: 'string', description: 'User name' },
				age: { type: 'number', description: 'User age' },
			},
			required: ['name', 'age'],
		});
		expect(result).toBe('{\n  name: string; // User name\n  age: number; // User age\n}');
	});

	test('array types', () => {
		expect(jsonSchemaToTypeScript({ type: 'array', items: { type: 'string' } })).toBe('string[]');
		expect(jsonSchemaToTypeScript({ type: 'array', items: { type: 'number' } })).toBe('number[]');
	});

	test('array without items', () => {
		expect(jsonSchemaToTypeScript({ type: 'array' })).toBe('unknown[]');
	});

	test('nested object', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				user: {
					type: 'object',
					properties: {
						name: { type: 'string' },
					},
					required: ['name'],
				},
			},
			required: ['user'],
		});
		expect(result).toBe('{\n  user: {\n    name: string;\n  };\n}');
	});

	test('nullable type (anyOf with null)', () => {
		const result = jsonSchemaToTypeScript({
			anyOf: [{ type: 'string' }, { type: 'null' }],
		});
		expect(result).toBe('string | null');
	});

	test('union type (anyOf)', () => {
		const result = jsonSchemaToTypeScript({
			anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
		});
		expect(result).toBe('string | number | boolean');
	});

	test('oneOf union', () => {
		const result = jsonSchemaToTypeScript({
			oneOf: [{ type: 'string' }, { type: 'number' }],
		});
		expect(result).toBe('string | number');
	});

	test('allOf intersection', () => {
		const result = jsonSchemaToTypeScript({
			allOf: [
				{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
				{ type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
			],
		});
		expect(result).toBe('{\n  a: string;\n} & {\n  b: number;\n}');
	});

	test('enum', () => {
		expect(jsonSchemaToTypeScript({ enum: ['red', 'green', 'blue'] })).toBe(
			'"red" | "green" | "blue"'
		);
	});

	test('const literal', () => {
		expect(jsonSchemaToTypeScript({ const: 'hello' })).toBe('"hello"');
		expect(jsonSchemaToTypeScript({ const: 42 })).toBe('42');
		expect(jsonSchemaToTypeScript({ const: true })).toBe('true');
	});

	test('array of union types wraps in parens', () => {
		const result = jsonSchemaToTypeScript({
			type: 'array',
			items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
		});
		expect(result).toBe('(string | number)[]');
	});

	test('empty object with additionalProperties', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			additionalProperties: { type: 'string' },
		});
		expect(result).toBe('Record<string, string>');
	});

	test('empty object without additionalProperties', () => {
		expect(jsonSchemaToTypeScript({ type: 'object' })).toBe('Record<string, unknown>');
	});

	test('unknown type for empty schema', () => {
		expect(jsonSchemaToTypeScript({})).toBe('unknown');
	});

	test('infers object from properties without explicit type', () => {
		const result = jsonSchemaToTypeScript({
			properties: { x: { type: 'number' } },
			required: ['x'],
		});
		expect(result).toBe('{\n  x: number;\n}');
	});

	test('infers array from items without explicit type', () => {
		const result = jsonSchemaToTypeScript({
			items: { type: 'string' },
		});
		expect(result).toBe('string[]');
	});

	test('escapes special characters in string literals', () => {
		expect(jsonSchemaToTypeScript({ const: 'say "hello"' })).toBe('"say \\"hello\\""');
		expect(jsonSchemaToTypeScript({ const: 'line1\nline2' })).toBe('"line1\\nline2"');
		expect(jsonSchemaToTypeScript({ const: 'back\\slash' })).toBe('"back\\\\slash"');
	});

	test('escapes special characters in enum values', () => {
		const result = jsonSchemaToTypeScript({ enum: ['a"b', 'c\\d'] });
		expect(result).toBe('"a\\"b" | "c\\\\d"');
	});

	test('quotes property keys with special characters', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				'foo-bar': { type: 'string' },
				'123start': { type: 'number' },
				'with space': { type: 'boolean' },
				normalKey: { type: 'string' },
			},
			required: ['foo-bar', '123start', 'with space', 'normalKey'],
		});
		expect(result).toContain('"foo-bar": string;');
		expect(result).toContain('"123start": number;');
		expect(result).toContain('"with space": boolean;');
		expect(result).toContain('normalKey: string;');
	});

	test('complex real-world schema', () => {
		const result = jsonSchemaToTypeScript({
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
				filters: {
					type: 'object',
					properties: {
						status: { enum: ['active', 'archived'] },
						tags: { type: 'array', items: { type: 'string' } },
					},
				},
				limit: { type: 'integer' },
			},
			required: ['query'],
		});
		expect(result).toContain('query: string; // Search query');
		expect(result).toContain('filters?: {');
		expect(result).toContain('status?: "active" | "archived"');
		expect(result).toContain('tags?: string[]');
		expect(result).toContain('limit?: number');
	});
});
