import { expect, test } from 'bun:test';
import { createLaunchServer } from '../prepare-start-output';

test('generated launcher assigns immutable caching only to hashed asset files', () => {
	const source = createLaunchServer();

	expect(source).toContain('const immutableAssetPattern = /^assets');
	expect(source).toContain('public, max-age=31536000, immutable');
	expect(source).toContain(": 'no-store'");
	expect(source).toContain('headers: staticHeadersFor(resolved.relativePath, resolved.filePath)');
});
