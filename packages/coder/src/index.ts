export {
	CoderClient,
	type CoderClientOptions,
	CoderClientOptionsSchema,
	// Session types
	type CoderSession,
	type CoderSessionListItem,
	type CoderSessionListResponse,
	type CoderCreateSessionRequest,
	type CoderUpdateSessionRequest,
	type CoderListSessionsParams,
	// Session domain types
	type CoderSessionVisibility,
	type CoderWorkflowMode,
	type CoderSessionMode,
	type CoderSessionBucket,
	type CoderSkillRef,
	type CoderSessionRepositoryRef,
	type CoderSessionLoopConfig,
	type CoderSessionOwner,
	type CoderSessionOrigin,
	type CoderSessionWorkspace,
	// Loop state
	type CoderLoopStateResponse,
	type CoderSessionLoopState,
	type CoderLoopStatus,
	// Session data
	type CoderSessionReplay,
	type CoderSessionParticipants,
	type CoderParticipant,
	type CoderSessionEventHistory,
	type CoderSessionEvent,
	// Users
	type CoderUser,
	type CoderListUsersResponse,
	type CoderListUsersParams,
	// Workspaces and skill library
	type CoderSavedSkill,
	type CoderSkillBucket,
	type CoderWorkspaceDetail,
	type CoderSavedSkillListResponse,
	type CoderSkillBucketListResponse,
	type CoderWorkspaceListResponse,
	type CoderCreateWorkspaceRequest,
	type CoderSaveSkillRequest,
	// GitHub
	type CoderGitHubAccount,
	type CoderGitHubRepository,
	type CoderGitHubAccountListResponse,
	type CoderGitHubRepositoryListResponse,
	// WebSocket client
	CoderHubWebSocketClient,
	type CoderHubWebSocketOptions,
	type CoderHubWebSocketState,
	CoderHubWebSocketOptionsSchema,
	CoderHubWebSocketError,
	subscribeToCoderHub,
	// SSE client
	CoderSSEClient,
	type CoderSSEOptions,
	type CoderSSEClientOptions,
	type CoderSSEEvent,
	type CoderSSEState,
	CoderSSEOptionsSchema,
	CoderSSEClientOptionsSchema,
	CoderSSEError,
	streamCoderSessionSSE,
	// Protocol types
	type ClientMessage,
	type ServerMessage,
	type CoderHubInitMessage,
	type CoderHubResponse,
	type ObserverSseMessage,
	type BroadcastEventMessage,
	type PresenceEventMessage,
	type ConnectionParams,
	// Close codes
	CODER_WS_CLOSE_CODE,
	type CoderWsCloseCode,
	isTerminalCloseCode,
} from '@agentuity/core/coder';

// Passthrough export for full protocol surface
export * from '@agentuity/core/coder';
