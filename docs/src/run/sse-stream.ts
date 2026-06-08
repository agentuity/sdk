/**
 * Standalone run script for SSE Stream demo
 *
 * Emits each model chunk to stdout as it arrives so the Explorer's sandbox
 * route forwards it to the browser live, mirroring how a real SSE route would
 * push each chunk as a named event.
 *
 * Usage: bun run src/run/sse-stream.ts '{"prompt":"Tell me a story"}'
 */
import { getDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { streamAIGatewayText } from '../lib/ai-gateway-stream';

interface Input {
	prompt?: string;
}

const ctx = getDemoContext();
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

try {
	const input: Input = JSON.parse(process.argv[2] ?? '{}');
	const prompt = input.prompt ?? 'Explain what Server-Sent Events are in 2-3 sentences.';
	ctx.logger.info('SSE stream started', { prompt });
	const { textStream } = await streamAIGatewayText({
		model: DEFAULT_MODEL,
		messages: [{ role: 'user', content: prompt }],
	});

	// Emit each chunk as it arrives so the route streams it to the browser live.
	writeSandboxOutput(`Prompt: "${prompt}"\n\n`);
	let chunkCount = 0;
	for await (const chunk of textStream) {
		writeSandboxOutput(chunk);
		chunkCount++;
	}
	writeSandboxOutput(
		`\n\n[Streamed ${chunkCount} text chunks live; a real route wraps each in a named SSE event]`
	);
} catch (error) {
	writeSandboxError(error);
	process.exitCode = 1;
}
