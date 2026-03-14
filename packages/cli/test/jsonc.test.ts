import { describe, test, expect } from 'bun:test';
import { parseJSONC } from '../src/utils/jsonc';

describe('parseJSONC', () => {
	// 1. Plain JSON — valid JSON with no comments parses correctly
	test('plain JSON with no comments parses correctly', () => {
		const input = '{"name": "test", "version": 1, "enabled": true, "items": [1, 2, 3]}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ name: 'test', version: 1, enabled: true, items: [1, 2, 3] });
	});

	// 2. Single-line comments (//) — stripped correctly
	test('single-line comments are stripped', () => {
		const input = `{
			// This is a comment
			"name": "test", // inline comment
			"value": 42
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ name: 'test', value: 42 });
	});

	// 3. Block comments (/* */) — stripped correctly
	test('block comments are stripped', () => {
		const input = `{
			/* block comment */
			"name": "test",
			"value": /* inline block */ 42
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ name: 'test', value: 42 });
	});

	// 4. Trailing commas — before } and before ] are stripped
	test('trailing commas before } are stripped', () => {
		const input = '{"a": 1, "b": 2,}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ a: 1, b: 2 });
	});

	test('trailing commas before ] are stripped', () => {
		const input = '{"items": [1, 2, 3,]}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ items: [1, 2, 3] });
	});

	test('trailing commas with whitespace before } and ]', () => {
		const input = `{
			"a": 1,
			"b": [
				"x",
				"y",
			],
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ a: 1, b: ['x', 'y'] });
	});

	// 5. Comments inside strings are preserved
	test('single-line comment syntax inside strings is preserved', () => {
		const input = '{"comment": "// not a comment"}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ comment: '// not a comment' });
	});

	test('block comment syntax inside strings is preserved', () => {
		const input = '{"comment": "/* not a comment */"}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ comment: '/* not a comment */' });
	});

	// 6. Escaped quotes in strings — don't break the parser
	test('escaped quotes in strings are handled correctly', () => {
		const input = '{"message": "he said \\"hello\\""}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ message: 'he said "hello"' });
	});

	test('escaped quotes followed by comment syntax', () => {
		const input = `{
			"msg": "she said \\"hi\\"", // comment after escaped quotes
			"ok": true
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ msg: 'she said "hi"', ok: true });
	});

	// 7. Real-world tsconfig.json
	test('real-world tsconfig.json with comments and trailing commas', () => {
		const input = `{
			// TypeScript configuration
			"compilerOptions": {
				/* Output settings */
				"target": "ESNext",
				"module": "ESNext",
				"moduleResolution": "bundler",
				"strict": true,
				"esModuleInterop": true,
				"skipLibCheck": true,
				"outDir": "./dist",
				"rootDir": "./src",
				// Path aliases
				"paths": {
					"@/*": ["./src/*"],
				},
			},
			"include": [
				"src/**/*.ts",
				"src/**/*.tsx",
			],
			"exclude": [
				"node_modules",
				"dist",
			],
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toHaveProperty('compilerOptions');
		const opts = (result as any).compilerOptions;
		expect(opts.target).toBe('ESNext');
		expect(opts.module).toBe('ESNext');
		expect(opts.strict).toBe(true);
		expect(opts.paths).toEqual({ '@/*': ['./src/*'] });
		expect((result as any).include).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
		expect((result as any).exclude).toEqual(['node_modules', 'dist']);
	});

	// 8. Real-world agentuity.json
	test('real-world agentuity.json with comments', () => {
		const input = `{
			// Agentuity project configuration
			"name": "my-agent-project",
			"version": "1.0.0",
			"agents": [
				{
					/* Primary agent */
					"name": "assistant",
					"description": "Main assistant agent",
					"model": "claude-3",
					"tools": [
						"search",
						"calculator",
					],
				},
				{
					// Secondary agent
					"name": "reviewer",
					"description": "Code review agent",
					"model": "claude-3",
				},
			],
			"settings": {
				"timeout": 30000,
				"retries": 3, // max retries
			},
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect((result as any).name).toBe('my-agent-project');
		expect((result as any).agents).toHaveLength(2);
		expect((result as any).agents[0].name).toBe('assistant');
		expect((result as any).agents[0].tools).toEqual(['search', 'calculator']);
		expect((result as any).agents[1].name).toBe('reviewer');
		expect((result as any).settings.timeout).toBe(30000);
		expect((result as any).settings.retries).toBe(3);
	});

	// 9. Multiline block comments — comments spanning multiple lines
	test('multiline block comments are stripped', () => {
		const input = `{
			/*
			 * This is a multiline
			 * block comment that spans
			 * several lines
			 */
			"key": "value"
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ key: 'value' });
	});

	test('multiline block comment between key-value pairs', () => {
		const input = `{
			"a": 1,
			/*
			Everything in here
			is ignored: {"b": 2}
			// even this
			*/
			"c": 3
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ a: 1, c: 3 });
	});

	// 10. Comment-only lines — lines that are entirely comments
	test('comment-only lines are handled', () => {
		const input = `
		// This is a leading comment
		// Another comment
		{
			// comment line
			"x": 1
			// trailing comment
		}
		// final comment`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ x: 1 });
	});

	// 11. Empty input — throws (invalid JSON)
	test('empty input throws', () => {
		expect(() => parseJSONC('')).toThrow();
	});

	test('whitespace-only input throws', () => {
		expect(() => parseJSONC('   \n\t  ')).toThrow();
	});

	test('comment-only input throws', () => {
		expect(() => parseJSONC('// just a comment')).toThrow();
	});

	// 12. Nested objects/arrays — complex structures with comments throughout
	test('nested objects and arrays with comments throughout', () => {
		const input = `{
			// Top level
			"level1": {
				/* Nested object */
				"level2": {
					// Deep nesting
					"level3": [
						{
							"id": 1, // first item
							"tags": ["a", "b", "c",],
						},
						{
							/* second item */
							"id": 2,
							"tags": [
								"d",
								"e", // trailing comma in array
							],
						},
					],
				},
			},
		}`;
		const result = parseJSONC(input) as any;
		expect(result.level1.level2.level3).toHaveLength(2);
		expect(result.level1.level2.level3[0]).toEqual({ id: 1, tags: ['a', 'b', 'c'] });
		expect(result.level1.level2.level3[1]).toEqual({ id: 2, tags: ['d', 'e'] });
	});

	// 13. Backslash in string values — Windows paths are preserved
	test('Windows paths with backslashes are preserved', () => {
		const input = '{"path": "C:\\\\Users\\\\foo\\\\bar"}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ path: 'C:\\Users\\foo\\bar' });
	});

	test('Windows paths with comments nearby', () => {
		const input = `{
			// Windows file path
			"outDir": "C:\\\\Users\\\\dev\\\\project\\\\dist",
			"rootDir": "C:\\\\Users\\\\dev\\\\project\\\\src", // source root
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({
			outDir: 'C:\\Users\\dev\\project\\dist',
			rootDir: 'C:\\Users\\dev\\project\\src',
		});
	});

	test('various escape sequences in strings are preserved', () => {
		const input = '{"tab": "a\\tb", "newline": "a\\nb", "backslash": "a\\\\b"}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ tab: 'a\tb', newline: 'a\nb', backslash: 'a\\b' });
	});

	// Edge cases
	test('handles mixed comment styles together', () => {
		const input = `{
			// single-line
			"a": 1, /* inline block */
			/* block
			comment */
			"b": 2 // end-of-line
		}`;
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ a: 1, b: 2 });
	});

	test('trailing comma regex applies to entire result including strings', () => {
		// Note: the trailing-comma regex runs on the full stripped string, so `,}` and `,]`
		// inside string values are also affected. This is a known trade-off of the lightweight
		// approach. In practice, config files rarely have `,}` or `,]` as literal string content.
		const input = '{"pattern": "a,}b,]c"}';
		const result = parseJSONC(input) as Record<string, unknown>;
		expect(result).toEqual({ pattern: 'a}b]c' });
	});
});
