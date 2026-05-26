/**
 * Standalone invoke script for Hello Agent
 *
 * Uses the same plain function module as the API route.
 *
 * Usage: bun run src/run/hello.ts '{"name":"World"}'
 */
import { getDemoContext } from '../api/context';
import helloAgent from '../agent/hello/agent';

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = getDemoContext();

try {
	ctx.logger.info('Processing greeting', { name: input.name });
	const result = await helloAgent.run(input);

	console.log('---OUTPUT---');
	console.log(result);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
