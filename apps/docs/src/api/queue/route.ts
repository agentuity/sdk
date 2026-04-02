/**
 * Queue Route - Message queue lifecycle operations.
 *
 * Agent-side (publish, setup) goes through the queue agent.
 * Consume-side (receive, ack, nack, DLQ) uses APIClient directly,
 * matching the pattern in src/api/sandbox/route.ts.
 *
 * POST /publish     - Publish a message via the agent
 * POST /setup       - Create/ensure queue exists via the agent
 * GET  /status      - Queue stats (message count, DLQ count)
 * GET  /receive     - Receive next message
 * POST /ack/:id     - Acknowledge a message
 * POST /nack/:id    - Negative-acknowledge (retry/DLQ)
 * GET  /dlq         - List dead letter messages
 * POST /dlq/:id     - Replay a DLQ message
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import {
	APIClient,
	type Logger,
	getServiceUrls,
	receiveMessage,
	ackMessage,
	nackMessage,
	getQueue,
	listDeadLetterMessages,
	replayDeadLetterMessage,
} from '@agentuity/server';
import queueAgent from '../../agent/queue/agent';

/** Derive a per-session queue name from the thread ID. */
function getQueueName(threadId?: string): string {
	if (!threadId) throw new Error('Thread ID required for queue demo — session context missing');
	return `explorer-${threadId.slice(0, 12)}`;
}

function createQueueClient(logger: Logger) {
	const apiKey = process.env.AGENTUITY_SDK_KEY || process.env.AGENTUITY_CLI_KEY || '';
	const region = process.env.AGENTUITY_REGION ?? 'usc';
	const serviceUrls = getServiceUrls(region);
	return new APIClient(serviceUrls.catalyst, logger, apiKey);
}

// Per-request context set by middleware
type QueueVars = { queueName: string; queueClient: APIClient };

const router = new Hono<Env & { Variables: QueueVars }>()

	// Derive queue name and client once per request
	.use(async (c, next) => {
		c.set('queueName', getQueueName(c.var.thread?.id));
		c.set('queueClient', createQueueClient(c.var.logger));
		await next();
	})

	// --- Agent-side operations ---

	.post('/setup', async (c) => {
		try {
			const result = await queueAgent.run({ action: 'setup', queueName: c.var.queueName });
			return c.json(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.post('/publish', async (c) => {
		try {
			const body = await c.req.json();
			const result = await queueAgent.run({
				action: 'publish',
				payload: body.payload,
				queueName: c.var.queueName,
			});
			return c.json(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	// --- Consume-side operations (APIClient) ---

	.get('/status', async (c) => {
		try {
			const queue = await getQueue(c.var.queueClient, c.var.queueName);
			return c.json({
				success: true,
				data: {
					message_count: queue.message_count ?? 0,
					dlq_count: queue.dlq_count ?? 0,
					name: queue.name,
					queue_type: queue.queue_type,
				},
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.get('/receive', async (c) => {
		try {
			const msg = await receiveMessage(c.var.queueClient, c.var.queueName, 5);
			if (msg) {
				return c.json({ success: true, data: msg });
			}
			return c.json({ success: true, data: null, message: 'No messages available' });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.post('/ack/:id', async (c) => {
		try {
			const messageId = c.req.param('id');
			await ackMessage(c.var.queueClient, c.var.queueName, messageId);
			return c.json({ success: true, message: `Acknowledged ${messageId}` });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.post('/nack/:id', async (c) => {
		try {
			const messageId = c.req.param('id');
			await nackMessage(c.var.queueClient, c.var.queueName, messageId);
			return c.json({ success: true, message: `Nacked ${messageId}` });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.get('/dlq', async (c) => {
		try {
			const result = await listDeadLetterMessages(c.var.queueClient, c.var.queueName);
			return c.json({ success: true, data: result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.post('/dlq/:id', async (c) => {
		try {
			const messageId = c.req.param('id');
			const msg = await replayDeadLetterMessage(c.var.queueClient, c.var.queueName, messageId);
			return c.json({ success: true, message: `Replayed ${messageId}`, data: msg });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	});

export default router;
