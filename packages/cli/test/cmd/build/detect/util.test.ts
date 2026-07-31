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
	isAgentuityCliInvocation,
	resolveRuntimeFromStartCommand,
	stripCommandEnvPrefixes,
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

	describe('isAgentuityCliInvocation', () => {
		test('matches bare agentuity invocations', () => {
			expect(isAgentuityCliInvocation('agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('agentuity dev')).toBe(true);
			expect(isAgentuityCliInvocation('  agentuity  build  ')).toBe(true);
			expect(isAgentuityCliInvocation('AGENTUITY build')).toBe(true);
		});

		test('matches common runner prefixes', () => {
			expect(isAgentuityCliInvocation('npx agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('npx --yes agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('npx -y agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('bunx agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('bun x agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('pnpm dlx agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('pnpm exec agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('yarn dlx agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('yarn agentuity build')).toBe(true);
		});

		test('matches local bin paths', () => {
			expect(isAgentuityCliInvocation('./node_modules/.bin/agentuity build')).toBe(true);
		});

		test('strips env-var prefixes', () => {
			expect(isAgentuityCliInvocation('NODE_ENV=production agentuity build')).toBe(true);
			expect(isAgentuityCliInvocation('cross-env NODE_ENV=production agentuity build')).toBe(
				true
			);
			expect(isAgentuityCliInvocation('FOO=bar BAZ=qux agentuity build')).toBe(true);
		});

		test('does not match other commands', () => {
			expect(isAgentuityCliInvocation('vite build')).toBe(false);
			expect(isAgentuityCliInvocation('next build')).toBe(false);
			expect(isAgentuityCliInvocation('bun src/index.ts')).toBe(false);
			expect(isAgentuityCliInvocation('npx vite build')).toBe(false);
			expect(isAgentuityCliInvocation('agentuity-something-else build')).toBe(false);
		});

		test('handles empty / nullish input', () => {
			expect(isAgentuityCliInvocation(undefined)).toBe(false);
			expect(isAgentuityCliInvocation(null)).toBe(false);
			expect(isAgentuityCliInvocation('')).toBe(false);
			expect(isAgentuityCliInvocation('   ')).toBe(false);
		});
	});

	describe('resolveRuntimeFromStartCommand', () => {
		test('strips HOST= and other env prefixes before matching node', () => {
			expect(stripCommandEnvPrefixes('HOST=0.0.0.0 node .output/server/index.mjs')).toBe(
				'node .output/server/index.mjs'
			);
			expect(
				resolveRuntimeFromStartCommand('HOST=0.0.0.0 node .output/server/index.mjs', 'bun')
			).toBe('node');
		});

		test('strips quoted env values that contain spaces', () => {
			expect(stripCommandEnvPrefixes('cross-env NAME="value with spaces" node server.js')).toBe(
				'node server.js'
			);
			expect(
				resolveRuntimeFromStartCommand(
					'cross-env NAME="value with spaces" node server.js',
					'bun'
				)
			).toBe('node');
			expect(stripCommandEnvPrefixes("FOO='bar baz' BAR=qux node dist/main.js")).toBe(
				'node dist/main.js'
			);
		});

		test('detects bun after env prefixes', () => {
			expect(resolveRuntimeFromStartCommand('PORT=3000 bun run start', 'node')).toBe('bun');
		});

		test('falls back when command is ambiguous', () => {
			expect(resolveRuntimeFromStartCommand('npm start', 'node')).toBe('node');
			expect(resolveRuntimeFromStartCommand(undefined, 'bun')).toBe('bun');
		});
	});
});
