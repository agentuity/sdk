import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

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

const workbench = createWorkbench();
const app = await createApp({
	services: {
		workbench,
	},
});

// Log server URL for debugging
console.log(`[TEST-SUITE] Server started: ${app.server.url}`);

export default app;
