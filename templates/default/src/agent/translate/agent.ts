/**
 * Translation Agent: demonstrates AI Gateway, thread state, sessions, and structured logging.
 * Schema defines the input/output shape; TypeScript types are inferred automatically.
 */
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import OpenAI from 'openai';

/**
 * AI Gateway: Access OpenAI, Anthropic, Google, and other LLM providers with just your
 * Agentuity SDK key. No separate provider API keys needed.
 */
const client = new OpenAI();

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
	latencyMs: number;
}

export const AgentInput = s.object({
	text: s.optional(s.string()),
	toLanguage: s.optional(s.enum(['Spanish', 'French', 'German', 'Chinese'])),
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
			latencyMs: s.number(),
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

		// Require text for translation
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

		ctx.logger.info('─── Translation Request ───');
		ctx.logger.info(`Thread:  ${ctx.thread.id}`);
		ctx.logger.info(`Session: ${ctx.sessionId}`);
		ctx.logger.info('Input', { toLanguage, model, textLength: text.length });

		const prompt = `Translate to ${toLanguage}:\n\n${text}`;

		const startTime = Date.now();
		const completion = await client.chat.completions.create({
			model,
			messages: [{ role: 'user', content: prompt }],
		});
		const latencyMs = Date.now() - startTime;

		const translation = completion.choices[0]?.message?.content ?? '';
		// Token usage from the LLM response - also available via x-agentuity-tokens response header
		const tokens = completion.usage?.total_tokens ?? 0;

		// Store translation in history using thread state (persists across sessions)
		const truncate = (s: string, len: number) => (s.length > len ? `${s.slice(0, len)}...` : s);
		const newEntry: HistoryEntry = {
			text: truncate(text, 50),
			toLanguage,
			translation: truncate(translation, 50),
			sessionId: ctx.sessionId,
			timestamp: new Date().toISOString(),
			model,
			tokens,
			latencyMs,
		};

		// Push to history with auto-trim (keeps last 5 entries)
		await ctx.thread.state.push('history', newEntry, 5);
		const history = (await ctx.thread.state.get<HistoryEntry[]>('history')) ?? [];

		ctx.logger.info('Output', { tokens, latencyMs, totalCount: history.length });

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
