/**
 * Chat Agent
 *
 * Multi-turn conversation with a conversation-scoped state store. The current
 * docs demo implements that state on top of the compatibility thread store so
 * the Explorer can persist history across requests without introducing a real
 * database dependency.
 *
 * How the demo state works:
 * - Tied to a browser session via cookies in the docs app
 * - Persists for 1 hour of inactivity, then resets
 * - Perfect for conversation history, user preferences, multi-step workflows
 *
 * This agent uses push() with maxRecords for automatic sliding window behavior,
 * keeping only the last MAX_MESSAGES to prevent unbounded growth.
 *
 * Docs: https://agentuity.dev/cookbook/patterns/chat-with-history
 */

import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
import { generateText } from 'ai';
import { createGoogleProvider } from '../../lib/ai-gateway';
import agentuityDocs from './agentuity-context.txt';

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

// Sliding window: keep last 50 messages (25 turns) to bound memory usage
const MAX_MESSAGES = 50;

const agent = defineDemoAgent('chat', {
	description: 'Agentuity expert chat with thread-based memory',
	schema: {
		input: s.object({
			message: s.string(),
			command: s.optional(s.enum(['chat', 'history', 'reset', 'info'])),
		}),
		output: s.object({
			response: s.string(),
			conversationId: s.string(),
			turnCount: s.number(),
		}),
	},
	handler: async (ctx, input) => {
		const { message, command = 'chat' } = input;

		// Initialize turnCount on first request (messages array created automatically by push)
		if (!(await ctx.thread.state.has('turnCount'))) {
			await ctx.thread.state.set('turnCount', 0);
			await ctx.thread.state.set('startedAt', new Date().toISOString());
		}

		// Get current state
		const messages = ((await ctx.thread.state.get('messages')) as Message[]) ?? [];
		const turnCount = (await ctx.thread.state.get('turnCount')) as number;

		ctx.logger.info('Chat request', {
			sessionId: ctx.sessionId,
			conversationId: ctx.thread.id,
			turnCount,
			command,
		});

		switch (command) {
			case 'history':
				return {
					response:
						messages.length === 0
							? 'No conversation history yet.'
							: messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
					conversationId: ctx.thread.id,
					turnCount,
				};

			case 'reset':
				await ctx.thread.state.set('messages', []);
				await ctx.thread.state.set('turnCount', 0);
				await ctx.thread.state.set('startedAt', new Date().toISOString());
				return {
					response: 'Conversation reset.',
					conversationId: ctx.thread.id,
					turnCount: 0,
				};

			case 'info':
				return {
					response: `Conversation: ${ctx.thread.id}\nSession: ${ctx.sessionId}\nTurns: ${turnCount}\nMessages: ${messages.length}`,
					conversationId: ctx.thread.id,
					turnCount,
				};

			default: {
				// Generate response with Agentuity-focused context
				const { text } = await generateText({
					model: createGoogleProvider()('gemini-3-flash-preview'),
					system: `You are an Agentuity expert assistant. Your primary purpose is to help users understand and use the Agentuity platform.

## Guidelines
- Focus on Agentuity, its SDK, APIs, features, and platform capabilities
- You CAN answer questions about the current conversation (e.g., "What was my last message?", "What have we discussed?") - this demonstrates conversation memory
- For completely off-topic questions unrelated to Agentuity or the conversation, gently redirect: "I specialize in Agentuity questions. What would you like to know about the SDK, storage, AI gateway, or other features?"
- Keep responses focused and concise
- Reference the documentation when relevant
- Use code examples sparingly and keep them brief

## Agentuity Documentation
${agentuityDocs || 'Documentation currently unavailable. Answer based on general knowledge of Agentuity.'}`,
					messages: [...messages, { role: 'user' as const, content: message }],
				});

				// Use push() with maxRecords for automatic sliding window
				await ctx.thread.state.push(
					'messages',
					{ role: 'user', content: message },
					MAX_MESSAGES
				);
				await ctx.thread.state.push(
					'messages',
					{ role: 'assistant', content: text },
					MAX_MESSAGES
				);
				await ctx.thread.state.set('turnCount', turnCount + 1);

				return {
					response: text,
					conversationId: ctx.thread.id,
					turnCount: turnCount + 1,
				};
			}
		}
	},
});

export default agent;
