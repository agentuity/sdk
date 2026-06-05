import { defineDemoAgent } from '../demo-agent';
import { s } from '@agentuity/schema';
import { AIGatewayClient } from '@agentuity/aigateway';

const CLEAN_MODEL = 'openai/gpt-5.4-mini';

/**
 * Text processor Explorer demo
 *
 * Cleans or analyzes text using AI. Used by the Agent Calls demo to show how a
 * route can compose focused model-backed functions.
 */
const agent = defineDemoAgent('text-processor', {
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
			const gateway = new AIGatewayClient();
			const { text } = await gateway.completeText({
				model: CLEAN_MODEL,
				messages: [
					{
						role: 'user',
						content: `Clean this text by removing unnecessary symbols, hashtags, excessive punctuation, and fixing spacing. Keep the meaning intact. Return ONLY the cleaned text, nothing else:\n\n${input.text}`,
					},
				],
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
