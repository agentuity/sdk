/**
 * Standalone run script for AI Gateway demo
 *
 * Compares supported provider models through Agentuity's AI Gateway.
 * The sandbox receives provider base URLs that point at the gateway, so
 * AI SDK calls use the project credential instead of per-provider keys.
 *
 * Usage: bun run src/run/ai-gateway.ts '{"prompt":"Tell me a joke"}'
 */
import { getDemoContext } from '../api/context';
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

const ctx = getDemoContext();

try {
	// Parallel calls make provider differences visible without stacking latency.
	ctx.logger.info('Calling OpenAI and Anthropic in parallel...');

	const [openaiResult, claudeResult] = await Promise.all([
		generateText({
			model: openai('gpt-5.4-nano'),
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
	console.log('OpenAI (gpt-5.4-nano):');
	console.log(openaiResult.text);
	console.log('');
	console.log('Anthropic (claude-haiku-4-5):');
	console.log(claudeResult.text);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
	process.exitCode = 1;
}
