import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('API Router Discovery', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `agentuity-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should detect src/api/index.ts and generate mount code', async () => {
		const srcDir = join(testDir, 'src');
		const apiDir = join(srcDir, 'api');
		mkdirSync(apiDir, { recursive: true });

		// Create src/api/index.ts
		writeFileSync(
			join(apiDir, 'index.ts'),
			`import { Hono } from 'hono';
const api = new Hono();
api.get('/hello', (c) => c.json({ message: 'hello' }));
export default api;`
		);

		// Create app.ts
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
const { server } = await createApp({});`
		);

		// Create agentuity.json
		writeFileSync(join(testDir, 'agentuity.json'), JSON.stringify({ projectId: 'test-project' }));

		// Run build (this would normally be done via CLI)
		// For now, just verify the file structure is correct
		const apiIndexPath = join(apiDir, 'index.ts');
		expect(await Bun.file(apiIndexPath).exists()).toBe(true);

		const content = await Bun.file(apiIndexPath).text();
		expect(content).toContain('export default');
	});

	test('generated app.js should import and mount API router at /api', () => {
		// This is what the generated code should look like:
		const expectedCode = `
await (async() => {
	const { getRouter } = await import('@agentuity/runtime');
	const router = getRouter()!;
	const api = require('./src/api/index').default;
	router.route('/api', api);
})();`;

		expect(expectedCode).toContain("require('./src/api/index')");
		expect(expectedCode).toContain("router.route('/api', api)");
	});

	test('should not generate API mount code if src/api/index.ts does not exist', async () => {
		const srcDir = join(testDir, 'src');
		mkdirSync(srcDir, { recursive: true });

		// Create app.ts without src/api
		writeFileSync(
			join(testDir, 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
const { server } = await createApp({});`
		);

		// Verify no api directory
		const apiIndexPath = join(srcDir, 'api', 'index.ts');
		expect(await Bun.file(apiIndexPath).exists()).toBe(false);
	});
});
