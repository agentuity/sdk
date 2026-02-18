import type { OpenCodeDBReader } from '../../sqlite/reader';
import type {
	CompactionStats,
	DBNonTextPart,
	DBToolCallSummary,
	PreCompactionSnapshot,
} from '../../sqlite/types';
import type { CompactionConfig } from '../../types';

/**
 * Get the current git branch name.
 * Moved here from cadence.ts and session-memory.ts to deduplicate.
 */
export async function getCurrentBranch(): Promise<string> {
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

/**
 * Access Agentuity KV storage via CLI.
 * All calls are wrapped in try/catch — returns null on failure.
 */
async function kvGet(namespace: string, key: string): Promise<unknown | null> {
	try {
		const proc = Bun.spawn(['agentuity', 'cloud', 'kv', 'get', namespace, key, '--json'], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const output = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return null;
		return JSON.parse(output);
	} catch {
		return null;
	}
}

async function kvSet(namespace: string, key: string, value: unknown): Promise<boolean> {
	try {
		const proc = Bun.spawn(
			['agentuity', 'cloud', 'kv', 'set', namespace, key, JSON.stringify(value)],
			{ stdout: 'pipe', stderr: 'pipe' }
		);
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Build the custom compaction prompt for our agent system.
 * This REPLACES the default OpenCode compaction prompt via output.prompt.
 */
export function buildCustomCompactionPrompt(mode: 'cadence' | 'regular'): string {
	const cadenceSection =
		mode === 'cadence'
			? `

## Cadence Loop State
- Loop ID, iteration number, max iterations
- Current phase and what's in progress
- Whether this is a Lead-of-Leads session with child tasks`
			: '';

	return `You are generating a continuation context for a multi-agent coding system (Agentuity Coder). Your summary will be the ONLY context the orchestrating Lead agent has after this compaction. Preserve everything needed for seamless continuation.

## CRITICAL — Preserve These Verbatim
1. The current task/objective (quote the user's original request exactly)
2. All background task IDs (bg_xxx) with status, purpose, and session IDs
3. Active planning state: current phase, completed phases, next steps, blockers
4. ALL file paths being actively worked on (with role: created/modified/read)
5. Key decisions made and their rationale
6. Any corrections or gotchas discovered during the session
7. Todo list state (what's done, in progress, pending)
8. Descriptions of any images or attachments that appeared in conversation${cadenceSection}

## Structure Your Summary As:

### Active Task
[Verbatim objective + what the agent was doing when compaction fired]

### Planning State
[Phases with status. Include phase notes, not just titles.]

### Background Tasks
[bg_xxx: description → status (running/completed/errored). Include session IDs.]

### Key Context
[Decisions, constraints, user preferences, corrections discovered]

### Active Files
[filepath → role (creating/modifying/reading) + what's being done to it]

### Images & Attachments
[Describe any images/screenshots: what they showed, when they appeared, why they mattered]

### Next Steps
[What should happen immediately after compaction resumes]

## Rules
- Use specific file paths, task IDs, phase names — NOT vague references.
- State what tools returned, not just that they were called.
- NEVER drop background task references — the agent MUST know what's still running.
- Prefer completeness over brevity — this is the agent's entire working memory.`;
}

/**
 * Fetch planning state from KV and format as markdown.
 * Returns null if KV is unavailable or no planning state exists.
 */
export async function fetchAndFormatPlanningState(sessionId: string): Promise<string | null> {
	try {
		const record = await kvGet('agentuity-opencode-memory', `session:${sessionId}`);
		if (!record || typeof record !== 'object') return null;

		const data = (record as Record<string, unknown>).data ?? record;
		const planning = (data as Record<string, unknown>).planning as
			| Record<string, unknown>
			| undefined;
		if (!planning) return null;

		const lines: string[] = ['## Planning State (from KV)'];
		if (planning.objective) lines.push(`**Objective:** ${planning.objective}`);
		if (planning.current) lines.push(`**Current:** ${planning.current}`);
		if (planning.next) lines.push(`**Next:** ${planning.next}`);

		const phases = planning.phases as Array<Record<string, unknown>> | undefined;
		if (phases?.length) {
			lines.push('', '### Phases:');
			for (const p of phases) {
				const status = p.status ?? 'unknown';
				const title = p.title ?? p.content ?? 'untitled';
				const notes = p.notes ? ` — ${String(p.notes).slice(0, 100)}` : '';
				lines.push(`- [${status}] ${title}${notes}`);
			}
		}

		const findings = planning.findings as string[] | undefined;
		if (findings?.length) {
			lines.push('', '### Key Findings:');
			for (const f of findings.slice(0, 5)) {
				lines.push(`- ${String(f).slice(0, 150)}`);
			}
		}

		const errors = planning.errors as string[] | undefined;
		if (errors?.length) {
			lines.push('', '### Errors to Avoid:');
			for (const e of errors.slice(0, 3)) {
				lines.push(`- ${String(e).slice(0, 150)}`);
			}
		}

		return lines.join('\n');
	} catch {
		return null;
	}
}

/**
 * Get image/attachment descriptions from SQLite for compaction context.
 * Returns brief metadata about non-text parts in the conversation.
 */
export function getImageDescriptions(
	dbReader: OpenCodeDBReader | null,
	sessionId: string
): string | null {
	if (!dbReader?.isAvailable()) return null;

	try {
		const parts = dbReader.getNonTextParts(sessionId);
		if (!parts.length) return null;

		// Filter to image-like parts (not tool calls — those are separate)
		const imageParts = parts.filter(
			(p: DBNonTextPart) => !['tool-invocation', 'tool-result', 'text'].includes(p.type)
		);
		if (!imageParts.length) return null;

		const lines: string[] = ['## Images & Attachments'];
		for (const part of imageParts.slice(0, 10)) {
			const when = part.timestamp ? ` at ${part.timestamp}` : '';
			lines.push(`- [${part.type}]${when}: message ${part.messageId}`);
		}
		return lines.join('\n');
	} catch {
		return null;
	}
}

/**
 * Get recent tool call summaries for compaction context.
 * CONCISE — capped at limit calls, brief descriptions only.
 */
export function getRecentToolCallSummaries(
	dbReader: OpenCodeDBReader | null,
	sessionId: string,
	limit: number = 5
): string | null {
	if (!dbReader?.isAvailable() || limit <= 0) return null;

	try {
		const calls = dbReader.getRecentToolCalls(sessionId, limit);
		if (!calls.length) return null;

		const lines: string[] = ['## Recent Tool Activity'];
		for (const call of calls) {
			const inputBrief = call.input ? ` — ${String(call.input).slice(0, 80)}` : '';
			const outputBrief = call.output ? ` → ${String(call.output).slice(0, 80)}` : '';
			lines.push(`- ${call.toolName}${inputBrief}${outputBrief}`);
		}
		return lines.join('\n');
	} catch {
		return null;
	}
}

/**
 * Store a pre-compaction snapshot to KV as a recovery mechanism.
 */
export async function storePreCompactionSnapshot(
	sessionId: string,
	snapshot: PreCompactionSnapshot
): Promise<void> {
	try {
		await kvSet('agentuity-opencode-memory', `compaction:snapshot:${sessionId}`, snapshot);
	} catch {
		// Silently fail — this is a best-effort recovery mechanism
	}
}

/**
 * Persist Cadence session state to KV for recovery after plugin restart.
 */
export async function persistCadenceStateToKV(
	sessionId: string,
	state: Record<string, unknown>
): Promise<void> {
	try {
		await kvSet('agentuity-opencode-memory', `cadence:active:${sessionId}`, state);
	} catch {
		// Silently fail
	}
}

/**
 * Restore Cadence session state from KV.
 */
export async function restoreCadenceStateFromKV(
	sessionId: string
): Promise<Record<string, unknown> | null> {
	try {
		const state = await kvGet('agentuity-opencode-memory', `cadence:active:${sessionId}`);
		return state as Record<string, unknown> | null;
	} catch {
		return null;
	}
}

/**
 * Format compaction diagnostics — brief summary of what was preserved.
 */
export function formatCompactionDiagnostics(stats: CompactionStats): string {
	const parts: string[] = [];
	if (stats.planningPhasesCount > 0) parts.push(`${stats.planningPhasesCount} planning phases`);
	if (stats.backgroundTasksCount > 0) parts.push(`${stats.backgroundTasksCount} background tasks`);
	if (stats.imageDescriptionsCount > 0) parts.push(`${stats.imageDescriptionsCount} image refs`);
	if (stats.toolCallSummariesCount > 0) parts.push(`${stats.toolCallSummariesCount} tool calls`);

	if (!parts.length) return '';
	return `> **Compaction preserved:** ${parts.join(', ')} (~${stats.estimatedTokens} tokens injected)`;
}

/** Count markdown list items in a string */
export function countListItems(s: string | null): number {
	if (!s) return 0;
	return (s.match(/^- /gm) ?? []).length;
}

// Re-export types used by consumers of this module
export type { CompactionConfig } from '../../types';
export type {
	CompactionStats,
	DBNonTextPart,
	DBToolCallSummary,
	PreCompactionSnapshot,
} from '../../sqlite/types';
