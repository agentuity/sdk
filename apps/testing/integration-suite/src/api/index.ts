import { createRouter } from '@agentuity/runtime';
import { testSuite } from '../test/suite';
import statePersistenceAgent from '../agent/state/agent';

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

// State persistence agent endpoint for HTTP tests
router.post('/agent/state', statePersistenceAgent.validator(), async (c) => {
	const input = c.req.valid('json');
	const result = await statePersistenceAgent.run(input);
	return c.json(result);
});

export default router;
