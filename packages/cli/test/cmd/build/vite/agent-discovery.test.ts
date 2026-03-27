import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import { discoverAgents } from '../../../../src/cmd/build/vite/agent-discovery';

// Resolve the monorepo root (contains the workspace packages)
// test is at packages/cli/test/cmd/build/vite/ — 6 levels from SDK root
const SDK_ROOT = resolve(import.meta.dir, '../../../../../..');

/**
 * Set up a temp directory with node_modules symlinks so that
 * `import()` can resolve @agentuity/runtime, @agentuity/schema, etc.
 */
function setupNodeModules(testDir: string) {
	const nmDir = join(testDir, 'node_modules');
	const agentuityDir = join(nmDir, '@agentuity');
	mkdirSync(agentuityDir, { recursive: true });

	// Symlink workspace packages
	const workspacePackages = [
		'runtime',
		'schema',
		'core',
		'server',
		'auth',
		'frontend',
		'test-utils',
	];
	for (const pkg of workspacePackages) {
		const target = join(SDK_ROOT, 'packages', pkg);
		const link = join(agentuityDir, pkg);
		if (existsSync(target) && !existsSync(link)) {
			symlinkSync(target, link, 'dir');
		}
	}

	// Symlink top-level dependencies (hono, zod, etc.)
	// Use the runtime package's node_modules as the source since it has the full set
	const runtimeNm = join(SDK_ROOT, 'packages', 'runtime', 'node_modules');
	const topDeps = ['hono', 'zod'];
	for (const dep of topDeps) {
		const target = join(runtimeNm, dep);
		const link = join(nmDir, dep);
		if (existsSync(target) && !existsSync(link)) {
			symlinkSync(target, link, 'dir');
		}
	}

	// Also symlink from root node_modules for any remaining deps
	const rootNm = join(SDK_ROOT, 'node_modules');
	const rootDeps = ['@standard-schema'];
	for (const dep of rootDeps) {
		const target = join(rootNm, dep);
		const link = join(nmDir, dep);
		if (existsSync(target) && !existsSync(link)) {
			symlinkSync(target, link, 'dir');
		}
	}
}

