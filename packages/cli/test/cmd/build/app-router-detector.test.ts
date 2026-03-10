import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { detectExplicitRouter } from '../../../src/cmd/build/app-router-detector';

const createTestDir = () => {
	const dir = join(
		import.meta.dir,
		`.test-router-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
	mkdirSync(dir, { recursive: true });
	return dir;
};

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

describe('App Router Detector', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		mkdirSync(join(testDir, 'src', 'api'), { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test('returns not detected when no app.ts exists', async () => {
		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(false);
		expect(result.mounts).toHaveLength(0);
	});

	test('returns not detected when createApp has no router property', async () => {
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp({ name: 'my-app' });`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(false);
	});

	test('returns not detected when createApp is called with no arguments', async () => {
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
export const app = await createApp();`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(false);
	});

	test('detects plain Hono router (default /api mount)', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
router.get('/health', (c) => c.text('OK'));
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
import router from './api/index';
export const app = await createApp({ router });`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(true);
		expect(result.mounts).toHaveLength(1);
		expect(result.mounts[0]!.path).toBe('/api');
		expect(result.mounts[0]!.routerFile).toContain('src/api/index.ts');
	});

	test('detects single RouteMount with custom path', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
import router from './api/index';
export const app = await createApp({ router: { path: '/v1', router } });`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(true);
		expect(result.mounts).toHaveLength(1);
		expect(result.mounts[0]!.path).toBe('/v1');
	});

	test('detects array of RouteMounts', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'v1.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'api', 'v2.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
import v1 from './api/v1';
import v2 from './api/v2';
export const app = await createApp({
	router: [
		{ path: '/api/v1', router: v1 },
		{ path: '/api/v2', router: v2 },
	]
});`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(true);
		expect(result.mounts).toHaveLength(2);
		expect(result.mounts[0]!.path).toBe('/api/v1');
		expect(result.mounts[1]!.path).toBe('/api/v2');
	});

	test('handles await createApp pattern', async () => {
		writeFileSync(
			join(testDir, 'src', 'api', 'index.ts'),
			`import { createRouter } from '@agentuity/runtime';
const router = createRouter();
export default router;`
		);
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
import router from './api/index';
const app = await createApp({ router });`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(true);
		expect(result.mounts).toHaveLength(1);
		expect(result.mounts[0]!.path).toBe('/api');
	});

	test('returns not detected when router variable cannot be resolved', async () => {
		writeFileSync(
			join(testDir, 'src', 'app.ts'),
			`import { createApp } from '@agentuity/runtime';
const router = buildRouter(); // not imported from a file
export const app = await createApp({ router });`
		);

		const result = await detectExplicitRouter(testDir, logger);
		expect(result.detected).toBe(false);
	});
});
