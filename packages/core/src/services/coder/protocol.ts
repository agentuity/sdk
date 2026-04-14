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
export const CoderHubInitRoleSchema = z
	.enum(['lead', 'sub_agent', 'observer', 'controller'])
	.describe(
		'Role assigned to a connecting client, determining its permissions and message routing.'
	);
export type CoderHubInitRole = z.infer<typeof CoderHubInitRoleSchema>;

/** Tool definition provided by the server to clients */
export const CoderHubToolDefinitionSchema = z
	.object({
		name: z.string().describe('Unique programmatic identifier for the tool.'),
		label: z.string().describe('Human-readable display name for the tool.'),
		description: z.string().describe('Explanation of what the tool does, shown to the LLM.'),
		parameters: z
			.record(z.string(), z.unknown())
			.describe('JSON Schema describing the tool input parameters.'),
		promptSnippet: z
			.string()
			.optional()
			.describe('Snippet injected into the system prompt when this tool is available.'),
		promptGuidelines: z
			.string()
			.optional()
			.describe(
				'Usage guidelines appended to the prompt to help the LLM use this tool correctly.'
			),
		timeoutMs: z
			.number()
			.optional()
			.describe('Maximum execution time in milliseconds before the tool call is aborted.'),
	})
	.describe('Definition of a hub-provided tool that can be invoked by agents during a session.');
export type CoderHubToolDefinition = z.infer<typeof CoderHubToolDefinitionSchema>;

export const CoderHubCommandDefinitionSchema = z
	.object({
		name: z.string().describe('Unique identifier for the command.'),
		description: z.string().describe('Human-readable description of what the command does.'),
	})
	.describe('Definition of a slash-command available to clients for direct execution.');
export type CoderHubCommandDefinition = z.infer<typeof CoderHubCommandDefinitionSchema>;

export const AgentDefinitionSchema = z
	.object({
		name: z.string().describe('Unique programmatic name used to reference this agent.'),
		displayName: z
			.string()
			.optional()
			.describe('Human-friendly name shown in UIs; defaults to name if omitted.'),
		description: z.string().describe('Summary of the agent role and capabilities.'),
		systemPrompt: z
			.string()
			.describe('Base system prompt that defines the agent personality and instructions.'),
		model: z
			.string()
			.optional()
			.describe('LLM model identifier to use; inherits the session default if omitted.'),
		tools: z
			.array(z.string())
			.optional()
			.describe('List of tool names this agent is allowed to invoke.'),
		temperature: z.number().optional().describe('Sampling temperature override for this agent.'),
		thinkingLevel: z
			.string()
			.optional()
			.describe('Extended-thinking budget level (e.g. "low", "medium", "high").'),
		readOnly: z
			.boolean()
			.optional()
			.describe('When true, the agent cannot make file modifications or run commands.'),
		hubTools: z
			.array(CoderHubToolDefinitionSchema)
			.optional()
			.describe('Additional hub-provided tools scoped exclusively to this agent.'),
		capabilities: z
			.array(z.string())
			.optional()
			.describe('Capability tags advertising what this agent can do (e.g. "code", "review").'),
		status: z
			.enum(['available', 'busy', 'offline'])
			.optional()
			.describe('Current availability status of the agent for task assignment.'),
	})
	.describe(
		'Full definition of a coder agent including its prompt, model, tools, and operational constraints.'
	);
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const CoderHubConfigSchema = z
	.object({
		systemPromptPrefix: z
			.string()
			.optional()
			.describe('Text prepended to every agent system prompt in this session.'),
		systemPromptSuffix: z
			.string()
			.optional()
			.describe('Text appended to every agent system prompt in this session.'),
	})
	.describe('Session-level configuration overrides sent by the hub during initialization.');
export type CoderHubConfig = z.infer<typeof CoderHubConfigSchema>;

export const CoderHubLeadResumeDescriptorSchema = z
	.object({
		sessionFile: z.string().describe('Path to the session file on disk to resume from.'),
		piSessionId: z
			.string()
			.optional()
			.describe('Platform session ID to correlate the resumed session with the backend.'),
		cwd: z
			.string()
			.optional()
			.describe(
				'Working directory to restore; defaults to the original session cwd if omitted.'
			),
	})
	.describe('Descriptor for resuming a previously interrupted lead session from a saved file.');
export type CoderHubLeadResumeDescriptor = z.infer<typeof CoderHubLeadResumeDescriptorSchema>;

