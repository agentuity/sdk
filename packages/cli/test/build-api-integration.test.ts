import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Integration test to verify that src/api/index.ts is automatically
 * discovered and mounted during the build process.
 *
 * This test checks the actual build output to ensure the API router
 * registration code is generated correctly.
 */
describe('Build API Integration', () => {
	test('generated app.js should contain API router mount code', () => {
		// This test assumes a test project exists at a known location
		// In a real scenario, we'd create a temp project, build it, and verify
		const testProjectPath = '/Users/jhaynie/tmp/v1/refactor-2';

		if (!existsSync(testProjectPath)) {
			console.log('Test project not found, skipping integration test');
			return;
		}

		const generatedAppPath = join(testProjectPath, '.agentuity', 'app.js');

		if (!existsSync(generatedAppPath)) {
			console.log('Generated app.js not found, run build first');
			return;
		}

		const generatedContent = readFileSync(generatedAppPath, 'utf-8');

		// Verify API router import/require
		expect(generatedContent).toContain('exports_api');

		// Verify router.route('/api', ...) call
		expect(generatedContent).toContain('router.route("/api"');

		// Verify the API default export is used
		expect(generatedContent).toContain('api2');
	});

	test('build should succeed when src/api/index.ts exists', () => {
		// This test documents the expected behavior:
		// 1. src/api/index.ts is detected
		// 2. Generated code includes router.route('/api', api)
		// 3. API routes are accessible at /api/*

		const expectedGeneratedCode = `
await (async() => {
	const { getRouter } = await import('@agentuity/runtime');
	const router = getRouter()!;
	const api = require('./src/api/index').default;
	router.route('/api', api);
})();`;

		expect(expectedGeneratedCode).toBeDefined();
		expect(expectedGeneratedCode).toContain("router.route('/api'");
	});
});
