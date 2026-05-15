/**
 * End-to-end checks for the KeyValue service across all 7 frameworks.
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

interface KvCheck {
	framework: string;
	/**
	 * Either a whole-file path the KV service drops in (most frameworks)
	 * or null if the service contributes only to a composable file
	 * (hono adds the route via its `server` composable).
	 */
	preferencesFiles?: string[];
	pageFile: string;
	/**
	 * For frameworks where the routes live inside a composable server
	 * file rather than a dedicated route file, identify that file so we
	 * can assert the route was spliced in.
	 */
	serverFile?: string;
}

const kvChecks: KvCheck[] = [
	{
		framework: 'nextjs',
		preferencesFiles: ['src/app/api/preferences/route.ts'],
		pageFile: 'src/app/page.tsx',
	},
	{
		framework: 'nuxt',
		preferencesFiles: ['server/api/preferences.get.ts', 'server/api/preferences.post.ts'],
		pageFile: 'app/app.vue',
	},
	{
		framework: 'sveltekit',
		preferencesFiles: ['src/routes/api/preferences/+server.ts'],
		pageFile: 'src/routes/+page.svelte',
	},
	{
		framework: 'astro',
		preferencesFiles: ['src/pages/api/preferences.ts'],
		pageFile: 'src/pages/index.astro',
	},
	{
		framework: 'hono',
		serverFile: 'src/index.ts',
		pageFile: 'src/landing.tsx',
	},
];

describe('framework + keyvalue composition', () => {
	for (const check of kvChecks) {
		test(`${check.framework}: composes the keyvalue service end-to-end`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-kv-`));
			cleanup.push(dest);

			await cp(baseDir, dest, { recursive: true });
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
				selectedServices: ['keyvalue'],
				templatesRoot,
				logger: createMockLogger(),
			});

			// Whole files exist (when applicable).
			for (const path of check.preferencesFiles ?? []) {
				const c = await readFile(join(dest, path), 'utf8');
				expect(c.length).toBeGreaterThan(0);
				expect(c).toContain('@agentuity/keyvalue');
				expect(c).not.toContain('@agentuity:');
			}

			// For server-composed frameworks, the KV preferences endpoint
			// should be present in the server file.
			if (check.serverFile) {
				const s = await readFile(join(dest, check.serverFile), 'utf8');
				expect(s).toContain('@agentuity/keyvalue');
				expect(s).toContain('/api/preferences');
				expect(s).not.toContain('@agentuity:');
			}

			// Page references the preferences endpoint and reads/sets prefs.
			const pageOut = await readFile(join(dest, check.pageFile), 'utf8');
			expect(pageOut).toContain('/api/preferences');
			expect(pageOut).not.toContain('@agentuity:');

			// package.json picked up the service dep.
			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@agentuity/keyvalue']).toBeDefined();
		});
	}
});
