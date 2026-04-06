/**
 * Standalone invoke script for Database Agent
 *
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 *
 * Usage: bun run src/run/database.ts '{"query":"summary","seedData":true}'
 */
import { createAgentContext } from '@agentuity/runtime';
import databaseAgent from '../agent/database/agent';

const ctx = createAgentContext();

try {
	const input = JSON.parse(process.argv[2] ?? '{"query":"summary","seedData":true}');
	ctx.logger.info('Running database query', { query: input.query, seedData: input.seedData });
	const result = await ctx.invoke(() => databaseAgent.run(input));

	console.log('---OUTPUT---');
	console.log(JSON.stringify(result, null, 2));
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
