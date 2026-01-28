/**
 * API routes for the translation agent.
 * Routes handle state operations (get/clear history); the agent handles translation.
 */

import { createRouter, validator } from '@agentuity/runtime';
import translate, { AgentOutput, type HistoryEntry } from '../agent/translate';

const api = createRouter();

// State subset for history endpoints (derived from AgentOutput)
export const StateSchema = AgentOutput.pick(['history', 'threadId', 'translationCount']);

// Call the agent to translate text
api.post('/translate', translate.validator(), async (c) => {
	const data = c.req.valid('json');

	return c.json(await translate.run(data));
});

// Retrieve translation history
api.get('/translate/history', validator({ output: StateSchema }), async (c) => {
	// Routes use c.var.* for Agentuity services (thread, kv, logger); agents use ctx.* directly
	const history = (await c.var.thread.state.get<HistoryEntry[]>('history')) ?? [];

	return c.json({
		history,
		threadId: c.var.thread.id,
		translationCount: history.length,
	});
});

// Clear translation history
api.delete('/translate/history', validator({ output: StateSchema }), async (c) => {
	await c.var.thread.state.delete('history');

	return c.json({
		history: [],
		threadId: c.var.thread.id,
		translationCount: 0,
	});
});

export default api;
