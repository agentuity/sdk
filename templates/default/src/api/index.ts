/**
 * API routes for the translation agent.
 * Routes handle state operations (get/clear history); the agent handles translation.
 */
import { createRouter, validator } from '@agentuity/runtime';
// Import from eval.ts to ensure evals are registered with the agent
import translate from '../agent/translate/eval';
import { AgentOutput, type HistoryEntry } from '../agent/translate/agent';

const api = createRouter();

// State subset for history endpoints (derived from AgentOutput)
export const stateSchema = AgentOutput.pick(['history', 'threadId', 'translationCount']);

// Retrieve translation history
api.get('/translate/history', validator({ output: stateSchema }), async (c) => {
	// Routes use c.var.* for Agentuity services (thread, kv, logger); agents use ctx.* directly
	const history = (await c.var.thread.state.get<HistoryEntry[]>('history')) ?? [];
	return c.json({
		history,
		threadId: c.var.thread.id,
		translationCount: history.length,
	});
});

// Translate text
api.post('/translate', translate.validator(), async (c) => {
	const data = c.req.valid('json');
	return c.json(await translate.run(data));
});

// Clear translation history
api.delete('/translate/history', validator({ output: stateSchema }), async (c) => {
	await c.var.thread.state.delete('history');
	return c.json({
		history: [],
		threadId: c.var.thread.id,
		translationCount: 0,
	});
});

export default api;
