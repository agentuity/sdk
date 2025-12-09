import { describe, test, expect } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { generateRouteRegistry } from '../src/cmd/build/route-registry';
import type { RouteInfo } from '../src/cmd/build/route-registry';

const TEST_DIR = '/tmp/agentuity-cli-test-route-stream-method';

function createTestDir() {
	rmSync(TEST_DIR, { recursive: true, force: true });
	mkdirSync(TEST_DIR, { recursive: true });
	mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
	return {
		tempDir: TEST_DIR,
		cleanup: () => rmSync(TEST_DIR, { recursive: true, force: true }),
	};
}

describe('Route Stream Method Detection', () => {
	test('router.stream() should set stream: true in route registry', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/stream-events',
					filename: 'src/api/stream.ts',
					hasValidator: false,
					routeType: 'stream', // This is set when router.stream() is detected
					stream: true, // Plugin.ts sets this when routeType === 'stream'
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Stream route should have stream: true
			const streamMatch = content.match(/'POST \/api\/stream-events'[\s\S]*?};/);
			expect(streamMatch).toBeDefined();
			expect(streamMatch?.[0]).toContain('stream: true');
		} finally {
			cleanup();
		}
	});

	test('router.stream() with validator should set stream: true', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/validated-stream',
					filename: 'src/api/validated-stream.ts',
					hasValidator: true,
					routeType: 'stream',
					inputSchemaVariable: 'InputSchema',
					outputSchemaVariable: 'OutputSchema',
					stream: true, // Can also be explicitly set
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Stream route with validator should have stream: true
			const streamMatch = content.match(/'POST \/api\/validated-stream'[\s\S]*?};/);
			expect(streamMatch).toBeDefined();
			expect(streamMatch?.[0]).toContain('stream: true');
		} finally {
			cleanup();
		}
	});

	test('regular POST route should not have stream flag', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/normal-post',
					filename: 'src/api/normal.ts',
					hasValidator: true,
					routeType: 'api',
					inputSchemaVariable: 'InputSchema',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Non-stream POST should not have stream property or should be false
			const postMatch = content.match(/'POST \/api\/normal-post'[\s\S]*?};/);
			expect(postMatch).toBeDefined();
			// Should either not contain 'stream:' or contain 'stream: false'
			const hasStreamTrue = postMatch?.[0].includes('stream: true');
			expect(hasStreamTrue).toBe(false);
		} finally {
			cleanup();
		}
	});

	test('mixed routes with stream and non-stream should be properly differentiated', () => {
		const { tempDir, cleanup } = createTestDir();

		try {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/users',
					filename: 'src/api/users.ts',
					hasValidator: true,
					routeType: 'api',
					outputSchemaVariable: 'UsersSchema',
				},
				{
					method: 'POST',
					path: '/api/events/stream',
					filename: 'src/api/events.ts',
					hasValidator: false,
					routeType: 'stream',
					stream: true, // Plugin.ts sets this when routeType === 'stream'
				},
				{
					method: 'POST',
					path: '/api/users',
					filename: 'src/api/users.ts',
					hasValidator: true,
					routeType: 'api',
					inputSchemaVariable: 'CreateUserSchema',
					outputSchemaVariable: 'UserSchema',
				},
			];

			generateRouteRegistry(join(tempDir, 'src'), routes);

			const registryPath = join(tempDir, '.agentuity', 'routes.generated.ts');
			const content = readFileSync(registryPath, 'utf-8');

			// Stream route should have stream: true
			const streamMatch = content.match(/'POST \/api\/events\/stream'[\s\S]*?};/);
			expect(streamMatch).toBeDefined();
			expect(streamMatch?.[0]).toContain('stream: true');

			// Non-stream routes should not have stream: true
			const getMatch = content.match(/'GET \/api\/users'[\s\S]*?};/);
			expect(getMatch).toBeDefined();
			expect(getMatch?.[0].includes('stream: true')).toBe(false);

			const postMatch = content.match(/'POST \/api\/users'[\s\S]*?};/);
			expect(postMatch).toBeDefined();
			expect(postMatch?.[0].includes('stream: true')).toBe(false);
		} finally {
			cleanup();
		}
	});
});
