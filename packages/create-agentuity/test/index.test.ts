import { describe, expect, test } from 'bun:test';
import { detectPackageManager, getCliVersionSpecifier, getCreateCommand } from '../src/index.ts';

describe('getCliVersionSpecifier', () => {
	describe('prerelease versions use the prerelease tag', () => {
		test('3.0.0-alpha.0 should return alpha', () => {
			expect(getCliVersionSpecifier('3.0.0-alpha.0')).toBe('alpha');
		});
		test('3.0.0-alpha.1 should return alpha', () => {
			expect(getCliVersionSpecifier('3.0.0-alpha.1')).toBe('alpha');
		});
		test('1.0.0-alpha.10 should return alpha', () => {
			expect(getCliVersionSpecifier('1.0.0-alpha.10')).toBe('alpha');
		});
		test('2.0.0-beta.0 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.0')).toBe('beta');
		});
		test('2.0.0-beta.1 should return beta', () => {
			expect(getCliVersionSpecifier('2.0.0-beta.1')).toBe('beta');
		});
		test('1.0.0-beta.10 should return beta', () => {
			expect(getCliVersionSpecifier('1.0.0-beta.10')).toBe('beta');
		});
		test('2.0.0-rc.1 should return rc', () => {
			expect(getCliVersionSpecifier('2.0.0-rc.1')).toBe('rc');
		});
		test('1.0.0-canary.3 should return canary', () => {
			expect(getCliVersionSpecifier('1.0.0-canary.3')).toBe('canary');
		});
		test('2.0.0-next.5 should return next', () => {
			expect(getCliVersionSpecifier('2.0.0-next.5')).toBe('next');
		});
	});

	describe('stable versions use exact version', () => {
		test('1.0.0 should return exact version', () => {
			expect(getCliVersionSpecifier('1.0.0')).toBe('1.0.0');
		});
		test('1.0.62 should return exact version', () => {
			expect(getCliVersionSpecifier('1.0.62')).toBe('1.0.62');
		});
		test('2.0.0 should return exact version', () => {
			expect(getCliVersionSpecifier('2.0.0')).toBe('2.0.0');
		});
		test('2.0.2 should return exact version', () => {
			expect(getCliVersionSpecifier('2.0.2')).toBe('2.0.2');
		});
		test('10.20.30 should return exact version', () => {
			expect(getCliVersionSpecifier('10.20.30')).toBe('10.20.30');
		});
	});
});

describe('detectPackageManager', () => {
	test('bun user agent', () => {
		expect(detectPackageManager('bun/1.1.34 npm/? node/v22.6.0 darwin arm64')).toBe('bun');
	});
	test('npm user agent', () => {
		expect(detectPackageManager('npm/10.2.4 node/v20.11.1 linux x64')).toBe('npm');
	});
	test('pnpm user agent', () => {
		expect(detectPackageManager('pnpm/8.15.4 npm/? node/v20.11.1 linux x64')).toBe('pnpm');
	});
	test('yarn user agent', () => {
		expect(detectPackageManager('yarn/1.22.22 npm/? node/v20.11.1 linux x64')).toBe('yarn');
	});
	test('undefined when env var is absent', () => {
		expect(detectPackageManager(undefined)).toBeUndefined();
	});
	test('undefined for unrecognized package manager', () => {
		expect(detectPackageManager('deno/1.40.0 node/v20.11.1')).toBeUndefined();
	});
});

describe('getCreateCommand', () => {
	const pkg = '@agentuity/cli@next';
	const args = ['--name', 'my-app'];

	test('bun uses bunx', () => {
		expect(getCreateCommand('bun', pkg, args)).toEqual({
			command: 'bunx',
			args: [pkg, 'create', '--name', 'my-app'],
		});
	});
	test('pnpm uses pnpm dlx', () => {
		expect(getCreateCommand('pnpm', pkg, args)).toEqual({
			command: 'pnpm',
			args: ['dlx', pkg, 'create', '--name', 'my-app'],
		});
	});
	test('yarn uses yarn dlx', () => {
		expect(getCreateCommand('yarn', pkg, args)).toEqual({
			command: 'yarn',
			args: ['dlx', pkg, 'create', '--name', 'my-app'],
		});
	});
	test('npm uses npx --yes', () => {
		expect(getCreateCommand('npm', pkg, args)).toEqual({
			command: 'npx',
			args: ['--yes', pkg, 'create', '--name', 'my-app'],
		});
	});
	test('unknown package manager falls back to npx', () => {
		expect(getCreateCommand(undefined, pkg, args)).toEqual({
			command: 'npx',
			args: ['--yes', pkg, 'create', '--name', 'my-app'],
		});
	});
	test('passes through empty args', () => {
		expect(getCreateCommand('npm', pkg, [])).toEqual({
			command: 'npx',
			args: ['--yes', pkg, 'create'],
		});
	});
});
