import { createRouter, validator } from '@agentuity/runtime';
import { bearerTokenAuth, cookieAuth } from '../../middleware/auth';
import { config } from '../../config';
import { SessionSchema, MessageSchema, type Session } from '../../types/chat';
import { z } from 'zod';

const router = createRouter();

// Constants
const DEFAULT_SESSIONS_LIMIT = 10;
const MAX_SESSIONS_LIMIT = 50;

// Schema for adding a message to a session
export const AddMessageSchema = z.object({
	message: MessageSchema,
});

/**
 * GET /api/sessions - Get all sessions (paginated)
 */
router.get('/', bearerTokenAuth, cookieAuth, async (c) => {
	try {
		const userId = (c.get as (key: string) => string)('userId');

		// Parse and validate query parameters
		let limit = Number.parseInt(c.req.query('limit') ?? String(DEFAULT_SESSIONS_LIMIT));
		let cursor = Number.parseInt(c.req.query('cursor') ?? '0');

		// Clamp to valid ranges
		if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_SESSIONS_LIMIT;
		if (limit > MAX_SESSIONS_LIMIT) limit = MAX_SESSIONS_LIMIT;
		if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

		// Get session IDs for the user
		const response = await c.var.kv.get<string[]>(config.kvStoreName, userId);
		if (!response.exists) {
			return c.json({
				sessions: [],
				pagination: { cursor, nextCursor: null, hasMore: false, total: 0, limit },
			});
		}

		if (!response.data?.length) {
			return c.json({
				sessions: [],
				pagination: { cursor, nextCursor: null, hasMore: false, total: 0, limit },
			});
		}

		const sessionIds = response.data;
		const total = sessionIds.length;

		// Clamp cursor to valid range
		const start = Math.min(cursor, total);
		const end = Math.min(start + limit, total);
		const pageIds = sessionIds.slice(start, end);

		// Fetch full session objects for each ID
		const sessionPromises = pageIds.map((sessionId) =>
			c.var.kv.get<Session>(config.kvStoreName, sessionId)
		);
		const sessionResults = await Promise.all(sessionPromises);
		const sessions = sessionResults
			.filter((result) => result.exists && result.data)
			.map((result) => result.data as Session);

		const hasMore = end < total;
		const nextCursor = hasMore ? end : null;

		return c.json({
			sessions,
			pagination: { cursor: start, nextCursor, hasMore, total, limit },
		});
	} catch (error) {
		c.var.logger.error(
			'Session request failed: %s',
			error instanceof Error ? error.message : String(error)
		);
		return c.json(
			{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
			{ status: 500 }
		);
	}
});

/**
 * POST /api/sessions - Create a new session
 */
router.post('/', bearerTokenAuth, cookieAuth, validator({ input: SessionSchema }), async (c) => {
	try {
		const userId = (c.get as (key: string) => string)('userId');

		const session = c.req.valid('json');

		if (session.messages && session.messages.length > 0) {
			const now = new Date().toISOString();
			session.messages = session.messages.map((message) => ({
				...message,
				timestamp: now,
			}));
		}

		const sessionKey = `${userId}_${session.sessionId}`;

		// Save the session data
		await c.var.kv.set(config.kvStoreName, sessionKey, session);

		// Update the sessions list with just the session ID
		const allSessionsResponse = await c.var.kv.get<string[]>(config.kvStoreName, userId);
		const sessionIds = allSessionsResponse.exists ? allSessionsResponse.data || [] : [];

		// Add the new session ID to the beginning of the array
		const updatedSessionIds = [sessionKey, ...sessionIds.filter((id) => id !== sessionKey)];

		await c.var.kv.set(config.kvStoreName, userId, updatedSessionIds);

		return c.json({
			success: true,
			session,
			...(session.title ? {} : { titleGeneration: 'pending' }),
		});
	} catch (error) {
		c.var.logger.error(
			'Create session failed: %s',
			error instanceof Error ? error.message : String(error)
		);
		return c.json(
			{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
			{ status: 500 }
		);
	}
});

/**
 * GET /api/sessions/:sessionId - Get a specific session
 */
router.get('/:sessionId', bearerTokenAuth, cookieAuth, async (c) => {
	try {
		const userId = (c.get as (key: string) => string)('userId');
		const sessionId = c.req.param('sessionId');
		const sessionKey = `${userId}_${sessionId}`;

		const response = await c.var.kv.get<Session>(config.kvStoreName, sessionKey);

		if (!response.exists) {
			return c.json({ error: 'Session not found' }, { status: 404 });
		}

		return c.json({ session: response.data });
	} catch (error) {
		c.var.logger.error(
			'Get session failed: %s',
			error instanceof Error ? error.message : String(error)
		);
		return c.json(
			{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
			{ status: 500 }
		);
	}
});

/**
 * PUT /api/sessions/:sessionId - Update a session
 */
router.put(
	'/:sessionId',
	bearerTokenAuth,
	cookieAuth,
	validator({ input: SessionSchema }),
	async (c) => {
		try {
			const userId = (c.get as (key: string) => string)('userId');
			const sessionId = c.req.param('sessionId');
			const sessionKey = `${userId}_${sessionId}`;

			const session = c.req.valid('json');

			if (session.sessionId !== sessionId) {
				return c.json({ error: 'Session ID mismatch' }, { status: 400 });
			}

			// Generate server-side timestamps for messages that don't have one
			if (session.messages && session.messages.length > 0) {
				const now = new Date().toISOString();
				session.messages = session.messages.map((message) => ({
					...message,
					timestamp: now,
				}));
			}

			// Update the individual session
			await c.var.kv.set(config.kvStoreName, sessionKey, session);

			// Update the master list if needed (ensure the session ID is in the list)
			const allSessionsResponse = await c.var.kv.get<string[]>(config.kvStoreName, userId);
			const sessionIds = allSessionsResponse.exists ? allSessionsResponse.data || [] : [];

			// If the session ID isn't in the list, add it to the beginning
			if (!sessionIds.includes(sessionKey)) {
				const updatedSessionIds = [sessionKey, ...sessionIds];
				await c.var.kv.set(config.kvStoreName, userId, updatedSessionIds);
			}

			return c.json({ success: true, session });
		} catch (error) {
			c.var.logger.error(
				'Update session failed: %s',
				error instanceof Error ? error.message : String(error)
			);
			return c.json(
				{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
				{ status: 500 }
			);
		}
	}
);

/**
 * DELETE /api/sessions/:sessionId - Delete a session
 */
router.delete('/:sessionId', bearerTokenAuth, cookieAuth, async (c) => {
	try {
		const userId = (c.get as (key: string) => string)('userId');
		const sessionId = c.req.param('sessionId');
		const sessionKey = `${userId}_${sessionId}`;

		// Delete the session data
		await c.var.kv.delete(config.kvStoreName, sessionKey);

		// Remove from sessions list
		const allSessionsResponse = await c.var.kv.get<string[]>(config.kvStoreName, userId);
		const sessionIds = allSessionsResponse.exists ? allSessionsResponse.data || [] : [];

		const updatedSessionIds = sessionIds.filter((id) => id !== sessionKey);
		await c.var.kv.set(config.kvStoreName, userId, updatedSessionIds);

		return c.json({ success: true });
	} catch (error) {
		c.var.logger.error(
			'Delete session failed: %s',
			error instanceof Error ? error.message : String(error)
		);
		return c.json(
			{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
			{ status: 500 }
		);
	}
});

/**
 * POST /api/sessions/:sessionId/messages - Add a message to a session
 */
router.post(
	'/:sessionId/messages',
	bearerTokenAuth,
	cookieAuth,
	validator({ input: AddMessageSchema }),
	async (c) => {
		try {
			const userId = (c.get as (key: string) => string)('userId');
			const sessionId = c.req.param('sessionId');
			const sessionKey = `${userId}_${sessionId}`;

			const { message } = c.req.valid('json');

			// Get current session
			const sessionResponse = await c.var.kv.get<Session>(config.kvStoreName, sessionKey);
			if (!sessionResponse.exists || !sessionResponse.data) {
				return c.json({ error: 'Session not found' }, { status: 404 });
			}

			// Generate server-side timestamp
			const messageWithTimestamp = {
				...message,
				timestamp: new Date().toISOString(),
			};

			const session = sessionResponse.data;
			const updatedSession: Session = {
				...session,
				messages: [...session.messages, messageWithTimestamp],
			};

			// Update the individual session
			await c.var.kv.set(config.kvStoreName, sessionKey, updatedSession);

			// Move this session ID to the top of the master list (most recently used)
			const allSessionsResponse = await c.var.kv.get<string[]>(config.kvStoreName, userId);
			const sessionIds = allSessionsResponse.exists ? allSessionsResponse.data || [] : [];

			// Remove the current session ID if it exists and add it to the beginning
			const filteredSessionIds = sessionIds.filter((id) => id !== sessionKey);
			const updatedSessionIds = [sessionKey, ...filteredSessionIds];

			await c.var.kv.set(config.kvStoreName, userId, updatedSessionIds);

			return c.json({ success: true, session: updatedSession });
		} catch (error) {
			c.var.logger.error(
				'Add message failed: %s',
				error instanceof Error ? error.message : String(error)
			);
			return c.json(
				{ error: error instanceof Error ? error.message : 'Unknown error occurred' },
				{ status: 500 }
			);
		}
	}
);

export default router;
