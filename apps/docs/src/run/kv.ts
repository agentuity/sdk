/**
 * Standalone run script for KV Storage demo
 *
 * NOTE: Intentionally separate from src/agent/kv/agent.ts.
 * Uses "explorer-sandbox" bucket with cleanup (delete) operations.
 * See src/run/AGENTS.md for architecture details.
 *
 * Shows direct SDK calls: set → get → delete
 * Uses unique keys per run for isolation
 *
 * Usage: bun run src/run/kv.ts '{}'
 */
import { createAgentContext } from '@agentuity/runtime';

const ctx = createAgentContext();

// Unique key prefix for this run (isolation)
const runId = Date.now().toString(36);
const bucket = 'explorer-sandbox';
const key = `${runId}:session-001`;

// Sample session data to store
const sessionData = {
	visitorId: 'visitor-abc123',
	lastActive: new Date().toISOString(),
	preferences: { theme: 'dark' },
};

try {
	ctx.logger.info('Setting key');

	// SET - store data with TTL
	await ctx.kv.set(bucket, key, sessionData, { ttl: 300 });

	ctx.logger.info('Getting key');

	// GET - retrieve data
	const result = await ctx.kv.get(bucket, key);

	// DELETE - cleanup (before OUTPUT so it shows in logs)
	await ctx.kv.delete(bucket, key);
	ctx.logger.info('Deleted key');

	console.log('---OUTPUT---');
	console.log(`Set: "${key}"`);
	console.log(`  visitorId: "${sessionData.visitorId}"`);
	console.log(`  theme: "${sessionData.preferences.theme}"`);
	console.log(`Get: ${result.exists ? 'found' : 'not found'}`);
	console.log(`Deleted: "${key}"`);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
