// ---- Init Message (Server → Client on connect) ----

export interface HubToolDefinition {
	name: string;
	label: string;
	description: string;
	parameters: Record<string, unknown>; // JSON Schema object
	promptSnippet?: string;
	promptGuidelines?: string;
}

/** Command definition sent by Hub for agent routing slash commands. */
export interface HubCommandDefinition {
	name: string;
	description: string;
}

export interface AgentDefinition {
	name: string;
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
}

// ---- Request Messages (Client → Server) ----

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

/** Command request (Client -> Server) for slash command execution. */
export interface CommandRequest {
	id: string;
	type: 'command';
	name: string;
	args: string;
}

export type HubRequest = EventRequest | ToolRequest | CommandRequest;

// ---- Actions ----

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
	text?: string; // undefined = clear status
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

// ---- Progress Tracking (Sub-Agent → Parent) ----

/** Progress update from a running sub-agent */
export interface AgentProgressUpdate {
	agentName: string;
	status: 'running' | 'tool_start' | 'tool_end' | 'completed' | 'failed' | 'thinking_delta' | 'text_delta';
	currentTool?: string;
	currentToolArgs?: string;
	elapsed: number;
	tokens?: { input: number; output: number; cost: number };
	delta?: string; // Streaming token delta for thinking_delta / text_delta
}

// ---- Response Message (Server → Client) ----

export interface HubResponse {
	id: string;
	actions: HubAction[];
}
