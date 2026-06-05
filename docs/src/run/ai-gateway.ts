/**
 * Standalone run script for AI Gateway demo
 *
 * Compares supported provider models through Agentuity's AI Gateway.
 *
 * Usage: bun run src/run/ai-gateway.ts '{"prompt":"Tell me a joke"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { AIGatewayClient } from '@agentuity/aigateway';

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
const OPENAI_MODEL = 'openai/gpt-5.4-mini';
const ANTHROPIC_MODEL = 'anthropic/claude-opus-4-8';

const ctx = getDemoContext();

try {
	// Parallel calls make provider differences visible without stacking latency.
	ctx.logger.info('Calling OpenAI and Anthropic through AI Gateway in parallel...');
	const gateway = new AIGatewayClient();

	const [openaiResult, anthropicResult] = await Promise.all([
		gateway.completeText({
			model: OPENAI_MODEL,
			messages: [{ role: 'user', content: prompt }],
		}),
		gateway.completeText({
			model: ANTHROPIC_MODEL,
			messages: [{ role: 'user', content: prompt }],
		}),
	]);

	ctx.logger.info('Both completed');

	writeSandboxOutput(
		[
			`Prompt: "${prompt}"`,
			'',
			`OpenAI (${OPENAI_MODEL}):`,
			openaiResult.text,
			'',
			`Anthropic (${ANTHROPIC_MODEL}):`,
			anthropicResult.text,
		].join('\n')
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
