/**
 * Tests for EvalMiddleware optional transforms (Issue #695).
 * Verifies that transformInput and transformOutput can be provided independently.
 */

import { describe, test, expect } from 'bun:test';
import type { s, InferObjectShape } from '@agentuity/schema';
import { adversarial } from '../src/adversarial';

type AgentInput = InferObjectShape<{
	text: ReturnType<typeof s.string>;
	toLanguage: ReturnType<typeof s.string>;
}>;

type AgentOutput = InferObjectShape<{
	translation: ReturnType<typeof s.string>;
}>;

describe('EvalMiddleware optional transforms', () => {
	test('accepts only transformInput', () => {
		const evalConfig = adversarial<AgentInput, AgentOutput>({
			middleware: {
				transformInput: (input) => ({
					request: `Translate to ${input.toLanguage ?? 'Spanish'}:\n\n${input.text}`,
				}),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('accepts only transformOutput', () => {
		const evalConfig = adversarial<AgentInput, AgentOutput>({
			middleware: {
				transformOutput: (output) => ({
					response: output.translation,
				}),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('accepts both transforms', () => {
		const evalConfig = adversarial<AgentInput, AgentOutput>({
			middleware: {
				transformInput: (input) => ({
					request: `Translate to ${input.toLanguage ?? 'Spanish'}:\n\n${input.text}`,
				}),
				transformOutput: (output) => ({
					response: output.translation,
				}),
			},
		});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('accepts no middleware at all', () => {
		const evalConfig = adversarial({});

		expect(evalConfig).toBeDefined();
		expect(evalConfig.name).toBe('adversarial');
	});

	test('rejects empty middleware object at compile time', () => {
		// @ts-expect-error - empty middleware should be a type error
		adversarial<AgentInput, AgentOutput>({
			middleware: {},
		});
	});
});
