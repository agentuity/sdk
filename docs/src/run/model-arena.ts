/**
 * Standalone run script for Model Arena demo
 *
 * Runs two model calls in parallel, then asks a third model to judge the
 * outputs against a small schema.
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { anthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { openai } from '@ai-sdk/openai';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';

interface Input {
	prompt?: string;
}

function parseJSON<T>(text: string, fallback: T): T {
	try {
		return JSON.parse(text);
	} catch {
		return fallback;
	}
}

const JudgmentSchema = z.object({
	winner: z.enum(['model-a', 'model-b']),
	reasoning: z.string(),
	scores: z.object({
		creativity: z.number(),
		clarity: z.number(),
	}),
});

// Run scripts bypass CLI provider patching, so pass the gateway URL explicitly.
const groq = createGroq({ baseURL: process.env.GROQ_BASE_URL });

const input: Input = parseJSON<Input>(process.argv[2] ?? '{}', {});
const userPrompt = input.prompt ?? 'Write a creative one-liner about programming.';

// Buffer output so the Explorer terminal receives one clean result block.
const output: string[] = [];

try {
	// Compare model quality without making the user wait for sequential calls.
	const [responseA, responseB] = await Promise.all([
		generateText({
			model: openai('gpt-5.4-nano'),
			prompt: userPrompt,
		}),
		generateText({
			model: anthropic('claude-haiku-4-5'),
			prompt: userPrompt,
		}),
	]);

	const { object: judgment } = await generateObject({
		model: groq('openai/gpt-oss-120b'),
		schema: JudgmentSchema,
		prompt: `Compare these responses and pick a winner.
Score each on creativity and clarity (0-1).

Model A: ${responseA.text.slice(0, 200)}
Model B: ${responseB.text.slice(0, 200)}`,
	});

	output.push(`[INFO] Model A (OpenAI gpt-5.4-nano): "${responseA.text}"`);
	output.push('');
	output.push(`[INFO] Model B (Anthropic claude-haiku-4-5): "${responseB.text}"`);
	output.push('');
	output.push(`[INFO] Judge (Groq gpt-oss-120b) {"winner":"${judgment.winner}"}`);
	output.push(
		`[INFO] Scores {"creativity":${judgment.scores.creativity},"clarity":${judgment.scores.clarity}}`
	);
	output.push(`[INFO] Reasoning: ${judgment.reasoning}`);
} catch (error) {
	output.push(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

console.log('---OUTPUT---');
console.log(output.join('\n'));
console.log('---OUTPUT---');
