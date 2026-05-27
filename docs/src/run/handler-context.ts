/**
 * Standalone run script for Route Context demo
 *
 * NOTE: This demo is intentionally route-adjacent rather than route-bound.
 * The live Explorer uses Hono request handlers; this script focuses on the
 * same service and logging concepts in a sandbox-friendly shape.
 * See src/run/AGENTS.md for architecture details.
 *
 * Shows request-adjacent concepts: logging, injected services, app-owned state,
 * and background helpers.
 *
 * Usage: bun run src/run/handler-context.ts '{}'
 */
import { getDemoContext, runWithDemoContext } from '../api/context';

const standaloneCtx = getDemoContext();
const stateByVisitorId = new Map<string, { lastSeenAt: string; visits: number }>();

await runWithDemoContext(standaloneCtx, async () => {
	try {
		const ctx = getDemoContext();
		const visitorId = `demo_${crypto.randomUUID()}`;

		console.log('---OUTPUT---');
		console.log('');

		console.log('Route logging:');
		ctx.logger.info('Context inspected', { visitorId });
		ctx.logger.debug('Service surface checked', { visitorId });
		ctx.logger.warn('Example warning log');
		ctx.logger.error('Example error log');
		console.log('  Hono routes read the logger from c.var.logger');
		console.log('');

		console.log('Services available to route code:');
		console.log('  c.var.kv - Key-Value storage');
		console.log('  c.var.vector - Vector storage');
		console.log('  c.var.stream - Durable stream management');
		console.log('  c.var.queue - Queue publishing');
		console.log('');

		const previous = stateByVisitorId.get(visitorId);
		const next = {
			lastSeenAt: new Date().toISOString(),
			visits: (previous?.visits ?? 0) + 1,
		};
		stateByVisitorId.set(visitorId, next);

		console.log('App-owned state boundary:');
		console.log(`  visitorId: ${visitorId}`);
		console.log(`  previous visits: ${previous?.visits ?? 0}`);
		console.log(`  current visits: ${next.visits}`);
		console.log('  in a real route, keep the id in a cookie and the record in KV or your DB');
		console.log('');

		console.log('Background helper:');
		const backgroundTask = new Promise<void>((resolve) => {
			setTimeout(() => {
				console.log('  background task completed');
				resolve();
			}, 25);
		});
		ctx.waitUntil(backgroundTask);
		await backgroundTask;
		console.log('---OUTPUT---');
	} catch (error) {
		process.exitCode = 1;
		console.log('---OUTPUT---');
		console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
		console.log('---OUTPUT---');
	}
});
