/**
 * Standalone invoke script for Hello Agent
 *
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 *
 * Usage: bun run src/run/hello.ts '{"name":"World"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import helloAgent from '../agent/hello/agent';

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = createAgentContext();

try {
	ctx.logger.info('Processing greeting', { name: input.name });
	const result = await ctx.invoke(() => helloAgent.run(input));

	console.log('---OUTPUT---');
	console.log(result);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
