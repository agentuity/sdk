/**
 * Standalone invoke script for Agent Calls Demo
 *
 * Demonstrates: ctx.invoke() for invoking other agents
 * Shows the standalone pattern for agent invocation.
 *
 * Usage: bun run src/run/agent-calls.ts '{"name":"World"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import helloAgent from "../agent/hello/agent";

interface Input {
	name?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? "{}");
const name = input.name ?? "from the hello agent";

const ctx = createAgentContext();

ctx.logger.info("Calling hello agent", { name });

// ctx.invoke(() => agent.run(input)) is the standalone pattern for invoking agents
const result = await ctx.invoke(() => helloAgent.run({ name }));

ctx.logger.info("Agent returned", { result });

console.log("---OUTPUT---");
console.log(`Input: { name: "${name}" }`);
console.log(`Result: ${JSON.stringify(result)}`);
