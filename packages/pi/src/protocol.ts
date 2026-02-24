// ---- Init Message (Server → Client on connect) ----

export interface HubToolDefinition {
	name: string;
	label: string;
	description: string;
	parameters: Record<string, unknown>; // JSON Schema object
}

export interface HubCommandDefinition {
	name: string;
	description: string;
}

export interface InitMessage {
	type: 'init';
	tools?: HubToolDefinition[];
	commands?: HubCommandDefinition[];
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

export type HubAction =
	| AckAction
	| BlockAction
	| ConfirmAction
	| NotifyAction
	| ReturnAction
	| StatusAction;

// ---- Response Message (Server → Client) ----

export interface HubResponse {
	id: string;
	actions: HubAction[];
}
