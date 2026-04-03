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

export type { CoderClientOptions } from './client.ts';
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
