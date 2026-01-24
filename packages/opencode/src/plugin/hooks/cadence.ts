import type { PluginContext, CoderConfig, CompactingInput, CompactingOutput } from '../../types';

export interface CadenceHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
	onEvent: (input: unknown) => Promise<void>;
	onCompacting: (input: CompactingInput, output: CompactingOutput) => Promise<void>;
}

const COMPLETION_PATTERN = /<promise>\s*DONE\s*<\/promise>/i;

// Ultrawork trigger keywords - case insensitive matching
const ULTRAWORK_TRIGGERS = [
	'ultrawork',
	'ultrathink',
	'ulw',
	'just do it',
	'work hard',
	'plan hard',
	'take a long time',
	'as long as you need',
	'go deep',
	'be thorough',
];

// Track Cadence state per session for context injection
interface CadenceSessionState {
	startedAt: string;
	loopId?: string;
	iteration: number;
	maxIterations: number;
	lastActivity: string;
}

/**
 * Cadence hooks track which sessions are in long-running Cadence mode.
 *
 * These hooks handle:
 * 1. Detect when Cadence mode starts (via command, [CADENCE MODE] tag, or ultrawork triggers)
 * 2. Detect when Cadence completes (via <promise>DONE</promise>)
 * 3. Inject context during compaction (experimental.session.compacting)
 * 4. Trigger continuation after compaction (session.compacted)
 * 5. Clean up on session abort/error
 */
