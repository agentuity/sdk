import { createApp } from '@agentuity/runtime';

if (!process.env.AGENTUITY_SDK_KEY) {
	console.error('missing AGENTUITY_SDK_KEY');
	process.exit(1);
}

// Mock test data for lifecycle validation
const testData = {
	initialized: false,
	timestamp: 0,
};

const app = await createApp({
	setup: async () => {
		console.log('🚀 App setup: Initializing test data...');
		testData.initialized = true;
		testData.timestamp = Date.now();

		// Return app state that will be available everywhere
		return {
			appName: 'auth-app',
			version: '1.0.0',
			startedAt: new Date(),
			config: {
				maxConnections: 100,
				timeout: 5000,
			},
		};
	},
	shutdown: async (state) => {
		console.log('🛑 App shutdown: Cleaning up...');
		console.log('   - App name:', state.appName);
		console.log('   - Started at:', state.startedAt);
		console.log('   - Ran for:', Date.now() - state.startedAt.getTime(), 'ms');
		testData.initialized = false;
	},
});

// Add app-level event listeners for testing
app.addEventListener('agent.started', (_event, agent, ctx) => {
	app.logger.info('APP EVENT: agent %s started (session: %s)', agent.metadata.name, ctx.sessionId);
});

app.addEventListener('agent.completed', (_event, agent, ctx) => {
	app.logger.info(
		'APP EVENT: agent %s completed (session: %s)',
		agent.metadata.name,
		ctx.sessionId
	);
});

app.addEventListener('agent.errored', (_event, agent, ctx, error) => {
	app.logger.error(
		'APP EVENT: agent %s errored (session: %s): %s',
		agent.metadata.name,
		ctx.sessionId,
		error.message
	);
});

app.addEventListener('thread.created', (_name, thread) => {
	app.logger.info('APP EVENT: thread %s created', thread.id);
});

app.addEventListener('thread.destroyed', (_name, thread) => {
	app.logger.info('APP EVENT: thread %s destroyed', thread.id);
});

app.addEventListener('session.started', (_name, session) => {
	app.logger.info('APP EVENT: session %s started', session.id);
});

app.addEventListener('session.completed', (_name, session) => {
	app.logger.info('APP EVENT: session %s completed', session.id);
});

app.logger.debug('Running %s', app.server.url);
