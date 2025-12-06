/**
 * Test execution API route with SSE streaming
 *
 * GET /api/test/run?suite=<name>&test=<name>&concurrency=<number>
 *
 * Streams test results as Server-Sent Events:
 * - event: start - Test execution started
 * - event: progress - Individual test result
 * - event: complete - Final summary
 */

import { createRouter } from '@agentuity/runtime';
import { testSuite, type TestResult } from '../test/suite';

const router = createRouter();

interface SSEEvent {
	type: 'start' | 'progress' | 'complete' | 'error';
	test?: string;
	passed?: boolean;
	error?: string;
	stack?: string;
	duration?: number;
	summary?: {
		total: number;
		passed: number;
		failed: number;
		duration: number;
	};
}

/**
 * Format an SSE event
 */
function formatSSE(event: string, data: SSEEvent): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Test execution endpoint with SSE streaming
 */
router.get('/api/test/run', async (c) => {
	const suite = c.req.query('suite');
	const test = c.req.query('test');
	const concurrencyStr = c.req.query('concurrency');
	const concurrency = concurrencyStr ? parseInt(concurrencyStr, 10) : 10;

	// Get matching tests
	const tests = testSuite.getTests(suite, test);

	if (tests.length === 0) {
		return c.json(
			{
				error: 'No tests found matching criteria',
				suite,
				test,
			},
			404
		);
	}

	// Create SSE stream
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send start event
			const startEvent: SSEEvent = {
				type: 'start',
				summary: {
					total: tests.length,
					passed: 0,
					failed: 0,
					duration: 0,
				},
			};
			controller.enqueue(encoder.encode(formatSSE('start', startEvent)));

			let passed = 0;
			let failed = 0;
			let totalDuration = 0;

			// Run tests in batches with concurrency limit
			for (let i = 0; i < tests.length; i += concurrency) {
				const batch = tests.slice(i, i + concurrency);
				const results = await Promise.allSettled(batch.map((t) => testSuite.runTest(t)));

				// Stream each result as it completes
				for (const result of results) {
					let testResult: TestResult;

					if (result.status === 'fulfilled') {
						testResult = result.value;
					} else {
						// Handle unexpected promise rejection
						testResult = {
							name: 'unknown',
							passed: false,
							error: String(result.reason),
							duration: 0,
						};
					}

					// Update counters
					if (testResult.passed) {
						passed++;
					} else {
						failed++;
					}
					totalDuration += testResult.duration;

					// Send progress event
					const progressEvent: SSEEvent = {
						type: 'progress',
						test: testResult.name,
						passed: testResult.passed,
						error: testResult.error,
						stack: testResult.stack,
						duration: testResult.duration,
					};
					controller.enqueue(encoder.encode(formatSSE('progress', progressEvent)));
				}
			}

			// Send complete event with summary
			const completeEvent: SSEEvent = {
				type: 'complete',
				summary: {
					total: tests.length,
					passed,
					failed,
					duration: totalDuration,
				},
			};
			controller.enqueue(encoder.encode(formatSSE('complete', completeEvent)));

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

/**
 * List available test suites
 */
router.get('/api/test/suites', (c) => {
	const suites = testSuite.getSuites();
	return c.json({ suites });
});

/**
 * List all tests
 */
router.get('/api/test/list', (c) => {
	const suite = c.req.query('suite');
	const tests = testSuite.getTests(suite);

	return c.json({
		total: tests.length,
		tests: tests.map((t) => ({
			suite: t.suite,
			name: t.name,
		})),
	});
});

/**
 * Health check endpoint
 */
router.get('/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
