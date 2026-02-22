import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';

export interface CompletionHooks {
	onParams: (input: unknown) => void;
	onMessage: (input: unknown) => void;
}

/**
 * Creates hooks for logging agent completion metrics.
 *
 * Tracks the start of each LLM call (via chat.params) and logs
 * agent name, model, and duration when the response arrives (via chat.message).
 */
export function createCompletionHooks(ctx: PluginInput, _config: CoderConfig): CompletionHooks {
	const startTimes = new Map<string, { startedAt: number; agent?: string; model?: string }>();

	return {
		onParams(input: unknown): void {
			const inp = input as {
				sessionID?: string;
				agent?: string;
				model?: string;
			};
			if (!inp.sessionID) return;
			startTimes.set(inp.sessionID, {
				startedAt: Date.now(),
				agent: inp.agent,
				model: inp.model,
			});
		},

		onMessage(input: unknown): void {
			const inp = input as { sessionID?: string };
			if (!inp.sessionID) return;

			const start = startTimes.get(inp.sessionID);
			if (!start) return;

			const durationMs = Date.now() - start.startedAt;
			const durationSec = (durationMs / 1000).toFixed(1);

			const logLine = `Completion: agent=${start.agent ?? 'unknown'} model=${start.model ?? 'unknown'} duration=${durationSec}s`;

			// Verbose local logging for immediate visibility
			console.debug(`[agentuity-coder] ${logLine}`);

			// Also send to the OpenCode log service
			ctx.client.app.log({
				body: {
					service: 'agentuity-coder',
					level: 'debug',
					message: logLine,
				},
			});

			// Clean up after logging
			startTimes.delete(inp.sessionID);
		},
	};
}
