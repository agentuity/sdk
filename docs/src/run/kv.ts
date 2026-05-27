/**
 * Standalone run script for KV Storage demo
 *
 * Shows the direct service flow: set a value, read it by the same key, then
 * delete the demo record. Unique keys keep concurrent Explorer runs isolated.
 *
 * Usage: bun run src/run/kv.ts '{}'
 */
import { getDemoContext } from '../api/context';

const ctx = getDemoContext();

const runId = Date.now().toString(36);
const bucket = 'explorer-sandbox';
const key = `${runId}:session-001`;

const sessionData = {
	visitorId: 'visitor-abc123',
	lastActive: new Date().toISOString(),
	preferences: { theme: 'dark' },
};

try {
	ctx.logger.info('Setting key');

	// TTL keeps demo data from lingering if cleanup fails.
	await ctx.kv.set(bucket, key, sessionData, { ttl: 300 });

	ctx.logger.info('Getting key');

	const result = await ctx.kv.get(bucket, key);

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
