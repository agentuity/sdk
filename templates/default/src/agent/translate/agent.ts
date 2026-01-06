/**
 * Translation Agent: translates text using AI models via the Agentuity AI Gateway.
 * Stores translation history in thread state for persistence across requests.
 * Uses @agentuity/schema - a lightweight, built-in schema library.
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import OpenAI from 'openai';

/**
 * AI Gateway: Routes requests to OpenAI, Anthropic, and other LLM providers.
 * One SDK key, unified observability and billing; no separate API keys needed.
 */
const client = new OpenAI();

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'] as const;

// History entry stored in thread state
export const HistoryEntrySchema = s.object({
	model: s.string().describe('AI model used for the translation'),
	sessionId: s.string().describe('Session ID when the translation was made'),
	text: s.string().describe('Original text that was translated (truncated)'),
	timestamp: s.string().describe('ISO timestamp when the translation occurred'),
	tokens: s.number().describe('Number of tokens used for this translation'),
	toLanguage: s.string().describe('Target language for the translation'),
	translation: s.string().describe('Translated text result (truncated)'),
});

export type HistoryEntry = s.infer<typeof HistoryEntrySchema>;

export const AgentInput = s.object({
	model: s.enum(MODELS).optional().describe('AI model to use for translation'),
	text: s.string().describe('The text to translate'),
	toLanguage: s.enum(LANGUAGES).optional().describe('Target language for translation'),
});

export const AgentOutput = s.object({
	history: s.array(HistoryEntrySchema).describe('Recent translation history'),
	sessionId: s.string().describe('Current session identifier'),
	threadId: s.string().describe('Thread ID for conversation continuity'),
	tokens: s.number().describe('Tokens used for this translation'),
	translation: s.string().describe('The translated text'),
	translationCount: s.number().describe('Total translations in this thread'),
});

// Agent definition with automatic schema validation
const agent = createAgent('translate', {
	description: 'Translates text to different languages',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx, { text, toLanguage = 'Spanish', model = 'gpt-5-nano' }) => {
		// Agentuity logger: structured logs visible in terminal and Agentuity console
		ctx.logger.info('──── Translation ────');
		ctx.logger.info({ toLanguage, model, textLength: text.length });
		ctx.logger.info('Request IDs', {
			threadId: ctx.thread.id,
			sessionId: ctx.sessionId,
		});

		const prompt = `Translate to ${toLanguage}:\n\n${text}`;

		// Call OpenAI via AI Gateway (automatically routed and tracked)
		const completion = await client.chat.completions.create({
			model,
			messages: [{ role: 'user', content: prompt }],
		});

		const translation = completion.choices[0]?.message?.content ?? '';

		// Token usage from the response (also available via x-agentuity-tokens header)
		const tokens = completion.usage?.total_tokens ?? 0;

		// Add translation to history
		const truncate = (str: string, len: number) =>
			str.length > len ? `${str.slice(0, len)}...` : str;

		const newEntry: HistoryEntry = {
			model,
			sessionId: ctx.sessionId,
			text: truncate(text, 50),
			timestamp: new Date().toISOString(),
			tokens,
			toLanguage,
			translation: truncate(translation, 50),
		};

		// Append to history (sliding window, keeps last 5 entries)
		await ctx.thread.state.push('history', newEntry, 5);

		const history = (await ctx.thread.state.get<HistoryEntry[]>('history')) ?? [];

		ctx.logger.info('Translation complete', {
			tokens,
			historyCount: history.length,
		});

		return {
			history,
			sessionId: ctx.sessionId,
			threadId: ctx.thread.id,
			tokens,
			translation,
			translationCount: history.length,
		};
	},
});

export default agent;
