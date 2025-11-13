import type { EvalContext } from '@agentuity/runtime';
import agent from './agent';

// This eval demonstrates TypeScript type checking for agent.createEval() metadata.
// It verifies that internal metadata fields (id, filename, version) cannot be passed.

// Valid usage - only external metadata fields are allowed
export const validEval = agent.createEval({
	metadata: {
		name: 'Valid Eval',
		description: 'This is a valid eval with only external metadata fields',
	},
	handler: async (_ctx: EvalContext) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Valid eval test',
			},
		};
	},
});

// Type tests: These should all produce TypeScript errors
// Using @ts-expect-error to verify that TypeScript correctly rejects internal metadata fields
// Each test is separate because TypeScript only reports the first error in an object literal

const _invalidEval1 = agent.createEval({
	metadata: {
		name: 'Test ID',
		// @ts-expect-error - 'id' is an internal metadata field and should not be allowed
		id: 'should-not-be-allowed',
	},
	handler: async (_ctx: EvalContext) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Valid eval test',
			},
		};
	},
});

const _invalidEval2 = agent.createEval({
	metadata: {
		name: 'Test Filename',
		// @ts-expect-error - 'filename' is an internal metadata field and should not be allowed
		filename: 'should-not-be-allowed',
	},
	handler: async (_ctx: EvalContext) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Valid eval test',
			},
		};
	},
});

const _invalidEval3 = agent.createEval({
	metadata: {
		name: 'Test Version',
		// @ts-expect-error - 'version' is an internal metadata field and should not be allowed
		version: 'should-not-be-allowed',
	},
	handler: async (_ctx: EvalContext) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Valid eval test',
			},
		};
	},
});

const _invalidEval4 = agent.createEval({
	metadata: {
		name: 'Test Identifier',
		// @ts-expect-error - 'identifier' is an internal metadata field and should not be allowed
		identifier: 'should-not-be-allowed',
	},
	handler: async (_ctx: EvalContext) => {
		return {
			success: true as const,
			passed: true,
			metadata: {
				reason: 'Valid eval test',
			},
		};
	},
});
