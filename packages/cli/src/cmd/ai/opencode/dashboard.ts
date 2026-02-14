import { Database } from 'bun:sqlite';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { createSubcommand, type CommandContext } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { isJSONMode, outputJSON } from '../../../output';
import { z } from 'zod';

const DashboardOptionsSchema = z.object({
	json: z.boolean().optional().describe('Output JSON format'),
	session: z.string().optional().describe('Focus on a specific session ID'),
	watch: z.boolean().optional().describe('Continuously refresh the dashboard'),
	interval: z.number().optional().describe('Refresh interval in seconds (default: 5)'),
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

const REQUIRED_TABLES = new Set(['session', 'message', 'part', 'todo']);

function isMemoryPath(path: string): boolean {
	return path === ':memory:' || path.includes('mode=memory');
}

function getDefaultDBCandidates(): string[] {
	const home = homedir();
	const candidates: string[] = [];
	const currentPlatform = platform();

	if (currentPlatform === 'darwin') {
		candidates.push(join(home, 'Library', 'Application Support', 'opencode', 'opencode.db'));
	}

	if (currentPlatform === 'win32') {
		const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
		const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
		candidates.push(join(appData, 'opencode', 'opencode.db'));
		candidates.push(join(localAppData, 'opencode', 'opencode.db'));
	}

	candidates.push(join(home, '.local', 'share', 'opencode', 'opencode.db'));

	return candidates;
}

async function resolveOpenCodeDBPath(): Promise<string | null> {
	const envPath = process.env.OPENCODE_DB_PATH;
	if (envPath) {
		if (isMemoryPath(envPath)) return envPath;
		if (await Bun.file(envPath).exists()) return envPath;
	}

	const candidates = getDefaultDBCandidates();
	for (const candidate of candidates) {
		if (await Bun.file(candidate).exists()) {
			return candidate;
		}
	}

	return null;
}

function formatCost(cost: CostSummary): string {
	if (!cost || cost.totalCost <= 0) {
		return '$0.00';
	}
	return `$${cost.totalCost.toFixed(2)}`;
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

async function loadDashboardData(
	dbPath: string,
	focusSessionId?: string
): Promise<{ data?: DashboardData; error?: string; message?: string }> {
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
					AND json_extract(p.data, '$.state.status') = 'running'`
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

		const { roots, allNodes } = buildSessionTree(
			sessions,
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

		return { data: { database: dbPath, sessions: roots, allSessions: allNodes } };
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

function renderDashboard(data: DashboardData, watchMode: boolean): void {
	const flattened = flattenSessionRows(data.sessions);
	const activeCount = flattened.filter((node) => node.status === 'active').length;

	tui.newline();
	tui.output(tui.bold('📊 OpenCode Dashboard'));
	tui.output('─────────────────────');
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

		tui.table(rows, ['Session', 'Status', 'Messages', 'Tools', 'Cost']);
	}

	const allTodos: Array<{ sessionId: string; todo: TodoItem }> = [];
	for (const node of flattened) {
		for (const todo of node.todos) {
			allTodos.push({ sessionId: node.session.id, todo });
		}
	}

	const totalTodos = allTodos.length;
	const completedTodos = allTodos.filter((item) => item.todo.status === 'completed').length;
	const pendingTodos = totalTodos - completedTodos;

	tui.newline();
	tui.output(tui.bold(`Todos (${pendingTodos} pending / ${totalTodos} total)`));
	if (allTodos.length === 0) {
		tui.output(tui.muted('No todos found'));
	} else {
		const showSessionLabel = new Set(allTodos.map((item) => item.sessionId)).size > 1;
		for (const { sessionId, todo } of allTodos) {
			const checked = todo.status === 'completed' ? 'x' : ' ';
			const sessionLabel = showSessionLabel ? `(${sessionId}) ` : '';
			tui.output(`- [${checked}] ${sessionLabel}${todo.content}`);
		}
	}

	if (watchMode) {
		tui.newline();
		tui.output(tui.muted('Press Ctrl+C to exit'));
	}
}

function serializeNode(node: SessionNode): Record<string, unknown> {
	return {
		id: node.session.id,
		title: node.session.title,
		status: node.status,
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
	description: 'View Lead-of-Leads session dashboard',
	tags: ['read-only', 'fast'],
	schema: {
		options: DashboardOptionsSchema,
	},
	examples: [
		{
			command: getCommand('ai opencode dashboard'),
			description: 'View session dashboard',
		},
		{
			command: getCommand('ai opencode dashboard --session ses_abc123'),
			description: 'Focus on a specific session tree',
		},
		{
			command: getCommand('ai opencode dashboard --json'),
			description: 'Output dashboard data as JSON',
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
		const focusSessionId = opts?.session;

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

		const runOnce = async () => {
			const result = await loadDashboardData(resolvedDbPath, focusSessionId);
			if (result.error || !result.data) {
				if (jsonMode) {
					outputJSON({
						database: resolvedDbPath,
						sessions: [],
						error: result.error,
						message: result.message,
					});
					return;
				}

				tui.newline();
				tui.error(result.message ?? 'Failed to load dashboard data.');
				return;
			}

			if (jsonMode) {
				outputJSON({
					database: result.data.database,
					sessions: result.data.sessions.map(serializeNode),
				});
				return;
			}

			renderDashboard(result.data, watchMode);
		};

		if (!watchMode || jsonMode) {
			await runOnce();
			return { success: true };
		}

		while (true) {
			clearTerminal();
			await runOnce();
			await Bun.sleep(intervalMs);
		}
	},
});

export default dashboardSubcommand;
