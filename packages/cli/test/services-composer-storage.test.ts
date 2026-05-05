/**
 * End-to-end checks for the Storage service across all 7 frameworks.
 *
 * Storage requires DB (declared in its manifest), so selecting only
 * 'storage' should pull DB in via resolveSelection. Tests assert both
 * services land cleanly in each framework.
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

interface StorageCheck {
	framework: string;
	storageClient: string;
	exportFile?: string;
	pageFile: string;
	serverFile?: string;
}

const storageChecks: StorageCheck[] = [
	{
		framework: 'nextjs',
		storageClient: 'src/storage/index.ts',
		exportFile: 'src/app/api/export/route.ts',
		pageFile: 'src/app/page.tsx',
	},
	{
		framework: 'remix',
		storageClient: 'app/storage/index.ts',
		exportFile: 'app/routes/api.export.ts',
		pageFile: 'app/routes/home.tsx',
	},
	{
		framework: 'vite-react',
		storageClient: 'server/storage/index.ts',
		serverFile: 'server.ts',
		pageFile: 'src/App.tsx',
	},
	{
		framework: 'nuxt',
		storageClient: 'server/storage/index.ts',
		exportFile: 'server/api/export.post.ts',
		pageFile: 'app.vue',
	},
	{
		framework: 'sveltekit',
		storageClient: 'src/lib/server/storage/index.ts',
		exportFile: 'src/routes/api/export/+server.ts',
		pageFile: 'src/routes/+page.svelte',
	},
	{
		framework: 'astro',
		storageClient: 'src/storage/index.ts',
		exportFile: 'src/pages/api/export.ts',
		pageFile: 'src/pages/index.astro',
	},
	{
		framework: 'hono',
		storageClient: 'src/storage/index.ts',
		serverFile: 'src/index.ts',
		pageFile: 'src/landing.html',
	},
];

describe('framework + storage composition (auto-pulls db)', () => {
	for (const check of storageChecks) {
		test(`${check.framework}: composes storage end-to-end`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-st-`));
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

			// Pick only 'storage'; resolveSelection should auto-include 'db'.
			await composeServices({
				dest,
				framework: check.framework,
				selectedServices: ['storage'],
				templatesRoot,
				logger: createMockLogger(),
			});

			// Storage client file landed.
			const sc = await readFile(join(dest, check.storageClient), 'utf8');
			expect(sc).toContain('@agentuity/storage');
			expect(sc).toContain('createS3Client');

			if (check.exportFile) {
				const c = await readFile(join(dest, check.exportFile), 'utf8');
				expect(c).toContain('s3.file');
				expect(c).toContain('translations');
				expect(c).not.toContain('@agentuity:');
			}
			if (check.serverFile) {
				const c = await readFile(join(dest, check.serverFile), 'utf8');
				expect(c).toContain('/api/export');
				expect(c).toContain('s3.file');
				expect(c).not.toContain('@agentuity:');
			}

			const pageOut = await readFile(join(dest, check.pageFile), 'utf8');
			expect(pageOut).toContain('Export history');
			expect(pageOut).not.toContain('@agentuity:');

			// db was auto-pulled in.
			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@agentuity/storage']).toBeDefined();
			expect(pkg.dependencies['drizzle-orm']).toBeDefined();
			expect(pkg.devDependencies['drizzle-kit']).toBeDefined();

			// Both env vars (DATABASE_URL from db, AGENTUITY_BUCKET_* from storage).
			const env = await readFile(join(dest, '.env.example'), 'utf8');
			expect(env).toContain('DATABASE_URL=');
			expect(env).toContain('AGENTUITY_BUCKET_ENDPOINT=');
		});
	}
});
