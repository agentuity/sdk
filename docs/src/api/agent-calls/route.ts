/**
 * Agent Calls Route - Demonstrates ways to call focused model-backed code.
 *
 * GET  /         - Info about available patterns
 * POST /sync     - Direct call (waits for response)
 * POST /background - Fire-and-forget with waitUntil()
 * POST /chain    - Sequential calls (output flows to next input)
 * POST /process  - Direct call with validation
 */
import type { ApiEnv } from '../context';
import { waitUntil } from '../http';
import textProcessor from '../../agent/text-processor/agent';
import { Hono } from 'hono';

const AGENT_CALLS_SAMPLE_TEXT = 'Hello!!!   from the ***SDK Explorer***...  #demo @test';

const router = new Hono<ApiEnv>()
	.get('/', (c) => {
		return c.json({
			name: 'Agent Calls Demo',
			description: 'Demonstrates direct, background, and chained call shapes',
			patterns: [
				{ name: 'sync', description: 'Direct call - wait for response' },
				{
					name: 'background',
					description: 'Fire-and-forget with waitUntil()',
				},
				{ name: 'chain', description: 'Chain focused steps together' },
			],
			sampleText: AGENT_CALLS_SAMPLE_TEXT,
		});
	})

	.post('/sync', async (c) => {
		let body: { operation?: 'clean' | 'analyze' };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body' }, 400);
		}
		const { operation = 'clean' } = body;

		c.var.logger?.info('Direct call starting', { operation });
		const startTime = Date.now();

		const result = await textProcessor.run({
			text: AGENT_CALLS_SAMPLE_TEXT,
			operation,
		});

		const duration = Date.now() - startTime;
		c.var.logger?.info('Direct call completed', { duration });

		return c.json({
			pattern: 'sync',
			description: 'Waited for the text processor to complete',
			duration: `${duration}ms`,
			result,
		});
	})

	.post('/background', async (c) => {
		let body: { operation?: 'clean' | 'analyze' };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body' }, 400);
		}
		const { operation = 'clean' } = body;

		const taskId = crypto.randomUUID().slice(0, 8);
		c.var.logger?.info('Background call starting', { taskId, operation });

		// waitUntil lets the response return while the focused work continues.
		waitUntil(
			c,
			(async () => {
				const result = await textProcessor.run({
					text: AGENT_CALLS_SAMPLE_TEXT,
					operation,
				});
				c.var.logger?.info('Background task completed', {
					taskId,
					result: result.result,
				});
			})()
		);

		return c.json({
			pattern: 'background',
			description: 'Response returned immediately while work continued in the background',
			taskId,
			note: 'Check server logs to see when background task completes',
		});
	})

	.post('/chain', async (c) => {
		c.var.logger?.info('Chained calls starting');
		const startTime = Date.now();
		const steps: { step: number; operation: string; result: string }[] = [];

		const step1 = await textProcessor.run({
			text: AGENT_CALLS_SAMPLE_TEXT,
			operation: 'clean',
		});
		steps.push({ step: 1, operation: 'clean', result: step1.result });

		const step2 = await textProcessor.run({
			text: step1.result,
			operation: 'analyze',
		});
		steps.push({ step: 2, operation: 'analyze', result: step2.result });

		const duration = Date.now() - startTime;
		c.var.logger?.info('Chained calls completed', { duration, steps: 2 });

		return c.json({
			pattern: 'chain',
			description: 'Sequential calls - output flows to next input',
			duration: `${duration}ms`,
			original: AGENT_CALLS_SAMPLE_TEXT,
			steps,
			final: step2.result,
		});
	})

	.post('/process', async (c) => {
		const data = await c.req.json();
		const result = await textProcessor.run(data);
		return c.json(result);
	});

export default router;
