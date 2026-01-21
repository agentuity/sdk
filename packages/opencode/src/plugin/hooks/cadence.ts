import type { PluginContext, CoderConfig } from '../../types';

export interface CadenceHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
	onEvent: (input: unknown) => Promise<void>;
}

const COMPLETION_PATTERN = /<promise>\s*DONE\s*<\/promise>/i;

/**
 * Cadence hooks track which sessions are in long-running Cadence mode.
 *
 * The actual continuation logic is agentic - Lead manages its own state and
 * continuation via KV storage and the Cadence mode instructions in its prompt.
 * These hooks primarily:
 * 1. Detect when Cadence mode starts (via command or [CADENCE MODE] tag)
 * 2. Detect when Cadence completes (via <promise>DONE</promise>)
 * 3. Clean up on session abort/error
 */
export function createCadenceHooks(ctx: PluginContext, _config: CoderConfig): CadenceHooks {
	const activeCadenceSessions = new Set<string>();

	const log = (msg: string) => {
		ctx.client.app.log({
			body: {
				service: 'coder-cadence',
				level: 'debug',
				message: msg,
			},
		});
	};

	return {
		async onMessage(input: unknown, output: unknown): Promise<void> {
			const sessionId = extractSessionId(input);
			if (!sessionId) return;

			const messageText = extractMessageText(output);
			if (!messageText) return;

			// Check if this is a Cadence start command
			if (isCadenceStart(messageText)) {
				log(`Cadence started for session ${sessionId}`);
				activeCadenceSessions.add(sessionId);
				return;
			}

			// Check if this session is in Cadence mode
			if (!activeCadenceSessions.has(sessionId)) {
				return;
			}

			// Check for completion signal
			if (COMPLETION_PATTERN.test(messageText)) {
				log(`Cadence completed for session ${sessionId}`);
				activeCadenceSessions.delete(sessionId);
				showToast(ctx, '✅ Cadence loop completed!');
				return;
			}

			// Check for explicit stop/cancel
			if (isCadenceStop(messageText)) {
				log(`Cadence stopped for session ${sessionId}`);
				activeCadenceSessions.delete(sessionId);
				return;
			}
		},

		async onEvent(input: unknown): Promise<void> {
			const event = extractEvent(input);
			if (!event) return;

			log(`Event received: ${event.type}`);

			// Handle session.idle - log for debugging/monitoring
			// Actual continuation is agentic: Lead manages its own state via KV
			if (event.type === 'session.idle') {
				const sessionId = event.sessionId;
				if (!sessionId) return;

				if (activeCadenceSessions.has(sessionId)) {
					log(`Session ${sessionId} idle while in Cadence mode`);
				}
			}

			// Handle session abort
			if (event.type === 'session.abort' || event.type === 'session.error') {
				const sessionId = event.sessionId;
				if (sessionId && activeCadenceSessions.has(sessionId)) {
					log(`Cadence aborted for session ${sessionId}`);
					activeCadenceSessions.delete(sessionId);
				}
			}
		},
	};
}

function extractSessionId(input: unknown): string | undefined {
	if (typeof input !== 'object' || input === null) return undefined;
	const inp = input as Record<string, unknown>;
	if (typeof inp.sessionID === 'string') return inp.sessionID;
	if (typeof inp.sessionId === 'string') return inp.sessionId;
	return undefined;
}

function extractMessageText(output: unknown): string | undefined {
	if (typeof output !== 'object' || output === null) return undefined;

	// Try parts array (Open Code format)
	const out = output as { parts?: Array<{ type?: string; text?: string }>; text?: string };
	if (out.parts && Array.isArray(out.parts)) {
		for (const part of out.parts) {
			if (part.type === 'text' && part.text) {
				return part.text;
			}
		}
	}

	// Try direct text property
	if (typeof out.text === 'string') {
		return out.text;
	}

	return undefined;
}

function extractEvent(input: unknown): { type: string; sessionId?: string } | undefined {
	if (typeof input !== 'object' || input === null) return undefined;

	const inp = input as { event?: { type?: string; properties?: Record<string, unknown> } };
	if (!inp.event || typeof inp.event.type !== 'string') return undefined;

	const sessionId = inp.event.properties?.sessionId as string | undefined;
	return { type: inp.event.type, sessionId };
}

function isCadenceStart(text: string): boolean {
	return text.includes('[CADENCE MODE]') || text.includes('agentuity-cadence');
}

function isCadenceStop(text: string): boolean {
	return (
		text.includes('status: "cancelled"') ||
		text.includes("status: 'cancelled'") ||
		text.includes('status":"cancelled')
	);
}

function showToast(ctx: PluginContext, message: string): void {
	try {
		ctx.client.tui?.showToast?.({ body: { message } });
	} catch {
		// Toast may not be available
	}
}
