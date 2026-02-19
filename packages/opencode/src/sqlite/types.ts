export interface SessionSummary {
	additions?: number;
	deletions?: number;
	files?: number;
	diffs?: unknown;
}

export interface MessageTokens {
	total?: number;
	input?: number;
	output?: number;
	reasoning?: number;
	cache?: {
		read?: number;
		write?: number;
	};
}

export interface DBSession {
	id: string;
	projectId: string;
	parentId?: string | null;
	slug: string;
	directory: string;
	title: string;
	version: string;
	shareUrl?: string | null;
	summary?: SessionSummary;
	timeCreated: number;
	timeUpdated: number;
	timeCompacting?: number | null;
	timeArchived?: number | null;
}

export interface DBMessage {
	id: string;
	sessionId: string;
	role: string;
	agent?: string;
	model?: string;
	cost?: number;
	tokens?: MessageTokens;
	error?: string;
	timeCreated: number;
	timeUpdated: number;
}

export interface DBPart {
	id: string;
	messageId: string;
	sessionId: string;
	type: string;
	data: unknown;
	timeCreated: number;
	timeUpdated: number;
}

export interface DBToolCall {
	id: string;
	messageId: string;
	sessionId: string;
	callId: string;
	tool: string;
	status: string;
	input?: unknown;
	output?: unknown;
	timeStarted?: number;
	timeEnded?: number;
}

export interface DBTextPart {
	id: string;
	messageId: string;
	sessionId: string;
	text: string;
	timeCreated: number;
}

export interface DBTodo {
	sessionId: string;
	content: string;
	status: string;
	priority: string;
	position: number;
}

export interface SessionCostSummary {
	totalCost: number;
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cacheRead: number;
	cacheWrite: number;
	messageCount: number;
}

export interface SessionStatus {
	status: 'active' | 'idle' | 'error' | 'archived' | 'compacting';
	lastActivity: number;
}

export interface TodoSummary {
	total: number;
	pending: number;
	completed: number;
}

export interface SessionTreeNode {
	session: DBSession;
	children: SessionTreeNode[];
	messageCount: number;
	activeToolCount: number;
	todoSummary?: TodoSummary;
	costSummary?: SessionCostSummary;
}

export interface OpenCodeDBConfig {
	dbPath?: string;
	enableSchemaValidation?: boolean;
}

/** Non-text message part (image, file attachment, etc.) */
export interface DBNonTextPart {
	id: string;
	messageId: string;
	type: string;
	toolName?: string;
	timestamp?: string;
}

/** Tool call summary for compaction context */
export interface DBToolCallSummary {
	id: string;
	messageId: string;
	toolName: string;
	input?: string;
	output?: string;
	timestamp: string;
}

/** Stats about what compaction preserved */
export interface CompactionStats {
	planningPhasesCount: number;
	backgroundTasksCount: number;
	imageDescriptionsCount: number;
	toolCallSummariesCount: number;
	estimatedTokens: number;
}

/** Pre-compaction state snapshot stored to KV */
export interface PreCompactionSnapshot {
	timestamp: string;
	sessionId: string;
	planningState?: Record<string, unknown>;
	backgroundTasks?: Array<{ id: string; description: string; status: string }>;
	imageDescriptions?: string[];
	toolCallSummaries?: string[];
	cadenceState?: Record<string, unknown>;
	branch?: string;
}
