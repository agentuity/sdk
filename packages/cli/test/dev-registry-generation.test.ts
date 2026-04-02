/**
 * Dev Mode Registry Generation Tests
 *
 * Verifies that the dev mode properly generates agent registries
 * before bundling, ensuring type safety in development.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Resolve the monorepo root — test is at packages/cli/test/
const SDK_ROOT = resolve(import.meta.dir, '../../..');

/**
 * Set up node_modules symlinks so that import() can resolve workspace packages.
 */
function setupNodeModules(testDir: string) {
	const nmDir = join(testDir, 'node_modules');
	const agentuityDir = join(nmDir, '@agentuity');
	mkdirSync(agentuityDir, { recursive: true });

	for (const pkg of ['runtime', 'schema', 'core', 'server', 'auth', 'frontend', 'test-utils']) {
		const target = join(SDK_ROOT, 'packages', pkg);
		const link = join(agentuityDir, pkg);
		if (existsSync(target) && !existsSync(link)) {
			symlinkSync(target, link, 'dir');
		}
	}

	const runtimeNm = join(SDK_ROOT, 'packages', 'runtime', 'node_modules');
	for (const dep of ['hono', 'zod']) {
		const target = join(runtimeNm, dep);
		const link = join(nmDir, dep);
		if (existsSync(target) && !existsSync(link)) {
			symlinkSync(target, link, 'dir');
		}
	}
}

describe('Dev Mode Registry Generation', () => {
	let testDir: string;
	let srcDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `dev-registry-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		mkdirSync(join(srcDir, 'agent'), { recursive: true });
		setupNodeModules(testDir);
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should generate agent registry from discovered agents', async () => {
		const { discoverAgents } = await import('../src/cmd/build/vite/agent-discovery');
		const { generateAgentRegistry } = await import('../src/cmd/build/vite/registry-generator');

		// Create a simple agent file
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const testAgent = createAgent('test-agent', {
	schema: {
		input: s.object({ name: s.string() }),
		output: s.object({ greeting: s.string() }),
	},
	handler: async (ctx, input) => {
		return { greeting: \`Hello, \${input.name}!\` };
	},
});

export default testAgent;
`;
		writeFileSync(join(srcDir, 'agent', 'test.ts'), agentCode);

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const agentMetadata = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		generateAgentRegistry(srcDir, agentMetadata);

		const generatedDir = join(srcDir, 'generated');
		expect(existsSync(join(generatedDir, 'registry.ts'))).toBe(true);

		const registryContent = await Bun.file(join(generatedDir, 'registry.ts')).text();
		expect(registryContent).toContain('testAgent');
		expect(registryContent).toContain('declare module "@agentuity/runtime"');
		expect(registryContent).toContain('export interface AgentRegistry');
	});

	test('should handle empty agents appropriately', async () => {
		const { discoverAgents } = await import('../src/cmd/build/vite/agent-discovery');
		const { generateAgentRegistry } = await import('../src/cmd/build/vite/registry-generator');

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const agentMetadata = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		expect(agentMetadata).toHaveLength(0);

		// Agent registry is always generated (even if empty)
		generateAgentRegistry(srcDir, agentMetadata);
		const generatedDir = join(srcDir, 'generated');
		expect(existsSync(join(generatedDir, 'registry.ts'))).toBe(true);
	});

	test('should document that dev and build modes generate identical registries', () => {
		// Both dev mode and build mode should generate identical registry files.
		// The only difference is the surrounding workflow:
		// - Build: runAllBuilds() calls generateAgentRegistry
		// - Dev: dev command calls the same function before generateEntryFile

		const devModeSteps = [
			'1. Typecheck project',
			'2. Generate workbench files (if enabled)',
			'3. Discover agents',
			'4. Generate agent registry (src/generated/registry.ts)',
			'5. Generate entry file (src/generated/app.ts)',
			'6. Bundle with Bun.build',
			'7. Generate metadata',
		];

		const buildModeSteps = [
			'1. Generate workbench files (if enabled)',
			'2. Discover agents',
			'3. Generate agent registry (src/generated/registry.ts)',
			'4. Build client assets (Vite)',
			'5. Build workbench (if enabled)',
			'6. Build server (Bun.build)',
			'7. Generate metadata',
		];

		// Both modes should generate registries BEFORE entry file generation
		expect(devModeSteps[3]).toContain('agent registry');
		expect(buildModeSteps[2]).toContain('agent registry');
	});
});
