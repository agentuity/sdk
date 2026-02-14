import { Database } from 'bun:sqlite';
import { createSubcommand, type CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { isJSONMode, outputJSON } from '../../../output';
import { z } from 'zod';
import {
	REQUIRED_TABLES,
	isMemoryPath,
	getDefaultDBCandidates,
	resolveOpenCodeDBPath,
	parseDisplayTitle,
} from './db';

const InspectOptionsSchema = z.object({
	session: z.string().describe('Session ID to inspect'),
	json: z.boolean().optional().describe('Output JSON format'),
});

type SessionRow = {
	id: string;
	project_id: string;
	parent_id: string | null;
	title: string;
	time_created: number;
	time_updated: number;
	time_compacting: number | null;
	time_archived: number | null;
};

type MessageRow = {
	id: string;
	session_id: string;
	role: string;
	time_created: number;
	agent: string | null;
	model: string | null;
	cost: number | null;
	error: string | null;
};

type ToolRow = {
	tool: string | null;
	status: string | null;
	call_id: string | null;
};

type TodoRow = {
	content: string;
	status: string;
	priority: string | null;
};

type CostRow = {
	total_cost: number | null;
	total_tokens: number | null;
	input_tokens: number | null;
	output_tokens: number | null;
};

type ChildRow = {
	id: string;
	title: string;
	parent_id: string | null;
	time_created: number;
	time_updated: number;
	time_compacting: number | null;
	time_archived: number | null;
};

function toISO(epochMs: number): string {
	return new Date(epochMs).toISOString();
}

function computeSessionStatus(
	session: SessionRow,
	latestError: string | null,
	activeToolCount: number
): string {
	if (session.time_archived) return 'archived';
	if (session.time_compacting) return 'compacting';
	if (latestError) return 'error';
	if (activeToolCount > 0) return 'active';
	return 'idle';
}

function formatRelativeTime(epochMs: number): string {
	const now = Date.now();
	const diffMs = now - epochMs;

	if (diffMs < 60 * 1000) return 'just now';
	if (diffMs < 60 * 60 * 1000) {
		const minutes = Math.floor(diffMs / (60 * 1000));
		return `${minutes}m ago`;
	}
	if (diffMs < 24 * 60 * 60 * 1000) {
		const hours = Math.floor(diffMs / (60 * 60 * 1000));
		return `${hours}h ago`;
	}
	if (diffMs < 7 * 24 * 60 * 60 * 1000) {
		const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
		return `${days}d ago`;
	}

	const date = new Date(epochMs);
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export const inspectSubcommand = createSubcommand({
	name: 'inspect',
	description: 'Inspect a specific session in detail',
	tags: ['read-only', 'fast'],
	schema: {
		options: InspectOptionsSchema,
	},
	examples: [
		{
			command: getCommand('ai opencode inspect --session ses_abc123'),
			description: 'Inspect a specific session in detail',
		},
		{
			command: getCommand('ai opencode inspect --session ses_abc123 --json'),
			description: 'Inspect session as JSON',
		},
	],
	async handler(
		ctx: CommandContext<undefined, undefined, undefined, typeof InspectOptionsSchema>
	) {
		const { options, opts } = ctx;
		const jsonMode = isJSONMode(options) || opts?.json === true;
		const sessionId = opts?.session;

		if (!sessionId) {
			if (jsonMode) {
				outputJSON({
					error: 'missing_session',
					message: 'Session ID is required (--session).',
				});
			} else {
				tui.error('Session ID is required. Use --session <id>');
			}
			return { success: false };
		}

		const resolvedDbPath = await resolveOpenCodeDBPath();
		if (!resolvedDbPath) {
			const candidates = getDefaultDBCandidates();
			if (jsonMode) {
				outputJSON({
					error: 'db_not_found',
					message: 'OpenCode database not found.',
					expectedLocations: candidates,
				});
			} else {
				tui.newline();
				tui.output(`${tui.ICONS.info} OpenCode database not found.`);
				tui.newline();
				tui.output('The inspect command requires OpenCode v1.2.0+ with SQLite storage.');
				if (candidates.length > 0) {
					tui.output('Expected locations:');
					for (const path of candidates) {
						tui.output(`  ${tui.ICONS.bullet} ${path}`);
					}
				}
				tui.newline();
				tui.output('Tip: Set OPENCODE_DB_PATH to override the database location.');
			}
			return { success: false };
		}

		const isMemory = isMemoryPath(resolvedDbPath);
		let db: Database | null = null;

		try {
			db = new Database(resolvedDbPath, isMemory ? undefined : { readonly: true });

			// Validate schema
			const tableRows = db
				.query("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as Array<{ name: string }>;
			const foundTables = new Set(tableRows.map((row) => row.name));
			for (const table of REQUIRED_TABLES) {
				if (!foundTables.has(table)) {
					const msg = 'OpenCode database schema is missing required tables.';
					if (jsonMode) {
						outputJSON({ error: 'schema', message: msg });
					} else {
						tui.error(msg);
					}
					return { success: false };
				}
			}

			// Query session
			const session = db
				.query(
					`SELECT id, project_id, parent_id, title, time_created, time_updated, time_compacting, time_archived
					 FROM session WHERE id = ?`
				)
				.get(sessionId) as SessionRow | null;

			if (!session) {
				const msg = `Session ${sessionId} not found in database.`;
				if (jsonMode) {
					outputJSON({ error: 'not_found', message: msg });
				} else {
					tui.error(msg);
				}
				return { success: false };
			}

			// Query messages
			const messages = db
				.query(
					`SELECT m.id as id,
							m.session_id as session_id,
							CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.role') END as role,
							m.time_created as time_created,
							CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.agent') END as agent,
							CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.model') END as model,
							CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.cost') END as cost,
							CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.error') END as error
					 FROM message m
					 WHERE m.session_id = ?
					 ORDER BY m.time_created ASC`
				)
				.all(sessionId) as MessageRow[];

			// Get latest error for status computation
			const latestError =
				messages.length > 0 ? (messages[messages.length - 1]?.error ?? null) : null;

			// Query active tools
			const activeToolRows = db
				.query(
					`SELECT json_extract(p.data, '$.tool') as tool,
							json_extract(p.data, '$.state.status') as status,
							COALESCE(json_extract(p.data, '$.callID'), json_extract(p.data, '$.callId')) as call_id
					 FROM part p
					 WHERE p.session_id = ?
						AND json_valid(p.data)
						AND json_extract(p.data, '$.type') IN ('tool-invocation', 'tool')
						AND json_extract(p.data, '$.state.status') = 'running'`
				)
				.all(sessionId) as ToolRow[];

			const activeTools = activeToolRows.map((row) => ({
				tool: row.tool ?? 'unknown',
				status: row.status ?? 'unknown',
				callId: row.call_id ?? null,
			}));

			// Query recent tool history (last 20 completed tools)
			const recentToolRows = db
				.query(
					`SELECT json_extract(p.data, '$.tool') as tool,
							json_extract(p.data, '$.state.status') as status,
							COALESCE(json_extract(p.data, '$.callID'), json_extract(p.data, '$.callId')) as call_id
					 FROM part p
					 WHERE p.session_id = ?
						AND json_valid(p.data)
						AND json_extract(p.data, '$.type') IN ('tool-invocation', 'tool')
						AND json_extract(p.data, '$.state.status') != 'running'
					 ORDER BY p.time_created DESC
					 LIMIT 20`
				)
				.all(sessionId) as ToolRow[];

			const recentTools = recentToolRows.map((row) => ({
				tool: row.tool ?? 'unknown',
				status: row.status ?? 'unknown',
				callId: row.call_id ?? null,
			}));

			// Query todos
			const todoRows = db
				.query(
					'SELECT content, status, priority FROM todo WHERE session_id = ? ORDER BY position'
				)
				.all(sessionId) as TodoRow[];

			const todos = todoRows.map((row) => ({
				content: row.content,
				status: row.status,
				priority: row.priority ?? undefined,
			}));

			// Query cost
			const costRow = db
				.query(
					`SELECT SUM(json_extract(m.data, '$.cost')) as total_cost,
							SUM(
								COALESCE(json_extract(m.data, '$.tokens.input'), 0) +
								COALESCE(json_extract(m.data, '$.tokens.output'), 0)
							) as total_tokens,
							SUM(COALESCE(json_extract(m.data, '$.tokens.input'), 0)) as input_tokens,
							SUM(COALESCE(json_extract(m.data, '$.tokens.output'), 0)) as output_tokens
					 FROM message m
					 WHERE m.session_id = ?
						AND json_valid(m.data)
						AND json_extract(m.data, '$.cost') IS NOT NULL`
				)
				.get(sessionId) as CostRow | null;

			const cost = {
				totalCost: costRow?.total_cost ?? 0,
				totalTokens: costRow?.total_tokens ?? 0,
				inputTokens: costRow?.input_tokens ?? 0,
				outputTokens: costRow?.output_tokens ?? 0,
			};

			// Query child sessions
			const childRows = db
				.query(
					`SELECT id, title, parent_id, time_created, time_updated, time_compacting, time_archived
					 FROM session
					 WHERE parent_id = ?
					 ORDER BY time_updated DESC`
				)
				.all(sessionId) as ChildRow[];

			const status = computeSessionStatus(session, latestError, activeTools.length);
			const displayTitle = parseDisplayTitle(session.title);

			// Build result
			const result = {
				session: {
					id: session.id,
					title: session.title,
					displayTitle,
					status,
					projectId: session.project_id,
					parentId: session.parent_id,
					timeCreated: session.time_created,
					timeUpdated: session.time_updated,
					timeCreatedISO: toISO(session.time_created),
					timeUpdatedISO: toISO(session.time_updated),
				},
				cost,
				messages: messages.map((m) => ({
					id: m.id,
					role: m.role ?? 'unknown',
					agent: m.agent ?? null,
					model: m.model ?? null,
					cost: m.cost ?? null,
					error: m.error ?? null,
					timeCreated: m.time_created,
					timeCreatedISO: toISO(m.time_created),
				})),
				activeTools,
				recentTools,
				todos,
				children: childRows.map((child) => {
					const childDisplayTitle = parseDisplayTitle(child.title);
					let childStatus = 'idle';
					if (child.time_archived) childStatus = 'archived';
					else if (child.time_compacting) childStatus = 'compacting';

					return {
						id: child.id,
						title: child.title,
						displayTitle: childDisplayTitle,
						status: childStatus,
						timeCreated: child.time_created,
						timeUpdated: child.time_updated,
						timeCreatedISO: toISO(child.time_created),
						timeUpdatedISO: toISO(child.time_updated),
					};
				}),
			};

			if (jsonMode) {
				outputJSON(result);
				return { success: true };
			}

			// Human-readable output
			tui.newline();
			tui.output(tui.bold('Session Info'));
			tui.output('────────────');
			tui.table(
				[
					{
						Field: 'ID',
						Value: result.session.id,
					},
					{
						Field: 'Title',
						Value: result.session.displayTitle || result.session.title,
					},
					{
						Field: 'Status',
						Value: result.session.status,
					},
					{
						Field: 'Project',
						Value: result.session.projectId,
					},
					{
						Field: 'Parent',
						Value: result.session.parentId ?? '(root)',
					},
					{
						Field: 'Created',
						Value: `${result.session.timeCreatedISO} (${formatRelativeTime(result.session.timeCreated)})`,
					},
					{
						Field: 'Updated',
						Value: `${result.session.timeUpdatedISO} (${formatRelativeTime(result.session.timeUpdated)})`,
					},
				],
				['Field', 'Value']
			);

			tui.newline();
			tui.output(tui.bold('Cost Summary'));
			tui.output('────────────');
			tui.table(
				[
					{
						Metric: 'Total Cost',
						Value: cost.totalCost > 0 ? `$${cost.totalCost.toFixed(4)}` : '$0.00',
					},
					{ Metric: 'Total Tokens', Value: String(cost.totalTokens) },
					{ Metric: 'Input Tokens', Value: String(cost.inputTokens) },
					{ Metric: 'Output Tokens', Value: String(cost.outputTokens) },
				],
				['Metric', 'Value']
			);

			tui.newline();
			tui.output(tui.bold(`Messages (${messages.length})`));
			tui.output('────────────');
			if (messages.length === 0) {
				tui.output(tui.muted('No messages'));
			} else {
				const msgRows = result.messages.map((m) => ({
					Role: m.role,
					Agent: m.agent ?? '',
					Model: m.model ?? '',
					Cost: m.cost != null ? `$${m.cost.toFixed(4)}` : '',
					Error: m.error ? 'yes' : '',
					Time: formatRelativeTime(m.timeCreated),
				}));
				tui.table(msgRows, ['Role', 'Agent', 'Model', 'Cost', 'Error', 'Time']);
			}

			if (activeTools.length > 0) {
				tui.newline();
				tui.output(tui.bold(`Active Tools (${activeTools.length})`));
				tui.output('────────────');
				const toolRows = activeTools.map((t) => ({
					Tool: t.tool,
					Status: t.status,
					'Call ID': t.callId ?? '',
				}));
				tui.table(toolRows, ['Tool', 'Status', 'Call ID']);
			}

			if (recentTools.length > 0) {
				tui.newline();
				tui.output(tui.bold(`Recent Tools (${recentTools.length})`));
				tui.output('────────────');
				const toolRows = recentTools.map((t) => ({
					Tool: t.tool,
					Status: t.status,
					'Call ID': t.callId ?? '',
				}));
				tui.table(toolRows, ['Tool', 'Status', 'Call ID']);
			}

			tui.newline();
			tui.output(tui.bold(`Todos (${todos.length})`));
			tui.output('────────────');
			if (todos.length === 0) {
				tui.output(tui.muted('No todos'));
			} else {
				for (const todo of todos) {
					const checked = todo.status === 'completed' ? 'x' : ' ';
					const priorityTag = todo.priority ? ` [${todo.priority}]` : '';
					tui.output(`- [${checked}]${priorityTag} ${todo.content}`);
				}
			}

			if (result.children.length > 0) {
				tui.newline();
				tui.output(tui.bold(`Children (${result.children.length})`));
				tui.output('────────────');
				const childTableRows = result.children.map((c) => ({
					ID: c.id,
					Title: c.displayTitle || c.title,
					Status: c.status,
					Updated: formatRelativeTime(c.timeUpdated),
				}));
				tui.table(childTableRows, ['ID', 'Title', 'Status', 'Updated']);
			}

			tui.newline();
			return { success: true };
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Failed to inspect session.';
			if (jsonMode) {
				outputJSON({ error: 'query_failed', message: msg });
			} else {
				tui.error(msg);
			}
			return { success: false };
		} finally {
			if (db) {
				db.close();
			}
		}
	},
});

export default inspectSubcommand;
