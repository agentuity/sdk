import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
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

		test.skip('should generate route registry', () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/users',
					filename: './api/users.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/users',
					filename: './api/users.ts',
					hasValidator: true,
					routeType: 'api',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			expect(existsSync(registryPath)).toBe(true);

			const registryContent = Bun.file(registryPath).text();
			expect(registryContent).resolves.toContain('"GET /users"');
			expect(registryContent).resolves.toContain('"POST /users"');
			expect(registryContent).resolves.toContain('hasValidator: false');
			expect(registryContent).resolves.toContain('hasValidator: true');
		});

		test.skip('should include different route types', () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/api',
					filename: './api/main.ts',
					hasValidator: false,
					routeType: 'api',
				},
				{
					method: 'POST',
					path: '/sms',
					filename: './api/sms.ts',
					hasValidator: false,
					routeType: 'sms',
				},
				{
					method: 'POST',
					path: '/cron',
					filename: './api/cron.ts',
					hasValidator: false,
					routeType: 'cron',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			const registryContent = Bun.file(registryPath).text();

			expect(registryContent).resolves.toContain("routeType: 'api'");
			expect(registryContent).resolves.toContain("routeType: 'sms'");
			expect(registryContent).resolves.toContain("routeType: 'cron'");
		});

		test.skip('should export RouteKey type', () => {
			const routes: RouteInfo[] = [
				{
					method: 'GET',
					path: '/test',
					filename: './api/test.ts',
					hasValidator: false,
					routeType: 'api',
				},
			];

			generateRouteRegistry(srcDir, routes);

			const registryPath = join(generatedDir, 'routes.ts');
			const registryContent = Bun.file(registryPath).text();

			expect(registryContent).resolves.toContain('export type RouteKey');
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
	});
});
