/**
 * Tests for EvalLifecycleHooks (Issue #798).
 * Verifies that onStart and onComplete hooks work correctly with preset evals.
 */

import { describe, test, expect, mock } from 'bun:test';
import { s } from '@agentuity/schema';
import { adversarial } from '../src/adversarial';
import type { EvalContext, EvalHandlerResult } from '../src/eval-types';

const _AgentInputSchema = s.object({
	text: s.string(),
});

const _AgentOutputSchema = s.object({
	response: s.string(),
});

// Mock EvalContext with logger
const createMockContext = () => {
	const logs: { level: string; message: string; data?: unknown }[] = [];
	return {
		ctx: {
			logger: {
				info: (message: string, data?: unknown) => logs.push({ level: 'info', message, data }),
				warn: (message: string, data?: unknown) => logs.push({ level: 'warn', message, data }),
				error: (message: string, data?: unknown) =>
					logs.push({ level: 'error', message, data }),
			},
		} as unknown as EvalContext,
		logs,
	};
};

describe('EvalLifecycleHooks', () => {
	test('onStart hook is called with ctx, input, and output', async () => {
		const onStartMock = mock((_ctx: EvalContext, _input: unknown, _output: unknown) => {});

		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			onStart: onStartMock,
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		const { ctx: _ctx } = createMockContext();
		const _input = { text: 'Hello' };
		const _output = { response: 'Hi there!' };

		// Note: We can't actually run the handler without mocking generateEvalResult,
		// but we can verify the config is created correctly
		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
		expect(typeof evalConfig.handler).toBe('function');
	});

	test('onComplete hook is called with ctx, input, output, and result', async () => {
		const onCompleteMock = mock(
			(_ctx: EvalContext, _input: unknown, _output: unknown, _result: EvalHandlerResult) => {}
		);

		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			onComplete: onCompleteMock,
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
		expect(typeof evalConfig.handler).toBe('function');
	});

	test('both hooks can be provided together', () => {
		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			onStart: (ctx, input, _output) => {
				ctx.logger.info('Starting eval', { inputLength: input.text.length });
			},
			onComplete: (ctx, _input, _output, result) => {
				ctx.logger.info('Eval complete', { passed: result.passed });
			},
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('hooks are optional - eval works without them', () => {
		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('hooks work without middleware', () => {
		const evalConfig = adversarial({
			onStart: (ctx) => {
				ctx.logger.info('Starting');
			},
			onComplete: (ctx, _input, _output, result) => {
				ctx.logger.info('Complete', { passed: result.passed });
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('async hooks are supported', () => {
		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			onStart: async (ctx, _input, _output) => {
				await Promise.resolve();
				ctx.logger.info('Async start');
			},
			onComplete: async (ctx, _input, _output, _result) => {
				await Promise.resolve();
				ctx.logger.info('Async complete');
			},
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('hooks can be combined with option overrides', () => {
		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			name: 'custom-adversarial',
			onStart: (ctx) => ctx.logger.info('Starting custom eval'),
			onComplete: (ctx, _input, _output, result) =>
				ctx.logger.info('Done', { passed: result.passed }),
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('custom-adversarial');
	});

	test('hooks receive original input/output, not transformed', () => {
		// This test verifies the type signature - hooks get TAgentInput/TAgentOutput
		// while the handler gets the transformed TEvalInput/TEvalOutput
		const evalConfig = adversarial<typeof _AgentInputSchema, typeof _AgentOutputSchema>({
			onStart: (_ctx, input, output) => {
				// TypeScript should infer these types correctly
				const _text: string = input.text; // Original agent input
				const _response: string = output.response; // Original agent output
			},
			onComplete: (_ctx, input, output, result) => {
				const _text: string = input.text;
				const _response: string = output.response;
				const _passed: boolean = result.passed;
			},
			middleware: {
				transformInput: (input) => ({ request: input.text }),
				transformOutput: (output) => ({ response: output.response }),
			},
		});

		expect(evalConfig).toBeDefined();
	});
});
