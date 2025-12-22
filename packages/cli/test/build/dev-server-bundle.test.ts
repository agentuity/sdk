import { describe, test, expect } from 'bun:test';
import { join } from 'path';

/**
 * Tests for dev server bundle loading behavior.
 *
 * This test suite verifies that the dev server correctly loads the bundled app
 * (.agentuity/app.js) instead of the source file (src/generated/app.ts).
 *
 * This is critical for AI Gateway functionality because LLM provider patches
 * are only applied during Bun.build - importing the source file directly
 * would bypass these patches entirely.
 *
 * Prevents regression of issue #293 where AI Gateway was not enabled in dev mode.
 */
describe('Dev Server Bundle Loading', () => {
	test('bun-dev-server should reference .agentuity/app.js bundle path', async () => {
		// Read the bun-dev-server source to verify it imports the bundled output
		const serverPath = join(
			import.meta.dir,
			'../../src/cmd/build/vite/bun-dev-server.ts'
		);
		const serverSource = await Bun.file(serverPath).text();

		// Must import from .agentuity/app.js (the bundled output with patches)
		expect(serverSource).toContain('.agentuity/app.js');

		// Must NOT import from src/generated/app.ts (source without patches)
		expect(serverSource).not.toMatch(/import\s*\(\s*[`'"].*src\/generated\/app\.ts/);

		// Should have explanatory comment about why bundle is required
		expect(serverSource).toContain('LLM');
		expect(serverSource).toContain('patch');
	});

	test('bun-dev-server should not regenerate entry file', async () => {
		// Read the bun-dev-server source
		const serverPath = join(
			import.meta.dir,
			'../../src/cmd/build/vite/bun-dev-server.ts'
		);
		const serverSource = await Bun.file(serverPath).text();

		// Should NOT call generateEntryFile (that's done before bundling in dev/index.ts)
		expect(serverSource).not.toContain('generateEntryFile');

		// Should NOT call generateWorkbenchFiles (that's also done before bundling)
		expect(serverSource).not.toContain('generateWorkbenchFiles');
	});

	test('bun-dev-server should verify bundle exists before loading', async () => {
		const serverPath = join(
			import.meta.dir,
			'../../src/cmd/build/vite/bun-dev-server.ts'
		);
		const serverSource = await Bun.file(serverPath).text();

		// Should check that bundle file exists
		expect(serverSource).toContain('.exists()');
		expect(serverSource).toContain('Dev bundle not found');
	});

	test('dev/index.ts should generate workbench files before bundling', async () => {
		const devIndexPath = join(import.meta.dir, '../../src/cmd/dev/index.ts');
		const devIndexSource = await Bun.file(devIndexPath).text();

		// Find the build section
		const buildSection = devIndexSource.match(
			/Building dev bundle[\s\S]*?installExternalsAndBuild/
		)?.[0];

		expect(buildSection).toBeDefined();

		// Workbench generation should happen before entry file generation
		const workbenchIndex = buildSection!.indexOf('generateWorkbenchFiles');
		const entryIndex = buildSection!.indexOf('generateEntryFile');
		const bundleIndex = buildSection!.indexOf('installExternalsAndBuild');

		// All three should be present
		expect(workbenchIndex).toBeGreaterThan(-1);
		expect(entryIndex).toBeGreaterThan(-1);
		expect(bundleIndex).toBeGreaterThan(-1);

		// Order should be: workbench -> entry -> bundle
		expect(workbenchIndex).toBeLessThan(entryIndex);
		expect(entryIndex).toBeLessThan(bundleIndex);
	});

	test('dev/index.ts should pass workbench config to generateEntryFile', async () => {
		const devIndexPath = join(import.meta.dir, '../../src/cmd/dev/index.ts');
		const devIndexSource = await Bun.file(devIndexPath).text();

		// Find the generateEntryFile call in the build section
		const entryFileCall = devIndexSource.match(
			/generateEntryFile\(\{[\s\S]*?\}\)/
		)?.[0];

		expect(entryFileCall).toBeDefined();

		// Should include workbench config
		expect(entryFileCall).toContain('workbench:');
	});
});
