import { Database } from 'bun:sqlite';
import { createSubcommand, type CommandContext } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { getCommand } from '../../../command-prefix.ts';
import { isJSONMode, outputJSON } from '../../../output.ts';
import { z } from 'zod';
import {
	REQUIRED_TABLES,
	isMemoryPath,
	getDefaultDBCandidates,
	resolveOpenCodeDBPath,
} from './db.ts';

const DashboardOptionsSchema = z.object({
	json: z.boolean().optional().describe('Output JSON format'),
	session: z.string().optional().describe('Focus on a specific session ID'),
	watch: z.boolean().optional().describe('Continuously refresh the dashboard'),
	interval: z.number().optional().describe('Refresh interval in seconds (default: 5)'),
	limit: z.number().optional().describe('Maximum number of sessions to show (default: 10)'),
	since: z
		.string()
		.optional()
		.describe('Show sessions updated within duration (e.g., 1h, 6h, 24h, 7d)'),
	status: z.string().optional().describe('Filter by status: active, idle, error, archived'),
	all: z.boolean().optional().describe('Show all sessions (overrides default limit)'),
	search: z.string().optional().describe('Search sessions by title (fuzzy, case-insensitive)'),
	allTodos: z
		.boolean()
		.optional()
		.describe('Show all todos including completed (default: pending only)'),
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

type MessageCountRow = {
	session_id: string;
	count: number;
};

type ActiveToolRow = {
	session_id: string;
	tool: string | null;
	status: string | null;
	call_id: string | null;
};

type TodoRow = {
	session_id: string;
	content: string;
	status: string;
	priority: string | null;
};

type CostRow = {
	session_id: string;
	total_cost: number | null;
	total_tokens: number | null;
};

type LatestMessageRow = {
	session_id: string;
	error: string | null;
	time_updated: number | null;
};

type ActiveTool = {
	tool: string;
	status: string;
	callId: string | null;
};

type TodoItem = {
	content: string;
	status: string;
	priority?: string;
};

type CostSummary = {
	totalCost: number;
	totalTokens: number;
};

type SessionNode = {
	session: SessionRow;
	status: string;
	lastActivity: number;
	messageCount: number;
	activeTools: ActiveTool[];
	todos: TodoItem[];
	cost: CostSummary;
	children: SessionNode[];
};

type DashboardData = {
	database: string;
	sessions: SessionNode[];
	allSessions: SessionNode[];
};

function formatCost(cost: CostSummary): string {
	if (!cost || cost.totalCost <= 0) {
		return '$0.00';
	}
	return `$${cost.totalCost.toFixed(2)}`;
}

const DURATION_UNITS: Record<string, number> = {
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
};

function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([mhd])$/);
	if (!match) {
		throw new Error(
			`Invalid duration format: "${duration}". Use a number followed by m (minutes), h (hours), or d (days). Examples: 30m, 1h, 7d`
		);
	}
	const value = parseInt(match[1]!, 10);
	const unit = match[2]!;
	const ms = DURATION_UNITS[unit];
	if (!ms) {
		throw new Error(`Unknown duration unit: "${unit}"`);
	}
	return Date.now() - value * ms;
}

