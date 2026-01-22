/**
 * Standalone run script for Handler Context demo
 *
 * NOTE: Intentionally separate from src/agent/handler-context/agent.ts.
 * Exploratory demo showing ctx object, agent is more structured.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: Key AgentContext properties and methods
 * This exercises the ctx object to show what's available inside handlers.
 *
 * Usage: bun run src/run/handler-context.ts '{}'
 */
import { createAgentContext, getAgentContext } from '@agentuity/runtime';

const standaloneCtx = createAgentContext();

// Wrap in invoke() - inside the callback, use getAgentContext() to get the
// context with real IDs (the outer standaloneCtx still has "pending" IDs)
await standaloneCtx.invoke(async () => {
	try {
		// Get the actual context from AsyncLocalStorage (has real sessionId/threadId)
		const ctx = getAgentContext();

		console.log('---OUTPUT---');
		console.log('=== Handler Context Demo ===');
		console.log('');

		// Identifiers
		console.log('Identifiers:');
		console.log(`  sessionId: ${ctx.sessionId}`);
		console.log(`  threadId: ${ctx.thread.id}`);
		console.log('');

		// Logger demonstration
		console.log('Logger (writes to trace, shown above):');
		ctx.logger.info('Processing request', { userId: 'user-123' });
		ctx.logger.debug('Debug details', { threadId: ctx.thread.id });
		ctx.logger.warn('Example warning log');
		ctx.logger.error('Example error log');
		console.log('  ctx.logger.info(), .debug(), .warn(), .error() available');
		console.log('');

		// Storage access demonstration
		console.log('Storage Access:');
		console.log('  ctx.kv - Key-Value storage');
		console.log('  ctx.vector - Vector storage');
		console.log('  ctx.objectstore - Object storage (S3)');
		console.log('');

		// Thread state demonstration
		console.log('Thread State (persists across requests):');
		await ctx.thread.state.set('demo-key', { value: 'test' });
		const stored = await ctx.thread.state.get('demo-key');
		console.log(`  set("demo-key", {value: "test"})`);
		console.log(`  get("demo-key") -> ${JSON.stringify(stored)}`);
		await ctx.thread.state.delete('demo-key');
		console.log('  delete("demo-key") - cleaned up');
		console.log('');

		// Session state demonstration
		console.log('Session State (per-request only):');
		const timestamp = new Date().toISOString();
		ctx.session.state.set('request-time', timestamp);
		const requestTime = ctx.session.state.get('request-time');
		console.log(`  set("request-time", "${timestamp}")`);
		console.log(`  get("request-time") -> ${requestTime}`);
	} catch (error) {
		console.log('---OUTPUT---');
		console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	}
});
