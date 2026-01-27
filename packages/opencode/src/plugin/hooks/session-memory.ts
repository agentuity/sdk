import type { PluginContext, CoderConfig, CompactingInput, CompactingOutput } from '../../types';

/**
 * Minimal session state - just tracks whether we've checkpointed.
 */
interface SessionState {
	sessionId: string;
	hasCheckpoint: boolean;
}

export interface SessionMemoryHooks {
	onEvent: (input: unknown) => Promise<void>;
	onCompacting: (input: CompactingInput, output: CompactingOutput) => Promise<void>;
}

/**
 * Session memory hooks handle checkpointing and compaction recovery.
 *
 * This module is ONLY called for non-Cadence sessions.
 * The orchestration (deciding which module handles which session) happens in plugin.ts.
 *
 * Checkpoint trigger: session.idle (to avoid interrupting active work)
 * Recovery: on compaction, inject instructions pointing to Memory
 */
export function createSessionMemoryHooks(
	ctx: PluginContext,
	_config: CoderConfig
): SessionMemoryHooks {
	const sessionStates = new Map<string, SessionState>();

	const log = (msg: string) => {
		ctx.client.app.log({
			body: {
				service: 'session-memory',
				level: 'debug',
				message: msg,
			},
		});
	};

	const getOrCreateState = (sessionId: string): SessionState => {
		let state = sessionStates.get(sessionId);
		if (!state) {
			state = { sessionId, hasCheckpoint: false };
			sessionStates.set(sessionId, state);
		}
		return state;
	};

	const triggerCheckpoint = async (sessionId: string, state: SessionState): Promise<void> => {
		log(`Triggering Memory checkpoint for session ${sessionId}`);

		state.hasCheckpoint = true;

		try {
			await ctx.client.session?.prompt?.({
				path: { id: sessionId },
				body: {
					parts: [
						{
							type: 'text',
							text: `[SESSION CHECKPOINT]

Save a checkpoint for session ${sessionId}.

Summarize the current session state and save to:
- KV: \`session:${sessionId}:checkpoint\` in agentuity-opencode-tasks
- Vector: \`session:${sessionId}\` in agentuity-opencode-sessions

This is an auto-checkpoint for compaction recovery. Keep it concise but comprehensive.`,
						},
					],
					agent: 'Agentuity Coder Memory',
				},
			});

			showToast(ctx, 'Session checkpoint saved');
		} catch (err) {
			log(`Checkpoint failed: ${err}`);
			state.hasCheckpoint = false;
		}
	};

	return {
		/**
		 * Listen for session.idle (checkpoint) and session.compacted (recovery).
		 */
		async onEvent(input: unknown): Promise<void> {
			const event = extractEvent(input);
			if (!event?.sessionId) return;

			const state = getOrCreateState(event.sessionId);

			// Checkpoint on idle (won't interrupt active work)
			if (event.type === 'session.idle') {
				await triggerCheckpoint(event.sessionId, state);
			}

			// Post-compaction: Prompt Lead to recover (only if checkpoint exists)
			if (event.type === 'session.compacted' && state.hasCheckpoint) {
				log(`Post-compaction recovery for session ${event.sessionId}`);

				try {
					await ctx.client.session?.prompt?.({
						path: { id: event.sessionId },
						body: {
							parts: [
								{
									type: 'text',
									text: `Context was compacted. Ask @Agentuity Coder Memory for session checkpoint: session:${event.sessionId}:checkpoint. Continue with your current task.`,
								},
							],
							agent: 'Agentuity Coder Lead',
						},
					});
				} catch (err) {
					log(`Failed to prompt recovery: ${err}`);
				}
			}
		},

		/**
		 * Inject recovery instructions during compaction.
		 */
		async onCompacting(input: CompactingInput, output: CompactingOutput): Promise<void> {
			const sessionId = input.sessionID;
			const state = sessionStates.get(sessionId);

			log(`Compacting session ${sessionId}, hasCheckpoint: ${state?.hasCheckpoint}`);

			const checkpointNote = state?.hasCheckpoint
				? `**Checkpoint available:** Ask @Agentuity Coder Memory for \`session:${sessionId}:checkpoint\``
				: `**No checkpoint saved.** Memory may have related context from past sessions.`;

			output.context.push(`
## Session Context Recovery

This session was compacted to manage context window.

${checkpointNote}

**To recover context:** Ask @Agentuity Coder Memory for any saved context, then continue with your current task.
`);
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function extractEvent(input: unknown): { type: string; sessionId?: string } | undefined {
	if (typeof input !== 'object' || input === null) return undefined;

	const inp = input as { event?: { type?: string; properties?: Record<string, unknown> } };
	if (!inp.event || typeof inp.event.type !== 'string') return undefined;

	const sessionId =
		(inp.event.properties?.sessionId as string | undefined) ??
		(inp.event.properties?.sessionID as string | undefined);

	return { type: inp.event.type, sessionId };
}

function showToast(ctx: PluginContext, message: string): void {
	try {
		ctx.client.tui?.showToast?.({ body: { message } });
	} catch {
		// Toast may not be available
	}
}
