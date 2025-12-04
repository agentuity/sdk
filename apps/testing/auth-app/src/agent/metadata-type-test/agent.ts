import { createAgent } from '@agentuity/runtime';

// This agent demonstrates TypeScript type checking for createAgent metadata.
// It verifies that internal metadata fields (id, filename, version) cannot be passed.

const agent = createAgent({
	metadata: {
		name: 'Metadata Type Test Agent',
		description: 'Agent for testing TypeScript type safety of createAgent metadata',
	},
	handler: async (c) => {
		c.logger.info('Metadata type test agent executed');
	},
});

// Type tests: These should all produce TypeScript errors
// Using @ts-expect-error to verify that TypeScript correctly rejects internal metadata fields
// Each test is separate because TypeScript only reports the first error in an object literal

const _invalidAgent1 = createAgent({
	metadata: {
		name: 'Test',
		// @ts-expect-error - Testing that 'id' field is rejected
		id: 'should-not-be-allowed' as any,
	},
	handler: async (_c) => {},
});

const _invalidAgent2 = createAgent({
	metadata: {
		name: 'Test',
		// @ts-expect-error - Testing that 'filename' field is rejected
		filename: 'should-not-be-allowed' as any,
	},
	handler: async (_c) => {},
});

const _invalidAgent3 = createAgent({
	metadata: {
		name: 'Test',
		// @ts-expect-error - Testing that 'version' field is rejected
		version: 'should-not-be-allowed' as any,
	},
	handler: async (_c) => {},
});

const _invalidAgent4 = createAgent({
	metadata: {
		name: 'Test',
		// @ts-expect-error - Testing that 'identifier' field is rejected
		identifier: 'should-not-be-allowed' as any,
	},
	handler: async (_c) => {},
});

// Valid usage - only external metadata fields are allowed
const _validAgent = createAgent({
	metadata: {
		name: 'Valid Agent',
		description: 'This is valid',
	},
	handler: async (_c) => {},
});

export default agent;
