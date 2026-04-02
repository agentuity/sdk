/**
 * Standalone invoke script for Email Agent
 *
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 *
 * Usage: bun run src/run/email.ts '{"template":"welcome"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import emailAgent from '../agent/email/agent';

const ctx = createAgentContext();

try {
	const input = JSON.parse(process.argv[2] ?? '{"template":"welcome"}');
	ctx.logger.info('Sending email', { template: input.template });
	const result = await ctx.invoke(() => emailAgent.run(input));

	console.log('---OUTPUT---');
	console.log(JSON.stringify(result, null, 2));
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
