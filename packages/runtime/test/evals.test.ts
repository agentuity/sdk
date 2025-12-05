/**
 * Unit tests for agent eval system.
 * Tests eval creation, execution, and result tracking.
 */

import { test, expect, describe } from 'bun:test';
import { createAgent, runInAgentContext } from '../src/agent';
import { z } from 'zod';
import { TestAgentContext } from './helpers/test-context';

describe('Eval Creation', () => {
	test('createEval with input and output schema', () => {
		const agent = createAgent('eval-agent', {
			schema: {
				input: z.object({ x: z.number() }),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.x * 2,
		});

		const evalFn = agent.createEval('doubles input', {
			description: 'Checks if output is double of input',
			handler: async (_ctx, input, output) => ({
				success: true,
				passed: output === input.x * 2,
				metadata: { reason: 'checked if output is double of input' },
			}),
		});

		expect(evalFn).toBeDefined();
		expect(evalFn.metadata.name).toBe('doubles input');
	});

	test('createEval with no schema', () => {
		const agent = createAgent('no-schema-agent', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'result',
		});

		const evalFn = agent.createEval('test eval', {
			description: 'Basic test evaluation',
			handler: async (_ctx) => ({
				success: true,
				passed: true,
				metadata: { reason: 'test passed' },
			}),
		});

		expect(evalFn).toBeDefined();
		expect(evalFn.metadata.name).toBe('test eval');
	});

	test('createEval returns score', () => {
		const agent = createAgent('score-agent', {
			schema: {
				input: z.object({ text: z.string() }),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.text.length,
		});

		const evalFn = agent.createEval('length scorer', {
			description: 'Scores based on output length',
			handler: async (_ctx, input, output) => ({
				success: true,
				score: output / 10,
				metadata: { reason: 'scored based on length', inputLength: input.text.length },
			}),
		});

		expect(evalFn).toBeDefined();
		expect(evalFn.metadata.name).toBe('length scorer');
	});
});

describe('Eval Execution', () => {
	test('eval runs after agent completes', async () => {
		let evalRan = false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let evalInput: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let evalOutput: any;

		const agent = createAgent('eval-test', {
			schema: {
				input: z.object({ value: z.number() }),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.value * 2,
		});

		agent.createEval('check doubling', {
			description: 'Verifies output is double the input',
			handler: async (_ctx, input, output) => {
				evalRan = true;
				evalInput = input;
				evalOutput = output;
				return {
					success: true,
					passed: output === input.value * 2,
					metadata: { reason: 'checked doubling' },
				};
			},
		});

		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, { value: 5 });

		expect(result).toBe(10);

		// Wait for background tasks (evals run in waitUntil)
		await ctx.waitForBackgroundTasks();

		expect(evalRan).toBe(true);
		expect(evalInput).toEqual({ value: 5 });
		expect(evalOutput).toBe(10);
	});

	test('eval can return boolean (pass/fail)', async () => {
		let evalResult: boolean | undefined;

		const agent = createAgent('pass-fail-agent', {
			schema: {
				input: z.object({ x: z.number() }),
				output: z.boolean(),
			},
			handler: async (_ctx, input) => input.x > 0,
		});

		agent.createEval('check positive', {
			description: 'Checks if result is positive',
			handler: async (_ctx, _input, output) => {
				evalResult = output;
				return {
					success: true,
					passed: output === true,
					metadata: { reason: 'checked positive' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent, { x: 5 });
		await ctx.waitForBackgroundTasks();

		expect(evalResult).toBe(true);
	});

	test('eval can return score object', async () => {
		let evalScore: number | undefined;

		const agent = createAgent('score-agent', {
			schema: {
				input: z.object({ text: z.string() }),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.text.length,
		});

		agent.createEval('quality score', {
			description: 'Calculates quality score from output length',
			handler: async (_ctx, _input, output) => {
				evalScore = output / 10;
				return {
					success: true,
					score: evalScore,
					metadata: { reason: 'quality score', length: output },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent, { text: 'hello world' });
		await ctx.waitForBackgroundTasks();

		expect(evalScore).toBe(1.1); // 11 chars / 10
	});
});

describe('Multiple Evals', () => {
	test('multiple evals run in order', async () => {
		const executionOrder: number[] = [];

		const agent = createAgent('multi-eval', {
			schema: {
				input: z.number(),
				output: z.number(),
			},
			handler: async (_ctx, input) => input * 2,
		});

		agent.createEval('eval 1', {
			description: 'First evaluation',
			handler: async (_ctx, _input, _output) => {
				executionOrder.push(1);
				return {
					success: true,
					passed: true,
					metadata: { reason: 'eval 1' },
				};
			},
		});

		agent.createEval('eval 2', {
			description: 'Second evaluation',
			handler: async (_ctx, _input, _output) => {
				executionOrder.push(2);
				return {
					success: true,
					passed: true,
					metadata: { reason: 'eval 2' },
				};
			},
		});

		agent.createEval('eval 3', {
			description: 'Third evaluation',
			handler: async (_ctx, _input, _output) => {
				executionOrder.push(3);
				return {
					success: true,
					passed: true,
					metadata: { reason: 'eval 3' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent, 5);
		await ctx.waitForBackgroundTasks();

		expect(executionOrder).toEqual([1, 2, 3]);
	});

	test('eval failure does not stop other evals', async () => {
		const results: string[] = [];

		const agent = createAgent('error-eval', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'result',
		});

		agent.createEval('eval 1', {
			description: 'First evaluation',
			handler: async (_ctx) => {
				results.push('eval1');
				return {
					success: true,
					passed: true,
					metadata: { reason: 'eval 1 passed' },
				};
			},
		});

		agent.createEval('eval 2 - fails', {
			description: 'Second evaluation that fails',
			handler: async (_ctx) => {
				results.push('eval2');
				throw new Error('Eval error');
			},
		});

		agent.createEval('eval 3', {
			description: 'Third evaluation',
			handler: async (_ctx) => {
				results.push('eval3');
				return {
					success: true,
					passed: true,
					metadata: { reason: 'eval 3 passed' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		// All evals should run even if one fails
		expect(results).toContain('eval1');
		expect(results).toContain('eval2');
		expect(results).toContain('eval3');
	});
});

describe('Eval Metadata', () => {
	test('eval has metadata with name', () => {
		const agent = createAgent('meta-agent', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'result',
		});

		const evalFn = agent.createEval('my eval', {
			description: 'Test evaluation',
			handler: async (_ctx) => ({
				success: true,
				passed: true,
				metadata: { reason: 'test' },
			}),
		});

		expect(evalFn.metadata).toBeDefined();
		expect(evalFn.metadata.name).toBe('my eval');
	});

	test('eval metadata includes identifier', () => {
		const agent = createAgent('id-agent', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'result',
		});

		const evalFn = agent.createEval('test-eval', {
			description: 'Identifier test',
			handler: async (_ctx) => ({
				success: true,
				passed: true,
				metadata: { reason: 'test' },
			}),
		});

		expect(evalFn.metadata.identifier).toBeDefined();
	});
});

describe('Eval with No Input/Output', () => {
	test('eval works with no input schema', async () => {
		let evalRan = false;

		const agent = createAgent('no-input-eval', {
			schema: {
				output: z.string(),
			},
			handler: async (_ctx) => 'result',
		});

		agent.createEval('output check', {
			description: 'Validates output value',
			handler: async (_ctx, output) => {
				evalRan = true;
				return {
					success: true,
					passed: output === 'result',
					metadata: { reason: 'output check' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		expect(evalRan).toBe(true);
	});

	test('eval works with no output schema', async () => {
		let evalRan = false;

		const agent = createAgent('no-output-eval', {
			schema: {
				input: z.string(),
			},
			handler: async (_ctx, _input) => {
				// No return value
			},
		});

		agent.createEval('input check', {
			description: 'Validates input value',
			handler: async (_ctx, input) => {
				evalRan = true;
				return {
					success: true,
					passed: input === 'test',
					metadata: { reason: 'input check' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent, 'test');
		await ctx.waitForBackgroundTasks();

		expect(evalRan).toBe(true);
	});
});

describe('Eval Result Types', () => {
	test('eval returns boolean true', async () => {
		let passed: boolean | undefined;

		const agent = createAgent('bool-eval', {
			schema: {
				output: z.number(),
			},
			handler: async (_ctx) => 42,
		});

		agent.createEval('pass test', {
			description: 'Test that passes',
			handler: async (_ctx, output) => {
				passed = output === 42;
				return {
					success: true,
					passed,
					metadata: { reason: 'checked value' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		expect(passed).toBe(true);
	});

	test('eval returns boolean false', async () => {
		let passed: boolean | undefined;

		const agent = createAgent('bool-fail-eval', {
			schema: {
				output: z.number(),
			},
			handler: async (_ctx) => 41,
		});

		agent.createEval('fail test', {
			description: 'Test that fails',
			handler: async (_ctx, output) => {
				passed = output === 42;
				return {
					success: true,
					passed,
					metadata: { reason: 'checked value' },
				};
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent);
		await ctx.waitForBackgroundTasks();

		expect(passed).toBe(false);
	});

	test('eval returns score with metadata', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let scoreResult: any;

		const agent = createAgent('score-eval', {
			schema: {
				input: z.object({ text: z.string() }),
				output: z.number(),
			},
			handler: async (_ctx, input) => input.text.length,
		});

		agent.createEval('quality scorer', {
			description: 'Scores output quality',
			handler: async (_ctx, input, output) => {
				scoreResult = {
					score: output / 100,
					metadata: { wordCount: input.text.split(' ').length },
				};
				return scoreResult;
			},
		});

		const ctx = new TestAgentContext();
		await runInAgentContext(ctx, agent, { text: 'hello beautiful world' });
		await ctx.waitForBackgroundTasks();

		expect(scoreResult.score).toBe(0.21); // 21 chars / 100
		expect(scoreResult.metadata.wordCount).toBe(3);
	});
});
