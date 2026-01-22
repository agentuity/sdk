/**
 * Generic agent invoker - runs any agent by name
 *
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 *
 * Usage: bun run src/run/invoke.ts <agent-name> '<json-input>'
 *
 * Examples:
 *   bun run src/run/invoke.ts hello '{"name":"World"}'
 *   bun run src/run/invoke.ts vector '{"query":"ergonomic chair","seedData":true}'
 */
import { createAgentContext } from "@agentuity/runtime";

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

const ctx = createAgentContext();
const result = await ctx.invoke(() => agent.run(input));

console.log("---OUTPUT---");
console.log(JSON.stringify(result, null, 2));
