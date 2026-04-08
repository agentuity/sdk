// Hub protocol types used by the Coder TUI package.
// Keep the legacy exported names stable while modeling the newer hub envelopes.

export interface HubToolDefinition {
	name: string;
	label: string;
	description: string;
	parameters: Record<string, unknown>;
	promptSnippet?: string;
	promptGuidelines?: string | string[];
}

export interface HubCommandDefinition {
	name: string;
	description: string;
}

export interface AckAction {
	action: 'ACK';
}

export interface BlockAction {
	action: 'BLOCK';
	reason: string;
}

export interface ConfirmAction {
	action: 'CONFIRM';
	title: string;
	message: string;
	deny_reason?: string;
}

export interface NotifyAction {
	action: 'NOTIFY';
	message: string;
	level?: 'info' | 'warning' | 'error';
}

export interface ReturnAction {
	action: 'RETURN';
	result: unknown;
}

export interface StatusAction {
	action: 'STATUS';
	key: string;
	text?: string;
}

export interface SystemPromptAction {
	action: 'SYSTEM_PROMPT';
	systemPrompt: string;
	mode?: 'replace' | 'prefix' | 'suffix';
}

export interface InjectMessageAction {
	action: 'INJECT_MESSAGE';
	message: {
		role: 'user' | 'assistant';
		content: string;
	};
}

export type HubAction =
	| AckAction
	| BlockAction
	| ConfirmAction
	| NotifyAction
	| ReturnAction
	| StatusAction
	| SystemPromptAction
	| InjectMessageAction;

export interface AgentDefinition {
	name: string;
	displayName?: string;
	description: string;
	systemPrompt: string;
	model?: string;
	tools?: string[];
	temperature?: number;
	thinkingLevel?: string;
	readOnly?: boolean;
	hubTools?: HubToolDefinition[];
	capabilities?: string[];
	status?: 'available' | 'busy' | 'offline';
}

export interface HubConfig {
	systemPromptPrefix?: string;
	systemPromptSuffix?: string;
}

export interface InitMessage {
	type: 'init';
	role: 'lead' | 'sub_agent' | 'controller';
	sessionId?: string;
	resume?: {
		sessionFile: string;
		piSessionId?: string;
		cwd?: string;
	};
	tools?: HubToolDefinition[];
	commands?: HubCommandDefinition[];
	agents?: AgentDefinition[];
	config?: HubConfig;
	model?: {
		provider: string;
		id: string;
	};
	thinkingLevel?: string;
	task?: string;
	agentRole?: string;
}

export interface EventRequest {
	id: string;
	type: 'event';
	event: string;
	data: Record<string, unknown>;
}

export interface ToolRequest {
	id: string;
	type: 'tool';
	name: string;
	toolCallId: string;
	params: Record<string, unknown>;
}

export interface CommandRequest {
	id: string;
	type: 'command';
	name: string;
	args: string;
}

export type HubRequest = EventRequest | ToolRequest | CommandRequest;

export interface SessionEntryMessage {
	type: 'session_entry';
	path: string;
	line: string;
}

export interface SessionWriteMessage {
	type: 'session_write';
	path: string;
	content: string;
}

export interface RpcCommandMessage {
	type: 'rpc_command';
	command: Record<string, unknown>;
}

export interface RpcUiResponseMessage {
	type: 'rpc_ui_response';
	id: string;
	result: unknown;
}

export interface PingMessage {
	type: 'ping';
	timestamp: number;
}

export interface BootstrapReadyMessage {
	type: 'bootstrap_ready';
}

export type HubClientMessage =
	| HubRequest
	| SessionEntryMessage
	| SessionWriteMessage
	| BootstrapReadyMessage
	| RpcCommandMessage
	| RpcUiResponseMessage
	| PingMessage;

export interface HubResponse {
	id: string;
	actions: HubAction[];
}

export interface CoderHubStreamReadyMessage {
	type: 'session_stream_ready';
	streamId: string;
	streamUrl: string;
}

export interface CoderHubSessionResumeMessage {
	type: 'session_resume';
	streamUrl: string;
	streamId: string;
	activePrdKey?: string;
}

export interface ConnectionRejectedMessage {
	type: 'connection_rejected';
	code: string;
	message: string;
	sessionId?: string;
	reconnectState?: string;
	expiredAt?: number;
	timestamp: number;
}

