/**
 * Hello Agent
 *
 * Demonstrates ctx.auth for authenticated agents and agent-to-agent handoff.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import poemAgent from '../poem/agent';

const agent = createAgent('hello', {
	description: 'Greets the user and optionally creates a poem about them',
	schema: {
		input: s.object({
			name: s.string(),
			wantPoem: s.optional(s.boolean()),
		}),
		output: s.string(),
	},
	handler: async (ctx, { name, wantPoem }) => {
		ctx.logger.info('Hello agent processing request', { name, wantPoem });

		// Get user from ctx.auth (native on AgentContext)
		const user = ctx.auth ? await ctx.auth.getUser() : null;
		const email = user?.email ?? null;
		const org = ctx.auth ? await ctx.auth.getOrg() : null;

		// Build the greeting
		let greeting = `Hello, ${name}!`;

		if (email) {
			greeting += ` Your email is ${email}.`;
		} else {
			greeting += ` (No auth session available)`;
		}

		if (org) {
			greeting += ` You're a ${org.role} in ${org.name}.`;
		}

		greeting += ` Welcome to Agentuity 🤖.`;

		// If the user wants a poem, hand off to the poem agent
		if (wantPoem && email) {
			ctx.logger.info('Handing off to poem agent');

			// Call poem agent - auth propagates automatically via AgentContext
			const poem = await poemAgent.run({
				userEmail: email,
				userName: name,
			});

			greeting += `\n\n${poem}`;
		}

		return greeting;
	},
});

export default agent;
