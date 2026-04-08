/**
 * Protocol message types for Coder Hub WebSocket and SSE communication.
 *
 * This module defines all message types exchanged between clients and the
 * Coder Hub server. Messages are validated using Zod schemas for type safety.
 *
 * @module coder/protocol
 *
 * @example Parsing server messages
 * ```typescript
 * import { parseServerMessage, type ServerMessage } from '@agentuity/core/coder';
 *
 * const raw = JSON.parse(websocketData);
 * const message = parseServerMessage(raw);
 * if (message?.type === 'broadcast') {
 *   console.log('Event:', message.event);
 * }
 * ```
 */

import { z } from 'zod/v4';

/** Connection role assigned by the server in the init message */
export const CoderHubInitRoleSchema = z.enum(['lead', 'sub_agent', 'controller']);
export type CoderHubInitRole = z.infer<typeof CoderHubInitRoleSchema>;

/** Tool definition provided by the server to clients */
export const CoderHubToolDefinitionSchema = z.object({
	name: z.string(),
	label: z.string(),
	description: z.string(),
	parameters: z.record(z.string(), z.unknown()),
	promptSnippet: z.string().optional(),
	promptGuidelines: z.string().optional(),
	timeoutMs: z.number().optional(),
});
export type CoderHubToolDefinition = z.infer<typeof CoderHubToolDefinitionSchema>;

export const CoderHubCommandDefinitionSchema = z.object({
	name: z.string(),
	description: z.string(),
});
export type CoderHubCommandDefinition = z.infer<typeof CoderHubCommandDefinitionSchema>;

export const AgentDefinitionSchema = z.object({
	name: z.string(),
	displayName: z.string().optional(),
	description: z.string(),
	systemPrompt: z.string(),
	model: z.string().optional(),
	tools: z.array(z.string()).optional(),
	temperature: z.number().optional(),
	thinkingLevel: z.string().optional(),
	readOnly: z.boolean().optional(),
	hubTools: z.array(CoderHubToolDefinitionSchema).optional(),
	capabilities: z.array(z.string()).optional(),
	status: z.enum(['available', 'busy', 'offline']).optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const CoderHubConfigSchema = z.object({
	systemPromptPrefix: z.string().optional(),
	systemPromptSuffix: z.string().optional(),
});
export type CoderHubConfig = z.infer<typeof CoderHubConfigSchema>;

export const CoderHubLeadResumeDescriptorSchema = z.object({
	sessionFile: z.string(),
	piSessionId: z.string().optional(),
	cwd: z.string().optional(),
});
export type CoderHubLeadResumeDescriptor = z.infer<typeof CoderHubLeadResumeDescriptorSchema>;

const BaseCoderHubInitMessageSchema = z.object({
	type: z.literal('init'),
	role: CoderHubInitRoleSchema,
	sessionId: z.string().optional(),
	resume: CoderHubLeadResumeDescriptorSchema.optional(),
	tools: z.array(CoderHubToolDefinitionSchema).optional(),
	commands: z.array(CoderHubCommandDefinitionSchema).optional(),
	agents: z.array(AgentDefinitionSchema).optional(),
	config: CoderHubConfigSchema.optional(),
	model: z
		.object({
			provider: z.string(),
			id: z.string(),
		})
		.optional(),
	thinkingLevel: z.string().optional(),
	task: z.string().optional(),
	agentRole: z.string().optional(),
});

export const CoderHubLeadInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z.literal('lead'),
});
export type CoderHubLeadInitMessage = z.infer<typeof CoderHubLeadInitMessageSchema>;

export const CoderHubSubAgentInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z.literal('sub_agent'),
});
export type CoderHubSubAgentInitMessage = z.infer<typeof CoderHubSubAgentInitMessageSchema>;

export const CoderHubControllerInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z.literal('controller'),
});
export type CoderHubControllerInitMessage = z.infer<typeof CoderHubControllerInitMessageSchema>;

export const CoderHubInitMessageSchema = z.discriminatedUnion('role', [
	CoderHubLeadInitMessageSchema,
	CoderHubSubAgentInitMessageSchema,
	CoderHubControllerInitMessageSchema,
]);
export type CoderHubInitMessage = z.infer<typeof CoderHubInitMessageSchema>;

