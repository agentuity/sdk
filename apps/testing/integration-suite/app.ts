import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';
import { bootstrapRuntimeEnv } from '@agentuity/cli';
import { InMemoryThreadProvider } from './src/test/helpers/thread-provider';

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
import './src/test/evals';
import './src/test/events';
import './src/test/resilience';
import './src/test/storage-binary';
import './src/test/http-state-persistence';
import './src/test/cli-deployment';
import './src/test/cli-apikey';
import './src/test/cli-vector';
import './src/test/websocket';
import './src/test/sse';

// Bootstrap runtime environment based on active profile
// This loads .env.{profile} and agentuity.{profile}.json
await bootstrapRuntimeEnv();

const workbench = createWorkbench();
const threadProvider = new InMemoryThreadProvider();

const app = await createApp({
	services: {
		workbench,
		thread: threadProvider,
	},
});

// Log server URL for debugging
console.log(`[TEST-SUITE] Server started: ${app.server.url}`);
console.log(`[TEST-SUITE] Profile: ${process.env.AGENTUITY_PROFILE || 'default'}`);
console.log(`[TEST-SUITE] Region: ${process.env.AGENTUITY_REGION || 'default'}`);

export default app;
