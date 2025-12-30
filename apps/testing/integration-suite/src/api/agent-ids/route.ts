/**
 * Agent IDs Test API Route
 *
 * Endpoints for testing that agent IDs are correctly captured in session events.
 *
 * POST /api/agent-ids/run - Calls an agent and returns the session ID
 * GET /api/agent-ids/verify/:sessionId - Retrieves captured agentIds for a session
 * GET /api/agent-ids/last - Gets the last completed session's agentIds
 */

import { createRouter } from '@agentuity/runtime';
import agentIdTestAgent from '@agents/session/agent-id-test';
import { testSessionEventProvider } from '../../test/helpers/session-event-provider';

const router = createRouter();

/**
 * Run the test agent and return the session ID for later verification.
 * The session ID can be used to check what agentIds were captured.
 */
router.post('/run', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const message = (body as { message?: string }).message || 'test';

	// Get the session ID before calling the agent
	const sessionId = c.var.sessionId;

	// Call the agent
	const result = await agentIdTestAgent.run({ message });

	return c.json({
		success: true,
		sessionId,
		agentResult: result,
	});
});

/**
 * Verify the captured agentIds for a specific session.
 */
router.get('/verify/:sessionId', async (c) => {
	const sessionId = c.req.param('sessionId');

	const events = testSessionEventProvider.getSessionEvents(sessionId);
	const completedEvent = testSessionEventProvider.getCompletedSession(sessionId);
	const agentIds = testSessionEventProvider.getAgentIds(sessionId);

	return c.json({
		sessionId,
		eventCount: events.length,
		hasCompleteEvent: !!completedEvent,
		agentIds: agentIds || [],
		agentIdsCount: agentIds?.length || 0,
		completedEvent: completedEvent
			? {
					id: completedEvent.id,
					threadId: completedEvent.threadId,
					statusCode: completedEvent.statusCode,
					agentIds: completedEvent.agentIds,
				}
			: null,
	});
});

/**
 * Get the last completed session for quick verification.
 */
router.get('/last', async (c) => {
	const completedEvent = testSessionEventProvider.getLastCompletedSession();

	if (!completedEvent) {
		return c.json({ error: 'No completed sessions found' }, 404);
	}

	return c.json({
		sessionId: completedEvent.id,
		threadId: completedEvent.threadId,
		statusCode: completedEvent.statusCode,
		agentIds: completedEvent.agentIds || [],
		agentIdsCount: completedEvent.agentIds?.length || 0,
	});
});

/**
 * Get all captured sessions for debugging.
 */
router.get('/all', async (c) => {
	const sessions = testSessionEventProvider.getAllSessions();
	const eventCount = testSessionEventProvider.getEventCount();

	return c.json({
		sessionCount: sessions.length,
		eventCount,
		sessions,
	});
});

/**
 * Clear all captured events (useful for test isolation).
 */
router.delete('/clear', async (c) => {
	testSessionEventProvider.clear();
	return c.json({ success: true, message: 'All captured events cleared' });
});

export default router;
