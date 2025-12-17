import { describe, test, expect } from 'bun:test';
import { getMinBunVersion } from '../src/utils/bun-version-checker';
import { semver } from 'bun';

describe('Bun Version Checker', () => {
	test('should export minimum version', () => {
		const minVersion = getMinBunVersion();
		expect(minVersion).toBe('>=1.3.3');
	});

	test('current Bun version should meet minimum requirements', () => {
		const minVersion = getMinBunVersion();
		const currentVersion = Bun.version;

		// This test ensures the runner's Bun version is compatible
		expect(semver.satisfies(currentVersion, minVersion)).toBe(true);
	});
});
