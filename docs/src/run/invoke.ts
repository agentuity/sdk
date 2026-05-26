/**
 * Generic agent invoker - runs any agent by name
 *
 * Loads one Explorer demo module and runs it with the local docs context.
 *
 * Usage: bun run src/run/invoke.ts <agent-name> '<json-input>'
 *
 * Examples:
 *   bun run src/run/invoke.ts hello '{"name":"World"}'
 *   bun run src/run/invoke.ts vector '{"query":"ergonomic chair","seedData":true}'
 */
const [agentName, inputJson] = process.argv.slice(2);

if (!agentName) {
	console.error("Usage: bun run src/run/invoke.ts <agent-name> '<json-input>'");
	process.exit(1);
}

const input = inputJson ? JSON.parse(inputJson) : {};

// Dynamic agent import
let agent: { run: (input: unknown) => Promise<unknown> };
try {
	const module = await import(`../agent/${agentName}/agent`);
	agent = module.default;
} catch {
	console.error(`Agent not found: ${agentName}`);
	process.exit(1);
}

try {
	const result = await agent.run(input);

	console.log('---OUTPUT---');
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
