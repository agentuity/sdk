import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { QUERIES } from './queries';
import type {
	DBMessage,
	DBNonTextPart,
	DBSession,
	DBTextPart,
	DBTodo,
	DBToolCall,
	DBToolCallSummary,
	MessageTokens,
	OpenCodeDBConfig,
	SessionCostSummary,
	SessionStatus,
	SessionSummary,
	SessionTreeNode,
	TodoSummary,
} from './types';

type Statement = ReturnType<Database['prepare']>;

type SessionRow = {
	id: string;
	project_id: string;
	parent_id: string | null;
	slug: string;
	directory: string;
	title: string;
	version: string;
	share_url: string | null;
	summary_additions: number | null;
	summary_deletions: number | null;
	summary_files: number | null;
	summary_diffs: string | null;
	time_created: number;
	time_updated: number;
	time_compacting: number | null;
	time_archived: number | null;
};

type MessageRow = {
	id: string;
	session_id: string;
	time_created: number;
	time_updated: number;
	data: string;
};

type PartRow = {
	id: string;
	message_id: string;
	session_id: string;
	time_created: number;
	time_updated: number;
	data: string;
};

type TodoRow = {
	session_id: string;
	content: string;
	status: string;
	priority: string;
	position: number;
};

type ToolState = {
	status?: string;
	input?: unknown;
	output?: unknown;
	timeStarted?: number;
	timeEnded?: number;
	time_started?: number;
	time_ended?: number;
};

type PartData = {
	type?: string;
	text?: string;
	tool?: string;
	callID?: string;
	callId?: string;
	state?: ToolState;
};

const REQUIRED_TABLES = new Set(['session', 'message', 'part', 'todo']);
const DEFAULT_LIMIT = 100;
const DEFAULT_TOOL_LIMIT = 50;

