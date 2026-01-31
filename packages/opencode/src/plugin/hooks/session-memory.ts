import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';

export interface SessionMemoryHooks {
	onEvent: (input: {
		event: { type: string; properties?: Record<string, unknown> };
	}) => Promise<void>;
	onCompacting: (
		input: { sessionID: string },
		output: { context: string[]; prompt?: string }
	) => Promise<void>;
}

/**
 * Session memory hooks handle compaction for non-Cadence sessions.
 *
 * Strategy:
 * 1. On compacting: Inject Memory system info into compaction prompt
 * 2. On session.compacted: Tell Lead to have Memory save the summary (it's already in context!)
 */
export function createSessionMemoryHooks(
	ctx: PluginInput,
	_config: CoderConfig
): SessionMemoryHooks {
	const log = (msg: string) => {
		ctx.client.app.log({
			body: {
				service: 'session-memory',
				level: 'debug',
				message: msg,
			},
		});
	};

	return {
		/**
		 * Listen for session.compacted event.
		 * The compaction summary is already in context - just tell Lead to save it.
		 */
		async onEvent(input: {
			event: { type: string; properties?: Record<string, unknown> };
		}): Promise<void> {
			const { event } = input;
			if (event?.type !== 'session.compacted') return;

			const sessionId =
				(event.properties?.sessionId as string | undefined) ??
				(event.properties?.sessionID as string | undefined);

			if (!sessionId) return;

			log(`Compaction complete for session ${sessionId} - triggering memory save`);

			try {
				await ctx.client.session.prompt({
					path: { id: sessionId },
					body: {
						parts: [
							{
								type: 'text',
								text: `[COMPACTION COMPLETE]

The compaction summary above contains our session context.

Have @Agentuity Coder Memory save this compaction:
1. Get existing session record (or create new): \`agentuity cloud kv get agentuity-opencode-memory "session:${sessionId}" --json --region use\`
2. Append this compaction summary to the \`compactions\` array with timestamp
3. Save back: \`agentuity cloud kv set agentuity-opencode-memory "session:${sessionId}" '{...}' --region use\`
4. Upsert to Vector for semantic search: \`agentuity cloud vector upsert agentuity-opencode-sessions "session:${sessionId}" --document "..." --metadata '...' --region use\`

After saving the compaction:
1. Read back the session record from KV
2. Return to Lead the PREVIOUS compactions only (not the one just saved - Lead already has the current compaction in context)
3. Format as a readable summary with timestamps
4. Include "what's next" - the user's pending request if there is one

After saving the compaction, Memory should consider triggering Reasoner:
- If significant patterns, decisions, or corrections emerged
- Use: agentuity_background_task({ agent: "reasoner", task: "Extract conclusions from session...", description: "Reason about session" })
- Reasoner will update entity representations with new conclusions

Response format:
\`\`\`
## Prior Session History: ${sessionId}

### Compaction 1 (timestamp)
[summary]

### Compaction 2 (timestamp)
[summary]

(Current compaction already in your context)

## What's Next
[User's pending request if there is one]
\`\`\`

If no prior compactions exist:
\`\`\`
## Prior Session History: ${sessionId}

No prior compactions - this is the first one.

## What's Next
[User's pending request if there is one]
\`\`\`

Then continue with the current task if there is one.`,
							},
						],
						agent: 'Agentuity Coder Lead',
					},
				});

				log(`Memory save triggered for session ${sessionId}`);
			} catch (err) {
				log(`Failed to trigger memory save: ${err}`);
			}
		},

		/**
		 * Inject Memory system info during compaction.
		 * This gets included in OpenCode's generated summary.
		 */
		async onCompacting(
			input: { sessionID: string },
			output: { context: string[]; prompt?: string }
		): Promise<void> {
			const sessionId = input.sessionID;
			log(`Compacting session ${sessionId}`);

			output.context.push(`
## Session Memory

This session's context is being saved to persistent memory.
Session record location: \`session:${sessionId}\` in agentuity-opencode-memory

After compaction, Memory will automatically save this summary for future recovery.
`);
		},
	};
}
