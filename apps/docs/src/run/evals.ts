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

interface Input {
	question?: string;
}

// Helper to extract JSON from LLM response (handles markdown code blocks)
function parseJSON<T>(text: string): T {
	// Try to extract JSON from markdown code block if present
	const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const jsonStr = jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : text.trim();
	return JSON.parse(jsonStr);
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const question = input.question ?? "What is Agentuity and what are its main features?";

const ctx = createAgentContext();

try {
	ctx.logger.info("Generating answer");
	const { text: answer } = await generateText({
		model: openai("gpt-5-nano"),
		prompt: question,
	});
	ctx.logger.info("Answer generated", { length: answer.length });

	ctx.logger.info("Running completeness eval");
	// Eval 1: Answer Completeness (score 0-1)
	// Using generateText + JSON parsing instead of generateObject (gateway compatibility)
	const { text: completenessJson } = await generateText({
		model: openai("gpt-5-mini"),
		prompt: `Rate how completely this answer addresses the question.
Return ONLY valid JSON (no markdown, no explanation): {"score": 0.85, "reason": "brief explanation"}

Question: "${question}"
Answer: "${answer}"

Consider: Does it cover all aspects? Is anything missing?`,
	});
	const completeness = parseJSON<{ score: number; reason: string }>(completenessJson);
	ctx.logger.info("Completeness eval done", { score: completeness.score });

	ctx.logger.info("Running factual claims eval");
	// Eval 2: Factual Claims (binary pass/fail)
	const { text: factualJson } = await generateText({
		model: openai("gpt-5-mini"),
		prompt: `Does this answer contain factual claims (not just opinions)?
Return ONLY valid JSON (no markdown, no explanation): {"containsFactualClaims": true, "reason": "brief explanation"}

"${answer}"`,
	});
	const factual = parseJSON<{ containsFactualClaims: boolean; reason: string }>(factualJson);
	ctx.logger.info("Factual claims eval done", { passed: factual.containsFactualClaims });

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
