/**
 * Hello Agent
 *
 * Demonstrates withSession for authenticated agents and agent-to-agent handoff.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { withSession } from '@agentuity/auth/agentuity';
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
	handler: withSession(
		async (ctx, { auth, org }, { name, wantPoem }) => {
			ctx.logger.info('Hello agent processing request', { name, wantPoem });

			// Get user email from session
			const email = auth?.user ? (auth.user as { email?: string }).email : null;

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

				// Call poem agent - auth should propagate via AgentContext.state
				const poem = await poemAgent.run({
					userEmail: email,
					userName: name,
				});

				greeting += `\n\n${poem}`;
			}

			return greeting;
		},
		{ optional: true }
	),
});

export default agent;
