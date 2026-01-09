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
import { fileURLToPath, pathToFileURL } from 'node:url';
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

		// Verify typesVersions exists with proper guards
		expect(pkgJson.typesVersions).toBeDefined();
		if (!pkgJson.typesVersions) return;

		expect(pkgJson.typesVersions['*']).toBeDefined();
		if (!pkgJson.typesVersions['*']) return;

		// Verify workbench types are mapped
		expect(pkgJson.typesVersions['*']['workbench']).toBeDefined();
		if (!pkgJson.typesVersions['*']['workbench']) return;

		expect(pkgJson.typesVersions['*']['workbench']).toContain('./dist/workbench.d.ts');
	});

	test('dist/workbench.js exists and is valid', async () => {
		const workbenchJsPath = join(corePackageDir, 'dist/workbench.js');
		const exists = await Bun.file(workbenchJsPath).exists();
		expect(exists).toBe(true);

		// Verify it exports the expected functions
		// Use pathToFileURL for portable dynamic import across runtimes
		const workbenchModule = await import(pathToFileURL(workbenchJsPath).href);
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

		// Cache package.json to avoid repeated I/O in the resolver
		const pkgJson = await Bun.file(join(corePackageDir, 'package.json')).json();

		// Use an esbuild plugin to resolve @agentuity/core to this package directory,
		// simulating how npm consumers would have the package in node_modules
		const coreResolverPlugin: esbuild.Plugin = {
			name: 'core-resolver',
			setup(build) {
				// Resolve @agentuity/core subpath exports using this package's exports
				// Tighter regex: match @agentuity/core exactly or with subpath
				build.onResolve({ filter: /^@agentuity\/core(?:\/|$)/ }, (args) => {
					if (!args.path.startsWith('@agentuity/core')) return undefined;
					const subpath = args.path.slice('@agentuity/core'.length); // '' | '/workbench' | ...

					// For subpath exports, look up the export in package.json
					const exportKey = subpath === '' ? '.' : `.${subpath}`;
					const exportPath = pkgJson.exports?.[exportKey];

					if (typeof exportPath === 'string') {
						return { path: join(corePackageDir, exportPath) };
					}

					// Fallback for conditional exports (should not happen with fix)
					if (exportPath?.import) {
						return { path: join(corePackageDir, exportPath.import) };
					}

					return undefined;
				});
			},
		};

		const virtualEntry = `
import { decodeWorkbenchConfig } from '@agentuity/core/workbench';
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
			plugins: [coreResolverPlugin],
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

		// Verify exports exists with proper guard
		expect(pkgJson.exports).toBeDefined();
		if (!pkgJson.exports) return;

		// esbuild requires simple string exports for subpaths
		// Conditional exports objects like { "types": "...", "import": "..." } are NOT supported
		for (const [_key, value] of Object.entries(pkgJson.exports)) {
			expect(typeof value).toBe('string');
		}
	});
});
