import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';

/**
 * Text Processor Agent
 *
 * An agent that cleans or analyzes text using AI. Used by the Agent Calls demo
 * to demonstrate agent-to-agent communication patterns.
 */
const agent = createAgent('text-processor', {
	description: 'Cleans or analyzes text using AI',
	schema: {
		input: s.object({
			text: s.string(),
			operation: s.enum(['clean', 'analyze']),
		}),
		output: s.object({
			original: s.string(),
			operation: s.string(),
			result: s.string(),
			processedAt: s.string(),
		}),
	},
	handler: async (ctx, input) => {
		ctx.logger.info('Text processor running', {
			operation: input.operation,
			textLength: input.text.length,
		});

		let result: string;

		if (input.operation === 'clean') {
			// Use Groq LLM to intelligently clean the text
			const { text } = await generateText({
				model: groq('llama-3.1-8b-instant'),
				prompt: `Clean this text by removing unnecessary symbols, hashtags, excessive punctuation, and fixing spacing. Keep the meaning intact. Return ONLY the cleaned text, nothing else:\n\n${input.text}`,
			});
			result = text.trim();
			ctx.logger.info('Text cleaned with LLM', { resultLength: result.length });
		} else {
			// Analyze: word count, character count, sentence count
			const words = input.text.split(/\s+/).filter(Boolean).length;
			const chars = input.text.length;
			const sentences = input.text.split(/[.!?]+/).filter(Boolean).length;
			result = `${words} words, ${chars} characters, ${sentences} sentences`;
		}

		return {
			original: input.text,
			operation: input.operation,
			result,
			processedAt: new Date().toISOString(),
		};
	},
});

export default agent;
