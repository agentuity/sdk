import { createApp } from '@agentuity/runtime';

// Import test files to register tests
import './src/test/basic-agents';
import './src/test/routing-agents';
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

const app = await createApp();

// Log server URL for debugging
console.log(`[TEST-SUITE] Server started: ${app.server.url}`);

export default app;
