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
			// OpenCode passes agent and model as structured objects (not plain strings)
			// in the chat.params hook. Normalize to string here so template literals
			// don't produce '[object Object]' in the completion log.
			const inp = input as {
				sessionID?: string;
				agent?: unknown;
				model?: unknown;
			};
			if (!inp.sessionID) return;

			const agentStr =
				typeof inp.agent === 'string'
					? inp.agent
					: ((inp.agent as { id?: string; name?: string; displayName?: string } | null)
							?.displayName ??
						(inp.agent as { id?: string; name?: string } | null)?.name ??
						(inp.agent as { id?: string } | null)?.id ??
						String(inp.agent ?? 'unknown'));

			const modelStr =
				typeof inp.model === 'string'
					? inp.model
					: ((inp.model as { id?: string; name?: string } | null)?.id ??
						(inp.model as { name?: string } | null)?.name ??
						String(inp.model ?? 'unknown'));

			startTimes.set(inp.sessionID, {
				startedAt: Date.now(),
				agent: agentStr,
				model: modelStr,
			});
		},

		onMessage(input: unknown): void {
			const inp = input as { sessionID?: string };
			if (!inp.sessionID) return;

			const start = startTimes.get(inp.sessionID);
			if (!start) return;

			const durationMs = Date.now() - start.startedAt;
			const durationSec = (durationMs / 1000).toFixed(1);

			const logLine = `Completion: agent=${start.agent} model=${start.model} duration=${durationSec}s`;

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
