import { describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildDeployArgs,
	downloadSource,
	hasProjectDependenciesInstalled,
	sourceDownloadHeaders,
} from '../../../src/cmd/build/ci';

describe('build ci', () => {
	test('passes skip DNS validation to nested deploy', () => {
		const args = buildDeployArgs({ skipDnsValidation: true });
		expect(args).toContain('--skip-dns-validation');
	});

	test('passes skip typecheck to nested deploy', () => {
		const args = buildDeployArgs({ skipTypeCheck: true });
		expect(args).toContain('--skip-type-check');
	});

	test('detects existing dependencies from monorepo root', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'agentuity-ci-deps-test-'));
		try {
			await mkdir(join(dir, 'node_modules', '.bun'), { recursive: true });
			await writeFile(join(dir, 'bun.lock'), '');
			const appDir = join(dir, 'apps', 'web');
			await mkdir(appDir, { recursive: true });

			expect(await hasProjectDependenciesInstalled(appDir)).toBe(true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test('requires install when dependencies are missing', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'agentuity-ci-deps-test-'));
		try {
			expect(await hasProjectDependenciesInstalled(dir)).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test('adds GitHub archive token only for GitHub archive hosts', () => {
		const previous = process.env.GITHUB_ARCHIVE_TOKEN;
		process.env.GITHUB_ARCHIVE_TOKEN = 'ghs_test_token';
		try {
			expect(
				sourceDownloadHeaders('https://api.github.com/repos/agentuity/sdk/zipball/abc')
			).toEqual({
				Authorization: 'Bearer ghs_test_token',
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			});
			expect(
				sourceDownloadHeaders('https://codeload.github.com/agentuity/sdk/legacy.zip/abc')
			).toEqual({
				Authorization: 'Bearer ghs_test_token',
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			});
			expect(sourceDownloadHeaders('https://example.com/source.zip')).toBeUndefined();
		} finally {
			if (previous === undefined) {
				delete process.env.GITHUB_ARCHIVE_TOKEN;
			} else {
				process.env.GITHUB_ARCHIVE_TOKEN = previous;
			}
		}
	});

	test('follows GitHub archive redirects with installation token', async () => {
		const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
		const previousFetch = globalThis.fetch;
		const calls: Array<{ url: string; authorization?: string | null }> = [];
		process.env.GITHUB_ARCHIVE_TOKEN = 'ghs_test_token';
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			calls.push({ url, authorization: headers.get('authorization') });
			if (url === 'https://api.github.com/repos/agentuity/sdk/zipball/abc') {
				return new Response(null, {
					status: 302,
					headers: {
						location: 'https://codeload.github.com/agentuity/sdk/legacy.zip/abc',
					},
				});
			}
			return new Response(new Uint8Array([1, 2, 3]));
		}) as typeof fetch;

		const dir = await mkdtemp(join(tmpdir(), 'agentuity-ci-download-test-'));
		try {
			const target = join(dir, 'source.zip');
			await downloadSource('https://api.github.com/repos/agentuity/sdk/zipball/abc', target);
			expect(await readFile(target)).toEqual(Buffer.from([1, 2, 3]));
			expect(calls).toEqual([
				{
					url: 'https://api.github.com/repos/agentuity/sdk/zipball/abc',
					authorization: 'Bearer ghs_test_token',
				},
				{
					url: 'https://codeload.github.com/agentuity/sdk/legacy.zip/abc',
					authorization: 'Bearer ghs_test_token',
				},
			]);
		} finally {
			await rm(dir, { recursive: true, force: true });
			globalThis.fetch = previousFetch;
			if (previousToken === undefined) {
				delete process.env.GITHUB_ARCHIVE_TOKEN;
			} else {
				process.env.GITHUB_ARCHIVE_TOKEN = previousToken;
			}
		}
	});
});
