import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	detectProjectRegistrationMetadata,
	providerForPackageManager,
} from '../../../src/cmd/project/registration-metadata';

describe('project registration metadata', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(
			tmpdir(),
			`registration-metadata-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('maps package manager to API provider', () => {
		expect(providerForPackageManager('bun')).toBe('bunjs');
		expect(providerForPackageManager('npm')).toBe('nodejs');
		expect(providerForPackageManager('pnpm')).toBe('nodejs');
		expect(providerForPackageManager('yarn')).toBe('nodejs');
	});

	test('detects v3 Next.js metadata for imports', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'nextapp',
				scripts: { build: 'next build' },
				dependencies: { next: '^15.0.0', react: '^19.0.0' },
			})
		);

		const metadata = await detectProjectRegistrationMetadata(testDir);
		expect(metadata).toEqual({
			generation: '3',
			provider: 'nodejs',
			framework: 'nextjs',
		});
	});

	test('detects Hono framework directly from dependencies', async () => {
		writeFileSync(
			join(testDir, 'package.json'),
			JSON.stringify({
				name: 'honoapp',
				scripts: { build: 'tsc' },
				dependencies: { hono: '^4.0.0' },
			})
		);
		writeFileSync(join(testDir, 'bun.lock'), '');

		const metadata = await detectProjectRegistrationMetadata(testDir);
		expect(metadata).toEqual({
			generation: '3',
			provider: 'bunjs',
			framework: 'hono',
		});
	});
});