const BaseCoderHubInitMessageSchema = z
	.object({
		type: z
			.literal('init')
			.describe('Discriminator indicating this is an initialization message.'),
		role: CoderHubInitRoleSchema,
		sessionId: z
			.string()
			.optional()
			.describe('Existing session ID to join; omit to create a new session.'),
		resume: CoderHubLeadResumeDescriptorSchema.optional().describe(
			'Resume descriptor for reconnecting to a prior session.'
		),
		tools: z
			.array(CoderHubToolDefinitionSchema)
			.optional()
			.describe('Tools the connecting client provides to the session.'),
		commands: z
			.array(CoderHubCommandDefinitionSchema)
			.optional()
			.describe('Slash-commands the connecting client registers.'),
		agents: z
			.array(AgentDefinitionSchema)
			.optional()
			.describe('Agent definitions the client contributes to the session pool.'),
		config: CoderHubConfigSchema.optional().describe(
			'Session configuration overrides applied at initialization.'
		),
		model: z
			.object({
				provider: z.string().describe('LLM provider name (e.g. "anthropic", "openai").'),
				id: z.string().describe('Specific model identifier within the provider.'),
			})
			.optional()
			.describe('Preferred LLM model for this session; overrides the hub default.'),
		thinkingLevel: z
			.string()
			.optional()
			.describe('Extended-thinking budget level requested for this session.'),
		task: z
			.string()
			.optional()
			.describe('Initial task prompt to begin working on immediately after connection.'),
		agentRole: z
			.string()
			.optional()
			.describe('Specific agent role name this client should assume in the session.'),
	})
	.describe('Base initialization message sent by any client when first connecting to the hub.');

export const CoderHubLeadInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z
		.literal('lead')
		.describe('Indicates this client is connecting as the lead orchestrator.'),
}).describe('Initialization message sent by a lead client that orchestrates the coding session.');
export type CoderHubLeadInitMessage = z.infer<typeof CoderHubLeadInitMessageSchema>;

export const CoderHubSubAgentInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z
		.literal('sub_agent')
		.describe('Indicates this client is connecting as a sub-agent worker.'),
}).describe(
	'Initialization message sent by a sub-agent that executes tasks delegated by the lead.'
);
export type CoderHubSubAgentInitMessage = z.infer<typeof CoderHubSubAgentInitMessageSchema>;

export const CoderHubControllerInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z
		.literal('controller')
		.describe('Indicates this client is connecting as an external controller.'),
}).describe(
	'Initialization message sent by a controller client that manages sessions without direct coding.'
);
export type CoderHubControllerInitMessage = z.infer<typeof CoderHubControllerInitMessageSchema>;

export const CoderHubObserverInitMessageSchema = BaseCoderHubInitMessageSchema.extend({
	role: z
		.literal('observer')
		.describe('Indicates this client is connecting as a read-only observer.'),
}).describe(
	'Initialization message sent by an observer client when the server chooses to send an explicit init frame.'
);
export type CoderHubObserverInitMessage = z.infer<typeof CoderHubObserverInitMessageSchema>;

export const CoderHubInitMessageSchema = z
	.discriminatedUnion('role', [
		CoderHubLeadInitMessageSchema,
		CoderHubSubAgentInitMessageSchema,
		CoderHubObserverInitMessageSchema,
		CoderHubControllerInitMessageSchema,
	])
	.describe('Union of all initialization messages, discriminated by the client role.');
export type CoderHubInitMessage = z.infer<typeof CoderHubInitMessageSchema>;

export const CoderHubStreamReadyMessageSchema = z
	.object({
		type: z
			.literal('session_stream_ready')
			.describe('Discriminator indicating the session stream is ready for consumption.'),
		streamId: z.string().describe('Unique identifier for this stream instance.'),
		streamUrl: z
			.string()
			.describe('URL endpoint where the client can consume the session stream.'),
	})
	.describe(
		'Server message indicating that the real-time session stream is established and ready for the client.'
	);
export type CoderHubStreamReadyMessage = z.infer<typeof CoderHubStreamReadyMessageSchema>;

export const CoderHubSessionResumeMessageSchema = z
	.object({
		type: z
			.literal('session_resume')
			.describe('Discriminator indicating this is a session resume notification.'),
		streamUrl: z.string().describe('URL endpoint for the resumed session stream.'),
		streamId: z.string().describe('Unique identifier for the resumed stream instance.'),
		activePrdKey: z
			.string()
			.optional()
			.describe(
				'Key of the active PRD document if one was in progress when the session was interrupted.'
			),
	})
	.describe('Server message sent when a previously disconnected session is successfully resumed.');
export type CoderHubSessionResumeMessage = z.infer<typeof CoderHubSessionResumeMessageSchema>;

export const ConnectionRejectedMessageSchema = z
	.object({
		type: z
			.literal('connection_rejected')
			.describe('Discriminator indicating the connection was refused by the server.'),
		code: z.string().describe('Machine-readable rejection reason code (e.g. "session_expired").'),
		message: z
			.string()
			.describe('Human-readable explanation of why the connection was rejected.'),
		sessionId: z
			.string()
			.optional()
			.describe('Session ID the client tried to join, if applicable.'),
		reconnectState: z
			.string()
			.optional()
			.describe('Opaque state token the client can use to attempt reconnection.'),
		expiredAt: z
			.number()
			.optional()
			.describe('Unix timestamp (ms) when the session expired, if rejection is due to expiry.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the rejection occurred.'),
	})
	.describe(
		'Server message sent when a client connection is rejected due to authentication failure, session expiry, or capacity limits.'
	);
export type ConnectionRejectedMessage = z.infer<typeof ConnectionRejectedMessageSchema>;

