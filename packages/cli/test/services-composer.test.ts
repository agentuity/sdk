/**
 * Composer tests build a synthetic templates tree in a temp directory,
 * exercise `composeServices` against it, and assert on the output.
 *
 * The composer now has a simplified flow:
 *   1. Copy whole files owned by the service.
 *   2. Inject a services checklist into the landing page.
 *   3. Merge package.json and .env.example.
 */

import { createMockLogger } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeServices } from '../src/cmd/project/services-composer';

interface Fixture {
	root: string;
	templatesRoot: string;
	dest: string;
}

const cleanup: string[] = [];

async function makeFixture(): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), 'composer-'));
	cleanup.push(root);
	const templatesRoot = join(root, 'templates');
	const dest = join(root, 'project');
	await mkdir(templatesRoot, { recursive: true });
	await mkdir(dest, { recursive: true });
	return { root, templatesRoot, dest };
}

async function writeFile_(path: string, content: string): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, content);
}

afterEach(async () => {
	while (cleanup.length > 0) {
		const dir = cleanup.pop();
		if (dir) await rm(dir, { recursive: true, force: true });
	}
});

describe('composeServices', () => {
	test('strips checklist marker when no services are selected', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: {
					path: 'src/app/page.tsx',
					syntax: '{/* */}',
				},
			})
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t{/* @agentuity:services-checklist */}',
				'\t\t</div>',
				'\t);',
				'}',
				'',
			].join('\n')
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: [],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/app/page.tsx'), 'utf8');
		expect(out).not.toContain('@agentuity:services-checklist');
	});

	test('injects a checklist when services are selected (JSX syntax)', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: {
					path: 'src/app/page.tsx',
					syntax: '{/* */}',
				},
			})
		);

		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'Database',
				hint: '',
				description: '',
				order: 20,
				packages: ['drizzle-orm'],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t{/* @agentuity:services-checklist */}',
				'\t\t</div>',
				'\t);',
				'}',
				'',
			].join('\n')
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/app/page.tsx'), 'utf8');
		expect(out).not.toContain('@agentuity:services-checklist');
		expect(out).toContain('Services');
		expect(out).toContain('Database');
	});

	test('injects a checklist when services are selected (HTML comment syntax)', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nuxt', 'manifest.json'),
			JSON.stringify({
				framework: 'nuxt',
				displayName: 'Nuxt',
				checklistFile: {
					path: 'app/app.vue',
					syntax: '<!-- -->',
				},
			})
		);

		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'Database',
				hint: '',
				description: '',
				order: 20,
				packages: ['drizzle-orm'],
				frameworks: ['nuxt'],
			})
		);

		await writeFile_(
			join(f.dest, 'app/app.vue'),
			[
				'<template>',
				'\t<div>',
				'\t\t<!-- @agentuity:services-checklist -->',
				'\t</div>',
				'</template>',
				'',
			].join('\n')
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'nuxt',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'app/app.vue'), 'utf8');
		expect(out).not.toContain('@agentuity:services-checklist');
		expect(out).toContain('Services');
		expect(out).toContain('Database');
	});

	test('injects a checklist with multiple services', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: {
					path: 'src/app/page.tsx',
					syntax: '{/* */}',
				},
			})
		);

		await writeFile_(
			join(f.templatesRoot, 'services', 'kv', 'manifest.json'),
			JSON.stringify({
				id: 'kv',
				label: 'Key-Value Store',
				hint: '',
				description: '',
				order: 10,
				packages: [],
				frameworks: ['nextjs'],
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'Database',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t{/* @agentuity:services-checklist */}',
				'\t\t</div>',
				'\t);',
				'}',
				'',
			].join('\n')
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db', 'kv'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/app/page.tsx'), 'utf8');
		expect(out).toContain('Key-Value Store');
		expect(out).toContain('Database');
		// KV should appear before DB (catalog order)
		const kvIdx = out.indexOf('Key-Value Store');
		const dbIdx = out.indexOf('Database');
		expect(kvIdx).toBeLessThan(dbIdx);
	});

	test('expands transitive `requires` and applies them in catalog order', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: {
					path: 'src/app/page.tsx',
					syntax: '{/* */}',
				},
			})
		);

		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'Database',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				frameworks: ['nextjs'],
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'storage', 'manifest.json'),
			JSON.stringify({
				id: 'storage',
				label: 'Storage',
				hint: '',
				description: '',
				order: 50,
				requires: ['db'],
				packages: [],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t{/* @agentuity:services-checklist */}',
				'\t\t</div>',
				'\t);',
				'}',
				'',
			].join('\n')
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		// Caller picks only `storage`; composer must auto-include `db`.
		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['storage'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/app/page.tsx'), 'utf8');
		expect(out).toContain('Database');
		expect(out).toContain('Storage');
		// Database should appear before Storage (catalog order)
		const dbIdx = out.indexOf('Database');
		const storageIdx = out.indexOf('Storage');
		expect(dbIdx).toBeLessThan(storageIdx);
	});

	test('merges package.json deps, devDeps, and scripts from selected services', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: { path: 'src/app/page.tsx', syntax: '{/* */}' },
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'DB',
				hint: '',
				description: '',
				order: 20,
				packages: ['drizzle-orm', 'pg'],
				devPackages: ['drizzle-kit', '@types/pg'],
				scripts: { 'db:push': 'drizzle-kit push' },
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(
			join(f.dest, 'package.json'),
			JSON.stringify(
				{
					name: 'app',
					dependencies: { existing: '^1.0.0' },
					scripts: { dev: 'next dev' },
				},
				null,
				'\t'
			)
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			'export default function Home() { return null; }\n'
		);

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const merged = JSON.parse(await readFile(join(f.dest, 'package.json'), 'utf8'));
		expect(merged.dependencies.existing).toBe('^1.0.0');
		expect(merged.dependencies['drizzle-orm']).toBe('latest');
		expect(merged.dependencies.pg).toBe('latest');
		expect(merged.devDependencies['drizzle-kit']).toBe('latest');
		expect(merged.devDependencies['@types/pg']).toBe('latest');
		expect(merged.scripts.dev).toBe('next dev');
		expect(merged.scripts['db:push']).toBe('drizzle-kit push');
	});

	test('appends env vars to .env.example without duplicating', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: { path: 'src/app/page.tsx', syntax: '{/* */}' },
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'DB',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				envVars: [
					{
						name: 'DATABASE_URL',
						placeholder: 'postgres://...',
						comment: 'Set when DB is provisioned',
					},
					{ name: 'EXISTING_VAR', placeholder: 'foo' },
				],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');
		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			'export default function Home() { return null; }\n'
		);
		await writeFile_(join(f.dest, '.env.example'), ['EXISTING_VAR=already-here', ''].join('\n'));

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const env = await readFile(join(f.dest, '.env.example'), 'utf8');
		expect(env).toContain('EXISTING_VAR=already-here');
		expect(env.match(/^EXISTING_VAR=/gm)?.length).toBe(1);
		expect(env).toContain('# Set when DB is provisioned');
		expect(env).toContain('DATABASE_URL=postgres://...');
	});

	test('copies whole files declared by a service', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				checklistFile: { path: 'src/app/page.tsx', syntax: '{/* */}' },
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'DB',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'files', 'nextjs', 'src/db/schema.ts'),
			'export const translations = pgTable(...);'
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'files', 'nextjs', 'drizzle.config.ts'),
			'export default { schema: ... };'
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');
		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			'export default function Home() { return null; }\n'
		);

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		expect(await readFile(join(f.dest, 'src/db/schema.ts'), 'utf8')).toBe(
			'export const translations = pgTable(...);'
		);
		expect(await readFile(join(f.dest, 'drizzle.config.ts'), 'utf8')).toBe(
			'export default { schema: ... };'
		);
	});

	test('does nothing when framework has no manifest and no services', async () => {
		const f = await makeFixture();

		// No manifest.json for 'unknown' framework.
		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'unknown',
			selectedServices: [],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		// No error — composer is a no-op.
		const pkg = JSON.parse(await readFile(join(f.dest, 'package.json'), 'utf8'));
		expect(pkg.name).toBeUndefined();
	});

	test('throws when services selected but framework has no manifest', async () => {
		const f = await makeFixture();

		// Add a service manifest so the catalog resolves, but no framework manifest.
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'manifest.json'),
			JSON.stringify({
				id: 'db',
				label: 'DB',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				frameworks: ['nextjs'],
			})
		);

		await writeFile_(join(f.dest, 'package.json'), '{}');

		await expect(
			composeServices({
				dest: f.dest,
				framework: 'unknown',
				selectedServices: ['db'],
				templatesRoot: f.templatesRoot,
				logger: createMockLogger(),
			})
		).rejects.toThrow(/does not yet support service augments/);
	});
});
