import { createRouter } from '@agentuity/runtime';
import agent from './agent';

const router = createRouter();

router.get('/', async (c) => {
	const text = await c.agent.events.run();
	return c.text(text);
});

// Test route for error handling with failing listener
router.get('/test-error-listener', async (c) => {
	try {
		// This will fail and trigger the errored event
		await c.agent.events.run();
	} catch (error: unknown) {
		// Check if it's an AggregateError (both handler and listener failed)
		if (error instanceof AggregateError) {
			return c.json({
				type: 'AggregateError',
				message: error.message,
				errorCount: error.errors.length,
				errors: error.errors.map((e: Error) => e.message),
			});
		}
		const _error = error as Error;
		// Single error (either handler or listener succeeded)
		return c.json({
			type: _error.constructor.name,
			message: _error.message,
		});
	}
});

agent.addEventListener('started', (event, agent, ctx) => {
	console.log('agent %s fired %s event', agent.metadata.name, event);
	// Store the start time in state
	ctx.state.set('startTime', Date.now());
	ctx.state.set('eventCount', 0);
});

agent.addEventListener('completed', (event, agent, ctx) => {
	console.log('agent %s fired %s event', agent.metadata.name, event);

	// Access state from started event
	const startTime = ctx.state.get('startTime') as number;
	const duration = Date.now() - startTime;
	console.log('agent %s completed in %dms', agent.metadata.name, duration);

	// Increment event count
	const count = (ctx.state.get('eventCount') as number) + 1;
	ctx.state.set('eventCount', count);
	console.log('total events fired: %d', count);
});

agent.addEventListener('errored', (event, agent, ctx, error) => {
	console.log('agent %s fired %s event: %s', agent.metadata.name, event, error.message);

	// Check if we have state from started event
	if (ctx.state.has('startTime')) {
		const startTime = ctx.state.get('startTime') as number;
		const duration = Date.now() - startTime;
		console.log('agent %s failed after %dms', agent.metadata.name, duration);
	}
});

export default router;
