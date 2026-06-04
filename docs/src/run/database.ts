/**
 * Standalone run script for the Database demo
 *
 * Uses the same plain function module as the API route so the sandbox and live
 * demo exercise one database path.
 *
 * Usage: bun run src/run/database.ts '{"query":"summary","seedData":true}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import database from '../agent/database/agent';

const ctx = getDemoContext();

try {
	const input = JSON.parse(process.argv[2] ?? '{"query":"summary","seedData":true}');
	ctx.logger.info('Running database query', { query: input.query, seedData: input.seedData });
	const result = await database.run(input);

	writeSandboxOutput(JSON.stringify(result, null, 2));
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
