import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';
import type { BackgroundManager } from '../../background';

/**
 * Get the current git branch name.
 */
async function getCurrentBranch(): Promise<string> {
	try {
		const proc = Bun.spawn(['git', 'branch', '--show-current'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const stdout = await new Response(proc.stdout).text();
		await proc.exited;
		return stdout.trim() || 'unknown';
	} catch {
		return 'unknown';
	}
}

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
	_config: CoderConfig,
	backgroundManager?: BackgroundManager
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
		 *
		 * Note: Compaction continues in the SAME session (via session.prompt with
		 * the existing sessionId), so permissions configured in the config hook
		 * (plugin.ts) are automatically inherited — no re-application needed.
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
				const branch = await getCurrentBranch();

				await ctx.client.session.prompt({
					path: { id: sessionId },
					body: {
						parts: [
							{
								type: 'text',
								text: `[COMPACTION COMPLETE]

The compaction summary above contains our session context.
Current branch: ${branch}

Have @Agentuity Coder Memory save this compaction:
1. Get existing session record (or create new): \`agentuity cloud kv get agentuity-opencode-memory "session:${sessionId}" --json --region use\`
2. Ensure branch field is set to "${branch}"
3. Append this compaction summary to the \`compactions\` array with timestamp
4. Save back: \`agentuity cloud kv set agentuity-opencode-memory "session:${sessionId}" '{...}' --region use\`
5. Upsert to Vector for semantic search: \`agentuity cloud vector upsert agentuity-opencode-sessions "session:${sessionId}" --document "..." --metadata '...' --region use\`

After saving the compaction:
1. Read back the session record from KV
2. Return to Lead the PREVIOUS compactions only (not the one just saved - Lead already has the current compaction in context)
3. Format as a readable summary with timestamps
4. Include "what's next" - the user's pending request if there is one

After saving the compaction, Memory should apply inline reasoning:
- If significant patterns, decisions, or corrections emerged
- Extract conclusions (explicit, deductive, inductive, abductive, corrections)
- Update entity representations with new conclusions
- Assign salience scores to conclusions

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

			// Get current git branch
			const branch = await getCurrentBranch();

			// Get active background tasks for this session
			const tasks = backgroundManager?.getTasksByParent(sessionId) ?? [];
			let backgroundTaskContext = '';

			if (tasks.length > 0) {
				const taskList = tasks
					.map(
						(t) =>
							`- **${t.id}**: ${t.description || 'No description'} (session: ${t.sessionId ?? 'pending'}, status: ${t.status})`
					)
					.join('\n');

				backgroundTaskContext = `

## Active Background Tasks

This session has ${tasks.length} background task(s) running in separate sessions:
${taskList}

**CRITICAL:** Task IDs and session IDs persist across compaction - these tasks are still running.
Use \`agentuity_background_output({ task_id: "..." })\` to check their status.
`;
			}

			output.context.push(`
## Session Memory

This session's context is being saved to persistent memory.
Session record location: \`session:${sessionId}\` in agentuity-opencode-memory
Current branch: ${branch}

**Planning State (if active):**
If this session has planning active (user requested "track progress" or similar), the session record contains:
- \`planning.prdKey\` - Link to PRD if one exists
- \`planning.objective\` - What we're trying to accomplish
- \`planning.phases\` - Current phases with status and notes
- \`planning.findings\` - Discoveries made during work
- \`planning.errors\` - Failures to avoid repeating
${backgroundTaskContext}
After compaction:
1. Memory will save this summary to the session record
2. If planning is active, Memory should update planning.progress with this compaction
3. Memory will apply inline reasoning if significant patterns/corrections emerged
`);
		},
	};
}
