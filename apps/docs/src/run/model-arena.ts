/**
 * Standalone run script for Model Arena demo
 *
 * NOTE: Intentionally separate from src/agent/model-arena/agent.ts.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: LLM-as-Judge pattern - two models compete, judge picks winner
 * Uses OpenAI vs Anthropic with Groq/GPT-OSS-120B as judge
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { anthropic } from '@ai-sdk/anthropic';
import { groq } from '@ai-sdk/groq';
import { openai } from '@ai-sdk/openai';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

interface Input {
	prompt?: string;
}

const JudgmentSchema = z.object({
	winner: z.enum(['model-a', 'model-b']),
	reasoning: z.string(),
	scores: z.object({
		creativity: z.number(),
		clarity: z.number(),
	}),
});

const input: Input = JSON.parse(process.argv[2] ?? '{}');
const userPrompt = input.prompt ?? 'Write a creative one-liner about programming.';

const ctx = createAgentContext();

// Collect all output, print at the very end
const output: string[] = [];

try {
	// Generate competing responses in parallel (no logging during execution)
	const [responseA, responseB] = await Promise.all([
		generateText({
			model: openai('gpt-5-nano'),
			prompt: userPrompt,
		}),
		generateText({
			model: anthropic('claude-haiku-4-5'),
			prompt: userPrompt,
		}),
	]);

	// Use Groq/GPT-OSS-120B for fast structured judging
	const { object: judgment } = await generateObject({
		model: groq('openai/gpt-oss-120b'),
		schema: JudgmentSchema,
		prompt: `Compare these responses and pick a winner.
Score each on creativity and clarity (0-1).

Model A: ${responseA.text.slice(0, 200)}
Model B: ${responseB.text.slice(0, 200)}`,
	});

	// Buffer all output (matches reference code style)
	output.push(`[INFO] Model A (OpenAI gpt-5-nano): "${responseA.text}"`);
	output.push('');
	output.push(`[INFO] Model B (Anthropic claude-haiku-4-5): "${responseB.text}"`);
	output.push('');
	output.push(`[INFO] Judge (Groq gpt-oss-120b) {"winner":"${judgment.winner}"}`);
	output.push(`[INFO] Scores {"creativity":${judgment.scores.creativity},"clarity":${judgment.scores.clarity}}`);
	output.push(`[INFO] Reasoning: ${judgment.reasoning}`);
} catch (error) {
	output.push(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
}

// Print everything at once at the very end
console.log(output.join('\n'));
