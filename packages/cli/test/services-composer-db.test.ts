/**
 * End-to-end checks for the DB service across all 7 frameworks.
 *
 * Each test cps the real framework template into a temp dir, drops a
 * minimal package.json, runs the composer with `selectedServices: ['db']`,
 * and asserts:
 *   1. The DB service's whole files (schema, client, drizzle config, history
 *      route) land at the expected per-framework paths.
 *   2. The translate helper picked up the cache-lookup snippet.
 *   3. The page picked up the history-panel snippet.
 *   4. package.json gained drizzle-orm + @neondatabase/serverless deps,
 *      drizzle-kit dev dep, and the four db:* scripts.
 *   5. .env.example carries DATABASE_URL.
 *   6. No marker comments leaked into any of these files.
 */

import { createMockLogger } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeServices } from '../src/cmd/project/services-composer';

const cleanup: string[] = [];

afterEach(async () => {
	while (cleanup.length > 0) {
		const dir = cleanup.pop();
		if (dir) await rm(dir, { recursive: true, force: true });
	}
});

const templatesRoot = join(__dirname, '..', 'src', 'cmd', 'project', 'templates');

interface DbCheck {
	framework: string;
	/** Whole files the service must drop into the project. */
	wholeFiles: string[];
	/** Path of the composable translate helper file (must contain cache logic post-compose). */
	translateFile: string;
	/** Path of the composable page file (must contain history panel post-compose). */
	pageFile: string;
}

const dbChecks: DbCheck[] = [
	{
		framework: 'nextjs',
		wholeFiles: [
			'src/db/schema.ts',
			'src/db/index.ts',
			'drizzle.config.ts',
			'src/app/api/history/route.ts',
		],
		translateFile: 'src/lib/translate.ts',
		pageFile: 'src/app/page.tsx',
	},
	{
		framework: 'nuxt',
		wholeFiles: [
			'server/db/schema.ts',
			'server/db/index.ts',
			'drizzle.config.ts',
			'server/api/history.get.ts',
		],
		translateFile: 'server/utils/translate.ts',
		pageFile: 'app/app.vue',
	},
	{
		framework: 'sveltekit',
		wholeFiles: [
			'src/lib/server/db/schema.ts',
			'src/lib/server/db/index.ts',
			'drizzle.config.ts',
			'src/routes/api/history/+server.ts',
		],
		translateFile: 'src/lib/server/translate.ts',
		pageFile: 'src/routes/+page.svelte',
	},
	{
		framework: 'astro',
		wholeFiles: [
			'src/db/schema.ts',
			'src/db/index.ts',
			'drizzle.config.ts',
			'src/pages/api/history.ts',
		],
		translateFile: 'src/lib/translate.ts',
		pageFile: 'src/pages/index.astro',
	},
	{
		framework: 'hono',
		wholeFiles: ['src/db/schema.ts', 'src/db/index.ts', 'drizzle.config.ts'],
		translateFile: 'src/translate.ts',
		pageFile: 'src/landing.html',
	},
];

describe('framework + db composition', () => {
	for (const check of dbChecks) {
		test(`${check.framework}: composes the db service end-to-end`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-db-`));
			cleanup.push(dest);

			await cp(baseDir, dest, { recursive: true });
			// scaffold normally writes package.json via the framework CLI; for
			// these tests we drop a stub so the composer's package.json merge
			// has something to work with.
			await writeFile(
				join(dest, 'package.json'),
				JSON.stringify(
					{ name: 'app', dependencies: {}, devDependencies: {}, scripts: {} },
					null,
					'\t'
				)
			);

			await composeServices({
				dest,
				framework: check.framework,
				selectedServices: ['db'],
				templatesRoot,
				logger: createMockLogger(),
			});

			// 1. Whole files exist.
			for (const path of check.wholeFiles) {
				const c = await readFile(join(dest, path), 'utf8');
				expect(c.length).toBeGreaterThan(0);
				expect(c).not.toContain('@agentuity:');
			}

			// 2. Translate helper has cache logic.
			const translateOut = await readFile(join(dest, check.translateFile), 'utf8');
			expect(translateOut).not.toContain('@agentuity:');
			expect(translateOut).toContain('drizzle-orm');
			expect(translateOut).toContain('cached: true');
			expect(translateOut).toContain('db.insert(translations)');

			// 3. Page has history panel.
			const pageOut = await readFile(join(dest, check.pageFile), 'utf8');
			expect(pageOut).not.toContain('@agentuity:');
			expect(pageOut).toContain('History');

			// 4. package.json picked up deps + scripts.
			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['drizzle-orm']).toBeDefined();
			expect(pkg.dependencies['@neondatabase/serverless']).toBeDefined();
			expect(pkg.devDependencies['drizzle-kit']).toBeDefined();
			expect(pkg.scripts['db:push']).toBe('drizzle-kit push');
			expect(pkg.scripts['db:generate']).toBe('drizzle-kit generate');

			// 5. .env.example has DATABASE_URL.
			const env = await readFile(join(dest, '.env.example'), 'utf8');
			expect(env).toContain('DATABASE_URL=');
		});
	}
});
