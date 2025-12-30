import { createApp } from '@agentuity/runtime';
import { InMemoryThreadProvider } from './src/test/helpers/thread-provider';
import { testSessionEventProvider } from './src/test/helpers/session-event-provider';
import {
	mockDatabaseMiddleware,
	mockAuthMiddleware,
	analyticsMiddleware,
} from './src/lib/custom-middleware';

// Import test files to register tests
import './src/test/basic-agents';
import './src/test/agent-nested';
import './src/test/routing-agents';
import './src/test/routing-subdirs';
import './src/test/storage-kv';
import './src/test/storage-stream';
import './src/test/storage-vector';
import './src/test/session-basic';
import './src/test/lifecycle-waituntil';
import './src/test/errors';
import './src/test/schema-validation';
import './src/test/events';
import './src/test/resilience';
import './src/test/storage-binary';
import './src/test/http-state-persistence';
import './src/test/cli-deployment';
import './src/test/cli-apikey';
import './src/test/cli-vector';
import './src/test/websocket';
import './src/test/sse';
import './src/test/web-rendering';
import './src/test/env-loading';
import './src/test/middleware-patterns';
import './src/test/evals';
import './src/test/ai-sdk-gateway';
import './src/test/session-agent-ids';

const threadProvider = new InMemoryThreadProvider();

const app = await createApp({
	setup: () => {
		return { foo: 'bar' };
	},
	services: {
		thread: threadProvider,
		sessionEvent: testSessionEventProvider,
	},
});

// Add app-level middleware (applies to ALL routes)
// This demonstrates the pattern of adding middleware in app.ts
app.router.use('/api/*', mockAuthMiddleware());
app.router.use('/api/*', analyticsMiddleware());
app.router.use('/api/*', async (c, next) => {
	c.set('appLevelData', 'set-in-app-ts');
	await next();
});

// Log server URL for debugging
console.log(`[TEST-SUITE] Server started: ${app.server.url}`);
console.log(`[TEST-SUITE] Profile: ${process.env.AGENTUITY_PROFILE || 'default'}`);
console.log(`[TEST-SUITE] Region: ${process.env.AGENTUITY_REGION || 'default'}`);

export default app;
