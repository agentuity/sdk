import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

/**
 * Tests for dev server behavior.
 *
 * This test suite verifies:
 * 1. app.ts validation for bun --hot compatibility
 * 2. Port cleanup and orphan process handling
 * 3. Error message quality when server fails to start
 */
describe('Bun Dev Server', () => {
	const testDir = join(import.meta.dir, `.test-bun-dev-${Date.now()}`);

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe('app.ts validation', () => {
		test('detects v1 pattern (destructuring without export default)', async () => {
			const appPath = join(testDir, 'app.ts');
			writeFileSync(
				appPath,
				`import { createApp } from '@agentuity/runtime';
const { server, logger } = await createApp({ agents: [] });
logger.debug('Running %s', server.url);
// Missing export default!`
			);

			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { validateAppTs } = await import(serverPath);
			const result = await validateAppTs(appPath);

			expect(result.hasCreateApp).toBe(true);
			expect(result.hasDefaultExport).toBe(false);
			expect(result.isV1Pattern).toBe(true);
			expect(result.hints.length).toBeGreaterThan(0);
			expect(result.hints[0]).toContain('export default');
		});

		test('accepts correct v2 pattern (export default createApp)', async () => {
			const appPath = join(testDir, 'app.ts');
			writeFileSync(
				appPath,
				`import { createApp } from '@agentuity/runtime';
import agents from '@agent/index';

export default createApp({ agents });`
			);

			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { validateAppTs } = await import(serverPath);
			const result = await validateAppTs(appPath);

			expect(result.hasCreateApp).toBe(true);
			expect(result.hasDefaultExport).toBe(true);
			expect(result.isV1Pattern).toBe(false);
			expect(result.hints.length).toBe(0);
		});

		test('accepts pattern with logger access', async () => {
			const appPath = join(testDir, 'app.ts');
			writeFileSync(
				appPath,
				`import { createApp } from '@agentuity/runtime';
import agents from '@agent/index';

const app = await createApp({ agents });
app.logger.debug('Running %s', app.server.url);
export default app;`
			);

			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { validateAppTs } = await import(serverPath);
			const result = await validateAppTs(appPath);

			expect(result.hasCreateApp).toBe(true);
			expect(result.hasDefaultExport).toBe(true);
			expect(result.isV1Pattern).toBe(false);
		});

		test('detects missing createApp call', async () => {
			const appPath = join(testDir, 'app.ts');
			writeFileSync(
				appPath,
				`// No createApp call at all
export default { fetch: () => new Response('hi'), port: 3000 };`
			);

			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { validateAppTs } = await import(serverPath);
			const result = await validateAppTs(appPath);

			expect(result.hasCreateApp).toBe(false);
			expect(result.hints.some((h) => h.includes('createApp'))).toBe(true);
		});

		test('accepts Bun.serve pattern (no createApp needed)', async () => {
			const appPath = join(testDir, 'app.ts');
			writeFileSync(
				appPath,
				`// Direct Bun.serve usage (advanced use case)
export default {
  fetch: () => new Response('Hello'),
  port: 3000
};`
			);

			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { validateAppTs } = await import(serverPath);
			const result = await validateAppTs(appPath);

			expect(result.hasCreateApp).toBe(false);
			// Should NOT complain about missing createApp since Bun.serve pattern is valid
			expect(result.hints.length).toBe(0);
		});
	});

	describe('error messages', () => {
		test('buildStartupErrorMessage includes validation hints', async () => {
			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { buildStartupErrorMessage } = await import(serverPath);

			const message = buildStartupErrorMessage(3501, 5000, 'some error output', {
				hasDefaultExport: false,
				hasCreateApp: true,
				isV1Pattern: true,
				hints: ['Missing export default', 'Add: export default createApp({...})'],
			});

			expect(message).toContain('3501');
			expect(message).toContain('5000ms');
			expect(message).toContain('some error output');
			expect(message).toContain('Missing export default');
		});

		test('buildStartupErrorMessage shows generic troubleshooting when no hints', async () => {
			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const { buildStartupErrorMessage } = await import(serverPath);

			const message = buildStartupErrorMessage(3501, 5000, '', {
				hasDefaultExport: true,
				hasCreateApp: true,
				isV1Pattern: false,
				hints: [],
			});

			expect(message).toContain('Troubleshooting');
			expect(message).toContain('lsof -i :3501');
		});
	});

	describe('bun --hot requirements', () => {
		test('bun-dev-server.ts documents export default requirement', async () => {
			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const serverSource = await Bun.file(serverPath).text();

			// Should document the export default requirement
			expect(serverSource).toContain('export default');
			expect(serverSource).toContain('fetch');
			expect(serverSource).toContain('port');
		});

		test('bun-dev-server.ts validates app.ts before starting', async () => {
			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const serverSource = await Bun.file(serverPath).text();

			// Should call validateAppTs
			expect(serverSource).toContain('validateAppTs');
		});

		test('bun-dev-server.ts handles port cleanup', async () => {
			const serverPath = join(import.meta.dir, '../../src/cmd/build/vite/bun-dev-server.ts');
			const serverSource = await Bun.file(serverPath).text();

			// Should have port cleanup logic
			expect(serverSource).toContain('ensurePortAvailable');
			expect(serverSource).toContain('killProcessOnPort');
		});
	});
});
