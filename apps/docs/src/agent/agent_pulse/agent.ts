import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { buildContext, buildSystemPrompt } from './context-builder';
import { createTools } from './tools';
import { createStreamingProcessor } from './streaming-processor';
import type { ConversationMessage, Action } from './types';

const agent = createAgent('AgentPulse', {
	description: 'Multi-turn tutorial and documentation assistant using LLM with tools for tutorial navigation and documentation search',
	schema: {
		input: s.object({
			message: s.string().describe('The user message or query'),
			conversationHistory: s.optional(
				s.array(
					s.object({
						author: s.union(s.literal('USER'), s.literal('ASSISTANT')),
						content: s.string(),
					})
				)
			).describe('Previous conversation messages for context'),
			tutorialData: s.optional(
				s.object({
					tutorialId: s.string(),
					currentStep: s.number(),
				})
			).describe('Current tutorial state if user is in a tutorial'),
		}),
		output: s.any(),
	},
	handler: async (ctx, input) => {
		const { message, conversationHistory = [], tutorialData } = input;

		// Create state for managing actions
		const state: { action: Action | null } = { action: null };

		// Build messages for the conversation
		const messages: ConversationMessage[] = [
			...conversationHistory,
			{ author: 'USER', content: message },
		];

		// Create tools with state context
		const tools = await createTools(state, ctx);

		// Build tutorial context and system prompt
		const tutorialContext = await buildContext(ctx, tutorialData);
		const systemPrompt = await buildSystemPrompt(tutorialContext, ctx);

		// Generate streaming response using AI SDK
		// Returns StreamTextResult<any> which contains fullStream for processing
		const result = streamText({
			model: openai('gpt-4.1'),
			messages: messages.map((msg) => ({
				role: msg.author === 'USER' ? 'user' : 'assistant',
				content: msg.content,
			})),
			tools,
			system: systemPrompt,
			stopWhen: stepCountIs(5), // Replaces deprecated maxSteps
		});

		// Create and return streaming response (ReadableStream)
		// createStreamingProcessor expects StreamTextResult<any> and returns ReadableStream
		return createStreamingProcessor(result, state, ctx.logger);
	},
});

export default agent;