export const CoderHubStreamReadyMessageSchema = z.object({
	type: z.literal('session_stream_ready'),
	streamId: z.string(),
	streamUrl: z.string(),
});
export type CoderHubStreamReadyMessage = z.infer<typeof CoderHubStreamReadyMessageSchema>;

export const CoderHubSessionResumeMessageSchema = z.object({
	type: z.literal('session_resume'),
	streamUrl: z.string(),
	streamId: z.string(),
	activePrdKey: z.string().optional(),
});
export type CoderHubSessionResumeMessage = z.infer<typeof CoderHubSessionResumeMessageSchema>;

export const ConnectionRejectedMessageSchema = z.object({
	type: z.literal('connection_rejected'),
	code: z.string(),
	message: z.string(),
	sessionId: z.string().optional(),
	reconnectState: z.string().optional(),
	expiredAt: z.number().optional(),
	timestamp: z.number(),
});
export type ConnectionRejectedMessage = z.infer<typeof ConnectionRejectedMessageSchema>;

export const ProtocolErrorMessageSchema = z.object({
	type: z.literal('protocol_error'),
	code: z.string(),
	message: z.string(),
	sessionId: z.string().optional(),
	timestamp: z.number(),
});
export type ProtocolErrorMessage = z.infer<typeof ProtocolErrorMessageSchema>;

export const AckActionSchema = z.object({ action: z.literal('ACK') });
export type AckAction = z.infer<typeof AckActionSchema>;

export const BlockActionSchema = z.object({
	action: z.literal('BLOCK'),
	reason: z.string(),
});
export type BlockAction = z.infer<typeof BlockActionSchema>;

export const ConfirmActionSchema = z.object({
	action: z.literal('CONFIRM'),
	title: z.string(),
	message: z.string(),
	deny_reason: z.string().optional(),
});
export type ConfirmAction = z.infer<typeof ConfirmActionSchema>;

export const NotifyActionSchema = z.object({
	action: z.literal('NOTIFY'),
	message: z.string(),
	level: z.enum(['info', 'warning', 'error']).optional(),
});
export type NotifyAction = z.infer<typeof NotifyActionSchema>;

export const ReturnActionSchema = z.object({
	action: z.literal('RETURN'),
	result: z.unknown(),
});
export type ReturnAction = z.infer<typeof ReturnActionSchema>;

export const StatusActionSchema = z.object({
	action: z.literal('STATUS'),
	key: z.string(),
	text: z.string().optional(),
});
export type StatusAction = z.infer<typeof StatusActionSchema>;

export const SystemPromptActionSchema = z.object({
	action: z.literal('SYSTEM_PROMPT'),
	systemPrompt: z.string(),
	mode: z.enum(['replace', 'prefix', 'suffix']).optional(),
});
export type SystemPromptAction = z.infer<typeof SystemPromptActionSchema>;

export const InjectMessageActionSchema = z.object({
	action: z.literal('INJECT_MESSAGE'),
	message: z.object({
		role: z.enum(['user', 'assistant']),
		content: z.string(),
	}),
});
export type InjectMessageAction = z.infer<typeof InjectMessageActionSchema>;

export const CoderHubActionSchema = z.discriminatedUnion('action', [
	AckActionSchema,
	BlockActionSchema,
	ConfirmActionSchema,
	NotifyActionSchema,
	ReturnActionSchema,
	StatusActionSchema,
	SystemPromptActionSchema,
	InjectMessageActionSchema,
]);
export type CoderHubAction = z.infer<typeof CoderHubActionSchema>;

export const CoderHubResponseSchema = z.object({
	id: z.string(),
	actions: z.array(CoderHubActionSchema),
});
export type CoderHubResponse = z.infer<typeof CoderHubResponseSchema>;

export const ConversationAuthorSchema = z.object({
	userId: z.string().optional(),
	displayName: z.string().optional(),
	email: z.string().optional(),
	avatarUrl: z.string().optional(),
	actorType: z.enum(['user', 'api_key', 'service']).optional(),
	apiKeyLabel: z.string().optional(),
});
export type ConversationAuthor = z.infer<typeof ConversationAuthorSchema>;