export const ProtocolErrorMessageSchema = z
	.object({
		type: z
			.literal('protocol_error')
			.describe('Discriminator indicating a protocol-level error occurred.'),
		code: z.string().describe('Machine-readable error code identifying the error type.'),
		message: z.string().describe('Human-readable description of the protocol error.'),
		sessionId: z
			.string()
			.optional()
			.describe('Session ID associated with the error, if the error is session-scoped.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the error occurred.'),
	})
	.describe('Server message reporting a protocol violation or malformed message from the client.');
export type ProtocolErrorMessage = z.infer<typeof ProtocolErrorMessageSchema>;

export const AckActionSchema = z
	.object({
		action: z
			.literal('ACK')
			.describe('Discriminator indicating a simple acknowledgement with no payload.'),
	})
	.describe('Action acknowledging receipt of a request with no additional data.');
export type AckAction = z.infer<typeof AckActionSchema>;

export const BlockActionSchema = z
	.object({
		action: z
			.literal('BLOCK')
			.describe('Discriminator indicating the requested operation was blocked.'),
		reason: z.string().describe('Explanation of why the operation was blocked.'),
	})
	.describe('Action indicating the hub blocked a tool call or operation, with a reason.');
export type BlockAction = z.infer<typeof BlockActionSchema>;

export const ConfirmActionSchema = z
	.object({
		action: z
			.literal('CONFIRM')
			.describe('Discriminator indicating user confirmation is required.'),
		title: z.string().describe('Short title for the confirmation dialog.'),
		message: z.string().describe('Detailed message explaining what the user is confirming.'),
		deny_reason: z
			.string()
			.optional()
			.describe('Pre-filled reason shown if the user denies the confirmation.'),
	})
	.describe(
		'Action requesting the user to confirm or deny a potentially destructive operation before proceeding.'
	);
export type ConfirmAction = z.infer<typeof ConfirmActionSchema>;

export const NotifyActionSchema = z
	.object({
		action: z
			.literal('NOTIFY')
			.describe('Discriminator indicating a notification to display to the user.'),
		message: z.string().describe('Notification text to display.'),
		level: z
			.enum(['info', 'warning', 'error'])
			.optional()
			.describe(
				'Severity level controlling how the notification is displayed; defaults to info.'
			),
	})
	.describe(
		'Action displaying a transient notification message to the user at the specified severity.'
	);
export type NotifyAction = z.infer<typeof NotifyActionSchema>;

export const ReturnActionSchema = z
	.object({
		action: z
			.literal('RETURN')
			.describe('Discriminator indicating this action carries a return value for a tool call.'),
		result: z.unknown().describe('Arbitrary result value returned from a hub tool execution.'),
	})
	.describe('Action returning the result of a hub tool invocation back to the calling agent.');
export type ReturnAction = z.infer<typeof ReturnActionSchema>;

export const StatusActionSchema = z
	.object({
		action: z.literal('STATUS').describe('Discriminator indicating a status indicator update.'),
		key: z.string().describe('Unique key identifying which status indicator to update.'),
		text: z
			.string()
			.optional()
			.describe('Display text for the status indicator; omit to clear the status.'),
	})
	.describe(
		'Action updating a named status indicator in the client UI (e.g. progress, phase label).'
	);
export type StatusAction = z.infer<typeof StatusActionSchema>;

export const SystemPromptActionSchema = z
	.object({
		action: z
			.literal('SYSTEM_PROMPT')
			.describe('Discriminator indicating a system prompt modification.'),
		systemPrompt: z.string().describe('The system prompt content to apply.'),
		mode: z
			.enum(['replace', 'prefix', 'suffix'])
			.optional()
			.describe(
				'How to apply the prompt: replace the entire prompt, prepend, or append; defaults to replace.'
			),
	})
	.describe(
		'Action modifying the active agent system prompt mid-session by replacing, prefixing, or suffixing content.'
	);
export type SystemPromptAction = z.infer<typeof SystemPromptActionSchema>;

export const InjectMessageActionSchema = z
	.object({
		action: z
			.literal('INJECT_MESSAGE')
			.describe('Discriminator indicating a message should be injected into the conversation.'),
		message: z
			.object({
				role: z
					.enum(['user', 'assistant'])
					.describe('Conversation role for the injected message.'),
				content: z.string().describe('Text content of the injected message.'),
			})
			.describe('The synthetic message to inject into the conversation history.'),
	})
	.describe(
		'Action injecting a synthetic user or assistant message into the conversation context without an actual turn.'
	);
export type InjectMessageAction = z.infer<typeof InjectMessageActionSchema>;

export const CoderHubActionSchema = z
	.discriminatedUnion('action', [
		AckActionSchema,
		BlockActionSchema,
		ConfirmActionSchema,
		NotifyActionSchema,
		ReturnActionSchema,
		StatusActionSchema,
		SystemPromptActionSchema,
		InjectMessageActionSchema,
	])
	.describe(
		'Union of all hub response actions, discriminated by the action field. Multiple actions can be batched in a single response.'
	);
export type CoderHubAction = z.infer<typeof CoderHubActionSchema>;