export function createCadenceHooks(ctx: PluginContext, _config: CoderConfig): CadenceHooks {
	const activeCadenceSessions = new Map<string, CadenceSessionState>();

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

			// Check if this is a Cadence start command or ultrawork trigger
			const cadenceType = getCadenceTriggerType(messageText);
			if (cadenceType && !activeCadenceSessions.has(sessionId)) {
				log(`Cadence started for session ${sessionId} via ${cadenceType}`);
				const now = new Date().toISOString();
				const state: CadenceSessionState = {
					startedAt: now,
					iteration: 1,
					maxIterations: 50,
					lastActivity: now,
				};
				activeCadenceSessions.set(sessionId, state);

				// If triggered by ultrawork keywords, inject [CADENCE MODE] tag
				if (cadenceType === 'ultrawork') {
					injectCadenceTag(output);
				}

				await injectStatusMessage(ctx, sessionId, state);
				return;
			}

			// Check if this session is in Cadence mode
			const state = activeCadenceSessions.get(sessionId);
			if (!state) {
				return;
			}

			// Update last activity
			state.lastActivity = new Date().toISOString();

			// Try to extract structured CADENCE_STATUS tag first
			// Format: CADENCE_STATUS loopId={id} iteration={N} maxIterations={max} status={status}
			const statusMatch = messageText.match(
				/CADENCE_STATUS\s+loopId=(\S+)\s+iteration=(\d+)\s+maxIterations=(\d+)\s+status=(\S+)/i
			);
			if (statusMatch) {
				const [, loopId, iteration, maxIterations] = statusMatch;
				const newIteration = parseInt(iteration, 10);
				const newMax = parseInt(maxIterations, 10);
				const changed =
					state.loopId !== loopId ||
					state.iteration !== newIteration ||
					state.maxIterations !== newMax;

				state.loopId = loopId;
				state.iteration = newIteration;
				state.maxIterations = newMax;

				if (changed) {
					await injectStatusMessage(ctx, sessionId, state);
				}
				return;
			}

			// Fallback: try to extract iteration from loose "iteration: N" pattern
			const iterMatch = messageText.match(/iteration[:\s]+(\d+)/i);
			if (iterMatch) {
				const newIteration = parseInt(iterMatch[1], 10);
				if (newIteration !== state.iteration) {
					state.iteration = newIteration;
					await injectStatusMessage(ctx, sessionId, state);
				}
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

			// Handle session.compacted - trigger continuation after compaction completes
			if (event.type === 'session.compacted') {
				const sessionId = event.sessionId;
				if (!sessionId) return;

				const state = activeCadenceSessions.get(sessionId);
				if (!state) return;

				log(`Compaction completed for Cadence session ${sessionId} - triggering continuation`);
				showToast(ctx, '🔄 Context compacted, resuming Cadence...');

				// Inject continuation prompt if session.prompt is available
				try {
					await ctx.client.session?.prompt?.({
						path: { id: sessionId },
						body: {
							parts: [
								{
									type: 'text',
									text: `[CADENCE CONTINUATION]

Context was just compacted. Resume the Cadence loop:

1. Ask Memory for the latest checkpoint and any compaction snapshots
2. Review the current iteration state from KV
3. Continue with the next step in the iteration workflow
4. Do NOT restart from the beginning - pick up where you left off

Continue executing the task.`,
								},
							],
							agent: 'Agentuity Coder Lead',
						},
					});
				} catch (err) {
					log(`Failed to inject continuation prompt: ${err}`);
					// Continuation will rely on auto-generated "Continue if you have next steps"
				}
			}

			// Handle session.idle - log for debugging/monitoring
			if (event.type === 'session.idle' || event.type === 'session.status') {
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

		/**
		 * Called during context compaction to inject Cadence state.
		 * This ensures the compaction summary includes critical loop state.
		 */
		async onCompacting(input: CompactingInput, output: CompactingOutput): Promise<void> {
			const sessionId = input.sessionID;
			const state = activeCadenceSessions.get(sessionId);

			if (!state) {
				// Not a Cadence session, nothing to inject
				return;
			}

			log(`Injecting Cadence context during compaction for session ${sessionId}`);
			showToast(ctx, '💾 Compacting Cadence context...');

			const loopIdStr = state.loopId ?? '{loopId}';

			// Inject Cadence state into the compaction context
			output.context.push(`
## CADENCE MODE ACTIVE

This session is running in Cadence mode (long-running autonomous loop).

**Cadence State:**
- Loop ID: ${state.loopId ?? 'unknown'}
- Started: ${state.startedAt}
- Iteration: ${state.iteration} / ${state.maxIterations}
- Last activity: ${state.lastActivity}

**CRITICAL: After compaction, you MUST:**
1. Ask @Agentuity Coder Memory for the latest checkpoint and compaction snapshots
2. Read the loop state from KV: \`agentuity cloud kv get agentuity-opencode-tasks "loop:${loopIdStr}:state"\`
3. Emit CADENCE_STATUS tag with current state
4. Continue the iteration workflow from where you left off
5. Do NOT restart the task from the beginning

**Memory Keys to Query:**
- \`loop:${loopIdStr}:state\` - Current loop state
- \`loop:${loopIdStr}:checkpoint:{N}\` - Iteration checkpoints
- \`loop:${loopIdStr}:compaction:{N}\` - Compaction snapshots

Resume the Cadence loop after this compaction completes.
`);
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

	const sessionId =
		(inp.event.properties?.sessionId as string | undefined) ??
		(inp.event.properties?.sessionID as string | undefined);
	return { type: inp.event.type, sessionId };
}

type CadenceTriggerType = 'explicit' | 'ultrawork' | null;

function getCadenceTriggerType(text: string): CadenceTriggerType {
	// Explicit cadence triggers
	if (text.includes('[CADENCE MODE]') || text.includes('agentuity-cadence')) {
		return 'explicit';
	}

	// Check for ultrawork triggers (case insensitive)
	const lowerText = text.toLowerCase();
	if (ULTRAWORK_TRIGGERS.some((trigger) => lowerText.includes(trigger))) {
		return 'ultrawork';
	}

	return null;
}

function injectCadenceTag(output: unknown): void {
	if (typeof output !== 'object' || output === null) return;

	const out = output as { parts?: Array<{ type?: string; text?: string }> };
	if (!out.parts || !Array.isArray(out.parts)) return;

	for (const part of out.parts) {
		if (part.type === 'text' && part.text) {
			part.text = `[CADENCE MODE]\n\n${part.text}`;
			return;
		}
	}
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

async function injectStatusMessage(
	ctx: PluginContext,
	sessionId: string,
	state: CadenceSessionState
): Promise<void> {
	try {
		const elapsed = getElapsedTime(state.startedAt);
		const loopInfo = state.loopId ? ` · ${state.loopId}` : '';
		const status = `⚡ **Cadence** · ${state.iteration}/${state.maxIterations}${loopInfo} · ${elapsed}`;

		await ctx.client.session?.prompt?.({
			path: { id: sessionId },
			body: {
				parts: [{ type: 'text', text: status }],
			},
			noReply: true,
		});
	} catch {
		// Status injection may not be available
	}
}

function getElapsedTime(startedAt: string): string {
	if (!startedAt) return '-';

	const start = new Date(startedAt).getTime();
	if (isNaN(start)) return '-';

	const now = Date.now();
	const seconds = Math.floor((now - start) / 1000);

	if (seconds < 0) return '-';
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
