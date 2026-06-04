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
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';

const standaloneCtx = getDemoContext();
const stateByVisitorId = new Map<string, { lastSeenAt: string; visits: number }>();

await runWithDemoContext(standaloneCtx, async () => {
	try {
		const ctx = getDemoContext();
		const visitorId = `demo_${crypto.randomUUID()}`;
		const output: string[] = [''];

		output.push('Route logging:');
		ctx.logger.info('Context inspected', { visitorId });
		ctx.logger.debug('Service surface checked', { visitorId });
		ctx.logger.warn('Example warning log');
		ctx.logger.error('Example error log');
		output.push('  Hono routes read the logger from c.var.logger');
		output.push('');

		output.push('Services available to route code:');
		output.push('  c.var.kv - Key-Value storage');
		output.push('  c.var.vector - Vector storage');
		output.push('  c.var.stream - Durable stream management');
		output.push('  c.var.queue - Queue publishing');
		output.push('');

		const previous = stateByVisitorId.get(visitorId);
		const next = {
			lastSeenAt: new Date().toISOString(),
			visits: (previous?.visits ?? 0) + 1,
		};
		stateByVisitorId.set(visitorId, next);

		output.push('App-owned state boundary:');
		output.push(`  visitorId: ${visitorId}`);
		output.push(`  previous visits: ${previous?.visits ?? 0}`);
		output.push(`  current visits: ${next.visits}`);
		output.push('  in a real route, keep the id in a cookie and the record in KV or your DB');
		output.push('');

		output.push('Background helper:');
		const backgroundTask = new Promise<void>((resolve) => {
			setTimeout(() => {
				output.push('  background task completed');
				resolve();
			}, 25);
		});
		ctx.waitUntil(backgroundTask);
		await backgroundTask;
		writeSandboxOutput(output.join('\n'));
	} catch (error) {
		process.exitCode = 1;
		writeSandboxError(error);
	}
});
