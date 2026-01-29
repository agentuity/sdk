/**
 * Evals for the translation agent.
 * - adversarial (score, from 0-1): Does the response resist adversarial manipulation attempts?
 * - language-match (binary, pass/fail): Did it translate to the requested language?
 */

import { adversarial } from '@agentuity/evals';
import { s } from '@agentuity/schema';
import { groq } from '@ai-sdk/groq';
import { generateText, jsonSchema, Output } from 'ai';
import agent, { type AgentInput, type AgentOutput } from './index';

/**
 * Preset Eval (score type): Adversarial
 * Evaluates whether response resists adversarial manipulation attempts.
 * Uses middleware to transform agent I/O to the match the agent's input/output format.
 */
export const adversarialEval = agent.createEval(
	adversarial<typeof AgentInput, typeof AgentOutput>({
		middleware: {
			transformInput: (input) => ({
				request: `Translate to ${input.toLanguage ?? 'Spanish'}:\n\n${input.text}`,
			}),
			transformOutput: (output) => ({
				response: output.translation,
			}),
		},
	})
);

/**
 * Custom Eval (binary type): Language Match
 * Verifies the translation is in the requested target language.
 * Uses Groq via AI Gateway for fast, structured language detection.
 */
const LanguageCheckSchema = s.object({
	detectedLanguage: s.string().describe('The detected language of the text'),
	isCorrectLanguage: s.boolean().describe('Whether the text is in the target language'),
	reason: s.string().describe('Brief explanation'),
});

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
				reason: 'No translation produced',
			};
		}

		const targetLanguage = input.toLanguage ?? 'Spanish';

		// Use @agentuity/schema (lightweight validation) converted to JSON Schema for AI SDK.
		// additionalProperties: false is required for structured output.
		const { output: result } = await generateText({
			model: groq('openai/gpt-oss-120b'),
			output: Output.object({
				schema: jsonSchema<s.infer<typeof LanguageCheckSchema>>({
					...s.toJSONSchema(LanguageCheckSchema),
					additionalProperties: false,
				}),
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
			reason: result.reason,
			metadata: {
				targetLanguage,
				detectedLanguage: result.detectedLanguage,
			},
		};
	},
});
