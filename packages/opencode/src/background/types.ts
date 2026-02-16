// Task status and interfaces
export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export interface TaskProgress {
	toolCalls: number;
	lastTool?: string;
	lastUpdate: Date;
	lastMessage?: string;
	lastMessageAt?: Date;
}

export interface BackgroundTask {
	id: string; // Format: bg_xxxxx
	sessionId?: string; // OpenCode session ID (set when running)
	parentSessionId: string; // Parent session that launched this
	parentMessageId?: string;
	description: string;
	prompt: string;
	agent: string; // Agent name
	status: BackgroundTaskStatus;
	queuedAt?: Date;
	startedAt?: Date;
	completedAt?: Date;
	result?: string;
	error?: string;
	progress?: TaskProgress;
	concurrencyKey?: string; // Active concurrency slot key
	concurrencyGroup?: string; // Persistent key for re-acquiring on resume
	notifiedStatuses?: Set<BackgroundTaskStatus>; // Tracks statuses already notified to prevent duplicates
}

export interface LaunchInput {
	description: string;
	prompt: string;
	agent: string;
	parentSessionId: string;
	parentMessageId?: string;
}

export interface ResumeInput {
	sessionId: string;
	prompt: string;
	parentSessionId: string;
	parentMessageId?: string;
}

export interface BackgroundTaskConfig {
	enabled: boolean;
	defaultConcurrency: number;
	staleTimeoutMs: number;
	providerConcurrency?: Record<string, number>;
	modelConcurrency?: Record<string, number>;
}

/**
 * Result of inspecting a background task's session.
 * Provides access to session details and messages for debugging.
 */
export interface TaskInspection {
	taskId: string;
	sessionId: string;
	status: BackgroundTaskStatus;
	/** Session details from OpenCode SDK */
	session: unknown;
	/** Messages from the session */
	messages: Array<{ info: unknown; parts: unknown[] }>;
	/** Last activity timestamp from task progress */
	lastActivity?: string;
	/** Total message count when available */
	messageCount?: number;
	/** Active tools with status when available */
	activeTools?: Array<{ tool: string; status: string; callId: string }>;
	/** Todo items when available */
	todos?: Array<{ content: string; status: string; priority: string }>;
	/** Cost summary when available */
	costSummary?: { totalCost: number; totalTokens: number };
	/** Count of child sessions (nested LoL) when available */
	childSessionCount?: number;
}
