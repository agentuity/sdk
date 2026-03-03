import { describe, test, expect } from 'bun:test';
import {
	getLoaderForPath,
	rewriteNamedSpecifiers,
	rewriteBunImports,
	rewritePgImports,
} from '../../src/cmd/build/vite/db-rewrite.ts';

// ---------------------------------------------------------------------------
// getLoaderForPath
// ---------------------------------------------------------------------------

describe('getLoaderForPath', () => {
	test('.ts → ts', () => {
		expect(getLoaderForPath('src/index.ts')).toBe('ts');
	});

	test('.tsx → tsx', () => {
		expect(getLoaderForPath('src/App.tsx')).toBe('tsx');
	});

	test('.js → js', () => {
		expect(getLoaderForPath('lib/index.js')).toBe('js');
	});

	test('.jsx → jsx', () => {
		expect(getLoaderForPath('lib/App.jsx')).toBe('jsx');
	});

	test('.mjs → js', () => {
		expect(getLoaderForPath('lib/index.mjs')).toBe('js');
	});

	test('.cjs → js', () => {
		expect(getLoaderForPath('lib/index.cjs')).toBe('js');
	});

	test('.mts → ts', () => {
		expect(getLoaderForPath('src/index.mts')).toBe('ts');
	});

	test('.cts → ts', () => {
		expect(getLoaderForPath('src/index.cts')).toBe('ts');
	});

	test('unknown extension → js (default)', () => {
		expect(getLoaderForPath('data/config.json')).toBe('js');
	});
});

// ---------------------------------------------------------------------------
// rewriteNamedSpecifiers
// ---------------------------------------------------------------------------

