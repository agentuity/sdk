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
			expect(registryContent).toContain('testAgent: testAgent');
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
			expect(registryContent).toContain('firstAgent: firstAgent');
			expect(registryContent).toContain('secondAgent: secondAgent');
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
	});
});
