/**
 * Standalone run script for Model Arena demo
 *
 * NOTE: Intentionally separate from src/agent/model-arena/agent.ts.
 * Uses different models (GPT-4o-mini, Claude Haiku) than the agent.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: LLM-as-Judge pattern - two models compete, judge picks winner
 * Uses OpenAI vs Anthropic with structured evaluation via generateObject
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { createAgentContext } from "@agentuity/runtime";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { z } from "zod";

interface Input {
	prompt?: string;
}

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const userPrompt = input.prompt ?? "Write a creative one-liner about programming.";

const ctx = createAgentContext();

// Define evaluation criteria as a Zod schema
const JudgmentSchema = z.object({
	winner: z.enum(["model-a", "model-b"]),
	reasoning: z.string(),
	scores: z.object({
		creativity: z.number().min(0).max(1),
		clarity: z.number().min(0).max(1),
	}),
});

ctx.logger.info("Generating responses in parallel");

// Generate competing responses in parallel
const [responseA, responseB] = await Promise.all([
	generateText({
		model: openai("gpt-5-nano"),
		prompt: userPrompt,
	}),
	generateText({
		model: anthropic("claude-haiku-4-5"),
		prompt: userPrompt,
	}),
]);

ctx.logger.info("Judging responses");

// Use gpt-5-mini for structured evaluation (gpt-5-nano has issues with strict schemas)
const { object: judgment } = await generateObject({
	model: openai("gpt-5-mini"),
	schema: JudgmentSchema,
	prompt: `Compare these responses and pick a winner:

Model A: ${responseA.text}
Model B: ${responseB.text}

Score each on creativity and clarity (0-1).`,
});

console.log("---OUTPUT---");
console.log("=== Model Arena Demo ===");
console.log(`Prompt: "${userPrompt}"`);
console.log("");
console.log("Model A (GPT-4o-mini):");
console.log(`  "${responseA.text}"`);
console.log("");
console.log("Model B (Claude Haiku):");
console.log(`  "${responseB.text}"`);
console.log("");
console.log("Judge Decision:");
console.log(`  Winner: ${judgment.winner === "model-a" ? "Model A (GPT-4o-mini)" : "Model B (Claude Haiku)"}`);
console.log(`  Reasoning: ${judgment.reasoning}`);
console.log(`  Creativity: A=${(judgment.scores.creativity * 100).toFixed(0)}%`);
console.log(`  Clarity: A=${(judgment.scores.clarity * 100).toFixed(0)}%`);

// Ensure stdout is flushed before exit
await new Promise<void>((resolve) => {
	process.stdout.write("", () => resolve());
});
