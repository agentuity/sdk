export {
	AgentuityContext,
	AgentuityProvider,
	useAgentuity,
	useAuth,
	type ContextProviderArgs,
	type AgentuityContextValue,
	type AgentuityHookValue,
	type AuthContextValue,
} from './context';
export {
	useWebRTCCall,
	type UseWebRTCCallOptions,
	type UseWebRTCCallResult,
	type WebRTCConnectionState,
	type WebRTCClientCallbacks,
} from './webrtc';
export { useJsonMemo } from './memo';

// Analytics
export {
	useAnalytics,
	useTrackOnMount,
	withPageTracking,
	type UseAnalyticsResult,
	type TrackOnMountOptions,
} from './analytics.js';

// Re-export web utilities from @agentuity/frontend
export {
	buildUrl,
	defaultBaseUrl,
	deserializeData,
	createReconnectManager,
	jsonEqual,
	getProcessEnv,
	WebSocketManager,
	EventStreamManager,
	type ReconnectOptions,
	type ReconnectManager,
	type WebSocketMessageHandler,
	type WebSocketCallbacks,
	type WebSocketManagerOptions,
	type WebSocketManagerState,
	type EventStreamMessageHandler,
	type EventStreamCallbacks,
	type EventStreamManagerOptions,
	type EventStreamManagerState,
	WebRTCManager,
	UserMediaSource,
	DisplayMediaSource,
	CustomStreamSource,
	type WebRTCManagerOptions,
	type WebRTCManagerState,
	type WebRTCDisconnectReason,
} from '@agentuity/frontend';
