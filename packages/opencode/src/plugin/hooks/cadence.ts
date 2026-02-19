import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';
import type { BackgroundManager } from '../../background';
import type { OpenCodeDBReader, SessionTreeNode } from '../../sqlite';
import type { CompactionStats } from '../../sqlite/types';
import {
	getCurrentBranch,
	buildCustomCompactionPrompt,
	fetchAndFormatPlanningState,
	getImageDescriptions,
	getRecentToolCallSummaries,
	storePreCompactionSnapshot,
	persistCadenceStateToKV,
	restoreCadenceStateFromKV,
	formatCompactionDiagnostics,
	countListItems,
} from './compaction-utils';

/** Compacting hook input/output types */
type CompactingInput = { sessionID: string };
type CompactingOutput = { context: string[]; prompt?: string };

export interface CadenceHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
	onEvent: (input: unknown) => Promise<void>;
	onCompacting: (input: CompactingInput, output: CompactingOutput) => Promise<void>;
	/** Check if a session is currently in Cadence mode */
	isActiveCadenceSession: (sessionId: string) => boolean;
	/** Lazy restore: check KV for persisted Cadence state and populate in-memory Map */
	tryRestoreFromKV: (sessionId: string) => Promise<boolean>;
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
export function createCadenceHooks(
	ctx: PluginInput,
	config: CoderConfig,
	backgroundManager?: BackgroundManager,
	dbReader?: OpenCodeDBReader,
	lastUserMessages?: Map<string, string>
): CadenceHooks {
	const activeCadenceSessions = new Map<string, CadenceSessionState>();
	const nonCadenceSessions = new Set<string>();

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

			// Use the USER's message (from chat.params) for trigger detection,
			// not the model's output — avoids false positives when the model
			// uses phrases like "go deep" or "be thorough" in its response.
			// Delete after read — entries are transient (set in chat.params,
			// consumed here in chat.message) so no unbounded Map growth.
			const userText = lastUserMessages?.get(sessionId) ?? '';
			lastUserMessages?.delete(sessionId);
			const cadenceType = getCadenceTriggerType(userText);
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
				nonCadenceSessions.delete(sessionId);
				persistCadenceStateToKV(sessionId, { ...state }).catch(() => {});

				// If triggered by ultrawork keywords, inject [CADENCE MODE] tag
				if (cadenceType === 'ultrawork') {
					injectCadenceTag(output);
				}

				showToast(ctx, `⚡ Cadence started · ${state.iteration}/${state.maxIterations}`);
				return;
			}

			// Everything below parses the MODEL's output for structured tags
			// (CADENCE_STATUS, iteration counts, completion signals) that the
			// model intentionally emits — these are NOT false-positive-prone.
			const messageText = extractMessageText(output);
			if (!messageText) return;

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
				if (!iteration || !maxIterations) return;
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
					const loopInfo = state.loopId ? ` · ${state.loopId}` : '';
					showToast(ctx, `⚡ Cadence · ${state.iteration}/${state.maxIterations}${loopInfo}`);
					persistCadenceStateToKV(sessionId, { ...state }).catch(() => {});
				}
				return;
			}

			// Fallback: try to extract iteration from loose "iteration: N" pattern
			const iterMatch = messageText.match(/iteration[:\s]+(\d+)/i);
			if (iterMatch && iterMatch[1]) {
				const newIteration = parseInt(iterMatch[1], 10);
				if (newIteration !== state.iteration) {
					state.iteration = newIteration;
					const loopInfo = state.loopId ? ` · ${state.loopId}` : '';
					showToast(ctx, `⚡ Cadence · ${state.iteration}/${state.maxIterations}${loopInfo}`);
					persistCadenceStateToKV(sessionId, { ...state }).catch(() => {});
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

			// Handle session.compacted - save compaction AND continue loop
			if (event.type === 'session.compacted') {
				const sessionId = event.sessionId;
				if (!sessionId) return;

				const state = activeCadenceSessions.get(sessionId);
				if (!state) return;

				log(`Compaction completed for Cadence session ${sessionId} - saving and continuing`);
				showToast(ctx, '🔄 Compaction saved, resuming Cadence...');

				// Get current git branch
				const branch = await getCurrentBranch();

				try {
					await ctx.client.session?.prompt?.({
						path: { id: sessionId },
						body: {
							parts: [
								{
									type: 'text',
									text: `[CADENCE COMPACTION COMPLETE]

The compaction summary above contains our Cadence session context.

Current branch: ${branch}

1. Have @Agentuity Coder Memory save this compaction:
   - Get existing session: \`agentuity cloud kv get agentuity-opencode-memory "session:${sessionId}" --json --region use\`
   - Append compaction to \`compactions\` array with timestamp
   - Ensure \`cadence\` object exists with: loopId="${state.loopId ?? 'unknown'}", iteration=${state.iteration}, maxIterations=${state.maxIterations}, status="active"
   - Save back to KV and upsert to Vector

After saving the compaction:
1. Read back the session record from KV
2. Return to Lead the PREVIOUS compactions only (not the one just saved - Lead already has the current compaction in context)
3. Format as a readable summary with timestamps
4. Include "what's next" - the Cadence iteration to continue

Response format:
\`\`\`
## Prior Session History: ${sessionId}

### Compaction 1 (timestamp)
[summary]

### Compaction 2 (timestamp)
[summary]

(Current compaction already in your context)

## What's Next
Continue Cadence iteration ${state.iteration} of ${state.maxIterations}
\`\`\`

If no prior compactions exist:
\`\`\`
## Prior Session History: ${sessionId}

No prior compactions - this is the first one.

## What's Next
Continue Cadence iteration ${state.iteration} of ${state.maxIterations}
\`\`\`

2. Then continue the Cadence loop:
   - Review the compaction summary above for context
   - Continue with iteration ${state.iteration}
   - Do NOT restart from the beginning - pick up where we left off`,
								},
							],
							agent: 'Agentuity Coder Lead',
						},
					});
				} catch (err) {
					log(`Failed to save compaction and continue: ${err}`);
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
		 * Uses output.prompt to REPLACE the default compaction prompt with
		 * enriched context (planning state, images, tool calls, diagnostics).
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

			// Config flags for compaction behavior
			const compactionCfg = config?.compaction ?? {};
			const useCustomPrompt = compactionCfg.customPrompt !== false;
			const useInlinePlanning = compactionCfg.inlinePlanning !== false;
			const useImageAwareness = compactionCfg.imageAwareness !== false;
			const useSnapshotToKV = compactionCfg.snapshotToKV !== false;
			const maxTokens = compactionCfg.maxContextTokens ?? 4000;

			// 1. Build custom compaction instructions
			const instructions = useCustomPrompt ? buildCustomCompactionPrompt('cadence') : null;

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

			// 3. Build Cadence state section
			const cadenceStateSection = `## CADENCE MODE ACTIVE

This session is running in Cadence mode (long-running autonomous loop).

**Cadence State:**
- Session ID: ${sessionId}
- Loop ID: ${state.loopId ?? 'unknown'}
- Branch: ${branch}
- Started: ${state.startedAt}
- Iteration: ${state.iteration} / ${state.maxIterations}
- Last activity: ${state.lastActivity}

**Session Record Location:**
\`session:${sessionId}\` in agentuity-opencode-memory

After compaction:
1. Memory will save this summary and update the session record
2. Memory should update planning.progress with this compaction
3. Lead will continue the loop from iteration ${state.iteration}
4. Use 5-Question Reboot to re-orient: Where am I? Where going? Goal? Learned? Done?`;

			// 4. Build background tasks section
			const tasks = backgroundManager?.getTasksByParent(sessionId) ?? [];
			let backgroundSection: string | null = null;

			if (tasks.length > 0) {
				const taskList = tasks
					.map(
						(t) =>
							`- **${t.id}**: ${t.description || 'No description'} (session: ${t.sessionId ?? 'pending'}, status: ${t.status})`
					)
					.join('\n');

				backgroundSection = `## Active Background Tasks

This session has ${tasks.length} background task(s) running in separate sessions:
${taskList}

**CRITICAL:** Task IDs and session IDs persist across compaction - these tasks are still running.
Use \`agentuity_background_output({ task_id: "..." })\` to check their status.
Use \`agentuity_session_dashboard({ session_id: "..." })\` to get a full session tree with status, costs, and health summary for Lead-of-Leads monitoring.

**Tip:** If you spawned child Leads for parallel work, delegate monitoring to BackgroundMonitor:
\`\`\`typescript
agentuity_background_task({
  agent: "monitor",
  task: "Monitor these background tasks and report when all complete:\\n${tasks.map((t) => `- ${t.id}`).join('\\n')}",
  description: "Monitor child tasks"
})
\`\`\``;
			}

			// 5. Build SQLite dashboard section
			const dashboardSection = buildSqliteDashboardSummary(dbReader, sessionId);

			// 6. Combine everything into the full prompt
			const sections: string[] = [];
			if (instructions) sections.push(instructions);
			sections.push(cadenceStateSection);
			if (backgroundSection) sections.push(backgroundSection);
			if (planningState) sections.push(planningState);
			if (imageDescs) sections.push(imageDescs);
			if (toolSummaries) sections.push(toolSummaries);
			if (dashboardSection) sections.push(dashboardSection);

			// 7. Add diagnostics
			const stats: CompactionStats = {
				planningPhasesCount: countListItems(planningState),
				backgroundTasksCount: tasks.length,
				imageDescriptionsCount: countListItems(imageDescs),
				toolCallSummariesCount: countListItems(toolSummaries),
				estimatedTokens: Math.ceil(sections.join('\n\n').length / 4),
			};
			const diagnostics = formatCompactionDiagnostics(stats);
			if (diagnostics) sections.push(diagnostics);

			// 8. Enforce token budget
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

			// 9. Set the full prompt or push to context
			if (useCustomPrompt) {
				output.prompt = fullPrompt;
			} else {
				output.context.push(fullPrompt);
			}

			// 10. Store pre-compaction snapshot to KV (fire-and-forget)
			if (useSnapshotToKV) {
				storePreCompactionSnapshot(sessionId, {
					timestamp: new Date().toISOString(),
					sessionId,
					planningState: planningState ? { raw: planningState } : undefined,
					backgroundTasks: tasks.map((t) => ({
						id: t.id,
						description: t.description || 'No description',
						status: t.status,
					})),
					cadenceState: state ? { ...state } : undefined,
					branch,
				}).catch(() => {}); // Fire and forget
			}
		},

		/**
		 * Check if a session is currently in Cadence mode.
		 * Used by session-memory hooks to avoid double-handling.
		 */
		isActiveCadenceSession(sessionId: string): boolean {
			return activeCadenceSessions.has(sessionId);
		},

		/**
		 * Lazy restore: check KV for persisted Cadence state and populate in-memory Map.
		 * Called before routing decisions to recover state after plugin restarts.
		 * Returns true if state was found and restored.
		 */
		async tryRestoreFromKV(sessionId: string): Promise<boolean> {
			// Already in memory — nothing to restore
			if (activeCadenceSessions.has(sessionId)) return true;
			// Known non-Cadence session — skip KV lookup
			if (nonCadenceSessions.has(sessionId)) return false;

			try {
				const kvState = await restoreCadenceStateFromKV(sessionId);
				if (!kvState) {
					nonCadenceSessions.add(sessionId);
					return false;
				}

				const state: CadenceSessionState = {
					startedAt: (kvState.startedAt as string) ?? new Date().toISOString(),
					loopId: kvState.loopId as string | undefined,
					iteration: (kvState.iteration as number) ?? 1,
					maxIterations: (kvState.maxIterations as number) ?? 50,
					lastActivity: (kvState.lastActivity as string) ?? new Date().toISOString(),
				};
				activeCadenceSessions.set(sessionId, state);
				log(
					`Restored Cadence state from KV for session ${sessionId} (iteration ${state.iteration}/${state.maxIterations})`
				);
				return true;
			} catch {
				return false;
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

function buildSqliteDashboardSummary(
	dbReader: OpenCodeDBReader | undefined,
	parentSessionId: string
): string | undefined {
	if (!dbReader || !dbReader.isAvailable()) return undefined;

	const dashboard = dbReader.getSessionDashboard(parentSessionId);
	if (!dashboard.sessions.length) return undefined;

	const lines: string[] = [];
	for (const node of dashboard.sessions) {
		appendDashboardNode(dbReader, node, 0, lines);
	}

	return `
## SQLite Session Dashboard

- Parent session: ${parentSessionId}
- Total child cost: ${dashboard.totalCost}

${lines.join('\n')}
`;
}

function appendDashboardNode(
	reader: OpenCodeDBReader,
	node: SessionTreeNode,
	depth: number,
	lines: string[]
): void {
	const status = reader.getSessionStatus(node.session.id);
	const todoSummary = node.todoSummary
		? `${node.todoSummary.pending}/${node.todoSummary.total} pending`
		: 'no todos';
	const costSummary = node.costSummary
		? `${node.costSummary.totalCost} (${node.costSummary.totalTokens} tokens)`
		: '0 (0 tokens)';
	const label = formatSessionLabel(node.session.title);
	const indent = `${'  '.repeat(depth)}-`;

	lines.push(
		`${indent} ${label} [${node.session.id}] status: ${status.status}, tools: ${node.activeToolCount}, todos: ${todoSummary}, messages: ${node.messageCount}, cost: ${costSummary}`
	);

	for (const child of node.children) {
		appendDashboardNode(reader, child, depth + 1, lines);
	}
}

function formatSessionLabel(title: string): string {
	if (!title) return 'Session';
	if (title.startsWith('{')) {
		try {
			const parsed = JSON.parse(title) as { description?: string; taskId?: string };
			if (parsed.description) return parsed.description;
			if (parsed.taskId) return parsed.taskId;
		} catch {
			return title;
		}
	}
	return title;
}

function showToast(ctx: PluginInput, message: string): void {
	try {
		ctx.client.tui.showToast({ body: { message, variant: 'info' } });
	} catch {
		// Toast may not be available
	}
}
