import { createRouter } from '@agentuity/runtime';
import { testSuite } from '../test/suite';
import statePersistenceAgent from '@agents/state/agent';
import stateReaderAgent from '@agents/state/reader-agent';
import stateWriterAgent from '@agents/state/writer-agent';

const router = createRouter();

// Test execution endpoint with SSE streaming
router.get('/test/run', async (c) => {
	const suite = c.req.query('suite');
	const test = c.req.query('test');
	const concurrencyStr = c.req.query('concurrency');
	const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 10;

	const tests = testSuite.getTests(suite, test);

	if (tests.length === 0) {
		return c.json({ error: 'No tests found', suite, test }, 404);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const write = (event: string, data: any) => {
				const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			write('start', { type: 'start', total: tests.length });

			let passed = 0;
			let failed = 0;
			let totalDuration = 0;

			for (let i = 0; i < tests.length; i += concurrency) {
				const batch = tests.slice(i, i + concurrency);
				const results = await Promise.allSettled(batch.map((t) => testSuite.runTest(t)));

				for (const result of results) {
					const testResult =
						result.status === 'fulfilled'
							? result.value
							: {
									name: 'unknown',
									passed: false,
									error: String(result.reason),
									duration: 0,
								};

					if (testResult.passed) passed++;
					else failed++;
					totalDuration += testResult.duration;

					write('progress', {
						type: 'progress',
						test: testResult.name,
						passed: testResult.passed,
						error: testResult.error,
						stack: testResult.stack,
						duration: testResult.duration,
					});
				}
			}

			write('complete', {
				type: 'complete',
				summary: { total: tests.length, passed, failed, duration: totalDuration },
			});

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
});

router.get('/test/suites', (c) => {
	return c.json({ suites: testSuite.getSuites() });
});

router.get('/test/list', (c) => {
	const suite = c.req.query('suite');
	const tests = testSuite.getTests(suite);

	// Group tests by suite
	const grouped = new Map<string, { name: string }[]>();
	for (const t of tests) {
		if (!grouped.has(t.suite)) {
			grouped.set(t.suite, []);
		}
		grouped.get(t.suite)!.push({ name: t.name });
	}

	const suites = Array.from(grouped.entries()).map(([suiteName, suiteTests]) => ({
		name: suiteName,
		tests: suiteTests,
		count: suiteTests.length,
	}));

	return c.json({
		total: tests.length,
		suites,
	});
});

router.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// State persistence agent endpoints for HTTP tests
router.post('/agent/state', statePersistenceAgent.validator(), async (c) => {
	const input = c.req.valid('json');
	const result = await statePersistenceAgent.run(input);
	return c.json(result);
});

router.post('/agent/state-reader', stateReaderAgent.validator(), async (c) => {
	const input = c.req.valid('json');
	const result = await stateReaderAgent.run(input);
	return c.json(result);
});

router.post('/agent/state-writer', stateWriterAgent.validator(), async (c) => {
	const input = c.req.valid('json');
	const result = await stateWriterAgent.run(input);
	return c.json(result);
});

// WebSocket routes for testing
router.websocket('/ws/echo', (c) => (ws) => {
	// Echo back any message received
	ws.onMessage((event) => {
		ws.send(event.data);
	});
});

// Shared broadcast clients list
// Note: This is intentionally module-level for broadcast functionality
// Tests close connections which removes them from the list
const broadcastClients: any[] = [];

router.websocket('/ws/broadcast', (c) => (ws) => {
	broadcastClients.push(ws);

	ws.onMessage((event) => {
		for (const client of broadcastClients) {
			try {
				client.send(event.data);
			} catch (error) {
				// Ignore errors sending to closed connections
			}
		}
	});

	ws.onClose(() => {
		const index = broadcastClients.indexOf(ws);
		if (index > -1) {
			broadcastClients.splice(index, 1);
		}
	});
});

router.websocket('/ws/counter', (c) => {
	let count = 0;

	return (ws) => {
		ws.onOpen(() => {
			ws.send(JSON.stringify({ type: 'count', value: count }));
		});

		ws.onMessage((event) => {
			try {
				const data = JSON.parse(event.data as string);

				if (data.action === 'increment') {
					count++;
					ws.send(JSON.stringify({ type: 'count', value: count }));
				} else if (data.action === 'decrement') {
					count--;
					ws.send(JSON.stringify({ type: 'count', value: count }));
				} else if (data.action === 'reset') {
					count = 0;
					ws.send(JSON.stringify({ type: 'count', value: count }));
				}
			} catch (error) {
				// Ignore malformed JSON messages
				console.error('Invalid JSON in WebSocket message:', error);
			}
		});
	};
});

// SSE (Server-Sent Events) routes for testing
router.sse('/sse/simple', (c) => async (stream) => {
	// Send a few simple messages
	stream.writeSSE({ data: 'Message 1' });
	await new Promise((resolve) => setTimeout(resolve, 10));
	stream.writeSSE({ data: 'Message 2' });
	await new Promise((resolve) => setTimeout(resolve, 10));
	stream.writeSSE({ data: 'Message 3' });
});

router.sse('/sse/events', (c) => async (stream) => {
	// Send events with event types
	stream.writeSSE({ event: 'start', data: JSON.stringify({ timestamp: Date.now() }) });
	await new Promise((resolve) => setTimeout(resolve, 10));
	stream.writeSSE({ event: 'update', data: JSON.stringify({ progress: 50 }) });
	await new Promise((resolve) => setTimeout(resolve, 10));
	stream.writeSSE({ event: 'complete', data: JSON.stringify({ status: 'done' }) });
});

router.sse('/sse/counter', (c) => async (stream) => {
	let count = parseInt(c.req.query('count') || '5', 10);
	let delay = parseInt(c.req.query('delay') || '50', 10);

	// Validate and sanitize count
	if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
		count = 5; // Default
	}
	if (count > 1000) count = 1000; // Cap at 1000

	// Validate and sanitize delay
	if (!Number.isFinite(delay) || !Number.isInteger(delay) || delay < 0) {
		delay = 50; // Default
	}
	if (delay > 5000) delay = 5000; // Cap at 5 seconds

	for (let i = 0; i < count; i++) {
		stream.writeSSE({ data: JSON.stringify({ count: i, timestamp: Date.now() }) });
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
});

router.sse('/sse/long-lived', (c) => async (stream) => {
	let duration = parseInt(c.req.query('duration') || '2000', 10);

	// Validate and sanitize duration
	if (Number.isNaN(duration) || !Number.isFinite(duration) || duration < 0) {
		duration = 2000; // Default to 2 seconds
	}
	if (duration > 30000) duration = 30000; // Cap at 30 seconds

	const interval = 100;
	const startTime = Date.now();

	while (Date.now() - startTime < duration) {
		stream.writeSSE({
			data: JSON.stringify({
				elapsed: Date.now() - startTime,
				message: 'Still alive',
			}),
		});
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	stream.writeSSE({ event: 'done', data: 'Completed' });
});

router.sse('/sse/abort-test', (c) => async (stream) => {
	let aborted = false;

	stream.onAbort(() => {
		aborted = true;
	});

	for (let i = 0; i < 100; i++) {
		if (aborted) {
			break;
		}
		stream.writeSSE({ data: `Message ${i}` });
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
});

export default router;
