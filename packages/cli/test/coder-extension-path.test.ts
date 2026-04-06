import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	resolveExtensionPath,
	resolveExtensionRuntimeModulePath,
} from '../src/cmd/coder/extension-path';

let tempDir: string | null = null;

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
		tempDir = null;
	}
});

async function createExtensionPackage(rootPath: string, options?: { withSource?: boolean }) {
	const withSource = options?.withSource ?? true;

	await mkdir(rootPath, { recursive: true });
	await writeFile(
		join(rootPath, 'package.json'),
		JSON.stringify(
			{
				name: '@agentuity/coder-tui',
				version: '2.0.7',
				main: './dist/index.js',
			},
			null,
			2
		)
	);
	await mkdir(join(rootPath, 'dist'), { recursive: true });
	await writeFile(join(rootPath, 'dist', 'index.js'), 'export const ok = true;\n');
	await writeFile(
		join(rootPath, 'dist', 'remote-tui.js'),
		'export async function runRemoteTui() {}\n'
	);

	if (withSource) {
		await mkdir(join(rootPath, 'src'), { recursive: true });
		await writeFile(join(rootPath, 'src', 'index.ts'), 'export const ok = true;\n');
		await writeFile(
			join(rootPath, 'src', 'remote-tui.ts'),
			'export async function runRemoteTui() {}\n'
		);
	}
}

describe('resolveExtensionPath', () => {
	test('uses --extension flag when provided', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const extensionRoot = join(tempDir, 'custom-extension');
		await createExtensionPackage(extensionRoot);

		const resolved = await resolveExtensionPath(extensionRoot, {
			cwd: tempDir,
			env: { AGENTUITY_CODER_EXTENSION: join(tempDir, 'other-extension') },
		});

		expect(resolved).toBe(extensionRoot);
	});

	test('uses AGENTUITY_CODER_EXTENSION env when no flag provided', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const extensionRoot = join(tempDir, 'env-extension');
		await createExtensionPackage(extensionRoot);

		const resolved = await resolveExtensionPath(undefined, {
			cwd: tempDir,
			env: { AGENTUITY_CODER_EXTENSION: extensionRoot },
		});

		expect(resolved).toBe(extensionRoot);
	});

	test('uses require.resolve fallback when no flag or env provided', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const cliInstalledRoot = join(tempDir, 'node_modules', '@agentuity', 'coder-tui');
		await createExtensionPackage(cliInstalledRoot);

		const cliDir = join(tempDir, 'cli');
		await mkdir(cliDir, { recursive: true });

		const resolved = await resolveExtensionPath(undefined, {
			cwd: tempDir,
			env: {},
			moduleUrl: `file://${cliDir}/index.js`,
		});

		expect(resolved).not.toBeNull();
		expect(resolved!.endsWith('node_modules/@agentuity/coder-tui')).toBe(true);
	});

	test('returns null when coder package cannot be resolved', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const cliDir = join(tempDir, 'cli');
		await mkdir(cliDir, { recursive: true });

		const resolved = await resolveExtensionPath(undefined, {
			cwd: tempDir,
			env: {},
			moduleUrl: `file://${cliDir}/index.js`,
		});

		expect(resolved).toBeNull();
	});
});

describe('resolveExtensionRuntimeModulePath', () => {
	test('resolves from src when source files exist', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const extensionRoot = join(tempDir, 'extension');
		await createExtensionPackage(extensionRoot, { withSource: true });

		const modulePath = await resolveExtensionRuntimeModulePath(extensionRoot);

		expect(modulePath).toBe(join(extensionRoot, 'src', 'remote-tui.ts'));
	});

	test('resolves from dist when src files are not shipped', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const extensionRoot = join(tempDir, 'extension');
		await createExtensionPackage(extensionRoot, { withSource: false });

		const modulePath = await resolveExtensionRuntimeModulePath(extensionRoot);

		expect(modulePath).toBe(join(extensionRoot, 'dist', 'remote-tui.js'));
	});

	test('returns null when runtime module not found', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const extensionRoot = join(tempDir, 'extension');
		await mkdir(extensionRoot, { recursive: true });
		await writeFile(
			join(extensionRoot, 'package.json'),
			JSON.stringify({ name: '@agentuity/coder-tui', version: '2.0.7' }, null, 2)
		);

		const modulePath = await resolveExtensionRuntimeModulePath(extensionRoot);

		expect(modulePath).toBeNull();
	});
});
