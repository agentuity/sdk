/**
 * Standalone run script for Chat demo
 *
 * Uses the docs demo context to show conversation memory in a sandbox. A
 * standalone run gets a fresh thread unless the caller provides one through the
 * Explorer session, so this script teaches the state shape, not durable history.
 *
 * Usage: bun run src/run/chat.ts '{"message":"Hello!"}'
 */
import { getDemoContext, runWithDemoContext } from '../api/context';
import { writeSandboxError, writeSandboxOutput } from '../lib/sandbox-output-writer';
import { generateText } from 'ai';
import agentuityDocs from '../agent/chat/agentuity-context.txt';
import { getModel } from '../lib/models';

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

interface Input {
	message?: string;
}

const standaloneCtx = getDemoContext();
const DEFAULT_MODEL = 'anthropic/claude-opus-4-8';

try {
	const input: Input = JSON.parse(process.argv[2] ?? '{}');
	const message = input.message ?? 'What is Agentuity?';

	await runWithDemoContext(standaloneCtx, async () => {
		const ctx = getDemoContext();

		// Session state is request-local here; conversation history belongs to the thread store.
		ctx.session.state.set('requestStart', Date.now());

		const messages = ((await ctx.thread.state.get('messages')) as Message[]) ?? [];
		const turnCount = ((await ctx.thread.state.get('turnCount')) as number) ?? 0;
		ctx.logger.info('Conversation state retrieved', {
			messageCount: messages.length,
			turnCount,
			note: 'standalone demo starts a fresh conversation each run unless you provide one',
		});

		ctx.logger.info('Generating response');
		const { text } = await generateText({
			model: getModel(DEFAULT_MODEL),
			system: `You are an Agentuity expert assistant. Keep responses concise (2-3 sentences).

## Agentuity Documentation
${agentuityDocs}`,
			messages: [...messages, { role: 'user', content: message }],
		});

		// Keep only recent turns so prompt size stays bounded.
		await ctx.thread.state.push('messages', { role: 'user', content: message }, 50);
		await ctx.thread.state.push('messages', { role: 'assistant', content: text }, 50);
		await ctx.thread.state.set('turnCount', turnCount + 1);
		ctx.logger.info('Conversation state updated', { newTurnCount: turnCount + 1 });

		const elapsed = Date.now() - (ctx.session.state.get('requestStart') as number);
		ctx.logger.info('Request completed', { elapsedMs: elapsed });

		writeSandboxOutput(
			[
				`User: "${message}"`,
				`Assistant: "${text}"`,
				`Conversation: ${ctx.thread.id}`,
				`Turn: ${turnCount + 1} (elapsed: ${elapsed}ms)`,
				'Note: standalone sandbox runs create a new conversation unless one is supplied.',
			].join('\n')
		);
	});
} catch (error) {
	process.exitCode = 1;
	writeSandboxError(error);
}