function formatRelativeTime(epochMs: number): string {
	const now = Date.now();
	const diffMs = now - epochMs;

	if (diffMs < 60 * 1000) {
		return 'just now';
	}
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

function formatToolCount(activeTools: ActiveTool[]): string {
	const count = activeTools.length;
	if (count === 0) return '0';
	return `${count} run${count === 1 ? '' : 's'}`;
}

function computeStatus(
	session: SessionRow,
	latest: LatestMessageRow | undefined,
	activeTools: ActiveTool[]
): { status: string; lastActivity: number } {
	if (session.time_archived) {
		return { status: 'archived', lastActivity: session.time_updated };
	}

	if (session.time_compacting) {
		return { status: 'compacting', lastActivity: session.time_updated };
	}

	if (latest?.error) {
		return { status: 'error', lastActivity: latest.time_updated ?? session.time_updated };
	}

	const lastActivity = Math.max(session.time_updated, latest?.time_updated ?? 0);
	if (activeTools.length > 0) {
		return { status: 'active', lastActivity };
	}

	return { status: 'idle', lastActivity };
}

function buildSessionTree(
	sessions: SessionRow[],
	messageCounts: Map<string, number>,
	activeTools: Map<string, ActiveTool[]>,
	todos: Map<string, TodoItem[]>,
	costs: Map<string, CostSummary>,
	latestMessages: Map<string, LatestMessageRow>
): { roots: SessionNode[]; allNodes: SessionNode[] } {
	const nodeMap = new Map<string, SessionNode>();

	for (const session of sessions) {
		const sessionActiveTools = activeTools.get(session.id) ?? [];
		const sessionTodos = todos.get(session.id) ?? [];
		const sessionCost = costs.get(session.id) ?? { totalCost: 0, totalTokens: 0 };
		const latest = latestMessages.get(session.id);
		const { status, lastActivity } = computeStatus(session, latest, sessionActiveTools);

		nodeMap.set(session.id, {
			session,
			status,
			lastActivity,
			messageCount: messageCounts.get(session.id) ?? 0,
			activeTools: sessionActiveTools,
			todos: sessionTodos,
			cost: sessionCost,
			children: [],
		});
	}

	const roots: SessionNode[] = [];

	for (const node of nodeMap.values()) {
		const parentId = node.session.parent_id;
		if (parentId && nodeMap.has(parentId)) {
			const parent = nodeMap.get(parentId);
			if (parent) {
				parent.children.push(node);
			}
		} else {
			roots.push(node);
		}
	}

	const sortNodes = (nodes: SessionNode[]) => {
		nodes.sort((a, b) => b.session.time_updated - a.session.time_updated);
		nodes.forEach((node) => {
			sortNodes(node.children);
		});
	};

	sortNodes(roots);

	return { roots, allNodes: Array.from(nodeMap.values()) };
}

function flattenSessionRows(nodes: SessionNode[]): SessionNode[] {
	const flattened: SessionNode[] = [];
	const walk = (node: SessionNode) => {
		flattened.push(node);
		for (const child of node.children) {
			walk(child);
		}
	};

	for (const node of nodes) {
		walk(node);
	}
	return flattened;
}

function filterTreeByStatus(nodes: SessionNode[], targetStatus: string): SessionNode[] {
	return nodes
		.map((node) => ({
			...node,
			children: filterTreeByStatus(node.children, targetStatus),
		}))
		.filter((node) => node.status === targetStatus || node.children.length > 0);
}

type FilterOptions = {
	focusSessionId?: string;
	search?: string;
	since?: string;
	status?: string;
	limit?: number;
	all?: boolean;
};

async function loadDashboardData(
	dbPath: string,
	filterOpts?: FilterOptions
): Promise<{ data?: DashboardData; error?: string; message?: string }> {
	const focusSessionId = filterOpts?.focusSessionId;
	const isMemory = isMemoryPath(dbPath);
	let db: Database | null = null;

	try {
		db = new Database(dbPath, isMemory ? undefined : { readonly: true });

		const tableRows = db
			.query("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all() as Array<{ name: string }>;
		const foundTables = new Set(tableRows.map((row) => row.name));
		for (const table of REQUIRED_TABLES) {
			if (!foundTables.has(table)) {
				return {
					error: 'schema',
					message: 'OpenCode database schema is missing required tables.',
				};
			}
		}

		const sessions = db
			.query(
				`SELECT id, project_id, parent_id, title, time_created, time_updated, time_compacting, time_archived
				 FROM session
				 ORDER BY time_updated DESC`
			)
			.all() as SessionRow[];

		const messageCounts = new Map<string, number>();
		const messageCountRows = db
			.query('SELECT session_id, COUNT(*) as count FROM message GROUP BY session_id')
			.all() as MessageCountRow[];
		for (const row of messageCountRows) {
			messageCounts.set(row.session_id, row.count);
		}

		const activeTools = new Map<string, ActiveTool[]>();
		const activeToolRows = db
			.query(
				`SELECT p.session_id as session_id,
						json_extract(p.data, '$.tool') as tool,
						json_extract(p.data, '$.state.status') as status,
						COALESCE(json_extract(p.data, '$.callID'), json_extract(p.data, '$.callId')) as call_id
				 FROM part p
				 WHERE json_valid(p.data)
					AND json_extract(p.data, '$.type') IN ('tool-invocation', 'tool')
					AND json_extract(p.data, '$.state.status') IN ('running', 'pending')`
			)
			.all() as ActiveToolRow[];

		for (const row of activeToolRows) {
			const list = activeTools.get(row.session_id) ?? [];
			list.push({
				tool: row.tool ?? 'unknown',
				status: row.status ?? 'unknown',
				callId: row.call_id ?? null,
			});
			activeTools.set(row.session_id, list);
		}

		const todos = new Map<string, TodoItem[]>();
		const todoRows = db
			.query(
				'SELECT session_id, content, status, priority FROM todo ORDER BY session_id, position'
			)
			.all() as TodoRow[];
		for (const row of todoRows) {
			const list = todos.get(row.session_id) ?? [];
			list.push({
				content: row.content,
				status: row.status,
				priority: row.priority ?? undefined,
			});
			todos.set(row.session_id, list);
		}

		const costs = new Map<string, CostSummary>();
		const costRows = db
			.query(
				`SELECT session_id,
						SUM(json_extract(m.data, '$.cost')) as total_cost,
						SUM(
							COALESCE(json_extract(m.data, '$.tokens.input'), 0) +
							COALESCE(json_extract(m.data, '$.tokens.output'), 0)
						) as total_tokens
				 FROM message m
				 WHERE json_valid(m.data) AND json_extract(m.data, '$.cost') IS NOT NULL
				 GROUP BY session_id`
			)
			.all() as CostRow[];
		for (const row of costRows) {
			costs.set(row.session_id, {
				totalCost: row.total_cost ?? 0,
				totalTokens: row.total_tokens ?? 0,
			});
		}

		const latestMessages = new Map<string, LatestMessageRow>();
		const latestRows = db
			.query(
				`SELECT m.session_id as session_id,
						CASE WHEN json_valid(m.data) THEN json_extract(m.data, '$.error') END as error,
						m.time_updated as time_updated
				 FROM message m
				 INNER JOIN (
					SELECT session_id, MAX(time_updated) as max_time
					FROM message
					GROUP BY session_id
				 ) latest
				 ON latest.session_id = m.session_id AND latest.max_time = m.time_updated`
			)
			.all() as LatestMessageRow[];
		for (const row of latestRows) {
			latestMessages.set(row.session_id, row);
		}

		let filteredSessions = sessions;

		// Apply search filter at session level (case-insensitive LIKE)
		if (filterOpts?.search) {
			const query = filterOpts.search.toLowerCase();
			filteredSessions = filteredSessions.filter((s) => s.title.toLowerCase().includes(query));
		}

		const { roots, allNodes } = buildSessionTree(
			filteredSessions,
			messageCounts,
			activeTools,
			todos,
			costs,
			latestMessages
		);

		if (focusSessionId) {
			const focusNode = allNodes.find((node) => node.session.id === focusSessionId);
			if (!focusNode) {
				return {
					error: 'not_found',
					message: `Session ${focusSessionId} not found in database.`,
				};
			}
			return { data: { database: dbPath, sessions: [focusNode], allSessions: allNodes } };
		}

		// Apply post-build filters on root nodes
		let filteredRoots = roots;

		// Filter by --since (compare lastActivity against parsed timestamp)
		if (filterOpts?.since) {
			try {
				const sinceTimestamp = parseDuration(filterOpts.since);
				filteredRoots = filteredRoots.filter((node) => node.lastActivity >= sinceTimestamp);
			} catch {
				return {
					error: 'invalid_duration',
					message: `Invalid --since value: "${filterOpts.since}". Use format like 30m, 1h, 6h, 24h, 7d.`,
				};
			}
		}

		// Filter by --status (recursively prune non-matching nodes from tree)
		if (filterOpts?.status) {
			const targetStatus = filterOpts.status.toLowerCase();
			filteredRoots = filterTreeByStatus(filteredRoots, targetStatus);
		}

		// Apply --limit (default 10) unless --all is set
		if (!filterOpts?.all) {
			const limit = filterOpts?.limit ?? 10;
			filteredRoots = filteredRoots.slice(0, limit);
		}

		return { data: { database: dbPath, sessions: filteredRoots, allSessions: allNodes } };
	} catch (error) {
		return {
			error: 'query_failed',
			message: error instanceof Error ? error.message : 'Failed to query OpenCode database.',
		};
	} finally {
		if (db) {
			db.close();
		}
	}
}

function renderMissingDatabase(expectedPaths: string[], envPath?: string): void {
	tui.newline();
	tui.output(`${tui.ICONS.info} OpenCode database not found.`);
	tui.newline();
	tui.output('The dashboard requires OpenCode v1.2.0+ with SQLite storage.');

	if (envPath) {
		tui.output(`Expected location: ${envPath}`);
	} else if (expectedPaths.length === 1) {
		tui.output(`Expected location: ${expectedPaths[0]}`);
	} else {
		tui.output('Expected locations:');
		for (const path of expectedPaths) {
			tui.output(`  ${tui.ICONS.bullet} ${path}`);
		}
	}

	tui.newline();
	tui.output('Tip: Set OPENCODE_DB_PATH to override the database location.');
}

function renderDashboard(
	data: DashboardData,
	watchMode: boolean,
	intervalSeconds?: number,
	showAllTodos?: boolean
): void {
	const flattened = flattenSessionRows(data.sessions);
	const activeCount = flattened.filter((node) => node.status === 'active').length;

	tui.newline();
	tui.output(tui.bold('Coder Dashboard'));
	tui.output('────────────────');
	tui.newline();
	tui.output(`Database: ${data.database}`);
	tui.newline();

	const sessionLabel = `Sessions (${activeCount} active)`;
	tui.output(tui.bold(sessionLabel));

	if (flattened.length === 0) {
		tui.info('No sessions found');
	} else {
		const rows: Array<Record<string, string>> = [];

		const walk = (node: SessionNode, prefix: string, isLast: boolean, isRoot: boolean) => {
			const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
			rows.push({
				Session: `${prefix}${connector}${node.session.id}`,
				Status: node.status,
				'Last Active': formatRelativeTime(node.lastActivity),
				Messages: String(node.messageCount),
				Tools: formatToolCount(node.activeTools),
				Cost: formatCost(node.cost),
			});

			const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
			const lastIndex = node.children.length - 1;
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if (!child) continue;
				walk(child, childPrefix, i === lastIndex, false);
			}
		};

		const lastIndex = data.sessions.length - 1;
		for (let i = 0; i < data.sessions.length; i++) {
			const root = data.sessions[i];
			if (!root) continue;
			walk(root, '', i === lastIndex, true);
		}

		tui.table(rows, ['Session', 'Status', 'Last Active', 'Messages', 'Tools', 'Cost']);
	}

	const allTodoItems: Array<{ sessionId: string; todo: TodoItem }> = [];
	for (const node of flattened) {
		for (const todo of node.todos) {
			allTodoItems.push({ sessionId: node.session.id, todo });
		}
	}

	const totalTodos = allTodoItems.length;
	const pendingTodos = allTodoItems.filter((item) => item.todo.status !== 'completed').length;

	const displayTodos = showAllTodos
		? allTodoItems
		: allTodoItems.filter((item) => item.todo.status !== 'completed');

	tui.newline();
	const todosLabel = showAllTodos
		? `Todos (${pendingTodos} pending / ${totalTodos} total)`
		: `Todos (${pendingTodos} pending)`;
	tui.output(tui.bold(todosLabel));

	if (displayTodos.length === 0 && totalTodos > 0) {
		tui.output(tui.muted(`${totalTodos} completed (use --all-todos to show)`));
	} else if (displayTodos.length === 0) {
		tui.output(tui.muted('No todos found'));
	} else {
		const showSessionLabel = new Set(displayTodos.map((item) => item.sessionId)).size > 1;
		for (const { sessionId, todo } of displayTodos) {
			const checked = todo.status === 'completed' ? 'x' : ' ';
			const sessionLabel = showSessionLabel ? `(${sessionId}) ` : '';
			tui.output(`- [${checked}] ${sessionLabel}${todo.content}`);
		}
	}

	if (watchMode) {
		tui.newline();
		const interval = intervalSeconds ?? 5;
		tui.output(tui.muted(`Press q to quit · r to refresh · refreshing every ${interval}s`));
	}
}

function serializeNode(node: SessionNode): Record<string, unknown> {
	return {
		id: node.session.id,
		title: node.session.title,
		status: node.status,
		lastActivity: node.lastActivity,
		messageCount: node.messageCount,
		activeTools: node.activeTools,
		todos: node.todos,
		cost: node.cost,
		children: node.children.map(serializeNode),
	};
}

function clearTerminal(): void {
	if (!process.stdout.isTTY) {
		return;
	}
	process.stdout.write('\x1b[2J\x1b[H');
}

export const dashboardSubcommand = createSubcommand({
	name: 'dashboard',
	description: 'View Coder session dashboard',
	tags: ['read-only', 'fast'],
	schema: {
		options: DashboardOptionsSchema,
	},
	examples: [
		{
			command: getCommand('ai opencode dashboard'),
			description: 'Recent 10 sessions',
		},
		{
			command: getCommand('ai opencode dashboard --all'),
			description: 'All sessions',
		},
		{
			command: getCommand('ai opencode dashboard --since 1h'),
			description: 'Sessions active in last hour',
		},
		{
			command: getCommand('ai opencode dashboard --status active'),
			description: 'Only active sessions',
		},
		{
			command: getCommand('ai opencode dashboard --search "auth"'),
			description: 'Search by title',
		},
		{
			command: getCommand('ai opencode dashboard --limit 5 --status idle'),
			description: '5 most recent idle sessions',
		},
		{
			command: getCommand('ai opencode dashboard --watch --since 1h'),
			description: 'Watch recent sessions',
		},
		{
			command: getCommand('ai opencode dashboard --session ses_abc123'),
			description: 'Focus on a specific session tree',
		},
		{
			command: getCommand('ai opencode dashboard --json'),
			description: 'Output dashboard data as JSON',
		},
		{
			command: getCommand('ai opencode dashboard --all-todos'),
			description: 'Show all todos including completed',
		},
	],
	async handler(
		ctx: CommandContext<undefined, undefined, undefined, typeof DashboardOptionsSchema>
	) {
		const { options, opts } = ctx;
		const jsonMode = isJSONMode(options) || opts?.json === true;
		const watchMode = opts?.watch === true;
		const intervalSeconds = opts?.interval ?? 5;
		const intervalMs = Math.max(1, intervalSeconds) * 1000;
		const showAllTodos = opts?.allTodos ?? false;

		const filterOpts: FilterOptions = {
			focusSessionId: opts?.session,
			search: opts?.search,
			since: opts?.since,
			status: opts?.status,
			limit: opts?.limit,
			all: opts?.all,
		};

		const resolvedDbPath = await resolveOpenCodeDBPath();
		if (!resolvedDbPath) {
			const candidates = getDefaultDBCandidates();
			if (jsonMode) {
				outputJSON({
					database: null,
					sessions: [],
					message: 'OpenCode database not found.',
					expectedLocations: candidates,
				});
				return { success: false };
			}

			renderMissingDatabase(candidates, process.env.OPENCODE_DB_PATH);
			return { success: false };
		}

		const runOnce = async (): Promise<boolean> => {
			const result = await loadDashboardData(resolvedDbPath, filterOpts);
			if (result.error || !result.data) {
				if (jsonMode) {
					outputJSON({
						database: resolvedDbPath,
						sessions: [],
						error: result.error,
						message: result.message,
					});
					return false;
				}

				tui.newline();
				tui.error(result.message ?? 'Failed to load dashboard data.');
				return false;
			}

			if (jsonMode) {
				outputJSON({
					database: result.data.database,
					sessions: result.data.sessions.map(serializeNode),
				});
				return true;
			}

			renderDashboard(result.data, watchMode, intervalSeconds, showAllTodos);
			return true;
		};

		if (!watchMode || jsonMode) {
			const ok = await runOnce();
			return { success: ok };
		}

		// Set up keyboard input handling for watch mode
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.setEncoding('utf8');
		}

		let shouldExit = false;
		let shouldRefresh = false;

		process.stdin.on('data', (key: string) => {
			if (key === 'q' || key === '\x03') {
				// 'q' or Ctrl+C
				shouldExit = true;
			}
			if (key === 'r') {
				shouldRefresh = true;
			}
		});

		while (!shouldExit) {
			clearTerminal();
			await runOnce();

			// Sleep in small increments so we can respond to keypresses quickly
			const sleepChunk = 100;
			let elapsed = 0;
			while (elapsed < intervalMs && !shouldExit && !shouldRefresh) {
				await Bun.sleep(sleepChunk);
				elapsed += sleepChunk;
			}

			if (shouldRefresh) {
				shouldRefresh = false;
				// Loop continues immediately to refresh
			}
		}

		// Cleanup stdin state
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
			process.stdin.pause();
		}

		return { success: true };
	},
});

export default dashboardSubcommand;
