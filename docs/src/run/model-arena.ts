/**
 * Standalone run script for Model Arena demo
 *
 * Runs two model calls in parallel, then asks a third model to judge the
 * outputs against a small schema.
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { AIGatewayClient } from '@agentuity/aigateway';
import { z } from 'zod';
import { writeSandboxOutput } from '../lib/sandbox-output-writer';

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
	winner: z.enum(['openai', 'anthropic']),
	reasoning: z.string(),
	scores: z.object({
		creativity: z.number(),
		clarity: z.number(),
	}),
});

const JudgmentResponseSchema = {
	type: 'object',
	properties: {
		winner: { type: 'string', enum: ['openai', 'anthropic'] },
		reasoning: { type: 'string' },
		scores: {
			type: 'object',
			properties: {
				creativity: { type: 'number' },
				clarity: { type: 'number' },
			},
			required: ['creativity', 'clarity'],
			additionalProperties: false,
		},
	},
	required: ['winner', 'reasoning', 'scores'],
	additionalProperties: false,
};

const input: Input = parseJSON<Input>(process.argv[2] ?? '{}', {});
const userPrompt = input.prompt ?? 'Write a creative one-liner about programming.';
const OPENAI_MODEL = 'openai/gpt-5.4-mini';
const ANTHROPIC_MODEL = 'anthropic/claude-opus-4-8';
const JUDGE_MODEL = 'openai/gpt-5.4-mini';

// Buffer output so the Explorer terminal receives one clean result block.
const output: string[] = [];

try {
	// Compare model quality without making the user wait for sequential calls.
	const gateway = new AIGatewayClient();
	const [openaiResult, anthropicResult] = await Promise.all([
		gateway.completeText({
			model: OPENAI_MODEL,
			messages: [{ role: 'user', content: userPrompt }],
		}),
		gateway.completeText({
			model: ANTHROPIC_MODEL,
			messages: [{ role: 'user', content: userPrompt }],
		}),
	]);

	const { data } = await gateway.completeStructured({
		model: JUDGE_MODEL,
		response_schema: { name: 'ModelArenaJudgment', schema: JudgmentResponseSchema },
		messages: [
			{
				role: 'user',
				content: `Compare these responses and pick a winner.
Score each on creativity and clarity (0-1).

OpenAI (${OPENAI_MODEL}): ${openaiResult.text.slice(0, 200)}
Anthropic (${ANTHROPIC_MODEL}): ${anthropicResult.text.slice(0, 200)}`,
			},
		],
	});
	const judgment = JudgmentSchema.parse(data);

	output.push(`[INFO] OpenAI (${OPENAI_MODEL}): "${openaiResult.text}"`);
	output.push('');
	output.push(`[INFO] Anthropic (${ANTHROPIC_MODEL}): "${anthropicResult.text}"`);
	output.push('');
	output.push(`[INFO] Judge (${JUDGE_MODEL}) {"winner":"${judgment.winner}"}`);
	output.push(
		`[INFO] Scores {"creativity":${judgment.scores.creativity},"clarity":${judgment.scores.clarity}}`
	);
	output.push(`[INFO] Reasoning: ${judgment.reasoning}`);
} catch (error) {
	output.push(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

writeSandboxOutput(output.join('\n'));
