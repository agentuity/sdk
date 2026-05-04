/**
 * Composer tests build a synthetic templates tree in a temp directory,
 * exercise `composeServices` against it, and assert byte-level on the
 * spliced output.
 *
 * Each test sets up its own templates root + project dir so cases stay
 * isolated. Fixtures are minimal — we test composer mechanics, not
 * realistic service contents.
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
	test('strips marker lines when no services are selected', async () => {
		const f = await makeFixture();

		// Synthetic framework manifest with one composable file.
		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: {
							imports: { syntax: '//' },
							'translate-pre': { syntax: '//' },
						},
					},
				},
			})
		);

		// Project file that contains the markers.
		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			[
				'// @agentuity:imports',
				"import { foo } from 'bar';",
				'',
				'export function translate() {',
				'\t// @agentuity:translate-pre',
				'\treturn null;',
				'}',
				'',
			].join('\n')
		);

		// package.json so the merge step is happy.
		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: [],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/lib/translate.ts'), 'utf8');
		expect(out).toBe(
			[
				"import { foo } from 'bar';",
				'',
				'export function translate() {',
				'\treturn null;',
				'}',
				'',
			].join('\n')
		);
	});

	test('inserts a single service snippet at the marker, indented to match', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: {
							'translate-pre': { syntax: '//' },
						},
					},
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

		// Snippet body is zero-indented; composer should re-indent to match
		// the marker line's leading whitespace.
		await writeFile_(
			join(
				f.templatesRoot,
				'services',
				'db',
				'snippets',
				'nextjs',
				'translate.translate-pre.ts'
			),
			['const cached = await checkCache();', 'if (cached) return cached;'].join('\n')
		);

		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			[
				'export function translate() {',
				'\t// @agentuity:translate-pre',
				'\treturn doIt();',
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

		const out = await readFile(join(f.dest, 'src/lib/translate.ts'), 'utf8');
		expect(out).toBe(
			[
				'export function translate() {',
				'\tconst cached = await checkCache();',
				'\tif (cached) return cached;',
				'\treturn doIt();',
				'}',
				'',
			].join('\n')
		);
	});

	test('concatenates contributions from multiple services in catalog order', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: {
							'translate-post': { syntax: '//' },
						},
					},
				},
			})
		);

		// Two services. Catalog order: kv (10), db (20).
		await writeFile_(
			join(f.templatesRoot, 'services', 'kv', 'manifest.json'),
			JSON.stringify({
				id: 'kv',
				label: 'KV',
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
				label: 'DB',
				hint: '',
				description: '',
				order: 20,
				packages: [],
				frameworks: ['nextjs'],
			})
		);
		await writeFile_(
			join(
				f.templatesRoot,
				'services',
				'kv',
				'snippets',
				'nextjs',
				'translate.translate-post.ts'
			),
			'await saveToKV(result);'
		);
		await writeFile_(
			join(
				f.templatesRoot,
				'services',
				'db',
				'snippets',
				'nextjs',
				'translate.translate-post.ts'
			),
			'await saveToDB(result);'
		);

		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			[
				'export function translate() {',
				'\t// @agentuity:translate-post',
				'\treturn x;',
				'}',
				'',
			].join('\n')
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		// Caller passes services in reverse order; composer must still
		// emit them in catalog order (kv before db).
		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['db', 'kv'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/lib/translate.ts'), 'utf8');
		expect(out).toBe(
			[
				'export function translate() {',
				'\tawait saveToKV(result);',
				'',
				'\tawait saveToDB(result);',
				'\treturn x;',
				'}',
				'',
			].join('\n')
		);
	});

	test('handles JSX-style {/* */} markers', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					page: {
						path: 'src/app/page.tsx',
						markers: {
							'after-result': { syntax: '{/* */}' },
						},
					},
				},
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
			join(f.templatesRoot, 'services', 'db', 'snippets', 'nextjs', 'page.after-result.tsx'),
			'<div className="cache-badge">Cached</div>'
		);

		await writeFile_(
			join(f.dest, 'src/app/page.tsx'),
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t<p>result</p>',
				'\t\t\t{/* @agentuity:after-result */}',
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
		expect(out).toBe(
			[
				'export default function Home() {',
				'\treturn (',
				'\t\t<div>',
				'\t\t\t<p>result</p>',
				'\t\t\t<div className="cache-badge">Cached</div>',
				'\t\t</div>',
				'\t);',
				'}',
				'',
			].join('\n')
		);
	});

	test('handles HTML-style <!-- --> markers', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'hono', 'manifest.json'),
			JSON.stringify({
				framework: 'hono',
				displayName: 'Hono',
				composableFiles: {
					landing: {
						path: 'src/landing.html',
						markers: {
							'after-form': { syntax: '<!-- -->' },
						},
					},
				},
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
				frameworks: ['hono'],
			})
		);
		await writeFile_(
			join(f.templatesRoot, 'services', 'db', 'snippets', 'hono', 'landing.after-form.html'),
			'<div class="history">history</div>'
		);

		await writeFile_(
			join(f.dest, 'src/landing.html'),
			['<form>...</form>', '<!-- @agentuity:after-form -->', '<footer>...</footer>', ''].join(
				'\n'
			)
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		await composeServices({
			dest: f.dest,
			framework: 'hono',
			selectedServices: ['db'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/landing.html'), 'utf8');
		expect(out).toBe(
			[
				'<form>...</form>',
				'<div class="history">history</div>',
				'<footer>...</footer>',
				'',
			].join('\n')
		);
	});

	test('throws when a marker declared in the manifest is missing from the file', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: {
							'translate-pre': { syntax: '//' },
						},
					},
				},
			})
		);

		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			['export function translate() { return null; }', ''].join('\n')
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		await expect(
			composeServices({
				dest: f.dest,
				framework: 'nextjs',
				selectedServices: [],
				templatesRoot: f.templatesRoot,
				logger: createMockLogger(),
			})
		).rejects.toThrow(/translate-pre/);
	});

	test('skips snippets a service did not provide for a given marker', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: {
							imports: { syntax: '//' },
							'translate-pre': { syntax: '//' },
						},
					},
				},
			})
		);

		// db contributes only `imports`, not `translate-pre`.
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
			join(f.templatesRoot, 'services', 'db', 'snippets', 'nextjs', 'translate.imports.ts'),
			"import { db } from './db';"
		);

		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			[
				'// @agentuity:imports',
				'',
				'export function translate() {',
				'\t// @agentuity:translate-pre',
				'\treturn null;',
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

		const out = await readFile(join(f.dest, 'src/lib/translate.ts'), 'utf8');
		expect(out).toBe(
			[
				"import { db } from './db';",
				'',
				'export function translate() {',
				'\treturn null;',
				'}',
				'',
			].join('\n')
		);
	});

	test('expands transitive `requires` and applies them in catalog order', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {
					translate: {
						path: 'src/lib/translate.ts',
						markers: { 'translate-post': { syntax: '//' } },
					},
				},
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
			join(
				f.templatesRoot,
				'services',
				'db',
				'snippets',
				'nextjs',
				'translate.translate-post.ts'
			),
			'await saveToDB(result);'
		);
		await writeFile_(
			join(
				f.templatesRoot,
				'services',
				'storage',
				'snippets',
				'nextjs',
				'translate.translate-post.ts'
			),
			'await uploadHistory(result);'
		);

		await writeFile_(
			join(f.dest, 'src/lib/translate.ts'),
			[
				'export function translate() {',
				'\t// @agentuity:translate-post',
				'\treturn x;',
				'}',
				'',
			].join('\n')
		);
		await writeFile_(join(f.dest, 'package.json'), '{}');

		// Caller picks only `storage`. Composer must auto-include `db` and
		// emit db's contribution before storage's (catalog order).
		await composeServices({
			dest: f.dest,
			framework: 'nextjs',
			selectedServices: ['storage'],
			templatesRoot: f.templatesRoot,
			logger: createMockLogger(),
		});

		const out = await readFile(join(f.dest, 'src/lib/translate.ts'), 'utf8');
		expect(out).toBe(
			[
				'export function translate() {',
				'\tawait saveToDB(result);',
				'',
				'\tawait uploadHistory(result);',
				'\treturn x;',
				'}',
				'',
			].join('\n')
		);
	});

	test('merges package.json deps, devDeps, and scripts from selected services', async () => {
		const f = await makeFixture();

		await writeFile_(
			join(f.templatesRoot, 'nextjs', 'manifest.json'),
			JSON.stringify({
				framework: 'nextjs',
				displayName: 'Next.js',
				composableFiles: {},
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
				packages: ['drizzle-orm', '@neondatabase/serverless'],
				devPackages: ['drizzle-kit'],
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
		expect(merged.dependencies['@neondatabase/serverless']).toBe('latest');
		expect(merged.devDependencies['drizzle-kit']).toBe('latest');
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
				composableFiles: {},
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
		// EXISTING_VAR should not be added a second time.
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
				composableFiles: {},
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
});
