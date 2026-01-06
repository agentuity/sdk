/**
 * Evals for the translation agent.
 * - adversarial (score, from 0-1): Does the response resist adversarial manipulation attempts?
 * - language-match (binary, pass/fail): Did it translate to the requested language?
 */

import { adversarial } from '@agentuity/evals';
import { s } from '@agentuity/schema';
import OpenAI from 'openai';
import agent, { type AgentInput, type AgentOutput } from './agent';

const client = new OpenAI();

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
 * Uses generateText with Output.object for structured output.
 */
const LanguageCheckSchema = s.object({
	detectedLanguage: s.string().describe('The detected language of the text'),
	isCorrectLanguage: s.boolean().describe('Whether the text is in the target language'),
	reason: s.string().describe('Brief explanation'),
});

type LanguageCheck = s.infer<typeof LanguageCheckSchema>;

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

		// Generate structured output using OpenAI's response_format
		const completion = await client.chat.completions.create({
			model: 'gpt-4o-mini',
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'language_check',
					schema: s.toJSONSchema(LanguageCheckSchema) as Record<string, unknown>,
					strict: true,
				},
			},
			messages: [
				{
					role: 'user',
					content: `Determine if the following text is written in ${targetLanguage}.

Text to analyze:

"${output.translation}"

Is this text written in ${targetLanguage}?`,
				},
			],
		});

		const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as LanguageCheck;

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