export const RuntimeProcessDescriptorSchema = z.object({
	pid: z.number().optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	cwd: z.string().optional(),
	env: z.record(z.string(), z.string()).optional(),
	status: z.string().optional(),
	exitCode: z.number().optional(),
	signal: z.string().optional(),
});
export type RuntimeProcessDescriptor = z.infer<typeof RuntimeProcessDescriptorSchema>;

export const RuntimePreviewDescriptorSchema = z.object({
	url: z.string().optional(),
	port: z.number().optional(),
	protocol: z.string().optional(),
	path: z.string().optional(),
	status: z.string().optional(),
});
export type RuntimePreviewDescriptor = z.infer<typeof RuntimePreviewDescriptorSchema>;

export const PromptAttachmentDescriptorSchema = z.object({
	type: z.string(),
	name: z.string().optional(),
	url: z.string().optional(),
	content: z.string().optional(),
	mimeType: z.string().optional(),
	size: z.number().optional(),
});
export type PromptAttachmentDescriptor = z.infer<typeof PromptAttachmentDescriptorSchema>;

export const ConversationEntrySchema = z.object({
	type: z.enum([
		'message',
		'thinking',
		'tool_call',
		'tool_result',
		'task_result',
		'runtime_status',
		'runtime_output',
		'runtime_preview',
		'turn',
		'user_prompt',
	]),
	agent: z.string().optional(),
	content: z.string().optional(),
	thinking: z.string().optional(),
	toolName: z.string().optional(),
	toolArgs: z.record(z.string(), z.unknown()).optional(),
	toolCallId: z.string().optional(),
	runtime: RuntimeProcessDescriptorSchema.optional(),
	preview: RuntimePreviewDescriptorSchema.optional(),
	attachments: z.array(PromptAttachmentDescriptorSchema).optional(),
	author: ConversationAuthorSchema.optional(),
	isError: z.boolean().optional(),
	taskId: z.string().optional(),
	turnId: z.string().optional(),
	replyId: z.string().optional(),
	sequence: z.number().optional(),
	elapsedMs: z.number().optional(),
	timestamp: z.number(),
});
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;

export const SessionTaskStateSchema = z.object({
	taskId: z.string(),
	agent: z.string(),
	status: z.enum(['running', 'completed', 'failed']),
	prompt: z.string(),
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	duration: z.number().optional(),
	result: z.string().optional(),
	error: z.string().optional(),
});
export type SessionTaskState = z.infer<typeof SessionTaskStateSchema>;

export const SessionStreamBlockSchema = z.object({
	output: z.string(),
	thinking: z.string(),
});
export type SessionStreamBlock = z.infer<typeof SessionStreamBlockSchema>;

export const SessionStreamProjectionSchema = SessionStreamBlockSchema.extend({
	tasks: z.record(z.string(), SessionStreamBlockSchema),
});
export type SessionStreamProjection = z.infer<typeof SessionStreamProjectionSchema>;

export const SessionAgentActivitySchema = z.object({
	name: z.string().optional(),
	status: z.string(),
	currentTool: z.string().optional(),
	currentToolArgs: z.string().optional(),
	toolCallCount: z.number(),
	lastActivity: z.number(),
	totalElapsed: z.number().optional(),
});
export type SessionAgentActivity = z.infer<typeof SessionAgentActivitySchema>;

export const CoderHubHydrationMessageSchema = z.object({
	type: z.literal('session_hydration'),
	sessionId: z.string(),
	label: z.string().optional(),
	resumedAt: z.number(),
	entries: z.array(ConversationEntrySchema),
	task: z.string().optional(),
	leadConnected: z.boolean().optional(),
	stream: SessionStreamProjectionSchema.optional(),
	tasks: z.array(SessionTaskStateSchema).optional(),
	streamingState: z
		.object({
			isStreaming: z.boolean().optional(),
			activeTasks: z
				.array(
					z.object({
						taskId: z.string(),
						agent: z.string(),
					})
				)
				.optional(),
		})
		.optional(),
});
export type CoderHubHydrationMessage = z.infer<typeof CoderHubHydrationMessageSchema>;

export const BootstrapReadyMessageSchema = z.object({
	type: z.literal('bootstrap_ready'),
});
export type BootstrapReadyMessage = z.infer<typeof BootstrapReadyMessageSchema>;

