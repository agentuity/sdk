/**
 * Standalone invoke script for Evals Demo
 *
 * Demonstrates: Running evaluations on agent output
 * Shows both a preset-style eval (completeness) and custom eval (factual claims)
 *
 * Usage: bun run src/run/evals.ts '{"question":"What is TypeScript?"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import agentuityDocs from "../agent/chat/agentuity-context.txt";

interface Input {
	question?: string;
}

// Helper to extract JSON from LLM response (handles markdown code blocks)
function parseJSON<T>(text: string, fallback: T): T {
	try {
		const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		const jsonStr = jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
		return JSON.parse(jsonStr);
	} catch {
		return fallback;
	}
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const question = input.question ?? "What is Agentuity and what are its main features?";

const ctx = createAgentContext();

// Minimal logging to avoid stdout backpressure issues
ctx.logger.info("Running evals demo");

try {
	// Step 1: Generate the answer (with Agentuity context)
	const { text: answer } = await generateText({
		model: openai("gpt-5-nano"),
		system: `You are an Agentuity expert. Answer questions based on this documentation:

${agentuityDocs}`,
		prompt: question,
	});

	// Truncate answer for eval prompts
	const truncatedAnswer = answer.slice(0, 500);

	// Step 2: Run both evals in PARALLEL (like ai-gateway.ts pattern)
	const [completenessResult, factualResult] = await Promise.all([
		generateText({
			model: openai("gpt-5-nano"),
			prompt: `Rate 0-1 how completely this answer addresses the question. Return ONLY JSON: {"score": 0.85, "reason": "brief reason"}

Q: "${question}"
A: "${truncatedAnswer}"`,
		}).catch(() => null),
		generateText({
			model: openai("gpt-5-nano"),
			prompt: `Does this text contain factual claims? Return ONLY JSON: {"containsFactualClaims": true, "reason": "brief reason"}

"${truncatedAnswer}"`,
		}).catch(() => null),
	]);

	// Parse results with fallbacks
	const completeness = completenessResult
		? parseJSON(completenessResult.text, { score: 0.75, reason: "Could not parse eval result" })
		: { score: 0.75, reason: "Eval failed" };

	const factual = factualResult
		? parseJSON(factualResult.text, { containsFactualClaims: true, reason: "Could not parse eval result" })
		: { containsFactualClaims: true, reason: "Eval failed" };

	// Output everything at once at the end (reduces stdout pressure)
	console.log("---OUTPUT---");
	console.log(`Question: "${question}"`);
	console.log("");
	console.log(`Answer: "${answer.slice(0, 200)}${answer.length > 200 ? '...' : ''}"`);
	console.log("");
	console.log("Evals:");
	console.log(`  answer-completeness: ${(completeness.score * 100).toFixed(0)}% - "${completeness.reason}"`);
	console.log(`  factual-claims: ${factual.containsFactualClaims ? 'Passed' : 'Failed'} - "${factual.reason}"`);
} catch (error) {
	console.log("---OUTPUT---");
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}

// Ensure stdout is flushed before exit
await new Promise<void>((resolve) => {
	process.stdout.write("", () => resolve());
});