export const CoderHubResponseSchema = z
	.object({
		id: z.string().describe('Request ID this response correlates to.'),
		actions: z
			.array(CoderHubActionSchema)
			.describe('Ordered list of actions the client should execute in response to the request.'),
	})
	.describe(
		'Server response to a client request, containing one or more actions to execute (e.g. ACK, BLOCK, RETURN).'
	);
export type CoderHubResponse = z.infer<typeof CoderHubResponseSchema>;

export const ConversationAuthorSchema = z
	.object({
		userId: z.string().optional().describe('Platform user ID of the author.'),
		displayName: z.string().optional().describe('Display name shown in the conversation UI.'),
		email: z.string().optional().describe('Email address of the author.'),
		avatarUrl: z.string().optional().describe('URL to the author avatar image.'),
		actorType: z
			.enum(['user', 'api_key', 'service'])
			.optional()
			.describe(
				'Type of actor that authored the entry: a human user, API key, or internal service.'
			),
		apiKeyLabel: z
			.string()
			.optional()
			.describe('Label of the API key used, when actorType is "api_key".'),
	})
	.describe('Identity metadata for the author of a conversation entry or prompt.');
export type ConversationAuthor = z.infer<typeof ConversationAuthorSchema>;

export const RuntimeProcessDescriptorSchema = z
	.object({
		pid: z.number().optional().describe('Operating system process ID.'),
		command: z.string().optional().describe('Executable name or path that was run.'),
		args: z
			.array(z.string())
			.optional()
			.describe('Command-line arguments passed to the process.'),
		cwd: z.string().optional().describe('Working directory the process was started in.'),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe('Environment variables set for the process.'),
		status: z
			.string()
			.optional()
			.describe('Current lifecycle status (e.g. "running", "exited").'),
		exitCode: z
			.number()
			.optional()
			.describe('Process exit code after termination; null while running.'),
		signal: z
			.string()
			.optional()
			.describe('Signal that terminated the process (e.g. "SIGTERM"), if applicable.'),
	})
	.describe(
		'Snapshot of a runtime process spawned during a session, including its lifecycle state.'
	);
export type RuntimeProcessDescriptor = z.infer<typeof RuntimeProcessDescriptorSchema>;

export const RuntimePreviewDescriptorSchema = z
	.object({
		url: z.string().optional().describe('Public URL where the preview can be accessed.'),
		port: z.number().optional().describe('Local port the preview server is listening on.'),
		protocol: z
			.string()
			.optional()
			.describe('Protocol used by the preview (e.g. "http", "https").'),
		path: z.string().optional().describe('URL path suffix appended to the preview base URL.'),
		status: z
			.string()
			.optional()
			.describe('Current status of the preview (e.g. "ready", "starting").'),
	})
	.describe(
		'Descriptor for a live web preview of a running application within the session sandbox.'
	);
export type RuntimePreviewDescriptor = z.infer<typeof RuntimePreviewDescriptorSchema>;

export const PromptAttachmentDescriptorSchema = z
	.object({
		type: z.string().describe('Attachment type identifier (e.g. "file", "image", "url").'),
		name: z.string().optional().describe('Display name or filename of the attachment.'),
		url: z.string().optional().describe('URL to fetch the attachment content from.'),
		content: z
			.string()
			.optional()
			.describe('Inline content of the attachment when small enough to embed directly.'),
		mimeType: z.string().optional().describe('MIME type of the attachment content.'),
		size: z.number().optional().describe('Size of the attachment in bytes.'),
	})
	.describe('File or media attachment associated with a user prompt or conversation entry.');
export type PromptAttachmentDescriptor = z.infer<typeof PromptAttachmentDescriptorSchema>;

export const ConversationEntrySchema = z
	.object({
		type: z
			.enum([
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
			])
			.describe('Kind of conversation entry, determining which fields are populated.'),
		agent: z
			.string()
			.optional()
			.describe('Name of the agent that produced this entry, if agent-scoped.'),
		content: z.string().optional().describe('Text content of a message or tool result.'),
		thinking: z
			.string()
			.optional()
			.describe('Extended-thinking text generated by the model before responding.'),
		toolName: z
			.string()
			.optional()
			.describe('Name of the tool invoked, for tool_call and tool_result entries.'),
		toolArgs: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Arguments passed to the tool invocation.'),
		toolCallId: z
			.string()
			.optional()
			.describe('Unique identifier linking a tool_call to its corresponding tool_result.'),
		runtime: RuntimeProcessDescriptorSchema.optional().describe(
			'Process descriptor for runtime_status and runtime_output entries.'
		),
		preview: RuntimePreviewDescriptorSchema.optional().describe(
			'Preview descriptor for runtime_preview entries.'
		),
		attachments: z
			.array(PromptAttachmentDescriptorSchema)
			.optional()
			.describe('Files or media attached to a user_prompt entry.'),
		author: ConversationAuthorSchema.optional().describe(
			'Identity of the human or service that authored this entry.'
		),
		isError: z
			.boolean()
			.optional()
			.describe('When true, indicates this entry represents an error condition.'),
		taskId: z
			.string()
			.optional()
			.describe('Task ID this entry belongs to, for multi-task sessions.'),
		turnId: z
			.string()
			.optional()
			.describe('Turn ID grouping related entries within a single conversational turn.'),
		replyId: z
			.string()
			.optional()
			.describe('ID of a prior entry this is replying to, for threaded conversations.'),
		sequence: z
			.number()
			.optional()
			.describe('Monotonically increasing sequence number for ordering entries.'),
		elapsedMs: z
			.number()
			.optional()
			.describe('Time in milliseconds this entry took to produce (e.g. tool execution time).'),
		timestamp: z.number().describe('Unix timestamp (ms) when this entry was created.'),
	})
	.describe(
		'A single entry in the session conversation log, representing a message, tool call, thinking block, or runtime event.'
	);
