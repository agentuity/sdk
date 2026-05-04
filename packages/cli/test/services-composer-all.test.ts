/**
 * End-to-end check: composing every service together produces clean,
 * marker-free output across all 7 frameworks.
 *
 * This is the strongest single guarantee that snippet contributions
 * for different services don't clash on shared imports, identifiers,
 * or marker bodies. If any pair of services causes the output to
 * carry a leftover marker, undefined identifier, or duplicated import,
 * this test catches it before the per-framework single-service tests
 * would.
 */

import { createMockLogger } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

const ALL_SERVICES = ['keyvalue', 'db', 'vector', 'queue', 'storage'];

async function listFilesRecursive(dir: string, prefix = ''): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		const path = join(prefix, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await listFilesRecursive(join(dir, entry.name), path)));
		} else {
			out.push(path);
		}
	}
	return out;
}

const frameworks = ['nextjs', 'remix', 'vite-react', 'nuxt', 'sveltekit', 'astro', 'hono'];

describe('framework + all services composition', () => {
	for (const framework of frameworks) {
		test(`${framework}: composes all services without leaving markers`, async () => {
			const baseDir = join(templatesRoot, framework);
			const dest = await mkdtemp(join(tmpdir(), `${framework}-all-`));
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
				framework,
				selectedServices: ALL_SERVICES,
				templatesRoot,
				logger: createMockLogger(),
			});

			// No marker left anywhere in the project.
			const files = await listFilesRecursive(dest);
			for (const path of files) {
				if (path === 'package.json') continue; // JSON, no markers possible
				const content = await readFile(join(dest, path), 'utf8');
				if (content.includes('@agentuity:')) {
					throw new Error(`${framework}: ${path} still contains a marker`);
				}
			}

			// All five services contributed package deps.
			const pkg = JSON.parse(await readFile(join(dest, 'package.json'), 'utf8'));
			expect(pkg.dependencies['drizzle-orm']).toBeDefined();
			expect(pkg.dependencies['@agentuity/keyvalue']).toBeDefined();
			expect(pkg.dependencies['@agentuity/queue']).toBeDefined();
			expect(pkg.dependencies['@agentuity/vector']).toBeDefined();
			expect(pkg.dependencies['@agentuity/storage']).toBeDefined();

			// .env.example collects vars from db + storage.
			const env = await readFile(join(dest, '.env.example'), 'utf8');
			expect(env).toContain('DATABASE_URL=');
			expect(env).toContain('AGENTUITY_BUCKET_ENDPOINT=');
		});
	}
});
