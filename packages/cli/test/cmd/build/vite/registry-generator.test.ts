import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateAgentRegistry } from '../../../../src/cmd/build/vite/registry-generator';
import type { AgentMetadata } from '../../../../src/cmd/build/vite/agent-discovery';

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
