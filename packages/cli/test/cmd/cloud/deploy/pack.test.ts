import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DEPLOY_PACK_ZIP_BASENAME } from '../../../../src/cmd/cloud/deploy/package';
import {
	resolvePackOutputPath,
	resolveSafePackOutput,
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
