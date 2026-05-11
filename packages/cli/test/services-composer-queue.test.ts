/**
 * End-to-end checks for the Queue service across all supported frameworks.
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

interface QueueCheck {
	framework: string;
	jobsFile?: string;
	pageFile: string;
	serverFile?: string;
}

const queueChecks: QueueCheck[] = [
	{
		framework: 'nextjs',
		jobsFile: 'src/app/api/jobs/route.ts',
		pageFile: 'src/app/page.tsx',
	},
	{
		framework: 'nuxt',
		jobsFile: 'server/api/jobs.post.ts',
		pageFile: 'app/app.vue',
	},
	{
		framework: 'sveltekit',
		jobsFile: 'src/routes/api/jobs/+server.ts',
		pageFile: 'src/routes/+page.svelte',
	},
	{
		framework: 'astro',
		jobsFile: 'src/pages/api/jobs.ts',
		pageFile: 'src/pages/index.astro',
	},
	{ framework: 'hono', serverFile: 'src/index.ts', pageFile: 'src/landing.tsx' },
];

describe('framework + queue composition', () => {
	for (const check of queueChecks) {
		test(`${check.framework}: composes the queue service end-to-end`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-q-`));
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
				selectedServices: ['queue'],
				templatesRoot,
				logger: createMockLogger(),
			});

			if (check.jobsFile) {
				const c = await readFile(join(dest, check.jobsFile), 'utf8');
				expect(c).toContain('@agentuity/queue');
				expect(c).toContain('createQueue');
				expect(c).toContain('publish');
				expect(c).not.toContain('@agentuity:');
			}
			if (check.serverFile) {
				const c = await readFile(join(dest, check.serverFile), 'utf8');
				expect(c).toContain('@agentuity/queue');
				expect(c).toContain('/api/jobs');
				expect(c).toContain('createQueue');
				expect(c).toContain('publish');
				expect(c).not.toContain('@agentuity:');
			}

			const pageOut = await readFile(join(dest, check.pageFile), 'utf8');
			expect(pageOut).toContain('Queue translation');
			expect(pageOut).toContain('Queued translations');
			expect(pageOut).not.toContain('@agentuity:');

			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['@agentuity/queue']).toBeDefined();
		});
	}
});