export const SessionEntryMessageSchema = z.object({
	type: z.literal('session_entry'),
	path: z.string(),
	line: z.string(),
});
export type SessionEntryMessage = z.infer<typeof SessionEntryMessageSchema>;

export const SessionWriteMessageSchema = z.object({
	type: z.literal('session_write'),
	path: z.string(),
	content: z.string(),
});
export type SessionWriteMessage = z.infer<typeof SessionWriteMessageSchema>;

export const SessionParticipantSchema = z.object({
	id: z.string(),
	role: z.enum(['lead', 'observer', 'controller']),
	transport: z.enum(['ws', 'sse']),
	subscriptions: z.array(z.string()),
	connectedAt: z.number(),
	lastActivity: z.number(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

export const PresenceEventMessageSchema = z.object({
	type: z.literal('presence'),
	event: z.enum(['session_join', 'session_leave', 'presence_update']),
	participant: SessionParticipantSchema.optional(),
	participants: z.array(SessionParticipantSchema).optional(),
	sessionId: z.string(),
	timestamp: z.number(),
});
export type PresenceEventMessage = z.infer<typeof PresenceEventMessageSchema>;

export const BroadcastEventMessageSchema = z.object({
	type: z.literal('broadcast'),
	event: z.string(),
	data: z.record(z.string(), z.unknown()),
	category: z.string(),
	sessionId: z.string(),
	timestamp: z.number(),
});
export type BroadcastEventMessage = z.infer<typeof BroadcastEventMessageSchema>;

export const RpcCommandMessageSchema = z.object({
	type: z.literal('rpc_command'),
	command: z.record(z.string(), z.unknown()),
});
export type RpcCommandMessage = z.infer<typeof RpcCommandMessageSchema>;

export const RpcEventMessageSchema = z.object({
	type: z.literal('rpc_event'),
	event: z.record(z.string(), z.unknown()),
	timestamp: z.number(),
});
export type RpcEventMessage = z.infer<typeof RpcEventMessageSchema>;

export const RpcResponseMessageSchema = z.object({
	type: z.literal('rpc_response'),
	response: z.record(z.string(), z.unknown()),
});
export type RpcResponseMessage = z.infer<typeof RpcResponseMessageSchema>;

export const RpcUiRequestMessageSchema = z.object({
	type: z.literal('rpc_ui_request'),
	id: z.string(),
	method: z.string(),
	params: z.record(z.string(), z.unknown()),
});
export type RpcUiRequestMessage = z.infer<typeof RpcUiRequestMessageSchema>;

export const RpcUiResponseMessageSchema = z.object({
	type: z.literal('rpc_ui_response'),
	id: z.string(),
	result: z.unknown(),
});
export type RpcUiResponseMessage = z.infer<typeof RpcUiResponseMessageSchema>;

export const PingMessageSchema = z.object({
	type: z.literal('ping'),
	timestamp: z.number(),
});
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const PongMessageSchema = z.object({
	type: z.literal('pong'),
	timestamp: z.number(),
	echoedTimestamp: z.number().optional(),
});
export type PongMessage = z.infer<typeof PongMessageSchema>;

export const EventRequestSchema = z.object({
	id: z.string(),
	type: z.literal('event'),
	event: z.string(),
	data: z.record(z.string(), z.unknown()),
});
export type EventRequest = z.infer<typeof EventRequestSchema>;

export const ToolRequestSchema = z.object({
	id: z.string(),
	type: z.literal('tool'),
	name: z.string(),
	toolCallId: z.string(),
	params: z.record(z.string(), z.unknown()),
});
export type ToolRequest = z.infer<typeof ToolRequestSchema>;

export const CommandRequestSchema = z.object({
	id: z.string(),
	type: z.literal('command'),
	name: z.string(),
	args: z.string(),
});
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/**
 * All possible client-to-server message types.
 *
 * Messages the client can send to the Coder Hub server.
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
	EventRequestSchema,
	ToolRequestSchema,
	CommandRequestSchema,
	SessionEntryMessageSchema,
	SessionWriteMessageSchema,
	BootstrapReadyMessageSchema,
	RpcCommandMessageSchema,
	RpcUiResponseMessageSchema,
	PingMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * All possible server-to-client message types.
 *
 * Messages the Coder Hub server can send to connected clients.
 */
export const ServerMessageSchema = z.discriminatedUnion('type', [
	CoderHubInitMessageSchema,
	CoderHubResponseSchema,
	CoderHubHydrationMessageSchema,
	CoderHubStreamReadyMessageSchema,
	CoderHubSessionResumeMessageSchema,
	PongMessageSchema,
	ConnectionRejectedMessageSchema,
	ProtocolErrorMessageSchema,
	PresenceEventMessageSchema,
	BroadcastEventMessageSchema,
	RpcEventMessageSchema,
	RpcResponseMessageSchema,
	RpcUiRequestMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * Initial session snapshot sent via SSE after connection.
 *
 * Contains the current session state, participants, and agent activity.
 */
export const SseSessionSnapshotMessageSchema = z.object({
	type: z.literal('snapshot'),
	sessionId: z.string(),
	label: z.string(),
	status: z.string(),
	createdAt: z.string(),
	mode: z.enum(['sandbox', 'tui']),
	participants: z.array(
		z.object({
			id: z.string(),
			role: z.string(),
			transport: z.string(),
			connectedAt: z.string(),
			idle: z.boolean().optional(),
		})
	),
	taskCount: z.number(),
	agentActivity: z.record(z.string(), SessionAgentActivitySchema),
	stream: SessionStreamProjectionSchema.optional(),
});
export type SseSessionSnapshotMessage = z.infer<typeof SseSessionSnapshotMessageSchema>;

export const SseHydrationMessageSchema = z.object({
	type: z.literal('hydration'),
	sessionId: z.string(),
	entries: z.array(ConversationEntrySchema),
	task: z.string().optional(),
	stream: SessionStreamProjectionSchema.optional(),
	tasks: z.array(SessionTaskStateSchema).optional(),
});
export type SseHydrationMessage = z.infer<typeof SseHydrationMessageSchema>;

/**
 * All possible SSE message types sent to observers.
 *
 * SSE connections receive a subset of server messages suitable for
 * read-only observation (snapshots, broadcasts, presence).
 */
export const ObserverSseMessageSchema = z.discriminatedUnion('type', [
	SseSessionSnapshotMessageSchema,
	SseHydrationMessageSchema,
	PresenceEventMessageSchema,
	BroadcastEventMessageSchema,
]);
export type ObserverSseMessage = z.infer<typeof ObserverSseMessageSchema>;

export const ConnectionParamsSchema = z.object({
	agent: z.string().optional(),
	parent: z.string().optional(),
	sessionId: z.string().optional(),
	task: z.string().optional(),
	label: z.string().optional(),
	orgId: z.string().optional(),
	userId: z.string().optional(),
	origin: z.enum(['web', 'desktop', 'tui', 'sdk']).optional(),
	role: z.enum(['lead', 'observer', 'controller']).optional(),
	coordJobId: z.string().optional(),
	coordRole: z.string().optional(),
	driverMode: z.enum(['rpc']).optional(),
	driverInstanceId: z.string().optional(),
	driverVersion: z.string().optional(),
});
export type ConnectionParams = z.infer<typeof ConnectionParamsSchema>;

/**
 * Parse unknown data as a server message.
 *
 * @param data - The raw data to parse (typically from JSON.parse)
 * @returns The parsed server message, or null if invalid
 *
 * @example
 * ```typescript
 * const raw = JSON.parse(event.data);
 * const message = parseServerMessage(raw);
 * if (message?.type === 'init') {
 *   console.log('Connected to session:', message.sessionId);
 * }
 * ```
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
	const result = ServerMessageSchema.safeParse(data);
	return result.success ? result.data : null;
}

/**
 * Parse unknown data as a client message.
 *
 * @param data - The raw data to parse (typically from JSON.parse)
 * @returns The parsed client message, or null if invalid
 */
export function parseClientMessage(data: unknown): ClientMessage | null {
	const result = ClientMessageSchema.safeParse(data);
	return result.success ? result.data : null;
}

/**
 * Parse unknown data as an SSE observer message.
 *
 * @param data - The raw data to parse (typically from SSE event data)
 * @returns The parsed SSE message, or null if invalid
 */
export function parseObserverSseMessage(data: unknown): ObserverSseMessage | null {
	const result = ObserverSseMessageSchema.safeParse(data);
	return result.success ? result.data : null;
}
