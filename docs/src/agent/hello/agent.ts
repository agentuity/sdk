/**
 * Hello Agent
 *
 * The simplest possible agent - receives input, returns output. This demonstrates
 * the minimal structure every agent follows: define a schema for input/output,
 * then write a handler function. The schema provides TypeScript types automatically.
 *
 * Key concepts:
 * - defineDemoAgent() registers the agent with auto-discovery
 * - schema.input/output define the contract (uses @agentuity/schema, Zod, etc.)
 * - handler receives typed input and returns typed output
 *
 * Docs: https://agentuity.dev/agents/creating-agents
 */
import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
const agent = defineDemoAgent('hello', {
	// Description shown in Workbench and agent registry
	description: 'Simple greeting agent',

	// Schema defines input/output types - TypeScript infers handler types from this
	schema: {
		input: s.object({ name: s.string() }),
		output: s.string(),
	},

	// Handler receives typed input based on schema
	// _ctx is unused here but provides logging, storage, thread state, etc.
	handler: async (_ctx, { name }) => {
		return `Hello, ${name}! 🤖 Welcome to Agentuity.`;
	},
});

export default agent;