export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;

export const SessionTaskStateSchema = z
	.object({
		taskId: z.string().describe('Unique identifier for this task.'),
		agent: z.string().describe('Name of the agent assigned to execute this task.'),
		status: z
			.enum(['running', 'completed', 'failed'])
			.describe('Current execution status of the task.'),
		prompt: z.string().describe('The original prompt or instruction that initiated this task.'),
		startedAt: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the task began execution.'),
		completedAt: z
			.string()
			.optional()
			.describe('ISO 8601 timestamp when the task finished, if completed or failed.'),
		duration: z.number().optional().describe('Total execution duration in milliseconds.'),
		result: z
			.string()
			.optional()
			.describe('Summary of the task result on successful completion.'),
		error: z.string().optional().describe('Error message if the task failed.'),
	})
	.describe('Tracks the lifecycle state of a delegated task within a multi-agent session.');
export type SessionTaskState = z.infer<typeof SessionTaskStateSchema>;

export const SessionStreamBlockSchema = z
	.object({
		output: z.string().describe('Accumulated assistant output text for this stream block.'),
		thinking: z.string().describe('Accumulated extended-thinking text for this stream block.'),
	})
	.describe(
		'A block of streamed content containing both the visible output and internal thinking text.'
	);
export type SessionStreamBlock = z.infer<typeof SessionStreamBlockSchema>;

export const SessionStreamProjectionSchema = SessionStreamBlockSchema.extend({
	tasks: z
		.record(z.string(), SessionStreamBlockSchema)
		.describe('Per-task stream blocks keyed by task ID.'),
}).describe(
	'Projection of the full session stream state, including the main stream and per-task sub-streams.'
);
export type SessionStreamProjection = z.infer<typeof SessionStreamProjectionSchema>;

export const SessionAgentActivitySchema = z
	.object({
		name: z.string().optional().describe('Display name of the agent.'),
		status: z.string().describe('Current agent status (e.g. "idle", "working", "tool_calling").'),
		currentTool: z
			.string()
			.optional()
			.describe('Name of the tool the agent is currently executing, if any.'),
		currentToolArgs: z
			.string()
			.optional()
			.describe('Serialized arguments of the currently executing tool call.'),
		toolCallCount: z
			.number()
			.describe('Total number of tool calls made by this agent in the session.'),
		lastActivity: z.number().describe('Unix timestamp (ms) of the agent last activity.'),
		totalElapsed: z
			.number()
			.optional()
			.describe('Total active time in milliseconds the agent has spent working.'),
	})
	.describe(
		'Real-time activity snapshot of an agent within a session, used for UI status indicators and monitoring.'
	);
export type SessionAgentActivity = z.infer<typeof SessionAgentActivitySchema>;

export const CoderHubHydrationMessageSchema = z
	.object({
		type: z
			.literal('session_hydration')
			.describe('Discriminator indicating this is a session hydration payload.'),
		sessionId: z.string().describe('ID of the session being hydrated.'),
		label: z.string().optional().describe('Human-readable session label, if one was assigned.'),
		resumedAt: z.number().describe('Unix timestamp (ms) when the session was resumed.'),
		entries: z
			.array(ConversationEntrySchema)
			.describe('Historical conversation entries to replay for state reconstruction.'),
		task: z
			.string()
			.optional()
			.describe('Active task prompt at the time of hydration, if work is in progress.'),
		leadConnected: z
			.boolean()
			.optional()
			.describe('Whether a lead client is currently connected to this session.'),
		stream: SessionStreamProjectionSchema.optional().describe(
			'Current stream projection state to restore live-streaming UI.'
		),
		tasks: z
			.array(SessionTaskStateSchema)
			.optional()
			.describe('Active and completed task states to restore the task tracker UI.'),
		streamingState: z
			.object({
				isStreaming: z
					.boolean()
					.optional()
					.describe('Whether the session is actively streaming output right now.'),
				activeTasks: z
					.array(
						z
							.object({
								taskId: z.string().describe('ID of the currently active task.'),
								agent: z.string().describe('Agent executing the task.'),
							})
							.describe('Reference to a task that is currently in progress.')
					)
					.optional()
					.describe('Tasks that are actively being worked on at the time of hydration.'),
			})
			.optional()
			.describe('Snapshot of the streaming and task execution state for UI restoration.'),
	})
	.describe(
		'Server message delivering a full session state snapshot to a newly connected or resumed client for hydration.'
	);
export type CoderHubHydrationMessage = z.infer<typeof CoderHubHydrationMessageSchema>;

