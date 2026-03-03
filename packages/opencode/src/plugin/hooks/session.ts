import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types.ts';

export interface SessionHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
}

export function createSessionHooks(_ctx: PluginInput, _config: CoderConfig): SessionHooks {
	const initializedSessions = new Set<string>();

	return {
		async onMessage(input: unknown, _output: unknown): Promise<void> {
			const sessionId = extractSessionId(input);
			if (!sessionId) return;

			if (!initializedSessions.has(sessionId)) {
				initializedSessions.add(sessionId);
			}
		},
	};
}

function extractSessionId(input: unknown): string | undefined {
	if (typeof input === 'object' && input !== null && 'sessionID' in input) {
		return (input as { sessionID: string }).sessionID;
	}
	return undefined;
}
