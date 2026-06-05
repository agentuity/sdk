/**
 * Hello Explorer demo
 *
 * The simplest possible model-backed function: receive input, return output.
 * The local defineDemoAgent wrapper gives the SDK Explorer a schema contract
 * and run() method, but v3 app code should use plain functions or routes.
 *
 * Key concepts:
 * - schema.input/output define the demo contract
 * - handler receives typed input and returns typed output
 * - routes, queues, schedules, or scripts can call the same plain function shape
 *
 * Docs: https://agentuity.dev/build/agents
 */
import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
const agent = defineDemoAgent('hello', {
	// Description shown in the Explorer's local demo registry
	description: 'Simple greeting agent',

	// Schema defines input/output types for the demo runner
	schema: {
		input: s.object({ name: s.string() }),
		output: s.string(),
	},

	// _ctx is unused here but exposes the same service surface as route demos
	handler: async (_ctx, { name }) => {
		return `Hello, ${name}! 🤖 Welcome to Agentuity.`;
	},
});

export default agent;
