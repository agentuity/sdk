/**
 * End-to-end checks for the Vector service across all 7 frameworks.
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

interface VecCheck {
	framework: string;
	similarFile?: string;
	pageFile: string;
	translateFile: string;
	serverFile?: string;
}

const vecChecks: VecCheck[] = [
	{
		framework: 'nextjs',
		similarFile: 'src/app/api/similar/route.ts',
		pageFile: 'src/app/page.tsx',
		translateFile: 'src/lib/translate.ts',
	},
	{
		framework: 'nuxt',
		similarFile: 'server/api/similar.get.ts',
		pageFile: 'app/app.vue',
		translateFile: 'server/utils/translate.ts',
	},
	{
		framework: 'sveltekit',
		similarFile: 'src/routes/api/similar/+server.ts',
		pageFile: 'src/routes/+page.svelte',
		translateFile: 'src/lib/server/translate.ts',
	},
	{
		framework: 'astro',
		similarFile: 'src/pages/api/similar.ts',
		pageFile: 'src/pages/index.astro',
		translateFile: 'src/lib/translate.ts',
	},
	{
		framework: 'hono',
		serverFile: 'src/index.ts',
		pageFile: 'src/landing.tsx',
		translateFile: 'src/translate.ts',
	},
];

describe('framework + vector composition', () => {
	for (const check of vecChecks) {
		test(`${check.framework}: composes the vector service end-to-end`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-v-`));
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
				selectedServices: ['vector'],
				templatesRoot,
				logger: createMockLogger(),
			});

			// Translate helper has the upsert.
			const trans = await readFile(join(dest, check.translateFile), 'utf8');
			expect(trans).toContain('@agentuity/vector');
			expect(trans).toContain('vector.upsert');
			expect(trans).not.toContain('@agentuity:');

			if (check.similarFile) {
				const c = await readFile(join(dest, check.similarFile), 'utf8');
				expect(c).toContain('@agentuity/vector');
				expect(c).toContain('vector.search');
				expect(c).not.toContain('@agentuity:');
			}
			if (check.serverFile) {
				const c = await readFile(join(dest, check.serverFile), 'utf8');
				expect(c).toContain('@agentuity/vector');
				expect(c).toContain('/api/similar');
				expect(c).not.toContain('@agentuity:');
			}

			const pageOut = await readFile(join(dest, check.pageFile), 'utf8');
			expect(pageOut).toContain('Similar past translations');
			expect(pageOut).not.toContain('@agentuity:');

			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@agentuity/vector']).toBeDefined();
		});
	}
});
