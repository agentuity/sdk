import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockLogger } from '@agentuity/test-utils';
import { discoverAgents } from '../../../../src/cmd/build/vite/agent-discovery';

describe('agent-discovery', () => {
	let testDir: string;
	let srcDir: string;
	let agentDir: string;
	const logger = createMockLogger();

	beforeEach(() => {
		// Create unique temp directory for each test
		testDir = join(tmpdir(), `agent-discovery-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		agentDir = join(srcDir, 'agent');
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		// Clean up temp directory
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should discover agent with default export', async () => {
		// Create a simple agent file
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('test-agent', {
	schema: {
		input: z.object({ name: z.string() }),
		output: z.object({ greeting: z.string() }),
	},
	metadata: {
		description: 'A test agent',
	},
	handler: async (ctx, input) => {
		return { greeting: \`Hello, \${input.name}\` };
	},
});
`;
		writeFileSync(join(agentDir, 'test.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0].name).toBe('test-agent');
		expect(agents[0].description).toBe('A test agent');
		expect(agents[0].filename).toBe('src/agent/test.ts');
		expect(agents[0].inputSchemaCode).toBeDefined();
		expect(agents[0].outputSchemaCode).toBeDefined();
		expect(agents[0].id).toMatch(/^agentid_/);
		expect(agents[0].agentId).toMatch(/^agent_/);
	});

	test('should discover agent with variable declaration', async () => {
		// Create agent with const declaration
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const myAgent = createAgent('variable-agent', {
	schema: {
		input: z.object({ value: z.number() }),
		output: z.object({ result: z.number() }),
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
		expect(agents[0].name).toBe('variable-agent');
		expect(agents[0].inputSchemaCode).toBeDefined();
		expect(agents[0].outputSchemaCode).toBeDefined();
	});

	test('should discover agent with evals', async () => {
		// Create agent file
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('eval-agent', {
	schema: {
		input: z.object({ text: z.string() }),
		output: z.object({ response: z.string() }),
	},
	handler: async (ctx, input) => {
		return { response: input.text.toUpperCase() };
	},
});
`;
		writeFileSync(join(agentDir, 'eval-agent.ts'), agentCode);

		// Create eval file in same directory
		const evalCode = `
import { createEval } from '@agentuity/runtime';
import agent from './eval-agent';

export const eval1 = createEval('uppercase-test', {
	metadata: {
		description: 'Test uppercase conversion',
	},
	handler: async (ctx) => {
		const result = await agent.run(ctx, { text: 'hello' });
		return result.response === 'HELLO';
	},
});

export const eval2 = createEval('empty-test', {
	handler: async (ctx) => {
		const result = await agent.run(ctx, { text: '' });
		return result.response === '';
	},
});
`;
		writeFileSync(join(agentDir, 'eval.ts'), evalCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0].name).toBe('eval-agent');
		expect(agents[0].evals).toBeDefined();
		expect(agents[0].evals).toHaveLength(2);
		expect(agents[0].evals![0].name).toBe('uppercase-test');
		expect(agents[0].evals![0].description).toBe('Test uppercase conversion');
		expect(agents[0].evals![1].name).toBe('empty-test');
	});

	test('should discover multiple agents', async () => {
		// Create first agent
		const agent1Code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('agent-one', {
	schema: {
		input: z.object({ a: z.number() }),
		output: z.object({ result: z.number() }),
	},
	handler: async (ctx, input) => {
		return { result: input.a + 1 };
	},
});
`;
		writeFileSync(join(agentDir, 'agent1.ts'), agent1Code);

		// Create second agent in subdirectory
		const subDir = join(agentDir, 'math');
		mkdirSync(subDir);
		const agent2Code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('agent-two', {
	schema: {
		input: z.object({ b: z.number() }),
		output: z.object({ result: z.number() }),
	},
	metadata: {
		description: 'Second agent',
	},
	handler: async (ctx, input) => {
		return { result: input.b * 2 };
	},
});
`;
		writeFileSync(join(subDir, 'agent2.ts'), agent2Code);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(2);
		const names = agents.map((a) => a.name).sort();
		expect(names).toEqual(['agent-one', 'agent-two']);
	});

	test('should return empty array when no agent directory exists', async () => {
		// Remove agent directory
		rmSync(agentDir, { recursive: true, force: true });

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(0);
	});

	test('should skip non-agent files', async () => {
		// Create valid agent
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('valid-agent', {
	schema: {
		input: z.object({ x: z.number() }),
		output: z.object({ y: z.number() }),
	},
	handler: async (ctx, input) => {
		return { y: input.x };
	},
});
`;
		writeFileSync(join(agentDir, 'valid.ts'), agentCode);

		// Create file without createAgent
		const utilCode = `
export function helper() {
	return 42;
}
`;
		writeFileSync(join(agentDir, 'util.ts'), utilCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0].name).toBe('valid-agent');
	});

	test('should skip eval.ts files', async () => {
		// Create standalone eval.ts (should be skipped)
		const evalCode = `
import { createEval } from '@agentuity/runtime';

export const someEval = createEval('standalone', {
	handler: async (ctx) => {
		return true;
	},
});
`;
		writeFileSync(join(agentDir, 'eval.ts'), evalCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(0);
	});

	test('should extract schema code correctly', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('schema-agent', {
	schema: {
		input: z.object({
			name: z.string(),
			age: z.number().optional(),
		}),
		output: z.object({
			message: z.string(),
			timestamp: z.number(),
		}),
	},
	handler: async (ctx, input) => {
		return {
			message: \`Hello, \${input.name}\`,
			timestamp: Date.now(),
		};
	},
});
`;
		writeFileSync(join(agentDir, 'schema.ts'), agentCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents).toHaveLength(1);
		expect(agents[0].inputSchemaCode).toContain('z.object');
		expect(agents[0].inputSchemaCode).toContain('name');
		expect(agents[0].inputSchemaCode).toContain('age');
		expect(agents[0].outputSchemaCode).toContain('z.object');
		expect(agents[0].outputSchemaCode).toContain('message');
		expect(agents[0].outputSchemaCode).toContain('timestamp');
	});

	test('should not mutate source files (read-only)', async () => {
		const originalCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('readonly-agent', {
	schema: {
		input: z.object({ data: z.string() }),
		output: z.object({ result: z.string() }),
	},
	handler: async (ctx, input) => {
		return { result: input.data };
	},
});
`;
		const filePath = join(agentDir, 'readonly.ts');
		writeFileSync(filePath, originalCode);

		// Read original file content
		const beforeContent = await Bun.file(filePath).text();

		// Discover agents
		await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		// Read file content after discovery
		const afterContent = await Bun.file(filePath).text();

		// File should be unchanged
		expect(afterContent).toBe(beforeContent);
		expect(afterContent).toBe(originalCode);
	});

	test('should generate consistent IDs for same agent', async () => {
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

export default createAgent('consistent-agent', {
	schema: {
		input: z.object({ value: z.number() }),
		output: z.object({ value: z.number() }),
	},
	handler: async (ctx, input) => {
		return { value: input.value };
	},
});
`;
		writeFileSync(join(agentDir, 'consistent.ts'), agentCode);

		// Discover multiple times
		const agents1 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		const agents2 = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		expect(agents1[0].id).toBe(agents2[0].id);
		expect(agents1[0].agentId).toBe(agents2[0].agentId);
	});

	test('should discover agents via re-exports from index file', async () => {
		// Create an agent in a subdirectory
		const userDir = join(agentDir, 'user');
		mkdirSync(userDir);

		const agentCode = `
import { createAgent } from '@agentuity/runtime';

export default createAgent('user-agent', {
	description: 'User management agent',
	handler: async (ctx, input) => ({ userId: '123' }),
});
`;
		writeFileSync(join(userDir, 'agent.ts'), agentCode);

		// Create index.ts that re-exports the agent
		const indexCode = `export { default as userAgent } from './user/agent';`;
		writeFileSync(join(agentDir, 'index.ts'), indexCode);

		const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

		// Should discover the agent from the subdirectory
		const userAgent = agents.find((a) => a.name === 'user-agent');
		expect(userAgent).toBeDefined();
		expect(userAgent!.filename).toContain('user/agent.ts');
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
});
