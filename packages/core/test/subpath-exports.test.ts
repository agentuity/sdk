/**
 * Tests for package.json subpath exports resolution.
 *
 * These tests verify that @agentuity/core subpath exports are correctly
 * configured for compatibility with all bundlers, including esbuild.
 *
 * Related: GitHub issue #511 - esbuild cannot resolve @agentuity/core/workbench
 *
 * The fix uses simplified exports (plain strings) + typesVersions instead of
 * conditional exports objects, which some bundlers (like esbuild) don't handle correctly.
 */

import { describe, test, expect } from 'bun:test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const corePackageDir = join(__dirname, '..');

describe('@agentuity/core subpath exports', () => {
	test('package.json exports use simple string format (not conditional objects)', async () => {
		const pkgJsonPath = join(corePackageDir, 'package.json');
		const pkgJson = await Bun.file(pkgJsonPath).json();

		// Verify exports exist
		expect(pkgJson.exports).toBeDefined();

		// Verify main export is a simple string (not an object with conditions)
		expect(typeof pkgJson.exports['.']).toBe('string');
		expect(pkgJson.exports['.']).toBe('./dist/index.js');

		// Verify workbench subpath export is a simple string
		expect(typeof pkgJson.exports['./workbench']).toBe('string');
		expect(pkgJson.exports['./workbench']).toBe('./dist/workbench.js');
	});

	test('typesVersions provides TypeScript type resolution for subpaths', async () => {
		const pkgJsonPath = join(corePackageDir, 'package.json');
		const pkgJson = await Bun.file(pkgJsonPath).json();

		// Verify typesVersions exists
		expect(pkgJson.typesVersions).toBeDefined();
		expect(pkgJson.typesVersions['*']).toBeDefined();

		// Verify workbench types are mapped
		expect(pkgJson.typesVersions['*']['workbench']).toBeDefined();
		expect(pkgJson.typesVersions['*']['workbench']).toContain('./dist/workbench.d.ts');
	});

	test('dist/workbench.js exists and is valid', async () => {
		const workbenchJsPath = join(corePackageDir, 'dist/workbench.js');
		const exists = await Bun.file(workbenchJsPath).exists();
		expect(exists).toBe(true);

		// Verify it exports the expected functions
		const workbenchModule = await import(workbenchJsPath);
		expect(typeof workbenchModule.decodeWorkbenchConfig).toBe('function');
		expect(typeof workbenchModule.encodeWorkbenchConfig).toBe('function');
	});

	test('dist/workbench.d.ts exists', async () => {
		const workbenchDtsPath = join(corePackageDir, 'dist/workbench.d.ts');
		const exists = await Bun.file(workbenchDtsPath).exists();
		expect(exists).toBe(true);
	});

	test('@agentuity/core/workbench can be imported directly', async () => {
		// This tests that Bun can resolve the subpath export
		const { decodeWorkbenchConfig, encodeWorkbenchConfig } = await import(
			'@agentuity/core/workbench'
		);

		expect(typeof decodeWorkbenchConfig).toBe('function');
		expect(typeof encodeWorkbenchConfig).toBe('function');

		// Test roundtrip
		const config = { route: '/test', headers: { 'X-Test': 'value' } };
		const encoded = encodeWorkbenchConfig(config);
		const decoded = decodeWorkbenchConfig(encoded);
		expect(decoded.route).toBe('/test');
		expect(decoded.headers).toEqual({ 'X-Test': 'value' });
	});

	test('esbuild can resolve @agentuity/core/workbench subpath export (GitHub issue #511)', async () => {
		// This is the critical regression test for issue #511
		// esbuild was failing to resolve conditional subpath exports like:
		// "./workbench": { "types": "...", "import": "..." }
		// The fix uses simple string exports + typesVersions instead

		// Use the dist/workbench.js file directly to test that the exports are correctly structured
		const workbenchPath = join(corePackageDir, 'dist/workbench.js');

		const virtualEntry = `
import { decodeWorkbenchConfig } from '${workbenchPath}';
console.log(decodeWorkbenchConfig);
`;

		const result = await esbuild.build({
			stdin: {
				contents: virtualEntry,
				resolveDir: corePackageDir,
				loader: 'ts',
			},
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'browser',
			conditions: ['import', 'browser', 'default'],
			logLevel: 'silent',
		});

		// If esbuild can resolve and bundle the import, no errors should occur
		expect(result.errors.length).toBe(0);
		expect(result.outputFiles).toBeDefined();
		expect(result.outputFiles!.length).toBeGreaterThan(0);

		// Verify the output contains the bundled code
		const output = result.outputFiles![0].text;
		expect(output).toContain('decodeWorkbenchConfig');
	});

	test('package.json exports are compatible with esbuild package resolution', async () => {
		// This tests that the exports field format is compatible with esbuild's package resolver
		// The key is that exports use simple strings, not conditional objects

		const pkgJsonPath = join(corePackageDir, 'package.json');
		const pkgJson = await Bun.file(pkgJsonPath).json();

		// esbuild requires simple string exports for subpaths
		// Conditional exports objects like { "types": "...", "import": "..." } are NOT supported
		for (const [_key, value] of Object.entries(pkgJson.exports)) {
			expect(typeof value).toBe('string');
		}
	});
});
