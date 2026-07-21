import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DEPLOY_PACK_ZIP_BASENAME } from '../../../../src/cmd/cloud/deploy/package';
import { resolvePackOutputPath } from '../../../../src/cmd/cloud/deploy/pack';

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
