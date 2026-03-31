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
		JSON.stringify({ name: '@agentuity/coder', version: '2.0.7' }, null, 2)
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
	test('prefers the CLI-installed coder package before cwd node_modules fallback', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const cliInstalledRoot = join(tempDir, 'global-node_modules', '@agentuity', 'coder');
		const cwdInstalledRoot = join(tempDir, 'project', 'node_modules', '@agentuity', 'coder');
		await createExtensionPackage(cliInstalledRoot);
		await createExtensionPackage(cwdInstalledRoot);

		const resolved = await resolveExtensionPath(undefined, {
			cwd: join(tempDir, 'project'),
			resolvePackageEntry: async (specifier) => {
				expect(specifier).toBe('@agentuity/coder');
				return join(cliInstalledRoot, 'dist', 'index.js');
			},
		});

		expect(resolved).toBe(cliInstalledRoot);
	});

	test('falls back to cwd node_modules when the CLI install does not resolve coder', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const cwdInstalledRoot = join(tempDir, 'project', 'node_modules', '@agentuity', 'coder');
		await createExtensionPackage(cwdInstalledRoot);

		const resolved = await resolveExtensionPath(undefined, {
			cwd: join(tempDir, 'project'),
			resolvePackageEntry: async () => {
				throw new Error('not installed with CLI');
			},
		});

		expect(resolved).toBe(cwdInstalledRoot);
	});

	test('resolves the remote TUI module from dist when src files are not shipped', async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-cli-coder-'));

		const cliInstalledRoot = join(tempDir, 'global-node_modules', '@agentuity', 'coder');
		await createExtensionPackage(cliInstalledRoot, { withSource: false });

		const modulePath = await resolveExtensionRuntimeModulePath(cliInstalledRoot);

		expect(modulePath).toBe(join(cliInstalledRoot, 'dist', 'remote-tui.js'));
	});
});
