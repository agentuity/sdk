import { describe, test, expect, afterEach } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import { getInstallationType, isGlobalInstall } from '../src/cmd/upgrade';
import {
	isVersionAvailableOnNpm,
	isVersionAvailableOnNpmQuick,
	waitForNpmAvailability,
} from '../src/cmd/upgrade/npm-availability';

describe('upgrade command', () => {
	test('getInstallationType returns source when running from test', () => {
		const result = getInstallationType();
		expect(typeof result).toBe('string');
		// When running tests from source, should return 'source'
		expect(result).toBe('source');
	});

	test('isGlobalInstall returns false when running from source', () => {
		const result = isGlobalInstall();
		expect(typeof result).toBe('boolean');
		expect(result).toBe(false);
	});

	test('should validate version format', () => {
		const validVersions = ['v1.2.3', '1.2.3', 'v0.0.1', '10.20.30'];
		const invalidVersions = ['error', 'message', '<html>', '<!DOCTYPE', 'not-a-version', ''];

		for (const version of validVersions) {
			const trimmed = version.trim();
			const isValid =
				/^v?[0-9]+\.[0-9]+\.[0-9]+/.test(trimmed) &&
				!trimmed.includes('message') &&
				!trimmed.includes('error') &&
				!trimmed.includes('<html>');
			expect(isValid).toBe(true);
		}

		for (const version of invalidVersions) {
			const trimmed = version.trim();
			const isValid =
				/^v?[0-9]+\.[0-9]+\.[0-9]+/.test(trimmed) &&
				!trimmed.includes('message') &&
				!trimmed.includes('error') &&
				!trimmed.includes('<html>');
			expect(isValid).toBe(false);
		}
	});

	test('should normalize version with v prefix', () => {
		const testCases = [
			{ input: 'v1.2.3', expected: 'v1.2.3' },
			{ input: '1.2.3', expected: 'v1.2.3' },
			{ input: 'v0.0.1', expected: 'v0.0.1' },
			{ input: '10.20.30', expected: 'v10.20.30' },
		];

		for (const { input, expected } of testCases) {
			const normalized = input.startsWith('v') ? input : `v${input}`;
			expect(normalized).toBe(expected);
		}
	});

	test('should compare versions correctly', () => {
		const testCases = [
			{ current: 'v1.2.3', latest: 'v1.2.3', shouldUpgrade: false },
			{ current: '1.2.3', latest: 'v1.2.3', shouldUpgrade: false },
			{ current: 'v1.2.2', latest: 'v1.2.3', shouldUpgrade: true },
			{ current: '1.0.0', latest: 'v2.0.0', shouldUpgrade: true },
		];

		for (const { current, latest, shouldUpgrade } of testCases) {
			const normalizedCurrent = current.replace(/^v/, '');
			const normalizedLatest = latest.replace(/^v/, '');
			const needsUpgrade = normalizedCurrent !== normalizedLatest;

			expect(needsUpgrade).toBe(shouldUpgrade);
		}
	});

	describe('npm availability integration', () => {
		const originalFetch = globalThis.fetch;

		afterEach(() => {
			globalThis.fetch = originalFetch;
		});

		test('isVersionAvailableOnNpm is exported and callable', async () => {
			mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpm('1.0.0');
			expect(typeof result).toBe('boolean');
			expect(result).toBe(true);
		});

		test('waitForNpmAvailability is exported and callable', async () => {
			mockFetch(async () => new Response(null, { status: 200 }));

			const result = await waitForNpmAvailability('1.0.0', {
				maxAttempts: 1,
				initialDelayMs: 1,
			});
			expect(typeof result).toBe('boolean');
			expect(result).toBe(true);
		});

		test('npm availability check handles unavailable versions gracefully', async () => {
			mockFetch(async () => new Response(null, { status: 404 }));

			const result = await isVersionAvailableOnNpm('99.99.99');
			expect(result).toBe(false);
		});

		test('isVersionAvailableOnNpmQuick is exported for implicit version checks', async () => {
			mockFetch(async () => new Response(null, { status: 200 }));

			const result = await isVersionAvailableOnNpmQuick('1.0.0');
			expect(typeof result).toBe('boolean');
			expect(result).toBe(true);
		});
	});
});
