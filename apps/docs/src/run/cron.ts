/**
 * Standalone run script for Cron demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Simulating a cron job trigger
 * In the real world, cron jobs are triggered by the platform on schedule.
 * This simulates what happens when a cron job runs.
 *
 * Usage: bun run src/run/cron.ts '{}'
 */
import { createAgentContext } from '@agentuity/runtime';

const ctx = createAgentContext();
const bucket = 'v1-ks-cron';

try {
	ctx.logger.info('Hourly task running');

	console.log('---OUTPUT---');
	console.log('=== Hourly Data Sync (Simulated) ===');
	console.log(`Triggered at: ${new Date().toISOString()}`);
	console.log('');

	// Simulate fetching external data
	console.log('Step 1: Fetching external data...');
	const mockData = {
		lastUpdate: new Date().toISOString(),
		recordCount: Math.floor(Math.random() * 1000) + 100,
		source: 'api.example.com',
	};
	console.log(`  Fetched ${mockData.recordCount} records from ${mockData.source}`);
	console.log('');

	// Cache the result in KV storage
	console.log('Step 2: Caching in KV storage...');
	await ctx.kv.set(bucket, 'latest-sync', mockData, { ttl: 3600 });
	console.log(`  Cached to "${bucket}/latest-sync" (TTL: 1 hour)`);
	console.log('');

	// Verify the cache
	const cached = await ctx.kv.get(bucket, 'latest-sync');
	console.log('Step 3: Verifying cache...');
	if (cached.exists) {
		const data = cached.data as typeof mockData;
		console.log(`  Cache verified: ${data.recordCount} records`);
	} else {
		console.log('  Cache verification failed!');
	}
	console.log('');

	// Cleanup (demo only - real cron jobs would keep the cache)
	console.log('Step 4: Cleaning up (demo only)...');
	await ctx.kv.delete(bucket, 'latest-sync');
	console.log(`  Deleted "${bucket}/latest-sync"`);
	console.log('');

	console.log('Cron job completed successfully');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