export interface ProtocolErrorMessage {
	type: 'protocol_error';
	code: string;
	message: string;
	sessionId?: string;
	timestamp: number;
}

export interface ConversationEntry {
	type:
		| 'message'
		| 'thinking'
		| 'tool_call'
		| 'tool_result'
		| 'task_result'
		| 'runtime_status'
		| 'runtime_output'
		| 'runtime_preview'
		| 'turn'
		| 'user_prompt';
	agent?: string;
	content?: string;
	thinking?: string;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	toolCallId?: string;
	runtime?:
		| {
				id?: string;
				command?: string;
				status?: string;
				stream?: string;
				exitCode?: number;
		  }
		| undefined;
	preview?:
		| {
				id?: string;
				url?: string;
				status?: string;
				label?: string;
		  }
		| undefined;
	attachments?: Array<{
		id?: string;
		filename?: string;
		mime?: string;
		size?: number;
	}>;
	isError?: boolean;
	taskId?: string;
	turnId?: string;
	replyId?: string;
	sequence?: number;
	elapsedMs?: number;
	timestamp: number;
}

export interface SessionTaskState {
	taskId: string;
	agent: string;
	status: 'running' | 'completed' | 'failed';
	prompt: string;
	startedAt?: string;
	completedAt?: string;
	duration?: number;
	result?: string;
	error?: string;
}

export type HydrationTaskState = SessionTaskState;

export interface SessionTaskProjection<TTaskState = SessionTaskState> {
	tasks: TTaskState[];
}

export interface SessionStreamWorkExtension {
	stream?: SessionStreamProjection;
}

export interface SessionParticipant {
	id: string;
	role: 'lead' | 'observer' | 'controller';
	transport: 'ws' | 'sse';
	subscriptions: string[];
	connectedAt: number;
	lastActivity: number;
}

export interface SessionStreamBlock {
	output: string;
	thinking: string;
}

export interface SessionStreamProjection extends SessionStreamBlock {
	tasks: Record<string, SessionStreamBlock>;
}

export type WorkflowMode = 'standard' | 'loop';
export type LoopStatus =
	| 'idle'
	| 'starting'
	| 'running'
	| 'paused'
	| 'awaiting_input'
	| 'blocked'
	| 'completed'
	| 'failed'
	| 'cancelled';

export interface SessionLoopState {
	workflowMode: WorkflowMode;
	loopId?: string;
	status: LoopStatus;
	goal?: string;
	summary?: string;
	nextAction?: string;
	blockers: string[];
	iteration: number;
	maxIterations: number;
	autoContinue: boolean;
	allowDetached: boolean;
	recoveryAttempts: number;
	awaitingUser: boolean;
	activePrdKey?: string;
	activePrdTaskId?: string;
	coordinationJobId?: string;
	currentWaveId?: string;
	currentWaveLabel?: string;
	lastCheckpointSummary?: string;
	startedAt?: number;
	updatedAt?: number;
	lastCheckpointAt?: number;
	completedAt?: number;
	lastError?: string;
}

export type SessionBucket = 'running' | 'paused' | 'provisioning' | 'history';

export interface SessionSkillRef {
	skillId: string;
	repo: string;
	name?: string;
	url?: string;
}

export interface SessionListDiagnostics {
	inactiveRunningTasks: Array<{
		taskId: string;
		agent: string;
		inactivityMs: number;
		startedAt: string;
		lastActivityAt?: string;
	}>;
}

export interface SessionListItem {
	sessionId: string;
	label: string;
	status: string;
	mode: 'sandbox' | 'tui';
	sessionKind?: string;
	parentSessionId?: string;
	coordinationJobId?: string;
	workflowMode: WorkflowMode;
	loopStatus?: SessionLoopState['status'];
	loopIteration?: number;
	createdAt: string;
	taskCount: number;
	subAgentCount: number;
	observerCount: number;
	participantCount: number;
	tags: string[];
	skills: SessionSkillRef[];
	agentSlugs: string[];
	defaultAgent?: string;
	bucket: SessionBucket;
	runtimeAvailable: boolean;
	controlAvailable: boolean;
	historyOnly: boolean;
	diagnostics?: SessionListDiagnostics;
}

export interface SandboxSessionListItem {
	sessionId: string;
	sandboxId: string;
	status: string;
	task?: string;
	metadata?: Record<string, unknown>;
	wsConnected: boolean;
}

export interface SessionListResponse {
	sessions: {
		websocket: SessionListItem[];
		sandbox: SandboxSessionListItem[];
	};
	total: number;
}

