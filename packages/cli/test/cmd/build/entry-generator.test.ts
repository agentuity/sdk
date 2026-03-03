import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import { generateEntryFile } from '../../../src/cmd/build/entry-generator';

/**
 * Tests for entry-generator.ts
 *
 * Regression test for GitHub issue #324:
 * app.generated.ts diverges between bun run dev and bun run build
 *
 * The generated src/generated/app.ts should be identical regardless of
 * whether mode is 'dev' or 'prod'. Runtime behavior differs based on
 * isDevelopment() checks, not based on code generation.
 *
 * @see https://github.com/agentuity/sdk/issues/324
 */
describe('entry-generator', () => {
	let testDir: string;
	let srcDir: string;
	let apiDir: string;
	let generatedDir: string;
	const logger = createMockLogger();

	beforeEach(() => {
		testDir = join(tmpdir(), `entry-generator-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		apiDir = join(srcDir, 'api');
		generatedDir = join(srcDir, 'generated');
		mkdirSync(apiDir, { recursive: true });
		mkdirSync(generatedDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('generates identical app.ts for dev and prod modes (issue #324)', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/health', async (c) => {
	return c.json({ status: 'ok' });
});

export default router;
`;
		writeFileSync(join(apiDir, 'index.ts'), routeCode);

		const baseOptions = {
			rootDir: testDir,
			projectId: 'test-project',
			deploymentId: 'test-deployment',
			logger,
			workbench: undefined,
			vitePort: 5173,
		};

		await generateEntryFile({ ...baseOptions, mode: 'dev' });
		const devApp = await Bun.file(join(generatedDir, 'app.ts')).text();

		await generateEntryFile({ ...baseOptions, mode: 'prod' });
		const prodApp = await Bun.file(join(generatedDir, 'app.ts')).text();

		expect(prodApp).toBe(devApp);
	});

	test('generated app.ts contains asset proxy routes', async () => {
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/test', async (c) => c.text('test'));

export default router;
`;
		writeFileSync(join(apiDir, 'index.ts'), routeCode);

		await generateEntryFile({
			rootDir: testDir,
			projectId: 'test-project',
			deploymentId: 'test-deployment',
			logger,
			mode: 'prod',
			workbench: undefined,
		});

		const appContent = await Bun.file(join(generatedDir, 'app.ts')).text();

		expect(appContent).toContain('// Asset proxy routes - Development mode only');
		expect(appContent).toContain('if (isDevelopment() && process.env.VITE_PORT)');
		expect(appContent).toContain('proxyToVite');
	});

	test('generated app.ts contains runtime mode detection', async () => {
		writeFileSync(join(apiDir, 'index.ts'), 'export default {};');

		await generateEntryFile({
			rootDir: testDir,
			projectId: 'test-project',
			deploymentId: 'test-deployment',
			logger,
			mode: 'prod',
			workbench: undefined,
		});

		const appContent = await Bun.file(join(generatedDir, 'app.ts')).text();

		expect(appContent).toContain('// Runtime mode detection helper');
		expect(appContent).toContain('const isDevelopment = ()');
	});
});
