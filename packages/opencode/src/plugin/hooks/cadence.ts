import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';
import type { BackgroundManager } from '../../background';
import type { OpenCodeDBReader, SessionTreeNode } from '../../sqlite';

/** Compacting hook input/output types */
type CompactingInput = { sessionID: string };
type CompactingOutput = { context: string[]; prompt?: string };

export interface CadenceHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
	onEvent: (input: unknown) => Promise<void>;
	onCompacting: (input: CompactingInput, output: CompactingOutput) => Promise<void>;
	/** Check if a session is currently in Cadence mode */
	isActiveCadenceSession: (sessionId: string) => boolean;
}

const COMPLETION_PATTERN = /<promise>\s*DONE\s*<\/promise>/i;

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
	_config: CoderConfig,
	backgroundManager?: BackgroundManager,
	dbReader?: OpenCodeDBReader
): CadenceHooks {
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

				showToast(ctx, `⚡ Cadence started · ${state.iteration}/${state.maxIterations}`);
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
Use \`agentuity_session_dashboard({ session_id: "..." })\` to get a full session tree with status, costs, and health summary for Lead-of-Leads monitoring.

**Tip:** If you spawned child Leads for parallel work, delegate monitoring to BackgroundMonitor:
\`\`\`typescript
agentuity_background_task({
  agent: "monitor",
  task: "Monitor these background tasks and report when all complete:\\n${tasks.map((t) => `- ${t.id}`).join('\\n')}",
  description: "Monitor child tasks"
})
\`\`\`
`;
			}

			output.context.push(`
## CADENCE MODE ACTIVE

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

**Planning State:**
If this session has planning active, the session record contains:
- \`planning.prdKey\` - Link to the PRD being executed
- \`planning.objective\` - What we're trying to accomplish
- \`planning.phases\` - Current phases with status and notes
- \`planning.current\` - Current phase
- \`planning.findings\` - Discoveries made during work
- \`planning.errors\` - Failures to avoid repeating
${backgroundTaskContext}
After compaction:
1. Memory will save this summary and update the session record
2. Memory should update planning.progress with this compaction
3. Lead will continue the loop from iteration ${state.iteration}
4. Use 5-Question Reboot to re-orient: Where am I? Where going? Goal? Learned? Done?
`);

			const dashboardSummary = buildSqliteDashboardSummary(dbReader, sessionId);
			if (dashboardSummary) {
				output.context.push(dashboardSummary);
			}
		},

		/**
		 * Check if a session is currently in Cadence mode.
		 * Used by session-memory hooks to avoid double-handling.
		 */
		isActiveCadenceSession(sessionId: string): boolean {
			return activeCadenceSessions.has(sessionId);
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
