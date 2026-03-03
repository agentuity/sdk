import { describe, test, expect } from 'bun:test';
import { createAgent } from '../src/agent';
import { s } from '@agentuity/schema';

describe('createAgent API', () => {
	test('should accept 2 arguments: name and config', () => {
		// This should compile without errors
		const agent = createAgent('hello', {
			description: 'Test agent',
			schema: {
				input: s.object({ name: s.string() }),
				output: s.string(),
			},
			handler: async (_ctx, input) => {
				return `Hello, ${input.name}!`;
			},
		});

		expect(agent).toBeDefined();
		expect(agent.metadata.name).toBe('hello');
	});

	test('handler context parameter should be typed', () => {
		const agent = createAgent('typed-context', {
			schema: {
				input: s.object({ value: s.number() }),
				output: s.number(),
			},
			handler: async (ctx, input) => {
				// ctx should be typed as AgentContext
				ctx.logger.info('test'); // This should work
				return input.value * 2;
			},
		});

		expect(agent).toBeDefined();
	});

	test('handler input parameter should be typed from schema', () => {
		const agent = createAgent('typed-input', {
			schema: {
				input: s.object({ name: s.string(), age: s.number() }),
				output: s.string(),
			},
			handler: async (_ctx, input) => {
				// input should be typed as { name: string, age: number }
				const name: string = input.name;
				const age: number = input.age;
				return `${name} is ${age} years old`;
			},
		});

		expect(agent).toBeDefined();
	});

	test('agent should have run method', () => {
		const agent = createAgent('with-run', {
			schema: {
				input: s.object({ value: s.string() }),
				output: s.string(),
			},
			handler: async (_ctx, input) => {
				return input.value.toUpperCase();
			},
		});

		expect(agent.run).toBeDefined();
		expect(typeof agent.run).toBe('function');
	});

	test('agent.run should accept typed input', async () => {
		const { runInAgentContext } = await import('../src/agent');
		const { TestAgentContext } = await import('./helpers/test-context');

		const agent = createAgent('run-with-input', {
			schema: {
				input: s.object({ name: s.string() }),
				output: s.string(),
			},
			handler: async (_ctx, input) => {
				return `Hello, ${input.name}!`;
			},
		});

		// Use TestAgentContext to provide proper agent context
		const ctx = new TestAgentContext();
		const result = await runInAgentContext(ctx, agent, { name: 'Alice' });
		expect(result).toBe('Hello, Alice!');
	});
});
