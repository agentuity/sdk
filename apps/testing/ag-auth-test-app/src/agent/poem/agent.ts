/**
 * Poem Agent
 *
 * Creates a poem about the authenticated user using AI.
 * Demonstrates agent-to-agent auth propagation via withSession.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { withSession } from '@agentuity/auth/agentuity';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = createAgent('poem', {
	description: 'Creates a personalized poem about a user',
	schema: {
		input: s.object({
			userEmail: s.string(),
			userName: s.string(),
		}),
		output: s.string(),
	},
	handler: withSession(
		async (ctx, { auth, org }, { userEmail, userName }) => {
			ctx.logger.info('Poem agent received request', { userEmail, userName });

			// Verify we have the same auth context as the calling agent
			const sessionEmail = auth?.user ? (auth.user as { email?: string }).email : null;
			ctx.logger.info('Session email in poem agent', { sessionEmail });

			// Verify auth propagation
			const authPropagated = sessionEmail === userEmail;
			ctx.logger.info('Auth propagation check', { authPropagated, sessionEmail, userEmail });

			// Include org context if available
			const orgInfo = org?.name ? ` (member of ${org.name})` : '';

			try {
				const { text } = await generateText({
					model: openai('gpt-4o-mini'),
					prompt: `Write a short, fun 4-line poem about a person named ${userName}${orgInfo}. Keep it light and friendly.`,
				});

				return `🎭 Poem for ${userName}${orgInfo}:\n\n${text}\n\n✅ Auth propagated: ${authPropagated}`;
			} catch (err) {
				ctx.logger.error('Poem AI generation failed', {
					error: err instanceof Error ? err.message : String(err),
				});
				throw err;
			}
		},
		{ optional: true }
	),
});

export default agent;
