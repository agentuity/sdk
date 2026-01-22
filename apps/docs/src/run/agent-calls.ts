/**
 * Standalone invoke script for Agent Calls Demo
 *
 * Demonstrates: agent.run() for invoking agents, ctx.waitUntil() for background tasks
 * Shows the standalone pattern for agent invocation.
 *
 * Usage: bun run src/run/agent-calls.ts '{"name":"World"}'
 */
import { createAgentContext, getAgentContext } from "@agentuity/runtime";
import helloAgent from "../agent/hello/agent";

interface Input {
	name?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? "{}");
const name = input.name ?? "Explorer";

const standaloneCtx = createAgentContext();
standaloneCtx.logger.info("Agent calls demo");

// Must use invoke() to get proper execution context for waitUntil
await standaloneCtx.invoke(async () => {
	const ctx = getAgentContext();

	// agent.run() invokes the agent and waits for result
	const greeting = await helloAgent.run({ name });

	// ctx.waitUntil() schedules background work that runs after main execution
	let backgroundCompleted = false;
	ctx.waitUntil(
		(async () => {
			// Simulate async work (analytics, cleanup, etc)
			await new Promise((resolve) => setTimeout(resolve, 100));
			backgroundCompleted = true;
		})()
	);

	// Wait a moment for background task to complete (for demo purposes)
	await new Promise((resolve) => setTimeout(resolve, 150));

	console.log("---OUTPUT---");
	console.log("Agent Invocation (agent.run):");
	console.log(`  Input: { name: "${name}" }`);
	console.log(`  Result: ${JSON.stringify(greeting)}`);
	console.log("");
	console.log("Background Task (ctx.waitUntil):");
	console.log(`  Scheduled async work after main execution`);
	console.log(`  Status: ${backgroundCompleted ? "completed" : "still running"}`);
});
