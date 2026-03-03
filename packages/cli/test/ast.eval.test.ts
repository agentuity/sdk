import { describe, test, expect } from 'bun:test';
import { parseEvalMetadata } from '../src/cmd/build/ast';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/agentuity-cli-test-evals';

describe('parseEvalMetadata - createEval Parsing', () => {
	const setup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	};

	const cleanup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	};

	test('should parse createEval with name and description', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('test-agent', {
	schema: {
		input: z.object({ x: z.number() }),
		output: z.number(),
	},
	handler: async (ctx, input) => input.x * 2,
});

export const evalDouble = agent.createEval('doubles-correctly', {
	description: 'Verifies output is exactly double the input',
	handler: async (ctx, input, output) => {
		return output === input.x * 2;
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, evals] = await parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1');

		expect(evals).toHaveLength(1);
		expect(evals[0].name).toBe('doubles-correctly');
		expect(evals[0].description).toBe('Verifies output is exactly double the input');
		expect(evals[0].id).toBeDefined();
		expect(evals[0].evalId).toBeDefined();

		cleanup();
	});

	test('should parse createEval with only name (no description)', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('test-agent', {
	schema: {
		output: z.string(),
	},
	handler: async (ctx) => 'result',
});

export const evalBasic = agent.createEval('basic-eval', {
	handler: async (ctx, output) => {
		return output === 'result';
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, evals] = await parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1');

		expect(evals).toHaveLength(1);
		expect(evals[0].name).toBe('basic-eval');
		expect(evals[0].description).toBeUndefined();

		cleanup();
	});

	test('should parse multiple createEval calls', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent('test-agent', {
	schema: {
		input: z.object({ x: z.number() }),
		output: z.number(),
	},
	handler: async (ctx, input) => input.x * 2,
});

export const eval1 = agent.createEval('doubles-input', {
	description: 'Checks if output is double',
	handler: async (ctx, input, output) => output === input.x * 2,
});

export const eval2 = agent.createEval('positive-output', {
	description: 'Ensures output is positive',
	handler: async (ctx, input, output) => output > 0,
});

export const eval3 = agent.createEval('even-output', {
	handler: async (ctx, input, output) => output % 2 === 0,
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, evals] = await parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1');

		expect(evals).toHaveLength(3);
		expect(evals[0].name).toBe('doubles-input');
		expect(evals[0].description).toBe('Checks if output is double');
		expect(evals[1].name).toBe('positive-output');
		expect(evals[1].description).toBe('Ensures output is positive');
		expect(evals[2].name).toBe('even-output');
		expect(evals[2].description).toBeUndefined();

		cleanup();
	});

	test('should throw error if createEval name is not a string literal', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';

const agent = createAgent('test-agent', {
	handler: async (ctx) => 'result',
});

const evalName = 'dynamic-name';
export const evalBad = agent.createEval(evalName, {
	handler: async (ctx) => true,
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);

		await expect(
			parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1')
		).rejects.toThrow('first argument must be a string literal');

		cleanup();
	});

	test('should detect duplicate eval names', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';

const agent = createAgent('test-agent', {
	handler: async (ctx) => 'result',
});

export const eval1 = agent.createEval('duplicate-name', {
	handler: async (ctx) => true,
});

export const eval2 = agent.createEval('duplicate-name', {
	handler: async (ctx) => false,
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);

		await expect(
			parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1')
		).rejects.toThrow('duplicate-name');

		cleanup();
	});

	test('should handle agent with no evals', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';

const agent = createAgent('test-agent', {
	handler: async (ctx) => 'result',
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, evals] = await parseEvalMetadata(TEST_DIR, agentFile, contents, 'proj_1', 'dep_1');

		expect(evals).toHaveLength(0);

		cleanup();
	});

	test('should skip eval.ts files without createEval (utility files)', async () => {
		setup();
		const evalFile = join(TEST_DIR, 'eval.ts');
		const code = `
// Utility file that doesn't contain createEval
export function helperFunction(x: number): number {
	return x * 2;
}

export const CONSTANT = 42;
		`;
		writeFileSync(evalFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [newSource, evals] = await parseEvalMetadata(
			TEST_DIR,
			evalFile,
			contents,
			'proj_1',
			'dep_1'
		);

		// Should return empty evals array for files without createEval
		expect(evals).toHaveLength(0);
		// Should return original contents unchanged
		expect(newSource).toBe(contents);

		cleanup();
	});
});
