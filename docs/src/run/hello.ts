/**
 * Standalone run script for Hello World
 *
 * Uses the same plain function module as the API route, keeping the sandbox
 * demo and route behavior aligned.
 *
 * Usage: bun run src/run/hello.ts '{"name":"World"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import hello from '../agent/hello/agent';

const input = JSON.parse(process.argv[2] ?? '{"name":"World"}');
const ctx = getDemoContext();

try {
	ctx.logger.info('Processing greeting', { name: input.name });
	const result = await hello.run(input);

	writeSandboxOutput(result);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
