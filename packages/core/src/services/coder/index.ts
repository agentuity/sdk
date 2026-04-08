export * from './types.ts';

export { discoverUrl, DiscoverCoderUrlDataSchema } from './discover.ts';

export type {
	CoderCreateSessionParams,
	CoderCreateSessionResponse,
	CoderGetSessionParams,
	CoderLifecycleResponse,
	CoderListConnectableSessionsParams,
	CoderListSessionsParamsWithOrg,
	CoderSessionIdParams,
	CoderUpdateSessionParams,
	CoderUpdateSessionResponse,
} from './sessions.ts';
export {
	coderArchiveSession,
	coderCreateSession,
	coderDeleteSession,
	coderGetSession,
	coderListConnectableSessions,
	coderListSessions,
	coderResumeSession,
	coderUpdateSession,
	CoderCreateSessionParamsSchema,
	CoderGetSessionParamsSchema,
	CoderListConnectableSessionsParamsSchema,
	CoderListSessionsParamsWithOrgSchema,
	CoderSessionIdParamsSchema,
	CoderUpdateSessionParamsSchema,
} from './sessions.ts';

export * from './skills.ts';
export * from './workspaces.ts';
export * from './github.ts';

export type {
	CoderGetSessionReplayParams,
	CoderListEventHistoryParams,
	CoderListParticipantsParams,
} from './session-data.ts';
export {
	coderGetReplay,
	coderListEventHistory,
	coderListParticipants,
	CoderGetSessionReplayParamsSchema,
	CoderListEventHistoryParamsSchema,
	CoderListParticipantsParamsSchema,
} from './session-data.ts';

export type { CoderGetLoopStateParams } from './loop-state.ts';
export { coderGetLoopState, CoderGetLoopStateParamsSchema } from './loop-state.ts';

export type { CoderListUsersParamsWithOrg } from './users.ts';
export { coderListUsers, CoderListUsersParamsWithOrgSchema } from './users.ts';

export type { CoderClientOptions, CoderRemoteAttachPreparationOptions } from './client.ts';
export { CoderClient, CoderClientOptionsSchema } from './client.ts';

export type { CoderErrorCode, CoderErrorContext } from './util.ts';
export {
	CoderErrorCodeSchema,
	CoderErrorContextSchema,
	CoderResponseError,
	CoderSessionArchivedError,
	CoderSessionConflictError,
	CoderSessionNotFoundError,
	normalizeCoderUrl,
	throwCoderError,
	withOrgId,
} from './util.ts';

export { default as CoderAPIReference } from './api-reference.ts';

export * from './protocol.ts';

export { CODER_WS_CLOSE_CODE, type CoderWsCloseCode, isTerminalCloseCode } from './close-codes.ts';

export type { CoderHubWebSocketState, CoderHubWebSocketOptions } from './websocket.ts';
export {
	CoderHubWebSocketClient,
	CoderHubWebSocketOptionsSchema,
	CoderHubWebSocketError,
	subscribeToCoderHub,
} from './websocket.ts';

export type {
	CoderSSEOptions,
	CoderSSEEvent,
	CoderSSEClientOptions,
	CoderSSEState,
} from './sse.ts';
export {
	CoderSSEOptionsSchema,
	CoderSSEClientOptionsSchema,
	CoderSSEError,
	CoderSSEClient,
	streamCoderSessionSSE,
} from './sse.ts';
