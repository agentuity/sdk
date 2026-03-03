/**
 * Evals Route - Demonstrates automatic evaluation of AI-generated content.
 *
 * GET /              - Returns evaluation configuration
 * POST /             - Generates content and runs evaluations
 * GET /session/:id   - Fetches eval results from KV storage
 */
import { createRouter } from '@agentuity/runtime';
import evalsAgent from '../../agent/evals/agent';
import { EVAL_BUCKET, EVAL_NAMES } from '../../agent/evals/eval';

const router = createRouter();

router.get('/', (c) => {
	return c.json({
		name: 'Evals Demo',
		description: 'Generate content and run automatic evaluations',
		evals: [
			{
				name: 'answer-completeness',
				type: 'score',
				description: 'Did it fully address the prompt? (0-1)',
			},
			{
				name: 'factual-claims',
				type: 'binary',
				description: 'Contains factual tech claims?',
			},
		],
	});
});

router.post('/', async (c) => {
	const result = await evalsAgent.run({});
	return c.json({
		...result,
		sessionId: c.var.sessionId,
	});
});

// Fetch eval results from KV storage
// Evals store their results in KV when they complete (see eval.ts)
router.get('/session/:id', async (c) => {
	const sessionId = c.req.param('id');

	try {
		// Check KV for each expected eval result
		const evalResults = await Promise.all(
			EVAL_NAMES.map(async (evalName) => {
				const key = `${sessionId}:${evalName}`;
				const result = await c.var.kv?.get(EVAL_BUCKET, key);

				if (result?.exists) {
					return result.data as {
						evalId: string;
						pending: boolean;
						success: boolean;
						error: string | null;
						result: unknown;
					};
				}

				// Eval hasn't completed yet - return pending placeholder
				return {
					id: `pending-${evalName}`,
					evalId: evalName,
					pending: true,
					success: false,
					error: null,
					result: null,
				};
			})
		);

		// Session is pending if any eval is still pending
		const pending = evalResults.some((r) => r.pending);

		return c.json({
			sessionId,
			pending,
			evalResults,
		});
	} catch (error) {
		c.var.logger?.error('Failed to fetch eval results', { error, sessionId });
		return c.json({ error: 'Failed to fetch eval results' }, 500);
	}
});

export default router;
