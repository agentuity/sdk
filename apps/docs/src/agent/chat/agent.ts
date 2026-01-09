/**
 * Chat Agent
 *
 * Multi-turn conversation with thread-based memory. The key concept here is
 * ctx.thread.state - it persists across requests for the same browser session,
 * so you can build chat interfaces where the AI remembers previous messages.
 *
 * How thread state works:
 * - Tied to a browser session via cookies (no database setup needed)
 * - Persists for 1 hour of inactivity, then resets
 * - Perfect for conversation history, user preferences, multi-step workflows
 *
 * This agent uses push() with maxRecords for automatic sliding window behavior,
 * keeping only the last MAX_MESSAGES to prevent unbounded growth.
 *
 * Docs: https://preview.agentuity.dev/v1/Learn/Cookbook/Patterns/chat-with-history
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import agentuityDocs from './agentuity-context.txt';

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

// Sliding window: keep last 50 messages (25 turns) to bound memory usage
const MAX_MESSAGES = 50;

const agent = createAgent('chat', {
	description: 'Agentuity expert chat with thread-based memory',
	schema: {
		input: s.object({
			message: s.string(),
			command: s.optional(s.enum(['chat', 'history', 'reset', 'info'])),
		}),
		output: s.object({
			response: s.string(),
			threadId: s.string(),
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
			threadId: ctx.thread.id,
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
					threadId: ctx.thread.id,
					turnCount,
				};

			case 'reset':
				await ctx.thread.state.set('messages', []);
				await ctx.thread.state.set('turnCount', 0);
				await ctx.thread.state.set('startedAt', new Date().toISOString());
				return {
					response: 'Conversation reset.',
					threadId: ctx.thread.id,
					turnCount: 0,
				};

			case 'info':
				return {
					response: `Thread: ${ctx.thread.id}\nSession: ${ctx.sessionId}\nTurns: ${turnCount}\nMessages: ${messages.length}`,
					threadId: ctx.thread.id,
					turnCount,
				};

			default: {
				// Generate response with Agentuity-focused context
				const { text } = await generateText({
					model: google('gemini-3-flash-preview'),
					system: `You are an Agentuity expert assistant. Your primary purpose is to help users understand and use the Agentuity platform.

## Guidelines
- Focus on Agentuity, its SDK, APIs, features, and platform capabilities
- You CAN answer questions about the current conversation (e.g., "What was my last message?", "What have we discussed?") - this demonstrates thread-based memory
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
					threadId: ctx.thread.id,
					turnCount: turnCount + 1,
				};
			}
		}
	},
});

export default agent;
