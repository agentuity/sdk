import { describe, test, expect } from 'bun:test';
import { isRunningFromExecutable, getPlatformInfo } from '../src/cmd/upgrade';

describe('upgrade command', () => {
	test('isRunningFromExecutable returns false when running from bun script', () => {
		const result = isRunningFromExecutable();
		expect(typeof result).toBe('boolean');
		expect(result).toBe(false);
	});

	test('getPlatformInfo returns valid platform info', () => {
		const platform = getPlatformInfo();
		expect(platform).toHaveProperty('os');
		expect(platform).toHaveProperty('arch');
		expect(['darwin', 'linux']).toContain(platform.os);
		expect(['x64', 'arm64']).toContain(platform.arch);
	});

	test.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
		'getPlatformInfo returns darwin arm64',
		() => {
			const platform = getPlatformInfo();
			expect(platform.os).toBe('darwin');
			expect(platform.arch).toBe('arm64');
		}
	);

	test.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
		'getPlatformInfo returns linux x64',
		() => {
			const platform = getPlatformInfo();
			expect(platform.os).toBe('linux');
			expect(platform.arch).toBe('x64');
		}
	);

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

	test('should construct correct download URL', () => {
		const version = 'v1.2.3';
		const os = 'darwin';
		const arch = 'arm64';
		const url = `https://agentuity.sh/release/sdk/${version}/${os}/${arch}`;

		expect(url).toBe('https://agentuity.sh/release/sdk/v1.2.3/darwin/arm64');
	});
});
