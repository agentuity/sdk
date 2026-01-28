/**
 * Standalone run script for AI Gateway demo
 *
 * Route pattern demo - no corresponding agent exists.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: calling AI providers through Agentuity gateway
 * No API keys needed - uses AGENTUITY_SDK_KEY via gateway
 *
 * Usage: bun run src/run/ai-gateway.ts '{"prompt":"Tell me a joke"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

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

const input: Input = parseJSON<Input>(process.argv[2] ?? '{}', {});
const prompt = input.prompt ?? 'Explain AI agents in 1 sentence.';

const ctx = createAgentContext();

try {
	// Call both in parallel for speed
	ctx.logger.info('Calling OpenAI and Anthropic in parallel...');

	const [openaiResult, claudeResult] = await Promise.all([
		generateText({
			model: openai('gpt-5-nano'),
			prompt,
		}),
		generateText({
			model: anthropic('claude-haiku-4-5'),
			prompt,
		}),
	]);

	ctx.logger.info('Both completed');

	console.log('---OUTPUT---');
	console.log(`Prompt: "${prompt}"`);
	console.log('');
	console.log('OpenAI (gpt-5-nano):');
	console.log(openaiResult.text);
	console.log('');
	console.log('Anthropic (claude-haiku-4-5):');
	console.log(claudeResult.text);
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
