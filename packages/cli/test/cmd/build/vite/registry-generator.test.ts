import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	generateAgentRegistry,
	generateRouteRegistry,
} from '../../../../src/cmd/build/vite/registry-generator';
import type { AgentMetadata } from '../../../../src/cmd/build/vite/agent-discovery';
import type { RouteInfo } from '../../../../src/cmd/build/vite/route-discovery';

describe('registry-generator', () => {
	let testDir: string;
	let srcDir: string;
	let generatedDir: string;

	beforeEach(() => {
		// Create unique temp directory for each test
		testDir = join(tmpdir(), `registry-gen-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		generatedDir = join(srcDir, 'generated');
		mkdirSync(srcDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('generateAgentRegistry', () => {
		test('should generate registry for single agent', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/test.ts',
					name: 'test-agent',
					id: 'agentid_abc123',
					agentId: 'agent_xyz789',
					version: 'v1',
					description: 'Test agent',
					inputSchemaCode: 'z.object({ name: z.string() })',
					outputSchemaCode: 'z.object({ greeting: z.string() })',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const registryPath = join(generatedDir, 'registry.ts');
			expect(existsSync(registryPath)).toBe(true);

			const registryContent = await Bun.file(registryPath).text();
			expect(registryContent).toContain('import testAgent from');
			expect(registryContent).toContain('testAgent');
			expect(registryContent).toContain('export type TestAgentAgent');
		});

		test('should generate registry for multiple agents', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/first.ts',
					name: 'first-agent',
					id: 'agentid_1',
					agentId: 'agent_1',
					version: 'v1',
				},
				{
					filename: './agent/second.ts',
					name: 'second-agent',
					id: 'agentid_2',
					agentId: 'agent_2',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const registryPath = join(generatedDir, 'registry.ts');
			const registryContent = await Bun.file(registryPath).text();

			expect(registryContent).toContain('import firstAgent from');
			expect(registryContent).toContain('import secondAgent from');
			expect(registryContent).toContain('firstAgent');
			expect(registryContent).toContain('secondAgent');
		});

		test('should convert kebab-case names to camelCase', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/my-cool-agent.ts',
					name: 'my-cool-agent',
					id: 'agentid_1',
					agentId: 'agent_1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const registryPath = join(generatedDir, 'registry.ts');
			const registryContent = await Bun.file(registryPath).text();

			expect(registryContent).toContain('myCoolAgent');
			expect(registryContent).toContain('export type MyCoolAgentAgent');
		});

		test('should throw error on naming collision', () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/test-agent.ts',
					name: 'test-agent',
					id: 'agentid_1',
					agentId: 'agent_1',
					version: 'v1',
				},
				{
					filename: './agent/testAgent.ts',
					name: 'testAgent',
					id: 'agentid_2',
					agentId: 'agent_2',
					version: 'v1',
				},
			];

			expect(() => {
				generateAgentRegistry(srcDir, agents);
			}).toThrow();
		});

		test('should include AgentRegistry augmentation', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/test.ts',
					name: 'test-agent',
					id: 'agentid_1',
					agentId: 'agent_1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const registryPath = join(generatedDir, 'registry.ts');
			const registryContent = await Bun.file(registryPath).text();

			expect(registryContent).toContain('declare module "@agentuity/runtime"');
			expect(registryContent).toContain('export interface AgentRegistry');
		});

		test('should remove legacy types.generated.d.ts if it exists', async () => {
			// Create legacy types file
			const agentDir = join(srcDir, 'agent');
			mkdirSync(agentDir, { recursive: true });
			const legacyTypesPath = join(agentDir, 'types.generated.d.ts');
			await Bun.write(legacyTypesPath, '// legacy types');

			const agents: AgentMetadata[] = [
				{
					filename: './agent/test.ts',
					name: 'test-agent',
					id: 'agentid_1',
					agentId: 'agent_1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			// Legacy file should be removed
			expect(existsSync(legacyTypesPath)).toBe(false);
		});
	});

	describe('generateRouteRegistry', () => {
		test('should generate RPC route registry with nested structure', async () => {
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
					path: '/api/users/profile',
					filename: './api/users/profile/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'profileAgent',
					agentImportPath: '@agent/profile',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain('export interface RPCRouteRegistry');
			expect(routesContent).toContain('hello: {');
			expect(routesContent).toContain('post: { input:');
			expect(routesContent).toContain('users: {');
			expect(routesContent).toContain('profile: {');
			expect(routesContent).toContain('get: { input:');
		});

		test('should generate route registry with multiple routes', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/users',
					filename: './api/users.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/api/users',
					filename: './api/users.ts',
					hasValidator: true,
					routeType: 'api',
					agentVariable: 'usersAgent',
					agentImportPath: '@agent/users',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			expect(existsSync(registryPath)).toBe(true);

			const registryContent = await Bun.file(registryPath).text();
			// Route keys use single quotes in the generated output
			expect(registryContent).toContain("'GET /api/users'");
			expect(registryContent).toContain("'POST /api/users'");
			// Routes without validator should have never types
			expect(registryContent).toContain('inputSchema: never');
			// Routes with validator should have schema types
			expect(registryContent).toContain('POSTApiUsersInputSchema');
		});

		test('should handle different route types (api, websocket, sse)', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/data',
					filename: './api/data.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'GET',
					path: '/api/stream',
					filename: './api/stream.ts',
					hasValidator: true,
					routeType: 'websocket',
					agentVariable: 'streamAgent',
					agentImportPath: '@agent/stream',
				},
				{
					method: 'GET',
					path: '/api/events',
					filename: './api/events.ts',
					hasValidator: true,
					routeType: 'sse',
					outputSchemaVariable: 'eventsSchema',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			const registryContent = await Bun.file(registryPath).text();

			// API routes go in RouteRegistry
			expect(registryContent).toContain("'GET /api/data'");
			// WebSocket routes go in WebSocketRouteRegistry
			expect(registryContent).toContain("'/api/stream'");
			expect(registryContent).toContain('export interface WebSocketRouteRegistry');
			// SSE routes go in SSERouteRegistry
			expect(registryContent).toContain("'/api/events'");
			expect(registryContent).toContain('export interface SSERouteRegistry');
			// RPC registry includes type info
			expect(registryContent).toContain("type: 'api'");
			expect(registryContent).toContain("type: 'websocket'");
			expect(registryContent).toContain("type: 'sse'");
		});

		test('should generate RouteRegistry interface for module augmentation', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/react': '^1.0.0',
					},
				})
			);

			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/test',
					filename: './api/test.ts',
					hasValidator: false,
					routeType: 'api',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			const registryContent = await Bun.file(registryPath).text();

			// Should augment @agentuity/react with RouteRegistry
			expect(registryContent).toContain("declare module '@agentuity/react'");
			expect(registryContent).toContain('export interface RouteRegistry');
			// Route key should be in the registry
			expect(registryContent).toContain("'GET /api/test'");
		});

		test('should generate types for routes with agentVariable (issue #291)', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/services',
					filename: './api/services/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'servicesAgent',
					agentImportPath: '@agent/services',
				},
				{
					method: 'get',
					path: '/api/logs',
					filename: './api/logs/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'logsAgent',
					agentImportPath: '@agent/logs',
				},
				{
					method: 'get',
					path: '/api/traces',
					filename: './api/traces/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'tracesAgent',
					agentImportPath: '@agent/traces',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain('export interface RPCRouteRegistry');
			expect(routesContent).toContain('services: {');
			expect(routesContent).toContain('logs: {');
			expect(routesContent).toContain('traces: {');
			expect(routesContent).toContain('export type GETApiServicesInput');
			expect(routesContent).toContain('export type GETApiServicesOutput');
			expect(routesContent).toContain('export type GETApiLogsInput');
			expect(routesContent).toContain('export type GETApiLogsOutput');
			expect(routesContent).toContain('export type GETApiTracesInput');
			expect(routesContent).toContain('export type GETApiTracesOutput');
		});

		test('should include agentVariable in schema type generation filter', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/data',
					filename: './api/data/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'dataAgent',
					agentImportPath: '@agent/data',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain('export type POSTApiDataInput');
			expect(routesContent).toContain('export type POSTApiDataOutput');
			expect(routesContent).toContain('export type POSTApiDataInputSchema');
			expect(routesContent).toContain('export type POSTApiDataOutputSchema');
			expect(routesContent).toContain(
				"import type { InferInput, InferOutput } from '@agentuity/core'"
			);
		});

		test('should use never for routes without validator or schemas', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/health',
					filename: './api/health/route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain('health: {');
			expect(routesContent).toContain('input: never');
			expect(routesContent).toContain('output: never');
			expect(routesContent).not.toContain('export type GETApiHealthInput');
		});

		test('should generate imports for routes with agentVariable', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/process',
					filename: './api/process/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'processAgent',
					agentImportPath: '@agent/process',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain(
				"import type processAgent from '../agent/process/index.js'"
			);
		});

		test('should handle routes with inputSchemaVariable without hasValidator', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/submit',
					filename: 'src/api/submit/route.ts',
					routeType: 'api',
					hasValidator: false,
					inputSchemaVariable: 'submitInputSchema',
					outputSchemaVariable: 'submitOutputSchema',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain('export type POSTApiSubmitInput');
			expect(routesContent).toContain('export type POSTApiSubmitOutput');
		});

		test('should use never for routes with hasValidator but no schema variables (issue #291 - zValidator query)', async () => {
			// This reproduces the bug where zValidator('query', schema) routes have
			// hasValidator: true but no inputSchemaVariable/outputSchemaVariable/agentVariable
			// The generated code was referencing types like GETApiTracesInputSchema that don't exist
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/traces',
					filename: './api/traces/route.ts',
					routeType: 'api',
					hasValidator: true, // zValidator detected
					// But no schema variables because zValidator('query', ...) doesn't extract schemas
					inputSchemaVariable: undefined,
					outputSchemaVariable: undefined,
					agentVariable: undefined,
				},
				{
					method: 'get',
					path: '/api/traces/:traceId',
					filename: './api/traces/route.ts',
					routeType: 'api',
					hasValidator: true,
					inputSchemaVariable: undefined,
					outputSchemaVariable: undefined,
					agentVariable: undefined,
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Should use 'never' types since no schemas were extracted
			expect(routesContent).toContain('traces: {');
			expect(routesContent).toContain('input: never');
			expect(routesContent).toContain('output: never');

			// Should NOT reference non-existent types
			expect(routesContent).not.toContain('GETApiTracesInputSchema');
			expect(routesContent).not.toContain('GETApiTracesOutputSchema');
			expect(routesContent).not.toContain('GETApiTracesTraceIdInputSchema');
			expect(routesContent).not.toContain('GETApiTracesTraceIdOutputSchema');

			// Should NOT generate export type statements for these routes
			expect(routesContent).not.toContain('export type GETApiTracesInput');
			expect(routesContent).not.toContain('export type GETApiTracesOutput');
		});

		test('should augment @agentuity/react module for all route registries (issue #384)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/react': '^1.0.0',
					},
				})
			);

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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Must augment @agentuity/react - this is where the hooks import types from
			expect(routesContent).toContain("declare module '@agentuity/react'");

			// Should NOT augment @agentuity/frontend - types are re-exported from @agentuity/react
			// which has its own augmentable interfaces
			expect(routesContent).not.toContain("declare module '@agentuity/frontend'");

			// Should contain all four registries in the augmentation
			expect(routesContent).toContain('export interface RouteRegistry');
			expect(routesContent).toContain('export interface WebSocketRouteRegistry');
			expect(routesContent).toContain('export interface SSERouteRegistry');
			expect(routesContent).toContain('export interface RPCRouteRegistry');
		});

		test('should generate route entries inside RouteRegistry (issue #384)', async () => {
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
					path: '/api/users',
					filename: './api/users/route.ts',
					routeType: 'api',
					hasValidator: true,
					inputSchemaVariable: 'usersInputSchema',
					outputSchemaVariable: 'usersOutputSchema',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Route keys should be in METHOD /path format
			expect(routesContent).toContain("'POST /api/hello'");
			expect(routesContent).toContain("'GET /api/users'");

			// Should have inputSchema and outputSchema for each route
			expect(routesContent).toContain('inputSchema:');
			expect(routesContent).toContain('outputSchema:');
		});

		test('should generate WebSocket and SSE route entries (issue #384)', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/ws',
					filename: './api/ws/route.ts',
					routeType: 'websocket',
					hasValidator: true,
					inputSchemaVariable: 'wsInputSchema',
					outputSchemaVariable: 'wsOutputSchema',
				},
				{
					method: 'get',
					path: '/api/events',
					filename: './api/events/route.ts',
					routeType: 'sse',
					hasValidator: true,
					outputSchemaVariable: 'eventsOutputSchema',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// WebSocket routes should be in WebSocketRouteRegistry
			expect(routesContent).toContain('export interface WebSocketRouteRegistry');
			expect(routesContent).toContain("'/api/ws'");

			// SSE routes should be in SSERouteRegistry
			expect(routesContent).toContain('export interface SSERouteRegistry');
			expect(routesContent).toContain("'/api/events'");
		});

		test('should generate routes file with only one route type (issue #384)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/react': '^1.0.0',
					},
				})
			);

			// Test that even with just one API route, all registries are included
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/health',
					filename: './api/health/route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Should still augment @agentuity/react
			expect(routesContent).toContain("declare module '@agentuity/react'");

			// All registries should exist (even if some are empty)
			expect(routesContent).toContain('export interface RouteRegistry');
			expect(routesContent).toContain('export interface WebSocketRouteRegistry');
			expect(routesContent).toContain('export interface SSERouteRegistry');
			expect(routesContent).toContain('export interface RPCRouteRegistry');

			// API route should be in RouteRegistry
			expect(routesContent).toContain("'GET /api/health'");
		});

		test('should generate types for nested subdirectory routes (e.g., /api/knowledge/categorize)', async () => {
			// Simulates the real-world case from src/api/knowledge/index.ts
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/knowledge',
					filename: 'src/api/knowledge/index.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'POST',
					path: '/api/knowledge/categorize',
					filename: 'src/api/knowledge/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'knowledgeCategorizer',
					agentImportPath: '@agent/knowledge-categorizer',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Both routes should be in RouteRegistry
			expect(routesContent).toContain("'GET /api/knowledge'");
			expect(routesContent).toContain("'POST /api/knowledge/categorize'");

			// Types should be generated for the route with validator
			expect(routesContent).toContain('export type POSTApiKnowledgeCategorizeInput');
			expect(routesContent).toContain('export type POSTApiKnowledgeCategorizeOutput');
			expect(routesContent).toContain('export type POSTApiKnowledgeCategorizeInputSchema');
			expect(routesContent).toContain('export type POSTApiKnowledgeCategorizeOutputSchema');

			// Import should be generated for the agent
			expect(routesContent).toContain(
				"import type knowledgeCategorizer from '../agent/knowledge-categorizer/index.js'"
			);

			// RPC registry should have nested structure
			expect(routesContent).toContain('knowledge: {');
			expect(routesContent).toContain('categorize: {');
			expect(routesContent).toContain('post: { input: POSTApiKnowledgeCategorizeInput');
		});

		test('should handle agentVariable without hasValidator (edge case - use never types)', async () => {
			// Edge case: agentVariable is set but hasValidator is false
			// This shouldn't normally happen, but the code should handle it gracefully
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/edge-case',
					filename: './api/edge-case/route.ts',
					routeType: 'api',
					hasValidator: false, // No validator
					agentVariable: 'myAgent', // But has agent variable
					agentImportPath: '@agent/my-agent',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Route should be in registry with never types since import wasn't added
			// (imports are only added when hasValidator is true)
			expect(routesContent).toContain("'POST /api/edge-case'");
			// Should NOT have generated the import since hasValidator is false
			expect(routesContent).not.toContain('import type myAgent from');
		});

		test('should handle agentVariable without agentImportPath (edge case - should not crash)', async () => {
			// Edge case: agentVariable is set but agentImportPath is missing
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/no-import-path',
					filename: './api/no-import-path/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'orphanAgent',
					// agentImportPath is undefined
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// Should not crash - route should still be in registry with never types
			expect(routesContent).toContain("'POST /api/no-import-path'");
			// Should use never types since import couldn't be generated
			expect(routesContent).toContain('inputSchema: never');
			expect(routesContent).toContain('outputSchema: never');
			// Should NOT have generated an import since agentImportPath is missing
			expect(routesContent).not.toContain('import type orphanAgent from');
			// Should NOT generate broken types like "typeof undefined"
			expect(routesContent).not.toContain('typeof undefined');
			expect(routesContent).not.toContain("typeof orphanAgent['inputSchema']");
		});

		test('should handle multiple routes from same subdirectory file', async () => {
			// Multiple routes defined in the same file (common pattern)
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/items',
					filename: 'src/api/items/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'listItemsAgent',
					agentImportPath: '@agent/list-items',
				},
				{
					method: 'POST',
					path: '/api/items',
					filename: 'src/api/items/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'createItemAgent',
					agentImportPath: '@agent/create-item',
				},
				{
					method: 'GET',
					path: '/api/items/:id',
					filename: 'src/api/items/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'getItemAgent',
					agentImportPath: '@agent/get-item',
				},
				{
					method: 'DELETE',
					path: '/api/items/:id',
					filename: 'src/api/items/index.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			// All routes should be in RouteRegistry
			expect(routesContent).toContain("'GET /api/items'");
			expect(routesContent).toContain("'POST /api/items'");
			expect(routesContent).toContain("'GET /api/items/:id'");
			expect(routesContent).toContain("'DELETE /api/items/:id'");

			// Types should be generated for routes with validators
			expect(routesContent).toContain('export type GETApiItemsInput');
			expect(routesContent).toContain('export type POSTApiItemsInput');
			expect(routesContent).toContain('export type GETApiItemsIdInput');

			// No types for DELETE route without validator
			expect(routesContent).not.toContain('export type DELETEApiItemsIdInput');

			// RPC registry should handle path params correctly
			expect(routesContent).toContain('items: {');
			expect(routesContent).toContain('id: {');
		});

		test('should handle empty routes array (boundary condition)', async () => {
			const routes: RouteInfo[] = [];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			// Empty routes should not create a file
			expect(existsSync(routesPath)).toBe(false);
		});

		test('should handle trailing slashes in routes', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/hello',
					filename: './api/hello.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'GET',
					path: '/api/hello/',
					filename: './api/hello-slash.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Both keys should exist
			expect(content).toContain("'GET /api/hello'");
			expect(content).toContain("'GET /api/hello/'");
			// RPC tree should have hello segment and no empty property names
			expect(content).toContain('hello: {');
			expect(content).not.toMatch(/''\s*:/);
		});

		test('should handle wildcard path segments like *path', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/files/*path',
					filename: './api/files/route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// RouteRegistry key exists
			expect(content).toContain("'GET /api/files/*path'");

			// RPC tree path: files.path.get
			expect(content).toContain('files: {');
			expect(content).toContain('path: {');
			expect(content).toContain('get: { input:');
		});

		test('should handle catch-all routes (/*)', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/*',
					filename: './api/catch-all.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Key exists in RouteRegistry
			expect(content).toContain("'GET /api/*'");
		});

		test('should strip parameter modifiers (?, +, *) in RPC registry segments', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/users/:userId?',
					filename: './api/users.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'GET',
					path: '/api/items/:itemId+',
					filename: './api/items.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'GET',
					path: '/api/files/:fileId*',
					filename: './api/files.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('users: {');
			expect(content).toContain('userId: {');
			expect(content).toContain('items: {');
			expect(content).toContain('itemId: {');
			expect(content).toContain('files: {');
			expect(content).toContain('fileId: {');
		});

		test('should support deeply nested routes', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/a/b/c/d/e/f/g',
					filename: './api/deep/route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((seg) => {
				expect(content).toContain(`${seg}: {`);
			});
		});

		test('should group multiple methods under the same path in RPC registry', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/resources',
					filename: './api/resources.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'POST',
					path: '/api/resources',
					filename: './api/resources.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'PUT',
					path: '/api/resources',
					filename: './api/resources.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'DELETE',
					path: '/api/resources',
					filename: './api/resources.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('resources: {');
			expect(content).toContain('get: { input:');
			expect(content).toContain('post: { input:');
			expect(content).toContain('put: { input:');
			expect(content).toContain('delete: { input:');
		});

		test('should handle routes with only inputSchemaVariable', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/input-only',
					filename: './api/input-only.ts',
					routeType: 'api',
					hasValidator: true,
					inputSchemaVariable: 'inputOnlySchema',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('export type POSTApiInputOnlyInput');
			expect(content).toContain('export type POSTApiInputOnlyInputSchema');
			// Output should use never since no output schema
			expect(content).toContain('export type POSTApiInputOnlyOutput = never');
		});

		test('should handle routes with only outputSchemaVariable', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/output-only',
					filename: './api/output-only.ts',
					routeType: 'api',
					hasValidator: true,
					outputSchemaVariable: 'outputOnlySchema',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('export type GETApiOutputOnlyOutput');
			expect(content).toContain('export type GETApiOutputOnlyOutputSchema');
			// Input should use never since no input schema
			expect(content).toContain('export type GETApiOutputOnlyInput = never');
		});

		test('should encode routeType for websocket and sse routes in RPC registry', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'get',
					path: '/api/ws/chat',
					filename: './api/ws/chat.ts',
					routeType: 'websocket',
					hasValidator: false,
				},
				{
					method: 'get',
					path: '/api/sse/stream',
					filename: './api/sse/stream.ts',
					routeType: 'sse',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('ws: {');
			expect(content).toContain('chat: {');
			expect(content).toMatch(/type:\s*'websocket'/);
			expect(content).toContain('sse: {');
			expect(content).toContain('stream: {');
			expect(content).toMatch(/type:\s*'sse'/);
		});

		test('should handle stream routeType', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'post',
					path: '/api/stream/data',
					filename: './api/stream/data.ts',
					routeType: 'stream',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain('data: {');
			expect(content).toMatch(/type:\s*'stream'/);
		});

		test('should handle routes with Unicode path segments', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/emoji/fire',
					filename: './api/emoji.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain("'GET /api/emoji/fire'");
			expect(content).toContain('emoji: {');
			expect(content).toContain('fire: {');
		});

		test('should normalize Windows-style route filenames', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/items',
					filename: 'src\\api\\items\\index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'itemsAgent',
					agentImportPath: '@agent/items',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain("import type itemsAgent from '../agent/items/index.js'");
			// Should not contain backslashes in import paths
			expect(content).not.toMatch(/from '.*\\.*'/);
		});

		test('should handle relative agentImportPath correctly', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/relative',
					filename: 'src/api/relative/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'relativeAgent',
					agentImportPath: '../custom/relative-agent',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Relative paths should be resolved and converted
			expect(content).toContain('import type relativeAgent from');
		});

		test('should handle nested @agent alias with file path', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'POST',
					path: '/api/nested/deep',
					filename: 'src/api/nested/deep/index.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'deepAgent',
					agentImportPath: '@agent/nested/deep',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain("import type deepAgent from '../agent/nested/deep.js'");
		});

		test('should handle route at /api root path', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api',
					filename: './api/index.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			expect(content).toContain("'GET /api'");
		});

		test('should handle routes with hyphenated path segments', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/my-feature/sub-route',
					filename: './api/my-feature/sub-route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Should convert to camelCase in RPC registry
			expect(content).toContain('myFeature: {');
			expect(content).toContain('subRoute: {');
		});

		test('should handle routes with underscore path segments', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/my_feature/sub_route',
					filename: './api/my_feature/sub_route.ts',
					routeType: 'api',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Should convert to camelCase in RPC registry
			expect(content).toContain('myFeature: {');
			expect(content).toContain('subRoute: {');
		});

		test('should handle mixed websocket, sse, and api routes together', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/data',
					filename: './api/data.ts',
					routeType: 'api',
					hasValidator: false,
				},
				{
					method: 'GET',
					path: '/api/live',
					filename: './api/live.ts',
					routeType: 'websocket',
					hasValidator: false,
				},
				{
					method: 'GET',
					path: '/api/feed',
					filename: './api/feed.ts',
					routeType: 'sse',
					hasValidator: false,
				},
				{
					method: 'POST',
					path: '/api/stream',
					filename: './api/stream.ts',
					routeType: 'stream',
					hasValidator: false,
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// All registries should be populated
			expect(content).toContain("'GET /api/data'");
			expect(content).toContain("'/api/live'");
			expect(content).toContain("'/api/feed'");
			expect(content).toContain("'POST /api/stream'");

			// RPC registry should have all types
			expect(content).toMatch(/type:\s*'api'/);
			expect(content).toMatch(/type:\s*'websocket'/);
			expect(content).toMatch(/type:\s*'sse'/);
			expect(content).toMatch(/type:\s*'stream'/);
		});

		test('should handle duplicate agent variables across routes without collision', async () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api/items',
					filename: './api/items/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'itemsAgent',
					agentImportPath: '@agent/items',
				},
				{
					method: 'POST',
					path: '/api/items',
					filename: './api/items/route.ts',
					routeType: 'api',
					hasValidator: true,
					agentVariable: 'itemsAgent',
					agentImportPath: '@agent/items',
				},
			];

			generateRouteRegistry(srcDir, routes);
			const content = await Bun.file(join(generatedDir, 'routes.ts')).text();

			// Should only import once
			const importMatches = content.match(
				/import type itemsAgent from '\.\.\/agent\/items\/index\.js'/g
			);
			expect(importMatches?.length).toBe(1);

			// Both routes should exist
			expect(content).toContain("'GET /api/items'");
			expect(content).toContain("'POST /api/items'");
		});

		test('should NOT generate frontend client code when neither @agentuity/react nor @agentuity/frontend is installed (issue #404)', async () => {
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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).not.toContain("import { createClient } from '@agentuity/frontend'");
			expect(routesContent).not.toContain('export function createAPIClient');
			expect(routesContent).toContain("declare module '@agentuity/react'");
		});

		test('should generate frontend client code when @agentuity/frontend is installed but not @agentuity/react (issue #404)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/frontend': '^1.0.0',
					},
				})
			);

			mkdirSync(join(srcDir, 'web'), { recursive: true });

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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain("import { createClient } from '@agentuity/frontend'");
			expect(routesContent).toContain('export function createAPIClient');
			expect(routesContent).toContain('export interface RPCRouteRegistry');
			expect(routesContent).toContain("declare module '@agentuity/react'");
		});

		test('should generate module augmentation when @agentuity/react is installed (issue #404)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/react': '^1.0.0',
					},
				})
			);

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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain("declare module '@agentuity/react'");
			expect(routesContent).toContain('export interface RouteRegistry');
			expect(routesContent).toContain('export interface WebSocketRouteRegistry');
			expect(routesContent).toContain('export interface SSERouteRegistry');
			expect(routesContent).toContain('export interface RPCRouteRegistry');
			expect(routesContent).not.toContain("import { createClient } from '@agentuity/frontend'");
			expect(routesContent).not.toContain('export function createAPIClient');
		});

		test('should NOT generate frontend client when @agentuity/frontend is installed but no src/web directory (issue #404)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/frontend': '^1.0.0',
					},
				})
			);

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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).not.toContain("import { createClient } from '@agentuity/frontend'");
			expect(routesContent).not.toContain('export function createAPIClient');
		});

		test('should prefer @agentuity/react over @agentuity/frontend when both are installed (issue #404)', async () => {
			writeFileSync(
				join(testDir, 'package.json'),
				JSON.stringify({
					name: 'test-project',
					dependencies: {
						'@agentuity/react': '^1.0.0',
						'@agentuity/frontend': '^1.0.0',
					},
				})
			);

			mkdirSync(join(srcDir, 'web'), { recursive: true });

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
			];

			generateRouteRegistry(srcDir, routes);

			const routesPath = join(generatedDir, 'routes.ts');
			const routesContent = await Bun.file(routesPath).text();

			expect(routesContent).toContain("declare module '@agentuity/react'");
			expect(routesContent).not.toContain("import { createClient } from '@agentuity/frontend'");
			expect(routesContent).not.toContain('export function createAPIClient');
		});
	});

	describe('generateAgentRegistry edge cases', () => {
		test('should handle empty agents list (boundary condition)', async () => {
			const agents: AgentMetadata[] = [];

			generateAgentRegistry(srcDir, agents);

			const registryPath = join(generatedDir, 'registry.ts');
			expect(existsSync(registryPath)).toBe(true);

			const content = await Bun.file(registryPath).text();

			// Still has module augmentation and AgentDefinitions
			expect(content).toContain('export const AgentDefinitions = {');
			expect(content).toContain('declare module "@agentuity/runtime"');
		});

		test('should rewrite src/agent and .tsx imports correctly', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: 'src/agent/foo.tsx',
					name: 'foo-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			expect(content).toContain("import fooAgent from '../agent/foo.js';");
		});

		test('should detect collisions after stripping punctuation and whitespace', () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/my-agent.ts',
					name: 'my-agent',
					id: '1',
					agentId: 'a1',
					version: 'v1',
				},
				{
					filename: './agent/my_agent.ts',
					name: 'my_agent',
					id: '2',
					agentId: 'a2',
					version: 'v1',
				},
			];

			expect(() => generateAgentRegistry(srcDir, agents)).toThrow();
		});

		test('should include agent description in JSDoc', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/documented.ts',
					name: 'documented-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
					description: 'This agent does something important',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			expect(content).toContain('This agent does something important');
		});

		test('should generate InferInput and InferOutput types', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/typed.ts',
					name: 'typed-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
					inputSchemaCode: 'z.object({ name: z.string() })',
					outputSchemaCode: 'z.object({ result: z.boolean() })',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			expect(content).toContain('export type TypedAgentInput = InferInput<');
			expect(content).toContain('export type TypedAgentOutput = InferOutput<');
			expect(content).toContain('export type TypedAgentInputSchema = typeof typedAgent');
			expect(content).toContain('export type TypedAgentOutputSchema = typeof typedAgent');
		});

		test('should handle agent names with multiple consecutive hyphens', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/multi-hyphen.ts',
					name: 'multi--hyphen---agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			// Should handle multiple hyphens gracefully
			expect(content).toContain('multiHyphenAgent');
		});

		test('should handle agent names with leading/trailing hyphens', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/edge-case.ts',
					name: '-leading-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			// Should handle leading hyphen gracefully
			expect(content).toContain('leadingAgent');
		});

		test('should handle deeply nested agent paths', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/deep/nested/path/agent.ts',
					name: 'deep-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			expect(content).toContain("import deepAgent from '../agent/deep/nested/path/agent.js';");
		});

		test('should handle agent names starting with digits (produces valid identifier)', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/123-agent.ts',
					name: '123-agent',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			// Identifier should NOT start with a digit (invalid in JS/TS)
			// toCamelCase prefixes with underscore: '123-agent' -> '_123Agent'
			expect(content).not.toMatch(/import\s+\d+\w*\s+from/);
			expect(content).toContain('import _123Agent from');
			expect(content).toContain('export type _123AgentAgent');
		});

		test('should handle numeric-only agent names', async () => {
			const agents: AgentMetadata[] = [
				{
					filename: './agent/123.ts',
					name: '123',
					id: 'id1',
					agentId: 'agent1',
					version: 'v1',
				},
			];

			generateAgentRegistry(srcDir, agents);

			const content = await Bun.file(join(generatedDir, 'registry.ts')).text();

			// Pure numeric names should also produce valid identifiers
			// toCamelCase prefixes with underscore: '123' -> '_123'
			expect(content).not.toMatch(/import\s+\d+\s+from/);
			expect(content).toContain('import _123 from');
			expect(content).toContain('export type _123Agent');
		});
	});
});