describe('agent-discovery', () => {
	let testDir: string;
	let srcDir: string;
	let agentDir: string;
	const logger = createMockLogger();

	beforeEach(() => {
		testDir = join(tmpdir(), `agent-discovery-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		agentDir = join(srcDir, 'agent');
		mkdirSync(agentDir, { recursive: true });
		setupNodeModules(testDir);
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should discover agent with default export', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('test-agent', {
	description: 'A test agent',
	schema: {
		input: s.object({ name: s.string() }),
		output: s.object({ greeting: s.string() }),
	},
	handler: async (ctx, input) => {
		return { greeting: \`Hello, \${input.name}\` };
	},
});
`;
		writeFileSync(join(agentDir, 'test.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.name).toBe('test-agent');
		expect(agents[0]!.description).toBe('A test agent');
		expect(agents[0]!.filename).toBe('src/agent/test.ts');
		expect(agents[0]!.id).toMatch(/^agentid_/);
		expect(agents[0]!.agentId).toMatch(/^agent_/);
	});

	test('should extract JSON Schema from agent schemas', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('schema-agent', {
	schema: {
		input: s.object({
			name: s.string(),
			age: s.number().optional(),
		}),
		output: s.object({
			message: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		return { message: \`Hello, \${input.name}\` };
	},
});
`;
		writeFileSync(join(agentDir, 'schema.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);

		// Schema codes should be JSON Schema strings
		expect(agents[0]!.inputSchemaCode).toBeDefined();
		const inputSchema = JSON.parse(agents[0]!.inputSchemaCode!);
		expect(inputSchema.type).toBe('object');
		expect(inputSchema.properties.name.type).toBe('string');

		expect(agents[0]!.outputSchemaCode).toBeDefined();
		const outputSchema = JSON.parse(agents[0]!.outputSchemaCode!);
		expect(outputSchema.type).toBe('object');
		expect(outputSchema.properties.message.type).toBe('string');
	});

	test('should discover agent with variable declaration', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const myAgent = createAgent('variable-agent', {
	schema: {
		input: s.object({ value: s.number() }),
		output: s.object({ result: s.number() }),
	},
	handler: async (ctx, input) => {
		return { result: input.value * 2 };
	},
});

export default myAgent;
`;
		writeFileSync(join(agentDir, 'variable.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.name).toBe('variable-agent');
		expect(agents[0]!.inputSchemaCode).toBeDefined();
		expect(agents[0]!.outputSchemaCode).toBeDefined();
	});

	test('should discover agent without schema', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('no-schema-agent', {
	description: 'Agent without schemas',
	handler: async (ctx, input) => {
		return { ok: true };
	},
});
`;
		writeFileSync(join(agentDir, 'no-schema.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.name).toBe('no-schema-agent');
		expect(agents[0]!.description).toBe('Agent without schemas');
		expect(agents[0]!.inputSchemaCode).toBeUndefined();
		expect(agents[0]!.outputSchemaCode).toBeUndefined();
	});

	test('should discover multiple agents', async () => {
		const agent1Code = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('agent-one', {
	handler: async (ctx, input) => ({ result: 1 }),
});
`;
		writeFileSync(join(agentDir, 'agent1.ts'), agent1Code);

		const subDir = join(agentDir, 'math');
		mkdirSync(subDir);
		const agent2Code = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('agent-two', {
	description: 'Second agent',
	handler: async (ctx, input) => ({ result: 2 }),
});
`;
		writeFileSync(join(subDir, 'agent2.ts'), agent2Code);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(2);
		const names = agents.map((a) => a.name).sort();
		expect(names).toEqual(['agent-one', 'agent-two']);
	});

	test('should return empty array when no agent directory exists', async () => {
		rmSync(agentDir, { recursive: true, force: true });

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(0);
	});

	test('should skip non-agent files', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('valid-agent', {
	handler: async (ctx, input) => ({ y: 1 }),
});
`;
		writeFileSync(join(agentDir, 'valid.ts'), agentCode);

		const utilCode = `
export function helper() { return 42; }
`;
		writeFileSync(join(agentDir, 'util.ts'), utilCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.name).toBe('valid-agent');
	});

	test('should skip eval.ts files', async () => {
		const evalCode = `
export const something = 'not an agent';
`;
		writeFileSync(join(agentDir, 'eval.ts'), evalCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(0);
	});

	test('should not mutate source files (read-only)', async () => {
		const originalCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('readonly-agent', {
	handler: async (ctx, input) => ({ result: 'ok' }),
});
`;
		const filePath = join(agentDir, 'readonly.ts');
		writeFileSync(filePath, originalCode);

		const beforeContent = await Bun.file(filePath).text();
		await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		const afterContent = await Bun.file(filePath).text();

		expect(afterContent).toBe(beforeContent);
	});

	test('should generate consistent IDs for same agent', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('consistent-agent', {
	handler: async (ctx, input) => ({ value: 1 }),
});
`;
		writeFileSync(join(agentDir, 'consistent.ts'), agentCode);

		const agents1 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		const agents2 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents1[0]!.id).toBe(agents2[0]!.id);
		expect(agents1[0]!.agentId).toBe(agents2[0]!.agentId);
	});

	test('should handle deeply nested agent directories', async () => {
		const deepDir = join(agentDir, 'feature', 'subfeature', 'helpers');
		mkdirSync(deepDir, { recursive: true });

		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('nested-agent', {
	description: 'Deeply nested agent',
	handler: async (ctx, input) => ({ deep: true }),
});
`;
		writeFileSync(join(deepDir, 'agent.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		const nestedAgent = agents.find((a) => a.name === 'nested-agent');
		expect(nestedAgent).toBeDefined();
		expect(nestedAgent!.filename).toContain('feature/subfeature/helpers');
	});

	test('should resolve variable reference for input schema', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const AgentInput = s.object({
	text: s.string(),
});

export default createAgent('variable-input-agent', {
	description: 'Agent with variable input schema',
	schema: {
		input: AgentInput,
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
		writeFileSync(join(agentDir, 'variable-input.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.inputSchemaCode).toBeDefined();

		// Should be valid JSON Schema (not a Zod source string)
		const schema = JSON.parse(agents[0]!.inputSchemaCode!);
		expect(schema.type).toBe('object');
		expect(schema.properties.text.type).toBe('string');
	});

	test('should handle agent with description as direct property', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('described-agent', {
	description: 'Direct description property',
	handler: async (ctx, input) => ({ ok: true }),
});
`;
		writeFileSync(join(agentDir, 'described.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.description).toBe('Direct description property');
	});

	test('should handle agent with schema using @agentuity/schema (s)', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('s-schema-agent', {
	schema: {
		input: s.object({
			name: s.string(),
			tags: s.array(s.string()),
			active: s.boolean(),
		}),
	},
	handler: async (ctx, input) => ({ ok: true }),
});
`;
		writeFileSync(join(agentDir, 's-schema.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		const schema = JSON.parse(agents[0]!.inputSchemaCode!);
		expect(schema.type).toBe('object');
		expect(schema.properties.name.type).toBe('string');
		expect(schema.properties.tags.type).toBe('array');
		expect(schema.properties.tags.items.type).toBe('string');
		expect(schema.properties.active.type).toBe('boolean');
	});

	test('should handle agent with optional fields in schema', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export default createAgent('optional-schema-agent', {
	schema: {
		input: s.object({
			required_field: s.string(),
			optional_field: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => ({ ok: true }),
});
`;
		writeFileSync(join(agentDir, 'optional-schema.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		const schema = JSON.parse(agents[0]!.inputSchemaCode!);
		expect(schema.type).toBe('object');
		expect(schema.properties.required_field.type).toBe('string');
		expect(schema.properties.optional_field).toBeDefined();
		// required_field should be in required array, optional_field should not
		if (schema.required) {
			expect(schema.required).toContain('required_field');
			expect(schema.required).not.toContain('optional_field');
		}
	});

	test('should return version based on file hash', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('versioned-agent', {
	handler: async (ctx, input) => ({ ok: true }),
});
`;
		writeFileSync(join(agentDir, 'versioned.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0]!.version).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
	});

	test('version changes when file content changes', async () => {
		const filePath = join(agentDir, 'mutable.ts');

		writeFileSync(
			filePath,
			`
import { createAgent } from '@agentuity/runtime';
export default createAgent('mutable-agent', {
	handler: async (ctx, input) => ({ v: 1 }),
});
`
		);
		const agents1 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		writeFileSync(
			filePath,
			`
import { createAgent } from '@agentuity/runtime';
export default createAgent('mutable-agent', {
	handler: async (ctx, input) => ({ v: 2 }),
});
`
		);
		const agents2 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents1[0]!.version).not.toBe(agents2[0]!.version);
		// agentId is stable (based on project + name, not content)
		expect(agents1[0]!.agentId).toBe(agents2[0]!.agentId);
	});

	test('should throw error when agent fails to import', async () => {
		// Valid agent
		writeFileSync(
			join(agentDir, 'good.ts'),
			`
import { createAgent } from '@agentuity/runtime';
export default createAgent('good-agent', {
	handler: async (ctx, input) => ({ ok: true }),
});
`
		);

		// File with createAgent in text but broken import
		writeFileSync(
			join(agentDir, 'broken.ts'),
			`
import { createAgent } from '@agentuity/runtime';
import { broken } from './does-not-exist';
export default createAgent('broken-agent', {
	handler: async (ctx, input) => broken(),
});
`
		);

		// Should throw an error with helpful message
		await expect(
			discoverAgents(srcDir, 'test-project', 'test-deployment', logger)
		).rejects.toThrow('Failed to import agent');
	});

	test('should skip test files and test directories', async () => {
		// Valid agent
		writeFileSync(
			join(agentDir, 'good.ts'),
			`
import { createAgent } from '@agentuity/runtime';
export default createAgent('good-agent', {
	handler: async (ctx, input) => ({ ok: true }),
});
`
		);

		// Test file that would fail if imported
		writeFileSync(
			join(agentDir, 'good.test.ts'),
			`
import { test, expect } from 'bun:test';
test('example', () => {
	expect(1).toBe(1);
});
`
		);

		// Spec file
		writeFileSync(
			join(agentDir, 'good.spec.ts'),
			`
import { describe, it } from 'bun:test';
describe('example', () => {
	it('works', () => {});
});
`
		);

		// Test directory with file
		const testDir = join(agentDir, 'test');
		mkdirSync(testDir, { recursive: true });
		writeFileSync(
			join(testDir, 'helper.ts'),
			`
// This would fail with "Cannot use test outside of the test runner"
import { test } from 'bun:test';
test('helper', () => {});
`
		);

		// __tests__ directory
		const testsDir = join(agentDir, '__tests__');
		mkdirSync(testsDir, { recursive: true });
		writeFileSync(
			join(testsDir, 'agent.test.ts'),
			`
import { test } from 'bun:test';
test('agent', () => {});
`
		);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		// Should only find the valid agent
		expect(agents.length).toBe(1);
		expect(agents[0]!.name).toBe('good-agent');
	});
});
