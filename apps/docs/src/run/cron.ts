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
const bucket = 'explorer-cron';

try {
	ctx.logger.info('Hourly task running');

	console.log('---OUTPUT---');
	console.log('=== Hourly Cron Job (Simulated) ===');
	console.log(`Triggered at: ${new Date().toISOString()}`);
	console.log('');

	// Simulate fetching data from api.example.com/data
	console.log('Fetching data from api.example.com/data...');
	const data = {
		lastUpdate: new Date().toISOString(),
		recordCount: Math.floor(Math.random() * 1000) + 100,
		source: 'api.example.com',
	};
	console.log(`  Fetched ${data.recordCount} records from ${data.source}`);
	console.log('');

	// Cache the result
	console.log(`Caching to kv "${bucket}/latest" (TTL: 3600s)...`);
	await ctx.kv.set(bucket, 'latest', data, { ttl: 3600 });
	console.log('  Cached successfully');
	console.log('');

	// Verify the cache
	const cached = await ctx.kv.get(bucket, 'latest');
	if (cached.exists) {
		const verified = cached.data as typeof data;
		console.log(`Cache verified: ${verified.recordCount} records from ${verified.source}`);
	} else {
		console.log('Cache verification failed!');
	}
	console.log('');

	console.log(`{ success: true, timestamp: "${new Date().toISOString()}" }`);
	console.log('');

	// Cleanup (sandbox hygiene)
	await ctx.kv.delete(bucket, 'latest');
	console.log(`Cleaned up kv "${bucket}/latest"`);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
