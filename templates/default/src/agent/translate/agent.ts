/**
 * Translation Agent: translates text using AI models via the Agentuity AI Gateway.
 * Demonstrates thread state, sessions, structured logging, and end-to-end type safety.
 * Uses @agentuity/schema (built-in, zero dependencies) for input/output validation.
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
interface HistoryEntry {
	text: string;
	toLanguage: string;
	translation: string;
	sessionId: string;
	timestamp: string;
	model: string;
	tokens: number;
}

export const AgentInput = s.object({
	text: s.optional(s.string()),
	toLanguage: s.optional(s.enum(LANGUAGES)),
	model: s.optional(s.enum(MODELS)),
	command: s.optional(s.enum(['translate', 'clear'])),
});

export const AgentOutput = s.object({
	translation: s.string(),
	threadId: s.string(),
	sessionId: s.string(),
	translationCount: s.number(),
	tokens: s.number(),
	history: s.array(
		s.object({
			text: s.string(),
			toLanguage: s.string(),
			translation: s.string(),
			sessionId: s.string(),
			timestamp: s.string(),
			model: s.string(),
			tokens: s.number(),
		})
	),
});

const agent = createAgent('translate', {
	description: 'Translates text to different languages',
	schema: {
		input: AgentInput,
		output: AgentOutput,
	},
	handler: async (ctx, { text, toLanguage = 'Spanish', model = 'gpt-5-nano', command = 'translate' }) => {
		// Handle clear command
		if (command === 'clear') {
			// Thread state: persists across requests in this conversation (up to 1 hour)
			await ctx.thread.state.delete('history');
			ctx.logger.info('History cleared');
			return {
				translation: '',
				threadId: ctx.thread.id,
				sessionId: ctx.sessionId,
				translationCount: 0,
				tokens: 0,
				history: [],
			};
		}

		// No text provided: return current state (history)
		if (!text) {
			const history = (await ctx.thread.state.get<HistoryEntry[]>('history')) ?? [];
			return {
				translation: '',
				threadId: ctx.thread.id,
				sessionId: ctx.sessionId,
				translationCount: history.length,
				tokens: 0,
				history,
			};
		}

		// Agentuity logger: structured logs visible in terminal and Agentuity console
		ctx.logger.info('──── Translation ────');
		ctx.logger.info({ toLanguage, model, textLength: text.length });
		ctx.logger.info('Request IDs', { threadId: ctx.thread.id, sessionId: ctx.sessionId });

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
		const truncate = (str: string, len: number) => (str.length > len ? `${str.slice(0, len)}...` : str);
		const newEntry: HistoryEntry = {
			text: truncate(text, 50),
			toLanguage,
			translation: truncate(translation, 50),
			sessionId: ctx.sessionId,
			timestamp: new Date().toISOString(),
			model,
			tokens,
		};

		// Append to history (sliding window, keeps last 5 entries)
		await ctx.thread.state.push('history', newEntry, 5);
		const history = (await ctx.thread.state.get<HistoryEntry[]>('history')) ?? [];

		ctx.logger.info('Translation complete', { tokens, historyCount: history.length });

		return {
			translation,
			threadId: ctx.thread.id,
			sessionId: ctx.sessionId,
			translationCount: history.length,
			tokens,
			history,
		};
	},
});

export default agent;
