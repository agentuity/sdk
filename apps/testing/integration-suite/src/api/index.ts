import { createRouter, websocket, sse, type WebSocketConnection } from '@agentuity/runtime';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { testSuite } from '../test/suite';
import statePersistenceAgent from '@agents/state/agent';
import stateReaderAgent from '@agents/state/reader-agent';
import stateWriterAgent from '@agents/state/writer-agent';
import { mockDatabaseMiddleware } from '../lib/custom-middleware';

const router = createRouter();

// Add API-level middleware (applies to all routes under /api)
// This demonstrates the pattern from ops-center where middleware is in api/index.ts
router.use('*', mockDatabaseMiddleware('clickhouse'));
router.use('*', mockDatabaseMiddleware('postgres'));
router.use('*', async (c, next) => {
	c.set('apiLevelData', 'set-in-api-index-ts');
	await next();
});

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
									diagnostics: undefined,
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
						// Include diagnostics for failed tests to help with debugging
						...(testResult.diagnostics && { diagnostics: testResult.diagnostics }),
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
router.get(
	'/ws/echo',
	websocket((c, ws) => {
		// Echo back any message received
		ws.onMessage((event) => {
			ws.send((event as MessageEvent).data);
		});
	})
);

// Shared broadcast clients list
// Note: This is intentionally module-level for broadcast functionality
// Tests close connections which removes them from the list
const broadcastClients: WebSocketConnection[] = [];

router.get(
	'/ws/broadcast',
	websocket((c, ws) => {
		broadcastClients.push(ws);

		ws.onMessage((event) => {
			for (const client of broadcastClients) {
				try {
					client.send((event as MessageEvent).data);
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
	})
);

router.get(
	'/ws/counter',
	websocket((c, ws) => {
		let count = 0;

		ws.onOpen(() => {
			ws.send(JSON.stringify({ type: 'count', value: count }));
		});

		ws.onMessage((event) => {
			try {
				const data = JSON.parse((event as MessageEvent).data as string);

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
				c.var.logger?.error('Invalid JSON in WebSocket message:', error);
			}
		});
	})
);

// SSE (Server-Sent Events) routes for testing
router.get(
	'/sse/simple',
	sse(async (c, stream) => {
		// Send a few simple messages
		stream.writeSSE({ data: 'Message 1' });
		await new Promise((resolve) => setTimeout(resolve, 10));
		stream.writeSSE({ data: 'Message 2' });
		await new Promise((resolve) => setTimeout(resolve, 10));
		stream.writeSSE({ data: 'Message 3' });
	})
);

router.get(
	'/sse/events',
	sse(async (c, stream) => {
		// Send events with event types
		stream.writeSSE({ event: 'start', data: JSON.stringify({ timestamp: Date.now() }) });
		await new Promise((resolve) => setTimeout(resolve, 10));
		stream.writeSSE({ event: 'update', data: JSON.stringify({ progress: 50 }) });
		await new Promise((resolve) => setTimeout(resolve, 10));
		stream.writeSSE({ event: 'complete', data: JSON.stringify({ status: 'done' }) });
	})
);

router.get(
	'/sse/counter',
	sse(async (c, stream) => {
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
	})
);

router.get(
	'/sse/long-lived',
	sse(async (c, stream) => {
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
	})
);

router.get(
	'/sse/abort-test',
	sse(async (c, stream) => {
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
	})
);

// Test: SSE with async operations that consume ReadableStreams internally
// This tests the fix for https://github.com/agentuity/sdk/issues/471
// AI SDK's generateText/generateObject use fetch() internally which returns
// a Response with a ReadableStream body. This test simulates that pattern.
router.get(
	'/sse/async-fetch',
	sse(async (c, stream) => {
		// Simulate what AI SDK's generateText does:
		// 1. Make a fetch request (simulated with ReadableStream)
		// 2. Consume the stream to get the result
		// 3. Write result to SSE stream
		const simulateFetch = async (): Promise<string> => {
			// Create a ReadableStream (simulating fetch response body)
			const responseStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('simulated-ai-response'));
					controller.close();
				},
			});

			// Consume the stream (simulating .text() on fetch response)
			const reader = responseStream.getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}

			// Decode and return
			const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
			let offset = 0;
			for (const chunk of chunks) {
				combined.set(chunk, offset);
				offset += chunk.length;
			}
			return new TextDecoder().decode(combined);
		};

		// This should NOT throw "ReadableStream has already been used"
		const result1 = await simulateFetch();
		stream.writeSSE({ event: 'fetch-result', data: result1 });

		// Do it again to verify multiple async stream operations work
		const result2 = await simulateFetch();
		stream.writeSSE({ event: 'fetch-result', data: result2 });

		stream.writeSSE({ event: 'complete', data: 'done' });
	})
);

// Test: SSE with error handling
// Verifies that errors in async handlers don't crash the server
router.get(
	'/sse/error-handling',
	sse(async (c, stream) => {
		// Write initial message before error
		stream.writeSSE({ event: 'start', data: 'starting' });
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Simulate an error that should be handled gracefully
		const shouldError = c.req.query('error') === 'true';
		if (shouldError) {
			throw new Error('Intentional test error');
		}

		stream.writeSSE({ event: 'complete', data: 'done' });
	})
);

// Test: SSE with real AI SDK generateText calls
// This tests the fix for https://github.com/agentuity/sdk/issues/471
// Previously, generateText/generateObject failed with "ReadableStream has already been used"
// when called inside SSE handlers due to a Bun bug with OTEL-instrumented fetch.
router.get(
	'/sse/generate-text',
	sse(async (c, stream) => {
		stream.writeSSE({ event: 'start', data: 'starting AI SDK test' });

		// Check if we have an API key - if not, skip the actual AI call
		const hasApiKey = !!process.env.OPENAI_API_KEY;

		if (!hasApiKey) {
			// Fallback: make real HTTP fetch calls to simulate what AI SDK does internally
			// This still tests the core fix (OTEL-instrumented fetch in streaming context)
			for (let i = 0; i < 3; i++) {
				try {
					const response = await fetch('https://httpbin.org/post', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ index: i, test: 'sse-generate-text' }),
					});
					const data = await response.json();
					stream.writeSSE({
						event: 'result',
						data: JSON.stringify({ index: i, success: true, origin: data.origin }),
					});
				} catch (error) {
					stream.writeSSE({
						event: 'error',
						data: JSON.stringify({
							index: i,
							error: error instanceof Error ? error.message : 'Unknown error',
						}),
					});
				}
			}
			stream.writeSSE({ event: 'complete', data: 'done (simulated - no API key)' });
			return;
		}

		// If we have an API key, use actual generateText
		const openai = createOpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});

		try {
			// First generateText call
			const result1 = await generateText({
				model: openai('gpt-4o-mini'),
				prompt: 'Say "test1" and nothing else',
				maxOutputTokens: 10,
			});
			stream.writeSSE({ event: 'result', data: JSON.stringify({ call: 1, text: result1.text }) });

			// Second generateText call (sequential - also failed before the fix)
			const result2 = await generateText({
				model: openai('gpt-4o-mini'),
				prompt: 'Say "test2" and nothing else',
				maxOutputTokens: 10,
			});
			stream.writeSSE({ event: 'result', data: JSON.stringify({ call: 2, text: result2.text }) });

			stream.writeSSE({ event: 'complete', data: 'done' });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
		}
	})
);

export default router;
