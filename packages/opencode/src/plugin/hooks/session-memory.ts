import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types.ts';
import type { OpenCodeDBReader } from '../../sqlite/index.ts';
import type { CompactionStats } from '../../sqlite/types.ts';
import {
	getCurrentBranch,
	buildCustomCompactionPrompt,
	fetchAndFormatPlanningState,
	getImageDescriptions,
	getRecentToolCallSummaries,
	storePreCompactionSnapshot,
	formatCompactionDiagnostics,
	countListItems,
} from './compaction-utils.ts';

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
	config: CoderConfig,
	dbReader?: OpenCodeDBReader
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
		 * Uses output.prompt to REPLACE the default compaction prompt with
		 * enriched context (planning state, images, tool calls, diagnostics).
		 */
		async onCompacting(
			input: { sessionID: string },
			output: { context: string[]; prompt?: string }
		): Promise<void> {
			const sessionId = input.sessionID;
			log(`Compacting session ${sessionId}`);

			// Config flags for compaction behavior
			const compactionCfg = config?.compaction ?? {};
			const useCustomPrompt = compactionCfg.customPrompt !== false;
			const useInlinePlanning = compactionCfg.inlinePlanning !== false;
			const useImageAwareness = compactionCfg.imageAwareness !== false;
			const useSnapshotToKV = compactionCfg.snapshotToKV !== false;
			const maxTokens = compactionCfg.maxContextTokens ?? 4000;

			// 1. Build custom compaction instructions
			const instructions = useCustomPrompt ? buildCustomCompactionPrompt('regular') : null;

			// 2. Gather enrichment data in parallel
			const toolCallLimit = config?.compaction?.toolCallSummaryLimit ?? 5;
			const [branch, planningState, imageDescs, toolSummaries] = await Promise.all([
				getCurrentBranch(),
				useInlinePlanning ? fetchAndFormatPlanningState(sessionId) : Promise.resolve(null),
				useImageAwareness
					? Promise.resolve(getImageDescriptions(dbReader ?? null, sessionId))
					: Promise.resolve(null),
				Promise.resolve(getRecentToolCallSummaries(dbReader ?? null, sessionId, toolCallLimit)),
			]);

			// 3. Build session state section
			const sessionStateSection = `## Session Memory

This session's context is being saved to persistent memory.
Session record location: \`session:${sessionId}\` in agentuity-opencode-memory
Current branch: ${branch}

After compaction:
1. Memory will save this summary to the session record
2. If planning is active, Memory should update planning.progress with this compaction
3. Memory will apply inline reasoning if significant patterns/corrections emerged`;

			// 4. Combine everything into the full prompt
			const sections: string[] = [];
			if (instructions) sections.push(instructions);
			sections.push(sessionStateSection);
			if (planningState) sections.push(planningState);
			if (imageDescs) sections.push(imageDescs);
			if (toolSummaries) sections.push(toolSummaries);

			// 5. Add diagnostics
			const stats: CompactionStats = {
				planningPhasesCount: countListItems(planningState),
				imageDescriptionsCount: countListItems(imageDescs),
				toolCallSummariesCount: countListItems(toolSummaries),
				estimatedTokens: Math.ceil(sections.join('\n\n').length / 4),
			};
			const diagnostics = formatCompactionDiagnostics(stats);
			if (diagnostics) sections.push(diagnostics);

			// 6. Enforce token budget
			let fullPrompt = sections.join('\n\n');
			const estimatedTokens = Math.ceil(fullPrompt.length / 4);
			if (maxTokens > 0 && estimatedTokens > maxTokens) {
				// Trim least-critical sections first
				const trimOrder = [diagnostics, toolSummaries, imageDescs, planningState].filter(
					Boolean
				);
				let trimmed = [...sections];
				for (const candidate of trimOrder) {
					if (Math.ceil(trimmed.join('\n\n').length / 4) <= maxTokens) break;
					trimmed = trimmed.filter((s) => s !== candidate);
				}
				fullPrompt = trimmed.join('\n\n');
			}

			// 7. Set the full prompt or push to context
			if (useCustomPrompt) {
				output.prompt = fullPrompt;
			} else {
				output.context.push(fullPrompt);
			}

			// 8. Store pre-compaction snapshot to KV (fire-and-forget)
			if (useSnapshotToKV) {
				storePreCompactionSnapshot(sessionId, {
					timestamp: new Date().toISOString(),
					sessionId,
					planningState: planningState ? { raw: planningState } : undefined,
					branch,
				}).catch(() => {}); // Fire and forget
			}
		},
	};
}