export const BootstrapReadyMessageSchema = z
	.object({
		type: z
			.literal('bootstrap_ready')
			.describe('Discriminator indicating the client has finished bootstrapping.'),
	})
	.describe(
		'Client message signaling that initialization is complete and the client is ready to receive session data.'
	);
export type BootstrapReadyMessage = z.infer<typeof BootstrapReadyMessageSchema>;

export const ObserverSubscribeMessageSchema = z
	.object({
		type: z
			.literal('subscribe')
			.describe('Discriminator indicating an observer subscription update.'),
		patterns: z
			.array(z.string())
			.describe(
				'Event filters to receive, including categories, exact names, wildcard prefixes, or "*".'
			),
	})
	.describe(
		'Client message updating the observer event filters for a live Coder Hub WebSocket connection.'
	);
export type ObserverSubscribeMessage = z.infer<typeof ObserverSubscribeMessageSchema>;

export const SessionEntryMessageSchema = z
	.object({
		type: z
			.literal('session_entry')
			.describe('Discriminator indicating a single line append to the session file.'),
		path: z.string().describe('Absolute path to the session file being written.'),
		line: z.string().describe('Single JSONL line to append to the session file.'),
	})
	.describe(
		'Client message appending a single JSONL line to the session file for incremental persistence.'
	);
export type SessionEntryMessage = z.infer<typeof SessionEntryMessageSchema>;

export const SessionWriteMessageSchema = z
	.object({
		type: z
			.literal('session_write')
			.describe('Discriminator indicating a full session file write.'),
		path: z.string().describe('Absolute path to the session file to write.'),
		content: z
			.string()
			.describe(
				'Complete content to write to the session file, replacing any existing content.'
			),
	})
	.describe(
		'Client message writing the full content of a session file, used for initial creation or full replacement.'
	);
export type SessionWriteMessage = z.infer<typeof SessionWriteMessageSchema>;

export const SessionParticipantSchema = z
	.object({
		id: z.string().describe('Unique identifier for this participant connection.'),
		role: z
			.enum(['lead', 'observer', 'controller'])
			.describe('Role of the participant determining their permissions in the session.'),
		transport: z
			.enum(['ws', 'sse'])
			.describe(
				'Transport protocol used by this participant (WebSocket or Server-Sent Events).'
			),
		subscriptions: z
			.array(z.string())
			.describe('Event categories this participant is subscribed to.'),
		connectedAt: z.number().describe('Unix timestamp (ms) when this participant connected.'),
		lastActivity: z.number().describe('Unix timestamp (ms) of the participant last activity.'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				'Arbitrary metadata attached to this participant (e.g. client version, origin).'
			),
	})
	.describe(
		'Represents a connected participant in a session with their role, transport, and activity state.'
	);
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;

export const PresenceEventMessageSchema = z
	.object({
		type: z.literal('presence').describe('Discriminator indicating a presence change event.'),
		event: z
			.enum(['session_join', 'session_leave', 'presence_update'])
			.describe('Specific presence event type that occurred.'),
		participant: SessionParticipantSchema.optional().describe(
			'The participant that triggered the event (for join/leave).'
		),
		participants: z
			.array(SessionParticipantSchema)
			.optional()
			.describe('Full list of current participants (sent with presence_update).'),
		sessionId: z.string().describe('Session ID where the presence event occurred.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the event occurred.'),
	})
	.describe(
		'Server message notifying clients of participant join, leave, or presence state changes in the session.'
	);
export type PresenceEventMessage = z.infer<typeof PresenceEventMessageSchema>;

export const BroadcastEventMessageSchema = z
	.object({
		type: z
			.literal('broadcast')
			.describe('Discriminator indicating a broadcast event to all session participants.'),
		event: z
			.string()
			.describe('Event name identifying the broadcast type (e.g. "agent_activity").'),
		data: z.record(z.string(), z.unknown()).describe('Event-specific payload data.'),
		category: z
			.string()
			.describe('Category for filtering broadcasts (e.g. "session", "agent", "runtime").'),
		sessionId: z.string().describe('Session ID this broadcast belongs to.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the broadcast was emitted.'),
	})
	.describe(
		'Server message broadcasting a named event with arbitrary data to all connected session participants.'
	);
export type BroadcastEventMessage = z.infer<typeof BroadcastEventMessageSchema>;

export const RpcCommandMessageSchema = z
	.object({
		type: z
			.literal('rpc_command')
			.describe('Discriminator indicating an RPC command from the client.'),
		command: z
			.record(z.string(), z.unknown())
			.describe('RPC command payload to execute on the server.'),
	})
	.describe('Client message sending an RPC command to the server for execution by the driver.');
export type RpcCommandMessage = z.infer<typeof RpcCommandMessageSchema>;

export const RpcEventMessageSchema = z
	.object({
		type: z
			.literal('rpc_event')
			.describe('Discriminator indicating an RPC event from the server.'),
		event: z.record(z.string(), z.unknown()).describe('RPC event payload.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the event was emitted.'),
	})
	.describe(
		'Server message delivering an RPC event notification from the driver to connected clients.'
	);
