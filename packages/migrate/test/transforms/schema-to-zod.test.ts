import { describe, expect, it } from 'bun:test';
import { schemaToZod } from '../../src/transforms/v3/schema-to-zod.ts';

describe('schemaToZod transform', () => {
	it('returns unchanged when the file does not import @agentuity/schema', () => {
		const src = `import { z } from 'zod';\nconst A = z.object({});\n`;
		const out = schemaToZod(src);
		expect(out.changed).toBe(false);
		expect(out.source).toBe(src);
	});

	it('replaces the import and basic builders', () => {
		const src = `import { s } from '@agentuity/schema';\nconst A = s.object({ x: s.string() });\n`;
		const out = schemaToZod(src);
		expect(out.changed).toBe(true);
		expect(out.source).toContain("import { z } from 'zod'");
		expect(out.source).toContain('z.object({ x: z.string() })');
	});

	it('replaces s.infer<typeof X> with z.infer<typeof X>', () => {
		const src =
			"import { s } from '@agentuity/schema';\n" +
			'const A = s.object({});\n' +
			'type T = s.infer<typeof A>;\n';
		const out = schemaToZod(src);
		expect(out.source).toContain('z.infer<typeof A>');
	});

	it('rewrites variadic z.union(a, b) into z.union([a, b])', () => {
		const src =
			"import { s } from '@agentuity/schema';\n" +
			'const U = s.union(s.string(), s.number());\n';
		const out = schemaToZod(src);
		expect(out.source).toContain('z.union([z.string(), z.number()])');
	});

	it("rewrites array-form .pick(['a']) into mask form .pick({ a: true })", () => {
		const src =
			"import { s } from '@agentuity/schema';\n" +
			'const A = s.object({ x: s.string(), y: s.number(), zKey: s.boolean() });\n' +
			"const B = A.pick(['x', 'y']);\n";
		const out = schemaToZod(src);
		expect(out.source).toContain('.pick({ x: true, y: true })');
		expect(out.source).not.toContain(".pick(['x'");
	});

	it("rewrites array-form .omit(['a']) into mask form .omit({ a: true })", () => {
		const src =
			"import { s } from '@agentuity/schema';\n" +
			"const A = s.object({ x: s.string() }).omit(['x']);\n";
		const out = schemaToZod(src);
		expect(out.source).toContain('.omit({ x: true })');
	});

	it('handles single-key pick with a trailing comma', () => {
		const src = "import { s } from '@agentuity/schema';\n" + "const B = A.pick(['only',]);\n";
		const out = schemaToZod(src);
		expect(out.source).toContain('.pick({ only: true })');
	});

	it('leaves non-literal-array pick/omit arguments untouched', () => {
		const src =
			"import { s } from '@agentuity/schema';\n" +
			"const KEYS = ['x'] as const;\n" +
			'const B = A.pick(KEYS);\n';
		const out = schemaToZod(src);
		// `.pick(KEYS)` is not a literal-array form, so we don\'t rewrite it.
		expect(out.source).toContain('.pick(KEYS)');
	});

	it('flags pick with mixed-type array entries with a TODO', () => {
		const src =
			"import { s } from '@agentuity/schema';\n" + "const B = A.pick(['x', otherKey, 'y']);\n";
		const out = schemaToZod(src);
		expect(out.source).toContain('TODO: rewrite as zod 4 mask');
	});

	it('flags s.toJSONSchema as a manual swap', () => {
		const src =
			"import { s } from '@agentuity/schema';\n" + 'const A = s.toJSONSchema(s.object({}));\n';
		const out = schemaToZod(src);
		expect(out.source).toContain('TODO: replace with zodToJsonSchema');
	});

	it('rewrites coerce builders to zod nested form', () => {
		const src = "import { s } from '@agentuity/schema';\nconst A = s.coerceNumber();\n";
		const out = schemaToZod(src);
		expect(out.source).toContain('z.coerce.number()');
	});

	it('drops bare type imports from @agentuity/schema', () => {
		const src =
			"import type { Schema } from '@agentuity/schema';\nimport { s } from '@agentuity/schema';\nconst A = s.string();\n";
		const out = schemaToZod(src);
		expect(out.source).not.toContain('@agentuity/schema');
		expect(out.changes).toContain('Removed type imports from @agentuity/schema');
	});
});
