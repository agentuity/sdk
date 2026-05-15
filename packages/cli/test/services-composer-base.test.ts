/**
 * End-to-end checks: applying the composer to the *real* bundled
 * framework base templates (with no services selected) must produce
 * clean, marker-free output. The composable files declared in each
 * framework's manifest must keep enough structure that a service-less
 * scaffold continues to behave like today's overlay output.
 *
 * These tests exercise the actual files in templates/<framework>/ \u2014
 * complementing the synthetic-fixture unit tests which cover composer
 * mechanics. If a marker is missing, mis-spelled, or placed in a way
 * that breaks the surrounding code, this is where it surfaces.
 */

import { createMockLogger } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

interface FrameworkCheck {
	framework: string;
	/**
	 * Composable files we expect to find post-composition, with a
	 * substring that must remain present (sanity check that the marker
	 * strip didn't eat real code) and a startsWith check when the very
	 * first line of the file matters (e.g. Next.js's `'use client';`).
	 */
	files: Array<{
		path: string;
		mustContain: string[];
		mustStartWith?: string;
	}>;
}

/**
 * One entry per framework with manifest.json. Specs are deliberately
 * minimal \u2014 we're checking that the marker strip is well-behaved,
 * not that the entire template is intact.
 */
const checks: FrameworkCheck[] = [
	{
		framework: 'nextjs',
		files: [
			{
				path: 'src/lib/translate.ts',
				mustContain: ['export interface TranslateInput', 'export async function translate'],
			},
			{
				path: 'src/app/page.tsx',
				mustStartWith: "'use client';",
				mustContain: ['export default function Home()', 'Translation will appear here'],
			},
		],
	},
	{
		framework: 'nuxt',
		files: [
			{ path: 'server/utils/translate.ts', mustContain: ['export async function translate'] },
			{
				path: 'app/app.vue',
				mustStartWith: '<script setup lang="ts">',
				mustContain: ['<template>', 'Translation will appear here'],
			},
		],
	},
	{
		framework: 'sveltekit',
		files: [
			{ path: 'src/lib/server/translate.ts', mustContain: ['export async function translate'] },
			{
				path: 'src/routes/+page.svelte',
				mustStartWith: '<script lang="ts">',
				mustContain: ['Translation will appear here'],
			},
		],
	},
	{
		framework: 'astro',
		files: [
			{ path: 'src/lib/translate.ts', mustContain: ['export async function translate'] },
			{
				path: 'src/pages/index.astro',
				mustStartWith: '---',
				mustContain: ['Translation will appear here', '<script>'],
			},
		],
	},
	{
		framework: 'hono',
		files: [
			{ path: 'src/translate.ts', mustContain: ['export async function translate'] },
			{
				path: 'src/landing.tsx',
				mustStartWith: 'const clientScript',
				mustContain: ['Translation will appear here', '<script'],
			},
		],
	},
];

describe('framework base composition (no services)', () => {
	for (const check of checks) {
		test(`${check.framework}: strips markers cleanly`, async () => {
			const baseDir = join(templatesRoot, check.framework);
			const dest = await mkdtemp(join(tmpdir(), `${check.framework}-base-`));
			cleanup.push(dest);

			// Mirror scaffold.ts's overlay step \u2014 recursive copy of the
			// framework template into a fresh project root, then run the
			// composer with no services selected.
			await cp(baseDir, dest, { recursive: true });

			await composeServices({
				dest,
				framework: check.framework,
				selectedServices: [],
				templatesRoot,
				logger: createMockLogger(),
			});

			for (const file of check.files) {
				const content = await readFile(join(dest, file.path), 'utf8');
				expect(content).not.toContain('@agentuity:');
				if (file.mustStartWith) {
					expect(content.startsWith(file.mustStartWith)).toBe(true);
				}
				for (const needle of file.mustContain) {
					expect(content).toContain(needle);
				}
			}
		});
	}

	test('skips missing composable files when no services were selected', async () => {
		// Setup: a project where the composable files declared in the
		// nextjs manifest (src/app/page.tsx, src/lib/translate.ts) are
		// genuinely absent. With no services selected the composer should
		// no-op rather than complaining about manifest entries that have
		// nothing to splice into.
		const dest = await mkdtemp(join(tmpdir(), 'nextjs-empty-base-'));
		cleanup.push(dest);

		await writeFile(join(dest, 'package.json'), JSON.stringify({ scripts: {} }, null, '\t'));

		await expect(
			composeServices({
				dest,
				framework: 'nextjs',
				selectedServices: [],
				templatesRoot,
				logger: createMockLogger(),
			})
		).resolves.toBeUndefined();
	});

	test('rejects when a manifest-declared marker is absent from an existing composable file', async () => {
		// A composable file that exists but has been stripped of its
		// `@agentuity:` markers indicates drift between the manifest and
		// the template. Surface it at compose time — even with no
		// services selected — rather than letting it ship silently.
		const dest = await mkdtemp(join(tmpdir(), 'nextjs-drift-base-'));
		cleanup.push(dest);

		await mkdir(join(dest, 'src', 'app'), { recursive: true });
		await writeFile(join(dest, 'package.json'), JSON.stringify({ scripts: {} }, null, '\t'));
		await writeFile(join(dest, 'src', 'app', 'page.tsx'), 'export default function Home() {}\n');

		await expect(
			composeServices({
				dest,
				framework: 'nextjs',
				selectedServices: [],
				templatesRoot,
				logger: createMockLogger(),
			})
		).rejects.toThrow(/@agentuity:/);
	});
});