export interface SessionDetailParticipant {
	id: string;
	role: string;
	transport: string;
	connectedAt: string;
	idle?: boolean;
}

export interface SessionAgentActivity {
	name?: string;
	status: string;
	currentTool?: string;
	currentToolArgs?: string;
	toolCallCount: number;
	lastActivity: number;
	totalElapsed?: number;
}

export interface SessionObservedProjection {
	turnCount: number;
	lastAgentModel?: string;
	compactionCount: number;
}

export interface SessionDeckGenerationState {
	state: string;
	requestedAt?: number;
	startedAt?: number;
	completedAt?: number;
	title?: string;
	deckType?: string;
	prdKey?: string;
	prdTaskId?: string;
	todoId?: string;
	error?: string;
	url?: string;
}

export interface SessionProductProjection {
	activePrdKey?: string;
	activePrdTaskId?: string;
	deckGeneration?: SessionDeckGenerationState;
}

export interface SessionActivityWorkExtensions {
	agentActivity?: Record<string, SessionAgentActivity>;
	diagnostics?: SessionListDiagnostics;
}

export interface SessionWorkProjection<TTaskState = SessionTaskState>
	extends SessionTaskProjection<TTaskState>,
		SessionStreamWorkExtension,
		SessionActivityWorkExtensions {
	workflowMode: WorkflowMode;
}

export interface SessionWorkflowProjection {
	workflowMode: WorkflowMode;
	loop?: SessionLoopState;
}

export interface SessionLoopResponse extends Omit<SessionWorkflowProjection, 'loop'> {
	sessionId: string;
	loop: SessionLoopState | null;
}

export interface SessionUsageAgentSummary {
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	costUsd: number;
	updatedAt: number;
}

export interface SessionUsageSummary {
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	costUsd: number;
	updatedAt: number;
	byAgent?: Record<string, SessionUsageAgentSummary>;
}

export interface SessionSnapshotCore extends SessionTaskProjection {
	sessionId: string;
	label: string;
	status: string;
	createdAt: string;
	mode: 'sandbox' | 'tui';
	workflowMode: WorkflowMode;
	participants: SessionDetailParticipant[];
	task?: string;
	error?: string;
	bucket: SessionBucket;
	runtimeAvailable: boolean;
	controlAvailable: boolean;
	historyOnly: boolean;
}

export interface SessionSnapshotHistoryExtensions {
	streamId: string | null;
	streamUrl: string | null;
}

export interface SessionSnapshotWorkExtensions
	extends SessionStreamWorkExtension,
		SessionActivityWorkExtensions {
	agentActivity: Record<string, SessionAgentActivity>;
	usage: SessionUsageSummary;
}

export interface SessionSnapshotWorkflowExtensions
	extends Pick<SessionWorkflowProjection, 'loop'> {}

export interface SessionSnapshotMetadataExtensions {
	context: {
		branch?: string;
		workingDirectory?: string;
	};
	observed?: SessionObservedProjection;
	product?: SessionProductProjection;
	tags: string[];
	skills: SessionSkillRef[];
	agentSlugs: string[];
	defaultAgent?: string;
	workers?: SessionListItem[];
}

export interface SessionSnapshotExtensions
	extends SessionSnapshotHistoryExtensions,
		SessionSnapshotWorkExtensions,
		SessionSnapshotWorkflowExtensions,
		SessionSnapshotMetadataExtensions {}

export interface SessionSnapshot extends SessionSnapshotCore, SessionSnapshotExtensions {}

export interface CoderHubHydrationMessage
	extends SessionTaskProjection<HydrationTaskState>,
		SessionStreamWorkExtension {
	type: 'session_hydration';
	sessionId: string;
	label?: string;
	resumedAt: number;
	entries: ConversationEntry[];
	task?: string;
	leadConnected?: boolean;
	streamingState?: {
		isStreaming?: boolean;
		activeTasks?: Array<{
			taskId: string;
			agent: string;
		}>;
	};
}

export interface PresenceEventMessage {
	type: 'presence';
	event: 'session_join' | 'session_leave' | 'presence_update';
	participant?: SessionParticipant;
	participants?: SessionParticipant[];
	sessionId: string;
	timestamp: number;
}

export interface BroadcastEventMessage {
	type: 'broadcast';
	event: string;
	data: Record<string, unknown>;
	category?: string;
	sessionId?: string;
	timestamp?: number;
}

