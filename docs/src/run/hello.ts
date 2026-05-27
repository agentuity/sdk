/**
 * Standalone run script for Hello World
 *
 * Uses the same plain function module as the API route, keeping the sandbox
 * demo and route behavior aligned.
 *
 * Usage: bun run src/run/hello.ts '{"name":"World"}'
 */
import { getDemoContext } from '../api/context';
import hello from '../agent/hello/agent';

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = getDemoContext();

try {
	ctx.logger.info('Processing greeting', { name: input.name });
	const result = await hello.run(input);

	console.log('---OUTPUT---');
	console.log(result);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
