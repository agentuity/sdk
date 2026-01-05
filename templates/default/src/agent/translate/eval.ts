/**
 * Evals for the translation agent.
 * - conciseness (score - from 0-1): Is the translation concise without filler?
 * - language-match (binary - pass/fail): Did it translate to the requested language?
 */
import { openai } from '@ai-sdk/openai';
import { generateText, Output, jsonSchema } from 'ai';
import { s } from '@agentuity/schema';
import { conciseness } from '@agentuity/evals';
import agent, { AgentInput, AgentOutput } from './agent';

// Re-export agent so routes can import from this file
export default agent;

/**
 * Preset Eval (score): Conciseness
 * Checks if the translation is concise without unnecessary preamble or filler.
 * Uses middleware to transform agent I/O to the eval's expected format.
 */
export const concisenessEval = agent.createEval(
	conciseness<typeof AgentInput, typeof AgentOutput>({
		middleware: {
			transformInput: (input) => ({
				request: `Translate the following text to ${input.toLanguage ?? 'Spanish'}: "${input.text}"`,
			}),
			transformOutput: (output) => ({
				response: output.translation,
			}),
		},
	})
);

// Schema for language detection result using @agentuity/schema
const LanguageCheckSchema = s.object({
	isCorrectLanguage: s.boolean().describe('Whether the text is in the target language'),
	detectedLanguage: s.string().describe('The detected language of the text'),
	reason: s.string().describe('Brief explanation'),
});

// Type for language detection result
type LanguageCheckResult = s.infer<typeof LanguageCheckSchema>;

/**
 * Custom Eval (binary): Language Match
 * Verifies the translation is in the requested target language.
 * Uses generateText with Output.object for structured output.
 */
export const languageMatchEval = agent.createEval('language-match', {
	description: 'Verifies the translation is in the requested target language',
	handler: async (ctx, input, output) => {
		ctx.logger.info('[EVAL] language-match: Starting', {
			targetLanguage: input.toLanguage,
			translationLength: output.translation.length,
		});

		// Skip if no translation produced
		if (!output.translation || output.translation.trim() === '') {
			ctx.logger.info('[EVAL] language-match: No translation to evaluate');
			return {
				passed: false,
				metadata: { reason: 'No translation produced' },
			};
		}

		const targetLanguage = input.toLanguage ?? 'Spanish';

		// Generate structured output using jsonSchema wrapper for @agentuity/schema
		const { output: result } = await generateText({
			model: openai('gpt-4o-mini'),
			output: Output.object({
				schema: jsonSchema<LanguageCheckResult>(s.toJSONSchema(LanguageCheckSchema)),
			}),
			prompt: `Determine if the following text is written in ${targetLanguage}.

Text to analyze:
"${output.translation}"

Is this text written in ${targetLanguage}?`,
		});

		ctx.logger.info('[EVAL] language-match: Completed', {
			passed: result.isCorrectLanguage,
			detectedLanguage: result.detectedLanguage,
		});

		return {
			passed: result.isCorrectLanguage,
			metadata: {
				reason: result.reason,
				targetLanguage,
				detectedLanguage: result.detectedLanguage,
			},
		};
	},
});
