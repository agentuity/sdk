import { describe, test, expect, afterAll } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import type { BunPlugin } from 'bun';
import {
	rewriteBunImports,
	rewritePgImports,
	getLoaderForPath,
} from '../../src/cmd/build/vite/db-rewrite';

const testDir = join(tmpdir(), `db-rewrite-bundle-test-${Date.now()}`);

afterAll(async () => {
	await rm(testDir, { recursive: true, force: true });
});

/**
 * Build a fixture file through Bun.build with the db-rewrite plugin and return
 * the bundled output text.
 *
 * For the integration test we keep `@agentuity/postgres` as an external so we
 * don't need the full dependency chain available. The key thing we verify is
 * that the plugin rewrites the imports correctly: the output should reference
 * `@agentuity/postgres` instead of `bun` or `pg` for the target specifiers.
 */
async function buildFixture(fixtureCode: string, opts?: { external?: string[] }): Promise<string> {
	const fixtureDir = join(testDir, `fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(fixtureDir, { recursive: true });
	const outDir = join(fixtureDir, 'out');
	await mkdir(outDir, { recursive: true });

	const fixturePath = join(fixtureDir, 'input.ts');
	await Bun.write(fixturePath, fixtureCode);

	const plugin: BunPlugin = {
		name: 'agentuity:db-rewrite',
		setup(build) {
			build.onLoad({ filter: /\.[cm]?[jt]sx?$/, namespace: 'file' }, async (args) => {
				if (args.path.includes('/node_modules/')) return;
				const contents = await Bun.file(args.path).text();
				let updated = contents;
				let changed = false;

				const bunResult = rewriteBunImports(updated);
				if (bunResult.changed) {
					updated = bunResult.contents;
					changed = true;
				}

				const pgResult = rewritePgImports(updated);
				if (pgResult.changed) {
					updated = pgResult.contents;
					changed = true;
				}

				if (!changed) return;
				return { contents: updated, loader: getLoaderForPath(args.path) as Bun.Loader };
			});
		},
	};

	const result = await Bun.build({
		entrypoints: [fixturePath],
		outdir: outDir,
		target: 'bun',
		external: opts?.external ?? ['bun', 'pg', '@agentuity/postgres'],
		plugins: [plugin],
	});

	if (!result.success) {
		const messages = result.logs.map((l) => l.message || String(l)).join('\n');
		throw new Error(`Build failed:\n${messages}`);
	}

	// Read the output bundle
	const outputPath = join(outDir, 'input.js');
	return Bun.file(outputPath).text();
}

describe('db-rewrite integration (Bun.build)', () => {
	test('SQL import from bun is rewritten to @agentuity/postgres', async () => {
		const output = await buildFixture(`
import { SQL } from 'bun';
const sql = new SQL('postgres://localhost/test');
export { sql };
`);
		// The output should now import SQL from @agentuity/postgres
		expect(output).toContain('@agentuity/postgres');
		// SQL should NOT be imported from bun
		expect(output).not.toMatch(/import\s*\{[^}]*\bSQL\b[^}]*\}\s*from\s*['"]bun['"]/);
	});

	test('Pool import from pg is rewritten to @agentuity/postgres', async () => {
		const output = await buildFixture(`
import { Pool } from 'pg';
const pool = new Pool({ connectionString: 'postgres://localhost/test' });
export { pool };
`);
		// The output should now import Pool from @agentuity/postgres
		expect(output).toContain('@agentuity/postgres');
		// Pool should NOT be imported from 'pg'
		expect(output).not.toMatch(/import\s*\{[^}]*\bPool\b[^}]*\}\s*from\s*['"]pg['"]/);
	});

	test('non-SQL bun imports remain external and unchanged', async () => {
		const output = await buildFixture(`
import { serve } from 'bun';
const server = serve({ port: 3000, fetch: () => new Response('ok') });
export { server };
`);
		// No @agentuity/postgres rewrite should happen for non-SQL imports
		expect(output).not.toContain('@agentuity/postgres');
		// The serve function should still be referenced in the output
		expect(output).toContain('serve');
	});

	test('mixed bun imports: SQL is rewritten, serve remains with bun', async () => {
		const output = await buildFixture(`
import { SQL, serve } from 'bun';
const sql = new SQL('postgres://localhost/test');
const server = serve({ port: 3000, fetch: () => new Response('ok') });
export { sql, server };
`);
		// SQL should be from @agentuity/postgres
		expect(output).toContain('@agentuity/postgres');
		// SQL should NOT remain in a bun import
		expect(output).not.toMatch(/import\s*\{[^}]*\bSQL\b[^}]*\}\s*from\s*['"]bun['"]/);
		// serve should still reference bun (either import or globalThis.Bun)
		expect(output).toContain('serve');
	});

	test('combined SQL + Pool rewrites in a single file', async () => {
		const output = await buildFixture(`
import { SQL } from 'bun';
import { Pool } from 'pg';
const sql = new SQL('postgres://localhost/test');
const pool = new Pool({ connectionString: 'postgres://localhost/test' });
export { sql, pool };
`);
		// Both should be rewritten to @agentuity/postgres
		expect(output).toContain('@agentuity/postgres');
		// Neither should be imported from their original modules
		expect(output).not.toMatch(/import\s*\{[^}]*\bSQL\b[^}]*\}\s*from\s*['"]bun['"]/);
		expect(output).not.toMatch(/import\s*\{[^}]*\bPool\b[^}]*\}\s*from\s*['"]pg['"]/);
	});
});
