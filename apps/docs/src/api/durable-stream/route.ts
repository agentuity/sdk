/**
 * Persistent Stream Route - Durable, URL-accessible storage.
 *
 * Persistent streams are write-once storage with a public URL. Content is
 * written incrementally, then closed. The URL returns the final content
 * after close(). For real-time streaming, see the SSE or WebSocket examples.
 *
 * Use cases: Generate reports, export data, create artifacts with shareable URLs.
 *
 * Auto-rotation: When at max capacity (10), oldest stream is deleted automatically.
 *
 * POST /create       - Create a new stream and generate summary with LLM
 * GET /list          - List all summary streams
 * GET /progress/:id  - Get stream progress
 */
import { createRouter } from '@agentuity/runtime';
import { streamText } from 'ai';
import { getModel } from '../../lib/models';
import agentuityDocs from '../../agent/chat/agentuity-context.txt';

const router = createRouter();

const STREAM_NAME = 'ai-summary';
const MAX_STREAMS = 10;

const PROMPT = `You are a technical writer. Based on the following documentation about Agentuity, write a clear and engaging summary (3-4 paragraphs) that explains what Agentuity is and why developers would use it. Be specific about key features.

Documentation:
${agentuityDocs}

Write the summary now:`;

// Create a new persistent stream with LLM-generated content
router.post('/create', async (c) => {
	if (!c.var.stream) {
		return c.json({ error: 'Stream service not available' }, 500);
	}

	// Auto-rotate: if at limit, delete the oldest stream
	const existing = await c.var.stream.list({
		name: STREAM_NAME,
		limit: MAX_STREAMS,
	});
	if (existing.total >= MAX_STREAMS && existing.streams.length > 0) {
		// Find oldest by startTime metadata
		const oldest = existing.streams.reduce((min, curr) =>
			(curr.metadata?.startTime || '') < (min.metadata?.startTime || '') ? curr : min
		);

		await c.var.stream.delete(oldest.id);
		c.var.logger?.info('Auto-rotated oldest stream', { deletedId: oldest.id });
	}

	c.var.logger?.info('Creating persistent stream with LLM summary');

	// Create the stream
	const stream = await c.var.stream.create(STREAM_NAME, {
		contentType: 'text/plain',
		metadata: {
			type: 'ai-summary',
			model: 'llama-3.3-70b-versatile',
			startTime: new Date().toISOString(),
		},
	});

	c.var.logger?.info('Stream created', {
		streamId: stream.id,
		streamUrl: stream.url,
	});

	// Stream LLM output in background (fire-and-forget)
	const generateInBackground = async () => {
		try {
			const { textStream } = streamText({
				model: getModel('llama-3.3-70b-versatile'),
				prompt: PROMPT,
			});

			for await (const chunk of textStream) {
				await stream.write(chunk);
			}

			c.var.logger?.info('LLM summary complete', {
				streamId: stream.id,
				bytesWritten: stream.bytesWritten,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			c.var.logger?.error('LLM streaming error', { error: message });
			await stream.write(`\n\nError: ${message}`);
		} finally {
			await stream.close();
		}
	};

	// Start generation in background
	c.executionCtx?.waitUntil(generateInBackground());

	// Return immediately - URL will return content once stream is closed
	return c.json({
		streamId: stream.id,
		streamUrl: stream.url,
		status: 'generating',
		message:
			'Generating AI summary in background. The URL will return the content once generation completes.',
	});
});

// List all summary streams
router.get('/list', async (c) => {
	if (!c.var.stream) {
		return c.json({ error: 'Stream service not available' }, 500);
	}

	const result = await c.var.stream.list({ name: STREAM_NAME, limit: 10 });

	return c.json({
		total: result.total,
		streams: result.streams.map((s) => ({
			id: s.id,
			name: s.name,
			url: s.url,
			sizeBytes: s.sizeBytes,
			metadata: s.metadata,
		})),
	});
});

// Get stream progress by ID
router.get('/progress/:id', async (c) => {
	if (!c.var.stream) {
		return c.json({ error: 'Stream service not available' }, 500);
	}

	const id = c.req.param('id');

	try {
		const info = await c.var.stream.get(id);
		return c.json({
			id: info.id,
			url: info.url,
			bytesWritten: info.sizeBytes,
		});
	} catch {
		return c.json({ error: 'Stream not found' }, 404);
	}
});

export default router;
