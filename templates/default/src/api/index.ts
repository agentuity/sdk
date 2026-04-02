/**
 * API routes for the translation agent.
 * Routes handle state operations (get/clear history); the agent handles translation.
 */

import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import translate, { AgentOutput, type HistoryEntry } from '../agent/translate';

// State subset for history endpoints (derived from AgentOutput)
export const StateSchema = AgentOutput.pick(['history', 'threadId', 'translationCount']);

const api = new Hono<Env>()
	// Call the agent to translate text
	.post('/translate', translate.validator(), async (c) => {
		const data = c.req.valid('json');

		return c.json(await translate.run(data));
	})
	// Retrieve translation history
	.get('/translate/history', validator({ output: StateSchema }), async (c) => {
		// Routes use c.var.* for Agentuity services (thread, kv, logger); agents use ctx.* directly
		const history = (await c.var.thread.state.get<HistoryEntry[]>('history')) ?? [];

		return c.json({
			history,
			threadId: c.var.thread.id,
			translationCount: history.length,
		});
	})
	// Clear translation history
	.delete('/translate/history', validator({ output: StateSchema }), async (c) => {
		await c.var.thread.state.delete('history');

		return c.json({
			history: [],
			threadId: c.var.thread.id,
			translationCount: 0,
		});
	});

export type ApiRouter = typeof api;

export default api;
