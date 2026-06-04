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
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { generateText } from 'ai';
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

const input: Input = parseJSON<Input>(process.argv[2] ?? '{}', {});
const prompt = input.prompt ?? 'Explain AI agents in 1 sentence.';
const ANTHROPIC_MODEL = 'anthropic/claude-opus-4-8';
const GOOGLE_MODEL = 'googleai/gemini-3.5-flash';

const ctx = getDemoContext();

try {
	// Parallel calls make provider differences visible without stacking latency.
	ctx.logger.info('Calling Anthropic and Google through AI Gateway in parallel...');

	const [anthropicResult, googleResult] = await Promise.all([
		generateText({
			model: getModel(ANTHROPIC_MODEL),
			prompt,
		}),
		generateText({
			model: getModel(GOOGLE_MODEL),
			prompt,
		}),
	]);

	ctx.logger.info('Both completed');

	writeSandboxOutput(
		[
			`Prompt: "${prompt}"`,
			'',
			`Anthropic (${ANTHROPIC_MODEL}):`,
			anthropicResult.text,
			'',
			`Google (${GOOGLE_MODEL}):`,
			googleResult.text,
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
