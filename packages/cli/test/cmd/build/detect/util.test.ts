import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	findFile,
	hasDependency,
	getDependencyVersion,
	hasDependencyMatching,
	detectPackageManager,
	getRunCommand,
	getExecCommand,
	readPackageJson,
} from '../../../../src/cmd/build/detect/util';
import type { PackageJsonData } from '../../../../src/cmd/build/detect/types';

function createTestDir(): string {
	const dir = join(
		tmpdir(),
		`detect-util-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('Detection Utilities', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	// ── findFile ──

	describe('findFile', () => {
		test('finds first matching file', async () => {
			writeFileSync(join(testDir, 'b.txt'), 'content');
			const result = await findFile(testDir, ['a.txt', 'b.txt', 'c.txt']);
			expect(result).toBe('b.txt');
		});

		test('returns first match when multiple exist', async () => {
			writeFileSync(join(testDir, 'a.txt'), 'a');
			writeFileSync(join(testDir, 'b.txt'), 'b');
			const result = await findFile(testDir, ['a.txt', 'b.txt']);
			expect(result).toBe('a.txt');
		});

		test('returns null when no files match', async () => {
			const result = await findFile(testDir, ['nonexistent.txt']);
			expect(result).toBeNull();
		});

		test('returns null for empty names array', async () => {
			const result = await findFile(testDir, []);
			expect(result).toBeNull();
		});
	});

	// ── hasDependency ──

	describe('hasDependency', () => {
		const pkg: PackageJsonData = {
			dependencies: { react: '^19.0.0', next: '^15.0.0' },
			devDependencies: { vite: '^5.0.0', typescript: '^5.0.0' },
		};

		test('finds in dependencies', () => {
			expect(hasDependency(pkg, 'react')).toBe(true);
			expect(hasDependency(pkg, 'next')).toBe(true);
		});

		test('finds in devDependencies', () => {
			expect(hasDependency(pkg, 'vite')).toBe(true);
			expect(hasDependency(pkg, 'typescript')).toBe(true);
		});

		test('returns false for missing dependency', () => {
			expect(hasDependency(pkg, 'express')).toBe(false);
		});

		test('handles undefined dependencies', () => {
			expect(hasDependency({}, 'react')).toBe(false);
		});
	});

	// ── getDependencyVersion ──

	describe('getDependencyVersion', () => {
		const pkg: PackageJsonData = {
			dependencies: { next: '^15.3.0' },
			devDependencies: { vite: '~5.4.1' },
		};

		test('gets version from dependencies', () => {
			expect(getDependencyVersion(pkg, 'next')).toBe('^15.3.0');
		});

		test('gets version from devDependencies', () => {
			expect(getDependencyVersion(pkg, 'vite')).toBe('~5.4.1');
		});

		test('returns null for missing dependency', () => {
			expect(getDependencyVersion(pkg, 'express')).toBeNull();
		});

		test('prefers dependencies over devDependencies', () => {
			const dual: PackageJsonData = {
				dependencies: { react: '^19.0.0' },
				devDependencies: { react: '^18.0.0' },
			};
			expect(getDependencyVersion(dual, 'react')).toBe('^19.0.0');
		});
	});

	// ── hasDependencyMatching ──

	describe('hasDependencyMatching', () => {
		const pkg: PackageJsonData = {
			dependencies: { '@remix-run/node': '^2.0.0', react: '^19.0.0' },
			devDependencies: { '@remix-run/dev': '^2.0.0' },
		};

		test('matches regex pattern in dependencies', () => {
			expect(hasDependencyMatching(pkg, /^@remix-run\//)).toBe(true);
		});

		test('matches regex pattern in devDependencies', () => {
			expect(hasDependencyMatching(pkg, /^@remix-run\/dev$/)).toBe(true);
		});

		test('returns false when no match', () => {
			expect(hasDependencyMatching(pkg, /^@sveltejs\//)).toBe(false);
		});

		test('handles empty deps', () => {
			expect(hasDependencyMatching({}, /^@remix-run\//)).toBe(false);
		});
	});

	// ── detectPackageManager ──

	describe('detectPackageManager', () => {
		test('detects bun from bun.lockb', async () => {
			writeFileSync(join(testDir, 'bun.lockb'), '');
			expect(await detectPackageManager(testDir)).toBe('bun');
		});

		test('detects bun from bun.lock', async () => {
			writeFileSync(join(testDir, 'bun.lock'), '');
			expect(await detectPackageManager(testDir)).toBe('bun');
		});

		test('detects pnpm from pnpm-lock.yaml', async () => {
			writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
			expect(await detectPackageManager(testDir)).toBe('pnpm');
		});

		test('detects yarn from yarn.lock', async () => {
			writeFileSync(join(testDir, 'yarn.lock'), '');
			expect(await detectPackageManager(testDir)).toBe('yarn');
		});

		test('detects npm from package-lock.json', async () => {
			writeFileSync(join(testDir, 'package-lock.json'), '{}');
			expect(await detectPackageManager(testDir)).toBe('npm');
		});

		test('defaults to bun when no lockfile found', async () => {
			expect(await detectPackageManager(testDir)).toBe('bun');
		});

		test('bun.lockb takes priority over package-lock.json', async () => {
			writeFileSync(join(testDir, 'bun.lockb'), '');
			writeFileSync(join(testDir, 'package-lock.json'), '{}');
			expect(await detectPackageManager(testDir)).toBe('bun');
		});
	});

	// ── getRunCommand ──

	describe('getRunCommand', () => {
		test('bun', () => expect(getRunCommand('bun')).toBe('bun run'));
		test('npm', () => expect(getRunCommand('npm')).toBe('npm run'));
		test('pnpm', () => expect(getRunCommand('pnpm')).toBe('pnpm run'));
		test('yarn', () => expect(getRunCommand('yarn')).toBe('yarn'));
	});

	// ── getExecCommand ──

	describe('getExecCommand', () => {
		test('bun', () => expect(getExecCommand('bun')).toBe('bunx'));
		test('npm', () => expect(getExecCommand('npm')).toBe('npx'));
		test('pnpm', () => expect(getExecCommand('pnpm')).toBe('pnpm exec'));
		test('yarn', () => expect(getExecCommand('yarn')).toBe('yarn dlx'));
	});

	// ── readPackageJson ──

	describe('readPackageJson', () => {
		test('reads and parses valid package.json', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({ name: 'test-pkg', version: '1.0.0', type: 'module' })
			);

			const result = await readPackageJson(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('test-pkg');
			expect(result!.version).toBe('1.0.0');
			expect(result!.type).toBe('module');
		});

		test('returns null when file does not exist', async () => {
			const result = await readPackageJson(testDir);
			expect(result).toBeNull();
		});

		test('returns null for invalid JSON', async () => {
			writeFileSync(join(testDir, 'package.json'), 'not valid json {{{');
			const result = await readPackageJson(testDir);
			expect(result).toBeNull();
		});

		test('reads scripts field', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test',
					scripts: { build: 'tsc', start: 'node dist/index.js' },
				})
			);

			const result = await readPackageJson(testDir);
			expect(result!.scripts!.build).toBe('tsc');
			expect(result!.scripts!.start).toBe('node dist/index.js');
		});

		test('reads engines field', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test',
					engines: { node: '>=18', bun: '>=1.0.0' },
				})
			);

			const result = await readPackageJson(testDir);
			expect(result!.engines!.node).toBe('>=18');
			expect(result!.engines!.bun).toBe('>=1.0.0');
		});
	});
});
