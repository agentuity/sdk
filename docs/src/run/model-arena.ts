/**
 * Standalone run script for Model Arena demo
 *
 * Runs two model calls in parallel, then asks a third model to judge the
 * outputs against a small schema.
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';
import { getModel } from '../lib/models';

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

const input: Input = parseJSON<Input>(process.argv[2] ?? '{}', {});
const userPrompt = input.prompt ?? 'Write a creative one-liner about programming.';
const ANTHROPIC_MODEL = 'anthropic/claude-opus-4-8';
const GOOGLE_MODEL = 'googleai/gemini-3.5-flash';
const JUDGE_MODEL = 'groq/openai/gpt-oss-120b';

// Buffer output so the Explorer terminal receives one clean result block.
const output: string[] = [];

try {
	// Compare model quality without making the user wait for sequential calls.
	const [responseA, responseB] = await Promise.all([
		generateText({
			model: getModel(ANTHROPIC_MODEL),
			prompt: userPrompt,
		}),
		generateText({
			model: getModel(GOOGLE_MODEL),
			prompt: userPrompt,
		}),
	]);

	const { object: judgment } = await generateObject({
		model: getModel(JUDGE_MODEL),
		schema: JudgmentSchema,
		prompt: `Compare these responses and pick a winner.
Score each on creativity and clarity (0-1).

Model A (${ANTHROPIC_MODEL}): ${responseA.text.slice(0, 200)}
Model B (${GOOGLE_MODEL}): ${responseB.text.slice(0, 200)}`,
	});

	output.push(`[INFO] Model A (Anthropic ${ANTHROPIC_MODEL}): "${responseA.text}"`);
	output.push('');
	output.push(`[INFO] Model B (Google ${GOOGLE_MODEL}): "${responseB.text}"`);
	output.push('');
	output.push(`[INFO] Judge (Groq ${JUDGE_MODEL}) {"winner":"${judgment.winner}"}`);
	output.push(
		`[INFO] Scores {"creativity":${judgment.scores.creativity},"clarity":${judgment.scores.clarity}}`
	);
	output.push(`[INFO] Reasoning: ${judgment.reasoning}`);
} catch (error) {
	output.push(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

writeSandboxOutput(output.join('\n'));
