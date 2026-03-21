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
	sessionId?: string;
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
		| 'turn'
		| 'user_prompt';
	agent?: string;
	content?: string;
	thinking?: string;
	toolName?: string;
	toolArgs?: Record<string, unknown>;
	toolCallId?: string;
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

export interface SessionSnapshot {
	sessionId: string;
	label: string;
	status: 'active' | 'paused' | 'shutdown' | 'archived' | 'error' | 'stopped';
	createdAt: string;
	mode: 'sandbox' | 'tui';
	task?: string;
	error?: string;
	streamId?: string | null;
	streamUrl?: string | null;
	context: {
		branch?: string;
		workingDirectory?: string;
	};
	participants: SessionParticipant[];
	tasks: SessionTaskState[];
	agentActivity: Record<
		string,
		{
			name?: string;
			status: string;
			currentTool?: string;
			currentToolArgs?: string;
			toolCallCount: number;
			lastActivity: number;
			totalElapsed?: number;
		}
	>;
	stream?: SessionStreamProjection;
	tags?: string[];
	defaultAgent?: string;
	bucket?: 'running' | 'paused' | 'provisioning' | 'history';
	runtimeAvailable?: boolean;
	controlAvailable?: boolean;
	historyOnly?: boolean;
}

export interface CoderHubHydrationMessage {
	type: 'session_hydration';
	sessionId: string;
	label?: string;
	resumedAt: number;
	entries: ConversationEntry[];
	tasks: HydrationTaskState[];
	stream?: SessionStreamProjection;
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
