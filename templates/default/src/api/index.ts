/**
 * API routes for translation.
 * All logic lives directly in the route handlers — no separate agent layer.
 */

import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import OpenAI from 'openai';

/**
 * AI Gateway: Routes requests to OpenAI, Anthropic, and other LLM providers.
 * One SDK key, unified observability and billing; no separate API keys needed.
 */
const openai = new OpenAI();

const LANGUAGES = ['Spanish', 'French', 'German', 'Chinese'] as const;
const MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'] as const;

// ── Schemas ──────────────────────────────────────────────────────────────────

const HistoryEntrySchema = s.object({
	model: s.string().describe('AI model used for the translation'),
	sessionId: s.string().describe('Session ID when the translation was made'),
	text: s.string().describe('Original text that was translated (truncated)'),
	timestamp: s.string().describe('ISO timestamp when the translation occurred'),
	tokens: s.number().describe('Number of tokens used for this translation'),
	toLanguage: s.string().describe('Target language for the translation'),
	translation: s.string().describe('Translated text result (truncated)'),
});

export type HistoryEntry = s.infer<typeof HistoryEntrySchema>;

const TranslateInput = s.object({
	model: s.enum(MODELS).optional().describe('AI model to use for translation'),
	text: s.string().describe('The text to translate'),
	toLanguage: s.enum(LANGUAGES).optional().describe('Target language for translation'),
});

const TranslateOutput = s.object({
	history: s.array(HistoryEntrySchema).describe('Recent translation history'),
	sessionId: s.string().describe('Current session identifier'),
	threadId: s.string().describe('Thread ID for conversation continuity'),
	tokens: s.number().describe('Tokens used for this translation'),
	translation: s.string().describe('The translated text'),
	translationCount: s.number().describe('Total translations in this thread'),
});

const HistoryOutput = TranslateOutput.pick(['history', 'threadId', 'translationCount']);

// ── Routes ───────────────────────────────────────────────────────────────────

const api = new Hono<Env>()
	// Translate text
	.post(
		'/translate',
		validator({ input: TranslateInput, output: TranslateOutput }),
		async (c) => {
			const { text, toLanguage = 'Spanish', model = 'gpt-5-nano' } = c.req.valid('json');

			// Agentuity logger: structured logs visible in terminal and Agentuity console
			c.var.logger.info('──── Translation ────');
			c.var.logger.info({ toLanguage, model, textLength: text.length });
			c.var.logger.info('Request IDs', {
				threadId: c.var.thread.id,
				sessionId: c.var.sessionId,
			});

			const prompt = `Translate to ${toLanguage}:\n\n${text}`;

			// Call OpenAI via AI Gateway (automatically routed and tracked)
			const completion = await openai.chat.completions.create({
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
				sessionId: c.var.sessionId,
				text: truncate(text, 50),
				timestamp: new Date().toISOString(),
				tokens,
				toLanguage,
				translation: truncate(translation, 50),
			};

			// Append to history (sliding window, keeps last 5 entries)
			await c.var.thread.state.push('history', newEntry, 5);

			const history = (await c.var.thread.state.get<HistoryEntry[]>('history')) ?? [];

			c.var.logger.info('Translation complete', {
				tokens,
				historyCount: history.length,
			});

			return c.json({
				history,
				sessionId: c.var.sessionId,
				threadId: c.var.thread.id,
				tokens,
				translation,
				translationCount: history.length,
			});
		}
	)
	// Retrieve translation history
	.get('/translate/history', validator({ output: HistoryOutput }), async (c) => {
		const history = (await c.var.thread.state.get<HistoryEntry[]>('history')) ?? [];

		return c.json({
			history,
			threadId: c.var.thread.id,
			translationCount: history.length,
		});
	})
	// Clear translation history
	.delete('/translate/history', validator({ output: HistoryOutput }), async (c) => {
		await c.var.thread.state.delete('history');

		return c.json({
			history: [],
			threadId: c.var.thread.id,
			translationCount: 0,
		});
	});

export type ApiRouter = typeof api;

export default api;