export type RpcEventMessage = z.infer<typeof RpcEventMessageSchema>;

export const RpcResponseMessageSchema = z
	.object({
		type: z
			.literal('rpc_response')
			.describe('Discriminator indicating an RPC response from the server.'),
		response: z.record(z.string(), z.unknown()).describe('RPC response payload from the driver.'),
	})
	.describe('Server message returning the result of a previously sent RPC command.');
export type RpcResponseMessage = z.infer<typeof RpcResponseMessageSchema>;

export const RpcUiRequestMessageSchema = z
	.object({
		type: z
			.literal('rpc_ui_request')
			.describe('Discriminator indicating a UI interaction request from the server.'),
		id: z.string().describe('Request ID for correlating the UI response.'),
		method: z.string().describe('UI method to invoke (e.g. "confirm_dialog", "select_option").'),
		params: z
			.record(z.string(), z.unknown())
			.describe('Method-specific parameters for the UI request.'),
	})
	.describe(
		'Server message requesting the client UI to perform an interactive action and return a response.'
	);
export type RpcUiRequestMessage = z.infer<typeof RpcUiRequestMessageSchema>;

export const RpcUiResponseMessageSchema = z
	.object({
		type: z
			.literal('rpc_ui_response')
			.describe('Discriminator indicating a client response to a UI request.'),
		id: z.string().describe('Request ID this response correlates to.'),
		result: z.unknown().describe('Result of the UI interaction provided by the user.'),
	})
	.describe('Client message returning the result of a server-initiated UI interaction request.');
export type RpcUiResponseMessage = z.infer<typeof RpcUiResponseMessageSchema>;

export const PingMessageSchema = z
	.object({
		type: z.literal('ping').describe('Discriminator indicating a keep-alive ping.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the ping was sent.'),
	})
	.describe('Client message used for connection keep-alive and latency measurement.');
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const PongMessageSchema = z
	.object({
		type: z.literal('pong').describe('Discriminator indicating a keep-alive pong reply.'),
		timestamp: z.number().describe('Unix timestamp (ms) when the pong was sent.'),
		echoedTimestamp: z
			.number()
			.optional()
			.describe('Original ping timestamp echoed back for round-trip latency calculation.'),
	})
	.describe('Server response to a ping message, used for keep-alive and latency measurement.');
export type PongMessage = z.infer<typeof PongMessageSchema>;

export const EventRequestSchema = z
	.object({
		id: z.string().describe('Unique request ID for correlating the server response.'),
		type: z.literal('event').describe('Discriminator indicating this is an event request.'),
		event: z
			.string()
			.describe('Name of the event being reported (e.g. "tool_start", "task_complete").'),
		data: z.record(z.string(), z.unknown()).describe('Event-specific payload data.'),
	})
	.describe('Client message reporting a named event with associated data to the hub.');
export type EventRequest = z.infer<typeof EventRequestSchema>;

export const ToolRequestSchema = z
	.object({
		id: z.string().describe('Unique request ID for correlating the server response.'),
		type: z
			.literal('tool')
			.describe('Discriminator indicating this is a tool invocation request.'),
		name: z.string().describe('Name of the hub tool to invoke.'),
		toolCallId: z
			.string()
			.describe('Tool call ID from the LLM, used to route the result back to the correct call.'),
		params: z
			.record(z.string(), z.unknown())
			.describe('Input parameters for the tool invocation.'),
	})
	.describe('Client message requesting the hub to execute a named tool and return the result.');
export type ToolRequest = z.infer<typeof ToolRequestSchema>;

export const CommandRequestSchema = z
	.object({
		id: z.string().describe('Unique request ID for correlating the server response.'),
		type: z
			.literal('command')
			.describe('Discriminator indicating this is a command execution request.'),
		name: z.string().describe('Name of the slash-command to execute.'),
		args: z.string().describe('Raw argument string passed after the command name.'),
	})
	.describe('Client message requesting the hub to execute a registered slash-command.');
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/**
 * All possible client-to-server message types.
 *
 * Messages the client can send to the Coder Hub server.
 */
export const ClientMessageSchema = z
	.discriminatedUnion('type', [
		EventRequestSchema,
		ToolRequestSchema,
		CommandRequestSchema,
		SessionEntryMessageSchema,
		SessionWriteMessageSchema,
		BootstrapReadyMessageSchema,
		ObserverSubscribeMessageSchema,
		RpcCommandMessageSchema,
		RpcUiResponseMessageSchema,
		PingMessageSchema,
	])
	.describe(
		'Union of all client-to-server messages, discriminated by type. Includes tool/event/command requests, session persistence, RPC, and keep-alive.'
	);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * All possible server-to-client message types.
 *
 * Messages the Coder Hub server can send to connected clients.
 */
export const ServerMessageSchema = z
	.union([
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
	])
	.describe(
		'Union of all server-to-client messages, discriminated by type. Includes init, responses, hydration, stream control, presence, broadcasts, RPC, and errors.'
	);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * Initial session snapshot sent via SSE after connection.
 *
 * Contains the current session state, participants, and agent activity.
 */
