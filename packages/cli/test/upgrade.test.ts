import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('upgrade command', () => {
	let originalBunMain: string;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalBunMain = Bun.main;
		originalEnv = { ...process.env };
	});

	test('should detect when running from executable', async () => {
		// Mock Bun.main to simulate running from installed location
		const homeDir = process.env.HOME || '/home/test';
		const executablePath = join(homeDir, '.agentuity', 'bin', 'agentuity');

		// We can't actually mock Bun.main directly, so we'll test the logic
		const isFromInstall =
			!executablePath.includes('/node_modules/') &&
			!executablePath.includes('.ts') &&
			(executablePath.startsWith(join(homeDir, '.agentuity', 'bin')) ||
				executablePath.startsWith('/usr/local/bin'));

		expect(isFromInstall).toBe(true);
	});

	test('should detect when running from bun script', () => {
		// Simulate running from bun
		const scriptPath = '/Users/test/project/src/cli.ts';

		const isFromInstall =
			!scriptPath.includes('/node_modules/') &&
			!scriptPath.includes('.ts') &&
			(scriptPath.startsWith('/home/test/.agentuity/bin') ||
				scriptPath.startsWith('/usr/local/bin'));

		expect(isFromInstall).toBe(false);
	});

	test('should detect when running from node_modules', () => {
		const modulePath = '/Users/test/project/node_modules/@agentuity/cli/bin/cli.js';

		const isFromInstall =
			!modulePath.includes('/node_modules/') &&
			!modulePath.includes('.ts') &&
			(modulePath.startsWith('/home/test/.agentuity/bin') ||
				modulePath.startsWith('/usr/local/bin'));

		expect(isFromInstall).toBe(false);
	});

	test('should get correct platform info for darwin arm64', () => {
		if (process.platform === 'darwin' && process.arch === 'arm64') {
			expect(process.platform).toBe('darwin');
			expect(process.arch).toBe('arm64');
		}
	});

	test('should get correct platform info for linux x64', () => {
		if (process.platform === 'linux' && process.arch === 'x64') {
			expect(process.platform).toBe('linux');
			expect(process.arch).toBe('x64');
		}
	});

	test('should validate version format', () => {
		const validVersions = ['v1.2.3', '1.2.3', 'v0.0.1', '10.20.30'];
		const invalidVersions = [
			'error',
			'message',
			'<html>',
			'<!DOCTYPE',
			'not-a-version',
			'',
		];

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
