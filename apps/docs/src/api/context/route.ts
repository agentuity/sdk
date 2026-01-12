/**
 * Context Route - Demonstrates accessing runtime context (session, thread, logger, etc).
 *
 * GET /session    - Session info via context agent
 * GET /services   - Available services via context agent
 * GET /agents     - Available agents via context agent
 * GET /state      - State storage info via context agent
 * GET /full       - Direct access to session and thread objects
 * GET /logger     - Demonstrates logger at different levels
 * GET /background - Demonstrates waitUntil() for background tasks
 */
import { createRouter } from '@agentuity/runtime';
import contextAgent from '../../agent/context/agent';
import { formatTimestamps } from '../../lib/utils';

const router = createRouter();

router.get('/session', async (c) => {
	const result = await contextAgent.run('session');
	return c.json(result);
});

router.get('/services', async (c) => {
	const result = await contextAgent.run('services');
	return c.json(result);
});

router.get('/agents', async (c) => {
	const result = await contextAgent.run('agents');
	return c.json(result);
});

router.get('/state', async (c) => {
	const result = await contextAgent.run('state');
	return c.json(result);
});

// Directly accesses context variables instead of using the context agent
router.get('/full', async (c) => {
	const session = c.var.session;
	const thread = c.var.thread;

	const threadEntries = thread?.state ? await thread.state.entries() : [];
	return c.json({
		session: {
			id: session?.id ?? '(not available)',
			state: session?.state ? formatTimestamps(Object.fromEntries(session.state)) : {},
		},
		thread: {
			id: thread?.id ?? '(not available)',
			state: formatTimestamps(Object.fromEntries(threadEntries)),
		},
		sessionId: c.var.sessionId,
		request: {
			method: c.req.method,
			url: c.req.url,
		},
	});
});

router.get('/logger', async (c) => {
	c.var.logger?.trace('Trace message from route');
	c.var.logger?.info('Info message from route');
	c.var.logger?.warn('Warning message from route');
	c.var.logger?.error('Error message from route (demo only)');

	return c.json({
		message: 'Logged messages at trace, info, warn, and error levels',
		note: 'Check console for output. Trace requires AGENTUITY_LOG_LEVEL=trace.',
	});
});

// waitUntil() allows response to return immediately while task runs in background
router.get('/background', async (c) => {
	c.executionCtx?.waitUntil(
		(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5000));
			c.var.logger?.info('Background task completed after 5 seconds!');
		})()
	);

	return c.json({
		message: 'Background task started',
		note: 'Response sent immediately, task completes in 5 seconds (check logs)',
	});
});

export default router;