export const SseSessionSnapshotMessageSchema = z
	.object({
		type: z.literal('snapshot').describe('Discriminator indicating this is a session snapshot.'),
		sessionId: z.string().describe('ID of the session this snapshot represents.'),
		label: z.string().describe('Human-readable label for the session.'),
		status: z
			.string()
			.describe('Current session lifecycle status (e.g. "active", "idle", "ended").'),
		createdAt: z.string().describe('ISO 8601 timestamp when the session was created.'),
		mode: z
			.enum(['sandbox', 'tui'])
			.describe('Execution environment mode: cloud sandbox or local TUI.'),
		participants: z
			.array(
				z
					.object({
						id: z.string().describe('Unique participant connection ID.'),
						role: z.string().describe('Participant role in the session.'),
						transport: z.string().describe('Transport protocol (ws or sse).'),
						connectedAt: z
							.string()
							.describe('ISO 8601 timestamp when the participant connected.'),
						idle: z
							.boolean()
							.optional()
							.describe('Whether the participant is currently idle.'),
					})
					.describe('Summary of a connected participant for the snapshot.')
			)
			.describe('List of all currently connected participants.'),
		taskCount: z.number().describe('Total number of tasks created in this session.'),
		agentActivity: z
			.record(z.string(), SessionAgentActivitySchema)
			.describe('Per-agent activity state keyed by agent name.'),
		stream: SessionStreamProjectionSchema.optional().describe(
			'Current stream projection if the session is actively streaming.'
		),
	})
	.describe(
		'Full point-in-time snapshot of the session state, sent to SSE observers on initial connection.'
	);
export type SseSessionSnapshotMessage = z.infer<typeof SseSessionSnapshotMessageSchema>;

export const SseHydrationMessageSchema = z
	.object({
		type: z
			.literal('hydration')
			.describe('Discriminator indicating this is an SSE hydration payload.'),
		sessionId: z.string().describe('ID of the session being hydrated.'),
		entries: z
			.array(ConversationEntrySchema)
			.describe('Historical conversation entries for state reconstruction.'),
		task: z.string().optional().describe('Currently active task prompt, if work is in progress.'),
		stream: SessionStreamProjectionSchema.optional().describe('Current stream projection state.'),
		tasks: z
			.array(SessionTaskStateSchema)
			.optional()
			.describe('Active and completed task states.'),
	})
	.describe(
		'SSE-specific hydration message delivering conversation history and session state to an observer client.'
	);
export type SseHydrationMessage = z.infer<typeof SseHydrationMessageSchema>;

/**
 * All possible SSE message types sent to observers.
 *
 * SSE connections receive a subset of server messages suitable for
 * read-only observation (snapshots, broadcasts, presence).
 */
export const ObserverSseMessageSchema = z
	.discriminatedUnion('type', [
		SseSessionSnapshotMessageSchema,
		SseHydrationMessageSchema,
		PresenceEventMessageSchema,
		BroadcastEventMessageSchema,
	])
	.describe(
		'Union of all SSE observer messages, discriminated by type. Observers receive snapshots, hydration, presence, and broadcast events.'
	);
export type ObserverSseMessage = z.infer<typeof ObserverSseMessageSchema>;

export const ConnectionParamsSchema = z
	.object({
		agent: z
			.string()
			.optional()
			.describe('Agent name this connection represents, for agent-specific connections.'),
		parent: z
			.string()
			.optional()
			.describe('Parent session ID for hierarchical session relationships.'),
		sessionId: z
			.string()
			.optional()
			.describe('Existing session ID to join; omit to create a new session.'),
		task: z
			.string()
			.optional()
			.describe('Initial task prompt to begin immediately after connecting.'),
		label: z.string().optional().describe('Human-readable label to assign to the new session.'),
		orgId: z.string().optional().describe('Organization ID for multi-tenant session scoping.'),
		userId: z.string().optional().describe('Authenticated user ID initiating the connection.'),
		origin: z
			.enum(['web', 'desktop', 'tui', 'sdk'])
			.optional()
			.describe('Client origin platform indicating where the connection originates from.'),
		role: z
			.enum(['lead', 'observer', 'controller'])
			.optional()
			.describe('Requested session role; the server may override based on permissions.'),
		subscribe: z
			.string()
			.optional()
			.describe('Comma-separated event filters requested during observer connection bootstrap.'),
		coordJobId: z
			.string()
			.optional()
			.describe('Coordination job ID linking this connection to an orchestration workflow.'),
		coordRole: z
			.string()
			.optional()
			.describe('Role within the coordination job (e.g. "worker", "orchestrator").'),
		driverMode: z
			.enum(['rpc'])
			.optional()
			.describe(
				'Driver communication mode; "rpc" enables RPC-based interaction instead of standard messaging.'
			),
		driverInstanceId: z
			.string()
			.optional()
			.describe('Unique identifier of the driver instance for RPC routing.'),
		driverVersion: z
			.string()
			.optional()
			.describe('Semantic version of the driver for protocol compatibility negotiation.'),
	})
	.describe(
		'Query parameters provided during WebSocket or SSE connection handshake, controlling session creation, joining, and client identity.'
	);
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