function safeParseJSON<T>(value: string | null | undefined): T | null {
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function isMemoryPath(path: string): boolean {
	return path === ':memory:' || path.includes('mode=memory');
}

function resolveDBPath(config?: OpenCodeDBConfig): string | null {
	if (config?.dbPath) {
		return config.dbPath;
	}

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

	// Linux default
	candidates.push(join(home, '.local', 'share', 'opencode', 'opencode.db'));

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

function buildSessionSummary(row: SessionRow): SessionSummary | undefined {
	const diffs = safeParseJSON<unknown>(row.summary_diffs);
	const hasSummary =
		row.summary_additions !== null ||
		row.summary_deletions !== null ||
		row.summary_files !== null ||
		diffs !== null;

	if (!hasSummary) {
		return undefined;
	}

	return {
		additions: row.summary_additions ?? undefined,
		deletions: row.summary_deletions ?? undefined,
		files: row.summary_files ?? undefined,
		diffs: diffs ?? undefined,
	};
}

function mapSession(row: SessionRow): DBSession {
	return {
		id: row.id,
		projectId: row.project_id,
		parentId: row.parent_id ?? undefined,
		slug: row.slug,
		directory: row.directory,
		title: row.title,
		version: row.version,
		shareUrl: row.share_url ?? undefined,
		summary: buildSessionSummary(row),
		timeCreated: row.time_created,
		timeUpdated: row.time_updated,
		timeCompacting: row.time_compacting ?? undefined,
		timeArchived: row.time_archived ?? undefined,
	};
}

function mapMessage(row: MessageRow): DBMessage {
	const payload = safeParseJSON<Record<string, unknown>>(row.data) ?? {};
	const tokens = payload.tokens as MessageTokens | undefined;

	return {
		id: row.id,
		sessionId: row.session_id,
		role: typeof payload.role === 'string' ? payload.role : 'unknown',
		agent: typeof payload.agent === 'string' ? payload.agent : undefined,
		model: typeof payload.model === 'string' ? payload.model : undefined,
		cost: typeof payload.cost === 'number' ? payload.cost : undefined,
		tokens: tokens,
		error: typeof payload.error === 'string' ? payload.error : undefined,
		timeCreated: row.time_created,
		timeUpdated: row.time_updated,
	};
}

function mapToolCall(row: PartRow): DBToolCall | null {
	const payload = safeParseJSON<PartData>(row.data);
	if (!payload || (payload.type !== 'tool' && payload.type !== 'tool-invocation')) {
		return null;
	}

	const state = payload.state ?? {};
	const callId = payload.callID ?? payload.callId ?? '';

	return {
		id: row.id,
		messageId: row.message_id,
		sessionId: row.session_id,
		callId,
		tool: payload.tool ?? 'unknown',
		status: state.status ?? 'unknown',
		input: state.input,
		output: state.output,
		timeStarted: state.timeStarted ?? state.time_started,
		timeEnded: state.timeEnded ?? state.time_ended,
	};
}

function mapTextPart(row: PartRow): DBTextPart | null {
	const payload = safeParseJSON<PartData>(row.data);
	if (!payload || payload.type !== 'text' || typeof payload.text !== 'string') {
		return null;
	}

	return {
		id: row.id,
		messageId: row.message_id,
		sessionId: row.session_id,
		text: payload.text,
		timeCreated: row.time_created,
	};
}

function mapNonTextPart(row: PartRow): DBNonTextPart | null {
	const payload = safeParseJSON<PartData>(row.data);
	if (!payload || !payload.type || payload.type === 'text') return null;

	return {
		id: row.id,
		messageId: row.message_id,
		type: payload.type,
		toolName: payload.tool,
		timestamp: new Date(row.time_created).toISOString(),
	};
}

function mapToolCallSummary(row: PartRow): DBToolCallSummary | null {
	const payload = safeParseJSON<PartData>(row.data);
	if (!payload || (payload.type !== 'tool' && payload.type !== 'tool-invocation')) return null;

	const state = payload.state ?? {};
	const inputStr =
		state.input !== undefined ? String(JSON.stringify(state.input)).slice(0, 200) : undefined;
	const outputStr =
		state.output !== undefined ? String(JSON.stringify(state.output)).slice(0, 200) : undefined;

	return {
		id: row.id,
		messageId: row.message_id,
		toolName: payload.tool ?? 'unknown',
		input: inputStr,
		output: outputStr,
		timestamp: new Date(row.time_created).toISOString(),
	};
}

function isNotNull<T>(value: T | null): value is T {
	return value !== null;
}

function summarizeTodos(todos: DBTodo[]): TodoSummary {
	const total = todos.length;
	const completed = todos.filter((todo) => todo.status === 'completed').length;
	const pending = total - completed;

	return { total, pending, completed };
}

function sumTreeCost(node: SessionTreeNode): number {
	return (
		(node.costSummary?.totalCost ?? 0) +
		node.children.reduce((sum, child) => sum + sumTreeCost(child), 0)
	);
}

function createEmptySession(sessionId: string): DBSession {
	return {
		id: sessionId,
		projectId: 'unknown',
		parentId: undefined,
		slug: 'unknown',
		directory: '',
		title: 'Unknown Session',
		version: 'unknown',
		timeCreated: 0,
		timeUpdated: 0,
	};
}

export class OpenCodeDBReader {
	private db: Database | null = null;
	private available = false;
	private readonly config: OpenCodeDBConfig;
	private dbPath: string | null = null;
	private statements = new Map<keyof typeof QUERIES, Statement>();

	constructor(config?: OpenCodeDBConfig) {
		this.config = {
			enableSchemaValidation: true,
			...config,
		};
	}

	isAvailable(): boolean {
		if (this.available && this.db) {
			return true;
		}

		const resolved = resolveDBPath(this.config);
		if (!resolved) return false;

		if (isMemoryPath(resolved)) {
			return true;
		}

		return existsSync(resolved);
	}

	open(): boolean {
		if (this.db) {
			return this.available;
		}

		this.dbPath = resolveDBPath(this.config);
		if (!this.dbPath) {
			this.available = false;
			return false;
		}

		const isMemory = isMemoryPath(this.dbPath);

		if (this.config.dbPath && !isMemory && !existsSync(this.dbPath)) {
			this.available = false;
			return false;
		}

		try {
			if (isMemory) {
				// In-memory shared DBs (used in tests): open in readwrite mode
				// so pragmas can be set and the shared cache is accessible.
				this.db = new Database(this.dbPath);
				this.db.run('PRAGMA journal_mode = WAL');
			} else {
				// Real file-based DBs: open read-only for safety.
				// WAL is already configured by OpenCode; readers inherit it.
				this.db = new Database(this.dbPath, { readonly: true });
			}
			// busy_timeout is safe on both readonly and readwrite connections.
			this.db.run('PRAGMA busy_timeout = 3000');
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to open database', error);
			this.available = false;
			this.db = null;
			return false;
		}

		if (this.config.enableSchemaValidation && !this.validateSchema()) {
			console.warn('[OpenCodeDBReader] Required tables missing in database');
			this.close();
			this.available = false;
			return false;
		}

		this.available = true;
		return true;
	}

	close(): void {
		if (this.db) {
			this.db.close();
		}
		this.db = null;
		this.available = false;
		this.statements.clear();
	}

	getSession(id: string): DBSession | null {
		if (!this.ensureOpen()) return null;

		try {
			const statement = this.getStatement('GET_SESSION');
			const row = statement?.get(id) as SessionRow | null;
			return row ? mapSession(row) : null;
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get session', error);
			return null;
		}
	}

	getChildSessions(parentId: string): DBSession[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_CHILD_SESSIONS');
			const rows = statement?.all(parentId) as SessionRow[] | null;
			return rows ? rows.map(mapSession) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get child sessions', error);
			return [];
		}
	}

	getSessionsByProject(projectId: string): DBSession[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_SESSIONS_BY_PROJECT');
			const rows = statement?.all(projectId) as SessionRow[] | null;
			return rows ? rows.map(mapSession) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get project sessions', error);
			return [];
		}
	}

	getSessionTree(rootId: string): SessionTreeNode {
		const visited = new Set<string>();
		return this.buildSessionTree(rootId, visited);
	}

	getMessages(sessionId: string, opts?: { limit?: number; offset?: number }): DBMessage[] {
		if (!this.ensureOpen()) return [];

		const limit = opts?.limit ?? DEFAULT_LIMIT;
		const offset = opts?.offset ?? 0;

		try {
			const statement = this.getStatement('GET_MESSAGES');
			const rows = statement?.all(sessionId, limit, offset) as MessageRow[] | null;
			return rows ? rows.map(mapMessage) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get messages', error);
			return [];
		}
	}

	getLatestMessage(sessionId: string): DBMessage | null {
		if (!this.ensureOpen()) return null;

		try {
			const statement = this.getStatement('GET_LATEST_MESSAGE');
			const row = statement?.get(sessionId) as MessageRow | null;
			return row ? mapMessage(row) : null;
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get latest message', error);
			return null;
		}
	}

	getMessageCount(sessionId: string): number {
		if (!this.ensureOpen()) return 0;

		try {
			const statement = this.getStatement('GET_MESSAGE_COUNT');
			const row = statement?.get(sessionId) as { count: number } | null;
			return row?.count ?? 0;
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get message count', error);
			return 0;
		}
	}

	getActiveToolCalls(sessionId: string): DBToolCall[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_ACTIVE_TOOLS');
			const rows = statement?.all(sessionId) as PartRow[] | null;
			return rows ? rows.map(mapToolCall).filter(isNotNull) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get active tools', error);
			return [];
		}
	}

	getToolCallHistory(sessionId: string, opts?: { limit?: number }): DBToolCall[] {
		if (!this.ensureOpen()) return [];

		const limit = opts?.limit ?? DEFAULT_TOOL_LIMIT;

		try {
			const statement = this.getStatement('GET_TOOL_HISTORY');
			const rows = statement?.all(sessionId, limit) as PartRow[] | null;
			return rows ? rows.map(mapToolCall).filter(isNotNull) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get tool history', error);
			return [];
		}
	}

	getTextParts(sessionId: string, opts?: { limit?: number }): DBTextPart[] {
		if (!this.ensureOpen()) return [];

		const limit = opts?.limit ?? DEFAULT_LIMIT;

		try {
			const statement = this.getStatement('GET_TEXT_PARTS');
			const rows = statement?.all(sessionId, limit) as PartRow[] | null;
			return rows ? rows.map(mapTextPart).filter(isNotNull) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get text parts', error);
			return [];
		}
	}

	/**
	 * Get non-text parts (images, files, tool calls) for a session.
	 * Useful for describing attachments during compaction.
	 */
	getNonTextParts(sessionId: string): DBNonTextPart[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_NON_TEXT_PARTS');
			const rows = statement?.all(sessionId, DEFAULT_LIMIT) as PartRow[] | null;
			return rows ? rows.map(mapNonTextPart).filter(isNotNull) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get non-text parts', error);
			return [];
		}
	}

	/**
	 * Get recent tool calls for a session (newest first).
	 * Returns concise summaries for compaction context.
	 */
	getRecentToolCalls(sessionId: string, limit: number = 5): DBToolCallSummary[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_TOOL_HISTORY');
			const rows = statement?.all(sessionId, limit) as PartRow[] | null;
			return rows ? rows.map(mapToolCallSummary).filter(isNotNull) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get recent tool calls', error);
			return [];
		}
	}

	getTodos(sessionId: string): DBTodo[] {
		if (!this.ensureOpen()) return [];

		try {
			const statement = this.getStatement('GET_TODOS');
			const rows = statement?.all(sessionId) as TodoRow[] | null;
			return rows
				? rows.map((row) => ({
						sessionId: row.session_id,
						content: row.content,
						status: row.status,
						priority: row.priority,
						position: row.position,
					}))
				: [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get todos', error);
			return [];
		}
	}

	getSessionCost(sessionId: string): SessionCostSummary {
		if (!this.ensureOpen()) {
			return {
				totalCost: 0,
				totalTokens: 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				cacheRead: 0,
				cacheWrite: 0,
				messageCount: 0,
			};
		}

		try {
			const statement = this.getStatement('GET_SESSION_COST');
			const row = statement?.get(sessionId) as {
				total_cost: number;
				total_tokens: number;
				input_tokens: number;
				output_tokens: number;
				reasoning_tokens: number;
				cache_read: number;
				cache_write: number;
				message_count: number;
			} | null;

			return {
				totalCost: row?.total_cost ?? 0,
				totalTokens: row?.total_tokens ?? 0,
				inputTokens: row?.input_tokens ?? 0,
				outputTokens: row?.output_tokens ?? 0,
				reasoningTokens: row?.reasoning_tokens ?? 0,
				cacheRead: row?.cache_read ?? 0,
				cacheWrite: row?.cache_write ?? 0,
				messageCount: row?.message_count ?? 0,
			};
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to get session cost', error);
			return {
				totalCost: 0,
				totalTokens: 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				cacheRead: 0,
				cacheWrite: 0,
				messageCount: 0,
			};
		}
	}

	getSessionStatus(sessionId: string): SessionStatus {
		const session = this.getSession(sessionId);
		if (!session) {
			return { status: 'idle', lastActivity: 0 };
		}

		if (session.timeArchived) {
			return { status: 'archived', lastActivity: session.timeUpdated };
		}

		if (session.timeCompacting) {
			return { status: 'compacting', lastActivity: session.timeUpdated };
		}

		const latest = this.getLatestMessage(sessionId);
		if (latest?.error) {
			return { status: 'error', lastActivity: latest.timeUpdated };
		}

		const activeTools = this.getActiveToolCalls(sessionId);
		const lastActivity = Math.max(session.timeUpdated, latest?.timeUpdated ?? 0);

		if (activeTools.length > 0) {
			return { status: 'active', lastActivity };
		}

		return { status: 'idle', lastActivity };
	}

	searchSessions(query: string, opts?: { limit?: number }): DBSession[] {
		if (!this.ensureOpen()) return [];

		try {
			const pattern = `%${query}%`;
			if (opts?.limit !== undefined) {
				const statement = this.getStatement('SEARCH_SESSIONS_LIMITED');
				const rows = statement?.all(pattern, opts.limit) as SessionRow[] | null;
				return rows ? rows.map(mapSession) : [];
			}
			const statement = this.getStatement('SEARCH_SESSIONS');
			const rows = statement?.all(pattern) as SessionRow[] | null;
			return rows ? rows.map(mapSession) : [];
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to search sessions', error);
			return [];
		}
	}

	getSessionDashboard(parentSessionId: string): {
		sessions: SessionTreeNode[];
		totalCost: number;
	} {
		const sessions = this.getChildSessions(parentSessionId).map((child) =>
			this.getSessionTree(child.id)
		);
		const totalCost = sessions.reduce((sum, node) => sum + sumTreeCost(node), 0);
		return { sessions, totalCost };
	}

	private ensureOpen(): boolean {
		if (this.db && this.available) {
			return true;
		}
		return this.open();
	}

	private getStatement(key: keyof typeof QUERIES): Statement | null {
		if (!this.db) return null;

		const existing = this.statements.get(key);
		if (existing) return existing;

		const statement = this.db.prepare(QUERIES[key]);
		this.statements.set(key, statement);
		return statement;
	}

	private validateSchema(): boolean {
		if (!this.db) return false;

		try {
			const statement = this.db.prepare(QUERIES.CHECK_TABLES);
			const rows = statement.all() as Array<{ name: string }>;
			const found = new Set(rows.map((row) => row.name));
			for (const table of REQUIRED_TABLES) {
				if (!found.has(table)) {
					return false;
				}
			}
			return true;
		} catch (error) {
			console.warn('[OpenCodeDBReader] Failed to validate schema', error);
			return false;
		}
	}

	private buildSessionTree(rootId: string, visited: Set<string>): SessionTreeNode {
		if (visited.has(rootId)) {
			console.warn('[OpenCodeDBReader] Detected session cycle', rootId);
			return {
				session: createEmptySession(rootId),
				children: [],
				messageCount: 0,
				activeToolCount: 0,
			};
		}

		visited.add(rootId);
		const session = this.getSession(rootId) ?? createEmptySession(rootId);
		const children = this.getChildSessions(rootId).map((child) =>
			this.buildSessionTree(child.id, visited)
		);
		const messageCount = this.getMessageCount(rootId);
		const activeToolCount = this.getActiveToolCalls(rootId).length;
		const todos = this.getTodos(rootId);
		const costSummary = this.getSessionCost(rootId);

		return {
			session,
			children,
			messageCount,
			activeToolCount,
			todoSummary: todos.length > 0 ? summarizeTodos(todos) : undefined,
			costSummary,
		};
	}
}
