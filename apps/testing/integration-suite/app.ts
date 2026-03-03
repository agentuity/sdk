import { createApp } from '@agentuity/runtime';
import { InMemoryThreadProvider } from './src/test/helpers/thread-provider.ts';
import { testSessionEventProvider } from './src/test/helpers/session-event-provider.ts';
import { mockAuthMiddleware, analyticsMiddleware } from './src/lib/custom-middleware.ts';

// Import test files to register tests
import './src/test/basic-agents.ts';
import './src/test/agent-nested.ts';
import './src/test/routing-agents.ts';
import './src/test/routing-subdirs.ts';
import './src/test/storage-kv.ts';
import './src/test/storage-stream.ts';
import './src/test/storage-vector.ts';
import './src/test/session-basic.ts';
import './src/test/lifecycle-waituntil.ts';
import './src/test/errors.ts';
import './src/test/schema-validation.ts';
import './src/test/events.ts';
import './src/test/resilience.ts';
import './src/test/storage-binary.ts';
import './src/test/http-state-persistence.ts';
import './src/test/cli-deployment.ts';
import './src/test/cli-apikey.ts';
import './src/test/cli-vector.ts';
import './src/test/cli-env-secrets.ts';
import './src/test/cli-org-env-secrets.ts';
import './src/test/websocket.ts';
import './src/test/sse.ts';
import './src/test/web-rendering.ts';
import './src/test/env-loading.ts';
import './src/test/middleware-patterns.ts';
import './src/test/evals.ts';
import './src/test/ai-sdk-gateway.ts';
import './src/test/session-agent-ids.ts';

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
