import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPLOY_PACK_ZIP_BASENAME } from '../../../../src/cmd/cloud/deploy/package';
import {
	OFFLINE_DEPLOY_PROJECT_ID,
	resolvePackOutputPath,
	resolveSafePackOutput,
	uploadDeploymentZip,
} from '../../../../src/cmd/cloud/deploy/pack';

const noopLogger = { debug: () => {}, trace: () => {}, warn: () => {} } as any;

describe('resolvePackOutputPath', () => {
	test('defaults to agentuity-deploy.zip in the project dir', () => {
		expect(resolvePackOutputPath('/proj')).toBe(join('/proj', DEPLOY_PACK_ZIP_BASENAME));
	});

	test('resolves relative pack-output against the project dir', () => {
		expect(resolvePackOutputPath('/proj', 'out/pack.zip')).toBe(join('/proj', 'out/pack.zip'));
	});

	test('keeps absolute pack-output paths', () => {
		expect(resolvePackOutputPath('/proj', '/tmp/deploy.zip')).toBe('/tmp/deploy.zip');
	});
});

describe('resolveSafePackOutput', () => {
	test('returns the requested path when outside staging', () => {
		const staging = '/repo/.agentuity';
		const requested = '/repo/agentuity-deploy.zip';
		expect(resolveSafePackOutput(staging, requested, noopLogger, true)).toBe(requested);
	});

	test('relocates pack output when requested path is the staging dir itself', () => {
		const staging = '/repo/.agentuity';
		const out = resolveSafePackOutput(staging, staging, noopLogger, true);
		expect(out).toBe(join('/repo', DEPLOY_PACK_ZIP_BASENAME));
		expect(out.startsWith(staging + '/')).toBe(false);
		expect(out).not.toBe(staging);
	});

	test('relocates pack output when requested path is inside staging', () => {
		const staging = '/repo/.agentuity';
		const requested = join(staging, 'out', 'pack.zip');
		const out = resolveSafePackOutput(staging, requested, noopLogger, true);
		// Must not remain under the staging tree (would be picked up by a rescan).
		expect(out.startsWith(staging + '/')).toBe(false);
		expect(out).toBe(join('/repo', DEPLOY_PACK_ZIP_BASENAME));
	});
});

describe('offline deploy constants', () => {
	test('uses stable stub ids for offline project metadata', () => {
		expect(OFFLINE_DEPLOY_PROJECT_ID).toBe('offline');
	});
});

describe('uploadDeploymentZip', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('PUTs the zip with content-type and content-length', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agentuity-upload-test-'));
		const zipPath = join(dir, 'deploy.zip');
		const payload = Buffer.from('zip-bytes');
		writeFileSync(zipPath, payload);

		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe('https://example.com/presigned-put');
			expect(init?.method).toBe('PUT');
			const headers = init?.headers as Record<string, string>;
			expect(headers['Content-Type']).toBe('application/zip');
			expect(headers['Content-Length']).toBe(String(payload.length));
			return new Response(null, { status: 200 });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await uploadDeploymentZip({
			zipPath,
			uploadUrl: 'https://example.com/presigned-put',
			logger: noopLogger,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('throws a clear error when the upload URL returns non-2xx', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agentuity-upload-fail-'));
		const zipPath = join(dir, 'deploy.zip');
		writeFileSync(zipPath, 'data');

		globalThis.fetch = mock(async () => new Response('AccessDenied', { status: 403 })) as any;

		await expect(
			uploadDeploymentZip({
				zipPath,
				uploadUrl: 'https://example.com/bad',
				logger: noopLogger,
			})
		).rejects.toThrow(/Upload to --upload-url failed: HTTP 403/);
	});
});
