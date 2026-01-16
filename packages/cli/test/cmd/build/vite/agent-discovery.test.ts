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

	// Tests for schema variable reference resolution
	describe('schema variable reference resolution', () => {
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
			expect(agents[0].inputSchemaCode).toBeDefined();
			// Should contain the resolved schema, not just the identifier name
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].inputSchemaCode).toContain('s.string');
			// Should NOT be just the identifier
			expect(agents[0].inputSchemaCode).not.toBe('AgentInput');
		});

		test('should resolve variable references for both input and output schemas', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const AgentInput = s.object({
	text: s.string(),
});

const AgentOutput = s.object({
	translated: s.string(),
	tokens: s.number(),
});

export default createAgent('variable-both-agent', {
	description: 'Agent with variable input and output schemas',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx, input) => {
		return { translated: input.text, tokens: 10 };
	},
});
`;
			writeFileSync(join(agentDir, 'variable-both.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('translated');
			expect(agents[0].outputSchemaCode).toContain('tokens');
		});

		test('should resolve schema object variable reference', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const AgentInput = s.object({
	text: s.string(),
});

const AgentOutput = s.object({
	result: s.string(),
});

const schema = {
	input: AgentInput,
	output: AgentOutput,
};

export default createAgent('schema-object-agent', {
	description: 'Agent with schema object variable',
	schema,
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'schema-object.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('s.object');
		});

		test('should resolve variable in non-default-export agent declaration', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const AgentInput = s.object({
	text: s.string(),
});

const agent = createAgent('const-variable-agent', {
	description: 'Agent with const declaration',
	schema: {
		input: AgentInput,
	},
	handler: async (ctx, input) => {
		return input.text;
	},
});

export default agent;
`;
			writeFileSync(join(agentDir, 'const-variable.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
		});

		test('should preserve nested schema references in resolved schema', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Shared = s.object({
	lang: s.string(),
});

const AgentInput = s.object({
	text: s.string(),
	meta: Shared,
});

export default createAgent('nested-ref-agent', {
	description: 'Agent with nested schema reference',
	schema: {
		input: AgentInput,
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'nested-ref.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			// Should resolve AgentInput but preserve Shared as identifier
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].inputSchemaCode).toContain('meta');
			expect(agents[0].inputSchemaCode).toContain('Shared');
		});

		test('should handle imported schema identifiers gracefully', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { AgentInput } from './schemas';

export default createAgent('imported-schema-agent', {
	description: 'Agent with imported schema',
	schema: {
		input: AgentInput,
	},
	handler: async (ctx, input) => {
		return { result: 'ok' };
	},
});
`;
			writeFileSync(join(agentDir, 'imported-schema.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			// Cannot resolve imports, should fallback to identifier name
			expect(agents[0].inputSchemaCode).toBeDefined();
			expect(agents[0].inputSchemaCode).toBe('AgentInput');
		});

		test('should handle mixed inline and variable schemas', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const AgentInput = s.object({
	text: s.string(),
});

export default createAgent('mixed-schema-agent', {
	description: 'Agent with mixed inline and variable schemas',
	schema: {
		input: AgentInput,
		output: s.object({
			result: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'mixed-schema.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('result');
		});

		test('should handle literal string keys for schema properties', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const AgentInput = s.object({
	text: s.string(),
});

export default createAgent('literal-keys-agent', {
	description: 'Agent with literal string keys',
	'schema': {
		'input': AgentInput,
		'output': s.object({
			result: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'literal-keys.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('s.object');
		});

		test('should handle spread in schema object without crashing', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const baseSchema = {
	input: s.object({ text: s.string() }),
};

export default createAgent('spread-schema-agent', {
	description: 'Agent with spread in schema',
	schema: {
		...baseSchema,
		output: s.object({ result: s.string() }),
	},
	handler: async (ctx, input) => {
		return { result: 'ok' };
	},
});
`;
			writeFileSync(join(agentDir, 'spread-schema.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			// Should not crash; output should be extracted, input may not be
			expect(agents).toHaveLength(1);
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('result');
		});

		test('should handle long alias chains', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Input1 = Input2;
const Input2 = Input3;
const Input3 = Input4;
const Input4 = Input5;
const Input5 = s.object({
	text: s.string(),
});

export default createAgent('alias-chain-agent', {
	description: 'Agent with long alias chain',
	schema: {
		input: Input1,
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'alias-chain.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			// With depth limit of 8, this 5-deep chain should be fully resolved
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
		});

		test('should not extract schema when config is a variable (unsupported pattern)', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agentConfig = {
	description: 'Agent with config variable',
	schema: {
		input: s.object({ text: s.string() }),
		output: s.object({ result: s.string() }),
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
};

export default createAgent('config-var-agent', agentConfig);
`;
			writeFileSync(join(agentDir, 'config-var.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			// Config as variable is not supported - agent is not discovered
			// because the AST analysis expects the second argument to be an ObjectExpression
			expect(agents).toHaveLength(0);
		});

		test('should resolve schema from member access (baseSchemas.shared)', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const baseSchemas = {
	shared: s.object({
		text: s.string(),
		lang: s.string().optional(),
	}),
	output: s.object({
		result: s.string(),
	}),
};

export default createAgent('member-access-agent', {
	description: 'Agent with member access schema',
	schema: {
		input: baseSchemas.shared,
		output: baseSchemas.output,
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'member-access.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].inputSchemaCode).toContain('lang');
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('result');
		});

		test('should resolve nested member access (configs.agent1.schema)', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const configs = {
	agent1: {
		inputSchema: s.object({
			query: s.string(),
		}),
		outputSchema: s.object({
			answer: s.string(),
		}),
	},
};

export default createAgent('nested-member-agent', {
	description: 'Agent with nested member access',
	schema: {
		input: configs.agent1.inputSchema,
		output: configs.agent1.outputSchema,
	},
	handler: async (ctx, input) => {
		return { answer: input.query };
	},
});
`;
			writeFileSync(join(agentDir, 'nested-member.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('query');
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('answer');
		});

		test('should handle member access combined with variable reference', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const InputSchema = s.object({
	text: s.string(),
});

const outputs = {
	standard: s.object({
		result: s.string(),
	}),
};

export default createAgent('mixed-member-var-agent', {
	description: 'Agent with mixed member access and variable',
	schema: {
		input: InputSchema,
		output: outputs.standard,
	},
	handler: async (ctx, input) => {
		return { result: input.text };
	},
});
`;
			writeFileSync(join(agentDir, 'mixed-member-var.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			expect(agents[0].inputSchemaCode).toContain('s.object');
			expect(agents[0].inputSchemaCode).toContain('text');
			expect(agents[0].outputSchemaCode).toContain('s.object');
			expect(agents[0].outputSchemaCode).toContain('result');
		});

		test('should not resolve computed member access (dynamic property)', async () => {
			const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const schemaName = 'input';
const schemas = {
	input: s.object({ text: s.string() }),
};

export default createAgent('computed-member-agent', {
	description: 'Agent with computed member access',
	schema: {
		input: schemas[schemaName],
	},
	handler: async (ctx, input) => {
		return { result: 'ok' };
	},
});
`;
			writeFileSync(join(agentDir, 'computed-member.ts'), agentCode);

			const agents = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);

			expect(agents).toHaveLength(1);
			// Computed access is not resolved - falls back to expression string
			expect(agents[0].inputSchemaCode).toBe('schemas[schemaName]');
		});
	});
});