export type ReplayEntry = ConversationEntry;

export interface ReplayHistoryResponse {
	sessionId: string;
	entriesSource: 'durable_stream' | 'session_entries' | 'event_history' | 'none';
	sourceCounts?: {
		durableStream: number;
		sessionEntries: number;
		eventHistory: number;
	};
	entries: ReplayEntry[];
}

export interface SessionEventHistoryItem {
	id: number;
	event: string;
	category: string;
	agent?: string;
	taskId?: string;
	payload: Record<string, unknown>;
	occurredAt: string;
	ingestedAt: string;
}

export interface SessionEventHistoryResponse {
	sessionId: string;
	events: SessionEventHistoryItem[];
}

export interface SessionParticipantHistoryItem {
	id: string;
	role: string;
	transport: string;
	agentRole?: string;
	connectedAt: string;
	disconnectedAt?: string;
	lastActivityAt: string;
	metadata?: Record<string, unknown>;
}

export interface SessionParticipantsResponse {
	sessionId: string;
	participants: SessionParticipantHistoryItem[];
}

export interface SessionTodoSummary {
	open: number;
	in_progress: number;
	done: number;
	closed: number;
	cancelled: number;
}

export interface SessionTodoAssignee {
	id: string;
	name: string;
	type?: string;
}

export interface SessionTodoItem {
	id: string;
	title: string;
	status: 'open' | 'in_progress' | 'done' | 'closed' | 'cancelled';
	type?: string | null;
	priority?: string | null;
	parentTaskId?: string | null;
	prdKey?: string | null;
	externalRef?: string | null;
	taskKey?: string | null;
	origin?: string | null;
	kind?: string | null;
	assignee?: SessionTodoAssignee | null;
	lastSessionId?: string | null;
	sessionIds: string[];
	tags: string[];
	memoryKeys: string[];
	memoryIds: string[];
	touchedByAgents: string[];
	lastTouchedByAgent?: string | null;
	attachments: Array<Record<string, unknown>>;
	attachmentCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface SessionTodoListResponse {
	sessionId: string;
	ok: boolean;
	op: 'session_todo_list';
	count: number;
	summary: SessionTodoSummary;
	todos: SessionTodoItem[];
	unavailable?: boolean;
	message?: string;
}

export type SseSessionSnapshotParticipant = SessionDetailParticipant;

export interface SseHydrationTaskState {
	taskId: string;
	agent: string;
	status: SessionTaskState['status'];
	prompt: string;
}

export interface SseSessionSnapshotMessage {
	type: 'snapshot';
	sessionId: string;
	label: string;
	status: string;
	createdAt: string;
	mode: 'sandbox' | 'tui';
	participants: SseSessionSnapshotParticipant[];
	taskCount: number;
	agentActivity: Record<string, SessionAgentActivity>;
	stream?: SessionStreamProjection;
}

export interface SseHydrationMessage
	extends SessionTaskProjection<SseHydrationTaskState>,
		SessionStreamWorkExtension {
	type: 'hydration';
	sessionId: string;
	entries: ConversationEntry[];
	task?: string;
}

export interface RpcEventMessage {
	type: 'rpc_event';
	event: Record<string, unknown>;
	timestamp: number;
}

export interface RpcResponseMessage {
	type: 'rpc_response';
	response: Record<string, unknown>;
}

export interface RpcUiRequestMessage {
	type: 'rpc_ui_request';
	id: string;
	method: string;
	params: Record<string, unknown>;
}

export type ServerMessage =
	| InitMessage
	| HubResponse
	| CoderHubHydrationMessage
	| CoderHubStreamReadyMessage
	| CoderHubSessionResumeMessage
	| ConnectionRejectedMessage
	| ProtocolErrorMessage
	| SseSessionSnapshotMessage
	| SseHydrationMessage
	| PresenceEventMessage
	| BroadcastEventMessage
	| RpcEventMessage
	| RpcResponseMessage
	| RpcUiRequestMessage;

export interface AgentProgressUpdate {
	agentName: string;
	status:
		| 'running'
		| 'tool_start'
		| 'tool_end'
		| 'completed'
		| 'failed'
		| 'thinking_delta'
		| 'text_delta';
	toolCallId?: string;
	currentTool?: string;
	currentToolArgs?: string;
	elapsed: number;
	tokens?: { input: number; output: number; cost: number };
	delta?: string;
}