describe('rewriteNamedSpecifiers', () => {
	test('target found: SQL with target SQL → moved', () => {
		const result = rewriteNamedSpecifiers('SQL', 'SQL');
		expect(result.moved).toBe(true);
		expect(result.move).toEqual(['SQL']);
		expect(result.stay).toEqual([]);
	});

	test('target not found: serve with target SQL → not moved', () => {
		const result = rewriteNamedSpecifiers('serve', 'SQL');
		expect(result.moved).toBe(false);
		expect(result.move).toEqual([]);
		expect(result.stay).toEqual(['serve']);
	});

	test('mixed: SQL, serve → SQL moves, serve stays', () => {
		const result = rewriteNamedSpecifiers('SQL, serve', 'SQL');
		expect(result.moved).toBe(true);
		expect(result.move).toEqual(['SQL']);
		expect(result.stay).toEqual(['serve']);
	});

	test('aliased: SQL as MySQL → moves (match on import name)', () => {
		const result = rewriteNamedSpecifiers('SQL as MySQL', 'SQL');
		expect(result.moved).toBe(true);
		expect(result.move).toEqual(['SQL as MySQL']);
		expect(result.stay).toEqual([]);
	});

	test('type specifier: type SQL → stays', () => {
		const result = rewriteNamedSpecifiers('type SQL', 'SQL');
		expect(result.moved).toBe(false);
		expect(result.move).toEqual([]);
		expect(result.stay).toEqual(['type SQL']);
	});

	test('mixed type + value: type SQLOptions, SQL → SQLOptions stays, SQL moves', () => {
		const result = rewriteNamedSpecifiers('type SQLOptions, SQL', 'SQL');
		expect(result.moved).toBe(true);
		expect(result.move).toEqual(['SQL']);
		expect(result.stay).toEqual(['type SQLOptions']);
	});

	test('empty string → no moves', () => {
		const result = rewriteNamedSpecifiers('', 'SQL');
		expect(result.moved).toBe(false);
		expect(result.move).toEqual([]);
		expect(result.stay).toEqual([]);
	});

	test('whitespace only → no moves', () => {
		const result = rewriteNamedSpecifiers('   ', 'SQL');
		expect(result.moved).toBe(false);
		expect(result.move).toEqual([]);
		expect(result.stay).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// rewriteBunImports
// ---------------------------------------------------------------------------

describe('rewriteBunImports', () => {
	test("import { SQL } from 'bun'; → @agentuity/postgres", () => {
		const input = "import { SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("from '@agentuity/postgres'");
		expect(contents).toContain('SQL');
	});

	test('import { SQL } from "bun"; → same (double quotes)', () => {
		const input = 'import { SQL } from "bun";';
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("from '@agentuity/postgres'");
	});

	test("import { serve } from 'bun'; → unchanged (no SQL)", () => {
		const input = "import { serve } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import { SQL, serve } from 'bun'; → split into two imports", () => {
		const input = "import { SQL, serve } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { serve } from 'bun';");
		expect(contents).toContain("import { SQL } from '@agentuity/postgres';");
	});

	test("import type { SQL } from 'bun'; → unchanged (type-only)", () => {
		const input = "import type { SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import { type SQL } from 'bun'; → unchanged (inline type)", () => {
		const input = "import { type SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import { type SQLOptions, SQL } from 'bun'; → split: type stays with bun, SQL moves", () => {
		const input = "import { type SQLOptions, SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { type SQLOptions } from 'bun';");
		expect(contents).toContain("import { SQL } from '@agentuity/postgres';");
	});

	test("export { SQL } from 'bun'; → export from @agentuity/postgres", () => {
		const input = "export { SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("export { SQL } from '@agentuity/postgres';");
	});

	test("import { SQL as Database } from 'bun'; → preserves alias", () => {
		const input = "import { SQL as Database } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { SQL as Database } from '@agentuity/postgres';");
	});

	test('indented: preserves tab indentation', () => {
		const input = "\n\timport { SQL } from 'bun';";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("\timport { SQL } from '@agentuity/postgres';");
	});

	test('multiple imports in same file: both get rewritten', () => {
		const input = [
			"import { SQL } from 'bun';",
			'const x = 1;',
			"import { SQL as DB } from 'bun';",
		].join('\n');
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		// Both SQL imports should be rewritten
		const matches = contents.match(/@agentuity\/postgres/g);
		expect(matches).not.toBeNull();
		expect(matches!.length).toBe(2);
	});

	test("no semicolon: import { SQL } from 'bun' → works", () => {
		const input = "import { SQL } from 'bun'";
		const { contents, changed } = rewriteBunImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("from '@agentuity/postgres'");
	});
});

// ---------------------------------------------------------------------------
// rewritePgImports
// ---------------------------------------------------------------------------

describe('rewritePgImports', () => {
	test("import { Pool } from 'pg'; → @agentuity/postgres", () => {
		const input = "import { Pool } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("from '@agentuity/postgres'");
		expect(contents).toContain('Pool');
	});

	test("import { Client } from 'pg'; → unchanged (not Pool)", () => {
		const input = "import { Client } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import { Pool, Client } from 'pg'; → split: Client stays, Pool moves", () => {
		const input = "import { Pool, Client } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { Client } from 'pg';");
		expect(contents).toContain("import { Pool } from '@agentuity/postgres';");
	});

	test("import pg from 'pg'; → unchanged (default import)", () => {
		const input = "import pg from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import pg, { Pool } from 'pg'; → split: default stays with pg, Pool moves", () => {
		const input = "import pg, { Pool } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import pg from 'pg';");
		expect(contents).toContain("import { Pool } from '@agentuity/postgres';");
	});

	test("import type { PoolConfig } from 'pg'; → unchanged (type-only)", () => {
		const input = "import type { PoolConfig } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("import { type PoolConfig, Pool } from 'pg'; → split correctly", () => {
		const input = "import { type PoolConfig, Pool } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { type PoolConfig } from 'pg';");
		expect(contents).toContain("import { Pool } from '@agentuity/postgres';");
	});

	test("import * as pg from 'pg'; → unchanged (namespace)", () => {
		const input = "import * as pg from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(false);
		expect(contents).toBe(input);
	});

	test("export { Pool } from 'pg'; → export from @agentuity/postgres", () => {
		const input = "export { Pool } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("export { Pool } from '@agentuity/postgres';");
	});

	test("export { Pool, Client } from 'pg'; → split", () => {
		const input = "export { Pool, Client } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("export { Client } from 'pg';");
		expect(contents).toContain("export { Pool } from '@agentuity/postgres';");
	});

	test("import { Pool as PgPool } from 'pg'; → preserves alias", () => {
		const input = "import { Pool as PgPool } from 'pg';";
		const { contents, changed } = rewritePgImports(input);
		expect(changed).toBe(true);
		expect(contents).toContain("import { Pool as PgPool } from '@agentuity/postgres';");
	});
});
