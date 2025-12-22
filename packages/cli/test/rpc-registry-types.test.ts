import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateRouteRegistry } from '../src/cmd/build/vite/registry-generator';
import type { RouteInfo } from '../src/cmd/build/vite/route-discovery';

describe('RPC Registry Type Generation', () => {
	let testDir: string;
	let srcDir: string;
	let generatedDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `rpc-registry-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		generatedDir = join(srcDir, 'generated');
		mkdirSync(srcDir, { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should generate RPC registry with all route types', async () => {
		const routes: RouteInfo[] = [
			{
				method: 'post',
				path: '/api/hello',
				filename: './api/hello/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'helloAgent',
				agentImportPath: '@agent/hello',
			},
			{
				method: 'get',
				path: '/api/data',
				filename: './api/data/route.ts',
				routeType: 'stream',
				hasValidator: true,
				agentVariable: 'dataAgent',
				agentImportPath: '@agent/data',
			},
			{
				method: 'post',
				path: '/api/ws/chat',
				filename: './api/ws/route.ts',
				routeType: 'websocket',
				hasValidator: true,
				inputSchemaVariable: 'inputSchema',
				outputSchemaVariable: 'outputSchema',
			},
			{
				method: 'get',
				path: '/api/events',
				filename: './api/events/route.ts',
				routeType: 'sse',
				hasValidator: true,
				outputSchemaVariable: 'outputSchema',
			},
		];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain('export interface RPCRouteRegistry');
		expect(routesContent).toContain("type: 'api'");
		expect(routesContent).toContain("type: 'stream'");
		expect(routesContent).toContain("type: 'websocket'");
		expect(routesContent).toContain("type: 'sse'");
	});

	test('should handle multiple HTTP methods', async () => {
		const routes: RouteInfo[] = [
			{
				method: 'get',
				path: '/api/users',
				filename: './api/users/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'getUsersAgent',
				agentImportPath: '@agent/users',
			},
			{
				method: 'post',
				path: '/api/users',
				filename: './api/users/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'createUserAgent',
				agentImportPath: '@agent/users',
			},
			{
				method: 'put',
				path: '/api/users',
				filename: './api/users/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'updateUserAgent',
				agentImportPath: '@agent/users',
			},
		];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain('users: {');
		expect(routesContent).toContain('get: { input:');
		expect(routesContent).toContain('post: { input:');
		expect(routesContent).toContain('put: { input:');
	});

	test('should handle routes with path segment conflicts', async () => {
		const routes: RouteInfo[] = [
			{
				method: 'post',
				path: '/api/run/task',
				filename: './api/run/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'runTaskAgent',
				agentImportPath: '@agent/task',
			},
			{
				method: 'post',
				path: '/api/stream/data',
				filename: './api/stream/route.ts',
				routeType: 'stream',
				hasValidator: true,
				agentVariable: 'streamDataAgent',
				agentImportPath: '@agent/data',
			},
		];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		// Should have 'run' and 'stream' as path segments
		expect(routesContent).toContain('run: {');
		expect(routesContent).toContain('task: {');
		expect(routesContent).toContain('stream: {');
		expect(routesContent).toContain('data: {');
		expect(routesContent).toContain('post: { input:'); // method
	});

	test('should handle empty routes gracefully', async () => {
		const routes: RouteInfo[] = [];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const exists = await Bun.file(routesPath).exists();

		// Should not create file if no routes
		expect(exists).toBe(false);
	});

	test('should handle path parameters by stripping special characters', async () => {
		const routes: RouteInfo[] = [
			{
				method: 'get',
				path: '/api/agents/:id',
				filename: './api/agents/[id]/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'getAgentAgent',
				agentImportPath: '@agent/agents',
			},
			{
				method: 'get',
				path: '/api/codegen/:agentId/stream',
				filename: './api/codegen/[agentId]/route.ts',
				routeType: 'stream',
				hasValidator: true,
				agentVariable: 'codegenAgent',
				agentImportPath: '@agent/codegen',
			},
			{
				method: 'get',
				path: '/api/files/*path',
				filename: './api/files/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'filesAgent',
				agentImportPath: '@agent/files',
			},
			{
				method: 'get',
				path: '/api/users/:userId?',
				filename: './api/users/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'usersAgent',
				agentImportPath: '@agent/users',
			},
		];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		// Path parameters should have special characters stripped
		expect(routesContent).toContain('id: {');
		expect(routesContent).toContain('agentId: {');
		expect(routesContent).toContain('path: {');
		expect(routesContent).toContain('userId: {');
		// Should NOT contain invalid TypeScript with special characters
		expect(routesContent).not.toContain(':id:');
		expect(routesContent).not.toContain(':agentId:');
		expect(routesContent).not.toContain('*path:');
		expect(routesContent).not.toContain('userId?:');
	});

	test('should generate correct nested structure for complex paths', async () => {
		const routes: RouteInfo[] = [
			{
				method: 'post',
				path: '/api/v1/resources/items/search',
				filename: './api/v1/resources/items/route.ts',
				routeType: 'api',
				hasValidator: true,
				agentVariable: 'searchAgent',
				agentImportPath: '@agent/search',
			},
		];

		generateRouteRegistry(srcDir, routes);

		const routesPath = join(generatedDir, 'routes.ts');
		const routesContent = await Bun.file(routesPath).text();

		expect(routesContent).toContain('v1: {');
		expect(routesContent).toContain('resources: {');
		expect(routesContent).toContain('items: {');
		expect(routesContent).toContain('search: {');
		expect(routesContent).toContain('post: { input:');
	});
});
