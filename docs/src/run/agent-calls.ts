/**
 * Standalone script for the Agent Calls demo
 *
 * Mirrors direct, background, and chained call shapes in sandbox-friendly
 * output. Public copy-paste code lives in src/web/code-examples.ts.
 *
 * Usage: bun run src/run/agent-calls.ts '{"name":"World"}'
 */
import { getDemoContext, runWithDemoContext } from '../api/context';
import hello from '../agent/hello/agent';

const standaloneCtx = getDemoContext();

try {
	const input: unknown = JSON.parse(process.argv[2] ?? '{}');
	const name =
		typeof input === 'object' &&
		input !== null &&
		'name' in input &&
		typeof input.name === 'string'
			? input.name
			: 'Explorer';

	standaloneCtx.logger.info('Agent calls demo');

	await runWithDemoContext(standaloneCtx, async () => {
		const ctx = getDemoContext();

		const greeting = await hello.run({ name });

		let backgroundCompleted = false;
		ctx.waitUntil(
			(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
				backgroundCompleted = true;
			})()
		);

		// Sandboxes print buffered output, so wait long enough to show the handoff.
		await new Promise((resolve) => setTimeout(resolve, 150));

		console.log('---OUTPUT---');
		console.log('Direct work:');
		console.log(`  Input: { name: "${name}" }`);
		console.log(`  Result: ${JSON.stringify(greeting)}`);
		console.log('');
		console.log('Background task:');
		console.log('  Scheduled async work after main execution');
		console.log(`  Status: ${backgroundCompleted ? 'completed' : 'still running'}`);
		console.log('---OUTPUT---');
	});
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
	process.exitCode = 1;
}
