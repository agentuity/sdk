/**
 * Standalone run script for Model Arena demo
 *
 * NOTE: Intentionally separate from src/agent/model-arena/agent.ts.
 * Uses different models than the agent.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: LLM-as-Judge pattern - two models compete, judge picks winner
 * Uses OpenAI vs Anthropic with OpenAI as judge
 *
 * Usage: bun run src/run/model-arena.ts '{"prompt":"Write a haiku about coding"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

interface Input {
	prompt?: string;
}

interface Judgment {
	winner: 'model-a' | 'model-b';
	reasoning: string;
	scores: {
		creativity: number;
		clarity: number;
	};
}

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

	// Use OpenAI for judging with manual JSON parsing
	const judgeResult = await generateText({
		model: openai('gpt-5-nano'),
		prompt: `Compare these responses and pick a winner. Return ONLY JSON:
{"winner": "model-a" or "model-b", "reasoning": "brief reason", "scores": {"creativity": 0.0-1.0, "clarity": 0.0-1.0}}

Model A: ${responseA.text.slice(0, 200)}
Model B: ${responseB.text.slice(0, 200)}`,
	});

	const judgment = parseJSON<Judgment>(judgeResult.text, {
		winner: 'model-a',
		reasoning: 'Could not parse judge response',
		scores: { creativity: 0.5, clarity: 0.5 },
	});

	// Buffer all output (matches reference code style)
	output.push(`[INFO] Model A (OpenAI gpt-5-nano): "${responseA.text}"`);
	output.push('');
	output.push(`[INFO] Model B (Anthropic claude-haiku-4-5): "${responseB.text}"`);
	output.push('');
	output.push(`[INFO] Judge result {"winner":"${judgment.winner}"}`);
	output.push(`[INFO] Scores {"creativity":${judgment.scores.creativity},"clarity":${judgment.scores.clarity}}`);
	output.push(`[INFO] Reasoning: ${judgment.reasoning}`);
} catch (error) {
	output.push(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
}

// Print everything at once at the very end
console.log(output.join('\n'));
