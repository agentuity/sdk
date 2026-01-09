/**
 * Agent Calls Route - Demonstrates different agent invocation patterns.
 *
 * GET  /         - Info about available patterns
 * POST /sync     - Synchronous agent call (waits for response)
 * POST /background - Fire-and-forget with waitUntil()
 * POST /chain    - Sequential agent calls (output flows to next input)
 * POST /process  - Direct agent call with validation
 */
import { createRouter } from '@agentuity/runtime';
import textProcessorAgent from '../../agent/text-processor/agent';

const router = createRouter();

const AGENT_CALLS_SAMPLE_TEXT = 'Hello!!!   from the ***SDK Explorer***...  #demo @test';

router.get('/', (c) => {
	return c.json({
		name: 'Agent Calls Demo',
		description: 'Demonstrates agent invocation patterns (sync, background, chain)',
		patterns: [
			{ name: 'sync', description: 'Synchronous call - wait for response' },
			{
				name: 'background',
				description: 'Fire-and-forget with waitUntil()',
			},
			{ name: 'chain', description: 'Chain multiple agent calls' },
		],
		sampleText: AGENT_CALLS_SAMPLE_TEXT,
	});
});

router.post('/sync', async (c) => {
	const body = await c.req.json();
	const { operation = 'clean' } = body as { operation?: 'clean' | 'analyze' };

	c.var.logger?.info('Sync agent call starting', { operation });
	const startTime = Date.now();

	const result = await textProcessorAgent.run({
		text: AGENT_CALLS_SAMPLE_TEXT,
		operation,
	});

	const duration = Date.now() - startTime;
	c.var.logger?.info('Sync agent call completed', { duration });

	return c.json({
		pattern: 'sync',
		description: 'Waited for text-processor agent to complete',
		duration: `${duration}ms`,
		result,
	});
});

router.post('/background', async (c) => {
	const body = await c.req.json();
	const { operation = 'clean' } = body as { operation?: 'clean' | 'analyze' };

	const taskId = crypto.randomUUID().slice(0, 8);
	c.var.logger?.info('Background agent call starting', { taskId, operation });

	// waitUntil() allows response to return immediately while agent runs in background
	c.executionCtx?.waitUntil(
		(async () => {
			const result = await textProcessorAgent.run({
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
		description: 'Response returned immediately, agent runs in background',
		taskId,
		note: 'Check server logs to see when background task completes',
	});
});

router.post('/chain', async (c) => {
	c.var.logger?.info('Chain agent calls starting');
	const startTime = Date.now();
	const steps: { step: number; operation: string; result: string }[] = [];

	const step1 = await textProcessorAgent.run({
		text: AGENT_CALLS_SAMPLE_TEXT,
		operation: 'clean',
	});
	steps.push({ step: 1, operation: 'clean', result: step1.result });

	const step2 = await textProcessorAgent.run({
		text: step1.result,
		operation: 'analyze',
	});
	steps.push({ step: 2, operation: 'analyze', result: step2.result });

	const duration = Date.now() - startTime;
	c.var.logger?.info('Chain agent calls completed', { duration, steps: 2 });

	return c.json({
		pattern: 'chain',
		description: 'Sequential calls - output flows to next input',
		duration: `${duration}ms`,
		original: AGENT_CALLS_SAMPLE_TEXT,
		steps,
		final: step2.result,
	});
});

// validator() auto-validates request body against agent's input schema
router.post('/process', textProcessorAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await textProcessorAgent.run(data);
	return c.json(result);
});

export default router;
